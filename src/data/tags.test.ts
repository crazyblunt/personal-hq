import { cleanTag } from '../lib/util';
import { createMemoryAdapter } from './adapters/memory';
import { createIdea, createNote, createProject, createTask, initStore, useHQ } from './store';
import { removeTag, renameTag, tagIndex } from './tags';

beforeEach(async () => {
  await initStore(createMemoryAdapter());
});

describe('tags across items', () => {
  it('counts tags across all four types, ignoring case', () => {
    createTask({ title: 'T', tags: ['School'] });
    createNote({ title: 'N', tags: ['school'] });
    createProject({ name: 'P', tags: ['school'] });
    expect(tagIndex(useHQ.getState())).toEqual([{ tag: 'School', total: 3, byKind: { task: 1, note: 1, idea: 0, project: 1 } }]);
  });

  it('renames into an existing tag as a merge, with no duplicates', () => {
    createTask({ title: 'T', tags: ['hw', 'school'] });
    expect(renameTag('hw', 'school')).toBe(1);
    expect(useHQ.getState().tasks[0].tags).toEqual(['school']);
  });

  it('a case-only rename changes casing everywhere', () => {
    createTask({ title: 'T', tags: ['School'] });
    createIdea({ body: 'x', tags: ['SCHOOL'] });
    expect(renameTag('school', 'school')).toBe(2);
    expect([useHQ.getState().tasks[0].tags, useHQ.getState().ideas[0].tags]).toEqual([['school'], ['school']]);
  });

  it('removes a tag everywhere and logs one activity entry', () => {
    createTask({ title: 'T', tags: ['old'] });
    createNote({ title: 'N', tags: ['old', 'keep'] });
    const before = useHQ.getState().activity.length;
    expect(removeTag('OLD')).toBe(2);
    expect(useHQ.getState().notes[0].tags).toEqual(['keep']);
    expect(useHQ.getState().activity.length).toBe(before + 1);
  });

  it('rejects invalid tag names', () => {
    createTask({ title: 'T', tags: ['a'] });
    expect(renameTag('a', '   ')).toBe(0);
    expect(useHQ.getState().tasks[0].tags).toEqual(['a']);
    expect(cleanTag('#Lab Work')).toBe('Lab-Work');
    expect(cleanTag('!!')).toBeNull();
  });
});
