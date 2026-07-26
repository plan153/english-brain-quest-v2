/**
 * StorageAdapter — 동기화 교체 가능한 스토리지 추상화.
 * 현재: LocalCloudStorage (File System Access API + IndexedDB 폴백)
 * 이후: ApiStorage (서버), HybridStorage (오프라인 폴백)
 */
export interface StorageAdapter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  list(path: string): Promise<string[]>;
  delete?(path: string): Promise<void>;
  exists?(path: string): Promise<boolean>;
}

export type StorageAdapterType = 'local-cloud' | 'api' | 'hybrid' | 'indexeddb';

export interface StorageAdapterInfo {
  type: StorageAdapterType;
  label: string;
  isAvailable: boolean;
}
