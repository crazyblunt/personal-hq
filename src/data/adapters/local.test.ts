import { MemoryStorage, legacyFixture, writeLegacy } from '../../test/helpers';
import { emptyWorkspace } from '../defaults';
import { createLocalAdapter, META_KEY, NewerDataError, RECOVERY_PREFIX } from './local';

describe('local storage adapter', () => {
  it('starts a clean workspace on a fresh install, without demo data', async () => {
    const storage = new MemoryStorage();
    const loaded = await createLocalAdapter(storage).load();
    expect(loaded.isNew).toBe(true);
    expect(loaded.migration).toBeNull();
    expect(loaded.data.tasks).toEqual([]);
    expect(loaded.data.projects).toEqual([]);
    expect(loaded.data.activity).toEqual([]);
    expect(JSON.parse(storage.getItem(META_KEY)!)).toMatchObject({ app: 'personal-hq', schemaVersion: 1 });
  });

  it('migrates Agent Command Center data once and leaves the original keys untouched', async () => {
    const storage = new MemoryStorage();
    writeLegacy(storage);
    const before = Object.fromEntries(storage.keys().map((k) => [k, storage.getItem(k)]));

    const first = await createLocalAdapter(storage).load();
    expect(first.migration).toMatchObject({ from: 'agent-command-center', counts: { tasks: 3, projects: 2 }, skipped: 1 });
    expect(first.data.tasks).toHaveLength(3);
    expect(first.issues[0]).toMatch(/could not be read/);
    expect(first.data.activity.at(-1)).toMatchObject({ action: 'imported', entity: 'workspace' });
    for (const [k, v] of Object.entries(before)) expect(storage.getItem(k)).toBe(v);

    const second = await createLocalAdapter(storage).load();
    expect(second.migration).toBeNull();
    expect(second.data.tasks).toHaveLength(3);
  });

  it('keeps unreadable data in a recovery slot instead of dropping it', async () => {
    const storage = new MemoryStorage();
    const a = createLocalAdapter(storage);
    await a.load();
    storage.setItem('phq:notes', '{not json');
    storage.setItem('phq:tasks', JSON.stringify([{ id: 'ok', title: 'Fine', createdAt: '2026-10-01T00:00:00Z' }, { title: 'no id' }]));
    const loaded = await a.load();
    expect(loaded.data.tasks.map((t) => t.id)).toEqual(['ok']);
    expect(loaded.issues).toHaveLength(2);
    const recovery = await a.listRecovery!();
    expect(recovery).toHaveLength(2);
    const notesCopy = storage.keys().find((k) => k.startsWith(`${RECOVERY_PREFIX}notes`))!;
    expect(storage.getItem(notesCopy)).toBe('{not json');
  });

  it('refuses to touch data written by a newer schema', async () => {
    const storage = new MemoryStorage();
    storage.setItem(META_KEY, JSON.stringify({ app: 'personal-hq', schemaVersion: 99 }));
    storage.setItem('phq:tasks', '[]');
    await expect(createLocalAdapter(storage).load()).rejects.toBeInstanceOf(NewerDataError);
    expect(storage.getItem('phq:tasks')).toBe('[]');
  });

  it('round-trips collections, settings, and the safety snapshot', async () => {
    const storage = new MemoryStorage();
    const a = createLocalAdapter(storage);
    await a.load();
    await a.saveCollection('ideas', [{ id: 'i1', body: 'Hello', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }]);
    const ws = emptyWorkspace();
    await a.saveSettings({ ...ws.settings, theme: 'amber', density: 'comfortable' });
    const loaded = await a.load();
    expect(loaded.data.ideas[0]).toMatchObject({ id: 'i1', body: 'Hello', inbox: true, kind: 'idea' });
    expect(loaded.data.settings).toMatchObject({ theme: 'amber', density: 'comfortable' });
    await a.saveSnapshot!({ at: '2026-10-21T00:00:00Z', reason: 'test', data: loaded.data });
    expect((await a.loadSnapshot!())?.data.ideas).toHaveLength(1);
  });

  it('still reports legacy data after migration, for re-merging', async () => {
    const storage = new MemoryStorage();
    writeLegacy(storage, { ...legacyFixture(), tasks: [] });
    const a = createLocalAdapter(storage);
    await a.load();
    const legacy = await a.readLegacy!();
    expect(legacy?.counts.projects).toBe(2);
  });

  it('surfaces write failures such as a full storage quota', async () => {
    const storage = new MemoryStorage();
    const a = createLocalAdapter(storage);
    await a.load();
    storage.failWrites = true;
    await expect(a.saveCollection('tasks', [])).rejects.toThrow(/quota/i);
  });
});
