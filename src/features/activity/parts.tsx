import { Bug, CalendarDays, FolderKanban, HardDrive, Lightbulb, ListChecks, MessageSquareCode, NotebookPen, Timer, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { openEditor } from '../../app/ui';
import { activitySeries, type DayActivity } from '../../data/selectors';
import { useHQ } from '../../data/store';
import type { ActivityEntry, DateKey, EntityKind } from '../../data/types';
import { formatDate, relativeTime } from '../../lib/dates';
import { cn } from '../../lib/util';
import { ProjectChip } from '../../ui/bits';

export const ENTITY_ICON: Record<EntityKind, LucideIcon> = {
  task: ListChecks,
  idea: Lightbulb,
  note: NotebookPen,
  project: FolderKanban,
  event: CalendarDays,
  bug: Bug,
  prompt: MessageSquareCode,
  focus: Timer,
  workspace: HardDrive,
};

const VERB: Record<ActivityEntry['action'], string> = {
  created: 'Created',
  updated: 'Updated',
  completed: 'Completed',
  reopened: 'Reopened',
  deleted: 'Deleted',
  archived: 'Archived',
  restored: 'Restored',
  converted: 'Converted',
  imported: 'Imported',
};

const ACTION_TONE: Partial<Record<ActivityEntry['action'], string>> = {
  completed: 'text-ok',
  deleted: 'text-bad',
  created: 'text-accent',
  converted: 'text-purple',
  imported: 'text-info',
};

/** Opens whatever an activity entry refers to, if it still exists. */
export function useOpenEntry() {
  const s = useHQ.getState;
  return (e: ActivityEntry) => {
    const st = s();
    switch (e.entity) {
      case 'task':
        if (st.tasks.some((t) => t.id === e.entityId)) openEditor({ kind: 'task', id: e.entityId });
        break;
      case 'idea':
        if (st.ideas.some((t) => t.id === e.entityId)) openEditor({ kind: 'idea', id: e.entityId });
        break;
      case 'note':
        if (st.notes.some((t) => t.id === e.entityId)) navigate('notes', e.entityId);
        break;
      case 'project':
        if (st.projects.some((t) => t.id === e.entityId)) navigate('projects', e.entityId);
        break;
      case 'event':
        if (st.events.some((t) => t.id === e.entityId)) openEditor({ kind: 'event', id: e.entityId });
        break;
      case 'bug': {
        const b = st.bugs.find((t) => t.id === e.entityId);
        if (b) openEditor({ kind: 'bug', id: b.id, projectId: b.projectId });
        break;
      }
      case 'focus':
        if (e.entityId && st.tasks.some((t) => t.id === e.entityId)) openEditor({ kind: 'task', id: e.entityId });
        break;
      default:
        break;
    }
  };
}

export function ActivityLine({ entry, showProject = true, onOpen }: { entry: ActivityEntry; showProject?: boolean; onOpen?: (e: ActivityEntry) => void }) {
  const Icon = ENTITY_ICON[entry.entity];
  const label = entry.entity === 'focus' ? 'Focus' : VERB[entry.action];
  return (
    <li className="flex items-start gap-2 border-b border-line px-2 py-1 last:border-b-0">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <span className={cn('font-mono text-2xs tracking-wide uppercase', ACTION_TONE[entry.action] ?? 'text-muted')}>{label}</span>{' '}
        {onOpen && entry.action !== 'deleted' ? (
          <button type="button" onClick={() => onOpen(entry)} className="text-left hover:underline">
            {entry.title || entry.entity}
          </button>
        ) : (
          <span className={entry.action === 'deleted' ? 'text-subtle line-through' : ''}>{entry.title || entry.entity}</span>
        )}
        {(entry.detail || (showProject && entry.projectId && entry.entity !== 'project')) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-subtle">
            {entry.detail && <span>{entry.detail}</span>}
            {showProject && entry.entity !== 'project' && <ProjectChip projectId={entry.projectId} />}
          </div>
        )}
      </div>
      <time dateTime={entry.at} title={new Date(entry.at).toLocaleString()} className="shrink-0 font-mono text-2xs text-subtle tabular">
        {relativeTime(entry.at)}
      </time>
    </li>
  );
}

const SERIES = [
  { key: 'completed', label: 'Completed', color: 'var(--chart-done)' },
  { key: 'created', label: 'Created', color: 'var(--chart-new)' },
  { key: 'other', label: 'Other changes', color: 'var(--chart-other)' },
] as const;

/** A bar with only its top corners rounded, so it stays anchored to the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceMax(n: number): number {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= n) return m * pow;
  return 10 * pow;
}

/** Stacked daily bars of recorded actions. Every bar comes from the activity log. */
export function ActivityChart({ activity, days, today, height = 132 }: { activity: ActivityEntry[]; days: number; today: DateKey; height?: number }) {
  const series = useMemo(() => activitySeries(activity, days, today), [activity, days, today]);
  const [hover, setHover] = useState<number | null>(null);
  const total = series.reduce((a, d) => a + d.total, 0);
  const max = niceMax(Math.max(...series.map((d) => d.total), 1));
  const W = 600;
  const H = height;
  const padL = 26;
  const padB = 16;
  const padT = 6;
  const plotW = W - padL - 4;
  const plotH = H - padB - padT;
  const slot = plotW / days;
  const barW = Math.max(2, Math.min(16, slot - 3));
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = days <= 14 ? 2 : days <= 31 ? 7 : 14;
  const hovered: DayActivity | null = hover !== null ? series[hover] : null;

  return (
    <figure className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-2xs text-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1">
            <span className="size-2" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
        <span className="ml-auto tabular">{total} actions in {days} days</span>
      </div>
      <div className="relative bevel-in bg-monitor">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Recorded actions per day for the last ${days} days: ${total} in total.`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : '2 3'} strokeWidth="1" />
              <text x={padL - 4} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--subtle)" fontFamily="var(--font-code)">
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          ))}
          {series.map((d, i) => {
            const x = padL + i * slot + (slot - barW) / 2;
            let acc = 0;
            const segs = SERIES.map((s) => {
              const v = d[s.key];
              const seg = { s, v, y0: acc, y1: acc + v };
              acc += v;
              return seg;
            }).filter((g) => g.v > 0);
            return (
              <g key={d.date} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}>
                <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" />
                {hover === i && <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="var(--line)" opacity="0.35" />}
                {segs.map((g, k) => {
                  const gap = k > 0 ? 1.5 : 0;
                  const top = y(g.y1);
                  const h = Math.max(1, y(g.y0) - top - gap);
                  return k === segs.length - 1 ? (
                    <path key={g.s.key} d={roundedTop(x, top, barW, h, Math.min(2.5, barW / 3, h))} fill={g.s.color} />
                  ) : (
                    <rect key={g.s.key} x={x} y={top} width={barW} height={h} fill={g.s.color} />
                  );
                })}
                {(i % labelEvery === (days - 1) % labelEvery || i === days - 1) && (
                  <text x={padL + i * slot + slot / 2} y={H - 4} textAnchor="middle" fontSize="9" fill={d.date === today ? 'var(--fg)' : 'var(--subtle)'} fontFamily="var(--font-code)">
                    {d.date === today ? 'today' : formatDate(d.date, { month: 'numeric', day: 'numeric' })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div className="pointer-events-none absolute top-1 right-1 bevel-out bg-bar px-2 py-1 font-mono text-2xs text-fg shadow-[2px_2px_0_rgb(0_0_0/0.4)]">
            <div className="font-semibold">{formatDate(hovered.date)}</div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 tabular">
                <span className="size-2" style={{ background: s.color }} aria-hidden="true" />
                {s.label}: {hovered[s.key]}
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
