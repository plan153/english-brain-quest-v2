/**
 * Expand linking for continue / topic-shift.
 * Primary signal: Obsidian vault overlay links (confirmed/watchlist).
 * Fallback: curated relatedExpressionIds → topic/noun/situation heuristics.
 * Browser: window.TopicLink
 * Node: module.exports
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TopicLink = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TOPIC_DEFS = [
    {
      id: 'money',
      tags: ['money', 'pay', 'cost', 'shopping'],
      nouns: ['n_money', 'n_cash', 'n_bill', 'n_price', 'n_pay'],
      keywords: ['money', 'pay', 'cash', 'bill', 'price', 'cost', 'buy', 'expensive', 'cheap', '돈', '계산', '비싸', '싸'],
    },
    {
      id: 'time',
      tags: ['schedule', 'time'],
      nouns: ['n_time', 'n_minute', 'n_hour', 'n_tomorrow', 'n_today', 'n_week', 'n_day', 'n_morning', 'n_night'],
      keywords: ['time', 'minute', 'hour', 'tomorrow', 'today', 'schedule', 'late', 'early', 'wait', '시간', '분', '내일', '오늘', '늦', '일찍'],
    },
    {
      id: 'hobby',
      tags: ['hobby', 'fun', 'leisure', 'social', 'event'],
      nouns: ['n_fun', 'n_hobby', 'n_game', 'n_movie', 'n_music'],
      keywords: ['fun', 'hobby', 'movie', 'music', 'game', 'play', '취미', '재미', '영화', '음악', '놀'],
    },
    {
      id: 'work',
      tags: ['work', 'office', 'meeting', 'business'],
      nouns: ['n_work', 'n_meeting', 'n_office', 'n_job'],
      keywords: ['work', 'office', 'meeting', 'job', 'subway', 'commute', '출근', '회사', '회의', '지하철', '일'],
    },
    {
      id: 'food',
      tags: ['food', 'meal', 'cafe', 'hospitality'],
      nouns: ['n_coffee', 'n_lunch', 'n_dinner', 'n_food', 'n_water', 'n_meal'],
      keywords: ['coffee', 'lunch', 'dinner', 'eat', 'food', 'water', 'meal', '커피', '점심', '저녁', '먹', '물'],
    },
    {
      id: 'travel',
      tags: ['travel', 'transport'],
      nouns: ['n_way', 'n_home', 'n_here', 'n_there', 'n_bus', 'n_train'],
      keywords: ['travel', 'trip', 'bus', 'train', 'subway', 'airport', 'way', 'home', '여행', '버스', '지하철', '기차', '길', '집'],
    },
    {
      id: 'home',
      tags: ['home'],
      nouns: ['n_home', 'n_house', 'n_room'],
      keywords: ['home', 'house', 'room', '집', '방'],
    },
    {
      id: 'health',
      tags: ['health', 'emotion', 'comfort', 'encouragement', 'support'],
      nouns: ['n_feeling', 'n_help', 'n_break'],
      keywords: ['tired', 'sick', 'feel', 'health', 'rest', 'help', '피곤', '아프', '쉬', '건강', '기분'],
    },
    {
      id: 'learning',
      tags: ['learning', 'class', 'study', 'progress'],
      nouns: ['n_question', 'n_idea', 'n_try'],
      keywords: ['learn', 'study', 'class', 'question', 'idea', 'try', '배우', '공부', '수업', '질문', '생각'],
    },
    {
      id: 'social',
      tags: ['conversation', 'social', 'phone', 'message', 'request', 'farewell'],
      nouns: ['n_call', 'n_message', 'n_you', 'n_me'],
      keywords: ['call', 'message', 'talk', 'meet', 'thanks', '전화', '문자', '만나', '고마'],
    },
  ];

  function textOf(item) {
    return [
      item?.en,
      item?.english,
      item?.ko,
      item?.naturalKorean,
      item?.literalMeaning,
      item?.frame,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function topicsForExpression(item) {
    if (!item) return [];
    const tags = new Set((item.situationTags || []).map(tag => String(tag).toLowerCase()));
    const nouns = new Set((item.nounIds || []).map(id => String(id).toLowerCase()));
    const hay = textOf(item);
    const found = [];
    TOPIC_DEFS.forEach(topic => {
      let hit = false;
      if (topic.tags.some(tag => tags.has(tag))) hit = true;
      if (!hit && topic.nouns.some(id => nouns.has(id))) hit = true;
      if (!hit && topic.keywords.some(word => hay.includes(String(word).toLowerCase()))) hit = true;
      if (hit) found.push(topic.id);
    });
    return found;
  }

  function sharedCount(a, b) {
    const left = new Set(a || []);
    let count = 0;
    (b || []).forEach(value => {
      if (left.has(value)) count += 1;
    });
    return count;
  }

  function confidenceWeight(confidence) {
    if (confidence === 'high') return 3;
    if (confidence === 'medium') return 2;
    return 1;
  }

  function statusWeight(status) {
    if (status === 'dismissed') return 0;
    if (status === 'watchlist') return 0.45;
    return 1; // confirmed / default
  }

  function expressionTouchesLink(item, link) {
    if (!item || !link) return false;
    if (link.entityType === 'expression' && link.entityId === item.id) return true;
    if (link.entityType === 'verb' && link.entityId && link.entityId === item.coreVerbId) return true;
    if (link.entityType === 'pattern' && link.entityId && link.entityId === item.patternId) return true;
    if (link.entityType === 'noun' && link.entityId && (item.nounIds || []).includes(link.entityId)) return true;
    if ((link.relatedExpressionIds || []).includes(item.id)) return true;
    return false;
  }

  function linkWeight(link) {
    return statusWeight(link?.status) * confidenceWeight(link?.confidence);
  }

  /**
   * Build expressionId → vault strength map for neighbors of `fromItem`.
   * Strength = sum of shared vault-link weights (note/entity bridges).
   */
  function vaultNeighborStrengthMap(fromItem, bank, vaultLinks = []) {
    const scores = new Map();
    if (!fromItem) return scores;
    const list = Array.isArray(bank) ? bank : [];
    const byId = new Map(list.map(item => [item.id, item]));
    const links = (vaultLinks || []).filter(link => link && link.status !== 'dismissed');

    links.forEach(link => {
      if (!expressionTouchesLink(fromItem, link)) return;
      const weight = linkWeight(link);
      if (weight <= 0) return;

      const candidateIds = new Set(link.relatedExpressionIds || []);
      if (link.entityType === 'expression' && link.entityId) candidateIds.add(link.entityId);

      // Same vault note can bridge other confirmed expression entities.
      if (link.notePath) {
        links.forEach(other => {
          if (other === link) return;
          if (other.notePath !== link.notePath) return;
          if (other.status === 'dismissed') return;
          if (other.entityType === 'expression' && other.entityId) candidateIds.add(other.entityId);
          (other.relatedExpressionIds || []).forEach(id => candidateIds.add(id));
        });
      }

      candidateIds.forEach(id => {
        if (!id || id === fromItem.id) return;
        if (!byId.has(id)) return;
        const bridge = weight + (link.notePath ? 0.5 : 0);
        scores.set(id, (scores.get(id) || 0) + bridge);
      });
    });

    return scores;
  }

  function practiceConnectionStrength(historyByExpressionId, expressionId) {
    const connections = historyByExpressionId?.[expressionId]?.connections || {};
    const values = ['recognition', 'assembly', 'output']
      .map(key => Number(connections[key]?.strength || 0))
      .filter(value => Number.isFinite(value));
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function scoreLink(fromItem, toItem, options = {}) {
    if (!fromItem || !toItem || fromItem.id === toItem.id) return -Infinity;
    const mode = options.mode || 'continue';
    const vaultScores = options.vaultScores instanceof Map
      ? options.vaultScores
      : vaultNeighborStrengthMap(fromItem, options.bank || [], options.vaultLinks || []);
    const vaultStrength = Number(vaultScores.get(toItem.id) || 0);
    const history = options.historyByExpressionId || {};
    const practiceStrength = practiceConnectionStrength(history, toItem.id);

    let score = 0;

    // 1) Vault connection strength — primary axis
    if (vaultStrength > 0) {
      score += 200 + vaultStrength * 40;
      // Among vault neighbors, prefer expressions already stronger in the English brain.
      score += Math.min(24, practiceStrength * 8);
    }

    // 2) Curated expression related ids — secondary
    const related = new Set(fromItem.relatedExpressionIds || []);
    if (related.has(toItem.id)) score += vaultStrength > 0 ? 20 : 90;

    // 3) Topic / noun / tag heuristics — fallback only (lower weight)
    const fromTopics = topicsForExpression(fromItem);
    const toTopics = topicsForExpression(toItem);
    const topicOverlap = sharedCount(fromTopics, toTopics);
    const nounOverlap = sharedCount(fromItem.nounIds || [], toItem.nounIds || []);
    const tagOverlap = sharedCount(
      (fromItem.situationTags || []).map(tag => String(tag).toLowerCase()),
      (toItem.situationTags || []).map(tag => String(tag).toLowerCase())
    );
    const sameVerb = Boolean(fromItem.coreVerbId && fromItem.coreVerbId === toItem.coreVerbId);

    if (vaultStrength <= 0) {
      score += topicOverlap * 28;
      score += nounOverlap * 18;
      score += tagOverlap * 12;
      if (sameVerb) score += mode === 'continue' ? 10 : 6;
      if (mode === 'continue' && topicOverlap === 0 && nounOverlap === 0 && tagOverlap === 0) {
        score -= 16;
      }
    } else {
      // Soft topical coherence once vault already matched
      score += topicOverlap * 4;
      score += nounOverlap * 3;
      if (sameVerb) score += 4;
    }

    if (mode === 'topic') {
      if (vaultStrength > 0) score += 8;
      else if (topicOverlap > 0) score += 6;
      else score -= 4;
    }

    return score;
  }

  function pickLinkedExpression(fromExpressionId, bank, options = {}) {
    const mode = options.mode || 'continue';
    const list = Array.isArray(bank) ? bank : [];
    const current = list.find(item => item.id === fromExpressionId) || null;
    if (!current) return list[0] || null;

    const vaultScores = vaultNeighborStrengthMap(current, list, options.vaultLinks || []);
    const hasVaultNeighbors = [...vaultScores.values()].some(value => value > 0);

    // Continue: if vault neighbors exist, pick only among them (vault-first).
    if (mode === 'continue' && hasVaultNeighbors) {
      const vaultPool = list
        .filter(item => item && item.id !== current.id && (vaultScores.get(item.id) || 0) > 0)
        .map(item => ({
          item,
          score: scoreLink(current, item, {
            mode,
            vaultScores,
            vaultLinks: options.vaultLinks,
            historyByExpressionId: options.historyByExpressionId,
            bank: list,
          }),
        }))
        .sort((a, b) => b.score - a.score || String(a.item.id).localeCompare(String(b.item.id)));
      if (vaultPool.length) {
        const best = vaultPool[0].score;
        const top = vaultPool.filter(entry => entry.score >= best - 25);
        return top[Math.floor(Math.random() * top.length)].item;
      }
    }

    const scored = list
      .filter(item => item && item.id !== current.id)
      .map(item => ({
        item,
        score: scoreLink(current, item, {
          mode,
          vaultScores,
          vaultLinks: options.vaultLinks,
          historyByExpressionId: options.historyByExpressionId,
          bank: list,
        }),
      }))
      .filter(entry => Number.isFinite(entry.score))
      .sort((a, b) => b.score - a.score || String(a.item.id).localeCompare(String(b.item.id)));

    if (!scored.length) return current;

    const best = scored[0].score;
    const floor = mode === 'continue' ? Math.max(12, best - 18) : Math.max(6, best - 22);
    const top = scored.filter(entry => entry.score >= floor && entry.score > -10);
    const pool = top.length ? top : scored.slice(0, Math.min(5, scored.length));
    return pool[Math.floor(Math.random() * pool.length)].item;
  }

  return {
    TOPIC_DEFS,
    topicsForExpression,
    confidenceWeight,
    statusWeight,
    expressionTouchesLink,
    vaultNeighborStrengthMap,
    practiceConnectionStrength,
    scoreLink,
    pickLinkedExpression,
  };
});
