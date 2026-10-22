/**
 * Builds the organization review: a list of suggestions the user checks
 * before anything is applied. Nothing in here changes data.
 */
import { diffDays, toDateKey } from '../lib/dates';
import { ideaTitle } from '../data/store';
import type { DateKey, Idea, Note } from '../data/types';
import { actionableReason, findSimilarPairs, suggestCategory, suggestTags } from './rules';

export type ItemRef = { kind: 'idea' | 'note'; id: string };

export type Suggestion =
  | { key: string; type: 'tags'; target: ItemRef; title: string; tags: string[]; reason: string }
  | { key: string; type: 'category'; target: ItemRef; title: string; category: string; reason: string }
  | { key: string; type: 'to-task'; ideaId: string; title: string; reason: string }
  | { key: string; type: 'link-ideas'; a: string; b: string; titleA: string; titleB: string; reason: string }
  | { key: string; type: 'similar-notes'; a: string; b: string; titleA: string; titleB: string; reason: string }
  | { key: string; type: 'file-stale'; ideaId: string; title: string; reason: string };

export interface ReviewInput {
  ideas: Idea[];
  notes: Note[];
  today: DateKey;
}

/** Tags already used anywhere in the workspace, so suggestions can reuse them. */
function knownTags(input: ReviewInput): string[] {
  const set = new Map<string, string>();
  for (const x of [...input.ideas, ...input.notes]) for (const t of x.tags) if (!set.has(t.toLowerCase())) set.set(t.toLowerCase(), t);
  return [...set.values()];
}

export function buildReview(input: ReviewInput): Suggestion[] {
  const out: Suggestion[] = [];
  const tags = knownTags(input);
  const ideas = input.ideas.filter((i) => !i.archived);

  for (const i of ideas) {
    const text = `${i.title}\n${i.body}`;
    const title = ideaTitle(i);
    if (i.tags.length === 0) {
      const t = suggestTags(text, i.tags, tags).slice(0, 3);
      if (t.length) out.push({ key: `tags:idea:${i.id}`, type: 'tags', target: { kind: 'idea', id: i.id }, title, tags: t.map((x) => x.tag), reason: t.map((x) => `#${x.tag} ${x.reason}`).join('; ') });
    }
    if (!i.category) {
      const c = suggestCategory(text);
      if (c) out.push({ key: `cat:idea:${i.id}`, type: 'category', target: { kind: 'idea', id: i.id }, title, category: c.category, reason: c.reason });
    }
    if (!i.converted.some((c) => c.kind === 'task')) {
      const why = actionableReason(i.title || i.body);
      if (why) out.push({ key: `task:${i.id}`, type: 'to-task', ideaId: i.id, title, reason: `Reads like a to-do: ${why}` });
    }
    const age = diffDays(toDateKey(new Date(i.createdAt)), input.today);
    if (i.inbox && age >= 7) out.push({ key: `stale:${i.id}`, type: 'file-stale', ideaId: i.id, title, reason: `In the Inbox for ${age} days` });
  }

  for (const n of input.notes) {
    const text = `${n.title}\n${n.body}`;
    if (n.tags.length === 0) {
      const t = suggestTags(text, n.tags, tags).slice(0, 3);
      if (t.length) out.push({ key: `tags:note:${n.id}`, type: 'tags', target: { kind: 'note', id: n.id }, title: n.title, tags: t.map((x) => x.tag), reason: t.map((x) => `#${x.tag} ${x.reason}`).join('; ') });
    }
    if (!n.category) {
      const c = suggestCategory(text);
      if (c) out.push({ key: `cat:note:${n.id}`, type: 'category', target: { kind: 'note', id: n.id }, title: n.title, category: c.category, reason: c.reason });
    }
  }

  const ideaById = new Map(ideas.map((i) => [i.id, i]));
  for (const p of findSimilarPairs(ideas.map((i) => ({ id: i.id, text: `${i.title} ${i.body}` })))) {
    const a = ideaById.get(p.a)!;
    const b = ideaById.get(p.b)!;
    if (a.relatedIds.includes(b.id)) continue;
    out.push({ key: `link:${p.a}:${p.b}`, type: 'link-ideas', a: p.a, b: p.b, titleA: ideaTitle(a), titleB: ideaTitle(b), reason: `${Math.round(p.score * 100)}% word overlap: ${p.shared.slice(0, 5).join(', ')}` });
  }

  const noteById = new Map(input.notes.map((n) => [n.id, n]));
  for (const p of findSimilarPairs(input.notes.map((n) => ({ id: n.id, text: `${n.title} ${n.body.slice(0, 4000)}` })), 0.35, 3).slice(0, 20)) {
    out.push({ key: `simnote:${p.a}:${p.b}`, type: 'similar-notes', a: p.a, b: p.b, titleA: noteById.get(p.a)!.title, titleB: noteById.get(p.b)!.title, reason: `${Math.round(p.score * 100)}% word overlap: ${p.shared.slice(0, 5).join(', ')}` });
  }

  return out;
}
