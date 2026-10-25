/**
 * Request handling for the `phq-ai` function, kept free of Deno globals and
 * npm imports so Vitest can test it. `index.ts` wires it to Deno.serve, the
 * function's secrets, and the Claude API.
 *
 * Gate: the `x-phq-access` header must match the PHQ_AI_ACCESS_CODE secret.
 * Only four fixed jobs (plus a free `ping`) are accepted, and the
 * instructions always come from the shared job definitions, so a leaked
 * access code can't be used to run arbitrary prompts. Request bodies are
 * never logged.
 */
import { AI_JOB_IDS, AI_JOBS, AI_LIMITS, type AiJobId } from '../_shared/ai-jobs.ts';

export const ALLOWED_ORIGINS = ['https://crazyblunt.github.io', 'http://localhost:5173', 'http://localhost:4173'];

export interface HandlerEnv {
  apiKey?: string;
  accessCode?: string;
  model: string;
}

export interface ClaudeRequest {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}

export type CallClaude = (req: ClaudeRequest) => Promise<{ result: unknown; model: string; usage: { input_tokens: number; output_tokens: number } } | { refused: true }>;

/** Constant-time comparison over the longer length. Empty strings never match. */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const isJob = (j: unknown): j is AiJobId => typeof j === 'string' && (AI_JOB_IDS as readonly string[]).includes(j);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function handle(req: Request, env: HandlerEnv, callClaude: CallClaude): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors: Record<string, string> =
    origin && ALLOWED_ORIGINS.includes(origin)
      ? {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info, x-phq-access',
          'access-control-max-age': '86400',
          vary: 'Origin',
        }
      : {};
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

  // Browsers always send Origin; a request without one (curl) is allowed, one from another site isn't.
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json(403, { error: 'forbidden_origin' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  if (!env.accessCode) return json(503, { error: 'not_configured', missing: ['PHQ_AI_ACCESS_CODE', ...(env.apiKey ? [] : ['ANTHROPIC_API_KEY'])] });
  if (!safeEqual(req.headers.get('x-phq-access') ?? '', env.accessCode)) return json(401, { error: 'unauthorized' });

  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > AI_LIMITS.maxRequestBytes) return json(413, { error: 'too_large' });
  const text = await req.text();
  if (new TextEncoder().encode(text).length > AI_LIMITS.maxRequestBytes) return json(413, { error: 'too_large' });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: 'bad_request', message: 'The body must be JSON.' });
  }
  if (!isObj(body)) return json(400, { error: 'bad_request', message: 'The body must be a JSON object.' });
  if (body.job === 'ping') return json(200, { ok: true, apiKeySet: Boolean(env.apiKey), model: env.model });
  if (!isJob(body.job)) return json(400, { error: 'bad_request', message: 'Unknown job.' });
  if (!isObj(body.input)) return json(400, { error: 'bad_request', message: 'The input must be a JSON object.' });
  if (!env.apiKey) return json(503, { error: 'not_configured', missing: ['ANTHROPIC_API_KEY'] });

  const def = AI_JOBS[body.job];
  try {
    const out = await callClaude({ model: env.model, system: def.instructions, user: JSON.stringify(body.input), schema: def.schema, maxTokens: def.maxTokens });
    if ('refused' in out) return json(422, { error: 'refused' });
    return json(200, out);
  } catch (e) {
    // Log only the error type and status, never the request content.
    const status = isObj(e) && typeof e.status === 'number' ? e.status : undefined;
    console.error('phq-ai: Claude API call failed', e instanceof Error ? e.name : typeof e, status ?? '');
    return json(502, { error: 'upstream', message: status ? `The Claude API returned ${status}.` : 'The Claude API call failed.' });
  }
}
