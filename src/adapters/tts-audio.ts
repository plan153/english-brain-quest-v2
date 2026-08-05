/**
 * tts-audio.ts — 빌드타임 사전 생성 mp3 재생 (Azure Speech).
 *
 * scripts/generate-tts.mjs가 public/audio/<hash>.mp3 + manifest.json을 만든다.
 * 여기서는 매니페스트에 있는 문장이면 mp3를 재생하고, 없으면 false를 돌려
 * 호출자(speech.ts)가 Web Speech API로 폴백하게 한다. 런타임 API 호출·키 노출 없음.
 */

/** scripts/generate-tts.mjs의 ttsHash와 반드시 동일 (테스트로 상호 검증) */
export function ttsHash(text: string): string {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

const AUDIO_BASE = `${import.meta.env.BASE_URL}audio`.replace(/\/?$/, '');

let manifestPromise: Promise<Set<string>> | null = null;

/** 매니페스트 1회 로드 — 없으면(미생성 상태) 빈 집합으로 조용히 폴백 */
function loadManifest(): Promise<Set<string>> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${AUDIO_BASE}/manifest.json`)
      .then((res) => (res.ok ? res.json() : { hashes: [] }))
      .then((raw: { hashes?: string[] }) => new Set(raw.hashes ?? []))
      .catch(() => new Set<string>());
  }
  return manifestPromise;
}

let current: HTMLAudioElement | null = null;

export function stopPreparedAudio(): void {
  if (!current) return;
  try {
    current.pause();
    current.currentTime = 0;
  } catch {
    /* ignore */
  }
  current = null;
}

/**
 * 사전 생성된 mp3가 있으면 재생하고 true, 없거나 실패하면 false.
 * false일 때 호출자가 Web Speech로 폴백한다.
 */
export async function playPreparedAudio(text: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return false;
  const hash = ttsHash(text);
  const manifest = await loadManifest();
  if (!manifest.has(hash)) return false;

  stopPreparedAudio();
  const audio = new Audio(`${AUDIO_BASE}/${hash}.mp3`);
  current = audio;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (current === audio) current = null;
      resolve(ok);
    };
    audio.onended = () => done(true);
    // 네트워크/디코딩 실패 — Web Speech로 폴백
    audio.onerror = () => done(false);
    audio.play().catch(() => done(false));
  });
}
