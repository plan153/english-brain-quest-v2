#!/usr/bin/env node
/**
 * generate-tts.mjs — 빌드타임 TTS 사전 생성 (Azure Speech).
 *
 * 모든 학습 문장(quiz-verbs·conversation-100·collocations·phrasal-verbs·expressions)의
 * 영어 텍스트를 mp3로 미리 생성해 public/audio/에 둔다. 런타임 API 호출 0 · 오프라인 동작.
 * 이미 생성된 문장(해시 파일 존재)은 건너뛰므로 신규 콘텐츠 추가 후 재실행하면 증분만 생성.
 *
 * 사용 (Mac 로컬, API 키는 커밋 금지):
 *   AZURE_SPEECH_KEY=<key> AZURE_SPEECH_REGION=koreacentral node scripts/generate-tts.mjs
 *
 * 옵션 env:
 *   EBQ_TTS_VOICE  (기본 en-US-JennyNeural)
 *   EBQ_TTS_RATE   (기본 -10%, 학습자용 살짝 느리게)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** src/adapters/tts-audio.ts의 ttsHash와 반드시 동일해야 함 (테스트로 상호 검증) */
export function ttsHash(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
}

/** 모든 팩에서 영어 문장 수집 (중복 제거) */
export function collectTexts() {
  const texts = new Set();
  const add = (t) => {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    if (s) texts.add(s);
  };
  for (const it of readJson('data/canon/quiz-verbs/catalog.json').items) add(it.en);
  for (const it of readJson('data/canon/conversation-100/catalog.json').items) add(it.en);
  for (const c of readJson('data/canon/collocations/catalog.json').collocations) add(c.en);
  for (const it of readJson('data/canon/phrasal-verbs/stages.json').items) add(it.en);
  for (const e of readJson('data/canon/expressions/pack-starter.json')) add(e.audioText || e.english);
  return [...texts];
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function synthesizeOne({ text, key, region, voice, rate }) {
  const ssml = `<speak version='1.0' xml:lang='en-US'><voice name='${voice}'><prosody rate='${rate}'>${escapeXml(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'ebq-build-tts',
    },
    body: ssml,
  });
  if (!res.ok) {
    throw new Error(`Azure TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'koreacentral';
  const voice = process.env.EBQ_TTS_VOICE || 'en-US-JennyNeural';
  const rate = process.env.EBQ_TTS_RATE || '-10%';
  if (!key) {
    console.error('AZURE_SPEECH_KEY 환경변수가 필요합니다.');
    console.error('예: AZURE_SPEECH_KEY=xxx AZURE_SPEECH_REGION=koreacentral node scripts/generate-tts.mjs');
    process.exit(1);
  }

  const texts = collectTexts();

  // 해시 충돌 방어 — 서로 다른 문장이 같은 파일명을 가지면 중단
  const byHash = new Map();
  for (const t of texts) {
    const h = ttsHash(t);
    if (byHash.has(h) && byHash.get(h) !== t) {
      console.error(`해시 충돌: "${byHash.get(h)}" vs "${t}" (${h})`);
      process.exit(1);
    }
    byHash.set(h, t);
  }

  const outDir = path.join(ROOT, 'public', 'audio');
  mkdirSync(outDir, { recursive: true });

  let made = 0;
  let skipped = 0;
  let failed = 0;
  for (const [hash, text] of byHash) {
    const file = path.join(outDir, `${hash}.mp3`);
    if (existsSync(file)) {
      skipped += 1;
      continue;
    }
    try {
      let buf;
      try {
        buf = await synthesizeOne({ text, key, region, voice, rate });
      } catch (err) {
        if (String(err).includes('429')) {
          await sleep(5000); // rate limit — 한 번 쉬고 재시도
          buf = await synthesizeOne({ text, key, region, voice, rate });
        } else {
          throw err;
        }
      }
      writeFileSync(file, buf);
      made += 1;
      if (made % 50 === 0) console.log(`  …${made}개 생성`);
      await sleep(120);
    } catch (err) {
      failed += 1;
      console.error(`실패: "${text}" — ${err}`);
      if (failed > 10) {
        console.error('실패가 10건을 넘어 중단합니다. 키/리전/네트워크를 확인하세요.');
        process.exit(1);
      }
    }
  }

  // 실제 존재하는 파일만 매니페스트에 기록
  const hashes = [...byHash.keys()].filter((h) => existsSync(path.join(outDir, `${h}.mp3`))).sort();
  writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(
      { version: 1, voice, rate, generatedAt: new Date().toISOString(), count: hashes.length, hashes },
      null,
      2
    )
  );

  console.log(`완료 — 생성 ${made} · 스킵(기존) ${skipped} · 실패 ${failed} · 매니페스트 ${hashes.length}개`);
  console.log('다음: git add public/audio && 커밋 → 배포하면 앱이 자동으로 mp3를 우선 재생합니다.');
}

// 직접 실행할 때만 main (테스트에서 import 가능하도록)
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
