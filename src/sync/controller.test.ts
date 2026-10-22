import { createMemoryAdapter } from '../data/adapters/memory';
import { createTask, deleteTask, getAdapter, initStore, useHQ } from '../data/store';
import { decryptJson, deriveSyncKeys, generateSyncCode } from './crypto';
import { disableSync, enableSync, joinSync, syncNow, useSync } from './controller';
import { setSyncTransport } from './controller';
import { createMemoryTransport } from './transport';

let server: ReturnType<typeof createMemoryTransport>;

beforeEach(async () => {
  server = createMemoryTransport();
  setSyncTransport(server);
  await initStore(createMemoryAdapter());
});

afterEach(async () => {
  await disableSync();
});

async function serverPayloads(code: string) {
  const keys = await deriveSyncKeys(code);
  return Promise.all(server.rows(keys.space).map((r) => decryptJson(keys, r.p) as Promise<{ k: string; d?: boolean; r?: { title?: string } }>));
}

describe('sync controller', () => {
  it('turns sync on, uploads this device’s data, and remembers the code', async () => {
    createTask({ title: 'Read chapter 3' });
    const code = await enableSync();
    expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{1,4}){6}$/);
    expect(useSync.getState()).toMatchObject({ status: 'idle', error: null });
    const payloads = await serverPayloads(code);
    expect(payloads.some((p) => p.r?.title === 'Read chapter 3')).toBe(true);
    expect(await getAdapter().readAux!('sync')).toMatchObject({ code: code.replace(/-/g, '') });
  });

  it('sends deletions made on this device', async () => {
    const t = createTask({ title: 'Temporary' });
    const code = await enableSync();
    deleteTask(t.id);
    await syncNow();
    const payloads = await serverPayloads(code);
    expect(payloads.find((p) => p.k === `tasks:${t.id}`)).toMatchObject({ d: true });
  });

  it('refuses a code with no synced data instead of starting an empty space', async () => {
    await expect(joinSync(generateSyncCode())).rejects.toThrow(/No synced data/);
    expect(useSync.getState().status).not.toBe('idle');
    await expect(joinSync('too-short')).rejects.toThrow(/not valid/);
  });

  it('joins existing data and merges it with what is already here', async () => {
    createTask({ title: 'Made on the Mac' });
    const code = await enableSync();
    await disableSync();

    // A second device with its own local task.
    await initStore(createMemoryAdapter());
    createTask({ title: 'Made on the phone' });
    await joinSync(code);
    expect(useHQ.getState().tasks.map((t) => t.title).sort()).toEqual(['Made on the Mac', 'Made on the phone']);
    const payloads = await serverPayloads(code);
    expect(payloads.filter((p) => p.k.startsWith('tasks:'))).toHaveLength(2);
  });

  it('turning sync off during a sync round does not report a false problem', async () => {
    createTask({ title: 'First' });
    await enableSync();
    let release: (() => void) | undefined;
    setSyncTransport({
      ...server,
      push: async (space, rows) => {
        await new Promise<void>((r) => (release = r));
        return server.push(space, rows);
      },
    });
    createTask({ title: 'Second' });
    const round = syncNow();
    await vi.waitFor(() => expect(release).toBeDefined());
    await disableSync();
    release!();
    await round;
    expect(useSync.getState()).toMatchObject({ status: 'off', error: null });
    expect(await getAdapter().readAux!('sync')).toBeNull();
  });

  it('turning sync off keeps local data and forgets the code', async () => {
    createTask({ title: 'Stays' });
    await enableSync();
    await disableSync();
    expect(useHQ.getState().tasks).toHaveLength(1);
    expect(await getAdapter().readAux!('sync')).toBeNull();
    expect(useSync.getState().code).toBeNull();
  });
});
