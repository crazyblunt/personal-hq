import { ChevronLeft, Eye, ListChecks, ListTodo, Pencil, Star, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { registerDraft } from '../../app/drafts';
import { navigate } from '../../app/router';
import { confirmAction, openEditor, toast, touchRecent } from '../../app/ui';
import { convertNoteToTask, deleteNote, ideaTitle, updateNote, useHQ } from '../../data/store';
import type { Note } from '../../data/types';
import { formatClock, formatStamp } from '../../lib/dates';
import { cn } from '../../lib/util';
import { suggestCategory, suggestTags } from '../../organize/rules';
import { TagInput } from '../../ui/bits';
import { Button, Field, Input, Select } from '../../ui/controls';
import { CategoryDatalist, ProjectSelect } from '../../editors/common';
import { NotePreview } from './NotePreview';

type Draft = Pick<Note, 'title' | 'body' | 'tags' | 'category' | 'projectId' | 'favorite' | 'taskIds'>;
const pick = (n: Note): Draft => ({ title: n.title, body: n.body, tags: n.tags, category: n.category, projectId: n.projectId, favorite: n.favorite, taskIds: n.taskIds });
const AUTOSAVE_MS = 700;

/** Note editor with autosave: edits are committed 0.7s after typing stops, on blur, and before leaving. */
export function NoteEditor({ note, onBack }: { note: Note; onBack?: () => void }) {
  const [d, setD] = useState<Draft>(() => pick(note));
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ d, dirty });
  latest.current = { d, dirty };
  const { saveState, lastSavedAt, saveError, clock24h } = useHQ(useShallow((s) => ({ saveState: s.saveState, lastSavedAt: s.lastSavedAt, saveError: s.saveError, clock24h: s.settings.clock24h })));
  const tasks = useHQ(useShallow((s) => s.tasks.filter((t) => note.taskIds.includes(t.id))));
  const linkable = useHQ(useShallow((s) => s.tasks.filter((t) => t.status !== 'completed' && !note.taskIds.includes(t.id))));
  const sourceIdea = useHQ((s) => (note.source?.kind === 'idea' ? s.ideas.find((i) => i.id === note.source!.id) : undefined));
  const [linkPick, setLinkPick] = useState('');

  const commit = useCallback(() => {
    clearTimeout(timer.current);
    const { d: cur, dirty: isDirty } = latest.current;
    if (!isDirty) return;
    updateNote(note.id, cur);
    setDirty(false);
  }, [note.id]);

  useEffect(() => {
    touchRecent('note', note.id);
  }, [note.id]);

  // Commit pending edits when leaving this note, the page, or the tab.
  useEffect(() => {
    const unregister = registerDraft(commit);
    return () => {
      unregister();
      commit();
    };
  }, [commit]);

  // Another tab changed this note while we have no local edits: show its version.
  useEffect(() => {
    if (!latest.current.dirty) setD(pick(note));
  }, [note]);

  const change = <K extends keyof Draft>(k: K, v: Draft[K], immediate = false) => {
    setD((cur) => ({ ...cur, [k]: v }));
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(commit, immediate ? 0 : AUTOSAVE_MS);
  };

  const status = dirty
    ? { tone: 'text-warn', text: 'Unsaved changes…' }
    : saveState === 'error'
      ? { tone: 'text-bad', text: saveError ?? 'Save failed' }
      : saveState === 'pending'
        ? { tone: 'text-warn', text: 'Saving…' }
        : { tone: 'text-ok', text: lastSavedAt ? `Saved ${formatClock(new Date(lastSavedAt), clock24h, true)}` : 'Saved' };

  const tagHints = d.tags.length === 0 ? suggestTags(`${d.title}\n${d.body}`, d.tags).slice(0, 3) : [];
  const catHint = d.category ? null : suggestCategory(`${d.title}\n${d.body}`);
  const words = d.body.trim() ? d.body.trim().split(/\s+/).length : 0;

  return (
    <section aria-label="Note editor" className="flex min-h-[28rem] min-w-0 flex-col border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-bar px-1.5 py-1">
        {onBack && (
          <Button size="sm" variant="ghost" onClick={onBack} className="lg:hidden">
            <ChevronLeft className="size-3.5" aria-hidden="true" /> Notes
          </Button>
        )}
        <span role="status" aria-live="polite" className={cn('font-mono text-2xs', status.tone)}>
          ● {status.text}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          <Button size="sm" variant={mode === 'edit' ? 'secondary' : 'ghost'} onClick={() => setMode('edit')} aria-pressed={mode === 'edit'}>
            <Pencil className="size-3" aria-hidden="true" /> Edit
          </Button>
          <Button size="sm" variant={mode === 'preview' ? 'secondary' : 'ghost'} onClick={() => (commit(), setMode('preview'))} aria-pressed={mode === 'preview'}>
            <Eye className="size-3" aria-hidden="true" /> Preview
          </Button>
          <Button size="sm" variant="ghost" title="Add a checklist line" onClick={() => change('body', `${d.body}${d.body && !d.body.endsWith('\n') ? '\n' : ''}- [ ] `)}>
            <ListTodo className="size-3" aria-hidden="true" /> Checkbox
          </Button>
          <Button size="sm" variant="ghost" aria-pressed={d.favorite} onClick={() => change('favorite', !d.favorite, true)} aria-label={d.favorite ? 'Unfavorite note' : 'Favorite note'}>
            <Star className={cn('size-3.5', d.favorite ? 'fill-current text-warn' : '')} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Create a task linked to this note"
            onClick={() => {
              commit();
              const t = convertNoteToTask(note.id);
              if (t) {
                toast('Task created from note');
                openEditor({ kind: 'task', id: t.id });
              }
            }}
          >
            <ListChecks className="size-3" aria-hidden="true" /> Make task
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-bad"
            aria-label="Delete note"
            onClick={() =>
              confirmAction({
                title: 'Delete this note?',
                body: `“${d.title || 'Untitled note'}” will be permanently removed.`,
                confirmLabel: 'Delete note',
                onConfirm: () => {
                  clearTimeout(timer.current);
                  setDirty(false);
                  latest.current.dirty = false;
                  deleteNote(note.id);
                  navigate('notes');
                  toast('Note deleted');
                },
              })
            }
          >
            <Trash2 className="size-3.5" />
          </Button>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2">
        <input
          id="note-title"
          value={d.title}
          onChange={(e) => change('title', e.target.value)}
          onBlur={commit}
          onFocus={(e) => e.target.value === 'Untitled note' && e.target.select()}
          autoFocus={!note.body && Date.now() - Date.parse(note.createdAt) < 5000}
          aria-label="Note title"
          placeholder="Title"
          maxLength={200}
          className="w-full border-b border-line bg-transparent pb-1 text-lg font-bold outline-none placeholder:text-subtle focus:border-accent"
        />
        {mode === 'edit' ? (
          <textarea
            id="note-body"
            value={d.body}
            onChange={(e) => change('body', e.target.value)}
            onBlur={commit}
            aria-label="Note text"
            placeholder={'Write here. Plain text.\n\n# Heading\n- bullet\n- [ ] checklist item'}
            className="min-h-72 w-full flex-1 resize-y bevel-in bg-inset px-2 py-1.5 font-mono text-sm leading-relaxed placeholder:text-subtle"
          />
        ) : (
          <div className="min-h-72 flex-1 overflow-auto bevel-in bg-inset px-3 py-2">
            <NotePreview body={d.body} onChange={(body) => change('body', body, true)} />
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Tags" htmlFor="note-tags" className="sm:col-span-3">
            <TagInput id="note-tags" value={d.tags} onChange={(v) => change('tags', v, true)} />
          </Field>
          <Field label="Category" htmlFor="note-category">
            <Input id="note-category" list="note-category-list" value={d.category} onChange={(e) => change('category', e.target.value)} onBlur={commit} maxLength={40} placeholder="School, Coding…" />
            <CategoryDatalist id="note-category-list" />
          </Field>
          <Field label="Project" htmlFor="note-project">
            <ProjectSelect id="note-project" value={d.projectId} onChange={(v) => change('projectId', v, true)} />
          </Field>
          <Field label="Link a task" htmlFor="note-link-task">
            <div className="flex gap-1">
              <Select id="note-link-task" value={linkPick} onChange={(e) => setLinkPick(e.target.value)}>
                <option value="">Choose an open task…</option>
                {linkable.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
              <Button
                disabled={!linkPick}
                onClick={() => {
                  change('taskIds', [...d.taskIds, linkPick], true);
                  setLinkPick('');
                }}
              >
                Link
              </Button>
            </div>
          </Field>
        </div>

        {(tagHints.length > 0 || catHint) && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="font-mono text-2xs tracking-wider text-subtle uppercase">Local suggestions:</span>
            {tagHints.map((h) => (
              <Button key={h.tag} size="xs" title={h.reason} onClick={() => change('tags', [...d.tags, h.tag], true)}>
                + #{h.tag}
              </Button>
            ))}
            {catHint && (
              <Button size="xs" title={catHint.reason} onClick={() => change('category', catHint.category, true)}>
                Category: {catHint.category}
              </Button>
            )}
          </div>
        )}

        {tasks.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-2xs tracking-wider text-muted uppercase">Linked tasks</span>
            <ul className="border border-line bg-inset">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 border-b border-line px-2 py-1 text-sm last:border-b-0">
                  <button type="button" onClick={() => openEditor({ kind: 'task', id: t.id })} className={cn('min-w-0 flex-1 truncate text-left hover:underline', t.status === 'completed' && 'text-subtle line-through')}>
                    {t.title}
                  </button>
                  <Button size="iconSm" variant="ghost" aria-label={`Unlink ${t.title}`} onClick={() => change('taskIds', d.taskIds.filter((x) => x !== t.id), true)}>
                    <X className="size-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="font-mono text-2xs text-subtle">
          {words} words · created {formatStamp(note.createdAt, clock24h)} · updated {formatStamp(note.updatedAt, clock24h)}
          {sourceIdea && (
            <>
              {' '}
              · from idea{' '}
              <button type="button" className="text-accent hover:underline" onClick={() => openEditor({ kind: 'idea', id: sourceIdea.id })}>
                {ideaTitle(sourceIdea)}
              </button>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
