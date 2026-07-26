/**
 * BrainScreen — Phase 2: My English Brain.
 * 실제 XP/레벨/스킬/배지 표시 + 다음 레벨 진행 바.
 */
import { Card } from '../ui/Card';
import { useStore } from '../../state/store';
import { levelFromXp } from '../../domain/reward-engine';
import type { SkillAxis } from '../../domain/difficulty-mixer';
import { VaultSyncCard } from './VaultSyncCard';

const SKILL_AXIS_META: { axis: SkillAxis; label: string }[] = [
  { axis: 'form', label: '형태 (form)' },
  { axis: 'function', label: '기능 (function)' },
  { axis: 'pattern', label: '패턴 (pattern)' },
  { axis: 'situation', label: '상황 (situation)' },
  { axis: 'nuance', label: '뉘앙스 (nuance)' },
  { axis: 'tense', label: '시간 (tense)' },
];

export function BrainScreen() {
  const xp = useStore((s) => s.xp);
  const streakDays = useStore((s) => s.streakDays);
  const todaySentenceCount = useStore((s) => s.todaySentenceCount);
  const correctCount = useStore((s) => s.correctCount);
  const attemptCount = useStore((s) => s.attemptCount);
  const totalSentences = useStore((s) => s.totalSentences);
  const skill = useStore((s) => s.skill);
  const badges = useStore((s) => s.badges);

  const accuracy = attemptCount > 0 ? Math.round((correctCount / attemptCount) * 100) : 0;
  const lvl = levelFromXp(xp);

  return (
    <div>
      {/* 레벨 + XP 진행 */}
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

      {/* 일일 통계 */}
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

      {/* 다축 스킬 */}
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

      {/* 배지 */}
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
