/**
 * Local, rule-based organization helpers. Everything here is deterministic
 * and runs in the browser: keyword lists, word overlap, and fixed templates.
 * No AI model is involved, and the UI labels these as local suggestions.
 */
import { escapeRe } from '../lib/search';

export interface TagRule {
  tag: string;
  category: string;
  words: string[];
}

export const TAG_RULES: TagRule[] = [
  { tag: 'school', category: 'School', words: ['homework', 'essay', 'exam', 'quiz', 'class', 'assignment', 'lecture', 'teacher', 'professor', 'chapter', 'syllabus', 'midterm', 'final exam', 'lab report', 'grade', 'course', 'semester', 'thesis', 'school', 'study guide', 'textbook'] },
  { tag: 'coding', category: 'Coding', words: ['bug', 'code', 'api', 'deploy', 'refactor', 'react', 'typescript', 'javascript', 'python', 'repo', 'github', 'commit', 'pull request', 'database', 'server', 'frontend', 'backend', 'css', 'component', 'unit test', 'build', 'npm', 'vite', 'claude code', 'endpoint', 'function'] },
  { tag: 'business', category: 'Business', words: ['business', 'startup', 'customer', 'client', 'revenue', 'marketing', 'sales', 'pricing', 'invoice', 'brand', 'pitch', 'investor', 'side hustle', 'market', 'profit'] },
  { tag: 'health', category: 'Personal', words: ['gym', 'workout', 'running', 'sleep', 'diet', 'doctor', 'dentist', 'meditate', 'exercise', 'health', 'stretch', 'protein'] },
  { tag: 'finance', category: 'Personal', words: ['budget', 'money', 'rent', 'bill', 'bank', 'savings', 'tax', 'taxes', 'subscription', 'expense', 'paycheck'] },
  { tag: 'errands', category: 'Personal', words: ['buy', 'grocery', 'groceries', 'pick up', 'store', 'laundry', 'return the', 'drop off', 'post office'] },
  { tag: 'meeting', category: 'Meeting', words: ['meeting', 'standup', '1:1', 'interview', 'agenda', 'minutes', 'sync with', 'call with'] },
  { tag: 'research', category: 'Research', words: ['research', 'article', 'paper', 'sources', 'compare', 'investigate', 'look into', 'benchmark'] },
  { tag: 'writing', category: 'Personal', words: ['write', 'draft', 'blog', 'post', 'outline', 'proofread', 'newsletter'] },
  { tag: 'travel', category: 'Personal', words: ['trip', 'flight', 'hotel', 'travel', 'packing', 'passport', 'vacation', 'airbnb'] },
];

function containsWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(word)}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

export interface TagSuggestion {
  tag: string;
  reason: string;
}

/**
 * Suggests tags from keyword rules, plus tags you already use elsewhere when
 * that word appears in the text. Tags already on the item are skipped.
 */
export function suggestTags(text: string, existing: string[] = [], knownTags: string[] = []): TagSuggestion[] {
  const have = new Set(existing.map((t) => t.toLowerCase()));
  const out: TagSuggestion[] = [];
  const add = (tag: string, reason: string) => {
    const k = tag.toLowerCase();
    if (have.has(k)) return;
    have.add(k);
    out.push({ tag, reason });
  };
  for (const rule of TAG_RULES) {
    const hit = rule.words.find((w) => containsWord(text, w));
    if (hit) add(rule.tag, `mentions “${hit}”`);
  }
  for (const tag of knownTags) {
    if (tag.length >= 3 && containsWord(text, tag)) add(tag, `matches your tag #${tag}`);
  }
  return out;
}

export interface CategorySuggestion {
  category: string;
  reason: string;
}

/** The category whose keywords appear most often, or null when nothing matches. */
export function suggestCategory(text: string): CategorySuggestion | null {
  const scores = new Map<string, { n: number; words: string[] }>();
  for (const rule of TAG_RULES) {
    const hits = rule.words.filter((w) => containsWord(text, w));
    if (!hits.length) continue;
    const cur = scores.get(rule.category) ?? { n: 0, words: [] };
    cur.n += hits.length;
    cur.words.push(...hits);
    scores.set(rule.category, cur);
  }
  let best: [string, { n: number; words: string[] }] | null = null;
  for (const entry of scores) if (!best || entry[1].n > best[1].n) best = entry;
  if (!best) return null;
  return { category: best[0], reason: `mentions ${best[1].words.slice(0, 3).map((w) => `“${w}”`).join(', ')}` };
}

const STOPWORDS = new Set(
  'the a an and or but if then of to in on at for from with by about into over after before is are was were be been being it its this that these those i me my we our you your he she they them their what which who how why when where not no yes do does did done can could should would will just also very really more most some any all each other than too so as up out get got have has had make made like need want maybe one two'.split(' '),
);

function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
    out.add(stem(raw));
  }
  return out;
}

/** Share of keywords two texts have in common (Jaccard index, 0 to 1). */
export function similarity(a: string, b: string): { score: number; shared: string[] } {
  const ka = keywords(a);
  const kb = keywords(b);
  if (!ka.size || !kb.size) return { score: 0, shared: [] };
  const shared = [...ka].filter((w) => kb.has(w));
  return { score: shared.length / (ka.size + kb.size - shared.length), shared };
}

export interface SimilarPair {
  a: string;
  b: string;
  score: number;
  shared: string[];
}

export function findSimilarPairs(items: { id: string; text: string }[], threshold = 0.3, minShared = 2): SimilarPair[] {
  const prepared = items.map((i) => ({ id: i.id, words: keywords(i.text) }));
  const out: SimilarPair[] = [];
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i];
      const b = prepared[j];
      if (!a.words.size || !b.words.size) continue;
      const shared = [...a.words].filter((w) => b.words.has(w));
      if (shared.length < minShared) continue;
      const score = shared.length / (a.words.size + b.words.size - shared.length);
      if (score >= threshold) out.push({ a: a.id, b: b.id, score, shared });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

const ACTION_VERBS = new Set(
  'buy call email text write finish submit send fix build read study schedule book pay review update clean learn practice plan research ask check make prepare start create order return cancel renew register sign apply contact organize install deploy ship test design draft publish record upload print pick find move file finalize email text reply message setup set'.split(' '),
);
const ACTION_PHRASES = ['need to', 'have to', 'must ', 'should ', 'todo', 'to do', 'remember to', "don't forget", 'dont forget', 'deadline', 'due ', 'by tomorrow', 'by monday', 'by friday'];

/** A short reason when text reads like something to do, otherwise null. */
export function actionableReason(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const first = t.split(/[^\p{L}']+/u).find(Boolean) ?? '';
  if (ACTION_VERBS.has(first)) return `starts with the action word “${first}”`;
  const phrase = ACTION_PHRASES.find((p) => t.includes(p));
  if (phrase) return `contains “${phrase.trim()}”`;
  return null;
}

export interface ChecklistResult {
  template: string;
  reason: string;
  steps: string[];
}

interface Template {
  name: string;
  words: string[];
  steps: string[];
}

export const CHECKLIST_TEMPLATES: Template[] = [
  { name: 'Essay or paper', words: ['essay', 'paper', 'report', 'thesis', 'article'], steps: ['Read the prompt and rubric', 'Collect sources', 'Write an outline', 'Write the first draft', 'Revise structure and argument', 'Check citations', 'Proofread', 'Submit'] },
  { name: 'Exam prep', words: ['exam', 'test', 'quiz', 'midterm', 'final'], steps: ['List the topics covered', 'Gather notes and past problems', 'Make a study schedule', 'Review each topic', 'Do practice problems', 'Go over mistakes', 'Pack what you need for exam day'] },
  { name: 'Bug fix', words: ['bug', 'fix', 'error', 'crash', 'broken', 'issue'], steps: ['Reproduce the bug', 'Write down exact steps and error output', 'Find the root cause', 'Write a failing test', 'Fix it', 'Run the full test suite', 'Verify in the app'] },
  { name: 'Presentation', words: ['presentation', 'slides', 'pitch', 'talk', 'speech'], steps: ['Define the audience and goal', 'Outline the key points', 'Build the slides', 'Add visuals and examples', 'Rehearse with a timer', 'Prepare for questions'] },
  { name: 'Application', words: ['application', 'apply', 'internship', 'scholarship', 'resume'], steps: ['Read the requirements', 'Update your resume', 'Draft the statement or cover letter', 'Gather documents and references', 'Review everything once', 'Submit before the deadline'] },
  { name: 'Release', words: ['launch', 'release', 'publish', 'ship'], steps: ['Freeze the scope', 'Run final tests', 'Write release notes', 'Prepare the announcement', 'Release', 'Watch for feedback and issues'] },
  { name: 'Feature build', words: ['feature', 'build', 'implement', 'app', 'website', 'prototype'], steps: ['Write down what done looks like', 'Sketch the data and screens', 'Build the smallest working version', 'Add tests', 'Try it end to end', 'Clean up and document'] },
  { name: 'Trip', words: ['trip', 'travel', 'vacation', 'flight'], steps: ['Pick dates and budget', 'Book transport', 'Book a place to stay', 'Plan the main activities', 'Check documents and tickets', 'Pack'] },
  { name: 'Event', words: ['party', 'birthday', 'event', 'wedding', 'dinner'], steps: ['Pick a date and place', 'Make the guest list', 'Send invitations', 'Plan food and supplies', 'Confirm details the day before'] },
  { name: 'Move', words: ['move', 'moving', 'apartment', 'dorm'], steps: ['Set a moving date', 'Sort and donate what you will not take', 'Get boxes and supplies', 'Pack room by room', 'Update your address', 'Unpack essentials first'] },
];

const BULLET_RE = /^\s*(?:[-*•]|\d+[.)]|\[[ x]\])\s+(.+)$/i;

/**
 * Builds a checklist from text, deterministically:
 * 1. bullet or numbered lines in the text become the steps;
 * 2. otherwise the first matching template is used (keywords shown as the reason);
 * 3. otherwise the text is split into clauses ("then", ";", new lines);
 * 4. otherwise a short generic plan.
 */
export function generateChecklist(text: string): ChecklistResult {
  const lines = text.split('\n');
  const bullets = lines.map((l) => BULLET_RE.exec(l)?.[1]?.trim()).filter((s): s is string => Boolean(s));
  if (bullets.length >= 2) return { template: 'From your list', reason: `${bullets.length} list lines found in the text`, steps: bullets };

  for (const t of CHECKLIST_TEMPLATES) {
    const hit = t.words.find((w) => containsWord(text, w));
    if (hit) return { template: t.name, reason: `mentions “${hit}”`, steps: [...t.steps] };
  }

  const clauses = text
    .split(/\n|;|\.\s+|\bthen\b|\band then\b/i)
    .map((s) => s.trim().replace(/^(and|then)\s+/i, '').replace(/[.]+$/, ''))
    .filter((s) => s.length > 2);
  if (clauses.length >= 2) return { template: 'Split from your text', reason: 'split on sentences and “then”', steps: clauses.map((c) => c[0].toUpperCase() + c.slice(1)) };

  return { template: 'Generic plan', reason: 'no template matched', steps: ['Write down what done looks like', 'Pick the first concrete step', 'Do the first step', 'Review what is left and finish'] };
}
