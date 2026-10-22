/** Derived views of the workspace. Pure functions: easy to test, no hidden state. */
import { addDays, diffDays, toDateKey } from '../lib/dates';
import {
  PRIORITY_RANK,
  type ActivityEntry,
  type Bug,
  type CalendarEvent,
  type DateKey,
  type Project,
  type Task,
  type TaskStatus,
} from './types';

export const isOpenTask = (t: Task) => t.status !== 'completed';
export const isOpenBug = (b: Bug) => b.status === 'open' || b.status === 'investigating';

export function isOverdue(t: Task, today: DateKey): boolean {
  return isOpenTask(t) && t.dueDate !== null && t.dueDate < today;
}

/** Open tasks that belong to today: pinned to My Day, due today, or overdue. */
export function isMyDayTask(t: Task, today: DateKey): boolean {
  if (!isOpenTask(t)) return false;
  return t.myDay === today || (t.dueDate !== null && t.dueDate <= today);
}

export function compareTasks(a: Task, b: Task): number {
  const ad = a.dueDate ?? '9999-12-31';
  const bd = b.dueDate ?? '9999-12-31';
  if (ad !== bd) return ad < bd ? -1 : 1;
  const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (pr !== 0) return pr;
  return a.createdAt.localeCompare(b.createdAt);
}

export function compareByPriority(a: Task, b: Task): number {
  const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  return pr !== 0 ? pr : compareTasks(a, b);
}

export type TaskView = 'myday' | 'upcoming' | 'overdue' | 'all' | 'completed';

export function tasksForView(tasks: Task[], view: TaskView, today: DateKey): Task[] {
  switch (view) {
    case 'myday':
      return tasks.filter((t) => isMyDayTask(t, today)).sort(compareByPriority);
    case 'upcoming':
      return tasks.filter((t) => isOpenTask(t) && t.dueDate !== null && t.dueDate > today).sort(compareTasks);
    case 'overdue':
      return tasks.filter((t) => isOverdue(t, today)).sort(compareTasks);
    case 'completed':
      return tasks.filter((t) => t.status === 'completed').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    case 'all':
    default:
      return tasks.filter(isOpenTask).sort(compareTasks);
  }
}

export function tasksCompletedOn(tasks: Task[], day: DateKey): Task[] {
  return tasks.filter((t) => t.completedAt && toDateKey(new Date(t.completedAt)) === day);
}

export interface ProjectProgress {
  total: number;
  completed: number;
  open: number;
  percent: number;
  overdue: number;
  byStatus: Record<TaskStatus, number>;
  openBugs: number;
  lastActivityAt: string | null;
}

/** Progress is completed tasks over all tasks in the project. No tasks means no progress figure. */
export function projectProgress(projectId: string, tasks: Task[], bugs: Bug[], activity: ActivityEntry[], today: DateKey): ProjectProgress {
  const byStatus: Record<TaskStatus, number> = { inbox: 0, planned: 0, in_progress: 0, waiting: 0, completed: 0 };
  let total = 0;
  let overdue = 0;
  let last: string | null = null;
  const touch = (at: string) => {
    if (!last || at > last) last = at;
  };
  for (const t of tasks) {
    if (t.projectId !== projectId) continue;
    total++;
    byStatus[t.status]++;
    if (isOverdue(t, today)) overdue++;
    touch(t.updatedAt);
  }
  let openBugs = 0;
  for (const b of bugs) {
    if (b.projectId !== projectId) continue;
    if (isOpenBug(b)) openBugs++;
    touch(b.updatedAt);
  }
  for (let i = activity.length - 1; i >= 0; i--) {
    if (activity[i].projectId === projectId) {
      touch(activity[i].at);
      break;
    }
  }
  const completed = byStatus.completed;
  return { total, completed, open: total - completed, percent: total ? Math.round((completed / total) * 100) : 0, overdue, byStatus, openBugs, lastActivityAt: last };
}

export function milestoneProgress(milestoneId: string, tasks: Task[]) {
  const linked = tasks.filter((t) => t.milestoneId === milestoneId);
  const done = linked.filter((t) => t.status === 'completed').length;
  return { total: linked.length, done };
}

/* ---------- Calendar items ---------- */

export type CalendarItemKind = 'event' | 'task' | 'project' | 'milestone';

export interface CalendarItem {
  key: string;
  kind: CalendarItemKind;
  id: string;
  date: DateKey;
  time: string | null;
  title: string;
  projectId: string | null;
  done: boolean;
  overdue: boolean;
  /** Multi-day events: the event's own start and end. */
  span?: { start: DateKey; end: DateKey };
}

export function eventOccursOn(e: CalendarEvent, day: DateKey): boolean {
  return day >= e.startDate && day <= (e.endDate ?? e.startDate);
}

/** Everything with a date between `from` and `to` (inclusive), sorted by day then time. */
export function calendarItems(
  data: { tasks: Task[]; events: CalendarEvent[]; projects: Project[] },
  from: DateKey,
  to: DateKey,
  today: DateKey,
): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const e of data.events) {
    const end = e.endDate ?? e.startDate;
    if (end < from || e.startDate > to) continue;
    const first = e.startDate < from ? from : e.startDate;
    const last = end > to ? to : end;
    for (let d = first, guard = 0; d <= last && guard < 400; d = addDays(d, 1), guard++) {
      out.push({
        key: `event:${e.id}:${d}`,
        kind: 'event',
        id: e.id,
        date: d,
        time: e.allDay ? null : d === e.startDate ? e.startTime : null,
        title: e.title,
        projectId: e.projectId,
        done: false,
        overdue: false,
        span: e.endDate && e.endDate !== e.startDate ? { start: e.startDate, end } : undefined,
      });
    }
  }
  for (const t of data.tasks) {
    if (!t.dueDate || t.dueDate < from || t.dueDate > to) continue;
    out.push({ key: `task:${t.id}`, kind: 'task', id: t.id, date: t.dueDate, time: null, title: t.title, projectId: t.projectId, done: t.status === 'completed', overdue: isOverdue(t, today) });
  }
  for (const p of data.projects) {
    if (p.status === 'archived') continue;
    if (p.targetDate && p.targetDate >= from && p.targetDate <= to) {
      out.push({ key: `project:${p.id}`, kind: 'project', id: p.id, date: p.targetDate, time: null, title: `${p.name} target`, projectId: p.id, done: p.status === 'completed', overdue: p.status !== 'completed' && p.targetDate < today });
    }
    for (const m of p.milestones) {
      if (!m.dueDate || m.dueDate < from || m.dueDate > to) continue;
      out.push({ key: `milestone:${p.id}:${m.id}`, kind: 'milestone', id: p.id, date: m.dueDate, time: null, title: `${m.title} · ${p.name}`, projectId: p.id, done: m.done, overdue: !m.done && m.dueDate < today });
    }
  }
  const kindRank: Record<CalendarItemKind, number> = { event: 0, milestone: 1, project: 2, task: 3 };
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || kindRank[a.kind] - kindRank[b.kind] || a.title.localeCompare(b.title));
}

/** Overdue open tasks, missed milestones, and missed project targets before `today`. */
export function overdueItems(data: { tasks: Task[]; projects: Project[] }, today: DateKey): CalendarItem[] {
  return calendarItems({ ...data, events: [] }, '0000-01-01', addDays(today, -1), today).filter((i) => i.overdue);
}

/* ---------- Activity ---------- */

export interface DayActivity {
  date: DateKey;
  created: number;
  completed: number;
  other: number;
  total: number;
}

/** Counts of recorded actions per day for the last `days` days, ending today. */
export function activitySeries(activity: ActivityEntry[], days: number, today: DateKey): DayActivity[] {
  const start = addDays(today, -(days - 1));
  const series: DayActivity[] = Array.from({ length: days }, (_, i) => ({ date: addDays(start, i), created: 0, completed: 0, other: 0, total: 0 }));
  for (const e of activity) {
    const day = toDateKey(new Date(e.at));
    const i = diffDays(start, day);
    if (i < 0 || i >= days) continue;
    const slot = series[i];
    if (e.action === 'created') slot.created++;
    else if (e.action === 'completed') slot.completed++;
    else slot.other++;
    slot.total++;
  }
  return series;
}
