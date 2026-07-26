/**
 * srs-engine.ts — 복습 스케줄(SM-2 변형) + 「내 문장」 편입.
 *
 * 빈도 프리셋(빡셈/보통/여유)이 interval 배율을 조절한다.
 * owned: 자동(연속 exact 2 / fuzzy 3 / 오답→exact) 또는 수동.
 */
export type SrsMatch = 'exact' | 'fuzzy' | 'wrong' | 'skipped';

export type ReviewIntensity = 'intense' | 'normal' | 'relaxed';

export interface SentenceMemory {
  sentenceId: string;
  en: string;
  ko: string;
  attempts: number;
  correct: number; // exact + fuzzy
  exactCount: number;
  fuzzyCount: number;
  wrong: number;
  skipped: number;
  /** SM-2 ease factor — 기본 2.5, 최소 1.3 */
  ease: number;
  intervalDays: number;
  nextReviewAt: string; // ISO
  owned: boolean;
  ownedAt?: string;
  ownedReason?: 'auto-exact2' | 'auto-fuzzy3' | 'auto-recover' | 'manual';
  lastMatch?: SrsMatch;
  updatedAt: string;
}

export const REVIEW_INTENSITY_LABEL: Record<ReviewIntensity, string> = {
  intense: '빡셈',
  normal: '보통',
  relaxed: '여유',
};

/** interval 배율 — 작을수록 더 자주 복습 */
export const REVIEW_INTENSITY_FACTOR: Record<ReviewIntensity, number> = {
  intense: 0.6,
  normal: 1,
  relaxed: 1.6,
};

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;

export function createMemory(
  sentenceId: string,
  en: string,
  ko: string,
  now = new Date()
): SentenceMemory {
  return {
    sentenceId,
    en,
    ko,
    attempts: 0,
    correct: 0,
    exactCount: 0,
    fuzzyCount: 0,
    wrong: 0,
    skipped: 0,
    ease: DEFAULT_EASE,
    intervalDays: 0,
    nextReviewAt: now.toISOString(),
    owned: false,
    updatedAt: now.toISOString(),
  };
}

function addDays(isoOrDate: Date, days: number): string {
  const d = new Date(isoOrDate);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Math.max(0, Math.round(days)));
  return d.toISOString();
}

/**
 * 한 번의 평가로 메모리 갱신.
 * previousWrong: 직전 시도가 wrong/skip 이었는지 (재시도 exact → auto-recover)
 */
export function applyReview(
  memory: SentenceMemory,
  match: SrsMatch,
  intensity: ReviewIntensity,
  options: { previousWrong?: boolean; now?: Date } = {}
): SentenceMemory {
  const now = options.now ?? new Date();
  const factor = REVIEW_INTENSITY_FACTOR[intensity];
  const next: SentenceMemory = {
    ...memory,
    attempts: memory.attempts + 1,
    lastMatch: match,
    updatedAt: now.toISOString(),
  };

  switch (match) {
    case 'exact':
      next.exactCount += 1;
      next.correct += 1;
      next.ease = Math.min(3.2, memory.ease + 0.1);
      if (memory.intervalDays <= 0) next.intervalDays = 1 * factor;
      else if (memory.intervalDays < 3) next.intervalDays = 3 * factor;
      else next.intervalDays = memory.intervalDays * next.ease * factor;
      break;
    case 'fuzzy':
      next.fuzzyCount += 1;
      next.correct += 1;
      next.ease = Math.max(MIN_EASE, memory.ease - 0.05);
      next.intervalDays =
        memory.intervalDays <= 0 ? 1 * factor : Math.max(1, memory.intervalDays * 0.9 * factor);
      break;
    case 'wrong':
    case 'skipped':
      if (match === 'wrong') next.wrong += 1;
      else next.skipped += 1;
      next.ease = Math.max(MIN_EASE, memory.ease - 0.2);
      next.intervalDays = 0;
      break;
  }

  next.intervalDays = Math.round(next.intervalDays * 10) / 10;
  next.nextReviewAt =
    match === 'wrong' || match === 'skipped'
      ? now.toISOString() // 즉시 재복습 가능
      : addDays(now, Math.max(1, next.intervalDays));

  return maybeAutoOwn(next, match, options.previousWrong === true, now);
}

function maybeAutoOwn(
  memory: SentenceMemory,
  match: SrsMatch,
  previousWrong: boolean,
  now: Date
): SentenceMemory {
  if (memory.owned) return memory;

  if (match === 'exact' && previousWrong) {
    return {
      ...memory,
      owned: true,
      ownedAt: now.toISOString(),
      ownedReason: 'auto-recover',
    };
  }
  if (memory.exactCount >= 2) {
    return {
      ...memory,
      owned: true,
      ownedAt: now.toISOString(),
      ownedReason: 'auto-exact2',
    };
  }
  if (memory.fuzzyCount >= 3) {
    return {
      ...memory,
      owned: true,
      ownedAt: now.toISOString(),
      ownedReason: 'auto-fuzzy3',
    };
  }
  return memory;
}

/** 수동으로 내 문장 편입 */
export function markOwned(memory: SentenceMemory, now = new Date()): SentenceMemory {
  if (memory.owned) return memory;
  return {
    ...memory,
    owned: true,
    ownedAt: now.toISOString(),
    ownedReason: 'manual',
    updatedAt: now.toISOString(),
  };
}

export function unmarkOwned(memory: SentenceMemory, now = new Date()): SentenceMemory {
  return {
    ...memory,
    owned: false,
    ownedAt: undefined,
    ownedReason: undefined,
    updatedAt: now.toISOString(),
  };
}

export function isDue(memory: SentenceMemory, now = new Date()): boolean {
  return new Date(memory.nextReviewAt).getTime() <= now.getTime();
}

export function accuracyPct(memory: SentenceMemory): number {
  if (memory.attempts <= 0) return 0;
  return Math.round((memory.correct / memory.attempts) * 100);
}

/** 복습 대기열 — due 우선, owned 가점, 오답 많은 순 */
export function pickReviewQueue(
  memories: SentenceMemory[],
  limit: number,
  now = new Date()
): SentenceMemory[] {
  const due = memories.filter((m) => isDue(m, now));
  const scored = due
    .map((m) => ({
      m,
      score:
        (m.owned ? 1000 : 0) +
        m.wrong * 10 +
        m.skipped * 5 +
        (m.attempts - m.correct) * 3 -
        m.exactCount,
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, limit)).map((s) => s.m);
}

export function countDue(memories: SentenceMemory[], now = new Date()): number {
  return memories.filter((m) => isDue(m, now)).length;
}

export function countOwned(memories: SentenceMemory[]): number {
  return memories.filter((m) => m.owned).length;
}

/** ContentItem 형태로 변환 — 세션 엔진 입력용 */
export function memoryToContentItem(m: SentenceMemory): {
  id: string;
  type: 'sentence';
  data: { en: string; translations: { ko: string } };
  translations: { ko: string };
  tags: string[];
  form: 'statement';
  level: number;
  packId: string;
} {
  const level = m.wrong >= 2 ? 3 : m.owned ? 2 : 1;
  return {
    id: m.sentenceId,
    type: 'sentence',
    data: { en: m.en, translations: { ko: m.ko } },
    translations: { ko: m.ko },
    tags: m.owned ? ['owned', 'review'] : ['review'],
    form: 'statement',
    level,
    packId: 'review',
  };
}
