/**
 * vault-gap-import.ts — 볼트 Gaps/*.md → 앱 선순환 재료
 * (힌트·reviewed·슬롯·약점 가중)
 */
import type { GapSlotRole } from './gap-reason';
import type { GapNote } from './vault-projection';

export interface ImportedGap {
  expressionId: string;
  en: string;
  ko: string;
  guess: string;
  path: string;
  learnerClue?: string;
  vaultFill?: string;
  reasonStatus?: GapNote['reasonStatus'];
  primarySlot?: GapSlotRole;
  slots?: GapSlotRole[];
  match?: 'wrong' | 'skipped';
  packId?: string;
  id?: string;
}

const SLOT_ROLES: GapSlotRole[] = [
  'subject',
  'verb',
  'noun',
  'modifier',
  'tense',
  'agreement',
];

function stripQuotes(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function fmValue(fm: string, key: string): string {
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? stripQuotes(m[1]) : '';
}

function parseSlotList(raw: string): GapSlotRole[] {
  const inner = raw.replace(/^\[/, '').replace(/\]$/, '');
  if (!inner.trim()) return [];
  return inner
    .split(',')
    .map((s) => stripQuotes(s.trim()))
    .filter((s): s is GapSlotRole => (SLOT_ROLES as string[]).includes(s));
}

function sectionBody(text: string, title: string): string {
  const re = new RegExp(
    `##\\s*${title}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##|\\s*$)`,
    'i'
  );
  const m = text.match(re);
  if (!m) return '';
  return m[1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('- 상태:') && !l.startsWith('>'))
    .join('\n')
    .trim();
}

/** frontmatter + 본문에서 간극·단서·메움·슬롯 추출 */
export function parseGapMarkdown(markdown: string, path = ''): ImportedGap | null {
  const text = String(markdown || '');
  if (!text.trim()) return null;

  let expressionId = '';
  let fmBlock = '';
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    fmBlock = fm[1];
    expressionId = fmValue(fmBlock, 'expressionId');
  }
  if (!expressionId) {
    const fromPath = path.match(/gap_([^_/]+)_/);
    if (fromPath) expressionId = fromPath[1];
  }
  if (!expressionId || expressionId.startsWith('_')) return null;

  const id = fmValue(fmBlock, 'id') || undefined;
  const packId = fmValue(fmBlock, 'packId') || undefined;
  const matchRaw = fmValue(fmBlock, 'match');
  const match: 'wrong' | 'skipped' | undefined =
    matchRaw === 'skipped' ? 'skipped' : matchRaw === 'wrong' ? 'wrong' : undefined;

  const primaryRaw = fmValue(fmBlock, 'primarySlot');
  const primarySlot = (SLOT_ROLES as string[]).includes(primaryRaw)
    ? (primaryRaw as GapSlotRole)
    : undefined;
  const slotsRaw = fmValue(fmBlock, 'slots');
  const slots = slotsRaw ? parseSlotList(slotsRaw) : undefined;

  let reasonStatus = fmValue(fmBlock, 'reasonStatus') as GapNote['reasonStatus'] | '';
  const learnerClueFm = fmValue(fmBlock, 'learnerClue');

  const clueSection = sectionBody(text, '내 단서');
  const fillRaw =
    sectionBody(text, '옵시디언 메움') ||
    sectionBody(text, '메움') ||
    sectionBody(text, '영어식 사고');
  const fillSection = fillRaw
    .replace(/^\(여기에[^)]*\)\s*$/m, '')
    .replace(/여기에 영어식 사고로 메운 내용을 적으세요[^\n]*/g, '')
    .trim();

  const learnerClue = (learnerClueFm || clueSection.split(/\r?\n/)[0] || '').trim() || undefined;
  const vaultFill = fillSection || undefined;

  if (vaultFill && (!reasonStatus || reasonStatus === 'clued' || reasonStatus === 'draft')) {
    reasonStatus = 'reviewed';
  }
  if (!reasonStatus && learnerClue) reasonStatus = 'clued';

  let guess = '';
  const guessBlock = text.match(/##\s*내 추측\s*\r?\n([\s\S]*?)(?=\r?\n##|\s*$)/);
  if (guessBlock) guess = guessBlock[1].trim().split(/\r?\n/)[0]?.trim() ?? '';

  let en = fmValue(fmBlock, 'en');
  let ko = fmValue(fmBlock, 'ko');
  const answerBlock = text.match(
    /##\s*(?:정답|실제 의미\s*\/\s*정답)\s*\r?\n([\s\S]*?)(?=\r?\n##|\s*$)/
  );
  if (answerBlock) {
    const lines = answerBlock[1]
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      const koMatch = line.match(/^-?\s*한국어:\s*(.+)$/);
      if (koMatch) {
        if (!ko) ko = koMatch[1].trim();
        continue;
      }
      if (!en && !line.startsWith('-') && !line.startsWith('#')) {
        en = line.replace(/^\*\*?/, '').replace(/\*\*?$/, '').trim();
      }
    }
  }

  if (!en) {
    const title = text.match(/^#\s*Gap\s*·\s*(.+)$/m);
    if (title) {
      const t = title[1].trim();
      if (t && t !== expressionId) en = t;
    }
  }

  if (!en) return null;

  return {
    expressionId,
    en,
    ko: ko || expressionId,
    guess: guess || '(볼트 Gap)',
    path,
    learnerClue,
    vaultFill,
    reasonStatus: reasonStatus || undefined,
    primarySlot,
    slots: slots && slots.length ? slots : primarySlot ? [primarySlot] : undefined,
    match,
    packId,
    id,
  };
}

export function parseGapFiles(
  files: Array<{ path: string; content: string }>
): ImportedGap[] {
  const byId = new Map<string, ImportedGap>();
  for (const f of files) {
    if (!/Gaps\/[^/]+\.md$/i.test(f.path)) continue;
    if (/\/_keep\.md$/i.test(f.path)) continue;
    if (/\/_Index\.md$/i.test(f.path)) continue;
    const parsed = parseGapMarkdown(f.content, f.path);
    if (!parsed) continue;
    if (!byId.has(parsed.expressionId)) byId.set(parsed.expressionId, parsed);
  }
  return [...byId.values()];
}
