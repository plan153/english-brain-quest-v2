import { useStore } from '../../state/store';

export function TopBar() {
  const level = useStore((s) => s.level);
  const streakDays = useStore((s) => s.streakDays);
  const todayLogCount = useStore((s) => s.todayLog.length);
  const goHome = useStore((s) => s.goHome);
  const openTodayLog = useStore((s) => s.openTodayLog);

  return (
    <header className="top-bar">
      <button type="button" className="top-bar-home" onClick={goHome} aria-label="오늘로 이동">
        <span className="top-bar-brand">오늘</span>
        <span className="level">Lv {level}</span>
      </button>
      <div className="top-bar-actions">
        {todayLogCount > 0 && (
          <button
            type="button"
            className="top-bar-review"
            onClick={openTodayLog}
            aria-label="오늘 만난 문장"
          >
            복습 {todayLogCount}
          </button>
        )}
        <span className="streak">🔥 {streakDays}일</span>
      </div>
    </header>
  );
}
