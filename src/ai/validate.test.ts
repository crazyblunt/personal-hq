import { validateReply, type JobContext } from './validate';

const today = '2026-10-24';
const org: JobContext = {
  job: 'organize',
  input: { ideas: [{ id: 'i1', title: '', body: 'Lab', url: '', tags: [], category: '' }, { id: 'i2', title: '', body: 'Notes', url: '', tags: [], category: '' }], tags: [], projects: [{ id: 'p1', name: 'Chem' }] },
};
const act = (a: object) => ({ type: 'add_tags', tags: [], category: null, projectId: null, targetKind: null, targetId: null, to: null, ...a });
const ok = (r: ReturnType<typeof validateReply>) => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r;
};

describe('validateReply', () => {
  it('rejects a reply that is not the job shape', () => {
    expect(validateReply(org, { nope: 1 }, today)).toEqual({ ok: false, error: 'Wrong shape: suggestions' });
    expect(validateReply(org, { suggestions: 'x' }, today)).toEqual({ ok: false, error: 'Wrong shape: suggestions' });
    expect(validateReply(org, null, today)).toEqual({ ok: false, error: 'Wrong shape: reply' });
  });

  it('rejects unknown ids, including real-looking ids that were not sent', () => {
    const r = ok(validateReply(org, { suggestions: [{ ideaId: 'zz', reason: '', actions: [act({ tags: ['x'] })] }, { ideaId: 'i1', reason: '', actions: [act({ type: 'set_project', projectId: 'p9' })] }] }, today));
    expect(r.rejected.map((x) => x.reason)).toEqual(['Unknown item id', 'Unknown item id']);
    expect(r.changes).toEqual([]);
  });

  it('rejects unsupported actions', () => {
    const r = ok(validateReply(org, { suggestions: [{ ideaId: 'i1', reason: '', actions: [act({ type: 'delete' })] }] }, today));
    expect(r.rejected[0].reason).toBe('Unsupported action');
  });

  it('cleans and caps tags', () => {
    const r = ok(validateReply(org, { suggestions: [{ ideaId: 'i1', reason: 'r', actions: [act({ tags: ['#Lab Work', 'a', 'b', 'c', 'd', 'e', '!!'] })] }] }, today));
    expect(r.changes).toEqual([{ type: 'add_tags', ideaId: 'i1', tags: ['Lab-Work', 'a', 'b', 'c', 'd'], reason: 'r' }]);
  });

  it('turns each supported organize action into a change, with links only to sent items', () => {
    const r = ok(
      validateReply(
        org,
        {
          suggestions: [
            {
              ideaId: 'i1',
              reason: 'Science',
              actions: [act({ type: 'set_category', category: 'School' }), act({ type: 'set_project', projectId: 'p1' }), act({ type: 'link', targetKind: 'idea', targetId: 'i2' }), act({ type: 'link', targetKind: 'project', targetId: 'nope' }), act({ type: 'convert', to: 'task' })],
            },
          ],
        },
        today,
      ),
    );
    expect(r.changes).toEqual([
      { type: 'set_category', ideaId: 'i1', category: 'School', reason: 'Science' },
      { type: 'set_project', ideaId: 'i1', projectId: 'p1', reason: 'Science' },
      { type: 'link', ideaId: 'i1', target: { kind: 'idea', id: 'i2' }, reason: 'Science' },
      { type: 'convert', ideaId: 'i1', to: 'task', reason: 'Science' },
    ]);
    expect(r.rejected.map((x) => x.reason)).toEqual(['Unknown item id']);
  });

  it('rejects invalid and out-of-range dates', () => {
    const ctx: JobContext = { job: 'breakdown', projectId: 'p1', input: { today, project: { name: 'P', description: '', milestones: [{ id: 'm1', title: 'M', dueDate: null }] }, existingTasks: [] } };
    const t = (dueDate: string | null, milestoneId: string | null = null) => ({ title: 'T', description: '', priority: 'high', dueDate, milestoneId });
    const r = ok(validateReply(ctx, { tasks: [t('2026-02-30'), t('2040-01-01'), t(null), t('2026-11-01', 'm1'), t(null, 'm9')] }, today));
    expect(r.rejected.map((x) => x.reason)).toEqual(['Invalid date', 'Invalid date', 'Unknown item id']);
    expect(r.changes).toEqual([
      { type: 'create_task', title: 'T', description: '', priority: 'high', dueDate: null, projectId: 'p1', milestoneId: null, sourceNoteId: null },
      { type: 'create_task', title: 'T', description: '', priority: 'high', dueDate: '2026-11-01', projectId: 'p1', milestoneId: 'm1', sourceNoteId: null },
    ]);
  });

  it('plan keeps at most 12 sent task ids and returns the focus', () => {
    const tasks = Array.from({ length: 15 }, (_, i) => ({ id: `t${i}`, title: `T${i}`, priority: 'high', status: 'planned', dueDate: null, project: null }));
    const r = ok(validateReply({ job: 'plan', input: { today, tasks, events: [] } }, { focus: 'Essay first', tasks: tasks.map((t) => ({ taskId: t.id, reason: '' })) }, today));
    expect([r.changes.length, r.rejected.length, r.message]).toEqual([12, 3, 'Essay first']);
    expect(r.rejected[0].reason).toBe('Over the limit');
  });

  it('summarize builds a summary insert and linked action-item tasks', () => {
    const r = ok(validateReply({ job: 'summarize', noteId: 'n1', noteProjectId: 'p1', input: { note: { title: 'L', body: 'B' } } }, { summary: 'Short', keyPoints: ['One'], actionItems: [{ title: 'Read ch. 4', dueDate: null }] }, today));
    expect(r.changes).toEqual([
      { type: 'insert_summary', noteId: 'n1', text: '## Summary (Claude)\n\nShort\n\n- One' },
      { type: 'create_task', title: 'Read ch. 4', description: '', priority: 'medium', dueDate: null, projectId: 'p1', milestoneId: null, sourceNoteId: 'n1' },
    ]);
  });

  it('caps long text instead of passing it through', () => {
    const r = ok(validateReply({ job: 'summarize', noteId: 'n1', noteProjectId: null, input: { note: { title: 'L', body: 'B' } } }, { summary: 'x'.repeat(5000), keyPoints: [], actionItems: [] }, today));
    const insert = r.changes[0] as { text: string };
    expect(insert.text.length).toBeLessThanOrEqual('## Summary (Claude)\n\n'.length + 1200);
    expect(insert.text.endsWith('…')).toBe(true);
  });
});
