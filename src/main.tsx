import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, applyAppearance } from './App';
import { resetFocus } from './app/focus';
import { readDevice } from './app/deviceStorage';
import { startSafety } from './app/safety';
import { startSync } from './sync/controller';
import { MOVED_MARKER, openIndexedDbAdapter } from './data/adapters/indexeddb';
import { createLocalAdapter, canUseLocalStorage } from './data/adapters/local';
import { createMemoryAdapter } from './data/adapters/memory';
import type { StorageAdapter } from './data/adapters/types';
import { initStore, useHQ } from './data/store';
import './index.css';

/** IndexedDB first (most room), then localStorage, then memory only. */
async function pickAdapter(): Promise<{ adapter: StorageAdapter; note: string | null }> {
  if (typeof indexedDB !== 'undefined') {
    try {
      return { adapter: await openIndexedDbAdapter(), note: null };
    } catch {
      /* fall back below */
    }
  }
  if (canUseLocalStorage()) {
    const moved = localStorage.getItem(MOVED_MARKER) === 'indexeddb';
    return {
      adapter: createLocalAdapter(),
      note: moved ? 'This browser’s database could not be opened, so an older copy from local storage is showing. Changes still save. Reload to try the database again.' : null,
    };
  }
  return { adapter: createMemoryAdapter(), note: null };
}

void pickAdapter()
  .then(async ({ adapter, note }) => {
    await initStore(adapter);
    if (note) useHQ.setState((s) => ({ issues: [note, ...s.issues] }));
  })
  .then(() => {
    applyAppearance(useHQ.getState().settings);
    // First run on this device: size the focus timer from settings.
    if (!readDevice<object | null>('focus', null)) resetFocus('work');
    if (useHQ.getState().status === 'ready') {
      startSafety();
      void startSync();
    }
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
