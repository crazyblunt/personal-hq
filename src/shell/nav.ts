import { Activity, CalendarDays, FolderKanban, Inbox, Lightbulb, ListChecks, NotebookPen, Settings, Sun, Table2, Wrench, type LucideIcon } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../app/clock';
import { calendarItems, isMyDayTask, isOpenTask, isOverdue } from '../data/selectors';
import { useHQ } from '../data/store';
import type { SectionId } from '../data/types';
import { SECTION_LABEL } from '../app/router';

export interface NavItem {
  section: SectionId;
  label: string;
  icon: LucideIcon;
  key: string;
}

export const NAV_ITEMS: NavItem[] = [
  { section: 'myday', label: SECTION_LABEL.myday, icon: Sun, key: 'd' },
  { section: 'inbox', label: SECTION_LABEL.inbox, icon: Inbox, key: 'i' },
  { section: 'tasks', label: SECTION_LABEL.tasks, icon: ListChecks, key: 't' },
  { section: 'calendar', label: SECTION_LABEL.calendar, icon: CalendarDays, key: 'c' },
  { section: 'ideas', label: SECTION_LABEL.ideas, icon: Lightbulb, key: 'e' },
  { section: 'projects', label: SECTION_LABEL.projects, icon: FolderKanban, key: 'p' },
  { section: 'notes', label: SECTION_LABEL.notes, icon: NotebookPen, key: 'n' },
  { section: 'explorer', label: SECTION_LABEL.explorer, icon: Table2, key: 'x' },
  { section: 'activity', label: SECTION_LABEL.activity, icon: Activity, key: 'a' },
  { section: 'utilities', label: SECTION_LABEL.utilities, icon: Wrench, key: 'u' },
  { section: 'prefs', label: SECTION_LABEL.prefs, icon: Settings, key: 's' },
];

export interface NavCounts {
  myday: number;
  inbox: number;
  tasks: number;
  overdue: number;
  calendarToday: number;
  ideas: number;
  projects: number;
  notes: number;
}

export function useNavCounts(): NavCounts {
  const today = useToday();
  return useHQ(
    useShallow((s) => ({
      myday: s.tasks.filter((t) => isMyDayTask(t, today)).length,
      inbox: s.ideas.filter((i) => i.inbox && !i.archived).length + s.tasks.filter((t) => t.status === 'inbox').length,
      tasks: s.tasks.filter(isOpenTask).length,
      overdue: s.tasks.filter((t) => isOverdue(t, today)).length,
      calendarToday: calendarItems(s, today, today, today).filter((i) => !i.done).length,
      ideas: s.ideas.filter((i) => !i.archived).length,
      projects: s.projects.filter((p) => p.status !== 'archived').length,
      notes: s.notes.length,
    })),
  );
}

export function countFor(section: SectionId, c: NavCounts): number | undefined {
  switch (section) {
    case 'myday':
      return c.myday;
    case 'inbox':
      return c.inbox;
    case 'tasks':
      return c.tasks;
    case 'calendar':
      return c.calendarToday;
    case 'ideas':
      return c.ideas;
    case 'projects':
      return c.projects;
    case 'notes':
      return c.notes;
    default:
      return undefined;
  }
}
