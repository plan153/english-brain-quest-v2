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
  type GapNote,
} from '../adapters/cloud-sync';
import {
  applyReview,
  createMemory,
  markOwned,
  unmarkOwned,
  pickReviewQueue,
  countDue,
  countOwned,
  memoryToContentItem,
  type SentenceMemory,
  type ReviewIntensity,
} from '../domain/srs-engine';

export type { SentenceMemory, ReviewIntensity };
export type TabId = 'today' | 'brain' | 'dictionary';

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
}

export interface RewardState {
  badges: Badge[];
  earnedBadgeIds: Set<string>;
  skill: SkillProfile;
  /** 세션 중 쌓인 Gap 노트 — endSession 시 Vault 동기화 */
  pendingGaps: GapNote[];
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

  // progress
  addXp: (amount: number) => void;
  markStudyToday: () => void;
  recordAnswer: (correct: boolean) => void;
  resetProgress: () => void;

  // session (Phase 2)
  startSessionFromItems: (
    items: ContentItem[],
    options?: { mode?: 'translate' | 'listen-speak'; size?: number }
  ) => void;
  recordTrial: (
    sentence: SessionSentence,
    evaluation: SessionEvaluateResult,
    response: { text?: string; skipped?: boolean }
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
};

const DEFAULT_REWARD_STATE: RewardState = {
  badges: [],
  earnedBadgeIds: new Set<string>(),
  skill: { ...DEFAULT_SKILL_PROFILE },
  pendingGaps: [],
};

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

export const useStore = create<AppStore>((set, get) => {
  const savedProgress = loadProgress();
  const initialProgress: ProgressState = { ...DEFAULT_PROGRESS, ...savedProgress };
  if (initialProgress.lastStudyDate !== todayStr()) {
    initialProgress.todaySentenceCount = 0;
  }
  const rewardInit = { ...DEFAULT_REWARD_STATE, ...loadReward() };
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
    // settings
    lang: 'en',
    ttsEnabled: true,
    theme: 'dark',
    activeTab: 'today',
    brainFocusTodayLog: false,
    todayLog: loadTodayLog(),
    memories: loadMemories(),
    reviewIntensity: loadReviewIntensity(),

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

    startSessionFromItems: (items, options = {}) => {
      if (items.length === 0) return;
      const size = options.size ?? 10; // Phase 2 데모는 10문장 (50은 너무 김)
      // 난이도 믹서로 10/80/10 분배 후 SessionPlan 생성
      const mixed: MixedItem[] = mixDifficulty(items, {
        challengeRatio: 0.1,
        easyRatio: 0.1,
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
      if (isRetry) {
        pendingGaps = pendingGaps.filter((g) => g.expressionId !== sentence.id);
      }
      if (
        (evaluation.match === 'wrong' || evaluation.match === 'skipped') &&
        sentence.en
      ) {
        const gap: GapNote = {
          id: makeGapId(sentence.id, response.text ?? ''),
          expressionId: sentence.id,
          en: sentence.en,
          ko: sentence.ko,
          guess: response.text ?? '(스킵)',
          createdAt: new Date().toISOString(),
        };
        pendingGaps = [...pendingGaps, gap];
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
        { previousWrong }
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
      const { plan, progress, xp, earnedBadgeIds } = get();
      if (!plan) return null;
      // 방어: 조기 호출돼도 요약/보상은 실제 응답 수 기준으로
      const summary = summarizeSession(progress, plan.total);
      const completion = computeSessionCompletionRewards(summary, earnedBadgeIds);

      // completion XP 영구 저장
      const newXp = xp + completion.totalXp;
      const newLevel = levelFromXp(newXp).level;
      writeLocal('progress', { ...loadProgress(), xp: newXp, level: newLevel });

      // streak 배지 — 7일
      const newBadges = [...get().badges, ...completion.badges];
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

      const gaps = get().pendingGaps;
      set({
        isPlaying: false,
        summary,
        completionRewards: completion,
        xp: newXp,
        level: newLevel,
        badges: allNewBadges,
        currentSentence: null,
        pendingGaps: [],
      });

      // Phase 4: Vault 동기화 (비동기, 실패해도 세션 완료는 유지)
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
          });
        } catch {
          /* 미연결이면 조용히 스킵 */
        }
      })();

      return summary;
    },

    syncNow: async () => {
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
        gaps: s.pendingGaps,
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
      }),

    toggleTheme: () => {
      const theme = get().theme === 'dark' ? 'light' : 'dark';
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', theme);
      }
      set({ theme });
    },

    setLang: (lang) => set({ lang }),
  };
});
