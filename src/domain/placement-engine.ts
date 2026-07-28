/**
 * placement-engine — 짧은 난이도 진단으로 연습 밴드 추천.
 * 시험이 아니라 "적당 구간"을 찾기 위한 사다리.
 */
import type { ContentItem } from '../interfaces/ContentItem';
import {
  LEARNER_LEVELS,
  LEARNER_LEVEL_META,
  type LearnerLevel,
  bandFromIndex,
  bandIndex,
} from './learner-level';
import FuzzyMatch from './fuzzy-match';

export interface PlacementItem {
  id: string;
  band: LearnerLevel;
  en: string;
  ko: string;
}

export interface PlacementTrial {
  itemId: string;
  band: LearnerLevel;
  pass: boolean;
  match: 'exact' | 'fuzzy' | 'wrong';
}

export interface PlacementResult {
  recommended: LearnerLevel;
  trials: PlacementTrial[];
  passByBand: Record<LearnerLevel, { pass: number; total: number }>;
  summary: string;
}

/** 사다리 문항 — L1→L4, 밴드당 3문항 */
export const PLACEMENT_ITEMS: PlacementItem[] = [
  { id: 'place-l1-01', band: 'L1', en: 'I get it.', ko: '알겠어요.' },
  { id: 'place-l1-02', band: 'L1', en: 'Go home.', ko: '집에 가세요.' },
  { id: 'place-l1-03', band: 'L1', en: 'I need some time.', ko: '시간이 좀 필요해요.' },
  { id: 'place-l2-01', band: 'L2', en: 'Have a look at this.', ko: '이거 한번 봐요.' },
  { id: 'place-l2-02', band: 'L2', en: 'Take a break.', ko: '잠깐 쉬어요.' },
  { id: 'place-l2-03', band: 'L2', en: 'Give me a minute.', ko: '1분만 주세요.' },
  { id: 'place-l3-01', band: 'L3', en: 'Can you look into it?', ko: '그것 좀 알아볼 수 있어요?' },
  { id: 'place-l3-02', band: 'L3', en: 'I was about to leave.', ko: '막 나가려던 참이었어요.' },
  { id: 'place-l3-03', band: 'L3', en: "Let's go over the plan.", ko: '(같이) 계획을 검토해요.' },
  { id: 'place-l4-01', band: 'L4', en: 'Would you mind waiting a bit?', ko: '잠깐만 기다려 주시겠어요?' },
  { id: 'place-l4-02', band: 'L4', en: "I'm afraid I can't make it today.", ko: '오늘은 못 갈 것 같아요.' },
  { id: 'place-l4-03', band: 'L4', en: "I'd rather talk about it later.", ko: '그건 나중에 이야기하는 게 좋겠어요.' },
];

export function getPlacementItems(): PlacementItem[] {
  return [...PLACEMENT_ITEMS];
}

export function placementItemToContent(item: PlacementItem): ContentItem {
  return {
    id: item.id,
    type: 'sentence',
    data: { en: item.en, translations: { ko: item.ko } },
    translations: { ko: item.ko },
    tags: ['placement', `band:${item.band}`],
    form: 'statement',
    level: bandIndex(item.band) + 1,
    packId: 'placement',
    practiceBand: item.band,
  };
}

export function scorePlacementAnswer(
  guess: string,
  expectedEn: string
): { pass: boolean; match: 'exact' | 'fuzzy' | 'wrong' } {
  const matched = FuzzyMatch.matchAnswer(guess, expectedEn, { leniency: 1 });
  const level = matched.level as 'exact' | 'fuzzy' | 'wrong';
  return {
    pass: level === 'exact' || level === 'fuzzy',
    match: level,
  };
}

/**
 * 밴드별 통과율로 추천.
 * - 통과율 ≥ 50% 인 최고 밴드
 * - 상위 밴드에서 일부 통과하면 한 단계 상향 여지
 */
export function recommendPracticeBand(trials: PlacementTrial[]): PlacementResult {
  const passByBand = Object.fromEntries(
    LEARNER_LEVELS.map((b) => [b, { pass: 0, total: 0 }])
  ) as Record<LearnerLevel, { pass: number; total: number }>;

  for (const t of trials) {
    passByBand[t.band].total += 1;
    if (t.pass) passByBand[t.band].pass += 1;
  }

  let recommended: LearnerLevel = 'L1';
  for (const band of LEARNER_LEVELS) {
    const { pass, total } = passByBand[band];
    if (total === 0) continue;
    if (pass / total >= 0.5) recommended = band;
    else break;
  }

  const next = bandFromIndex(bandIndex(recommended) + 1);
  if (next !== recommended) {
    const { pass, total } = passByBand[next];
    if (total > 0 && pass / total >= 0.34 && pass >= 1) {
      recommended = next;
    }
  }

  const meta = LEARNER_LEVEL_META[recommended];
  return {
    recommended,
    trials,
    passByBand,
    summary: `지금 연습은 「${meta.name}」구간이 적당해 보여요. 너무 쉽거나 어려우면 언제든 조절할 수 있어요.`,
  };
}

/** 같은 밴드 연속 2회 실패 → 상위 밴드 생략 */
export function shouldStopClimbing(trials: PlacementTrial[]): boolean {
  if (trials.length < 2) return false;
  const last = trials[trials.length - 1]!;
  const prev = trials[trials.length - 2]!;
  return last.band === prev.band && !last.pass && !prev.pass;
}

/** 조기 종료 시 남은 상위 문항 스킵한 목록으로 결과 산출 */
export function finalizePlacement(trials: PlacementTrial[]): PlacementResult {
  return recommendPracticeBand(trials);
}
