/**
 * store.ts — Zustand 전역 상태.
 * Phase 1에서는 진행 상태(XP, 연속일, 세션 카운트)만 최소 구현.
 */
import { create } from 'zustand';
import { readLocal, writeLocal } from '../adapters/storage';

export type TabId = 'today' | 'brain' | 'dictionary';

export interface ProgressState {
  xp: number;
  streakDays: number;
  lastStudyDate: string | null;
  todaySentenceCount: number;
  correctCount: number;
  attemptCount: number;
  level: number;
}

export interface SessionState {
  isPlaying: boolean;
  currentIndex: number;
  combo: number;
  currentSentence: {
    id: string;
    en: string;
    ko: string;
  } | null;
}

export interface SettingsState {
  lang: 'en' | 'ko';
  ttsEnabled: boolean;
  theme: 'dark' | 'light';
}

interface AppStore extends ProgressState, SessionState, SettingsState {
  // navigation
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // progress
  addXp: (amount: number) => void;
  markStudyToday: () => void;
  recordAnswer: (correct: boolean) => void;
  resetProgress: () => void;

  // session
  startSession: (sentences: { id: string; en: string; ko: string }[]) => void;
  nextSentence: () => void;
  endSession: () => void;
  setCombo: (combo: number) => void;
  setSentence: (sentence: { id: string; en: string; ko: string } | null) => void;

  // settings
  toggleTheme: () => void;
  setLang: (lang: 'en' | 'ko') => void;
}

const LEVEL_PER_XP = 100;

function calcLevel(xp: number): number {
  return Math.floor(xp / LEVEL_PER_XP) + 1;
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
};

export const useStore = create<AppStore>((set, get) => {
  const saved = loadProgress();
  const initialProgress: ProgressState = { ...DEFAULT_PROGRESS, ...saved };
  if (initialProgress.lastStudyDate !== todayStr()) {
    initialProgress.todaySentenceCount = 0;
  }
  initialProgress.level = calcLevel(initialProgress.xp);

  return {
    ...initialProgress,
    isPlaying: false,
    currentIndex: 0,
    combo: 0,
    currentSentence: null,
    lang: 'en',
    ttsEnabled: true,
    theme: 'dark',
    activeTab: 'today',

    setActiveTab: (tab) => set({ activeTab: tab }),

    addXp: (amount) => {
      const xp = get().xp + amount;
      const level = calcLevel(xp);
      const next = { xp, level };
      writeLocal('progress', { ...loadProgress(), ...next });
      set(next);
    },

    markStudyToday: () => {
      const today = todayStr();
      const { lastStudyDate, streakDays } = get();
      let newStreak = streakDays;
      if (lastStudyDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        newStreak = lastStudyDate === yesterday ? streakDays + 1 : 1;
        const next = { streakDays: newStreak, lastStudyDate: today };
        writeLocal('progress', { ...loadProgress(), ...next });
        set(next);
      }
    },

    recordAnswer: (correct) => {
      const attemptCount = get().attemptCount + 1;
      const correctCount = correct ? get().correctCount + 1 : get().correctCount;
      const todaySentenceCount = get().todaySentenceCount + 1;
      const next = { attemptCount, correctCount, todaySentenceCount };
      writeLocal('progress', { ...loadProgress(), ...next });
      set(next);
    },

    resetProgress: () => {
      writeLocal('progress', null);
      set({ ...DEFAULT_PROGRESS });
    },

    startSession: (sentences) => {
      if (sentences.length === 0) return;
      set({
        isPlaying: true,
        currentIndex: 0,
        combo: 0,
        currentSentence: sentences[0],
      });
      get().markStudyToday();
    },

    nextSentence: () => {
      const { currentIndex, isPlaying } = get();
      if (!isPlaying) return;
      // Phase 1에서는 단일 문장 흐름. Phase 2에서 세션 큐 관리로 교체.
      set({ currentIndex: currentIndex + 1, currentSentence: null });
    },

    endSession: () =>
      set({ isPlaying: false, currentIndex: 0, combo: 0, currentSentence: null }),

    setCombo: (combo) => set({ combo }),
    setSentence: (sentence) => set({ currentSentence: sentence }),

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
