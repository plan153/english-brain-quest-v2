/**
 * PlacementFlow — 기본 난이도 선택 + 선택적 짧은 진단(타이핑·음성).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { KoPrompt } from '../ui/KoPrompt';
import { useSpeech } from '../../hooks/useSpeech';
import type { SpeechResult } from '../../interfaces/SpeechResult';
import {
  finalizePlacement,
  getPlacementItems,
  scorePlacementAnswer,
  shouldStopClimbing,
  type PlacementItem,
  type PlacementResult,
  type PlacementTrial,
} from '../../domain/placement-engine';
import {
  LEARNER_LEVEL_META,
  LEARNER_LEVELS,
  type LearnerLevel,
  recommendCopy,
} from '../../domain/learner-level';

interface Props {
  onComplete: (band: LearnerLevel, source: 'placement' | 'manual') => void;
  onSkip?: () => void;
}

type Phase = 'pick' | 'quiz' | 'result';

function LevelPickGrid({
  selected,
  onSelect,
  recommended,
}: {
  selected: LearnerLevel | null;
  onSelect: (b: LearnerLevel) => void;
  recommended?: LearnerLevel | null;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      {LEARNER_LEVELS.map((b) => {
        const active = selected === b;
        const isRec = recommended === b;
        return (
          <button
            key={b}
            type="button"
            onClick={() => onSelect(b)}
            style={{
              padding: '12px',
              borderRadius: '12px',
              border: `1px solid ${active ? 'var(--ebq-primary)' : 'var(--ebq-border)'}`,
              background: active ? 'rgba(74,222,128,0.14)' : 'transparent',
              color: 'var(--ebq-text)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '14px' }}>
              {LEARNER_LEVEL_META[b].name}
              {isRec ? ' · 추천' : ''}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--ebq-text-muted)',
                marginTop: '4px',
                lineHeight: 1.35,
              }}
            >
              {LEARNER_LEVEL_META[b].oneLiner}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--ebq-text-muted)', marginTop: '4px' }}>
              {LEARNER_LEVEL_META[b].comfortHint}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function PlacementFlow({ onComplete, onSkip }: Props) {
  const items = useMemo(() => getPlacementItems(), []);
  const [phase, setPhase] = useState<Phase>('pick');
  const [index, setIndex] = useState(0);
  const [trials, setTrials] = useState<PlacementTrial[]>([]);
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [picked, setPicked] = useState<LearnerLevel | null>('L3');
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current: PlacementItem | undefined = items[index];
  const currentRef = useRef(current);
  const trialsRef = useRef(trials);
  const indexRef = useRef(index);
  const itemsLenRef = useRef(items.length);
  const busyRef = useRef(false);
  currentRef.current = current;
  trialsRef.current = trials;
  indexRef.current = index;
  itemsLenRef.current = items.length;

  const finishWith = useCallback((list: PlacementTrial[]) => {
    const r = finalizePlacement(list);
    setResult(r);
    setPicked(r.recommended);
    setPhase('result');
    setBusy(false);
    busyRef.current = false;
  }, []);

  const submitText = useCallback(
    (text: string) => {
      const cur = currentRef.current;
      if (!cur || busyRef.current) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      busyRef.current = true;
      setBusy(true);

      const scored = scorePlacementAnswer(trimmed, cur.en);
      const trial: PlacementTrial = {
        itemId: cur.id,
        band: cur.band,
        pass: scored.pass,
        match: scored.match,
      };
      const nextTrials = [...trialsRef.current, trial];
      setTrials(nextTrials);
      setDraft('');
      setLastFeedback(scored.pass ? '좋아요 — 다음으로' : `참고: ${cur.en}`);

      const stop = shouldStopClimbing(nextTrials);
      const nextIndex = indexRef.current + 1;
      if (stop || nextIndex >= itemsLenRef.current) {
        finishWith(nextTrials);
        return;
      }
      setIndex(nextIndex);
      busyRef.current = false;
      setBusy(false);
    },
    [finishWith]
  );

  const handleSpeechResult = useCallback(
    (sr: SpeechResult) => {
      submitText(sr.text);
    },
    [submitText]
  );

  const speech = useSpeech({
    lang: 'en',
    onResult: handleSpeechResult,
    maxListenMs: 7000,
  });

  const startQuiz = useCallback(() => {
    if (speech.listening) speech.stopListening();
    setIndex(0);
    setTrials([]);
    setDraft('');
    setLastFeedback(null);
    setBusy(false);
    busyRef.current = false;
    setPhase('quiz');
  }, [speech]);

  if (phase === 'pick') {
    return (
      <Card style={{ padding: '20px' }}>
        <h2 style={{ marginTop: 0, textAlign: 'center' }}>연습 난이도 잡기</h2>
        <p
          style={{
            color: 'var(--ebq-text-muted)',
            fontSize: '13px',
            textAlign: 'center',
            lineHeight: 1.5,
            marginBottom: '14px',
          }}
        >
          먼저 기본 난이도를 고르세요.
          <br />
          그다음 바로 시작하거나, 짧은 진단(말하기·타이핑)으로 추천받을 수 있어요.
        </p>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginBottom: '8px' }}>
          기본 난이도 선택
        </div>
        <LevelPickGrid selected={picked} onSelect={setPicked} />
        <Button
          variant="primary"
          style={{ width: '100%', marginTop: '14px' }}
          disabled={!picked}
          onClick={() => picked && onComplete(picked, 'manual')}
        >
          {picked
            ? `「${LEARNER_LEVEL_META[picked].name}」으로 시작`
            : '레벨을 선택하세요'}
        </Button>
        <Button style={{ width: '100%', marginTop: '8px' }} disabled={!picked} onClick={startQuiz}>
          이 난이도 기준으로 짧은 진단받기
        </Button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            style={{
              display: 'block',
              width: '100%',
              marginTop: '10px',
              background: 'none',
              border: 'none',
              color: 'var(--ebq-text-muted)',
              fontSize: '12px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            추천 기본값(초중급)으로 바로 시작
          </button>
        )}
      </Card>
    );
  }

  if (phase === 'result' && result && picked) {
    const meta = LEARNER_LEVEL_META[picked];
    return (
      <Card style={{ padding: '20px' }}>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', textAlign: 'center' }}>
          진단 결과 · 원하면 다른 레벨로 바꿔도 돼요
        </div>
        <h2 style={{ margin: '8px 0', textAlign: 'center' }}>{meta.name}</h2>
        <p style={{ textAlign: 'center', fontSize: '14px', lineHeight: 1.5 }}>
          {recommendCopy(picked)}
        </p>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', margin: '16px 0 8px' }}>
          레벨 선택
        </div>
        <LevelPickGrid
          selected={picked}
          onSelect={setPicked}
          recommended={result.recommended}
        />
        <Button
          variant="primary"
          style={{ width: '100%', marginTop: '16px' }}
          onClick={() =>
            onComplete(
              picked,
              picked === result.recommended ? 'placement' : 'manual'
            )
          }
        >
          이 구간으로 연습 시작
        </Button>
        <Button style={{ width: '100%', marginTop: '8px' }} onClick={() => setPhase('pick')}>
          선택 화면으로
        </Button>
      </Card>
    );
  }

  if (!current) return null;

  return (
    <Card style={{ padding: '20px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--ebq-text-muted)',
          marginBottom: '12px',
        }}
      >
        <span>
          {index + 1} / {items.length}
        </span>
        <span>{LEARNER_LEVEL_META[current.band].name}</span>
      </div>
      <KoPrompt text={current.ko} />
      <p style={{ fontSize: '13px', color: 'var(--ebq-text-muted)', textAlign: 'center' }}>
        영어로 말하거나 타이핑해 보세요
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <Button
          variant={speech.listening ? 'recording' : 'primary'}
          style={{ flex: 1 }}
          disabled={!speech.supported || speech.listening || busy}
          onClick={() => speech.startListening()}
        >
          {speech.listening ? '말하는 중…' : '🎤 말하기'}
        </Button>
        {speech.listening && (
          <Button onClick={() => speech.stopListening()}>중지</Button>
        )}
      </div>

      {!speech.supported && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--ebq-danger)',
            textAlign: 'center',
            marginBottom: '8px',
          }}
        >
          이 브라우저는 음성 인식을 지원하지 않습니다. 타이핑으로 진행하세요.
        </div>
      )}
      {speech.error && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--ebq-danger)',
            textAlign: 'center',
            marginBottom: '8px',
          }}
        >
          {speech.error}
        </div>
      )}
      {speech.listening && speech.interimText && (
        <div
          style={{
            fontSize: '13px',
            color: 'var(--ebq-text-muted)',
            textAlign: 'center',
            marginBottom: '8px',
          }}
        >
          듣는 중: &quot;{speech.interimText}&quot;
        </div>
      )}

      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitText(draft);
          }
        }}
        placeholder="또는 영어로 타이핑…"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={busy || speech.listening}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid var(--ebq-border)',
          background: 'var(--ebq-surface-alt)',
          color: 'var(--ebq-text)',
          fontSize: '16px',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
      {lastFeedback && (
        <div
          style={{
            marginTop: '8px',
            fontSize: '12px',
            color: 'var(--ebq-text-muted)',
            textAlign: 'center',
          }}
        >
          {lastFeedback}
        </div>
      )}
      <Button
        variant="primary"
        style={{ width: '100%', marginTop: '12px' }}
        disabled={!draft.trim() || busy || speech.listening}
        onClick={() => submitText(draft)}
      >
        타이핑 제출
      </Button>
      <Button
        style={{ width: '100%', marginTop: '8px' }}
        disabled={busy || speech.listening}
        onClick={() => {
          const cur = currentRef.current;
          if (!cur) return;
          const trial: PlacementTrial = {
            itemId: cur.id,
            band: cur.band,
            pass: false,
            match: 'wrong',
          };
          const nextTrials = [...trialsRef.current, trial];
          setTrials(nextTrials);
          setDraft('');
          setLastFeedback(`참고: ${cur.en}`);
          if (shouldStopClimbing(nextTrials) || indexRef.current + 1 >= itemsLenRef.current) {
            finishWith(nextTrials);
          } else {
            setIndex(indexRef.current + 1);
          }
        }}
      >
        모르겠음 · 건너뛰기
      </Button>
      <Button
        style={{ width: '100%', marginTop: '8px' }}
        onClick={() => {
          if (speech.listening) speech.stopListening();
          setPhase('pick');
        }}
      >
        레벨 직접 고르기
      </Button>
    </Card>
  );
}
