import { createMemoryAdapter } from './adapters/memory';
import { DEFAULT_FILTERS, DEFAULT_SORT, deleteView, explorerRows, filterRows, renameView, saveView, sortRows } from './explorer';
import { buildLinkIndex } from './linking';
import { createIdea, createNote, createProject, createTask, initStore, updateIdea, updateProject, useHQ } from './store';

beforeEach(async () => {
  await initStore(createMemoryAdapter());
});

const rows = () => explorerRows(useHQ.getState(), buildLinkIndex(useHQ.getState()));

describe('Explorer rows', () => {
  it('builds one row per item with status, state, and date', () => {
    const t = createTask({ title: 'Essay', dueDate: '2026-11-01' });
    createNote({ title: 'Ideas', category: 'School' });
    const p = createProject({ name: 'Site' });
    updateProject(p.id, { status: 'completed' });
    const i = createIdea({ body: 'Old thought', remindOn: '2026-11-03' });
    updateIdea(i.id, { archived: true });
    const r = rows();
    expect(r.find((x) => x.ref.id === t.id)).toMatchObject({ status: 'Planned', state: 'open', date: '2026-11-01' });
    expect(r.find((x) => x.ref.kind === 'note')).toMatchObject({ status: 'School', state: 'open', date: null });
    expect(r.find((x) => x.ref.id === p.id)).toMatchObject({ state: 'done', projectId: null });
    expect(r.find((x) => x.ref.id === i.id)).toMatchObject({ status: 'Archived', state: 'archived', date: '2026-11-03' });
  });

  it('filters by kind, tag (any case), state, and text; sorts with nulls last', () => {
    createTask({ title: 'B task', tags: ['School'], dueDate: '2026-11-02' });
    createTask({ title: 'A task', tags: ['home'] });
    createNote({ title: 'School note', tags: ['school'] });
    const r = rows();
    expect(filterRows(r, { ...DEFAULT_FILTERS, tag: 'school' }).map((x) => x.title).sort()).toEqual(['B task', 'School note']);
    expect(filterRows(r, { ...DEFAULT_FILTERS, kinds: ['note'] })).toHaveLength(1);
    expect(filterRows(r, { ...DEFAULT_FILTERS, query: 'task home' }).map((x) => x.title)).toEqual(['A task']);
    expect(sortRows(filterRows(r, { ...DEFAULT_FILTERS, kinds: ['task'] }), { key: 'date', dir: 'asc' }, () => '').map((x) => x.title)).toEqual(['B task', 'A task']);
    expect(sortRows(filterRows(r, { ...DEFAULT_FILTERS, kinds: ['task'] }), { key: 'title', dir: 'asc' }, () => '').map((x) => x.title)).toEqual(['A task', 'B task']);
  });

  it('state "all" keeps done and archived items', () => {
    const t = createTask({ title: 'Done', status: 'completed' });
    expect(filterRows(rows(), DEFAULT_FILTERS).some((x) => x.ref.id === t.id)).toBe(false);
    expect(filterRows(rows(), { ...DEFAULT_FILTERS, state: 'all' }).some((x) => x.ref.id === t.id)).toBe(true);
  });

  it('saves, renames, and deletes views in settings', () => {
    const v = saveView('School', { ...DEFAULT_FILTERS, tag: 'school' }, DEFAULT_SORT);
    renameView(v.id, 'Class');
    expect(useHQ.getState().settings.views[0]).toMatchObject({ name: 'Class', filters: { tag: 'school' } });
    deleteView(v.id);
    expect(useHQ.getState().settings.views).toEqual([]);
  });
});
