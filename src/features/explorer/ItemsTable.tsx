import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ExplorerRow } from '../../data/explorer';
import { refKey } from '../../data/linking';
import type { ExplorerSort } from '../../data/types';
import { formatDate, relativeTime } from '../../lib/dates';
import { cn } from '../../lib/util';
import { EmptyState } from '../../ui/bits';
import { KIND_ICON, KIND_LABEL, openRef } from '../../ui/LinkedItems';

const COLUMNS: { key: ExplorerSort['key']; label: string; className?: string }[] = [
  { key: 'type', label: 'Type', className: 'w-20' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status', className: 'hidden w-28 sm:table-cell' },
  { key: 'project', label: 'Project', className: 'hidden w-36 lg:table-cell' },
  { key: 'date', label: 'Date', className: 'hidden w-24 md:table-cell' },
  { key: 'updated', label: 'Updated', className: 'hidden w-24 lg:table-cell' },
  { key: 'links', label: 'Links', className: 'hidden w-14 text-right lg:table-cell' },
];

/** The Items table. On small screens the extra columns fold into a second line under the title. */
export function ItemsTable({ rows, sort, onSort, projectName }: { rows: ExplorerRow[]; sort: ExplorerSort; onSort: (s: ExplorerSort) => void; projectName: (id: string | null) => string }) {
  return (
    <div className="overflow-auto border border-line bg-panel">
      <table aria-label="Items" className="w-full table-fixed border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-bar">
          <tr>
            {COLUMNS.map((c) => {
              const on = sort.key === c.key;
              return (
                <th key={c.key} scope="col" aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('border-b border-line p-0 text-left font-normal', c.className)}>
                  <button
                    type="button"
                    onClick={() => onSort({ key: c.key, dir: on && sort.dir === 'asc' ? 'desc' : on ? 'asc' : c.key === 'updated' || c.key === 'links' ? 'desc' : 'asc' })}
                    className={cn('flex h-6 w-full items-center gap-1 px-2 font-mono text-2xs tracking-wider uppercase hover:bg-raised', on ? 'text-fg' : 'text-subtle', c.key === 'links' && 'justify-end')}
                  >
                    {c.label}
                    {on && (sort.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const Icon = KIND_ICON[r.ref.kind];
            const project = r.projectId ? projectName(r.projectId) : '';
            return (
              <tr key={refKey(r.ref)} className="border-b border-line last:border-b-0 hover:bg-bar">
                <td className="px-2 py-0.5 align-top">
                  <span className="flex items-center gap-1 font-mono text-2xs text-subtle uppercase">
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    {KIND_LABEL[r.ref.kind]}
                  </span>
                </td>
                <td className="min-w-0 px-2 py-0.5">
                  <button type="button" onClick={() => openRef(r.ref)} className={cn('block w-full truncate text-left hover:underline', r.state !== 'open' && 'text-subtle')}>
                    {r.title}
                  </button>
                  <span className="block truncate font-mono text-2xs text-subtle lg:hidden">{[r.status, project, r.date && formatDate(r.date, { month: 'short', day: 'numeric' })].filter(Boolean).join(' · ')}</span>
                  {r.tags.length > 0 && <span className="block truncate font-mono text-2xs text-purple">{r.tags.map((t) => `#${t}`).join(' ')}</span>}
                </td>
                <td className="hidden px-2 py-0.5 align-top text-xs text-muted sm:table-cell">{r.status}</td>
                <td className="hidden truncate px-2 py-0.5 align-top text-xs text-muted lg:table-cell">{project}</td>
                <td className="hidden px-2 py-0.5 align-top font-mono text-2xs text-muted tabular md:table-cell">{r.date ? formatDate(r.date, { month: 'short', day: 'numeric' }) : ''}</td>
                <td className="hidden px-2 py-0.5 align-top font-mono text-2xs text-subtle lg:table-cell">{relativeTime(r.updatedAt)}</td>
                <td className="hidden px-2 py-0.5 text-right align-top font-mono text-2xs text-subtle tabular lg:table-cell">{r.links || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <EmptyState title="Nothing matches">Try fewer words, another tag, or the "All" state.</EmptyState>
      )}
    </div>
  );
}
