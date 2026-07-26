import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { registerServiceWorker, getAppVersion } from './adapters/cache-bust';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);

void registerServiceWorker().then(() => {
  if (import.meta.env.DEV) {
    console.info(`[EBQ] v${getAppVersion()}`);
  }
});
