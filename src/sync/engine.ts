/**
 * One round of sync: pull what changed on the server, merge it record by
 * record (the most recent edit wins, deletions included), then push what
 * changed here.
 *
 * Each record is identified by "collection:id" and stamped with its
 * updatedAt time. `shadow` remembers the stamp last exchanged for each
 * record, which is how a round knows what is new on either side.
 */
import { normalizeCollection, normalizeSettings } from '../data/normalize';
import type { RemoteChange } from '../data/store';
import { keepFieldsOlderCopiesDrop, keepSettingsOlderCopiesDrop } from '../data/compat';
import { COLLECTIONS, type CollectionName, type Settings, type WorkspaceData } from '../data/types';
import { decryptJson, encryptJson, rowName, type SyncKeys } from './crypto';
import type { SyncRow, SyncTransport } from './transport';

export interface SyncState {
  /** The private sync code. Stored on this device only. */
  code: string;
  /** Highest server change number already pulled. */
  lastSeq: number;
  lastSyncAt: string | null;
  /** recordKey → stamp last exchanged with the server ("del:<time>" for deletions). */
  shadow: Record<string, string>;
  /** recordKey → when it was deleted on this device. */
  tombstones: Record<string, string>;
}

export function newSyncState(code: string): SyncState {
  return { code, lastSeq: 0, lastSyncAt: null, shadow: {}, tombstones: {} };
}

interface Payload {
  /** Record key, "collection:id" or "settings:settings". */
  k: string;
  /** Change time. */
  u: string;
  /** Deleted. */
  d?: true;
  /** The record itself. */
  r?: unknown;
}

export interface SyncDeps {
  transport: SyncTransport;
  keys: SyncKeys;
  state: SyncState;
  getWorkspace: () => WorkspaceData;
  apply: (changes: RemoteChange[], settings?: Settings) => void;
  now?: () => Date;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  skipped: number;
}

const EPOCH = '1970-01-01T00:00:00.000Z';
const PULL_PAGE = 500;
const PUSH_BATCH = 200;
const TOMBSTONE_DAYS = 90;
const SETTINGS_KEY = 'settings:settings';

/** A single, comparable timestamp format, whatever the record stored. */
export function canonicalStamp(value: string | undefined | null): string {
  if (!value) return EPOCH;
  const t = Date.parse(value);
  return Number.isNaN(t) ? EPOCH : new Date(t).toISOString();
}

function recordStamp(collection: CollectionName, r: { updatedAt?: string; at?: string }): string {
  return canonicalStamp(collection === 'activity' ? r.at : r.updatedAt);
}

/** Every local record by key, with its stamp. */
function localIndex(ws: WorkspaceData): Map<string, { collection: CollectionName | 'settings'; stamp: string; record: unknown }> {
  const m = new Map<string, { collection: CollectionName | 'settings'; stamp: string; record: unknown }>();
  for (const c of COLLECTIONS) {
    for (const r of ws[c] as { id: string; updatedAt?: string; at?: string }[]) m.set(`${c}:${r.id}`, { collection: c, stamp: recordStamp(c, r), record: r });
  }
  m.set(SETTINGS_KEY, { collection: 'settings', stamp: canonicalStamp(ws.settings.updatedAt), record: ws.settings });
  return m;
}

function splitKey(key: string): { collection: string; id: string } {
  const i = key.indexOf(':');
  return { collection: key.slice(0, i), id: key.slice(i + 1) };
}

const isCollection = (c: string): c is CollectionName => (COLLECTIONS as readonly string[]).includes(c);

export async function syncOnce(d: SyncDeps): Promise<SyncResult> {
  const { transport, keys, state } = d;
  const result: SyncResult = { pulled: 0, pushed: 0, skipped: 0 };

  /* ---- Pull ---- */
  for (;;) {
    const rows = await transport.pull(keys.space, state.lastSeq, PULL_PAGE);
    if (!rows.length) break;
    const local = localIndex(d.getWorkspace());
    const changes: RemoteChange[] = [];
    let settings: Settings | undefined;
    for (const row of rows) {
      state.lastSeq = Math.max(state.lastSeq, row.seq);
      let p: Payload;
      try {
        p = (await decryptJson(keys, row.p)) as Payload;
        if (!p || typeof p.k !== 'string' || typeof p.u !== 'string') throw new Error('bad payload');
      } catch {
        result.skipped++; // written with a different code, or damaged
        continue;
      }
      const remoteStamp = canonicalStamp(p.u);
      const shadowStamp = p.d ? `del:${remoteStamp}` : remoteStamp;
      if (state.shadow[p.k] === shadowStamp) continue;

      const mine = local.get(p.k);
      const localStamp = mine?.stamp ?? state.tombstones[p.k] ?? null;
      if (localStamp && localStamp >= remoteStamp) continue; // ours is as new or newer; it gets pushed below

      const { collection, id } = splitKey(p.k);
      if (p.k === SETTINGS_KEY) {
        if (p.d) continue;
        settings = { ...keepSettingsOlderCopiesDrop(p.r, normalizeSettings(p.r), d.getWorkspace().settings), updatedAt: remoteStamp };
      } else if (isCollection(collection)) {
        if (p.d) {
          if (mine) changes.push({ collection, id, record: null });
        } else {
          const n = normalizeCollection(collection, [p.r]);
          if (!n.items.length) {
            result.skipped++;
            continue;
          }
          changes.push({ collection, id, record: keepFieldsOlderCopiesDrop(collection, p.r, n.items[0], mine?.record) });
          delete state.tombstones[p.k];
        }
      } else {
        result.skipped++;
        continue;
      }
      state.shadow[p.k] = shadowStamp;
      result.pulled++;
    }
    if (changes.length || settings) d.apply(changes, settings);
    if (rows.length < PULL_PAGE) break;
  }

  /* ---- Push ---- */
  const outgoing = new Map<string, { stamp: string; shadow: string; payload: Payload }>();
  for (const [key, l] of localIndex(d.getWorkspace())) {
    if (state.shadow[key] !== l.stamp) outgoing.set(key, { stamp: l.stamp, shadow: l.stamp, payload: { k: key, u: l.stamp, r: l.record } });
  }
  for (const [key, at] of Object.entries(state.tombstones)) {
    const stamp = canonicalStamp(at);
    if (outgoing.has(key)) continue; // it exists again here; the record wins
    if (state.shadow[key] !== `del:${stamp}`) outgoing.set(key, { stamp, shadow: `del:${stamp}`, payload: { k: key, u: stamp, d: true } });
  }

  const pending = [...outgoing.entries()];
  for (let i = 0; i < pending.length; i += PUSH_BATCH) {
    const batch = pending.slice(i, i + PUSH_BATCH);
    const rows: SyncRow[] = await Promise.all(batch.map(async ([key, o]) => ({ k: await rowName(keys, key), u: o.stamp, p: await encryptJson(keys, o.payload) })));
    await transport.push(keys.space, rows);
    for (const [key, o] of batch) state.shadow[key] = o.shadow;
    result.pushed += batch.length;
  }

  /* ---- Tidy up ---- */
  const now = (d.now ?? (() => new Date()))();
  const cutoff = new Date(now.getTime() - TOMBSTONE_DAYS * 86_400_000).toISOString();
  for (const [key, at] of Object.entries(state.tombstones)) {
    if (state.shadow[key] === `del:${canonicalStamp(at)}` && at < cutoff) delete state.tombstones[key];
  }
  state.lastSyncAt = now.toISOString();
  return result;
}
