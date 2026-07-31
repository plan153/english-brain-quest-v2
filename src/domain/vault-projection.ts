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
import { vaultLibraryBrainSection, wikiLinkForPack } from './vault-library';
import {
  PATTERN_NOTE_IDS,
  patternNoteTitle,
  patternPracticeTip,
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
  /** Focus-on-Form 핵심 슬롯 (Obsidian·패턴 훈련 우선) */
  primarySlot?: GapSlotRole;
  /** 출처 팩 — Library wiki 링크 */
  packId?: string;
  /** 학습자가 남긴 단서 (자기 발견) — 다음 힌트의 원천 */
  learnerClue?: string;
  /** 앱 추정(참고용, 기본 UI에 노출하지 않음) */
  reasonAuto?: string;
  /** 사용자 단서·메움 반영 문장 */
  reasonFinal?: string;
  /**
   * draft=단서 전(가급적 생성 안 함)
   * clued=단서 저장·볼트 메움 대기
   * reviewed=옵시디언 메움 완료
   * pending/confirmed/edited=구버전 호환
   */
  reasonStatus?:
    | 'draft'
    | 'clued'
    | 'reviewed'
    | 'pending'
    | 'confirmed'
    | 'edited';
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
  const status = gap.reasonStatus ?? 'draft';
  const statusLabel =
    status === 'reviewed'
      ? '메움 완료(reviewed)'
      : status === 'clued' || status === 'edited' || status === 'confirmed'
        ? '단서 저장 · 옵시디언 메움 대기'
        : '단서 작성 전';
  const clue = (gap.learnerClue || gap.reasonFinal || '').trim();
  const reason = clue || gap.reasonAuto?.trim() || '(아직 단서 없음)';
  const slots = gap.slots ?? [];
  const primary = gap.primarySlot ?? slots[0];
  const tags = [
    'ebq',
    'gap',
    ...(gap.match === 'skipped' ? ['gap/skipped'] : ['gap/wrong']),
    ...slots.map((s) => `pattern/${s}`),
    ...(primary ? [`focus/${primary}`] : []),
    ...(gap.packId ? [`pack/${gap.packId}`] : []),
    `loop/${status === 'reviewed' ? 'reviewed' : status === 'clued' || status === 'edited' || status === 'confirmed' ? 'clued' : 'draft'}`,
  ];
  const slotLinks =
    slots.length === 0
      ? '- (슬롯 분석 없음 — 단서 중심 간극)'
      : slots
          .map((s) => {
            const mark = s === primary ? ' ← 핵심' : '';
            return `- [[Patterns/${s}|${patternNoteTitle(s)}]]${mark}`;
          })
          .join('\n');
  const cue = gap.cueMode ? CUE_MODE_LABEL[gap.cueMode] : '';
  const input = gap.inputMode === 'type' ? '타이핑' : gap.inputMode === 'speak' ? '말하기' : '';
  const library = gap.packId ? wikiLinkForPack(gap.packId) : undefined;
  const practice =
    primary != null
      ? [
          `1. 앱 Today → **패턴 약점** → 「${patternNoteTitle(primary)}」`,
          `2. 힌트에 「내 단서」가 다시 뜹니다`,
          library ? `3. 원문: [[${library.wikiLink}|${library.title}]]` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '- 앱 힌트에 남긴 단서가 다시 나옵니다.';

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
learnerClue: ${escapeYaml(clue)}
match: ${escapeYaml(gap.match ?? 'wrong')}
cueMode: ${escapeYaml(gap.cueMode ?? '')}
inputMode: ${escapeYaml(gap.inputMode ?? '')}
primarySlot: ${escapeYaml(primary ?? '')}
packId: ${escapeYaml(gap.packId ?? '')}
slots: ${yamlList(slots)}
tags: ${yamlList(tags)}
source: english-brain-quest-v2
---

# Gap · ${gap.en}

## 루프

\`① 스스로 찾기 → ② 옵시디언 메움 → ③ 나중 힌트\` · 지금: **${statusLabel}**

> 간극을 만드는 과정 = 영어식 사고 연습. 메움은 옵시디언 → 다음 힌트·간극 선순환.

## 내 추측

${gap.guess || '(없음)'}

## 정답

${gap.en}
- 한국어: ${gap.ko}
${cue || input ? `\n- ${[cue, input].filter(Boolean).join(' · ')}\n` : ''}
## 내 단서

${reason}

- 상태: ${statusLabel}
${gap.reasonAuto && clue && gap.reasonAuto !== clue ? `\n### (참고) 예전 자동 추정\n\n${gap.reasonAuto}\n` : ''}
## 옵시디언 메움

(여기에 영어식 사고로 메운 내용을 적으세요. 내용이 있으면 앱이 다음 힌트·reviewed로 가져갑니다.)

## 약한 슬롯

${slotLinks}

## 다음 연습 (피드백 루프)

${practice}

> 간극을 만드는 과정 = 영어식 사고 연습. 메움은 옵시디언 → 다음 힌트·간극 선순환.

## 연결

- [[Brain]]
- [[Gaps/_Index|Gaps 목록]]
${primary ? `- [[Patterns/${primary}|${patternNoteTitle(primary)} 패턴]]\n` : ''}- 표현 ID: \`${gap.expressionId}\`
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

학습자 단서로 생긴 간극만 쌓입니다. 옵시디언 메움 → 다음 힌트·간극 잡기 선순환.

## 단서 저장 · 메움 대기

\`\`\`dataview
TABLE expressionId, primarySlot, reasonStatus, slots, match
FROM "Learners/${userId}/Gaps"
WHERE type = "gap" AND (reasonStatus = "clued" OR reasonStatus = "edited" OR reasonStatus = "confirmed")
SORT updatedAt DESC
LIMIT 20
\`\`\`

## 메움 완료

\`\`\`dataview
TABLE expressionId, primarySlot, learnerClue
FROM "Learners/${userId}/Gaps"
WHERE type = "gap" AND reasonStatus = "reviewed"
SORT updatedAt DESC
LIMIT 20
\`\`\`

## 핵심 슬롯별

\`\`\`dataview
TABLE rows.file.link AS gaps
FROM "Learners/${userId}/Gaps"
WHERE type = "gap" AND primarySlot
GROUP BY primarySlot
\`\`\`

## 패턴별 (슬롯 포함)

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
Gap frontmatter \`primarySlot\` / \`slots\` / 태그 \`pattern/${role}\` · \`focus/${role}\` 로 연결됩니다.

## 핵심으로 잡힌 Gap (우선 복습)

\`\`\`dataview
TABLE en, guess, reasonStatus, packId
FROM "Learners/${userId}/Gaps"
WHERE type = "gap" AND primarySlot = "${role}"
SORT updatedAt DESC
LIMIT 20
\`\`\`

## 관련 Gap (슬롯 포함)

\`\`\`dataview
TABLE en, guess, primarySlot, reasonStatus
FROM "Learners/${userId}/Gaps"
WHERE type = "gap" AND contains(slots, "${role}")
SORT updatedAt DESC
LIMIT 30
\`\`\`

## 연습 루프

1. 앱 **Today → 패턴 약점 → ${title}** 으로 같은 슬롯만 반복
2. ${patternPracticeTip(role)}
3. 옵시디언에서 메운 뒤 앱에서「메움 완료」→ reasonStatus: reviewed. 남긴 단서는 다음 힌트에 다시 뜸

## 연습 팁

${patternTip(role)}

## 연결

- [[Gaps/_Index|Gaps]]
- [[Brain]]
${vaultLibraryBrainSection()}
`;

  return { path: patternPath(userId, role), markdown };
}

function patternTip(role: GapSlotRole): string {
  return `- ${patternPracticeTip(role)}`;
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
