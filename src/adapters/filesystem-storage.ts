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
