/**
 * content-loader.ts — 콘텐츠 팩별 지연 로딩.
 * 그래머인유즈 식으로 무한 확장 가능. 새 JSON 파일 추가 시 index.json만 갱신하면 됨.
 *
 * Phase 1에서는 동적 import()로 빌드 시점에 청크 분할.
 */
import type { PackIndex, GrammarUnitPack } from '../interfaces/CurriculumPack';
import type { ContentItem } from '../interfaces/ContentItem';

const CANON_BASE = '/data/canon';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${CANON_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// 캐시 (인메모리)
const cache = new Map<string, unknown>();

/** Starter expressions 팩 (154 표현) 로드 */
export async function loadStarterPack(): Promise<ContentItem[]> {
  if (cache.has('pack-starter')) {
    return cache.get('pack-starter') as ContentItem[];
  }
  const raw = await fetchJson<RawExpression[]>('/expressions/pack-starter.json');
  const items: ContentItem[] = raw.map((e) => ({
    id: e.id,
    type: 'sentence',
    data: {
      en: e.en,
      translations: { ko: e.ko },
      patternId: e.patternId,
      nounIds: e.nounIds,
      chunks: e.chunks,
      hints: e.hints,
      contrast: e.contrast,
    },
    translations: { ko: e.ko },
    tags: [`level:${e.level ?? 1}`],
    form: 'statement',
    level: e.level,
    packId: 'pack-starter',
  }));
  cache.set('pack-starter', items);
  return items;
}

/** 코로케이션 카탈로그 (50개) 로드 */
export async function loadCollocations(): Promise<Collocation[]> {
  if (cache.has('collocations')) {
    return cache.get('collocations') as Collocation[];
  }
  const raw = await fetchJson<{ collocations: Collocation[] }>('/collocations/catalog.json');
  cache.set('collocations', raw.collocations);
  return raw.collocations;
}

/** 구동사 (50개) 로드 */
export async function loadPhrasalVerbs(): Promise<PhrasalVerb[]> {
  if (cache.has('phrasal-verbs')) {
    return cache.get('phrasal-verbs') as PhrasalVerb[];
  }
  const raw = await fetchJson<{ items: PhrasalVerb[] }>('/phrasal-verbs/stages.json');
  cache.set('phrasal-verbs', raw.items);
  return raw.items;
}

/** 문법 유닛 인덱스 로드 */
export async function loadGrammarIndex(): Promise<GrammarUnitIndexEntry[]> {
  if (cache.has('grammar-index')) {
    return cache.get('grammar-index') as GrammarUnitIndexEntry[];
  }
  const raw = await fetchJson<{ units: GrammarUnitIndexEntry[] }>('/grammar/index.json');
  cache.set('grammar-index', raw.units);
  return raw.units;
}

/** 특정 문법 유닛 로드 (지연) */
export async function loadGrammarUnit(unitId: string): Promise<GrammarUnitPack> {
  if (cache.has(`grammar:${unitId}`)) {
    return cache.get(`grammar:${unitId}`) as GrammarUnitPack;
  }
  const index = await loadGrammarIndex();
  const entry = index.find((u) => u.id === unitId);
  if (!entry) {
    throw new Error(`Grammar unit ${unitId} not found in index`);
  }
  const unit = await fetchJson<GrammarUnitPack>(`/grammar/${entry.file}`);
  cache.set(`grammar:${unitId}`, unit);
  return unit;
}

/** 모든 팩 인덱스 로드 (확장용) */
export async function loadPackIndex(): Promise<PackIndex> {
  if (cache.has('pack-index')) {
    return cache.get('pack-index') as PackIndex;
  }
  const index = await fetchJson<PackIndex>('/expressions/index.json');
  cache.set('pack-index', index);
  return index;
}

export function clearCache(): void {
  cache.clear();
}

// 원시 데이터 타입 (기존 expressions.json 호환)
interface RawExpression {
  id: string;
  en: string;
  ko: string;
  patternId?: string;
  nounIds?: string[];
  chunks?: string[];
  hints?: string[];
  contrast?: { en: string; ko: string }[];
  level?: number;
}

export interface Collocation {
  id: string;
  verb: string;
  noun: string;
  pattern: string;
  en: string;
  ko: string;
}

export interface PhrasalVerb {
  id: string;
  verb: string;
  particle: string;
  en: string;
  ko: string;
}

export interface GrammarUnitIndexEntry {
  id: string;
  unit: number;
  title: string;
  concept?: string;
  file: string;
  itemCount: number;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}