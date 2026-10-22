import { activitySeries, calendarItems, isMyDayTask, overdueItems, projectProgress, tasksForView } from './selectors';
import type { ActivityEntry, CalendarEvent, Project, Task } from './types';

const today = '2026-10-21';

function task(p: Partial<Task> & { id: string }): Task {
  return {
    title: p.id,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    description: '',
    status: 'planned',
    priority: 'medium',
    category: '',
    tags: [],
    dueDate: null,
    projectId: null,
    eventId: null,
    milestoneId: null,
    myDay: null,
    subtasks: [],
    assignee: '',
    order: 0,
    completedAt: null,
    source: null,
    ...p,
  };
}

const tasks = [
  task({ id: 'due-today', dueDate: today }),
  task({ id: 'overdue', dueDate: '2026-10-19', priority: 'urgent' }),
  task({ id: 'pinned', myDay: today }),
  task({ id: 'pinned-yesterday', myDay: '2026-10-20' }),
  task({ id: 'later', dueDate: '2026-10-25' }),
  task({ id: 'done', status: 'completed', dueDate: '2026-10-18', completedAt: '2026-10-20T10:00:00.000Z' }),
];

describe('task views', () => {
  it('My Day holds today’s, overdue, and pinned-for-today open tasks', () => {
    expect(tasks.filter((t) => isMyDayTask(t, today)).map((t) => t.id).sort()).toEqual(['due-today', 'overdue', 'pinned']);
    expect(tasksForView(tasks, 'myday', today)[0].id).toBe('overdue');
  });

  it('separates upcoming, overdue, open, and completed', () => {
    expect(tasksForView(tasks, 'upcoming', today).map((t) => t.id)).toEqual(['later']);
    expect(tasksForView(tasks, 'overdue', today).map((t) => t.id)).toEqual(['overdue']);
    expect(tasksForView(tasks, 'all', today)).toHaveLength(5);
    expect(tasksForView(tasks, 'completed', today).map((t) => t.id)).toEqual(['done']);
  });
});

describe('projectProgress', () => {
  it('is computed only from the project’s real tasks', () => {
    const list = [task({ id: 'a', projectId: 'p', status: 'completed' }), task({ id: 'b', projectId: 'p' }), task({ id: 'c', projectId: 'p', dueDate: '2026-10-01' }), task({ id: 'x', projectId: 'other' })];
    const pr = projectProgress('p', list, [], [], today);
    expect(pr).toMatchObject({ total: 3, completed: 1, open: 2, percent: 33, overdue: 1 });
    expect(projectProgress('empty', list, [], [], today)).toMatchObject({ total: 0, percent: 0, lastActivityAt: null });
  });
});

describe('calendarItems', () => {
  const ev = (p: Partial<CalendarEvent> & { id: string; startDate: string }): CalendarEvent => ({
    title: p.id,
    createdAt: '',
    updatedAt: '',
    description: '',
    startTime: null,
    endDate: null,
    endTime: null,
    allDay: true,
    projectId: null,
    ...p,
  });
  const project: Project = {
    id: 'p',
    name: 'Thesis',
    createdAt: '',
    updatedAt: '',
    description: '',
    category: 'school',
    status: 'active',
    color: 'blue',
    targetDate: '2026-10-30',
    techStack: [],
    repoUrl: '',
    links: [],
    milestones: [{ id: 'm', title: 'Draft', dueDate: '2026-10-15', done: false }],
    archivedFromStatus: null,
  };

  it('spreads multi-day events, adds task deadlines, targets, and milestones', () => {
    const items = calendarItems({ tasks, events: [ev({ id: 'trip', startDate: '2026-10-22', endDate: '2026-10-24' }), ev({ id: 'call', startDate: '2026-10-22', startTime: '09:30', allDay: false })], projects: [project] }, '2026-10-20', '2026-10-31', today);
    expect(items.filter((i) => i.id === 'trip').map((i) => i.date)).toEqual(['2026-10-22', '2026-10-23', '2026-10-24']);
    expect(items.find((i) => i.id === 'call')!.time).toBe('09:30');
    expect(items.find((i) => i.kind === 'project')).toMatchObject({ date: '2026-10-30', overdue: false });
    expect(items.some((i) => i.kind === 'milestone')).toBe(false);
  });

  it('lists missed milestones and overdue tasks', () => {
    const overdue = overdueItems({ tasks, projects: [project] }, today);
    expect(overdue.map((i) => i.kind).sort()).toEqual(['milestone', 'task']);
  });
});

describe('activitySeries', () => {
  it('counts recorded actions per local day', () => {
    const at = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).toISOString();
    const log: ActivityEntry[] = [
      { id: '1', at: at('2026-10-21'), action: 'created', entity: 'task', entityId: 'a', title: '', projectId: null, detail: '' },
      { id: '2', at: at('2026-10-21', 15), action: 'completed', entity: 'task', entityId: 'a', title: '', projectId: null, detail: '' },
      { id: '3', at: at('2026-10-19'), action: 'updated', entity: 'note', entityId: 'n', title: '', projectId: null, detail: '' },
      { id: '4', at: at('2026-09-01'), action: 'created', entity: 'task', entityId: 'b', title: '', projectId: null, detail: '' },
    ];
    const s = activitySeries(log, 7, today);
    expect(s).toHaveLength(7);
    expect(s.at(-1)).toMatchObject({ date: today, created: 1, completed: 1, total: 2 });
    expect(s.find((d) => d.date === '2026-10-19')).toMatchObject({ other: 1 });
    expect(s.reduce((n, d) => n + d.total, 0)).toBe(3);
  });
});
