/**
 * Evaluator — 채점 교체 가능한 평가자 추상화.
 * 현재: FuzzyEvaluator (규칙 기반, 사소한 부정합 허용)
 * 이후: AIEvaluator (Claude/GPT 피드백), CompositeEvaluator (조합)
 */
export type MatchLevel = 'exact' | 'fuzzy' | 'wrong';

export interface MatchContext {
  /** 관대함 수준: 0=엄격, 1=초보자(유치원생), 2=일반 관대 */
  leniency?: number;
  /** 허용할 차이 종류 */
  allowArticle?: boolean;
  allowPreposition?: boolean;
  allowPlural?: boolean;
  /** 정답으로 인식할 변형 */
  acceptedVariants?: string[];
}

export interface MatchResult {
  level: MatchLevel;
  score: number; // 0-1
  feedback: string;
  canonicalTTS?: string; // 원래 표현 (TTS로 들려줄)
  diff?: {
    userText: string;
    expectedText: string;
    changes: string[];
  };
}

export interface Evaluator {
  match(input: string, expected: string, context?: MatchContext): MatchResult;
}
