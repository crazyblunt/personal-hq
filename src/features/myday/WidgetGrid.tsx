import { EyeOff, GripVertical } from 'lucide-react';
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useMediaQuery, WIDE_QUERY } from '../../app/media';
import { sizeForWidth, WIDGET_SIZE_HINTS } from '../../data/defaults';
import type { WidgetId, WidgetPref } from '../../data/types';
import { cellFromPoint, clampRect, firstFit, moveTo, resizeTo, stackOrder, tidy, type GridItem, type Rect } from '../../lib/grid';
import { cn } from '../../lib/util';
import { Panel } from '../../ui/bits';
import { Button } from '../../ui/controls';
import { WIDGETS } from './widgets';

type Placed = WidgetPref & Rect;
const isPlaced = (w: WidgetPref): w is Placed => w.enabled && [w.x, w.y, w.w, w.h].every((v) => typeof v === 'number');
const minFor = (id: string) => WIDGET_SIZE_HINTS[id as WidgetId];
const itemsOf = (widgets: WidgetPref[]): GridItem[] => widgets.filter(isPlaced).map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h }));

/** Writes grid positions back onto the widget list, keeping the old S/M/L size in step. */
export function withItems(widgets: WidgetPref[], items: GridItem[]): WidgetPref[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return widgets.map((w) => {
    const r = byId.get(w.id);
    return r ? { ...w, x: r.x, y: r.y, w: r.w, h: r.h, size: sizeForWidth(r.w) } : w;
  });
}

/** Shows a hidden widget at the first free spot that fits its default size. */
export function showWidget(widgets: WidgetPref[], id: WidgetId): WidgetPref[] {
  const hint = WIDGET_SIZE_HINTS[id];
  const spot = firstFit(itemsOf(widgets), hint.w, hint.h);
  return widgets.map((w) => (w.id === id ? { ...w, enabled: true, ...spot, w: hint.w, h: hint.h, size: sizeForWidth(hint.w) } : w));
}

export function tidyWidgets(widgets: WidgetPref[]): WidgetPref[] {
  return withItems(widgets, tidy(itemsOf(widgets)));
}

const KEY_STEP: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

interface Drag {
  id: string;
  mode: 'move' | 'resize';
  /** For moves: the grabbed cell's offset from the widget's top-left cell. */
  dx: number;
  dy: number;
  preview: Rect;
}

/**
 * My Day's widgets: a 12-column grid with explicit positions on wide
 * screens, one stacked column (in grid reading order) on narrow ones.
 * In customize mode, title bars drag, a corner grip resizes, and the grip
 * button moves (arrows) or resizes (Shift+arrows) from the keyboard.
 */
export function WidgetGrid({ widgets, customizing, onChange }: { widgets: WidgetPref[]; customizing: boolean; onChange: (next: WidgetPref[]) => void }) {
  const wide = useMediaQuery(WIDE_QUERY);
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const placed = stackOrder(widgets.filter(isPlaced));
  const arranging = wide && customizing;

  const hide = (id: string) => onChange(widgets.map((w) => (w.id === id ? { ...w, enabled: false } : w)));
  const commit = (items: GridItem[], id: string, kind: 'move' | 'resize') => {
    onChange(withItems(widgets, items));
    const r = items.find((i) => i.id === id)!;
    const title = WIDGETS[id as WidgetId].title;
    setAnnouncement(kind === 'move' ? `${title} moved to column ${r.x + 1}, row ${r.y + 1}` : `${title} resized to ${r.w} by ${r.h}`);
  };

  /** The grid cell under the pointer, from the grid's live box and the root font size (rows are 2rem, gaps 0.5rem). */
  const cellAt = (e: PointerEvent) => {
    const box = gridRef.current!.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return cellFromPoint({ x: e.clientX, y: e.clientY }, box, rem * 2, rem * 0.5);
  };

  const startDrag = (e: PointerEvent<HTMLElement>, w: Placed, mode: Drag['mode']) => {
    if (e.button !== 0 || !gridRef.current) return;
    if (mode === 'move' && (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const cell = cellAt(e);
    setDrag({ id: w.id, mode, dx: cell.x - w.x, dy: cell.y - w.y, preview: { x: w.x, y: w.y, w: w.w, h: w.h } });
  };
  const moveDrag = (e: PointerEvent, w: Placed) => {
    if (!drag || drag.id !== w.id) return;
    const cell = cellAt(e);
    const preview =
      drag.mode === 'move'
        ? clampRect({ x: cell.x - drag.dx, y: cell.y - drag.dy, w: w.w, h: w.h }, minFor(w.id))
        : clampRect({ x: w.x, y: w.y, w: cell.x - w.x + 1, h: cell.y - w.y + 1 }, minFor(w.id));
    if (preview.x !== drag.preview.x || preview.y !== drag.preview.y || preview.w !== drag.preview.w || preview.h !== drag.preview.h) setDrag({ ...drag, preview });
  };
  const endDrag = (w: Placed) => {
    if (!drag || drag.id !== w.id) return;
    const { preview, mode } = drag;
    setDrag(null);
    if (preview.x === w.x && preview.y === w.y && preview.w === w.w && preview.h === w.h) return;
    const items = itemsOf(widgets);
    commit(mode === 'move' ? moveTo(items, w.id, preview, minFor) : resizeTo(items, w.id, preview, minFor), w.id, mode);
  };

  const onHandleKey = (e: KeyboardEvent, w: Placed) => {
    const step = KEY_STEP[e.key];
    if (!step) return;
    e.preventDefault();
    const items = itemsOf(widgets);
    if (e.shiftKey) commit(resizeTo(items, w.id, { w: w.w + step[0], h: w.h + step[1] }, minFor), w.id, 'resize');
    else commit(moveTo(items, w.id, { x: w.x + step[0], y: w.y + step[1] }, minFor), w.id, 'move');
  };

  const renderWidget = (w: Placed, style?: CSSProperties) => {
    const def = WIDGETS[w.id];
    const Icon = def.icon;
    const dragging = drag?.id === w.id;
    return (
      <div key={w.id} style={style} className={cn('relative min-w-0', wide && 'min-h-0', dragging && 'opacity-60')}>
        <Panel
          title={def.title}
          titleId={`widget-${w.id}-title`}
          icon={<Icon />}
          className={cn(wide && 'h-full', customizing && 'outline outline-1 outline-dashed outline-line-strong')}
          bodyClassName={cn(wide && 'min-h-0 overflow-auto')}
          headerProps={
            arranging
              ? {
                  className: 'cursor-move touch-none select-none',
                  onPointerDown: (e) => startDrag(e, w, 'move'),
                  onPointerMove: (e) => moveDrag(e, w),
                  onPointerUp: () => endDrag(w),
                  onPointerCancel: () => setDrag(null),
                }
              : undefined
          }
          tools={
            customizing ? (
              <>
                {arranging && (
                  <Button size="iconSm" variant="ghost" aria-label={`Move or resize ${def.title}`} aria-roledescription="movable widget" title="Arrows move · Shift+arrows resize" onKeyDown={(e) => onHandleKey(e, w)}>
                    <GripVertical className="size-3" />
                  </Button>
                )}
                <Button size="iconSm" variant="ghost" aria-label={`Hide ${def.title}`} onClick={() => hide(w.id)}>
                  <EyeOff className="size-3" />
                </Button>
              </>
            ) : (
              def.tools?.()
            )
          }
        >
          {def.render()}
        </Panel>
        {arranging && (
          <span
            aria-hidden="true"
            title="Drag to resize"
            onPointerDown={(e) => startDrag(e, w, 'resize')}
            onPointerMove={(e) => moveDrag(e, w)}
            onPointerUp={() => endDrag(w)}
            onPointerCancel={() => setDrag(null)}
            className="absolute right-0 bottom-0 size-3 cursor-nwse-resize touch-none border-t border-l border-line-strong bg-raised"
          />
        )}
      </div>
    );
  };

  const live = (
    <div aria-live="polite" className="sr-only">
      {announcement}
    </div>
  );

  if (!wide)
    return (
      <div className="flex flex-col gap-2">
        {placed.map((w) => renderWidget(w))}
        {live}
      </div>
    );
  return (
    <div ref={gridRef} className="relative grid grid-cols-12 gap-2" style={{ gridAutoRows: '2rem' }}>
      {placed.map((w) => renderWidget(w, { gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }))}
      {drag && (
        <div
          aria-hidden="true"
          className="pointer-events-none border-2 border-dashed border-accent bg-accent/10"
          style={{ gridColumn: `${drag.preview.x + 1} / span ${drag.preview.w}`, gridRow: `${drag.preview.y + 1} / span ${drag.preview.h}` }}
        />
      )}
      {live}
    </div>
  );
}
