import { ScanSearch } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../app/clock';
import { navigate } from '../app/router';
import { closeOrganize, toast, useUI } from '../app/ui';
import { convertIdea, linkIdeas, updateIdea, updateNote, useHQ } from '../data/store';
import { uniqueStrings } from '../lib/util';
import { Button, Check } from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { localRulesProvider } from './provider';
import { recordBatch } from '../data/batches';
import { undoWithToast } from '../app/undo';
import type { Suggestion } from './review';

const GROUPS: { type: Suggestion['type']; title: string; note: string }[] = [
  { type: 'to-task', title: 'Turn into tasks', note: 'Ideas that read like something to do' },
  { type: 'tags', title: 'Add tags', note: 'From keyword rules and tags you already use' },
  { type: 'category', title: 'Set a category', note: 'The category whose keywords appear most' },
  { type: 'link-ideas', title: 'Link related ideas', note: 'Ideas that share several words' },
  { type: 'file-stale', title: 'File old Inbox items', note: 'Captured more than a week ago; keeps them as ideas' },
  { type: 'similar-notes', title: 'Similar notes', note: 'For your review only; nothing to apply' },
];

function describe(s: Suggestion): string {
  switch (s.type) {
    case 'tags':
      return `${s.title} → ${s.tags.map((t) => `#${t}`).join(' ')}`;
    case 'category':
      return `${s.title} → ${s.category}`;
    case 'to-task':
    case 'file-stale':
      return s.title;
    case 'link-ideas':
    case 'similar-notes':
      return `${s.titleA} ↔ ${s.titleB}`;
  }
}

function apply(s: Suggestion, get: typeof useHQ.getState) {
  const st = get();
  switch (s.type) {
    case 'tags': {
      if (s.target.kind === 'idea') {
        const i = st.ideas.find((x) => x.id === s.target.id);
        if (i) updateIdea(i.id, { tags: uniqueStrings([...i.tags, ...s.tags]) });
      } else {
        const n = st.notes.find((x) => x.id === s.target.id);
        if (n) updateNote(n.id, { tags: uniqueStrings([...n.tags, ...s.tags]) });
      }
      break;
    }
    case 'category':
      if (s.target.kind === 'idea') updateIdea(s.target.id, { category: s.category });
      else updateNote(s.target.id, { category: s.category });
      break;
    case 'to-task':
      convertIdea(s.ideaId, 'task');
      break;
    case 'link-ideas':
      linkIdeas(s.a, s.b);
      break;
    case 'file-stale':
      updateIdea(s.ideaId, { inbox: false });
      break;
    case 'similar-notes':
      break;
  }
}

/** Review of local, rule-based suggestions. Nothing changes until you tick items and press Apply. */
export function OrganizeDialog() {
  const open = useUI((s) => s.organizeOpen);
  const today = useToday();
  const { ideas, notes } = useHQ(useShallow((s) => ({ ideas: s.ideas, notes: s.notes })));
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSuggestions(null);
    setPicked(new Set());
    localRulesProvider.review({ ideas: useHQ.getState().ideas, notes: useHQ.getState().notes, today }).then((r) => alive && setSuggestions(r));
    return () => {
      alive = false;
    };
    // Recompute only when the dialog opens, so applying does not reshuffle the list under the cursor.
  }, [open]); // eslint-disable-line

  const applicable = useMemo(() => (suggestions ?? []).filter((s) => s.type !== 'similar-notes'), [suggestions]);
  const toggle = (key: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const run = () => {
    const chosen = applicable.filter((s) => picked.has(s.key));
    const batch = recordBatch('Organization review', 'local', () => {
      for (const s of chosen) apply(s, useHQ.getState);
    });
    toast(`Applied ${chosen.length} suggestion${chosen.length === 1 ? '' : 's'}`, 'success', batch ? { label: 'Undo', run: () => undoWithToast(batch.id) } : undefined);
    closeOrganize();
  };

  const nothing = suggestions !== null && suggestions.length === 0;

  return (
    <Dialog
      open={open}
      onClose={closeOrganize}
      title="Organization review"
      icon={<ScanSearch />}
      size="lg"
      footer={
        <>
          <span className="mr-auto text-xs text-subtle">{picked.size} selected</span>
          {applicable.length > 0 && (
            <Button variant="ghost" onClick={() => setPicked(picked.size === applicable.length ? new Set() : new Set(applicable.map((s) => s.key)))}>
              {picked.size === applicable.length ? 'Select none' : 'Select all'}
            </Button>
          )}
          <Button onClick={closeOrganize}>Close</Button>
          <Button variant="primary" disabled={picked.size === 0} onClick={run}>
            Apply selected
          </Button>
        </>
      }
    >
      <p className="mb-2 border border-dashed border-line-strong bg-inset px-2 py-1.5 text-xs text-muted">
        <strong className="text-fg">Local suggestions.</strong> {localRulesProvider.description} No AI model is involved. Review each one; nothing changes until you press Apply.
      </p>
      {suggestions === null ? (
        <p className="text-sm text-muted">Reviewing {ideas.length} ideas and {notes.length} notes…</p>
      ) : nothing ? (
        <p className="text-sm text-muted">No suggestions right now. Your ideas and notes already have tags and categories, and nothing looks like a duplicate.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {GROUPS.map((g) => {
            const items = suggestions.filter((s) => s.type === g.type);
            if (!items.length) return null;
            return (
              <section key={g.type} aria-label={g.title}>
                <h3 className="mb-1 flex items-baseline gap-2 font-mono text-2xs font-semibold tracking-wider text-muted uppercase">
                  {g.title} <span className="font-normal tracking-normal normal-case text-subtle">{g.note}</span>
                </h3>
                <ul className="border border-line bg-inset">
                  {items.map((s) => (
                    <li key={s.key} className="flex items-start gap-2 border-b border-line px-2 py-1 last:border-b-0">
                      {s.type === 'similar-notes' ? (
                        <span className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <Check checked={picked.has(s.key)} onChange={() => toggle(s.key)} label={describe(s)} className="mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="break-words">{describe(s)}</div>
                        <div className="text-xs text-subtle">{s.reason}</div>
                      </div>
                      {s.type === 'similar-notes' && (
                        <span className="flex shrink-0 gap-1">
                          <Button size="xs" onClick={() => (closeOrganize(), navigate('notes', s.a))}>
                            Open first
                          </Button>
                          <Button size="xs" onClick={() => (closeOrganize(), navigate('notes', s.b))}>
                            Open second
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
