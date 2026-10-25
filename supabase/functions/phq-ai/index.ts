/**
 * Supabase Edge Function `phq-ai`: the optional live path for Personal HQ's
 * Ask Claude. Deploy with JWT verification off (the access code is the
 * gate):
 *
 *   supabase functions deploy phq-ai --no-verify-jwt
 *
 * Secrets (Supabase › Edge Functions › Secrets):
 *   ANTHROPIC_API_KEY    Claude Console API key (billed per token)
 *   PHQ_AI_ACCESS_CODE   long random code; the same value goes into Settings › Claude on each device
 *   PHQ_AI_MODEL         optional; defaults to claude-opus-5-5 (claude-haiku-5-5 costs far less)
 *
 * Request logic lives in handler.ts so it can be tested without Deno.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import { handle, type CallClaude } from './handler.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

const DEFAULT_MODEL = 'claude-opus-5-5';
/** Models that accept server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'];

const callClaude =
  (apiKey: string): CallClaude =>
  async ({ model, system, user, schema, maxTokens }) => {
    const client = new Anthropic({ apiKey });
    const params: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      ...(FALLBACK_MODELS.includes(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    };
    const msg = await client.beta.messages.create(params as never);
    if (msg.stop_reason === 'refusal') return { refused: true };
    const text = msg.content.find((b: { type: string }) => b.type === 'text') as { text: string } | undefined;
    if (!text) throw new Error('No text in the reply');
    return { result: JSON.parse(text.text), model: msg.model, usage: { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens } };
  };

Deno.serve((req) => {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || undefined;
  return handle(
    req,
    { apiKey, accessCode: Deno.env.get('PHQ_AI_ACCESS_CODE') || undefined, model: Deno.env.get('PHQ_AI_MODEL') || DEFAULT_MODEL },
    callClaude(apiKey ?? ''),
  );
});
