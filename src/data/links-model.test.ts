import { createMemoryAdapter } from './adapters/memory';
import { normalizeCollection, normalizeSettings } from './normalize';
import { createIdea, createNote, createProject, createTask, initStore, restoreRecord, updateTask, useHQ } from './store';

beforeEach(async () => {
  await initStore(createMemoryAdapter());
});

describe('links, project tags, and saved views in the data model', () => {
  it('normalizes item links, dropping malformed entries and duplicates', () => {
    const t = normalizeCollection('tasks', [{ id: 't', title: 'T', itemLinks: [{ kind: 'note', id: 'n1' }, { kind: 'event', id: 'e' }, { kind: 'note' }, { kind: 'note', id: 'n1' }] }]).items[0];
    expect(t.itemLinks).toEqual([{ kind: 'note', id: 'n1' }]);
  });

  it('defaults the new fields on old records and settings', () => {
    expect(normalizeCollection('projects', [{ id: 'p', name: 'P' }]).items[0]).toMatchObject({ tags: [], itemLinks: [] });
    for (const [name, raw] of [['tasks', { id: 't', title: 'T' }], ['notes', { id: 'n', title: 'N' }], ['ideas', { id: 'i', body: 'I' }]] as const) {
      expect(normalizeCollection(name, [raw]).items[0]).toMatchObject({ itemLinks: [] });
    }
    expect(normalizeSettings({}).views).toEqual([]);
  });

  it('keeps valid saved views and repairs bad filters', () => {
    const v = normalizeSettings({
      views: [{ id: 'v', name: 'School', filters: { kinds: ['task', 'bogus'], state: 'nope' }, sort: { key: 'title', dir: 'asc' } }, { id: 'x' }],
    }).views;
    expect(v).toEqual([{ id: 'v', name: 'School', filters: { kinds: ['task'], query: '', tag: '', projectId: '', state: 'open' }, sort: { key: 'title', dir: 'asc' } }]);
  });

  it('new records start with empty links and projects with no tags', () => {
    expect(createTask({ title: 'T' }).itemLinks).toEqual([]);
    expect(createNote({ title: 'N' }).itemLinks).toEqual([]);
    expect(createIdea({ body: 'I' }).itemLinks).toEqual([]);
    expect(createProject({ name: 'P' })).toMatchObject({ itemLinks: [], tags: [] });
    expect(useHQ.getState().settings.views).toEqual([]);
  });

  it('restoreRecord writes the old content with a new stamp', () => {
    const t = createTask({ title: 'Old' });
    updateTask(t.id, { title: 'New' });
    restoreRecord('tasks', t);
    const now = useHQ.getState().tasks[0];
    expect(now.title).toBe('Old');
    expect(now.updatedAt >= t.updatedAt).toBe(true);
  });
});
