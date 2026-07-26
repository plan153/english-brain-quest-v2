/**
 * vault-projection.ts — Obsidian Markdown 투영 (Phase 4 최소 세트).
 * Learners/<userId>/Learning/Brain.md, progress.md, Gaps/<id>.md
 */
import type { SkillProfile } from './difficulty-mixer';
import type { Badge } from './reward-engine';

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

export function projectBrain(args: {
  userId: string;
  skill: SkillProfile;
  badges: Badge[];
  progress: ProgressSnapshot;
}): { path: string; markdown: string } {
  const { userId, skill, badges, progress } = args;
  const updatedAt = new Date().toISOString();
  const skillLines = Object.entries(skill)
    .map(([k, v]) => `- ${k}: ${v}%`)
    .join('\n');
  const badgeLines =
    badges.length === 0
      ? '- (아직 없음)'
      : badges.map((b) => `- 🏆 ${b.name} — ${b.description}`).join('\n');

  const markdown = `---
type: brain-state
learnerId: ${escapeYaml(userId)}
updatedAt: ${escapeYaml(updatedAt)}
level: ${progress.level}
xp: ${progress.xp}
streakDays: ${progress.streakDays}
source: english-brain-quest-v2
---

# Brain State

## 숙련도 (6축)

${skillLines}

## 배지

${badgeLines}

## 연결

- [[progress]]
- [[English Brain Index]]
`;

  return { path: brainPath(userId), markdown };
}

export function projectProgress(args: {
  userId: string;
  progress: ProgressSnapshot;
}): { path: string; markdown: string } {
  const { userId, progress } = args;
  const updatedAt = new Date().toISOString();
  const accuracy =
    progress.attemptCount > 0
      ? Math.round((progress.correctCount / progress.attemptCount) * 100)
      : 0;

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
}): { path: string; markdown: string } {
  const { userId, progress } = args;
  const updatedAt = new Date().toISOString();
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
