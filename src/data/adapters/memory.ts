import { emptyWorkspace } from '../defaults';
import type { CollectionName, WorkspaceData } from '../types';
import type { Snapshot, StorageAdapter } from './types';

/** Keeps data in memory only. Used when browser storage is blocked, and in tests. */
export function createMemoryAdapter(initial?: WorkspaceData): StorageAdapter & { current(): WorkspaceData } {
  let data: WorkspaceData | null = initial ? structuredClone(initial) : null;
  let snapshot: Snapshot | null = null;
  const ensure = () => (data ??= emptyWorkspace());
  return {
    label: 'Memory only',
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
    current: () => structuredClone(ensure()),
  };
}
