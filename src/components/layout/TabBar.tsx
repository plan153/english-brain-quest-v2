import { useStore, type TabId } from '../../state/store';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'today', label: '오늘', icon: '🎯' },
  { id: 'brain', label: '내 영어뇌', icon: '🧠' },
  { id: 'dictionary', label: '사전', icon: '📖' },
];

export function TabBar() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);

  return (
    <nav className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={activeTab === tab.id ? 'active' : ''}
          onClick={() => setActiveTab(tab.id)}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
