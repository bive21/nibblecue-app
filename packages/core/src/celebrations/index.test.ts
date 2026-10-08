/**
 * The celebration calendar and its numbers. Every case in `docs/CELEBRATIONS.md` §8 that can be
 * decided without a database is here, and the two that matter most are the ones a careless edit
 * would break silently: the day-of-month clamp, and the divisor.
 */
import { describe, expect, it } from 'vitest';
import type { TodayActivity } from '../today/rows';
import { reportBannedHits } from '../reports/observations';
import {
  addDaysIso,
  addMonthsClamped,
  CELEBRATION_KINDS,
  celebrationBannedHits,
  celebrationFigures,
  celebrationMarks,
  celebrationPerDay,
  divisorNeedsSaying,
  MARK_MONTHS,
  markDue,
  markLabel,
  MONTH_DAY_LAST,
  monthDayOn,
  monthWindow,
  WEEKLY_DEFAULT,
  weeklyDue,
  weekWindow,
} from './index';

const TZ = 'America/New_York';
const at = (iso: string, h = 12): number =>
  Date.parse(`${iso}T${String(h).padStart(2, '0')}:00:00-04:00`);

const row = (
  over: Partial<TodayActivity> & Pick<TodayActivity, 'id' | 'type' | 'startMs'>,
): TodayActivity => ({
  childId: 'kid',
  endMs: null,
  isPrivate: false,
  createdBy: 'u1',
  ...over,
});

describe('the day-of-month clamp — the arithmetic that is easy to get wrong', () => {
  it('born on the 31st: one month later is the last day of a short month, never the 3rd', () => {
    // the headline case from §8: 31 Jan + 1 month is 28 Feb, not 3 Mar
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29'); // a leap year
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30');
    expect(addMonthsClamped('2026-01-31', 4)).toBe('2026-05-31'); // and back to the 31st
  });

  it('crosses a year without drifting, and leaves an ordinary date alone', () => {
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsClamped('2026-06-10', 12)).toBe('2027-06-10');
    expect(addMonthsClamped('2026-06-10', 36)).toBe('2029-06-10');
    expect(addMonthsClamped('2026-06-10', 0)).toBe('2026-06-10');
  });

  it('counts whole days without a zone anywhere near it', () => {
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('which marks a birth date produces', () => {
  it('is eleven monthly notes, a first birthday, and two and three years — and stops there', () => {
    const marks = celebrationMarks('2026-06-10');
    expect(marks.map(m => m.monthNumber)).toEqual([...MARK_MONTHS]);
    expect(marks.filter(m => m.kind === 'MONTH_MARK')).toHaveLength(11);
    expect(marks.filter(m => m.kind === 'FIRST_BIRTHDAY').map(m => m.monthNumber)).toEqual([12]);
    expect(marks.filter(m => m.kind === 'YEAR_MARK').map(m => m.monthNumber)).toEqual([24, 36]);
    // nothing past three years: the app is for the first two years and a bit
    expect(Math.max(...marks.map(m => m.monthNumber))).toBe(36);
    expect(CELEBRATION_KINDS).toContain('WEEKLY_SUMMARY');
  });

  it('reads each mark in words, singular where it should be', () => {
    const marks = celebrationMarks('2026-06-10');
    expect(markLabel(marks[0] as never)).toBe('1 month');
    expect(markLabel(marks[4] as never)).toBe('5 months');
    expect(markLabel(marks[11] as never)).toBe('1 year');
    expect(markLabel(marks[13] as never)).toBe('3 years');
  });
});

describe('the one mark a child is owed today', () => {
  const BIRTH = '2026-06-10';

  it('is the most recent one, never a backlog', () => {
    // a phone opened when the baby is eight months old owes ONE card, not eight
    expect(markDue(BIRTH, '2027-02-10', { since: BIRTH, graceDays: 7 })?.monthNumber).toBe(8);
  });

  it('is still collectable three days late, dated to the mark rather than to today', () => {
    const late = markDue(BIRTH, '2026-11-13', { since: BIRTH });
    expect(late?.monthNumber).toBe(5);
    expect(late?.onIso).toBe('2026-11-10');
  });

  it('goes quiet once the grace runs out, rather than arriving a fortnight stale', () => {
    expect(markDue(BIRTH, '2026-11-30', { since: BIRTH, graceDays: 7 })).toBeNull();
  });

  it('never celebrates a mark from before the household existed', () => {
    // the account was made on the 15th, five days AFTER the four-month mark went by
    expect(markDue(BIRTH, '2026-10-16', { since: '2026-10-15' })).toBeNull();
    // the next one, which the household was there for, still arrives
    expect(markDue(BIRTH, '2026-11-10', { since: '2026-10-15' })?.monthNumber).toBe(5);
  });

  it('has nothing on the day itself, or before the first mark', () => {
    expect(markDue(BIRTH, BIRTH, { since: BIRTH })).toBeNull();
    expect(markDue(BIRTH, '2026-06-30', { since: BIRTH })).toBeNull();
  });
});

/**
 * THE MONTH-DAYS: the days the top bar's avatar wears a party hat (the owner, 2026-09-26). Every
 * whole month through the first birthday and never after (*"until they turn 1 year"*), dated by
 * the calendar's own clamp — so the hat and the monthly note never disagree about which day it is.
 */
describe('the month-days', () => {
  const BIRTH = '2026-06-10';

  it('is every whole month from one to twelve, on its day and on no other', () => {
    for (let n = 1; n <= MONTH_DAY_LAST; n += 1) {
      const day = addMonthsClamped(BIRTH, n);
      expect(monthDayOn(BIRTH, day), day).toBe(n);
      // the day before and the day after are ordinary days
      expect(monthDayOn(BIRTH, addDaysIso(day, -1)), day).toBeNull();
      expect(monthDayOn(BIRTH, addDaysIso(day, 1)), day).toBeNull();
    }
    expect(MONTH_DAY_LAST).toBe(12);
  });

  it('ends on the first birthday: nothing in the second year, and no later mark either', () => {
    // the owner's own example: born on April 28, a hat on every 28th — the first birthday the last
    const birth = '2026-04-28';
    expect(monthDayOn(birth, '2026-05-28')).toBe(1);
    expect(monthDayOn(birth, '2027-03-28')).toBe(11);
    expect(monthDayOn(birth, '2027-04-28')).toBe(12);
    expect(monthDayOn(birth, '2027-05-28')).toBeNull();
    for (const n of [13, 18, 23, 24, 25, 30, 36, 48])
      expect(monthDayOn(BIRTH, addMonthsClamped(BIRTH, n)), String(n)).toBeNull();
    // the calendar still dates its year marks; they keep their notes and wear no hat
    for (const m of celebrationMarks(BIRTH))
      expect(monthDayOn(BIRTH, m.onIso)).toBe(m.monthNumber <= 12 ? m.monthNumber : null);
  });

  it('clamps exactly as the marks do: born on the 31st, the last day of a short month', () => {
    expect(monthDayOn('2026-01-31', '2026-02-28')).toBe(1);
    expect(monthDayOn('2026-01-31', '2026-03-01')).toBeNull();
    expect(monthDayOn('2026-01-31', '2026-03-31')).toBe(2);
    expect(monthDayOn('2026-01-31', '2026-04-30')).toBe(3);
    // a leap-day baby's first birthday is the 28th of February
    expect(monthDayOn('2024-02-29', '2025-02-28')).toBe(12);
    expect(monthDayOn('2024-02-29', '2025-03-01')).toBeNull();
    // born on the 31st: a hat in every month of the first year, on its last day when it is short
    // (the owner: "babies born on 31st, wont get much hats, and that's fine")
    const days = Array.from({ length: 12 }, (_, i) => addMonthsClamped('2026-01-31', i + 1));
    expect(days).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
    ]);
    days.forEach((d, i) => expect(monthDayOn('2026-01-31', d), d).toBe(i + 1));
  });

  it('is nothing on the day of birth, before it, or for a date that does not parse', () => {
    expect(monthDayOn(BIRTH, BIRTH)).toBeNull();
    expect(monthDayOn(BIRTH, '2026-05-10')).toBeNull();
    expect(monthDayOn('', '2026-07-10')).toBeNull();
    expect(monthDayOn('not a date', '2026-07-10')).toBeNull();
    expect(monthDayOn(BIRTH, 'today')).toBeNull();
  });
});

describe('when the weekly summary is due', () => {
  it('is nothing at 18:59 on the chosen day and exactly one date at 19:01', () => {
    // §8: Sunday 18:59 then 19:01 — 2026-06-14 is a Sunday
    expect(weeklyDue(TZ, at('2026-06-14', 18) + 59 * 60_000, WEEKLY_DEFAULT)).toBeNull();
    expect(weeklyDue(TZ, at('2026-06-14', 19) + 60_000, WEEKLY_DEFAULT)).toBe('2026-06-14');
  });

  it('is still collectable on the Monday, for a phone that was off', () => {
    expect(weeklyDue(TZ, at('2026-06-15', 9), WEEKLY_DEFAULT)).toBe('2026-06-14');
    // ...and gone once the grace runs out
    expect(weeklyDue(TZ, at('2026-06-19', 9), WEEKLY_DEFAULT, { graceDays: 3 })).toBeNull();
  });

  it('follows the household’s own weekday and hour, not a default anybody assumed', () => {
    // Wednesday, from 07:00 — 2026-06-17 is a Wednesday
    const pref = { dow: 3, hour: 7 };
    expect(weeklyDue(TZ, at('2026-06-17', 6), pref)).toBeNull();
    expect(weeklyDue(TZ, at('2026-06-17', 8), pref)).toBe('2026-06-17');
    expect(weeklyDue(TZ, at('2026-06-16', 23), pref)).toBeNull();
  });

  it('never reaches back before the household’s first day', () => {
    expect(weeklyDue(TZ, at('2026-06-15', 9), WEEKLY_DEFAULT, { since: '2026-06-15' })).toBeNull();
  });
});

describe('the windows the numbers are measured over', () => {
  it('a monthly note runs from the previous mark to the mark, never into the future', () => {
    const marks = celebrationMarks('2026-06-10');
    const fifth = marks[4] as never;
    // measured ON the mark day: a whole month
    const whole = monthWindow(fifth, '2026-06-10', TZ, at('2026-11-10', 20));
    expect(whole.days).toBe(31);
    // measured three days late: the window still ends at the mark, not at today
    const late = monthWindow(fifth, '2026-06-10', TZ, at('2026-11-13', 20));
    expect(late.toMs).toBe(whole.toMs);
  });

  it('month one starts at the birth date rather than at a mark that does not exist', () => {
    const first = celebrationMarks('2026-06-10')[0] as never;
    const w = monthWindow(first, '2026-06-10', TZ, at('2026-07-10', 20));
    expect(w.days).toBe(31);
  });

  it('a weekly summary is the seven days ending with the day it belongs to', () => {
    const w = weekWindow('2026-06-14', TZ);
    expect(w.days).toBe(7);
    expect(w.fromMs).toBe(Date.parse('2026-06-08T00:00:00-04:00'));
    expect(w.toMs).toBe(Date.parse('2026-06-15T00:00:00-04:00'));
  });
});

describe('the numbers, and the divisor that makes them true', () => {
  const window = weekWindow('2026-06-14', TZ);
  const day = (iso: string, h: number): number => at(iso, h);

  const rows: TodayActivity[] = [
    row({ id: 'b1', type: 'bottle', startMs: day('2026-06-09', 8), consumedMl: 120 }),
    row({ id: 'b2', type: 'bottle', startMs: day('2026-06-09', 14), consumedMl: 90 }),
    row({ id: 'b3', type: 'bottle', startMs: day('2026-06-12', 8), consumedMl: 150 }),
    row({ id: 'd1', type: 'diaper', startMs: day('2026-06-09', 9) }),
    row({ id: 'd2', type: 'diaper', startMs: day('2026-06-12', 9) }),
    row({
      id: 's1',
      type: 'sleep',
      startMs: day('2026-06-09', 20),
      endMs: day('2026-06-09', 20) + 150 * 60_000,
    }),
    row({
      id: 's2',
      type: 'sleep',
      startMs: day('2026-06-12', 13),
      endMs: day('2026-06-12', 13) + 45 * 60_000,
    }),
    row({ id: 'p1', type: 'pump', startMs: day('2026-06-12', 7), totalMl: 100 }),
  ];

  it('totals what is inside the window and nothing outside it', () => {
    const outside = row({
      id: 'x',
      type: 'bottle',
      startMs: day('2026-06-01', 8),
      consumedMl: 999,
    });
    const f = celebrationFigures([...rows, outside], window, TZ);
    expect(f.milkMl).toBe(360);
    expect(f.bottles).toBe(3);
    expect(f.diapers).toBe(2);
    expect(f.pumpedMl).toBe(100);
    expect(f.pumpSessions).toBe(1);
    expect(f.sleepMinutes).toBe(195);
    expect(f.longestSleepMinutes).toBe(150);
  });

  it('counts the bottles of milk: water is logged, and is neither milk nor a bottle feed (M7)', () => {
    const water = row({
      id: 'w',
      type: 'bottle',
      startMs: day('2026-06-12', 10),
      consumedMl: 60,
      bottleKind: 'WATER',
    });
    const f = celebrationFigures([...rows, water], window, TZ);
    expect(f.milkMl).toBe(360);
    expect(f.bottles).toBe(3);
  });

  /** §8: "Month mark with 12 of 31 days logged — per-day figures divide by 12, and it says so." */
  it('divides by the days with an entry, not by the calendar', () => {
    const f = celebrationFigures(rows, window, TZ);
    expect(f.calendarDays).toBe(7);
    expect(f.loggedDays).toBe(2);
    const per = celebrationPerDay(f);
    expect(per.milkMl).toBe(180); // 360 over TWO logged days, not seven calendar ones
    expect(per.diapers).toBe(1);
    expect(per.sleepMinutes).toBe(97.5);
    // and the card is told to say which divisor it used
    expect(divisorNeedsSaying(f)).toBe(true);
  });

  it('says nothing about the divisor when every day was logged', () => {
    const everyDay = Array.from({ length: 7 }, (_, i) =>
      row({ id: `e${i}`, type: 'diaper', startMs: day(addDaysIso('2026-06-08', i), 10) }),
    );
    const f = celebrationFigures(everyDay, window, TZ);
    expect(f.loggedDays).toBe(7);
    expect(divisorNeedsSaying(f)).toBe(false);
  });

  it('divides by nothing rather than crashing on an empty window', () => {
    const f = celebrationFigures([], window, TZ);
    expect(f.loggedDays).toBe(0);
    expect(celebrationPerDay(f)).toEqual({ milkMl: 0, sleepMinutes: 0, diapers: 0 });
    expect(divisorNeedsSaying(f)).toBe(false);
  });

  it('reports a weight change only with a measurement at each end', () => {
    const one = row({ id: 'g1', type: 'growth', startMs: day('2026-06-09', 10), weightG: 5000 });
    expect(celebrationFigures([one], window, TZ).weightChangeG).toBeNull();
    const two = row({ id: 'g2', type: 'growth', startMs: day('2026-06-13', 10), weightG: 5320 });
    expect(celebrationFigures([one, two], window, TZ).weightChangeG).toBe(320);
  });
});

describe('the words a celebration is allowed to use', () => {
  it('fires on the two report stems that never fired before', () => {
    // `\bdehydrat\b` cannot match "dehydration"; both were dead until they were made prefixes
    expect(reportBannedHits('signs of dehydration')).toContain('dehydrat');
    expect(reportBannedHits('a diagnosis of reflux')).toContain('diagnos');
    // and nothing widened: a whole-word entry still needs the whole word
    expect(reportBannedHits('lowering the bottle')).not.toContain('low');
    expect(reportBannedHits('goodbye')).not.toContain('good');
  });

  it('catches a verdict on a number, exactly as a report does', () => {
    expect(celebrationBannedHits('You should aim for more sleep')).toEqual(
      expect.arrayContaining(['should', 'aim for']),
    );
    expect(celebrationBannedHits('Emma is on track')).toContain('on track');
    expect(celebrationBannedHits('A good week')).toContain('good');
  });

  /**
   * AND PRAISE, which a report never had to. `reportBannedHits` lets "great job keeping up!"
   * straight through — `great` is not a clinical word — and §3 names that exact sentence as
   * forbidden. A household that logged eleven days of thirty-one has not failed at anything.
   */
  it('catches praise for a number, which a report’s own list lets through', () => {
    expect(reportBannedHits('Great job keeping up!')).toEqual([]);
    expect(celebrationBannedHits('Great job keeping up!')).toEqual(
      expect.arrayContaining(['great job', 'keeping']),
    );
    for (const praise of ['Well done!', 'A 12-day streak', 'Amazing week', 'A new record']) {
      expect(celebrationBannedHits(praise), praise).not.toEqual([]);
    }
  });

  it('passes every label this module produces', () => {
    for (const m of celebrationMarks('2026-01-31')) {
      expect(celebrationBannedHits(markLabel(m)), markLabel(m)).toEqual([]);
    }
  });
});

/**
 * THE APP'S OWN COUNTING RULES, as every other total keeps them (2026-09-28, with the year's
 * keepsake, which adds a year of these up): a DRY check is not a change, a breastfeed's minutes are
 * the ones it recorded, and a volume adds up as it reads in the household's unit.
 */
describe('the figures count the way the rest of the app counts', () => {
  const window = weekWindow('2026-06-14', TZ);

  it('never counts a DRY check as a diaper', () => {
    const rows = [
      row({ id: 'w', type: 'diaper', startMs: at('2026-06-09', 9), diaperKind: 'WET' }),
      row({ id: 'x', type: 'diaper', startMs: at('2026-06-09', 11), diaperKind: 'DRY' }),
      row({ id: 'b', type: 'diaper', startMs: at('2026-06-10', 9), diaperKind: 'BOTH' }),
    ];
    const f = celebrationFigures(rows, window, TZ);
    expect(f.diapers).toBe(2);
    // the check still says the day was logged: it is an entry, only not a change
    expect(f.loggedDays).toBe(2);
  });

  it('reads a breastfeed’s minutes from its recorded sides, not the clock a pause stretched', () => {
    const feed = row({
      id: 'f',
      type: 'breastfeed',
      startMs: at('2026-06-09', 9),
      endMs: at('2026-06-09', 9) + 40 * 60_000,
      leftSeconds: 9 * 60,
      rightSeconds: 9 * 60,
    });
    const bare = row({
      id: 'g',
      type: 'breastfeed',
      startMs: at('2026-06-10', 9),
      endMs: at('2026-06-10', 9) + 15 * 60_000,
    });
    expect(celebrationFigures([feed, bare], window, TZ).breastfeedMinutes).toBe(18 + 15);
  });

  it('counts the sleeps a total is made of, the sample size said beside it', () => {
    const naps = [9, 13, 16].map(h =>
      row({
        id: `s${h}`,
        type: 'sleep',
        startMs: at('2026-06-11', h),
        endMs: at('2026-06-11', h) + 30 * 60_000,
      }),
    );
    const f = celebrationFigures(naps, window, TZ);
    expect(f.sleeps).toBe(3);
    expect(f.sleepMinutes).toBe(90);
  });

  it('adds each volume up as it reads in the household’s unit, and as stored without one', () => {
    // 4 oz is kept as 118 ml; nine of them read 36 oz, and the stored sum is a quarter short
    const bottles = Array.from({ length: 9 }, (_, i) =>
      row({ id: `b${i}`, type: 'bottle', startMs: at('2026-06-09', 6 + i), consumedMl: 118 }),
    );
    expect(celebrationFigures(bottles, window, TZ).milkMl).toBe(9 * 118);
    const asRead = celebrationFigures(bottles, window, TZ, 'oz').milkMl;
    expect(asRead / 29.5735).toBeCloseTo(36, 3);
    expect(celebrationFigures(bottles, window, TZ, 'ml').milkMl).toBe(9 * 118);
  });
});
