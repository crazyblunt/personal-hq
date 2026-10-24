/**
 * Tags across tasks, notes, ideas, and projects: counts, rename (which
 * merges into an existing tag), and remove. Tags match ignoring case.
 */
import { cleanTag, uniqueStrings } from '../lib/util';
import { KIND_COLLECTION, type LinkData } from './linking';
import { logActivity, patchRecord, useHQ } from './store';
import { LINKABLE_KINDS, type LinkableKind } from './types';

export interface TagStat {
  tag: string;
  total: number;
  byKind: Record<LinkableKind, number>;
}

type Tagged = { id: string; tags: string[] };

export function tagIndex(ws: LinkData): TagStat[] {
  const m = new Map<string, TagStat>();
  for (const kind of LINKABLE_KINDS) {
    for (const it of ws[KIND_COLLECTION[kind]] as Tagged[]) {
      for (const tag of uniqueStrings(it.tags ?? [])) {
        const k = tag.toLowerCase();
        const stat = m.get(k) ?? { tag, total: 0, byKind: { task: 0, note: 0, idea: 0, project: 0 } };
        stat.total++;
        stat.byKind[kind]++;
        m.set(k, stat);
      }
    }
  }
  return [...m.values()].sort((a, b) => a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
}

/** Rewrites every item's tags with `fn`; returns how many items changed. */
function rewriteTags(fn: (tags: string[]) => string[]): number {
  const ws = useHQ.getState();
  let changed = 0;
  for (const kind of LINKABLE_KINDS) {
    const name = KIND_COLLECTION[kind];
    for (const it of ws[name] as Tagged[]) {
      const next = fn(it.tags ?? []);
      if (next.length === it.tags.length && next.every((t, i) => t === it.tags[i])) continue;
      patchRecord(name, it.id, { tags: next });
      changed++;
    }
  }
  return changed;
}

/** Renames a tag on every item. Renaming to a tag that already exists merges them. */
export function renameTag(from: string, to: string): number {
  const next = cleanTag(to);
  if (!next) return 0;
  const key = from.trim().replace(/^#+/, '').toLowerCase();
  const changed = rewriteTags((tags) => (tags.some((t) => t.toLowerCase() === key) ? uniqueStrings(tags.map((t) => (t.toLowerCase() === key ? next : t))) : tags));
  if (changed) logActivity({ action: 'updated', entity: 'workspace', entityId: '', title: `#${from} → #${next}`, detail: `Renamed a tag on ${changed} item${changed === 1 ? '' : 's'}` });
  return changed;
}

export function removeTag(tag: string): number {
  const key = tag.trim().replace(/^#+/, '').toLowerCase();
  const changed = rewriteTags((tags) => tags.filter((t) => t.toLowerCase() !== key));
  if (changed) logActivity({ action: 'updated', entity: 'workspace', entityId: '', title: `Removed #${tag}`, detail: `Removed a tag from ${changed} item${changed === 1 ? '' : 's'}` });
  return changed;
}
