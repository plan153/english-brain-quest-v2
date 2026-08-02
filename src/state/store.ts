/**
 * store.ts — Zustand 전역 상태 (Phase 2 — 세션 엔진/보상 통합).
 *
 * Phase 1: 진행 상태(XP, 연속일, 세션 카운트) 최소 구현
 * Phase 2: session-engine + difficulty-mixer + reward-engine 통합
 *   - SessionPlan (50문장 큐, 10/80/10 난이도 분배)
 *   - SessionProgress (진행/콤보/XP/완료)
 *   - RewardEngine (trial 보상, 레벨업, 배지)
 *   - SkillProfile (6축 스킬)
 */
import { create } from 'zustand';
import { readLocal, writeLocal } from '../adapters/storage';
import type { ContentItem } from '../interfaces/ContentItem';
import {
  INITIAL_PROGRESS,
  createSession,
  advance,
  replaceLastTrial,
  isSessionComplete,
  summarizeSession,
} from '../domain/session-engine';
import type {
  SessionPlan,
  SessionProgress,
  SessionSentence,
  TrialResult,
  SessionSummary,
} from '../domain/session-engine';
import {
  DEFAULT_SKILL_PROFILE,
  mixDifficulty,
  updateSkill,
} from '../domain/difficulty-mixer';
import type {
  SkillProfile,
  MixedItem,
} from '../domain/difficulty-mixer';
import {
  computeTrialReward,
  computeSessionCompletionRewards,
  levelFromXp,
  BADGES,
} from '../domain/reward-engine';
import type {
  TrialReward,
  Badge,
  SessionCompletionRewards,
} from '../domain/reward-engine';
import type { SessionEvaluateResult } from '../interfaces/SessionMode';
import {
  syncToVault,
  makeGapId,
  importVaultGaps,
  restoreSyncSession,
  getSyncStatus,
  type GapNote,
} from '../adapters/cloud-sync';
import type { ImportedGap } from '../domain/vault-gap-import';
import { type GapSlotRole, buildGapReport, isAutoGapReportText, learnerFacingClue } from '../domain/gap-reason';
import {
  countPatternTraining,
  pickPatternTrainingQueue,
  patternItemToContentItem,
  summarizePatternGaps,
  type PatternGapRow,
} from '../domain/pattern-queue';
import {
  applyReview,
  createMemory,
  markOwned,
  unmarkOwned,
  pickReviewQueue,
  pickWeakTrainingQueue,
  countDue,
  countOwned,
  countWeakTraining,
  memoryToContentItem,
  summarizeWeakLinks,
  type SentenceMemory,
  type ReviewIntensity,
  type WeakLinkSummary,
} from '../domain/srs-engine';
import {
  filterItemsForPracticeBand,
  mixRatiosForBand,
  type LearnerLevel,
  type PracticeBandSource,
} from '../domain/learner-level';
import {
  applyManualNudge,
  decideComfortAdapt,
  type AdaptDecision,
} from '../domain/comfort-adapt';

export type { SentenceMemory, ReviewIntensity, WeakLinkSummary };
export type { LearnerLevel, PracticeBandSource, AdaptDecision };
export type TabId = 'today' | 'brain' | 'dictionary';
export type TrainingPackId = 'review' | 'weak' | 'pattern';
export type { GapSlotRole };

/** 오늘 세션에서 만난 문장 (복습용) */
export interface TodayEncounter {
  id: string;
  sentenceId: string;
  en: string;
  ko: string;
  match: 'exact' | 'fuzzy' | 'wrong' | 'skipped';
  guess?: string;
  at: string;
}

export interface ProgressState {
  xp: number;
  streakDays: number;
  lastStudyDate: string | null;
  todaySentenceCount: number;
  correctCount: number;
  attemptCount: number;
  level: number;
  totalSentences: number; // 누적 학습 문장 수 (100배지용)
  /** 연습 난이도 밴드 (RPG level과 별개). null이면 진단 필요 */
  practiceBand: LearnerLevel | null;
  practiceBandSource: PracticeBandSource | null;
  practiceBandSetAt: string | null;
  /** 적당 구간 유지 연속 세션 */
  comfortStreak: number;
  /** 난이도 상승(정복) 횟수 */
  bandConquestCount: number;
}

export interface SessionState {
  isPlaying: boolean;
  plan: SessionPlan | null;
  progress: SessionProgress;
  currentSentence: SessionSentence | null;
  currentTier: MixedItem['tier'] | null;
  lastTrial: TrialResult | null;
  lastReward: TrialReward | null;
  summary: SessionSummary | null;
  completionRewards: SessionCompletionRewards | null;
  /** 직전 세션 난이도 적응 결과 */
  lastComfortAdapt: import('../domain/comfort-adapt').AdaptDecision | null;
}

export interface RewardState {
  badges: Badge[];
  earnedBadgeIds: Set<string>;
  skill: SkillProfile;
  /** 세션 중 쌓인 Gap 노트 — endSession 시 Vault 동기화 */
  pendingGaps: GapNote[];
  /** 확인·수정 가능한 간극 보관 (localStorage) */
  gapNotes: GapNote[];
}

export interface SettingsState {
  lang: 'en' | 'ko';
  ttsEnabled: boolean;
  theme: 'dark' | 'light';
}

interface AppStore
  extends ProgressState,
    SessionState,
    RewardState,
    SettingsState {
  resolveGapReason: (
    gapId: string,
    resolution: { type: 'confirmed' } | { type: 'edited'; reason: string }
  ) => void;
  /** 오답 후 학습자 단서 저장 — 이때만 GapNote 생성(노이즈 방지) */
  saveGapClue: (args: {
    sentence: SessionSentence;
    clue: string;
    guess: string;
    match: 'wrong' | 'skipped';
    cueMode?: import('../domain/srs-engine').CueMode;
    inputMode?: 'speak' | 'type';
  }) => GapNote;
  markGapReviewed: (gapId: string) => void;
  getGapForSentence: (sentenceId: string) => GapNote | undefined;
  /** 문장에 붙일 학습자 단서 힌트 */
  getLearnerClueHint: (sentenceId: string) => string | null;
  // navigation
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  /** TopBar 홈 — Today로 이동, 완주 화면이면 시작 화면으로 */
  goHome: () => void;
  /** 세션 완주 → Brain 오늘 문장으로 스크롤 */
  brainFocusTodayLog: boolean;
  openTodayLog: () => void;
  clearBrainFocus: () => void;

  /** 오늘 만난 문장 (당일 localStorage) */
  todayLog: TodayEncounter[];

  /** SRS 문장 메모리 + 복습 빈도 */
  memories: Record<string, SentenceMemory>;
  reviewIntensity: ReviewIntensity;
  setReviewIntensity: (intensity: ReviewIntensity) => void;
  markSentenceOwned: (sentenceId: string, owned?: boolean) => void;
  getDueReviewItems: (limit?: number) => ContentItem[];
  dueReviewCount: () => number;
  ownedCount: () => number;
  getWeakTrainingItems: (limit?: number) => ContentItem[];
  weakTrainingCount: () => number;
  getWeakLinkSummary: () => WeakLinkSummary;
  /** Gap slots 기반 패턴 약점 */
  selectedPatternRole: GapSlotRole | null;
  setSelectedPatternRole: (role: GapSlotRole | null) => void;
  getPatternTrainingItems: (limit?: number, role?: GapSlotRole | null) => ContentItem[];
  patternTrainingCount: (role?: GapSlotRole | null) => number;
  getPatternSummary: () => PatternGapRow[];
  /** Brain/Today — 약점 강화 세션 자동 시작 요청 */
  pendingStartPack: TrainingPackId | null;
  requestStartPack: (pack: TrainingPackId, options?: { role?: GapSlotRole | null }) => void;
  consumePendingStartPack: () => TrainingPackId | null;
  /** 볼트 Gaps.md → memories에 흡수 (복습 기한 즉시) */
  absorbVaultGaps: () => Promise<{ imported: number; message: string }>;

  // progress
  addXp: (amount: number) => void;
  markStudyToday: () => void;
  recordAnswer: (correct: boolean) => void;
  resetProgress: () => void;
  setPracticeBand: (band: LearnerLevel, source: PracticeBandSource) => void;
  clearPracticeBand: () => void;
  /** 세션 종료 후 hold 상태에서 수동으로 올리기/내리기 */
  respondComfortAdapt: (direction: 'raise' | 'lower' | 'keep') => void;

  // session (Phase 2)
  startSessionFromItems: (
    items: ContentItem[],
    options?: { mode?: 'translate' | 'listen-speak'; size?: number }
  ) => void;
  recordTrial: (
    sentence: SessionSentence,
    evaluation: SessionEvaluateResult,
    response: {
      text?: string;
      skipped?: boolean;
      cueMode?: import('../domain/srs-engine').CueMode;
      inputMode?: 'speak' | 'type';
    }
  ) => TrialReward;
  nextSentence: () => void;
  endSession: () => SessionSummary | null;
  resetSession: () => void;
  /** Phase 4: 현재 상태를 Obsidian Vault / IndexedDB에 동기화 (자동 import 먼저) */
  syncNow: () => Promise<void>;
  /** 앱 시작 시 1회 — 연결 복원 + 조용한 import/sync (연결 안 돼 있으면 아무 것도 안 함) */
  bootstrapSync: () => Promise<void>;

  // settings
  toggleTheme: () => void;
  setLang: (lang: 'en' | 'ko') => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadProgress(): Partial<ProgressState> {
  return readLocal<Partial<ProgressState>>('progress') ?? {};
}

const DEFAULT_PROGRESS: ProgressState = {
  xp: 0,
  streakDays: 0,
  lastStudyDate: null,
  todaySentenceCount: 0,
  correctCount: 0,
  attemptCount: 0,
  level: 1,
  totalSentences: 0,
  practiceBand: null,
  practiceBandSource: null,
  practiceBandSetAt: null,
  comfortStreak: 0,
  bandConquestCount: 0,
};

function normalizePracticeBand(v: unknown): LearnerLevel | null {
  return v === 'L1' || v === 'L2' || v === 'L3' || v === 'L4' ? v : null;
}

const DEFAULT_REWARD_STATE: RewardState = {
  badges: [],
  earnedBadgeIds: new Set<string>(),
  skill: { ...DEFAULT_SKILL_PROFILE },
  pendingGaps: [],
  gapNotes: [],
};

function loadGapNotes(): GapNote[] {
  const raw = readLocal<GapNote[]>('gapNotes') ?? [];
  return sanitizeGapNotes(raw);
}

/** 자동 리포트가 단서 자리를 차지한 레거시 Gap 정리 */
function sanitizeGapNotes(notes: GapNote[]): GapNote[] {
  let changed = false;
  const next = notes.map((g) => {
    const clue = learnerFacingClue(g);
    const hadFake =
      isAutoGapReportText(g.learnerClue || '') ||
      isAutoGapReportText(g.reasonFinal || '') ||
      (!!g.reasonAuto &&
        ((g.learnerClue || '').trim() === g.reasonAuto.trim() ||
          (g.reasonFinal || '').trim() === g.reasonAuto.trim()));
    if (!hadFake && clue === (g.learnerClue || g.reasonFinal || '').trim()) {
      return g;
    }
    changed = true;
    const auto =
      g.reasonAuto ||
      (isAutoGapReportText(g.learnerClue || '')
        ? g.learnerClue
        : isAutoGapReportText(g.reasonFinal || '')
          ? g.reasonFinal
          : undefined);
    return {
      ...g,
      learnerClue: clue || undefined,
      reasonFinal: clue || undefined,
      reasonAuto: auto,
      reasonStatus: (clue
        ? g.reasonStatus === 'reviewed'
          ? 'reviewed'
          : g.reasonStatus === 'clued' ||
              g.reasonStatus === 'edited' ||
              g.reasonStatus === 'confirmed'
            ? 'clued'
            : g.reasonStatus
        : g.reasonStatus === 'reviewed'
          ? 'reviewed'
          : 'draft') as GapNote['reasonStatus'],
    };
  });
  if (changed) persistGapNotes(next as GapNote[]);
  return next as GapNote[];
}

function persistGapNotes(notes: GapNote[]) {
  writeLocal('gapNotes', notes.slice(-200));
}

type SyncSnapshot = {
  xp: number;
  level: number;
  streakDays: number;
  todaySentenceCount: number;
  correctCount: number;
  attemptCount: number;
  totalSentences: number;
  skill: SkillProfile;
  badges: Badge[];
  memories: Record<string, SentenceMemory>;
};

/** 단서/메움 직후 볼트에 Gap 반영 (미연결이면 조용히 스킵) */
function syncGapsSoon(get: () => SyncSnapshot, gaps: GapNote[]) {
  if (gaps.length === 0) return;
  void (async () => {
    try {
      const s = get();
      await syncToVault({
        progress: {
          xp: s.xp,
          level: s.level,
          streakDays: s.streakDays,
          todaySentenceCount: s.todaySentenceCount,
          correctCount: s.correctCount,
          attemptCount: s.attemptCount,
          totalSentences: s.totalSentences,
        },
        skill: s.skill,
        badges: s.badges,
        gaps,
        memories: s.memories,
      });
    } catch {
      /* 미연결이면 스킵 */
    }
  })();
}

/**
 * 볼트에서 읽은 ImportedGap[]을 memories/gapNotes에 흡수 — 순수 함수.
 * absorbVaultGaps(수동 버튼)와 syncNow(자동 import)가 공유해서 쓴다.
 * 단서(learnerClue, 한 줄)와 옵시디언 메움(vaultFill, 긴 성찰)을 분리 저장한다 —
 * 메움 전체를 힌트로 쓰면 힌트가 너무 길어지므로.
 */
export function mergeImportedGaps(
  gaps: ImportedGap[],
  memories: Record<string, SentenceMemory>,
  gapNotes: GapNote[],
  now: Date
): {
  memories: Record<string, SentenceMemory>;
  gapNotes: GapNote[];
  imported: number;
  reviewed: number;
  clues: number;
} {
  const nowIso = now.toISOString();
  const nextMemories = { ...memories };
  let nextGapNotes = [...gapNotes];
  let imported = 0;
  let reviewed = 0;
  let clues = 0;

  for (const gap of gaps) {
    let mem =
      nextMemories[gap.expressionId] ?? createMemory(gap.expressionId, gap.en, gap.ko, now);
    const isReviewed = gap.reasonStatus === 'reviewed' || Boolean(gap.vaultFill?.trim());
    mem = {
      ...mem,
      en: mem.en || gap.en,
      ko: mem.ko || gap.ko,
      wrong: Math.max(mem.wrong, 1),
      attempts: Math.max(mem.attempts, 1),
      nextReviewAt: isReviewed
        ? mem.nextReviewAt
        : new Date(now.getTime() - 60_000).toISOString(),
      updatedAt: nowIso,
      lastMatch: mem.lastMatch ?? 'wrong',
    };
    nextMemories[gap.expressionId] = mem;

    const shortClue =
      learnerFacingClue({ learnerClue: gap.learnerClue, reasonFinal: gap.learnerClue }) ||
      undefined;
    const fill = (gap.vaultFill || '').trim() || undefined;
    if (shortClue || fill) clues += 1;
    if (isReviewed) reviewed += 1;

    const existing = nextGapNotes.find((g) => g.expressionId === gap.expressionId);
    const status: GapNote['reasonStatus'] = isReviewed
      ? 'reviewed'
      : shortClue
        ? 'clued'
        : (existing?.reasonStatus ?? 'clued');
    const note: GapNote = {
      id: existing?.id ?? gap.id ?? makeGapId(gap.expressionId, gap.guess),
      expressionId: gap.expressionId,
      en: gap.en || existing?.en || '',
      ko: gap.ko || existing?.ko || '',
      guess: gap.guess || existing?.guess || '',
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
      match: gap.match ?? existing?.match ?? 'wrong',
      packId: gap.packId ?? existing?.packId,
      learnerClue: shortClue || existing?.learnerClue,
      reasonFinal: shortClue || existing?.reasonFinal,
      reasonAuto: existing?.reasonAuto,
      vaultFill: fill || existing?.vaultFill,
      reasonStatus: status,
      slots: gap.slots?.length ? gap.slots : existing?.slots,
      primarySlot: gap.primarySlot ?? existing?.primarySlot,
      cueMode: existing?.cueMode,
      inputMode: existing?.inputMode,
    };
    nextGapNotes = [...nextGapNotes.filter((g) => g.expressionId !== gap.expressionId), note];
    imported += 1;
  }

  nextGapNotes = nextGapNotes.slice(-200);
  return { memories: nextMemories, gapNotes: nextGapNotes, imported, reviewed, clues };
}

function loadReward(): Partial<RewardState> {
  const saved = readLocal<{ badges: Badge[]; skill: SkillProfile }>('reward');
  if (!saved) return {};
  return {
    badges: saved.badges ?? [],
    earnedBadgeIds: new Set((saved.badges ?? []).map((b) => b.id)),
    skill: saved.skill ?? { ...DEFAULT_SKILL_PROFILE },
  };
}

const TODAY_LOG_MAX = 200;

function loadTodayLog(): TodayEncounter[] {
  const saved = readLocal<{ date: string; items: TodayEncounter[] }>('todayLog');
  if (!saved || saved.date !== todayStr()) return [];
  return saved.items ?? [];
}

function persistTodayLog(items: TodayEncounter[]) {
  writeLocal('todayLog', { date: todayStr(), items });
}

function loadMemories(): Record<string, SentenceMemory> {
  return readLocal<Record<string, SentenceMemory>>('memories') ?? {};
}

function persistMemories(memories: Record<string, SentenceMemory>) {
  writeLocal('memories', memories);
}

function loadReviewIntensity(): ReviewIntensity {
  const v = readLocal<ReviewIntensity>('reviewIntensity');
  if (v === 'intense' || v === 'normal' || v === 'relaxed') return v;
  return 'normal';
}

function loadTheme(): 'dark' | 'light' {
  const v = readLocal<'dark' | 'light'>('theme');
  return v === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: 'dark' | 'light') {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

function persistTheme(theme: 'dark' | 'light') {
  writeLocal('theme', theme);
}

export const useStore = create<AppStore>((set, get) => {
  const savedProgress = loadProgress();
  const initialProgress: ProgressState = {
    ...DEFAULT_PROGRESS,
    ...savedProgress,
    practiceBand: normalizePracticeBand(savedProgress.practiceBand),
    practiceBandSource:
      savedProgress.practiceBandSource === 'placement' ||
      savedProgress.practiceBandSource === 'manual' ||
      savedProgress.practiceBandSource === 'auto'
        ? savedProgress.practiceBandSource
        : null,
    practiceBandSetAt: savedProgress.practiceBandSetAt ?? null,
    comfortStreak:
      typeof savedProgress.comfortStreak === 'number' ? savedProgress.comfortStreak : 0,
    bandConquestCount:
      typeof savedProgress.bandConquestCount === 'number'
        ? savedProgress.bandConquestCount
        : 0,
  };
  if (initialProgress.lastStudyDate !== todayStr()) {
    initialProgress.todaySentenceCount = 0;
  }
  const rewardInit = {
    ...DEFAULT_REWARD_STATE,
    ...loadReward(),
    gapNotes: loadGapNotes(),
  };
  initialProgress.level = levelFromXp(initialProgress.xp).level;

  return {
    ...initialProgress,
    ...rewardInit,
    // session defaults
    isPlaying: false,
    plan: null,
    progress: { ...INITIAL_PROGRESS },
    currentSentence: null,
    currentTier: null,
    lastTrial: null,
    lastReward: null,
    summary: null,
    completionRewards: null,
    lastComfortAdapt: null,

    // settings
    lang: 'en',
    ttsEnabled: true,
    theme: loadTheme(),
    activeTab: 'today' as TabId,
    brainFocusTodayLog: false,
    todayLog: loadTodayLog(),
    memories: loadMemories(),
    reviewIntensity: loadReviewIntensity(),
    pendingStartPack: null as TrainingPackId | null,
    selectedPatternRole: null as GapSlotRole | null,

    setActiveTab: (tab) => set({ activeTab: tab }),

    goHome: () => {
      const { summary, isPlaying } = get();
      // 완주 화면에서 홈 → 팩 선택으로. 진행 중 세션은 유지.
      if (summary && !isPlaying) {
        get().resetSession();
      }
      set({ activeTab: 'today', brainFocusTodayLog: false });
    },

    openTodayLog: () => set({ activeTab: 'brain', brainFocusTodayLog: true }),

    clearBrainFocus: () => set({ brainFocusTodayLog: false }),

    setReviewIntensity: (intensity) => {
      writeLocal('reviewIntensity', intensity);
      set({ reviewIntensity: intensity });
    },

    markSentenceOwned: (sentenceId, owned = true) => {
      const memories = { ...get().memories };
      const existing = memories[sentenceId];
      if (!existing) return;
      memories[sentenceId] = owned ? markOwned(existing) : unmarkOwned(existing);
      persistMemories(memories);
      set({ memories });
    },

    getDueReviewItems: (limit = 10) => {
      const queue = pickReviewQueue(Object.values(get().memories), limit);
      return queue.map(memoryToContentItem);
    },

    dueReviewCount: () => countDue(Object.values(get().memories)),

    ownedCount: () => countOwned(Object.values(get().memories)),

    getGapForSentence: (sentenceId) => {
      const notes = get().gapNotes;
      for (let i = notes.length - 1; i >= 0; i--) {
        if (notes[i].expressionId === sentenceId) return notes[i];
      }
      return undefined;
    },

    resolveGapReason: (gapId, resolution) => {
      const nowIso = new Date().toISOString();
      const gapNotes = get().gapNotes.map((g) => {
        if (g.id !== gapId) return g;
        if (resolution.type === 'confirmed') {
          // 자동 리포트를 단서로 승격하지 않음
          const clue = learnerFacingClue(g);
          if (!clue) {
            return {
              ...g,
              learnerClue: undefined,
              reasonFinal: undefined,
              reasonStatus: 'draft' as const,
              updatedAt: nowIso,
            };
          }
          return {
            ...g,
            learnerClue: clue,
            reasonStatus: 'clued' as const,
            reasonFinal: clue,
            updatedAt: nowIso,
          };
        }
        const clue = resolution.reason.trim();
        if (!clue || isAutoGapReportText(clue)) {
          return g;
        }
        return {
          ...g,
          learnerClue: clue,
          reasonStatus: 'clued' as const,
          reasonFinal: clue,
          updatedAt: nowIso,
        };
      });
      persistGapNotes(gapNotes);
      const pendingGaps = get().pendingGaps.map((g) => {
        const updated = gapNotes.find((n) => n.id === g.id);
        return updated ?? g;
      });
      set({ gapNotes, pendingGaps });
    },

    saveGapClue: ({ sentence, clue, guess, match, cueMode, inputMode }) => {
      const text = clue.trim();
      if (!text) throw new Error('단서가 비어 있습니다.');
      if (isAutoGapReportText(text)) {
        throw new Error('자동 분석 문구는 단서로 저장할 수 없습니다. 스스로 한 줄로 적어 주세요.');
      }
      const nowIso = new Date().toISOString();
      const existing = get().getGapForSentence(sentence.id);
      // 출제·패턴용 슬롯만 계산 (자동 해설 문장은 저장·표시하지 않음)
      const report = buildGapReport({
        en: sentence.en,
        ko: sentence.ko,
        guess: guess || existing?.guess || '',
        match,
        cueMode: cueMode ?? existing?.cueMode,
      });
      const gap: GapNote = {
        id: existing?.id ?? makeGapId(sentence.id, guess || text),
        expressionId: sentence.id,
        en: sentence.en,
        ko: sentence.ko,
        guess: guess || existing?.guess || '',
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
        match,
        cueMode: cueMode ?? existing?.cueMode,
        inputMode: inputMode ?? existing?.inputMode,
        packId: sentence.packId ?? existing?.packId,
        learnerClue: text,
        reasonFinal: text,
        reasonAuto: undefined,
        reasonStatus: 'clued',
        slots: report.slots.length
          ? report.slots
          : existing?.slots,
        primarySlot: report.primary?.role ?? existing?.primarySlot,
      };
      const gapNotes = [
        ...get().gapNotes.filter((g) => g.expressionId !== sentence.id),
        gap,
      ].slice(-200);
      const pendingGaps = [
        ...get().pendingGaps.filter((g) => g.expressionId !== sentence.id),
        gap,
      ];
      persistGapNotes(gapNotes);
      set({ gapNotes, pendingGaps });
      syncGapsSoon(get, [gap]);
      return gap;
    },

    markGapReviewed: (gapId) => {
      const nowIso = new Date().toISOString();
      const gapNotes = get().gapNotes.map((g) =>
        g.id === gapId
          ? { ...g, reasonStatus: 'reviewed' as const, updatedAt: nowIso }
          : g
      );
      persistGapNotes(gapNotes);
      const pendingGaps = get().pendingGaps.map((g) => {
        const updated = gapNotes.find((n) => n.id === g.id);
        return updated ?? g;
      });
      set({ gapNotes, pendingGaps });
      const g = gapNotes.find((n) => n.id === gapId);
      if (g) syncGapsSoon(get, [g]);
    },

    getLearnerClueHint: (sentenceId) => {
      const g = get().getGapForSentence(sentenceId);
      if (!g) return null;
      const clue = learnerFacingClue(g);
      if (!clue) return null;
      const st = g.reasonStatus;
      if (st === 'draft' || st === 'pending') return null;
      return clue;
    },

    setSelectedPatternRole: (role) => set({ selectedPatternRole: role }),

    getPatternSummary: () => summarizePatternGaps(get().gapNotes),

    patternTrainingCount: (role) =>
      countPatternTraining(get().gapNotes, role ?? get().selectedPatternRole),

    getPatternTrainingItems: (limit = 10, role) => {
      const r = role !== undefined ? role : get().selectedPatternRole;
      return pickPatternTrainingQueue(get().gapNotes, get().memories, {
        role: r,
        limit,
      }).map(patternItemToContentItem);
    },

    getWeakTrainingItems: (limit = 10) => {
      const queue = pickWeakTrainingQueue(Object.values(get().memories), limit);
      return queue.map(memoryToContentItem);
    },

    weakTrainingCount: () => countWeakTraining(Object.values(get().memories)),

    getWeakLinkSummary: () => summarizeWeakLinks(Object.values(get().memories)),

    requestStartPack: (pack, options) => {
      const next: Partial<{
        pendingStartPack: TrainingPackId;
        selectedPatternRole: GapSlotRole | null;
        activeTab: TabId;
        brainFocusTodayLog: boolean;
      }> = {
        pendingStartPack: pack,
        activeTab: 'today',
        brainFocusTodayLog: false,
      };
      if (pack === 'pattern' && options && 'role' in options) {
        next.selectedPatternRole = options.role ?? null;
      }
      set(next);
    },

    consumePendingStartPack: () => {
      const pack = get().pendingStartPack;
      if (pack) set({ pendingStartPack: null });
      return pack;
    },

    absorbVaultGaps: async () => {
      const gaps = await importVaultGaps();
      if (gaps.length === 0) {
        return {
          imported: 0,
          message:
            '볼트 Gaps가 없어요. Mac이면 Vault 폴더 연결 후 다시, 아이폰이면 먼저 동기화·보내기로 Gaps를 쌓아 주세요.',
        };
      }
      const { memories, gapNotes, imported, reviewed, clues } = mergeImportedGaps(
        gaps,
        get().memories,
        get().gapNotes,
        new Date()
      );
      persistGapNotes(gapNotes);
      persistMemories(memories);
      set({ memories, gapNotes });
      return {
        imported,
        message: `볼트 Gap ${imported}개 흡수 · 단서/메움 ${clues} · reviewed ${reviewed}. 힌트·패턴 약점에 반영했어요.`,
      };
    },

    addXp: (amount) => {
      const xp = get().xp + amount;
      const level = levelFromXp(xp).level;
      const next = { xp, level };
      writeLocal('progress', { ...loadProgress(), ...next });
      set(next);
    },

    markStudyToday: () => {
      const today = todayStr();
      const { lastStudyDate, streakDays, todayLog } = get();
      if (lastStudyDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const newStreak = lastStudyDate === yesterday ? streakDays + 1 : 1;
        const next = { streakDays: newStreak, lastStudyDate: today };
        writeLocal('progress', { ...loadProgress(), ...next });
        // 날짜가 바뀌면 어제 로그 비움 (자정 넘김 대응)
        if (todayLog.length > 0) {
          persistTodayLog([]);
          set({ ...next, todayLog: [] });
        } else {
          set(next);
        }
      }
    },

    recordAnswer: (correct) => {
      const attemptCount = get().attemptCount + 1;
      const correctCount = correct ? get().correctCount + 1 : get().correctCount;
      const todaySentenceCount = get().todaySentenceCount + 1;
      const totalSentences = get().totalSentences + 1;
      const next = { attemptCount, correctCount, todaySentenceCount, totalSentences };
      writeLocal('progress', { ...loadProgress(), ...next });
      set(next);
    },

    resetProgress: () => {
      writeLocal('progress', null);
      writeLocal('reward', null);
      writeLocal('todayLog', null);
      writeLocal('memories', null);
      writeLocal('reviewIntensity', null);
      set({
        ...DEFAULT_PROGRESS,
        ...DEFAULT_REWARD_STATE,
        progress: { ...INITIAL_PROGRESS },
        todayLog: [],
        memories: {},
        reviewIntensity: 'normal',
      });
    },

    setPracticeBand: (band, source) => {
      const next = {
        practiceBand: band,
        practiceBandSource: source,
        practiceBandSetAt: new Date().toISOString(),
      };
      writeLocal('progress', { ...loadProgress(), ...next });
      set(next);
    },

    clearPracticeBand: () => {
      const next = {
        practiceBand: null as LearnerLevel | null,
        practiceBandSource: null as PracticeBandSource | null,
        practiceBandSetAt: null as string | null,
      };
      writeLocal('progress', { ...loadProgress(), ...next });
      set(next);
    },

    respondComfortAdapt: (direction) => {
      const prev = get().lastComfortAdapt;
      if (!prev) return;
      if (direction === 'keep') {
        set({ lastComfortAdapt: { ...prev, offerRaise: false, offerLower: false } });
        return;
      }
      const nextDecision = applyManualNudge(prev, direction);
      const earnedBadgeIds = new Set(get().earnedBadgeIds);
      let badges = [...get().badges];
      let comfortStreak = get().comfortStreak;
      let bandConquestCount = get().bandConquestCount;
      let xp = get().xp;

      if (nextDecision.signal === 'raise') {
        comfortStreak = 0;
        bandConquestCount += 1;
        if (!earnedBadgeIds.has('band_conquer') && BADGES.band_conquer) {
          earnedBadgeIds.add('band_conquer');
          badges = [
            ...badges,
            { ...BADGES.band_conquer, earnedAt: new Date().toISOString() },
          ];
        }
      } else if (nextDecision.signal === 'lower') {
        comfortStreak = 0;
      }

      xp += nextDecision.bonusXp;
      const level = levelFromXp(xp).level;
      const bandPatch = {
        practiceBand: nextDecision.to,
        practiceBandSource: 'manual' as const,
        practiceBandSetAt: new Date().toISOString(),
        comfortStreak,
        bandConquestCount,
        xp,
        level,
      };
      writeLocal('progress', { ...loadProgress(), ...bandPatch });
      writeLocal('reward', { badges, skill: get().skill });
      set({
        ...bandPatch,
        badges,
        earnedBadgeIds,
        lastComfortAdapt: nextDecision,
        completionRewards: get().completionRewards
          ? {
              ...get().completionRewards!,
              totalXp: get().completionRewards!.totalXp + nextDecision.bonusXp,
              badges: [
                ...get().completionRewards!.badges,
                ...badges.filter(
                  (b) =>
                    b.id === 'band_conquer' &&
                    !get().completionRewards!.badges.some((x) => x.id === b.id)
                ),
              ],
            }
          : get().completionRewards,
      });
    },

    startSessionFromItems: (items, options = {}) => {
      if (items.length === 0) return;
      const size = options.size ?? 10; // Phase 2 데모는 10문장 (50은 너무 김)
      const practiceBand = get().practiceBand;
      const packId = items.find((it) => it.packId)?.packId;
      const sequentialDayPack =
        packId === 'quiz-verbs' || packId === 'conversation-100';

      // Day 커리큘럼 팩은 난이도 믹스·셔플 없이 day 순으로
      if (sequentialDayPack) {
        const dayOf = (it: ContentItem): number => {
          const tag = it.tags?.find((t) => t.startsWith('day:'));
          if (!tag) return 0;
          const n = Number(tag.slice(4));
          return Number.isFinite(n) ? n : 0;
        };
        const ordered = [...items].sort(
          (a, b) => dayOf(a) - dayOf(b) || a.id.localeCompare(b.id)
        );
        const orderedItems = ordered.slice(0, size);
        const plan = createSession(orderedItems, {
          mode: options.mode ?? 'translate',
          size,
        });
        plan.sentences = plan.sentences.map((s) => ({
          ...s,
          difficulty: 'normal' as const,
        }));
        const first = plan.sentences[0] ?? null;
        get().markStudyToday();
        set({
          isPlaying: true,
          plan,
          progress: { ...INITIAL_PROGRESS },
          currentSentence: first,
          currentTier: 'normal',
          lastTrial: null,
          lastReward: null,
          summary: null,
          completionRewards: null,
        });
        return;
      }

      const pool = filterItemsForPracticeBand(items, practiceBand, { packId });
      const ratios = practiceBand
        ? mixRatiosForBand(practiceBand)
        : { challengeRatio: 0.2, easyRatio: 0.08 };
      // 적당 구간 연속이면 도전 비율을 더 올려 정복감 유지
      const streak = get().comfortStreak;
      let challengeRatio = ratios.challengeRatio;
      let easyRatio = ratios.easyRatio;
      if (streak >= 3) {
        challengeRatio = Math.min(0.35, challengeRatio + 0.06);
        easyRatio = Math.max(0.02, easyRatio - 0.03);
      }
      if (streak >= 5) {
        challengeRatio = Math.min(0.4, challengeRatio + 0.05);
      }
      const mixed: MixedItem[] = mixDifficulty(pool, {
        challengeRatio,
        easyRatio,
        skill: get().skill,
        shuffle: true,
      });
      const orderedItems = mixed.slice(0, size).map((m) => m.item);
      const plan = createSession(orderedItems, {
        mode: options.mode ?? 'translate',
        size,
      });
      // tier 정보를 sentence에 부여
      const tierMap = new Map<string, MixedItem['tier']>();
      mixed.slice(0, size).forEach((m) => tierMap.set(m.item.id, m.tier));
      plan.sentences = plan.sentences.map((s) => ({
        ...s,
        difficulty: tierMap.get(s.id) ?? 'normal',
      }));

      const first = plan.sentences[0] ?? null;
      get().markStudyToday();
      set({
        isPlaying: true,
        plan,
        progress: { ...INITIAL_PROGRESS },
        currentSentence: first,
        currentTier: first?.difficulty ?? null,
        lastTrial: null,
        lastReward: null,
        summary: null,
        completionRewards: null,
      });
    },

    recordTrial: (sentence, evaluation, response) => {
      const { progress, xp, earnedBadgeIds, skill, lastTrial } = get();
      const tier = sentence.difficulty ?? 'normal';
      const isCorrect = evaluation.match === 'exact' || evaluation.match === 'fuzzy';
      const isRetry = !!lastTrial && lastTrial.sentence.id === sentence.id;
      const cueMode = response.cueMode ?? 'blind';

      // 재시도 시 콤보는 교체 전 progress 기준으로 다시 계산
      const comboForReward = isRetry
        ? Math.max(
            0,
            progress.combo -
              (lastTrial.evaluation.match === 'exact' || lastTrial.evaluation.match === 'fuzzy'
                ? 1
                : 0)
          ) + (isCorrect ? 1 : 0)
        : progress.combo + (isCorrect ? 1 : 0);

      const reward = computeTrialReward(
        evaluation,
        {
          tier,
          combo: comboForReward,
          isFirstCorrect: !isRetry && progress.correct === 0,
          cueMode,
        },
        xp,
        earnedBadgeIds
      );

      const trial: TrialResult = {
        sentence,
        response,
        evaluation,
        xpDelta: reward.totalXp,
        comboDelta: isCorrect ? 1 : -(isRetry ? comboForReward : progress.combo),
      };

      let newProgress: SessionProgress;
      let xpDeltaApplied = reward.totalXp;
      if (isRetry && lastTrial) {
        newProgress = replaceLastTrial(progress, lastTrial, trial);
        xpDeltaApplied = reward.totalXp - lastTrial.xpDelta;
        const total = get().plan?.total ?? 0;
        if (isSessionComplete(newProgress, total)) {
          newProgress.finished = true;
        }
      } else {
        newProgress = advance(progress, trial);
        const total = get().plan?.total ?? 0;
        if (isSessionComplete(newProgress, total)) {
          newProgress.finished = true;
        }
      }

      const newXp = Math.max(0, xp + xpDeltaApplied);
      const newLevel = levelFromXp(newXp).level;
      writeLocal('progress', {
        ...loadProgress(),
        xp: newXp,
        level: newLevel,
      });

      const newSkill = isCorrect
        ? updateSkill(skill, 'form', true, 2)
        : updateSkill(skill, 'form', false, 2);

      const newBadges = isRetry
        ? get().badges
        : [...get().badges, ...reward.newBadges];
      writeLocal('reward', { badges: newBadges, skill: newSkill });

      // 재시도는 문장 수 카운트 중복 없이 정답 여부만 보정
      if (isRetry && lastTrial) {
        const wasCorrect =
          lastTrial.evaluation.match === 'exact' || lastTrial.evaluation.match === 'fuzzy';
        if (wasCorrect !== isCorrect) {
          const correctCount = Math.max(
            0,
            get().correctCount + (isCorrect ? 1 : -1)
          );
          writeLocal('progress', { ...loadProgress(), correctCount });
          set({ correctCount });
        }
      } else {
        get().recordAnswer(isCorrect);
      }

      let pendingGaps = get().pendingGaps;
      let gapNotes = get().gapNotes;
      if (isRetry) {
        // 재시도 시 미저장 draft만 치움 — 이미 단서 있는 Gap은 유지
        pendingGaps = pendingGaps.filter(
          (g) =>
            g.expressionId !== sentence.id ||
            g.reasonStatus === 'clued' ||
            g.reasonStatus === 'reviewed' ||
            g.reasonStatus === 'edited' ||
            g.reasonStatus === 'confirmed'
        );
      }
      // 오답마다 Gap 자동 생성하지 않음 — saveGapClue 할 때만 생성 (노이즈 방지)

      const encounter: TodayEncounter = {
        id: `${sentence.id}-${Date.now()}`,
        sentenceId: sentence.id,
        en: sentence.en,
        ko: sentence.ko,
        match: evaluation.match,
        guess: response.text,
        at: new Date().toISOString(),
      };
      let todayLog = get().todayLog;
      if (isRetry) {
        const idx = [...todayLog].map((e) => e.sentenceId).lastIndexOf(sentence.id);
        if (idx >= 0) {
          todayLog = [...todayLog];
          todayLog[idx] = { ...encounter, id: todayLog[idx].id };
        } else {
          todayLog = [...todayLog, encounter];
        }
      } else {
        todayLog = [...todayLog, encounter];
      }
      todayLog = todayLog.slice(-TODAY_LOG_MAX);
      persistTodayLog(todayLog);

      // SRS 메모리 갱신
      const memories = { ...get().memories };
      const prevMem =
        memories[sentence.id] ??
        createMemory(sentence.id, sentence.en, sentence.ko);
      const previousWrong =
        isRetry &&
        !!lastTrial &&
        (lastTrial.evaluation.match === 'wrong' ||
          lastTrial.evaluation.match === 'skipped');
      memories[sentence.id] = applyReview(
        prevMem,
        evaluation.match,
        get().reviewIntensity,
        { previousWrong, cueMode }
      );
      persistMemories(memories);

      set({
        progress: newProgress,
        lastTrial: trial,
        lastReward: {
          ...reward,
          totalXp: isRetry ? Math.max(0, xpDeltaApplied) : reward.totalXp,
          feedback: isRetry ? `${reward.feedback} (재시도)` : reward.feedback,
        },
        xp: newXp,
        level: newLevel,
        badges: newBadges,
        earnedBadgeIds,
        skill: newSkill,
        pendingGaps,
        gapNotes,
        todayLog,
        memories,
      });

      return reward;
    },

    nextSentence: () => {
      const { plan, progress, currentSentence } = get();
      if (!plan) return;
      // 현재 카드 기준 다음 문장 — 채점 후 index와 어긋나도 한 칸 전진
      const curIdx = currentSentence
        ? plan.sentences.findIndex((s) => s.id === currentSentence.id)
        : -1;
      const nextIndex = Math.max(curIdx + 1, progress.index);
      if (nextIndex < 0 || nextIndex >= plan.total) {
        set({ isPlaying: false, currentSentence: null });
        return;
      }
      const next = plan.sentences[nextIndex] ?? null;
      set({
        currentSentence: next,
        currentTier: next?.difficulty ?? null,
        lastTrial: null,
        lastReward: null,
      });
    },

    endSession: () => {
      const { plan, progress, xp, earnedBadgeIds, practiceBand } = get();
      if (!plan) return null;
      const summary = summarizeSession(progress, plan.total);
      const completion = computeSessionCompletionRewards(summary, earnedBadgeIds);

      let decision = decideComfortAdapt(summary, practiceBand);
      let comfortStreak = get().comfortStreak;
      let bandConquestCount = get().bandConquestCount;
      let nextBand = practiceBand;
      let adaptBonus = 0;
      const sessionBadges: Badge[] = [...completion.badges];

      if (decision) {
        if (decision.autoApplied && decision.to !== practiceBand) {
          nextBand = decision.to;
          adaptBonus = decision.bonusXp;
          if (decision.signal === 'raise') {
            comfortStreak = 0;
            bandConquestCount += 1;
            if (!earnedBadgeIds.has('band_conquer') && BADGES.band_conquer) {
              earnedBadgeIds.add('band_conquer');
              sessionBadges.push({
                ...BADGES.band_conquer,
                earnedAt: new Date().toISOString(),
              });
            }
          } else if (decision.signal === 'lower') {
            comfortStreak = 0;
          }
        } else if (decision.signal === 'hold') {
          comfortStreak += 1;
          adaptBonus = decision.bonusXp;
          if (
            comfortStreak >= 3 &&
            !earnedBadgeIds.has('comfort_streak_3') &&
            BADGES.comfort_streak_3
          ) {
            earnedBadgeIds.add('comfort_streak_3');
            sessionBadges.push({
              ...BADGES.comfort_streak_3,
              earnedAt: new Date().toISOString(),
            });
          }
          if (
            comfortStreak >= 5 &&
            !earnedBadgeIds.has('comfort_flow_5') &&
            BADGES.comfort_flow_5
          ) {
            earnedBadgeIds.add('comfort_flow_5');
            sessionBadges.push({
              ...BADGES.comfort_flow_5,
              earnedAt: new Date().toISOString(),
            });
          }
        }
      }

      const newXp = xp + completion.totalXp + adaptBonus;
      const newLevel = levelFromXp(newXp).level;

      const progressPatch: Partial<ProgressState> = {
        xp: newXp,
        level: newLevel,
        comfortStreak,
        bandConquestCount,
      };
      if (nextBand && nextBand !== practiceBand) {
        progressPatch.practiceBand = nextBand;
        progressPatch.practiceBandSource = 'auto';
        progressPatch.practiceBandSetAt = new Date().toISOString();
      }
      writeLocal('progress', { ...loadProgress(), ...progressPatch });

      const newBadges = [...get().badges, ...sessionBadges];
      const streakBadge =
        get().streakDays >= 7 && !earnedBadgeIds.has('streak_7')
          ? [
              {
                id: 'streak_7',
                name: '7일 연속 학습',
                description: '일주일 매일 학습',
                condition: '7일 streak',
                earnedAt: new Date().toISOString(),
              } as Badge,
            ]
          : [];
      const sentencesBadge =
        get().totalSentences >= 100 && !earnedBadgeIds.has('sentences_100')
          ? [
              {
                id: 'sentences_100',
                name: '100문장 달성',
                description: '누적 100문장 학습',
                condition: '누적 100문장',
                earnedAt: new Date().toISOString(),
              } as Badge,
            ]
          : [];
      streakBadge.forEach((b) => earnedBadgeIds.add(b.id));
      sentencesBadge.forEach((b) => earnedBadgeIds.add(b.id));
      const allNewBadges = [...newBadges, ...streakBadge, ...sentencesBadge];
      writeLocal('reward', { badges: allNewBadges, skill: get().skill });

      const gaps = get().pendingGaps.map((g) => {
        const latest = get().gapNotes.find((n) => n.id === g.id);
        return latest ?? g;
      });

      const completionWithAdapt: SessionCompletionRewards = {
        ...completion,
        totalXp: completion.totalXp + adaptBonus,
        badges: sessionBadges,
      };

      set({
        isPlaying: false,
        summary,
        completionRewards: completionWithAdapt,
        lastComfortAdapt: decision,
        xp: newXp,
        level: newLevel,
        comfortStreak,
        bandConquestCount,
        practiceBand: nextBand ?? practiceBand,
        practiceBandSource:
          nextBand && nextBand !== practiceBand
            ? 'auto'
            : get().practiceBandSource,
        practiceBandSetAt:
          nextBand && nextBand !== practiceBand
            ? new Date().toISOString()
            : get().practiceBandSetAt,
        badges: allNewBadges,
        earnedBadgeIds,
        currentSentence: null,
        pendingGaps: [],
      });

      void (async () => {
        try {
          const s = get();
          await syncToVault({
            progress: {
              xp: s.xp,
              level: s.level,
              streakDays: s.streakDays,
              todaySentenceCount: s.todaySentenceCount,
              correctCount: s.correctCount,
              attemptCount: s.attemptCount,
              totalSentences: s.totalSentences,
            },
            skill: s.skill,
            badges: s.badges,
            gaps,
            memories: s.memories,
          });
        } catch {
          /* 미연결이면 조용히 스킵 */
        }
      })();

      return summary;
    },

    syncNow: async () => {
      // 1) 쓰기 전에 볼트를 먼저 읽어 옵시디언 메움을 조용히 흡수 —
      // 이렇게 순서를 고정해야 reviewed 감지가 매번 자동으로 일어나고,
      // 아래 write 단계에서 방금 읽은 메움을 다시 병합해도 안전하다.
      try {
        const imported = await importVaultGaps();
        if (imported.length > 0) {
          const merged = mergeImportedGaps(imported, get().memories, get().gapNotes, new Date());
          persistGapNotes(merged.gapNotes);
          persistMemories(merged.memories);
          set({ memories: merged.memories, gapNotes: merged.gapNotes });
        }
      } catch {
        /* 미연결이면 스킵 */
      }

      // 2) 최신 상태를 볼트에 반영
      const s = get();
      const gaps = (s.pendingGaps.length > 0 ? s.pendingGaps : s.gapNotes.slice(-20)).map(
        (g) => s.gapNotes.find((n) => n.id === g.id) ?? g
      );
      const { mergedGaps } = await syncToVault({
        progress: {
          xp: s.xp,
          level: s.level,
          streakDays: s.streakDays,
          todaySentenceCount: s.todaySentenceCount,
          correctCount: s.correctCount,
          attemptCount: s.attemptCount,
          totalSentences: s.totalSentences,
        },
        skill: s.skill,
        badges: s.badges,
        gaps,
        memories: s.memories,
      });

      // 3) write 시 병합된 결과(볼트에 이미 있던 메움 보존)를 앱 상태에도 반영
      if (mergedGaps.length > 0) {
        const byId = new Map(get().gapNotes.map((g) => [g.id, g] as const));
        for (const g of mergedGaps) byId.set(g.id, g);
        const nextGapNotes = [...byId.values()].slice(-200);
        persistGapNotes(nextGapNotes);
        set({ gapNotes: nextGapNotes });
      }

      if (get().pendingGaps.length > 0) {
        set({ pendingGaps: [] });
      }
    },

    bootstrapSync: async () => {
      try {
        const status = await restoreSyncSession();
        if (!status.connected) return;
        await get().syncNow();
      } catch {
        /* 미연결/권한 없음 — 조용히 스킵, 사용자가 Brain 탭에서 다시 연결 */
      }
    },

    resetSession: () =>
      set({
        isPlaying: false,
        plan: null,
        progress: { ...INITIAL_PROGRESS },
        currentSentence: null,
        currentTier: null,
        lastTrial: null,
        lastReward: null,
        summary: null,
        completionRewards: null,
        lastComfortAdapt: null,
      }),

    toggleTheme: () => {
      const theme = get().theme === 'dark' ? 'light' : 'dark';
      applyTheme(theme);
      persistTheme(theme);
      set({ theme });
    },

    setLang: (lang) => set({ lang }),
  };
});

applyTheme(loadTheme());

// 앱 시작 시 1회: 연결 복원 + 조용한 import/sync.
// 이후엔 24시간 경과 시에만 자동 동기화 (열어 둔 채로 오래 있는 경우 대비).
if (typeof window !== 'undefined') {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  void useStore.getState().bootstrapSync();
  setInterval(() => {
    const status = getSyncStatus();
    if (!status.connected) return;
    const last = status.lastSyncAt ? Date.parse(status.lastSyncAt) : 0;
    if (!last || Date.now() - last > ONE_DAY_MS) {
      void useStore.getState().syncNow();
    }
  }, 60 * 60 * 1000);
}
