import { Save, Table2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { readDevice, writeDevice } from '../../app/deviceStorage';
import { confirmAction, setExplorerRequest, toast, useUI } from '../../app/ui';
import { DEFAULT_FILTERS, DEFAULT_SORT, deleteView, explorerRows, filterRows, renameView, saveView, sortRows } from '../../data/explorer';
import { useHQ } from '../../data/store';
import { tagIndex } from '../../data/tags';
import { LINKABLE_KINDS, type ExplorerFilters, type ExplorerSort } from '../../data/types';
import { cn } from '../../lib/util';
import { PageHeader, SearchBox, Segmented } from '../../ui/bits';
import { Button, Check, Select } from '../../ui/controls';
import { KIND_LABEL, useLinkIndex } from '../../ui/LinkedItems';
import { ItemsTable } from './ItemsTable';
import { TagsPanel } from './TagsPanel';

type Tab = 'items' | 'tags';
interface ExplorerUI {
  tab: Tab;
  filters: ExplorerFilters;
  sort: ExplorerSort;
  viewId: string | null;
}
const DEFAULT_UI: ExplorerUI = { tab: 'items', filters: DEFAULT_FILTERS, sort: DEFAULT_SORT, viewId: null };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A small inline name box for saving or renaming a view. */
function NameBox({ label, initial, onSubmit, onCancel }: { label: string; initial: string; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && v.trim()) {
          e.preventDefault();
          onSubmit(v.trim());
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={onCancel}
      maxLength={40}
      aria-label={label}
      placeholder="View name"
      className="h-6 w-40 bevel-in bg-inset px-1.5 text-sm"
    />
  );
}

export function ExplorerPage() {
  const [ui, setUI] = useState<ExplorerUI>(() => ({ ...DEFAULT_UI, ...readDevice<Partial<ExplorerUI>>('explorer-ui', {}) }));
  const [naming, setNaming] = useState<'save' | 'rename' | null>(null);
  const views = useHQ((s) => s.settings.views);
  const data = useHQ(useShallow((s) => ({ tasks: s.tasks, notes: s.notes, ideas: s.ideas, projects: s.projects })));
  const index = useLinkIndex();
  const request = useUI((s) => s.explorerRequest);

  const update = (patch: Partial<ExplorerUI>) =>
    setUI((cur) => {
      const next = { ...cur, ...patch };
      writeDevice('explorer-ui', next);
      return next;
    });
  const setFilters = (f: Partial<ExplorerFilters>) => update({ filters: { ...ui.filters, ...f } });

  // Requests from elsewhere: a command bar search, a tag, or a saved view.
  useEffect(() => {
    if (!request) return;
    const view = request.viewId ? views.find((v) => v.id === request.viewId) : undefined;
    if (view) update({ tab: 'items', viewId: view.id, filters: view.filters, sort: view.sort });
    else update({ tab: 'items', viewId: null, filters: { ...DEFAULT_FILTERS, state: 'all', query: request.query ?? '', tag: request.tag ?? '' } });
    setExplorerRequest(null);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = ui.viewId ? views.find((v) => v.id === ui.viewId) : undefined;
  const modified = view ? !same(view.filters, ui.filters) || !same(view.sort, ui.sort) : false;
  const projectName = useMemo(() => {
    const m = new Map(data.projects.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (m.get(id) ?? '') : '');
  }, [data.projects]);
  const allRows = useMemo(() => explorerRows(data, index), [data, index]);
  const rows = useMemo(() => sortRows(filterRows(allRows, ui.filters), ui.sort, projectName), [allRows, ui.filters, ui.sort, projectName]);
  const tags = useMemo(() => tagIndex(data).map((t) => t.tag), [data]);
  const filtered = !same(ui.filters, DEFAULT_FILTERS);

  const toggleKind = (k: (typeof LINKABLE_KINDS)[number], on: boolean) => setFilters({ kinds: on ? [...ui.filters.kinds, k] : ui.filters.kinds.filter((x) => x !== k) });

  return (
    <>
      <PageHeader
        title="Explorer"
        icon={Table2}
        description="Tasks, notes, ideas, and projects in one table"
        actions={
          <Segmented
            label="Explorer tab"
            value={ui.tab}
            onChange={(tab) => update({ tab })}
            options={[
              { value: 'items', label: 'Items', count: allRows.length },
              { value: 'tags', label: 'Tags', count: tags.length },
            ]}
          />
        }
      />

      {ui.tab === 'tags' ? (
        <TagsPanel onPick={(tag) => update({ tab: 'items', viewId: null, filters: { ...DEFAULT_FILTERS, tag, state: 'all' } })} />
      ) : (
        <>
          <div className="mb-1.5 flex flex-wrap items-center gap-1">
            <div role="tablist" aria-label="Saved views" className="flex flex-wrap items-center gap-0.5">
              {[{ id: null, name: 'All items' }, ...views].map((v) => {
                const on = ui.viewId === v.id;
                return (
                  <button
                    key={v.id ?? 'all'}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      const saved = v.id ? views.find((x) => x.id === v.id) : undefined;
                      update(saved ? { viewId: saved.id, filters: saved.filters, sort: saved.sort } : { viewId: null, filters: DEFAULT_FILTERS, sort: DEFAULT_SORT });
                    }}
                    className={cn('h-6 px-2 text-sm', on ? 'bevel-in bg-inset font-bold text-fg' : 'bevel-out bg-raised text-muted hover:text-fg')}
                  >
                    {v.name}
                    {on && modified && <span title="Changed since it was saved"> •</span>}
                  </button>
                );
              })}
            </div>
            <span className="ml-auto flex flex-wrap items-center gap-1">
              {naming === 'save' ? (
                <NameBox
                  label="View name"
                  initial=""
                  onCancel={() => setNaming(null)}
                  onSubmit={(name) => {
                    const v = saveView(name, ui.filters, ui.sort);
                    update({ viewId: v.id });
                    setNaming(null);
                    toast(`Saved view “${v.name}”`);
                  }}
                />
              ) : naming === 'rename' && view ? (
                <NameBox
                  label="New view name"
                  initial={view.name}
                  onCancel={() => setNaming(null)}
                  onSubmit={(name) => {
                    renameView(view.id, name);
                    setNaming(null);
                  }}
                />
              ) : (
                <>
                  {view && modified && (
                    <Button
                      size="sm"
                      onClick={() => {
                        deleteView(view.id);
                        const v = saveView(view.name, ui.filters, ui.sort);
                        update({ viewId: v.id });
                      }}
                    >
                      Update view
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setNaming('save')}>
                    <Save className="size-3" aria-hidden="true" /> Save view
                  </Button>
                  {view && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setNaming('rename')}>
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          confirmAction({
                            title: `Delete the view “${view.name}”?`,
                            body: 'Only the saved filters are removed. No items are changed.',
                            confirmLabel: 'Delete view',
                            onConfirm: () => {
                              deleteView(view.id);
                              update({ viewId: null });
                            },
                          })
                        }
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </>
              )}
            </span>
          </div>

          <div className="mb-1.5 flex flex-col gap-1.5 border border-line bg-panel p-1.5 lg:flex-row lg:flex-wrap lg:items-center">
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="sr-only">Types</legend>
              {LINKABLE_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-1 text-sm">
                  <Check checked={ui.filters.kinds.includes(k)} onChange={(on) => toggleKind(k, on)} label={`Show ${KIND_LABEL[k]}s`} /> {KIND_LABEL[k]}s
                </label>
              ))}
            </fieldset>
            <SearchBox id="explorer-search" value={ui.filters.query} onChange={(query) => setFilters({ query })} placeholder="Search everything" className="lg:w-56" />
            <div className="grid grid-cols-3 gap-1.5 lg:flex">
              <Select value={ui.filters.tag} onChange={(e) => setFilters({ tag: e.target.value })} aria-label="Filter by tag" className="lg:w-32">
                <option value="">Any tag</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </Select>
              <Select value={ui.filters.projectId} onChange={(e) => setFilters({ projectId: e.target.value })} aria-label="Filter by project" className="lg:w-36">
                <option value="">Any project</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Select value={ui.filters.state} onChange={(e) => setFilters({ state: e.target.value as ExplorerFilters['state'] })} aria-label="Filter by state" className="lg:w-28">
                <option value="open">Open</option>
                <option value="done">Done</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </Select>
            </div>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
                <X className="size-3" aria-hidden="true" /> Clear filters
              </Button>
            )}
            <span className="font-mono text-2xs text-subtle lg:ml-auto">
              {rows.length} of {allRows.length}
            </span>
          </div>

          <ItemsTable rows={rows} sort={ui.sort} onSort={(sort) => update({ sort })} projectName={projectName} />
        </>
      )}
    </>
  );
}
