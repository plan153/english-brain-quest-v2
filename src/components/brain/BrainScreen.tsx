import { Card } from '../ui/Card';
import { useStore } from '../../state/store';

export function BrainScreen() {
  const xp = useStore((s) => s.xp);
  const level = useStore((s) => s.level);
  const streakDays = useStore((s) => s.streakDays);
  const todaySentenceCount = useStore((s) => s.todaySentenceCount);
  const correctCount = useStore((s) => s.correctCount);
  const attemptCount = useStore((s) => s.attemptCount);
  const accuracy = attemptCount > 0 ? Math.round((correctCount / attemptCount) * 100) : 0;

  return (
    <div>
      <Card>
        <div style={{ fontSize: '24px', fontWeight: 700 }}>
          Lv {level}
        </div>
        <div style={{ color: 'var(--ebq-text-muted)' }}>{xp} XP</div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
        <Card>
          <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>연속 학습</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>🔥 {streakDays}일</div>
        </Card>
        <Card>
          <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>오늘</div>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{todaySentenceCount}문장</div>
        </Card>
      </div>
      <Card style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>정답률</div>
        <div style={{ fontSize: '20px', fontWeight: 700 }}>{accuracy}%</div>
        <div className="progress-bar" style={{ marginTop: '8px' }}>
          <div className="fill" style={{ width: `${accuracy}%` }} />
        </div>
      </Card>
      <Card style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>다축 숙련도</div>
        <div style={{ marginTop: '12px' }}>
          <SkillBar label="형태 (form)" value={30} />
          <SkillBar label="기능 (function)" value={20} />
          <SkillBar label="패턴 (pattern)" value={10} />
          <SkillBar label="상황 (situation)" value={5} />
          <SkillBar label="뉘앙스 (nuance)" value={0} />
          <SkillBar label="시간 (tense)" value={15} />
        </div>
      </Card>
      <Card style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>배지</div>
        <div style={{ marginTop: '12px', color: 'var(--ebq-text-muted)' }}>
          첫 100문장 · 7일 연속 · 첫 팩 해금
        </div>
      </Card>
    </div>
  );
}

function SkillBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="progress-bar">
        <div className="fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
