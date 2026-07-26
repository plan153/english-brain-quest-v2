/**
 * reward-engine.ts — Phase 2 보상 엔진.
 *
 * 핵심 설계:
 *  - trial별 XP 계산 (exact > fuzzy > wrong/skip)
 *  - 콤보 보너스 (3, 5, 7, 10, 15, 20 연속 정답 시점마다 가산)
 *  - 도전 문장 보너스 (challenge tier +50% XP)
 *  - 레벨업 — 누적 XP가 thresholds[level] 도달 시 (RPG식)
 *  - 배지 — 첫 정답, 첫 콤보5, 첫 콤보10, 첫 S랭크, 7일 연속 학습, 100문장 달성 등
 *  - 즉각적 피드백(도파민) + 장기 목표(레벨/배지) 이중 보상
 */
import type { DifficultyTier } from './difficulty-mixer';
import type { SessionEvaluateResult } from '../interfaces/SessionMode';

export interface RewardContext {
  tier?: DifficultyTier;
  combo: number;
  isFirstCorrect?: boolean;
}

export interface TrialReward {
  baseXp: number;
  comboBonus: number;
  tierBonus: number;
  totalXp: number;
  comboLevel: number; // 0=없음, 1=3연속, 2=5연속, 3=7연속, 4=10연속, 5=15+, 6=20+
  leveledUp: boolean;
  newLevel?: number;
  newBadges: Badge[];
  feedback: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  /** 달성 조건 (표시용) */
  condition: string;
  /** 획득일 ISO */
  earnedAt?: string;
}

export const BADGES: Record<string, Badge> = {
  first_correct: {
    id: 'first_correct',
    name: '첫 정답!',
    description: '처음으로 정답을 맞혔어요',
    condition: '첫 exact/fuzzy 정답',
  },
  combo_5: {
    id: 'combo_5',
    name: '5연속 콤보',
    description: '연속 5문장 정답',
    condition: '5연속 정답',
  },
  combo_10: {
    id: 'combo_10',
    name: '10연속 파이어!',
    description: '연속 10문장 정답',
    condition: '10연속 정답',
  },
  combo_20: {
    id: 'combo_20',
    name: '20연속 레전드',
    description: '연속 20문장 정답 — 환상적',
    condition: '20연속 정답',
  },
  session_complete: {
    id: 'session_complete',
    name: '세션 완주',
    description: '한 세션 50문장을 모두 마침',
    condition: '세션 종료',
  },
  rank_s: {
    id: 'rank_s',
    name: 'S랭크 달성',
    description: '세션 정확도 95% 이상',
    condition: 'S랭크',
  },
  streak_7: {
    id: 'streak_7',
    name: '7일 연속 학습',
    description: '일주일 매일 학습',
    condition: '7일 streak',
  },
  sentences_100: {
    id: 'sentences_100',
    name: '100문장 달성',
    description: '누적 100문장 학습',
    condition: '누적 100문장',
  },
  challenge_first: {
    id: 'challenge_first',
    name: '첫 도전 정복',
    description: '도전 문장 첫 정답',
    condition: 'challenge tier 첫 정답',
  },
};

export const XP_PER_LEVEL = [0, 100, 250, 500, 1000, 1800, 3000, 4800, 7500, 11000, 16000];

/** 레벨 계산 — 누적 XP 기준. */
export function levelFromXp(totalXp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPct: number;
} {
  let level = 1;
  for (let i = 0; i < XP_PER_LEVEL.length; i++) {
    if (totalXp >= XP_PER_LEVEL[i]) level = i + 1;
  }
  const currentLevelStart = XP_PER_LEVEL[level - 1] ?? 0;
  const nextLevelStart = XP_PER_LEVEL[level] ?? XP_PER_LEVEL[XP_PER_LEVEL.length - 1] + 5000;
  const currentLevelXp = totalXp - currentLevelStart;
  const span = nextLevelStart - currentLevelStart;
  const nextLevelXp = span - currentLevelXp;
  const progressPct = span > 0 ? Math.round((currentLevelXp / span) * 100) : 100;
  return { level, currentLevelXp, nextLevelXp, progressPct };
}

/** 콤보 레벨 — 0/3/5/7/10/15/20 기반. */
export function comboLevel(combo: number): number {
  if (combo >= 20) return 6;
  if (combo >= 15) return 5;
  if (combo >= 10) return 4;
  if (combo >= 7) return 3;
  if (combo >= 5) return 2;
  if (combo >= 3) return 1;
  return 0;
}

/** 콤보 보너스 XP. */
export function comboBonus(combo: number): number {
  const lvl = comboLevel(combo);
  return lvl * 5; // 1=5, 2=10, 3=15, 4=20, 5=25, 6=30
}

/** tier 보너스 XP 배수. */
export function tierMultiplier(tier?: DifficultyTier): number {
  if (tier === 'challenge') return 1.5;
  if (tier === 'easy') return 0.8;
  return 1;
}

/** trial별 보상 계산. */
export function computeTrialReward(
  evalResult: SessionEvaluateResult,
  ctx: RewardContext,
  prevTotalXp: number,
  earnedBadges: Set<string>
): TrialReward {
  const baseXpMap: Record<string, number> = {
    exact: 20,
    fuzzy: 12,
    wrong: 2,
    skipped: 0,
  };
  const baseXp = Math.round(baseXpMap[evalResult.match] ?? 0 * tierMultiplier(ctx.tier));
  const cBonus = evalResult.match === 'exact' || evalResult.match === 'fuzzy' ? comboBonus(ctx.combo) : 0;
  const tierBonus = Math.round(baseXp * (tierMultiplier(ctx.tier) - 1));

  const totalXp = baseXp + cBonus + tierBonus;
  const newTotalXp = prevTotalXp + totalXp;

  // 레벨업 체크
  const before = levelFromXp(prevTotalXp).level;
  const after = levelFromXp(newTotalXp).level;
  const leveledUp = after > before;

  // 배지 — trial 기반
  const newBadges: Badge[] = [];
  const tryBadge = (id: string, cond: boolean) => {
    if (cond && !earnedBadges.has(id)) {
      earnedBadges.add(id);
      newBadges.push({ ...BADGES[id], earnedAt: new Date().toISOString() });
    }
  };

  if (evalResult.match === 'exact' || evalResult.match === 'fuzzy') {
    tryBadge('first_correct', ctx.isFirstCorrect === true || true);
    tryBadge('combo_5', ctx.combo >= 5);
    tryBadge('combo_10', ctx.combo >= 10);
    tryBadge('combo_20', ctx.combo >= 20);
    if (ctx.tier === 'challenge') tryBadge('challenge_first', true);
  }

  // 피드백 메시지
  let feedback = '';
  if (evalResult.match === 'exact') feedback = '완벽해요! 🎯';
  else if (evalResult.match === 'fuzzy') feedback = '거의 맞았어요. 원래 표현을 들어보세요.';
  else if (evalResult.match === 'wrong') feedback = '틀렸어도 괜찮아요. 원래 표현을 들으면서 익혀요.';
  else feedback = '스킵. 다음에 다시 도전!';

  if (cBonus > 0) feedback += ` +${cBonus}XP 콤보보너스!`;
  if (ctx.tier === 'challenge' && (evalResult.match === 'exact' || evalResult.match === 'fuzzy')) {
    feedback += ' 🔥 도전 정복!';
  }
  if (leveledUp) feedback += ` ⭐ 레벨 ${after} 달성!`;

  return {
    baseXp,
    comboBonus: cBonus,
    tierBonus,
    totalXp,
    comboLevel: comboLevel(ctx.combo),
    leveledUp,
    newLevel: leveledUp ? after : undefined,
    newBadges,
    feedback,
  };
}

/**
 * 세션 완료 보상 — SessionComplete 화면용.
 */
export interface SessionCompletionRewards {
  completionXp: number;
  rankXp: number;
  totalXp: number;
  badges: Badge[];
}

export function computeSessionCompletionRewards(
  summary: {
    rank: string;
    total: number;
    answered?: number;
    correct: number;
    fuzzy: number;
    fullyComplete?: boolean;
  },
  earnedBadges: Set<string>
): SessionCompletionRewards {
  const answered =
    summary.answered ?? summary.correct + summary.fuzzy;
  const fullyComplete =
    summary.fullyComplete ?? (summary.total > 0 && answered >= summary.total);
  // 완주 보너스는 전부 끝냈을 때만. 조기 종료는 응답 수만큼만.
  const completionXp = fullyComplete ? summary.total * 5 : Math.max(0, answered) * 2;
  const rankXpMap: Record<string, number> = { S: 200, A: 120, B: 70, C: 30, D: 10 };
  const rankXp = fullyComplete ? (rankXpMap[summary.rank] ?? 10) : 0;
  const totalXp = completionXp + rankXp;

  const badges: Badge[] = [];
  const tryBadge = (id: string, cond: boolean) => {
    if (cond && !earnedBadges.has(id)) {
      earnedBadges.add(id);
      badges.push({ ...BADGES[id], earnedAt: new Date().toISOString() });
    }
  };
  tryBadge('session_complete', fullyComplete);
  tryBadge('rank_s', fullyComplete && summary.rank === 'S');

  return { completionXp, rankXp, totalXp, badges };
}
