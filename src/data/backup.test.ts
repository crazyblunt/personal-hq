import { legacyFixture } from '../test/helpers';
import { applyImport, buildExport, ImportError, parseImport, planImport } from './backup';
import { emptyWorkspace } from './defaults';
import type { Task, WorkspaceData } from './types';

const task = (id: string, title: string, updatedAt: string): Task => ({
  id,
  title,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt,
  description: '',
  status: 'planned',
  priority: 'medium',
  category: '',
  tags: [],
  dueDate: null,
  projectId: null,
  eventId: null,
  milestoneId: null,
  myDay: null,
  subtasks: [],
  assignee: '',
  order: 0,
  completedAt: null,
  source: null,
});

function workspaceWith(tasks: Task[]): WorkspaceData {
  return { ...emptyWorkspace(), tasks };
}

describe('parseImport', () => {
  it('explains files it cannot use', () => {
    expect(() => parseImport('{oops')).toThrow(ImportError);
    expect(() => parseImport('{oops')).toThrow(/isn't valid JSON/);
    expect(() => parseImport('[1,2]')).toThrow(/JSON object/);
    expect(() => parseImport(JSON.stringify({ app: 'other-app', data: { tasks: [] } }))).toThrow(/other-app/);
    expect(() => parseImport(JSON.stringify({ hello: 1 }))).toThrow(/No tasks/);
    expect(() => parseImport(JSON.stringify({ app: 'personal-hq', schemaVersion: 7, data: { tasks: [] } }))).toThrow(/newer version/);
  });

  it('round-trips a Personal HQ export', () => {
    const ws = workspaceWith([task('a', 'Alpha', '2026-10-02T00:00:00.000Z')]);
    ws.settings.theme = 'phosphor';
    const parsed = parseImport(JSON.stringify(buildExport(ws)));
    expect(parsed.source).toBe('personal-hq');
    expect(parsed.data.tasks).toEqual(ws.tasks);
    expect(parsed.settings?.theme).toBe('phosphor');
    expect(parsed.errors).toEqual([]);
  });

  it('accepts Agent Command Center exports and lists records it has to skip', () => {
    const parsed = parseImport(JSON.stringify({ app: 'agent-command-center', schemaVersion: 2, data: legacyFixture() }));
    expect(parsed.source).toBe('agent-command-center');
    expect(parsed.counts.tasks).toBe(3);
    expect(parsed.errors).toHaveLength(1);
  });

  it('corrects unknown values with a warning instead of failing', () => {
    const parsed = parseImport(JSON.stringify({ app: 'personal-hq', data: { tasks: [{ id: 'x', title: 'X', status: 'someday' }] } }));
    expect(parsed.data.tasks[0].status).toBe('planned');
    expect(parsed.warnings[0]).toMatch(/unknown status/);
  });
});

describe('import modes', () => {
  const current = workspaceWith([task('a', 'Mine', '2026-10-05T00:00:00.000Z'), task('b', 'Only mine', '2026-10-05T00:00:00.000Z')]);
  const file = parseImport(
    JSON.stringify(buildExport(workspaceWith([task('a', 'Newer copy', '2026-10-09T00:00:00.000Z'), task('c', 'New one', '2026-10-01T00:00:00.000Z')]))),
  );

  it('"add" never overwrites or removes existing records', () => {
    expect(planImport(current, file.data, 'add').tasks).toMatchObject({ add: 1, update: 0, unchanged: 1, keep: 1, remove: 0 });
    const next = applyImport(current, file, 'add', false);
    expect(next.tasks.map((t) => [t.id, t.title])).toEqual([
      ['a', 'Mine'],
      ['b', 'Only mine'],
      ['c', 'New one'],
    ]);
    expect(next.settings).toBe(current.settings);
  });

  it('"update" replaces only records edited more recently in the file', () => {
    expect(planImport(current, file.data, 'update').tasks).toMatchObject({ add: 1, update: 1 });
    expect(applyImport(current, file, 'update', false).tasks.find((t) => t.id === 'a')!.title).toBe('Newer copy');
    const older = parseImport(JSON.stringify(buildExport(workspaceWith([task('a', 'Old copy', '2026-09-01T00:00:00.000Z')]))));
    expect(applyImport(current, older, 'update', false).tasks.find((t) => t.id === 'a')!.title).toBe('Mine');
  });

  it('"replace" makes the workspace match the file exactly', () => {
    expect(planImport(current, file.data, 'replace').tasks).toMatchObject({ remove: 1 });
    expect(applyImport(current, file, 'replace', true).tasks.map((t) => t.id)).toEqual(['a', 'c']);
  });
});
