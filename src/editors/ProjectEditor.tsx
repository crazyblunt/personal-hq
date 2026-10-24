import { FolderKanban, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { navigate } from '../app/router';
import { closeEditor, toast, touchRecent } from '../app/ui';
import { createProject, updateProject, useHQ } from '../data/store';
import {
  LINK_KINDS,
  LINK_KIND_LABEL,
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_LABEL,
  PROJECT_COLORS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  type Project,
  type ProjectLink,
} from '../data/types';
import { cn, isHttpUrl, newId, parseTags } from '../lib/util';
import { PROJECT_COLOR_HEX, TagInput } from '../ui/bits';
import { Button, Field, Input, Select, Textarea } from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { sameJson } from './common';

type Draft = Pick<Project, 'name' | 'description' | 'category' | 'status' | 'color' | 'targetDate' | 'repoUrl' | 'links' | 'tags'> & { techStack: string };

export function ProjectEditor({ id, defaults }: { id?: string; defaults?: Partial<Project> }) {
  const existing = useHQ((s) => (id ? s.projects.find((p) => p.id === id) : undefined));
  const initial = useMemo<Draft>(() => {
    const p = existing ?? defaults ?? {};
    return {
      name: p.name ?? '',
      description: p.description ?? '',
      category: p.category ?? 'coding',
      status: p.status ?? 'active',
      color: p.color ?? 'emerald',
      targetDate: p.targetDate ?? null,
      repoUrl: p.repoUrl ?? '',
      links: p.links ?? [],
      tags: p.tags ?? [],
      techStack: (p.techStack ?? []).join(', '),
    };
  }, [id]); // eslint-disable-line
  const [d, setD] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const setLink = (lid: string, change: Partial<ProjectLink>) => set('links', d.links.map((l) => (l.id === lid ? { ...l, ...change } : l)));

  const save = () => {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = 'Give the project a name.';
    if (d.repoUrl.trim() && !isHttpUrl(d.repoUrl)) e.repoUrl = 'Use a full URL starting with https://';
    d.links.forEach((l) => {
      if (l.url.trim() && !isHttpUrl(l.url)) e[`link-${l.id}`] = 'Use a full URL starting with https://';
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    const fields: Partial<Project> = {
      name: d.name.trim(),
      description: d.description.trim(),
      category: d.category,
      color: d.color,
      targetDate: d.targetDate,
      repoUrl: d.repoUrl.trim(),
      techStack: parseTags(d.techStack),
      tags: d.tags,
      links: d.links.filter((l) => l.url.trim()).map((l) => ({ ...l, url: l.url.trim(), label: l.label.trim() })),
    };
    if (existing) {
      if (d.status !== existing.status) {
        fields.status = d.status;
        fields.archivedFromStatus = d.status === 'archived' ? (existing.status === 'archived' ? existing.archivedFromStatus : existing.status) : null;
      }
      updateProject(existing.id, fields);
      toast('Project saved');
      closeEditor();
    } else {
      const p = createProject({ ...fields, name: d.name.trim(), status: d.status === 'archived' ? 'active' : d.status });
      touchRecent('project', p.id);
      toast('Project created');
      closeEditor();
      navigate('projects', p.id);
    }
  };

  return (
    <Dialog
      open
      onClose={closeEditor}
      dirty={!sameJson(d, initial)}
      title={existing ? 'Edit project' : 'New project'}
      icon={<FolderKanban />}
      size="lg"
      footer={
        <>
          <Button onClick={closeEditor}>Cancel</Button>
          <Button variant="primary" type="submit" form="project-form">
            {existing ? 'Save project' : 'Create project'}
          </Button>
        </>
      }
    >
      <form
        id="project-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="grid gap-3 sm:grid-cols-6"
      >
        <Field label="Name" htmlFor="project-name" error={errors.name} className="sm:col-span-6">
          <Input id="project-name" value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={80} autoFocus placeholder="e.g. Portfolio site" />
        </Field>
        <Field label="Description" htmlFor="project-description" className="sm:col-span-6">
          <Textarea id="project-description" value={d.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="What is it, and what does done look like?" />
        </Field>
        <Field label="Category" htmlFor="project-category" className="sm:col-span-2">
          <Select id="project-category" value={d.category} onChange={(e) => set('category', e.target.value as Project['category'])}>
            {PROJECT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {PROJECT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="project-status" className="sm:col-span-2">
          <Select id="project-status" value={d.status} onChange={(e) => set('status', e.target.value as Project['status'])}>
            {PROJECT_STATUSES.filter((s) => existing || s !== 'archived').map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target date" htmlFor="project-target" className="sm:col-span-2">
          <Input id="project-target" type="date" value={d.targetDate ?? ''} onChange={(e) => set('targetDate', e.target.value || null)} />
        </Field>
        <fieldset className="flex flex-col gap-1 sm:col-span-6">
          <legend className="mb-1 font-mono text-2xs tracking-wider text-muted uppercase">Color</legend>
          <div className="flex flex-wrap gap-1">
            {PROJECT_COLORS.map((c) => (
              <label key={c} className="relative">
                <input type="radio" name="project-color" value={c} checked={d.color === c} onChange={() => set('color', c)} className="peer sr-only" aria-label={c} />
                <span className={cn('block size-6 p-[3px] peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-dotted', d.color === c ? 'bevel-in bg-inset' : 'bevel-out bg-raised')}>
                  <span className="block size-full" style={{ backgroundColor: PROJECT_COLOR_HEX[c] }} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Tags" htmlFor="project-tags" className="sm:col-span-6">
          <TagInput id="project-tags" value={d.tags} onChange={(v) => set('tags', v)} />
        </Field>
        <Field label="Tech stack / tools" htmlFor="project-stack" hint="Comma separated" className="sm:col-span-6">
          <Input id="project-stack" value={d.techStack} onChange={(e) => set('techStack', e.target.value)} placeholder="React, Supabase, Tailwind" />
        </Field>
        <Field label="Repository URL" htmlFor="project-repo" error={errors.repoUrl} hint="Opens in a new tab. Personal HQ does not connect to GitHub." className="sm:col-span-6">
          <Input id="project-repo" type="url" value={d.repoUrl} onChange={(e) => set('repoUrl', e.target.value)} placeholder="https://github.com/you/repo" />
        </Field>
        <fieldset className="flex flex-col gap-1.5 sm:col-span-6">
          <legend className="mb-1 font-mono text-2xs tracking-wider text-muted uppercase">Links: sessions, pull requests, docs, sites</legend>
          {d.links.map((l) => (
            <div key={l.id} className="grid grid-cols-[8.5rem_1fr_auto] gap-1 max-sm:grid-cols-[1fr_auto]">
              <Select value={l.kind} onChange={(e) => setLink(l.id, { kind: e.target.value as ProjectLink['kind'] })} aria-label="Link type" className="max-sm:col-span-2">
                {LINK_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {LINK_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row">
                <Input value={l.label} onChange={(e) => setLink(l.id, { label: e.target.value })} placeholder="Label (optional)" aria-label="Link label" className="sm:w-40" />
                <Input type="url" value={l.url} onChange={(e) => setLink(l.id, { url: e.target.value })} placeholder="https://…" aria-label="Link URL" />
              </div>
              <Button size="icon" variant="ghost" aria-label="Remove link" onClick={() => set('links', d.links.filter((x) => x.id !== l.id))}>
                <X className="size-3.5" />
              </Button>
              {errors[`link-${l.id}`] && (
                <p role="alert" className="col-span-full text-xs text-bad">
                  {errors[`link-${l.id}`]}
                </p>
              )}
            </div>
          ))}
          <div>
            <Button size="sm" onClick={() => set('links', [...d.links, { id: newId(), kind: d.links.length === 0 ? 'session' : 'other', label: '', url: '' }])}>
              <Plus className="size-3" aria-hidden="true" /> Add link
            </Button>
          </div>
          <p className="text-xs text-subtle">Saved links are bookmarks. Opening one does not let Personal HQ read or control that service.</p>
        </fieldset>
      </form>
    </Dialog>
  );
}
