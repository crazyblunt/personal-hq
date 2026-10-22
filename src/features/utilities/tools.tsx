import { CalendarDays, ExternalLink, FolderKanban, Lightbulb, ListChecks, NotebookPen, Pause, Play, Plus, RotateCcw, Shuffle, SkipForward, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNow, useToday } from '../../app/clock';
import { focusRemaining, resetFocus, setFocusTask, toggleFocus, useFocus } from '../../app/focus';
import { navigate } from '../../app/router';
import { confirmAction, openEditor, toast, useUI, type RecentItem } from '../../app/ui';
import { ideaTitle, updateSettings, useHQ } from '../../data/store';
import { dayOfYear, formatClock, formatDuration, isDateKey, isoWeekNumber, msUntil, relativeTime, toDateKey } from '../../lib/dates';
import { cn, hostOf, isHttpUrl, newId } from '../../lib/util';
import { EmptyState, ExtLink } from '../../ui/bits';
import { Button, Input, Select } from '../../ui/controls';

/* ---------- Clock ---------- */

export function ClockTool({ large = false }: { large?: boolean }) {
  const now = useNow();
  const clock24h = useHQ((s) => s.settings.clock24h);
  const d = new Date(now);
  const key = toDateKey(d);
  return (
    <div className="flex flex-col items-center gap-1 bevel-in bg-monitor px-3 py-3 text-center">
      <span className={cn('font-mono font-semibold text-accent tabular', large ? 'text-3xl' : 'text-2xl')}>{formatClock(d, clock24h, true)}</span>
      <span className="text-sm text-fg">{d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
      <span className="font-mono text-2xs text-subtle tabular">
        WEEK {isoWeekNumber(key)} · DAY {dayOfYear(key)} · {Intl.DateTimeFormat().resolvedOptions().timeZone}
      </span>
    </div>
  );
}

/* ---------- Countdowns ---------- */

export function CountdownsTool({ compact = false }: { compact?: boolean }) {
  const countdowns = useHQ((s) => s.settings.countdowns);
  const now = useNow();
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sorted = [...countdowns].sort((a, b) => msUntil(a.target) - msUntil(b.target));

  const add = () => {
    if (!label.trim()) return setError('Name the countdown.');
    if (!isDateKey(date)) return setError('Pick a date.');
    setError(null);
    updateSettings({ countdowns: [...countdowns, { id: newId(), label: label.trim(), target: time ? `${date}T${time}` : date }] });
    setLabel('');
    setDate('');
    setTime('');
    toast('Countdown added');
  };

  return (
    <div className="flex flex-col gap-2">
      {sorted.length === 0 ? (
        <p className="px-1 text-sm text-muted">No countdowns yet. Add one for an exam, a trip, or a launch.</p>
      ) : (
        <ul className="border border-line bg-inset">
          {sorted.map((c) => {
            const ms = msUntil(c.target, now);
            const past = ms <= 0;
            return (
              <li key={c.id} className="flex items-center gap-2 border-b border-line px-2 py-1 last:border-b-0">
                <span className="min-w-0 flex-1 truncate text-sm">{c.label}</span>
                <span className={cn('font-mono text-xs tabular', past ? 'text-subtle' : ms < 86_400_000 ? 'text-warn' : 'text-accent')}>{past ? 'passed' : formatDuration(ms)}</span>
                {!compact && (
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={`Delete countdown ${c.label}`}
                    onClick={() =>
                      confirmAction({
                        title: 'Delete countdown?',
                        body: `“${c.label}” will be removed.`,
                        confirmLabel: 'Delete',
                        onConfirm: () => updateSettings({ countdowns: countdowns.filter((x) => x.id !== c.id) }),
                      })
                    }
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!compact && (
        <form
          className="grid grid-cols-2 gap-1 sm:grid-cols-[1fr_9rem_6.5rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Finals week" aria-label="Countdown name" className="col-span-2 sm:col-span-1" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Countdown date" />
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Countdown time (optional)" />
          <Button type="submit" className="col-span-2 sm:col-span-1">
            <Plus className="size-3.5" aria-hidden="true" /> Add
          </Button>
          {error && (
            <p role="alert" className="col-span-full text-xs text-bad">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

/* ---------- Focus timer ---------- */

export function FocusTool({ compact = false }: { compact?: boolean }) {
  const focus = useFocus();
  const now = useNow();
  const settings = useHQ((s) => s.settings);
  const openTasks = useHQ(useShallow((s) => s.tasks.filter((t) => t.status !== 'completed')));
  const today = useToday();
  const sessionsToday = useHQ((s) => s.activity.filter((a) => a.entity === 'focus' && toDateKey(new Date(a.at)) === today).length);
  const remaining = focusRemaining(focus, now);
  const total = (focus.phase === 'work' ? settings.focusMinutes : settings.breakMinutes) * 60_000;
  const pct = Math.max(0, Math.min(100, 100 - (remaining / total) * 100));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 bevel-in bg-monitor px-3 py-2">
        <div className="flex-1">
          <div className={cn('font-mono text-2xs tracking-wider uppercase', focus.phase === 'work' ? 'text-accent' : 'text-info')}>{focus.phase === 'work' ? 'Focus' : 'Break'}</div>
          <div className="font-mono text-2xl font-semibold tabular">{formatDuration(remaining)}</div>
        </div>
        <div className="flex gap-1">
          <Button variant="primary" size="icon" onClick={toggleFocus} aria-label={focus.running ? 'Pause timer' : 'Start timer'} title={focus.running ? 'Pause' : 'Start'}>
            {focus.running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </Button>
          <Button size="icon" onClick={() => resetFocus()} aria-label="Reset timer" title="Reset">
            <RotateCcw className="size-3.5" />
          </Button>
          <Button size="icon" onClick={() => resetFocus(focus.phase === 'work' ? 'break' : 'work')} aria-label={focus.phase === 'work' ? 'Switch to break' : 'Switch to focus'} title="Switch phase">
            <SkipForward className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="h-1.5 bevel-in bg-monitor">
        <div className={cn('h-full', focus.phase === 'work' ? 'bg-accent' : 'bg-info')} style={{ width: `${pct}%` }} />
      </div>
      {!compact && (
        <>
          <Select value={focus.taskId ?? ''} onChange={(e) => setFocusTask(e.target.value || null)} aria-label="Task to focus on">
            <option value="">No specific task</option>
            {openTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <label className="flex items-center gap-1">
              Focus
              <Input
                type="number"
                min={1}
                max={180}
                value={settings.focusMinutes}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (v >= 1 && v <= 180) {
                    updateSettings({ focusMinutes: v });
                    if (!focus.running && focus.phase === 'work') useFocus.setState({ remainingMs: v * 60_000 });
                  }
                }}
                className="w-16"
                aria-label="Focus minutes"
              />
              min
            </label>
            <label className="flex items-center gap-1">
              Break
              <Input
                type="number"
                min={1}
                max={60}
                value={settings.breakMinutes}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (v >= 1 && v <= 60) {
                    updateSettings({ breakMinutes: v });
                    if (!focus.running && focus.phase === 'break') useFocus.setState({ remainingMs: v * 60_000 });
                  }
                }}
                className="w-16"
                aria-label="Break minutes"
              />
              min
            </label>
          </div>
        </>
      )}
      <p className="font-mono text-2xs text-subtle">
        {sessionsToday} focus session{sessionsToday === 1 ? '' : 's'} completed today · finished sessions are logged in Activity
      </p>
    </div>
  );
}

/* ---------- Random idea ---------- */

export function RandomIdeaTool() {
  const ideas = useHQ(useShallow((s) => s.ideas.filter((i) => !i.archived)));
  const [pool, setPool] = useState<'all' | 'favorites' | 'inbox'>('all');
  const candidates = useMemo(() => ideas.filter((i) => (pool === 'favorites' ? i.favorite : pool === 'inbox' ? i.inbox : true)), [ideas, pool]);
  const [pickId, setPickId] = useState<string | null>(null);
  const pick = candidates.find((i) => i.id === pickId) ?? null;
  const roll = () => {
    if (!candidates.length) return;
    const others = candidates.length > 1 ? candidates.filter((c) => c.id !== pickId) : candidates;
    setPickId(others[Math.floor(Math.random() * others.length)].id);
  };
  if (!ideas.length) return <EmptyState icon={Lightbulb} title="No ideas to pick from">Capture a few ideas and this picks one at random to revisit.</EmptyState>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        <Select value={pool} onChange={(e) => setPool(e.target.value as typeof pool)} aria-label="Pick from">
          <option value="all">All ideas ({ideas.length})</option>
          <option value="favorites">Favorites ({ideas.filter((i) => i.favorite).length})</option>
          <option value="inbox">Inbox ({ideas.filter((i) => i.inbox).length})</option>
        </Select>
        <Button variant="primary" onClick={roll} disabled={!candidates.length}>
          <Shuffle className="size-3.5" aria-hidden="true" /> Pick
        </Button>
      </div>
      {pick ? (
        <button type="button" onClick={() => openEditor({ kind: 'idea', id: pick.id })} className="bevel-in bg-inset p-2 text-left text-sm hover:bg-bar">
          <span className="block font-bold">{ideaTitle(pick)}</span>
          {pick.body !== ideaTitle(pick) && <span className="line-clamp-3 block text-muted">{pick.body}</span>}
          <span className="mt-1 block font-mono text-2xs text-subtle">captured {relativeTime(pick.createdAt)} · click to open</span>
        </button>
      ) : (
        <p className="text-sm text-muted">{candidates.length ? 'Press Pick to resurface an idea.' : 'Nothing in this group yet.'}</p>
      )}
    </div>
  );
}

/* ---------- Recently used ---------- */

const RECENT_ICON = { task: ListChecks, idea: Lightbulb, note: NotebookPen, project: FolderKanban, event: CalendarDays };

export function useRecentResolved(limit = 10) {
  const recent = useUI((s) => s.recent);
  const data = useHQ(useShallow((s) => ({ tasks: s.tasks, ideas: s.ideas, notes: s.notes, projects: s.projects, events: s.events })));
  return useMemo(() => {
    const out: { item: RecentItem; title: string; open: () => void }[] = [];
    for (const r of recent) {
      let title: string | null = null;
      let open: () => void = () => {};
      if (r.kind === 'task') {
        const t = data.tasks.find((x) => x.id === r.id);
        if (t) (title = t.title), (open = () => openEditor({ kind: 'task', id: t.id }));
      } else if (r.kind === 'idea') {
        const i = data.ideas.find((x) => x.id === r.id);
        if (i) (title = ideaTitle(i)), (open = () => openEditor({ kind: 'idea', id: i.id }));
      } else if (r.kind === 'note') {
        const n = data.notes.find((x) => x.id === r.id);
        if (n) (title = n.title), (open = () => navigate('notes', n.id));
      } else if (r.kind === 'project') {
        const p = data.projects.find((x) => x.id === r.id);
        if (p) (title = p.name), (open = () => navigate('projects', p.id));
      } else if (r.kind === 'event') {
        const e = data.events.find((x) => x.id === r.id);
        if (e) (title = e.title), (open = () => openEditor({ kind: 'event', id: e.id }));
      }
      if (title !== null) out.push({ item: r, title, open });
      if (out.length >= limit) break;
    }
    return out;
  }, [recent, data, limit]);
}

export function RecentTool({ limit = 8 }: { limit?: number }) {
  const items = useRecentResolved(limit);
  if (!items.length) return <p className="px-1 text-sm text-muted">Items you open (tasks, notes, ideas, projects, events) appear here, on this device.</p>;
  return (
    <ul className="border border-line bg-inset">
      {items.map(({ item, title, open }) => {
        const Icon = RECENT_ICON[item.kind];
        return (
          <li key={`${item.kind}:${item.id}`} className="border-b border-line last:border-b-0">
            <button type="button" onClick={open} className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-bar">
              <Icon className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <span className="font-mono text-2xs text-subtle">{relativeTime(item.at)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Shortcuts ---------- */

export function ShortcutsTool({ editable = false }: { editable?: boolean }) {
  const shortcuts = useHQ((s) => s.settings.shortcuts);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const u = url.trim();
    if (!isHttpUrl(u)) return setError('Use a full URL starting with https://');
    setError(null);
    updateSettings({ shortcuts: [...shortcuts, { id: newId(), label: label.trim() || hostOf(u), url: u }] });
    setLabel('');
    setUrl('');
    toast('Shortcut added');
  };
  const move = (i: number, dir: -1 | 1) => {
    const next = [...shortcuts];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    updateSettings({ shortcuts: next });
  };
  return (
    <div className="flex flex-col gap-2">
      {shortcuts.length === 0 ? (
        <p className="px-1 text-sm text-muted">No shortcuts yet. {editable ? 'Add sites and tools you open often.' : 'Add them under Utilities.'}</p>
      ) : (
        <ul className={cn(editable ? 'border border-line bg-inset' : 'grid grid-cols-2 gap-1')}>
          {shortcuts.map((s, i) =>
            editable ? (
              <li key={s.id} className="flex items-center gap-1 border-b border-line px-2 py-1 last:border-b-0">
                <ExtLink href={s.url} className="min-w-0 flex-1 truncate text-sm">
                  {s.label} <span className="text-xs text-subtle">{hostOf(s.url)}</span>
                </ExtLink>
                <Button size="iconSm" variant="ghost" aria-label={`Move ${s.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ▲
                </Button>
                <Button size="iconSm" variant="ghost" aria-label={`Move ${s.label} down`} disabled={i === shortcuts.length - 1} onClick={() => move(i, 1)}>
                  ▼
                </Button>
                <Button
                  size="iconSm"
                  variant="ghost"
                  aria-label={`Delete shortcut ${s.label}`}
                  onClick={() =>
                    confirmAction({ title: 'Delete shortcut?', body: `“${s.label}” will be removed.`, confirmLabel: 'Delete', onConfirm: () => updateSettings({ shortcuts: shortcuts.filter((x) => x.id !== s.id) }) })
                  }
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            ) : (
              <li key={s.id}>
                <ExtLink href={s.url} className="flex items-center gap-1.5 bevel-out bg-raised px-2 py-1 text-sm hover:bg-raised-hover hover:no-underline">
                  <ExternalLink className="size-3 shrink-0 text-subtle" aria-hidden="true" />
                  <span className="truncate">{s.label}</span>
                </ExtLink>
              </li>
            ),
          )}
        </ul>
      )}
      {editable && (
        <form
          className="grid gap-1 sm:grid-cols-[10rem_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" aria-label="Shortcut label" />
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Shortcut URL" />
          <Button type="submit">
            <Plus className="size-3.5" aria-hidden="true" /> Add
          </Button>
          {error && (
            <p role="alert" className="col-span-full text-xs text-bad">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
