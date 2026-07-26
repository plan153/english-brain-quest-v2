/**
 * Conversation turn helpers for 평서↔의문 form-swap expand choices.
 * Browser: window.ExpandTurn
 * Node: module.exports
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ExpandTurn = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function stripEnd(text) {
    return String(text || '')
      .replace(/[’‘ʻʼ]/g, "'")
      .replace(/[.?!…]+$/u, '')
      .trim();
  }

  function isQuestionLike(en, ko = '') {
    const enRaw = String(en || '').trim();
    const koRaw = String(ko || '').trim();
    if (/\?\s*$/.test(enRaw) || /\?\s*$/.test(koRaw)) return true;
    const text = stripEnd(enRaw);
    if (!text) return false;
    if (/^(who|what|when|where|why|how|which)\b/i.test(text)) return true;
    if (/^(do|does|did|are|is|am|was|were|can|could|will|would|should|may|might)\b/i.test(text)) return true;
    if (/^(have|has|had)\s+(you|we|they|i|he|she|it)\b/i.test(text)) return true;
    return false;
  }

  /**
   * Resolve whether the source sentence is a statement or a question.
   * Priority: explicit formId/turn → visible sentence shape → last expand choice.
   */
  function resolveExpandTurn(options = {}) {
    const formId = options.formId || null;
    if (formId === 'question') return 'question';
    if (formId === 'shortYes' || formId === 'shortNo' || formId === 'statement' || formId === 'negative') {
      return 'statement';
    }
    if (options.turn === 'question' || options.turn === 'statement') return options.turn;

    // 화면에 보이는 원문 형태를 우선 (Do you have a minute? 가 평서로 잘못 잡히지 않게)
    if (options.en || options.ko) {
      return isQuestionLike(options.en, options.ko) ? 'question' : 'statement';
    }

    const lastChoice = options.lastExpandChoiceId || null;
    const sameExpression = !options.expressionId
      || !options.lastExpressionId
      || options.expressionId === options.lastExpressionId;
    if (sameExpression) {
      if (lastChoice === 'ask') return 'question';
      if (lastChoice === 'answer') return 'statement';
    }

    return 'statement';
  }

  function formSwapLabel(turn) {
    return turn === 'question' ? '평서문으로' : '의문문으로';
  }

  function formSwapDesc(turn) {
    return turn === 'question'
      ? '질문을 평서문 형태로 바꿔 말하기'
      : '평서문을 질문 형태로 바꿔 말하기';
  }

  function filterExpandChoices(choices, turn) {
    const safeTurn = turn === 'question' ? 'question' : 'statement';
    return (choices || []).filter(choice => {
      if (!choice) return false;
      // 듣기·따라말하기는 시드 카드에서 처리
      if (choice.id === 'listen' || choice.id === 'shadow') return false;
      if (choice.id === 'ask') return safeTurn === 'statement';
      if (choice.id === 'answer') return safeTurn === 'question';
      return true;
    });
  }

  function correctExpandChoiceId(choiceId, turn) {
    if (choiceId === 'ask' && turn === 'question') return 'answer';
    if (choiceId === 'answer' && turn === 'statement') return 'ask';
    return choiceId;
  }

  return {
    isQuestionLike,
    resolveExpandTurn,
    formSwapLabel,
    formSwapDesc,
    filterExpandChoices,
    correctExpandChoiceId,
  };
});
