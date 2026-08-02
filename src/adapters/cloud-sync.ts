/**
 * cloud-sync.ts — StorageAdapter 오케스트레이터.
 * 데스크톱: File System Access API (Vault 폴더 연결)
 * 모바일/폴백: IndexedDB 가상 볼트
 * Markdown 투영으로 Brain / Progress / Gaps / Patterns 기록.
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
  saveVaultHandle,
  loadVaultHandle,
  clearVaultHandle,
  verifyHandlePermission,
} from './filesystem-storage';
import {
  projectBrain,
  projectProgress,
  projectGap,
  projectIndex,
  projectVaultScaffold,
  makeGapId,
  brainPath,
  progressPath,
  gapPath,
  type ProgressSnapshot,
  type GapNote,
} from '../domain/vault-projection';
import type { SkillProfile } from '../domain/difficulty-mixer';
import type { Badge } from '../domain/reward-engine';
import { createZipBlob } from './zip-store';
import { summarizeWeakLinks, type SentenceMemory } from '../domain/srs-engine';
import {
  parseGapFiles,
  parseGapMarkdown,
  mergeGapForVaultWrite,
  type ImportedGap,
} from '../domain/vault-gap-import';

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
  const mode = activeMode !== 'none' ? activeMode : meta.mode;
  const labels: Record<SyncMode, string> = {
    filesystem: activeStorage ? 'Obsidian Vault (폴더 연결)' : 'Obsidian Vault (재연결 필요)',
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
  void saveVaultHandle(root);
  return getSyncStatus();
}

export function disconnectVault(): SyncStatus {
  activeStorage = null;
  activeMode = 'none';
  lastError = null;
  saveMeta({ mode: 'none', lastSyncAt: loadMeta().lastSyncAt });
  void clearVaultHandle();
  return getSyncStatus();
}

/**
 * 앱 시작 시 자동 재연결.
 * - filesystem: 저장된 핸들 + 이전 권한이 남아 있으면(queryPermission) 조용히 재연결.
 *   권한이 없으면 사용자가 폴더를 다시 선택해야 함 — 이때 IndexedDB로 조용히
 *   바꿔치기하지 않는다(모드 오염 방지 · 미연결로 남겨 사용자가 알아채게 함).
 * - indexeddb: 그대로 자동 재연결.
 */
export async function restoreSyncSession(): Promise<SyncStatus> {
  const meta = loadMeta();
  if (meta.mode === 'filesystem' && !activeStorage && isFileSystemAccessAvailable()) {
    try {
      const handle = await loadVaultHandle();
      if (handle && (await verifyHandlePermission(handle, 'readwrite'))) {
        activeStorage = createFileSystemStorage(handle);
        activeMode = 'filesystem';
        lastError = null;
      }
    } catch {
      /* 조용히 실패 — 사용자가 폴더를 다시 선택 */
    }
    return getSyncStatus();
  }
  if (meta.mode === 'indexeddb' && !activeStorage && isIndexedDbAvailable()) {
    return connectIndexedDb();
  }
  return getSyncStatus();
}

async function ensureStorage(): Promise<StorageAdapter> {
  if (activeStorage) return activeStorage;
  const meta = loadMeta();
  // filesystem 선호가 저장돼 있으면 IndexedDB로 조용히 바꿔치기하지 않는다 —
  // 그러면 사용자 모르게 Gap이 실제 Vault가 아닌 그림자 볼트에 쌓인다.
  if (meta.mode === 'filesystem') {
    throw new Error('Vault 폴더 재연결이 필요합니다 — 「Obsidian 폴더 연결」을 눌러 주세요.');
  }
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
  /** SRS 기억 — 볼트에 due/약점 거울 투영 */
  memories?: Record<string, SentenceMemory>;
}

export interface SyncResult {
  status: SyncStatus;
  /** 볼트에 이미 있던 메움 내용과 합쳐진 최종 Gap — 앱 상태 반영용 */
  mergedGaps: GapNote[];
}

/** 학습 상태를 Vault에 Markdown으로 투영. */
export async function syncToVault(payload: SyncPayload): Promise<SyncResult> {
  try {
    const storage = await ensureStorage();
    const userId = getUserId();
    const weakLinks = summarizeWeakLinks(Object.values(payload.memories ?? {}));

    // 쓰기 전 볼트에 이미 있는 파일을 읽어 「## 옵시디언 메움」이 플레이스홀더로
    // 덮이지 않도록 병합 (앱이 아직 import 안 한 메움도 보존)
    const mergedGaps: GapNote[] = [];
    for (const gap of payload.gaps ?? []) {
      const path = gapPath(userId, gap.id);
      let existing: ImportedGap | null = null;
      try {
        existing = parseGapMarkdown(await storage.read(path), path);
      } catch {
        existing = null;
      }
      mergedGaps.push(mergeGapForVaultWrite(gap, existing));
    }

    const files = [
      projectBrain({
        userId,
        skill: payload.skill,
        badges: payload.badges,
        progress: payload.progress,
        weakLinks,
      }),
      projectProgress({ userId, progress: payload.progress, weakLinks }),
      projectIndex({ userId, progress: payload.progress, weakLinks }),
      ...projectVaultScaffold(userId),
      ...mergedGaps.map((gap) => projectGap({ userId, gap })),
    ];
    for (const f of files) {
      await storage.write(f.path, f.markdown);
    }
    const now = new Date().toISOString();
    saveMeta({ mode: activeMode, lastSyncAt: now });
    lastError = null;
    return { status: getSyncStatus(), mergedGaps };
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
  const storage = await ensureStorage();
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

  // Gaps도 포함 — 모바일에서 쌓은 간극이 ZIP에 없으면 Mac 볼트로 영영 합류하지 못함
  const gapPrefixes = [`Learners/${userId}/Gaps/`, 'Learners/me/Gaps/'];
  const gapPaths = new Set<string>();
  for (const prefix of gapPrefixes) {
    try {
      for (const p of await storage.list(prefix)) {
        if (p.endsWith('.md')) gapPaths.add(p);
      }
    } catch {
      /* skip */
    }
  }
  for (const path of gapPaths) {
    try {
      const content = await storage.read(path);
      const base = path.split('/').pop()!;
      parts.push(path);
      zipEntries.push({ path: `Learners/me/Gaps/${base}`, content });
    } catch {
      /* skip */
    }
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
      '  그러면 Brain.md · Progress.md · Gaps/ 가 자동 배치되고 ZIP은 삭제됩니다.',
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

/** 연결된 스토리지(IndexedDB/Vault 폴더)에서 Gaps/*.md 읽어 파싱 */
export async function importVaultGaps(): Promise<ImportedGap[]> {
  const storage = await ensureStorage();
  const userId = getUserId();
  const prefixes = [`Learners/${userId}/Gaps/`, 'Learners/me/Gaps/'];
  const seen = new Set<string>();
  const files: { path: string; content: string }[] = [];

  for (const prefix of prefixes) {
    let paths: string[] = [];
    try {
      paths = await storage.list(prefix);
    } catch {
      continue;
    }
    for (const path of paths) {
      if (seen.has(path)) continue;
      if (!path.endsWith('.md')) continue;
      seen.add(path);
      try {
        const content = await storage.read(path);
        files.push({ path, content });
      } catch {
        /* skip */
      }
    }
  }

  // filesystem: list may return only under one root — also try listing Learners/
  if (files.length === 0) {
    try {
      const all = await storage.list('Learners/');
      for (const path of all) {
        if (!/\/Gaps\/[^/]+\.md$/i.test(path)) continue;
        if (seen.has(path)) continue;
        seen.add(path);
        try {
          files.push({ path, content: await storage.read(path) });
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip */
    }
  }

  return parseGapFiles(files);
}

export type { ImportedGap };

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
