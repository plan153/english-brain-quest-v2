/**
 * SessionComplete.tsx — 세션 종료 요약 화면.
 * 랭크(S~D), 정답률, 최대 콤보, 획득 XP, 새 배지 표시.
 * "다시 시작" / "My English Brain 보기" 버튼.
 */
import type { SessionSummary } from '../../domain/session-engine';
import type { SessionCompletionRewards, Badge } from '../../domain/reward-engine';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface SessionCompleteProps {
  summary: SessionSummary;
  rewards: SessionCompletionRewards;
  newBadges: Badge[];
  onRestart: () => void;
  onGoBrain: () => void;
}

const rankColor: Record<SessionSummary['rank'], string> = {
  S: '#FBBF24',
  A: '#4ADE80',
  B: '#60A5FA',
  C: '#A78BFA',
  D: '#9CA3AF',
};

export function SessionComplete({
  summary,
  rewards,
  newBadges,
  onRestart,
  onGoBrain,
}: SessionCompleteProps) {
  return (
    <Card className="session-complete">
      <div className="rank-display" style={{ color: rankColor[summary.rank] }}>
        <span className="rank-letter">{summary.rank}</span>
        <span className="rank-label">RANK</span>
      </div>

      <h2 className="complete-title">세션 완주!</h2>
      <p className="complete-subtitle">
        {summary.total}문장 중 {summary.correct + summary.fuzzy}개 완벽/근접 정답
      </p>

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
        <div className="xp-line">완주 보너스: +{rewards.completionXp} XP</div>
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
        <Button variant="primary" onClick={onRestart}>
          다시 학습하기
        </Button>
        <Button variant="default" onClick={onGoBrain}>
          My English Brain 보기
        </Button>
      </div>
    </Card>
  );
}
