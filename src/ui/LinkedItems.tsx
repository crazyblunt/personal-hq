import { FolderKanban, Lightbulb, Link2, ListChecks, NotebookPen, X, type LucideIcon } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { navigate } from '../app/router';
import { closeEditor, openEditor } from '../app/ui';
import { buildLinkIndex, linkItems, refKey, refTitle, unlinkItems, type Connection, type Relation } from '../data/linking';
import { useHQ } from '../data/store';
import { ideaTitle, noteTitle } from '../data/titles';
import type { ItemRef, LinkableKind } from '../data/types';
import { scoreMatch } from '../lib/search';
import { cn } from '../lib/util';
import { Button } from './controls';

export const KIND_ICON: Record<LinkableKind, LucideIcon> = { task: ListChecks, note: NotebookPen, idea: Lightbulb, project: FolderKanban };
export const KIND_LABEL: Record<LinkableKind, string> = { task: 'Task', note: 'Note', idea: 'Idea', project: 'Project' };

const RELATION_LABEL: Record<Relation, string> = {
  linked: 'linked',
  'linked-from': 'linked from',
  source: 'source',
  'converted-to': 'converted to',
  'related-idea': 'related idea',
  'linked-task': 'linked task',
  'linked-note': 'linked note',
};

const EMPTY: Connection[] = [];

let cached: { key: unknown[]; index: Map<string, Connection[]> } | null = null;

/** The link index for the whole workspace, shared by every component and rebuilt only when one of the four collections changes. */
export function useLinkIndex(): Map<string, Connection[]> {
  const data = useHQ(useShallow((s) => ({ tasks: s.tasks, notes: s.notes, ideas: s.ideas, projects: s.projects })));
  return useMemo(() => {
    const key = [data.tasks, data.notes, data.ideas, data.projects];
    if (!cached || cached.key.some((k, i) => k !== key[i])) cached = { key, index: buildLinkIndex(data) };
    return cached.index;
  }, [data]);
}

export function useConnections(ref: ItemRef): Connection[] {
  return useLinkIndex().get(refKey(ref)) ?? EMPTY;
}

/** Opens a task or idea in its window, or a note or project on its page. */
export function openRef(ref: ItemRef) {
  if (ref.kind === 'task' || ref.kind === 'idea') openEditor({ kind: ref.kind, id: ref.id });
  else {
    closeEditor();
    navigate(ref.kind === 'note' ? 'notes' : 'projects', ref.id);
  }
}

function LinkPicker({ item, connected, onDone }: { item: ItemRef; connected: Set<string>; onDone: () => void }) {
  const [q, setQ] = useState('');
  const data = useHQ(useShallow((s) => ({ tasks: s.tasks, notes: s.notes, ideas: s.ideas, projects: s.projects })));
  const hits = useMemo(() => {
    if (!q.trim()) return [];
    const candidates: { ref: ItemRef; title: string; score: number }[] = [];
    const consider = (ref: ItemRef, title: string, ...rest: (string | string[])[]) => {
      if (refKey(ref) === refKey(item) || connected.has(refKey(ref))) return;
      const score = scoreMatch(q, title, ...rest);
      if (score > 0) candidates.push({ ref, title, score });
    };
    for (const t of data.tasks) consider({ kind: 'task', id: t.id }, t.title, t.tags);
    for (const n of data.notes) consider({ kind: 'note', id: n.id }, noteTitle(n), n.tags);
    for (const i of data.ideas) consider({ kind: 'idea', id: i.id }, ideaTitle(i), i.tags);
    for (const p of data.projects) consider({ kind: 'project', id: p.id }, p.name, p.tags);
    return candidates.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 8);
  }, [q, data, item, connected]);
  return (
    <div className="flex flex-col gap-1 border-t border-line p-1.5">
      <input
        type="text"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onDone();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (hits[0]) {
              linkItems(item, hits[0].ref);
              onDone();
            }
          }
        }}
        aria-label="Find an item to link"
        placeholder="Search tasks, notes, ideas, projects…"
        className="h-7 w-full bevel-in bg-inset px-2 text-sm placeholder:text-subtle"
      />
      {q.trim() && !hits.length && <p className="px-1 text-xs text-subtle">Nothing to link matches “{q}”.</p>}
      {hits.length > 0 && (
        <ul className="border border-line bg-inset">
          {hits.map((h) => {
            const Icon = KIND_ICON[h.ref.kind];
            return (
              <li key={refKey(h.ref)} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    linkItems(item, h.ref);
                    onDone();
                  }}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-bar"
                >
                  <Icon className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{h.title}</span>
                  <span className="font-mono text-2xs text-subtle uppercase">{KIND_LABEL[h.ref.kind]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Every connection of one item: links it added, items linking to it,
 * conversions, related ideas, and note–task links. `locked` disables
 * opening other items while the surrounding editor has unsaved edits.
 */
export function LinkedItems({ item, locked = false, className }: { item: ItemRef; locked?: boolean; className?: string }) {
  const connections = useConnections(item);
  const ws = useHQ(useShallow((s) => ({ tasks: s.tasks, notes: s.notes, ideas: s.ideas, projects: s.projects })));
  const [picking, setPicking] = useState(false);
  const headingId = useId();
  const connected = useMemo(() => new Set(connections.map((c) => refKey(c.ref))), [connections]);
  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col border border-line bg-panel', className)}>
      <header className="flex h-7 items-center gap-2 border-b border-line bg-bar px-2">
        <Link2 className="size-3.5 text-muted" aria-hidden="true" />
        <h3 id={headingId} className="flex-1 font-mono text-2xs font-semibold tracking-wider text-muted uppercase">
          Linked
        </h3>
        {!picking && (
          <Button size="xs" variant="ghost" onClick={() => setPicking(true)}>
            + Link…
          </Button>
        )}
      </header>
      {connections.length === 0 && !picking && <p className="px-2 py-1.5 text-xs text-subtle">No links yet. Link related tasks, notes, ideas, or projects.</p>}
      {connections.length > 0 && (
        <ul>
          {connections.map((c) => {
            const Icon = KIND_ICON[c.ref.kind];
            const title = refTitle(c.ref, ws) ?? '';
            return (
              <li key={refKey(c.ref)} className="flex items-center gap-2 border-b border-line px-2 py-0.5 text-sm last:border-b-0">
                <Icon className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                <button
                  type="button"
                  disabled={locked}
                  title={locked ? 'Save your changes first to open linked items' : undefined}
                  onClick={() => openRef(c.ref)}
                  className="min-w-0 flex-1 truncate text-left enabled:hover:underline disabled:cursor-not-allowed"
                >
                  {title}
                </button>
                <span className="shrink-0 font-mono text-2xs text-subtle">{RELATION_LABEL[c.relation]}</span>
                {c.removable && (
                  <Button size="iconSm" variant="ghost" aria-label={`Unlink ${title}`} onClick={() => unlinkItems(item, c.ref)}>
                    <X className="size-3" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {picking && <LinkPicker item={item} connected={connected} onDone={() => setPicking(false)} />}
    </section>
  );
}
