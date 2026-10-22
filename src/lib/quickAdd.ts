import type { DateKey, Priority } from '../data/types';
import { parseDateWord } from './dates';

export interface QuickTask {
  title: string;
  priority?: Priority;
  category?: string;
  tags: string[];
  dueDate?: DateKey;
}

const PRIORITY_WORDS: Record<string, Priority> = {
  '!low': 'low',
  '!l': 'low',
  '!4': 'low',
  '!med': 'medium',
  '!medium': 'medium',
  '!m': 'medium',
  '!3': 'medium',
  '!high': 'high',
  '!h': 'high',
  '!2': 'high',
  '!urgent': 'urgent',
  '!u': 'urgent',
  '!1': 'urgent',
  '!!': 'urgent',
};

/** Words that set a due date when they end the title, e.g. "Call mom tomorrow". */
const TRAILING_DATE_WORDS = new Set(['today', 'tonight', 'tomorrow']);

/**
 * Reads optional shortcuts out of a one-line task:
 * `!high` (or !low, !med, !urgent, !1-!4) sets priority, the first `#word`
 * sets the category and later ones become tags, `due:fri` / `due:2026-11-03`
 * sets the due date, and a trailing "today" / "tomorrow" does too.
 * Everything else is the title.
 */
export function parseQuickTask(input: string, today: DateKey): QuickTask {
  const out: QuickTask = { title: '', tags: [] };
  const kept: string[] = [];
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (PRIORITY_WORDS[lower]) {
      out.priority = PRIORITY_WORDS[lower];
      continue;
    }
    if (/^#[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(token)) {
      const word = token.slice(1);
      if (!out.category) out.category = word;
      else if (!out.tags.some((t) => t.toLowerCase() === word.toLowerCase())) out.tags.push(word);
      continue;
    }
    const due = /^(?:due:|\^)(.+)$/i.exec(token);
    if (due) {
      const d = parseDateWord(due[1], today);
      if (d) {
        out.dueDate = d;
        continue;
      }
    }
    kept.push(token);
  }
  if (!out.dueDate && kept.length > 1 && TRAILING_DATE_WORDS.has(kept[kept.length - 1].toLowerCase().replace(/[.!]$/, ''))) {
    out.dueDate = parseDateWord(kept.pop()!, today) ?? undefined;
  }
  out.title = kept.join(' ');
  return out;
}
