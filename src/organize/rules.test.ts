import { buildReview } from './review';
import { actionableReason, findSimilarPairs, generateChecklist, similarity, suggestCategory, suggestTags } from './rules';
import type { Idea } from '../data/types';

describe('local organization rules', () => {
  it('suggests tags from keywords and from tags you already use, with reasons', () => {
    const tags = suggestTags('Finish the chemistry lab report for class', [], ['chemistry']);
    expect(tags.map((t) => t.tag)).toEqual(['school', 'chemistry']);
    expect(tags[0].reason).toBe('mentions “class”');
    expect(suggestTags('Fix the login bug', ['coding'])).toEqual([]);
  });

  it('picks the category with the most keyword hits, or none', () => {
    expect(suggestCategory('deploy the api server and refactor the frontend')?.category).toBe('Coding');
    expect(suggestCategory('a pleasant afternoon')).toBeNull();
  });

  it('flags text that reads like a to-do', () => {
    expect(actionableReason('Buy a new charger')).toMatch(/buy/);
    expect(actionableReason('I need to call the bank')).toMatch(/need to/);
    expect(actionableReason('A world where cats run banks')).toBeNull();
  });

  it('measures word overlap and finds similar pairs', () => {
    expect(similarity('React dashboard for habits', 'habits dashboard in React').score).toBeGreaterThan(0.5);
    expect(similarity('hello', '').score).toBe(0);
    const pairs = findSimilarPairs([
      { id: 'a', text: 'Budget tracker app with charts' },
      { id: 'b', text: 'App to track budget with charts' },
      { id: 'c', text: 'Birthday party for Sam' },
    ]);
    expect(pairs.map((p) => [p.a, p.b])).toEqual([['a', 'b']]);
  });

  it('builds checklists deterministically from lists, templates, or clauses', () => {
    expect(generateChecklist('Trip prep\n- passport\n- charger').steps).toEqual(['passport', 'charger']);
    const essay = generateChecklist('History essay on the 1980s');
    expect(essay.template).toBe('Essay or paper');
    expect(generateChecklist('History essay on the 1980s')).toEqual(essay);
    expect(generateChecklist('Clean the garage then donate old stuff').steps).toEqual(['Clean the garage', 'Donate old stuff']);
    expect(generateChecklist('Reorganize').template).toBe('Generic plan');
  });
});

describe('buildReview', () => {
  const idea = (id: string, body: string, extra: Partial<Idea> = {}): Idea => ({
    id,
    body,
    title: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    kind: 'idea',
    url: '',
    tags: [],
    category: '',
    favorite: false,
    inbox: true,
    archived: false,
    projectId: null,
    relatedIds: [],
    converted: [],
    remindOn: null,
    itemLinks: [],
    ...extra,
  });

  it('proposes changes without applying any of them', () => {
    const ideas = [idea('a', 'Buy textbook for chemistry class'), idea('b', 'Budget tracker app with charts'), idea('c', 'Budget tracking app with charts and export', { tags: ['x'], category: 'Coding' })];
    const before = JSON.stringify(ideas);
    const review = buildReview({ ideas, notes: [], today: '2026-10-21' });
    expect(JSON.stringify(ideas)).toBe(before);
    const types = review.map((s) => s.type);
    expect(types).toContain('to-task');
    expect(types).toContain('tags');
    expect(types).toContain('file-stale');
    expect(review.find((s) => s.type === 'link-ideas')).toMatchObject({ a: 'b', b: 'c' });
  });
});
