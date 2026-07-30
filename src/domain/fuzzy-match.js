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
  // 자리 이동이 자유로운 부사·공손 표지 (please stand up ≈ stand up please)
  const FLOATING_ADVERBS = new Set([
    'please', 'just', 'kindly', 'now', 'soon', 'then',
    'carefully', 'quickly', 'quietly', 'slowly', 'politely',
  ]);

  /**
   * 축약형 전개 — STT는 you'll↔you will, don't↔do not 를 섞어 줌.
   * 1) 아포스트로피 있는 형태 전개 → 2) 제거 → 3) 잔여형(dont/youll) 전개
   */
  function expandContractions(text) {
    let t = String(text || '');
    const withApos = [
      [/\bwon't\b/gi, 'will not'],
      [/\bcan't\b/gi, 'can not'],
      [/\bcannot\b/gi, 'can not'],
      [/\bshan't\b/gi, 'shall not'],
      [/\bain't\b/gi, 'am not'],
      [/\bn't\b/gi, ' not'],
      [/\b'll\b/gi, ' will'],
      [/\b're\b/gi, ' are'],
      [/\b've\b/gi, ' have'],
      [/\b'm\b/gi, ' am'],
      [/\b'd\b/gi, ' would'],
    ];
    for (let i = 0; i < withApos.length; i++) {
      t = t.replace(withApos[i][0], withApos[i][1]);
    }
    // 아포스트로피 제거 후 STT 잔여형
    t = t.replace(/['’]/g, '');
    const bare = [
      [/\bwont\b/gi, 'will not'],
      [/\bcant\b/gi, 'can not'],
      [/\bdont\b/gi, 'do not'],
      [/\bisnt\b/gi, 'is not'],
      [/\barent\b/gi, 'are not'],
      [/\bwasnt\b/gi, 'was not'],
      [/\bwerent\b/gi, 'were not'],
      [/\bhasnt\b/gi, 'has not'],
      [/\bhavent\b/gi, 'have not'],
      [/\bhadnt\b/gi, 'had not'],
      [/\bdidnt\b/gi, 'did not'],
      [/\bwouldnt\b/gi, 'would not'],
      [/\bcouldnt\b/gi, 'could not'],
      [/\bshouldnt\b/gi, 'should not'],
      [/\byoull\b/gi, 'you will'],
      [/\btheyll\b/gi, 'they will'],
      [/\bweve\b/gi, 'we have'],
      [/\btheyre\b/gi, 'they are'],
      [/\byoure\b/gi, 'you are'],
      [/\bim\b/gi, 'i am'],
      [/\bive\b/gi, 'i have'],
    ];
    for (let i = 0; i < bare.length; i++) {
      t = t.replace(bare[i][0], bare[i][1]);
    }
    return t;
  }

  function normalize(text) {
    return expandContractions(String(text || ''))
      .toLowerCase()
      .replace(/[.!?,;:]/g, ' ')
      .replace(/["“”']/g, '')
      .replace(
        /\b(?:take|have)\s+a(?:n)?\s+(?:(closer|quick|proper|good|careful|brief|long)\s+)?look\b/g,
        function (_m, adj) {
          return adj ? 'have a ' + String(adj).trim() + ' look' : 'have a look';
        }
      )
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

    // 부사(please 등) 자리만 다른 경우 — 핵심 어순은 같음
    const userCore = userTokens.filter(function (t) {
      return !FLOATING_ADVERBS.has(t);
    });
    const expectedCore = expectedTokens.filter(function (t) {
      return !FLOATING_ADVERBS.has(t);
    });
    if (userCore.length > 0 && userCore.join(' ') === expectedCore.join(' ')) {
      return {
        level: 'exact',
        score: 1,
        feedback: '완벽합니다!',
        canonicalTTS: expected,
      };
    }

    // have/take a look 동이디엄 — at this 등만 빠지면 fuzzy
    const lookCore = /\bhave a (?:(?:closer|quick|proper|good|careful|brief|long) )?look\b/;
    const userLook = userNorm.match(lookCore);
    const expectedLook = expectedNorm.match(lookCore);
    if (userLook && expectedLook && userLook[0] === expectedLook[0]) {
      if (userNorm === expectedLook[0] || expectedNorm.indexOf(userNorm) === 0) {
        return {
          level: 'fuzzy',
          score: 0.85,
          feedback: '표현은 맞아요! 목적어·전치사까지 이어서 말해 보세요.',
          canonicalTTS: expected,
        };
      }
    }

    // 차이 분석 — 부사 제거 후 핵심만 비교 (자리 이동에 verbDiff 폭탄 방지)
    const diff = analyzeDiff(userCore.length ? userCore : userTokens, expectedCore.length ? expectedCore : expectedTokens);

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
    expandContractions,
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
