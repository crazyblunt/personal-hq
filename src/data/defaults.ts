import type { Collections, Settings, WidgetPref, WorkspaceData } from './types';

export const DEFAULT_WIDGETS: WidgetPref[] = [
  { id: 'today', enabled: true, size: 'md' },
  { id: 'quick-actions', enabled: true, size: 'sm' },
  { id: 'deadlines', enabled: true, size: 'sm' },
  { id: 'projects', enabled: true, size: 'sm' },
  { id: 'captures', enabled: true, size: 'sm' },
  { id: 'activity-graph', enabled: true, size: 'md' },
  { id: 'recent-activity', enabled: true, size: 'sm' },
  { id: 'clock', enabled: false, size: 'sm' },
  { id: 'countdowns', enabled: false, size: 'sm' },
  { id: 'focus', enabled: false, size: 'sm' },
  { id: 'shortcuts', enabled: false, size: 'sm' },
  { id: 'random-idea', enabled: false, size: 'sm' },
];

export function defaultSettings(): Settings {
  return {
    theme: 'charcoal',
    accent: 'green',
    density: 'compact',
    startupPage: 'myday',
    defaultPriority: 'medium',
    defaultTaskStatus: 'planned',
    weekStartsOn: 1,
    clock24h: false,
    widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })),
    shortcuts: [],
    countdowns: [],
    focusMinutes: 25,
    breakMinutes: 5,
  };
}

export function emptyCollections(): Collections {
  return { tasks: [], ideas: [], notes: [], projects: [], events: [], bugs: [], prompts: [], activity: [] };
}

export function emptyWorkspace(): WorkspaceData {
  return { ...emptyCollections(), settings: defaultSettings() };
}

/** The activity log keeps this many entries; the oldest are dropped first. */
export const ACTIVITY_LIMIT = 3000;
