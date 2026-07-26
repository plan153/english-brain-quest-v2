/**
 * TodayLogCard — 오늘 만난 문장 복습 목록.
 * 듣기 + 「내 문장」 수동 편입.
 */
import { useEffect, useRef } from 'react';
import { Card } from '../ui/Card';
import { KoPrompt } from '../ui/KoPrompt';
import { useStore, type TodayEncounter } from '../../state/store';
import { speech } from '../../adapters/speech';
import { accuracyPct } from '../../domain/srs-engine';

const MATCH_LABEL: Record<TodayEncounter['match'], { text: string; color: string }> = {
  exact: { text: '완벽', color: 'var(--ebq-primary)' },
  fuzzy: { text: '근접', color: 'var(--ebq-accent)' },
  wrong: { text: '오답', color: 'var(--ebq-danger)' },
  skipped: { text: '스킵', color: 'var(--ebq-text-muted)' },
};

interface TodayLogCardProps {
  autoFocus?: boolean;
}

export function TodayLogCard({ autoFocus = false }: TodayLogCardProps) {
  const todayLog = useStore((s) => s.todayLog);
  const memories = useStore((s) => s.memories);
  const markSentenceOwned = useStore((s) => s.markSentenceOwned);
  const clearBrainFocus = useStore((s) => s.clearBrainFocus);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    clearBrainFocus();
  }, [autoFocus, clearBrainFocus]);

  const handleSpeak = (en: string) => {
    void speech.synthesize(en, 'en');
  };

  return (
    <Card style={{ marginTop: '12px' }} className="today-log-card">
      <div ref={ref} style={{ fontSize: '12px', color: 'var(--ebq-text-muted)' }}>
        오늘 만난 문장 ({todayLog.length})
      </div>
      {todayLog.length === 0 ? (
        <div style={{ marginTop: '12px', color: 'var(--ebq-text-muted)', fontSize: '13px' }}>
          아직 오늘 학습한 문장이 없어요. Today에서 세션을 시작해 보세요.
        </div>
      ) : (
        <ul className="today-log-list">
          {[...todayLog].reverse().map((item) => {
            const meta = MATCH_LABEL[item.match];
            const mem = memories[item.sentenceId];
            const owned = mem?.owned === true;
            return (
              <li key={item.id} className="today-log-item">
                <button
                  type="button"
                  className="today-log-speak"
                  aria-label="영어 듣기"
                  onClick={() => handleSpeak(item.en)}
                >
                  🔊
                </button>
                <div className="today-log-body">
                  <div className="today-log-ko">
                    {owned ? '⭐ ' : ''}
                    <KoPrompt text={item.ko} size={14} />
                  </div>
                  <div className="today-log-en">{item.en}</div>
                  {item.guess && item.match !== 'exact' && (
                    <div className="today-log-guess">내 말: {item.guess}</div>
                  )}
                  {mem && mem.attempts > 0 && (
                    <div className="today-log-stats">
                      시도 {mem.attempts} · 정답률 {accuracyPct(mem)}%
                      {mem.intervalDays > 0
                        ? ` · 다음 ${Math.max(1, Math.round(mem.intervalDays))}일 후`
                        : ' · 복습 대기'}
                    </div>
                  )}
                </div>
                <div className="today-log-aside">
                  <span className="today-log-match" style={{ color: meta.color }}>
                    {meta.text}
                  </span>
                  <button
                    type="button"
                    className={`today-log-own${owned ? ' is-owned' : ''}`}
                    onClick={() => markSentenceOwned(item.sentenceId, !owned)}
                  >
                    {owned ? '내 문장 ✓' : '내 문장'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
