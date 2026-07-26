/**
 * indexeddb-storage.ts — IndexedDB 기반 StorageAdapter.
 * 모바일/폴백용. 경로를 키로 가상 파일시스템처럼 저장.
 */
import type { StorageAdapter } from '../interfaces/StorageAdapter';

const DB_NAME = 'ebq-v2-vault';
const DB_VERSION = 1;
const STORE = 'files';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'path' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\\/g, '/');
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function createIndexedDbStorage(): StorageAdapter {
  return {
    async read(path) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(normalizePath(path));
        req.onsuccess = () => {
          const row = req.result as { path: string; content: string } | undefined;
          if (!row) reject(new Error(`Not found: ${path}`));
          else resolve(row.content);
        };
        req.onerror = () => reject(req.error ?? new Error('read failed'));
      });
    },

    async write(path, content) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ path: normalizePath(path), content, updatedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('write failed'));
      });
    },

    async list(prefix) {
      const db = await openDb();
      const normalized = normalizePath(prefix);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => {
          const rows = (req.result as { path: string }[]) ?? [];
          const paths = rows
            .map((r) => r.path)
            .filter((p) => (normalized ? p.startsWith(normalized) : true));
          resolve(paths);
        };
        req.onerror = () => reject(req.error ?? new Error('list failed'));
      });
    },

    async delete(path) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(normalizePath(path));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('delete failed'));
      });
    },

    async exists(path) {
      try {
        await this.read(path);
        return true;
      } catch {
        return false;
      }
    },
  };
}
