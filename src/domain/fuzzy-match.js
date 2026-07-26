/**
 * fuzzy-match.js
 * Phase 1 신규: 사소한 부정합 허용 채점 엔진.
 *
 * 학습 초기(레벨 낮음)에는 관대하게, 점차 엄격하게 동작.
 * - 정확 일치 → exact
 * - 관사/전치사/단수복수/대소자/구두점/부속어 차이 → fuzzy (TTS로 원래 표현 들려줌)
 * - 핵심 동사/표현 다름 → wrong
 *
 * ESM default export + window.FuzzyMatch(Node 호환) 동시 지원.
 */
function createFuzzyMatch() {
  'use strict';

  const DEFAULT_LENiENCY = 1; // 0=엄격, 1=초보자 관대, 2=일반 관대

  // 관사 집합
  const ARTICLES = new Set(['a', 'an', 'the']);
  // 흔한 전치사
  const PREPOSITIONS = new Set([
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'about', 'into', 'onto', 'over', 'under', 'after', 'before',
    'through', 'between', 'among', 'against', 'without',
  ]);

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[.!?,;:]/g, ' ')
      .replace(/['"]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(text) {
    return normalize(text).split(' ').filter(Boolean);
  }

  function dedup(arr) {
    return Array.from(new Set(arr));
  }

  // 단수/복수 변형 추정
  function pluralize(word) {
    if (!word) return [];
    const forms = [word];
    if (word.endsWith('s') && !word.endsWith('ss')) {
      forms.push(word.slice(0, -1));
    } else {
      forms.push(word + 's');
    }
    if (word.endsWith('es') && !word.endsWith('ses')) {
      forms.push(word.slice(0, -2));
    }
    if (word.endsWith('y') && word.length > 1) {
      forms.push(word.slice(0, -1) + 'ies');
    } else if (word.endsWith('ies')) {
      forms.push(word.slice(0, -3) + 'y');
    }
    return dedup(forms);
  }

  function wordEquals(a, b) {
    if (a === b) return true;
    if (pluralize(a).includes(b) || pluralize(b).includes(a)) return true;
    return false;
  }

  // 차이 분석
  function analyzeDiff(userTokens, expectedTokens) {
    const changes = [];
    const maxLen = Math.max(userTokens.length, expectedTokens.length);
    let commonCount = 0;
    let articleDiff = 0;
    let prepositionDiff = 0;
    let pluralDiff = 0;
    let verbDiff = 0;

    for (let i = 0; i < maxLen; i++) {
      const u = userTokens[i] || '';
      const e = expectedTokens[i] || '';
      if (u === e) {
        commonCount++;
        continue;
      }
      // 관사 차이
      if (ARTICLES.has(u) || ARTICLES.has(e)) {
        articleDiff++;
        continue;
      }
      // 전치사 차이
      if (PREPOSITIONS.has(u) || PREPOSITIONS.has(e)) {
        prepositionDiff++;
        continue;
      }
      // 단수/복수 차이
      const pluralForms = pluralize(u);
      if (pluralForms.includes(e)) {
        pluralDiff++;
        continue;
      }
      const pluralExpected = pluralize(e);
      if (pluralExpected.includes(u)) {
        pluralDiff++;
        continue;
      }
      // 동사 형태 차이 (확장 여지)
      verbDiff++;
      changes.push({ user: u, expected: e });
    }

    return {
      commonCount,
      articleDiff,
      prepositionDiff,
      pluralDiff,
      verbDiff,
      changes,
    };
  }

  function matchAnswer(userInput, expected, options) {
    options = options || {};
    const leniency = options.leniency !== undefined ? options.leniency : DEFAULT_LENiENCY;
    const userTokens = tokenize(userInput);
    const expectedTokens = tokenize(expected);

    // 빈 입력
    if (userTokens.length === 0) {
      return {
        level: 'wrong',
        score: 0,
        feedback: '응답이 비어 있습니다.',
        canonicalTTS: expected,
      };
    }

    // 정확 일치
    const userNorm = userTokens.join(' ');
    const expectedNorm = expectedTokens.join(' ');
    if (userNorm === expectedNorm) {
      return {
        level: 'exact',
        score: 1,
        feedback: '완벽합니다!',
        canonicalTTS: expected,
      };
    }

    // 변형 허용 목록
    const variants = options.acceptedVariants || [];
    for (const v of variants) {
      if (normalize(v) === userNorm) {
        return {
          level: 'exact',
          score: 1,
          feedback: '정답!',
          canonicalTTS: expected,
        };
      }
    }

    // 차이 분석
    const diff = analyzeDiff(userTokens, expectedTokens);

    // 레벨별 허용 임계치
    const maxArticle = leniency === 0 ? 0 : 3;
    const maxPreposition = leniency === 0 ? 0 : 3;
    const maxPlural = leniency === 0 ? 0 : 2;
    const maxVerb = leniency === 0 ? 0 : leniency === 1 ? 1 : 1;

    // 핵심 동사/표현이 다르면 wrong
    if (diff.verbDiff > maxVerb) {
      return {
        level: 'wrong',
        score: 0,
        feedback: '핵심 동사나 표현이 다릅니다.',
        canonicalTTS: expected,
        diff: { userText: userInput, expectedText: expected, changes: diff.changes },
      };
    }

    // 사소한 부정합 → fuzzy (들려줄 표현과 함께)
    if (
      diff.articleDiff <= maxArticle &&
      diff.prepositionDiff <= maxPreposition &&
      diff.pluralDiff <= maxPlural
    ) {
      const tips = [];
      if (diff.articleDiff > 0) tips.push('관사');
      if (diff.prepositionDiff > 0) tips.push('전치사');
      if (diff.pluralDiff > 0) tips.push('단수/복수');
      const tipText = tips.length ? ` (${tips.join('/')} 차이)` : '';
      return {
        level: 'fuzzy',
        score: 0.85,
        feedback: `거의 다 됐어요! 이렇게도 해요.${tipText}`,
        canonicalTTS: expected,
        diff: { userText: userInput, expectedText: expected, changes: diff.changes },
      };
    }

    // 부정합이 너무 많으면 wrong
    const totalDiff =
      diff.articleDiff + diff.prepositionDiff + diff.pluralDiff + diff.verbDiff;
    if (totalDiff > expectedTokens.length * 0.6) {
      return {
        level: 'wrong',
        score: 0,
        feedback: '다시 시도해 보세요.',
        canonicalTTS: expected,
        diff: { userText: userInput, expectedText: expected, changes: diff.changes },
      };
    }

    return {
      level: 'fuzzy',
      score: 0.7,
      feedback: '좋아요. 원래 표현을 들어보세요.',
      canonicalTTS: expected,
      diff: { userText: userInput, expectedText: expected, changes: diff.changes },
    };
  }

  const api = {
    matchAnswer,
    normalize,
    tokenize,
    analyzeDiff,
    pluralize,
  };

  return api;
}

const FuzzyMatch = createFuzzyMatch();

// 브라우저 글로벌 호환 (기존 코드 유지 보수용)
if (typeof globalThis !== 'undefined') {
  globalThis.FuzzyMatch = FuzzyMatch;
}
// ESM default export (Vite/TS import용)
export default FuzzyMatch;
