import { emptyWorkspace } from '../defaults';
import type { CollectionName, WorkspaceData } from '../types';
import type { Snapshot, StorageAdapter } from './types';

/** Keeps data in memory only. Used when browser storage is blocked, and in tests. */
export function createMemoryAdapter(initial?: WorkspaceData): StorageAdapter & { current(): WorkspaceData } {
  let data: WorkspaceData | null = initial ? structuredClone(initial) : null;
  let snapshot: Snapshot | null = null;
  const daily = new Map<string, Snapshot>();
  const aux = new Map<string, unknown>();
  const ensure = () => (data ??= emptyWorkspace());
  return {
    label: 'Memory only',
    kind: 'memory',
    persistent: false,
    async load() {
      const isNew = data === null;
      return { data: structuredClone(ensure()), issues: [], migration: null, isNew };
    },
    async saveCollection(name: CollectionName, items) {
      (ensure() as unknown as Record<string, unknown>)[name] = structuredClone(items);
    },
    async saveSettings(settings) {
      ensure().settings = structuredClone(settings);
    },
    async replaceAll(next) {
      data = structuredClone(next);
    },
    async saveSnapshot(s) {
      snapshot = structuredClone(s);
    },
    async loadSnapshot() {
      return snapshot ? structuredClone(snapshot) : null;
    },
    async saveDailySnapshot(day, d) {
      daily.set(day, { at: new Date().toISOString(), reason: `daily snapshot ${day}`, data: structuredClone(d) });
    },
    async listDailySnapshots() {
      return [...daily.keys()].sort().reverse().map((day) => ({ key: `daily:${day}`, day, size: 0 }));
    },
    async loadSnapshotByKey(key) {
      const s = daily.get(key.replace(/^daily:/, ''));
      return s ? structuredClone(s) : null;
    },
    async readAux(name) {
      return aux.has(name) ? structuredClone(aux.get(name)) : null;
    },
    async writeAux(name, value) {
      if (value === null) aux.delete(name);
      else aux.set(name, structuredClone(value));
    },
    current: () => structuredClone(ensure()),
  };
}
