/**
 * gap-reason.ts — 오답/스킵 간극의 구조적 추정 이유.
 * 주어·동사·목적어(핵)·수식·시제·3인칭 단수 슬롯을 휴리스틱으로 비교.
 * 기본동사100·회화100·구동사·코로케이션 문장 패턴을 반영.
 * 사용자는 앱에서 확인·수정할 수 있음.
 */
import type { CueMode } from './srs-engine';

export type GapMatch = 'wrong' | 'skipped';

export type GapSlotRole =
  | 'subject'
  | 'verb'
  | 'noun'
  | 'modifier'
  | 'tense'
  | 'agreement'
  | 'adjective';

export type GapSlotStatus = 'ok' | 'missing' | 'wrong';

export interface GapSlotFinding {
  role: GapSlotRole;
  status: GapSlotStatus;
  expected: string;
  actual: string;
  /** 잘못/못 찾은 추정 이유 */
  why: string;
}

const SUBJECT_PRONOUNS = new Set([
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
]);
const OBJECT_PRONOUNS = new Set([
  'me',
  'him',
  'her',
  'us',
  'them',
]);
const AUX = new Set([
  'am',
  'is',
  'are',
  'was',
  'were',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'will',
  'would',
  'can',
  'could',
  'may',
  'might',
  'must',
  'should',
  'shall',
]);
const DETERMINERS = new Set([
  'a',
  'an',
  'the',
  'my',
  'your',
  'his',
  'her',
  'its',
  'our',
  'their',
  'this',
  'that',
  'these',
  'those',
  'some',
  'any',
  'no',
]);
const PREPS = new Set([
  'to',
  'for',
  'of',
  'in',
  'on',
  'at',
  'with',
  'from',
  'by',
  'about',
  'into',
  'onto',
  'over',
  'under',
  'as',
]);
/** 구동사 부사·전치사 입자 (stand up, sit down, wake up…) */
const PARTICLES = new Set([
  'up',
  'down',
  'out',
  'off',
  'away',
  'back',
  'along',
  'around',
  'over',
  'through',
  'apart',
  'aside',
  'ahead',
  'together',
  'in',
  'on',
]);
/** 자리 이동이 자유로운 부사·공손 표지 */
const FLOATING_ADVERBS = new Set([
  'please',
  'just',
  'kindly',
  'now',
  'soon',
  'then',
  'carefully',
  'quickly',
  'quietly',
  'slowly',
  'politely',
]);
const FUNCTION = new Set([
  ...SUBJECT_PRONOUNS,
  ...OBJECT_PRONOUNS,
  ...AUX,
  ...DETERMINERS,
  ...PREPS,
  ...FLOATING_ADVERBS,
  'not',
  'and',
  'or',
  'but',
  'if',
  'so',
  'too',
  'very',
  'also',
]);

/** 불규칙 과거 → 원형 (간단 맵) */
const PAST_TO_BASE: Record<string, string> = {
  was: 'be',
  were: 'be',
  been: 'be',
  am: 'be',
  is: 'be',
  are: 'be',
  went: 'go',
  gone: 'go',
  did: 'do',
  done: 'do',
  had: 'have',
  has: 'have',
  made: 'make',
  said: 'say',
  took: 'take',
  taken: 'take',
  came: 'come',
  saw: 'see',
  seen: 'see',
  got: 'get',
  gotten: 'get',
  knew: 'know',
  known: 'know',
  thought: 'think',
  found: 'find',
  gave: 'give',
  given: 'give',
  told: 'tell',
  felt: 'feel',
  left: 'leave',
  kept: 'keep',
  began: 'begin',
  begun: 'begin',
  became: 'become',
  brought: 'bring',
  bought: 'buy',
  built: 'build',
  caught: 'catch',
  chose: 'choose',
  chosen: 'choose',
  drew: 'draw',
  drawn: 'draw',
  drank: 'drink',
  drunk: 'drink',
  drove: 'drive',
  driven: 'drive',
  ate: 'eat',
  eaten: 'eat',
  fell: 'fall',
  fallen: 'fall',
  flew: 'fly',
  flown: 'fly',
  forgot: 'forget',
  forgotten: 'forget',
  froze: 'freeze',
  frozen: 'freeze',
  grew: 'grow',
  grown: 'grow',
  heard: 'hear',
  held: 'hold',
  hid: 'hide',
  hidden: 'hide',
  hit: 'hit',
  hurt: 'hurt',
  led: 'lead',
  lent: 'lend',
  let: 'let',
  lost: 'lose',
  meant: 'mean',
  met: 'meet',
  paid: 'pay',
  put: 'put',
  read: 'read',
  rode: 'ride',
  ridden: 'ride',
  rang: 'ring',
  rung: 'ring',
  rose: 'rise',
  risen: 'rise',
  ran: 'run',
  sold: 'sell',
  sent: 'send',
  set: 'set',
  shook: 'shake',
  shaken: 'shake',
  shone: 'shine',
  shot: 'shoot',
  showed: 'show',
  shown: 'show',
  shut: 'shut',
  sang: 'sing',
  sung: 'sing',
  sat: 'sit',
  slept: 'sleep',
  spoke: 'speak',
  spoken: 'speak',
  spent: 'spend',
  stood: 'stand',
  stole: 'steal',
  stolen: 'steal',
  stuck: 'stick',
  swam: 'swim',
  swum: 'swim',
  taught: 'teach',
  tore: 'tear',
  torn: 'tear',
  threw: 'throw',
  thrown: 'throw',
  understood: 'understand',
  woke: 'wake',
  woken: 'wake',
  wore: 'wear',
  worn: 'wear',
  won: 'win',
  wrote: 'write',
  written: 'write',
};

/** 불규칙 복수 → 단수 (명사 단/복수 비교용 — baseForm의 's' 제거 규칙으로는 못 잡음) */
const IRREGULAR_PLURALS: Record<string, string> = {
  children: 'child',
  people: 'person',
  men: 'man',
  women: 'woman',
  feet: 'foot',
  teeth: 'tooth',
  mice: 'mouse',
  geese: 'goose',
};

/** 명사 비교 전용 base — 불규칙 복수까지 단수로 정규화 */
function nounBase(word: string): string {
  const w = word.toLowerCase();
  return IRREGULAR_PLURALS[w] ?? baseForm(w);
}

/** 단어가 복수형으로 보이는지 (규칙+불규칙) */
function isPluralForm(word: string): boolean {
  const w = word.toLowerCase();
  if (IRREGULAR_PLURALS[w]) return true;
  if (w.endsWith('ies') && w.length > 4) return true;
  if (
    w.endsWith('ses') ||
    w.endsWith('ches') ||
    w.endsWith('shes') ||
    w.endsWith('xes') ||
    w.endsWith('zes')
  ) {
    return true;
  }
  return w.endsWith('s') && !w.endsWith('ss') && w.length > 3;
}

const PAST_MARKERS = new Set([
  'was',
  'were',
  'did',
  'had',
  'went',
  'made',
  'said',
  'took',
  'came',
  'saw',
  'got',
  'knew',
  'thought',
  'found',
  'gave',
  'told',
]);

const PRESENT_AUX = new Set(['am', 'is', 'are', 'do', 'does', 'have', 'has']);

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function baseForm(word: string): string {
  const w = word.toLowerCase();
  if (PAST_TO_BASE[w]) return PAST_TO_BASE[w];
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('es') && (w.endsWith('ches') || w.endsWith('shes') || w.endsWith('xes') || w.endsWith('zes') || w.endsWith('sses'))) {
    return w.slice(0, -2);
  }
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  if (w.endsWith('ied') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ed') && w.length > 4) {
    const stem = w.slice(0, -2);
    if (stem.endsWith(stem[stem.length - 1]!) && stem.length > 3) {
      return stem.slice(0, -1);
    }
    return stem;
  }
  if (w.endsWith('ing') && w.length > 5) {
    const stem = w.slice(0, -3);
    if (stem.endsWith(stem[stem.length - 1]!) && stem.length > 3) {
      return stem.slice(0, -1);
    }
    return stem;
  }
  return w;
}

function looksPast(word: string): boolean {
  const w = word.toLowerCase();
  if (PAST_MARKERS.has(w)) return true;
  if (PAST_TO_BASE[w] && !PRESENT_AUX.has(w)) return true;
  return w.endsWith('ed') && w.length > 3 && !AUX.has(w);
}

function looks3sgVerb(word: string): boolean {
  const w = word.toLowerCase();
  if (w === 'is' || w === 'does' || w === 'has') return true;
  if (AUX.has(w)) return false;
  return (
    (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) ||
    w.endsWith('es')
  );
}

interface PhraseSlots {
  subject: string;
  /** 순수 동사(+입자) 또는 관용 light-verb 단위(have a look) */
  verb: string;
  /** 목적어 NP 전체 (some friends) */
  noun: string;
  /** 목적어 핵 (friends) */
  nounHead: string;
  /** 목적어 핵 바로 앞 형용사 (a quiet cat → quiet) */
  adjective: string;
  /** 후치 수식·to부정사 등 (living in Chicago / to run …) */
  modifier: string;
  tokens: string[];
  isQuestion: boolean;
  isImperative: boolean;
}

const LIGHT_VERBS = new Set(['have', 'take', 'make', 'give', 'do', 'get', 'pay', 'keep']);
/**
 * light-verb 관용 핵만 동사 단위로 묶음.
 * have some friends / have a question 은 제외 → 동사 have + 목적어 NP.
 * (기본동사·코로케이션·회화 팩 관용 표현 기준)
 */
const LIGHT_VERB_NOUNS = new Set([
  'look',
  'peek',
  'glance',
  'break',
  'rest',
  'seat',
  'walk',
  'bath',
  'shower',
  'nap',
  'try',
  'go',
  'shot',
  'turn',
  'bite',
  'drink',
  'sip',
  'listen',
]);
const LOOK_ADJECTIVES = new Set([
  'closer',
  'quick',
  'proper',
  'good',
  'careful',
  'brief',
  'long',
]);
const IMPERATIVE_STARTERS = new Set([
  ...LIGHT_VERBS,
  'look',
  'go',
  'come',
  'put',
  'let',
  'feel',
  'find',
  'try',
  'wait',
  'stop',
  'start',
  'open',
  'close',
  'tell',
  'ask',
  'call',
  'help',
  'listen',
  'watch',
  'read',
  'write',
  'speak',
  'say',
  'stand',
  'sit',
  'wake',
  'turn',
  'pick',
  'hang',
  'shut',
  'hold',
  'lie',
  'lay',
  'run',
  'walk',
  'move',
  'bring',
  'leave',
  'stay',
  'hurry',
  'calm',
  'be',
]);

function stripFloatingAdverbs(tokens: string[]): {
  core: string[];
  floats: string[];
} {
  const core: string[] = [];
  const floats: string[] = [];
  for (const t of tokens) {
    if (FLOATING_ADVERBS.has(t)) floats.push(t);
    else core.push(t);
  }
  return { core, floats };
}

/** 동사(+입자) 한 덩어리 — stand up, sit down, wake up */
function takeVerbWithParticle(
  tokens: string[],
  start: number
): { text: string; end: number } {
  if (start >= tokens.length) return { text: '', end: start };
  const light = takeLightVerbPhrase(tokens, start);
  if (light) return light;
  const v = tokens[start]!;
  const next = tokens[start + 1];
  if (next && PARTICLES.has(next) && !DETERMINERS.has(next) && !SUBJECT_PRONOUNS.has(next)) {
    return { text: `${v} ${next}`, end: start + 2 };
  }
  return { text: v, end: start + 1 };
}

/** have/take a (adj)? look → 비교용 정규화 */
export function normalizeLookIdiom(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /\b(?:take|have)\s+a(?:n)?\s+(?:(closer|quick|proper|good|careful|brief|long)\s+)?look\b/g,
      (_m, adj?: string) => (adj ? `have a ${adj.trim()} look` : 'have a look')
    );
}

function lookIdiomKey(text: string): string | null {
  const n = normalizeLookIdiom(text);
  const m = n.match(/\bhave a(?: (closer|quick|proper|good|careful|brief|long))? look\b/);
  if (!m) return null;
  return `look:${m[1] || ''}`;
}

function verbsEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false;
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl || baseForm(al) === baseForm(bl)) return true;
  const aParts = al.split(/\s+/);
  const bParts = bl.split(/\s+/);
  if (
    aParts.length > 1 &&
    aParts.length === bParts.length &&
    aParts.every((p, i) => p === bParts[i] || baseForm(p) === baseForm(bParts[i]!))
  ) {
    return true;
  }
  const ka = lookIdiomKey(al);
  const kb = lookIdiomKey(bl);
  if (ka && kb && ka === kb) return true;
  if (normalizeLookIdiom(al) === normalizeLookIdiom(bl)) return true;
  // "take a look" ⊂ "have a look at this"
  if (ka && normalizeLookIdiom(bl).includes(normalizeLookIdiom(al))) return true;
  if (kb && normalizeLookIdiom(al).includes(normalizeLookIdiom(bl))) return true;
  return false;
}

function takeNounPhrase(tokens: string[], start: number): { text: string; end: number } {
  if (start >= tokens.length) return { text: '', end: start };
  const t0 = tokens[start]!;
  if (OBJECT_PRONOUNS.has(t0) || SUBJECT_PRONOUNS.has(t0)) {
    return { text: t0, end: start + 1 };
  }
  if (DETERMINERS.has(t0)) {
    const parts = [t0];
    let i = start + 1;
    while (
      i < tokens.length &&
      !AUX.has(tokens[i]!) &&
      !PREPS.has(tokens[i]!) &&
      !SUBJECT_PRONOUNS.has(tokens[i]!)
    ) {
      parts.push(tokens[i]!);
      i += 1;
      if (parts.length >= 4) break;
    }
    return { text: parts.join(' '), end: i };
  }
  if (!FUNCTION.has(t0) || DETERMINERS.has(t0)) {
    return { text: t0, end: start + 1 };
  }
  return { text: '', end: start };
}

function isLikelyPastParticiple(word: string): boolean {
  const w = word.toLowerCase();
  if (!w) return false;
  // have been / being
  if (w === 'been' || w === 'being') return true;
  if (IRREGULAR_PARTICIPLES.has(w)) return true;
  // walked, played — 단, fond/fund 같은 형용사는 제외
  if (w.endsWith('ed') && w.length > 3) return true;
  // written, broken, taken…
  if (w.length > 3 && (w.endsWith('en') || w.endsWith('ne'))) {
    if (PAST_TO_BASE[w] || IRREGULAR_PARTICIPLES.has(w)) return true;
  }
  return false;
}

/** have/has/had + 형용사/명사 = 소유 동사 (완료 조동사 아님) */
function isLexicalHave(tokens: string[], start: number): boolean {
  const v = tokens[start]?.toLowerCase();
  if (v !== 'have' && v !== 'has' && v !== 'had') return false;
  const next = tokens[start + 1]?.toLowerCase();
  if (!next || next === 'not') return true;
  if (next === 'to') return true; // have to …
  if (DETERMINERS.has(next)) return true; // have a/the/some …
  if (isLikelyPastParticiple(next)) return false; // have found / have been
  // have fond memories / have fun — 본동사
  return true;
}

const IRREGULAR_PARTICIPLES = new Set([
  'been',
  'gone',
  'done',
  'seen',
  'made',
  'taken',
  'given',
  'found',
  'left',
  'felt',
  'kept',
  'heard',
  'said',
  'told',
  'thought',
  'brought',
  'bought',
  'caught',
  'taught',
  'built',
  'sent',
  'spent',
  'met',
  'put',
  'read',
  'cut',
  'hit',
  'set',
  'let',
  'run',
  'come',
  'become',
  'begun',
  'written',
  'spoken',
  'broken',
  'chosen',
  'driven',
  'eaten',
  'fallen',
  'forgotten',
  'gotten',
  'got',
  'hidden',
  'known',
  'ridden',
  'risen',
  'shown',
  'sung',
  'sunk',
  'swum',
  'thrown',
  'worn',
  'won',
  'lost',
  'paid',
  'sold',
  'stood',
  'understood',
  'woken',
]);

/** have/take/make + a/an + (adj)? + 관용 핵만 — have some friends 는 제외 */
function takeLightVerbPhrase(
  tokens: string[],
  start: number
): { text: string; end: number } | null {
  if (start >= tokens.length) return null;
  const v0 = tokens[start]!;
  if (!LIGHT_VERBS.has(v0)) return null;
  if (start + 1 >= tokens.length) return null;
  const det = tokens[start + 1]!;
  // 관용은 a/an 중심 (some friends 등 일반 NP 제외)
  if (det !== 'a' && det !== 'an') return null;
  const parts = [v0, det];
  let i = start + 2;
  while (i < tokens.length && LOOK_ADJECTIVES.has(tokens[i]!)) {
    parts.push(tokens[i]!);
    i += 1;
  }
  if (i >= tokens.length) return null;
  const head = tokens[i]!;
  if (!LIGHT_VERB_NOUNS.has(head)) return null;
  parts.push(head);
  i += 1;
  return { text: parts.join(' '), end: i };
}

function isIngForm(word: string): boolean {
  const w = word.toLowerCase();
  if (w.length <= 4) return false;
  if (!w.endsWith('ing')) return false;
  if (AUX.has(w) || w === 'being' || w === 'going' || w === 'having') return false;
  return true;
}

/**
 * 목적어 NP: (det) (adj)* HEAD — HEAD 뒤 V-ing / to부정사 / 전치사는 수식·부가로 남김.
 */
function takeObjectNp(
  tokens: string[],
  start: number
): { text: string; head: string; adjective: string; end: number } {
  if (start >= tokens.length) return { text: '', head: '', adjective: '', end: start };
  const t0 = tokens[start]!;
  if (OBJECT_PRONOUNS.has(t0) || t0 === 'it') {
    return { text: t0, head: t0, adjective: '', end: start + 1 };
  }

  const parts: string[] = [];
  let i = start;
  let head = '';

  if (DETERMINERS.has(tokens[i]!)) {
    parts.push(tokens[i]!);
    i += 1;
  }

  while (i < tokens.length) {
    const w = tokens[i]!;
    if (PREPS.has(w) || AUX.has(w) || SUBJECT_PRONOUNS.has(w)) break;
    if (FLOATING_ADVERBS.has(w)) break;
    if (w === 'to') break; // to-infinitive complement
    if (head && isIngForm(w)) break; // friends living …
    if (w === 'and' || w === 'or' || w === 'but') break;

    parts.push(w);
    if (!DETERMINERS.has(w) && !LOOK_ADJECTIVES.has(w) && !FUNCTION.has(w)) {
      head = w;
    } else if (!DETERMINERS.has(w) && LOOK_ADJECTIVES.has(w)) {
      // keep scanning for noun head
    } else if (!DETERMINERS.has(w) && !FUNCTION.has(w)) {
      head = w;
    } else if (!head && !DETERMINERS.has(w) && !PREPS.has(w)) {
      // few / many as head-ish after "a"
      if (w !== 'a' && w !== 'an' && w !== 'the') head = w;
    }
    i += 1;
    if (parts.length >= 6) break;
  }

  if (!head && parts.length > 0) {
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j]!;
      if (!DETERMINERS.has(p)) {
        head = p;
        break;
      }
    }
  }

  // head 바로 앞 단어가 관사가 아니면 형용사로 본다 (a quiet cat → quiet)
  let adjective = '';
  const headIdx = head ? parts.lastIndexOf(head) : -1;
  if (headIdx > 0) {
    const before = parts[headIdx - 1]!;
    if (!DETERMINERS.has(before)) adjective = before;
  }

  return { text: parts.join(' '), head, adjective, end: i };
}

function takePostModifier(
  tokens: string[],
  start: number
): { text: string; end: number } {
  if (start >= tokens.length) return { text: '', end: start };
  const w0 = tokens[start]!;
  // living in Chicago / to run this afternoon
  if (isIngForm(w0) || w0 === 'to') {
    return { text: tokens.slice(start).join(' '), end: tokens.length };
  }
  return { text: '', end: start };
}

function extractSlots(tokens: string[]): PhraseSlots {
  const empty: PhraseSlots = {
    subject: '',
    verb: '',
    noun: '',
    nounHead: '',
    adjective: '',
    modifier: '',
    tokens: [],
    isQuestion: false,
    isImperative: false,
  };
  const { core } = stripFloatingAdverbs(tokens);
  if (core.length === 0) {
    return { ...empty, tokens: core };
  }

  let i = 0;
  let isQuestion = false;
  let isImperative = false;
  let subject = '';
  let verb = '';
  let noun = '';
  let nounHead = '';
  let adjective = '';
  let modifier = '';

  // Do/Does/Did/Can... you need help?
  if (AUX.has(core[0]!) && core.length >= 2 && core[0] !== 'have') {
    if (!(core[0] === 'have' && DETERMINERS.has(core[1]!))) {
      isQuestion = true;
      const aux = core[0]!;
      i = 1;
      const subj = takeNounPhrase(core, i);
      subject = subj.text;
      i = subj.end;
      if (i < core.length && !AUX.has(core[i]!)) {
        const vp = takeVerbWithParticle(core, i);
        if (vp.text && !AUX.has(vp.text.split(/\s+/)[0]!)) {
          verb = `${aux} ${vp.text}`;
          i = vp.end;
        } else {
          verb = `${aux} ${core[i]}`;
          i += 1;
        }
      } else {
        verb = aux;
      }
    }
  }

  if (!isQuestion) {
    const startsWithSubject = SUBJECT_PRONOUNS.has(core[0]!);
    const light = takeLightVerbPhrase(core, 0);
    const verbHead = takeVerbWithParticle(core, 0);
    const headWord = verbHead.text.split(/\s+/)[0]!;
    const imperativeStart =
      !startsWithSubject && (IMPERATIVE_STARTERS.has(headWord) || !!light);

    if (imperativeStart && !startsWithSubject) {
      isImperative = true;
      subject = '';
      if (light) {
        verb = light.text;
        i = light.end;
      } else {
        verb = verbHead.text;
        i = verbHead.end;
      }
    } else {
      const subj = takeNounPhrase(core, 0);
      if (
        startsWithSubject ||
        (!DETERMINERS.has(core[0]!) && !LIGHT_VERBS.has(core[0]!))
      ) {
        subject = subj.text;
        i = subj.end;
      } else if (light) {
        isImperative = true;
        verb = light.text;
        i = light.end;
      } else {
        subject = subj.text;
        i = subj.end;
      }

      if (!verb) {
        const light2 = takeLightVerbPhrase(core, i);
        if (light2) {
          verb = light2.text;
          i = light2.end;
        } else if (i < core.length && AUX.has(core[i]!) && isLexicalHave(core, i)) {
          // I have fond memories — have는 소유 본동사
          verb = core[i]!;
          i += 1;
        } else if (i < core.length && AUX.has(core[i]!)) {
          const aux = core[i]!;
          i += 1;
          if (i < core.length && core[i] === 'not') i += 1;
          if (i < core.length && !PREPS.has(core[i]!) && !DETERMINERS.has(core[i]!)) {
            if (
              core[i]!.endsWith('ing') ||
              isLikelyPastParticiple(core[i]!) ||
              PAST_TO_BASE[core[i]!] ||
              !FUNCTION.has(core[i]!)
            ) {
              const vp = takeVerbWithParticle(core, i);
              verb = `${aux} ${vp.text}`;
              i = vp.end;
            } else {
              verb = aux;
            }
          } else {
            verb = aux;
          }
        } else if (i < core.length) {
          const vp = takeVerbWithParticle(core, i);
          verb = vp.text;
          i = vp.end;
        }
      }
    }
  }

  // light-verb 관용 뒤 전치사 목적어 (look at this)
  if (i < core.length && PREPS.has(core[i]!)) {
    const afterPrep = i + 1;
    if (afterPrep < core.length) {
      const obj = takeObjectNp(core, afterPrep);
      noun = obj.text;
      nounHead = obj.head;
      adjective = obj.adjective;
      i = obj.end;
      const mod = takePostModifier(core, i);
      modifier = mod.text;
      i = mod.end;
    } else {
      i += 1;
    }
  } else {
    const obj = takeObjectNp(core, i);
    noun = obj.text;
    nounHead = obj.head;
    adjective = obj.adjective;
    i = obj.end;
    const mod = takePostModifier(core, i);
    if (mod.text) {
      modifier = mod.text;
      i = mod.end;
    } else if (i < core.length && PREPS.has(core[i]!)) {
      // in Chicago 등 — 수식에 포함해 목표 비교에 씀
      modifier = core.slice(i).join(' ');
      i = core.length;
    }
  }

  return {
    subject,
    verb,
    noun,
    nounHead,
    adjective,
    modifier,
    tokens: core,
    isQuestion,
    isImperative,
  };
}

function findTokenMatch(haystack: string[], needle: string): boolean {
  if (!needle) return false;
  const parts = needle.split(/\s+/);
  if (parts.length === 1) {
    const n = parts[0]!;
    return haystack.some((t) => t === n || baseForm(t) === baseForm(n));
  }
  // multi-word: all parts present in order (loose)
  let idx = 0;
  for (const t of haystack) {
    const want = parts[idx]!;
    if (t === want || baseForm(t) === baseForm(want)) idx += 1;
    if (idx >= parts.length) return true;
  }
  return false;
}

function subjectWhy(expected: string, actual: string): string {
  const e = expected.toLowerCase();
  const a = actual.toLowerCase();
  if (!actual) return '주어 자리가 비어 있어요. 누가 하는지부터 떠올려 보세요.';
  if (
    (['he', 'she', 'it'].includes(e) && ['he', 'she', 'it'].includes(a) && e !== a) ||
    (e === 'he' && a === 'she') ||
    (e === 'she' && a === 'he')
  ) {
    return '인칭·성별(he/she/it)을 헷갈린 듯해요.';
  }
  if ((e === 'i' && a === 'you') || (e === 'you' && a === 'i')) {
    return '화자(나)와 청자(너)를 바꿔 말한 듯해요.';
  }
  if ((e === 'we' && a === 'they') || (e === 'they' && a === 'we')) {
    return '우리/그들 쪽 인칭을 헷갈린 듯해요.';
  }
  if (baseForm(e) === baseForm(a)) {
    return '주어 뜻은 비슷한데 형태가 달라요.';
  }
  return `정답 주어「${expected}」대신「${actual}」을(를) 골랐어요.`;
}

function verbWhy(expected: string, actual: string): string {
  if (!actual) return '동사(또는 have/take a look 같은 동사구)가 비어 있어요.';
  if (verbsEquivalent(expected, actual)) {
    return '동사구 뜻은 같아요.';
  }
  const eb = baseForm(expected.split(/\s+/).pop()!);
  const ab = baseForm(actual.split(/\s+/).pop()!);
  if (eb === ab) {
    return '동사 원형은 맞는데 시제·인칭 형태가 달라요.';
  }
  if (lookIdiomKey(expected) && lookIdiomKey(actual) && lookIdiomKey(expected) !== lookIdiomKey(actual)) {
    return `같은 look 표현이지만 형용사가 달라요. 정답「${expected}」, 말한 것「${actual}」.`;
  }
  return `정답 동사「${expected}」대신「${actual}」을(를) 썼어요.`;
}

function nounWhy(expected: string, actual: string): string {
  if (!actual) return '목적어 자리가 비어 있어요. 무엇을/누구를 말하는지 떠올려 보세요.';
  if (baseForm(expected.split(/\s+/).pop()!) === baseForm(actual.split(/\s+/).pop()!)) {
    return '목적어 핵은 비슷한데 관사·한정어가 달라요.';
  }
  const e = expected.toLowerCase();
  const a = actual.toLowerCase();
  if (e[0] === a[0] && Math.abs(e.length - a.length) <= 3) {
    return `정답 목적어「${expected}」대신「${actual}」을(를) 골랐어요. 발음이 비슷한 다른 단어일 수 있어요.`;
  }
  return `정답 목적어「${expected}」대신「${actual}」을(를) 골랐어요.`;
}

/** 명사 핵은 같은데 단수/복수만 다를 때의 이유 (불규칙 복수 포함) */
function nounNumberWhy(expectedLabel: string, actualLabel: string, expectHead: string): string {
  const label = isPluralForm(expectHead) ? '복수' : '단수';
  return `핵심 명사는 같은데 단수/복수가 달라요 — 정답은 ${label}(「${expectedLabel}」), 말한 것은 「${actualLabel}」.`;
}

function adjectiveWhy(expected: string, actual: string): string {
  if (!actual) return `형용사「${expected}」이(가) 빠졌어요.`;
  return `형용사가 달라요. 정답「${expected}」, 말한 것「${actual}」.`;
}

function modifierWhy(expected: string, actual: string): string {
  if (!actual) {
    return `수식·부가 표현「${expected}」이(가) 빠졌어요.`;
  }
  return `수식·부가가 달라요. 정답「${expected}」, 말한 것「${actual}」.`;
}

function tenseLabel(slots: PhraseSlots): 'past' | 'present' | 'future' | 'unknown' {
  const v = slots.verb.toLowerCase();
  if (!v) return 'unknown';
  if (/\b(will|won't|'ll)\b/.test(v) || v.includes('going to')) return 'future';
  const parts = v.split(/\s+/);
  if (parts.some(looksPast) || parts.some((p) => p === 'did' || p === 'was' || p === 'were' || p === 'had')) {
    return 'past';
  }
  return 'present';
}

function roleLabel(role: GapSlotRole): string {
  switch (role) {
    case 'subject':
      return '주어';
    case 'verb':
      return '동사';
    case 'noun':
      return '목적어';
    case 'modifier':
      return '수식';
    case 'tense':
      return '시제';
    case 'agreement':
      return '3인칭 단수';
    case 'adjective':
      return '형용사';
  }
}

function formatFinding(f: GapSlotFinding): string {
  const label = roleLabel(f.role);
  if (f.status === 'missing') {
    return `• ${label}: 못 찾음 — 정답「${f.expected}」. 이유: ${f.why}`;
  }
  if (f.status === 'wrong') {
    if (f.role === 'tense' || f.role === 'agreement') {
      return `• ${label}: 오류 — ${f.why}`;
    }
    return `• ${label}: 잘못 찾음 — 말한 것「${f.actual}」, 정답「${f.expected}」. 이유: ${f.why}`;
  }
  return `• ${label}: 맞음 — 「${f.expected}」`;
}

function cueLead(cueMode?: CueMode): string {
  if (cueMode === 'after_reveal') {
    return '영어를 본 뒤에도 달랐어요.';
  }
  if (cueMode === 'after_listen') {
    return '듣고 따라 말했지만 정답과 달랐어요.';
  }
  return '힌트 없이 말하다 틀렸어요.';
}

/** 구조 분석 결과 (테스트·UI용) */
export function analyzeGapSlots(args: {
  en: string;
  guess: string;
}): GapSlotFinding[] {
  const enTokens = tokenize(args.en);
  const guessTokens = tokenize(args.guess);
  const enCore = stripFloatingAdverbs(enTokens).core;
  const guessCore = stripFloatingAdverbs(guessTokens).core;

  // 부사(please 등) 자리만 다르고 핵심이 같으면 구조 간극 없음
  if (enCore.length > 0 && enCore.join(' ') === guessCore.join(' ')) {
    return [];
  }

  const target = extractSlots(enTokens);
  const said = extractSlots(guessTokens);
  const saidTokens = guessCore;
  const findings: GapSlotFinding[] = [];

  // 주어 — 명령문은 you 생략이므로 주어 슬롯을 문제로 잡지 않음
  if (target.isImperative) {
    // 사용자가 불필요하게 주어를 넣었을 때만 가벼운 안내 (문제 목록엔 보통 안 넣음)
  } else if (target.subject) {
    const has = findTokenMatch(saidTokens, target.subject);
    const actual = said.subject;
    if (!has && !actual) {
      findings.push({
        role: 'subject',
        status: 'missing',
        expected: target.subject,
        actual: '',
        why: subjectWhy(target.subject, ''),
      });
    } else if (!has || (actual && actual !== target.subject && baseForm(actual) !== baseForm(target.subject))) {
      findings.push({
        role: 'subject',
        status: 'wrong',
        expected: target.subject,
        actual: actual || '(없음)',
        why: subjectWhy(target.subject, actual || ''),
      });
    } else {
      findings.push({
        role: 'subject',
        status: 'ok',
        expected: target.subject,
        actual: actual || target.subject,
        why: '',
      });
    }
  }

  // 동사 (have/take a look 동의 포함)
  if (target.verb) {
    const actual = said.verb;
    const equivalent = verbsEquivalent(target.verb, actual) || verbsEquivalent(target.verb, args.guess);
    if (!actual && !lookIdiomKey(args.guess)) {
      findings.push({
        role: 'verb',
        status: 'missing',
        expected: target.verb,
        actual: '',
        why: verbWhy(target.verb, ''),
      });
    } else if (equivalent) {
      findings.push({
        role: 'verb',
        status: 'ok',
        expected: target.verb,
        actual: actual || target.verb,
        why: '',
      });
    } else {
      findings.push({
        role: 'verb',
        status: 'wrong',
        expected: target.verb,
        actual: actual || '(다름)',
        why: verbWhy(target.verb, actual || args.guess),
      });
    }
  }

  // 목적어 — 핵(nounHead) 기준. have some friends ≠ 동사구
  let nounOk = true;
  if (target.nounHead || target.noun) {
    const expectHead = target.nounHead || target.noun.split(/\s+/).pop() || '';
    const expectLabel = target.nounHead || target.noun;
    const actualHead = said.nounHead || '';
    const actualLabel = said.nounHead || said.noun || '';
    const hasHead = expectHead ? findTokenMatch(saidTokens, expectHead) : false;
    // 같은 명사(어근)인지 — 불규칙 복수(child/children)까지 인식
    const sameLexeme = !!actualHead && nounBase(actualHead) === nounBase(expectHead);
    const sameNumber = sameLexeme && isPluralForm(actualHead) === isPluralForm(expectHead);
    const headsMatch = sameLexeme && sameNumber;

    if (!hasHead && !actualHead) {
      nounOk = false;
      findings.push({
        role: 'noun',
        status: 'missing',
        expected: expectLabel,
        actual: '',
        why: nounWhy(expectLabel, ''),
      });
    } else if (!hasHead || !headsMatch) {
      nounOk = false;
      // 같은 명사인데 단수/복수만 다르면 "다른 단어" 대신 정확한 이유를 알려줌
      const numberOnly = sameLexeme && !sameNumber;
      findings.push({
        role: 'noun',
        status: 'wrong',
        expected: expectLabel,
        actual: actualLabel || '(다름)',
        why: numberOnly
          ? nounNumberWhy(expectLabel, actualLabel, expectHead)
          : nounWhy(expectLabel, actualLabel || ''),
      });
    } else {
      findings.push({
        role: 'noun',
        status: 'ok',
        expected: expectLabel,
        actual: actualLabel || expectLabel,
        why: '',
      });
    }
  }

  // 형용사 — 목적어 핵 앞 (a quiet cat) · 목적어가 맞을 때만 비교
  if (nounOk && target.adjective) {
    const actual = said.adjective;
    const same = !!actual && (actual === target.adjective || baseForm(actual) === baseForm(target.adjective));
    if (same) {
      findings.push({ role: 'adjective', status: 'ok', expected: target.adjective, actual, why: '' });
    } else if (actual) {
      findings.push({
        role: 'adjective',
        status: 'wrong',
        expected: target.adjective,
        actual,
        why: adjectiveWhy(target.adjective, actual),
      });
    } else if (!findTokenMatch(saidTokens, target.adjective)) {
      findings.push({
        role: 'adjective',
        status: 'missing',
        expected: target.adjective,
        actual: '',
        why: adjectiveWhy(target.adjective, ''),
      });
    } else {
      // 슬롯 추출은 놓쳤지만 단어 자체는 문장 어딘가에 있음 — 관대하게 ok 처리
      findings.push({ role: 'adjective', status: 'ok', expected: target.adjective, actual: target.adjective, why: '' });
    }
  }

  // 수식(V-ing / to-…) — 목적어가 맞을 때만 (핵심 오답을 가리지 않음)
  if (nounOk && target.modifier) {
    const modParts = target.modifier.split(/\s+/).filter(Boolean);
    const focus =
      modParts[0] && isIngForm(modParts[0])
        ? modParts[0]
        : modParts[0] === 'to'
          ? modParts.slice(0, Math.min(3, modParts.length)).join(' ')
          : '';
    if (focus) {
      const focusHead = focus.split(/\s+/)[0]!;
      if (!findTokenMatch(saidTokens, focusHead)) {
        findings.push({
          role: 'modifier',
          status: 'missing',
          expected: focus,
          actual: '',
          why: modifierWhy(focus, ''),
        });
      }
    }
  }

  // 시제
  const tenseTarget = tenseLabel(target);
  const tenseSaid = tenseLabel(said);
  if (
    tenseTarget !== 'unknown' &&
    tenseSaid !== 'unknown' &&
    tenseTarget !== tenseSaid &&
    said.verb
  ) {
    const label = { past: '과거', present: '현재', future: '미래' } as const;
    findings.push({
      role: 'tense',
      status: 'wrong',
      expected: label[tenseTarget],
      actual: label[tenseSaid],
      why: `시제 오류 — 정답은 ${label[tenseTarget]}, 말한 것은 ${label[tenseSaid]} 쪽에 가까워요.`,
    });
  }

  // 3인칭 단수
  const subj = target.subject.toLowerCase();
  const needs3sg =
    subj === 'he' ||
    subj === 'she' ||
    subj === 'it' ||
    (subj !== 'i' &&
      subj !== 'you' &&
      subj !== 'we' &&
      subj !== 'they' &&
      subj.length > 0 &&
      !subj.includes(' '));
  if (needs3sg && target.verb) {
    const main = target.verb.split(/\s+/).pop()!;
    const expect3 = looks3sgVerb(main) || target.verb.split(/\s+/).some((p) => p === 'is' || p === 'does' || p === 'has');
    if (expect3) {
      const saidMain = (said.verb || '').split(/\s+/).pop() || '';
      const saidHas3 =
        looks3sgVerb(saidMain) ||
        said.verb.split(/\s+/).some((p) => p === 'is' || p === 'does' || p === 'has') ||
        saidTokens.some((t) => looks3sgVerb(t) && baseForm(t) === baseForm(main));
      const saidHasBase = saidTokens.some(
        (t) => baseForm(t) === baseForm(main) && !looks3sgVerb(t) && t !== 'is' && t !== 'does' && t !== 'has'
      );
      if (!saidHas3 && (saidHasBase || said.verb)) {
        findings.push({
          role: 'agreement',
          status: 'wrong',
          expected: main,
          actual: saidMain || '(원형)',
          why: `3인칭 단수 오류 — 「${target.subject}」 뒤에서 동사 -s/is/does/has 형태가 맞아야 해요. 말한 것「${saidMain || '원형'}」.`,
        });
      }
    }
  }

  return findings;
}

/** 문제가 있는 슬롯만 (Obsidian tags / frontmatter용) */
export function problemSlots(args: { en: string; guess: string }): GapSlotRole[] {
  return analyzeGapSlots(args)
    .filter((f) => f.status !== 'ok')
    .map((f) => f.role);
}

export const PATTERN_NOTE_IDS: GapSlotRole[] = [
  'subject',
  'verb',
  'noun',
  'modifier',
  'tense',
  'agreement',
  'adjective',
];

/**
 * Focus-on-Form 우선순위 — 의미·문장뼈대 → 형태 → 부가 수식.
 * (Long 1991 / Ellis FoF: 한 번에 하나의 형태에 주의)
 */
const PRIMARY_SLOT_ORDER: GapSlotRole[] = [
  'verb',
  'subject',
  'noun',
  'agreement',
  'tense',
  'modifier',
  'adjective',
];

export function patternNoteTitle(role: GapSlotRole): string {
  return roleLabel(role);
}

/** 슬롯별 다음 연습 한 줄 (앱 UI · Obsidian Patterns) */
export function patternPracticeTip(role: GapSlotRole): string {
  switch (role) {
    case 'subject':
      return '누가 하는지(I/you/he/she…)를 먼저 고른 뒤 나머지를 조립하세요.';
    case 'verb':
      return '동작·상태 동사(+입자)를 한 덩어리로 떠올린 다음 시제·인칭을 붙이세요.';
    case 'noun':
      return '무엇을/누구를(목적어 핵) 말하는지 먼저 정하세요. have+명사는 동사가 아니라 목적어입니다.';
    case 'modifier':
      return '명사 뒤 -ing 수식(living in …)이나 to부정사 부가가 빠지지 않았는지 보세요.';
    case 'tense':
      return '과거/현재/미래 중 어느 때인지 한국어 문장에서 표시를 찾으세요.';
    case 'agreement':
      return 'he/she/it 뒤에는 동사에 -s / is / does / has 가 붙는지 확인하세요.';
    case 'adjective':
      return '명사 앞 형용사(quiet, interesting …)가 빠지거나 다른 단어로 바뀌지 않았는지 보세요.';
  }
}

export function pickPrimaryFinding(problems: GapSlotFinding[]): GapSlotFinding | null {
  if (problems.length === 0) return null;
  for (const role of PRIMARY_SLOT_ORDER) {
    const hit = problems.find((p) => p.role === role);
    if (hit) return hit;
  }
  return problems[0] ?? null;
}

export interface GapReport {
  findings: GapSlotFinding[];
  problems: GapSlotFinding[];
  primary: GapSlotFinding | null;
  secondary: GapSlotFinding[];
  slots: GapSlotRole[];
  reason: string;
  practiceTip: string;
}

/** 교육용 간극 리포트 — 핵심 1개 + 부가 최대 1개 */
export function buildGapReport(args: {
  en: string;
  ko: string;
  guess: string;
  match: GapMatch;
  cueMode?: CueMode;
}): GapReport {
  const { en, ko, guess, match, cueMode } = args;

  if (match === 'skipped') {
    return {
      findings: [],
      problems: [],
      primary: null,
      secondary: [],
      slots: [],
      reason: '문장을 건너뛰었어요. 확신이 없거나 입이 아직 안 열린 상태일 수 있어요.',
      practiceTip: '같은 문장을 힌트(듣기) 뒤에 한 번 더 말해 보세요.',
    };
  }

  const g = (guess || '').trim();
  if (!g || g === '(스킵)' || g === '(없음)') {
    return {
      findings: [],
      problems: [],
      primary: null,
      secondary: [],
      slots: [],
      reason:
        '말이 인식되지 않았거나 침묵했어요. 발화 전 망설임·마이크 문제일 수 있어요. (실력 간극과 구분)',
      practiceTip: '짧게라도 주어+동사부터 말해 보세요.',
    };
  }

  const findings = analyzeGapSlots({ en, guess: g });
  const problems = findings.filter((f) => f.status !== 'ok');
  const primary = pickPrimaryFinding(problems);
  const secondary: GapSlotFinding[] = [];
  if (primary) {
    for (const role of PRIMARY_SLOT_ORDER) {
      if (role === primary.role) continue;
      const hit = problems.find((p) => p.role === role);
      if (hit) {
        secondary.push(hit);
        break;
      }
    }
  }

  const lines: string[] = [cueLead(cueMode)];

  if (primary) {
    lines.push('');
    lines.push('【핵심 간극】');
    lines.push(formatFinding(primary));
    lines.push(`→ 연습: ${patternPracticeTip(primary.role)}`);
    if (secondary.length > 0) {
      lines.push('');
      lines.push('【참고】');
      for (const f of secondary) {
        lines.push(formatFinding(f));
      }
    }
  } else {
    const target = tokenize(en);
    const said = tokenize(g);
    const missing = target.filter((w) => !said.includes(w));
    const extra = said.filter((w) => !target.includes(w));
    if (missing.length) lines.push(`• 빠진 말: ${missing.slice(0, 6).join(', ')}`);
    if (extra.length) lines.push(`• 덧붙인 말: ${extra.slice(0, 6).join(', ')}`);
    if (!missing.length && !extra.length) {
      lines.push('• 단어는 비슷한데 어순·발음 인식이 달랐을 수 있어요.');
    }
  }

  if (ko) {
    lines.push('');
    lines.push(`목표 뜻: 「${ko.replace(/\s+/g, ' ').trim()}」`);
  }

  return {
    findings,
    problems,
    primary,
    secondary,
    slots: problems.map((p) => p.role),
    reason: lines.join('\n'),
    practiceTip: primary ? patternPracticeTip(primary.role) : '',
  };
}

export function inferGapReason(args: {
  en: string;
  ko: string;
  guess: string;
  match: GapMatch;
  cueMode?: CueMode;
}): string {
  return buildGapReport(args).reason;
}

/** 자동 GapReport 문장인지 — 학습자 단서로 쓰면 안 됨 */
export function isAutoGapReportText(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (t.includes('【핵심 간극】') || t.includes('【참고】')) return true;
  if (/^영어를 본 뒤에도 달랐어요/.test(t)) return true;
  if (/^듣고 따라 말했지만/.test(t)) return true;
  if (/^힌트 없이 말하다 틀렸어요/.test(t)) return true;
  if (t.includes('목표 뜻:') && /•\s/.test(t)) return true;
  if (/정답 동사「/.test(t) && /대신「/.test(t)) return true;
  return false;
}

/** UI·힌트에 쓸 학습자 단서만 (자동 리포트 제외) */
export function learnerFacingClue(gap: {
  learnerClue?: string;
  reasonFinal?: string;
  reasonAuto?: string;
}): string {
  const raw = (gap.learnerClue || gap.reasonFinal || '').trim();
  if (!raw || isAutoGapReportText(raw)) return '';
  if (gap.reasonAuto && raw === gap.reasonAuto.trim()) return '';
  return raw;
}

/**
 * 학습자가 슬롯 칩으로 고른 것과 배경 분석(primarySlot)이 다른지.
 * 만든 당일엔 노출하지 않음 — 오답 직후 AI 해설 없음 원칙. 나중에(다른 날) 같은
 * 문장을 다시 만났을 때 힌트 옆에 참고로만 살짝 보여줌.
 */
export function hasSlotMismatch(gap: {
  learnerClue?: string;
  primarySlot?: GapSlotRole;
  createdAt?: string;
}): boolean {
  const clue = (gap.learnerClue || '').trim();
  if (!clue || !gap.primarySlot) return false;
  const pickedRole = PATTERN_NOTE_IDS.find((r) => patternNoteTitle(r) === clue);
  if (!pickedRole || pickedRole === gap.primarySlot) return false;
  const createdDay = (gap.createdAt || '').slice(0, 10);
  if (!createdDay) return false;
  const today = new Date().toISOString().slice(0, 10);
  return createdDay !== today;
}
