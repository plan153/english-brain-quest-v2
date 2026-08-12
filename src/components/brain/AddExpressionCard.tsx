/**
 * AddExpressionCard — 오늘 공부한 표현을 영어/한국어로 직접 추가.
 * 추가 즉시 「내 문장」으로 표시되고 복습 큐(due)에 들어간다.
 * 발음은 기존 TTS(Azure 사전생성 mp3 → 없으면 Web Speech 폴백)를 그대로 재사용.
 */
import { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useStore } from '../../state/store';
import { useSpeech } from '../../hooks/useSpeech';

const fieldStyle = {
  width: '100%',
  padding: '10px',
  borderRadius: '10px',
  border: '1px solid var(--ebq-border)',
  background: 'var(--ebq-surface-alt)',
  color: 'var(--ebq-text)',
  fontSize: '14px',
  resize: 'vertical' as const,
  fontFamily: 'inherit',
};

export function AddExpressionCard() {
  const addMyExpression = useStore((s) => s.addMyExpression);
  const [en, setEn] = useState('');
  const [ko, setKo] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const speech = useSpeech();

  const canSubmit = en.trim().length > 0 && ko.trim().length > 0;

  const handleAdd = () => {
    const result = addMyExpression(en, ko);
    if (!result.ok) {
      setMessage(result.error ?? '추가하지 못했어요.');
      return;
    }
    setMessage(
      result.wasExisting
        ? '이미 있던 표현이라 「내 문장」으로 표시했어요.'
        : '추가했어요! 복습 목록에 들어갔어요.'
    );
    setEn('');
    setKo('');
  };

  return (
    <Card style={{ marginTop: '12px' }}>
      <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>오늘 공부한 표현 추가</div>
      <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)', marginTop: '4px' }}>
        다른 곳에서 배운 영어/한국어 문장을 붙여넣으면 「내 문장」에 추가되고 복습 대상이 돼요.
      </div>

      <textarea
        value={en}
        onChange={(e) => setEn(e.target.value)}
        placeholder="영어 문장"
        rows={2}
        style={{ ...fieldStyle, marginTop: '10px' }}
      />
      <textarea
        value={ko}
        onChange={(e) => setKo(e.target.value)}
        placeholder="한국어 뜻"
        rows={2}
        style={{ ...fieldStyle, marginTop: '8px' }}
      />

      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <Button variant="primary" disabled={!canSubmit} onClick={handleAdd}>
          추가
        </Button>
        <Button
          disabled={!en.trim() || speech.speaking || !speech.ttsSupported}
          onClick={() => speech.speak(en.trim(), 'en')}
        >
          🔊 발음 확인
        </Button>
      </div>

      {message && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ebq-primary)' }}>
          {message}
        </div>
      )}
    </Card>
  );
}
