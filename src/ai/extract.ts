/** Pulls the JSON object out of a pasted Claude reply, which may wrap it in prose or a code fence. */
export class ExtractError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const v: unknown = JSON.parse(text);
    return isObject(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** The balanced `{…}` starting at `start`, counting braces outside string literals. */
function balancedFrom(text: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return undefined;
}

/**
 * Tries, in order: the whole text; each fenced block; then the balanced
 * `{…}` starting at each `{`. The first one that parses as a JSON object
 * wins. Throws "Not valid JSON" when nothing does.
 */
export function extractJson(text: string): Record<string, unknown> {
  const whole = parseObject(text.trim());
  if (whole) return whole;
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const v = parseObject(m[1].trim());
    if (v) return v;
  }
  for (let i = text.indexOf('{'); i !== -1; i = text.indexOf('{', i + 1)) {
    const candidate = balancedFrom(text, i);
    const v = candidate && parseObject(candidate);
    if (v) return v;
  }
  throw new ExtractError('Not valid JSON');
}
