/**
 * cache-bust.ts — 배포 버전 변경 시 SW/Caches 정리 (etd-quest 패턴).
 * ?fresh=1 이면 강제 정리 후 재등록.
 */
declare const __APP_VERSION__: string
declare const __CACHE_VERSION__: string

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev'
const CACHE_VERSION =
  typeof __CACHE_VERSION__ !== 'undefined' ? __CACHE_VERSION__ : `ebq-v2-v${APP_VERSION}`
const STORAGE_KEY = 'ebq-cache-version'

export function getAppVersion(): string {
  return APP_VERSION
}

export function getCacheVersion(): string {
  return CACHE_VERSION
}

export async function purgeStaleAppCaches(): Promise<void> {
  if (typeof window === 'undefined') return
  if (location.protocol === 'file:') return

  const canUseCaches = typeof caches !== 'undefined'
  const canUseServiceWorker = 'serviceWorker' in navigator
  if (!canUseCaches && !canUseServiceWorker) return

  try {
    const forceFresh = new URLSearchParams(location.search).has('fresh')
    const storedVersion = localStorage.getItem(STORAGE_KEY)
    if (!forceFresh && storedVersion === CACHE_VERSION) return

    if (canUseServiceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
    if (canUseCaches) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
    localStorage.setItem(STORAGE_KEY, CACHE_VERSION)
  } catch (error) {
    console.warn('Cache purge skipped:', error)
  }
}

export async function registerServiceWorker(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  await purgeStaleAppCaches()
  try {
    await navigator.serviceWorker.register(
      `./sw.js?v=${encodeURIComponent(CACHE_VERSION)}`
    )
  } catch {
    /* SW optional */
  }
}
