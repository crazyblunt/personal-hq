import { Columns3, List, ListChecks, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../../app/clock';
import { readDevice, writeDevice } from '../../app/deviceStorage';
import { navigate, useRoute } from '../../app/router';
import { openEditor, useUI } from '../../app/ui';
import { compareByPriority, compareTasks, isOpenTask, tasksForView, type TaskView } from '../../data/selectors';
import { useHQ } from '../../data/store';
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, type Task } from '../../data/types';
import { formatDate, relativeDay, toDateKey } from '../../lib/dates';
import { matchesQuery } from '../../lib/search';
import { uniqueStrings } from '../../lib/util';
import { EmptyState, PageHeader, SearchBox, Segmented } from '../../ui/bits';
import { Button, Select } from '../../ui/controls';
import { QuickAddTask } from './QuickAddTask';
import { TaskBoard, TaskRow } from './TaskRow';

type Sort = 'due' | 'priority' | 'created' | 'title';
interface TaskUI {
  view: TaskView;
  mode: 'list' | 'board';
  projectId: string;
  priority: string;
  category: string;
  status: string;
  sort: Sort;
}

const DEFAULT_UI: TaskUI = { view: 'all', mode: 'list', projectId: '', priority: '', category: '', status: '', sort: 'due' };

const SORTERS: Record<Sort, (a: Task, b: Task) => number> = {
  due: compareTasks,
  priority: compareByPriority,
  created: (a, b) => b.createdAt.localeCompare(a.createdAt),
  title: (a, b) => a.title.localeCompare(b.title),
};

export function TasksPage() {
  const today = useToday();
  const route = useRoute();
  const tasks = useHQ((s) => s.tasks);
  const projects = useHQ(useShallow((s) => s.projects.filter((p) => p.status !== 'archived')));
  const [ui, setUi] = useState<TaskUI>(() => ({ ...DEFAULT_UI, ...readDevice<Partial<TaskUI>>('tasks-ui', {}) }));
  const [query, setQuery] = useState('');
  const patch = (p: Partial<TaskUI>) =>
    setUi((cur) => {
      const next = { ...cur, ...p };
      writeDevice('tasks-ui', next);
      return next;
    });

  const viewRequest = useUI((s) => s.taskViewRequest);
  useEffect(() => {
    if (viewRequest) {
      patch({ view: viewRequest, mode: 'list' });
      useUI.setState({ taskViewRequest: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest]);

  // `#tasks.<id>` opens that task.
  useEffect(() => {
    if (route.id) {
      openEditor({ kind: 'task', id: route.id });
      navigate('tasks', null, { replace: true });
    }
  }, [route.id]);

  const categories = useMemo(() => uniqueStrings(tasks.map((t) => t.category).filter(Boolean)).sort(), [tasks]);
  const counts = useMemo(
    () => ({
      myday: tasksForView(tasks, 'myday', today).length,
      upcoming: tasksForView(tasks, 'upcoming', today).length,
      overdue: tasksForView(tasks, 'overdue', today).length,
      all: tasks.filter(isOpenTask).length,
      completed: tasks.length - tasks.filter(isOpenTask).length,
    }),
    [tasks, today],
  );

  const filtersOn = Boolean(ui.projectId || ui.priority || ui.category || ui.status || query);
  const applyFilters = (list: Task[]) =>
    list.filter(
      (t) =>
        (!ui.projectId || (ui.projectId === 'none' ? !t.projectId : t.projectId === ui.projectId)) &&
        (!ui.priority || t.priority === ui.priority) &&
        (!ui.category || t.category === ui.category) &&
        (!ui.status || t.status === ui.status) &&
        matchesQuery(query, t.title, t.description, t.category, t.tags, t.subtasks.map((s) => s.title)),
    );

  const listed = useMemo(() => {
    const base = ui.view === 'all' && ui.status === 'completed' ? tasks.filter((t) => t.status === 'completed') : tasksForView(tasks, ui.view, today);
    const filtered = applyFilters(base);
    return ui.view === 'completed' || ui.view === 'myday' ? filtered : [...filtered].sort(SORTERS[ui.sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, ui, query, today]);

  const boardTasks = useMemo(() => applyFilters(tasks), [tasks, ui, query]); // eslint-disable-line

  const groups = useMemo(() => {
    if (ui.view === 'upcoming' && ui.sort === 'due') return groupBy(listed, (t) => t.dueDate ?? '', (k) => `${relativeDay(k, today)} · ${formatDate(k)}`);
    if (ui.view === 'completed') return groupBy(listed, (t) => (t.completedAt ? toDateKey(new Date(t.completedAt)) : ''), (k) => (k ? `${relativeDay(k, today)} · ${formatDate(k)}` : 'Unknown day'));
    return [{ key: 'all', label: '', items: listed }];
  }, [listed, ui.view, ui.sort, today]);

  const quickDefaults: Partial<Task> = {
    ...(ui.view === 'myday' ? { myDay: today } : {}),
    ...(ui.projectId && ui.projectId !== 'none' ? { projectId: ui.projectId } : {}),
    ...(ui.category ? { category: ui.category } : {}),
    ...(ui.status && ui.status !== 'completed' ? { status: ui.status as Task['status'] } : {}),
  };

  return (
    <>
      <PageHeader
        title="Tasks"
        icon={ListChecks}
        description={`${counts.all} open · ${counts.overdue} overdue · ${counts.completed} completed`}
        actions={
          <>
            <Segmented
              label="Layout"
              value={ui.mode}
              onChange={(mode) => patch({ mode })}
              options={[
                { value: 'list', label: <List className="size-3.5" aria-label="List" />, title: 'List' },
                { value: 'board', label: <Columns3 className="size-3.5" aria-label="Board" />, title: 'Board' },
              ]}
            />
            <Button variant="primary" onClick={() => openEditor({ kind: 'task', defaults: quickDefaults })}>
              <Plus className="size-3.5" aria-hidden="true" /> New task
            </Button>
          </>
        }
      />

      {ui.mode === 'list' && (
        <Segmented
          className="mb-2"
          label="Task view"
          value={ui.view}
          onChange={(view) => patch({ view })}
          options={[
            { value: 'myday', label: 'My Day', count: counts.myday },
            { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
            { value: 'overdue', label: 'Overdue', count: counts.overdue },
            { value: 'all', label: 'All open', count: counts.all },
            { value: 'completed', label: 'Completed', count: counts.completed },
          ]}
        />
      )}

      <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center">
        <SearchBox id="task-search" value={query} onChange={setQuery} placeholder="Search tasks" className="col-span-2 sm:col-span-3 lg:w-56" />
        <Select value={ui.projectId} onChange={(e) => patch({ projectId: e.target.value })} aria-label="Filter by project" className="lg:w-40">
          <option value="">All projects</option>
          <option value="none">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={ui.priority} onChange={(e) => patch({ priority: e.target.value })} aria-label="Filter by priority" className="lg:w-32">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
        <Select value={ui.category} onChange={(e) => patch({ category: e.target.value })} aria-label="Filter by category" className="lg:w-36">
          <option value="">Any category</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        {ui.mode === 'list' && (
          <Select value={ui.status} onChange={(e) => patch({ status: e.target.value })} aria-label="Filter by status" className="lg:w-32">
            <option value="">Any status</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        )}
        {ui.mode === 'list' && ui.view !== 'completed' && ui.view !== 'myday' && (
          <Select value={ui.sort} onChange={(e) => patch({ sort: e.target.value as Sort })} aria-label="Sort tasks" className="lg:w-36">
            <option value="due">Sort: due date</option>
            <option value="priority">Sort: priority</option>
            <option value="created">Sort: newest</option>
            <option value="title">Sort: title</option>
          </Select>
        )}
        {filtersOn && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery('');
              patch({ projectId: '', priority: '', category: '', status: '' });
            }}
          >
            <X className="size-3.5" aria-hidden="true" /> Clear filters
          </Button>
        )}
      </div>

      {ui.mode === 'board' ? (
        <TaskBoard tasks={boardTasks} />
      ) : (
        <section aria-label="Task list" className="border border-line bg-panel">
          {ui.view !== 'completed' && (
            <div className="border-b border-line bg-bar p-1.5">
              <QuickAddTask defaults={quickDefaults} placeholder={ui.view === 'myday' ? 'Add a task for today… (!high #school)' : undefined} />
            </div>
          )}
          {listed.length === 0 ? (
            <EmptyState icon={ListChecks} title={filtersOn ? 'No tasks match these filters' : EMPTY[ui.view].title}>
              {filtersOn ? 'Try clearing a filter or searching for something else.' : EMPTY[ui.view].body}
            </EmptyState>
          ) : (
            groups.map((g) => (
              <div key={g.key}>
                {g.label && <h3 className="border-b border-line bg-desk/40 px-2 py-0.5 font-mono text-2xs font-semibold tracking-wider text-muted uppercase">{g.label}</h3>}
                <ul>
                  {g.items.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}
    </>
  );
}

const EMPTY: Record<TaskView, { title: string; body: string }> = {
  myday: { title: 'Nothing planned for today', body: 'Tasks due today, overdue tasks, and tasks you add to My Day (the sun button) show up here.' },
  upcoming: { title: 'No upcoming deadlines', body: 'Open tasks with a future due date show up here, grouped by day.' },
  overdue: { title: 'Nothing overdue', body: 'Open tasks past their due date show up here.' },
  all: { title: 'No open tasks', body: 'Type a task above and press Enter. Only the title is required.' },
  completed: { title: 'No completed tasks yet', body: 'Tick a task’s checkbox to complete it. It stays here with the day you finished it.' },
};

function groupBy<T>(items: T[], keyOf: (t: T) => string, labelOf: (k: string) => string) {
  const out: { key: string; label: string; items: T[] }[] = [];
  const index = new Map<string, number>();
  for (const it of items) {
    const k = keyOf(it);
    let i = index.get(k);
    if (i === undefined) {
      i = out.length;
      index.set(k, i);
      out.push({ key: k || 'none', label: labelOf(k), items: [] });
    }
    out[i].items.push(it);
  }
  return out;
}
