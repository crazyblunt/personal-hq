/**
 * Turns validated Claude changes into review rows (before → after, with a
 * checkbox) and applies the ticked ones as one undoable batch. Original
 * content is kept: tags are added, never replaced; summaries go above the
 * note body; converting an idea keeps the idea. Likely duplicates start
 * unticked.
 */
import { recordBatch, type BatchRecord } from '../data/batches';
import { buildLinkIndex, linkItems, refKey, refTitle } from '../data/linking';
import { convertIdea, createTask, updateIdea, updateNote, updateTask, useHQ } from '../data/store';
import { ideaTitle, noteTitle } from '../data/titles';
import type { DateKey, WorkspaceData } from '../data/types';
import { todayKey } from '../lib/dates';
import { uniqueStrings } from '../lib/util';
import { SUMMARY_HEADING, type AiChange } from './validate';

export interface ReviewRow {
  key: string;
  change: AiChange;
  label: string;
  before: string | null;
  after: string;
  reason: string;
  duplicate: boolean;
  checked: boolean;
}

// Read the latest values at apply time: earlier rows in the same batch may have changed them.
const currentIdeaTags = (id: string) => useHQ.getState().ideas.find((i) => i.id === id)?.tags ?? [];
const currentNoteBody = (id: string) => useHQ.getState().notes.find((n) => n.id === id)?.body;

const normTitle = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, '');

/** Same title (ignoring case, spacing, trailing punctuation) as an open task in the same project, or as a task already on today's My Day. */
export function isDuplicateTask(title: string, projectId: string | null, ws: WorkspaceData, today: DateKey): boolean {
  const n = normTitle(title);
  return ws.tasks.some((t) => normTitle(t.title) === n && ((t.status !== 'completed' && t.projectId === projectId) || t.myDay === today));
}

const TO_LABEL = { task: 'Task', note: 'Note', project: 'Project' } as const;

export function buildReviewRows(changes: AiChange[], ws: WorkspaceData, today: DateKey): ReviewRow[] {
  const index = buildLinkIndex(ws);
  const projectName = (id: string | null) => ws.projects.find((p) => p.id === id)?.name ?? '(none)';
  const rows: ReviewRow[] = [];
  /** Normalized title + project of every task proposed so far in this reply. */
  const proposed = new Set<string>();
  changes.forEach((c, i) => {
    const row = (label: string, before: string | null, after: string, reason = '', duplicate = false) => rows.push({ key: `${i}:${c.type}`, change: c, label, before, after, reason, duplicate, checked: !duplicate });
    switch (c.type) {
      case 'add_tags': {
        const idea = ws.ideas.find((x) => x.id === c.ideaId);
        if (!idea) return;
        const merged = uniqueStrings([...idea.tags, ...c.tags]);
        if (merged.length === idea.tags.length) return;
        row(`Tags · ${ideaTitle(idea)}`, idea.tags.join(', ') || '(none)', merged.join(', '), c.reason);
        return;
      }
      case 'set_category': {
        const idea = ws.ideas.find((x) => x.id === c.ideaId);
        if (!idea || idea.category.toLowerCase() === c.category.toLowerCase()) return;
        row(`Category · ${ideaTitle(idea)}`, idea.category || '(none)', c.category, c.reason);
        return;
      }
      case 'set_project': {
        const idea = ws.ideas.find((x) => x.id === c.ideaId);
        if (!idea || idea.projectId === c.projectId) return;
        row(`Project · ${ideaTitle(idea)}`, projectName(idea.projectId), projectName(c.projectId), c.reason);
        return;
      }
      case 'link': {
        const idea = ws.ideas.find((x) => x.id === c.ideaId);
        const target = refTitle(c.target, ws);
        if (!idea || target === null) return;
        if (index.get(refKey({ kind: 'idea', id: idea.id }))?.some((x) => refKey(x.ref) === refKey(c.target))) return;
        row(`Link · ${ideaTitle(idea)}`, null, `↔ ${c.target.kind === 'idea' ? 'Idea' : 'Project'} “${target}”`, c.reason);
        return;
      }
      case 'convert': {
        const idea = ws.ideas.find((x) => x.id === c.ideaId);
        if (!idea) return;
        row(`Convert · ${ideaTitle(idea)}`, null, `→ new ${TO_LABEL[c.to]} (the idea is kept)`, c.reason, idea.converted.some((x) => x.kind === c.to));
        return;
      }
      case 'insert_summary': {
        const note = ws.notes.find((x) => x.id === c.noteId);
        if (!note) return;
        // A summary that's already there would stack; leave the second one unticked.
        row(`Summary · ${noteTitle(note)}`, '(note text stays below, unchanged)', c.text, '', note.body.trimStart().startsWith(SUMMARY_HEADING));
        return;
      }
      case 'create_task': {
        const key = `${c.projectId ?? ''}\u0000${normTitle(c.title)}`;
        const repeat = proposed.has(key);
        proposed.add(key);
        row(c.projectId ? `New task · ${projectName(c.projectId)}` : 'New task', null, c.dueDate ? `${c.title} (due ${c.dueDate})` : c.title, '', repeat || isDuplicateTask(c.title, c.projectId, ws, today));
        return;
      }
      case 'add_to_myday': {
        const task = ws.tasks.find((x) => x.id === c.taskId);
        if (!task || task.myDay === today) return;
        row('Add to My Day', 'Not on My Day', task.title, c.reason);
        return;
      }
    }
  });
  return rows;
}

/** Applies the ticked rows as one batch that can be undone. Returns null when nothing changed. */
export function applyRows(rows: ReviewRow[], label: string, today: DateKey = todayKey()): BatchRecord | null {
  return recordBatch(label, 'claude', () => {
    for (const { change: c, checked } of rows) {
      if (!checked) continue;
      switch (c.type) {
        case 'add_tags':
          updateIdea(c.ideaId, { tags: uniqueStrings([...currentIdeaTags(c.ideaId), ...c.tags]) });
          break;
        case 'set_category':
          updateIdea(c.ideaId, { category: c.category });
          break;
        case 'set_project':
          updateIdea(c.ideaId, { projectId: c.projectId });
          break;
        case 'link':
          linkItems({ kind: 'idea', id: c.ideaId }, c.target);
          break;
        case 'convert':
          convertIdea(c.ideaId, c.to);
          break;
        case 'insert_summary': {
          const body = currentNoteBody(c.noteId);
          if (body !== undefined) updateNote(c.noteId, { body: body ? `${c.text}\n\n---\n\n${body}` : c.text });
          break;
        }
        case 'create_task': {
          const t = createTask({ title: c.title, description: c.description, priority: c.priority, dueDate: c.dueDate, projectId: c.projectId, milestoneId: c.milestoneId, status: 'planned' });
          if (c.sourceNoteId) linkItems({ kind: 'note', id: c.sourceNoteId }, { kind: 'task', id: t.id });
          break;
        }
        case 'add_to_myday':
          updateTask(c.taskId, { myDay: today });
          break;
      }
    }
  });
}
