import { createMemoryAdapter } from './adapters/memory';
import { emptyWorkspace } from './defaults';
import type { Project } from './types';
import {
  archiveProject,
  convertIdea,
  convertNoteToTask,
  createBug,
  createIdea,
  createNote,
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  flush,
  initStore,
  linkIdeas,
  moveTask,
  replaceWorkspace,
  restoreProject,
  toggleTaskDone,
  updateNote,
  updateSettings,
  updateTask,
  useHQ,
} from './store';

let adapter: ReturnType<typeof createMemoryAdapter>;

beforeEach(async () => {
  adapter = createMemoryAdapter();
  await initStore(adapter);
});

const state = () => useHQ.getState();
const actions = () => state().activity.map((a) => `${a.action}:${a.entity}`);

describe('tasks', () => {
  it('only needs a title and uses the default priority and status from settings', () => {
    updateSettings({ defaultPriority: 'high', defaultTaskStatus: 'inbox' });
    const t = createTask({ title: '  Read chapter 4  ' });
    expect(t).toMatchObject({ title: 'Read chapter 4', priority: 'high', status: 'inbox', dueDate: null, completedAt: null });
    expect(actions()).toEqual(['created:task']);
  });

  it('records completion time and real activity when completed and reopened', () => {
    const t = createTask({ title: 'Ship it' });
    toggleTaskDone(t.id);
    expect(state().tasks[0].completedAt).toEqual(expect.any(String));
    toggleTaskDone(t.id);
    expect(state().tasks[0]).toMatchObject({ status: 'planned', completedAt: null });
    expect(actions()).toEqual(['created:task', 'completed:task', 'reopened:task']);
  });

  it('merges repeated edits to one item into a single activity entry', () => {
    const t = createTask({ title: 'Draft' });
    updateTask(t.id, { description: 'a' });
    updateTask(t.id, { description: 'ab' });
    updateTask(t.id, { description: 'abc' });
    expect(actions()).toEqual(['created:task', 'updated:task']);
  });

  it('orders tasks on the board when moved between columns', () => {
    const a = createTask({ title: 'A', status: 'planned' });
    const b = createTask({ title: 'B', status: 'planned' });
    const c = createTask({ title: 'C', status: 'in_progress' });
    moveTask(c.id, 'planned', a.id);
    const planned = state()
      .tasks.filter((t) => t.status === 'planned')
      .sort((x, y) => x.order - y.order)
      .map((t) => t.title);
    expect(planned).toEqual(['C', 'A', 'B']);
    moveTask(b.id, 'completed');
    expect(state().tasks.find((t) => t.id === b.id)!.completedAt).toEqual(expect.any(String));
  });

  it('removes deleted tasks from notes that link to them', () => {
    const t = createTask({ title: 'Linked' });
    const n = createNote({ title: 'N', taskIds: [t.id] });
    deleteTask(t.id);
    expect(state().notes.find((x) => x.id === n.id)!.taskIds).toEqual([]);
  });
});

describe('ideas and conversions', () => {
  it('captures text, detecting links and #tags', () => {
    const i = createIdea({ body: 'Look at https://example.com/tool #research' });
    expect(i).toMatchObject({ kind: 'link', url: 'https://example.com/tool', tags: ['research'], inbox: true });
  });

  it('converts an idea to a task and keeps the idea, filed and linked', () => {
    const i = createIdea({ body: 'Email the professor about the lab\nAsk about late policy' });
    const t = convertIdea(i.id, 'task')!;
    expect(t).toMatchObject({ title: 'Email the professor about the lab', description: 'Ask about late policy', source: { kind: 'idea', id: i.id } });
    const idea = state().ideas[0];
    expect(idea.inbox).toBe(false);
    expect(idea.converted).toEqual([{ kind: 'task', id: t.id, at: expect.any(String) }]);
    expect(actions()).toContain('converted:idea');
  });

  it('links ideas in both directions', () => {
    const a = createIdea({ body: 'A' });
    const b = createIdea({ body: 'B' });
    linkIdeas(a.id, b.id);
    expect(state().ideas.map((i) => i.relatedIds)).toEqual([[b.id], [a.id]]);
  });

  it('turns a note into a linked task', () => {
    const n = createNote({ title: 'Lab report plan', body: 'steps' });
    const t = convertNoteToTask(n.id)!;
    expect(state().notes[0].taskIds).toEqual([t.id]);
    expect(t.source).toEqual({ kind: 'note', id: n.id });
  });
});

describe('projects', () => {
  it('archives and restores to the previous status', () => {
    const p = createProject({ name: 'Site', status: 'paused' });
    archiveProject(p.id);
    expect(state().projects[0]).toMatchObject({ status: 'archived', archivedFromStatus: 'paused' });
    restoreProject(p.id);
    expect(state().projects[0]).toMatchObject({ status: 'paused', archivedFromStatus: null });
  });

  it('deleting a project removes its bugs but keeps tasks and notes, unlinked', () => {
    const p = createProject({ name: 'Doomed' });
    createTask({ title: 'Keep me', projectId: p.id });
    createNote({ title: 'Keep me too', projectId: p.id });
    createBug({ projectId: p.id, title: 'Bug', description: '', stepsToReproduce: '', severity: 'low', status: 'open' });
    deleteProject(p.id);
    expect(state().projects).toEqual([]);
    expect(state().bugs).toEqual([]);
    expect(state().tasks[0].projectId).toBeNull();
    expect(state().notes[0].projectId).toBeNull();
  });
});

describe('persistence', () => {
  it('writes changes through the adapter', async () => {
    createTask({ title: 'Persist me' });
    updateNote('missing', { title: 'no-op' });
    await flush();
    expect(adapter.current().tasks.map((t) => t.title)).toEqual(['Persist me']);
    expect(state().saveState).toBe('saved');
  });

  it('takes a safety snapshot before replacing everything', async () => {
    createTask({ title: 'Before' });
    await replaceWorkspace(emptyWorkspace(), 'test reset');
    expect(state().tasks).toEqual([]);
    const snap = await adapter.loadSnapshot!();
    expect(snap?.reason).toBe('test reset');
    expect(snap?.data.tasks.map((t) => t.title)).toEqual(['Before']);
  });

  it('reports a failed save instead of pretending it worked', async () => {
    const failing = { ...createMemoryAdapter(), saveCollection: async () => Promise.reject(new Error('QuotaExceededError: quota')) };
    await initStore(failing);
    createTask({ title: 'Will not fit' });
    await flush();
    expect(state().saveState).toBe('error');
    expect(state().saveError).toMatch(/storage is full/);
  });
});

describe('conversions keep content', () => {
  it('idea → project carries tags and links back to the idea', () => {
    const i = createIdea({ body: 'Start a podcast #audio #side' });
    const p = convertIdea(i.id, 'project') as Project;
    expect(p.tags).toEqual(['audio', 'side']);
    expect(p.itemLinks).toEqual([{ kind: 'idea', id: i.id }]);
  });

  it('note → task keeps the whole note', () => {
    const body = 'x'.repeat(6000);
    const n = createNote({ title: 'Long', body });
    expect(convertNoteToTask(n.id)!.description).toBe(body);
  });
});

