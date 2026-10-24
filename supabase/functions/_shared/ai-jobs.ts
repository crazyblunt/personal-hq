/**
 * The four Claude jobs Personal HQ supports: instructions, the exact JSON
 * shape of a reply, and limits. Shared by the app (copy/paste prompts and
 * reply validation) and the `phq-ai` Supabase function (live requests), so
 * both always ask for the same thing.
 *
 * This file must stay dependency-free: it runs in the browser bundle and in
 * Deno.
 */

export const AI_JOB_IDS = ['organize', 'summarize', 'breakdown', 'plan'] as const;
export type AiJobId = (typeof AI_JOB_IDS)[number];

/* ---------- What each job sends (and nothing else) ---------- */

export interface OrganizeInput {
  ideas: { id: string; title: string; body: string; url: string; tags: string[]; category: string }[];
  /** Tag names already used in the workspace, so suggestions can reuse them. */
  tags: string[];
  projects: { id: string; name: string }[];
}

export interface SummarizeInput {
  note: { title: string; body: string };
}

export interface BreakdownInput {
  today: string;
  project: { name: string; description: string; milestones: { id: string; title: string; dueDate: string | null }[] };
  /** Titles of the project's tasks, so Claude doesn't propose duplicates. */
  existingTasks: string[];
}

export interface PlanInput {
  today: string;
  tasks: { id: string; title: string; priority: string; status: string; dueDate: string | null; project: string | null }[];
  events: { title: string; time: string | null }[];
}

export interface AiInputs {
  organize: OrganizeInput;
  summarize: SummarizeInput;
  breakdown: BreakdownInput;
  plan: PlanInput;
}

export interface AiJobDef {
  id: AiJobId;
  label: string;
  instructions: string;
  /** JSON Schema for the reply. Every object is closed and lists all properties as required. */
  schema: Record<string, unknown>;
  maxTokens: number;
}

export const AI_LIMITS = {
  maxRequestBytes: 200_000,
  organizeIdeas: 50,
  planTasks: 60,
  breakdownTasks: 20,
  planPicks: 12,
  summaryChars: 1200,
  keyPoints: 8,
  actionItems: 10,
} as const;

const str = { type: 'string' };
const strOrNull = { type: ['string', 'null'] };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const arr = (items: unknown) => ({ type: 'array', items });

const COMMON = 'Use only ids that appear in the input. Write dates as YYYY-MM-DD. Do not invent facts, times, people, or items that are not in the input. Keep suggestions short and concrete. Reply with JSON only.';

export const AI_JOBS: Record<AiJobId, AiJobDef> = {
  organize: {
    id: 'organize',
    label: 'Organize ideas',
    instructions: `You help organize a person's captured ideas. For each idea that would benefit, suggest a few actions: add_tags (at most 5 short tags, reusing names from "tags" when they fit), set_category (one short word or two), set_project (only a project id from "projects"), link (to another idea in the input with targetKind "idea", or a project with targetKind "project"), or convert (to "task" when it is clearly a to-do, "note" for reference material, "project" for something with several steps). Fill fields that don't apply to an action with null (or [] for tags). Give a one-sentence reason per idea. Skip ideas that are already well organized. ${COMMON}`,
    schema: obj({
      suggestions: arr(
        obj({
          ideaId: str,
          reason: str,
          actions: arr(
            obj({
              type: { type: 'string', enum: ['add_tags', 'set_category', 'set_project', 'link', 'convert'] },
              tags: arr(str),
              category: strOrNull,
              projectId: strOrNull,
              targetKind: { type: ['string', 'null'], enum: ['idea', 'project', null] },
              targetId: strOrNull,
              to: { type: ['string', 'null'], enum: ['task', 'note', 'project', null] },
            }),
          ),
        }),
      ),
    }),
    maxTokens: 16000,
  },
  summarize: {
    id: 'summarize',
    label: 'Summarize a note',
    instructions: `Summarize the note in a few plain sentences (under ${AI_LIMITS.summaryChars} characters), list up to ${AI_LIMITS.keyPoints} key points, and list up to ${AI_LIMITS.actionItems} concrete action items that the note itself asks for (with a due date only when the note states one). Use the note's own words where possible. ${COMMON}`,
    schema: obj({ summary: str, keyPoints: arr(str), actionItems: arr(obj({ title: str, dueDate: strOrNull })) }),
    maxTokens: 16000,
  },
  breakdown: {
    id: 'breakdown',
    label: 'Break a project into tasks',
    instructions: `Break the project into up to ${AI_LIMITS.breakdownTasks} next tasks, each small enough to finish in one sitting. Do not repeat anything in "existingTasks". Give each task a short title, an optional one-line description, a priority (low, medium, high, or urgent), a due date only when it follows from the project's milestones or dates (otherwise null), and a milestoneId from the input when the task belongs to that milestone (otherwise null). "today" is the current date. ${COMMON}`,
    schema: obj({
      tasks: arr(obj({ title: str, description: str, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }, dueDate: strOrNull, milestoneId: strOrNull })),
    }),
    maxTokens: 16000,
  },
  plan: {
    id: 'plan',
    label: 'Plan my day',
    instructions: `Help plan today ("today" is the date). From the open tasks, pick at most ${AI_LIMITS.planPicks} that make sense to do today, most important first, considering due dates, priority, status, and today's events. Give a one-line reason for each. Write a short "focus" note (one or two sentences) about what matters most today. Never schedule times or add tasks that are not in the input. ${COMMON}`,
    schema: obj({ focus: str, tasks: arr(obj({ taskId: str, reason: str })) }),
    maxTokens: 16000,
  },
};
