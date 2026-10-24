/**
 * Checks a Claude reply before anything can change. The reply must have the
 * job's exact shape; every id must be one that was sent for this job; actions
 * come from a fixed list; dates must be real and in range; text is capped.
 * Suggestions that fail are rejected one by one with a reason, and what
 * passes is turned into plain `AiChange` records for the review screen.
 * Nothing in a reply is ever executed, rendered as HTML, or fetched.
 */
import { AI_LIMITS, type BreakdownInput, type OrganizeInput, type PlanInput, type SummarizeInput } from '../../supabase/functions/_shared/ai-jobs';
import { PRIORITIES, type DateKey, type ItemRef, type Priority } from '../data/types';
import { addDays, isDateKey } from '../lib/dates';
import { cleanTag, uniqueStrings } from '../lib/util';

export type JobContext =
  | { job: 'organize'; input: OrganizeInput }
  | { job: 'summarize'; input: SummarizeInput; noteId: string; noteProjectId: string | null }
  | { job: 'breakdown'; input: BreakdownInput; projectId: string }
  | { job: 'plan'; input: PlanInput };

export type AiChange =
  | { type: 'add_tags'; ideaId: string; tags: string[]; reason: string }
  | { type: 'set_category'; ideaId: string; category: string; reason: string }
  | { type: 'set_project'; ideaId: string; projectId: string; reason: string }
  | { type: 'link'; ideaId: string; target: ItemRef; reason: string }
  | { type: 'convert'; ideaId: string; to: 'task' | 'note' | 'project'; reason: string }
  | { type: 'insert_summary'; noteId: string; text: string }
  | { type: 'create_task'; title: string; description: string; priority: Priority; dueDate: DateKey | null; projectId: string | null; milestoneId: string | null; sourceNoteId: string | null }
  | { type: 'add_to_myday'; taskId: string; reason: string };

export interface Rejected {
  reason: 'Unknown item id' | 'Unsupported action' | 'Invalid date' | 'Over the limit' | 'Missing value';
  detail: string;
}

export type ValidationResult = { ok: true; changes: AiChange[]; rejected: Rejected[]; message: string | null } | { ok: false; error: string };

const CAP = { reason: 200, category: 40, keyPoint: 200, title: 140, description: 2000, focus: 400, planReason: 160, tagsPerAction: 5 } as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Trims and caps text, ending a cut string with an ellipsis. */
function cap(v: unknown, n: number): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

const ORGANIZE_ACTIONS = ['add_tags', 'set_category', 'set_project', 'link', 'convert'] as const;

export function validateReply(ctx: JobContext, raw: unknown, today: DateKey): ValidationResult {
  if (!isObj(raw)) return { ok: false, error: 'Wrong shape: reply' };
  const changes: AiChange[] = [];
  const rejected: Rejected[] = [];
  const reject = (reason: Rejected['reason'], detail: string) => rejected.push({ reason, detail });
  const minDate = addDays(today, -365);
  const maxDate = addDays(today, 365 * 5);
  /** A date the reply may use: null, or a real YYYY-MM-DD within range. `undefined` means invalid. */
  const date = (v: unknown): DateKey | null | undefined => (v === null || v === undefined ? null : isDateKey(v) && v >= minDate && v <= maxDate ? v : undefined);

  switch (ctx.job) {
    case 'organize': {
      if (!Array.isArray(raw.suggestions)) return { ok: false, error: 'Wrong shape: suggestions' };
      const ideaIds = new Set(ctx.input.ideas.map((i) => i.id));
      const projectIds = new Set(ctx.input.projects.map((p) => p.id));
      for (const s of raw.suggestions) {
        if (!isObj(s) || typeof s.ideaId !== 'string' || !Array.isArray(s.actions)) {
          reject('Missing value', 'A suggestion without an idea or actions');
          continue;
        }
        const ideaId = s.ideaId;
        if (!ideaIds.has(ideaId)) {
          reject('Unknown item id', `Idea "${cap(ideaId, 40)}" wasn't part of this request`);
          continue;
        }
        const reason = cap(s.reason, CAP.reason);
        for (const a of s.actions) {
          const type = isObj(a) ? a.type : undefined;
          if (!isObj(a) || typeof type !== 'string' || !(ORGANIZE_ACTIONS as readonly string[]).includes(type)) {
            reject('Unsupported action', `"${cap(type, 40) || 'unknown'}" isn't something this job can do`);
            continue;
          }
          if (type === 'add_tags') {
            const cleaned = uniqueStrings((Array.isArray(a.tags) ? a.tags : []).filter((t): t is string => typeof t === 'string').map(cleanTag).filter((t): t is string => t !== null));
            if (!cleaned.length) reject('Missing value', 'Tag suggestion with no usable tags');
            else {
              if (cleaned.length > CAP.tagsPerAction) reject('Over the limit', `Only ${CAP.tagsPerAction} tags per idea; dropped ${cleaned.slice(CAP.tagsPerAction).map((t) => `#${t}`).join(' ')}`);
              changes.push({ type: 'add_tags', ideaId, tags: cleaned.slice(0, CAP.tagsPerAction), reason });
            }
          } else if (type === 'set_category') {
            const category = cap(a.category, CAP.category);
            if (!category) reject('Missing value', 'Category suggestion with no category');
            else changes.push({ type: 'set_category', ideaId, category, reason });
          } else if (type === 'set_project') {
            if (typeof a.projectId !== 'string' || !projectIds.has(a.projectId)) reject('Unknown item id', `Project "${cap(a.projectId, 40)}" wasn't part of this request`);
            else changes.push({ type: 'set_project', ideaId, projectId: a.projectId, reason });
          } else if (type === 'link') {
            const kind = a.targetKind;
            const id = a.targetId;
            const known = typeof id === 'string' && id !== ideaId && ((kind === 'idea' && ideaIds.has(id)) || (kind === 'project' && projectIds.has(id)));
            if (!known) reject('Unknown item id', `Link target "${cap(id, 40)}" wasn't part of this request`);
            else changes.push({ type: 'link', ideaId, target: { kind: kind as 'idea' | 'project', id: id as string }, reason });
          } else {
            const to = a.to;
            if (to !== 'task' && to !== 'note' && to !== 'project') reject('Unsupported action', `Convert to "${cap(to, 20)}"`);
            else changes.push({ type: 'convert', ideaId, to, reason });
          }
        }
      }
      return { ok: true, changes, rejected, message: null };
    }

    case 'summarize': {
      if (typeof raw.summary !== 'string') return { ok: false, error: 'Wrong shape: summary' };
      if (!Array.isArray(raw.keyPoints)) return { ok: false, error: 'Wrong shape: keyPoints' };
      if (!Array.isArray(raw.actionItems)) return { ok: false, error: 'Wrong shape: actionItems' };
      const summary = cap(raw.summary, AI_LIMITS.summaryChars);
      const points = raw.keyPoints.map((k) => cap(k, CAP.keyPoint)).filter(Boolean);
      if (points.length > AI_LIMITS.keyPoints) reject('Over the limit', `Only ${AI_LIMITS.keyPoints} key points are kept`);
      if (summary) {
        const bullets = points.slice(0, AI_LIMITS.keyPoints).map((p) => `- ${p}`);
        changes.push({ type: 'insert_summary', noteId: ctx.noteId, text: ['## Summary (Claude)', summary, ...(bullets.length ? [bullets.join('\n')] : [])].join('\n\n') });
      } else reject('Missing value', 'The summary was empty');
      let kept = 0;
      for (const item of raw.actionItems) {
        const title = isObj(item) ? cap(item.title, CAP.title) : '';
        if (!title) {
          reject('Missing value', 'An action item without a title');
          continue;
        }
        const due = date(isObj(item) ? item.dueDate : null);
        if (due === undefined) {
          reject('Invalid date', `"${title}": ${cap(isObj(item) ? item.dueDate : '', 20)}`);
          continue;
        }
        if (kept >= AI_LIMITS.actionItems) {
          reject('Over the limit', `"${title}"`);
          continue;
        }
        kept++;
        changes.push({ type: 'create_task', title, description: '', priority: 'medium', dueDate: due, projectId: ctx.noteProjectId, milestoneId: null, sourceNoteId: ctx.noteId });
      }
      return { ok: true, changes, rejected, message: null };
    }

    case 'breakdown': {
      if (!Array.isArray(raw.tasks)) return { ok: false, error: 'Wrong shape: tasks' };
      const milestoneIds = new Set(ctx.input.project.milestones.map((m) => m.id));
      let kept = 0;
      for (const t of raw.tasks) {
        const title = isObj(t) ? cap(t.title, CAP.title) : '';
        if (!isObj(t) || !title) {
          reject('Missing value', 'A task without a title');
          continue;
        }
        const due = date(t.dueDate);
        if (due === undefined) {
          reject('Invalid date', `"${title}": ${cap(t.dueDate, 20)}`);
          continue;
        }
        const milestoneId = t.milestoneId === null || t.milestoneId === undefined ? null : typeof t.milestoneId === 'string' && milestoneIds.has(t.milestoneId) ? t.milestoneId : undefined;
        if (milestoneId === undefined) {
          reject('Unknown item id', `"${title}": milestone "${cap(t.milestoneId, 40)}" wasn't part of this request`);
          continue;
        }
        if (kept >= AI_LIMITS.breakdownTasks) {
          reject('Over the limit', `"${title}"`);
          continue;
        }
        kept++;
        const priority = (PRIORITIES as readonly unknown[]).includes(t.priority) ? (t.priority as Priority) : 'medium';
        changes.push({ type: 'create_task', title, description: cap(t.description, CAP.description), priority, dueDate: due, projectId: ctx.projectId, milestoneId, sourceNoteId: null });
      }
      return { ok: true, changes, rejected, message: null };
    }

    case 'plan': {
      if (typeof raw.focus !== 'string') return { ok: false, error: 'Wrong shape: focus' };
      if (!Array.isArray(raw.tasks)) return { ok: false, error: 'Wrong shape: tasks' };
      const sent = new Set(ctx.input.tasks.map((t) => t.id));
      const seen = new Set<string>();
      for (const p of raw.tasks) {
        const taskId = isObj(p) ? p.taskId : undefined;
        if (typeof taskId !== 'string' || !sent.has(taskId)) {
          reject('Unknown item id', `Task "${cap(taskId, 40)}" wasn't part of this request`);
          continue;
        }
        if (seen.has(taskId)) continue;
        if (seen.size >= AI_LIMITS.planPicks) {
          reject('Over the limit', `Only ${AI_LIMITS.planPicks} tasks are kept for today`);
          continue;
        }
        seen.add(taskId);
        changes.push({ type: 'add_to_myday', taskId, reason: cap((p as Obj).reason, CAP.planReason) });
      }
      return { ok: true, changes, rejected, message: cap(raw.focus, CAP.focus) || null };
    }
  }
}
