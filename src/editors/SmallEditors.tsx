import { Bug as BugIcon, MessageSquareCode, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { closeEditor, confirmAction, toast } from '../app/ui';
import { createBug, createPrompt, deleteBug, deletePrompt, updateBug, updatePrompt, useHQ } from '../data/store';
import { BUG_SEVERITIES, BUG_STATUSES, BUG_STATUS_LABEL, type Bug, type Prompt } from '../data/types';
import { TagInput } from '../ui/bits';
import { Button, Check, Field, Input, Select, Textarea } from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { ProjectSelect, sameJson } from './common';

type BugDraft = Pick<Bug, 'title' | 'description' | 'stepsToReproduce' | 'severity' | 'status' | 'projectId'>;

export function BugEditor({ id, projectId }: { id?: string; projectId: string }) {
  const existing = useHQ((s) => (id ? s.bugs.find((b) => b.id === id) : undefined));
  const initial = useMemo<BugDraft>(
    () => ({
      title: existing?.title ?? '',
      description: existing?.description ?? '',
      stepsToReproduce: existing?.stepsToReproduce ?? '',
      severity: existing?.severity ?? 'medium',
      status: existing?.status ?? 'open',
      projectId: existing?.projectId ?? projectId,
    }),
    [id], // eslint-disable-line
  );
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof BugDraft>(k: K, v: BugDraft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  const save = () => {
    if (!d.title.trim()) return setError('Describe the bug in a few words.');
    if (!d.projectId) return setError('Bugs belong to a project. Pick one.');
    if (existing) {
      updateBug(existing.id, { ...d, title: d.title.trim() });
      toast('Bug saved');
    } else {
      createBug({ ...d, title: d.title.trim() });
      toast('Bug logged');
    }
    closeEditor();
  };

  return (
    <Dialog
      open
      onClose={closeEditor}
      dirty={!sameJson(d, initial)}
      title={existing ? 'Edit bug' : 'Log a bug'}
      icon={<BugIcon />}
      size="lg"
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              className="mr-auto text-bad"
              onClick={() =>
                confirmAction({
                  title: 'Delete this bug?',
                  body: `“${existing.title}” will be permanently removed. To keep a record, mark it Fixed or Won't fix instead.`,
                  confirmLabel: 'Delete bug',
                  onConfirm: () => {
                    deleteBug(existing.id);
                    closeEditor();
                    toast('Bug deleted');
                  },
                })
              }
            >
              <Trash2 className="size-3.5" aria-hidden="true" /> Delete
            </Button>
          )}
          <Button onClick={closeEditor}>Cancel</Button>
          <Button variant="primary" type="submit" form="bug-form">
            {existing ? 'Save bug' : 'Log bug'}
          </Button>
        </>
      }
    >
      <form
        id="bug-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="grid gap-3 sm:grid-cols-3"
      >
        <Field label="Title" htmlFor="bug-title" error={error ?? undefined} className="sm:col-span-3">
          <Input id="bug-title" value={d.title} onChange={(e) => set('title', e.target.value)} maxLength={160} autoFocus placeholder="e.g. Login button does nothing on Safari" />
        </Field>
        <Field label="Project" htmlFor="bug-project">
          <ProjectSelect id="bug-project" value={d.projectId} onChange={(v) => set('projectId', v ?? '')} emptyLabel="Pick a project" />
        </Field>
        <Field label="Severity" htmlFor="bug-severity">
          <Select id="bug-severity" value={d.severity} onChange={(e) => set('severity', e.target.value as Bug['severity'])}>
            {BUG_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="bug-status">
          <Select id="bug-status" value={d.status} onChange={(e) => set('status', e.target.value as Bug['status'])}>
            {BUG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {BUG_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="What happens" htmlFor="bug-description" className="sm:col-span-3">
          <Textarea id="bug-description" value={d.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Expected vs. actual behavior, error messages" />
        </Field>
        <Field label="Steps to reproduce" htmlFor="bug-steps" className="sm:col-span-3">
          <Textarea id="bug-steps" value={d.stepsToReproduce} onChange={(e) => set('stepsToReproduce', e.target.value)} rows={4} className="font-mono" placeholder={'1. Open …\n2. Click …\n3. See error'} />
        </Field>
      </form>
    </Dialog>
  );
}

type PromptDraft = Pick<Prompt, 'title' | 'body' | 'tags' | 'projectId' | 'favorite'>;

export function PromptEditor({ id }: { id?: string }) {
  const existing = useHQ((s) => (id ? s.prompts.find((p) => p.id === id) : undefined));
  const initial = useMemo<PromptDraft>(
    () => ({ title: existing?.title ?? '', body: existing?.body ?? '', tags: existing?.tags ?? [], projectId: existing?.projectId ?? null, favorite: existing?.favorite ?? false }),
    [id], // eslint-disable-line
  );
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PromptDraft>(k: K, v: PromptDraft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  const save = () => {
    if (!d.title.trim()) return setError('Give the prompt a name.');
    if (!d.body.trim()) return setError('The prompt text is empty.');
    if (existing) {
      updatePrompt(existing.id, { ...d, title: d.title.trim() });
      toast('Prompt saved');
    } else {
      createPrompt({ ...d, title: d.title.trim() });
      toast('Prompt added to the library');
    }
    closeEditor();
  };

  return (
    <Dialog
      open
      onClose={closeEditor}
      dirty={!sameJson(d, initial)}
      title={existing ? 'Edit prompt' : 'New prompt'}
      icon={<MessageSquareCode />}
      size="lg"
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              className="mr-auto text-bad"
              onClick={() =>
                confirmAction({
                  title: 'Delete this prompt?',
                  body: `“${existing.title}” will be permanently removed from the library.`,
                  confirmLabel: 'Delete prompt',
                  onConfirm: () => {
                    deletePrompt(existing.id);
                    closeEditor();
                    toast('Prompt deleted');
                  },
                })
              }
            >
              <Trash2 className="size-3.5" aria-hidden="true" /> Delete
            </Button>
          )}
          <Button onClick={closeEditor}>Cancel</Button>
          <Button variant="primary" type="submit" form="prompt-form">
            {existing ? 'Save prompt' : 'Add prompt'}
          </Button>
        </>
      }
    >
      <form
        id="prompt-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="grid gap-3"
      >
        <Field label="Name" htmlFor="prompt-title" error={error ?? undefined}>
          <Input id="prompt-title" value={d.title} onChange={(e) => set('title', e.target.value)} maxLength={120} autoFocus />
        </Field>
        <Field label="Prompt" htmlFor="prompt-body" hint="Use {{placeholders}} for parts you fill in each time.">
          <Textarea id="prompt-body" value={d.body} onChange={(e) => set('body', e.target.value)} rows={8} className="font-mono" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tags" htmlFor="prompt-tags">
            <TagInput id="prompt-tags" value={d.tags} onChange={(v) => set('tags', v)} />
          </Field>
          <Field label="Project" htmlFor="prompt-project">
            <ProjectSelect id="prompt-project" value={d.projectId} onChange={(v) => set('projectId', v)} emptyLabel="General" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Check checked={d.favorite} onChange={(v) => set('favorite', v)} label="Favorite" /> Favorite
        </label>
      </form>
    </Dialog>
  );
}
