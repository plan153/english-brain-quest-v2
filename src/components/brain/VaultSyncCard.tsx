/**
 * VaultSyncCard — Phase 4 Obsidian Vault 동기화 UI.
 * 데스크톱: 폴더 연결 (File System Access)
 * 모바일: IndexedDB 가상 볼트 + Markdown 다운로드
 */
import { useCallback, useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useStore } from '../../state/store';
import {
  connectVaultFolder,
  connectIndexedDb,
  disconnectVault,
  restoreSyncSession,
  getSyncStatus,
  getAvailableAdapters,
  listVaultFiles,
  downloadVaultFile,
  type SyncStatus,
} from '../../adapters/cloud-sync';
import { brainPath, progressPath } from '../../domain/vault-projection';
import { getUserId } from '../../adapters/storage';

export function VaultSyncCard() {
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const syncNow = useStore((s) => s.syncNow);
  const adapters = getAvailableAdapters();
  const fsaOk = adapters.find((a) => a.type === 'local-cloud')?.available;
  const idbOk = adapters.find((a) => a.type === 'indexeddb')?.available;

  useEffect(() => {
    void restoreSyncSession().then((s) => {
      setStatus(s);
      if (s.connected) {
        void listVaultFiles(`Learners/${getUserId()}`)
          .then((files) => setFileCount(files.length))
          .catch(() => setFileCount(0));
      }
    });
  }, []);

  const refresh = useCallback(async () => {
    const s = getSyncStatus();
    setStatus(s);
    if (s.connected) {
      try {
        const files = await listVaultFiles(`Learners/${getUserId()}`);
        setFileCount(files.length);
      } catch {
        setFileCount(0);
      }
    } else {
      setFileCount(0);
    }
  }, []);

  const run = useCallback(
    async (fn: () => Promise<unknown>, okMsg: string) => {
      setBusy(true);
      setMsg(null);
      try {
        await fn();
        setMsg(okMsg);
        await refresh();
      } catch (err) {
        setMsg((err as Error).message);
        setStatus(getSyncStatus());
      }
      setBusy(false);
    },
    [refresh]
  );

  return (
    <Card style={{ marginTop: '12px' }}>
      <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>
        Obsidian Vault 동기화
      </div>
      <div style={{ marginTop: '8px', fontWeight: 700, fontSize: '15px' }}>
        {status.connected ? `✅ ${status.label}` : `⚪ ${status.label}`}
      </div>
      {status.lastSyncAt && (
        <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)', marginTop: '4px' }}>
          마지막 동기화: {new Date(status.lastSyncAt).toLocaleString()}
          {fileCount > 0 ? ` · ${fileCount}개 파일` : ''}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
        {fsaOk && (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => run(connectVaultFolder, 'Vault 폴더 연결됨')}
          >
            📂 Obsidian 폴더 연결
          </Button>
        )}
        {idbOk && (
          <Button
            disabled={busy}
            onClick={() => run(connectIndexedDb, 'IndexedDB 가상 볼트 연결됨')}
          >
            💾 기기 내 볼트 (IndexedDB)
          </Button>
        )}
        {status.connected && (
          <>
            <Button
              disabled={busy}
              onClick={() => run(() => syncNow(), '동기화 완료')}
            >
              🔄 지금 동기화
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const uid = getUserId();
                  await downloadVaultFile(brainPath(uid));
                  await downloadVaultFile(progressPath(uid));
                }, 'Brain.md / progress.md 다운로드')
              }
            >
              ⬇️ Markdown 다운로드
            </Button>
            <Button
              disabled={busy}
              onClick={() => run(async () => disconnectVault(), '연결 해제됨')}
            >
              연결 해제
            </Button>
          </>
        )}
      </div>

      {msg && (
        <div
          style={{
            marginTop: '10px',
            fontSize: '12px',
            color: msg.includes('실패') || msg.includes('Error') || msg.includes('지원')
              ? 'var(--ebq-danger)'
              : 'var(--ebq-primary)',
          }}
        >
          {msg}
        </div>
      )}

      <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--ebq-text-muted)' }}>
        세션 종료 시 Brain.md / progress.md / Gaps가 자동 기록됩니다.
        데스크톱은 Vault 폴더를, 모바일은 IndexedDB + 다운로드를 쓰세요.
      </div>
    </Card>
  );
}
