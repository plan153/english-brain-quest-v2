/**
 * 도메인 테스트 6종 — Phase 5.
 * 1. session-engine
 * 2. difficulty-mixer
 * 3. reward-engine
 * 4. vault-projection
 * 5. fuzzy-match
 * 6. makeGapId (cloud-sync 투영 ID)
 */
import { describe, expect, it } from 'vitest';
import {
  createSession,
  summarizeSession,
  INITIAL_PROGRESS,
  advance,
  replaceLastTrial,
} from '../domain/session-engine';
import type { ContentItem } from '../interfaces/ContentItem';
import { mixDifficulty, verifyMixRatio, DEFAULT_SKILL_PROFILE } from '../domain/difficulty-mixer';
import {
  levelFromXp,
  computeTrialReward,
  comboBonus,
  computeSessionCompletionRewards,
} from '../domain/reward-engine';
import {
  projectBrain,
  projectProgress,
  projectGap,
  projectVaultScaffold,
  makeGapId,
  brainPath,
} from '../domain/vault-projection';
import FuzzyMatch from '../domain/fuzzy-match';
import { analyzeGapSlots, inferGapReason, problemSlots } from '../domain/gap-reason';
import {
  applyReview,
  createMemory,
  markOwned,
  pickReviewQueue,
  pickWeakTrainingQueue,
  summarizeWeakLinks,
} from '../domain/srs-engine';

function fakeItem(id: string, level = 1): ContentItem {
  return {
    id,
    type: 'sentence',
    data: { en: `Hello ${id}`, translations: { ko: `안녕 ${id}` } },
    translations: { ko: `안녕 ${id}` },
    tags: [],
    form: 'statement',
    level,
    packId: 'test',
  };
}

describe('1. session-engine', () => {
  it('creates a session with difficulty tags and summarizes rank', () => {
    const items = Array.from({ length: 10 }, (_, i) => fakeItem(`e${i}`, i < 2 ? 1 : i > 8 ? 3 : 2));
    const plan = createSession(items, { size: 10 });
    expect(plan.total).toBe(10);
    expect(plan.sentences.length).toBe(10);
    expect(plan.challengeCount + plan.easyCount + plan.normalCount).toBe(10);

    let progress = { ...INITIAL_PROGRESS };
    for (let i = 0; i < 10; i++) {
      progress = advance(progress, {
        sentence: plan.sentences[i],
        response: { text: plan.sentences[i].en },
        evaluation: { match: 'exact', score: 1, feedback: 'ok' },
        xpDelta: 20,
        comboDelta: 1,
      });
      // 중간 trial에서는 finished를 켜지 않음 (total은 store가 판정)
      if (i < 9) expect(progress.finished).toBe(false);
    }
    const summary = summarizeSession(progress, 10);
    expect(summary.correct).toBe(10);
    expect(summary.rank).toBe('S');
    expect(summary.accuracy).toBe(100);
    expect(summary.fullyComplete).toBe(true);
    expect(summary.answered).toBe(10);
  });

  it('does not mark finished after the first correct answer', () => {
    const items = Array.from({ length: 10 }, (_, i) => fakeItem(`e${i}`));
    const plan = createSession(items, { size: 10 });
    const progress = advance({ ...INITIAL_PROGRESS }, {
      sentence: plan.sentences[0],
      response: { text: plan.sentences[0].en },
      evaluation: { match: 'exact', score: 1, feedback: 'ok' },
      xpDelta: 20,
      comboDelta: 1,
    });
    expect(progress.completed).toBe(1);
    expect(progress.index).toBe(1);
    expect(progress.finished).toBe(false);
  });

  it('replaceLastTrial keeps index and swaps wrong→exact', () => {
    const items = Array.from({ length: 5 }, (_, i) => fakeItem(`r${i}`));
    const plan = createSession(items, { size: 5 });
    const first = {
      sentence: plan.sentences[0],
      response: { text: 'nope' },
      evaluation: { match: 'wrong' as const, score: 0, feedback: 'x' },
      xpDelta: 3,
      comboDelta: 0,
    };
    let progress = advance({ ...INITIAL_PROGRESS }, first);
    expect(progress.wrong).toBe(1);
    expect(progress.index).toBe(1);
    const retry = {
      ...first,
      response: { text: plan.sentences[0].en },
      evaluation: { match: 'exact' as const, score: 1, feedback: 'ok' },
      xpDelta: 20,
      comboDelta: 1,
    };
    progress = replaceLastTrial(progress, first, retry);
    expect(progress.index).toBe(1);
    expect(progress.completed).toBe(1);
    expect(progress.wrong).toBe(0);
    expect(progress.correct).toBe(1);
    expect(progress.xpEarned).toBe(20);
  });
});

describe('1c. early-end summary rewards', () => {
  it('does not grant full completion XP for 1/10 answers', () => {
    const summary = summarizeSession(
      {
        ...INITIAL_PROGRESS,
        index: 1,
        completed: 1,
        wrong: 1,
      },
      10
    );
    expect(summary.fullyComplete).toBe(false);
    expect(summary.answered).toBe(1);
    const rewards = computeSessionCompletionRewards(summary, new Set());
    expect(rewards.completionXp).toBe(2); // answered * 2
    expect(rewards.rankXp).toBe(0);
  });
});

describe('1b. fuzzy-match contractions', () => {
  it('treats you will as equal to you will contraction and ignores commas', () => {
    const expected = "If you don't hurry, you'll be late.";
    const user = "If you don't hurry you will be late";
    const result = FuzzyMatch.matchAnswer(user, expected);
    expect(result.level).toBe('exact');
  });

  it('accepts dont / do not as the same', () => {
    const result = FuzzyMatch.matchAnswer(
      'I do not know',
      "I don't know"
    );
    expect(result.level).toBe('exact');
  });
});

describe('1d. srs-engine', () => {
  it('schedules review and auto-owns after exact×2', () => {
    let mem = createMemory('s1', 'Hello', '안녕');
    mem = applyReview(mem, 'exact', 'normal');
    expect(mem.owned).toBe(false);
    mem = applyReview(mem, 'exact', 'normal');
    expect(mem.owned).toBe(true);
    expect(mem.ownedReason).toBe('auto-exact2');
    expect(mem.intervalDays).toBeGreaterThan(0);
  });

  it('auto-owns on wrong→exact recover', () => {
    let mem = createMemory('s2', 'Bye', '잘가');
    mem = applyReview(mem, 'wrong', 'normal');
    expect(mem.owned).toBe(false);
    mem = applyReview(mem, 'exact', 'normal', { previousWrong: true });
    expect(mem.owned).toBe(true);
    expect(mem.ownedReason).toBe('auto-recover');
  });

  it('gives longer interval for blind success than reveal', () => {
    let blind = createMemory('b1', 'Hi', '안녕');
    blind = applyReview(blind, 'exact', 'normal', { cueMode: 'blind' });
    let reveal = createMemory('r1', 'Hi', '안녕');
    reveal = applyReview(reveal, 'exact', 'normal', { cueMode: 'after_reveal' });
    expect(blind.intervalDays).toBeGreaterThan(reveal.intervalDays);
    expect(blind.blindCorrect).toBe(1);
    expect(reveal.revealCorrect).toBe(1);
  });
});

describe('2. difficulty-mixer', () => {
  it('mixes near 10/80/10 ratio', () => {
    const items = Array.from({ length: 20 }, (_, i) => fakeItem(`m${i}`, (i % 3) + 1));
    const mixed = mixDifficulty(items, {
      challengeRatio: 0.1,
      easyRatio: 0.1,
      skill: DEFAULT_SKILL_PROFILE,
      shuffle: false,
    });
    const ratio = verifyMixRatio(mixed);
    expect(ratio.total).toBe(20);
    expect(ratio.challenge).toBeGreaterThanOrEqual(1);
    expect(ratio.easy).toBeGreaterThanOrEqual(1);
    expect(ratio.challenge + ratio.easy + ratio.normal).toBe(20);
  });
});

describe('3. reward-engine', () => {
  it('levels from XP and awards trial XP with combo', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(100).level).toBeGreaterThanOrEqual(2);
    expect(comboBonus(5)).toBeGreaterThan(0);

    const reward = computeTrialReward(
      { match: 'exact', score: 1, feedback: 'ok' },
      { tier: 'challenge', combo: 5, isFirstCorrect: true },
      0,
      new Set()
    );
    expect(reward.totalXp).toBeGreaterThan(20);
    expect(reward.newBadges.some((b) => b.id === 'first_correct')).toBe(true);
  });
});

describe('4. vault-projection', () => {
  it('projects Brain.md under Learners/<userId>', () => {
    const progress = {
      xp: 40,
      level: 1,
      streakDays: 2,
      todaySentenceCount: 5,
      correctCount: 4,
      attemptCount: 5,
      totalSentences: 5,
    };
    const brain = projectBrain({
      userId: 'local-test',
      skill: DEFAULT_SKILL_PROFILE,
      badges: [],
      progress,
    });
    expect(brain.path).toBe(brainPath('local-test'));
    expect(brain.markdown).toContain('type: brain-state');
    expect(brain.markdown).toContain('Brain State');

    const prog = projectProgress({ userId: 'local-test', progress });
    expect(prog.path).toContain('Progress.md');
    expect(prog.markdown).toContain('정답률');
  });

  it('embeds due and weak-link sections from SRS summary', () => {
    const now = new Date('2026-07-27T00:00:00.000Z');
    let mem = createMemory('e130', "It's there.", '거기 있어요. (물건)', now);
    mem = applyReview(mem, 'wrong', 'normal', { cueMode: 'after_reveal' });
    mem = applyReview(mem, 'wrong', 'normal', { cueMode: 'after_reveal' });
    mem.nextReviewAt = new Date('2026-07-26T00:00:00.000Z').toISOString();

    const weakLinks = summarizeWeakLinks([mem], { now });
    expect(weakLinks.dueCount).toBeGreaterThanOrEqual(1);
    expect(weakLinks.weak.length).toBeGreaterThanOrEqual(1);

    const progress = {
      xp: 100,
      level: 2,
      streakDays: 1,
      todaySentenceCount: 3,
      correctCount: 1,
      attemptCount: 3,
      totalSentences: 3,
    };
    const brain = projectBrain({
      userId: 'me',
      skill: DEFAULT_SKILL_PROFILE,
      badges: [],
      progress,
      weakLinks,
    });
    expect(brain.markdown).toContain('복습 대기');
    expect(brain.markdown).toContain('약한 고리');
    expect(brain.markdown).toContain("It's there.");
    expect(brain.markdown).toContain('dueCount:');

    const prog = projectProgress({ userId: 'me', progress, weakLinks });
    expect(prog.markdown).toContain('지금 복습하면 좋은 문장');
    expect(prog.markdown).toContain("It's there.");
  });
});

describe('5. fuzzy-match', () => {
  it('accepts exact and near answers with beginner leniency', () => {
    const exact = FuzzyMatch.matchAnswer('I have a question.', 'I have a question.', {
      leniency: 1,
    });
    expect(exact.level).toBe('exact');

    const fuzzy = FuzzyMatch.matchAnswer('I have question', 'I have a question.', {
      leniency: 1,
    });
    expect(['exact', 'fuzzy']).toContain(fuzzy.level);
  });
});

describe('6. makeGapId', () => {
  it('is stable for same expression+guess', () => {
    const a = makeGapId('e001', 'I go home');
    const b = makeGapId('e001', 'I go home');
    expect(a).toBe(b);
    expect(a.startsWith('gap_e001_')).toBe(true);
  });
});

describe('6b. gap-reason + projectGap', () => {
  it('infers skip and structural slot reasons', () => {
    expect(
      inferGapReason({
        en: 'Do you need help?',
        ko: '도움이 필요하세요?',
        guess: '(스킵)',
        match: 'skipped',
      })
    ).toContain('건너뛰');

    const wrong = inferGapReason({
      en: 'I have a question.',
      ko: '질문이 있어요.',
      guess: 'I have',
      match: 'wrong',
      cueMode: 'blind',
    });
    expect(wrong).toContain('힌트 없이');
    expect(wrong).toMatch(/명사|question/);
  });

  it('flags wrong subject, missing noun, tense, and 3sg', () => {
    const subject = analyzeGapSlots({
      en: 'She needs help.',
      guess: 'He needs help.',
    });
    expect(subject.some((f) => f.role === 'subject' && f.status === 'wrong')).toBe(true);

    const noun = analyzeGapSlots({
      en: 'I have a question.',
      guess: 'I have',
    });
    expect(noun.some((f) => f.role === 'noun' && f.status === 'missing')).toBe(true);

    const tense = analyzeGapSlots({
      en: 'I went home.',
      guess: 'I go home.',
    });
    expect(tense.some((f) => f.role === 'tense' && f.status === 'wrong')).toBe(true);

    const agr = analyzeGapSlots({
      en: 'She needs help.',
      guess: 'She need help.',
    });
    expect(agr.some((f) => f.role === 'agreement' && f.status === 'wrong')).toBe(true);

    const text = inferGapReason({
      en: 'She needs help.',
      ko: '그녀는 도움이 필요해요.',
      guess: 'He need help.',
      match: 'wrong',
      cueMode: 'blind',
    });
    expect(text).toContain('주어');
    expect(text).toMatch(/3인칭|동사/);
  });

  it('writes reason into gap markdown', () => {
    const file = projectGap({
      userId: 'me',
      gap: {
        id: 'gap_e1_x',
        expressionId: 'e1',
        en: 'Hello.',
        ko: '안녕.',
        guess: 'Hi',
        createdAt: '2026-07-27T00:00:00.000Z',
        match: 'wrong',
        slots: ['noun'],
        inputMode: 'type',
        reasonAuto: '자동 추정 이유',
        reasonFinal: '내가 고친 이유',
        reasonStatus: 'edited',
      },
    });
    expect(file.markdown).toContain('간극이 생긴 이유');
    expect(file.markdown).toContain('내가 고친 이유');
    expect(file.markdown).toContain('사용자 수정');
    expect(file.markdown).toContain('처음 추정');
    expect(file.markdown).toContain('pattern/noun');
    expect(file.markdown).toContain('[[Patterns/noun');
    expect(file.markdown).toContain('inputMode: type');
  });

  it('scaffolds Gaps index and Patterns hubs', () => {
    const files = projectVaultScaffold('me');
    expect(files.some((f) => f.path.endsWith('Gaps/_Index.md'))).toBe(true);
    expect(files.some((f) => f.path.endsWith('Patterns/subject.md'))).toBe(true);
    expect(files.find((f) => f.path.includes('_Index'))?.markdown).toContain('dataview');
    expect(problemSlots({ en: 'She needs help.', guess: 'He need help.' }).length).toBeGreaterThan(0);
  });
});

import { createZipBlob } from '../adapters/zip-store';
import { parseGapMarkdown } from '../domain/vault-gap-import';
import {
  countPatternTraining,
  pickPatternTrainingQueue,
  summarizePatternGaps,
} from '../domain/pattern-queue';
import type { GapNote } from '../domain/vault-projection';

describe('9. pattern-queue', () => {
  const gaps: GapNote[] = [
    {
      id: 'g1',
      expressionId: 'e1',
      en: 'She needs help.',
      ko: '도움이 필요해요.',
      guess: 'She need help.',
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T00:00:00.000Z',
      slots: ['agreement'],
      reasonStatus: 'pending',
    },
    {
      id: 'g2',
      expressionId: 'e2',
      en: 'I went home.',
      ko: '집에 갔어요.',
      guess: 'I go home.',
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T01:00:00.000Z',
      slots: ['tense', 'verb'],
      reasonStatus: 'confirmed',
    },
    {
      id: 'g3',
      expressionId: 'e3',
      en: 'He is here.',
      ko: '그가 여기 있어요.',
      guess: 'She is here.',
      createdAt: '2026-07-27T00:00:00.000Z',
      slots: ['subject'],
    },
  ];

  it('summarizes slots and picks agreement queue', () => {
    const summary = summarizePatternGaps(gaps);
    expect(summary.some((r) => r.role === 'agreement')).toBe(true);
    expect(countPatternTraining(gaps)).toBeGreaterThanOrEqual(3);

    const queue = pickPatternTrainingQueue(gaps, {}, { role: 'agreement', limit: 5 });
    expect(queue).toHaveLength(1);
    expect(queue[0].sentenceId).toBe('e1');
    expect(queue[0].role).toBe('agreement');
  });

  it('auto-fills from top roles when role omitted', () => {
    const queue = pickPatternTrainingQueue(gaps, {}, { limit: 10 });
    expect(queue.length).toBeGreaterThanOrEqual(3);
    const ids = new Set(queue.map((q) => q.sentenceId));
    expect(ids.has('e1')).toBe(true);
    expect(ids.has('e2')).toBe(true);
  });
});

describe('7. zip-store', () => {
  it('builds a zip with PK headers', async () => {
    const blob = createZipBlob([
      { path: 'Learners/me/Learning/Brain.md', content: '# Brain\n' },
      { path: 'Learners/me/Learning/Progress.md', content: '# Progress\n' },
    ]);
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K
    expect(blob.size).toBeGreaterThan(40);
  });
});

describe('8. vault-gap-import + weak queue', () => {
  it('parses legacy webapp gap notes', () => {
    const md = `---
type: gap-note
expressionId: e015
---

# Gap · e015

## 내 추측
안전하게 있어.
## 실제 의미 / 정답
Do you need help?
- 한국어: 도움이 필요하세요?
`;
    const gap = parseGapMarkdown(md, 'Learners/me/Gaps/gap_e015_x.md');
    expect(gap?.expressionId).toBe('e015');
    expect(gap?.en).toBe('Do you need help?');
    expect(gap?.ko).toContain('도움');
  });

  it('builds weak training queue from wrong memories', () => {
    const now = new Date('2026-07-27T00:00:00.000Z');
    let mem = createMemory('e130', "It's there.", '거기 있어요.', now);
    mem = applyReview(mem, 'wrong', 'normal', { cueMode: 'after_reveal' });
    mem = applyReview(mem, 'wrong', 'normal', { cueMode: 'after_reveal' });
    const queue = pickWeakTrainingQueue([mem], 5, now);
    expect(queue.some((m) => m.sentenceId === 'e130')).toBe(true);
  });
});
