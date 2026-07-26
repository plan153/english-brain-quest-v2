/**
 * session-engine.ts — Phase 2 게임성 세션 엔진.
 *
 * 핵심 설계:
 *  - 한 세션 = 50문장(Phase 2 기준). 모드별로 크기 조정 가능.
 *  - 난이도 믹서가 섞은 문장 큐를 반환(SessionPlan).
 *  - 세션 진행 중 티트/콤보/스킵/종료 상태 관리.
 *  - 평가 결과를 받아 보상 엔진(reward-engine)과 연동.
 *
 * SessionMode 인터페이스 기반 — 모드 교체 가능.
 */
import type { ContentItem, SentenceExpression } from '../interfaces/ContentItem';
import type {
  SessionModeType,
  SessionStimulus,
  SessionResponse,
  SessionEvaluateResult,
} from '../interfaces/SessionMode';
import type { MatchLevel } from '../interfaces/Evaluator';

export interface SessionSentence {
  id: string;
  en: string;
  ko: string;
  chunks?: string[];
  hints?: string[];
  level?: number;
  /** 도전 분류: 'easy' | 'normal' | 'challenge' (10/80/10 비율) */
  difficulty?: 'easy' | 'normal' | 'challenge';
  /** 세션 내 인덱스 (0-base) */
  order?: number;
}

export interface SessionPlan {
  sentences: SessionSentence[];
  total: number;
  challengeCount: number;
  normalCount: number;
  easyCount: number;
  mode: SessionModeType;
}

export interface SessionProgress {
  index: number; // 현재 커서 (0-base)
  completed: number;
  correct: number;
  fuzzy: number;
  wrong: number;
  skipped: number;
  combo: number;
  maxCombo: number;
  xpEarned: number;
  finished: boolean;
}

export interface TrialResult {
  sentence: SessionSentence;
  response: SessionResponse;
  evaluation: SessionEvaluateResult;
  xpDelta: number;
  comboDelta: number;
}

export const INITIAL_PROGRESS: SessionProgress = {
  index: 0,
  completed: 0,
  correct: 0,
  fuzzy: 0,
  wrong: 0,
  skipped: 0,
  combo: 0,
  maxCombo: 0,
  xpEarned: 0,
  finished: false,
};

export const DEFAULT_SESSION_SIZE = 50;
export const DEFAULT_CHALLENGE_RATIO = 0.1; // 10% 도전
export const DEFAULT_EASY_RATIO = 0.1; // 10% 쉬운

/**
 * ContentItem → SessionSentence 변환.
 * type='sentence'만 처리. 다른 타입은 Phase 3+ 에서 지원.
 */
export function toSessionSentence(item: ContentItem): SessionSentence {
  const data = item.data as SentenceExpression;
  return {
    id: item.id,
    en: data.en,
    ko: item.translations?.ko ?? '',
    chunks: data.chunks,
    hints: data.hints,
    level: item.level,
  };
}

/**
 * TranslateMode 발표 — 한국어 먼저 보고 영어로 말하기 (핵심 학습 모델).
 */
export function presentTranslate(sentence: SessionSentence): SessionStimulus {
  return {
    type: 'cue',
    payload: sentence.ko,
    lang: 'ko',
  };
}

/**
 * ListenSpeakMode 발표 — 영어 듣고 따라 말하기.
 */
export function presentListenSpeak(sentence: SessionSentence): SessionStimulus {
  return {
    type: 'audio',
    payload: sentence.en,
    lang: 'en',
  };
}

/**
 * 평가 — FuzzyMatch 결과를 SessionEvaluateResult로 변환.
 * 실제 FuzzyMatch 호출은 TodayScreen/상위에서 수행해 음성 인식 결과를 response.text로 전달.
 */
export function evaluateResponse(
  response: SessionResponse,
  _expected: string,
  matchLevel: MatchLevel,
  feedback: string,
  canonicalTTS: string
): SessionEvaluateResult {
  if (response.skipped) {
    return {
      match: 'skipped',
      score: 0,
      feedback: '스킵했어요. 다음에 다시!',
      ttsContent: canonicalTTS,
    };
  }
  const match: SessionEvaluateResult['match'] = matchLevel;
  const scoreMap: Record<MatchLevel, number> = {
    exact: 1,
    fuzzy: 0.7,
    wrong: 0.2,
  };
  return {
    match,
    score: scoreMap[matchLevel],
    feedback,
    ttsContent: canonicalTTS,
  };
}

/**
 * 세션 생성 — 콘텐츠 로드 후 난이도 믹서가 섞은 큐 반환.
 */
export function createSession(
  items: ContentItem[],
  options: {
    mode?: SessionModeType;
    size?: number;
    challengeRatio?: number;
    easyRatio?: number;
  } = {}
): SessionPlan {
  const mode = options.mode ?? 'translate';
  const size = Math.min(options.size ?? DEFAULT_SESSION_SIZE, items.length);
  const challengeRatio = options.challengeRatio ?? DEFAULT_CHALLENGE_RATIO;
  const easyRatio = options.easyRatio ?? DEFAULT_EASY_RATIO;

  const sentences = items.slice(0, size).map(toSessionSentence);

  // 난이도 분배 — 인덱스 기반으로 10/80/10 근사.
  const challengeCount = Math.max(1, Math.round(size * challengeRatio));
  const easyCount = Math.max(1, Math.round(size * easyRatio));
  const normalCount = size - challengeCount - easyCount;

  // 균등 간격으로 도전/쉬운 삽입 (매 10번째에 도전, 매 5번째에 쉬운 겹침 회피용 단순 패턴).
  // Phase 2에서는 정적 패턴, Phase 3+ 에서는 다축 스킬 기반 동적 분배.
  const filled = sentences.map((s, i) => {
    let difficulty: SessionSentence['difficulty'] = 'normal';
    // 도전: 끝쪽 10% + 중간에 간격 배치
    if (i >= size - challengeCount) difficulty = 'challenge';
    // 쉬운: 앞쪽 10%
    else if (i < easyCount) difficulty = 'easy';
    return { ...s, difficulty, order: i };
  });

  return {
    sentences: filled,
    total: size,
    challengeCount,
    normalCount,
    easyCount,
    mode,
  };
}

/**
 * 세션 진행 — 한 trial 결과를 받아 progress 갱신.
 */
export function advance(progress: SessionProgress, trial: TrialResult): SessionProgress {
  const next: SessionProgress = { ...progress };
  next.completed += 1;

  switch (trial.evaluation.match) {
    case 'exact':
      next.correct += 1;
      next.combo += 1;
      next.maxCombo = Math.max(next.maxCombo, next.combo);
      break;
    case 'fuzzy':
      next.fuzzy += 1;
      next.combo += 1;
      next.maxCombo = Math.max(next.maxCombo, next.combo);
      break;
    case 'wrong':
      next.wrong += 1;
      next.combo = 0;
      break;
    case 'skipped':
      next.skipped += 1;
      next.combo = 0;
      break;
  }

  next.xpEarned += trial.xpDelta;
  next.index = progress.index + 1;
  next.finished = next.index >= trial.sentence.order! + 1 && next.completed >= next.index;

  // 세션 종료 판정: completed 가 total 에 도달.
  if (next.completed >= next.index) {
    // 마지막 trial 인 경우는 상위에서 endSession 으로 finished=true 처리.
  }
  return next;
}

/**
 * 세션 종료 판정 — 커서가 total 에 도달하면 finished.
 */
export function isSessionComplete(progress: SessionProgress, total: number): boolean {
  return progress.index >= total;
}

/**
 * 세션 통계 요약 — SessionComplete 화면용.
 */
export interface SessionSummary {
  total: number;
  correct: number;
  fuzzy: number;
  wrong: number;
  skipped: number;
  accuracy: number; // (correct + fuzzy*0.5) / total
  maxCombo: number;
  xpEarned: number;
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
}

export function summarizeSession(progress: SessionProgress, total: number): SessionSummary {
  const weighted = progress.correct + progress.fuzzy * 0.5;
  const accuracy = total > 0 ? weighted / total : 0;
  let rank: SessionSummary['rank'] = 'D';
  if (accuracy >= 0.95) rank = 'S';
  else if (accuracy >= 0.85) rank = 'A';
  else if (accuracy >= 0.7) rank = 'B';
  else if (accuracy >= 0.5) rank = 'C';
  return {
    total,
    correct: progress.correct,
    fuzzy: progress.fuzzy,
    wrong: progress.wrong,
    skipped: progress.skipped,
    accuracy: Math.round(accuracy * 100),
    maxCombo: progress.maxCombo,
    xpEarned: progress.xpEarned,
    rank,
  };
}
