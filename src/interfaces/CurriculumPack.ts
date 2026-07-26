/**
 * CurriculumPack — 학습 팩 단위 확장.
 * 각 문법 단원/스테이지 = 1개의 CurriculumPack.
 * Phase 6에서 그래머인유즈 식으로 무한 확장.
 */
export type SkillAxis =
  | 'form' // 형태: 평서/의문/부정/명령/짧은답
  | 'function' // 기능: 말하기/듣기/영작/이해
  | 'pattern' // 패턴: 조동사/비교급/가정법/절/구
  | 'situation' // 상황: 인사/주문/사과/제안
  | 'nuance' // 뉘앙스: 직설/완곡/필러/격식
  | 'tense'; // 시간: 과거/현재/미래/완료/진행

export interface UnlockRule {
  threshold: number; // 0-1, 선행 팩 마스터율
  targetPackIds: string[];
}

export interface CurriculumPack {
  id: string;
  name: string;
  stage: number; // 학습 발전 단계 (1-12)
  series: 'starter' | 'question' | 'response' | 'flow' | 'situation' | 'nuance' | 'grammar-in-use' | 'clause' | 'tense' | 'k2e' | 'smalltalk' | 'opic' | 'custom';
  skillAxes: SkillAxis[];
  items: string[]; // ContentItem.id 참조 (지연 로딩)
  prerequisites: string[]; // 선행 팩 ID
  unlockRule?: UnlockRule;
  metadata?: {
    description?: string;
    coverImage?: string;
    estimatedMinutes?: number;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
  };
}

export interface GrammarUnitItem {
  id: string;
  type: 'sentence' | 'pattern';
  en?: string; // type='sentence'일 때
  translations?: { ko: string };
  form?: 'statement' | 'question' | 'negative' | 'imperative';
  pattern?: string; // type='pattern'일 때
  example?: string; // type='pattern'일 때
  tags?: string[];
}

export interface GrammarUnitPack extends Omit<CurriculumPack, 'items' | 'series'> {
  series: 'grammar-in-use';
  unit: number; // 단원 번호
  concept?: string; // 핵심 개념
  /** 실제 학습 아이템 (sentence + pattern 혼합). CurriculumPack.items: string[]를 오버라이드. */
  items: GrammarUnitItem[];
  exercises?: { type: string; from?: string; to?: string }[];
}

export interface PackIndex {
  version: number;
  packs: {
    id: string;
    name: string;
    stage: number;
    series: string;
    itemCount: number;
    isStarter: boolean;
    prerequisites: string[];
  }[];
}
