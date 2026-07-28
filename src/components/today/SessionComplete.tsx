/**
 * SessionComplete.tsx — 세션 종료 요약 화면.
 * 랭크·XP·배지 + 연습 난이도 적응(정복/흐름/페이스).
 */
import type { SessionSummary } from '../../domain/session-engine';
import type { SessionCompletionRewards, Badge } from '../../domain/reward-engine';
import type { AdaptDecision } from '../../domain/comfort-adapt';
import { bandStepLabel, comfortStreakLabel } from '../../domain/comfort-adapt';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface SessionCompleteProps {
  summary: SessionSummary;
  rewards: SessionCompletionRewards;
  newBadges: Badge[];
  adapt: AdaptDecision | null;
  comfortStreak: number;
  onRespondAdapt: (direction: 'raise' | 'lower' | 'keep') => void;
  onRestart: () => void;
  onGoBrain: () => void;
  onGoTodayLog: () => void;
}

const rankColor: Record<SessionSummary['rank'], string> = {
  S: '#FBBF24',
  A: '#4ADE80',
  B: '#60A5FA',
  C: '#A78BFA',
  D: '#9CA3AF',
};

const toneBorder: Record<AdaptDecision['tone'], string> = {
  conquer: '#FBBF24',
  flow: '#4ADE80',
  recover: '#60A5FA',
};

export function SessionComplete({
  summary,
  rewards,
  newBadges,
  adapt,
  comfortStreak,
  onRespondAdapt,
  onRestart,
  onGoBrain,
  onGoTodayLog,
}: SessionCompleteProps) {
  const title = summary.fullyComplete ? '세션 완주!' : '세션 종료';
  const subtitle = summary.fullyComplete
    ? `${summary.total}문장 중 ${summary.correct + summary.fuzzy}개 완벽/근접 정답`
    : `${summary.total}문장 중 ${summary.answered}문장 응답 · 완벽/근접 ${summary.correct + summary.fuzzy}`;
  const streakLine = comfortStreakLabel(comfortStreak);

  return (
    <Card className="session-complete">
      <div className="rank-display" style={{ color: rankColor[summary.rank] }}>
        <span className="rank-letter">{summary.rank}</span>
        <span className="rank-label">RANK</span>
      </div>

      <h2 className="complete-title">{title}</h2>
      <p className="complete-subtitle">{subtitle}</p>

      {adapt && (
        <div
          style={{
            margin: '12px 0',
            padding: '12px',
            borderRadius: '12px',
            border: `1px solid ${toneBorder[adapt.tone]}`,
            background:
              adapt.tone === 'conquer'
                ? 'rgba(251,191,36,0.12)'
                : adapt.tone === 'recover'
                  ? 'rgba(96,165,250,0.1)'
                  : 'rgba(74,222,128,0.1)',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: '16px' }}>{adapt.title}</div>
          <div style={{ fontSize: '13px', marginTop: '6px', lineHeight: 1.45 }}>{adapt.body}</div>
          {adapt.autoApplied && adapt.from !== adapt.to && (
            <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginTop: '8px' }}>
              난이도 {bandStepLabel(adapt.from, adapt.to)}
              {adapt.bonusXp > 0 ? ` · +${adapt.bonusXp} XP` : ''}
            </div>
          )}
          {!adapt.autoApplied && adapt.bonusXp > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--ebq-text-muted)', marginTop: '8px' }}>
              흐름 보너스 +{adapt.bonusXp} XP
            </div>
          )}
          {(adapt.offerRaise || adapt.offerLower) && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
              {adapt.offerRaise && (
                <Button variant="primary" onClick={() => onRespondAdapt('raise')}>
                  올려서 정복하기
                </Button>
              )}
              {adapt.offerLower && (
                <Button onClick={() => onRespondAdapt('lower')}>조금 쉽게</Button>
              )}
              <Button onClick={() => onRespondAdapt('keep')}>이대로 유지</Button>
            </div>
          )}
        </div>
      )}

      {streakLine && (
        <div
          style={{
            textAlign: 'center',
            fontSize: '13px',
            color: 'var(--ebq-accent)',
            fontWeight: 700,
            marginBottom: '8px',
          }}
        >
          {streakLine}
        </div>
      )}

      <div className="complete-stats">
        <div className="stat">
          <span className="stat-label">정확도</span>
          <span className="stat-value">{summary.accuracy}%</span>
        </div>
        <div className="stat">
          <span className="stat-label">최대 콤보</span>
          <span className="stat-value">🔥 {summary.maxCombo}</span>
        </div>
        <div className="stat">
          <span className="stat-label">완벽 정답</span>
          <span className="stat-value">🎯 {summary.correct}</span>
        </div>
        <div className="stat">
          <span className="stat-label">근접 정답</span>
          <span className="stat-value">✨ {summary.fuzzy}</span>
        </div>
        <div className="stat">
          <span className="stat-label">오답</span>
          <span className="stat-value">❌ {summary.wrong}</span>
        </div>
        <div className="stat">
          <span className="stat-label">스킵</span>
          <span className="stat-value">⏭️ {summary.skipped}</span>
        </div>
      </div>

      <div className="xp-summary">
        <div className="xp-line">
          {summary.fullyComplete ? '완주' : '참여'} 보너스: +{rewards.completionXp} XP
        </div>
        <div className="xp-line">랭크 보너스: +{rewards.rankXp} XP</div>
        <div className="xp-line total">획득 총 XP: +{rewards.totalXp}</div>
      </div>

      {newBadges.length > 0 && (
        <div className="new-badges-section">
          <h3>새 배지 획득!</h3>
          <div className="badges-grid">
            {newBadges.map((b) => (
              <div key={b.id} className="badge-card">
                <div className="badge-emoji">🏆</div>
                <div className="badge-name">{b.name}</div>
                <div className="badge-desc">{b.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="complete-actions">
        <Button variant="primary" className="restart-btn" onClick={onRestart}>
          다시 도전하기
        </Button>
        <Button variant="default" onClick={onGoTodayLog}>
          오늘 문장 보기
        </Button>
        <Button variant="default" onClick={onGoBrain}>
          My English Brain 보기
        </Button>
      </div>
    </Card>
  );
}
