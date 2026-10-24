/**
 * The optional live path: requests go to the `phq-ai` function on the same
 * Supabase project as sync, which holds the Claude API key. The browser
 * only ever has the access code that function checks, stored on this
 * device (never synced or backed up).
 */
import type { AiJobId } from '../../supabase/functions/_shared/ai-jobs';
import { readDevice, writeDevice } from '../app/deviceStorage';
import { insideArtifactHost } from '../app/fileSave';
import { SYNC_KEY, SYNC_URL } from '../sync/config';

export const AI_FUNCTION_PATH = '/functions/v1/phq-ai';
export const aiFunctionUrl = () => `${SYNC_URL}${AI_FUNCTION_PATH}`;

const CODE_KEY = 'ai-code';
const TIMEOUT_MS = 120_000;

export function readAccessCode(): string {
  return readDevice<string>(CODE_KEY, '').trim();
}

export function writeAccessCode(code: string): void {
  writeDevice(CODE_KEY, code.trim());
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A random 32-character code (about 158 bits) for PHQ_AI_ACCESS_CODE, without look-alike characters. */
export function generateAccessCode(): string {
  let out = '';
  while (out.length < 32) {
    for (const b of crypto.getRandomValues(new Uint8Array(48))) {
      // Rejection sampling keeps every character equally likely.
      if (b < ALPHABET.length * 8 && out.length < 32) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

/** Live mode needs an access code on this device, and doesn't work inside the Claude artifact (it can't reach other servers). */
export function liveAvailable(): boolean {
  return !insideArtifactHost() && readAccessCode() !== '';
}

export type LiveErrorCode = 'not_configured' | 'unauthorized' | 'refused' | 'too_large' | 'bad_request' | 'upstream' | 'network';

export class LiveError extends Error {
  constructor(
    readonly code: LiveErrorCode,
    message: string,
    readonly missing?: string[],
  ) {
    super(message);
  }
}

const STATUS_CODE: Record<number, LiveErrorCode> = { 503: 'not_configured', 401: 'unauthorized', 413: 'too_large', 422: 'refused', 400: 'bad_request' };

async function post(body: unknown, code: string): Promise<unknown> {
  const headers: Record<string, string> = { 'content-type': 'application/json', apikey: SYNC_KEY, 'x-phq-access': code };
  if (!SYNC_KEY.startsWith('sb_')) headers.authorization = `Bearer ${SYNC_KEY}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(aiFunctionUrl(), { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    throw new LiveError('network', e instanceof Error && e.name === 'AbortError' ? 'The request took too long.' : 'Couldn’t reach the function.');
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => null)) as { error?: string; missing?: unknown; message?: string } | null;
  if (!res.ok) {
    const code = STATUS_CODE[res.status] ?? 'upstream';
    const missing = Array.isArray(data?.missing) ? data.missing.filter((m): m is string => typeof m === 'string') : undefined;
    throw new LiveError(code, data?.message ?? data?.error ?? `HTTP ${res.status}`, missing);
  }
  return data;
}

/** Checks the function and the access code without calling Claude (free). */
export async function pingLive(code = readAccessCode()): Promise<{ apiKeySet: boolean; model: string }> {
  const data = (await post({ job: 'ping' }, code)) as { apiKeySet?: unknown; model?: unknown } | null;
  return { apiKeySet: data?.apiKeySet === true, model: typeof data?.model === 'string' ? data.model : '' };
}

export interface LiveResult {
  result: unknown;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function runLive(job: AiJobId, input: unknown): Promise<LiveResult> {
  const data = (await post({ job, input }, readAccessCode())) as Partial<LiveResult> | null;
  const usage = data?.usage;
  return {
    result: data?.result,
    model: typeof data?.model === 'string' ? data.model : '',
    usage: { input_tokens: Number(usage?.input_tokens) || 0, output_tokens: Number(usage?.output_tokens) || 0 },
  };
}
