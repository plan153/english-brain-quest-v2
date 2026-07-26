import type { ContentItem } from './ContentItem';

/**
 * SessionMode — 학습 모드 교체 가능.
 * 현재: ListenSpeakMode, TranslateMode
 * 이후: ConversationMode, QuestionAnswerMode, WriteMode, SmallTalkMode, OPIcMode
 */
export type SessionModeType =
  | 'listen-speak'
  | 'translate'
  | 'write'
  | 'conversation'
  | 'question-answer'
  | 'smalltalk'
  | 'opic';

export interface SessionStimulus {
  type: 'audio' | 'text' | 'cue' | 'question' | 'structure';
  payload: string;
  lang?: 'en' | 'ko';
}

export interface SessionResponse {
  text?: string;
  audio?: Blob;
  skipped?: boolean;
}

export interface SessionEvaluateResult {
  match: 'exact' | 'fuzzy' | 'wrong' | 'skipped';
  score: number; // 0-1
  feedback: string;
  ttsContent?: string; // 학습자에게 들려줄 원래 표현
  detail?: Record<string, number>;
}

export interface SessionMode {
  type: SessionModeType;
  present(item: ContentItem): SessionStimulus;
  collect(): Promise<SessionResponse>;
  evaluate(
    response: SessionResponse,
    item: ContentItem,
    context?: { evaluator?: unknown }
  ): SessionEvaluateResult;
}
