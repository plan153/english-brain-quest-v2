/**
 * VaultSyncCard — Phase 4 Obsidian Vault 동기화 UI.
 * 데스크톱: 폴더 연결 (File System Access)
 * 모바일: IndexedDB 가상 볼트 + 단일 Markdown보내기(공유/다운로드)
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
  exportVaultBundle,
  type SyncStatus,
} from '../../adapters/cloud-sync';
import { getUserId } from '../../adapters/storage';
import { getObsidianVaultName, setObsidianVaultName } from '../../adapters/obsidian-link';

export function VaultSyncCard() {
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [vaultName, setVaultName] = useState(() => getObsidianVaultName());
  const syncNow = useStore((s) => s.syncNow);
  const absorbVaultGaps = useStore((s) => s.absorbVaultGaps);
  const requestStartPack = useStore((s) => s.requestStartPack);
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
        if (okMsg) setMsg(okMsg);
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
                  const result = await absorbVaultGaps();
                  setMsg(result.message);
                  if (result.imported > 0) {
                    requestStartPack('weak');
                  }
                }, '')
              }
            >
              📥 볼트 → 힌트·간극 선순환
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await syncNow();
                  const result = await exportVaultBundle();
                  if (result.shared) {
                    setMsg(
                      `ZIP 공유됨: ${result.filename} → Mac의 Project_English/_Inbox/EBQ 로 보내면 자동 배치`
                    );
                    return;
                  }
                  setMsg(
                    `ZIP 저장: ${result.filename} → Mac _Inbox/EBQ 또는 Downloads 에 두면 자동 배치`
                  );
                }, '')
              }
            >
              ⬇️ 옵시디언용보내기
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
            color: msg.includes('실패') || msg.includes('Error') || msg.includes('지원') || msg.includes('없습니다')
              ? 'var(--ebq-danger)'
              : 'var(--ebq-primary)',
          }}
        >
          {msg}
        </div>
      )}

      <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--ebq-text-muted)' }}>
        「볼트 → 힌트·간극 선순환」은 Gaps의 단서·옵시디언 메움·슬롯을 읽어
        다음 힌트·패턴 약점·복습에 반영합니다.
        Mac은 폴더 연결 후, 아이폰은 동기화로 Gaps가 쌓인 뒤 사용하세요.
        보내기: ZIP → <code>_Inbox/EBQ</code>.
      </div>

      <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--ebq-text-muted)' }}>
        옵시디언 볼트 이름: <strong>{vaultName}</strong>{' '}
        <button
          type="button"
          onClick={() => {
            const next = window.prompt('옵시디언 볼트 이름 (obsidian:// 딥링크에 사용)', vaultName);
            if (next !== null) {
              setObsidianVaultName(next);
              setVaultName(getObsidianVaultName());
            }
          }}
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--ebq-primary)',
            cursor: 'pointer',
            font: 'inherit',
            padding: 0,
          }}
        >
          변경
        </button>
      </div>
    </Card>
  );
}
