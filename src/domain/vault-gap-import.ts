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
  /** frontmatter updatedAt(없으면 createdAt) — 같은 문장 중복 파일에서 최신 승리 판정용 */
  updatedAt?: string;
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
    .split('\n')
    .filter((line) => {
      if (/^\*\*.+\*\*\??$/.test(line)) return false; // 구조 라벨 (예: **왜 달랐나?**)
      if (/^\*\(.*\)\*$/.test(line)) return false; // 안내 문구 (예: *(...)*)
      if (/^\(여기에[^)]*\)$/.test(line)) return false; // 구버전 플레이스홀더 호환
      if (/^\d+\.\s*$/.test(line)) return false; // 빈 번호 목록 (예: "1.")
      return true;
    })
    .join('\n')
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

  const updatedAt = fmValue(fmBlock, 'updatedAt') || fmValue(fmBlock, 'createdAt') || undefined;

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
    updatedAt,
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
    const prev = byId.get(parsed.expressionId);
    if (!prev) {
      byId.set(parsed.expressionId, parsed);
      continue;
    }
    // 같은 문장에 파일이 여러 개면(재도전 등) updatedAt이 최신인 쪽이 승리 — 오래된 파일이
    // 나중에 읽혀 최신 메움을 가리는 것을 방지
    const prevAt = prev.updatedAt ? Date.parse(prev.updatedAt) : 0;
    const curAt = parsed.updatedAt ? Date.parse(parsed.updatedAt) : 0;
    if (curAt >= prevAt) byId.set(parsed.expressionId, parsed);
  }
  return [...byId.values()];
}

/**
 * sync 직전, 방금 쓰려는 GapNote를 볼트에 이미 있는 파일 내용과 합친다.
 * 옵시디언에서 직접 쓴 「## 옵시디언 메움」이 있으면 앱이 아직 import 못 했더라도
 * 플레이스홀더로 덮어쓰지 않고 보존하며, reviewed로 승격한다.
 */
export function mergeGapForVaultWrite(gap: GapNote, existing: ImportedGap | null): GapNote {
  if (!existing) return gap;
  const existingFill = (existing.vaultFill || '').trim();
  const vaultFill = existingFill || gap.vaultFill;
  const reviewedByVault = Boolean(existingFill) || existing.reasonStatus === 'reviewed';
  const reasonStatus: GapNote['reasonStatus'] = reviewedByVault ? 'reviewed' : gap.reasonStatus;
  return { ...gap, vaultFill, reasonStatus };
}
