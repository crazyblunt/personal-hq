import { createMemoryAdapter } from './adapters/memory';
import { buildLinkIndex, linkItems, refKey, refTitle, unlinkItems } from './linking';
import { convertIdea, createIdea, createNote, createProject, createTask, deleteIdea, initStore, useHQ } from './store';

beforeEach(async () => {
  await initStore(createMemoryAdapter());
});

const ws = () => useHQ.getState();

describe('link index and link actions', () => {
  it('indexes links both ways with relation labels', () => {
    const n = createNote({ title: 'Lab notes' });
    const t = createTask({ title: 'Lab report' });
    const p = createProject({ name: 'Chem' });
    linkItems({ kind: 'task', id: t.id }, { kind: 'project', id: p.id });
    linkItems({ kind: 'task', id: t.id }, { kind: 'note', id: n.id });
    const idx = buildLinkIndex(ws());
    expect(idx.get(`project:${p.id}`)).toEqual([{ ref: { kind: 'task', id: t.id }, relation: 'linked-from', removable: true }]);
    expect(idx.get(`task:${t.id}`)!.map((c) => c.relation).sort()).toEqual(['linked', 'linked-note']);
    expect(idx.get(`note:${n.id}`)).toEqual([{ ref: { kind: 'task', id: t.id }, relation: 'linked-task', removable: true }]);
    expect(ws().notes[0].taskIds).toEqual([t.id]); // note–task pairs live on the note
    expect(ws().tasks[0].itemLinks).toEqual([{ kind: 'project', id: p.id }]);
  });

  it('routes idea pairs to relatedIds and never duplicates a pair', () => {
    const a = createIdea({ body: 'A' });
    const b = createIdea({ body: 'B' });
    linkItems({ kind: 'idea', id: a.id }, { kind: 'idea', id: b.id });
    linkItems({ kind: 'idea', id: b.id }, { kind: 'idea', id: a.id });
    expect(ws().ideas.find((i) => i.id === a.id)!.relatedIds).toEqual([b.id]);
    expect(buildLinkIndex(ws()).get(`idea:${a.id}`)).toEqual([{ ref: { kind: 'idea', id: b.id }, relation: 'related-idea', removable: true }]);
  });

  it('does not add a second link for a pair already connected the other way', () => {
    const t = createTask({ title: 'T' });
    const p = createProject({ name: 'P' });
    linkItems({ kind: 'task', id: t.id }, { kind: 'project', id: p.id });
    linkItems({ kind: 'project', id: p.id }, { kind: 'task', id: t.id });
    expect(ws().projects[0].itemLinks).toEqual([]);
    expect(buildLinkIndex(ws()).get(`project:${p.id}`)).toHaveLength(1);
  });

  it('ignores self-links', () => {
    const t = createTask({ title: 'T' });
    linkItems({ kind: 'task', id: t.id }, { kind: 'task', id: t.id });
    expect(ws().tasks[0].itemLinks).toEqual([]);
  });

  it('shows conversions as source / converted-to and hides missing targets', () => {
    const i = createIdea({ body: 'Write essay' });
    const t = convertIdea(i.id, 'task')!;
    const idx = buildLinkIndex(ws());
    expect(idx.get(`task:${t.id}`)).toEqual([{ ref: { kind: 'idea', id: i.id }, relation: 'source', removable: false }]);
    expect(idx.get(`idea:${i.id}`)).toEqual([{ ref: { kind: 'task', id: t.id }, relation: 'converted-to', removable: false }]);
    deleteIdea(i.id);
    expect(buildLinkIndex(ws()).get(`task:${t.id}`) ?? []).toEqual([]);
  });

  it('unlinks from whichever side holds the link', () => {
    const t = createTask({ title: 'T' });
    const p = createProject({ name: 'P' });
    const n = createNote({ title: 'N' });
    linkItems({ kind: 'task', id: t.id }, { kind: 'project', id: p.id });
    linkItems({ kind: 'note', id: n.id }, { kind: 'task', id: t.id });
    unlinkItems({ kind: 'project', id: p.id }, { kind: 'task', id: t.id });
    unlinkItems({ kind: 'task', id: t.id }, { kind: 'note', id: n.id });
    expect(ws().tasks[0].itemLinks).toEqual([]);
    expect(ws().notes[0].taskIds).toEqual([]);
  });

  it('logs one activity entry per link and resolves titles', () => {
    const t = createTask({ title: 'Essay' });
    const n = createNote({ title: '' });
    const before = ws().activity.length;
    linkItems({ kind: 'task', id: t.id }, { kind: 'note', id: n.id });
    expect(ws().activity.length).toBe(before + 1);
    expect(refTitle({ kind: 'note', id: n.id }, ws())).toBe('Untitled note');
    expect(refTitle({ kind: 'task', id: 'gone' }, ws())).toBeNull();
    expect(refKey({ kind: 'task', id: 'x' })).toBe('task:x');
  });
});
