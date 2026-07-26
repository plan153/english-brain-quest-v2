/**
 * vault-projection.ts — Obsidian Markdown 투영.
 * Learners/<userId>/Learning/Brain.md, progress.md, Gaps/<id>.md
 * 약점(due·오답) 요약은 앱 SRS 거울 — 출제 엔진은 앱에 유지.
 */
import type { SkillProfile } from './difficulty-mixer';
import type { Badge } from './reward-engine';
import {
  CUE_MODE_LABEL,
  type WeakLinkRow,
  type WeakLinkSummary,
} from './srs-engine';

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
}

function escapeYaml(value: string): string {
  const text = String(value ?? '');
  if (/[:#{}[\],&*?|>!%@`]/.test(text) || /^\s|\s$/.test(text) || text === '') {
    return JSON.stringify(text);
  }
  return text;
}

function learnerRoot(userId: string): string {
  return `Learners/${userId}`;
}

export function brainPath(userId: string): string {
  return `${learnerRoot(userId)}/Learning/Brain.md`;
}

export function progressPath(userId: string): string {
  return `${learnerRoot(userId)}/Learning/progress.md`;
}

export function gapPath(userId: string, gapId: string): string {
  return `${learnerRoot(userId)}/Gaps/${gapId}.md`;
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
source: english-brain-quest-v2
---

# Brain State

## 숙련도 (6축)

${skillLines}

## 배지

${badgeLines}

${formatWeakSections(weakLinks)}
## 연결

- [[progress]]
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
`;

  return { path: progressPath(userId), markdown };
}

export function projectGap(args: {
  userId: string;
  gap: GapNote;
}): { path: string; markdown: string } {
  const { userId, gap } = args;
  const markdown = `---
type: gap
id: ${escapeYaml(gap.id)}
learnerId: ${escapeYaml(userId)}
expressionId: ${escapeYaml(gap.expressionId)}
createdAt: ${escapeYaml(gap.createdAt)}
source: english-brain-quest-v2
---

# Gap · ${gap.en}

## 내 추측

${gap.guess || '(없음)'}

## 정답

${gap.en}
- 한국어: ${gap.ko}

## 연결

- [[Brain]]
- 표현 ID: \`${gap.expressionId}\`
`;

  return { path: gapPath(userId, gap.id), markdown };
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
source: english-brain-quest-v2
---

# English Brain Index

제2의 영어뇌 — 학습 상태와 약점 노트 허브.

## Learning

- [[Learning/Brain|Brain State]]
- [[Learning/progress|Progress]]

## Gaps

\`Gaps/\` 폴더에 틀린 표현 노트가 쌓입니다.

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
