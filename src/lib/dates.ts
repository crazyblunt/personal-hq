import type { DateKey } from '../data/types';

/** Local calendar day as `YYYY-MM-DD`. */
export function toDateKey(d: Date): DateKey {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayKey(now = new Date()): DateKey {
  return toDateKey(now);
}

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(v: unknown): v is DateKey {
  if (typeof v !== 'string') return false;
  const m = DATE_KEY_RE.exec(v);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** Local midnight of a date key. */
export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function addMonths(key: DateKey, n: number): DateKey {
  const d = fromDateKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toDateKey(d);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((fromDateKey(b).getTime() - fromDateKey(a).getTime()) / 86_400_000);
}

export function startOfWeek(key: DateKey, weekStartsOn: 0 | 1): DateKey {
  const d = fromDateKey(key);
  const offset = (d.getDay() - weekStartsOn + 7) % 7;
  return addDays(key, -offset);
}

export function startOfMonth(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`;
}

/** 42 day keys (6 weeks) covering the month that contains `key`. */
export function monthGrid(key: DateKey, weekStartsOn: 0 | 1): DateKey[] {
  const first = startOfWeek(startOfMonth(key), weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function weekDays(key: DateKey, weekStartsOn: 0 | 1): DateKey[] {
  const first = startOfWeek(key, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

export function weekdayNames(weekStartsOn: 0 | 1, style: 'short' | 'narrow' = 'short'): string[] {
  const base = new Date(2024, 0, 7 + weekStartsOn); // 2024-01-07 is a Sunday
  return Array.from({ length: 7 }, (_, i) =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate() + i).toLocaleDateString('en-US', { weekday: style }),
  );
}

export function formatDate(key: DateKey, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }): string {
  return fromDateKey(key).toLocaleDateString('en-US', opts);
}

export function formatMonth(key: DateKey): string {
  return fromDateKey(key).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "Today", "Tomorrow", "Yesterday", "in 3d", "2d ago", or a short date once it is far away. */
export function relativeDay(key: DateKey, today: DateKey): string {
  const n = diffDays(today, key);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return formatDate(key, { weekday: 'short' });
  if (n < 0 && n > -7) return `${-n}d ago`;
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return formatDate(key, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(hhmm: string, clock24h: boolean): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (clock24h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

export function formatClock(d: Date, clock24h: boolean, seconds = false): string {
  return d.toLocaleTimeString(clock24h ? 'en-GB' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hour12: !clock24h,
  });
}

/** Short timestamp like "Oct 21, 14:03" for an ISO string. */
export function formatStamp(iso: string, clock24h = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })}, ${formatClock(d, clock24h)}`;
}

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

export function relativeTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.round((t - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(s) >= size) return RTF.format(Math.round(s / size), unit);
  }
  return 'just now';
}

export function isoWeekNumber(key: DateKey): number {
  const d = fromDateKey(key);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

export function dayOfYear(key: DateKey): number {
  return diffDays(`${key.slice(0, 4)}-01-01`, key) + 1;
}

/**
 * Turns a short date word into a date key: today, tomorrow, yesterday,
 * weekday names (the next one, today included), "next week", "+3" / "3d"
 * (days from today), `YYYY-MM-DD`, or `M/D` (this year, or next year once passed).
 * Returns null for anything else.
 */
export function parseDateWord(input: string, today: DateKey): DateKey | null {
  const w = input.trim().toLowerCase().replace(/[.,]$/, '');
  if (!w) return null;
  if (w === 'today' || w === 'tod' || w === 'tonight') return today;
  if (w === 'tomorrow' || w === 'tmr' || w === 'tom' || w === 'tmrw') return addDays(today, 1);
  if (w === 'yesterday') return addDays(today, -1);
  if (w === 'nextweek' || w === 'next-week' || w === 'next week') return addDays(today, 7);
  const rel = /^\+?(\d{1,3})d?$/.exec(w);
  if (rel && (w.startsWith('+') || w.endsWith('d'))) return addDays(today, Number(rel[1]));
  const wd = WEEKDAY_WORDS[w];
  if (wd !== undefined) {
    const cur = fromDateKey(today).getDay();
    return addDays(today, (wd - cur + 7) % 7);
  }
  if (isDateKey(w)) return w;
  const md = /^(\d{1,2})\/(\d{1,2})$/.exec(w);
  if (md) {
    const y = Number(today.slice(0, 4));
    const candidate = toDateKey(new Date(y, Number(md[1]) - 1, Number(md[2])));
    if (!isDateKey(candidate) || Number(candidate.slice(5, 7)) !== Number(md[1])) return null;
    return candidate < today ? toDateKey(new Date(y + 1, Number(md[1]) - 1, Number(md[2]))) : candidate;
  }
  return null;
}

const WEEKDAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/** Milliseconds until a countdown target (`YYYY-MM-DD` = local midnight, or `YYYY-MM-DDTHH:MM`). */
export function msUntil(target: string, now = Date.now()): number {
  const [date, time] = target.split('T');
  const d = fromDateKey(date);
  if (time) {
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d.getTime() - now;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
