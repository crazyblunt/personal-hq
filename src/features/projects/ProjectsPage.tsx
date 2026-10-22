import { FolderKanban, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToday } from '../../app/clock';
import { readDevice, writeDevice } from '../../app/deviceStorage';
import { navigate, useRoute } from '../../app/router';
import { openEditor } from '../../app/ui';
import { isOpenBug, projectProgress } from '../../data/selectors';
import { useHQ } from '../../data/store';
import { PROJECT_CATEGORIES, PROJECT_CATEGORY_LABEL, PROJECT_STATUS_LABEL } from '../../data/types';
import { relativeDay, relativeTime } from '../../lib/dates';
import { matchesQuery } from '../../lib/search';
import { cn } from '../../lib/util';
import { Badge, ColorSquare, EmptyState, PageHeader, ProgressBar, SearchBox, Segmented } from '../../ui/bits';
import { Button, Select } from '../../ui/controls';
import { BugsTable } from './BugsTable';
import { ProjectDetail } from './ProjectDetail';
import { PROJECT_STATUS_STYLE } from './styles';

type Show = 'current' | 'completed' | 'archived' | 'bugs';

export function ProjectsPage() {
  const route = useRoute();
  if (route.id) return <ProjectDetail key={route.id} id={route.id} />;
  return <ProjectList />;
}

function ProjectList() {
  const today = useToday();
  const { projects, tasks, bugs, activity } = useHQ(useShallow((s) => ({ projects: s.projects, tasks: s.tasks, bugs: s.bugs, activity: s.activity })));
  const [show, setShow] = useState<Show>(() => readDevice<Show>('projects-show', 'current'));
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');

  const counts = {
    current: projects.filter((p) => p.status === 'active' || p.status === 'paused').length,
    completed: projects.filter((p) => p.status === 'completed').length,
    archived: projects.filter((p) => p.status === 'archived').length,
    bugs: bugs.filter(isOpenBug).length,
  };

  const rows = useMemo(
    () =>
      projects
        .filter((p) => (show === 'current' ? p.status === 'active' || p.status === 'paused' : p.status === show))
        .filter((p) => !category || p.category === category)
        .filter((p) => matchesQuery(query, p.name, p.description, p.techStack))
        .map((p) => ({ p, pr: projectProgress(p.id, tasks, bugs, activity, today) }))
        .sort((a, b) => (a.p.status === b.p.status ? (b.pr.lastActivityAt ?? b.p.updatedAt).localeCompare(a.pr.lastActivityAt ?? a.p.updatedAt) : a.p.status === 'active' ? -1 : 1)),
    [projects, tasks, bugs, activity, today, show, category, query],
  );

  return (
    <>
      <PageHeader
        title="Projects"
        icon={FolderKanban}
        description="Coding projects, school work, business ideas, and personal goals"
        actions={
          <Button variant="primary" onClick={() => openEditor({ kind: 'project' })}>
            <Plus className="size-3.5" aria-hidden="true" /> New project
          </Button>
        }
      />
      <div className="mb-2 flex flex-col gap-1.5 lg:flex-row lg:items-center">
        <Segmented
          label="Show"
          value={show}
          onChange={(v) => {
            setShow(v);
            writeDevice('projects-show', v);
          }}
          options={[
            { value: 'current', label: 'Current', count: counts.current },
            { value: 'completed', label: 'Completed', count: counts.completed },
            { value: 'archived', label: 'Archived', count: counts.archived },
            { value: 'bugs', label: 'All bugs', count: counts.bugs },
          ]}
        />
        {show !== 'bugs' && (
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:items-center">
            <SearchBox id="project-search" value={query} onChange={setQuery} placeholder="Search projects" className="sm:w-56" />
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className="sm:w-40">
              <option value="">All categories</option>
              {PROJECT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {PROJECT_CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {show === 'bugs' ? (
        <BugsTable />
      ) : rows.length === 0 ? (
        <div className="border border-line bg-panel">
          <EmptyState
            icon={FolderKanban}
            title={query || category ? 'No projects match' : show === 'archived' ? 'No archived projects' : show === 'completed' ? 'No completed projects' : 'No projects yet'}
            action={show === 'current' && !query && !category ? <Button onClick={() => openEditor({ kind: 'project' })}>New project</Button> : undefined}
          >
            {show === 'current' && !query && !category ? 'A project groups tasks, notes, ideas, bugs, milestones, and links. Progress comes from its tasks.' : undefined}
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line bg-panel">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-line bg-bar font-mono text-2xs tracking-wider text-muted uppercase">
              <tr>
                <th className="px-2 py-1 font-semibold">Project</th>
                <th className="px-2 py-1 font-semibold">Status</th>
                <th className="w-44 px-2 py-1 font-semibold">Progress</th>
                <th className="px-2 py-1 text-right font-semibold">Open</th>
                <th className="px-2 py-1 text-right font-semibold">Bugs</th>
                <th className="px-2 py-1 font-semibold">Target</th>
                <th className="px-2 py-1 font-semibold">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, pr }) => (
                <tr key={p.id} onClick={() => navigate('projects', p.id)} className="cursor-default border-b border-line last:border-b-0 hover:bg-bar/60">
                  <td className="px-2 py-1.5">
                    <a
                      href={`#projects.${p.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('projects', p.id);
                      }}
                      className="flex items-center gap-1.5 font-bold hover:underline"
                    >
                      <ColorSquare color={p.color} /> {p.name}
                    </a>
                    <span className="text-xs text-subtle">{PROJECT_CATEGORY_LABEL[p.category]}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge className={PROJECT_STATUS_STYLE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                  </td>
                  <td className="px-2 py-1.5">
                    {pr.total ? (
                      <div className="flex items-center gap-1.5">
                        <ProgressBar value={pr.percent} className="flex-1" label={`${p.name} progress`} />
                        <span className="w-9 text-right font-mono text-2xs text-muted tabular">{pr.percent}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-subtle">No tasks yet</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs tabular">
                    {pr.open}
                    {pr.overdue > 0 && <span className="text-bad"> ({pr.overdue}!)</span>}
                  </td>
                  <td className={cn('px-2 py-1.5 text-right font-mono text-xs tabular', pr.openBugs ? 'text-orange' : 'text-subtle')}>{pr.openBugs}</td>
                  <td className={cn('px-2 py-1.5 font-mono text-xs', p.targetDate && p.targetDate < today && p.status !== 'completed' ? 'text-bad' : 'text-muted')}>{p.targetDate ? relativeDay(p.targetDate, today) : '—'}</td>
                  <td className="px-2 py-1.5 font-mono text-xs text-subtle">{pr.lastActivityAt ? relativeTime(pr.lastActivityAt) : relativeTime(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
