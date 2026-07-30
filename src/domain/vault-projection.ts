/**
 * vault-projection.ts — Obsidian Markdown 투영.
 * Learners/<userId>/Learning/{Brain,Progress}.md
 * Learners/<userId>/Gaps/{_Index,gap_*}.md
 * Learners/<userId>/Patterns/{subject,verb,...}.md
 * 약점(due·오답) 요약은 앱 SRS 거울 — 출제 엔진은 앱에 유지.
 */
import type { SkillProfile } from './difficulty-mixer';
import type { Badge } from './reward-engine';
import {
  CUE_MODE_LABEL,
  type WeakLinkRow,
  type WeakLinkSummary,
} from './srs-engine';
import { vaultLibraryBrainSection } from './vault-library';
import {
  PATTERN_NOTE_IDS,
  patternNoteTitle,
  type GapSlotRole,
} from './gap-reason';

export interface ProgressSnapshot {
  xp: number;
  level: number;
  streakDays: number;
  todaySentenceCount: number;
  correctCount: number;
  attemptCount: number;
  totalSentences: number;
}

export interface GapNote {
  id: string;
  expressionId: string;
  en: string;
  ko: string;
  guess: string;
  createdAt: string;
  /** wrong | skipped */
  match?: 'wrong' | 'skipped';
  cueMode?: import('./srs-engine').CueMode;
  /** speak | type */
  inputMode?: 'speak' | 'type';
  /** 문제가 된 슬롯 (subject/verb/…) */
  slots?: GapSlotRole[];
  /** 앱이 추정한 간극 이유 */
  reasonAuto?: string;
  /** 사용자가 확인·수정한 최종 이유 */
  reasonFinal?: string;
  /** pending=확인 전, confirmed=추정 승인, edited=사용자가 고침 */
  reasonStatus?: 'pending' | 'confirmed' | 'edited';
  updatedAt?: string;
}

function escapeYaml(value: string): string {
  const text = String(value ?? '');
  if (/[:#{}[\],&*?|>!%@`]/.test(text) || /^\s|\s$/.test(text) || text === '') {
    return JSON.stringify(text);
  }
  return text;
}

function yamlList(items: string[]): string {
  if (items.length === 0) return '[]';
  return `[${items.map((i) => escapeYaml(i)).join(', ')}]`;
}

function learnerRoot(userId: string): string {
  return `Learners/${userId}`;
}

export function brainPath(userId: string): string {
  return `${learnerRoot(userId)}/Learning/Brain.md`;
}

/** Mac APFS 관례 — Progress.md (progress.md 와 동일 inode) */
export function progressPath(userId: string): string {
  return `${learnerRoot(userId)}/Learning/Progress.md`;
}

export function gapPath(userId: string, gapId: string): string {
  return `${learnerRoot(userId)}/Gaps/${gapId}.md`;
}

export function gapsIndexPath(userId: string): string {
  return `${learnerRoot(userId)}/Gaps/_Index.md`;
}

export function patternPath(userId: string, role: GapSlotRole): string {
  return `${learnerRoot(userId)}/Patterns/${role}.md`;
}

export function indexPath(userId: string): string {
  return `${learnerRoot(userId)}/English Brain Index.md`;
}

function formatWeakRow(row: WeakLinkRow, index: number): string {
  const cue = row.lastCueMode ? CUE_MODE_LABEL[row.lastCueMode] : '';
  const cueBit = cue ? ` · ${cue}` : '';
  const ko = row.ko.replace(/\s+/g, ' ').trim();
  return `${index + 1}. **${row.en}** — ${ko}\n   - ${row.reason}${cueBit} · \`${row.sentenceId}\``;
}

function formatWeakSections(weak?: WeakLinkSummary): string {
  if (!weak) {
    return `## 복습 대기

- (동기화 시 문장 기억 데이터 없음)

## 약한 고리

- (없음)
`;
  }

  const dueBlock =
    weak.due.length === 0
      ? '- (지금 복습 기한인 문장 없음)'
      : weak.due.map((row, i) => formatWeakRow(row, i)).join('\n');

  const weakBlock =
    weak.weak.length === 0
      ? '- (오답·힌트 의존 약점 없음)'
      : weak.weak.map((row, i) => formatWeakRow(row, i)).join('\n');

  return `## 복습 대기 (${weak.dueCount}문장)

앱 Today → **복습** 팩과 동일 큐입니다.

${dueBlock}

## 약한 고리 (TOP ${weak.weak.length})

오답이 많거나 정답을 보고 맞힌 비중이 높은 문장입니다. 앱에서 다시 말해 보세요.

${weakBlock}

## 기억 요약

- 추적 문장: ${weak.memoryCount}
- 내 문장: ${weak.ownedCount}
- 복습 대기: ${weak.dueCount}
`;
}

export function projectBrain(args: {
  userId: string;
  skill: SkillProfile;
  badges: Badge[];
  progress: ProgressSnapshot;
  weakLinks?: WeakLinkSummary;
}): { path: string; markdown: string } {
  const { userId, skill, badges, progress, weakLinks } = args;
  const updatedAt = new Date().toISOString();
  const skillLines = Object.entries(skill)
    .map(([k, v]) => `- ${k}: ${v}%`)
    .join('\n');
  const badgeLines =
    badges.length === 0
      ? '- (아직 없음)'
      : badges.map((b) => `- 🏆 ${b.name} — ${b.description}`).join('\n');

  const dueCount = weakLinks?.dueCount ?? 0;
  const ownedCount = weakLinks?.ownedCount ?? 0;

  const markdown = `---
type: brain-state
learnerId: ${escapeYaml(userId)}
updatedAt: ${escapeYaml(updatedAt)}
level: ${progress.level}
xp: ${progress.xp}
streakDays: ${progress.streakDays}
dueCount: ${dueCount}
ownedCount: ${ownedCount}
tags: [ebq, brain]
source: english-brain-quest-v2
---

# Brain State

## 숙련도 (6축)

${skillLines}

## 배지

${badgeLines}

${formatWeakSections(weakLinks)}
${vaultLibraryBrainSection()}
## 패턴 허브

- [[Patterns/subject|주어]]
- [[Patterns/verb|동사]]
- [[Patterns/noun|목적어]]
- [[Patterns/modifier|수식]]
- [[Patterns/tense|시제]]
- [[Patterns/agreement|3인칭 단수]]

## 연결

- [[Progress]]
- [[Gaps/_Index|Gaps]]
- [[English Brain Index]]
`;

  return { path: brainPath(userId), markdown };
}

export function projectProgress(args: {
  userId: string;
  progress: ProgressSnapshot;
  weakLinks?: WeakLinkSummary;
}): { path: string; markdown: string } {
  const { userId, progress, weakLinks } = args;
  const updatedAt = new Date().toISOString();
  const accuracy =
    progress.attemptCount > 0
      ? Math.round((progress.correctCount / progress.attemptCount) * 100)
      : 0;

  const duePreview =
    weakLinks && weakLinks.due.length > 0
      ? weakLinks.due
          .slice(0, 5)
          .map((r, i) => `${i + 1}. ${r.en} (\`${r.sentenceId}\`)`)
          .join('\n')
      : '- (없음)';

  const markdown = `---
type: progress
learnerId: ${escapeYaml(userId)}
updatedAt: ${escapeYaml(updatedAt)}
xp: ${progress.xp}
level: ${progress.level}
streakDays: ${progress.streakDays}
todaySentenceCount: ${progress.todaySentenceCount}
totalSentences: ${progress.totalSentences}
correctCount: ${progress.correctCount}
attemptCount: ${progress.attemptCount}
accuracy: ${accuracy}
dueCount: ${weakLinks?.dueCount ?? 0}
ownedCount: ${weakLinks?.ownedCount ?? 0}
tags: [ebq, progress]
source: english-brain-quest-v2
---

# Progress

| 항목 | 값 |
|------|-----|
| 레벨 | ${progress.level} |
| XP | ${progress.xp} |
| 연속 학습 | ${progress.streakDays}일 |
| 오늘 문장 | ${progress.todaySentenceCount} |
| 누적 문장 | ${progress.totalSentences} |
| 정답률 | ${accuracy}% |
| 복습 대기 | ${weakLinks?.dueCount ?? 0} |
| 내 문장 | ${weakLinks?.ownedCount ?? 0} |

## 지금 복습하면 좋은 문장

${duePreview}

자세한 약점 목록은 [[Brain]] 참고.

## 연결

- [[Brain]]
- [[Gaps/_Index|Gaps]]
`;

  return { path: progressPath(userId), markdown };
}

export function projectGap(args: {
  userId: string;
  gap: GapNote;
}): { path: string; markdown: string } {
  const { userId, gap } = args;
  const reason =
    gap.reasonFinal?.trim() ||
    gap.reasonAuto?.trim() ||
    '(아직 적지 않음)';
  const status = gap.reasonStatus ?? 'pending';
  const slots = gap.slots ?? [];
  const tags = [
    'ebq',
    'gap',
    ...(gap.match === 'skipped' ? ['gap/skipped'] : ['gap/wrong']),
    ...slots.map((s) => `pattern/${s}`),
  ];
  const slotLinks =
    slots.length === 0
      ? '- (슬롯 분석 없음)'
      : slots.map((s) => `- [[Patterns/${s}|${patternNoteTitle(s)}]]`).join('\n');
  const cue = gap.cueMode ? CUE_MODE_LABEL[gap.cueMode] : '';
  const input = gap.inputMode === 'type' ? '타이핑' : gap.inputMode === 'speak' ? '말하기' : '';

  const markdown = `---
type: gap
id: ${escapeYaml(gap.id)}
learnerId: ${escapeYaml(userId)}
expressionId: ${escapeYaml(gap.expressionId)}
en: ${escapeYaml(gap.en)}
ko: ${escapeYaml(gap.ko)}
guess: ${escapeYaml(gap.guess)}
createdAt: ${escapeYaml(gap.createdAt)}
updatedAt: ${escapeYaml(gap.updatedAt ?? gap.createdAt)}
reasonStatus: ${escapeYaml(status)}
match: ${escapeYaml(gap.match ?? 'wrong')}
cueMode: ${escapeYaml(gap.cueMode ?? '')}
inputMode: ${escapeYaml(gap.inputMode ?? '')}
slots: ${yamlList(slots)}
tags: ${yamlList(tags)}
source: english-brain-quest-v2
---

# Gap · ${gap.en}

## 내 추측

${gap.guess || '(없음)'}

## 정답

${gap.en}
- 한국어: ${gap.ko}
${cue || input ? `\n- ${[cue, input].filter(Boolean).join(' · ')}\n` : ''}
## 간극이 생긴 이유

${reason}

- 상태: ${status === 'confirmed' ? '사용자 확인' : status === 'edited' ? '사용자 수정' : '자동 추정(미확인)'}
${gap.reasonAuto && gap.reasonFinal && gap.reasonAuto !== gap.reasonFinal ? `\n### 처음 추정\n\n${gap.reasonAuto}\n` : ''}
## 약한 슬롯

${slotLinks}

## 연결

- [[Brain]]
- [[Gaps/_Index|Gaps 목록]]
- 표현 ID: \`${gap.expressionId}\`
`;

  return { path: gapPath(userId, gap.id), markdown };
}

export function projectGapsIndex(args: {
  userId: string;
}): { path: string; markdown: string } {
  const { userId } = args;
  const updatedAt = new Date().toISOString();
  const markdown = `---
type: gaps-index
learnerId: ${escapeYaml(userId)}
updatedAt: ${escapeYaml(updatedAt)}
tags: [ebq, gaps-moc]
source: english-brain-quest-v2
---

# Gaps · 간극 목록

앱에서 틀린·스킵한 문장이 여기 쌓입니다. Dataview가 있으면 아래 쿼리로 필터하세요.

## 미확인 이유

\`\`\`dataview
TABLE expressionId, reasonStatus, slots, match
FROM "Learners/${userId}/Gaps"
WHERE type = "gap" AND reasonStatus = "pending"
SORT updatedAt DESC
LIMIT 20
\`\`\`

## 패턴별

\`\`\`dataview
TABLE rows.file.link AS gaps
FROM "Learners/${userId}/Gaps"
WHERE type = "gap"
FLATTEN slots AS slot
GROUP BY slot
\`\`\`

## 최근 Gap

\`\`\`dataview
LIST
FROM "Learners/${userId}/Gaps"
WHERE type = "gap"
SORT updatedAt DESC
LIMIT 15
\`\`\`

## 패턴 허브

- [[Patterns/subject|주어]]
- [[Patterns/verb|동사]]
- [[Patterns/noun|목적어]]
- [[Patterns/modifier|수식]]
- [[Patterns/tense|시제]]
- [[Patterns/agreement|3인칭 단수]]

## 연결

- [[Brain]]
- [[Progress]]
- [[English Brain Index]]
`;

  return { path: gapsIndexPath(userId), markdown };
}

export function projectPatternNote(args: {
  userId: string;
  role: GapSlotRole;
}): { path: string; markdown: string } {
  const { userId, role } = args;
  const title = patternNoteTitle(role);
  const updatedAt = new Date().toISOString();
  const markdown = `---
type: pattern-hub
learnerId: ${escapeYaml(userId)}
pattern: ${escapeYaml(role)}
updatedAt: ${escapeYaml(updatedAt)}
tags: [ebq, pattern, pattern/${role}]
source: english-brain-quest-v2
---

# Pattern · ${title}

이 노트는 **${title}** 간극을 모으는 허브입니다.
Gap 노트 frontmatter \`slots\` / 태그 \`pattern/${role}\` 로 연결됩니다.

## 관련 Gap (Dataview)

\`\`\`dataview
TABLE en, guess, reasonStatus
FROM "Learners/${userId}/Gaps"
WHERE type = "gap" AND contains(slots, "${role}")
SORT updatedAt DESC
LIMIT 30
\`\`\`

## 연습 팁

${patternTip(role)}

## 연결

- [[Gaps/_Index|Gaps]]
- [[Brain]]
`;

  return { path: patternPath(userId, role), markdown };
}

function patternTip(role: GapSlotRole): string {
  switch (role) {
    case 'subject':
      return '- 누가 하는지(I/you/he/she…)를 먼저 고른 뒤 나머지를 조립하세요.';
    case 'verb':
      return '- 동작·상태를 한 단어로 떠올린 다음 시제·인칭을 붙이세요.';
    case 'noun':
      return '- 무엇을/누구를(목적어) 말하는지 먼저 정하세요. 명령문의 주어 you는 보통 생략됩니다.';
    case 'modifier':
      return '- 명사 뒤 -ing 수식(living in …)이나 to부정사 부가가 빠지지 않았는지 보세요.';
    case 'tense':
      return '- 과거/현재/미래 중 어느 때인지 한국어 문장에서 표시를 찾으세요.';
    case 'agreement':
      return '- he/she/it 뒤에는 동사에 -s / is / does / has 가 붙는지 확인하세요.';
  }
}

/** 동기화 시 항상 쓰는 허브 노트들 */
export function projectVaultScaffold(userId: string): Array<{ path: string; markdown: string }> {
  return [
    projectGapsIndex({ userId }),
    ...PATTERN_NOTE_IDS.map((role) => projectPatternNote({ userId, role })),
  ];
}

export function projectIndex(args: {
  userId: string;
  progress: ProgressSnapshot;
  weakLinks?: WeakLinkSummary;
}): { path: string; markdown: string } {
  const { userId, progress, weakLinks } = args;
  const updatedAt = new Date().toISOString();
  const due = weakLinks?.dueCount ?? 0;
  const markdown = `---
type: english-brain-index
learnerId: ${escapeYaml(userId)}
updatedAt: ${escapeYaml(updatedAt)}
tags: [ebq, moc]
source: english-brain-quest-v2
---

# English Brain Index

제2의 영어뇌 — 학습 상태와 약점 노트 허브.

## Learning

- [[Learning/Brain|Brain State]]
- [[Learning/Progress|Progress]]

## Gaps

- [[Gaps/_Index|Gaps 목록 · Dataview]]

\`Gaps/\` 폴더에 틀린 표현 노트가 쌓입니다.

## Patterns

- [[Patterns/subject|주어]]
- [[Patterns/verb|동사]]
- [[Patterns/noun|목적어]]
- [[Patterns/modifier|수식]]
- [[Patterns/tense|시제]]
- [[Patterns/agreement|3인칭 단수]]

## Library 원문

- [[Library/Patterns/기본동사 100|기본동사 100]] ← 앱 \`quiz-verbs\`
- [[Library/Patterns/영어회화 100|영어회화 100]] ← 앱 \`conversation-100\`

## 요약

- Lv ${progress.level} · ${progress.xp} XP · ${progress.streakDays}일 연속
- 복습 대기 ${due}문장 · 내 문장 ${weakLinks?.ownedCount ?? 0}
`;

  return { path: indexPath(userId), markdown };
}

export function makeGapId(expressionId: string, guess: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let hash = 2166136261;
  const text = `${expressionId}|${guess}`.toLowerCase();
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const digest = (hash >>> 0).toString(36).slice(0, 6);
  return `gap_${expressionId}_${stamp}_${digest}`;
}
