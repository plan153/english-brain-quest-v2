/**
 * Learner progress storage + schema helpers (localStorage).
 * Keeps quiz progress SoT in the browser; Obsidian is derived.
 * Browser: window.ProgressStore
 * Node: module.exports
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ProgressStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LEGACY_PROGRESS_KEY = 'etdQuestProgress';
  const LEARNER_PROFILES_KEY = 'etdLearnerProfiles';
  const DEFAULT_LEARNER_ID = 'me';
  const DEFAULT_LEARNER_NAME = '나';

  function defaultLearnerStore() {
    return {
      activeLearnerId: DEFAULT_LEARNER_ID,
      learners: [{ id: DEFAULT_LEARNER_ID, name: DEFAULT_LEARNER_NAME, createdAt: new Date().toISOString() }],
    };
  }

  function hashString(text) {
    let hash = 0;
    const value = String(text || '');
    for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash) + value.charCodeAt(i);
    return hash || 1;
  }

  function makeLearnerId(name, existingIds = []) {
    const cleaned = String(name || '').trim();
    const ascii = cleaned
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    let base = ascii.length >= 2
      ? ascii.slice(0, 24)
      : `learner-${Math.abs(hashString(cleaned || 'x')).toString(36).slice(0, 6)}`;
    let candidate = base;
    let n = 2;
    while (existingIds.includes(candidate)) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    return candidate;
  }

  function getProgressStorageKey(learnerId) {
    return `etdQuestProgress:${learnerId || DEFAULT_LEARNER_ID}`;
  }

  function progressNamePrefixFor(learnerId) {
    return `ETD_PROGRESS:${learnerId || DEFAULT_LEARNER_ID}:`;
  }

  function defaultHistoryEntry() {
    return {
      lastAttemptedAt: null,
      lastCorrectAt: null,
      lastMeaningHitAt: null,
      timesSeen: 0,
      timesCorrect: 0,
      reviewPriority: 0,
      lastHintLevel: 0,
      connections: {
        recognition: { strength: 0, updatedAt: null },
        assembly: { strength: 0, updatedAt: null },
        output: { strength: 0, updatedAt: null },
      },
    };
  }

  function defaultDailyQuestV1() {
    return {
      version: 6,
      date: null,
      stepPlan: [],
      seedExpressionId: null,
      lastExpressionId: null,
      expandCount: 0,
      lastExpandChoiceId: null,
      currentIndex: 0,
      completedStepKeys: [],
      startedAt: null,
      finishedAt: null,
      isCompleted: false,
    };
  }

  function defaultVaultOverlay() {
    return {
      links: [],
      matches: [],
      lastFetchedAt: null,
      lastError: null,
    };
  }

  function defaultProgress() {
    return {
      xp: 0,
      streak: 0,
      lastStudyDate: null,
      successes: {},
      attempts: {},
      skipped: {},
      recentExpressionIds: [],
      daily: { date: null, done: [] },
      dailyQuestV1: defaultDailyQuestV1(),
      settings: {
        soundEnabled: true,
        seenConnectionGuide: false,
        // P2 policy lift (v1.3.0): default ON
        policyCanonAutoMerge: true,
        policyImportProgressFromVault: true,
        policyImportExplanationsFromVault: true,
        policyPhrasalInAssBank: true,
        // Implemented content freely usable (no unlock pack / verb gate / phrasal stage lock)
        policyOpenImplementedBank: true,
      },
      historyByExpressionId: {},
      curriculum: {
        unlockedPackCount: 0,
        unlockedVerbPackCount: 0,
        unlockedPhrasalStageCount: 0,
        lastUnlockAt: null,
        lastVerbUnlockAt: null,
        verbGateSchemaVersion: 3,
        matrixFormSuccess: {},
      },
      gapNotes: [],
      practiceEvents: [],
      expressionDrafts: [],
      canonUnlockQueue: [],
      canonExpressions: [],
      importedNextPractice: null,
      importedBrainState: null,
      vaultOverlay: defaultVaultOverlay(),
      explanations: [],
    };
  }

  function normalizeGapNote(entry, markdownApi) {
    const api = markdownApi || (typeof globalThis !== 'undefined' ? globalThis.EnglishBrainMarkdown : null);
    const base = entry && typeof entry === 'object' ? entry : {};
    const createdAt = base.createdAt || new Date().toISOString();
    const id = base.id || (api ? api.makeGapId({
      expressionId: base.expressionId,
      guess: base.guess,
      mode: base.mode,
      createdAt,
    }) : `gap_${base.expressionId || 'unknown'}`);
    return {
      id,
      expressionId: base.expressionId || '',
      english: base.english || '',
      naturalKorean: base.naturalKorean || '',
      mode: base.mode || '',
      guess: base.guess || '',
      actual: base.actual || base.english || '',
      missedClue: base.missedClue || '',
      modelUpdate: base.modelUpdate || '',
      verbWord: base.verbWord || '',
      verbId: base.verbId || '',
      createdAt,
      updatedAt: base.updatedAt || createdAt,
      status: base.status || 'open',
      source: base.source || 'webapp',
      missingInVault: Boolean(base.missingInVault),
    };
  }

  function normalizeHistoryEntry(entry) {
    const normalized = { ...defaultHistoryEntry(), ...(entry || {}) };
    normalized.lastHintLevel = entry?.lastHintLevel || 0;
    normalized.connections = {
      ...defaultHistoryEntry().connections,
      ...(entry?.connections || {}),
    };
    Object.entries(normalized.connections).forEach(([key, value]) => {
      normalized.connections[key] = {
        ...defaultHistoryEntry().connections[key],
        ...(value || {}),
      };
    });
    normalized.reviewPriority = typeof entry?.reviewPriority === 'number'
      ? entry.reviewPriority
      : normalized.reviewPriority;
    return normalized;
  }

  function normalizeExpressionDraft(entry, markdownApi) {
    const api = markdownApi || (typeof globalThis !== 'undefined' ? globalThis.EnglishBrainMarkdown : null);
    const base = entry && typeof entry === 'object' ? entry : {};
    const createdAt = base.createdAt || new Date().toISOString();
    const id = base.id || (api ? api.makeDraftId({
      expressionId: base.expressionId,
      english: base.english,
      source: base.source,
      createdAt,
    }) : `draft_${base.expressionId || 'new'}`);
    const draft = {
      id,
      status: base.status === 'approved' || base.status === 'archived' ? base.status : 'draft',
      english: base.english || '',
      naturalKorean: base.naturalKorean || '',
      literalMeaning: base.literalMeaning || '',
      coreVerb: base.coreVerb || base.verbWord || '',
      verbWord: base.verbWord || base.coreVerb || '',
      verbId: base.verbId || '',
      pattern: base.pattern || '',
      expressionId: base.expressionId || '',
      assEligible: base.assEligible !== false,
      source: base.source || 'manual',
      sourceGapId: base.sourceGapId || '',
      modelUpdate: base.modelUpdate || '',
      createdAt,
      updatedAt: base.updatedAt || createdAt,
    };
    if (api?.evaluatePromoteChecklist) {
      const evaluation = api.evaluatePromoteChecklist(draft);
      draft.promoteReady = evaluation.ready;
    }
    return draft;
  }

  function normalizeExplanationNote(entry, idApis) {
    if (!entry || typeof entry !== 'object') return null;
    const createdAt = entry.createdAt || new Date().toISOString();
    const api = idApis?.feynman || idApis?.markdown
      || (typeof globalThis !== 'undefined' ? (globalThis.FeynmanChallenge || globalThis.EnglishBrainMarkdown) : null);
    const id = entry.id || (api?.makeExplanationId
      ? api.makeExplanationId({ expressionId: entry.expressionId, createdAt, text: entry.explanation || entry.text })
      : `exp_${entry.expressionId || 'x'}`);
    return {
      id,
      expressionId: entry.expressionId || '',
      english: entry.english || '',
      naturalKorean: entry.naturalKorean || '',
      explanation: entry.explanation || entry.text || '',
      verbWord: entry.verbWord || '',
      verbId: entry.verbId || '',
      status: entry.status || 'draft',
      allowedRatio: Number(entry.allowedRatio) || 0,
      blockedWords: Array.isArray(entry.blockedWords) ? entry.blockedWords : [],
      speechTranscript: entry.speechTranscript || '',
      createdAt,
      updatedAt: entry.updatedAt || createdAt,
      source: entry.source || 'webapp',
    };
  }

  function normalizeVaultLink(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const notePath = entry.notePath || entry.path || '';
    const entityType = entry.entityType || '';
    const entityId = entry.entityId || '';
    if (!notePath) return null;
    return {
      id: entry.id || `${notePath}::${entityType}::${entityId || entry.noteWord || ''}`,
      notePath,
      noteWord: entry.noteWord || '',
      entityType,
      entityId,
      entityLabel: entry.entityLabel || entry.noteWord || notePath,
      confidence: entry.confidence || 'low',
      gate: entry.gate || 'background',
      relatedExpressionIds: Array.isArray(entry.relatedExpressionIds) ? entry.relatedExpressionIds.slice(0, 48) : [],
      status: entry.status === 'watchlist' || entry.status === 'dismissed' ? entry.status : 'confirmed',
      updatedAt: entry.updatedAt || new Date().toISOString(),
    };
  }

  function normalizeVaultOverlay(raw) {
    const base = raw && typeof raw === 'object' ? raw : {};
    return {
      ...defaultVaultOverlay(),
      links: Array.isArray(base.links) ? base.links.map(normalizeVaultLink).filter(Boolean) : [],
      matches: Array.isArray(base.matches) ? base.matches : [],
      lastFetchedAt: base.lastFetchedAt || null,
      lastError: base.lastError || null,
    };
  }

  function readProgressPayload(learnerId, storage, windowRef) {
    const storageKey = getProgressStorageKey(learnerId);
    const namePrefix = progressNamePrefixFor(learnerId);
    try {
      if (storage) {
        const raw = storage.getItem(storageKey);
        if (raw) return JSON.parse(raw);
      }
    } catch (_) {}
    try {
      if (windowRef && typeof windowRef.name === 'string' && windowRef.name.startsWith(namePrefix)) {
        return JSON.parse(windowRef.name.slice(namePrefix.length));
      }
    } catch (_) {}
    return null;
  }

  function writeProgressPayload(progress, learnerId, storage, windowRef) {
    const payload = JSON.stringify(progress);
    const storageKey = getProgressStorageKey(learnerId);
    const namePrefix = progressNamePrefixFor(learnerId);
    let saved = false;
    try {
      if (storage) {
        storage.setItem(storageKey, payload);
        saved = true;
      }
    } catch (_) {}
    try {
      if (windowRef) {
        windowRef.name = `${namePrefix}${payload}`;
        if (typeof windowRef.__etdQuestProgressFallback !== 'undefined') {
          windowRef.__etdQuestProgressFallback = payload;
        }
      }
    } catch (_) {}
    return saved;
  }

  function clearProgressPayload(learnerId, storage, windowRef) {
    const storageKey = getProgressStorageKey(learnerId);
    const namePrefix = progressNamePrefixFor(learnerId);
    try {
      if (storage) storage.removeItem(storageKey);
    } catch (_) {}
    try {
      if (windowRef && typeof windowRef.name === 'string' && windowRef.name.startsWith(namePrefix)) {
        windowRef.name = '';
      }
    } catch (_) {}
    try {
      if (windowRef) windowRef.__etdQuestProgressFallback = '';
    } catch (_) {}
  }

  function loadProgress(learnerId, options = {}) {
    try {
      const saved = options.saved || readProgressPayload(
        learnerId,
        options.storage,
        options.windowRef
      ) || {};
      const markdownApi = options.markdownApi;
      const feynmanApi = options.feynmanApi;
      return {
        ...defaultProgress(),
        ...saved,
        recentExpressionIds: saved.recentExpressionIds || [],
        dailyQuestV1: { ...defaultDailyQuestV1(), ...(saved.dailyQuestV1 || {}) },
        settings: { ...defaultProgress().settings, ...(saved.settings || {}) },
        historyByExpressionId: Object.fromEntries(
          Object.entries(saved.historyByExpressionId || {}).map(([id, history]) => [id, normalizeHistoryEntry(history)])
        ),
        curriculum: {
          ...defaultProgress().curriculum,
          ...(saved.curriculum || {}),
          matrixFormSuccess: {
            ...(defaultProgress().curriculum.matrixFormSuccess || {}),
            ...((saved.curriculum && saved.curriculum.matrixFormSuccess) || {}),
          },
        },
        gapNotes: Array.isArray(saved.gapNotes) ? saved.gapNotes.map(item => normalizeGapNote(item, markdownApi)) : [],
        practiceEvents: Array.isArray(saved.practiceEvents) ? saved.practiceEvents.slice(0, 40) : [],
        expressionDrafts: Array.isArray(saved.expressionDrafts)
          ? saved.expressionDrafts.map(item => normalizeExpressionDraft(item, markdownApi))
          : [],
        canonUnlockQueue: Array.isArray(saved.canonUnlockQueue) ? saved.canonUnlockQueue : [],
        canonExpressions: Array.isArray(saved.canonExpressions) ? saved.canonExpressions : [],
        importedNextPractice: saved.importedNextPractice && typeof saved.importedNextPractice === 'object'
          ? saved.importedNextPractice
          : null,
        importedBrainState: saved.importedBrainState && typeof saved.importedBrainState === 'object'
          ? saved.importedBrainState
          : null,
        vaultOverlay: normalizeVaultOverlay(saved.vaultOverlay),
        explanations: Array.isArray(saved.explanations)
          ? saved.explanations.map(item => normalizeExplanationNote(item, { feynman: feynmanApi, markdown: markdownApi })).filter(Boolean)
          : [],
      };
    } catch (_) {
      return defaultProgress();
    }
  }

  function readLearnerStoreRaw(storage) {
    try {
      if (!storage) return null;
      const raw = storage.getItem(LEARNER_PROFILES_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeLearnerStore(store, storage) {
    try {
      if (storage) storage.setItem(LEARNER_PROFILES_KEY, JSON.stringify(store));
    } catch (_) {}
  }

  function migrateLegacyProgressIfNeeded(learnerId, storage) {
    try {
      if (!storage) return;
      const legacy = storage.getItem(LEGACY_PROGRESS_KEY);
      if (!legacy) return;
      const namespaced = getProgressStorageKey(learnerId || DEFAULT_LEARNER_ID);
      if (!storage.getItem(namespaced)) storage.setItem(namespaced, legacy);
      storage.removeItem(LEGACY_PROGRESS_KEY);
    } catch (_) {}
  }

  function ensureLearnerProfiles(storage) {
    let store = readLearnerStoreRaw(storage);
    if (!store || !Array.isArray(store.learners) || !store.learners.length) {
      store = defaultLearnerStore();
      migrateLegacyProgressIfNeeded(DEFAULT_LEARNER_ID, storage);
      writeLearnerStore(store, storage);
      return store;
    }
    store.learners = store.learners
      .filter(item => item && item.id)
      .map(item => ({
        id: String(item.id),
        name: String(item.name || item.id),
        createdAt: item.createdAt || new Date().toISOString(),
      }));
    if (!store.learners.length) store = defaultLearnerStore();
    if (!store.learners.some(item => item.id === store.activeLearnerId)) {
      store.activeLearnerId = store.learners[0].id;
    }
    migrateLegacyProgressIfNeeded(store.activeLearnerId || DEFAULT_LEARNER_ID, storage);
    writeLearnerStore(store, storage);
    return store;
  }

  return {
    LEGACY_PROGRESS_KEY,
    LEARNER_PROFILES_KEY,
    DEFAULT_LEARNER_ID,
    DEFAULT_LEARNER_NAME,
    defaultLearnerStore,
    hashString,
    makeLearnerId,
    getProgressStorageKey,
    progressNamePrefixFor,
    defaultHistoryEntry,
    defaultDailyQuestV1,
    defaultVaultOverlay,
    defaultProgress,
    normalizeGapNote,
    normalizeHistoryEntry,
    normalizeExpressionDraft,
    normalizeExplanationNote,
    normalizeVaultLink,
    normalizeVaultOverlay,
    readProgressPayload,
    writeProgressPayload,
    clearProgressPayload,
    loadProgress,
    readLearnerStoreRaw,
    writeLearnerStore,
    migrateLegacyProgressIfNeeded,
    ensureLearnerProfiles,
  };
});
