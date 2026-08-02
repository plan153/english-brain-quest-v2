/**
 * filesystem-storage.ts — File System Access API StorageAdapter.
 * 데스크톱 Chrome/Edge: 사용자가 선택한 폴더(Obsidian Vault)에 직접 쓰기.
 */
import type { StorageAdapter } from '../interfaces/StorageAdapter';

type DirHandle = FileSystemDirectoryHandle;

export function isFileSystemAccessAvailable(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

async function getFileHandle(
  root: DirHandle,
  path: string,
  create: boolean
): Promise<FileSystemFileHandle> {
  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
  if (parts.length === 0) throw new Error('Empty path');
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create });
  }
  return dir.getFileHandle(parts[parts.length - 1], { create });
}

async function ensureDir(root: DirHandle, dirPath: string): Promise<DirHandle> {
  const parts = dirPath.replace(/^\/+/, '').split('/').filter(Boolean);
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

export function createFileSystemStorage(root: DirHandle): StorageAdapter {
  return {
    async read(path) {
      const handle = await getFileHandle(root, path, false);
      const file = await handle.getFile();
      return file.text();
    },

    async write(path, content) {
      const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
      if (parts.length > 1) {
        await ensureDir(root, parts.slice(0, -1).join('/'));
      }
      const handle = await getFileHandle(root, path, true);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    },

    async list(prefix) {
      const normalized = prefix.replace(/^\/+/, '').replace(/\/$/, '');
      const results: string[] = [];

      async function walk(dir: DirHandle, base: string) {
        const entries = dir as unknown as AsyncIterable<[string, FileSystemHandle]>;
        for await (const [name, handle] of entries) {
          const full = base ? `${base}/${name}` : name;
          if (handle.kind === 'file') {
            if (!normalized || full.startsWith(normalized)) results.push(full);
          } else if (handle.kind === 'directory') {
            if (!normalized || normalized.startsWith(full) || full.startsWith(normalized)) {
              await walk(handle as DirHandle, full);
            }
          }
        }
      }

      if (normalized) {
        try {
          const start = await ensureDir(root, normalized);
          await walk(start, normalized);
        } catch {
          // prefix dir missing → empty
        }
      } else {
        await walk(root, '');
      }
      return results;
    },

    async delete(path) {
      const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
      if (parts.length === 0) return;
      let dir = root;
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: false });
      }
      await dir.removeEntry(parts[parts.length - 1]);
    },

    async exists(path) {
      try {
        await getFileHandle(root, path, false);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** 사용자에게 Obsidian Vault 폴더 선택 요청. */
export async function pickVaultDirectory(): Promise<DirHandle> {
  if (!isFileSystemAccessAvailable()) {
    throw new Error('File System Access API not supported in this browser');
  }
  // @ts-expect-error — showDirectoryPicker is Chromium-only
  return window.showDirectoryPicker({ mode: 'readwrite' });
}

/**
 * FSA 핸들 영속화 — 새로고침 후에도 (권한이 남아 있으면) 폴더를 다시 고르지 않고
 * 조용히 재연결하기 위해 IndexedDB에 핸들 객체 자체를 저장한다.
 */
const HANDLE_DB = 'ebq-v2-vault-handle';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'root';

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('handle db open failed'));
  });
}

export async function saveVaultHandle(handle: DirHandle): Promise<void> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('save handle failed'));
  });
}

/** 저장된 핸들 읽기 — 없거나 IndexedDB 미지원이면 null (조용히 실패). */
export async function loadVaultHandle(): Promise<DirHandle | null> {
  try {
    const db = await openHandleDb();
    return await new Promise<DirHandle | null>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as DirHandle | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('load handle failed'));
    });
  } catch {
    return null;
  }
}

export async function clearVaultHandle(): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('clear handle failed'));
    });
  } catch {
    /* 지워지지 않아도 치명적이지 않음 */
  }
}

type PermissionMode = 'read' | 'readwrite';
interface PermissibleHandle {
  queryPermission?(opts: { mode: PermissionMode }): Promise<PermissionState>;
}

/** 사용자 제스처 없이 조회만 — 이전에 허용됐으면 브라우저가 기억하고 있을 수 있음. */
export async function verifyHandlePermission(
  handle: DirHandle,
  mode: PermissionMode = 'readwrite'
): Promise<boolean> {
  const h = handle as unknown as PermissibleHandle;
  if (typeof h.queryPermission !== 'function') return false;
  try {
    const status = await h.queryPermission({ mode });
    return status === 'granted';
  } catch {
    return false;
  }
}
