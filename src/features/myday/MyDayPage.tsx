import { LayoutGrid, Plus, RotateCcw, Sun } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../../app/clock';
import { confirmAction } from '../../app/ui';
import { DEFAULT_WIDGETS } from '../../data/defaults';
import { calendarItems, isMyDayTask, isOverdue } from '../../data/selectors';
import { updateSettings, useHQ } from '../../data/store';
import type { WidgetPref } from '../../data/types';
import { formatDate } from '../../lib/dates';
import { plural } from '../../lib/util';
import { PageHeader } from '../../ui/bits';
import { Button } from '../../ui/controls';
import { WidgetGrid } from './WidgetGrid';
import { WIDGETS } from './widgets';

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
  const enabled = widgets.filter((w) => w.enabled);
  const hidden = widgets.filter((w) => !w.enabled);

  const save = (next: WidgetPref[]) => updateSettings({ widgets: next });

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
        <WidgetGrid widgets={widgets} customizing={customizing} onChange={save} />
      )}
    </>
  );
}
