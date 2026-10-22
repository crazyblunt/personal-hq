/**
 * Runs sync for this device: keeps its state, decides when to sync, and
 * reports status to the UI. The work of a single round is in engine.ts.
 */
import { create } from 'zustand';
import { writeDevice } from '../app/deviceStorage';
import { insideArtifactHost } from '../app/fileSave';
import { applyRemoteChanges, getAdapter, onLocalDelete, useHQ, workspaceSnapshot } from '../data/store';
import { errorMessage, nowIso } from '../lib/util';
import { SYNC_KEY, SYNC_URL } from './config';
import { deriveSyncKeys, formatSyncCode, generateSyncCode, normalizeSyncCode, type SyncKeys } from './crypto';
import { newSyncState, syncOnce, type SyncState } from './engine';
import { createSupabaseTransport, SyncNetworkError, type SyncTransport } from './transport';

export type SyncStatus = 'unavailable' | 'off' | 'idle' | 'syncing' | 'offline' | 'error';

interface SyncUI {
  status: SyncStatus;
  lastSyncAt: string | null;
  error: string | null;
  /** Set while sync is on, so Settings can show the code again. */
  code: string | null;
}

export const useSync = create<SyncUI>(() => ({ status: syncAvailable() ? 'off' : 'unavailable', lastSyncAt: null, error: null, code: null }));

const AUX = 'sync';
let transport: SyncTransport | null = null;
let keys: SyncKeys | null = null;
let state: SyncState | null = null;
let running: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let applying = false;
const detachers: (() => void)[] = [];

/** Sync needs the server address, Web Crypto, and network access (Claude artifacts can't reach other servers). */
export function syncAvailable(): boolean {
  return Boolean(SYNC_URL && SYNC_KEY && typeof crypto !== 'undefined' && crypto.subtle && !insideArtifactHost());
}

/** For tests: use a different server. */
export function setSyncTransport(t: SyncTransport | null) {
  transport = t;
}

function getTransport(): SyncTransport {
  return (transport ??= createSupabaseTransport(SYNC_URL, SYNC_KEY));
}

async function saveState() {
  if (state) await getAdapter().writeAux?.(AUX, state);
}

function attach() {
  detach();
  // Deletions here become tombstones so other devices remove them too.
  detachers.push(
    onLocalDelete((removed) => {
      if (!state) return;
      const at = nowIso();
      for (const r of removed) state.tombstones[`${r.collection}:${r.id}`] = at;
      void saveState();
    }),
  );
  // Any local edit schedules a sync a few seconds later.
  detachers.push(
    useHQ.subscribe((s, prev) => {
      if (applying || s.status !== 'ready') return;
      if (s.tasks !== prev.tasks || s.ideas !== prev.ideas || s.notes !== prev.notes || s.projects !== prev.projects || s.events !== prev.events || s.bugs !== prev.bugs || s.prompts !== prev.prompts || s.activity !== prev.activity || s.settings !== prev.settings) {
        scheduleSync(4000);
      }
    }),
  );
  if (typeof window !== 'undefined') {
    const onVisible = () => document.visibilityState === 'visible' && scheduleSync(300);
    const onOnline = () => scheduleSync(300);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    detachers.push(() => document.removeEventListener('visibilitychange', onVisible));
    detachers.push(() => window.removeEventListener('online', onOnline));
    interval = setInterval(() => document.visibilityState !== 'hidden' && scheduleSync(0), 60_000);
  }
}

function detach() {
  while (detachers.length) detachers.pop()!();
  clearInterval(interval);
  clearTimeout(debounce);
}

export function scheduleSync(delay = 0) {
  if (!state) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delay);
}

/** Runs a sync round now (or right after the one in progress). */
export function syncNow(): Promise<void> {
  if (!state || !keys) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      useSync.setState({ status: 'syncing' });
      try {
        await withLock(async () => {
          await syncOnce({
            transport: getTransport(),
            keys: keys!,
            state: state!,
            getWorkspace: workspaceSnapshot,
            apply: (changes, settings) => {
              applying = true;
              try {
                applyRemoteChanges(changes, settings);
              } finally {
                applying = false;
              }
            },
          });
        });
        await saveState();
        useSync.setState({ status: 'idle', lastSyncAt: state!.lastSyncAt, error: null });
      } catch (e) {
        const offline = e instanceof SyncNetworkError || (typeof navigator !== 'undefined' && navigator.onLine === false);
        useSync.setState({ status: offline ? 'offline' : 'error', error: errorMessage(e) });
        await saveState().catch(() => {});
        break;
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Only one tab syncs at a time, where the browser supports locks. */
async function withLock(fn: () => Promise<void>) {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) await locks.request('personal-hq-sync', fn);
  else await fn();
}

async function begin(code: string, fresh: boolean) {
  keys = await deriveSyncKeys(code);
  state = fresh ? newSyncState(normalizeSyncCode(code)) : state;
  await saveState();
  writeDevice('sync-on', true);
  useSync.setState({ status: 'idle', code: state!.code, lastSyncAt: state!.lastSyncAt, error: null });
  attach();
}

/** Called once the workspace has loaded: resumes sync if it was on. */
export async function startSync(): Promise<void> {
  if (!syncAvailable()) {
    useSync.setState({ status: 'unavailable' });
    return;
  }
  const saved = (await getAdapter().readAux?.(AUX)) as SyncState | null;
  if (!saved || typeof saved.code !== 'string') {
    useSync.setState({ status: 'off' });
    writeDevice('sync-on', false);
    return;
  }
  state = { ...newSyncState(saved.code), ...saved };
  try {
    await begin(saved.code, false);
    scheduleSync(500);
  } catch (e) {
    useSync.setState({ status: 'error', error: errorMessage(e) });
  }
}

/** Turns sync on with a new code and uploads this device's data. Returns the code to show. */
export async function enableSync(): Promise<string> {
  const code = generateSyncCode();
  await begin(code, true);
  await syncNow();
  if (useSync.getState().status === 'error' || useSync.getState().status === 'offline') {
    const err = useSync.getState().error;
    await disableSync();
    throw new Error(err ?? 'Sync could not start.');
  }
  return formatSyncCode(code);
}

/** Links this device to existing synced data. Local records are merged in, not replaced. */
export async function joinSync(input: string): Promise<void> {
  const code = normalizeSyncCode(input);
  const k = await deriveSyncKeys(code);
  const probe = await getTransport().pull(k.space, 0, 1);
  if (probe.length === 0) throw new Error('No synced data was found for that code. Check it for typos, or turn sync on from the device that has your data first.');
  await begin(code, true);
  await syncNow();
  const s = useSync.getState();
  if (s.status === 'error' || s.status === 'offline') throw new Error(s.error ?? 'Sync failed.');
}

/** Stops syncing on this device. Its data stays; the cloud copy is untouched. */
export async function disableSync(): Promise<void> {
  detach();
  state = null;
  keys = null;
  await getAdapter().writeAux?.(AUX, null);
  writeDevice('sync-on', false);
  useSync.setState({ status: syncAvailable() ? 'off' : 'unavailable', code: null, lastSyncAt: null, error: null });
}

/** Deletes the encrypted copy on the server, then turns sync off here. Other devices stop receiving changes. */
export async function deleteCloudCopy(): Promise<void> {
  if (!keys) return;
  await getTransport().deleteSpace(keys.space);
  await disableSync();
}
