/**
 * IndexedDB persistence: the same layout and rules as the localStorage
 * adapter, but with far more room (browsers allow hundreds of megabytes or
 * more instead of about 5 MB).
 *
 * The first time it runs in a browser it copies whatever Personal HQ (and
 * Agent Command Center) saved in localStorage. Those localStorage keys are
 * left in place as an extra copy and are never deleted.
 */
import { IdbStorage } from './idbStorage';
import { createLocalAdapter, META_KEY, PREFIX } from './local';
import type { StorageAdapter } from './types';

/** Marks, in localStorage, that this browser's data now lives in IndexedDB. */
export const MOVED_MARKER = 'phq:device:storage';

export async function openIndexedDbAdapter(opts: { name?: string; legacy?: Storage | null; channelName?: string } = {}): Promise<StorageAdapter> {
  const idb = await IdbStorage.open(opts.name);
  const legacy = opts.legacy === undefined ? safeLocalStorage() : opts.legacy;
  let movedNote: string | null = null;

  if (idb.getItem(META_KEY) === null && legacy) {
    const alreadyMoved = legacy.getItem(MOVED_MARKER) === 'indexeddb';
    let copied = 0;
    for (let i = 0; i < legacy.length; i++) {
      const k = legacy.key(i);
      if (!k) continue;
      const ours = k.startsWith(PREFIX) && !k.startsWith('phq:device:');
      if (ours || k.startsWith('acc:')) {
        idb.setItem(k, legacy.getItem(k)!);
        if (ours) copied++;
      }
    }
    await idb.settle();
    if (alreadyMoved && copied) {
      movedNote = 'Your saved data in this browser’s database was missing, so an older copy kept in local storage was restored. Check recent changes, or restore a backup from Settings › Data.';
    }
    try {
      legacy.setItem(MOVED_MARKER, 'indexeddb');
    } catch {
      /* the marker is only a hint */
    }
  }

  const base = createLocalAdapter(idb, { label: 'This browser', kind: 'indexeddb' });
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(opts.channelName ?? 'personal-hq-data') : null;

  /** Runs a write, waits until IndexedDB has it, then tells other open tabs. */
  const written = async <T>(op: Promise<T>, notify = true): Promise<T> => {
    const r = await op;
    await idb.settle();
    if (notify) channel?.postMessage('changed');
    return r;
  };

  return {
    ...base,
    async load() {
      const loaded = await written(base.load(), false);
      return movedNote ? { ...loaded, issues: [movedNote, ...loaded.issues] } : loaded;
    },
    saveCollection: (name, items) => written(base.saveCollection(name, items)),
    saveSettings: (settings) => written(base.saveSettings(settings)),
    replaceAll: (data) => written(base.replaceAll(data)),
    saveSnapshot: (s) => written(base.saveSnapshot!(s), false),
    saveDailySnapshot: (day, data) => written(base.saveDailySnapshot!(day, data), false),
    writeAux: (name, value) => written(base.writeAux!(name, value), false),
    deleteRecovery: (k) => written(base.deleteRecovery!(k), false),
    subscribe(onChange) {
      if (!channel) return () => {};
      const handler = async () => {
        await idb.reload();
        onChange();
      };
      channel.addEventListener('message', handler);
      return () => channel.removeEventListener('message', handler);
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
