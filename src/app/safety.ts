/**
 * Keeping data safe on this device: asks the browser not to clear our
 * storage, takes a snapshot once a day, and tracks when you last downloaded
 * a backup so the app can remind you.
 */
import { create } from 'zustand';
import { flush, getAdapter, useHQ, workspaceSnapshot } from '../data/store';
import { COLLECTIONS } from '../data/types';
import { todayKey } from '../lib/dates';
import { readDevice, writeDevice } from './deviceStorage';

interface StorageHealth {
  /** true: the browser promised not to clear our data on its own; null: unknown/unsupported. */
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
  lastBackupAt: string | null;
  lastDailySnapshot: string | null;
}

export const useStorageHealth = create<StorageHealth>(() => ({
  persisted: null,
  usage: null,
  quota: null,
  lastBackupAt: readDevice<string | null>('last-backup', null),
  lastDailySnapshot: null,
}));

/** Asks for persistent storage. Chrome and Safari decide silently; installed apps are usually granted. */
export async function requestPersistence(): Promise<boolean | null> {
  const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!sm?.persist || !sm.persisted) return null;
  try {
    const already = await sm.persisted();
    const persisted = already || (await sm.persist());
    useStorageHealth.setState({ persisted });
    return persisted;
  } catch {
    return null;
  }
}

export async function refreshStorageEstimate() {
  const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!sm?.estimate) return;
  try {
    const e = await sm.estimate();
    useStorageHealth.setState({ usage: e.usage ?? null, quota: e.quota ?? null });
  } catch {
    /* not available */
  }
}

export function markBackedUp() {
  const at = new Date().toISOString();
  writeDevice('last-backup', at);
  useStorageHealth.setState({ lastBackupAt: at });
}

export const totalRecords = () => {
  const s = useHQ.getState();
  return COLLECTIONS.reduce((n, c) => (c === 'activity' ? n : n + s[c].length), 0);
};

/** Saves today's snapshot if there isn't one yet. Only with IndexedDB, which has room for them. */
export async function takeDailySnapshot(): Promise<void> {
  const a = getAdapter();
  if (a.kind !== 'indexeddb' || !a.saveDailySnapshot || !a.listDailySnapshots) return;
  if (useHQ.getState().status !== 'ready' || totalRecords() === 0) return;
  const today = todayKey();
  const existing = await a.listDailySnapshots();
  if (existing[0]?.day === today) {
    useStorageHealth.setState({ lastDailySnapshot: today });
    return;
  }
  try {
    await flush();
    await a.saveDailySnapshot(today, workspaceSnapshot());
    useStorageHealth.setState({ lastDailySnapshot: today });
  } catch {
    /* a missed snapshot is not worth interrupting you for; saving errors show in the status bar */
  }
}

const DAY = 86_400_000;

/**
 * Whether to show the backup reminder: you have data, and haven't downloaded
 * a backup in 7 days (30 with sync on, since another copy exists). New
 * workspaces get 3 days' grace. "Later" snoozes it for 3 days.
 */
export function backupDue(now: number, opts: { lastBackupAt: string | null; firstSeen: string | null; snoozedUntil: string | null; syncOn: boolean; records: number }): boolean {
  if (opts.records === 0) return false;
  if (opts.snoozedUntil && Date.parse(opts.snoozedUntil) > now) return false;
  if (!opts.lastBackupAt) return !opts.firstSeen || now - Date.parse(opts.firstSeen) > 3 * DAY;
  return now - Date.parse(opts.lastBackupAt) > (opts.syncOn ? 30 : 7) * DAY;
}

export function snoozeBackupReminder(days = 3) {
  writeDevice('backup-snooze', new Date(Date.now() + days * DAY).toISOString());
}

/** Starts the background safety work. Returns a stop function. */
export function startSafety(): () => void {
  if (!readDevice<string | null>('first-seen', null)) writeDevice('first-seen', new Date().toISOString());
  void requestPersistence();
  void refreshStorageEstimate();
  const first = setTimeout(() => void takeDailySnapshot(), 8_000);
  const hourly = setInterval(() => {
    void takeDailySnapshot();
    void refreshStorageEstimate();
  }, 60 * 60_000);
  return () => {
    clearTimeout(first);
    clearInterval(hourly);
  };
}
