import { createMemoryAdapter } from '../data/adapters/memory';
import { createIdea, createNote, createProject, createTask, initStore, toggleMyDay, useHQ } from '../data/store';
import { buildBreakdownInput, buildOrganizeInput, buildPlanInput, buildSummarizeInput } from './inputs';
import { bridgePrompt } from './prompt';

beforeEach(async () => {
  await initStore(createMemoryAdapter());
});

describe('Claude job inputs send only what the job needs', () => {
  it('organize sends only the listed idea fields, tag names, and active projects', () => {
    const p = createProject({ name: 'Chem' });
    createProject({ name: 'Old', status: 'paused' });
    createIdea({ body: 'Lab idea #school', projectId: p.id, favorite: true });
    createTask({ title: 'Secret task' });
    createNote({ title: 'Private note' });
    const input = buildOrganizeInput(useHQ.getState());
    expect(Object.keys(input.ideas[0]).sort()).toEqual(['body', 'category', 'id', 'tags', 'title', 'url']);
    expect(input.projects).toEqual([{ id: p.id, name: 'Chem' }]);
    expect(input.tags).toEqual(['school']);
    expect(JSON.stringify(input)).not.toMatch(/Secret task|Private note/);
  });

  it('organize defaults to Inbox ideas and caps at 50; an explicit selection is respected', () => {
    for (let i = 0; i < 55; i++) createIdea({ body: `Idea ${i}` });
    const filed = createIdea({ body: 'Filed', inbox: false });
    expect(buildOrganizeInput(useHQ.getState()).ideas).toHaveLength(50);
    expect(buildOrganizeInput(useHQ.getState()).ideas.some((i) => i.id === filed.id)).toBe(false);
    expect(buildOrganizeInput(useHQ.getState(), [filed.id]).ideas.map((i) => i.id)).toEqual([filed.id]);
  });

  it('plan sends task fields without descriptions and caps at 60', () => {
    for (let i = 0; i < 70; i++) createTask({ title: `T${i}`, priority: 'high', description: 'do not send' });
    const input = buildPlanInput(useHQ.getState(), '2026-10-24');
    expect(input.tasks).toHaveLength(60);
    expect(Object.keys(input.tasks[0]).sort()).toEqual(['dueDate', 'id', 'priority', 'project', 'status', 'title']);
    expect(JSON.stringify(input)).not.toContain('do not send');
  });

  it('plan picks relevant open tasks only', () => {
    const due = createTask({ title: 'Due soon', dueDate: '2026-10-26' });
    const mine = createTask({ title: 'Mine today' });
    toggleMyDay(mine.id, '2026-10-24');
    createTask({ title: 'Someday', priority: 'low' });
    createTask({ title: 'Done', status: 'completed', priority: 'urgent' });
    const ids = buildPlanInput(useHQ.getState(), '2026-10-24').tasks.map((t) => t.id).sort();
    expect(ids).toEqual([due.id, mine.id].sort());
  });

  it('summarize sends only that note', () => {
    const n = createNote({ title: 'Lecture', body: 'Body', tags: ['x'] });
    expect(buildSummarizeInput(n)).toEqual({ note: { title: 'Lecture', body: 'Body' } });
  });

  it('breakdown sends the project, its milestones, and its task titles only', () => {
    const p = createProject({ name: 'Site', description: 'Portfolio', milestones: [{ id: 'm1', title: 'Launch', dueDate: '2026-12-01', done: false }] });
    createTask({ title: 'Pick a host', projectId: p.id, description: 'secret detail' });
    createTask({ title: 'Other project task' });
    const input = buildBreakdownInput(useHQ.getState(), p.id, '2026-10-24');
    expect(input).toEqual({ today: '2026-10-24', project: { name: 'Site', description: 'Portfolio', milestones: [{ id: 'm1', title: 'Launch', dueDate: '2026-12-01' }] }, existingTasks: ['Pick a host'] });
  });

  it('builds a copy/paste prompt with instructions, the schema, and the input', () => {
    const text = bridgePrompt('summarize', { note: { title: 'L', body: 'B' } });
    expect(text).toContain('Reply with only a JSON object matching this schema:');
    expect(text).toContain('"keyPoints"');
    expect(text).toContain('"title": "L"');
  });
});
