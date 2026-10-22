/**
 * Agent Command Center (the app Personal HQ grew out of) stored its data in
 * localStorage under `acc:*` keys, schema version 2, with five collections.
 * This module converts that data into the Personal HQ model. It never
 * modifies or deletes the original keys.
 */
import { emptyCollections } from './defaults';
import { isObj, normalizeCollection } from './normalize';
import type { ActivityEntry, Collections } from './types';

export const LEGACY_APP = 'agent-command-center';
export const LEGACY_PREFIX = 'acc:';
export const LEGACY_META_KEY = `${LEGACY_PREFIX}meta`;
export const LEGACY_COLLECTIONS = ['projects', 'tasks', 'prompts', 'bugs', 'notes'] as const;
export type LegacyCollection = (typeof LEGACY_COLLECTIONS)[number];
export const LEGACY_MAX_SCHEMA = 2;

export interface LegacyConversion {
  data: Collections;
  counts: Record<LegacyCollection, number>;
  errors: string[];
  warnings: string[];
  rejected: Partial<Record<LegacyCollection, unknown[]>>;
}

const LEGACY_DETAIL = 'From Agent Command Center history';

function prepareProject(raw: unknown): unknown {
  return isObj(raw) && raw.category === undefined ? { ...raw, category: 'coding' } : raw;
}

function prepareTask(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  if (raw.status === 'testing') {
    const tags = Array.isArray(raw.tags) ? raw.tags : [];
    return { ...raw, status: 'in_progress', tags: [...tags, 'testing'] };
  }
  return raw;
}

/** Converts the five Agent Command Center collections; `raw` maps collection name to its stored list. */
export function convertLegacy(raw: Partial<Record<LegacyCollection, unknown>>): LegacyConversion {
  const data = emptyCollections();
  const errors: string[] = [];
  const warnings: string[] = [];
  const rejected: LegacyConversion['rejected'] = {};

  const run = <K extends LegacyCollection>(name: K, value: unknown) => {
    const r = normalizeCollection(name, value);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (r.rejected.length) rejected[name] = r.rejected;
    return r.items;
  };

  data.projects = run('projects', Array.isArray(raw.projects) ? raw.projects.map(prepareProject) : raw.projects);
  data.tasks = run('tasks', Array.isArray(raw.tasks) ? raw.tasks.map(prepareTask) : raw.tasks);
  data.prompts = run('prompts', raw.prompts);
  data.bugs = run('bugs', raw.bugs);
  data.notes = run('notes', raw.notes);

  // Tasks and notes that pointed at a project that no longer exists stay, unlinked.
  const projectIds = new Set(data.projects.map((p) => p.id));
  data.tasks = data.tasks.map((t) => (t.projectId && !projectIds.has(t.projectId) ? { ...t, projectId: null } : t));
  data.notes = data.notes.map((n) => (n.projectId && !projectIds.has(n.projectId) ? { ...n, projectId: null } : n));
  data.prompts = data.prompts.map((p) => (p.projectId && !projectIds.has(p.projectId) ? { ...p, projectId: null } : p));

  data.activity = backfillActivity(data);

  return {
    data,
    counts: {
      projects: data.projects.length,
      tasks: data.tasks.length,
      prompts: data.prompts.length,
      bugs: data.bugs.length,
      notes: data.notes.length,
    },
    errors,
    warnings,
    rejected,
  };
}

/**
 * Rebuilds activity entries from timestamps Agent Command Center recorded on
 * each record (created, completed, resolved). Ids are deterministic so the
 * same history is never added twice.
 */
export function backfillActivity(d: Pick<Collections, 'projects' | 'tasks' | 'bugs' | 'notes'>): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  const add = (e: Omit<ActivityEntry, 'id' | 'detail' | 'backfilled'>) =>
    out.push({ ...e, id: `legacy-${e.entity}-${e.entityId}-${e.action}`, detail: LEGACY_DETAIL, backfilled: true });

  for (const p of d.projects) add({ at: p.createdAt, action: 'created', entity: 'project', entityId: p.id, title: p.name, projectId: p.id });
  for (const t of d.tasks) {
    add({ at: t.createdAt, action: 'created', entity: 'task', entityId: t.id, title: t.title, projectId: t.projectId });
    if (t.completedAt) add({ at: t.completedAt, action: 'completed', entity: 'task', entityId: t.id, title: t.title, projectId: t.projectId });
  }
  for (const b of d.bugs) {
    add({ at: b.createdAt, action: 'created', entity: 'bug', entityId: b.id, title: b.title, projectId: b.projectId });
    if (b.resolvedAt) add({ at: b.resolvedAt, action: 'completed', entity: 'bug', entityId: b.id, title: b.title, projectId: b.projectId });
  }
  for (const n of d.notes) add({ at: n.createdAt, action: 'created', entity: 'note', entityId: n.id, title: n.title, projectId: n.projectId });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function legacySchemaVersion(metaJson: string | null): number {
  if (!metaJson) return 1;
  try {
    const v = JSON.parse(metaJson)?.schemaVersion;
    return typeof v === 'number' ? v : 1;
  } catch {
    return 1;
  }
}
