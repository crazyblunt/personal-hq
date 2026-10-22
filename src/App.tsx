import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useEffect, useRef, useState, type JSX } from 'react';
import { startClock } from './app/clock';
import { readDevice, writeDevice } from './app/deviceStorage';
import { flushDrafts } from './app/drafts';
import { insideArtifactHost } from './app/fileSave';
import { downloadBackup } from './app/backupActions';
import { backupDue, snoozeBackupReminder, totalRecords, useStorageHealth } from './app/safety';
import { useMinuteNow } from './app/clock';
import { isTypingTarget } from './app/platform';
import { navigate, startRouter, useRoute } from './app/router';
import { anyModalOpen, closeCommand, openCapture, openCommand, useUI } from './app/ui';
import { dismissIssues, flush, hasUnsavedChanges, useHQ } from './data/store';
import { COLLECTIONS, type SectionId, type Settings } from './data/types';
import { EditorHost } from './editors/EditorHost';
import { CaptureDialog } from './editors/CaptureDialog';
import { ActivityPage } from './features/activity/ActivityPage';
import { CalendarPage } from './features/calendar/CalendarPage';
import { IdeasPage } from './features/ideas/IdeasPage';
import { InboxPage } from './features/inbox/InboxPage';
import { MyDayPage } from './features/myday/MyDayPage';
import { NotesPage } from './features/notes/NotesPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { TasksPage } from './features/tasks/TasksPage';
import { UtilitiesPage } from './features/utilities/UtilitiesPage';
import { OrganizeDialog } from './organize/OrganizeDialog';
import { CommandBar } from './shell/CommandBar';
import { NAV_ITEMS } from './shell/nav';
import { Shell } from './shell/Shell';
import { ConfirmHost } from './ui/Dialog';
import { cn } from './lib/util';
import { relativeTime } from './lib/dates';

const PAGES: Record<SectionId, () => JSX.Element> = {
  myday: MyDayPage,
  inbox: InboxPage,
  tasks: TasksPage,
  calendar: CalendarPage,
  ideas: IdeasPage,
  projects: ProjectsPage,
  notes: NotesPage,
  activity: ActivityPage,
  utilities: UtilitiesPage,
  prefs: SettingsPage,
};

/** Puts the theme, accent, and density on <html>, where the CSS tokens read them. */
export function applyAppearance(s: Pick<Settings, 'theme' | 'accent' | 'density'>) {
  const root = document.documentElement;
  root.dataset.hqTheme = s.theme;
  root.dataset.hqAccent = s.accent;
  root.dataset.hqDensity = s.density;
}

function useGlobalShortcuts() {
  const pendingG = useRef<number>(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const bar = useUI.getState().commandOpen;
        if (bar && anyModalOpen()) closeCommand();
        else if (!anyModalOpen()) openCommand();
        return;
      }
      if (mod || e.altKey || e.defaultPrevented || isTypingTarget(e.target) || anyModalOpen()) return;
      const key = e.key.toLowerCase();
      if (Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        const item = NAV_ITEMS.find((n) => n.key === key);
        if (item) {
          e.preventDefault();
          navigate(item.section);
        }
        return;
      }
      if (key === 'g') {
        pendingG.current = Date.now();
      } else if (e.key === '/') {
        e.preventDefault();
        openCommand();
      } else if (key === 'c') {
        e.preventDefault();
        openCapture('idea');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex flex-col items-center gap-1 px-3 lg:bottom-8 lg:items-end">
      {toasts.map((t) => {
        const Icon = t.tone === 'success' ? CircleCheck : t.tone === 'error' ? CircleAlert : Info;
        return (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex max-w-md items-center gap-2 bevel-out bg-bar px-2.5 py-1.5 text-sm shadow-[2px_2px_0_rgb(0_0_0/0.4)]">
            <Icon className={cn('size-3.5 shrink-0', t.tone === 'success' ? 'text-ok' : t.tone === 'error' ? 'text-bad' : 'text-info')} aria-hidden="true" />
            {t.message}
          </div>
        );
      })}
    </div>
  );
}

/** Messages from loading: a completed migration, or data that could not be read. */
function LoadNotices() {
  const issues = useHQ((s) => s.issues);
  const migration = useHQ((s) => s.migration);
  const persistent = useHQ((s) => s.persistent);
  if (!issues.length && !migration && persistent) return null;
  const total = migration ? Object.values(migration.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="mb-2 flex flex-col gap-1">
      {migration && (
        <div role="status" className="flex items-start gap-2 border border-info-fill bg-info-fill/15 px-2 py-1.5 text-sm">
          <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Welcome to Personal HQ. Your Agent Command Center data ({total} records:{' '}
            {Object.entries(migration.counts)
              .map(([k, v]) => `${v} ${k}`)
              .join(', ')}
            ) was copied over. The original data is still stored untouched. Bugs live under Projects, prompts under Notes › Prompt library.
          </span>
          <button type="button" aria-label="Dismiss" onClick={() => useHQ.setState({ migration: null })} className="text-subtle hover:text-fg">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {!persistent && (
        <div role="alert" className="border border-warn-fill bg-warn-fill/15 px-2 py-1.5 text-sm">
          Browser storage is blocked here, so changes last only until this page closes. Export a backup from Settings › Data to keep them.
        </div>
      )}
      {issues.length > 0 && (
        <div role="alert" className="flex items-start gap-2 border border-bad-fill bg-bad-fill/15 px-2 py-1.5 text-sm">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-bad" aria-hidden="true" />
          <ul className="min-w-0 flex-1">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <button type="button" aria-label="Dismiss" onClick={dismissIssues} className="text-subtle hover:text-fg">
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** On an empty install outside Claude, explains how to bring data over from the Claude version. */
function MoveDataHint() {
  const empty = useHQ((s) => COLLECTIONS.every((n) => n === 'activity' || s[n].length === 0));
  const [dismissed, setDismissed] = useState(() => readDevice('move-hint-dismissed', false));
  if (!empty || dismissed || insideArtifactHost()) return null;
  return (
    <div role="status" className="mb-2 flex items-start gap-2 border border-info-fill bg-info-fill/15 px-2 py-1.5 text-sm">
      <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        This workspace is empty. Used Personal HQ inside Claude? Open it there and choose Settings › Data › Download backup, then come back and{' '}
        <button type="button" className="text-accent underline" onClick={() => navigate('prefs')}>
          import it in Settings › Data
        </button>
        . The copy in Claude is not changed.
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          writeDevice('move-hint-dismissed', true);
          setDismissed(true);
        }}
        className="text-subtle hover:text-fg"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Nudges you to download a backup when it has been a while. */
function BackupReminder() {
  const now = useMinuteNow();
  const lastBackupAt = useStorageHealth((s) => s.lastBackupAt);
  const records = useHQ((s) => (s.status === 'ready' ? totalRecords() : 0));
  const [hidden, setHidden] = useState(false);
  const due = backupDue(now, {
    lastBackupAt,
    firstSeen: readDevice<string | null>('first-seen', null),
    snoozedUntil: readDevice<string | null>('backup-snooze', null),
    syncOn: readDevice<boolean>('sync-on', false),
    records,
  });
  if (!due || hidden) return null;
  return (
    <div role="status" className="mb-2 flex flex-wrap items-center gap-2 border border-warn-fill bg-warn-fill/15 px-2 py-1.5 text-sm">
      <CircleAlert className="size-3.5 shrink-0 text-warn" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {lastBackupAt ? `Your last backup was ${relativeTime(lastBackupAt)}.` : 'You haven’t downloaded a backup on this device yet.'} Your data lives in this browser, so keep a copy somewhere safe.
      </span>
      <button
        type="button"
        className="bevel-out bg-raised px-2 py-0.5 text-xs hover:bg-raised-hover"
        onClick={async () => {
          const outcome = await downloadBackup();
          if (outcome === 'unavailable') navigate('prefs');
        }}
      >
        Download backup
      </button>
      <button
        type="button"
        className="px-1 text-xs text-muted hover:text-fg"
        onClick={() => {
          snoozeBackupReminder();
          setHidden(true);
        }}
      >
        Remind me in 3 days
      </button>
    </div>
  );
}

export function App() {
  const status = useHQ((s) => s.status);
  const loadError = useHQ((s) => s.loadError);
  const appearance = useHQ((s) => s.settings);
  const route = useRoute();

  useEffect(() => applyAppearance(appearance), [appearance]);
  useEffect(() => startClock(), []);
  useGlobalShortcuts();

  useEffect(() => {
    if (status !== 'ready') return;
    return startRouter(useHQ.getState().settings.startupPage);
  }, [status]);

  useEffect(() => {
    const save = () => {
      flushDrafts();
      void flush();
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      save();
      if (hasUnsavedChanges()) e.preventDefault();
    };
    const onHide = () => document.visibilityState === 'hidden' && save();
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  useEffect(() => {
    document.getElementById('main')?.scrollTo?.({ top: 0 });
  }, [route.section, route.id]);

  if (status === 'loading') {
    return <div className="grid h-full place-items-center font-mono text-sm text-muted">Loading Personal HQ…</div>;
  }
  if (status === 'error') {
    return (
      <div className="grid h-full place-items-center p-4">
        <div role="alert" className="max-w-lg bevel-out bg-panel">
          <div className="bg-bad-fill px-2 py-1 text-sm font-bold text-white">Personal HQ couldn’t open your data</div>
          <div className="flex flex-col gap-2 p-3 text-sm">
            <p>{loadError}</p>
            <p className="text-muted">Nothing was changed or deleted. Reload to try again.</p>
          </div>
        </div>
      </div>
    );
  }

  const Page = PAGES[route.section];
  return (
    <>
      <Shell>
        <LoadNotices />
        <MoveDataHint />
        <BackupReminder />
        <Page />
      </Shell>
      <EditorHost />
      <CaptureDialog />
      <CommandBar />
      <OrganizeDialog />
      <ConfirmHost />
      <Toasts />
    </>
  );
}
