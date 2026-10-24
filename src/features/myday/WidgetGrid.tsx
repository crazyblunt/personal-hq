import { EyeOff } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useMediaQuery, WIDE_QUERY } from '../../app/media';
import type { WidgetPref } from '../../data/types';
import { stackOrder } from '../../lib/grid';
import { cn } from '../../lib/util';
import { Panel } from '../../ui/bits';
import { Button } from '../../ui/controls';
import { WIDGETS } from './widgets';

type Placed = WidgetPref & { x: number; y: number; w: number; h: number };
const isPlaced = (w: WidgetPref): w is Placed => w.enabled && [w.x, w.y, w.w, w.h].every((v) => typeof v === 'number');

/**
 * My Day's widgets: a 12-column grid with explicit positions on wide
 * screens, one stacked column (in grid reading order) on narrow ones.
 */
export function WidgetGrid({ widgets, customizing, onChange }: { widgets: WidgetPref[]; customizing: boolean; onChange: (next: WidgetPref[]) => void }) {
  const wide = useMediaQuery(WIDE_QUERY);
  const placed = stackOrder(widgets.filter(isPlaced));
  const hide = (id: string) => onChange(widgets.map((w) => (w.id === id ? { ...w, enabled: false } : w)));

  const renderWidget = (w: Placed, style?: CSSProperties) => {
    const def = WIDGETS[w.id];
    const Icon = def.icon;
    const titleId = `widget-${w.id}-title`;
    return (
      <div key={w.id} style={style} className={cn('min-w-0', wide && 'min-h-0')}>
        <Panel
          title={def.title}
          titleId={titleId}
          icon={<Icon />}
          className={cn(wide && 'h-full', customizing && 'outline outline-1 outline-dashed outline-line-strong')}
          bodyClassName={cn(wide && 'min-h-0 overflow-auto')}
          tools={
            customizing ? (
              <Button size="iconSm" variant="ghost" aria-label={`Hide ${def.title}`} onClick={() => hide(w.id)}>
                <EyeOff className="size-3" />
              </Button>
            ) : (
              def.tools?.()
            )
          }
        >
          {def.render()}
        </Panel>
      </div>
    );
  };

  if (!wide) return <div className="flex flex-col gap-2">{placed.map((w) => renderWidget(w))}</div>;
  return (
    <div className="grid grid-cols-12 gap-2" style={{ gridAutoRows: '2rem' }}>
      {placed.map((w) => renderWidget(w, { gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }))}
    </div>
  );
}
