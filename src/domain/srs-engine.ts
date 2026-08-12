/**
 * srs-engine.ts — 복습 스케줄(SM-2 변형) + 「내 문장」 편입.
 *
 * cueMode: 힌트 없이 말했는지 / 듣고 말했는지 / 정답 보고 말했는지.
 * 빈도 프리셋(빡셈/보통/여유)이 interval 배율을 조절한다.
 */
export type SrsMatch = 'exact' | 'fuzzy' | 'wrong' | 'skipped';

/** 힌트 경로 — 점수·복습 간격에 반영 */
export type CueMode = 'blind' | 'after_listen' | 'after_reveal';

export type ReviewIntensity = 'intense' | 'normal' | 'relaxed';

export interface SentenceMemory {
  sentenceId: string;
  en: string;
  ko: string;
  attempts: number;
  correct: number;
  exactCount: number;
  fuzzyCount: number;
  wrong: number;
  skipped: number;
  blindCorrect: number;
  listenCorrect: number;
  revealCorrect: number;
  ease: number;
  intervalDays: number;
  nextReviewAt: string;
  owned: boolean;
  ownedAt?: string;
  ownedReason?: 'auto-exact2' | 'auto-fuzzy3' | 'auto-recover' | 'manual';
  lastMatch?: SrsMatch;
  lastCueMode?: CueMode;
  updatedAt: string;
}

export const REVIEW_INTENSITY_LABEL: Record<ReviewIntensity, string> = {
  intense: '빡셈',
  normal: '보통',
  relaxed: '여유',
};

export const CUE_MODE_LABEL: Record<CueMode, string> = {
  blind: '힌트 없이',
  after_listen: '듣고 말함',
  after_reveal: '정답 보고 말함',
};

export const REVIEW_INTENSITY_FACTOR: Record<ReviewIntensity, number> = {
  intense: 0.6,
  normal: 1,
  relaxed: 1.6,
};

export const CUE_INTERVAL_FACTOR: Record<CueMode, number> = {
  blind: 1.35,
  after_listen: 1,
  after_reveal: 0.65,
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
    blindCorrect: 0,
    listenCorrect: 0,
    revealCorrect: 0,
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

export function applyReview(
  memory: SentenceMemory,
  match: SrsMatch,
  intensity: ReviewIntensity,
  options: {
    previousWrong?: boolean;
    cueMode?: CueMode;
    now?: Date;
  } = {}
): SentenceMemory {
  const now = options.now ?? new Date();
  const cue: CueMode = options.cueMode ?? 'blind';
  const factor = REVIEW_INTENSITY_FACTOR[intensity] * CUE_INTERVAL_FACTOR[cue];
  const next: SentenceMemory = {
    ...memory,
    blindCorrect: memory.blindCorrect ?? 0,
    listenCorrect: memory.listenCorrect ?? 0,
    revealCorrect: memory.revealCorrect ?? 0,
    attempts: memory.attempts + 1,
    lastMatch: match,
    lastCueMode: cue,
    updatedAt: now.toISOString(),
  };

  switch (match) {
    case 'exact':
      next.exactCount += 1;
      next.correct += 1;
      if (cue === 'blind') next.blindCorrect += 1;
      else if (cue === 'after_listen') next.listenCorrect += 1;
      else next.revealCorrect += 1;
      next.ease = Math.min(
        3.2,
        memory.ease + (cue === 'blind' ? 0.15 : cue === 'after_listen' ? 0.1 : 0.05)
      );
      if (memory.intervalDays <= 0) next.intervalDays = 1 * factor;
      else if (memory.intervalDays < 3) next.intervalDays = 3 * factor;
      else next.intervalDays = memory.intervalDays * next.ease * factor;
      break;
    case 'fuzzy':
      next.fuzzyCount += 1;
      next.correct += 1;
      if (cue === 'blind') next.blindCorrect += 1;
      else if (cue === 'after_listen') next.listenCorrect += 1;
      else next.revealCorrect += 1;
      next.ease = Math.max(MIN_EASE, memory.ease - (cue === 'after_reveal' ? 0.08 : 0.05));
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
      ? now.toISOString()
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
  if (memory.blindCorrect >= 2 || memory.exactCount >= 2) {
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

export interface AddManualExpressionResult {
  memories: Record<string, SentenceMemory>;
  sentenceId: string;
  wasExisting: boolean;
}

/**
 * 사용자가 직접 붙여넣은 영어/한국어 표현을 「내 문장」으로 추가.
 * 같은 영어 문장(대소문자·공백 무시)이 이미 있으면 새로 만들지 않고 owned만 표시.
 */
export function addManualExpression(
  memories: Record<string, SentenceMemory>,
  en: string,
  ko: string,
  now = new Date()
): AddManualExpressionResult {
  const key = en.trim().toLowerCase().replace(/\s+/g, ' ');
  const existing = Object.values(memories).find(
    (m) => m.en.trim().toLowerCase().replace(/\s+/g, ' ') === key
  );
  if (existing) {
    return {
      memories: { ...memories, [existing.sentenceId]: markOwned(existing, now) },
      sentenceId: existing.sentenceId,
      wasExisting: true,
    };
  }
  const sentenceId = `my-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const created = markOwned(createMemory(sentenceId, en.trim(), ko.trim(), now), now);
  return {
    memories: { ...memories, [sentenceId]: created },
    sentenceId,
    wasExisting: false,
  };
}

export function isDue(memory: SentenceMemory, now = new Date()): boolean {
  return new Date(memory.nextReviewAt).getTime() <= now.getTime();
}

export function accuracyPct(memory: SentenceMemory): number {
  if (memory.attempts <= 0) return 0;
  return Math.round((memory.correct / memory.attempts) * 100);
}

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
        (m.revealCorrect ?? 0) * 2 +
        (m.attempts - m.correct) * 3 -
        (m.blindCorrect ?? 0) * 4 -
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

export interface WeakLinkRow {
  sentenceId: string;
  en: string;
  ko: string;
  wrong: number;
  attempts: number;
  lastCueMode?: CueMode;
  reason: string;
}

export interface WeakLinkSummary {
  dueCount: number;
  ownedCount: number;
  memoryCount: number;
  due: WeakLinkRow[];
  weak: WeakLinkRow[];
}

/** 볼트 투영용 — due 복습 + 오답·힌트의존 약점 TOP */
export function summarizeWeakLinks(
  memories: SentenceMemory[],
  options: { dueLimit?: number; weakLimit?: number; now?: Date } = {}
): WeakLinkSummary {
  const dueLimit = options.dueLimit ?? 10;
  const weakLimit = options.weakLimit ?? 10;
  const now = options.now ?? new Date();
  const list = Array.isArray(memories) ? memories : [];

  const due = pickReviewQueue(list, dueLimit, now).map((m) => ({
    sentenceId: m.sentenceId,
    en: m.en,
    ko: m.ko,
    wrong: m.wrong,
    attempts: m.attempts,
    lastCueMode: m.lastCueMode,
    reason: m.owned ? '내 문장 · 복습 기한' : '복습 기한',
  }));

  const weak = [...list]
    .filter((m) => m.attempts > 0 && (m.wrong > 0 || (m.revealCorrect ?? 0) > (m.blindCorrect ?? 0)))
    .map((m) => {
      const revealHeavy = (m.revealCorrect ?? 0) > (m.blindCorrect ?? 0);
      const reason =
        m.wrong >= 2
          ? `오답 ${m.wrong}회`
          : revealHeavy
            ? '정답 보고 맞힌 비중 높음'
            : `오답 ${m.wrong}회`;
      return {
        sentenceId: m.sentenceId,
        en: m.en,
        ko: m.ko,
        wrong: m.wrong,
        attempts: m.attempts,
        lastCueMode: m.lastCueMode,
        reason,
        score: m.wrong * 10 + (revealHeavy ? 5 : 0) + (m.attempts - m.correct),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, weakLimit)
    .map(({ score: _s, ...row }) => row);

  return {
    dueCount: countDue(list, now),
    ownedCount: countOwned(list),
    memoryCount: list.length,
    due,
    weak,
  };
}

/** 약점 강화 훈련 큐 — due + 오답/힌트의존을 합쳐 우선순위 정렬 */
export function pickWeakTrainingQueue(
  memories: SentenceMemory[],
  limit: number,
  now = new Date()
): SentenceMemory[] {
  const list = Array.isArray(memories) ? memories : [];
  const scored = list
    .filter((m) => m.attempts > 0 || isDue(m, now) || m.owned)
    .map((m) => {
      const due = isDue(m, now);
      const revealHeavy = (m.revealCorrect ?? 0) > (m.blindCorrect ?? 0);
      const score =
        (due ? 500 : 0) +
        (m.owned ? 200 : 0) +
        m.wrong * 40 +
        (revealHeavy ? 25 : 0) +
        m.skipped * 10 +
        (m.attempts - m.correct) * 5 -
        (m.blindCorrect ?? 0) * 8 -
        m.exactCount * 3;
      return { m, score };
    })
    .filter((s) => s.score > 0 || isDue(s.m, now) || s.m.wrong > 0)
    .sort((a, b) => b.score - a.score);

  const picked = scored.slice(0, Math.max(0, limit)).map((s) => s.m);
  if (picked.length >= limit) return picked;

  // 부족하면 due만으로 보충
  const ids = new Set(picked.map((m) => m.sentenceId));
  for (const m of pickReviewQueue(list, limit, now)) {
    if (ids.has(m.sentenceId)) continue;
    picked.push(m);
    ids.add(m.sentenceId);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function countWeakTraining(memories: SentenceMemory[], now = new Date()): number {
  return pickWeakTrainingQueue(memories, 50, now).length;
}

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
  const level =
    m.wrong >= 2 || (m.revealCorrect ?? 0) > (m.blindCorrect ?? 0) ? 3 : m.owned ? 2 : 1;
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
