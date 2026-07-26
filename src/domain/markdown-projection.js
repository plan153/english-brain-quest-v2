/**
 * Pure Markdown projection for Obsidian English-brain notes.
 * Path SoT: docs/OBSIDIAN_VAULT_EVOLUTION.md
 * Personal: Learners/<learnerId>/Learning|Gaps|Index
 * Shared: Library/ (Drafts, Canon, Verbs…)
 * Browser: window.EnglishBrainMarkdown
 * Node: module.exports
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EnglishBrainMarkdown = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function ymd(date = new Date()) {
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  }

  function escapeYaml(value) {
    const text = String(value ?? '');
    if (/[:#{}[\],&*?|>!%@`]/.test(text) || /^\s|\s$/.test(text) || text === '') {
      return JSON.stringify(text);
    }
    return text;
  }

  function shortHash(input) {
    let hash = 2166136261;
    const text = String(input || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).slice(0, 6);
  }

  function normalizeGuess(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[.?!,;:"'()[\]{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function makeGapId({ expressionId, guess, mode, createdAt }) {
    const date = createdAt ? new Date(createdAt) : new Date();
    const stamp = Number.isNaN(date.getTime()) ? ymd() : ymd(date);
    const digest = shortHash(`${expressionId}|${mode || ''}|${normalizeGuess(guess)}`);
    return `gap_${expressionId}_${stamp}_${digest}`;
  }

  function learnerVaultRoot(learnerId) {
    const id = String(learnerId || '').trim();
    return id ? `Learners/${id}` : '';
  }

  function withLearnerPath(relativePath, learnerId) {
    const root = learnerVaultRoot(learnerId);
    const path = String(relativePath || '').replace(/^\/+/, '');
    return root ? `${root}/${path}` : path;
  }

  function gapVaultPath(gapId, learnerId) {
    return withLearnerPath(`Gaps/${gapId}.md`, learnerId);
  }

  function gapWikiLink(gapId, learnerId) {
    const root = learnerVaultRoot(learnerId);
    return root ? `[[${root}/Gaps/${gapId}]]` : `[[Gaps/${gapId}]]`;
  }

  function learningWikiLink(noteName, learnerId) {
    const root = learnerVaultRoot(learnerId);
    return root ? `[[${root}/Learning/${noteName}]]` : `[[Learning/${noteName}]]`;
  }

  function learnerFrontmatter(options = {}) {
    if (!options.learnerId) return '';
    return `learnerId: ${escapeYaml(options.learnerId)}
learnerName: ${escapeYaml(options.learnerName || options.learnerId)}
`;
  }

  function yamlList(values) {
    if (!values || !values.length) return '[]';
    return `[${values.map(escapeYaml).join(', ')}]`;
  }

  function yamlWeakSlots(slots) {
    if (!slots || !slots.length) return '[]';
    return `\n${slots.map(slot => {
      const key = slot.expressionId ? 'expressionId' : (slot.patternId ? 'patternId' : 'id');
      const value = slot.expressionId || slot.patternId || slot.id;
      return `  - { ${key}: ${escapeYaml(value)}, reason: ${escapeYaml(slot.reason || '')} }`;
    }).join('\n')}`;
  }

  function yamlQueue(queue) {
    if (!queue || !queue.length) return '[]';
    return `\n${queue.map(item => `  - { expressionId: ${escapeYaml(item.expressionId)}, mode: ${escapeYaml(item.mode || 'review')}, reason: ${escapeYaml(item.reason || '')} }`).join('\n')}`;
  }

  function makeExplanationId({ expressionId, createdAt, text }) {
    const date = createdAt ? new Date(createdAt) : new Date();
    const stamp = Number.isNaN(date.getTime()) ? ymd() : ymd(date);
    const digest = shortHash(`${expressionId || ''}|${normalizeGuess(text).slice(0, 80)}`);
    return `exp_${expressionId || 'x'}_${stamp}_${digest}`;
  }

  function explanationVaultPath(explanationId, learnerId) {
    return withLearnerPath(`Learning/Explanations/${explanationId}.md`, learnerId);
  }

  function projectExplanation(note, options = {}) {
    const id = note.id || makeExplanationId(note);
    const path = explanationVaultPath(id, options.learnerId);
    const blocked = Array.isArray(note.blockedWords) ? note.blockedWords : [];
    const body = [
      '## 설명 (영어)',
      note.explanation || '(없음)',
      '',
      '## 대상 표현',
      note.english || note.expressionId || '',
      note.naturalKorean ? `- 한국어: ${note.naturalKorean}` : '',
      '',
      '## 제한 어휘 결과',
      `- 상태: ${note.status || 'draft'}`,
      `- 허용 비율: ${Math.round((Number(note.allowedRatio) || 0) * 100)}%`,
      `- 막힌 단어: ${blocked.length ? blocked.join(', ') : '(없음)'}`,
      '',
      '## 음성 인식',
      note.speechTranscript ? note.speechTranscript : '(텍스트만 제출)',
      '',
      '## 연결',
      note.expressionId ? `- 표현 ID: \`${note.expressionId}\`` : '',
      note.verbWord ? `- 동사: [[Verbs/${note.verbWord}]]` : '',
    ].filter(Boolean).join('\n');

    const markdown = `---
type: explanation
id: ${escapeYaml(id)}
vaultPath: ${escapeYaml(path)}
${learnerFrontmatter(options)}expressionId: ${escapeYaml(note.expressionId || '')}
createdAt: ${escapeYaml(note.createdAt || new Date().toISOString())}
updatedAt: ${escapeYaml(note.updatedAt || note.createdAt || new Date().toISOString())}
status: ${escapeYaml(note.status || 'draft')}
allowedRatio: ${Number(note.allowedRatio) || 0}
hasSpeech: ${note.speechTranscript ? 'true' : 'false'}
source: webapp
---

# Explanation · ${note.english || note.expressionId || id}

${body}
`;
    return { path, markdown, id };
  }

  function projectGapNote(gap, options = {}) {
    const id = gap.id || makeGapId(gap);
    const path = gapVaultPath(id, options.learnerId);
    const verbLink = gap.verbWord ? `[[Verbs/${gap.verbWord}]]` : '';
    const body = [
      '## 내 추측',
      gap.guess || '(없음)',
      '',
      '## 실제 의미 / 정답',
      gap.actual || gap.english || '',
      gap.naturalKorean ? `- 한국어: ${gap.naturalKorean}` : '',
      '',
      '## 놓친 단서',
      gap.missedClue || '(아직 적지 않음)',
      '',
      '## 모델 업데이트',
      gap.modelUpdate || '(아직 적지 않음)',
      '',
      '## 연결',
      verbLink ? `- 동사: ${verbLink}` : '- 동사: (없음)',
      gap.expressionId ? `- 표현 ID: \`${gap.expressionId}\`` : '',
      gap.mode ? `- 모드: ${gap.mode}` : '',
    ].filter(Boolean).join('\n');

    const markdown = `---
type: gap-note
id: ${escapeYaml(id)}
vaultPath: ${escapeYaml(path)}
${learnerFrontmatter(options)}expressionId: ${escapeYaml(gap.expressionId || '')}
mode: ${escapeYaml(gap.mode || '')}
createdAt: ${escapeYaml(gap.createdAt || new Date().toISOString())}
updatedAt: ${escapeYaml(gap.updatedAt || gap.createdAt || new Date().toISOString())}
status: ${escapeYaml(gap.status || 'open')}
source: webapp
---

# Gap · ${gap.english || gap.expressionId || id}

${body}
`;
    return { path, markdown, id };
  }

  function projectBrainState(state, options = {}) {
    const path = withLearnerPath('Learning/Brain State.md', options.learnerId);
    const weak = state.weakSlots || [];
    const openGaps = state.openGapIds || [];
    const watchlist = state.watchlist || [];
    const markdown = `---
type: brain-state
vaultPath: ${escapeYaml(path)}
${learnerFrontmatter(options)}updatedAt: ${escapeYaml(state.updatedAt || new Date().toISOString())}
activeVerbIds: ${yamlList(state.activeVerbIds || [])}
activeNounIds: ${yamlList(state.activeNounIds || [])}
activeExpressionCount: ${Number(state.activeExpressionCount || 0)}
masteredExpressionCount: ${Number(state.masteredExpressionCount || 0)}
weakSlots: ${yamlWeakSlots(weak)}
watchlist: ${yamlWeakSlots(watchlist.map(item => ({
  expressionId: item.entityId || item.expressionId || item.id,
  reason: item.reason || item.status || 'watchlist',
})))}
unlockReady: ${state.unlockReady ? 'true' : 'false'}
source: webapp
---

# Brain State

지금 입으로 훈련하는 Active Speaking Set 요약입니다.

## Active set
- 동사: ${(state.activeVerbWords || state.activeVerbIds || []).join(', ') || '(없음)'}
- 해금 표현: ${Number(state.activeExpressionCount || 0)}개
- 내 표현: ${Number(state.masteredExpressionCount || 0)}개
- 해금 준비: ${state.unlockReady ? '다음 pack 가능' : '아직 더 익히기'}

## 약한 슬롯
${weak.length ? weak.map(slot => `- ${slot.expressionId || slot.patternId}: ${slot.reason}`).join('\n') : '- (없음)'}

## Watchlist (해금 전 · 퀴즈 제외)
${watchlist.length ? watchlist.map(item => `- ${item.entityLabel || item.entityId || item.noteWord}: ${item.entityType || 'item'} · ${item.gate || 'later'}`).join('\n') : '- (없음)'}

## 열린 간극
${openGaps.length ? openGaps.map(id => `- ${gapWikiLink(id, options.learnerId)}`).join('\n') : '- (없음)'}
`;
    return { path, markdown };
  }

  function projectNextPractice(state, options = {}) {
    const path = withLearnerPath('Learning/Next Practice.md', options.learnerId);
    const queue = state.queue || [];
    const markdown = `---
type: next-practice
vaultPath: ${escapeYaml(path)}
${learnerFrontmatter(options)}updatedAt: ${escapeYaml(state.updatedAt || new Date().toISOString())}
queue: ${yamlQueue(queue)}
source: webapp
---

# Next Practice

앱이 약한 연결을 다시 만나도록 제안하는 순서입니다. Vault에서 순서를 바꿔도 됩니다.

${queue.length ? queue.map((item, index) => `${index + 1}. \`${item.expressionId}\` · ${item.mode || 'review'} · ${item.reason || ''}`).join('\n') : '1. (비어 있음)'}
`;
    return { path, markdown };
  }

  function projectProgress(state, options = {}) {
    const path = withLearnerPath('Learning/Progress.md', options.learnerId);
    const markdown = `---
type: progress
vaultPath: ${escapeYaml(path)}
${learnerFrontmatter(options)}updatedAt: ${escapeYaml(state.updatedAt || new Date().toISOString())}
xp: ${Number(state.xp || 0)}
streak: ${Number(state.streak || 0)}
unlockedPackCount: ${Number(state.unlockedPackCount || 0)}
mineCount: ${Number(state.mineCount || 0)}
activeExpressionCount: ${Number(state.activeExpressionCount || 0)}
openGapCount: ${Number(state.openGapCount || 0)}
source: webapp
---

# Progress

- XP: ${Number(state.xp || 0)}
- 연속 학습: ${Number(state.streak || 0)}일
- Active set 내 표현: ${Number(state.mineCount || 0)} / ${Number(state.activeExpressionCount || 0)}
- Unlock packs: ${Number(state.unlockedPackCount || 0)}
- 열린 간극: ${Number(state.openGapCount || 0)}

## 최근 영작 연습
${(state.recentPracticeEvents || []).length
    ? (state.recentPracticeEvents || []).map(event => `- ${event.at || ''} · ${event.resultType || ''} · \`${event.expressionId || ''}\` · ${event.guess || '(무응답)'} → ${event.en || ''}`).join('\n')
    : '- (아직 없음)'}
`;
    return { path, markdown };
  }

  function projectIndex(state, options = {}) {
    const path = withLearnerPath('English Brain Index.md', options.learnerId);
    const openGaps = state.openGapIds || [];
    const title = options.learnerName
      ? `English Brain Index · ${options.learnerName}`
      : 'English Brain Index';
    const markdown = `---
type: english-brain-index
vaultPath: ${escapeYaml(path)}
${learnerFrontmatter(options)}updatedAt: ${escapeYaml(state.updatedAt || new Date().toISOString())}
source: webapp
---

# ${title}

제2의 영어뇌 입구입니다. 교과서는 공유하고, 이 폴더는 개인 공책입니다.

- ${learningWikiLink('Brain State', options.learnerId)}
- ${learningWikiLink('Next Practice', options.learnerId)}
- ${learningWikiLink('Progress', options.learnerId)}
- Gaps: ${openGaps.length ? openGaps.map(id => gapWikiLink(id, options.learnerId)).join(', ') : '(없음)'}
- 자료 정원: [[Library/Index]]
`;
    return { path, markdown };
  }

  function makeDraftId({ expressionId, english, source, createdAt }) {
    const date = createdAt ? new Date(createdAt) : new Date();
    const stamp = Number.isNaN(date.getTime()) ? ymd() : ymd(date);
    const digest = shortHash(`${expressionId || ''}|${english || ''}|${source || 'manual'}`);
    return `draft_${expressionId || 'new'}_${stamp}_${digest}`;
  }

  function evaluatePromoteChecklist(draft = {}) {
    const hasEnglish = Boolean(String(draft.english || '').trim());
    const hasKorean = Boolean(String(draft.naturalKorean || '').trim());
    const hasVerb = Boolean(String(draft.coreVerb || draft.verbWord || '').trim());
    const hasPattern = Boolean(String(draft.pattern || '').trim());
    const literalOk = Object.prototype.hasOwnProperty.call(draft, 'literalMeaning');
    const checks = {
      hasEnglish,
      hasKorean,
      hasVerb,
      hasPattern,
      literalNoted: literalOk,
    };
    const missing = [];
    if (!hasEnglish) missing.push('영어');
    if (!hasKorean) missing.push('한글');
    if (!hasVerb) missing.push('동사');
    if (!hasPattern) missing.push('패턴');
    const ready = hasEnglish && hasKorean && hasVerb && hasPattern;
    return { checks, ready, promoteReady: ready, missing };
  }

  function draftVaultPath(draft) {
    const id = draft.id || makeDraftId(draft);
    const status = draft.status || 'draft';
    if (status === 'approved') return `Library/Canon/${id}.md`;
    return `Library/Drafts/${id}.md`;
  }

  function projectExpressionDraft(draft) {
    const normalized = { ...draft };
    const id = normalized.id || makeDraftId(normalized);
    normalized.id = id;
    const evaluation = evaluatePromoteChecklist(normalized);
    const status = normalized.status || 'draft';
    const path = draftVaultPath({ ...normalized, status });
    const verb = normalized.coreVerb || normalized.verbWord || '';
    const checklistLines = [
      `- [${evaluation.checks.hasEnglish ? 'x' : ' '}] english`,
      `- [${evaluation.checks.hasKorean ? 'x' : ' '}] naturalKorean (한글 연계)`,
      `- [${evaluation.checks.hasVerb ? 'x' : ' '}] coreVerb`,
      `- [${evaluation.checks.hasPattern ? 'x' : ' '}] pattern / 코로케이션`,
      `- [${evaluation.checks.literalNoted ? 'x' : ' '}] literalMeaning 필드 존재(의도적 비움 가능)`,
    ].join('\n');
    const gapLink = normalized.sourceGapId
      ? (normalized.learnerId
        ? gapWikiLink(normalized.sourceGapId, normalized.learnerId)
        : `[[Gaps/${normalized.sourceGapId}]]`)
      : '(없음)';
    const markdown = `---
type: expression-draft
id: ${escapeYaml(id)}
vaultPath: ${escapeYaml(path)}
status: ${escapeYaml(status)}
english: ${escapeYaml(normalized.english || '')}
naturalKorean: ${escapeYaml(normalized.naturalKorean || '')}
literalMeaning: ${escapeYaml(normalized.literalMeaning || '')}
coreVerb: ${escapeYaml(verb)}
pattern: ${escapeYaml(normalized.pattern || '')}
expressionId: ${escapeYaml(normalized.expressionId || '')}
assEligible: ${normalized.assEligible === false ? 'false' : 'true'}
source: ${escapeYaml(normalized.source || 'manual')}
sourceGapId: ${escapeYaml(normalized.sourceGapId || '')}
promoteReady: ${evaluation.ready ? 'true' : 'false'}
createdAt: ${escapeYaml(normalized.createdAt || new Date().toISOString())}
updatedAt: ${escapeYaml(normalized.updatedAt || normalized.createdAt || new Date().toISOString())}
sourceApp: webapp
---

# ${status === 'approved' ? 'Canon' : 'Draft'} · ${normalized.english || id}

> Vault 정원에서 자라는 표현 후보입니다. **approved 되기 전에는 앱 퀴즈에 넣지 마세요.**

## 영어 / 한국어
- EN: ${normalized.english || '(없음)'}
- KO: ${normalized.naturalKorean || '(없음)'}
- 직역/이미지: ${normalized.literalMeaning || '(비움)'}

## 생각 틀
- 동사: ${verb ? `[[Verbs/${verb}]]` : '(없음)'}
- 패턴: ${normalized.pattern || '(없음)'}
- 기존 표현 ID: ${normalized.expressionId ? `\`${normalized.expressionId}\`` : '(신규 후보)'}

## 승격 체크리스트
${checklistLines}

승격 준비: **${evaluation.ready ? 'YES — Canon으로 옮겨도 됨' : 'NO — 필드 보완 필요'}**

## 출처
- source: ${normalized.source || 'manual'}
- gap: ${gapLink}
- 모델 업데이트: ${normalized.modelUpdate || '(없음)'}
`;
    return { path, markdown, id, promoteReady: evaluation.ready, evaluation };
  }

  function projectLibraryIndex(state = {}) {
    const path = 'Library/Index.md';
    const drafts = state.drafts || [];
    const approved = drafts.filter(d => (d.status || 'draft') === 'approved');
    const openDrafts = drafts.filter(d => (d.status || 'draft') === 'draft');
    const markdown = `---
type: library-index
vaultPath: ${escapeYaml(path)}
updatedAt: ${escapeYaml(state.updatedAt || new Date().toISOString())}
draftCount: ${openDrafts.length}
canonCount: ${approved.length}
source: webapp
---

# Library · 학습 자료 정원

Vault에서 자료가 자라고, 웹앱은 **승격(Canon)된 것만** 연습합니다.

## 폴더
- \`Drafts/\` — 진화 중 후보
- \`Canon/\` — 승격 완료 (앱 JSON 반영 후보)
- \`Verbs/\` \`Nouns/\` \`Patterns/\` \`Scenes/\` — 배경 지식

## 지금 Drafts
${openDrafts.length ? openDrafts.map(d => `- [[Library/Drafts/${d.id}]] · ${d.english || d.id}`).join('\n') : '- (비어 있음)'}

## Canon
${approved.length ? approved.map(d => `- [[Library/Canon/${d.id}]] · ${d.english || d.id}`).join('\n') : '- (비어 있음)'}

## 루프
수집(Gap/장면) → Draft → 체크리스트 → Canon → (리뷰 후) Active Set / Unlock 후보
`;
    return { path, markdown };
  }

  function buildExportFiles({ brainState, nextPractice, progress, gaps, drafts, explanations, learnerId, learnerName }) {
    const options = { learnerId, learnerName };
    const files = {};
    const draftList = Array.isArray(drafts) ? drafts : [];
    const explanationList = Array.isArray(explanations) ? explanations : [];
    const index = projectIndex({
      updatedAt: brainState?.updatedAt,
      openGapIds: (gaps || []).filter(gap => (gap.status || 'open') === 'open').map(gap => gap.id),
    }, options);
    const projected = [
      index,
      projectBrainState(brainState || {}, options),
      projectNextPractice(nextPractice || {}, options),
      projectProgress(progress || {}, options),
      projectLibraryIndex({ updatedAt: brainState?.updatedAt, drafts: draftList }),
      ...(gaps || []).map(gap => projectGapNote(gap, options)),
      ...draftList.map(draft => projectExpressionDraft({ ...draft, learnerId })),
      ...explanationList.map(note => projectExplanation(note, options)),
    ];
    projected.forEach(file => {
      files[file.path] = file.markdown;
    });
    return files;
  }

  return {
    makeGapId,
    makeDraftId,
    makeExplanationId,
    learnerVaultRoot,
    withLearnerPath,
    gapVaultPath,
    explanationVaultPath,
    gapWikiLink,
    learningWikiLink,
    draftVaultPath,
    evaluatePromoteChecklist,
    projectGapNote,
    projectExplanation,
    projectExpressionDraft,
    projectLibraryIndex,
    projectBrainState,
    projectNextPractice,
    projectProgress,
    projectIndex,
    buildExportFiles,
    normalizeGuess,
    shortHash,
    ymd,
  };
});
