/**
 * sync-loop.test.ts — store.ts의 syncNow/absorbVaultGaps 오케스트레이션 통합 테스트.
 * cloud-sync.ts(브라우저 전용 IndexedDB/FSA)는 모킹하고, 순서·상태 반영만 검증한다.
 *
 * 검증 목표:
 * 1) syncNow는 반드시 import(볼트 읽기) → sync(볼트 쓰기) 순서로 호출한다
 *    (순서가 뒤바뀌면 방금 옵시디언에서 쓴 메움을 못 보고 지나칠 수 있음)
 * 2) import로 들어온 ImportedGap(볼트에 이미 reviewed로 메워진 것)이 로컬 gapNotes에
 *    반영되고, 단서(learnerClue)와 메움(vaultFill)이 분리 저장된다
 * 3) syncToVault가 돌려준 mergedGaps(쓰기 시점 병합 결과)도 로컬 상태에 반영된다
 * 4) absorbVaultGaps(수동 버튼) 경로도 같은 병합 로직을 공유해 동일하게 동작한다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { importVaultGapsMock, syncToVaultMock, callOrder } = vi.hoisted(() => ({
  importVaultGapsMock: vi.fn(),
  syncToVaultMock: vi.fn(),
  callOrder: [] as string[],
}));

vi.mock('../adapters/cloud-sync', () => ({
  importVaultGaps: (...args: unknown[]) => {
    callOrder.push('import');
    return importVaultGapsMock(...args);
  },
  syncToVault: (...args: unknown[]) => {
    callOrder.push('sync');
    return syncToVaultMock(...args);
  },
  restoreSyncSession: vi.fn(async () => ({
    mode: 'none' as const,
    connected: false,
    lastSyncAt: null,
    label: '미연결',
    error: null,
  })),
  getSyncStatus: vi.fn(() => ({
    mode: 'none' as const,
    connected: false,
    lastSyncAt: null,
    label: '미연결',
    error: null,
  })),
  makeGapId: (expressionId: string, guess: string) => `gap_${expressionId}_${(guess || '').length}`,
}));

import { useStore } from '../state/store';

function resetStore() {
  useStore.setState({
    gapNotes: [],
    pendingGaps: [],
    memories: {},
  });
  callOrder.length = 0;
  importVaultGapsMock.mockReset();
  syncToVaultMock.mockReset();
}

describe('syncNow orchestration', () => {
  beforeEach(() => {
    resetStore();
  });

  it('imports vault gaps before writing (import → sync order)', async () => {
    importVaultGapsMock.mockResolvedValue([]);
    syncToVaultMock.mockResolvedValue({
      status: { mode: 'indexeddb', connected: true, lastSyncAt: new Date().toISOString(), label: 'x', error: null },
      mergedGaps: [],
    });

    await useStore.getState().syncNow();

    expect(callOrder).toEqual(['import', 'sync']);
  });

  it('absorbs an Obsidian-reviewed gap from the vault and separates clue vs. fill', async () => {
    importVaultGapsMock.mockResolvedValue([
      {
        expressionId: 'e1',
        en: 'She needs help.',
        ko: '도움이 필요해요.',
        guess: 'She need help.',
        path: 'Learners/me/Gaps/gap_e1_x.md',
        learnerClue: '3인칭 s 빠짐',
        vaultFill:
          'She는 3인칭 단수라서 동사에 -s가 붙어야 한다. need가 아니라 needs. 이런 문장을 몇 개 더 써 보면서 감을 익혔다.',
        reasonStatus: 'reviewed',
        slots: ['agreement'],
      },
    ]);
    syncToVaultMock.mockImplementation(async (payload: { gaps: unknown[] }) => ({
      status: { mode: 'indexeddb', connected: true, lastSyncAt: new Date().toISOString(), label: 'x', error: null },
      mergedGaps: payload.gaps,
    }));

    await useStore.getState().syncNow();

    const note = useStore.getState().gapNotes.find((g) => g.expressionId === 'e1');
    expect(note).toBeDefined();
    expect(note?.reasonStatus).toBe('reviewed');
    // 짧은 단서와 긴 메움이 서로 다른 필드에 분리 저장돼야 함 (메움이 힌트를 뒤덮으면 안 됨)
    expect(note?.learnerClue).toBe('3인칭 s 빠짐');
    expect(note?.vaultFill).toContain('3인칭 단수');
    expect(note?.learnerClue).not.toBe(note?.vaultFill);
  });

  it('reconciles syncToVault-side merges (vault fill preserved during write) back into local state', async () => {
    // 로컬은 아직 clued 상태로만 알고 있음
    useStore.setState({
      gapNotes: [
        {
          id: 'gap_e2_1',
          expressionId: 'e2',
          en: 'I have found my keys.',
          ko: '열쇠를 찾았어요.',
          guess: 'I find my keys.',
          createdAt: '2026-08-01T00:00:00.000Z',
          reasonStatus: 'clued',
          learnerClue: 'have + p.p. 완료 놓침',
        },
      ],
    });
    importVaultGapsMock.mockResolvedValue([]);
    // syncToVault가 "쓰기 직전 볼트에서 읽었더니 이미 메워져 있더라"는 병합 결과를 돌려주는 상황을 재현
    syncToVaultMock.mockResolvedValue({
      status: { mode: 'indexeddb', connected: true, lastSyncAt: new Date().toISOString(), label: 'x', error: null },
      mergedGaps: [
        {
          id: 'gap_e2_1',
          expressionId: 'e2',
          en: 'I have found my keys.',
          ko: '열쇠를 찾았어요.',
          guess: 'I find my keys.',
          createdAt: '2026-08-01T00:00:00.000Z',
          reasonStatus: 'reviewed',
          learnerClue: 'have + p.p. 완료 놓침',
          vaultFill: '현재완료는 have + p.p. 형태. found는 find의 p.p.',
        },
      ],
    });

    await useStore.getState().syncNow();

    const note = useStore.getState().gapNotes.find((g) => g.expressionId === 'e2');
    expect(note?.reasonStatus).toBe('reviewed');
    expect(note?.vaultFill).toContain('have + p.p.');
  });

  it('clears pendingGaps after a successful sync', async () => {
    useStore.setState({
      pendingGaps: [
        {
          id: 'gap_e3_1',
          expressionId: 'e3',
          en: 'Hi.',
          ko: '안녕.',
          guess: 'Hi',
          createdAt: '2026-08-01T00:00:00.000Z',
          reasonStatus: 'clued',
        },
      ],
    });
    importVaultGapsMock.mockResolvedValue([]);
    syncToVaultMock.mockResolvedValue({
      status: { mode: 'indexeddb', connected: true, lastSyncAt: new Date().toISOString(), label: 'x', error: null },
      mergedGaps: [],
    });

    await useStore.getState().syncNow();
    expect(useStore.getState().pendingGaps).toHaveLength(0);
  });
});

describe('absorbVaultGaps (manual button path)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('reports a friendly message when there is nothing to absorb', async () => {
    importVaultGapsMock.mockResolvedValue([]);
    const result = await useStore.getState().absorbVaultGaps();
    expect(result.imported).toBe(0);
    expect(result.message).toContain('볼트 Gaps가 없어요');
  });

  it('imports and reports counts using the same merge logic as syncNow', async () => {
    importVaultGapsMock.mockResolvedValue([
      {
        expressionId: 'e9',
        en: 'Do you need help?',
        ko: '도움이 필요하세요?',
        guess: '(스킵)',
        path: 'Learners/me/Gaps/gap_e9_x.md',
        match: 'skipped',
      },
    ]);
    const result = await useStore.getState().absorbVaultGaps();
    expect(result.imported).toBe(1);
    expect(result.message).toContain('흡수');
    const note = useStore.getState().gapNotes.find((g) => g.expressionId === 'e9');
    expect(note).toBeDefined();
  });
});
