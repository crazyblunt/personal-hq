import { AI_JOBS, type AiJobId } from '../../supabase/functions/_shared/ai-jobs';

/** The full prompt for copy/paste mode: the job's instructions, the reply schema, and exactly the data being shared. */
export function bridgePrompt(job: AiJobId, input: unknown): string {
  const def = AI_JOBS[job];
  return [
    `This is a request from Personal HQ, a personal tasks-and-notes app. Job: ${def.label}.`,
    def.instructions,
    'Reply with only a JSON object matching this schema:',
    JSON.stringify(def.schema, null, 2),
    'Input:',
    JSON.stringify(input, null, 2),
  ].join('\n\n');
}
