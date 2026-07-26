import { useStore } from '../../state/store';
import { getAppVersion } from '../../adapters/cache-bust';

export function TopBar() {
  const level = useStore((s) => s.level);
  const streakDays = useStore((s) => s.streakDays);
  const todayLogCount = useStore((s) => s.todayLog.length);
  const theme = useStore((s) => s.theme);
  const goHome = useStore((s) => s.goHome);
  const openTodayLog = useStore((s) => s.openTodayLog);
  const toggleTheme = useStore((s) => s.toggleTheme);

  return (
    <header className="top-bar">
      <button type="button" className="top-bar-home" onClick={goHome} aria-label="오늘로 이동">
        <span className="top-bar-brand">오늘</span>
        <span className="level">Lv {level}</span>
        <span className="app-version">v{getAppVersion()}</span>
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
        <button
          type="button"
          className="top-bar-theme"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? '낮 모드로 전환' : '밤 모드로 전환'}
          title={theme === 'dark' ? '낮 모드' : '밤 모드'}
        >
          {theme === 'dark' ? '낮' : '밤'}
        </button>
        <span className="streak">🔥 {streakDays}일</span>
      </div>
    </header>
  );
}
