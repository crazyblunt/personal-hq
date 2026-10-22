/**
 * A Storage-shaped key/value store backed by IndexedDB.
 *
 * Reads come from an in-memory copy loaded at startup, so the existing
 * localStorage adapter logic can run on top of it unchanged. Writes update
 * the memory copy at once and are written to IndexedDB in order;
 * `settle()` waits for them and reports any failure.
 */
const DB_NAME = 'personal-hq';
const STORE = 'kv';

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another open copy of the app.'));
  });
}

export class IdbStorage implements Storage {
  private map = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();
  private failure: unknown = null;

  private constructor(private db: IDBDatabase) {}

  static async open(name = DB_NAME): Promise<IdbStorage> {
    const s = new IdbStorage(await openDb(name));
    await s.reload();
    return s;
  }

  /** Re-reads everything from IndexedDB (after another tab changed it). */
  async reload(): Promise<void> {
    const tx = this.db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const [keys, values] = await Promise.all([promisify(store.getAllKeys()), promisify(store.getAll())]);
    this.map = new Map(keys.map((k, i) => [String(k), String(values[i])]));
  }

  private enqueue(op: (store: IDBObjectStore) => void) {
    this.queue = this.queue.then(
      () =>
        new Promise<void>((resolve) => {
          try {
            const tx = this.db.transaction(STORE, 'readwrite');
            op(tx.objectStore(STORE));
            tx.oncomplete = () => resolve();
            tx.onerror = () => {
              this.failure = tx.error ?? new Error('IndexedDB write failed');
              resolve();
            };
            tx.onabort = () => {
              this.failure = tx.error ?? new Error('IndexedDB write was aborted (storage may be full)');
              resolve();
            };
          } catch (e) {
            this.failure = e;
            resolve();
          }
        }),
    );
  }

  /** Waits for pending writes; throws if any of them failed. */
  async settle(): Promise<void> {
    await this.queue;
    if (this.failure) {
      const f = this.failure;
      this.failure = null;
      throw f instanceof Error ? f : new Error(String(f));
    }
  }

  get length() {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    const v = String(value);
    this.map.set(key, v);
    this.enqueue((s) => s.put(v, key));
  }
  removeItem(key: string): void {
    this.map.delete(key);
    this.enqueue((s) => s.delete(key));
  }
  clear(): void {
    this.map.clear();
    this.enqueue((s) => s.clear());
  }
}
