import { AI_JOBS } from '../_shared/ai-jobs.ts';
import { handle, safeEqual, type CallClaude } from './handler.ts';

const env = { apiKey: 'k', accessCode: 'secret-code', model: 'claude-opus-5-5' };
const req = (body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
  new Request('https://x.supabase.co/functions/v1/phq-ai', {
    method,
    headers: { 'content-type': 'application/json', origin: 'https://crazyblunt.github.io', 'x-phq-access': 'secret-code', ...headers },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
const never: CallClaude = async () => {
  throw new Error('should not be called');
};

describe('phq-ai handler', () => {
  it('reports missing secrets without revealing values', async () => {
    const r = await handle(req({ job: 'ping' }), { model: 'm' }, never);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'not_configured', missing: ['PHQ_AI_ACCESS_CODE', 'ANTHROPIC_API_KEY'] });
  });

  it('rejects a wrong or missing access code, and foreign origins', async () => {
    expect((await handle(req({ job: 'ping' }, { 'x-phq-access': 'nope' }), env, never)).status).toBe(401);
    expect((await handle(req({ job: 'ping' }, { 'x-phq-access': '' }), env, never)).status).toBe(401);
    expect((await handle(req({ job: 'ping' }, { origin: 'https://evil.example' }), env, never)).status).toBe(403);
  });

  it('answers CORS preflight for the app and echoes only allowed origins', async () => {
    const pre = await handle(req(null, {}, 'OPTIONS'), env, never);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://crazyblunt.github.io');
    expect(pre.headers.get('access-control-allow-headers')).toContain('x-phq-access');
    expect((await handle(req(null, {}, 'GET'), env, never)).status).toBe(405);
  });

  it('ping never calls Claude', async () => {
    const r = await handle(req({ job: 'ping' }), env, never);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, apiKeySet: true, model: 'claude-opus-5-5' });
    expect(await (await handle(req({ job: 'ping' }), { ...env, apiKey: undefined }, never)).json()).toEqual({ ok: true, apiKeySet: false, model: 'claude-opus-5-5' });
  });

  it('rejects unknown jobs, bad input, and oversized bodies', async () => {
    expect((await handle(req({ job: 'run_shell' }), env, never)).status).toBe(400);
    expect((await handle(req({ job: 'plan', input: 'text' }), env, never)).status).toBe(400);
    expect((await handle(req('{not json'), env, never)).status).toBe(400);
    expect((await handle(req('x'.repeat(200_001)), env, never)).status).toBe(413);
  });

  it('needs the API key for real jobs', async () => {
    const r = await handle(req({ job: 'plan', input: {} }), { ...env, apiKey: undefined }, never);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'not_configured', missing: ['ANTHROPIC_API_KEY'] });
  });

  it('builds the request from the shared job definition and returns the result', async () => {
    const call = vi.fn<CallClaude>().mockResolvedValue({ result: { focus: 'f', tasks: [] }, model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 5 } });
    const input = { today: '2026-10-24', tasks: [], events: [] };
    const r = await handle(req({ job: 'plan', input }), env, call);
    expect(call.mock.calls[0][0]).toEqual({ model: 'claude-opus-5-5', system: AI_JOBS.plan.instructions, user: JSON.stringify(input), schema: AI_JOBS.plan.schema, maxTokens: AI_JOBS.plan.maxTokens });
    expect(r.headers.get('access-control-allow-origin')).toBe('https://crazyblunt.github.io');
    expect(await r.json()).toEqual({ result: { focus: 'f', tasks: [] }, model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 5 } });
  });

  it('maps refusals to 422 and API failures to 502 without echoing details', async () => {
    expect((await handle(req({ job: 'plan', input: {} }), env, async () => ({ refused: true }))).status).toBe(422);
    const failed = await handle(req({ job: 'plan', input: {} }), env, async () => {
      throw new Error('secret upstream detail');
    });
    expect(failed.status).toBe(502);
    expect(JSON.stringify(await failed.json())).not.toContain('secret upstream detail');
  });

  it('compares access codes in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });
});
