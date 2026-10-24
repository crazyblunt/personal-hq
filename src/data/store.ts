/**
 * The workspace store. Components read from `useHQ` and change data only
 * through the action functions exported here. Each action updates memory
 * first, records real activity, and queues a save through the storage adapter.
 */
import { create } from 'zustand';
import { todayKey } from '../lib/dates';
import { errorMessage, extractHashtags, findUrl, newId, nowIso, uniqueStrings } from '../lib/util';
import { createMemoryAdapter } from './adapters/memory';
import { ideaTitle } from './titles';
import type { MigrationSummary, StorageAdapter } from './adapters/types';
import { ACTIVITY_LIMIT, emptyWorkspace } from './defaults';
import {
  COLLECTIONS,
  type ActivityAction,
  type ActivityEntry,
  type Bug,
  type CalendarEvent,
  type CollectionName,
  type Collections,
  type EntityKind,
  type Idea,
  type IdeaKind,
  type Milestone,
  type Note,
  type Project,
  type Prompt,
  type Settings,
  type Task,
  type TaskStatus,
  type WorkspaceData,
} from './types';

export type SaveState = 'idle' | 'pending' | 'saved' | 'error';

export interface HQState extends WorkspaceData {
  status: 'loading' | 'ready' | 'error';
  loadError: string | null;
  storageLabel: string;
  storageKind: NonNullable<StorageAdapter['kind']>;
  persistent: boolean;
  saveState: SaveState;
  lastSavedAt: string | null;
  saveError: string | null;
  issues: string[];
  migration: MigrationSummary | null;
  isNew: boolean;
}

export const useHQ = create<HQState>(() => ({
  ...emptyWorkspace(),
  status: 'loading',
  loadError: null,
  storageLabel: '',
  storageKind: 'memory',
  persistent: false,
  saveState: 'idle',
  lastSavedAt: null,
  saveError: null,
  issues: [],
  migration: null,
  isNew: false,
}));

const get = () => useHQ.getState();
const set = (partial: Partial<HQState>) => useHQ.setState(partial);

/* ---------- Persistence ---------- */

let adapter: StorageAdapter = createMemoryAdapter();
let unsubscribe: (() => void) | undefined;
const dirty = new Set<CollectionName | 'settings'>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushing: Promise<void> = Promise.resolve();

export const getAdapter = () => adapter;

function pickData(s: HQState): WorkspaceData {
  const out = { settings: s.settings } as WorkspaceData;
  for (const n of COLLECTIONS) (out as unknown as Record<string, unknown>)[n] = s[n];
  return out;
}

export function workspaceSnapshot(): WorkspaceData {
  return pickData(get());
}

export async function initStore(next: StorageAdapter): Promise<void> {
  unsubscribe?.();
  clearTimeout(flushTimer);
  dirty.clear();
  adapter = next;
  set({ status: 'loading', storageLabel: next.label, storageKind: next.kind ?? 'localStorage', persistent: next.persistent, loadError: null });
  try {
    const loaded = await next.load();
    set({
      ...loaded.data,
      status: 'ready',
      issues: loaded.issues,
      migration: loaded.migration,
      isNew: loaded.isNew,
      saveState: 'idle',
      saveError: null,
    });
    unsubscribe = next.subscribe?.(() => void reloadFromStorage());
  } catch (e) {
    set({ status: 'error', loadError: errorMessage(e) });
  }
}

/** Picks up changes made in another tab, unless this tab has unsaved changes of its own. */
async function reloadFromStorage() {
  if (dirty.size > 0 || get().status !== 'ready') return;
  try {
    const loaded = await adapter.load();
    set({ ...loaded.data });
  } catch {
    /* keep what we have */
  }
}

function markDirty(...names: (CollectionName | 'settings')[]) {
  for (const n of names) dirty.add(n);
  if (get().saveState !== 'pending') set({ saveState: 'pending' });
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), 150);
}

/** Writes every pending change now. Safe to call repeatedly. */
export function flush(): Promise<void> {
  clearTimeout(flushTimer);
  if (get().status !== 'ready' || dirty.size === 0) return flushing;
  const names = [...dirty];
  dirty.clear();
  const s = get();
  // Start every write synchronously, so a flush during page unload still lands.
  const ops = names.map((n) => (n === 'settings' ? adapter.saveSettings(s.settings) : adapter.saveCollection(n, s[n])));
  flushing = Promise.all(ops)
    .then(() => {
      if (dirty.size === 0) set({ saveState: 'saved', lastSavedAt: nowIso(), saveError: null });
    })
    .catch((e) => {
      for (const n of names) dirty.add(n);
      const msg = errorMessage(e);
      set({ saveState: 'error', saveError: /quota/i.test(msg) ? 'Browser storage is full. Export a backup, then delete old items.' : `Couldn't save: ${msg}` });
    });
  return flushing;
}

export const hasUnsavedChanges = () => dirty.size > 0 || get().saveState === 'error';

/* ---------- Generic helpers ---------- */

type Item<K extends CollectionName> = Collections[K][number];

function list<K extends CollectionName>(name: K): Item<K>[] {
  return get()[name] as Item<K>[];
}

function setList<K extends CollectionName>(name: K, items: Item<K>[]) {
  set({ [name]: items } as Partial<HQState>);
  markDirty(name);
}

function insert<K extends CollectionName>(name: K, item: Item<K>) {
  setList(name, [...list(name), item]);
}

function patch<K extends CollectionName>(name: K, id: string, change: Partial<Item<K>> | ((cur: Item<K>) => Partial<Item<K>>)): Item<K> | undefined {
  const cur = list(name).find((r) => r.id === id);
  if (!cur) return undefined;
  const changes = typeof change === 'function' ? change(cur) : change;
  const next = { ...cur, ...changes, id, updatedAt: nowIso() } as Item<K>;
  setList(
    name,
    list(name).map((r) => (r.id === id ? next : r)),
  );
  return next;
}

/*
 * Low-level record operations for other modules in src/data (linking, tags,
 * undo batches). They save like any edit but log no activity; the calling
 * action logs it. UI code must use the named actions instead.
 */
export function patchRecord<K extends CollectionName>(name: K, id: string, change: Partial<Item<K>>): Item<K> | undefined {
  return patch(name, id, change);
}

export function removeRecords<K extends CollectionName>(name: K, pred: (r: Item<K>) => boolean): Item<K>[] {
  return removeWhere(name, pred);
}

/** Puts back an earlier version of a record (or re-inserts it), with a fresh `updatedAt` so sync carries it. */
export function restoreRecord<K extends CollectionName>(name: K, record: Item<K>): void {
  const next = { ...record, updatedAt: nowIso() } as Item<K>;
  const exists = list(name).some((r) => r.id === record.id);
  setList(name, exists ? list(name).map((r) => (r.id === record.id ? next : r)) : [...list(name), next]);
}

/* ---------- Change hooks (used by sync) ---------- */

export interface RemovedRecord {
  collection: CollectionName;
  id: string;
}

const deleteListeners = new Set<(removed: RemovedRecord[]) => void>();

/** Called with every record the user deletes on this device. */
export function onLocalDelete(fn: (removed: RemovedRecord[]) => void): () => void {
  deleteListeners.add(fn);
  return () => deleteListeners.delete(fn);
}

function emitDeletes(removed: RemovedRecord[]) {
  if (removed.length) for (const fn of deleteListeners) fn(removed);
}

function removeWhere<K extends CollectionName>(name: K, pred: (r: Item<K>) => boolean): Item<K>[] {
  const removed = list(name).filter(pred);
  if (removed.length) {
    setList(name, list(name).filter((r) => !pred(r)));
    emitDeletes(removed.map((r) => ({ collection: name, id: r.id })));
  }
  return removed;
}

export interface RemoteChange {
  collection: CollectionName;
  id: string;
  /** The record to store, or null when it was deleted elsewhere. */
  record: unknown | null;
}

/**
 * Applies changes that arrived from another device. They are saved like any
 * edit but are not logged as activity here (the other device logged them)
 * and do not count as local deletions.
 */
export function applyRemoteChanges(changes: RemoteChange[], settings?: Settings) {
  const touched = new Set<CollectionName>();
  const next: Partial<Record<CollectionName, unknown[]>> = {};
  for (const c of changes) {
    const current = (next[c.collection] ?? [...list(c.collection)]) as { id: string }[];
    const i = current.findIndex((r) => r.id === c.id);
    if (c.record === null) {
      if (i !== -1) current.splice(i, 1);
    } else if (i === -1) current.push(c.record as { id: string });
    else current[i] = c.record as { id: string };
    next[c.collection] = current;
    touched.add(c.collection);
  }
  if (touched.has('activity')) {
    const sorted = (next.activity as ActivityEntry[]).sort((a, b) => a.at.localeCompare(b.at));
    if (sorted.length > ACTIVITY_LIMIT) next.activity = sorted.slice(sorted.length - ACTIVITY_LIMIT);
  }
  const update: Partial<HQState> = { ...(next as Partial<HQState>) };
  if (settings) update.settings = settings;
  set(update);
  markDirty(...touched, ...(settings ? (['settings'] as const) : []));
}

function stamp() {
  const at = nowIso();
  return { id: newId(), createdAt: at, updatedAt: at };
}

/* ---------- Activity ---------- */

export function logActivity(e: { action: ActivityAction; entity: EntityKind; entityId: string; title: string; projectId?: string | null; detail?: string }) {
  const at = nowIso();
  let entries = get().activity;
  const last = entries[entries.length - 1];
  if (
    e.action === 'updated' &&
    last &&
    last.action === 'updated' &&
    last.entity === e.entity &&
    last.entityId === e.entityId &&
    Date.now() - Date.parse(last.at) < 10 * 60_000
  ) {
    entries = [...entries.slice(0, -1), { ...last, at, title: e.title }];
  } else {
    const entry: ActivityEntry = { id: newId(), at, action: e.action, entity: e.entity, entityId: e.entityId, title: e.title, projectId: e.projectId ?? null, detail: e.detail ?? '' };
    entries = [...entries, entry];
  }
  if (entries.length > ACTIVITY_LIMIT) entries = entries.slice(entries.length - ACTIVITY_LIMIT);
  set({ activity: entries });
  markDirty('activity');
}

/* ---------- Tasks ---------- */

function nextOrder(status: TaskStatus, excludeId?: string): number {
  const orders = get().tasks.filter((t) => t.status === status && t.id !== excludeId).map((t) => t.order);
  return orders.length ? Math.max(...orders) + 1 : 0;
}

export type TaskInput = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> & { title: string };

export function createTask(input: TaskInput): Task {
  const s = get().settings;
  const status = input.status ?? s.defaultTaskStatus;
  const task: Task = {
    ...stamp(),
    description: '',
    priority: s.defaultPriority,
    category: '',
    tags: [],
    dueDate: null,
    projectId: null,
    eventId: null,
    milestoneId: null,
    myDay: null,
    subtasks: [],
    assignee: '',
    source: null,
    itemLinks: [],
    ...input,
    title: input.title.trim(),
    status,
    order: nextOrder(status),
    completedAt: status === 'completed' ? nowIso() : null,
  };
  insert('tasks', task);
  logActivity({ action: 'created', entity: 'task', entityId: task.id, title: task.title, projectId: task.projectId });
  return task;
}

export function updateTask(id: string, changes: Partial<Task>): Task | undefined {
  const before = get().tasks.find((t) => t.id === id);
  if (!before) return undefined;
  const statusChanged = changes.status !== undefined && changes.status !== before.status;
  const next = patch('tasks', id, {
    ...changes,
    ...(statusChanged
      ? {
          order: nextOrder(changes.status!, id),
          completedAt: changes.status === 'completed' ? (before.completedAt ?? nowIso()) : null,
        }
      : {}),
  });
  if (!next) return undefined;
  const action: ActivityAction = statusChanged && changes.status === 'completed' ? 'completed' : statusChanged && before.status === 'completed' ? 'reopened' : 'updated';
  logActivity({ action, entity: 'task', entityId: id, title: next.title, projectId: next.projectId });
  return next;
}

export function toggleTaskDone(id: string) {
  const t = get().tasks.find((x) => x.id === id);
  if (!t) return;
  updateTask(id, { status: t.status === 'completed' ? 'planned' : 'completed' });
}

export function toggleMyDay(id: string, today = todayKey()) {
  const t = get().tasks.find((x) => x.id === id);
  if (!t) return;
  updateTask(id, { myDay: t.myDay === today ? null : today });
}

/** Moves a task to a board column, placing it before `beforeId` (or at the end). */
export function moveTask(id: string, status: TaskStatus, beforeId: string | null = null) {
  if (id === beforeId) return;
  const before = get().tasks.find((t) => t.id === id);
  if (!before) return;
  const column = get()
    .tasks.filter((t) => t.status === status && t.id !== id)
    .sort((a, b) => a.order - b.order);
  const i = beforeId ? column.findIndex((t) => t.id === beforeId) : -1;
  const order =
    i === -1 ? (column.length ? column[column.length - 1].order + 1 : 0) : i === 0 ? column[0].order - 1 : (column[i - 1].order + column[i].order) / 2;
  const statusChanged = before.status !== status;
  const next = patch('tasks', id, {
    status,
    order,
    completedAt: status === 'completed' ? (before.completedAt ?? nowIso()) : null,
  });
  if (next && statusChanged) {
    logActivity({
      action: status === 'completed' ? 'completed' : before.status === 'completed' ? 'reopened' : 'updated',
      entity: 'task',
      entityId: id,
      title: next.title,
      projectId: next.projectId,
      detail: status === 'completed' ? '' : `Moved to ${status.replace('_', ' ')}`,
    });
  }
}

export function deleteTask(id: string) {
  const [t] = removeWhere('tasks', (x) => x.id === id);
  if (!t) return;
  for (const n of get().notes.filter((n) => n.taskIds.includes(id))) patch('notes', n.id, { taskIds: n.taskIds.filter((x) => x !== id) });
  logActivity({ action: 'deleted', entity: 'task', entityId: id, title: t.title, projectId: t.projectId });
}

/* ---------- Ideas ---------- */

/** Picks a kind for freshly captured text using simple, visible rules. */
export function detectIdeaKind(text: string): IdeaKind {
  const t = text.trim().toLowerCase();
  if (/^(remind me|reminder|remember to|don'?t forget)\b/.test(t)) return 'reminder';
  if (findUrl(text) && text.trim().split(/\s+/).length <= 12) return 'link';
  if (/^(plan|steps?|roadmap|todo)\b[:\s]/.test(t)) return 'plan';
  if (/\?$/.test(t) || /^(i think|i wonder|what if|maybe)\b/.test(t)) return 'thought';
  return 'idea';
}

export { ideaTitle };

export type IdeaInput = Partial<Omit<Idea, 'id' | 'createdAt' | 'updatedAt'>> & { body: string };

export function createIdea(input: IdeaInput): Idea {
  const body = input.body.trim();
  const idea: Idea = {
    ...stamp(),
    title: '',
    kind: detectIdeaKind(body),
    url: findUrl(body) ?? '',
    category: '',
    favorite: false,
    inbox: true,
    archived: false,
    projectId: null,
    relatedIds: [],
    converted: [],
    remindOn: null,
    itemLinks: [],
    ...input,
    body,
    tags: uniqueStrings([...(input.tags ?? []), ...extractHashtags(body)]),
  };
  insert('ideas', idea);
  logActivity({ action: 'created', entity: 'idea', entityId: idea.id, title: ideaTitle(idea), projectId: idea.projectId, detail: 'Captured' });
  return idea;
}


export function updateIdea(id: string, changes: Partial<Idea>) {
  const next = patch('ideas', id, changes);
  if (next) logActivity({ action: changes.archived === true ? 'archived' : changes.archived === false ? 'restored' : 'updated', entity: 'idea', entityId: id, title: ideaTitle(next), projectId: next.projectId });
  return next;
}

export function deleteIdea(id: string) {
  const [i] = removeWhere('ideas', (x) => x.id === id);
  if (!i) return;
  for (const other of get().ideas.filter((o) => o.relatedIds.includes(id))) patch('ideas', other.id, { relatedIds: other.relatedIds.filter((r) => r !== id) });
  logActivity({ action: 'deleted', entity: 'idea', entityId: id, title: ideaTitle(i), projectId: i.projectId });
}

export function linkIdeas(a: string, b: string) {
  if (a === b) return;
  const ia = get().ideas.find((x) => x.id === a);
  const ib = get().ideas.find((x) => x.id === b);
  if (!ia || !ib) return;
  if (!ia.relatedIds.includes(b)) patch('ideas', a, { relatedIds: [...ia.relatedIds, b] });
  if (!ib.relatedIds.includes(a)) patch('ideas', b, { relatedIds: [...ib.relatedIds, a] });
  logActivity({ action: 'updated', entity: 'idea', entityId: a, title: ideaTitle(ia), projectId: ia.projectId, detail: `Linked to “${ideaTitle(ib)}”` });
}

export function unlinkIdeas(a: string, b: string) {
  const ia = get().ideas.find((x) => x.id === a);
  const ib = get().ideas.find((x) => x.id === b);
  if (ia) patch('ideas', a, { relatedIds: ia.relatedIds.filter((x) => x !== b) });
  if (ib) patch('ideas', b, { relatedIds: ib.relatedIds.filter((x) => x !== a) });
}

export type ConvertTarget = 'task' | 'note' | 'project';

/** Creates a task, note, or project from an idea. The idea is kept, marked as converted, and leaves the Inbox. */
export function convertIdea(id: string, to: ConvertTarget): Task | Note | Project | undefined {
  const idea = get().ideas.find((x) => x.id === id);
  if (!idea) return undefined;
  const title = ideaTitle(idea);
  const rest = idea.title.trim() ? idea.body : idea.body.split('\n').slice(1).join('\n').trim();
  const withUrl = idea.url && !idea.body.includes(idea.url) ? `${rest}\n\n${idea.url}`.trim() : rest;
  let created: Task | Note | Project;
  if (to === 'task') {
    created = createTask({ title, description: withUrl, tags: idea.tags, category: idea.category, projectId: idea.projectId, dueDate: idea.remindOn, source: { kind: 'idea', id } });
  } else if (to === 'note') {
    const body = idea.url && !idea.body.includes(idea.url) ? `${idea.body}\n\n${idea.url}` : idea.body;
    created = createNote({ title, body, tags: idea.tags, category: idea.category, projectId: idea.projectId, source: { kind: 'idea', id } });
  } else {
    created = createProject({ name: title, description: withUrl, category: 'other' });
  }
  patch('ideas', id, { converted: [...idea.converted, { kind: to, id: created.id, at: nowIso() }], inbox: false, ...(to === 'project' ? { projectId: created.id } : {}) });
  logActivity({ action: 'converted', entity: 'idea', entityId: id, title, projectId: idea.projectId, detail: `Idea → ${to[0].toUpperCase()}${to.slice(1)}` });
  return created;
}

/* ---------- Notes ---------- */

export type NoteInput = Partial<Omit<Note, 'id' | 'createdAt' | 'updatedAt'>>;

export function createNote(input: NoteInput = {}): Note {
  const note: Note = { ...stamp(), title: 'Untitled note', body: '', tags: [], category: '', favorite: false, projectId: null, taskIds: [], source: null, itemLinks: [], ...input };
  insert('notes', note);
  logActivity({ action: 'created', entity: 'note', entityId: note.id, title: note.title, projectId: note.projectId });
  return note;
}

export function updateNote(id: string, changes: Partial<Note>) {
  const next = patch('notes', id, changes);
  if (next) logActivity({ action: 'updated', entity: 'note', entityId: id, title: next.title, projectId: next.projectId });
  return next;
}

export function deleteNote(id: string) {
  const [n] = removeWhere('notes', (x) => x.id === id);
  if (n) logActivity({ action: 'deleted', entity: 'note', entityId: id, title: n.title, projectId: n.projectId });
}

export function convertNoteToTask(id: string): Task | undefined {
  const note = get().notes.find((x) => x.id === id);
  if (!note) return undefined;
  const task = createTask({ title: note.title, description: note.body.slice(0, 4000), tags: note.tags, projectId: note.projectId, source: { kind: 'note', id } });
  patch('notes', id, { taskIds: [...note.taskIds, task.id] });
  logActivity({ action: 'converted', entity: 'note', entityId: id, title: note.title, projectId: note.projectId, detail: 'Note → Task' });
  return task;
}

/* ---------- Projects ---------- */

export type ProjectInput = Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>> & { name: string };

export function createProject(input: ProjectInput): Project {
  const project: Project = {
    ...stamp(),
    description: '',
    category: 'other',
    status: 'active',
    color: 'emerald',
    targetDate: null,
    techStack: [],
    repoUrl: '',
    links: [],
    milestones: [],
    archivedFromStatus: null,
    tags: [],
    itemLinks: [],
    ...input,
    name: input.name.trim(),
  };
  insert('projects', project);
  logActivity({ action: 'created', entity: 'project', entityId: project.id, title: project.name, projectId: project.id });
  return project;
}

export function updateProject(id: string, changes: Partial<Project>, detail = '') {
  const before = get().projects.find((p) => p.id === id);
  const next = patch('projects', id, changes);
  if (!next || !before) return next;
  const statusChanged = changes.status && changes.status !== before.status;
  logActivity({
    action: statusChanged && changes.status === 'completed' ? 'completed' : 'updated',
    entity: 'project',
    entityId: id,
    title: next.name,
    projectId: id,
    detail: detail || (statusChanged ? `Status: ${changes.status}` : ''),
  });
  return next;
}

export function archiveProject(id: string) {
  const p = get().projects.find((x) => x.id === id);
  if (!p || p.status === 'archived') return;
  patch('projects', id, { status: 'archived', archivedFromStatus: p.status });
  logActivity({ action: 'archived', entity: 'project', entityId: id, title: p.name, projectId: id });
}

export function restoreProject(id: string) {
  const p = get().projects.find((x) => x.id === id);
  if (!p || p.status !== 'archived') return;
  patch('projects', id, { status: p.archivedFromStatus ?? 'active', archivedFromStatus: null });
  logActivity({ action: 'restored', entity: 'project', entityId: id, title: p.name, projectId: id });
}

/** Deletes a project and its bugs. Tasks, notes, ideas, events, and prompts stay, unlinked. */
export function deleteProject(id: string) {
  const [p] = removeWhere('projects', (x) => x.id === id);
  if (!p) return;
  removeWhere('bugs', (b) => b.projectId === id);
  const unlink = <K extends 'tasks' | 'notes' | 'ideas' | 'events' | 'prompts'>(name: K) => {
    const items = list(name);
    if (items.some((r) => r.projectId === id)) {
      setList(
        name,
        items.map((r) => (r.projectId === id ? ({ ...r, projectId: null, ...(name === 'tasks' ? { milestoneId: null } : {}) } as Item<K>) : r)),
      );
    }
  };
  unlink('tasks');
  unlink('notes');
  unlink('ideas');
  unlink('events');
  unlink('prompts');
  logActivity({ action: 'deleted', entity: 'project', entityId: id, title: p.name, projectId: null });
}

export function addMilestone(projectId: string, title: string, dueDate: string | null = null) {
  const p = get().projects.find((x) => x.id === projectId);
  if (!p || !title.trim()) return;
  const m: Milestone = { id: newId(), title: title.trim(), dueDate, done: false };
  updateProject(projectId, { milestones: [...p.milestones, m] }, `Milestone added: ${m.title}`);
}

export function updateMilestone(projectId: string, milestoneId: string, changes: Partial<Milestone>) {
  const p = get().projects.find((x) => x.id === projectId);
  const m = p?.milestones.find((x) => x.id === milestoneId);
  if (!p || !m) return;
  const detail = changes.done === true && !m.done ? `Milestone reached: ${m.title}` : changes.done === false && m.done ? `Milestone reopened: ${m.title}` : '';
  updateProject(projectId, { milestones: p.milestones.map((x) => (x.id === milestoneId ? { ...x, ...changes, id: x.id } : x)) }, detail);
}

export function removeMilestone(projectId: string, milestoneId: string) {
  const p = get().projects.find((x) => x.id === projectId);
  if (!p) return;
  const m = p.milestones.find((x) => x.id === milestoneId);
  updateProject(projectId, { milestones: p.milestones.filter((x) => x.id !== milestoneId) }, m ? `Milestone removed: ${m.title}` : '');
  const tasks = get().tasks;
  if (tasks.some((t) => t.milestoneId === milestoneId)) setList('tasks', tasks.map((t) => (t.milestoneId === milestoneId ? { ...t, milestoneId: null } : t)));
}

/* ---------- Bugs ---------- */

const isResolved = (s: Bug['status']) => s === 'fixed' || s === 'wont_fix';

export function createBug(input: Omit<Bug, 'id' | 'createdAt' | 'updatedAt' | 'resolvedAt'>): Bug {
  const bug: Bug = { ...stamp(), ...input, resolvedAt: isResolved(input.status) ? nowIso() : null };
  insert('bugs', bug);
  logActivity({ action: 'created', entity: 'bug', entityId: bug.id, title: bug.title, projectId: bug.projectId });
  return bug;
}

export function updateBug(id: string, changes: Partial<Bug>) {
  const before = get().bugs.find((b) => b.id === id);
  if (!before) return;
  const statusChanged = changes.status && changes.status !== before.status;
  const next = patch('bugs', id, {
    ...changes,
    ...(statusChanged ? { resolvedAt: isResolved(changes.status!) ? (before.resolvedAt ?? nowIso()) : null } : {}),
  });
  if (!next) return;
  const action: ActivityAction = statusChanged && isResolved(next.status) && !isResolved(before.status) ? 'completed' : statusChanged && !isResolved(next.status) && isResolved(before.status) ? 'reopened' : 'updated';
  logActivity({ action, entity: 'bug', entityId: id, title: next.title, projectId: next.projectId, detail: statusChanged ? `Status: ${next.status.replace('_', ' ')}` : '' });
}

export function deleteBug(id: string) {
  const [b] = removeWhere('bugs', (x) => x.id === id);
  if (b) logActivity({ action: 'deleted', entity: 'bug', entityId: id, title: b.title, projectId: b.projectId });
}

/* ---------- Prompts ---------- */

export function createPrompt(input: Pick<Prompt, 'title' | 'body' | 'tags' | 'projectId'> & Partial<Prompt>): Prompt {
  const prompt: Prompt = { ...stamp(), favorite: false, copyCount: 0, lastCopiedAt: null, ...input };
  insert('prompts', prompt);
  logActivity({ action: 'created', entity: 'prompt', entityId: prompt.id, title: prompt.title, projectId: prompt.projectId });
  return prompt;
}

export function updatePrompt(id: string, changes: Partial<Prompt>) {
  const next = patch('prompts', id, changes);
  if (next) logActivity({ action: 'updated', entity: 'prompt', entityId: id, title: next.title, projectId: next.projectId });
}

export function recordPromptCopy(id: string) {
  patch('prompts', id, (p) => ({ copyCount: p.copyCount + 1, lastCopiedAt: nowIso() }));
}

export function deletePrompt(id: string) {
  const [p] = removeWhere('prompts', (x) => x.id === id);
  if (p) logActivity({ action: 'deleted', entity: 'prompt', entityId: id, title: p.title, projectId: p.projectId });
}

/* ---------- Events ---------- */

export type EventInput = Partial<Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>> & { title: string; startDate: string };

export function createEvent(input: EventInput): CalendarEvent {
  const event: CalendarEvent = { ...stamp(), description: '', startTime: null, endDate: null, endTime: null, allDay: input.startTime ? false : true, projectId: null, ...input, title: input.title.trim() };
  insert('events', event);
  logActivity({ action: 'created', entity: 'event', entityId: event.id, title: event.title, projectId: event.projectId });
  return event;
}

export function updateEvent(id: string, changes: Partial<CalendarEvent>) {
  const next = patch('events', id, changes);
  if (next) logActivity({ action: 'updated', entity: 'event', entityId: id, title: next.title, projectId: next.projectId });
}

export function deleteEvent(id: string) {
  const [e] = removeWhere('events', (x) => x.id === id);
  if (!e) return;
  const tasks = get().tasks;
  if (tasks.some((t) => t.eventId === id)) setList('tasks', tasks.map((t) => (t.eventId === id ? { ...t, eventId: null } : t)));
  logActivity({ action: 'deleted', entity: 'event', entityId: id, title: e.title, projectId: e.projectId });
}

/* ---------- Focus sessions ---------- */

export function logFocusSession(minutes: number, taskId: string | null) {
  const task = taskId ? get().tasks.find((t) => t.id === taskId) : undefined;
  logActivity({
    action: 'completed',
    entity: 'focus',
    entityId: taskId ?? '',
    title: task ? task.title : 'Focus session',
    projectId: task?.projectId ?? null,
    detail: `${minutes} min focus session`,
  });
}

/* ---------- Settings ---------- */

export function updateSettings(changes: Partial<Settings>) {
  set({ settings: { ...get().settings, ...changes, updatedAt: nowIso() } });
  markDirty('settings');
}

/* ---------- Whole workspace ---------- */

/**
 * Replaces all data (imports in replace mode, restores, deleting everything).
 * A safety snapshot of the current data is saved first; if that fails the
 * replacement does not happen.
 */
export async function replaceWorkspace(data: WorkspaceData, reason: string, opts: { snapshot?: boolean } = {}) {
  await flush();
  // Records that disappear count as deletions, so sync removes them on other devices too.
  const removed: RemovedRecord[] = [];
  for (const n of COLLECTIONS) {
    const keep = new Set((data[n] as { id: string }[]).map((r) => r.id));
    for (const r of get()[n] as { id: string }[]) if (!keep.has(r.id)) removed.push({ collection: n, id: r.id });
  }
  if (opts.snapshot !== false && adapter.saveSnapshot) {
    try {
      await adapter.saveSnapshot({ at: nowIso(), reason, data: workspaceSnapshot() });
    } catch (e) {
      throw new Error(`Couldn't save a safety copy first (${errorMessage(e)}). Nothing was changed. Export a backup, then try again.`);
    }
  }
  set({ ...data, settings: { ...data.settings, updatedAt: nowIso() } });
  emitDeletes(removed);
  try {
    await adapter.replaceAll({ ...data, settings: get().settings });
    set({ saveState: 'saved', lastSavedAt: nowIso(), saveError: null });
  } catch (e) {
    for (const n of COLLECTIONS) dirty.add(n);
    dirty.add('settings');
    set({ saveState: 'error', saveError: `Couldn't save: ${errorMessage(e)}` });
  }
}

export function dismissIssues() {
  set({ issues: [] });
}
