import { Archive, ArchiveRestore, FolderKanban, Lightbulb, Link2, ListChecks, NotebookPen, Star, Trash2, Unlink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { navigate } from '../app/router';
import { closeEditor, confirmAction, openEditor, toast, touchRecent } from '../app/ui';
import { convertIdea, deleteIdea, ideaTitle, linkIdeas, unlinkIdeas, updateIdea, useHQ, type ConvertTarget } from '../data/store';
import { IDEA_KINDS, IDEA_KIND_LABEL, type Idea } from '../data/types';
import { cn, isHttpUrl } from '../lib/util';
import { actionableReason, similarity, suggestCategory, suggestTags } from '../organize/rules';
import { TagInput } from '../ui/bits';
import { Button, Check, Field, Input, Select, Textarea } from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { CategoryDatalist, ProjectSelect, sameJson } from './common';

type Draft = Pick<Idea, 'title' | 'body' | 'kind' | 'url' | 'tags' | 'category' | 'favorite' | 'projectId' | 'remindOn' | 'inbox'>;

export function IdeaEditor({ id }: { id: string }) {
  const idea = useHQ((s) => s.ideas.find((i) => i.id === id));
  const initial = useMemo<Draft | null>(
    () => (idea ? { title: idea.title, body: idea.body, kind: idea.kind, url: idea.url, tags: idea.tags, category: idea.category, favorite: idea.favorite, projectId: idea.projectId, remindOn: idea.remindOn, inbox: idea.inbox } : null),
    [id], // eslint-disable-line
  );
  const [d, setD] = useState<Draft | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const others = useHQ(useShallow((s) => s.ideas.filter((i) => i.id !== id && !i.archived)));
  const [pick, setPick] = useState('');

  useEffect(() => {
    touchRecent('idea', id);
  }, [id]);

  const similar = useMemo(() => {
    if (!idea) return [];
    const text = `${idea.title} ${idea.body}`;
    return others
      .filter((o) => !idea.relatedIds.includes(o.id))
      .map((o) => ({ o, ...similarity(text, `${o.title} ${o.body}`) }))
      .filter((x) => x.score >= 0.2 && x.shared.length >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [idea, others]);

  if (!idea || !d || !initial) {
    return (
      <Dialog open onClose={closeEditor} title="Idea not found" size="sm" footer={<Button onClick={closeEditor}>Close</Button>}>
        <p className="text-sm text-muted">This idea no longer exists.</p>
      </Dialog>
    );
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => (cur ? { ...cur, [k]: v } : cur));
  const dirty = !sameJson(d, initial);
  const tagHints = suggestTags(`${d.title}\n${d.body}`, d.tags);
  const catHint = d.category ? null : suggestCategory(`${d.title}\n${d.body}`);
  const actionable = actionableReason(d.title || d.body);
  const related = others.filter((o) => idea.relatedIds.includes(o.id));

  const save = (close = true) => {
    if (!d.body.trim() && !d.title.trim()) {
      setError('Write something first.');
      return false;
    }
    if (d.url.trim() && !isHttpUrl(d.url)) {
      setError('The link must be a full URL starting with https://');
      return false;
    }
    updateIdea(id, { ...d, body: d.body.trim() || d.title.trim(), title: d.title.trim(), url: d.url.trim() });
    if (close) {
      toast('Idea saved');
      closeEditor();
    }
    return true;
  };

  const convert = (to: ConvertTarget) => {
    if (dirty && !save(false)) return;
    const created = convertIdea(id, to);
    if (!created) return;
    closeEditor();
    toast(`Created a ${to} from this idea`);
    if (to === 'task') openEditor({ kind: 'task', id: created.id });
    else if (to === 'note') navigate('notes', created.id);
    else navigate('projects', created.id);
  };

  return (
    <Dialog
      open
      onClose={closeEditor}
      dirty={dirty}
      title="Idea"
      icon={<Lightbulb />}
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto text-bad"
            onClick={() =>
              confirmAction({
                title: 'Delete this idea?',
                body: `“${ideaTitle(idea)}” will be permanently removed. Archive it instead to keep it out of the way.`,
                confirmLabel: 'Delete idea',
                onConfirm: () => {
                  deleteIdea(id);
                  closeEditor();
                  toast('Idea deleted');
                },
              })
            }
          >
            <Trash2 className="size-3.5" aria-hidden="true" /> Delete
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              updateIdea(id, { archived: !idea.archived, inbox: false });
              toast(idea.archived ? 'Idea restored' : 'Idea archived');
              closeEditor();
            }}
          >
            {idea.archived ? <ArchiveRestore className="size-3.5" aria-hidden="true" /> : <Archive className="size-3.5" aria-hidden="true" />}
            {idea.archived ? 'Restore' : 'Archive'}
          </Button>
          <Button onClick={closeEditor}>Cancel</Button>
          <Button variant="primary" type="submit" form="idea-form">
            Save idea
          </Button>
        </>
      }
    >
      <form
        id="idea-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="grid gap-3 sm:grid-cols-6"
      >
        <Field label="Text" htmlFor="idea-body" error={error ?? undefined} className="sm:col-span-6">
          <Textarea id="idea-body" value={d.body} onChange={(e) => set('body', e.target.value)} rows={5} autoFocus />
        </Field>
        <Field label="Title (optional)" htmlFor="idea-title" hint="Leave empty to use the first line" className="sm:col-span-4">
          <Input id="idea-title" value={d.title} onChange={(e) => set('title', e.target.value)} maxLength={120} />
        </Field>
        <Field label="Kind" htmlFor="idea-kind" className="sm:col-span-2">
          <Select id="idea-kind" value={d.kind} onChange={(e) => set('kind', e.target.value as Idea['kind'])}>
            {IDEA_KINDS.map((k) => (
              <option key={k} value={k}>
                {IDEA_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Link" htmlFor="idea-url" className="sm:col-span-4">
          <Input id="idea-url" type="url" value={d.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Remind me on" htmlFor="idea-remind" className="sm:col-span-2">
          <Input id="idea-remind" type="date" value={d.remindOn ?? ''} onChange={(e) => set('remindOn', e.target.value || null)} />
        </Field>
        <Field label="Tags" htmlFor="idea-tags" className="sm:col-span-6">
          <TagInput id="idea-tags" value={d.tags} onChange={(v) => set('tags', v)} />
        </Field>
        <Field label="Category" htmlFor="idea-category" className="sm:col-span-3">
          <Input id="idea-category" list="idea-category-list" value={d.category} onChange={(e) => set('category', e.target.value)} maxLength={40} />
          <CategoryDatalist id="idea-category-list" />
        </Field>
        <Field label="Project" htmlFor="idea-project" className="sm:col-span-3">
          <ProjectSelect id="idea-project" value={d.projectId} onChange={(v) => set('projectId', v)} />
        </Field>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:col-span-6">
          <label className="flex items-center gap-2 text-sm">
            <Check checked={d.favorite} onChange={(v) => set('favorite', v)} label="Favorite" />
            <Star className={cn('size-3.5', d.favorite ? 'fill-current text-warn' : 'text-subtle')} aria-hidden="true" /> Favorite
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Check checked={d.inbox} onChange={(v) => set('inbox', v)} label="Keep in Inbox" /> Keep in Inbox (not organized yet)
          </label>
        </div>

        {(tagHints.length > 0 || catHint || actionable) && (
          <div className="flex flex-col gap-1 border border-dashed border-line-strong bg-inset p-2 text-xs sm:col-span-6">
            <span className="font-mono text-2xs tracking-wider text-subtle uppercase">Local suggestions · keyword rules, not AI</span>
            {tagHints.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-muted">Tags:</span>
                {tagHints.map((h) => (
                  <Button key={h.tag} size="xs" title={h.reason} onClick={() => set('tags', [...d.tags, h.tag])}>
                    + #{h.tag}
                  </Button>
                ))}
              </div>
            )}
            {catHint && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-muted">Category:</span>
                <Button size="xs" title={catHint.reason} onClick={() => set('category', catHint.category)}>
                  {catHint.category}
                </Button>
                <span className="text-subtle">({catHint.reason})</span>
              </div>
            )}
            {actionable && !idea.converted.some((c) => c.kind === 'task') && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-muted">Looks actionable ({actionable}).</span>
                <Button size="xs" onClick={() => convert('task')}>
                  Make it a task
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1 sm:col-span-6">
          <span className="font-mono text-2xs tracking-wider text-muted uppercase">Related ideas</span>
          {related.length > 0 && (
            <ul className="border border-line bg-inset">
              {related.map((r) => (
                <li key={r.id} className="flex items-center gap-2 border-b border-line px-2 py-1 text-sm last:border-b-0">
                  <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => openEditor({ kind: 'idea', id: r.id })}>
                    {ideaTitle(r)}
                  </button>
                  <Button size="xs" variant="ghost" onClick={() => unlinkIdeas(id, r.id)}>
                    <Unlink className="size-3" aria-hidden="true" /> Unlink
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {similar.length > 0 && (
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-subtle">Possibly related (shared words):</span>
              {similar.map(({ o, shared }) => (
                <div key={o.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {ideaTitle(o)} <span className="text-subtle">· {shared.slice(0, 4).join(', ')}</span>
                  </span>
                  <Button size="xs" onClick={() => linkIdeas(id, o.id)}>
                    <Link2 className="size-3" aria-hidden="true" /> Link
                  </Button>
                </div>
              ))}
            </div>
          )}
          {others.length > 0 && (
            <div className="flex gap-1">
              <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Idea to link">
                <option value="">Link another idea…</option>
                {others
                  .filter((o) => !idea.relatedIds.includes(o.id))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {ideaTitle(o)}
                    </option>
                  ))}
              </Select>
              <Button
                disabled={!pick}
                onClick={() => {
                  linkIdeas(id, pick);
                  setPick('');
                }}
              >
                Link
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2 sm:col-span-6">
          <span className="mr-1 font-mono text-2xs tracking-wider text-muted uppercase">Convert to</span>
          <Button size="sm" onClick={() => convert('task')}>
            <ListChecks className="size-3" aria-hidden="true" /> Task
          </Button>
          <Button size="sm" onClick={() => convert('note')}>
            <NotebookPen className="size-3" aria-hidden="true" /> Note
          </Button>
          <Button size="sm" onClick={() => convert('project')}>
            <FolderKanban className="size-3" aria-hidden="true" /> Project
          </Button>
          {idea.converted.length > 0 && <span className="text-xs text-subtle">Already converted: {idea.converted.map((c) => c.kind).join(', ')}. The idea is kept.</span>}
        </div>
        <p className="font-mono text-2xs text-subtle sm:col-span-6">
          Captured {new Date(idea.createdAt).toLocaleString()} · Updated {new Date(idea.updatedAt).toLocaleString()}
        </p>
      </form>
    </Dialog>
  );
}
