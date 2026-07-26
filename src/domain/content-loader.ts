/**
 * content-loader.ts — 콘텐츠 팩별 지연 로딩.
 * 그래머인유즈 식으로 무한 확장 가능. 새 JSON 파일 추가 시 index.json만 갱신하면 됨.
 *
 * Phase 1에서는 동적 import()로 빌드 시점에 청크 분할.
 */
import type { PackIndex, GrammarUnitPack } from '../interfaces/CurriculumPack';
import type { ContentItem } from '../interfaces/ContentItem';

// public/data → data/canon 심볼릭 링크. GitHub Pages base 경로 반영.
const CANON_BASE = `${import.meta.env.BASE_URL}data`.replace(/\/?$/, '');

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
  const items: ContentItem[] = raw.map((e) => {
    // pack-starter.json은 english/naturalKorean 필드를 사용 (구 expressions.json은 en/ko).
    const en = e.english ?? e.en ?? '';
    const ko = e.naturalKorean ?? e.ko ?? '';
    const contrast = Array.isArray(e.contrast)
      ? (e.contrast as { en: string; ko: string }[])
      : undefined;
    return {
      id: e.id,
      type: 'sentence' as const,
      data: {
        en,
        translations: { ko },
        patternId: e.patternId,
        nounIds: e.nounIds,
        chunks: e.chunks,
        hints: e.hints,
        contrast,
      },
      translations: { ko },
      tags: [`level:${e.level ?? 1}`],
      form: 'statement' as const,
      level: e.level,
      packId: 'pack-starter',
    };
  });
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

/**
 * 코로케이션을 ContentItem[]으로 변환해 로드 (세션 학습용).
 * pattern을 힌트로 사용, verb+noun을 chunks로 사용.
 */
export async function loadCollocationsAsItems(): Promise<ContentItem[]> {
  if (cache.has('collocations-items')) {
    return cache.get('collocations-items') as ContentItem[];
  }
  const cols = await loadCollocations();
  const items: ContentItem[] = cols.map((c) => ({
    id: c.id,
    type: 'sentence' as const,
    data: {
      en: c.en,
      translations: { ko: c.ko },
      chunks: [c.verb, c.noun],
      hints: [`패턴: ${c.pattern}`],
    },
    translations: { ko: c.ko },
    tags: ['type:collocation', `verb:${c.verb}`],
    form: 'statement' as const,
    level: 1,
    packId: 'collocations',
  }));
  cache.set('collocations-items', items);
  return items;
}

/**
 * 구동사를 ContentItem[]으로 변환해 로드 (세션 학습용).
 * verb + particle을 chunks로, 조합을 힌트로 사용.
 */
export async function loadPhrasalVerbsAsItems(): Promise<ContentItem[]> {
  if (cache.has('phrasal-items')) {
    return cache.get('phrasal-items') as ContentItem[];
  }
  const pvs = await loadPhrasalVerbs();
  const items: ContentItem[] = pvs.map((p) => ({
    id: p.id,
    type: 'sentence' as const,
    data: {
      en: p.en,
      translations: { ko: p.ko },
      chunks: [p.verb, p.particle],
      hints: [`구동사: ${p.verb} ${p.particle}`],
    },
    translations: { ko: p.ko },
    tags: ['type:phrasal-verb', `verb:${p.verb}`, `particle:${p.particle}`],
    form: 'statement' as const,
    level: 2,
    packId: 'phrasal-verbs',
  }));
  cache.set('phrasal-items', items);
  return items;
}

/**
 * 그래머 유닛의 items 중 type='sentence'인 것을 ContentItem[]으로 변환 (세션 학습용).
 * skillAxes를 스킬 태그로 부여.
 */
export async function loadGrammarUnitAsItems(unitId: string): Promise<ContentItem[]> {
  const cacheKey = `grammar-items:${unitId}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) as ContentItem[];
  }
  const unit = await loadGrammarUnit(unitId);
  const items: ContentItem[] = unit.items
    .filter((it) => it.type === 'sentence')
    .map((it) => ({
      id: it.id,
      type: 'sentence' as const,
      data: {
        en: it.en ?? '',
        translations: { ko: it.translations?.ko ?? '' },
        chunks: [],
        hints: [],
      },
      translations: { ko: it.translations?.ko ?? '' },
      tags: it.tags ?? [`unit:${unitId}`, ...(unit.skillAxes ?? []).map((a) => `axis:${a}`)],
      form: (it.form ?? 'statement') as 'statement' | 'question' | 'negative',
      level: unit.unit <= 3 ? 1 : unit.unit <= 7 ? 2 : 3,
      packId: unitId,
    }));
  cache.set(cacheKey, items);
  return items;
}

/** 모든 그래머 유닛을 순회하며 ContentItem[]로 합침 (세션 학습용). */
export async function loadAllGrammarAsItems(): Promise<ContentItem[]> {
  if (cache.has('grammar-all-items')) {
    return cache.get('grammar-all-items') as ContentItem[];
  }
  const index = await loadGrammarIndex();
  const all: ContentItem[] = [];
  for (const entry of index) {
    const items = await loadGrammarUnitAsItems(entry.id);
    all.push(...items);
  }
  cache.set('grammar-all-items', all);
  return all;
}

export function clearCache(): void {
  cache.clear();
}

// 원시 데이터 타입 (기존 expressions.json en/ko + pack-starter.json english/naturalKorean 호환)
interface RawExpression {
  id: string;
  en?: string;
  ko?: string;
  english?: string;
  naturalKorean?: string;
  patternId?: string;
  nounIds?: string[];
  chunks?: string[];
  hints?: string[];
  contrast?: Record<string, unknown>;
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