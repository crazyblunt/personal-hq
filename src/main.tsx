import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, applyAppearance } from './App';
import { resetFocus } from './app/focus';
import { readDevice } from './app/deviceStorage';
import { createLocalAdapter, canUseLocalStorage } from './data/adapters/local';
import { createMemoryAdapter } from './data/adapters/memory';
import { initStore, useHQ } from './data/store';
import './index.css';

const adapter = canUseLocalStorage() ? createLocalAdapter() : createMemoryAdapter();

void initStore(adapter).then(() => {
  applyAppearance(useHQ.getState().settings);
  // First run on this device: size the focus timer from settings.
  if (!readDevice<object | null>('focus', null)) resetFocus('work');
});

// Offline support for the installed app. Skipped inside a Claude artifact,
// which has no service workers, and during development.
if (import.meta.env.PROD && !window.claude && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* the app still works online without it */
    });
  });
}

if (import.meta.env.DEV) {
  // Handy when debugging in the dev server's console. Not included in builds.
  void Promise.all([import('./app/ui'), import('./app/router')]).then(([ui, router]) => {
    Object.assign(window, { __hq: { useHQ, useUI: ui.useUI, useRoute: router.useRoute } });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
