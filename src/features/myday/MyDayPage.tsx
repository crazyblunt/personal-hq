import { ChevronLeft, ChevronRight, EyeOff, LayoutGrid, Plus, RotateCcw, Sun } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../../app/clock';
import { confirmAction } from '../../app/ui';
import { DEFAULT_WIDGETS } from '../../data/defaults';
import { calendarItems, isMyDayTask, isOverdue } from '../../data/selectors';
import { updateSettings, useHQ } from '../../data/store';
import { WIDGET_SIZES, type WidgetPref, type WidgetSize } from '../../data/types';
import { formatDate } from '../../lib/dates';
import { cn, plural } from '../../lib/util';
import { PageHeader, Panel } from '../../ui/bits';
import { Button } from '../../ui/controls';
import { WIDGETS } from './widgets';

const SPAN: Record<WidgetSize, string> = {
  sm: '',
  md: 'md:col-span-2',
  lg: 'md:col-span-2 xl:col-span-3',
};
const SIZE_LABEL: Record<WidgetSize, string> = { sm: 'S', md: 'M', lg: 'L' };

export function moveWidget(widgets: WidgetPref[], id: string, toIndex: number): WidgetPref[] {
  const from = widgets.findIndex((w) => w.id === id);
  if (from === -1) return widgets;
  const next = [...widgets];
  const [w] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, w);
  return next;
}

export function MyDayPage() {
  const today = useToday();
  const widgets = useHQ((s) => s.settings.widgets);
  const summary = useHQ(
    useShallow((s) => ({
      today: s.tasks.filter((t) => isMyDayTask(t, today)).length,
      overdue: s.tasks.filter((t) => isOverdue(t, today)).length,
      events: s.events.length ? calendarItems({ tasks: [], events: s.events, projects: [] }, today, today, today).length : 0,
      inbox: s.ideas.filter((i) => i.inbox && !i.archived).length + s.tasks.filter((t) => t.status === 'inbox').length,
    })),
  );
  const [customizing, setCustomizing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const enabled = widgets.filter((w) => w.enabled);
  const hidden = widgets.filter((w) => !w.enabled);

  const save = (next: WidgetPref[]) => updateSettings({ widgets: next });
  const patchWidget = (id: string, change: Partial<WidgetPref>) => save(widgets.map((w) => (w.id === id ? { ...w, ...change } : w)));
  const shift = (id: WidgetPref['id'], dir: -1 | 1) => {
    const visible = enabled.map((w) => w.id);
    const i = visible.indexOf(id);
    const target = visible[i + dir];
    if (!target) return;
    save(moveWidget(widgets, id, widgets.findIndex((w) => w.id === target)));
  };

  const descParts = [plural(summary.today, 'task'), summary.overdue ? `${summary.overdue} overdue` : null, summary.events ? plural(summary.events, 'event') : null, summary.inbox ? `${summary.inbox} in Inbox` : null].filter(Boolean);

  return (
    <>
      <PageHeader
        title="My Day"
        icon={Sun}
        description={`${formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' })} · ${descParts.join(' · ')}`}
        actions={
          <>
            {customizing && (
              <Button
                variant="ghost"
                onClick={() =>
                  confirmAction({
                    title: 'Reset the dashboard layout?',
                    body: 'Widget order, sizes, and visibility go back to the defaults. Your data is not affected.',
                    confirmLabel: 'Reset layout',
                    danger: false,
                    onConfirm: () => save(DEFAULT_WIDGETS.map((w) => ({ ...w }))),
                  })
                }
              >
                <RotateCcw className="size-3.5" aria-hidden="true" /> Reset layout
              </Button>
            )}
            <Button variant={customizing ? 'primary' : 'secondary'} onClick={() => setCustomizing((v) => !v)} aria-pressed={customizing}>
              <LayoutGrid className="size-3.5" aria-hidden="true" /> {customizing ? 'Done customizing' : 'Customize'}
            </Button>
          </>
        }
      />

      {customizing && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 border border-dashed border-line-strong bg-inset px-2 py-1.5 text-sm">
          <span className="text-muted">Drag widgets by their title bar, or use the arrows. S/M/L sets the width.</span>
          {hidden.length > 0 && <span className="ml-2 font-mono text-2xs tracking-wider text-subtle uppercase">Hidden:</span>}
          {hidden.map((w) => (
            <Button key={w.id} size="sm" onClick={() => save([...widgets.filter((x) => x.id !== w.id), { ...w, enabled: true }])} title={WIDGETS[w.id].description}>
              <Plus className="size-3" aria-hidden="true" /> {WIDGETS[w.id].title}
            </Button>
          ))}
        </div>
      )}

      {enabled.length === 0 ? (
        <div className="border border-line bg-panel p-6 text-center text-sm text-muted">
          All widgets are hidden.{' '}
          <button type="button" className="text-accent hover:underline" onClick={() => setCustomizing(true)}>
            Customize
          </button>{' '}
          to add some back.
        </div>
      ) : (
        <div className="grid grid-flow-row-dense grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
          {enabled.map((w, i) => {
            const def = WIDGETS[w.id];
            const Icon = def.icon;
            return (
              <div
                key={w.id}
                className={cn(SPAN[w.size], dragId === w.id && 'opacity-50')}
                draggable={customizing}
                onDragStart={(e) => {
                  if (!customizing) return;
                  e.dataTransfer.setData('text/x-widget', w.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDragId(w.id);
                }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => customizing && e.preventDefault()}
                onDrop={(e) => {
                  if (!customizing) return;
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/x-widget') || dragId;
                  if (id && id !== w.id) save(moveWidget(widgets, id, widgets.findIndex((x) => x.id === w.id)));
                  setDragId(null);
                }}
              >
                <Panel
                  title={def.title}
                  icon={<Icon />}
                  className={cn(customizing && 'outline outline-1 outline-dashed outline-line-strong')}
                  tools={
                    customizing ? (
                      <>
                        <Button size="iconSm" variant="ghost" aria-label={`Move ${def.title} earlier`} disabled={i === 0} onClick={() => shift(w.id, -1)}>
                          <ChevronLeft className="size-3" />
                        </Button>
                        <Button size="iconSm" variant="ghost" aria-label={`Move ${def.title} later`} disabled={i === enabled.length - 1} onClick={() => shift(w.id, 1)}>
                          <ChevronRight className="size-3" />
                        </Button>
                        <span role="radiogroup" aria-label={`${def.title} width`} className="flex">
                          {WIDGET_SIZES.map((s) => (
                            <button
                              key={s}
                              type="button"
                              role="radio"
                              aria-checked={w.size === s}
                              onClick={() => patchWidget(w.id, { size: s })}
                              className={cn('-ml-px h-5 w-5 font-mono text-2xs first:ml-0', w.size === s ? 'bevel-in bg-inset text-fg' : 'bevel-out bg-raised text-muted')}
                            >
                              {SIZE_LABEL[s]}
                            </button>
                          ))}
                        </span>
                        <Button size="iconSm" variant="ghost" aria-label={`Hide ${def.title}`} onClick={() => patchWidget(w.id, { enabled: false })}>
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
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
