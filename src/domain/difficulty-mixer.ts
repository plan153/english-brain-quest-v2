/**
 * difficulty-mixer.ts — Phase 2 동적 난이도 분배.
 *
 * 핵심 설계:
 *  - 10/80/10 비율 (easy/normal/challenge) — 도전 의식 + 실력 맞춤
 *  - 다축 스킬 모델: form / function / pattern / situation / nuance / tense
 *  - 사용자 약점 축이 낮으면 → 그 축 문장은 쉬운 비율 ↑, 도전 비율 ↓
 *  - 실력이 올라가면 → 도전 비율 ↑, 쉬운 비율 ↓ (점진적 강화)
 *  - Phase 2에서는 정적 비율 + 간단한 가중치. Phase 3에서는 실측 데이터 기반.
 */
import type { ContentItem } from '../interfaces/ContentItem';

/** 6축 스킬 — BrainMap과 연동 */
export type SkillAxis = 'form' | 'function' | 'pattern' | 'situation' | 'nuance' | 'tense';

export type SkillProfile = Record<SkillAxis, number>; // 0-100

export const DEFAULT_SKILL_PROFILE: SkillProfile = {
  form: 0,
  function: 0,
  pattern: 0,
  situation: 0,
  nuance: 0,
  tense: 0,
};

export interface DifficultyMixOptions {
  /** 도전 비율 (기본 0.1 = 10%) */
  challengeRatio?: number;
  /** 쉬운 비율 (기본 0.1 = 10%) */
  easyRatio?: number;
  /** 사용자 스킬 프로필 — 약점이 반영됨 */
  skill?: SkillProfile;
  /** 셔플 여부 (기본 true) */
  shuffle?: boolean;
  /** 난이도 태그를 품은 ContentItem 필드 (item.level 사용) */
  /**
   * 우선 노출할 동사 집합 (item.tags의 `verb:xxx`와 매칭, 소문자).
   * 다른 동사를 배제하지 않고 셔플 시 더 앞쪽에 오도록 가중치만 준다.
   */
  priorityVerbs?: Set<string>;
  /** priorityVerbs 항목의 가중치 배수 (기본 3) */
  priorityWeight?: number;
}

export type DifficultyTier = 'easy' | 'normal' | 'challenge';

export interface MixedItem {
  item: ContentItem;
  tier: DifficultyTier;
  /** 이 문장이 도전인 이유 (어떤 축이 약해서/강해서) */
  rationale?: SkillAxis;
}

/**
 * ContentItem의 난이도 점수 추정 — item.level + 약점 축 가중치.
 * Phase 2에서는 item.level(1-3) 기반 단순 추정. Phase 3에서는 메타데이터 기반.
 */
export function estimateDifficulty(
  item: ContentItem,
  skill: SkillProfile
): { tier: DifficultyTier; rationale?: SkillAxis } {
  const level = item.level ?? 1;
  // 약점 축 점수 평균 — Phase 2에서는 item.level 만으로 추정.
  // 난이도 1 → easy, 2 → normal, 3+ → challenge (스킬 50 미만일 때만)
  // 스킬이 높으면 한 단계 낮춤.
  const avgSkill = Object.values(skill).reduce((a, b) => a + b, 0) / 6;

  if (level >= 3 && avgSkill < 60) return { tier: 'challenge', rationale: 'pattern' };
  if (level <= 1 && avgSkill < 30) return { tier: 'easy', rationale: 'form' };
  if (level >= 3 && avgSkill >= 70) return { tier: 'normal' };
  return { tier: 'normal' };
}

/**
 * 피셔-예이츠 셔플 — 결정론적이지 않은 섞기.
 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 가중 셔플 (Efraimidis-Spirakis) — weight가 높을수록 앞쪽에 뽑힐 확률이 높아질 뿐,
 * weight가 낮은 항목도 항상 포함된다 (배제 없이 노출 빈도만 조절).
 */
function weightedShuffle<T>(arr: T[], weightOf: (item: T) => number): T[] {
  return arr
    .map((item) => ({ item, key: Math.random() ** (1 / Math.max(weightOf(item), 0.0001)) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.item);
}

function itemVerb(item: ContentItem): string | undefined {
  return item.tags?.find((t) => t.startsWith('verb:'))?.slice('verb:'.length);
}

/**
 * 메인 믹서 — 10/80/10 비율로 tier 분배.
 * 1. 전체에 estimateDifficulty 적용
 * 2. 원하는 비율만큼 challenge / easy 선택
 * 3. 나머지는 normal
 * 4. 셔플 (기본)
 * 5. tier 가 부족하면 normal 로 채움 (안전 폴백)
 */
export function mixDifficulty(
  items: ContentItem[],
  options: DifficultyMixOptions = {}
): MixedItem[] {
  const challengeRatio = options.challengeRatio ?? 0.1;
  const easyRatio = options.easyRatio ?? 0.1;
  const skill = options.skill ?? DEFAULT_SKILL_PROFILE;
  const doShuffle = options.shuffle ?? true;

  const total = items.length;
  const targetChallenge = Math.max(1, Math.round(total * challengeRatio));
  const targetEasy = Math.max(1, Math.round(total * easyRatio));

  // 각 아이템의 tier 추정
  const tagged = items.map((item) => {
    const { tier, rationale } = estimateDifficulty(item, skill);
    return { item, tier, rationale };
  });

  // tier별 분류
  const challenges = tagged.filter((t) => t.tier === 'challenge');
  const easies = tagged.filter((t) => t.tier === 'easy');
  const normals = tagged.filter((t) => t.tier === 'normal');

  // 타겟 수에 맞춰 선택 — 부족하면 normal에서 보충, 남는 challenge/easy는 normal로 강등
  let leftoverChallenges: typeof tagged = [];
  let leftoverEasies: typeof tagged = [];

  let pickedChallenges: typeof tagged;
  if (challenges.length >= targetChallenge) {
    pickedChallenges = challenges.slice(0, targetChallenge);
    leftoverChallenges = challenges.slice(targetChallenge).map((t) => ({
      ...t,
      tier: 'normal' as DifficultyTier,
    }));
  } else {
    pickedChallenges = [
      ...challenges,
      ...normals.splice(0, targetChallenge - challenges.length).map((t) => ({
        ...t,
        tier: 'challenge' as DifficultyTier,
      })),
    ];
  }

  let pickedEasies: typeof tagged;
  if (easies.length >= targetEasy) {
    pickedEasies = easies.slice(0, targetEasy);
    leftoverEasies = easies.slice(targetEasy).map((t) => ({
      ...t,
      tier: 'normal' as DifficultyTier,
    }));
  } else {
    pickedEasies = [
      ...easies,
      ...normals.splice(0, targetEasy - easies.length).map((t) => ({
        ...t,
        tier: 'easy' as DifficultyTier,
      })),
    ];
  }

  const pickedNormals = [
    ...normals.map((t) => ({ ...t, tier: 'normal' as DifficultyTier })),
    ...leftoverChallenges,
    ...leftoverEasies,
  ];

  const mixed = [...pickedChallenges, ...pickedEasies, ...pickedNormals];
  if (!doShuffle) return mixed;
  if (options.priorityVerbs && options.priorityVerbs.size > 0) {
    const weight = options.priorityWeight ?? 3;
    const priorityVerbs = options.priorityVerbs;
    return weightedShuffle(mixed, (m) => {
      const verb = itemVerb(m.item);
      return verb && priorityVerbs.has(verb) ? weight : 1;
    });
  }
  return shuffle(mixed);
}

/**
 * 비율 검증 — 10/80/10 근사인지 확인 (Phase 2 검증/디버그용).
 */
export function verifyMixRatio(mixed: MixedItem[]): {
  challenge: number;
  easy: number;
  normal: number;
  total: number;
  challengePct: number;
  easyPct: number;
  normalPct: number;
} {
  const total = mixed.length;
  const challenge = mixed.filter((m) => m.tier === 'challenge').length;
  const easy = mixed.filter((m) => m.tier === 'easy').length;
  const normal = mixed.filter((m) => m.tier === 'normal').length;
  return {
    challenge,
    easy,
    normal,
    total,
    challengePct: total > 0 ? Math.round((challenge / total) * 100) : 0,
    easyPct: total > 0 ? Math.round((easy / total) * 100) : 0,
    normalPct: total > 0 ? Math.round((normal / total) * 100) : 0,
  };
}

/**
 * 스킬 프로필 업데이트 — trial 결과로 축별 숙련도 가감.
 * Phase 2에서는 일괄 증가. Phase 3에서는 축별 메타데이터 기반 정밀 분배.
 */
export function updateSkill(
  skill: SkillProfile,
  axis: SkillAxis,
  correct: boolean,
  delta = 2
): SkillProfile {
  const current = skill[axis];
  const next = correct
    ? Math.min(100, current + delta)
    : Math.max(0, current - Math.ceil(delta / 2));
  return { ...skill, [axis]: next };
}
