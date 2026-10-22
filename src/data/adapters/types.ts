import type { LegacyConversion } from '../legacy';
import type { CollectionName, Settings, WorkspaceData } from '../types';

export interface MigrationSummary {
  from: 'agent-command-center';
  at: string;
  counts: Record<string, number>;
  skipped: number;
}

export interface LoadedWorkspace {
  data: WorkspaceData;
  /** Readable descriptions of problems found while loading. */
  issues: string[];
  /** Set when this load converted Agent Command Center data. */
  migration: MigrationSummary | null;
  /** True when nothing had been saved before (a clean install). */
  isNew: boolean;
}

export interface Snapshot {
  at: string;
  reason: string;
  data: WorkspaceData;
}

export interface RecoveryEntry {
  key: string;
  label: string;
  size: number;
}

/**
 * Everything the app knows about persistence goes through this interface.
 * Components never touch localStorage directly, so a cloud-backed adapter can
 * replace the local one later without UI changes.
 */
export interface StorageAdapter {
  readonly label: string;
  /** False when data only lives until the page closes. */
  readonly persistent: boolean;
  load(): Promise<LoadedWorkspace>;
  saveCollection(name: CollectionName, items: readonly unknown[]): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  replaceAll(data: WorkspaceData): Promise<void>;
  /** Calls back when another tab or device changed the stored data. */
  subscribe?(onChange: () => void): () => void;
  /** One safety copy, taken before imports and full resets. */
  saveSnapshot?(snapshot: Snapshot): Promise<void>;
  loadSnapshot?(): Promise<Snapshot | null>;
  /** Agent Command Center data still present in this storage, converted, or null. */
  readLegacy?(): Promise<LegacyConversion | null>;
  listRecovery?(): Promise<RecoveryEntry[]>;
  readRecovery?(key: string): Promise<string | null>;
  deleteRecovery?(key: string): Promise<void>;
}
