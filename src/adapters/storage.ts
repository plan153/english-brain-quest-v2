/**
 * storage.ts — localStorage 기반 사용자 상태 저장 + getUserId 추상화.
 * StorageAdapter 인터페이스는 cloud-sync.ts에서 구현 (Phase 4).
 * Phase 1에서는 사용자 식별자와 간단한 진행 상태 저장만 담당.
 */
const STORAGE_PREFIX = 'ebq-v2:';
const USER_ID_KEY = `${STORAGE_PREFIX}userId`;

export function getUserId(): string {
  if (typeof localStorage === 'undefined') return 'me';
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const newId = `local-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(USER_ID_KEY, newId);
  return newId;
}

export function readLocal<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeLocal<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
}

export function removeLocal(key: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
}
