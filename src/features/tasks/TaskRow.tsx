import { ChevronLeft, ChevronRight, ListTree, Sun } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { useToday } from '../../app/clock';
import { openEditor } from '../../app/ui';
import { moveTask, toggleMyDay, toggleTaskDone, useHQ } from '../../data/store';
import { TASK_STATUSES, TASK_STATUS_LABEL, type Task, type TaskStatus } from '../../data/types';
import { cn } from '../../lib/util';
import { Badge, DueChip, PriorityBadge, ProjectChip } from '../../ui/bits';
import { Check } from '../../ui/controls';

const STATUS_STYLE: Record<TaskStatus, string> = {
  inbox: 'border-purple-fill text-purple',
  planned: 'border-line-strong text-muted',
  in_progress: 'border-warn-fill text-warn',
  waiting: 'border-info-fill text-info',
  completed: 'border-ok-fill text-ok',
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge className={STATUS_STYLE[status]}>{TASK_STATUS_LABEL[status]}</Badge>;
}

/** One task in a list: checkbox, title, compact metadata, due date, My Day toggle. */
export function TaskRow({ task, showProject = true, showStatus = true }: { task: Task; showProject?: boolean; showStatus?: boolean }) {
  const today = useToday();
  const done = task.status === 'completed';
  const subsDone = task.subtasks.filter((s) => s.done).length;
  const onMyDay = task.myDay === today;
  const event = useHQ((s) => (task.eventId ? s.events.find((e) => e.id === task.eventId) : undefined));
  return (
    <li className="group flex items-start gap-2 border-b border-line px-2 py-1.5 last:border-b-0 hover:bg-bar/50">
      <Check checked={done} onChange={() => toggleTaskDone(task.id)} label={done ? `Reopen “${task.title}”` : `Complete “${task.title}”`} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => openEditor({ kind: 'task', id: task.id })} className={cn('block w-full truncate text-left text-sm hover:underline', done && 'text-subtle line-through')}>
          {task.title}
        </button>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 empty:hidden">
          {showStatus && task.status !== 'planned' && !done && <StatusBadge status={task.status} />}
          {!done && <PriorityBadge priority={task.priority} hideMedium />}
          {showProject && <ProjectChip projectId={task.projectId} />}
          {task.category && <span className="text-xs text-subtle">{task.category}</span>}
          {task.subtasks.length > 0 && (
            <span className="inline-flex items-center gap-0.5 font-mono text-2xs text-subtle tabular" title="Subtasks done">
              <ListTree className="size-3" aria-hidden="true" />
              {subsDone}/{task.subtasks.length}
            </span>
          )}
          {event && <span className="truncate text-xs text-info" title="Linked calendar event">@ {event.title}</span>}
          {task.tags.slice(0, 3).map((t) => (
            <span key={t} className="font-mono text-2xs text-subtle">
              #{t}
            </span>
          ))}
        </div>
      </div>
      {task.dueDate && <DueChip date={task.dueDate} today={today} done={done} />}
      {!done && (
        <button
          type="button"
          onClick={() => toggleMyDay(task.id, today)}
          aria-pressed={onMyDay}
          aria-label={onMyDay ? 'Remove from My Day' : 'Add to My Day'}
          title={onMyDay ? 'Remove from My Day' : 'Add to My Day'}
          className={cn('grid size-5 shrink-0 place-items-center', onMyDay ? 'text-warn' : 'text-subtle opacity-60 group-hover:opacity-100 hover:text-warn focus-visible:opacity-100')}
        >
          <Sun className={cn('size-3.5', onMyDay && 'fill-current')} />
        </button>
      )}
    </li>
  );
}

const COLUMN_STYLE: Record<TaskStatus, string> = {
  inbox: 'bg-purple-fill',
  planned: 'bg-line-strong',
  in_progress: 'bg-warn-fill',
  waiting: 'bg-info-fill',
  completed: 'bg-ok-fill',
};

/** Kanban board. Drag cards between columns, or use the arrow buttons (works on touch screens). */
export function TaskBoard({ tasks, showProject = true }: { tasks: Task[]; showProject?: boolean }) {
  const today = useToday();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const drop = (e: DragEvent, status: TaskStatus, beforeId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData('text/x-task') || dragId;
    if (id) moveTask(id, status, beforeId);
    setDragId(null);
    setOver(null);
  };

  return (
    <div className="grid gap-2 overflow-x-auto pb-1 [grid-template-columns:repeat(5,minmax(13rem,1fr))]">
      {TASK_STATUSES.map((status, col) => {
        const items = tasks.filter((t) => t.status === status).sort((a, b) => a.order - b.order);
        return (
          <section
            key={status}
            aria-label={TASK_STATUS_LABEL[status]}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(`col:${status}`);
            }}
            onDrop={(e) => drop(e, status, null)}
            className={cn('flex min-h-40 flex-col border border-line bg-panel', over === `col:${status}` && 'outline outline-1 outline-dotted outline-accent')}
          >
            <header className="flex h-7 items-center gap-2 border-b border-line bg-bar px-2">
              <span className={cn('size-2', COLUMN_STYLE[status])} aria-hidden="true" />
              <h3 className="flex-1 font-mono text-2xs font-semibold tracking-wider text-muted uppercase">{TASK_STATUS_LABEL[status]}</h3>
              <span className="font-mono text-2xs text-subtle tabular">{items.length}</span>
            </header>
            <ol className="flex flex-1 flex-col gap-1 p-1">
              {items.map((t) => (
                <li
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/x-task', t.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragId(t.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOver(t.id);
                  }}
                  onDrop={(e) => drop(e, status, t.id)}
                  className={cn('bevel-out bg-raised p-1.5 text-sm', dragId === t.id && 'opacity-50', over === t.id && dragId !== t.id && 'border-t-2 border-t-accent')}
                >
                  <button type="button" onClick={() => openEditor({ kind: 'task', id: t.id })} className={cn('block w-full text-left break-words hover:underline', status === 'completed' && 'text-subtle line-through')}>
                    {t.title}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <PriorityBadge priority={t.priority} hideMedium />
                    {showProject && <ProjectChip projectId={t.projectId} />}
                    {t.dueDate && <DueChip date={t.dueDate} today={today} done={status === 'completed'} />}
                    <span className="ml-auto flex">
                      <button
                        type="button"
                        disabled={col === 0}
                        onClick={() => moveTask(t.id, TASK_STATUSES[col - 1])}
                        aria-label={`Move to ${col > 0 ? TASK_STATUS_LABEL[TASK_STATUSES[col - 1]] : ''}`}
                        className="grid size-4 place-items-center text-subtle hover:text-fg disabled:opacity-30"
                      >
                        <ChevronLeft className="size-3" />
                      </button>
                      <button
                        type="button"
                        disabled={col === TASK_STATUSES.length - 1}
                        onClick={() => moveTask(t.id, TASK_STATUSES[col + 1])}
                        aria-label={`Move to ${col < TASK_STATUSES.length - 1 ? TASK_STATUS_LABEL[TASK_STATUSES[col + 1]] : ''}`}
                        className="grid size-4 place-items-center text-subtle hover:text-fg disabled:opacity-30"
                      >
                        <ChevronRight className="size-3" />
                      </button>
                    </span>
                  </div>
                </li>
              ))}
              {items.length === 0 && <li className="flex flex-1 items-center justify-center p-3 text-center text-xs text-subtle">Drop tasks here</li>}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
