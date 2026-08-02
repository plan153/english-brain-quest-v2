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
  GAP_FILL_PLACEHOLDER,
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
    expect(noun.some((f) => f.role === 'verb' && f.status === 'ok')).toBe(true);
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

  it('separates have+NP object from verb; friends≠plant is noun gap', () => {
    const slots = analyzeGapSlots({
      en: 'I have some friends living in Chicago.',
      guess: 'I have some plant in Chicago',
    });
    const problems = slots.filter((f) => f.status !== 'ok');
    expect(problems.some((f) => f.role === 'verb')).toBe(false);
    expect(problems.some((f) => f.role === 'noun' && f.status === 'wrong')).toBe(true);
    expect(problems.find((f) => f.role === 'noun')?.expected).toMatch(/friends/);
    expect(problems.find((f) => f.role === 'noun')?.actual).toMatch(/plant/);
    // 목적어가 틀리면 living 수식 누락은 가리지 않음
    expect(problems.some((f) => f.role === 'modifier')).toBe(false);

    const reason = inferGapReason({
      en: 'I have some friends living in Chicago.',
      ko: '나는 시카고에 사는 친구들이 있다.',
      guess: 'I have some plant in Chicago',
      match: 'wrong',
      cueMode: 'blind',
    });
    expect(reason).toContain('목적어');
    expect(reason).toContain('friends');
    expect(reason).toContain('【핵심 간극】');
    expect(reason).not.toMatch(/정답 동사「have some friends」/);
    expect(reason).not.toMatch(/정답「living」/);

    const modOnly = analyzeGapSlots({
      en: 'I have some friends living in Chicago.',
      guess: 'I have some friends in Chicago',
    });
    expect(modOnly.some((f) => f.role === 'noun' && f.status === 'ok')).toBe(true);
    expect(modOnly.some((f) => f.role === 'modifier' && f.status === 'missing')).toBe(true);
  });

  it('treats please / particle position flexibly for stand up', () => {
    const slots = analyzeGapSlots({
      en: 'Please stand up.',
      guess: 'stand up please',
    });
    expect(slots.filter((f) => f.status !== 'ok')).toHaveLength(0);

    const reason = inferGapReason({
      en: 'Please stand up.',
      ko: '일어나 주세요.',
      guess: 'stand up please',
      match: 'wrong',
      cueMode: 'after_listen',
    });
    expect(reason).not.toMatch(/정답 동사「please」/);
    expect(reason).not.toMatch(/말한 것「up」/);

    const match = FuzzyMatch.matchAnswer('stand up please', 'Please stand up.', {
      leniency: 1,
    });
    expect(match.level).toBe('exact');

    const standOnly = analyzeGapSlots({
      en: 'Please stand up.',
      guess: 'please sit down',
    });
    expect(standOnly.some((f) => f.role === 'verb' && f.status === 'wrong')).toBe(true);
    expect(standOnly.find((f) => f.role === 'verb')?.expected).toMatch(/stand/);
  });

  it('treats imperatives and have/take a look as a unit', () => {
    const slots = analyzeGapSlots({
      en: 'Have a look at this.',
      guess: 'take a look',
    });
    expect(slots.some((f) => f.role === 'subject' && f.status === 'wrong')).toBe(false);
    expect(slots.some((f) => f.role === 'verb' && f.status === 'ok')).toBe(true);
    expect(slots.some((f) => f.role === 'noun' && f.status === 'missing')).toBe(true);

    const reason = inferGapReason({
      en: 'Have a look at this.',
      ko: '이거 한번 봐요.',
      guess: 'take a look',
      match: 'wrong',
      cueMode: 'blind',
    });
    expect(reason).toContain('목적어');
    expect(reason).not.toContain('주어: 잘못');
    expect(reason).not.toMatch(/have at/);

    const fuzzy = FuzzyMatch.matchAnswer('take a look', 'Have a look at this.', {
      leniency: 1,
    });
    expect(['exact', 'fuzzy']).toContain(fuzzy.level);
  });

  it('treats have+adj+noun as lexical have, not perfect', () => {
    const slots = analyzeGapSlots({
      en: 'I have fond memories of playing hide-and-seek with my friends.',
      guess: 'I had the fund memory playing hide and seek with my friend',
    });
    const verb = slots.find((s) => s.role === 'verb');
    expect(verb?.expected).toBe('have');
    expect(verb?.expected).not.toContain('fond');
    const noun = slots.find((s) => s.role === 'noun');
    expect(noun?.expected?.toLowerCase()).toMatch(/memor/);
  });

  it('keeps have+past-participle as perfect auxiliary', () => {
    const slots = analyzeGapSlots({
      en: 'I have found my keys.',
      guess: 'I find my keys.',
    });
    const verb = slots.find((s) => s.role === 'verb');
    expect(verb?.expected).toMatch(/have found|found/);
  });

  it('rejects auto gap report text as learner clue', async () => {
    const { isAutoGapReportText, learnerFacingClue } = await import('../domain/gap-reason');
    const auto = inferGapReason({
      en: 'I have fond memories.',
      ko: '추억이 있다.',
      guess: 'I had fund memory.',
      match: 'wrong',
      cueMode: 'after_reveal',
    });
    expect(isAutoGapReportText(auto)).toBe(true);
    expect(
      learnerFacingClue({
        learnerClue: auto,
        reasonFinal: auto,
        reasonAuto: auto,
      })
    ).toBe('');
    expect(learnerFacingClue({ learnerClue: 'fond인데 fund로 들림' })).toBe(
      'fond인데 fund로 들림'
    );
  });

  it('flags a chip-vs-analysis slot mismatch only on a later day', async () => {
    const { hasSlotMismatch } = await import('../domain/gap-reason');
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const today = new Date().toISOString();
    // 칩으로 "목적어"를 골랐지만 배경 분석은 "동사"를 핵심으로 봄 — 다른 날이면 노출
    expect(
      hasSlotMismatch({ learnerClue: '목적어', primarySlot: 'verb', createdAt: yesterday })
    ).toBe(true);
    // 만든 당일엔 즉각 해설 금지 원칙상 노출 안 함
    expect(
      hasSlotMismatch({ learnerClue: '목적어', primarySlot: 'verb', createdAt: today })
    ).toBe(false);
    // 칩과 분석이 같으면 불일치 아님
    expect(
      hasSlotMismatch({ learnerClue: '동사', primarySlot: 'verb', createdAt: yesterday })
    ).toBe(false);
    // 자유 서술형 단서(칩 라벨이 아님)는 비교 대상이 아님
    expect(
      hasSlotMismatch({ learnerClue: '내가 쓴 자유 단서', primarySlot: 'verb', createdAt: yesterday })
    ).toBe(false);
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
        primarySlot: 'noun',
        packId: 'quiz-verbs',
        inputMode: 'type',
        learnerClue: '내가 고친 이유',
        reasonAuto: '자동 추정 이유',
        reasonFinal: '내가 고친 이유',
        reasonStatus: 'clued',
      },
    });
    expect(file.markdown).toContain('내 단서');
    expect(file.markdown).toContain('내가 고친 이유');
    expect(file.markdown).toContain('단서 저장');
    expect(file.markdown).toContain('① 스스로 찾기');
    expect(file.markdown).toContain('pattern/noun');
    expect(file.markdown).toContain('[[Patterns/noun');
    expect(file.markdown).toContain('inputMode: type');
    expect(file.markdown).toContain('primarySlot: noun');
    expect(file.markdown).toContain('옵시디언 메움');
    expect(file.markdown).toContain('다음 연습');
    expect(file.markdown).toContain('기본동사 100');
  });

  it('renders an existing vault fill instead of the placeholder', () => {
    const file = projectGap({
      userId: 'me',
      gap: {
        id: 'gap_e2_x',
        expressionId: 'e2',
        en: 'She needs help.',
        ko: '도움이 필요해요.',
        guess: 'She need help.',
        createdAt: '2026-07-27T00:00:00.000Z',
        match: 'wrong',
        learnerClue: '3인칭 s 빠짐',
        reasonStatus: 'reviewed',
        vaultFill: 'She + needs. 주어가 3인칭이면 동사에 s.',
      },
    });
    expect(file.markdown).toContain('She + needs. 주어가 3인칭이면 동사에 s.');
    expect(file.markdown).not.toContain(GAP_FILL_PLACEHOLDER);
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
import {
  parseGapMarkdown,
  parseGapFiles,
  mergeGapForVaultWrite,
  type ImportedGap,
} from '../domain/vault-gap-import';
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

  it('does not double-count sentences across slots in badge total', () => {
    const multi = [
      {
        id: 'g1',
        expressionId: 'e1',
        en: 'She needs help.',
        ko: '도움이 필요해요.',
        guess: 'She need help.',
        createdAt: '2026-07-27T00:00:00.000Z',
        slots: ['agreement', 'verb'] as const,
      },
    ];
    expect(countPatternTraining(multi)).toBe(1);
    expect(countPatternTraining(multi, 'agreement')).toBe(1);
    expect(countPatternTraining(multi, 'subject')).toBe(0);
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

  it('parses learner clue, slots, and Obsidian fill as reviewed', () => {
    const md = `---
type: gap
expressionId: e99
en: She needs help.
ko: 도움이 필요해요.
learnerClue: 3인칭 s 빠짐
reasonStatus: clued
primarySlot: agreement
slots: [agreement]
---

# Gap · She needs help.

## 내 단서
3인칭 s 빠짐

## 옵시디언 메움
She + needs. 주어가 3인칭이면 동사에 s.
`;
    const gap = parseGapMarkdown(md, 'Learners/me/Gaps/gap_e99_x.md');
    expect(gap?.learnerClue).toContain('3인칭');
    expect(gap?.primarySlot).toBe('agreement');
    expect(gap?.slots).toContain('agreement');
    expect(gap?.vaultFill).toContain('She + needs');
    expect(gap?.reasonStatus).toBe('reviewed');
  });

  it('ignores Obsidian fill placeholder', () => {
    const md = `---
type: gap
expressionId: e88
en: Hi.
ko: 안녕.
reasonStatus: clued
learnerClue: 짧게
---

## 옵시디언 메움

(여기에 영어식 사고로 메운 내용을 적으세요. 내용이 있으면 앱이 다음 힌트·reviewed로 가져갑니다.)
`;
    const gap = parseGapMarkdown(md, 'Learners/me/Gaps/gap_e88_x.md');
    expect(gap?.vaultFill).toBeUndefined();
    expect(gap?.reasonStatus).toBe('clued');
  });

  it('ignores the structured Obsidian fill guide when left untouched', () => {
    const md = `---
type: gap
expressionId: e89
en: Hi.
ko: 안녕.
reasonStatus: clued
learnerClue: 짧게
---

## 옵시디언 메움

${GAP_FILL_PLACEHOLDER}
`;
    const gap = parseGapMarkdown(md, 'Learners/me/Gaps/gap_e89_x.md');
    expect(gap?.vaultFill).toBeUndefined();
    expect(gap?.reasonStatus).toBe('clued');
  });

  it('extracts real content written inside the structured Obsidian fill guide', () => {
    const md = `---
type: gap
expressionId: e90
en: She needs help.
ko: 도움이 필요해요.
reasonStatus: clued
learnerClue: 3인칭 s 빠짐
---

## 옵시디언 메움

**왜 달랐나?**
3인칭 단수인데 s를 안 붙였다

**영어식 사고로 다시 조립**
*(정답 문장을 내 방식대로 다시 써보기)*

**내 문장 3개**
1. She needs a break.
2.
3.
`;
    const gap = parseGapMarkdown(md, 'Learners/me/Gaps/gap_e90_x.md');
    expect(gap?.vaultFill).toContain('3인칭 단수인데 s를 안 붙였다');
    expect(gap?.vaultFill).toContain('She needs a break.');
    expect(gap?.reasonStatus).toBe('reviewed');
  });

  it('parseGapFiles keeps the most recently updated file per expression', () => {
    const older = `---
type: gap
expressionId: e77
en: Old text.
ko: 오래된 문장.
updatedAt: 2026-07-20T00:00:00.000Z
learnerClue: old clue
---

# Gap · Old text.
`;
    const newer = `---
type: gap
expressionId: e77
en: New text.
ko: 새 문장.
updatedAt: 2026-07-28T00:00:00.000Z
learnerClue: new clue
---

# Gap · New text.
`;
    const gaps = parseGapFiles([
      { path: 'Learners/me/Gaps/gap_e77_20260720_aaa.md', content: older },
      { path: 'Learners/me/Gaps/gap_e77_20260728_bbb.md', content: newer },
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].en).toBe('New text.');
    expect(gaps[0].learnerClue).toBe('new clue');
  });

  it('mergeGapForVaultWrite preserves an existing Obsidian fill and promotes status to reviewed', () => {
    const gap: GapNote = {
      id: 'g1',
      expressionId: 'e1',
      en: 'She needs help.',
      ko: '도움이 필요해요.',
      guess: 'She need help.',
      createdAt: '2026-07-27T00:00:00.000Z',
      reasonStatus: 'clued',
      learnerClue: '3인칭 s 빠짐',
    };
    const existing: ImportedGap = {
      expressionId: 'e1',
      en: 'She needs help.',
      ko: '도움이 필요해요.',
      guess: 'She need help.',
      path: 'Learners/me/Gaps/g1.md',
      vaultFill: 'She + needs. 주어가 3인칭이면 동사에 s.',
      reasonStatus: 'reviewed',
    };
    const merged = mergeGapForVaultWrite(gap, existing);
    expect(merged.vaultFill).toContain('주어가 3인칭');
    expect(merged.reasonStatus).toBe('reviewed');
  });

  it('mergeGapForVaultWrite leaves the gap untouched when no vault file exists yet', () => {
    const gap: GapNote = {
      id: 'g2',
      expressionId: 'e2',
      en: 'Hi.',
      ko: '안녕.',
      guess: 'Hi',
      createdAt: '2026-07-27T00:00:00.000Z',
      reasonStatus: 'clued',
    };
    expect(mergeGapForVaultWrite(gap, null)).toEqual(gap);
  });

  it('full loop: a sync-then-write does not blank out a fill the learner wrote directly in Obsidian', () => {
    // 1) 첫 sync — 아직 메움 없음 → 플레이스홀더로 쓰임
    const gap: GapNote = {
      id: 'gap_e5_x',
      expressionId: 'e5',
      en: 'She needs help.',
      ko: '도움이 필요해요.',
      guess: 'She need help.',
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T00:00:00.000Z',
      reasonStatus: 'clued',
      learnerClue: '3인칭 s 빠짐',
    };
    const v1 = projectGap({ userId: 'me', gap });
    expect(v1.markdown).toContain(GAP_FILL_PLACEHOLDER);

    // 2) 학습자가 옵시디언에서 직접 "## 옵시디언 메움" 아래에 실제 내용을 씀
    const editedByLearner = v1.markdown.replace(
      GAP_FILL_PLACEHOLDER,
      'She는 3인칭 단수라서 동사에 -s. need가 아니라 needs.'
    );

    // 3) 앱이 아직 이 편집을 import하지 않은 채로 같은 gap을 다시 sync 하려는 상황
    //    (syncToVault가 쓰기 전 볼트를 읽어 병합하는 지점을 재현)
    const existing = parseGapMarkdown(editedByLearner, 'Learners/me/Gaps/gap_e5_x.md');
    const merged = mergeGapForVaultWrite(gap, existing);
    const v2 = projectGap({ userId: 'me', gap: merged });

    expect(v2.markdown).toContain('She는 3인칭 단수라서 동사에 -s. need가 아니라 needs.');
    expect(v2.markdown).not.toContain(GAP_FILL_PLACEHOLDER);
    expect(merged.reasonStatus).toBe('reviewed');
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

describe('9. practice band + placement', () => {
  it('recommends band from ladder pass rates', async () => {
    const { recommendPracticeBand } = await import('../domain/placement-engine');
    const trials = [
      { itemId: 'a', band: 'L1' as const, pass: true, match: 'exact' as const },
      { itemId: 'b', band: 'L1' as const, pass: true, match: 'exact' as const },
      { itemId: 'c', band: 'L2' as const, pass: true, match: 'fuzzy' as const },
      { itemId: 'd', band: 'L2' as const, pass: true, match: 'exact' as const },
      { itemId: 'e', band: 'L3' as const, pass: false, match: 'wrong' as const },
      { itemId: 'f', band: 'L3' as const, pass: false, match: 'wrong' as const },
    ];
    expect(recommendPracticeBand(trials).recommended).toBe('L2');
  });

  it('filters content by practice band but keeps weak pack intact', async () => {
    const {
      filterItemsForPracticeBand,
      mixRatiosForBand,
    } = await import('../domain/learner-level');
    const items: ContentItem[] = [
      {
        id: 's1',
        type: 'sentence',
        data: { en: 'I get it.', translations: { ko: '알겠어요.' } },
        translations: { ko: '알겠어요.' },
        tags: [],
        level: 1,
        packId: 'pack-starter',
      },
      {
        id: 'p1',
        type: 'sentence',
        data: { en: 'Would you mind waiting a bit?', translations: { ko: '기다려 주시겠어요?' } },
        translations: { ko: '기다려 주시겠어요?' },
        tags: [],
        level: 3,
        packId: 'phrasal-verbs',
      },
    ];
    const filtered = filterItemsForPracticeBand(items, 'L1', { packId: 'pack-starter' });
    expect(filtered.some((i) => i.id === 's1')).toBe(true);
    const weakKept = filterItemsForPracticeBand(items, 'L1', { packId: 'weak' });
    expect(weakKept).toHaveLength(2);
    expect(mixRatiosForBand('L1').easyRatio).toBeGreaterThan(mixRatiosForBand('L4').easyRatio);
  });

  it('accepts take a look on placement look item', async () => {
    const { scorePlacementAnswer } = await import('../domain/placement-engine');
    const r = scorePlacementAnswer('take a look at this', 'Have a look at this.');
    expect(r.pass).toBe(true);
  });
});

describe('10. comfort adapt', () => {
  it('raises after strong session', async () => {
    const { decideComfortAdapt } = await import('../domain/comfort-adapt');
    const d = decideComfortAdapt(
      {
        total: 10,
        answered: 10,
        correct: 8,
        fuzzy: 1,
        wrong: 1,
        skipped: 0,
        accuracy: 90,
        maxCombo: 6,
        xpEarned: 200,
        rank: 'A',
        fullyComplete: true,
      },
      'L2'
    );
    expect(d?.signal).toBe('raise');
    expect(d?.autoApplied).toBe(true);
    expect(d?.to).toBe('L3');
  });

  it('lowers when overwhelmed', async () => {
    const { decideComfortAdapt } = await import('../domain/comfort-adapt');
    const d = decideComfortAdapt(
      {
        total: 10,
        answered: 10,
        correct: 2,
        fuzzy: 1,
        wrong: 5,
        skipped: 2,
        accuracy: 30,
        maxCombo: 1,
        xpEarned: 40,
        rank: 'D',
        fullyComplete: true,
      },
      'L3'
    );
    expect(d?.signal).toBe('lower');
    expect(d?.to).toBe('L2');
  });
});

describe('11. quiz verbs pack', () => {
  it('catalog has 500 unique day sentences', async () => {
    const catalog = await import('../../data/canon/quiz-verbs/catalog.json');
    const items = (catalog as { default?: { items: unknown[] }; items?: unknown[] }).default?.items
      ?? (catalog as { items: unknown[] }).items;
    expect(items).toHaveLength(500);
  });
});

describe('12. conversation-100 pack', () => {
  it('catalog has 500 unique day sentences', async () => {
    const catalog = await import('../../data/canon/conversation-100/catalog.json');
    const items =
      (catalog as { default?: { items: unknown[] }; items?: unknown[] }).default?.items ??
      (catalog as { items: unknown[] }).items;
    expect(items).toHaveLength(500);
  });
});
