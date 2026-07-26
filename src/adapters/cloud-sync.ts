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
  brainPath,
  progressPath,
  type ProgressSnapshot,
  type GapNote,
} from '../domain/vault-projection';
import type { SkillProfile } from '../domain/difficulty-mixer';
import type { Badge } from '../domain/reward-engine';
import { createZipBlob } from './zip-store';

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

function stampForFilename(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function readOptional(path: string): Promise<string | null> {
  const storage = await ensureStorage();
  try {
    return await storage.read(path);
  } catch {
    return null;
  }
}

/**
 * Brain + progress를 ZIP으로 내보내기.
 * ZIP 안에 Learners/me/Learning/ 경로가 들어 있어 Vault 루트에 풀면 끝.
 * iOS는 공유 시트 우선 (연속 다운로드·파일명 번호 문제 회피).
 */
export async function exportVaultBundle(): Promise<{ filename: string; shared: boolean; parts: string[] }> {
  await ensureStorage();
  const userId = getUserId();
  const brain = brainPath(userId);
  const progress = progressPath(userId);
  const brainMd = await readOptional(brain);
  const progressMd = await readOptional(progress);

  const parts: string[] = [];
  const zipEntries: { path: string; content: string }[] = [];

  // 옵시디언 볼트 관례 경로(me)로 넣음 — 폰 userId와 달라도 Mac Vault에 바로 맞춤
  if (brainMd) {
    parts.push(brain);
    zipEntries.push({ path: 'Learners/me/Learning/Brain.md', content: brainMd });
  }
  if (progressMd) {
    parts.push(progress);
    // Mac APFS: Progress.md 와 progress.md 는 같은 파일 — Vault 관례명 사용
    zipEntries.push({ path: 'Learners/me/Learning/Progress.md', content: progressMd });
  }
  if (zipEntries.length === 0) {
    throw new Error('내보낼 노트가 없습니다. 먼저「지금 동기화」를 눌러 주세요.');
  }

  zipEntries.push({
    path: 'README-EBQ.txt',
    content: [
      'English Brain Quest → Obsidian',
      '',
      '가장 쉬운 방법 (Mac 자동화):',
      '  AirDrop / 저장 위치를',
      '  Project_English/_Inbox/EBQ/ 로 하세요.',
      '  그러면 Brain.md · Progress.md 가 자동 배치되고 ZIP은 삭제됩니다.',
      '',
      '또는 Downloads 에 두어도 같은 자동화가 처리합니다.',
      '',
      `내보낸 시각: ${new Date().toISOString()}`,
      `앱 learnerId: ${userId}`,
      '',
    ].join('\n'),
  });

  const filename = `ebq-vault-${stampForFilename()}.zip`;
  const blob = createZipBlob(zipEntries);
  const file = new File([blob], filename, { type: 'application/zip' });

  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof nav.share === 'function') {
    const data: ShareData = {
      files: [file],
      title: filename,
      text: 'EBQ → Obsidian Vault (ZIP 풀기)',
    };
    const canFiles = typeof nav.canShare !== 'function' || nav.canShare(data);
    if (canFiles) {
      try {
        await nav.share(data);
        return { filename, shared: true, parts };
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return { filename, shared: false, parts };
        }
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);

  return { filename, shared: false, parts };
}

/** @deprecated 단일 파일 연속 다운로드는 iOS에서 Brain이 누락됨 — exportVaultBundle 사용 */
export async function downloadVaultFile(path: string): Promise<void> {
  const storage = await ensureStorage();
  const content = await storage.read(path);
  const base = path.split('/').pop()?.replace(/\.md$/i, '') ?? 'note';
  const filename = `ebq-${base}-${stampForFilename()}.md`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export { makeGapId };
export type { GapNote, ProgressSnapshot };
