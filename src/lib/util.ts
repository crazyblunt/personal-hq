export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cn(...parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join(' ');
}

export const nowIso = () => new Date().toISOString();

/** Splits "a, b,  c" (or "#a #b") into unique, trimmed tags, keeping first-seen casing. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,\n]|\s+(?=#)/)) {
    const tag = raw.trim().replace(/^#/, '').trim();
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag.slice(0, 40));
    }
  }
  return out;
}

export function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((s) => {
    const k = s.toLowerCase();
    if (!s || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** `#hashtags` written inside free text. */
const TAG_RE = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,39}$/u;

/** Normalizes a tag the way `#hashtags` are written: no leading #, spaces become dashes. Null when it can't be a tag. */
export function cleanTag(raw: string): string | null {
  const t = raw.trim().replace(/^#+/, '').trim().replace(/\s+/g, '-');
  return TAG_RE.test(t) ? t : null;
}

export function extractHashtags(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]{0,39})/gu)) out.push(m[1]);
  return uniqueStrings(out);
}

export function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value.trim())) return false;
  try {
    const u = new URL(value.trim());
    return Boolean(u.hostname);
  } catch {
    return false;
  }
}

/** First http(s) URL found in a piece of text. */
export function findUrl(text: string): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text);
  return m && isHttpUrl(m[0]) ? m[0].replace(/[).,;]+$/, '') : null;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** First non-empty line, trimmed and shortened, for titles derived from free text. */
export function firstLine(text: string, max = 80): string {
  const line = text.split('\n').find((l) => l.trim())?.trim() ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
