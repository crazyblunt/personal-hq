/**
 * Older copies of the app (the Claude artifact, or a tab or installed app
 * that hasn't reloaded since an update) don't know about some newer fields,
 * so when they save, those fields are simply missing from the record. When
 * such a record arrives through sync, keep this device's values for exactly
 * those missing fields. A newer copy always writes them (an empty list
 * included), so deliberate changes still win.
 */
import { placeWidgets } from './defaults';
import { isObj } from './normalize';
import type { CollectionName, Collections, Settings, WidgetPref } from './types';

/** Record fields added after the first sync release, per collection. */
const NEWER_FIELDS: Partial<Record<CollectionName, string[]>> = {
  tasks: ['itemLinks'],
  notes: ['itemLinks'],
  ideas: ['itemLinks'],
  projects: ['itemLinks', 'tags'],
};

export function keepFieldsOlderCopiesDrop<K extends CollectionName>(collection: K, raw: unknown, incoming: Collections[K][number], local: unknown): Collections[K][number] {
  const fields = NEWER_FIELDS[collection];
  if (!fields || !isObj(raw) || !isObj(local)) return incoming;
  const out = { ...incoming } as Record<string, unknown>;
  for (const f of fields) if (!(f in raw) && f in local) out[f] = local[f];
  return out as unknown as Collections[K][number];
}

const RECT = ['x', 'y', 'w', 'h'] as const;
const hasRect = (w: unknown) => isObj(w) && RECT.every((k) => typeof w[k] === 'number');

/** Settings from an older copy have no saved views and no widget positions; keep this device's. */
export function keepSettingsOlderCopiesDrop(raw: unknown, incoming: Settings, local: Settings): Settings {
  if (!isObj(raw)) return incoming;
  const out: Settings = { ...incoming };
  if (!('views' in raw)) out.views = local.views;
  const rawWidgets = Array.isArray(raw.widgets) ? raw.widgets : [];
  if (rawWidgets.length && !rawWidgets.some(hasRect)) {
    // Keep visibility and order from the incoming record, and this device's positions.
    const localById = new Map(local.widgets.map((w) => [w.id, w]));
    out.widgets = placeWidgets(
      incoming.widgets.map((w): WidgetPref => {
        const { x: _x, y: _y, w: _w, h: _h, ...rest } = w;
        const mine = localById.get(w.id);
        return mine && hasRect(mine) ? { ...rest, x: mine.x, y: mine.y, w: mine.w, h: mine.h } : rest;
      }),
    );
  }
  return out;
}
