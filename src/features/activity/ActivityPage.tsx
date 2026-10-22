import { Activity } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToday } from '../../app/clock';
import { useHQ } from '../../data/store';
import { ACTIVITY_ACTIONS, type EntityKind } from '../../data/types';
import { addDays, formatDate, relativeDay, toDateKey } from '../../lib/dates';
import { matchesQuery } from '../../lib/search';
import { EmptyState, PageHeader, Panel, SearchBox, Segmented } from '../../ui/bits';
import { Select } from '../../ui/controls';
import { ActivityChart, ActivityLine, useOpenEntry } from './parts';

const ENTITY_FILTERS: { value: '' | EntityKind; label: string }[] = [
  { value: '', label: 'Everything' },
  { value: 'task', label: 'Tasks' },
  { value: 'idea', label: 'Ideas' },
  { value: 'note', label: 'Notes' },
  { value: 'project', label: 'Projects' },
  { value: 'event', label: 'Events' },
  { value: 'bug', label: 'Bugs' },
  { value: 'prompt', label: 'Prompts' },
  { value: 'focus', label: 'Focus sessions' },
  { value: 'workspace', label: 'Imports' },
];

const PAGE = 150;

export function ActivityPage() {
  const today = useToday();
  const activity = useHQ((s) => s.activity);
  const open = useOpenEntry();
  const [range, setRange] = useState<'7' | '30' | '90' | 'all'>('30');
  const [entity, setEntity] = useState<'' | EntityKind>('');
  const [action, setAction] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const since = range === 'all' ? '' : addDays(today, -(Number(range) - 1));
  const filtered = useMemo(
    () =>
      activity
        .filter((e) => (!since || toDateKey(new Date(e.at)) >= since) && (!entity || e.entity === entity) && (!action || e.action === action) && matchesQuery(query, e.title, e.detail))
        .reverse(),
    [activity, since, entity, action, query],
  );
  const stats = useMemo(() => {
    const weekStart = addDays(today, -6);
    const week = activity.filter((e) => toDateKey(new Date(e.at)) >= weekStart);
    return {
      week: week.length,
      completedWeek: week.filter((e) => e.action === 'completed' && e.entity === 'task').length,
      createdWeek: week.filter((e) => e.action === 'created').length,
      focusWeek: week.filter((e) => e.entity === 'focus').length,
      total: activity.length,
      backfilled: activity.filter((e) => e.backfilled).length,
    };
  }, [activity, today]);

  const groups = useMemo(() => {
    const out: { day: string; items: typeof filtered }[] = [];
    for (const e of filtered.slice(0, limit)) {
      const day = toDateKey(new Date(e.at));
      if (out.length && out[out.length - 1].day === day) out[out.length - 1].items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [filtered, limit]);

  return (
    <>
      <PageHeader title="Activity" icon={Activity} description="A log of real changes recorded in this workspace" />
      {activity.length === 0 ? (
        <div className="border border-line bg-panel">
          <EmptyState icon={Activity} title="No activity recorded yet">
            Creating, completing, editing, converting, and deleting items is logged here as you work. Nothing is estimated or made up.
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <Panel title={`Actions per day · last ${range === 'all' ? 90 : range} days`}>
              <div className="p-2">
                <ActivityChart activity={activity} days={range === '7' ? 14 : range === 'all' ? 90 : Number(range)} today={today} height={150} />
              </div>
            </Panel>
            <Panel title="Last 7 days">
              <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 p-2 font-mono text-xs">
                <dt className="text-muted">Actions</dt>
                <dd className="text-right tabular">{stats.week}</dd>
                <dt className="text-muted">Tasks completed</dt>
                <dd className="text-right text-ok tabular">{stats.completedWeek}</dd>
                <dt className="text-muted">Items created</dt>
                <dd className="text-right tabular">{stats.createdWeek}</dd>
                <dt className="text-muted">Focus sessions</dt>
                <dd className="text-right tabular">{stats.focusWeek}</dd>
                <dt className="border-t border-line pt-1 text-subtle">All recorded</dt>
                <dd className="border-t border-line pt-1 text-right text-subtle tabular">{stats.total}</dd>
              </dl>
              {stats.backfilled > 0 && <p className="border-t border-line px-2 py-1 text-2xs text-subtle">{stats.backfilled} entries were rebuilt from Agent Command Center timestamps during migration.</p>}
            </Panel>
          </div>

          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center">
            <Segmented
              label="Time range"
              value={range}
              onChange={(v) => {
                setRange(v);
                setLimit(PAGE);
              }}
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
                { value: 'all', label: 'All' },
              ]}
            />
            <div className="grid grid-cols-2 gap-1.5 sm:flex">
              <SearchBox value={query} onChange={setQuery} placeholder="Search activity" className="col-span-2 sm:w-56" />
              <Select value={entity} onChange={(e) => setEntity(e.target.value as '' | EntityKind)} aria-label="Filter by type" className="sm:w-40">
                {ENTITY_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
              <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action" className="sm:w-36">
                <option value="">Any action</option>
                {ACTIVITY_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a[0].toUpperCase() + a.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
            <span className="font-mono text-2xs text-subtle lg:ml-auto">{filtered.length} entries</span>
          </div>

          {groups.length === 0 ? (
            <div className="border border-line bg-panel">
              <EmptyState title="No entries match">Try a longer time range or clear the filters.</EmptyState>
            </div>
          ) : (
            <div className="border border-line bg-panel">
              {groups.map((g) => (
                <section key={g.day} aria-label={formatDate(g.day)}>
                  <h3 className="border-b border-line bg-bar px-2 py-0.5 font-mono text-2xs font-semibold tracking-wider text-muted uppercase">
                    {relativeDay(g.day, today)} · {formatDate(g.day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {g.items.length}
                  </h3>
                  <ul>
                    {g.items.map((e) => (
                      <ActivityLine key={e.id} entry={e} onOpen={open} />
                    ))}
                  </ul>
                </section>
              ))}
              {filtered.length > limit && (
                <div className="p-1.5">
                  <button type="button" className="font-mono text-xs text-accent hover:underline" onClick={() => setLimit((l) => l + PAGE)}>
                    Show {Math.min(PAGE, filtered.length - limit)} more
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="font-mono text-2xs text-subtle">The log keeps the most recent 3,000 entries. Repeated edits to the same item within 10 minutes are combined into one entry.</p>
        </div>
      )}
    </>
  );
}
