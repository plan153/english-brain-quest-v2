/**
 * sw.js — 버전드 캐시 (이전 etd-quest 패턴).
 * - HTML은 캐시하지 않음 (Safari stuck-UI 주원인)
 * - data JSON은 network-only
 * - 정적 에셋은 network-first
 * CACHE 이름은 빌드 시 버전으로 치환됨 (__EBQ_CACHE_VERSION__).
 */
const CACHE = '__EBQ_CACHE_VERSION__';
/** 오디오는 내용 해시 파일명이라 버전과 무관하게 유지 (재다운로드 방지) */
const AUDIO_CACHE = 'ebq-audio-v1';

function sameOriginGet(request) {
  return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

function isHtmlNavigation(request, url) {
  if (request.mode === 'navigate') return true;
  const path = url.pathname;
  return path.endsWith('/') || path.endsWith('/index.html') || path.endsWith('index.html');
}

function isBypassPath(url) {
  return url.pathname.endsWith('/fresh.html') || url.pathname.endsWith('fresh.html');
}

function isDataJson(url) {
  return url.pathname.includes('/data/') && url.pathname.endsWith('.json');
}

/** 사전 생성 TTS mp3 — 파일명이 내용 해시라 불변. 한 번 받으면 계속 캐시에서 재생 */
function isPreparedAudio(url) {
  return url.pathname.includes('/audio/') && url.pathname.endsWith('.mp3');
}

async function cacheFirstAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkOnly(request) {
  return fetch(request, { cache: 'no-store' });
}

async function networkFirstAsset(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: 'reload' });
    if (sameOriginGet(request) && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error('offline');
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!sameOriginGet(request)) return;
  const url = new URL(request.url);
  if (isBypassPath(url)) return;
  if (isHtmlNavigation(request, url)) {
    event.respondWith(networkOnly(request));
    return;
  }
  if (isPreparedAudio(url)) {
    event.respondWith(cacheFirstAudio(request));
    return;
  }
  if (isDataJson(url)) {
    event.respondWith(networkOnly(request));
    return;
  }
  event.respondWith(networkFirstAsset(request));
});
