import { useStore } from '../../state/store';

export function TopBar() {
  const level = useStore((s) => s.level);
  const streakDays = useStore((s) => s.streakDays);

  return (
    <header className="top-bar">
      <span className="level">Lv {level}</span>
      <span className="streak">🔥 {streakDays}일 연속</span>
    </header>
  );
}
