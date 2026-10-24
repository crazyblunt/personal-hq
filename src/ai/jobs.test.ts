import { AI_JOB_IDS, AI_JOBS, AI_LIMITS } from '../../supabase/functions/_shared/ai-jobs';

type Schema = { type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema };

/** Every object in the schema is closed and lists all its properties as required (what structured outputs needs). */
function closed(s: Schema): boolean {
  const types = Array.isArray(s.type) ? s.type : [s.type];
  if (types.includes('object')) {
    const props = s.properties ?? {};
    return s.additionalProperties === false && Object.keys(props).every((k) => s.required?.includes(k) && closed(props[k]));
  }
  if (types.includes('array')) return s.items ? closed(s.items) : false;
  return true;
}

describe('shared Claude job definitions', () => {
  it('defines four jobs with closed schemas and plain instructions', () => {
    expect(Object.keys(AI_JOBS)).toEqual([...AI_JOB_IDS]);
    for (const j of AI_JOB_IDS) {
      expect(closed(AI_JOBS[j].schema as Schema)).toBe(true);
      expect(AI_JOBS[j].instructions.length).toBeGreaterThan(80);
      expect(AI_JOBS[j].maxTokens).toBeGreaterThan(500);
    }
  });

  it('pins the limits from the spec', () => {
    expect(AI_LIMITS).toMatchObject({ maxRequestBytes: 200_000, organizeIdeas: 50, planTasks: 60, breakdownTasks: 20, planPicks: 12, summaryChars: 1200, keyPoints: 8, actionItems: 10 });
  });
});
