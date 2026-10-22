/** Lowercased words of a query. Empty queries match everything. */
export function queryTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

type Field = string | string[] | null | undefined;

function haystack(fields: Field[]): string {
  return fields
    .flat()
    .filter((f): f is string => typeof f === 'string')
    .join('\n')
    .toLowerCase();
}

/** True when every word of the query appears somewhere in the fields. */
export function matchesQuery(query: string, ...fields: Field[]): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const text = haystack(fields);
  return terms.every((t) => text.includes(t));
}

/**
 * Ranks a match: higher is better, 0 means no match. Title hits beat body
 * hits; a title that starts with the query beats one that only contains it.
 */
export function scoreMatch(query: string, title: string, ...rest: Field[]): number {
  const terms = queryTerms(query);
  if (terms.length === 0) return 1;
  const t = title.toLowerCase();
  const body = haystack(rest);
  let score = 0;
  for (const term of terms) {
    if (t.startsWith(term)) score += 6;
    else if (new RegExp(`\\b${escapeRe(term)}`).test(t)) score += 4;
    else if (t.includes(term)) score += 3;
    else if (body.includes(term)) score += 1;
    else return 0;
  }
  if (t === query.trim().toLowerCase()) score += 10;
  return score;
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
