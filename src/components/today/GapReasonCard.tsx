/**
 * GapReasonCard — 오답/스킵 직후 간극 이유 확인·수정.
 */
import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import type { GapNote } from '../../domain/vault-projection';

interface GapReasonCardProps {
  gap: GapNote;
  onConfirm: (gapId: string) => void;
  onSaveEdit: (gapId: string, reason: string) => void;
}

export function GapReasonCard({ gap, onConfirm, onSaveEdit }: GapReasonCardProps) {
  const displayReason = (gap.reasonFinal || gap.reasonAuto || '').trim();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayReason);
  const status = gap.reasonStatus ?? 'pending';
  const done = status === 'confirmed' || status === 'edited';

  useEffect(() => {
    setDraft(displayReason);
    if (done) setEditing(false);
  }, [gap.id, gap.updatedAt, gap.reasonStatus, displayReason, done]);

  if (done && !editing) {
    return (
      <Card style={{ marginTop: '10px', borderColor: 'var(--ebq-primary)' }}>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>간극 이유</div>
        <div
          style={{
            marginTop: '6px',
            fontSize: '14px',
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
          }}
        >
          {displayReason}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ebq-primary)', marginTop: '6px' }}>
          {status === 'edited' ? '수정·저장됨' : '확인됨'}
        </div>
        <Button
          className="toggle-btn"
          style={{ marginTop: '8px' }}
          onClick={() => {
            setDraft(displayReason);
            setEditing(true);
          }}
        >
          다시 수정
        </Button>
      </Card>
    );
  }

  return (
    <Card style={{ marginTop: '10px', borderColor: 'var(--ebq-accent)' }}>
      <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>
        간극이 자동으로 생겼어요. 이유가 맞나요?
      </div>
      {!editing ? (
        <>
          <div
            style={{
              marginTop: '8px',
              fontSize: '14px',
              lineHeight: 1.45,
              fontWeight: 600,
              whiteSpace: 'pre-wrap',
            }}
          >
            {displayReason || gap.reasonAuto}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => onConfirm(gap.id)}>
              맞아요
            </Button>
            <Button
              onClick={() => {
                setDraft(displayReason || gap.reasonAuto || '');
                setEditing(true);
              }}
            >
              수정할래요
            </Button>
          </div>
        </>
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            style={{
              width: '100%',
              marginTop: '8px',
              padding: '10px',
              borderRadius: '10px',
              border: '1px solid var(--ebq-border)',
              background: 'var(--ebq-surface-alt)',
              color: 'var(--ebq-text)',
              fontFamily: 'inherit',
              fontSize: '14px',
              resize: 'vertical',
            }}
            placeholder="왜 틀렸다고 생각하나요?"
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              onClick={() => {
                const text = draft.trim();
                if (!text) return;
                onSaveEdit(gap.id, text);
                setEditing(false);
              }}
            >
              저장
            </Button>
            <Button onClick={() => setEditing(false)}>취소</Button>
          </div>
        </>
      )}
    </Card>
  );
}
