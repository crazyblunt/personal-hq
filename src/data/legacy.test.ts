import { legacyFixture } from '../test/helpers';
import { convertLegacy } from './legacy';

describe('convertLegacy (Agent Command Center → Personal HQ)', () => {
  const conv = convertLegacy(legacyFixture());

  it('keeps every readable record and reports the unreadable one', () => {
    expect(conv.counts).toEqual({ projects: 2, tasks: 3, prompts: 1, bugs: 2, notes: 1 });
    expect(conv.errors).toEqual(['tasks[3]: "title" must be text']);
  });

  it('maps statuses and fields onto the new model', () => {
    const t2 = conv.data.tasks.find((t) => t.id === 't2')!;
    expect(t2.status).toBe('in_progress');
    expect(t2.tags).toContain('testing');
    const t1 = conv.data.tasks.find((t) => t.id === 't1')!;
    expect(t1).toMatchObject({ status: 'completed', assignee: 'Claude Code', completedAt: expect.any(String), dueDate: null, subtasks: [], myDay: null });
    expect(conv.data.projects[0]).toMatchObject({ category: 'coding', repoUrl: 'https://github.com/x/acc', links: [], milestones: [] });
    expect(conv.data.projects[1]).toMatchObject({ status: 'archived', archivedFromStatus: 'active' });
    expect(conv.data.notes[0].favorite).toBe(true);
    expect(conv.data.prompts[0]).toMatchObject({ favorite: true, copyCount: 2 });
  });

  it('keeps tasks whose project is gone, unlinked instead of deleted', () => {
    expect(conv.data.tasks.find((t) => t.id === 't3')!.projectId).toBeNull();
  });

  it('rebuilds activity only from recorded timestamps, with stable ids', () => {
    const ids = conv.data.activity.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('legacy-task-t1-completed');
    expect(ids).toContain('legacy-bug-b2-completed');
    expect(ids).not.toContain('legacy-task-t2-completed');
    expect(conv.data.activity.every((a) => a.backfilled)).toBe(true);
    expect(convertLegacy(legacyFixture()).data.activity.map((a) => a.id)).toEqual(ids);
  });
});
