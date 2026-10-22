import { backupDue } from './safety';

const now = Date.parse('2026-10-22T12:00:00Z');
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
const base = { lastBackupAt: null, firstSeen: daysAgo(10), snoozedUntil: null, syncOn: false, records: 5 };

describe('backup reminder timing', () => {
  it('stays quiet with no data or during the first three days', () => {
    expect(backupDue(now, { ...base, records: 0 })).toBe(false);
    expect(backupDue(now, { ...base, firstSeen: daysAgo(1) })).toBe(false);
    expect(backupDue(now, base)).toBe(true);
  });

  it('asks again after a week, or a month when sync keeps another copy', () => {
    expect(backupDue(now, { ...base, lastBackupAt: daysAgo(6) })).toBe(false);
    expect(backupDue(now, { ...base, lastBackupAt: daysAgo(8) })).toBe(true);
    expect(backupDue(now, { ...base, lastBackupAt: daysAgo(8), syncOn: true })).toBe(false);
    expect(backupDue(now, { ...base, lastBackupAt: daysAgo(31), syncOn: true })).toBe(true);
  });

  it('respects "remind me later"', () => {
    expect(backupDue(now, { ...base, snoozedUntil: new Date(now + 3_600_000).toISOString() })).toBe(false);
    expect(backupDue(now, { ...base, snoozedUntil: daysAgo(1) })).toBe(true);
  });
});
