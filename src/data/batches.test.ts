import { createMemoryAdapter } from './adapters/memory';
import { recordBatch, undoBatch, useBatches } from './batches';
import { applyRemoteChanges, convertIdea, createIdea, createNote, createTask, getAdapter, initStore, updateIdea, updateTask, useHQ } from './store';
import { linkItems } from './linking';

beforeEach(async () => {
  await initStore(createMemoryAdapter());
  useBatches.setState({ list: [] });
});

describe('undoable batches', () => {
  it('records changes and creations, and undo reverses them', () => {
    const i = createIdea({ body: 'Essay idea' });
    const b = recordBatch('Organize', 'claude', () => {
      updateIdea(i.id, { tags: ['school'] });
      convertIdea(i.id, 'task');
    })!;
    expect(b.changed.map((c) => c.collection)).toEqual(['ideas']);
    expect(b.created.map((c) => c.collection)).toEqual(['tasks']);
    expect(undoBatch(b.id)).toEqual({ restored: 1, removed: 1, skipped: [] });
    expect(useHQ.getState().ideas[0]).toMatchObject({ tags: [], converted: [], inbox: true });
    expect(useHQ.getState().tasks).toEqual([]);
    expect(useBatches.getState().list).toEqual([]);
  });

  it('skips items edited after the batch, such as a newer synced version', () => {
    const t = createTask({ title: 'Read' });
    const b = recordBatch('Plan', 'claude', () => {
      updateTask(t.id, { myDay: '2026-10-24' });
    })!;
    const cur = useHQ.getState().tasks[0];
    applyRemoteChanges([{ collection: 'tasks', id: t.id, record: { ...cur, title: 'Read (edited on phone)', updatedAt: '2099-01-01T00:00:00.000Z' } }]);
    expect(undoBatch(b.id)).toEqual({ restored: 0, removed: 0, skipped: ['Read (edited on phone)'] });
    expect(useHQ.getState().tasks[0].title).toBe('Read (edited on phone)');
  });

  it('does not record activity entries, and logs one entry when undoing', () => {
    const i = createIdea({ body: 'x' });
    const b = recordBatch('Tags', 'local', () => {
      updateIdea(i.id, { tags: ['a'] });
    })!;
    expect(b.changed.every((c) => c.collection !== 'activity')).toBe(true);
    const before = useHQ.getState().activity.length;
    undoBatch(b.id);
    expect(useHQ.getState().activity.at(-1)).toMatchObject({ title: 'Undid: Tags' });
    expect(useHQ.getState().activity.length).toBe(before + 1);
  });

  it('returns null for a batch that changed nothing and keeps only the last 10', async () => {
    expect(recordBatch('Nothing', 'local', () => {})).toBeNull();
    const t = createTask({ title: 'x' });
    for (let n = 0; n < 12; n++) recordBatch(`B${n}`, 'local', () => updateTask(t.id, { title: `x${n}` }));
    expect(useBatches.getState().list).toHaveLength(10);
    expect(useBatches.getState().list[0].label).toBe('B11');
    expect(await getAdapter().readAux!('undo')).toHaveLength(10);
  });

  it('keeps a created record that other items now point at, and reports it', () => {
    const i = createIdea({ body: 'Start a podcast' });
    const b = recordBatch('Organize', 'claude', () => {
      convertIdea(i.id, 'project');
    })!;
    const project = useHQ.getState().projects[0];
    createTask({ title: 'Buy a mic', projectId: project.id });
    const t = createTask({ title: 'Outline episode 1' });
    const n = createNote({ title: 'Show notes' });
    linkItems({ kind: 'note', id: n.id }, { kind: 'task', id: t.id });
    expect(undoBatch(b.id)).toEqual({ restored: 1, removed: 0, skipped: ['Start a podcast (kept: other items use it)'] });
    expect(useHQ.getState().projects).toHaveLength(1);
    expect(useHQ.getState().tasks.find((x) => x.title === 'Buy a mic')!.projectId).toBe(project.id);
  });

  it('keeps a created task that a note now links to', () => {
    const i = createIdea({ body: 'Email the teacher' });
    const b = recordBatch('Organize', 'claude', () => {
      convertIdea(i.id, 'task');
    })!;
    const task = useHQ.getState().tasks[0];
    const n = createNote({ title: 'Class notes' });
    linkItems({ kind: 'note', id: n.id }, { kind: 'task', id: task.id });
    expect(undoBatch(b.id).skipped).toEqual(['Email the teacher (kept: other items use it)']);
    expect(useHQ.getState().tasks).toHaveLength(1);
  });
});

