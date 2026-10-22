import { Command, Menu, Plus, Timer, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMinuteNow, useNow } from '../app/clock';
import { focusRemaining, useFocus } from '../app/focus';
import { MOD_KEY } from '../app/platform';
import { navigate, SECTION_LABEL, useRoute } from '../app/router';
import { openCapture, openCommand, setSidebarOpen, useUI } from '../app/ui';
import { useHQ } from '../data/store';
import { formatClock, formatDuration } from '../lib/dates';
import { cn } from '../lib/util';
import { ColorSquare, Kbd } from '../ui/bits';
import { countFor, NAV_ITEMS, useNavCounts, type NavItem } from './nav';


function AppMark() {
  return (
    <span className="grid size-4 shrink-0 place-items-center bevel-out bg-accent-face" aria-hidden="true">
      <svg viewBox="0 0 16 16" className="size-3">
        <rect x="2" y="2" width="5" height="12" fill="var(--accent-ink)" />
        <rect x="9" y="2" width="5" height="5" fill="var(--warn)" />
        <rect x="9" y="9" width="5" height="5" fill="var(--purple)" />
      </svg>
    </span>
  );
}

function TitleBar() {
  const route = useRoute();
  const clock24h = useHQ((s) => s.settings.clock24h);
  const now = useMinuteNow();
  return (
    <header className="z-30 flex h-8 shrink-0 items-center gap-2 border-b border-lo bg-bar pr-1.5 pl-2 lg:h-7">
      <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation" className="grid size-6 place-items-center border border-transparent text-muted hover:bevel-out hover:bg-raised lg:hidden">
        <Menu className="size-4" />
      </button>
      <a
        href="#myday"
        onClick={(e) => {
          e.preventDefault();
          navigate('myday');
        }}
        className="flex min-w-0 items-center gap-2"
      >
        <AppMark />
        <span className="truncate text-sm font-bold">Personal HQ</span>
      </a>
      <span className="hidden truncate text-sm text-muted sm:inline">— {SECTION_LABEL[route.section]}</span>
      <div className="ml-auto flex items-center gap-1">
        <MobileSaveDot />
        <button
          type="button"
          onClick={() => openCapture('idea')}
          title="Quick capture (C)"
          className="flex h-6 items-center gap-1 bevel-out bg-raised px-2 text-xs hover:bg-raised-hover active:bevel-in"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Capture</span>
        </button>
        <button
          type="button"
          onClick={openCommand}
          title={`Command bar (${MOD_KEY}+K)`}
          className="flex h-6 items-center gap-1.5 bevel-in bg-inset px-2 text-xs text-muted hover:text-fg sm:w-48"
        >
          <Command className="size-3.5" aria-hidden="true" />
          <span className="hidden flex-1 text-left sm:inline">Search or run…</span>
          <span className="hidden font-mono text-2xs sm:inline">{MOD_KEY}K</span>
        </button>
        <span className="hidden w-16 text-right font-mono text-xs text-muted tabular md:inline">{formatClock(new Date(now), clock24h)}</span>
      </div>
    </header>
  );
}

/** The status bar is hidden on small screens, so phones get a compact save light in the title bar. */
function MobileSaveDot() {
  const { saveState, persistent } = useHQ(useShallow((s) => ({ saveState: s.saveState, persistent: s.persistent })));
  const tone = !persistent || saveState === 'error' ? 'bg-bad-fill' : saveState === 'pending' ? 'bg-warn-fill' : 'bg-ok-fill';
  const label = !persistent ? 'Not saved: storage blocked' : saveState === 'error' ? 'Save failed' : saveState === 'pending' ? 'Saving' : 'All changes saved';
  return (
    <span className="mr-1 flex items-center lg:hidden" role="status" aria-label={label} title={label}>
      <span className={cn('size-2', tone)} aria-hidden="true" />
    </span>
  );
}

function NavLink({ item, count, alert, onPick }: { item: NavItem; count?: number; alert?: number; onPick?: () => void }) {
  const route = useRoute();
  const active = route.section === item.section;
  const Icon = item.icon;
  return (
    <a
      href={`#${item.section}`}
      aria-current={active ? 'page' : undefined}
      title={`${item.label} (G then ${item.key.toUpperCase()})`}
      onClick={(e) => {
        e.preventDefault();
        navigate(item.section);
        onPick?.();
      }}
      className={cn('flex h-6 items-center gap-2 px-2 text-sm', active ? 'bg-accent-face font-bold text-accent-ink' : 'text-fg hover:bg-bar')}
    >
      <Icon className={cn('size-3.5 shrink-0', active ? 'text-accent-ink' : 'text-muted')} aria-hidden="true" />
      <span className="flex-1 truncate">{item.label}</span>
      {alert ? (
        <span className={cn('px-1 font-mono text-2xs tabular', active ? 'bg-black/25 text-white' : 'bg-bad-fill text-white')} title={`${alert} overdue`}>
          {alert}!
        </span>
      ) : null}
      {count !== undefined && count > 0 && <span className={cn('font-mono text-2xs font-normal tabular', active ? 'text-accent-ink/80' : 'text-subtle')}>{count}</span>}
    </a>
  );
}

function ProjectTree({ onPick }: { onPick?: () => void }) {
  const route = useRoute();
  const projects = useHQ(useShallow((s) => s.projects.filter((p) => p.status === 'active' || p.status === 'paused')));
  if (!projects.length) return null;
  return (
    <ul aria-label="Active projects" className="ml-[15px] border-l border-dotted border-line-strong">
      {projects.map((p) => {
        const on = route.section === 'projects' && route.id === p.id;
        return (
          <li key={p.id} className="relative pl-2 before:absolute before:top-3 before:left-0 before:w-1.5 before:border-t before:border-dotted before:border-line-strong">
            <a
              href={`#projects.${p.id}`}
              aria-current={on ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate('projects', p.id);
                onPick?.();
              }}
              className={cn('flex h-6 items-center gap-1.5 pr-2 pl-1 text-sm', on ? 'bg-accent-face text-accent-ink' : 'text-muted hover:bg-bar hover:text-fg', p.status === 'paused' && 'italic')}
            >
              <ColorSquare color={p.color} />
              <span className="truncate">{p.name}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarBody({ onPick }: { onPick?: () => void }) {
  const counts = useNavCounts();
  const main = NAV_ITEMS.filter((n) => n.section !== 'prefs');
  const prefs = NAV_ITEMS.find((n) => n.section === 'prefs')!;
  return (
    <>
      <div className="flex h-6 shrink-0 items-center border-b border-line bg-bar px-2 font-mono text-2xs font-semibold tracking-wider text-subtle uppercase">Navigation</div>
      <nav aria-label="Sections" className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1">
        {main.map((item) => (
          <div key={item.section}>
            <NavLink item={item} count={countFor(item.section, counts)} alert={item.section === 'tasks' ? counts.overdue : undefined} onPick={onPick} />
            {item.section === 'projects' && <ProjectTree onPick={onPick} />}
          </div>
        ))}
        <div className="mt-auto border-t border-line pt-1">
          <NavLink item={prefs} onPick={onPick} />
        </div>
      </nav>
    </>
  );
}

function Sidebar() {
  return (
    <aside className="hidden w-52 shrink-0 flex-col border-r border-lo bg-panel lg:flex">
      <SidebarBody />
    </aside>
  );
}

function Drawer() {
  const open = useUI((s) => s.sidebarOpen);
  const route = useRoute();
  useEffect(() => setSidebarOpen(false), [route.section, route.id]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/45" onClick={() => setSidebarOpen(false)} />
      <aside className="absolute top-0 bottom-0 left-0 flex w-64 max-w-[85vw] flex-col bevel-out bg-panel pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] shadow-[4px_0_0_rgb(0_0_0/0.35)]">
        <div className="flex h-8 items-center justify-between border-b border-line bg-bar px-2">
          <span className="flex items-center gap-2 text-sm font-bold">
            <AppMark /> Personal HQ
          </span>
          <button type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} className="grid size-6 place-items-center bevel-out bg-raised">
            <X className="size-3.5" />
          </button>
        </div>
        <SidebarBody onPick={() => setSidebarOpen(false)} />
      </aside>
    </div>
  );
}

function SaveIndicator() {
  const { saveState, saveError, persistent, storageLabel, lastSavedAt, clock24h } = useHQ(
    useShallow((s) => ({ saveState: s.saveState, saveError: s.saveError, persistent: s.persistent, storageLabel: s.storageLabel, lastSavedAt: s.lastSavedAt, clock24h: s.settings.clock24h })),
  );
  const state = !persistent
    ? { tone: 'bg-warn-fill', text: 'Not saved · storage blocked', title: 'Browser storage is unavailable here. Export a backup from Settings to keep your data.' }
    : saveState === 'error'
      ? { tone: 'bg-bad-fill', text: 'Save failed', title: saveError ?? 'Save failed' }
      : saveState === 'pending'
        ? { tone: 'bg-warn-fill', text: 'Saving…', title: 'Writing changes to this browser' }
        : { tone: 'bg-ok-fill', text: lastSavedAt ? `Saved ${formatClock(new Date(lastSavedAt), clock24h, true)}` : `Saved · ${storageLabel}`, title: `All changes are saved in ${storageLabel.toLowerCase()}` };
  return (
    <div className="flex h-full min-w-0 items-center gap-1.5 bevel-in px-2" title={state.title} role="status" aria-live="polite">
      <span className={cn('size-2 shrink-0', state.tone)} aria-hidden="true" />
      <span className="truncate">{state.text}</span>
    </div>
  );
}

function FocusIndicator() {
  const focus = useFocus();
  const now = useNow();
  if (!focus.running) return null;
  return (
    <button type="button" onClick={() => navigate('utilities')} className="flex h-full items-center gap-1 bevel-in px-2 text-accent" title="Focus timer running">
      <Timer className="size-3" aria-hidden="true" />
      {focus.phase === 'work' ? 'FOCUS' : 'BREAK'} {formatDuration(focusRemaining(focus, now))}
    </button>
  );
}

function StatusBar() {
  const c = useNavCounts();
  const clock24h = useHQ((s) => s.settings.clock24h);
  const now = useMinuteNow();
  const d = new Date(now);
  return (
    <footer aria-label="Status bar" className="hidden h-[22px] shrink-0 gap-[3px] border-t border-hi bg-bar p-[2px] font-mono text-2xs text-muted lg:flex">
      <div className="w-52 shrink-0">
        <SaveIndicator />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 bevel-in px-2">
        <span className="truncate">
          {c.tasks} open tasks
          {c.overdue > 0 && <span className="text-bad"> · {c.overdue} overdue</span>} · {c.inbox} in inbox · {c.myday} for today
        </span>
      </div>
      <FocusIndicator />
      <div className="flex h-full items-center gap-1 bevel-in px-2">
        <Kbd>{MOD_KEY}</Kbd>
        <Kbd>K</Kbd> commands
      </div>
      <div className="flex h-full items-center bevel-in px-2 tabular">
        {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} {formatClock(d, clock24h)}
      </div>
    </footer>
  );
}

const MOBILE_ITEMS = NAV_ITEMS.filter((n) => ['myday', 'inbox', 'tasks', 'calendar', 'notes'].includes(n.section));

function MobileNav() {
  const route = useRoute();
  return (
    <nav aria-label="Main sections" className="grid shrink-0 grid-cols-5 gap-[2px] border-t border-hi bg-bar p-[2px] lg:hidden">
      {MOBILE_ITEMS.map((item) => {
        const on = route.section === item.section;
        const Icon = item.icon;
        return (
          <a
            key={item.section}
            href={`#${item.section}`}
            aria-current={on ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(item.section);
            }}
            className={cn('flex flex-col items-center gap-0.5 py-1 text-2xs', on ? 'bevel-in bg-inset text-fg' : 'bevel-out bg-raised text-muted')}
          >
            <Icon className={cn('size-4', on && 'text-accent')} aria-hidden="true" />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main id="main" className="min-w-0 flex-1 overflow-y-auto pt-3 pr-[max(16px,env(safe-area-inset-right,0px))] pb-6 pl-[max(16px,env(safe-area-inset-left,0px))] lg:px-4">
          <div className="mx-auto max-w-[1500px]">{children}</div>
        </main>
      </div>
      <StatusBar />
      <MobileNav />
      <Drawer />
    </div>
  );
}
