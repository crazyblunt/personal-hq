/**
 * End-to-end encryption for sync. Everything is derived from the private
 * sync code, which never leaves your devices:
 *
 * - `space`: a SHA-256 fingerprint that names your data on the server
 * - an AES-GCM key that encrypts each record before upload
 * - an HMAC key that turns record ids into opaque row names
 *
 * The server stores only the space name, opaque row names, timestamps, and
 * ciphertext. Without the code it cannot read or link anything.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U
export const CODE_LENGTH = 26; // 130 bits

const enc = new TextEncoder();
const dec = new TextDecoder();

export function generateSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
}

/** Upper-cases, drops spaces and dashes, and fixes look-alike letters (O→0, I/L→1). */
export function normalizeSyncCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function isValidSyncCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c));
}

/** "ABCD-EFGH-…" groups of four for reading and typing. */
export function formatSyncCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface SyncKeys {
  space: string;
  encKey: CryptoKey;
  idKey: CryptoKey;
}

export async function deriveSyncKeys(code: string): Promise<SyncKeys> {
  const normalized = normalizeSyncCode(code);
  if (!isValidSyncCode(normalized)) throw new Error('That sync code is not valid. It has 26 letters and numbers.');
  const space = toHex(await crypto.subtle.digest('SHA-256', enc.encode(`phq-space-v1:${normalized}`)));
  const ikm = await crypto.subtle.importKey('raw', enc.encode(`phq-sync-v1:${normalized}`), 'HKDF', false, ['deriveKey']);
  const params = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('personal-hq-sync'), info: enc.encode(info) });
  const encKey = await crypto.subtle.deriveKey(params('encrypt'), ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const idKey = await crypto.subtle.deriveKey(params('row-id'), ikm, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
  return { space, encKey, idKey };
}

/** Opaque, stable row name for a record key like "tasks:<id>". */
export async function rowName(keys: SyncKeys, recordKey: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', keys.idKey, enc.encode(recordKey)));
  return toBase64(mac).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function encryptJson(keys: SyncKeys, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keys.encKey, enc.encode(JSON.stringify(value))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toBase64(out);
}

/** Throws if the data was encrypted with a different code or was altered. */
export async function decryptJson(keys: SyncKeys, payload: string): Promise<unknown> {
  const bytes = fromBase64(payload);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, keys.encKey, bytes.slice(12));
  return JSON.parse(dec.decode(plain));
}
