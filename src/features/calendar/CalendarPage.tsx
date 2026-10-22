import { CalendarDays, ChevronLeft, ChevronRight, FolderKanban, Plus, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../../app/clock';
import { readDevice, writeDevice } from '../../app/deviceStorage';
import { navigate, useRoute } from '../../app/router';
import { openEditor } from '../../app/ui';
import { calendarItems, overdueItems, type CalendarItem } from '../../data/selectors';
import { toggleTaskDone, useHQ } from '../../data/store';
import { addDays, addMonths, formatDate, formatMonth, formatTime, isDateKey, monthGrid, relativeDay, weekDays, weekdayNames } from '../../lib/dates';
import { cn } from '../../lib/util';
import { EmptyState, PageHeader, Segmented } from '../../ui/bits';
import { Button, Check, Input } from '../../ui/controls';

type View = 'month' | 'week' | 'agenda';

function openItem(i: CalendarItem) {
  if (i.kind === 'task') openEditor({ kind: 'task', id: i.id });
  else if (i.kind === 'event') openEditor({ kind: 'event', id: i.id });
  else navigate('projects', i.id);
}

const KIND_STYLE: Record<CalendarItem['kind'], string> = {
  event: 'border-l-info text-fg',
  task: 'border-l-accent text-fg',
  milestone: 'border-l-purple text-fg',
  project: 'border-l-warn text-fg',
};

function ItemChip({ item, clock24h, full = false }: { item: CalendarItem; clock24h: boolean; full?: boolean }) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1 border-l-2 bg-inset/70 px-1 text-left text-xs',
        KIND_STYLE[item.kind],
        item.overdue && 'border-l-bad text-bad',
        item.done && 'text-subtle line-through',
        full ? 'py-1' : 'h-[1.1rem]',
      )}
    >
      {item.kind === 'task' && <Check checked={item.done} onChange={() => toggleTaskDone(item.id)} label={item.done ? `Reopen ${item.title}` : `Complete ${item.title}`} className="size-3 [&_svg]:size-2" />}
      {item.kind === 'milestone' && <Zap className="size-2.5 shrink-0 text-purple" aria-hidden="true" />}
      {item.kind === 'project' && <FolderKanban className="size-2.5 shrink-0 text-warn" aria-hidden="true" />}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openItem(item);
        }}
        className="min-w-0 flex-1 truncate text-left hover:underline"
        title={item.title}
      >
        {item.time && <span className="mr-1 font-mono text-2xs text-info">{formatTime(item.time, clock24h)}</span>}
        {item.title}
        {item.span && full && <span className="ml-1 font-mono text-2xs text-subtle">({formatDate(item.span.start, { month: 'short', day: 'numeric' })}–{formatDate(item.span.end, { month: 'short', day: 'numeric' })})</span>}
      </button>
    </div>
  );
}

export function CalendarPage() {
  const today = useToday();
  const route = useRoute();
  const { tasks, events, projects, weekStartsOn, clock24h } = useHQ(
    useShallow((s) => ({ tasks: s.tasks, events: s.events, projects: s.projects, weekStartsOn: s.settings.weekStartsOn, clock24h: s.settings.clock24h })),
  );
  const [view, setView] = useState<View>(() => readDevice<View>('calendar-view', 'month'));
  const [cursor, setCursor] = useState(today);
  const [agendaDays, setAgendaDays] = useState(60);

  useEffect(() => {
    if (route.id && isDateKey(route.id)) {
      setCursor(route.id);
      navigate('calendar', null, { replace: true });
    }
  }, [route.id]);

  const changeView = (v: View) => {
    setView(v);
    writeDevice('calendar-view', v);
  };
  const step = (dir: -1 | 1) => setCursor((c) => (view === 'month' ? addMonths(c, dir) : addDays(c, dir * 7)));
  const data = { tasks, events, projects };

  const grid = useMemo(() => (view === 'month' ? monthGrid(cursor, weekStartsOn) : weekDays(cursor, weekStartsOn)), [view, cursor, weekStartsOn]);
  const rangeItems = useMemo(() => {
    if (view === 'agenda') return [];
    return calendarItems(data, grid[0], grid[grid.length - 1], today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, grid, tasks, events, projects, today]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const i of rangeItems) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return m;
  }, [rangeItems]);

  const title = view === 'month' ? formatMonth(cursor) : view === 'week' ? `${formatDate(grid[0], { month: 'short', day: 'numeric' })} – ${formatDate(grid[6], { month: 'short', day: 'numeric', year: 'numeric' })}` : `Next ${agendaDays} days`;
  const month = cursor.slice(0, 7);
  const names = weekdayNames(weekStartsOn);

  return (
    <>
      <PageHeader
        title="Calendar"
        icon={CalendarDays}
        description="Events, task deadlines, milestones, and project targets"
        actions={
          <Button variant="primary" onClick={() => openEditor({ kind: 'event', defaults: { startDate: view === 'agenda' ? today : cursor } })}>
            <Plus className="size-3.5" aria-hidden="true" /> New event
          </Button>
        }
      />
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {view !== 'agenda' && (
          <>
            <Button size="icon" onClick={() => step(-1)} aria-label={view === 'month' ? 'Previous month' : 'Previous week'}>
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button size="icon" onClick={() => step(1)} aria-label={view === 'month' ? 'Next month' : 'Next week'}>
              <ChevronRight className="size-3.5" />
            </Button>
          </>
        )}
        <Button onClick={() => setCursor(today)} disabled={view !== 'agenda' && grid.includes(today) && (view !== 'month' || month === today.slice(0, 7))}>
          Today
        </Button>
        {view !== 'agenda' && <Input type="date" value={cursor} onChange={(e) => isDateKey(e.target.value) && setCursor(e.target.value)} aria-label="Jump to date" className="w-36" />}
        <h2 className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">{title}</h2>
        <Segmented
          label="Calendar view"
          value={view}
          onChange={changeView}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'week', label: 'Week' },
            { value: 'agenda', label: 'Agenda' },
          ]}
        />
      </div>

      {view === 'month' && (
        <div className="overflow-x-auto border border-line bg-panel">
          <div className="grid min-w-[42rem] grid-cols-7">
            {names.map((n) => (
              <div key={n} className="border-b border-line bg-bar px-1.5 py-0.5 font-mono text-2xs font-semibold tracking-wider text-muted uppercase">
                {n}
              </div>
            ))}
            {grid.map((day) => {
              const items = byDay.get(day) ?? [];
              const inMonth = day.slice(0, 7) === month;
              const isToday = day === today;
              return (
                <div
                  key={day}
                  onDoubleClick={() => openEditor({ kind: 'event', defaults: { startDate: day } })}
                  className={cn('group flex min-h-24 min-w-0 flex-col gap-0.5 border-r border-b border-line p-0.5 [&:nth-child(7n)]:border-r-0', !inMonth && 'bg-desk/50', isToday && 'bg-accent-face/15')}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCursor(day);
                        changeView('week');
                      }}
                      className={cn('px-1 font-mono text-xs tabular hover:underline', isToday ? 'bevel-out bg-accent-face text-accent-ink' : inMonth ? 'text-fg' : 'text-subtle')}
                      title="Open this week"
                    >
                      {Number(day.slice(8))}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditor({ kind: 'event', defaults: { startDate: day } })}
                      aria-label={`New event on ${formatDate(day)}`}
                      className="ml-auto grid size-4 place-items-center text-subtle opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                  {items.slice(0, 3).map((i) => (
                    <ItemChip key={i.key} item={i} clock24h={clock24h} />
                  ))}
                  {items.length > 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCursor(day);
                        changeView('week');
                      }}
                      className="px-1 text-left font-mono text-2xs text-muted hover:text-fg"
                    >
                      +{items.length - 3} more
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'week' && (
        <div className="grid gap-1.5 md:grid-cols-7">
          {grid.map((day, i) => {
            const items = byDay.get(day) ?? [];
            const isToday = day === today;
            return (
              <section key={day} aria-label={formatDate(day)} className={cn('flex min-h-40 min-w-0 flex-col border border-line bg-panel', isToday && 'border-accent')}>
                <header className={cn('flex items-center gap-1 border-b border-line px-1.5 py-0.5', isToday ? 'bg-accent-face text-accent-ink' : 'bg-bar')}>
                  <span className="font-mono text-2xs font-semibold tracking-wider uppercase">{names[i]}</span>
                  <span className="font-mono text-xs tabular">{Number(day.slice(8))}</span>
                  <button type="button" onClick={() => openEditor({ kind: 'event', defaults: { startDate: day } })} aria-label={`New event on ${formatDate(day)}`} className="ml-auto grid size-4 place-items-center opacity-70 hover:opacity-100">
                    <Plus className="size-3" />
                  </button>
                </header>
                <div className="flex flex-1 flex-col gap-1 p-1">
                  {items.length === 0 ? <span className="p-1 text-xs text-subtle">—</span> : items.map((it) => <ItemChip key={it.key} item={it} clock24h={clock24h} full />)}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {view === 'agenda' && <Agenda today={today} days={agendaDays} onMore={() => setAgendaDays((d) => d + 60)} clock24h={clock24h} />}

      <p className="mt-2 font-mono text-2xs text-subtle">Internal calendar. It is not connected to Google, Apple, Outlook, or any other calendar. Double-click a day to add an event.</p>
    </>
  );
}

function Agenda({ today, days, onMore, clock24h }: { today: string; days: number; onMore: () => void; clock24h: boolean }) {
  const data = useHQ(useShallow((s) => ({ tasks: s.tasks, events: s.events, projects: s.projects })));
  const overdue = useMemo(() => overdueItems(data, today), [data, today]);
  const upcoming = useMemo(() => calendarItems(data, today, addDays(today, days), today), [data, today, days]);
  const groups = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const i of upcoming) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return [...m.entries()];
  }, [upcoming]);
  if (!overdue.length && !groups.length)
    return (
      <div className="border border-line bg-panel">
        <EmptyState icon={CalendarDays} title="Nothing scheduled" action={<Button onClick={() => openEditor({ kind: 'event' })}>New event</Button>}>
          Events, tasks with due dates, milestones, and project target dates appear here.
        </EmptyState>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {overdue.length > 0 && (
        <section aria-label="Overdue" className="border border-bad-fill bg-panel">
          <h3 className="border-b border-bad-fill bg-bad-fill/25 px-2 py-0.5 font-mono text-2xs font-semibold tracking-wider text-bad uppercase">Overdue ({overdue.length})</h3>
          <div className="flex flex-col gap-1 p-1">
            {overdue.map((i) => (
              <div key={i.key} className="flex items-center gap-2">
                <span className="w-24 shrink-0 font-mono text-2xs text-bad">{relativeDay(i.date, today)}</span>
                <div className="min-w-0 flex-1">
                  <ItemChip item={i} clock24h={clock24h} full />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="border border-line bg-panel">
        {groups.map(([day, items]) => (
          <section key={day} aria-label={formatDate(day)}>
            <h3 className={cn('border-b border-line px-2 py-0.5 font-mono text-2xs font-semibold tracking-wider uppercase', day === today ? 'bg-accent-face text-accent-ink' : 'bg-bar text-muted')}>
              {relativeDay(day, today)} · {formatDate(day, { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <div className="flex flex-col gap-1 border-b border-line p-1">
              {items.map((i) => (
                <ItemChip key={i.key} item={i} clock24h={clock24h} full />
              ))}
            </div>
          </section>
        ))}
        <div className="p-1.5">
          <Button size="sm" onClick={onMore}>
            Show 60 more days
          </Button>
        </div>
      </div>
    </div>
  );
}
