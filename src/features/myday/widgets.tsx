import { Activity, AlarmClock, CalendarDays, Clock, Command, FolderKanban, FolderPlus, History, Inbox, Lightbulb, Link2, ListChecks, NotebookPen, Plus, ScanSearch, Shuffle, Sun, Timer, Zap, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../../app/clock';
import { navigate } from '../../app/router';
import { openCapture, openCommand, openEditor, openOrganize, toast } from '../../app/ui';
import { addDays, relativeDay } from '../../lib/dates';
import { calendarItems, compareByPriority, isMyDayTask, isOpenTask, overdueItems, projectProgress, tasksCompletedOn, type CalendarItem } from '../../data/selectors';
import { createIdea, createNote, ideaTitle, useHQ } from '../../data/store';
import type { WidgetId } from '../../data/types';
import { relativeTime } from '../../lib/dates';
import { cn } from '../../lib/util';
import { ColorSquare, EmptyState, ProgressBar } from '../../ui/bits';
import { Button } from '../../ui/controls';
import { ActivityChart, ActivityLine, useOpenEntry } from '../activity/parts';
import { QuickAddTask } from '../tasks/QuickAddTask';
import { TaskRow } from '../tasks/TaskRow';
import { ClockTool, CountdownsTool, FocusTool, RandomIdeaTool, ShortcutsTool } from '../utilities/tools';

export interface WidgetDef {
  id: WidgetId;
  title: string;
  icon: LucideIcon;
  description: string;
  render: () => ReactNode;
  /** Action shown in the widget's title strip. */
  tools?: () => ReactNode;
}

function TodayWidget() {
  const today = useToday();
  const tasks = useHQ((s) => s.tasks);
  const { mine, priorities, doneToday } = useMemo(() => {
    const mine = tasks.filter((t) => isMyDayTask(t, today)).sort(compareByPriority);
    const ids = new Set(mine.map((t) => t.id));
    const priorities = tasks.filter((t) => isOpenTask(t) && !ids.has(t.id) && (t.priority === 'urgent' || t.priority === 'high' || t.status === 'in_progress')).sort(compareByPriority).slice(0, 5);
    return { mine, priorities, doneToday: tasksCompletedOn(tasks, today) };
  }, [tasks, today]);
  const [showDone, setShowDone] = useState(false);
  return (
    <div className="flex flex-col">
      <div className="border-b border-line bg-bar p-1.5">
        <QuickAddTask id="myday-quick-add" defaults={{ myDay: today }} placeholder="Add a task for today… (!high #school)" />
      </div>
      {mine.length === 0 ? (
        <EmptyState icon={Sun} title="Nothing scheduled for today">
          Tasks due today, overdue tasks, and tasks you add with the sun button land here.
        </EmptyState>
      ) : (
        <ul>
          {mine.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      )}
      {priorities.length > 0 && (
        <>
          <h3 className="border-y border-line bg-desk/40 px-2 py-0.5 font-mono text-2xs font-semibold tracking-wider text-muted uppercase">Priorities & in progress</h3>
          <ul>
            {priorities.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </>
      )}
      {doneToday.length > 0 && (
        <div className="border-t border-line">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="w-full px-2 py-1 text-left font-mono text-2xs tracking-wider text-ok uppercase hover:bg-bar" aria-expanded={showDone}>
            {showDone ? '▾' : '▸'} {doneToday.length} completed today
          </button>
          {showDone && (
            <ul>
              {doneToday.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function openCalendarItem(i: CalendarItem) {
  if (i.kind === 'task') openEditor({ kind: 'task', id: i.id });
  else if (i.kind === 'event') openEditor({ kind: 'event', id: i.id });
  else navigate('projects', i.id);
}

const KIND_ICON: Record<CalendarItem['kind'], LucideIcon> = { event: CalendarDays, task: ListChecks, project: FolderKanban, milestone: Zap };

export function CalendarItemRow({ item, today }: { item: CalendarItem; today: string }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" onClick={() => openCalendarItem(item)} className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-bar">
        <span className={cn('w-20 shrink-0 font-mono text-2xs tabular', item.overdue ? 'text-bad' : item.date === today ? 'text-warn' : 'text-muted')}>
          {item.overdue ? 'OVERDUE' : relativeDay(item.date, today).toUpperCase()}
          {item.time && ` ${item.time}`}
        </span>
        <Icon className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
        <span className={cn('min-w-0 flex-1 truncate', item.done && 'text-subtle line-through')}>{item.title}</span>
      </button>
    </li>
  );
}

function DeadlinesWidget() {
  const today = useToday();
  const data = useHQ(useShallow((s) => ({ tasks: s.tasks, events: s.events, projects: s.projects })));
  const items = useMemo(() => {
    const overdue = overdueItems(data, today).slice(0, 5);
    const upcoming = calendarItems(data, today, addDays(today, 14), today).filter((i) => !i.done);
    return [...overdue, ...upcoming].slice(0, 12);
  }, [data, today]);
  if (!items.length)
    return (
      <EmptyState icon={CalendarDays} title="No deadlines in the next two weeks" action={<Button size="sm" onClick={() => openEditor({ kind: 'event' })}>New event</Button>}>
        Due dates, events, milestones, and project targets appear here.
      </EmptyState>
    );
  return (
    <ul>
      {items.map((i) => (
        <CalendarItemRow key={i.key} item={i} today={today} />
      ))}
    </ul>
  );
}

function QuickActionsWidget() {
  const actions: { label: string; icon: LucideIcon; run: () => void }[] = [
    { label: 'New task', icon: ListChecks, run: () => openEditor({ kind: 'task' }) },
    { label: 'Capture idea', icon: Lightbulb, run: () => openCapture('idea') },
    { label: 'New note', icon: NotebookPen, run: () => navigate('notes', createNote().id) },
    { label: 'New project', icon: FolderPlus, run: () => openEditor({ kind: 'project' }) },
    { label: 'New event', icon: CalendarDays, run: () => openEditor({ kind: 'event' }) },
    { label: 'Command bar', icon: Command, run: openCommand },
    { label: 'Review inbox', icon: Inbox, run: () => navigate('inbox') },
    { label: 'Organize', icon: ScanSearch, run: openOrganize },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 p-1.5">
      {actions.map((a) => (
        <Button key={a.label} onClick={a.run} className="justify-start">
          <a.icon className="size-3.5 text-accent" aria-hidden="true" />
          {a.label}
        </Button>
      ))}
    </div>
  );
}

function ProjectsWidget() {
  const today = useToday();
  const { projects, tasks, bugs, activity } = useHQ(useShallow((s) => ({ projects: s.projects, tasks: s.tasks, bugs: s.bugs, activity: s.activity })));
  const active = projects.filter((p) => p.status === 'active');
  if (!active.length)
    return (
      <EmptyState icon={FolderKanban} title="No active projects" action={<Button size="sm" onClick={() => openEditor({ kind: 'project' })}>New project</Button>}>
        Coding projects, assignments, business ideas, and goals live here.
      </EmptyState>
    );
  return (
    <ul>
      {active.slice(0, 8).map((p) => {
        const pr = projectProgress(p.id, tasks, bugs, activity, today);
        return (
          <li key={p.id} className="border-b border-line last:border-b-0">
            <button type="button" onClick={() => navigate('projects', p.id)} className="flex w-full flex-col gap-1 px-2 py-1.5 text-left hover:bg-bar">
              <span className="flex w-full items-center gap-1.5 text-sm">
                <ColorSquare color={p.color} />
                <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
                <span className="font-mono text-2xs text-subtle tabular">{pr.total ? `${pr.completed}/${pr.total}` : 'no tasks'}</span>
              </span>
              {pr.total > 0 && <ProgressBar value={pr.percent} label={`${p.name} progress`} />}
              <span className="flex gap-2 font-mono text-2xs text-subtle">
                {pr.overdue > 0 && <span className="text-bad">{pr.overdue} overdue</span>}
                {pr.openBugs > 0 && <span className="text-orange">{pr.openBugs} open bugs</span>}
                {pr.lastActivityAt && <span>active {relativeTime(pr.lastActivityAt)}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CapturesWidget() {
  const [text, setText] = useState('');
  const { ideas, notes } = useHQ(useShallow((s) => ({ ideas: s.ideas, notes: s.notes })));
  const items = useMemo(
    () =>
      [
        ...ideas.filter((i) => !i.archived).map((i) => ({ kind: 'idea' as const, id: i.id, title: ideaTitle(i), at: i.createdAt, inbox: i.inbox })),
        ...notes.map((n) => ({ kind: 'note' as const, id: n.id, title: n.title, at: n.updatedAt, inbox: false })),
      ]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 8),
    [ideas, notes],
  );
  return (
    <div className="flex flex-col">
      <form
        className="border-b border-line bg-bar p-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          createIdea({ body: text });
          setText('');
          toast('Captured to Inbox');
        }}
      >
        <div className="flex h-7 items-center gap-1.5 bevel-in bg-inset px-2">
          <Lightbulb className="size-3.5 shrink-0 text-warn" aria-hidden="true" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Capture an idea and press Enter" aria-label="Capture an idea" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle" />
        </div>
      </form>
      {items.length === 0 ? (
        <EmptyState icon={Lightbulb} title="Nothing captured yet">
          Ideas and notes you write show up here, newest first.
        </EmptyState>
      ) : (
        <ul>
          {items.map((i) => (
            <li key={`${i.kind}:${i.id}`} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => (i.kind === 'idea' ? openEditor({ kind: 'idea', id: i.id }) : navigate('notes', i.id))}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-bar"
              >
                {i.kind === 'idea' ? <Lightbulb className="size-3.5 shrink-0 text-subtle" aria-hidden="true" /> : <NotebookPen className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                {i.inbox && <span className="font-mono text-2xs text-purple">INBOX</span>}
                <span className="font-mono text-2xs text-subtle">{relativeTime(i.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityGraphWidget() {
  const today = useToday();
  const activity = useHQ((s) => s.activity);
  if (!activity.length)
    return (
      <EmptyState icon={Activity} title="No activity recorded yet">
        The graph fills in as you create and complete things. Nothing here is estimated.
      </EmptyState>
    );
  return (
    <div className="p-2">
      <ActivityChart activity={activity} days={30} today={today} />
    </div>
  );
}

function RecentActivityWidget() {
  const activity = useHQ((s) => s.activity);
  const open = useOpenEntry();
  const latest = activity.slice(-8).reverse();
  if (!latest.length)
    return (
      <EmptyState icon={History} title="No activity yet">
        Each change you make is recorded here.
      </EmptyState>
    );
  return (
    <ul>
      {latest.map((e) => (
        <ActivityLine key={e.id} entry={e} onOpen={open} />
      ))}
    </ul>
  );
}

export const WIDGETS: Record<WidgetId, WidgetDef> = {
  today: { id: 'today', title: 'Today', icon: Sun, description: 'Tasks for today, priorities, and what you finished', render: () => <TodayWidget /> },
  deadlines: { id: 'deadlines', title: 'Deadlines & events', icon: AlarmClock, description: 'Overdue items and the next 14 days', render: () => <DeadlinesWidget />, tools: () => <WidgetLink onClick={() => navigate('calendar')}>Calendar</WidgetLink> },
  'quick-actions': { id: 'quick-actions', title: 'Quick actions', icon: Plus, description: 'Create anything in one click', render: () => <QuickActionsWidget /> },
  projects: { id: 'projects', title: 'Active projects', icon: FolderKanban, description: 'Progress from each project’s tasks', render: () => <ProjectsWidget />, tools: () => <WidgetLink onClick={() => navigate('projects')}>All</WidgetLink> },
  captures: { id: 'captures', title: 'Recent captures', icon: Lightbulb, description: 'Capture box and the latest ideas and notes', render: () => <CapturesWidget />, tools: () => <WidgetLink onClick={() => navigate('inbox')}>Inbox</WidgetLink> },
  'activity-graph': { id: 'activity-graph', title: 'Activity · 30 days', icon: Activity, description: 'Recorded actions per day', render: () => <ActivityGraphWidget />, tools: () => <WidgetLink onClick={() => navigate('activity')}>Details</WidgetLink> },
  'recent-activity': { id: 'recent-activity', title: 'Recent activity', icon: History, description: 'The latest changes you made', render: () => <RecentActivityWidget /> },
  clock: { id: 'clock', title: 'Clock', icon: Clock, description: 'Time, date, week number', render: () => <div className="p-2"><ClockTool /></div> },
  countdowns: { id: 'countdowns', title: 'Countdowns', icon: AlarmClock, description: 'Time left until dates you care about', render: () => <div className="p-2"><CountdownsTool compact /></div>, tools: () => <WidgetLink onClick={() => navigate('utilities')}>Edit</WidgetLink> },
  focus: { id: 'focus', title: 'Focus timer', icon: Timer, description: 'Work and break timer', render: () => <div className="p-2"><FocusTool compact /></div> },
  shortcuts: { id: 'shortcuts', title: 'Shortcuts', icon: Link2, description: 'Your frequently used sites and tools', render: () => <div className="p-2"><ShortcutsTool /></div>, tools: () => <WidgetLink onClick={() => navigate('utilities')}>Edit</WidgetLink> },
  'random-idea': { id: 'random-idea', title: 'Random idea', icon: Shuffle, description: 'Resurface something you captured', render: () => <div className="p-2"><RandomIdeaTool /></div> },
};

function WidgetLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="font-mono text-2xs text-accent uppercase hover:underline">
      {children} ›
    </button>
  );
}
