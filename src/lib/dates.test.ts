import { addDays, addMonths, diffDays, formatDuration, isDateKey, monthGrid, msUntil, parseDateWord, relativeDay, startOfWeek, toDateKey, weekDays } from './dates';

describe('date keys', () => {
  it('formats local days and validates keys', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('nope')).toBe(false);
  });

  it('adds days and months across boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
    expect(diffDays('2026-10-21', '2026-10-25')).toBe(4);
  });

  it('builds weeks and month grids from the chosen first weekday', () => {
    expect(startOfWeek('2026-10-21', 1)).toBe('2026-10-19'); // Monday
    expect(startOfWeek('2026-10-21', 0)).toBe('2026-10-18'); // Sunday
    const grid = monthGrid('2026-10-21', 1);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-09-28');
    expect(grid).toContain('2026-10-31');
    expect(weekDays('2026-10-21', 1)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  });
});

describe('parseDateWord', () => {
  const today = '2026-10-21'; // a Wednesday
  it.each([
    ['today', '2026-10-21'],
    ['tomorrow', '2026-10-22'],
    ['tmr', '2026-10-22'],
    ['fri', '2026-10-23'],
    ['friday', '2026-10-23'],
    ['wed', '2026-10-21'],
    ['mon', '2026-10-26'],
    ['+3', '2026-10-24'],
    ['10d', '2026-10-31'],
    ['nextweek', '2026-10-28'],
    ['2026-12-01', '2026-12-01'],
    ['12/25', '2026-12-25'],
    ['1/5', '2027-01-05'],
  ])('%s → %s', (word, expected) => {
    expect(parseDateWord(word, today)).toBe(expected);
  });

  it('returns null for words it does not know', () => {
    expect(parseDateWord('someday', today)).toBeNull();
    expect(parseDateWord('13/45', today)).toBeNull();
    expect(parseDateWord('', today)).toBeNull();
  });
});

describe('relative labels', () => {
  it('describes days near today', () => {
    expect(relativeDay('2026-10-21', '2026-10-21')).toBe('Today');
    expect(relativeDay('2026-10-22', '2026-10-21')).toBe('Tomorrow');
    expect(relativeDay('2026-10-20', '2026-10-21')).toBe('Yesterday');
    expect(relativeDay('2026-10-18', '2026-10-21')).toBe('3d ago');
  });

  it('measures countdowns and formats durations', () => {
    const now = new Date(2026, 9, 21, 12, 0).getTime();
    expect(msUntil('2026-10-22', now)).toBe(12 * 3_600_000);
    expect(msUntil('2026-10-21T13:30', now)).toBe(90 * 60_000);
    expect(formatDuration(90 * 60_000)).toBe('1h 30m 00s');
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(2 * 86_400_000 + 3_600_000)).toBe('2d 01h 00m');
  });
});
