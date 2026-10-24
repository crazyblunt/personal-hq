import { Archive, ArchiveRestore, ChevronRight, Columns3, ExternalLink, FileText, FolderKanban, GitBranch, GitPullRequest, Globe, Link2, List, NotebookPen, Pencil, Plus, Terminal, Trash2, X, type LucideIcon, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../../app/clock';
import { navigate } from '../../app/router';
import { confirmAction, openAskClaude, openEditor, toast, touchRecent } from '../../app/ui';
import { milestoneProgress, projectProgress } from '../../data/selectors';
import { addMilestone, archiveProject, createIdea, createNote, deleteProject, removeMilestone, restoreProject, updateMilestone, useHQ } from '../../data/store';
import { LINK_KIND_LABEL, PROJECT_CATEGORY_LABEL, PROJECT_STATUS_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, type LinkKind } from '../../data/types';
import { relativeTime } from '../../lib/dates';
import { cn, hostOf } from '../../lib/util';
import { Badge, ColorSquare, DueChip, EmptyState, ExtLink, Panel, ProgressBar, Segmented, TagChip } from '../../ui/bits';
import { Button, Check, Input } from '../../ui/controls';
import { ActivityLine, useOpenEntry } from '../activity/parts';
import { IdeaCard } from '../ideas/IdeaParts';
import { QuickAddTask } from '../tasks/QuickAddTask';
import { TaskBoard, TaskRow } from '../tasks/TaskRow';
import { BugsTable } from './BugsTable';
import { PROJECT_STATUS_STYLE } from './styles';
import { LinkedItems } from '../../ui/LinkedItems';

const LINK_ICON: Record<LinkKind, LucideIcon> = { repo: GitBranch, session: Terminal, pr: GitPullRequest, website: Globe, doc: FileText, other: Link2 };

type Tab = 'overview' | 'tasks' | 'bugs' | 'notes' | 'ideas' | 'activity';

export function ProjectDetail({ id }: { id: string }) {
  const today = useToday();
  const project = useHQ((s) => s.projects.find((p) => p.id === id));
  const { tasks, bugs, activity, notes, ideas } = useHQ(
    useShallow((s) => ({
      tasks: s.tasks,
      bugs: s.bugs,
      activity: s.activity,
      notes: s.notes,
      ideas: s.ideas,
    })),
  );
  const [tab, setTab] = useState<Tab>('overview');
  const [taskMode, setTaskMode] = useState<'list' | 'board'>('list');
  const [showDone, setShowDone] = useState(false);
  const [msTitle, setMsTitle] = useState('');
  const [msDate, setMsDate] = useState('');
  const [ideaText, setIdeaText] = useState('');
  const openEntry = useOpenEntry();

  useEffect(() => {
    if (project) touchRecent('project', id);
  }, [id, project]);

  const projectTasks = useMemo(() => tasks.filter((t) => t.projectId === id), [tasks, id]);
  const projectNotes = useMemo(() => notes.filter((n) => n.projectId === id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [notes, id]);
  const projectIdeas = useMemo(() => ideas.filter((i) => i.projectId === id && !i.archived), [ideas, id]);
  const history = useMemo(() => activity.filter((a) => a.projectId === id).reverse(), [activity, id]);
  const pr = projectProgress(id, tasks, bugs, activity, today);

  if (!project) {
    return (
      <div className="border border-line bg-panel">
        <EmptyState icon={FolderKanban} title="Project not found" action={<Button onClick={() => navigate('projects')}>Back to projects</Button>}>
          It may have been deleted.
        </EmptyState>
      </div>
    );
  }

  const archived = project.status === 'archived';
  const listedTasks = projectTasks.filter((t) => showDone || t.status !== 'completed').sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const links = [...(project.repoUrl ? [{ id: 'repo', kind: 'repo' as LinkKind, label: 'Repository', url: project.repoUrl }] : []), ...project.links];

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-muted">
        <a
          href="#projects"
          onClick={(e) => {
            e.preventDefault();
            navigate('projects');
          }}
          className="hover:underline"
        >
          Projects
        </a>
        <ChevronRight className="size-3" aria-hidden="true" />
        <span className="truncate">{project.name}</span>
      </nav>
      <div className="mb-2 flex flex-col gap-2 border-b border-line pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <ColorSquare color={project.color} className="size-3" /> <span className="truncate">{project.name}</span>
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge className={PROJECT_STATUS_STYLE[project.status]}>{PROJECT_STATUS_LABEL[project.status]}</Badge>
            <span>{PROJECT_CATEGORY_LABEL[project.category]}</span>
            {project.targetDate && (
              <span className="flex items-center gap-1">
                Target <DueChip date={project.targetDate} today={today} done={project.status === 'completed'} />
              </span>
            )}
            <span className="font-mono text-2xs text-subtle">created {relativeTime(project.createdAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button onClick={() => openEditor({ kind: 'project', id })}>
            <Pencil className="size-3.5" aria-hidden="true" /> Edit
          </Button>
          <Button onClick={() => openAskClaude({ job: 'breakdown', targetId: id })} title="Claude suggests next tasks. You see exactly what is shared first.">
            <Sparkles className="size-3.5" aria-hidden="true" /> Break into tasks with Claude
          </Button>
          {archived ? (
            <Button
              onClick={() => {
                restoreProject(id);
                toast('Project restored');
              }}
            >
              <ArchiveRestore className="size-3.5" aria-hidden="true" /> Restore
            </Button>
          ) : (
            <Button
              onClick={() =>
                confirmAction({
                  title: 'Archive this project?',
                  body: `“${project.name}” moves to Archived and leaves the sidebar. Its tasks, notes, and history stay. You can restore it any time.`,
                  confirmLabel: 'Archive project',
                  danger: false,
                  onConfirm: () => {
                    archiveProject(id);
                    toast('Project archived');
                  },
                })
              }
            >
              <Archive className="size-3.5" aria-hidden="true" /> Archive
            </Button>
          )}
          <Button
            variant="ghost"
            className="text-bad"
            onClick={() =>
              confirmAction({
                title: 'Delete this project?',
                body: `“${project.name}” will be permanently deleted along with its ${bugs.filter((b) => b.projectId === id).length} bug(s).\n\nIts ${projectTasks.length} task(s), ${projectNotes.length} note(s), and ideas are kept but no longer linked to a project.\n\nArchive instead if you might want it back.`,
                confirmLabel: 'Delete project',
                onConfirm: () => {
                  deleteProject(id);
                  navigate('projects');
                  toast('Project deleted');
                },
              })
            }
          >
            <Trash2 className="size-3.5" aria-hidden="true" /> Delete
          </Button>
        </div>
      </div>

      <Segmented
        className="mb-2"
        label="Project section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'tasks', label: 'Tasks', count: pr.open },
          { value: 'bugs', label: 'Bugs', count: pr.openBugs },
          { value: 'notes', label: 'Notes', count: projectNotes.length },
          { value: 'ideas', label: 'Ideas', count: projectIdeas.length },
          { value: 'activity', label: 'History', count: history.length },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid items-start gap-2 lg:grid-cols-2">
          <Panel title="Progress" className="lg:row-span-2">
            <div className="flex flex-col gap-2 p-2">
              {pr.total === 0 ? (
                <p className="text-sm text-muted">No tasks yet, so there is no progress to show. Add tasks in the Tasks tab.</p>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-semibold text-accent tabular">{pr.percent}%</span>
                    <span className="text-sm text-muted">
                      {pr.completed} of {pr.total} tasks completed
                    </span>
                  </div>
                  <ProgressBar value={pr.percent} label="Project progress" />
                  <table className="w-full border border-line text-center">
                    <thead className="bg-bar font-mono text-2xs tracking-wider text-subtle uppercase">
                      <tr>
                        {TASK_STATUSES.map((s) => (
                          <th key={s} className="border-r border-line px-1 py-0.5 font-semibold last:border-r-0">
                            {TASK_STATUS_LABEL[s]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-inset font-mono text-sm tabular">
                      <tr>
                        {TASK_STATUSES.map((s) => (
                          <td key={s} className="border-r border-line px-1 py-1 last:border-r-0">
                            {pr.byStatus[s]}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
              <div className="flex flex-wrap gap-3 font-mono text-xs">
                <span className={pr.overdue ? 'text-bad' : 'text-subtle'}>{pr.overdue} overdue</span>
                <span className={pr.openBugs ? 'text-orange' : 'text-subtle'}>{pr.openBugs} open bugs</span>
                <span className="text-subtle">{pr.lastActivityAt ? `last activity ${relativeTime(pr.lastActivityAt)}` : 'no activity yet'}</span>
              </div>
              {project.description && <p className="border-t border-line pt-2 text-sm whitespace-pre-line text-muted">{project.description}</p>}
              {project.techStack.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {project.techStack.map((t) => (
                    <span key={t} className="border border-line bg-inset px-1 font-mono text-2xs text-muted">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {project.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {project.tags.map((t) => (
                    <TagChip key={t} tag={t} />
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel title={`Milestones (${project.milestones.filter((m) => m.done).length}/${project.milestones.length})`}>
            <div className="flex flex-col">
              {project.milestones.length === 0 && <p className="px-2 py-2 text-sm text-muted">Break the project into checkpoints. Link tasks to a milestone from the task editor.</p>}
              <ul>
                {project.milestones.map((m) => {
                  const mp = milestoneProgress(m.id, tasks);
                  return (
                    <li key={m.id} className="flex items-center gap-2 border-b border-line px-2 py-1">
                      <Check checked={m.done} onChange={(v) => updateMilestone(id, m.id, { done: v })} label={`Mark milestone ${m.title} ${m.done ? 'not done' : 'done'}`} />
                      <span className={cn('min-w-0 flex-1 truncate text-sm', m.done && 'text-subtle line-through')}>{m.title}</span>
                      {mp.total > 0 && (
                        <span className="font-mono text-2xs text-subtle tabular">
                          {mp.done}/{mp.total} tasks
                        </span>
                      )}
                      {m.dueDate && <DueChip date={m.dueDate} today={today} done={m.done} />}
                      <Button
                        size="iconSm"
                        variant="ghost"
                        aria-label={`Remove milestone ${m.title}`}
                        onClick={() =>
                          confirmAction({
                            title: 'Remove milestone?',
                            body: `“${m.title}” will be removed. Tasks linked to it stay in the project.`,
                            confirmLabel: 'Remove',
                            onConfirm: () => removeMilestone(id, m.id),
                          })
                        }
                      >
                        <X className="size-3" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <form
                className="flex gap-1 p-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!msTitle.trim()) return;
                  addMilestone(id, msTitle, msDate || null);
                  setMsTitle('');
                  setMsDate('');
                }}
              >
                <Input value={msTitle} onChange={(e) => setMsTitle(e.target.value)} placeholder="New milestone" aria-label="Milestone title" />
                <Input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} aria-label="Milestone due date" className="w-36" />
                <Button type="submit" size="icon" aria-label="Add milestone">
                  <Plus className="size-3.5" />
                </Button>
              </form>
            </div>
          </Panel>

          <Panel title="Links" tools={<Button size="xs" variant="ghost" onClick={() => openEditor({ kind: 'project', id })}>Edit links</Button>}>
            {links.length === 0 ? (
              <p className="px-2 py-2 text-sm text-muted">Add the repository, Claude Code session URLs, pull requests, docs, or the live site. They open in a new tab.</p>
            ) : (
              <ul>
                {links.map((l) => {
                  const Icon = LINK_ICON[l.kind];
                  return (
                    <li key={l.id} className="border-b border-line last:border-b-0">
                      <ExtLink href={l.url} className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-bar hover:no-underline">
                        <Icon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{l.label || LINK_KIND_LABEL[l.kind]}</span>
                        <span className="truncate font-mono text-2xs text-subtle">{hostOf(l.url)}</span>
                        <ExternalLink className="size-3 shrink-0 text-subtle" aria-hidden="true" />
                      </ExtLink>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="border-t border-line px-2 py-1 text-2xs text-subtle">Bookmarks only. Personal HQ cannot read or control GitHub, Claude Code, or other services.</p>
          </Panel>

          <LinkedItems item={{ kind: 'project', id }} />
          <Panel title="Recent activity" className="lg:col-span-2" tools={history.length > 8 ? <Button size="xs" variant="ghost" onClick={() => setTab('activity')}>All history</Button> : undefined}>
            {history.length === 0 ? (
              <p className="px-2 py-2 text-sm text-muted">Changes to this project and its tasks, notes, and bugs are recorded here.</p>
            ) : (
              <ul>
                {history.slice(0, 8).map((e) => (
                  <ActivityLine key={e.id} entry={e} showProject={false} onOpen={openEntry} />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === 'tasks' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <QuickAddTask id="project-quick-add" defaults={{ projectId: id }} className="min-w-64 flex-1" />
            <Segmented
              label="Layout"
              value={taskMode}
              onChange={setTaskMode}
              options={[
                { value: 'list', label: <List className="size-3.5" aria-label="List" /> },
                { value: 'board', label: <Columns3 className="size-3.5" aria-label="Board" /> },
              ]}
            />
            {taskMode === 'list' && (
              <label className="flex items-center gap-1.5 text-sm">
                <Check checked={showDone} onChange={setShowDone} label="Show completed" /> Show completed
              </label>
            )}
          </div>
          {taskMode === 'board' ? (
            <TaskBoard tasks={projectTasks} showProject={false} />
          ) : listedTasks.length === 0 ? (
            <div className="border border-line bg-panel">
              <EmptyState title={projectTasks.length ? 'All tasks completed' : 'No tasks yet'}>Type a task above and press Enter.</EmptyState>
            </div>
          ) : (
            <ul className="border border-line bg-panel">
              {listedTasks.map((t) => (
                <TaskRow key={t.id} task={t} showProject={false} />
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'bugs' && <BugsTable projectId={id} />}

      {tab === 'notes' && (
        <div className="flex flex-col gap-2">
          <div>
            <Button onClick={() => navigate('notes', createNote({ projectId: id, title: `${project.name} notes` }).id)}>
              <NotebookPen className="size-3.5" aria-hidden="true" /> New note for this project
            </Button>
          </div>
          {projectNotes.length === 0 ? (
            <div className="border border-line bg-panel">
              <EmptyState title="No notes linked">Decisions, research, and documentation for this project.</EmptyState>
            </div>
          ) : (
            <ul className="border border-line bg-panel">
              {projectNotes.map((n) => (
                <li key={n.id} className="border-b border-line last:border-b-0">
                  <button type="button" onClick={() => navigate('notes', n.id)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-bar">
                    <NotebookPen className="size-3.5 text-subtle" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm">{n.title}</span>
                    <span className="font-mono text-2xs text-subtle">{relativeTime(n.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'ideas' && (
        <div className="flex flex-col gap-2">
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ideaText.trim()) return;
              createIdea({ body: ideaText, projectId: id, inbox: false });
              setIdeaText('');
              toast('Idea added to this project');
            }}
          >
            <Input value={ideaText} onChange={(e) => setIdeaText(e.target.value)} placeholder="Add an idea for this project and press Enter" aria-label="New project idea" />
            <Button type="submit">Add</Button>
          </form>
          {projectIdeas.length === 0 ? (
            <div className="border border-line bg-panel">
              <EmptyState title="No ideas linked">Ideas you link to this project, or create here, show up in this tab.</EmptyState>
            </div>
          ) : (
            <div className="grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {projectIdeas.map((i) => (
                <IdeaCard key={i.id} idea={i} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'activity' &&
        (history.length === 0 ? (
          <div className="border border-line bg-panel">
            <EmptyState title="No history yet">Every change to this project is recorded here.</EmptyState>
          </div>
        ) : (
          <ul className="border border-line bg-panel">
            {history.map((e) => (
              <ActivityLine key={e.id} entry={e} showProject={false} onOpen={openEntry} />
            ))}
          </ul>
        ))}
    </>
  );
}
