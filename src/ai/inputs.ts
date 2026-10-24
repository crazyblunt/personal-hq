/**
 * Builds exactly the data each Claude job shares, and nothing else. The
 * Ask Claude window shows this object verbatim before anything is copied or
 * sent.
 */
import type { BreakdownInput, OrganizeInput, PlanInput, SummarizeInput } from '../../supabase/functions/_shared/ai-jobs';
import { AI_LIMITS } from '../../supabase/functions/_shared/ai-jobs';
import { eventOccursOn, isOverdue } from '../data/selectors';
import { tagIndex } from '../data/tags';
import { PRIORITY_RANK, type DateKey, type Note, type WorkspaceData } from '../data/types';
import { addDays } from '../lib/dates';

/** Inbox ideas (newest first), or the ideas you picked. At most 50. */
export function buildOrganizeInput(ws: WorkspaceData, ideaIds?: string[]): OrganizeInput {
  const picked = ideaIds ? ws.ideas.filter((i) => ideaIds.includes(i.id)) : ws.ideas.filter((i) => i.inbox && !i.archived).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    ideas: picked.slice(0, AI_LIMITS.organizeIdeas).map((i) => ({ id: i.id, title: i.title, body: i.body, url: i.url, tags: i.tags, category: i.category })),
    tags: tagIndex(ws).map((t) => t.tag),
    projects: ws.projects.filter((p) => p.status === 'active').map((p) => ({ id: p.id, name: p.name })),
  };
}

export function buildSummarizeInput(note: Note): SummarizeInput {
  return { note: { title: note.title, body: note.body } };
}

export function buildBreakdownInput(ws: WorkspaceData, projectId: string, today: DateKey): BreakdownInput {
  const p = ws.projects.find((x) => x.id === projectId);
  if (!p) throw new Error('That project no longer exists.');
  return {
    today,
    project: { name: p.name, description: p.description, milestones: p.milestones.map((m) => ({ id: m.id, title: m.title, dueDate: m.dueDate })) },
    existingTasks: ws.tasks.filter((t) => t.projectId === projectId).map((t) => t.title),
  };
}

/** Open tasks that matter today: overdue, due within a week, on My Day, in progress, or high/urgent. At most 60. */
export function buildPlanInput(ws: WorkspaceData, today: DateKey): PlanInput {
  const weekOut = addDays(today, 7);
  const projectName = new Map(ws.projects.map((p) => [p.id, p.name]));
  const tasks = ws.tasks
    .filter((t) => t.status !== 'completed')
    .filter((t) => isOverdue(t, today) || (t.dueDate !== null && t.dueDate <= weekOut) || t.myDay === today || t.status === 'in_progress' || t.priority === 'high' || t.priority === 'urgent')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, AI_LIMITS.planTasks)
    .map((t) => ({ id: t.id, title: t.title, priority: t.priority, status: t.status, dueDate: t.dueDate, project: t.projectId ? (projectName.get(t.projectId) ?? null) : null }));
  const events = ws.events.filter((e) => eventOccursOn(e, today)).map((e) => ({ title: e.title, time: e.allDay ? null : e.startTime }));
  return { today, tasks, events };
}
