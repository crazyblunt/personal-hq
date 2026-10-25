/**
 * Undoable batches. Applying a set of suggestions (Claude's or the local
 * Organize review's) runs inside `recordBatch`, which notes the previous
 * version of every record it changes and every record it creates. `undoBatch`
 * puts those versions back and removes the created records through normal
 * store operations, so sync carries the undo to other devices. A record that
 * changed again after the batch (here or on another device) is left alone and
 * reported.
 *
 * The last 10 batches are kept on this device only (adapter aux "undo").
 */
import { create } from 'zustand';
import { newId, nowIso } from '../lib/util';
import { refTitle, type LinkData } from './linking';
import { getAdapter, logActivity, removeRecords, restoreRecord, setBatchRecorder, useHQ } from './store';
import type { CollectionName, LinkableKind } from './types';

export interface BatchRecord {
  id: string;
  at: string;
  label: string;
  source: 'claude' | 'local';
  /** Records changed (or deleted) by the batch, as they were before it. `afterStamp` is '' when the batch deleted it. */
  changed: { collection: CollectionName; before: { id: string; updatedAt: string }; afterStamp: string }[];
  created: { collection: CollectionName; id: string; afterStamp: string }[];
}

export interface UndoReport {
  restored: number;
  removed: number;
  /** Titles of items left alone because they changed after the batch. */
  skipped: string[];
}

export const BATCH_KEEP = 10;

export const useBatches = create<{ list: BatchRecord[] }>(() => ({ list: [] }));

function persist(list: BatchRecord[]) {
  useBatches.setState({ list });
  void getAdapter()
    .writeAux?.('undo', list)
    ?.catch(() => {
      /* undo history is a convenience; losing it loses nothing else */
    });
}

export async function loadBatches(): Promise<void> {
  try {
    const v = await getAdapter().readAux?.('undo');
    if (Array.isArray(v)) useBatches.setState({ list: (v as BatchRecord[]).filter((b) => b && typeof b.id === 'string' && Array.isArray(b.changed) && Array.isArray(b.created)).slice(0, BATCH_KEEP) });
  } catch {
    /* ignore */
  }
}

type Rec = { id: string; updatedAt: string };
const findRec = (collection: CollectionName, id: string): Rec | undefined => (useHQ.getState()[collection] as Rec[]).find((r) => r.id === id);

const KIND_OF: Partial<Record<CollectionName, LinkableKind>> = { tasks: 'task', notes: 'note', ideas: 'idea', projects: 'project' };
function titleOf(collection: CollectionName, rec: Rec): string {
  const kind = KIND_OF[collection];
  const fromStore = kind ? refTitle({ kind, id: rec.id }, useHQ.getState() as LinkData) : null;
  const r = rec as Rec & { title?: string; name?: string; body?: string };
  return fromStore ?? r.title ?? r.name ?? r.body?.slice(0, 60) ?? rec.id;
}

type AnyRec = Rec & {
  projectId?: string | null;
  taskIds?: string[];
  relatedIds?: string[];
  itemLinks?: { kind: string; id: string }[];
  source?: { kind: string; id: string } | null;
};

/**
 * True when any record outside the batch's own new records points at this
 * one: a project's tasks/notes/ideas/events/prompts/bugs, a note's linked
 * tasks, related ideas, item links, or a converted item's source. Undo keeps
 * such a record instead of leaving those pointers dangling.
 */
function isReferenced(collection: CollectionName, id: string, createdKeys: Set<string>): boolean {
  const kind = KIND_OF[collection];
  const ws = useHQ.getState();
  for (const name of ['tasks', 'notes', 'ideas', 'projects', 'events', 'bugs', 'prompts'] as const) {
    for (const r of ws[name] as AnyRec[]) {
      if (createdKeys.has(`${name}:${r.id}`) || (name === collection && r.id === id)) continue;
      if (collection === 'projects' && r.projectId === id) return true;
      if (collection === 'tasks' && r.taskIds?.includes(id)) return true;
      if (collection === 'ideas' && r.relatedIds?.includes(id)) return true;
      if (kind && r.itemLinks?.some((l) => l.kind === kind && l.id === id)) return true;
      if (kind && r.source?.kind === kind && r.source.id === id) return true;
    }
  }
  return false;
}

/** Runs `fn` and records what it changed. Returns null when nothing changed. */
export function recordBatch(label: string, source: BatchRecord['source'], fn: () => void): BatchRecord | null {
  const touched = new Map<string, { collection: CollectionName; before: Rec }>();
  const created = new Map<string, { collection: CollectionName; id: string }>();
  setBatchRecorder({
    touched(collection, before) {
      const k = `${collection}:${before.id}`;
      if (!touched.has(k) && !created.has(k)) touched.set(k, { collection, before });
    },
    created(collection, id) {
      created.set(`${collection}:${id}`, { collection, id });
    },
  });
  try {
    fn();
  } finally {
    setBatchRecorder(null);
  }
  if (!touched.size && !created.size) return null;
  const record: BatchRecord = {
    id: newId(),
    at: nowIso(),
    label,
    source,
    changed: [...touched.values()].map((t) => ({ ...t, afterStamp: findRec(t.collection, t.before.id)?.updatedAt ?? '' })),
    created: [...created.values()].map((c) => ({ ...c, afterStamp: findRec(c.collection, c.id)?.updatedAt ?? '' })),
  };
  persist([record, ...useBatches.getState().list].slice(0, BATCH_KEEP));
  return record;
}

export function undoBatch(id: string): UndoReport {
  const batch = useBatches.getState().list.find((b) => b.id === id);
  if (!batch) return { restored: 0, removed: 0, skipped: [] };
  const report: UndoReport = { restored: 0, removed: 0, skipped: [] };
  for (const c of batch.changed) {
    const cur = findRec(c.collection, c.before.id);
    const unchanged = c.afterStamp === '' ? !cur : cur?.updatedAt === c.afterStamp;
    if (!unchanged) {
      report.skipped.push(titleOf(c.collection, cur ?? c.before));
      continue;
    }
    restoreRecord(c.collection, c.before as never);
    report.restored++;
  }
  // Restorations above have already run, so references the batch itself made are gone by now.
  const createdKeys = new Set(batch.created.map((c) => `${c.collection}:${c.id}`));
  for (const c of batch.created) {
    const cur = findRec(c.collection, c.id);
    if (!cur) continue;
    if (cur.updatedAt !== c.afterStamp) {
      report.skipped.push(titleOf(c.collection, cur));
      continue;
    }
    if (isReferenced(c.collection, c.id, createdKeys)) {
      report.skipped.push(`${titleOf(c.collection, cur)} (kept: other items use it)`);
      continue;
    }
    removeRecords(c.collection, (r) => r.id === c.id);
    report.removed++;
  }
  logActivity({
    action: 'restored',
    entity: 'workspace',
    entityId: '',
    title: `Undid: ${batch.label}`,
    detail: [`${report.restored} restored`, `${report.removed} removed`, report.skipped.length ? `${report.skipped.length} left alone (changed since)` : ''].filter(Boolean).join(', '),
  });
  persist(useBatches.getState().list.filter((b) => b.id !== id));
  return report;
}
