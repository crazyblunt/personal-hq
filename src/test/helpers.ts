/** A Storage implementation backed by a Map, so tests control exactly what is stored. */
export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.map.set(key, String(value));
  }
  keys() {
    return [...this.map.keys()];
  }
}

export const iso = (daysAgo: number, base = new Date('2026-10-21T12:00:00')) => new Date(base.getTime() - daysAgo * 86_400_000).toISOString();

/** A small Agent Command Center dataset in its schema-2 shape. */
export function legacyFixture() {
  return {
    projects: [
      { id: 'p1', name: 'Agent Command Center', description: 'Workspace', status: 'active', color: 'violet', techStack: ['React'], repoUrl: 'https://github.com/x/acc', createdAt: iso(20), updatedAt: iso(2) },
      { id: 'p2', name: 'Old', description: '', status: 'archived', color: 'rose', techStack: [], repoUrl: '', createdAt: iso(40), updatedAt: iso(30) },
    ],
    tasks: [
      { id: 't1', projectId: 'p1', title: 'Board drag and drop', description: '', status: 'completed', priority: 'high', assignee: 'Claude Code', order: 0, completedAt: iso(3), createdAt: iso(10), updatedAt: iso(3) },
      { id: 't2', projectId: 'p1', title: 'Write tests', description: '', status: 'testing', priority: 'medium', assignee: '', order: 0, completedAt: null, createdAt: iso(5), updatedAt: iso(1) },
      { id: 't3', projectId: 'missing', title: 'Orphan', description: '', status: 'planned', priority: 'low', assignee: '', order: 1, completedAt: null, createdAt: iso(4), updatedAt: iso(4) },
      { id: 'bad', title: 42 },
    ],
    prompts: [{ id: 'pr1', title: 'Plan first', body: 'Outline a plan.', tags: ['planning'], projectId: null, favorite: true, copyCount: 2, lastCopiedAt: iso(1), createdAt: iso(20), updatedAt: iso(1) }],
    bugs: [
      { id: 'b1', projectId: 'p1', title: 'Overflow', description: '', stepsToReproduce: '1. open', severity: 'high', status: 'open', resolvedAt: null, createdAt: iso(6), updatedAt: iso(6) },
      { id: 'b2', projectId: 'p1', title: 'Stale search', description: '', stepsToReproduce: '', severity: 'medium', status: 'fixed', resolvedAt: iso(2), createdAt: iso(8), updatedAt: iso(2) },
    ],
    notes: [{ id: 'n1', projectId: 'p1', title: 'Decisions', body: '- storage adapter', pinned: true, createdAt: iso(15), updatedAt: iso(3) }],
  };
}

export function writeLegacy(storage: Storage, data = legacyFixture()) {
  for (const [k, v] of Object.entries(data)) storage.setItem(`acc:${k}`, JSON.stringify(v));
  storage.setItem('acc:meta', JSON.stringify({ schemaVersion: 2 }));
}

/** Installs a `window.matchMedia` stub that answers every query with `matches` (jsdom has none). */
export function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((media: string) => ({
    matches,
    media,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

export function clearMatchMedia() {
  delete (window as { matchMedia?: unknown }).matchMedia;
}
