/**
 * comfort-adapt — 세션 성과로 연습 밴드를 계속 맞춤.
 * 목표: 지루함(너무 쉬움) / 좌절(너무 어려움)을 줄이고
 * 정복·흐름 유지의 게임 감각을 준다.
 */
import type { SessionSummary } from './session-engine';
import {
  LEARNER_LEVEL_META,
  type LearnerLevel,
  bandFromIndex,
  bandIndex,
  nudgeBand,
} from './learner-level';

export type ComfortSignal = 'raise' | 'hold' | 'lower';

export interface AdaptDecision {
  signal: ComfortSignal;
  from: LearnerLevel;
  to: LearnerLevel;
  /** 시스템이 바로 적용했는지 (명확한 신호일 때) */
  autoApplied: boolean;
  title: string;
  body: string;
  tone: 'conquer' | 'flow' | 'recover';
  bonusXp: number;
  /** hold인데 사용자가 눌러 올릴/내릴 수 있음 */
  offerRaise: boolean;
  offerLower: boolean;
}

const MIN_ANSWERED = 4;

/**
 * 세션 요약 → 난이도 조절 결정.
 * raise/lower는 경계에서 멈추고, hold는 흐름 유지 메시지.
 */
export function decideComfortAdapt(
  summary: SessionSummary,
  current: LearnerLevel | null | undefined
): AdaptDecision | null {
  if (!current) return null;
  const answered = summary.answered;
  if (answered < MIN_ANSWERED) return null;

  const hit = summary.correct + summary.fuzzy;
  const miss = summary.wrong + summary.skipped;
  const accuracy = summary.accuracy; // 0-100
  const from = current;
  const canRaise = bandIndex(from) < 3;
  const canLower = bandIndex(from) > 0;

  // 너무 쉬움 → 정복 후 상승 (문턱을 낮춰 빨리 올려 줌)
  const crush =
    accuracy >= 72 &&
    summary.wrong <= 2 &&
    hit >= Math.max(3, Math.floor(answered * 0.65)) &&
    (summary.rank === 'S' ||
      summary.rank === 'A' ||
      summary.rank === 'B' ||
      summary.maxCombo >= 4);

  // 너무 어려움 → 페이스 조절 (문턱을 높여 쉽게 내리지 않음)
  const overwhelm =
    accuracy < 38 ||
    miss >= Math.ceil(answered * 0.6) ||
    (summary.wrong >= 5 && accuracy < 50);

  if (crush && canRaise) {
    const to = nudgeBand(from, 1);
    const meta = LEARNER_LEVEL_META[to];
    return {
      signal: 'raise',
      from,
      to,
      autoApplied: true,
      title: '구간 정복!',
      body: `이 난이도를 잘 해냈어요. 다음엔 「${meta.name}」으로 살짝 올려 도전해요.`,
      tone: 'conquer',
      bonusXp: 25,
      offerRaise: false,
      offerLower: true,
    };
  }

  if (overwhelm && canLower) {
    const to = nudgeBand(from, -1);
    const meta = LEARNER_LEVEL_META[to];
    return {
      signal: 'lower',
      from,
      to,
      autoApplied: true,
      title: '페이스 조절',
      body: `지금은 「${meta.name}」에서 다시 쌓는 게 좋아요해요. 정복은 곧 다시 와요.`,
      tone: 'recover',
      bonusXp: 10,
      offerRaise: true,
      offerLower: false,
    };
  }

  // 적당 — 흐름 유지 + 약한 제안
  const meta = LEARNER_LEVEL_META[from];
  const offerRaise = canRaise && accuracy >= 70 && summary.wrong <= 2;
  const offerLower = canLower && accuracy < 60 && miss >= 2;
  return {
    signal: 'hold',
    from,
    to: from,
    autoApplied: false,
    title: '적당 구간 유지',
    body: `「${meta.name}」흐름이 좋아요. 지루하면 올려 보고, 막히면 낮춰 보세요.`,
    tone: 'flow',
    bonusXp: summary.rank === 'S' || summary.rank === 'A' ? 15 : 5,
    offerRaise,
    offerLower,
  };
}

export function applyManualNudge(
  decision: AdaptDecision,
  direction: 'raise' | 'lower'
): AdaptDecision {
  const to =
    direction === 'raise' ? nudgeBand(decision.from, 1) : nudgeBand(decision.from, -1);
  if (to === decision.from) return decision;
  const meta = LEARNER_LEVEL_META[to];
  if (direction === 'raise') {
    return {
      ...decision,
      signal: 'raise',
      to,
      autoApplied: true,
      title: '도전 수락!',
      body: `좋아, 「${meta.name}」으로 올려 볼게요. 정복할 차례예요.`,
      tone: 'conquer',
      bonusXp: decision.bonusXp + 10,
      offerRaise: false,
      offerLower: true,
    };
  }
  return {
    ...decision,
    signal: 'lower',
    to,
    autoApplied: true,
    title: '페이스 조절',
    body: `「${meta.name}」으로 맞춰 둘게요. 다시 쌓아서 정복하러 가요.`,
    tone: 'recover',
    bonusXp: decision.bonusXp,
    offerRaise: true,
    offerLower: false,
  };
}

/** 도전 문장 정답 시 즉각 카피 */
export function challengeConquerLine(combo: number): string {
  if (combo >= 5) return '도전 정복! 콤보까지 불타요 🔥';
  return '도전 문장 정복! +보너스 감각';
}

export function comfortStreakLabel(streak: number): string | null {
  if (streak >= 5) return `적당 구간 ${streak}연속 — 흐름의 달인`;
  if (streak >= 3) return `적당 구간 ${streak}연속 유지 중`;
  return null;
}

export function bandStepLabel(from: LearnerLevel, to: LearnerLevel): string {
  if (from === to) return LEARNER_LEVEL_META[from].name;
  const dir = bandIndex(to) > bandIndex(from) ? '↑' : '↓';
  return `${LEARNER_LEVEL_META[from].name} ${dir} ${LEARNER_LEVEL_META[to].name}`;
}

/** 테스트용 — 인덱스 클램프 노출 */
export function peekNextBand(current: LearnerLevel, delta: -1 | 1): LearnerLevel {
  return bandFromIndex(bandIndex(current) + delta);
}
