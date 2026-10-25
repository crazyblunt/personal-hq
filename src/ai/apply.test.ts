import { createMemoryAdapter } from '../data/adapters/memory';
import { undoBatch, useBatches } from '../data/batches';
import { createIdea, createNote, createProject, createTask, initStore, useHQ } from '../data/store';
import { applyRows, buildReviewRows, isDuplicateTask } from './apply';

const today = '2026-10-24';

beforeEach(async () => {
  await initStore(createMemoryAdapter());
  useBatches.setState({ list: [] });
});

describe('review rows and applying Claude changes', () => {
  it('flags duplicate tasks and leaves them unticked', () => {
    const p = createProject({ name: 'Site' });
    createTask({ title: 'Write the README', projectId: p.id });
    const rows = buildReviewRows([{ type: 'create_task', title: 'write the  readme.', description: '', priority: 'medium', dueDate: null, projectId: p.id, milestoneId: null, sourceNoteId: null }], useHQ.getState(), today);
    expect(rows[0]).toMatchObject({ duplicate: true, checked: false });
    expect(isDuplicateTask('Write the README', null, useHQ.getState(), today)).toBe(false);
  });

  it('a task already on My Day counts as a duplicate, and is not re-added to My Day', () => {
    const t = createTask({ title: 'Read chapter 4', myDay: today });
    expect(isDuplicateTask('Read Chapter 4', null, useHQ.getState(), today)).toBe(true);
    expect(buildReviewRows([{ type: 'add_to_myday', taskId: t.id, reason: '' }], useHQ.getState(), today)).toEqual([]);
  });

  it('adds tags without replacing and inserts summaries above the original body', () => {
    const i = createIdea({ body: 'Lab #school' });
    const n = createNote({ title: 'L', body: 'Original' });
    const rows = buildReviewRows(
      [
        { type: 'add_tags', ideaId: i.id, tags: ['school', 'lab'], reason: '' },
        { type: 'insert_summary', noteId: n.id, text: '## Summary (Claude)\n\nShort' },
      ],
      useHQ.getState(),
      today,
    );
    expect(rows[0]).toMatchObject({ before: 'school', after: 'school, lab', checked: true });
    applyRows(rows, 'Claude');
    expect(useHQ.getState().ideas[0].tags).toEqual(['school', 'lab']);
    expect(useHQ.getState().notes[0].body).toBe('## Summary (Claude)\n\nShort\n\n---\n\nOriginal');
  });

  it('drops tag rows that add nothing new', () => {
    const i = createIdea({ body: 'Lab #school' });
    expect(buildReviewRows([{ type: 'add_tags', ideaId: i.id, tags: ['School'], reason: '' }], useHQ.getState(), today)).toEqual([]);
  });

  it('applies only ticked rows as one undoable batch', () => {
    const t = createTask({ title: 'Read' });
    const rows = buildReviewRows(
      [
        { type: 'add_to_myday', taskId: t.id, reason: '' },
        { type: 'create_task', title: 'New', description: '', priority: 'low', dueDate: null, projectId: null, milestoneId: null, sourceNoteId: null },
      ],
      useHQ.getState(),
      today,
    );
    rows[1].checked = false;
    const b = applyRows(rows, 'Plan my day', today)!;
    expect(useHQ.getState().tasks.map((x) => x.title)).toEqual(['Read']);
    expect(useHQ.getState().tasks[0].myDay).toBe(today);
    undoBatch(b.id);
    expect(useHQ.getState().tasks[0].myDay).toBeNull();
  });

  it('creates action-item tasks linked to their note and converts ideas', () => {
    const n = createNote({ title: 'Lecture' });
    const i = createIdea({ body: 'Start a reading group' });
    const rows = buildReviewRows(
      [
        { type: 'create_task', title: 'Email the group', description: '', priority: 'medium', dueDate: null, projectId: null, milestoneId: null, sourceNoteId: n.id },
        { type: 'convert', ideaId: i.id, to: 'project', reason: 'Has several steps' },
      ],
      useHQ.getState(),
      today,
    );
    applyRows(rows, 'Claude');
    const task = useHQ.getState().tasks.find((x) => x.title === 'Email the group')!;
    expect(task.status).toBe('planned');
    expect(useHQ.getState().notes[0].taskIds).toEqual([task.id]);
    expect(useHQ.getState().projects.map((p) => p.name)).toEqual(['Start a reading group']);
    expect(useHQ.getState().ideas[0].converted).toHaveLength(1);
  });

  it('flags a task that repeats another task in the same reply', () => {
    const task = (title: string) => ({ type: 'create_task' as const, title, description: '', priority: 'medium' as const, dueDate: null, projectId: null, milestoneId: null, sourceNoteId: null });
    const rows = buildReviewRows([task('Write intro'), task('write  intro.'), task('Write outro')], useHQ.getState(), today);
    expect(rows.map((r) => [r.duplicate, r.checked])).toEqual([
      [false, true],
      [true, false],
      [false, true],
    ]);
  });

  it('flags a second Claude summary so it is not stacked by default', () => {
    const n = createNote({ title: 'L', body: '## Summary (Claude)\n\nOld\n\n---\n\nOriginal' });
    const rows = buildReviewRows([{ type: 'insert_summary', noteId: n.id, text: '## Summary (Claude)\n\nNew' }], useHQ.getState(), today);
    expect(rows[0]).toMatchObject({ duplicate: true, checked: false });
  });
});

