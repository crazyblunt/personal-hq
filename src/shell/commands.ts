/**
 * Every command the app can run from the command bar, the menu bar, and
 * keyboard shortcuts. Each has a stable id, so shortcuts (`src/app/shortcuts.ts`)
 * and menus refer to commands by id and a command exists in one place.
 */
import {
  CalendarDays,
  CalendarPlus,
  Command,
  Download,
  FilePlus2,
  FolderPlus,
  History,
  Keyboard,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  ListTodo,
  MessageSquareCode,
  Palette,
  Play,
  Plus,
  Rows3,
  ScanSearch,
  Sun,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { downloadBackup } from '../app/backupActions';
import { useToday } from '../app/clock';
import { toggleFocus, useFocus } from '../app/focus';
import { navigate } from '../app/router';
import { openCapture, openCommand, openEditor, openOrganize, openShortcuts, setMyDayCustomize, toast, useUI } from '../app/ui';
import { createNote, updateSettings, useHQ } from '../data/store';
import { THEMES, THEME_LABEL } from '../data/types';
import { NAV_ITEMS } from './nav';

export interface AppCommand {
  id: string;
  group: 'Create' | 'Go to' | 'Commands' | 'Claude' | 'Views';
  label: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

export function findCommand(cmds: AppCommand[], id: string): AppCommand | undefined {
  return cmds.find((c) => c.id === id);
}

/** Focuses a control on a page that is about to render. */
function focusSoon(id: string) {
  setTimeout(() => {
    const el = document.getElementById(id);
    el?.scrollIntoView?.({ block: 'center' });
    el?.focus();
  }, 50);
}

export function useAppCommands(): AppCommand[] {
  const today = useToday();
  const density = useHQ((s) => s.settings.density);
  const focusRunning = useFocus((s) => s.running);
  return useMemo(() => {
    const showTasks = (view: 'myday' | 'upcoming' | 'overdue' | 'all' | 'completed') => () => {
      useUI.setState({ taskViewRequest: view });
      navigate('tasks');
    };
    const create: AppCommand[] = [
      { id: 'new-task', group: 'Create', label: 'New task', icon: ListChecks, keywords: 'add todo', run: () => openEditor({ kind: 'task' }) },
      { id: 'new-myday-task', group: 'Create', label: 'New task for today', icon: Sun, keywords: 'add todo my day', run: () => openEditor({ kind: 'task', defaults: { myDay: today } }) },
      { id: 'new-idea', group: 'Create', label: 'Capture idea', icon: Lightbulb, keywords: 'brain dump inbox quick', run: () => openCapture('idea') },
      { id: 'new-note', group: 'Create', label: 'New note', icon: FilePlus2, keywords: 'write document', run: () => navigate('notes', createNote().id) },
      { id: 'new-project', group: 'Create', label: 'New project', icon: FolderPlus, run: () => openEditor({ kind: 'project' }) },
      { id: 'new-event', group: 'Create', label: 'New calendar event', icon: CalendarPlus, keywords: 'deadline appointment', run: () => openEditor({ kind: 'event' }) },
      { id: 'new-prompt', group: 'Create', label: 'New prompt', icon: MessageSquareCode, keywords: 'prompt library', run: () => openEditor({ kind: 'prompt' }) },
    ];
    const go: AppCommand[] = NAV_ITEMS.map((n) => ({ id: `go-${n.section}`, group: 'Go to', label: `Go to ${n.label}`, icon: n.icon, keywords: n.section, run: () => navigate(n.section) }));
    const themes: AppCommand[] = THEMES.map((t) => ({ id: `theme-${t}`, group: 'Commands', label: `Theme: ${THEME_LABEL[t]}`, icon: Palette, keywords: 'appearance dark light color switch', run: () => updateSettings({ theme: t }) }));
    const commands: AppCommand[] = [
      { id: 'capture', group: 'Commands', label: 'Quick capture (idea, task, or note)', icon: Plus, keywords: 'capture brain dump', run: () => openCapture('idea') },
      { id: 'open-command', group: 'Commands', label: 'Open the command bar', icon: Command, keywords: 'search run', run: openCommand },
      { id: 'show-shortcuts', group: 'Commands', label: 'Keyboard shortcuts', icon: Keyboard, keywords: 'keys help hotkeys', run: openShortcuts },
      { id: 'customize-myday', group: 'Commands', label: 'Customize My Day layout', icon: LayoutGrid, keywords: 'arrange widgets dashboard grid', run: () => {
        setMyDayCustomize(true);
        navigate('myday');
      } },
      { id: 'cmd-overdue', group: 'Commands', label: 'Show overdue tasks', icon: ListTodo, run: showTasks('overdue') },
      { id: 'cmd-upcoming', group: 'Commands', label: 'Show upcoming deadlines', icon: ListTodo, run: showTasks('upcoming') },
      { id: 'cmd-completed', group: 'Commands', label: 'Show completed tasks', icon: ListTodo, run: showTasks('completed') },
      { id: 'cmd-today-cal', group: 'Commands', label: 'Open today in the calendar', icon: CalendarDays, run: () => navigate('calendar') },
      { id: 'cmd-organize', group: 'Commands', label: 'Run organization review (local suggestions)', icon: ScanSearch, keywords: 'tags suggest similar cleanup', run: openOrganize },
      { id: 'cmd-focus', group: 'Commands', label: focusRunning ? 'Pause focus timer' : 'Start focus timer', icon: Play, keywords: 'pomodoro timer', run: toggleFocus },
      {
        id: 'cmd-density',
        group: 'Commands',
        label: `Switch to ${density === 'compact' ? 'comfortable' : 'compact'} density`,
        icon: Rows3,
        keywords: 'size spacing',
        run: () => updateSettings({ density: density === 'compact' ? 'comfortable' : 'compact' }),
      },
      {
        id: 'cmd-export',
        group: 'Commands',
        label: 'Export backup (.json)',
        icon: Download,
        keywords: 'download save json',
        run: async () => {
          const outcome = await downloadBackup();
          if (outcome === 'saved') toast('Backup saved');
          else if (outcome === 'unavailable') {
            toast('Downloads are not available here. Use Copy JSON in Settings › Data.', 'error');
            navigate('prefs');
          }
        },
      },
      {
        id: 'cmd-import',
        group: 'Commands',
        label: 'Import a backup…',
        icon: Upload,
        keywords: 'restore json load',
        run: () => {
          navigate('prefs');
          focusSoon('import-json');
        },
      },
      { id: 'cmd-activity', group: 'Commands', label: 'Show activity log', icon: History, run: () => navigate('activity') },
    ];
    return [...create, ...go, ...commands, ...themes];
  }, [today, density, focusRunning]);
}
