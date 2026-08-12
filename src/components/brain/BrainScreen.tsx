/**
 * BrainScreen — My English Brain.
 * XP/스킬/배지 + 약점 강화 + 복습 빈도 + 오늘 만난 문장.
 */
import { useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useStore } from '../../state/store';
import { levelFromXp } from '../../domain/reward-engine';
import type { SkillAxis } from '../../domain/difficulty-mixer';
import {
  LEARNER_LEVEL_META,
  nudgeBand,
} from '../../domain/learner-level';
import {
  REVIEW_INTENSITY_LABEL,
  CUE_MODE_LABEL,
  countDue,
  countOwned,
  countWeakTraining,
  summarizeWeakLinks,
  type ReviewIntensity,
} from '../../domain/srs-engine';
import { VaultSyncCard } from './VaultSyncCard';
import { TodayLogCard } from './TodayLogCard';
import { AddExpressionCard } from './AddExpressionCard';
import { GapClueCard } from '../today/GapReasonCard';
import { summarizePatternGaps, countPatternTraining } from '../../domain/pattern-queue';
import { learnerFacingClue } from '../../domain/gap-reason';
import { PlacementFlow } from '../today/PlacementFlow';

const SKILL_AXIS_META: { axis: SkillAxis; label: string }[] = [
  { axis: 'form', label: '형태 (form)' },
  { axis: 'function', label: '기능 (function)' },
  { axis: 'pattern', label: '패턴 (pattern)' },
  { axis: 'situation', label: '상황 (situation)' },
  { axis: 'nuance', label: '뉘앙스 (nuance)' },
  { axis: 'tense', label: '시간 (tense)' },
];

const INTENSITY_OPTIONS: ReviewIntensity[] = ['intense', 'normal', 'relaxed'];

export function BrainScreen() {
  const xp = useStore((s) => s.xp);
  const streakDays = useStore((s) => s.streakDays);
  const todaySentenceCount = useStore((s) => s.todaySentenceCount);
  const correctCount = useStore((s) => s.correctCount);
  const attemptCount = useStore((s) => s.attemptCount);
  const totalSentences = useStore((s) => s.totalSentences);
  const skill = useStore((s) => s.skill);
  const badges = useStore((s) => s.badges);
  const brainFocusTodayLog = useStore((s) => s.brainFocusTodayLog);
  const memories = useStore((s) => s.memories);
  const reviewIntensity = useStore((s) => s.reviewIntensity);
  const setReviewIntensity = useStore((s) => s.setReviewIntensity);
  const requestStartPack = useStore((s) => s.requestStartPack);
  const gapNotes = useStore((s) => s.gapNotes);
  const markGapReviewed = useStore((s) => s.markGapReviewed);
  const saveGapClue = useStore((s) => s.saveGapClue);
  const practiceBand = useStore((s) => s.practiceBand);
  const setPracticeBand = useStore((s) => s.setPracticeBand);
  const clearPracticeBand = useStore((s) => s.clearPracticeBand);
  const comfortStreak = useStore((s) => s.comfortStreak);
  const bandConquestCount = useStore((s) => s.bandConquestCount);
  const [retakePlacement, setRetakePlacement] = useState(false);

  const memoryList = useMemo(() => Object.values(memories), [memories]);
  const dueCount = useMemo(() => countDue(memoryList), [memoryList]);
  const owned = useMemo(() => countOwned(memoryList), [memoryList]);
  const weakCount = useMemo(() => countWeakTraining(memoryList), [memoryList]);
  const weakSummary = useMemo(() => summarizeWeakLinks(memoryList), [memoryList]);
  const openClueGaps = useMemo(
    () =>
      [...gapNotes]
        .filter((g) => {
          const s = g.reasonStatus ?? 'pending';
          if (!(s === 'clued' || s === 'edited' || s === 'confirmed')) return false;
          return Boolean(learnerFacingClue(g));
        })
        .reverse()
        .slice(0, 5),
    [gapNotes]
  );

  const accuracy = attemptCount > 0 ? Math.round((correctCount / attemptCount) * 100) : 0;
  const lvl = levelFromXp(xp);
  const memoryCount = memoryList.length;
  const bandMeta = practiceBand ? LEARNER_LEVEL_META[practiceBand] : null;

  if (retakePlacement || !practiceBand) {
    return (
      <div>
        <PlacementFlow
          onComplete={(band, source) => {
            setPracticeBand(band, source);
            setRetakePlacement(false);
          }}
          onSkip={() => {
            setPracticeBand('L3', 'manual');
            setRetakePlacement(false);
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ebq-primary)' }}>
            Lv {lvl.level}
          </div>
          <div style={{ color: 'var(--ebq-accent)', fontWeight: 700 }}>{xp} XP</div>
        </div>
        <div className="progress-bar" style={{ marginTop: '8px' }}>
          <div className="fill" style={{ width: `${lvl.progressPct}%` }} />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)', marginTop: '4px' }}>
          다음 레벨까지 {lvl.nextLevelXp} XP
        </div>
      </Card>

      <Card style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>지금 연습 난이도</div>
            <div style={{ fontWeight: 700, fontSize: '18px', marginTop: '4px' }}>{bandMeta?.name}</div>
        <div style={{ fontSize: '13px', color: 'var(--ebq-text-muted)', marginTop: '4px' }}>
          {bandMeta?.oneLiner}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginTop: '6px' }}>
          {bandMeta?.comfortHint}
        </div>
        {comfortStreak > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--ebq-accent)', marginTop: '8px', fontWeight: 700 }}>
            적당 구간 {comfortStreak}연속 · 정복 준비 중
          </div>
        )}
        {bandConquestCount > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginTop: '4px' }}>
            구간 정복 {bandConquestCount}회
          </div>
        )}
        <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
          <Button
            disabled={practiceBand === 'L1'}
            onClick={() => setPracticeBand(nudgeBand(practiceBand, -1), 'manual')}
          >
            조금 쉽게
          </Button>
          <Button
            disabled={practiceBand === 'L4'}
            onClick={() => setPracticeBand(nudgeBand(practiceBand, 1), 'manual')}
          >
            조금 어렵게
          </Button>
          <Button
            onClick={() => {
              clearPracticeBand();
              setRetakePlacement(true);
            }}
          >
            다시 잡기
          </Button>
        </div>
      </Card>

      <Card style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>약한 고리 강화</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px',
            marginTop: '10px',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)' }}>약점 큐</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ebq-danger)' }}>
              {weakCount}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)' }}>복습 대기</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ebq-primary)' }}>
              {dueCount}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)' }}>내 문장</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ebq-accent)' }}>
              {owned}
            </div>
          </div>
        </div>

        {weakSummary.weak.length > 0 ? (
          <ul style={{ margin: '12px 0 0', padding: '0 0 0 18px', fontSize: '13px' }}>
            {weakSummary.weak.slice(0, 5).map((w) => (
              <li key={w.sentenceId} style={{ marginBottom: '6px' }}>
                <strong>{w.en}</strong>
                <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)' }}>
                  {w.reason}
                  {w.lastCueMode ? ` · ${CUE_MODE_LABEL[w.lastCueMode]}` : ''}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--ebq-text-muted)' }}>
            아직 표시할 약점이 없어요. 틀린 문장·볼트 Gaps가 여기 쌓입니다.
          </div>
        )}

        <button
          type="button"
          disabled={weakCount === 0}
          onClick={() => requestStartPack('weak')}
          style={{
            marginTop: '12px',
            width: '100%',
            padding: '12px',
            borderRadius: '12px',
            border: '1px solid var(--ebq-danger)',
            background: weakCount > 0 ? 'var(--ebq-danger)' : 'var(--ebq-surface-alt)',
            color: weakCount > 0 ? '#fff' : 'var(--ebq-text-muted)',
            fontWeight: 800,
            cursor: weakCount > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          약점 강화 훈련 시작 →
        </button>
      </Card>

      <AddExpressionCard />

      {(() => {
        const patternRows = summarizePatternGaps(gapNotes);
        const patternTotal = countPatternTraining(gapNotes);
        if (patternTotal === 0) return null;
        return (
          <Card style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>
              패턴 약점 ({patternTotal})
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginTop: '6px' }}>
              같은 슬롯(주어·시제·3인칭 등) Gap만 모아 다시 말합니다.
            </div>
            <ul style={{ margin: '10px 0 0', padding: '0 0 0 18px', fontSize: '13px' }}>
              {patternRows.slice(0, 5).map((r) => (
                <li key={r.role} style={{ marginBottom: '6px' }}>
                  <strong>{r.label}</strong>
                  <span style={{ color: 'var(--ebq-text-muted)' }}>
                    {' '}
                    · 문장 {r.sentenceCount} · Gap {r.gapHits}
                  </span>
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => requestStartPack('pattern', { role: null })}
                style={{
                  flex: '1 1 140px',
                  padding: '10px',
                  borderRadius: '12px',
                  border: '1px solid var(--ebq-accent)',
                  background: 'rgba(96,165,250,0.12)',
                  color: 'var(--ebq-accent)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                패턴 자동 훈련 →
              </button>
              {patternRows.slice(0, 3).map((r) => (
                <button
                  key={r.role}
                  type="button"
                  onClick={() => requestStartPack('pattern', { role: r.role })}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid var(--ebq-border)',
                    background: 'var(--ebq-surface-alt)',
                    color: 'var(--ebq-text)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {r.label} →
                </button>
              ))}
            </div>
          </Card>
        );
      })()}

      {openClueGaps.length > 0 && (
        <Card style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>
            옵시디언 메움 대기 ({openClueGaps.length})
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginTop: '6px' }}>
            목표는 힌트·답변으로 간극을 스스로 만들고, 옵시디언에서 메운 뒤 그 결과가
            다음 힌트·간극 잡기에 다시 쓰이는 선순환입니다. 메운 뒤 「메움 완료」.
          </div>
          {openClueGaps.map((gap) => (
            <div key={gap.id} style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{gap.ko}</div>
              <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)' }}>
                정답은 카드에서 필요할 때만
              </div>
              <GapClueCard
                gap={gap}
                guess={gap.guess}
                canonicalEn={gap.en}
                onSaveClue={(clue) =>
                  saveGapClue({
                    sentence: {
                      id: gap.expressionId,
                      en: gap.en,
                      ko: gap.ko,
                      packId: gap.packId,
                    },
                    clue,
                    guess: gap.guess,
                    match: gap.match === 'skipped' ? 'skipped' : 'wrong',
                    cueMode: gap.cueMode,
                    inputMode: gap.inputMode,
                  })
                }
                onMarkReviewed={(id) => markGapReviewed(id)}
              />
            </div>
          ))}
        </Card>
      )}

      <Card style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>복습 · 기억</div>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginTop: '8px' }}>
          기억 카드 {memoryCount} · 복습 빈도
        </div>
        <div className="review-intensity">
          {INTENSITY_OPTIONS.map((id) => (
            <button
              key={id}
              type="button"
              className={reviewIntensity === id ? 'active' : ''}
              onClick={() => setReviewIntensity(id)}
            >
              {REVIEW_INTENSITY_LABEL[id]}
            </button>
          ))}
        </div>
        {dueCount > 0 && (
          <button
            type="button"
            onClick={() => requestStartPack('review')}
            style={{
              marginTop: '12px',
              width: '100%',
              padding: '10px',
              borderRadius: '12px',
              border: '1px solid var(--ebq-primary)',
              background: 'rgba(74,222,128,0.1)',
              color: 'var(--ebq-primary)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            복습 팩 시작 →
          </button>
        )}
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginTop: '12px',
        }}
      >
        <Card>
          <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>연속 학습</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>🔥 {streakDays}일</div>
        </Card>
        <Card>
          <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>오늘 학습</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{todaySentenceCount}문장</div>
        </Card>
        <Card>
          <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>누적 문장</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{totalSentences}</div>
        </Card>
        <Card>
          <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>정답률</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{accuracy}%</div>
        </Card>
      </div>

      <TodayLogCard autoFocus={brainFocusTodayLog} />

      <Card style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>
          6축 숙련도 — My English Brain Map
        </div>
        <div style={{ marginTop: '12px' }}>
          {SKILL_AXIS_META.map(({ axis, label }) => (
            <SkillBar key={axis} label={label} value={skill[axis]} />
          ))}
        </div>
      </Card>

      <Card style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>
          배지 ({badges.length}개 획득)
        </div>
        {badges.length === 0 ? (
          <div style={{ marginTop: '12px', color: 'var(--ebq-text-muted)', fontSize: '13px' }}>
            아직 획득한 배지가 없어요. 학습하면 자동으로 해금돼요.
          </div>
        ) : (
          <div
            style={{
              marginTop: '12px',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '8px',
            }}
          >
            {badges.map((b) => (
              <div
                key={b.id}
                style={{
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid var(--ebq-accent)',
                  borderRadius: '12px',
                  padding: '10px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '22px' }}>🏆</div>
                <div style={{ fontWeight: 700, fontSize: '13px' }}>{b.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--ebq-text-muted)' }}>
                  {b.description}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <VaultSyncCard />
    </div>
  );
}

function SkillBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
        }}
      >
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="progress-bar">
        <div className="fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
