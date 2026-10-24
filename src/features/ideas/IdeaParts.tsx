import { Bell, FileText, FolderKanban, Lightbulb, Link2, ListChecks, MessageCircle, NotebookPen, Route as RouteIcon, Star, Trash2, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../../app/clock';
import { navigate } from '../../app/router';
import { confirmAction, openEditor, toast } from '../../app/ui';
import { refTitle } from '../../data/linking';
import { convertIdea, createIdea, createTask, deleteIdea, ideaTitle, updateIdea, useHQ, type ConvertTarget } from '../../data/store';
import { IDEA_KIND_LABEL, type Idea, type IdeaKind } from '../../data/types';
import { relativeDay, relativeTime } from '../../lib/dates';
import { parseQuickTask } from '../../lib/quickAdd';
import { cn, hostOf } from '../../lib/util';
import { ExtLink, ProjectChip, Segmented } from '../../ui/bits';
import { Button } from '../../ui/controls';
import { KIND_LABEL, openRef, useConnections } from '../../ui/LinkedItems';

export const KIND_ICON: Record<IdeaKind, LucideIcon> = { idea: Lightbulb, link: Link2, thought: MessageCircle, plan: RouteIcon, reminder: Bell };

export function convertAndOpen(id: string, to: ConvertTarget) {
  const created = convertIdea(id, to);
  if (!created) return;
  toast(`Created a ${to} from this idea`);
  if (to === 'task') openEditor({ kind: 'task', id: created.id });
  else if (to === 'note') navigate('notes', created.id);
  else navigate('projects', created.id);
}

export function confirmDeleteIdea(idea: Idea) {
  confirmAction({
    title: 'Delete this idea?',
    body: `“${ideaTitle(idea)}” will be permanently removed. Archive it instead to keep it out of the way.`,
    confirmLabel: 'Delete idea',
    onConfirm: () => {
      deleteIdea(idea.id);
      toast('Idea deleted');
    },
  });
}

/** Compact idea card with one-click organizing actions. */
export function IdeaCard({ idea, inboxActions = false }: { idea: Idea; inboxActions?: boolean }) {
  const today = useToday();
  const connections = useConnections({ kind: 'idea', id: idea.id });
  const became = connections.filter((c) => c.relation === 'converted-to');
  const linkCount = connections.length - became.length;
  const ws = useHQ(useShallow((s) => ({ tasks: s.tasks, notes: s.notes, ideas: s.ideas, projects: s.projects })));
  const Icon = KIND_ICON[idea.kind];
  const title = ideaTitle(idea);
  const rest = idea.title.trim() ? idea.body : idea.body.split('\n').slice(1).join('\n').trim();
  return (
    <article aria-label={title} className={cn('flex min-w-0 flex-col border border-line bg-panel', idea.archived && 'opacity-60')}>
      <header className="flex h-6 items-center gap-1.5 border-b border-line bg-bar pr-1 pl-2">
        <Icon className="size-3 shrink-0 text-muted" aria-hidden="true" />
        <span className="font-mono text-2xs tracking-wider text-muted uppercase">{IDEA_KIND_LABEL[idea.kind]}</span>
        {idea.inbox && <span className="font-mono text-2xs text-purple">· INBOX</span>}
        <span className="ml-auto font-mono text-2xs text-subtle" title={new Date(idea.createdAt).toLocaleString()}>
          {relativeTime(idea.createdAt)}
        </span>
        <button
          type="button"
          onClick={() => updateIdea(idea.id, { favorite: !idea.favorite })}
          aria-pressed={idea.favorite}
          aria-label={idea.favorite ? `Unfavorite ${title}` : `Favorite ${title}`}
          className={cn('grid size-5 place-items-center', idea.favorite ? 'text-warn' : 'text-subtle hover:text-warn')}
        >
          <Star className={cn('size-3.5', idea.favorite && 'fill-current')} />
        </button>
      </header>
      <button type="button" onClick={() => openEditor({ kind: 'idea', id: idea.id })} className="flex flex-1 flex-col gap-0.5 px-2 py-1.5 text-left hover:bg-bar/40">
        <span className="text-sm font-bold break-words">{title}</span>
        {rest && <span className="line-clamp-3 text-sm break-words whitespace-pre-line text-muted">{rest}</span>}
      </button>
      {became.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2 pb-1">
          {became.map((c) => (
            <button key={c.ref.id} type="button" onClick={() => openRef(c.ref)} className="max-w-full truncate border border-ok-fill/60 bg-ok-fill/10 px-1 text-left font-mono text-2xs text-ok hover:underline">
              → {KIND_LABEL[c.ref.kind]}: {refTitle(c.ref, ws)}
            </button>
          ))}
        </div>
      )}
      {(idea.url || idea.tags.length > 0 || idea.projectId || idea.remindOn || linkCount > 0) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 pb-1.5">
          {idea.url && (
            <ExtLink href={idea.url} className="max-w-48 truncate text-xs text-info">
              ↗ {hostOf(idea.url)}
            </ExtLink>
          )}
          {idea.remindOn && <span className={cn('font-mono text-2xs', idea.remindOn < today ? 'text-bad' : 'text-warn')}>⏰ {relativeDay(idea.remindOn, today)}</span>}
          <ProjectChip projectId={idea.projectId} />
          {linkCount > 0 && (
            <span className="flex items-center gap-0.5 font-mono text-2xs text-subtle" aria-label={`${linkCount} link${linkCount === 1 ? '' : 's'}`} title="Linked items (open the idea to see them)">
              <Link2 className="size-3" aria-hidden="true" />
              {linkCount}
            </span>
          )}
          {idea.tags.map((t) => (
            <span key={t} className="font-mono text-2xs text-subtle">
              #{t}
            </span>
          ))}
        </div>
      )}
      <footer className="flex flex-wrap items-center gap-1 border-t border-line px-1 py-1">
        <Button size="xs" variant="ghost" onClick={() => convertAndOpen(idea.id, 'task')} title="Make a task from this idea">
          <ListChecks className="size-3" aria-hidden="true" /> Task
        </Button>
        <Button size="xs" variant="ghost" onClick={() => convertAndOpen(idea.id, 'note')} title="Make a note from this idea">
          <NotebookPen className="size-3" aria-hidden="true" /> Note
        </Button>
        <Button size="xs" variant="ghost" onClick={() => convertAndOpen(idea.id, 'project')} title="Start a project from this idea">
          <FolderKanban className="size-3" aria-hidden="true" /> Project
        </Button>
        {inboxActions && idea.inbox && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              updateIdea(idea.id, { inbox: false });
              toast('Filed under Ideas');
            }}
            title="Keep it as an idea and take it out of the Inbox"
          >
            <FileText className="size-3" aria-hidden="true" /> Keep as idea
          </Button>
        )}
        <Button size="xs" variant="ghost" className="ml-auto text-subtle hover:text-bad" aria-label={`Delete ${title}`} onClick={() => confirmDeleteIdea(idea)}>
          <Trash2 className="size-3" />
        </Button>
      </footer>
    </article>
  );
}

/** The capture box used on Inbox and Ideas. Enter saves; nothing else is required. */
export function CaptureBox({ allowTask = false, autoFocus = false }: { allowTask?: boolean; autoFocus?: boolean }) {
  const today = useToday();
  const [text, setText] = useState('');
  const [as, setAs] = useState<'idea' | 'task'>('idea');
  const save = () => {
    const v = text.trim();
    if (!v) return;
    if (as === 'task') {
      const q = parseQuickTask(v, today);
      if (!q.title) return;
      createTask({ title: q.title, priority: q.priority, category: q.category ?? '', tags: q.tags, dueDate: q.dueDate ?? null, status: 'inbox' });
      toast('Task added to Inbox');
    } else {
      createIdea({ body: v });
      toast('Captured');
    }
    setText('');
  };
  return (
    <div className="mb-2 flex flex-col gap-1.5 border border-line bg-panel p-2 sm:flex-row sm:items-start">
      <textarea
        id="capture-box"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          }
        }}
        rows={2}
        autoFocus={autoFocus}
        placeholder={as === 'task' ? 'A task… (!high #school due:fri)' : 'Dump anything here: an idea, a link, a thought, a plan, a reminder. Enter saves, Shift+Enter adds a line.'}
        aria-label="Capture"
        className="min-h-14 w-full flex-1 resize-y bevel-in bg-inset px-2 py-1.5 text-sm placeholder:text-subtle"
      />
      <div className="flex gap-1.5 sm:flex-col">
        {allowTask && (
          <Segmented
            size="sm"
            label="Capture as"
            value={as}
            onChange={setAs}
            options={[
              { value: 'idea', label: 'Idea' },
              { value: 'task', label: 'Task' },
            ]}
          />
        )}
        <Button variant="primary" onClick={save} disabled={!text.trim()}>
          Capture
        </Button>
      </div>
    </div>
  );
}
