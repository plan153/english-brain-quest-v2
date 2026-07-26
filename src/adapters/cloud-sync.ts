/**
 * cloud-sync.ts — StorageAdapter 오케스트레이터.
 * 데스크톱: File System Access API (Vault 폴더 연결)
 * 모바일/폴백: IndexedDB 가상 볼트
 * Markdown 투영으로 Brain.md / progress.md / Gaps 기록.
 */
import type { StorageAdapter, StorageAdapterType } from '../interfaces/StorageAdapter';
import { getUserId, readLocal, writeLocal } from './storage';
import {
  createIndexedDbStorage,
  isIndexedDbAvailable,
} from './indexeddb-storage';
import {
  createFileSystemStorage,
  isFileSystemAccessAvailable,
  pickVaultDirectory,
} from './filesystem-storage';
import {
  projectBrain,
  projectProgress,
  projectGap,
  projectIndex,
  makeGapId,
  type ProgressSnapshot,
  type GapNote,
} from '../domain/vault-projection';
import type { SkillProfile } from '../domain/difficulty-mixer';
import type { Badge } from '../domain/reward-engine';

export type SyncMode = 'filesystem' | 'indexeddb' | 'none';

export interface SyncStatus {
  mode: SyncMode;
  connected: boolean;
  lastSyncAt: string | null;
  label: string;
  error: string | null;
}

interface SyncMeta {
  mode: SyncMode;
  lastSyncAt: string | null;
  /** File System Access 핸들은 세션 메모리만 — 새로고침 시 재연결 필요 */
}

let activeStorage: StorageAdapter | null = null;
let activeMode: SyncMode = 'none';
let lastError: string | null = null;

const META_KEY = 'vault-sync';

function loadMeta(): SyncMeta {
  return readLocal<SyncMeta>(META_KEY) ?? { mode: 'none', lastSyncAt: null };
}

function saveMeta(meta: SyncMeta): void {
  writeLocal(META_KEY, meta);
}

export function getSyncStatus(): SyncStatus {
  const meta = loadMeta();
  const mode = activeMode !== 'none' ? activeMode : meta.mode === 'indexeddb' ? 'indexeddb' : 'none';
  const labels: Record<SyncMode, string> = {
    filesystem: 'Obsidian Vault (폴더 연결)',
    indexeddb: 'IndexedDB (기기 내 가상 볼트)',
    none: '미연결',
  };
  return {
    mode,
    connected: mode !== 'none' && activeStorage !== null,
    lastSyncAt: meta.lastSyncAt,
    label: labels[mode],
    error: lastError,
  };
}

export function getAvailableAdapters(): { type: StorageAdapterType; label: string; available: boolean }[] {
  return [
    {
      type: 'local-cloud',
      label: 'File System Access (데스크톱 Vault)',
      available: isFileSystemAccessAvailable(),
    },
    {
      type: 'indexeddb',
      label: 'IndexedDB (모바일/폴백)',
      available: isIndexedDbAvailable(),
    },
  ];
}

/** IndexedDB 가상 볼트 연결 (모바일 기본). */
export async function connectIndexedDb(): Promise<SyncStatus> {
  if (!isIndexedDbAvailable()) {
    lastError = 'IndexedDB를 사용할 수 없습니다.';
    throw new Error(lastError);
  }
  activeStorage = createIndexedDbStorage();
  activeMode = 'indexeddb';
  lastError = null;
  saveMeta({ mode: 'indexeddb', lastSyncAt: loadMeta().lastSyncAt });
  return getSyncStatus();
}

/** 데스크톱: Obsidian Vault 폴더 선택. */
export async function connectVaultFolder(): Promise<SyncStatus> {
  if (!isFileSystemAccessAvailable()) {
    lastError = '이 브라우저는 폴더 연결을 지원하지 않습니다. Chrome/Edge를 사용하거나 IndexedDB를 쓰세요.';
    throw new Error(lastError);
  }
  const root = await pickVaultDirectory();
  activeStorage = createFileSystemStorage(root);
  activeMode = 'filesystem';
  lastError = null;
  saveMeta({ mode: 'filesystem', lastSyncAt: loadMeta().lastSyncAt });
  return getSyncStatus();
}

export function disconnectVault(): SyncStatus {
  activeStorage = null;
  activeMode = 'none';
  lastError = null;
  saveMeta({ mode: 'none', lastSyncAt: loadMeta().lastSyncAt });
  return getSyncStatus();
}

/**
 * 앱 시작 시 IndexedDB 모드였으면 자동 재연결.
 * File System은 보안상 핸들 재획득 불가 → 사용자가 다시 연결.
 */
export async function restoreSyncSession(): Promise<SyncStatus> {
  const meta = loadMeta();
  if (meta.mode === 'indexeddb' && isIndexedDbAvailable()) {
    return connectIndexedDb();
  }
  return getSyncStatus();
}

async function ensureStorage(): Promise<StorageAdapter> {
  if (activeStorage) return activeStorage;
  // 기본: IndexedDB 자동 연결
  if (isIndexedDbAvailable()) {
    await connectIndexedDb();
    if (activeStorage) return activeStorage;
  }
  throw new Error('스토리지가 연결되지 않았습니다.');
}

export interface SyncPayload {
  progress: ProgressSnapshot;
  skill: SkillProfile;
  badges: Badge[];
  gaps?: GapNote[];
}

/** 학습 상태를 Vault에 Markdown으로 투영. */
export async function syncToVault(payload: SyncPayload): Promise<SyncStatus> {
  try {
    const storage = await ensureStorage();
    const userId = getUserId();
    const files = [
      projectBrain({ userId, skill: payload.skill, badges: payload.badges, progress: payload.progress }),
      projectProgress({ userId, progress: payload.progress }),
      projectIndex({ userId, progress: payload.progress }),
      ...(payload.gaps ?? []).map((gap) => projectGap({ userId, gap })),
    ];
    for (const f of files) {
      await storage.write(f.path, f.markdown);
    }
    const now = new Date().toISOString();
    saveMeta({ mode: activeMode, lastSyncAt: now });
    lastError = null;
    return getSyncStatus();
  } catch (err) {
    lastError = (err as Error).message;
    throw err;
  }
}

/** 오답 1건 Gap 노트 추가. */
export async function syncGapNote(gap: Omit<GapNote, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): Promise<void> {
  const storage = await ensureStorage();
  const userId = getUserId();
  const full: GapNote = {
    id: gap.id ?? makeGapId(gap.expressionId, gap.guess),
    expressionId: gap.expressionId,
    en: gap.en,
    ko: gap.ko,
    guess: gap.guess,
    createdAt: gap.createdAt ?? new Date().toISOString(),
  };
  const file = projectGap({ userId, gap: full });
  await storage.write(file.path, file.markdown);
}

/** IndexedDB에 저장된 파일 목록 (디버그/내보내기용). */
export async function listVaultFiles(prefix = ''): Promise<string[]> {
  const storage = await ensureStorage();
  return storage.list(prefix);
}

/** 단일 파일 Markdown 다운로드 (모바일에서 Obsidian으로 가져가기). */
export async function downloadVaultFile(path: string): Promise<void> {
  const storage = await ensureStorage();
  const content = await storage.read(path);
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = path.split('/').pop() ?? 'note.md';
  a.click();
  URL.revokeObjectURL(url);
}

export { makeGapId };
export type { GapNote, ProgressSnapshot };
