import { ArrowUpToLine, LayoutGrid, Plus, RotateCcw, Sparkles, Sun } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../../app/clock';
import { useMediaQuery, WIDE_QUERY } from '../../app/media';
import { confirmAction, openAskClaude, setMyDayCustomize, useUI } from '../../app/ui';
import { DEFAULT_WIDGETS } from '../../data/defaults';
import { calendarItems, isMyDayTask, isOverdue } from '../../data/selectors';
import { updateSettings, useHQ } from '../../data/store';
import type { WidgetPref } from '../../data/types';
import { formatDate } from '../../lib/dates';
import { plural } from '../../lib/util';
import { PageHeader } from '../../ui/bits';
import { Button } from '../../ui/controls';
import { showWidget, tidyWidgets, WidgetGrid } from './WidgetGrid';
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
  const customizing = useUI((s) => s.myDayCustomize);
  const wide = useMediaQuery(WIDE_QUERY);
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
            {!customizing && (
              <Button variant="ghost" onClick={() => openAskClaude({ job: 'plan' })} title="Claude suggests what to put on today's list. You see exactly what is shared first.">
                <Sparkles className="size-3.5" aria-hidden="true" /> Plan with Claude
              </Button>
            )}
            <Button variant={customizing ? 'primary' : 'secondary'} onClick={() => setMyDayCustomize(!customizing)} aria-pressed={customizing}>
              <LayoutGrid className="size-3.5" aria-hidden="true" /> {customizing ? 'Done customizing' : 'Customize'}
            </Button>
          </>
        }
      />

      {customizing && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 border border-dashed border-line-strong bg-inset px-2 py-1.5 text-sm">
          <span className="text-muted">
            {wide ? 'Drag a title bar to move a widget and its corner to resize it. Keyboard: focus the grip, then arrows move and Shift+arrows resize.' : 'Arrange widgets on a wider screen (1024px or more). Here you can show or hide them.'}
          </span>
          {wide && (
            <Button size="sm" onClick={() => save(tidyWidgets(widgets))} title="Move widgets up to close gaps">
              <ArrowUpToLine className="size-3" aria-hidden="true" /> Tidy up
            </Button>
          )}
          {hidden.length > 0 && <span className="ml-2 font-mono text-2xs tracking-wider text-subtle uppercase">Hidden:</span>}
          {hidden.map((w) => (
            <Button key={w.id} size="sm" onClick={() => save(showWidget(widgets, w.id))} title={WIDGETS[w.id].description}>
              <Plus className="size-3" aria-hidden="true" /> {WIDGETS[w.id].title}
            </Button>
          ))}
        </div>
      )}

      {enabled.length === 0 ? (
        <div className="border border-line bg-panel p-6 text-center text-sm text-muted">
          All widgets are hidden.{' '}
          <button type="button" className="text-accent hover:underline" onClick={() => setMyDayCustomize(true)}>
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
