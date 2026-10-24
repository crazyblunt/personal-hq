import 'fake-indexeddb/auto';
import { MemoryStorage, writeLegacy } from '../../test/helpers';
import { emptyWorkspace } from '../defaults';
import { MOVED_MARKER, openIndexedDbAdapter } from './indexeddb';

let n = 0;
const fresh = () => `phq-test-${++n}`;

describe('IndexedDB adapter', () => {
  it('starts empty on a new browser and survives reopening', async () => {
    const name = fresh();
    const a = await openIndexedDbAdapter({ name, legacy: new MemoryStorage(), channelName: name });
    const first = await a.load();
    expect(first.isNew).toBe(true);
    expect(a.kind).toBe('indexeddb');
    await a.saveCollection('ideas', [{ id: 'i1', body: 'Kept', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }]);

    const reopened = await openIndexedDbAdapter({ name, legacy: new MemoryStorage(), channelName: name });
    const loaded = await reopened.load();
    expect(loaded.isNew).toBe(false);
    expect(loaded.data.ideas.map((i) => i.body)).toEqual(['Kept']);
  });

  it('copies existing localStorage data once and leaves the original in place', async () => {
    const name = fresh();
    const ls = new MemoryStorage();
    const ws = emptyWorkspace();
    ls.setItem('phq:meta', JSON.stringify({ app: 'personal-hq', schemaVersion: 1, createdAt: '2026-10-01T00:00:00Z' }));
    ls.setItem('phq:tasks', JSON.stringify([{ id: 't1', title: 'From localStorage' }]));
    ls.setItem('phq:settings', JSON.stringify({ ...ws.settings, theme: 'amber' }));
    ls.setItem('phq:device:recent', '[]');
    const before = ls.getItem('phq:tasks');

    const a = await openIndexedDbAdapter({ name, legacy: ls, channelName: name });
    const loaded = await a.load();
    expect(loaded.data.tasks.map((t) => t.title)).toEqual(['From localStorage']);
    expect(loaded.data.settings.theme).toBe('amber');
    expect(loaded.issues).toEqual([]);
    expect(ls.getItem('phq:tasks')).toBe(before);
    expect(ls.getItem(MOVED_MARKER)).toBe('indexeddb');

    // Later edits go to IndexedDB only; localStorage keeps its old copy untouched.
    await a.saveCollection('tasks', []);
    const again = await (await openIndexedDbAdapter({ name, legacy: ls, channelName: name })).load();
    expect(again.data.tasks).toEqual([]);
    expect(ls.getItem('phq:tasks')).toBe(before);
  });

  it('still migrates Agent Command Center data found in localStorage', async () => {
    const name = fresh();
    const ls = new MemoryStorage();
    writeLegacy(ls);
    const loaded = await (await openIndexedDbAdapter({ name, legacy: ls, channelName: name })).load();
    expect(loaded.migration?.counts.tasks).toBe(3);
    expect(ls.getItem('acc:tasks')).not.toBeNull();
  });

  it('keeps the last 7 daily snapshots and can restore one', async () => {
    const name = fresh();
    const a = await openIndexedDbAdapter({ name, legacy: null, channelName: name });
    await a.load();
    const ws = emptyWorkspace();
    for (let d = 1; d <= 9; d++) {
      await a.saveDailySnapshot!(`2026-10-0${d}`, { ...ws, notes: [{ id: `n${d}`, title: `Day ${d}`, body: '', tags: [], category: '', favorite: false, projectId: null, taskIds: [], source: null, itemLinks: [], createdAt: '', updatedAt: '' }] });
    }
    const list = await a.listDailySnapshots!();
    expect(list.map((s) => s.day)).toEqual(['2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05', '2026-10-04', '2026-10-03']);
    const snap = await a.loadSnapshotByKey!(list[0].key);
    expect(snap?.data.notes[0].title).toBe('Day 9');
  });

  it('stores small side records such as sync state', async () => {
    const name = fresh();
    const a = await openIndexedDbAdapter({ name, legacy: null, channelName: name });
    await a.load();
    await a.writeAux!('sync', { lastSeq: 4 });
    expect(await a.readAux!('sync')).toEqual({ lastSeq: 4 });
    await a.writeAux!('sync', null);
    expect(await a.readAux!('sync')).toBeNull();
  });
});
