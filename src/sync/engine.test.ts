import { emptyWorkspace } from '../data/defaults';
import type { RemoteChange } from '../data/store';
import type { Settings, Task, WorkspaceData } from '../data/types';
import { deriveSyncKeys, formatSyncCode, generateSyncCode, isValidSyncCode, normalizeSyncCode, type SyncKeys } from './crypto';
import { newSyncState, syncOnce, type SyncState } from './engine';
import { createMemoryTransport } from './transport';

const task = (id: string, title: string, updatedAt: string): Task => ({
  id,
  title,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt,
  description: '',
  status: 'planned',
  priority: 'medium',
  category: '',
  tags: [],
  dueDate: null,
  projectId: null,
  eventId: null,
  milestoneId: null,
  myDay: null,
  subtasks: [],
  assignee: '',
  order: 0,
  completedAt: null,
  source: null,
  itemLinks: [],
});

/** A simulated device: its own workspace and sync state, sharing one server. */
class Device {
  ws: WorkspaceData = emptyWorkspace();
  state: SyncState;
  constructor(
    public keys: SyncKeys,
    code: string,
    private server: ReturnType<typeof createMemoryTransport>,
  ) {
    this.state = newSyncState(code);
  }
  apply = (changes: RemoteChange[], settings?: Settings) => {
    for (const c of changes) {
      const list = this.ws[c.collection] as { id: string }[];
      const i = list.findIndex((r) => r.id === c.id);
      if (c.record === null) {
        if (i !== -1) list.splice(i, 1);
      } else if (i === -1) list.push(c.record as { id: string });
      else list[i] = c.record as { id: string };
    }
    if (settings) this.ws.settings = settings;
  };
  delete(id: string, at: string) {
    this.ws.tasks = this.ws.tasks.filter((t) => t.id !== id);
    this.state.tombstones[`tasks:${id}`] = at;
  }
  sync() {
    return syncOnce({ transport: this.server, keys: this.keys, state: this.state, getWorkspace: () => this.ws, apply: this.apply, now: () => new Date('2026-10-22T12:00:00Z') });
  }
}

async function pair() {
  const code = generateSyncCode();
  const keys = await deriveSyncKeys(code);
  const server = createMemoryTransport();
  return { code, keys, server, mac: new Device(keys, code, server), phone: new Device(keys, code, server) };
}

describe('sync codes and encryption', () => {
  it('generates readable codes and forgives typing differences', () => {
    const code = generateSyncCode();
    expect(isValidSyncCode(code)).toBe(true);
    const typed = formatSyncCode(code).toLowerCase().replace(/0/g, 'o');
    expect(normalizeSyncCode(typed)).toBe(code);
    expect(isValidSyncCode('SHORT')).toBe(false);
  });

  it('derives the same space for the same code and a different one otherwise', async () => {
    const code = generateSyncCode();
    expect((await deriveSyncKeys(code)).space).toBe((await deriveSyncKeys(formatSyncCode(code))).space);
    expect((await deriveSyncKeys(generateSyncCode())).space).not.toBe((await deriveSyncKeys(code)).space);
    await expect(deriveSyncKeys('nope')).rejects.toThrow(/not valid/);
  });

  it('never sends readable data to the server', async () => {
    const { mac, server, keys } = await pair();
    mac.ws.tasks = [task('unmistakable-record-id', 'Secret thesis topic', '2026-10-20T10:00:00.000Z')];
    await mac.sync();
    const stored = JSON.stringify(server.rows(keys.space));
    expect(stored).not.toContain('Secret thesis');
    expect(stored).not.toContain('unmistakable');
    expect(stored).not.toContain('tasks:');
  });
});

describe('syncOnce', () => {
  it('copies one device’s data to another and back', async () => {
    const { mac, phone } = await pair();
    mac.ws.tasks = [task('t1', 'From Mac', '2026-10-20T10:00:00.000Z')];
    mac.ws.settings = { ...mac.ws.settings, theme: 'amber', updatedAt: '2026-10-20T09:00:00.000Z' };
    phone.ws.ideas = [{ id: 'i1', title: '', body: 'From phone', kind: 'idea', url: '', tags: [], category: '', favorite: false, inbox: true, archived: false, projectId: null, relatedIds: [], converted: [], remindOn: null, itemLinks: [], createdAt: '2026-10-21T08:00:00.000Z', updatedAt: '2026-10-21T08:00:00.000Z' }];

    expect(await mac.sync()).toMatchObject({ pushed: 2 }); // task + settings
    expect(await phone.sync()).toMatchObject({ pulled: 2 });
    expect(phone.ws.tasks.map((t) => t.title)).toEqual(['From Mac']);
    expect(phone.ws.settings.theme).toBe('amber');

    await mac.sync();
    expect(mac.ws.ideas.map((i) => i.body)).toEqual(['From phone']);
    expect(await mac.sync()).toMatchObject({ pulled: 0, pushed: 0 });
    expect(await phone.sync()).toMatchObject({ pulled: 0, pushed: 0 });
  });

  it('keeps the most recent edit when both devices change the same record', async () => {
    const { mac, phone } = await pair();
    mac.ws.tasks = [task('t1', 'Original', '2026-10-20T10:00:00.000Z')];
    await mac.sync();
    await phone.sync();

    mac.ws.tasks = [task('t1', 'Mac edit (older)', '2026-10-21T10:00:00.000Z')];
    phone.ws.tasks = [task('t1', 'Phone edit (newer)', '2026-10-21T11:00:00.000Z')];
    await mac.sync();
    await phone.sync();
    await mac.sync();
    expect(mac.ws.tasks[0].title).toBe('Phone edit (newer)');
    expect(phone.ws.tasks[0].title).toBe('Phone edit (newer)');
  });

  it('spreads deletions, and a later edit beats an earlier deletion', async () => {
    const { mac, phone } = await pair();
    mac.ws.tasks = [task('gone', 'Delete me', '2026-10-20T10:00:00.000Z'), task('kept', 'Edit wins', '2026-10-20T10:00:00.000Z')];
    await mac.sync();
    await phone.sync();

    mac.delete('gone', '2026-10-21T10:00:00.000Z');
    mac.delete('kept', '2026-10-21T10:00:00.000Z');
    phone.ws.tasks = phone.ws.tasks.map((t) => (t.id === 'kept' ? { ...t, title: 'Edited after delete', updatedAt: '2026-10-21T12:00:00.000Z' } : t));
    await mac.sync();
    await phone.sync();
    await mac.sync();

    expect(phone.ws.tasks.map((t) => t.id)).toEqual(['kept']);
    expect(mac.ws.tasks.map((t) => [t.id, t.title])).toEqual([['kept', 'Edited after delete']]);
  });

  it('ignores data it cannot decrypt instead of failing', async () => {
    const { mac, server } = await pair();
    const stranger = new Device(mac.keys, mac.state.code, server);
    await server.push(mac.keys.space, [{ k: 'junk-row-name', u: '2026-10-21T00:00:00.000Z', p: 'bm90IGVuY3J5cHRlZA==' }]);
    expect(await stranger.sync()).toMatchObject({ skipped: 1 });
  });

  it('handles more records than one page or batch', async () => {
    const { mac, phone } = await pair();
    mac.ws.tasks = Array.from({ length: 1200 }, (_, i) => task(`t${i}`, `Task ${i}`, `2026-10-20T10:00:00.${String(i % 1000).padStart(3, '0')}Z`));
    expect((await mac.sync()).pushed).toBe(1201);
    // Both devices still have default settings, so only the tasks come down.
    expect((await phone.sync()).pulled).toBe(1200);
    expect(phone.ws.tasks).toHaveLength(1200);
  });
});
