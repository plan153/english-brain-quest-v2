/**
 * 연습 난이도(LearnerLevel) — RPG XP 레벨과 별개.
 * UI에서는 L1~L4보다 "지금 연습 난이도"로 안내하고,
 * 출제·믹스 비율을 맞춰 지루함/좌절을 줄인다.
 */
import type { ContentItem } from '../interfaces/ContentItem';

export type LearnerLevel = 'L1' | 'L2' | 'L3' | 'L4';

export type PracticeBandSource = 'placement' | 'manual' | 'auto';

export interface LearnerLevelMeta {
  id: LearnerLevel;
  name: string;
  oneLiner: string;
  comfortHint: string;
}

export const LEARNER_LEVELS: LearnerLevel[] = ['L1', 'L2', 'L3', 'L4'];

export const LEARNER_LEVEL_META: Record<LearnerLevel, LearnerLevelMeta> = {
  L1: {
    id: 'L1',
    name: '입문',
    oneLiner: '짧은 일상 한 문장을 듣고 따라 말해요.',
    comfortHint: '기본 주어·동사, 아주 짧은 문장 위주',
  },
  L2: {
    id: 'L2',
    name: '초급',
    oneLiner: '자주 쓰는 덩어리 표현을 말로 꺼냅니다.',
    comfortHint: '명령문, have/take/make + 명사 표현',
  },
  L3: {
    id: 'L3',
    name: '초중급',
    oneLiner: '힌트 없이 말하고, 시제·구동사를 섞어 씁니다.',
    comfortHint: '구동사, 시제, 상황 문장',
  },
  L4: {
    id: 'L4',
    name: '중급+',
    oneLiner: '뉘앙스·완곡한 표현까지 상황에 맞게 고릅니다.',
    comfortHint: '긴 구, 뉘앙스, 도전 비율을 조금 높임',
  },
};

/** 세션 믹스 비율 — band별 easy/challenge (나머지는 normal). 도전 비중을 조금 높임. */
export function mixRatiosForBand(band: LearnerLevel): {
  easyRatio: number;
  challengeRatio: number;
} {
  switch (band) {
    case 'L1':
      return { easyRatio: 0.12, challengeRatio: 0.14 };
    case 'L2':
      return { easyRatio: 0.08, challengeRatio: 0.2 };
    case 'L3':
      return { easyRatio: 0.05, challengeRatio: 0.25 };
    case 'L4':
      return { easyRatio: 0.03, challengeRatio: 0.3 };
  }
}

export function bandIndex(band: LearnerLevel): number {
  return LEARNER_LEVELS.indexOf(band);
}

export function bandFromIndex(i: number): LearnerLevel {
  const clamped = Math.max(0, Math.min(LEARNER_LEVELS.length - 1, i));
  return LEARNER_LEVELS[clamped]!;
}

export function nudgeBand(band: LearnerLevel, delta: -1 | 1): LearnerLevel {
  return bandFromIndex(bandIndex(band) + delta);
}

function itemEn(item: ContentItem): string {
  const data = item.data as { en?: string } | undefined;
  return String(data?.en ?? '').trim();
}

/** 콘텐츠 메타로 대략적 밴드 추정 (명시 band 없을 때) */
export function inferItemBand(item: ContentItem): LearnerLevel {
  if (item.practiceBand && LEARNER_LEVELS.includes(item.practiceBand)) {
    return item.practiceBand;
  }

  const pack = String(item.packId ?? '');
  const level = item.level ?? 1;
  const words = itemEn(item).split(/\s+/).filter(Boolean).length;

  if (pack.includes('phrasal')) {
    return level >= 3 || words >= 8 ? 'L4' : 'L3';
  }
  if (pack.startsWith('grammar') || /unit/i.test(pack)) {
    if (level >= 3) return 'L4';
    if (level >= 2) return 'L3';
    return 'L2';
  }
  if (pack.includes('collocation')) {
    return words >= 8 ? 'L3' : 'L2';
  }
  // starter / review / weak
  if (words <= 4 && level <= 1) return 'L1';
  if (words <= 7) return 'L2';
  if (level >= 3 || words >= 10) return 'L4';
  return 'L3';
}

/** 연습 밴드 — 같은 구간 + 한 단계 위 위주 (아래 구간은 L4만 예외로 허용) */
export function allowedBandsFor(practice: LearnerLevel): Set<LearnerLevel> {
  const i = bandIndex(practice);
  if (i >= 3) {
    return new Set(['L3', 'L4']);
  }
  return new Set([LEARNER_LEVELS[i]!, LEARNER_LEVELS[i + 1]!]);
}

/**
 * 새 문장 풀 필터. weak/review/pattern 팩은 건너뛰고 그대로 둠.
 */
export function filterItemsForPracticeBand(
  items: ContentItem[],
  practice: LearnerLevel | null | undefined,
  options: { packId?: string } = {}
): ContentItem[] {
  if (!practice || items.length === 0) return items;
  const pack = options.packId ?? '';
  if (pack === 'weak' || pack === 'review' || pack === 'pattern') return items;

  const allowed = allowedBandsFor(practice);
  const preferred = items.filter((it) => allowed.has(inferItemBand(it)));
  if (preferred.length >= Math.min(8, items.length)) return preferred;

  // 부족하면 같은 pack 전체로 폴백 (믹서 비율로 보완)
  return items;
}

export function practiceBandLabel(band: LearnerLevel): string {
  const m = LEARNER_LEVEL_META[band];
  return `${m.name} · ${m.oneLiner}`;
}

export function recommendCopy(band: LearnerLevel): string {
  const m = LEARNER_LEVEL_META[band];
  return `「${m.name}」구간으로 연습해 볼까요? 조금 도전적이어야 실력이 붙어요.`;
}
