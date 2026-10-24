import { clampRect, firstFit, pushDown, stackOrder, type GridItem, type Rect, type SizeHint } from '../lib/grid';
import type { Collections, Settings, WidgetId, WidgetPref, WidgetSize, WorkspaceData } from './types';

/** Default and minimum size of each My Day widget, in grid cells. */
export const WIDGET_SIZE_HINTS: Record<WidgetId, SizeHint> = {
  today: { w: 6, h: 12, minW: 4, minH: 6 },
  deadlines: { w: 6, h: 8, minW: 3, minH: 4 },
  projects: { w: 6, h: 8, minW: 3, minH: 4 },
  captures: { w: 6, h: 8, minW: 3, minH: 4 },
  'activity-graph': { w: 6, h: 6, minW: 4, minH: 4 },
  'recent-activity': { w: 4, h: 8, minW: 3, minH: 4 },
  'quick-actions': { w: 4, h: 5, minW: 3, minH: 4 },
  focus: { w: 3, h: 6, minW: 3, minH: 5 },
  clock: { w: 3, h: 5, minW: 2, minH: 3 },
  countdowns: { w: 3, h: 5, minW: 2, minH: 3 },
  shortcuts: { w: 3, h: 5, minW: 2, minH: 3 },
  'random-idea': { w: 3, h: 5, minW: 2, minH: 3 },
};

export const WIDTH_FOR_SIZE: Record<WidgetSize, number> = { sm: 4, md: 8, lg: 12 };

export function sizeForWidth(w: number): WidgetSize {
  return w <= 4 ? 'sm' : w <= 8 ? 'md' : 'lg';
}

const hasRect = (w: WidgetPref): w is WidgetPref & Rect => [w.x, w.y, w.w, w.h].every((v) => typeof v === 'number');

/**
 * Gives every enabled widget a place on the grid. Saved positions are kept
 * (clamped to the grid, overlaps pushed down); widgets without one are
 * placed in list order at the first spot that fits, with their width taken
 * from the old S/M/L size. Hidden widgets keep whatever they had.
 */
export function placeWidgets(widgets: WidgetPref[]): WidgetPref[] {
  const placed: GridItem[] = widgets.filter((w) => w.enabled && hasRect(w)).map((w) => ({ id: w.id, ...clampRect(w as Rect, WIDGET_SIZE_HINTS[w.id]) }));
  const top = stackOrder(placed)[0];
  const settled = top ? pushDown(placed, top.id) : [];
  for (const w of widgets) {
    if (!w.enabled || hasRect(w)) continue;
    const size = { w: WIDTH_FOR_SIZE[w.size], h: WIDGET_SIZE_HINTS[w.id].h };
    settled.push({ id: w.id, ...size, ...firstFit(settled, size.w, size.h) });
  }
  const byId = new Map(settled.map((r) => [r.id, r]));
  return widgets.map((w) => {
    const r = byId.get(w.id);
    return r ? { ...w, x: r.x, y: r.y, w: r.w, h: r.h } : { ...w };
  });
}

export const DEFAULT_WIDGETS: WidgetPref[] = placeWidgets([
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
]);

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
