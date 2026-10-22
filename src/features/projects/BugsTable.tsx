import { Bug as BugIcon, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { openEditor } from '../../app/ui';
import { isOpenBug } from '../../data/selectors';
import { updateBug, useHQ } from '../../data/store';
import { BUG_SEVERITIES, BUG_STATUSES, BUG_STATUS_LABEL, type Bug } from '../../data/types';
import { relativeTime } from '../../lib/dates';
import { matchesQuery } from '../../lib/search';
import { cn } from '../../lib/util';
import { Badge, EmptyState, ProjectChip, SearchBox, Segmented } from '../../ui/bits';
import { Button, Select } from '../../ui/controls';

const SEVERITY_STYLE: Record<Bug['severity'], string> = {
  critical: 'border-bad-fill text-bad',
  high: 'border-orange-fill text-orange',
  medium: 'border-warn-fill text-warn',
  low: 'border-line-strong text-muted',
};
const SEVERITY_RANK: Record<Bug['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Bug tracker carried over from Agent Command Center. Scoped to one project, or all of them. */
export function BugsTable({ projectId }: { projectId?: string }) {
  const bugs = useHQ((s) => s.bugs);
  const hasProjects = useHQ((s) => s.projects.length > 0);
  const [show, setShow] = useState<'open' | 'resolved' | 'all'>('open');
  const [severity, setSeverity] = useState('');
  const [query, setQuery] = useState('');
  const scoped = useMemo(() => bugs.filter((b) => !projectId || b.projectId === projectId), [bugs, projectId]);
  const rows = useMemo(
    () =>
      scoped
        .filter((b) => (show === 'open' ? isOpenBug(b) : show === 'resolved' ? !isOpenBug(b) : true))
        .filter((b) => (!severity || b.severity === severity) && matchesQuery(query, b.title, b.description, b.stepsToReproduce))
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.createdAt.localeCompare(a.createdAt)),
    [scoped, show, severity, query],
  );
  const openCount = scoped.filter(isOpenBug).length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Segmented
          size="sm"
          label="Bug status"
          value={show}
          onChange={setShow}
          options={[
            { value: 'open', label: 'Open', count: openCount },
            { value: 'resolved', label: 'Resolved', count: scoped.length - openCount },
            { value: 'all', label: 'All', count: scoped.length },
          ]}
        />
        <SearchBox value={query} onChange={setQuery} placeholder="Search bugs" className="w-48" />
        <Select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filter by severity" className="w-32">
          <option value="">Any severity</option>
          {BUG_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        {(projectId || hasProjects) && (
          <Button size="sm" className="ml-auto" onClick={() => openEditor({ kind: 'bug', projectId: projectId ?? '' })}>
            <Plus className="size-3" aria-hidden="true" /> Log bug
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="border border-line bg-panel">
          <EmptyState icon={BugIcon} title={scoped.length ? 'No bugs match' : 'No bugs logged'}>
            {scoped.length ? undefined : 'Log bugs with steps to reproduce. Mark them Fixed or Won’t fix to keep a record.'}
          </EmptyState>
        </div>
      ) : (
        <ul className="border border-line bg-panel">
          {rows.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 border-b border-line px-2 py-1.5 last:border-b-0">
              <Badge className={SEVERITY_STYLE[b.severity]}>{b.severity}</Badge>
              <button type="button" onClick={() => openEditor({ kind: 'bug', id: b.id, projectId: b.projectId })} className={cn('min-w-0 flex-1 truncate text-left text-sm hover:underline', !isOpenBug(b) && 'text-subtle line-through')}>
                {b.title}
              </button>
              {!projectId && <ProjectChip projectId={b.projectId} />}
              <span className="font-mono text-2xs text-subtle">{relativeTime(b.createdAt)}</span>
              <Select value={b.status} onChange={(e) => updateBug(b.id, { status: e.target.value as Bug['status'] })} aria-label={`Status of ${b.title}`} className="h-6 w-32 text-xs">
                {BUG_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {BUG_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
