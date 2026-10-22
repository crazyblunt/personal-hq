/**
 * JSON export and import. Imports are parsed and validated first, then the
 * user picks how to apply them; the default never overwrites existing records.
 */
import { toDateKey } from '../lib/dates';
import { emptyCollections } from './defaults';
import { convertLegacy, LEGACY_APP, LEGACY_MAX_SCHEMA } from './legacy';
import { isObj, normalizeCollection, normalizeSettings } from './normalize';
import { APP_ID, COLLECTIONS, SCHEMA_VERSION, type CollectionName, type Collections, type Settings, type WorkspaceData } from './types';

export interface ExportFile {
  app: typeof APP_ID;
  schemaVersion: number;
  exportedAt: string;
  data: WorkspaceData;
}

export function buildExport(data: WorkspaceData, now = new Date()): ExportFile {
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), data };
}

export function exportFilename(now = new Date()): string {
  return `personal-hq-backup-${toDateKey(now)}.json`;
}

export class ImportError extends Error {}

export interface ParsedImport {
  source: 'personal-hq' | 'agent-command-center';
  exportedAt: string | null;
  data: Collections;
  settings: Settings | null;
  /** Records that could not be used; the rest can still be imported. */
  errors: string[];
  warnings: string[];
  counts: Record<CollectionName, number>;
}

const PHQ_ONLY_KEYS = ['ideas', 'events', 'activity', 'settings'];
const ANY_KEYS = [...COLLECTIONS, 'settings'];

export function parseImport(text: string): ParsedImport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new ImportError(`This file isn't valid JSON (${e instanceof Error ? e.message : 'parse error'}).`);
  }
  if (!isObj(json)) throw new ImportError('Expected a JSON object at the top level of the file.');

  const app = typeof json.app === 'string' ? json.app : null;
  const schema = typeof json.schemaVersion === 'number' ? json.schemaVersion : null;
  const body = isObj(json.data) ? json.data : json;
  const exportedAt = typeof json.exportedAt === 'string' ? json.exportedAt : null;

  if (app && app !== APP_ID && app !== LEGACY_APP) {
    throw new ImportError(`This file was made by "${app}", not Personal HQ or Agent Command Center.`);
  }
  if (!ANY_KEYS.some((k) => k in body)) {
    throw new ImportError('No tasks, ideas, notes, projects, events, bugs, prompts, or activity were found in this file.');
  }

  const looksLegacy = app === LEGACY_APP || (app === null && !PHQ_ONLY_KEYS.some((k) => k in body) && ('prompts' in body || 'bugs' in body));

  if (looksLegacy) {
    if (schema !== null && schema > LEGACY_MAX_SCHEMA) {
      throw new ImportError(`This Agent Command Center file uses schema ${schema}; Personal HQ can read up to ${LEGACY_MAX_SCHEMA}.`);
    }
    const conv = convertLegacy(body);
    return { source: 'agent-command-center', exportedAt, data: conv.data, settings: null, errors: conv.errors, warnings: conv.warnings, counts: countsOf(conv.data) };
  }

  if (schema !== null && schema > SCHEMA_VERSION) {
    throw new ImportError(`This backup was made by a newer version of Personal HQ (schema ${schema}). This version reads up to schema ${SCHEMA_VERSION}.`);
  }
  const data = emptyCollections();
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const name of COLLECTIONS) {
    const r = normalizeCollection(name, body[name]);
    (data as unknown as Record<string, unknown>)[name] = r.items;
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  return {
    source: 'personal-hq',
    exportedAt,
    data,
    settings: 'settings' in body ? normalizeSettings(body.settings) : null,
    errors,
    warnings,
    counts: countsOf(data),
  };
}

export function countsOf(c: Collections): Record<CollectionName, number> {
  return Object.fromEntries(COLLECTIONS.map((n) => [n, c[n].length])) as Record<CollectionName, number>;
}

/**
 * - `add`: only records whose id is new are added; existing records are untouched.
 * - `update`: also replaces existing records when the imported copy was edited more recently.
 * - `replace`: the workspace becomes exactly the imported data.
 */
export type ImportMode = 'add' | 'update' | 'replace';

export interface CollectionPlan {
  add: number;
  update: number;
  unchanged: number;
  /** Existing records the import leaves alone (or, for replace, removes). */
  keep: number;
  remove: number;
}

export function planImport(current: Collections, incoming: Collections, mode: ImportMode): Record<CollectionName, CollectionPlan> {
  const plan = {} as Record<CollectionName, CollectionPlan>;
  for (const name of COLLECTIONS) {
    const cur = new Map<string, { updatedAt?: string }>(current[name].map((r) => [r.id, r as { updatedAt?: string }]));
    const p: CollectionPlan = { add: 0, update: 0, unchanged: 0, keep: 0, remove: 0 };
    const incomingIds = new Set<string>();
    for (const r of incoming[name] as { id: string; updatedAt?: string }[]) {
      incomingIds.add(r.id);
      const existing = cur.get(r.id);
      if (!existing) p.add++;
      else if (mode === 'add') p.unchanged++;
      else if (mode === 'replace' || (r.updatedAt ?? '') > (existing.updatedAt ?? '')) p.update++;
      else p.unchanged++;
    }
    for (const id of cur.keys()) {
      if (incomingIds.has(id)) continue;
      if (mode === 'replace') p.remove++;
      else p.keep++;
    }
    plan[name] = p;
  }
  return plan;
}

export function applyImport(current: WorkspaceData, incoming: ParsedImport, mode: ImportMode, includeSettings: boolean): WorkspaceData {
  const settings = includeSettings && incoming.settings ? incoming.settings : current.settings;
  if (mode === 'replace') return { ...structuredClone(incoming.data), settings };
  const next = { ...current, settings } as WorkspaceData;
  for (const name of COLLECTIONS) {
    const list = [...current[name]] as { id: string; updatedAt?: string; at?: string }[];
    const index = new Map(list.map((r, i) => [r.id, i]));
    for (const r of incoming.data[name] as { id: string; updatedAt?: string }[]) {
      const i = index.get(r.id);
      if (i === undefined) {
        index.set(r.id, list.length);
        list.push(r);
      } else if (mode === 'update' && (r.updatedAt ?? '') > (list[i].updatedAt ?? '')) {
        list[i] = r;
      }
    }
    if (name === 'activity') list.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
    (next as unknown as Record<string, unknown>)[name] = list;
  }
  return next;
}
