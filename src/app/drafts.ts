/**
 * Editors with pending, not-yet-committed edits register a flush function here,
 * so leaving the page or closing the tab commits them first.
 */
const flushers = new Set<() => void>();

export function registerDraft(flush: () => void): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

export function flushDrafts() {
  for (const f of [...flushers]) f();
}
