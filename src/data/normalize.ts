/**
 * Turns unknown JSON (from storage or an imported file) into well-formed
 * records. Problems that make a record unusable (not an object, no id, no
 * title) are errors; problems that have a safe default (an unknown status,
 * a missing list) are fixed and reported as warnings.
 */
import { isDateKey, toDateKey } from '../lib/dates';
import { defaultSettings, DEFAULT_WIDGETS, placeWidgets } from './defaults';
import {
  ACCENTS,
  ACTIVITY_ACTIONS,
  BUG_SEVERITIES,
  BUG_STATUSES,
  DENSITIES,
  ENTITY_KINDS,
  IDEA_KINDS,
  LINK_KINDS,
  PRIORITIES,
  PROJECT_CATEGORIES,
  PROJECT_COLORS,
  PROJECT_STATUSES,
  SECTIONS,
  TASK_STATUSES,
  THEMES,
  WIDGET_IDS,
  WIDGET_SIZES,
  type ActivityEntry,
  type Bug,
  type CalendarEvent,
  type CollectionName,
  type Collections,
  type Countdown,
  type Idea,
  type Milestone,
  type Note,
  type Project,
  type ProjectLink,
  type Prompt,
  type Settings,
  type Shortcut,
  type SourceRef,
  type Subtask,
  type Task,
  type WidgetPref,
} from './types';

export class RecordError extends Error {}

type Obj = Record<string, unknown>;
type Warn = (message: string) => void;

export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(o: Obj, key: string, fallback = ''): string {
  const v = o[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
}

function requiredStr(o: Obj, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new RecordError(`${path}: "${key}" must be text`);
  return v;
}

function strOrNull(o: Obj, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' && v !== '' ? v : null;
}

function oneOf<T extends string>(o: Obj, key: string, allowed: readonly T[], fallback: T, path: string, warn: Warn): T {
  const v = o[key];
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  warn(`${path}: unknown ${key} "${String(v)}", using "${fallback}"`);
  return fallback;
}

function strList(o: Obj, key: string): string[] {
  const v = o[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];
}

function bool(o: Obj, key: string, fallback = false): boolean {
  const v = o[key];
  return typeof v === 'boolean' ? v : fallback;
}

function num(o: Obj, key: string, fallback: number): number {
  const v = o[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Accepts `YYYY-MM-DD`; full ISO timestamps are reduced to their local day. */
function dateKey(o: Obj, key: string): string | null {
  const v = o[key];
  if (typeof v !== 'string' || v === '') return null;
  if (isDateKey(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : toDateKey(d);
}

function timeOfDay(o: Obj, key: string): string | null {
  const v = o[key];
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function isoOrNull(o: Obj, key: string): string | null {
  const v = o[key];
  if (typeof v !== 'string' || v === '') return null;
  return Number.isNaN(new Date(v).getTime()) ? null : v;
}

function base(raw: unknown, path: string) {
  if (!isObj(raw)) throw new RecordError(`${path}: expected an object`);
  const id = raw.id;
  if (typeof id !== 'string' || id.trim() === '') throw new RecordError(`${path}: missing "id"`);
  const now = new Date().toISOString();
  const createdAt = isoOrNull(raw, 'createdAt') ?? now;
  return { raw, id, createdAt, updatedAt: isoOrNull(raw, 'updatedAt') ?? createdAt };
}

function sourceRef(o: Obj, key: string): SourceRef | null {
  const v = o[key];
  if (!isObj(v) || typeof v.id !== 'string' || (v.kind !== 'idea' && v.kind !== 'note')) return null;
  return { kind: v.kind, id: v.id };
}

function subtasks(o: Obj): Subtask[] {
  const v = o.subtasks;
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).flatMap((s, i) =>
    typeof s.title === 'string' && s.title.trim()
      ? [{ id: typeof s.id === 'string' && s.id ? s.id : `st-${i}`, title: s.title, done: s.done === true }]
      : [],
  );
}

function links(o: Obj, path: string, warn: Warn): ProjectLink[] {
  const v = o.links;
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).flatMap((l, i) =>
    typeof l.url === 'string' && l.url.trim()
      ? [
          {
            id: typeof l.id === 'string' && l.id ? l.id : `ln-${i}`,
            label: typeof l.label === 'string' ? l.label : '',
            url: l.url.trim(),
            kind: oneOf(l, 'kind', LINK_KINDS, 'other', `${path}.links[${i}]`, warn),
          },
        ]
      : [],
  );
}

function milestones(o: Obj): Milestone[] {
  const v = o.milestones;
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).flatMap((m, i) =>
    typeof m.title === 'string' && m.title.trim()
      ? [{ id: typeof m.id === 'string' && m.id ? m.id : `ms-${i}`, title: m.title, dueDate: dateKey(m, 'dueDate'), done: m.done === true }]
      : [],
  );
}

type Normalizer<K extends CollectionName> = (raw: unknown, path: string, warn: Warn) => Collections[K][number];

export const normalizers: { [K in CollectionName]: Normalizer<K> } = {
  tasks: (raw, path, warn): Task => {
    const { raw: o, ...b } = base(raw, path);
    const status = oneOf(o, 'status', TASK_STATUSES, 'planned', path, warn);
    return {
      ...b,
      title: requiredStr(o, 'title', path),
      description: str(o, 'description'),
      status,
      priority: oneOf(o, 'priority', PRIORITIES, 'medium', path, warn),
      category: str(o, 'category'),
      tags: strList(o, 'tags'),
      dueDate: dateKey(o, 'dueDate'),
      projectId: strOrNull(o, 'projectId'),
      eventId: strOrNull(o, 'eventId'),
      milestoneId: strOrNull(o, 'milestoneId'),
      myDay: dateKey(o, 'myDay'),
      subtasks: subtasks(o),
      assignee: str(o, 'assignee'),
      order: num(o, 'order', 0),
      completedAt: status === 'completed' ? (isoOrNull(o, 'completedAt') ?? b.updatedAt) : null,
      source: sourceRef(o, 'source'),
    };
  },
  ideas: (raw, path, warn): Idea => {
    const { raw: o, ...b } = base(raw, path);
    return {
      ...b,
      title: str(o, 'title'),
      body: requiredStr(o, 'body', path),
      kind: oneOf(o, 'kind', IDEA_KINDS, 'idea', path, warn),
      url: str(o, 'url'),
      tags: strList(o, 'tags'),
      category: str(o, 'category'),
      favorite: bool(o, 'favorite'),
      inbox: bool(o, 'inbox', true),
      archived: bool(o, 'archived'),
      projectId: strOrNull(o, 'projectId'),
      relatedIds: strList(o, 'relatedIds'),
      converted: Array.isArray(o.converted)
        ? o.converted.filter(isObj).flatMap((c) =>
            (c.kind === 'task' || c.kind === 'note' || c.kind === 'project') && typeof c.id === 'string'
              ? [{ kind: c.kind, id: c.id, at: typeof c.at === 'string' ? c.at : b.updatedAt }]
              : [],
          )
        : [],
      remindOn: dateKey(o, 'remindOn'),
    };
  },
  notes: (raw, path): Note => {
    const { raw: o, ...b } = base(raw, path);
    return {
      ...b,
      title: requiredStr(o, 'title', path),
      body: str(o, 'body'),
      tags: strList(o, 'tags'),
      category: str(o, 'category'),
      favorite: bool(o, 'favorite', bool(o, 'pinned')),
      projectId: strOrNull(o, 'projectId'),
      taskIds: strList(o, 'taskIds'),
      source: sourceRef(o, 'source'),
    };
  },
  projects: (raw, path, warn): Project => {
    const { raw: o, ...b } = base(raw, path);
    const status = oneOf(o, 'status', PROJECT_STATUSES, 'active', path, warn);
    const from = o.archivedFromStatus;
    return {
      ...b,
      name: requiredStr(o, 'name', path),
      description: str(o, 'description'),
      category: oneOf(o, 'category', PROJECT_CATEGORIES, 'other', path, warn),
      status,
      color: oneOf(o, 'color', PROJECT_COLORS, 'emerald', path, warn),
      targetDate: dateKey(o, 'targetDate'),
      techStack: strList(o, 'techStack'),
      repoUrl: str(o, 'repoUrl'),
      links: links(o, path, warn),
      milestones: milestones(o),
      archivedFromStatus:
        status === 'archived' ? (from === 'active' || from === 'paused' || from === 'completed' ? from : 'active') : null,
    };
  },
  events: (raw, path): CalendarEvent => {
    const { raw: o, ...b } = base(raw, path);
    const startDate = dateKey(o, 'startDate');
    if (!startDate) throw new RecordError(`${path}: "startDate" must be a date (YYYY-MM-DD)`);
    const startTime = timeOfDay(o, 'startTime');
    const endDate = dateKey(o, 'endDate');
    return {
      ...b,
      title: requiredStr(o, 'title', path),
      description: str(o, 'description'),
      startDate,
      startTime,
      endDate: endDate && endDate >= startDate ? endDate : null,
      endTime: timeOfDay(o, 'endTime'),
      allDay: bool(o, 'allDay', startTime === null),
      projectId: strOrNull(o, 'projectId'),
    };
  },
  bugs: (raw, path, warn): Bug => {
    const { raw: o, ...b } = base(raw, path);
    const status = oneOf(o, 'status', BUG_STATUSES, 'open', path, warn);
    return {
      ...b,
      projectId: requiredStr(o, 'projectId', path),
      title: requiredStr(o, 'title', path),
      description: str(o, 'description'),
      stepsToReproduce: str(o, 'stepsToReproduce'),
      severity: oneOf(o, 'severity', BUG_SEVERITIES, 'medium', path, warn),
      status,
      resolvedAt: status === 'fixed' || status === 'wont_fix' ? (isoOrNull(o, 'resolvedAt') ?? b.updatedAt) : null,
    };
  },
  prompts: (raw, path): Prompt => {
    const { raw: o, ...b } = base(raw, path);
    return {
      ...b,
      title: requiredStr(o, 'title', path),
      body: str(o, 'body'),
      tags: strList(o, 'tags'),
      projectId: strOrNull(o, 'projectId'),
      favorite: bool(o, 'favorite'),
      copyCount: Math.max(0, Math.floor(num(o, 'copyCount', 0))),
      lastCopiedAt: isoOrNull(o, 'lastCopiedAt'),
    };
  },
  activity: (raw, path, warn): ActivityEntry => {
    if (!isObj(raw)) throw new RecordError(`${path}: expected an object`);
    const id = raw.id;
    if (typeof id !== 'string' || !id) throw new RecordError(`${path}: missing "id"`);
    const at = isoOrNull(raw, 'at');
    if (!at) throw new RecordError(`${path}: "at" must be a timestamp`);
    const entry: ActivityEntry = {
      id,
      at,
      action: oneOf(raw, 'action', ACTIVITY_ACTIONS, 'updated', path, warn),
      entity: oneOf(raw, 'entity', ENTITY_KINDS, 'workspace', path, warn),
      entityId: str(raw, 'entityId'),
      title: str(raw, 'title'),
      projectId: strOrNull(raw, 'projectId'),
      detail: str(raw, 'detail'),
    };
    if (raw.backfilled === true) entry.backfilled = true;
    return entry;
  },
};

export interface NormalizeResult<T> {
  items: T[];
  errors: string[];
  warnings: string[];
  /** Raw entries that could not be used, kept so nothing is silently lost. */
  rejected: unknown[];
}

export function normalizeCollection<K extends CollectionName>(name: K, value: unknown): NormalizeResult<Collections[K][number]> {
  const result: NormalizeResult<Collections[K][number]> = { items: [], errors: [], warnings: [], rejected: [] };
  if (value === undefined || value === null) return result;
  if (!Array.isArray(value)) {
    result.errors.push(`"${name}" must be a list`);
    result.rejected.push(value);
    return result;
  }
  const seen = new Set<string>();
  value.forEach((raw, i) => {
    const path = `${name}[${i}]`;
    try {
      const item = normalizers[name](raw, path, (m) => result.warnings.push(m));
      if (seen.has(item.id)) {
        result.warnings.push(`${path}: duplicate id "${item.id}", kept the first one`);
        return;
      }
      seen.add(item.id);
      result.items.push(item);
    } catch (e) {
      if (!(e instanceof RecordError)) throw e;
      result.errors.push(e.message);
      result.rejected.push(raw);
    }
  });
  return result;
}

function widgets(v: unknown): WidgetPref[] {
  const saved = Array.isArray(v) ? v.filter(isObj) : [];
  const out: WidgetPref[] = [];
  const seen = new Set<string>();
  for (const w of saved) {
    if (typeof w.id !== 'string' || !(WIDGET_IDS as readonly string[]).includes(w.id) || seen.has(w.id)) continue;
    seen.add(w.id);
    const pref: WidgetPref = {
      id: w.id as WidgetPref['id'],
      enabled: w.enabled !== false,
      size: (WIDGET_SIZES as readonly string[]).includes(w.size as string) ? (w.size as WidgetPref['size']) : 'sm',
    };
    // A saved grid position is used only when all four values make sense; otherwise the widget is placed again.
    const [x, y, cw, ch] = [w.x, w.y, w.w, w.h];
    if ([x, y, cw, ch].every((v) => typeof v === 'number' && Number.isFinite(v)) && (x as number) >= 0 && (y as number) >= 0 && (cw as number) >= 1 && (ch as number) >= 1) {
      Object.assign(pref, { x, y, w: cw, h: ch });
    }
    out.push(pref);
  }
  // Widgets this copy has never seen join after the saved ones, placed like any widget without a position.
  for (const d of DEFAULT_WIDGETS) if (!seen.has(d.id)) out.push({ id: d.id, enabled: d.enabled, size: d.size });
  return placeWidgets(out);
}

function shortcuts(v: unknown): Shortcut[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).flatMap((s, i) =>
    typeof s.url === 'string' && s.url.trim()
      ? [{ id: typeof s.id === 'string' && s.id ? s.id : `sc-${i}`, label: typeof s.label === 'string' && s.label ? s.label : s.url, url: s.url }]
      : [],
  );
}

function countdowns(v: unknown): Countdown[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).flatMap((c, i) =>
    typeof c.target === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(c.target) && isDateKey(c.target.slice(0, 10))
      ? [{ id: typeof c.id === 'string' && c.id ? c.id : `cd-${i}`, label: typeof c.label === 'string' ? c.label : 'Countdown', target: c.target }]
      : [],
  );
}

/** Settings never fail to load: anything missing or unknown falls back to its default. */
export function normalizeSettings(v: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(v)) return d;
  const noop = () => {};
  const p = 'settings';
  return {
    theme: oneOf(v, 'theme', THEMES, d.theme, p, noop),
    accent: oneOf(v, 'accent', ACCENTS, d.accent, p, noop),
    density: oneOf(v, 'density', DENSITIES, d.density, p, noop),
    startupPage: oneOf(v, 'startupPage', SECTIONS, d.startupPage, p, noop),
    defaultPriority: oneOf(v, 'defaultPriority', PRIORITIES, d.defaultPriority, p, noop),
    defaultTaskStatus: v.defaultTaskStatus === 'inbox' ? 'inbox' : 'planned',
    weekStartsOn: v.weekStartsOn === 0 ? 0 : 1,
    clock24h: v.clock24h === true,
    widgets: widgets(v.widgets),
    shortcuts: shortcuts(v.shortcuts),
    countdowns: countdowns(v.countdowns),
    focusMinutes: Math.min(180, Math.max(1, Math.round(num(v, 'focusMinutes', d.focusMinutes)))),
    breakMinutes: Math.min(60, Math.max(1, Math.round(num(v, 'breakMinutes', d.breakMinutes)))),
    ...(typeof v.updatedAt === 'string' ? { updatedAt: v.updatedAt } : {}),
  };
}
