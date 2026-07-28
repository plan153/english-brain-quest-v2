/**
 * ContentItem — 콘텐츠 타입 통일.
 * 현재: type='sentence'만 구현
 * 이후: dialogue(대화), passage(글), pattern(문법 패턴), word(단어 카드)
 */
export type ContentItemType =
  | 'sentence'
  | 'dialogue'
  | 'passage'
  | 'word'
  | 'pattern';

export interface SentenceExpression {
  en: string;
  translations: { [lang: string]: string };
  patternId?: string;
  nounIds?: string[];
  chunks?: string[];
  hints?: string[];
  contrast?: { en: string; ko: string }[];
}

export interface Dialogue {
  context: string;
  continuation?: string;
  sampleAnswers?: string[];
  cue?: string;
  topic?: string;
}

export interface Passage {
  question: string;
  structure: { slot: string; cue: string; example: string }[];
  targetSentences: number;
  category?: string;
}

export interface WordCard {
  word: string;
  partOfSpeech: string;
  meaning: { [lang: string]: string };
  examples?: string[];
}

export interface PatternCard {
  pattern: string;
  example: string;
  concept?: string;
  contrast?: { direct: string; polite: string };
}

export type ContentItemData =
  | SentenceExpression
  | Dialogue
  | Passage
  | WordCard
  | PatternCard;

export interface ContentItem {
  id: string;
  type: ContentItemType;
  data: ContentItemData;
  translations: { [lang: string]: string };
  tags: string[];
  form?: 'statement' | 'question' | 'negative' | 'shortAnswer' | 'command';
  level?: number;
  packId?: string;
  /** 연습 난이도 밴드 (placement 문항 등) */
  practiceBand?: 'L1' | 'L2' | 'L3' | 'L4';
}
