/**
 * The Explorer table: one row per task, note, idea, and project, with
 * filters, sorting, and saved views. Pure functions plus three small
 * settings actions for views.
 */
import { matchesQuery } from '../lib/search';
import { newId } from '../lib/util';
import { refKey, type Connection, type LinkData } from './linking';
import { updateSettings, useHQ } from './store';
import { ideaTitle, noteTitle } from './titles';
import { PROJECT_STATUS_LABEL, TASK_STATUS_LABEL, type DateKey, type ExplorerFilters, type ExplorerSort, type ItemRef, type LinkableKind, type SavedView } from './types';

export interface ExplorerRow {
  ref: ItemRef;
  title: string;
  status: string;
  state: 'open' | 'done' | 'archived';
  /** The project the item belongs to; null for projects themselves. */
  projectId: string | null;
  tags: string[];
  date: DateKey | null;
  updatedAt: string;
  createdAt: string;
  links: number;
  /** Extra searchable text (body, description, category). */
  text: string[];
}

export const DEFAULT_FILTERS: ExplorerFilters = { kinds: [], query: '', tag: '', projectId: '', state: 'open' };
export const DEFAULT_SORT: ExplorerSort = { key: 'updated', dir: 'desc' };

export function explorerRows(ws: LinkData, index: Map<string, Connection[]>): ExplorerRow[] {
  const links = (ref: ItemRef) => index.get(refKey(ref))?.length ?? 0;
  const rows: ExplorerRow[] = [];
  for (const t of ws.tasks) {
    const ref: ItemRef = { kind: 'task', id: t.id };
    rows.push({ ref, title: t.title, status: TASK_STATUS_LABEL[t.status], state: t.status === 'completed' ? 'done' : 'open', projectId: t.projectId, tags: t.tags, date: t.dueDate, updatedAt: t.updatedAt, createdAt: t.createdAt, links: links(ref), text: [t.description, t.category] });
  }
  for (const n of ws.notes) {
    const ref: ItemRef = { kind: 'note', id: n.id };
    rows.push({ ref, title: noteTitle(n), status: n.category || 'Note', state: 'open', projectId: n.projectId, tags: n.tags, date: null, updatedAt: n.updatedAt, createdAt: n.createdAt, links: links(ref), text: [n.body, n.category] });
  }
  for (const i of ws.ideas) {
    const ref: ItemRef = { kind: 'idea', id: i.id };
    rows.push({ ref, title: ideaTitle(i), status: i.archived ? 'Archived' : i.inbox ? 'Inbox' : 'Idea', state: i.archived ? 'archived' : 'open', projectId: i.projectId, tags: i.tags, date: i.remindOn, updatedAt: i.updatedAt, createdAt: i.createdAt, links: links(ref), text: [i.body, i.url, i.category] });
  }
  for (const p of ws.projects) {
    const ref: ItemRef = { kind: 'project', id: p.id };
    rows.push({ ref, title: p.name, status: PROJECT_STATUS_LABEL[p.status], state: p.status === 'completed' ? 'done' : p.status === 'archived' ? 'archived' : 'open', projectId: null, tags: p.tags, date: p.targetDate, updatedAt: p.updatedAt, createdAt: p.createdAt, links: links(ref), text: [p.description, ...p.techStack] });
  }
  return rows;
}

export function filterRows(rows: ExplorerRow[], f: ExplorerFilters): ExplorerRow[] {
  const tag = f.tag.toLowerCase();
  return rows.filter(
    (r) =>
      (f.kinds.length === 0 || f.kinds.includes(r.ref.kind)) &&
      (f.state === 'all' || r.state === f.state) &&
      (!tag || r.tags.some((t) => t.toLowerCase() === tag)) &&
      (!f.projectId || r.projectId === f.projectId || (r.ref.kind === 'project' && r.ref.id === f.projectId)) &&
      matchesQuery(f.query, r.title, r.tags, ...r.text),
  );
}

const KIND_ORDER: Record<LinkableKind, number> = { task: 0, note: 1, idea: 2, project: 3 };

export function sortRows(rows: ExplorerRow[], s: ExplorerSort, projectName: (id: string | null) => string): ExplorerRow[] {
  const dir = s.dir === 'asc' ? 1 : -1;
  const byTitle = (a: ExplorerRow, b: ExplorerRow) => a.title.localeCompare(b.title);
  const cmp = (a: ExplorerRow, b: ExplorerRow): number => {
    switch (s.key) {
      case 'type':
        return KIND_ORDER[a.ref.kind] - KIND_ORDER[b.ref.kind];
      case 'title':
        return byTitle(a, b);
      case 'status':
        return a.status.localeCompare(b.status);
      case 'project':
        return projectName(a.projectId).localeCompare(projectName(b.projectId));
      case 'date':
        return (a.date ?? '').localeCompare(b.date ?? '');
      case 'updated':
        return a.updatedAt.localeCompare(b.updatedAt);
      case 'links':
        return a.links - b.links;
    }
  };
  return [...rows].sort((a, b) => {
    // Rows without a date always go last, whichever way the column is sorted.
    if (s.key === 'date' && !a.date !== !b.date) return a.date ? -1 : 1;
    return cmp(a, b) * dir || byTitle(a, b);
  });
}

/* ---------- Saved views (stored in settings, so they sync) ---------- */

export function saveView(name: string, filters: ExplorerFilters, sort: ExplorerSort): SavedView {
  const view: SavedView = { id: newId(), name: name.trim() || 'Untitled view', filters: { ...filters, kinds: [...filters.kinds] }, sort: { ...sort } };
  updateSettings({ views: [...useHQ.getState().settings.views, view] });
  return view;
}

export function renameView(id: string, name: string): void {
  if (!name.trim()) return;
  updateSettings({ views: useHQ.getState().settings.views.map((v) => (v.id === id ? { ...v, name: name.trim() } : v)) });
}

export function deleteView(id: string): void {
  updateSettings({ views: useHQ.getState().settings.views.filter((v) => v.id !== id) });
}
