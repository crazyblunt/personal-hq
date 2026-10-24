/**
 * A small layout engine for a fixed-column grid (My Day). Positions are in
 * grid cells. Every function is pure: it returns new objects and never
 * changes its input.
 *
 * Collisions push widgets down; nothing floats up on its own, so gaps can be
 * left on purpose. `tidy` closes them on request.
 */

export const GRID_COLS = 12;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridItem extends Rect {
  id: string;
}

export interface SizeHint {
  w: number;
  h: number;
  minW: number;
  minH: number;
}

type MinSize = { minW: number; minH: number };

export function collides(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Rounds to whole cells and keeps the rect on the grid and at least its minimum size. */
export function clampRect(r: Rect, min: MinSize, cols = GRID_COLS): Rect {
  const num = (v: number, fallback: number) => (Number.isFinite(v) ? Math.round(v) : fallback);
  const w = Math.min(cols, Math.max(min.minW, num(r.w, min.minW)));
  const h = Math.max(min.minH, num(r.h, min.minH));
  const x = Math.min(cols - w, Math.max(0, num(r.x, 0)));
  const y = Math.max(0, num(r.y, 0));
  return { x, y, w, h };
}

/** The first position, scanning rows top to bottom and cells left to right, where a w×h rect fits. */
export function firstFit(taken: Rect[], w: number, h: number, cols = GRID_COLS): { x: number; y: number } {
  const width = Math.min(w, cols);
  const bottom = taken.reduce((m, r) => Math.max(m, r.y + r.h), 0);
  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + width <= cols; x++) {
      const probe = { x, y, w: width, h };
      if (!taken.some((r) => collides(probe, r))) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}

/** Keeps `fixedId` where it is and moves every widget that overlaps something above it down until nothing overlaps. */
export function pushDown(items: GridItem[], fixedId: string): GridItem[] {
  const fixed = items.find((i) => i.id === fixedId);
  if (!fixed) return items.map((i) => ({ ...i }));
  const settled: GridItem[] = [{ ...fixed }];
  const others = items
    .filter((i) => i.id !== fixedId)
    .map((i) => ({ ...i }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const item of others) {
    for (;;) {
      const hits = settled.filter((s) => collides(item, s));
      if (!hits.length) break;
      item.y = Math.max(...hits.map((s) => s.y + s.h));
    }
    settled.push(item);
  }
  const byId = new Map(settled.map((i) => [i.id, i]));
  return items.map((i) => byId.get(i.id)!);
}

export function moveTo(items: GridItem[], id: string, to: { x: number; y: number }, min: (id: string) => MinSize, cols = GRID_COLS): GridItem[] {
  const cur = items.find((i) => i.id === id);
  if (!cur) return items;
  const rect = clampRect({ ...cur, x: to.x, y: to.y }, min(id), cols);
  return pushDown(
    items.map((i) => (i.id === id ? { ...i, ...rect } : i)),
    id,
  );
}

export function resizeTo(items: GridItem[], id: string, size: { w: number; h: number }, min: (id: string) => MinSize, cols = GRID_COLS): GridItem[] {
  const cur = items.find((i) => i.id === id);
  if (!cur) return items;
  const rect = clampRect({ ...cur, w: size.w, h: size.h }, min(id), cols);
  return pushDown(
    items.map((i) => (i.id === id ? { ...i, ...rect } : i)),
    id,
  );
}

/** Moves every widget up as far as it can go, top to bottom, keeping columns and order. */
export function tidy(items: GridItem[]): GridItem[] {
  const placed: GridItem[] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const next = { ...item };
    while (next.y > 0 && !placed.some((p) => collides({ ...next, y: next.y - 1 }, p))) next.y--;
    placed.push(next);
  }
  const byId = new Map(placed.map((i) => [i.id, i]));
  return items.map((i) => byId.get(i.id)!);
}

/** Reading order: top to bottom, then left to right. Used to stack widgets on narrow screens. */
export function stackOrder<T extends Rect>(items: T[]): T[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The grid cell under a pointer position, given the grid's box and its row height and gap in pixels. */
export function cellFromPoint(p: { x: number; y: number }, grid: { left: number; top: number; width: number }, rowPx: number, gapPx: number, cols = GRID_COLS): { x: number; y: number } {
  const colW = (grid.width - gapPx * (cols - 1)) / cols;
  const x = Math.floor((p.x - grid.left) / (colW + gapPx));
  const y = Math.floor((p.y - grid.top) / (rowPx + gapPx));
  return { x: Math.min(cols - 1, Math.max(0, x)), y: Math.max(0, y) };
}
