/**
 * PlacementFlow — 첫 연습 전 짧은 난이도 진단.
 * 목적은 점수/레벨 과시가 아니라 적당 구간으로 안내.
 */
import { useCallback, useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { KoPrompt } from '../ui/KoPrompt';
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

type Phase = 'intro' | 'quiz' | 'result';

export function PlacementFlow({ onComplete, onSkip }: Props) {
  const items = useMemo(() => getPlacementItems(), []);
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [trials, setTrials] = useState<PlacementTrial[]>([]);
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [picked, setPicked] = useState<LearnerLevel | null>(null);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);

  const current: PlacementItem | undefined = items[index];

  const finishWith = useCallback((list: PlacementTrial[]) => {
    const r = finalizePlacement(list);
    setResult(r);
    setPicked(r.recommended);
    setPhase('result');
  }, []);

  const submitGuess = useCallback(() => {
    if (!current) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    const scored = scorePlacementAnswer(trimmed, current.en);
    const trial: PlacementTrial = {
      itemId: current.id,
      band: current.band,
      pass: scored.pass,
      match: scored.match,
    };
    const nextTrials = [...trials, trial];
    setTrials(nextTrials);
    setDraft('');
    setLastFeedback(
      scored.pass
        ? '좋아요 — 다음으로'
        : `참고: ${current.en}`
    );

    const stop = shouldStopClimbing(nextTrials);
    const nextIndex = index + 1;
    // 연속 실패면 현재 밴드 이후 문항 스킵
    if (stop) {
      finishWith(nextTrials);
      return;
    }
    if (nextIndex >= items.length) {
      finishWith(nextTrials);
      return;
    }
    setIndex(nextIndex);
  }, [current, draft, trials, index, items.length, finishWith]);

  if (phase === 'intro') {
    return (
      <Card style={{ padding: '20px' }}>
        <h2 style={{ marginTop: 0, textAlign: 'center' }}>연습 난이도 잡기</h2>
        <p
          style={{
            color: 'var(--ebq-text-muted)',
            fontSize: '14px',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          짧은 문장 몇 개만 말해 보면, 너무 쉽거나 어렵지 않은
          <br />
          연습 구간을 맞춰 드려요. (점수 시험이 아니에요)
        </p>
        <Button
          variant="primary"
          style={{ width: '100%', marginTop: '12px' }}
          onClick={() => setPhase('quiz')}
        >
          시작하기
        </Button>
        {onSkip && (
          <Button
            style={{ width: '100%', marginTop: '8px' }}
            onClick={onSkip}
          >
            일단 초급으로 시작
          </Button>
        )}
      </Card>
    );
  }

  if (phase === 'result' && result && picked) {
    const meta = LEARNER_LEVEL_META[picked];
    return (
      <Card style={{ padding: '20px' }}>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', textAlign: 'center' }}>
          추천 연습 구간
        </div>
        <h2 style={{ margin: '8px 0', textAlign: 'center' }}>{meta.name}</h2>
        <p style={{ textAlign: 'center', fontSize: '14px', lineHeight: 1.5 }}>
          {recommendCopy(picked)}
        </p>
        <p
          style={{
            textAlign: 'center',
            fontSize: '12px',
            color: 'var(--ebq-text-muted)',
            marginTop: '4px',
          }}
        >
          {meta.comfortHint}
        </p>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', margin: '16px 0 8px' }}>
          직접 고르기
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {LEARNER_LEVELS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setPicked(b)}
              style={{
                padding: '10px',
                borderRadius: '12px',
                border: `1px solid ${picked === b ? 'var(--ebq-primary)' : 'var(--ebq-border)'}`,
                background: picked === b ? 'rgba(74,222,128,0.12)' : 'transparent',
                color: 'var(--ebq-text)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '13px' }}>
                {LEARNER_LEVEL_META[b].name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)', marginTop: '2px' }}>
                {LEARNER_LEVEL_META[b].oneLiner}
              </div>
            </button>
          ))}
        </div>
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
        영어로 타이핑해 보세요
      </p>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitGuess();
          }
        }}
        placeholder="Type in English…"
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
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
        disabled={!draft.trim()}
        onClick={submitGuess}
      >
        다음
      </Button>
      <Button
        style={{ width: '100%', marginTop: '8px' }}
        onClick={() => {
          const trial: PlacementTrial = {
            itemId: current.id,
            band: current.band,
            pass: false,
            match: 'wrong',
          };
          const nextTrials = [...trials, trial];
          setTrials(nextTrials);
          setDraft('');
          setLastFeedback(`참고: ${current.en}`);
          if (shouldStopClimbing(nextTrials) || index + 1 >= items.length) {
            finishWith(nextTrials);
          } else {
            setIndex(index + 1);
          }
        }}
      >
        모르겠음 · 건너뛰기
      </Button>
    </Card>
  );
}
