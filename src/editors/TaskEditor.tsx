import { ListChecks, ListTree, Plus, Sun, Timer, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../app/clock';
import { setFocusTask } from '../app/focus';
import { navigate } from '../app/router';
import { closeEditor, confirmAction, toast, touchRecent } from '../app/ui';
import { createTask, deleteTask, ideaTitle, updateTask, useHQ } from '../data/store';
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, type Subtask, type Task } from '../data/types';
import { formatDate, isDateKey } from '../lib/dates';
import { newId } from '../lib/util';
import { generateChecklist } from '../organize/rules';
import { TagInput } from '../ui/bits';
import { Button, Check, Field, Input, Select, Textarea } from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { CategoryDatalist, ProjectSelect, sameJson } from './common';

type Draft = Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'category' | 'tags' | 'dueDate' | 'projectId' | 'milestoneId' | 'eventId' | 'subtasks' | 'assignee'> & { myDayToday: boolean };

export function TaskEditor({ id, defaults }: { id?: string; defaults?: Partial<Task> }) {
  const today = useToday();
  const existing = useHQ((s) => (id ? s.tasks.find((t) => t.id === id) : undefined));
  const settings = useHQ((s) => s.settings);
  const initial = useMemo<Draft>(() => {
    const t = existing ?? defaults ?? {};
    return {
      title: t.title ?? '',
      description: t.description ?? '',
      status: t.status ?? settings.defaultTaskStatus,
      priority: t.priority ?? settings.defaultPriority,
      category: t.category ?? '',
      tags: t.tags ?? [],
      dueDate: t.dueDate ?? null,
      projectId: t.projectId ?? null,
      milestoneId: t.milestoneId ?? null,
      eventId: t.eventId ?? null,
      subtasks: t.subtasks ?? [],
      assignee: t.assignee ?? '',
      myDayToday: t.myDay === today,
    };
  }, [id]);
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [newSub, setNewSub] = useState('');
  const [checklistNote, setChecklistNote] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const dirty = !sameJson(d, initial);

  useEffect(() => {
    if (id) touchRecent('task', id);
  }, [id]);

  const project = useHQ((s) => (d.projectId ? s.projects.find((p) => p.id === d.projectId) : undefined));
  const events = useHQ(useShallow((s) => [...s.events].sort((a, b) => b.startDate.localeCompare(a.startDate))));
  const sourceIdea = useHQ((s) => (existing?.source?.kind === 'idea' ? s.ideas.find((x) => x.id === existing.source!.id) : undefined));
  const sourceNote = useHQ((s) => (existing?.source?.kind === 'note' ? s.notes.find((x) => x.id === existing.source!.id) : undefined));
  const source = sourceIdea
    ? { label: `idea “${ideaTitle(sourceIdea)}”`, go: () => navigate('ideas', sourceIdea.id) }
    : sourceNote
      ? { label: `note “${sourceNote.title}”`, go: () => navigate('notes', sourceNote.id) }
      : null;

  if (id && !existing) {
    return (
      <Dialog open onClose={closeEditor} title="Task not found" size="sm" footer={<Button onClick={closeEditor}>Close</Button>}>
        <p className="text-sm text-muted">This task no longer exists. It may have been deleted in another tab.</p>
      </Dialog>
    );
  }

  const save = () => {
    const title = d.title.trim();
    if (!title) return setError('Give the task a title.');
    if (d.dueDate && !isDateKey(d.dueDate)) return setError('The due date is not a valid date.');
    const { myDayToday, ...rest } = d;
    const fields: Partial<Task> = {
      ...rest,
      title,
      subtasks: rest.subtasks.filter((s) => s.title.trim()),
      milestoneId: project?.milestones.some((m) => m.id === rest.milestoneId) ? rest.milestoneId : null,
      myDay: myDayToday ? today : existing?.myDay === today ? null : (existing?.myDay ?? null),
    };
    if (existing) {
      updateTask(existing.id, fields);
      toast('Task saved');
    } else {
      const t = createTask({ ...fields, title });
      touchRecent('task', t.id);
      toast('Task created');
    }
    closeEditor();
  };

  const updateSub = (sid: string, change: Partial<Subtask>) => set('subtasks', d.subtasks.map((s) => (s.id === sid ? { ...s, ...change } : s)));
  const addSub = () => {
    if (!newSub.trim()) return;
    set('subtasks', [...d.subtasks, { id: newId(), title: newSub.trim(), done: false }]);
    setNewSub('');
  };
  const doneSubs = d.subtasks.filter((s) => s.done).length;

  return (
    <Dialog
      open
      onClose={closeEditor}
      dirty={dirty}
      title={existing ? 'Edit task' : 'New task'}
      icon={<ListChecks />}
      size="lg"
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              className="mr-auto text-bad"
              onClick={() =>
                confirmAction({
                  title: 'Delete this task?',
                  body: `“${existing.title}” will be permanently removed. To keep a record, mark it Completed instead.`,
                  confirmLabel: 'Delete task',
                  onConfirm: () => {
                    deleteTask(existing.id);
                    closeEditor();
                    toast('Task deleted');
                  },
                })
              }
            >
              <Trash2 className="size-3.5" aria-hidden="true" /> Delete
            </Button>
          )}
          {existing && (
            <Button
              variant="ghost"
              onClick={() => {
                setFocusTask(existing.id);
                closeEditor();
                navigate('utilities');
              }}
            >
              <Timer className="size-3.5" aria-hidden="true" /> Focus on this
            </Button>
          )}
          <Button onClick={closeEditor}>Cancel</Button>
          <Button variant="primary" type="submit" form="task-form">
            {existing ? 'Save task' : 'Create task'}
          </Button>
        </>
      }
    >
      <form
        id="task-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="grid gap-3 sm:grid-cols-6"
      >
        <Field label="Title" htmlFor="task-title" error={error ?? undefined} className="sm:col-span-6">
          <Input id="task-title" value={d.title} onChange={(e) => set('title', e.target.value)} maxLength={200} autoFocus placeholder="What needs doing?" />
        </Field>
        <Field label="Status" htmlFor="task-status" className="sm:col-span-2">
          <Select id="task-status" value={d.status} onChange={(e) => set('status', e.target.value as Task['status'])}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="task-priority" className="sm:col-span-2">
          <Select id="task-priority" value={d.priority} onChange={(e) => set('priority', e.target.value as Task['priority'])}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="task-due" className="sm:col-span-2">
          <div className="flex gap-1">
            <Input id="task-due" type="date" value={d.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} />
            {d.dueDate && (
              <Button size="icon" variant="ghost" aria-label="Clear due date" onClick={() => set('dueDate', null)}>
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </Field>
        <Field label="Category" htmlFor="task-category" className="sm:col-span-3">
          <Input id="task-category" list="task-category-list" value={d.category} onChange={(e) => set('category', e.target.value)} maxLength={40} placeholder="e.g. School" />
          <CategoryDatalist id="task-category-list" />
        </Field>
        <Field label="Project" htmlFor="task-project" className="sm:col-span-3">
          <ProjectSelect id="task-project" value={d.projectId} onChange={(v) => setD((cur) => ({ ...cur, projectId: v, milestoneId: null }))} />
        </Field>
        {project && project.milestones.length > 0 && (
          <Field label="Milestone" htmlFor="task-milestone" className="sm:col-span-3">
            <Select id="task-milestone" value={d.milestoneId ?? ''} onChange={(e) => set('milestoneId', e.target.value || null)}>
              <option value="">No milestone</option>
              {project.milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Calendar event" htmlFor="task-event" className={project && project.milestones.length > 0 ? 'sm:col-span-3' : 'sm:col-span-6'}>
          <Select id="task-event" value={d.eventId ?? ''} onChange={(e) => set('eventId', e.target.value || null)}>
            <option value="">Not linked to an event</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {formatDate(ev.startDate, { month: 'short', day: 'numeric', year: 'numeric' })} · {ev.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor="task-description" className="sm:col-span-6">
          <Textarea id="task-description" value={d.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Details, links, acceptance criteria…" />
        </Field>

        <fieldset className="flex flex-col gap-1 sm:col-span-6">
          <legend className="mb-1 flex w-full items-center gap-2 font-mono text-2xs tracking-wider text-muted uppercase">
            Subtasks {d.subtasks.length > 0 && <span className="tabular">({doneSubs}/{d.subtasks.length})</span>}
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto normal-case"
              title="Builds a checklist from the title and description using fixed local templates"
              onClick={() => {
                const r = generateChecklist(`${d.title}\n${d.description}`);
                const existingTitles = new Set(d.subtasks.map((s) => s.title.toLowerCase()));
                const added = r.steps.filter((s) => !existingTitles.has(s.toLowerCase()));
                set('subtasks', [...d.subtasks, ...added.map((title) => ({ id: newId(), title, done: false }))]);
                setChecklistNote(`Local template: ${r.template} (${r.reason}). Added ${added.length} steps; edit or remove any.`);
              }}
            >
              <ListTree className="size-3" aria-hidden="true" /> Generate checklist
            </Button>
          </legend>
          {checklistNote && <p className="text-xs text-subtle">{checklistNote}</p>}
          <ul className="flex flex-col gap-1">
            {d.subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <Check checked={s.done} onChange={(v) => updateSub(s.id, { done: v })} label={`Mark “${s.title}” done`} />
                <Input value={s.title} onChange={(e) => updateSub(s.id, { title: e.target.value })} aria-label="Subtask" className={s.done ? 'text-subtle line-through' : ''} />
                <Button size="iconSm" variant="ghost" aria-label={`Remove subtask ${s.title}`} onClick={() => set('subtasks', d.subtasks.filter((x) => x.id !== s.id))}>
                  <X className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-1">
            <Input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSub();
                }
              }}
              placeholder="Add a subtask and press Enter"
              aria-label="New subtask"
            />
            <Button size="icon" onClick={addSub} aria-label="Add subtask">
              <Plus className="size-3.5" />
            </Button>
          </div>
        </fieldset>

        <Field label="Tags" htmlFor="task-tags" className="sm:col-span-4">
          <TagInput id="task-tags" value={d.tags} onChange={(v) => set('tags', v)} />
        </Field>
        <Field label="Assignee" htmlFor="task-assignee" hint="Optional, e.g. Claude Code" className="sm:col-span-2">
          <Input id="task-assignee" value={d.assignee} onChange={(e) => set('assignee', e.target.value)} maxLength={60} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-6">
          <Check checked={d.myDayToday} onChange={(v) => set('myDayToday', v)} label="Add to My Day" />
          <Sun className="size-3.5 text-warn" aria-hidden="true" /> Add to My Day (today only)
        </label>
        {source && (
          <p className="text-xs text-subtle sm:col-span-6">
            Created from{' '}
            <button type="button" className="text-accent hover:underline" onClick={() => (closeEditor(), source.go())}>
              {source.label}
            </button>
          </p>
        )}
        {existing && (
          <p className="font-mono text-2xs text-subtle sm:col-span-6">
            Created {new Date(existing.createdAt).toLocaleString()} · Updated {new Date(existing.updatedAt).toLocaleString()}
            {existing.completedAt && ` · Completed ${new Date(existing.completedAt).toLocaleString()}`}
          </p>
        )}
      </form>
    </Dialog>
  );
}
