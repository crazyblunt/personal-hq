import { CalendarClock, Inbox, ListChecks, ScanSearch, Sparkles, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../../app/clock';
import { confirmAction, openEditor, openAskClaude, openOrganize, toast } from '../../app/ui';
import { deleteTask, updateTask, useHQ } from '../../data/store';
import { relativeTime } from '../../lib/dates';
import { DueChip, EmptyState, PageHeader, Panel, PriorityBadge } from '../../ui/bits';
import { Button } from '../../ui/controls';
import { CaptureBox, IdeaCard } from '../ideas/IdeaParts';

export function InboxPage() {
  const today = useToday();
  const ideas = useHQ(useShallow((s) => s.ideas.filter((i) => i.inbox && !i.archived)));
  const tasks = useHQ(useShallow((s) => s.tasks.filter((t) => t.status === 'inbox')));
  const sortedIdeas = useMemo(() => [...ideas].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [ideas]);
  const total = ideas.length + tasks.length;

  return (
    <>
      <PageHeader
        title="Inbox"
        icon={Inbox}
        description={total ? `${total} item${total === 1 ? '' : 's'} waiting to be organized` : 'Everything is organized'}
        actions={
          <>
            <Button onClick={openOrganize} title="Rule-based suggestions, shown before anything changes">
              <ScanSearch className="size-3.5" aria-hidden="true" /> Organize review
            </Button>
            <Button onClick={() => openAskClaude({ job: 'organize' })} title="Claude suggestions for your Inbox ideas. You see exactly what is shared first.">
              <Sparkles className="size-3.5" aria-hidden="true" /> Ask Claude
            </Button>
          </>
        }
      />
      <CaptureBox allowTask autoFocus />

      {total === 0 ? (
        <div className="border border-line bg-panel">
          <EmptyState icon={Inbox} title="Inbox zero">
            Captured ideas and quick tasks wait here until you turn them into tasks, notes, or projects, or keep them as ideas.
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.length > 0 && (
            <Panel title={`Tasks to plan (${tasks.length})`} icon={<ListChecks />}>
              <ul>
                {tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 border-b border-line px-2 py-1.5 last:border-b-0">
                    <button type="button" onClick={() => openEditor({ kind: 'task', id: t.id })} className="min-w-0 flex-1 truncate text-left text-sm hover:underline">
                      {t.title}
                    </button>
                    <PriorityBadge priority={t.priority} hideMedium />
                    {t.dueDate && <DueChip date={t.dueDate} today={today} />}
                    <span className="font-mono text-2xs text-subtle">{relativeTime(t.createdAt)}</span>
                    <Button
                      size="xs"
                      onClick={() => {
                        updateTask(t.id, { status: 'planned' });
                        toast('Moved to Planned');
                      }}
                    >
                      Plan it
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => {
                        updateTask(t.id, { status: 'planned', myDay: today });
                        toast('Planned for today');
                      }}
                    >
                      <CalendarClock className="size-3" aria-hidden="true" /> Today
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-subtle hover:text-bad"
                      aria-label={`Delete ${t.title}`}
                      onClick={() =>
                        confirmAction({
                          title: 'Delete this task?',
                          body: `“${t.title}” will be permanently removed.`,
                          confirmLabel: 'Delete task',
                          onConfirm: () => {
                            deleteTask(t.id);
                            toast('Task deleted');
                          },
                        })
                      }
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {sortedIdeas.length > 0 && (
            <section aria-label="Captured ideas">
              <h2 className="mb-1 font-mono text-2xs font-semibold tracking-wider text-muted uppercase">Captured ({sortedIdeas.length})</h2>
              <div className="grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {sortedIdeas.map((i) => (
                  <IdeaCard key={i.id} idea={i} inboxActions />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
