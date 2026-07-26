/**
 * FeedbackBar.tsx — trial 직후 즉각 피드백 표시.
 * 정답/오답/콤보/XP/배지/도전 뱃지를 한 줄로 보여 도파민 보상.
 */
import type { TrialReward } from '../../domain/reward-engine';
import type { SessionEvaluateResult } from '../../interfaces/SessionMode';
import { Card } from '../ui/Card';

interface FeedbackBarProps {
  evaluation: SessionEvaluateResult;
  reward: TrialReward;
  combo: number;
}

const matchMeta: Record<
  SessionEvaluateResult['match'],
  { label: string; color: string; emoji: string }
> = {
  exact: { label: '정답', color: '#4ADE80', emoji: '🎯' },
  fuzzy: { label: '거의 정답', color: '#FBBF24', emoji: '✨' },
  wrong: { label: '오답', color: '#F87171', emoji: '❌' },
  skipped: { label: '스킵', color: '#9CA3AF', emoji: '⏭️' },
};

export function FeedbackBar({ evaluation, reward, combo }: FeedbackBarProps) {
  const meta = matchMeta[evaluation.match];
  return (
    <Card className="feedback-bar" style={{ borderColor: meta.color }}>
      <div className="feedback-row">
        <span className="feedback-match" style={{ color: meta.color }}>
          {meta.emoji} {meta.label}
        </span>
        {combo >= 3 && (
          <span className="feedback-combo" aria-label="combo">
            🔥 {combo}콤보
          </span>
        )}
        <span className="feedback-xp">+{reward.totalXp} XP</span>
      </div>
      <div className="feedback-text">{reward.feedback}</div>
      {reward.newBadges.length > 0 && (
        <div className="feedback-badges">
          {reward.newBadges.map((b) => (
            <span key={b.id} className="badge-new">
              🏆 {b.name}
            </span>
          ))}
        </div>
      )}
      {reward.leveledUp && reward.newLevel && (
        <div className="feedback-levelup">⭐ 레벨 {reward.newLevel} 달성!</div>
      )}
    </Card>
  );
}
