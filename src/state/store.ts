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
  type GapNote,
} from '../adapters/cloud-sync';
import { inferGapReason, problemSlots, type GapSlotRole } from '../domain/gap-reason';
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
  type CueMode,
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
  getGapForSentence: (sentenceId: string) => GapNote | undefined;
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
  /** Phase 4: 현재 상태를 Obsidian Vault / IndexedDB에 동기화 */
  syncNow: () => Promise<void>;

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
  return readLocal<GapNote[]>('gapNotes') ?? [];
}

function persistGapNotes(notes: GapNote[]) {
  writeLocal('gapNotes', notes.slice(-200));
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
          return {
            ...g,
            reasonStatus: 'confirmed' as const,
            reasonFinal: g.reasonAuto || g.reasonFinal || '',
            updatedAt: nowIso,
          };
        }
        return {
          ...g,
          reasonStatus: 'edited' as const,
          reasonFinal: resolution.reason.trim(),
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
      const memories = { ...get().memories };
      let imported = 0;
      const now = new Date();
      for (const gap of gaps) {
        let mem =
          memories[gap.expressionId] ??
          createMemory(gap.expressionId, gap.en, gap.ko, now);
        // 볼트에서 온 약점 → 즉시 복습 대상
        mem = {
          ...mem,
          en: mem.en || gap.en,
          ko: mem.ko || gap.ko,
          wrong: Math.max(mem.wrong, 1),
          attempts: Math.max(mem.attempts, 1),
          nextReviewAt: new Date(now.getTime() - 60_000).toISOString(),
          updatedAt: now.toISOString(),
          lastMatch: mem.lastMatch ?? 'wrong',
        };
        memories[gap.expressionId] = mem;
        imported += 1;
      }
      persistMemories(memories);
      set({ memories });
      return {
        imported,
        message: `볼트 Gap ${imported}개를 약점 훈련 큐에 넣었어요. Today → 약점 강화를 시작하세요.`,
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
        pendingGaps = pendingGaps.filter((g) => g.expressionId !== sentence.id);
        gapNotes = gapNotes.filter((g) => g.expressionId !== sentence.id);
      }
      if (
        (evaluation.match === 'wrong' || evaluation.match === 'skipped') &&
        sentence.en
      ) {
        const matchKind = evaluation.match === 'skipped' ? 'skipped' : 'wrong';
        const cueMode = (response.cueMode ?? 'blind') as CueMode;
        const guess = response.text ?? '(스킵)';
        const reasonAuto = inferGapReason({
          en: sentence.en,
          ko: sentence.ko,
          guess,
          match: matchKind,
          cueMode,
        });
        const slots =
          matchKind === 'wrong' && guess && guess !== '(스킵)'
            ? problemSlots({ en: sentence.en, guess })
            : [];
        const nowIso = new Date().toISOString();
        const gap: GapNote = {
          id: makeGapId(sentence.id, guess),
          expressionId: sentence.id,
          en: sentence.en,
          ko: sentence.ko,
          guess,
          createdAt: nowIso,
          updatedAt: nowIso,
          match: matchKind,
          cueMode,
          inputMode: response.inputMode,
          slots,
          reasonAuto,
          reasonFinal: reasonAuto,
          reasonStatus: 'pending',
        };
        pendingGaps = [...pendingGaps, gap];
        gapNotes = [...gapNotes.filter((g) => g.expressionId !== sentence.id), gap].slice(-200);
        persistGapNotes(gapNotes);
      }

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
      const s = get();
      const gaps = (s.pendingGaps.length > 0 ? s.pendingGaps : s.gapNotes.slice(-20)).map(
        (g) => s.gapNotes.find((n) => n.id === g.id) ?? g
      );
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
      if (s.pendingGaps.length > 0) {
        set({ pendingGaps: [] });
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
