/**
 * Korean situation-verb vs English basic-verb + noun contrast.
 * Browser: window.ExpressionContrast
 * Node: module.exports
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ExpressionContrast = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_TIP = '한국어는 상황마다 동사가 갈라지고, 영어는 기본 동사 + 명사로 자주 조립합니다.';

  function clean(value) {
    return String(value || '').trim();
  }

  function normalizeContrast(raw, options = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const koVerb = clean(raw.koVerb || raw.koreanPattern || raw.koreanVerb);
    const enEngine = clean(raw.enEngine || raw.englishBasicVerb || raw.verb);
    const enNoun = clean(raw.enNoun || raw.noun || raw.englishNoun);
    const assembly = clean(raw.assembly || raw.englishAssembly)
      || (enEngine && enNoun ? `${enEngine} + ${enNoun}` : enEngine);
    const tip = clean(raw.tip || raw.principle) || DEFAULT_TIP;
    const wrongDirectTranslation = clean(raw.wrongDirectTranslation || raw.wrong || '');
    if (!koVerb && !assembly) return null;
    return {
      koVerb,
      enEngine,
      enNoun,
      assembly,
      tip,
      wrongDirectTranslation,
      source: clean(raw.source) || options.source || 'curated',
    };
  }

  /**
   * Derive a soft contrast from verb/noun/pattern when curated data is absent.
   * Only for expressions that look like basic-verb + noun assembly.
   */
  function deriveContrast(expression, collections = {}) {
    if (!expression) return null;
    const verbs = collections.verbs || [];
    const nouns = collections.nouns || [];
    const patterns = collections.patterns || [];
    const verb = verbs.find(item => item.id === expression.coreVerbId) || null;
    const pattern = patterns.find(item => item.id === expression.patternId) || null;
    const nounWords = (expression.nounIds || [])
      .map(id => nouns.find(item => item.id === id)?.word || '')
      .filter(Boolean)
      // Drop pronouns / deictics that are not the collocation noun.
      .filter(word => !['i', 'you', 'me', 'we', 'they', 'he', 'she', 'it', 'myself', 'myself'].includes(String(word).toLowerCase()));
    const enEngine = clean(verb?.word);
    const enNoun = nounWords.slice(0, 2).join(' · ');
    if (!enEngine || !enNoun) return null;
    const assembly = clean(pattern?.label) || `${enEngine} + ${enNoun}`;
    // Prefer Korean that reads like a single situation verb / predicate.
    const ko = clean(expression.naturalKorean).replace(/[.?!。？！]+$/u, '');
    return normalizeContrast({
      koVerb: ko,
      enEngine,
      enNoun,
      assembly,
      tip: DEFAULT_TIP,
      source: 'derived',
    });
  }

  function resolveContrast(expression, collections = {}) {
    const curated = normalizeContrast(expression?.contrast, { source: 'curated' });
    if (curated) return curated;
    return deriveContrast(expression, collections);
  }

  function contrastSummaryLine(contrast) {
    if (!contrast) return '';
    const left = contrast.koVerb || '한국어 상황 표현';
    const right = contrast.assembly || [contrast.enEngine, contrast.enNoun].filter(Boolean).join(' + ');
    if (!right) return left;
    return `${left} → ${right}`;
  }

  function contrastTeachingLines(contrast) {
    if (!contrast) return [];
    const lines = [];
    const summary = contrastSummaryLine(contrast);
    if (summary) lines.push(summary);
    if (contrast.tip) lines.push(contrast.tip);
    if (contrast.wrongDirectTranslation) {
      lines.push(`직역 주의: ${contrast.wrongDirectTranslation}`);
    }
    return lines;
  }

  function uniqueStrings(values) {
    const seen = new Set();
    const out = [];
    (values || []).forEach(value => {
      const text = clean(value);
      if (!text) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out;
  }

  function shuffleInPlace(list) {
    const arr = Array.isArray(list) ? list.slice() : [];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function canAssemble(expression, collections = {}) {
    const contrast = resolveContrast(expression, collections);
    return Boolean(contrast?.enEngine && contrast?.enNoun);
  }

  /**
   * Build a 2-step engine→noun quiz, then the learner produces the full sentence.
   */
  function buildAssembleQuiz(expression, options = {}) {
    const collections = options.collections || {};
    const bank = Array.isArray(options.bank) ? options.bank : [];
    const contrast = resolveContrast(expression, collections);
    if (!contrast?.enEngine || !contrast?.enNoun) return null;

    const enginePool = uniqueStrings([
      contrast.enEngine,
      ...(options.enginePool || []),
      ...bank.map(item => resolveContrast(item, collections)?.enEngine),
      'have', 'get', 'make', 'take', 'need', 'want', 'do', 'be', 'give', 'put',
    ]).filter(word => word.toLowerCase() !== contrast.enEngine.toLowerCase());

    const nounPool = uniqueStrings([
      contrast.enNoun,
      ...(options.nounPool || []),
      ...bank.map(item => resolveContrast(item, collections)?.enNoun),
      'a question', 'some time', 'a mistake', 'help', 'fun', 'a break', 'home', 'it',
    ]).filter(word => word.toLowerCase() !== contrast.enNoun.toLowerCase());

    const engineChoices = shuffleInPlace([
      contrast.enEngine,
      ...shuffleInPlace(enginePool).slice(0, 3),
    ]).slice(0, 4);
    if (!engineChoices.some(word => word.toLowerCase() === contrast.enEngine.toLowerCase())) {
      engineChoices[0] = contrast.enEngine;
    }

    const nounChoices = shuffleInPlace([
      contrast.enNoun,
      ...shuffleInPlace(nounPool).slice(0, 3),
    ]).slice(0, 4);
    if (!nounChoices.some(word => word.toLowerCase() === contrast.enNoun.toLowerCase())) {
      nounChoices[0] = contrast.enNoun;
    }

    return {
      expressionId: expression.id || '',
      promptKo: clean(expression.naturalKorean || expression.ko || contrast.koVerb),
      contrast,
      correctEngine: contrast.enEngine,
      correctNoun: contrast.enNoun,
      assembly: contrast.assembly,
      engineChoices,
      nounChoices,
      english: clean(expression.english || expression.en),
    };
  }

  return {
    DEFAULT_TIP,
    normalizeContrast,
    deriveContrast,
    resolveContrast,
    contrastSummaryLine,
    contrastTeachingLines,
    canAssemble,
    buildAssembleQuiz,
  };
});
