/**
 * Talks to the sync server. The server is a Postgres table reachable only
 * through three functions (see supabase/migrations). It keeps the newest copy
 * of each row and numbers every change, so devices can ask for "everything
 * after change N".
 */
export interface SyncRow {
  /** Opaque row name. */
  k: string;
  /** When the record last changed (ISO timestamp, the only plain-text field). */
  u: string;
  /** Encrypted record. */
  p: string;
}

export interface PulledRow extends SyncRow {
  seq: number;
}

export interface SyncTransport {
  pull(space: string, since: number, limit: number): Promise<PulledRow[]>;
  /** Stores rows, keeping whichever copy of each is newest. */
  push(space: string, rows: SyncRow[]): Promise<void>;
  deleteSpace(space: string): Promise<void>;
}

export class SyncNetworkError extends Error {}
export class SyncServerError extends Error {}

export function createSupabaseTransport(url: string, key: string): SyncTransport {
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  // Legacy anon keys are JWTs and go in Authorization too; new publishable keys do not.
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;

  async function rpc<T>(name: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch {
      throw new SyncNetworkError('Can’t reach the sync server. Check your internet connection.');
    }
    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = j?.message ?? j?.error ?? '';
      } catch {
        /* no body */
      }
      if (res.status >= 500 || res.status === 404) {
        throw new SyncServerError(`The sync server isn’t responding (${res.status}). If it was idle for a week, restore the project in the Supabase dashboard.`);
      }
      throw new SyncServerError(`Sync was refused (${res.status}${detail ? `: ${detail}` : ''}).`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  return {
    async pull(space, since, limit) {
      const rows = await rpc<{ k: string; u: string; p: string; seq: number | string }[]>('phq_sync_pull', { p_space: space, p_since: since, p_limit: limit });
      return (rows ?? []).map((r) => ({ k: r.k, u: r.u, p: r.p, seq: Number(r.seq) }));
    },
    async push(space, rows) {
      await rpc('phq_sync_push', { p_space: space, p_rows: rows });
    },
    async deleteSpace(space) {
      await rpc('phq_sync_delete_space', { p_space: space });
    },
  };
}

/** An in-memory server with the same rules as the real one. Used by tests. */
export function createMemoryTransport(): SyncTransport & { rows: (space: string) => PulledRow[] } {
  const spaces = new Map<string, Map<string, PulledRow>>();
  let seq = 0;
  const of = (space: string) => {
    let m = spaces.get(space);
    if (!m) spaces.set(space, (m = new Map()));
    return m;
  };
  return {
    async pull(space, since, limit) {
      return [...of(space).values()]
        .filter((r) => r.seq > since)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },
    async push(space, rows) {
      if (rows.length > 500) throw new SyncServerError('too many rows');
      const m = of(space);
      for (const r of rows) {
        const cur = m.get(r.k);
        if (!cur || r.u > cur.u) m.set(r.k, { ...r, seq: ++seq });
      }
    },
    async deleteSpace(space) {
      spaces.delete(space);
    },
    rows: (space) => [...of(space).values()],
  };
}
