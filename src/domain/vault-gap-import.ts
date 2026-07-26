/**
 * vault-gap-import.ts — 볼트 Gaps/*.md → 앱 약점 훈련 재료.
 */
export interface ImportedGap {
  expressionId: string;
  en: string;
  ko: string;
  guess: string;
  path: string;
}

function stripQuotes(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** frontmatter + 본문에서 expressionId / en / ko / guess 추출 (v2·구 webapp 형식) */
export function parseGapMarkdown(markdown: string, path = ''): ImportedGap | null {
  const text = String(markdown || '');
  if (!text.trim()) return null;

  let expressionId = '';
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const idMatch = fm[1].match(/^expressionId:\s*(.+)$/m);
    if (idMatch) expressionId = stripQuotes(idMatch[1]);
  }
  if (!expressionId) {
    const fromPath = path.match(/gap_([^_/]+)_/);
    if (fromPath) expressionId = fromPath[1];
  }
  if (!expressionId || expressionId.startsWith('_')) return null;

  let guess = '';
  const guessBlock = text.match(/##\s*내 추측\s*\r?\n([\s\S]*?)(?=\r?\n##|\s*$)/);
  if (guessBlock) guess = guessBlock[1].trim().split(/\r?\n/)[0]?.trim() ?? '';

  let en = '';
  let ko = '';
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
        ko = koMatch[1].trim();
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
  };
}

export function parseGapFiles(
  files: Array<{ path: string; content: string }>
): ImportedGap[] {
  const byId = new Map<string, ImportedGap>();
  for (const f of files) {
    if (!/Gaps\/[^/]+\.md$/i.test(f.path)) continue;
    if (/\/_keep\.md$/i.test(f.path)) continue;
    const parsed = parseGapMarkdown(f.content, f.path);
    if (!parsed) continue;
    // 같은 expressionId면 더 최근 path 우선(파일명에 날짜 있으면)
    if (!byId.has(parsed.expressionId)) byId.set(parsed.expressionId, parsed);
  }
  return [...byId.values()];
}
