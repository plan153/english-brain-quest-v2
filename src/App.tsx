import { AppShell } from './components/layout/AppShell';
import { TodayScreen } from './components/today/TodayScreen';
import { BrainScreen } from './components/brain/BrainScreen';
import { DictionaryScreen } from './components/dictionary/DictionaryScreen';
import { useStore } from './state/store';

function App() {
  const activeTab = useStore((s) => s.activeTab);

  return (
    <AppShell>
      {activeTab === 'today' && <TodayScreen />}
      {activeTab === 'brain' && <BrainScreen />}
      {activeTab === 'dictionary' && <DictionaryScreen />}
    </AppShell>
  );
}

export default App;
