import { parseQuickTask } from './quickAdd';

const today = '2026-10-21';

describe('parseQuickTask', () => {
  it('keeps plain text as the title', () => {
    expect(parseQuickTask('Buy milk', today)).toEqual({ title: 'Buy milk', tags: [] });
  });

  it('reads priority, category, tags, and due date', () => {
    expect(parseQuickTask('Finish lab report !high #school #chem due:thu', today)).toEqual({
      title: 'Finish lab report',
      priority: 'high',
      category: 'school',
      tags: ['chem'],
      dueDate: '2026-10-22',
    });
  });

  it('understands a trailing today/tomorrow without a prefix', () => {
    expect(parseQuickTask('Call mom tomorrow', today)).toMatchObject({ title: 'Call mom', dueDate: '2026-10-22' });
    expect(parseQuickTask('tomorrow', today)).toMatchObject({ title: 'tomorrow' });
  });

  it('leaves unknown due words in the title', () => {
    expect(parseQuickTask('Plan party due:someday', today)).toEqual({ title: 'Plan party due:someday', tags: [] });
  });

  it('accepts numeric priorities and the caret date shortcut', () => {
    expect(parseQuickTask('Fix prod !1 ^+2', today)).toMatchObject({ title: 'Fix prod', priority: 'urgent', dueDate: '2026-10-23' });
  });
});
