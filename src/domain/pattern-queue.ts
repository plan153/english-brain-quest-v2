/**
 * pattern-queue.ts — Gap slots 기반 패턴 약점 훈련 큐.
 * 앱 로컬 gapNotes.slots 를 읽어 같은 간극 유형 문장만 모은다.
 */
import type { ContentItem } from '../interfaces/ContentItem';
import type { GapNote } from './vault-projection';
import {
  PATTERN_NOTE_IDS,
  patternNoteTitle,
  type GapSlotRole,
} from './gap-reason';
import type { SentenceMemory } from './srs-engine';

export interface PatternGapRow {
  role: GapSlotRole;
  label: string;
  /** 해당 슬롯 Gap이 있는 고유 문장 수 */
  sentenceCount: number;
  /** Gap 발생 횟수(문장당 최신 1건만 세도 누적 hit) */
  gapHits: number;
  sentenceIds: string[];
}

export interface PatternQueueItem {
  sentenceId: string;
  en: string;
  ko: string;
  role: GapSlotRole;
  score: number;
  gapId: string;
  reasonStatus?: GapNote['reasonStatus'];
}

function daysSince(iso: string, now: Date): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 999;
  return Math.max(0, (now.getTime() - t) / 86_400_000);
}

/** 문장당 최신 Gap만 (expressionId 기준) */
function latestGapsBySentence(gapNotes: GapNote[]): GapNote[] {
  const map = new Map<string, GapNote>();
  for (const g of gapNotes) {
    if (!g.expressionId || !g.en) continue;
    const slots = g.slots ?? [];
    if (slots.length === 0) continue;
    const prev = map.get(g.expressionId);
    const gAt = Date.parse(g.updatedAt ?? g.createdAt);
    const pAt = prev ? Date.parse(prev.updatedAt ?? prev.createdAt) : 0;
    if (!prev || gAt >= pAt) map.set(g.expressionId, g);
  }
  return [...map.values()];
}

export function summarizePatternGaps(gapNotes: GapNote[]): PatternGapRow[] {
  const latest = latestGapsBySentence(gapNotes);
  const byRole = new Map<GapSlotRole, { ids: Set<string>; hits: number }>();

  for (const role of PATTERN_NOTE_IDS) {
    byRole.set(role, { ids: new Set(), hits: 0 });
  }

  // 모든 Gap(히스토리)으로 hit 수, 최신으로 sentence set
  for (const g of gapNotes) {
    const roles = new Set<GapSlotRole>([
      ...(g.slots ?? []),
      ...(g.primarySlot ? [g.primarySlot] : []),
    ]);
    for (const role of roles) {
      const bucket = byRole.get(role);
      if (!bucket) continue;
      bucket.hits += 1;
    }
  }
  for (const g of latest) {
    const roles = new Set<GapSlotRole>([
      ...(g.slots ?? []),
      ...(g.primarySlot ? [g.primarySlot] : []),
    ]);
    for (const role of roles) {
      const bucket = byRole.get(role);
      if (!bucket) continue;
      bucket.ids.add(g.expressionId);
    }
  }

  return PATTERN_NOTE_IDS.map((role) => {
    const bucket = byRole.get(role)!;
    return {
      role,
      label: patternNoteTitle(role),
      sentenceCount: bucket.ids.size,
      gapHits: bucket.hits,
      sentenceIds: [...bucket.ids],
    };
  })
    .filter((r) => r.sentenceCount > 0)
    .sort((a, b) => b.gapHits - a.gapHits || b.sentenceCount - a.sentenceCount);
}

export function countPatternTraining(gapNotes: GapNote[], role?: GapSlotRole | null): number {
  const rows = summarizePatternGaps(gapNotes);
  if (role) {
    return rows.find((r) => r.role === role)?.sentenceCount ?? 0;
  }
  return latestGapsBySentence(gapNotes).length;
}

/** 가장 Gap이 많은 슬롯 (없으면 null) */
export function topPatternRole(gapNotes: GapNote[]): GapSlotRole | null {
  const rows = summarizePatternGaps(gapNotes);
  return rows[0]?.role ?? null;
}

/**
 * 패턴 약점 큐.
 * role 없으면 상위 슬롯부터 채워 limit까지 보충.
 */
export function pickPatternTrainingQueue(
  gapNotes: GapNote[],
  memories: Record<string, SentenceMemory>,
  options: { role?: GapSlotRole | null; limit?: number; now?: Date } = {}
): PatternQueueItem[] {
  const limit = Math.max(0, options.limit ?? 10);
  const now = options.now ?? new Date();
  if (limit === 0) return [];

  const latest = latestGapsBySentence(gapNotes);
  const roles: GapSlotRole[] = options.role
    ? [options.role]
    : summarizePatternGaps(gapNotes).map((r) => r.role);

  const picked: PatternQueueItem[] = [];
  const seen = new Set<string>();

  for (const role of roles) {
    const scored: PatternQueueItem[] = [];
    for (const g of latest) {
      if (!(g.slots ?? []).includes(role) && g.primarySlot !== role) continue;
      if (seen.has(g.expressionId)) continue;
      const mem = memories[g.expressionId];
      const pending = (g.reasonStatus ?? 'pending') === 'clued' ||
        (g.reasonStatus ?? '') === 'edited' ||
        (g.reasonStatus ?? '') === 'confirmed' ||
        (g.reasonStatus ?? 'pending') === 'pending'
        ? 1
        : 0;
      const recent = daysSince(g.updatedAt ?? g.createdAt, now) <= 7 ? 30 : 0;
      const wrong = mem?.wrong ?? 0;
      const blind = mem?.blindCorrect ?? 0;
      const hits = gapNotes.filter(
        (x) =>
          x.expressionId === g.expressionId &&
          ((x.slots ?? []).includes(role) || x.primarySlot === role)
      ).length;
      const primaryBoost = g.primarySlot === role ? 40 : 0;
      const score =
        hits * 50 +
        primaryBoost +
        pending * 20 +
        wrong * 10 +
        recent -
        blind * 8 -
        (mem?.exactCount ?? 0) * 3;

      scored.push({
        sentenceId: g.expressionId,
        en: mem?.en || g.en,
        ko: mem?.ko || g.ko,
        role,
        score,
        gapId: g.id,
        reasonStatus: g.reasonStatus,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    for (const item of scored) {
      if (picked.length >= limit) break;
      if (seen.has(item.sentenceId)) continue;
      seen.add(item.sentenceId);
      picked.push(item);
    }
    if (picked.length >= limit) break;
  }

  return picked;
}

export function patternItemToContentItem(item: PatternQueueItem): ContentItem {
  return {
    id: item.sentenceId,
    type: 'sentence',
    data: { en: item.en, translations: { ko: item.ko } },
    translations: { ko: item.ko },
    tags: ['pattern', `pattern:${item.role}`, 'weak'],
    form: 'statement',
    level: 3,
    packId: 'pattern',
  };
}

export { patternNoteTitle, PATTERN_NOTE_IDS };
