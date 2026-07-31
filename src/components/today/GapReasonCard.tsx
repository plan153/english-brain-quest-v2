/**
 * GapClueCard — 오답 직후 AI/자동 해설 없음.
 * 학습자가 틀린 지점을 스스로 찾고, 나중에 힌트·옵시디언으로 메움.
 * 경로: ① 스스로 찾기 → ② 옵시디언 메움 → ③ 나중 힌트
 */
import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import type { GapNote } from '../../domain/vault-projection';

export type GapLoopStatus = 'draft' | 'clued' | 'reviewed';

interface GapClueCardProps {
  /** 이미 저장된 간극 (없으면 신규 단서 작성) */
  gap?: GapNote | null;
  guess?: string;
  onSaveClue: (clue: string) => void;
  onMarkReviewed?: (gapId: string) => void;
  /** 정답 공개 여부 (부모: 단서 저장 후 또는 사용자가 명시적으로 열 때) */
  answerRevealed?: boolean;
  onRevealAnswer?: () => void;
  canonicalEn?: string;
}

function loopStatus(gap?: GapNote | null): GapLoopStatus {
  const s = gap?.reasonStatus;
  if (s === 'reviewed') return 'reviewed';
  if (s === 'clued' || s === 'edited' || s === 'confirmed') return 'clued';
  if (gap?.learnerClue || gap?.reasonFinal) return 'clued';
  return 'draft';
}

function PathSteps({ active }: { active: GapLoopStatus }) {
  const steps: { id: GapLoopStatus; label: string }[] = [
    { id: 'draft', label: '① 스스로 찾기' },
    { id: 'clued', label: '② 옵시디언 메움' },
    { id: 'reviewed', label: '③ 나중 힌트' },
  ];
  const order = { draft: 0, clued: 1, reviewed: 2 } as const;
  const cur = order[active];
  return (
    <div
      style={{
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
        fontSize: '11px',
        marginBottom: '8px',
      }}
    >
      {steps.map((st, i) => (
        <span
          key={st.id}
          style={{
            padding: '3px 8px',
            borderRadius: '999px',
            border: `1px solid ${i <= cur ? 'var(--ebq-primary)' : 'var(--ebq-border)'}`,
            color: i <= cur ? 'var(--ebq-primary)' : 'var(--ebq-text-muted)',
            fontWeight: i === cur ? 700 : 500,
          }}
        >
          {st.label}
        </span>
      ))}
    </div>
  );
}

export function GapClueCard({
  gap,
  guess,
  onSaveClue,
  onMarkReviewed,
  answerRevealed,
  onRevealAnswer,
  canonicalEn,
}: GapClueCardProps) {
  const status = loopStatus(gap);
  const existing = (gap?.learnerClue || gap?.reasonFinal || '').trim();
  const [draft, setDraft] = useState(existing);
  const [editing, setEditing] = useState(status === 'draft');
  const [localRevealed, setLocalRevealed] = useState(false);
  const revealed = answerRevealed ?? localRevealed;
  const reveal = onRevealAnswer ?? (() => setLocalRevealed(true));

  useEffect(() => {
    setDraft(existing);
    setEditing(status === 'draft');
    setLocalRevealed(false);
  }, [gap?.id, gap?.updatedAt, existing, status]);

  return (
    <Card style={{ marginTop: '10px', borderColor: 'var(--ebq-accent)' }}>
      <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>
        간극 · 지금 AI 해설 없음
      </div>
      <PathSteps active={status} />

      {guess ? (
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginBottom: '6px' }}>
          방금 말/입력: &quot;{guess}&quot;
        </div>
      ) : null}

      {editing || status === 'draft' ? (
        <>
          <div style={{ fontSize: '13px', lineHeight: 1.45, marginBottom: '8px' }}>
            간극을 <strong>만드는 과정</strong>이 곧 학습입니다. 지금 AI 해설 없이
            어디가 달랐는지 한 줄로 남기면 → 옵시디언에서 메우고 → 그게 다음 힌트와
            간극 잡기에 다시 쓰입니다.
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '10px',
              border: '1px solid var(--ebq-border)',
              background: 'var(--ebq-surface-alt)',
              color: 'var(--ebq-text)',
              fontFamily: 'inherit',
              fontSize: '14px',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
            placeholder="예: friends인데 plant로 들림 / living 수식을 빼먹음"
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              onClick={() => {
                const text = draft.trim();
                if (!text) return;
                onSaveClue(text);
                setEditing(false);
              }}
            >
              내 단서 저장
            </Button>
            {!revealed && canonicalEn && (
              <Button onClick={reveal}>그래도 정답 보기</Button>
            )}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>
            내 단서 · 다음 힌트 후보
          </div>
          <div
            style={{
              marginTop: '4px',
              fontSize: '14px',
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              fontWeight: 600,
            }}
          >
            {existing}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)', marginTop: '8px' }}>
            {status === 'reviewed'
              ? '메움 완료 · 같은 문장이 다시 나오면 이 단서를 힌트로 보여 줍니다'
              : '옵시디언 Gaps에서 메운 뒤 「메움 완료」→ 다음에 힌트로 씁니다'}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <Button
              onClick={() => {
                setDraft(existing);
                setEditing(true);
              }}
            >
              단서 고치기
            </Button>
            {status === 'clued' && gap && onMarkReviewed && (
              <Button variant="primary" onClick={() => onMarkReviewed(gap.id)}>
                메움 완료
              </Button>
            )}
            {!revealed && canonicalEn && (
              <Button onClick={reveal}>그래도 정답 보기</Button>
            )}
          </div>
        </>
      )}

      {revealed && canonicalEn && (
        <div
          style={{
            marginTop: '12px',
            paddingTop: '10px',
            borderTop: '1px solid var(--ebq-border)',
            fontSize: '14px',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>정답</div>
          <div style={{ fontWeight: 700, marginTop: '4px' }}>{canonicalEn}</div>
        </div>
      )}
    </Card>
  );
}

/** @deprecated 이름 호환 — GapClueCard 사용 */
export { GapClueCard as GapReasonCard };
