/**
 * Verb matrix 4-form unlock gate helpers.
 * Core forms: statement · question · negative · shortAnswer (shortYes|shortNo).
 * Browser: window.VerbMatrixGate
 * Node: module.exports
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VerbMatrixGate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CORE_FORMS = ['statement', 'question', 'negative', 'shortAnswer'];
  // v2: starter = have only; packs prepend get → take → core_rest before give…
  // v3: starter = have·get·take·want·need·be·do·feel; packs = go/come/make → give → put → keep → find
  const VERB_GATE_SCHEMA_VERSION = 3;
  const LEGACY_PREPEND_PACK_COUNT = 3;

  function normalizeFormKey(formId) {
    const id = String(formId || '');
    if (id === 'shortYes' || id === 'shortNo') return 'shortAnswer';
    if (CORE_FORMS.includes(id)) return id;
    return '';
  }

  /** Map v2 pack count (9 packs) onto v3 pack count (5 packs). */
  function mapV2VerbPackCountToV3(oldCount) {
    const n = Math.max(0, Number(oldCount || 0));
    if (n <= 2) return 0; // get/take absorbed into starter
    if (n === 3) return 1; // core_rest → go/come/make
    if (n <= 6) return 2; // give (+ be/do absorbed into starter)
    if (n === 7) return 3; // put
    if (n === 8) return 4; // keep
    return 5; // find
  }

  function migrateVerbGateCurriculum(curriculum = {}) {
    const base = curriculum && typeof curriculum === 'object' ? curriculum : {};
    const version = Number(base.verbGateSchemaVersion || 1);
    if (version >= VERB_GATE_SCHEMA_VERSION) {
      return {
        ...base,
        verbGateSchemaVersion: VERB_GATE_SCHEMA_VERSION,
      };
    }
    const matrixFormSuccess = base.matrixFormSuccess && typeof base.matrixFormSuccess === 'object'
      ? base.matrixFormSuccess
      : {};
    let count = Math.max(0, Number(base.unlockedVerbPackCount || 0));
    if (version < 2) {
      const hasLegacyProgress = count > 0
        || Boolean(base.lastVerbUnlockAt)
        || Object.keys(matrixFormSuccess).length > 0;
      if (hasLegacyProgress) count += LEGACY_PREPEND_PACK_COUNT;
      // now treat as v2 count, then map to v3 below
    }
    if (version < 3) {
      count = mapV2VerbPackCountToV3(count);
    }
    return {
      ...base,
      unlockedVerbPackCount: count,
      verbGateSchemaVersion: VERB_GATE_SCHEMA_VERSION,
    };
  }

  function ensureMatrixFormSuccess(curriculum = {}) {
    const migrated = migrateVerbGateCurriculum(curriculum);
    return {
      ...migrated,
      unlockedPackCount: Number.isFinite(migrated.unlockedPackCount) ? migrated.unlockedPackCount : 0,
      unlockedVerbPackCount: Number.isFinite(migrated.unlockedVerbPackCount) ? migrated.unlockedVerbPackCount : 0,
      lastUnlockAt: migrated.lastUnlockAt || null,
      lastVerbUnlockAt: migrated.lastVerbUnlockAt || null,
      verbGateSchemaVersion: VERB_GATE_SCHEMA_VERSION,
      matrixFormSuccess: migrated.matrixFormSuccess && typeof migrated.matrixFormSuccess === 'object'
        ? { ...migrated.matrixFormSuccess }
        : {},
    };
  }

  function recordMatrixFormSuccess(curriculum, verbId, formId) {
    const next = ensureMatrixFormSuccess(curriculum);
    const verb = String(verbId || '');
    const formKey = normalizeFormKey(formId);
    if (!verb || !formKey) return { curriculum: next, recorded: false, formKey: '' };
    const current = { ...(next.matrixFormSuccess[verb] || {}) };
    current[formKey] = (current[formKey] || 0) + 1;
    next.matrixFormSuccess[verb] = current;
    return { curriculum: next, recorded: true, formKey };
  }

  function isVerbMatrixGatePassed(curriculum, verbId) {
    const forms = ensureMatrixFormSuccess(curriculum).matrixFormSuccess[verbId] || {};
    return CORE_FORMS.every(key => (forms[key] || 0) >= 1);
  }

  function verbsWithMatrices(verbIds, matrices) {
    const withMatrix = new Set((matrices || []).map(item => item.coreVerbId));
    return (verbIds || []).filter(id => withMatrix.has(id));
  }

  function getVerbGateSnapshot(curriculum, verbIds, matrices) {
    const required = verbsWithMatrices(verbIds, matrices);
    const rows = required.map(verbId => {
      const forms = ensureMatrixFormSuccess(curriculum).matrixFormSuccess[verbId] || {};
      const passedForms = CORE_FORMS.filter(key => (forms[key] || 0) >= 1);
      return {
        verbId,
        passed: passedForms.length === CORE_FORMS.length,
        passedCount: passedForms.length,
        total: CORE_FORMS.length,
        forms: Object.fromEntries(CORE_FORMS.map(key => [key, forms[key] || 0])),
      };
    });
    const passedCount = rows.filter(row => row.passed).length;
    return {
      requiredVerbIds: required,
      rows,
      passedCount,
      requiredCount: rows.length,
      allPassed: rows.length > 0 && passedCount === rows.length,
      coreForms: CORE_FORMS.slice(),
    };
  }

  function getUnlockedVerbIds(config, curriculum) {
    const starter = (config?.verbIds || []).slice();
    const packs = Array.isArray(config?.verbUnlockPacks) ? config.verbUnlockPacks : [];
    const count = Math.max(0, Number(ensureMatrixFormSuccess(curriculum).unlockedVerbPackCount || 0));
    const extra = [];
    packs.slice(0, count).forEach(pack => {
      (pack.verbIds || []).forEach(id => {
        if (!starter.includes(id) && !extra.includes(id)) extra.push(id);
      });
    });
    return [...starter, ...extra];
  }

  function getUnlockedVerbExpressionIds(config, curriculum) {
    const packs = Array.isArray(config?.verbUnlockPacks) ? config.verbUnlockPacks : [];
    const count = Math.max(0, Number(ensureMatrixFormSuccess(curriculum).unlockedVerbPackCount || 0));
    const ids = [];
    packs.slice(0, count).forEach(pack => {
      (pack.expressionIds || []).forEach(id => {
        if (!ids.includes(id)) ids.push(id);
      });
    });
    return ids;
  }

  function syncVerbUnlock(curriculum, config, matrices, options = {}) {
    let next = ensureMatrixFormSuccess(curriculum);
    const packs = Array.isArray(config?.verbUnlockPacks) ? config.verbUnlockPacks : [];
    let unlocked = Math.max(0, Number(next.unlockedVerbPackCount || 0));
    let changed = false;
    const announce = [];
    // Sequential gate: unlock the next pack only when all currently unlocked
    // verbs that have matrices (starter + already unlocked packs) pass 4-form.
    while (unlocked < packs.length) {
      const gateVerbIds = getUnlockedVerbIds(config, { ...next, unlockedVerbPackCount: unlocked });
      const snapshot = getVerbGateSnapshot(next, gateVerbIds, matrices);
      if (!snapshot.allPassed) break;
      unlocked += 1;
      changed = true;
      next.lastVerbUnlockAt = new Date().toISOString();
      const pack = packs[unlocked - 1];
      if (options.collectAnnounce) {
        announce.push({
          packId: pack?.id,
          verbIds: pack?.verbIds || [],
          expressionCount: pack?.expressionIds?.length || 0,
        });
      }
      next.unlockedVerbPackCount = unlocked;
    }
    next.unlockedVerbPackCount = unlocked;
    return { curriculum: next, changed, unlockedVerbPackCount: unlocked, announce };
  }

  return {
    CORE_FORMS,
    VERB_GATE_SCHEMA_VERSION,
    LEGACY_PREPEND_PACK_COUNT,
    mapV2VerbPackCountToV3,
    normalizeFormKey,
    migrateVerbGateCurriculum,
    ensureMatrixFormSuccess,
    recordMatrixFormSuccess,
    isVerbMatrixGatePassed,
    verbsWithMatrices,
    getVerbGateSnapshot,
    getUnlockedVerbIds,
    getUnlockedVerbExpressionIds,
    syncVerbUnlock,
  };
});
