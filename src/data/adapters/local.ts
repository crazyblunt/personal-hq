/**
 * localStorage persistence. Each collection is one JSON array under
 * `phq:<collection>`; `phq:meta` records the schema version and any
 * migration. Agent Command Center's `acc:*` keys are read once to migrate
 * and are never written or removed.
 */
import { emptyWorkspace } from '../defaults';
import { convertLegacy, LEGACY_COLLECTIONS, LEGACY_MAX_SCHEMA, LEGACY_META_KEY, LEGACY_PREFIX, legacySchemaVersion } from '../legacy';
import { isObj, normalizeCollection, normalizeSettings } from '../normalize';
import { APP_ID, COLLECTION_LABEL, COLLECTIONS, SCHEMA_VERSION, type ActivityEntry, type CollectionName, type WorkspaceData } from '../types';
import type { LoadedWorkspace, MigrationSummary, RecoveryEntry, Snapshot, StorageAdapter } from './types';

export const PREFIX = 'phq:';
export const META_KEY = `${PREFIX}meta`;
export const SETTINGS_KEY = `${PREFIX}settings`;
export const SNAPSHOT_KEY = `${PREFIX}snapshot`;
export const RECOVERY_PREFIX = `${PREFIX}recovery:`;
export const DAILY_PREFIX = `${PREFIX}daily:`;
export const AUX_PREFIX = `${PREFIX}aux:`;
/** How many daily snapshots to keep. */
export const DAILY_KEEP = 7;
const key = (name: CollectionName) => `${PREFIX}${name}`;

interface Meta {
  app: string;
  schemaVersion: number;
  createdAt: string;
  migratedFrom?: MigrationSummary;
}

/** True when localStorage can be written (it throws in some private modes and sandboxes). */
export function canUseLocalStorage(storage: Storage | undefined = globalThis.localStorage): boolean {
  try {
    if (!storage) return false;
    const probe = `${PREFIX}probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export class NewerDataError extends Error {}

/** Parses a stored snapshot, dropping anything unreadable. */
function parseSnapshot(s: string | null): Snapshot | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    if (!isObj(v) || !isObj(v.data) || typeof v.at !== 'string') return null;
    const data = emptyWorkspace();
    for (const name of COLLECTIONS) (data as unknown as Record<string, unknown>)[name] = normalizeCollection(name, v.data[name]).items;
    data.settings = normalizeSettings(v.data.settings);
    return { at: v.at, reason: typeof v.reason === 'string' ? v.reason : '', data };
  } catch {
    return null;
  }
}

export function createLocalAdapter(
  storage: Storage = globalThis.localStorage,
  opts: { label?: string; kind?: StorageAdapter['kind'] } = {},
): StorageAdapter {
  const write = (k: string, value: unknown) => storage.setItem(k, JSON.stringify(value));

  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

  /** Copies data we could not read into a recovery key. Returns false when storage is full. */
  function keepForRecovery(label: string, value: string): boolean {
    try {
      storage.setItem(`${RECOVERY_PREFIX}${label}:${stamp()}`, value);
      return true;
    } catch {
      return false;
    }
  }

  function writeAll(data: WorkspaceData, meta: Meta) {
    for (const name of COLLECTIONS) write(key(name), data[name]);
    write(SETTINGS_KEY, data.settings);
    write(META_KEY, meta);
  }

  function readMeta(): Meta | null {
    const raw = storage.getItem(META_KEY);
    if (raw === null) return null;
    try {
      const m = JSON.parse(raw);
      if (isObj(m)) {
        return {
          app: typeof m.app === 'string' ? m.app : APP_ID,
          schemaVersion: typeof m.schemaVersion === 'number' ? m.schemaVersion : SCHEMA_VERSION,
          createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
          migratedFrom: isObj(m.migratedFrom) ? (m.migratedFrom as unknown as MigrationSummary) : undefined,
        };
      }
    } catch {
      /* fall through */
    }
    return { app: APP_ID, schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString() };
  }

  function hasLegacy(): boolean {
    return storage.getItem(LEGACY_META_KEY) !== null || LEGACY_COLLECTIONS.some((c) => storage.getItem(`${LEGACY_PREFIX}${c}`) !== null);
  }

  function readLegacyRaw() {
    const raw: Record<string, unknown> = {};
    const issues: string[] = [];
    for (const c of LEGACY_COLLECTIONS) {
      const s = storage.getItem(`${LEGACY_PREFIX}${c}`);
      if (s === null) continue;
      try {
        raw[c] = JSON.parse(s);
      } catch {
        issues.push(`Agent Command Center ${c} could not be read (not valid JSON). The original data is still stored under "${LEGACY_PREFIX}${c}".`);
      }
    }
    const schema = legacySchemaVersion(storage.getItem(LEGACY_META_KEY));
    if (schema > LEGACY_MAX_SCHEMA) issues.push(`Agent Command Center data uses schema ${schema}; this version understands up to ${LEGACY_MAX_SCHEMA}. Readable records were still imported.`);
    return { raw, issues };
  }

  async function migrateFromLegacy(): Promise<LoadedWorkspace> {
    const { raw, issues } = readLegacyRaw();
    const conv = convertLegacy(raw);
    const at = new Date().toISOString();
    const skipped = conv.errors.length;
    const total = Object.values(conv.counts).reduce((a, b) => a + b, 0);
    const migration: MigrationSummary = { from: 'agent-command-center', at, counts: conv.counts, skipped };
    const note: ActivityEntry = {
      id: `migration-${at}`,
      at,
      action: 'imported',
      entity: 'workspace',
      entityId: '',
      title: 'Agent Command Center data',
      projectId: null,
      detail: `Migrated ${total} records into Personal HQ${skipped ? `, ${skipped} unreadable records left in the original storage` : ''}`,
    };
    const data: WorkspaceData = { ...emptyWorkspace(), ...conv.data, activity: [...conv.data.activity, note] };
    if (skipped) issues.push(`${skipped} Agent Command Center records could not be read and were not migrated: ${conv.errors.slice(0, 3).join('; ')}${skipped > 3 ? '…' : ''}`);
    try {
      writeAll(data, { app: APP_ID, schemaVersion: SCHEMA_VERSION, createdAt: at, migratedFrom: migration });
    } catch {
      // Leave no half-written meta behind, so the migration runs again next time.
      storage.removeItem(META_KEY);
      issues.push('Browser storage is full, so the migrated data could not be saved yet. Your Agent Command Center data is untouched. Export a backup from Settings › Data.');
    }
    return { data, issues, migration, isNew: false };
  }

  return {
    label: opts.label ?? 'This browser',
    kind: opts.kind ?? 'localStorage',
    persistent: true,

    async load() {
      const meta = readMeta();
      if (meta === null) {
        if (hasLegacy()) return migrateFromLegacy();
        const data = emptyWorkspace();
        writeAll(data, { app: APP_ID, schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString() });
        return { data, issues: [], migration: null, isNew: true };
      }
      if (meta.schemaVersion > SCHEMA_VERSION) {
        throw new NewerDataError(
          `The data in this browser was saved by a newer version of Personal HQ (schema ${meta.schemaVersion}). Nothing was changed. Open the newer version, or export a backup from it.`,
        );
      }

      const data = emptyWorkspace();
      const issues: string[] = [];
      for (const name of COLLECTIONS) {
        const s = storage.getItem(key(name));
        if (s === null) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(s);
        } catch {
          const kept = keepForRecovery(name, s);
          issues.push(`${COLLECTION_LABEL[name]} data was damaged and could not be read.${kept ? ' A copy was kept under Settings › Data › Recovery.' : ' Storage is full, so no copy could be kept.'}`);
          continue;
        }
        const r = normalizeCollection(name, parsed);
        (data as unknown as Record<string, unknown>)[name] = r.items;
        if (r.rejected.length) {
          const kept = keepForRecovery(name, JSON.stringify(r.rejected));
          issues.push(`${r.rejected.length} ${COLLECTION_LABEL[name].toLowerCase()} record(s) were unreadable (${r.errors[0]}).${kept ? ' A copy was kept under Settings › Data › Recovery.' : ''}`);
        }
      }
      const rawSettings = storage.getItem(SETTINGS_KEY);
      try {
        data.settings = normalizeSettings(rawSettings ? JSON.parse(rawSettings) : undefined);
      } catch {
        issues.push('Settings were damaged and have been reset to defaults.');
      }
      return { data, issues, migration: null, isNew: false };
    },

    async saveCollection(name, items) {
      write(key(name), items);
    },

    async saveSettings(settings) {
      write(SETTINGS_KEY, settings);
    },

    async replaceAll(data) {
      const meta = readMeta() ?? { app: APP_ID, schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString() };
      writeAll(data, { ...meta, schemaVersion: SCHEMA_VERSION });
    },

    subscribe(onChange) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const handler = (e: StorageEvent) => {
        if (e.storageArea !== storage || !e.key?.startsWith(PREFIX)) return;
        if (e.key === SNAPSHOT_KEY || e.key.startsWith(RECOVERY_PREFIX) || e.key.startsWith(DAILY_PREFIX) || e.key.startsWith(AUX_PREFIX)) return;
        clearTimeout(timer);
        timer = setTimeout(onChange, 80);
      };
      window.addEventListener('storage', handler);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('storage', handler);
      };
    },

    async saveSnapshot(snapshot: Snapshot) {
      write(SNAPSHOT_KEY, snapshot);
    },

    async loadSnapshot() {
      return parseSnapshot(storage.getItem(SNAPSHOT_KEY));
    },

    async saveDailySnapshot(day, data) {
      write(`${DAILY_PREFIX}${day}`, { at: new Date().toISOString(), reason: `daily snapshot ${day}`, data });
      const days: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(DAILY_PREFIX)) days.push(k);
      }
      for (const old of days.sort().reverse().slice(DAILY_KEEP)) storage.removeItem(old);
    },

    async listDailySnapshots() {
      const out: { key: string; day: string; size: number }[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(DAILY_PREFIX)) out.push({ key: k, day: k.slice(DAILY_PREFIX.length), size: storage.getItem(k)?.length ?? 0 });
      }
      return out.sort((a, b) => b.day.localeCompare(a.day));
    },

    async loadSnapshotByKey(k) {
      return k === SNAPSHOT_KEY || k.startsWith(DAILY_PREFIX) ? parseSnapshot(storage.getItem(k)) : null;
    },

    async readAux(name) {
      const s = storage.getItem(`${AUX_PREFIX}${name}`);
      if (s === null) return null;
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    },

    async writeAux(name, value) {
      if (value === null) storage.removeItem(`${AUX_PREFIX}${name}`);
      else write(`${AUX_PREFIX}${name}`, value);
    },

    async readLegacy() {
      if (!hasLegacy()) return null;
      return convertLegacy(readLegacyRaw().raw);
    },

    async listRecovery() {
      const out: RecoveryEntry[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (!k?.startsWith(RECOVERY_PREFIX)) continue;
        const [label, when] = k.slice(RECOVERY_PREFIX.length).split(':');
        out.push({ key: k, label: `${label} · ${when?.replace(/T(\d\d)-(\d\d)-(\d\d).*/, ' $1:$2:$3') ?? ''}`, size: storage.getItem(k)?.length ?? 0 });
      }
      return out.sort((a, b) => b.key.localeCompare(a.key));
    },

    async readRecovery(k) {
      return k.startsWith(RECOVERY_PREFIX) ? storage.getItem(k) : null;
    },

    async deleteRecovery(k) {
      if (k.startsWith(RECOVERY_PREFIX)) storage.removeItem(k);
    },
  };
}
