/**
 * Links between tasks, notes, ideas, and projects.
 *
 * Where a link is stored:
 * - idea ↔ idea: both ideas' `relatedIds` (symmetric, as before)
 * - note ↔ task: the note's `taskIds`, whichever side adds it
 * - anything else: `itemLinks` on the item it was added from
 *
 * The index also folds in conversions (`source`, `Idea.converted`), so every
 * item can show what links to it. Links to items that are missing (deleted,
 * or not synced yet) are hidden, never removed.
 */
import { linkIdeas, logActivity, patchRecord, unlinkIdeas, useHQ } from './store';
import { ideaTitle, noteTitle } from './titles';
import type { CollectionName, Idea, ItemRef, LinkableKind, Note, Project, Task, WorkspaceData } from './types';

export type Relation = 'linked' | 'linked-from' | 'source' | 'converted-to' | 'related-idea' | 'linked-task' | 'linked-note';

export interface Connection {
  ref: ItemRef;
  relation: Relation;
  removable: boolean;
}

export type LinkData = Pick<WorkspaceData, 'tasks' | 'notes' | 'ideas' | 'projects'>;

export const KIND_COLLECTION: Record<LinkableKind, Extract<CollectionName, 'tasks' | 'notes' | 'ideas' | 'projects'>> = {
  task: 'tasks',
  note: 'notes',
  idea: 'ideas',
  project: 'projects',
};

export const refKey = (r: ItemRef) => `${r.kind}:${r.id}`;

/** Lower wins when a pair is connected in more than one way. */
const RANK: Record<Relation, number> = { source: 0, 'converted-to': 0, 'related-idea': 1, 'linked-task': 2, 'linked-note': 2, linked: 3, 'linked-from': 3 };
const REMOVABLE: Record<Relation, boolean> = { source: false, 'converted-to': false, 'related-idea': true, 'linked-task': true, 'linked-note': true, linked: true, 'linked-from': true };

type AnyItem = Task | Note | Idea | Project;

export function findItem(ref: ItemRef, ws: LinkData): AnyItem | undefined {
  return (ws[KIND_COLLECTION[ref.kind]] as AnyItem[]).find((r) => r.id === ref.id);
}

export function refTitle(ref: ItemRef, ws: LinkData): string | null {
  const it = findItem(ref, ws);
  if (!it) return null;
  switch (ref.kind) {
    case 'task':
      return (it as Task).title;
    case 'note':
      return noteTitle(it as Note);
    case 'idea':
      return ideaTitle(it as Idea);
    case 'project':
      return (it as Project).name;
  }
}

export function buildLinkIndex(ws: LinkData): Map<string, Connection[]> {
  const ids: Record<LinkableKind, Set<string>> = {
    task: new Set(ws.tasks.map((t) => t.id)),
    note: new Set(ws.notes.map((n) => n.id)),
    idea: new Set(ws.ideas.map((i) => i.id)),
    project: new Set(ws.projects.map((p) => p.id)),
  };
  const exists = (r: ItemRef) => ids[r.kind].has(r.id);
  const byOwner = new Map<string, Map<string, Connection>>();
  const add = (owner: ItemRef, target: ItemRef, relation: Relation) => {
    if (!exists(owner) || !exists(target) || refKey(owner) === refKey(target)) return;
    const ok = refKey(owner);
    const tk = refKey(target);
    const m = byOwner.get(ok) ?? new Map<string, Connection>();
    const cur = m.get(tk);
    if (!cur || RANK[relation] < RANK[cur.relation]) m.set(tk, { ref: { kind: target.kind, id: target.id }, relation, removable: REMOVABLE[relation] });
    byOwner.set(ok, m);
  };
  const pair = (a: ItemRef, b: ItemRef, ab: Relation, ba: Relation) => {
    add(a, b, ab);
    add(b, a, ba);
  };

  const all: [LinkableKind, AnyItem[]][] = [
    ['task', ws.tasks],
    ['note', ws.notes],
    ['idea', ws.ideas],
    ['project', ws.projects],
  ];
  for (const [kind, items] of all) for (const it of items) for (const l of it.itemLinks ?? []) pair({ kind, id: it.id }, l, 'linked', 'linked-from');
  for (const i of ws.ideas) {
    for (const r of i.relatedIds) pair({ kind: 'idea', id: i.id }, { kind: 'idea', id: r }, 'related-idea', 'related-idea');
    for (const c of i.converted) pair({ kind: 'idea', id: i.id }, { kind: c.kind, id: c.id }, 'converted-to', 'source');
  }
  for (const n of ws.notes) {
    for (const t of n.taskIds) pair({ kind: 'note', id: n.id }, { kind: 'task', id: t }, 'linked-task', 'linked-note');
    if (n.source) pair({ kind: 'note', id: n.id }, n.source, 'source', 'converted-to');
  }
  for (const t of ws.tasks) if (t.source) pair({ kind: 'task', id: t.id }, t.source, 'source', 'converted-to');

  const out = new Map<string, Connection[]>();
  for (const [k, m] of byOwner) out.set(k, [...m.values()]);
  return out;
}

const projectOf = (ref: ItemRef, it: AnyItem) => (ref.kind === 'project' ? it.id : (it as Task | Note | Idea).projectId);

const get = (): LinkData => useHQ.getState();

export function linkItems(a: ItemRef, b: ItemRef): void {
  if (refKey(a) === refKey(b)) return;
  const ws = get();
  const ia = findItem(a, ws);
  const ib = findItem(b, ws);
  if (!ia || !ib) return;
  if (buildLinkIndex(ws).get(refKey(a))?.some((c) => refKey(c.ref) === refKey(b))) return;
  if (a.kind === 'idea' && b.kind === 'idea') {
    linkIdeas(a.id, b.id);
    return;
  }
  if ((a.kind === 'note' && b.kind === 'task') || (a.kind === 'task' && b.kind === 'note')) {
    const note = (a.kind === 'note' ? ia : ib) as Note;
    const taskId = a.kind === 'task' ? a.id : b.id;
    patchRecord('notes', note.id, { taskIds: [...note.taskIds, taskId] });
  } else {
    patchRecord(KIND_COLLECTION[a.kind], a.id, { itemLinks: [...(ia.itemLinks ?? []), { kind: b.kind, id: b.id }] });
  }
  logActivity({ action: 'updated', entity: a.kind, entityId: a.id, title: refTitle(a, ws) ?? '', projectId: projectOf(a, ia), detail: `Linked to “${refTitle(b, ws)}”` });
}

export function unlinkItems(a: ItemRef, b: ItemRef): void {
  const ws = get();
  const ia = findItem(a, ws);
  const ib = findItem(b, ws);
  let changed = false;
  const dropLink = (owner: ItemRef, it: AnyItem | undefined, target: ItemRef) => {
    if (it?.itemLinks?.some((l) => refKey(l) === refKey(target))) {
      patchRecord(KIND_COLLECTION[owner.kind], owner.id, { itemLinks: it.itemLinks.filter((l) => refKey(l) !== refKey(target)) });
      changed = true;
    }
  };
  dropLink(a, ia, b);
  dropLink(b, ib, a);
  if (a.kind === 'idea' && b.kind === 'idea' && ((ia as Idea | undefined)?.relatedIds.includes(b.id) || (ib as Idea | undefined)?.relatedIds.includes(a.id))) {
    unlinkIdeas(a.id, b.id);
    changed = true;
  }
  const note = (a.kind === 'note' ? ia : b.kind === 'note' ? ib : undefined) as Note | undefined;
  const taskId = a.kind === 'task' ? a.id : b.kind === 'task' ? b.id : null;
  if (note && taskId && note.taskIds.includes(taskId)) {
    patchRecord('notes', note.id, { taskIds: note.taskIds.filter((t) => t !== taskId) });
    changed = true;
  }
  if (changed && ia) logActivity({ action: 'updated', entity: a.kind, entityId: a.id, title: refTitle(a, ws) ?? '', projectId: projectOf(a, ia), detail: `Unlinked “${refTitle(b, ws) ?? 'a deleted item'}”` });
}
