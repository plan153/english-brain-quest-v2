/**
 * TodayLogCard — 오늘 만난 문장 복습 목록.
 * Brain 탭 / 세션 완주에서 진입.
 */
import { useEffect, useRef } from 'react';
import { Card } from '../ui/Card';
import { useStore, type TodayEncounter } from '../../state/store';
import { speech } from '../../adapters/speech';

const MATCH_LABEL: Record<TodayEncounter['match'], { text: string; color: string }> = {
  exact: { text: '완벽', color: 'var(--ebq-primary)' },
  fuzzy: { text: '근접', color: 'var(--ebq-accent)' },
  wrong: { text: '오답', color: 'var(--ebq-danger)' },
  skipped: { text: '스킵', color: 'var(--ebq-text-muted)' },
};

interface TodayLogCardProps {
  /** 마운트 시 이 카드로 스크롤 (세션 완주 → 복습 진입용) */
  autoFocus?: boolean;
}

export function TodayLogCard({ autoFocus = false }: TodayLogCardProps) {
  const todayLog = useStore((s) => s.todayLog);
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
                  <div className="today-log-ko">{item.ko}</div>
                  <div className="today-log-en">{item.en}</div>
                  {item.guess && item.match !== 'exact' && (
                    <div className="today-log-guess">내 말: {item.guess}</div>
                  )}
                </div>
                <span className="today-log-match" style={{ color: meta.color }}>
                  {meta.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
