import { describe, expect, it } from 'vitest';
import { BIRTH_SHEET, dueChip, dueLine, EXPECTING, monthDay, onTheWayTitle } from './copy';

describe('the words for a baby on the way', () => {
  it('names the due date the way the phone writes a date', () => {
    expect(monthDay('2026-11-05', 'en-US')).toBe('Nov 5');
    expect(dueChip('2026-11-05', 'en-US')).toBe('Due Nov 5');
    // never a date a time zone can move: the string is read as a local calendar day
    expect(monthDay('2026-01-01', 'en-US')).toBe('Jan 1');
  });

  it('counts the days to the due date, and after it simply says when it was', () => {
    expect(dueLine('2026-11-05', '2026-10-01', 'en-US')).toBe('Due Nov 5, in 35 days');
    expect(dueLine('2026-11-05', '2026-11-04', 'en-US')).toBe('Due tomorrow');
    expect(dueLine('2026-11-05', '2026-11-05', 'en-US')).toBe('Due today');
    expect(dueLine('2026-11-05', '2026-11-09', 'en-US')).toBe('Due date was Nov 5');
  });

  it('uses the name when there is one, and "your baby" when there is not', () => {
    expect(onTheWayTitle(['Ada'])).toBe('Ada is on the way');
    expect(onTheWayTitle(['Baby'])).toBe('Your baby is on the way');
    expect(onTheWayTitle(['Ada', 'Ben'])).toBe('Ada and Ben are on the way');
    expect(onTheWayTitle(['Ada', 'Baby'])).toBe('Your babies are on the way');
    expect(BIRTH_SHEET.welcome(['Ada'], true)).toBe(
      'Welcome, Ada! Your 14 days of Plus start today.',
    );
    expect(BIRTH_SHEET.welcome(['Baby'], false)).toBe('Welcome, little one!');
    expect(BIRTH_SHEET.welcome(['Ada', 'Ben'], false)).toBe('Welcome, Ada and Ben!');
  });

  /**
   * Every sentence here is read by a parent before the birth: plain, no dashes (the owner,
   * 2026-09-27), and nothing about how a pregnancy is going or how far along it is (CLAUDE.md §2
   * rules 1 and 3). A due date is a date.
   */
  it('says nothing about the pregnancy and uses no dashes', () => {
    const lines = [
      EXPECTING.learn,
      EXPECTING.plus(1),
      EXPECTING.plus(2),
      EXPECTING.here(1),
      EXPECTING.here(2),
      EXPECTING.askParent,
      EXPECTING.track,
      EXPECTING.planWaits,
      ...(Object.values(BIRTH_SHEET) as unknown[]).filter(
        (v): v is string => typeof v === 'string',
      ),
      BIRTH_SHEET.title(1),
      BIRTH_SHEET.title(2),
      dueLine('2026-11-05', '2026-10-01', 'en-US'),
      dueLine('2026-11-05', '2026-11-09', 'en-US'),
    ];
    for (const line of lines) {
      expect(line, line).not.toMatch(/[—–]| - /);
      expect(line, line).not.toMatch(
        /\b(weeks? pregnant|trimester|overdue|late|early|healthy|normal|risk|should|must)\b/i,
      );
    }
  });
});
