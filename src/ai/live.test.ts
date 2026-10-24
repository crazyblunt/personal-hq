import { SYNC_KEY, SYNC_URL } from '../sync/config';
import { generateAccessCode, liveAvailable, pingLive, readAccessCode, runLive, writeAccessCode } from './live';

afterEach(() => {
  vi.unstubAllGlobals();
  writeAccessCode('');
});

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('live Claude client', () => {
  it('is unavailable without an access code', () => {
    writeAccessCode('');
    expect(readAccessCode()).toBe('');
    expect(liveAvailable()).toBe(false);
    writeAccessCode('  ABC  ');
    expect(readAccessCode()).toBe('ABC');
    expect(liveAvailable()).toBe(true);
  });

  it('sends the job with the access code and maps errors', async () => {
    writeAccessCode('CODE123');
    const fetchMock = vi.fn().mockResolvedValue(reply(503, { error: 'not_configured', missing: ['ANTHROPIC_API_KEY'] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(runLive('plan', { today: '2026-10-24', tasks: [], events: [] })).rejects.toMatchObject({ code: 'not_configured', missing: ['ANTHROPIC_API_KEY'] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${SYNC_URL}/functions/v1/phq-ai`);
    expect(init.method).toBe('POST');
    expect(init.headers['x-phq-access']).toBe('CODE123');
    expect(init.headers.apikey).toBe(SYNC_KEY);
    expect(JSON.parse(init.body)).toEqual({ job: 'plan', input: { today: '2026-10-24', tasks: [], events: [] } });
  });

  it('maps each failure to a code', async () => {
    writeAccessCode('C');
    for (const [status, code] of [[401, 'unauthorized'], [413, 'too_large'], [422, 'refused'], [400, 'bad_request'], [502, 'upstream']] as const) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(status, { error: 'x' })));
      await expect(runLive('plan', {})).rejects.toMatchObject({ code });
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(runLive('plan', {})).rejects.toMatchObject({ code: 'network' });
  });

  it('returns the result, model, and usage', async () => {
    writeAccessCode('C');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { result: { focus: 'f', tasks: [] }, model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 5 } })));
    await expect(runLive('plan', {})).resolves.toEqual({ result: { focus: 'f', tasks: [] }, model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 5 } });
  });

  it('pings with a given code without saving it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { ok: true, apiKeySet: false, model: 'claude-opus-5-5' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(pingLive('TRY')).resolves.toEqual({ apiKeySet: false, model: 'claude-opus-5-5' });
    expect(fetchMock.mock.calls[0][1].headers['x-phq-access']).toBe('TRY');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ job: 'ping' });
    expect(readAccessCode()).toBe('');
  });

  it('generates strong codes', () => {
    const c = generateAccessCode();
    expect(c).toMatch(/^[A-HJKMNP-Z2-9]{32}$/);
    expect(generateAccessCode()).not.toBe(c);
  });
});
