import { describe, expect, it } from 'vitest';
import {
  agoLabel,
  clockLabel,
  durationLabel,
  hoursMinutes,
  sideMinutes,
  firstUpper,
  JUST_NOW,
  NOT_LOGGED,
  RUNNING,
  sinceLabel,
  sinceSpan,
} from './since';

const MIN = 60_000;
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

describe('sinceLabel', () => {
  const cases: Array<[string, number, string]> = [
    ['nothing logged', NaN, NOT_LOGGED],
    ['5 seconds', 5_000, JUST_NOW],
    ['59 seconds', 59_000, JUST_NOW],
    ['exactly a minute', MIN, '1m'],
    ['14 minutes', 14 * MIN, '14m'],
    ['59 minutes', 59 * MIN, '59m'],
    ['exactly an hour', HOUR, '1h'],
    ['2h 42m', 2 * HOUR + 42 * MIN, '2h 42m'],
    ['a whole number of hours drops the minutes', 3 * HOUR, '3h'],
    ['23h 59m', 23 * HOUR + 59 * MIN, '23h 59m'],
    ['past a day, minutes are dropped', 25 * HOUR + 30 * MIN, '25h'],
    ['past two days, it reads in days', 50 * HOUR, '2d'],
    ['a week', 7 * 24 * HOUR, '7d'],
  ];

  for (const [name, ago, expected] of cases) {
    it(name, () => {
      const from = Number.isNaN(ago) ? null : NOW - ago;
      expect(sinceLabel(from, NOW)).toBe(expected);
    });
  }

  it('treats undefined like null', () => {
    expect(sinceLabel(undefined, NOW)).toBe(NOT_LOGGED);
  });

  it('never returns a negative interval', () => {
    // a clock that moved backwards, or an entry backdated one second into the future
    expect(sinceLabel(NOW + 30_000, NOW)).toBe(JUST_NOW);
    expect(JUST_NOW).toBe('Now');
  });
});

describe('sinceSpan — the lone Bath card, down to the minute inside a day, to the hour past one', () => {
  const cases: Array<[string, number, string]> = [
    ['saved this second reads a minute, never Now', 5_000, '1m'],
    ['a clock that moved backwards reads a minute', -3 * MIN, '1m'],
    ['14 minutes', 14 * MIN, '14m'],
    ['exactly an hour', HOUR, '1h'],
    ['5h 12m', 5 * HOUR + 12 * MIN, '5h 12m'],
    ['23h 59m', 23 * HOUR + 59 * MIN, '23h 59m'],
    ['exactly a day', 24 * HOUR, '1d'],
    ['a day and 7 hours, minutes dropped', 31 * HOUR + 40 * MIN, '1d 7h'],
    ['three days to the hour', 72 * HOUR + 59 * MIN, '3d'],
    ['twelve days and 2 hours', 12 * 24 * HOUR + 2 * HOUR, '12d 2h'],
  ];
  for (const [name, ago, want] of cases) {
    it(name, () => expect(sinceSpan(NOW - ago, NOW)).toBe(want));
  }
});

describe('durationLabel', () => {
  it('reads a finished nap', () => {
    expect(durationLabel(95 * MIN)).toBe('1h 35m');
    expect(durationLabel(45 * MIN)).toBe('45m');
    expect(durationLabel(2 * HOUR)).toBe('2h');
  });

  it('says 0m rather than "just now" — a zero-length entry is a duration, not an age', () => {
    expect(durationLabel(0)).toBe('0m');
  });

  it('carries a rounded 60 minutes into the hour instead of printing 0h 60m', () => {
    expect(durationLabel(59 * MIN + 45_000)).toBe('1h');
    expect(durationLabel(HOUR + 59 * MIN + 45_000)).toBe('2h');
  });

  it('clamps a negative duration', () => {
    expect(durationLabel(-5 * MIN)).toBe('0m');
  });
});

describe('hoursMinutes', () => {
  it('always carries both parts, the minutes in two digits, rounded to the minute', () => {
    expect(hoursMinutes(338 * MIN)).toBe('5h 38m');
    expect(hoursMinutes(2 * HOUR)).toBe('2h 00m');
    expect(hoursMinutes(59.6 * MIN)).toBe('1h 00m');
    expect(hoursMinutes(-5 * MIN)).toBe('0h 00m');
  });
});

describe('clockLabel', () => {
  it('counts up a running timer', () => {
    expect(clockLabel(4 * MIN + 9_000)).toBe('4:09');
    expect(clockLabel(HOUR + 4 * MIN + 12_000)).toBe('1:04:12');
    expect(clockLabel(0)).toBe('0:00');
  });

  it('pads minutes only once there are hours', () => {
    expect(clockLabel(9 * MIN)).toBe('9:00');
    expect(clockLabel(HOUR + 9 * MIN)).toBe('1:09:00');
  });

  it('clamps a negative elapsed rather than rendering a minus', () => {
    expect(clockLabel(-1000)).toBe('0:00');
  });
});

describe('agoLabel', () => {
  it('never says "just now ago"', () => {
    const now = 1_000_000_000;
    expect(agoLabel(now - 30_000, now)).toBe(JUST_NOW);
    expect(agoLabel(now - 14 * 60_000, now)).toBe('14m ago');
    expect(agoLabel(null, now)).toBe('not logged');
  });
});

/**
 * The capital a standalone line carries (the owner, 2026-09-19: a Quick tile's status "says
 * 'running' in lowercase, this does not feel professional"). The helper is deliberately blind to
 * whether its argument deserves one — the CALLER knows whether it is drawing a whole line — so
 * what is tested is that it touches the first character and nothing else.
 */
describe('firstUpper', () => {
  it('raises the first character of a state that is a whole line', () => {
    expect(firstUpper(RUNNING)).toBe('Running');
    expect(firstUpper(NOT_LOGGED)).toBe('Not logged');
    expect(firstUpper('due now')).toBe('Due now');
    expect(firstUpper('add one')).toBe('Add one');
  });

  it('is sentence case and not title case: the rest of the line is untouched', () => {
    expect(firstUpper('not set yet — tap to choose how often')).toBe(
      'Not set yet — tap to choose how often',
    );
    // the middot joins two facts and neither of them gains a capital
    expect(firstUpper('every 3h from the last · 2 done · 1 missed')).toBe(
      'Every 3h from the last · 2 done · 1 missed',
    );
  });

  it('is a no-op on a line that does not start with a lowercase letter', () => {
    expect(firstUpper('14h 27m · due now')).toBe('14h 27m · due now');
    expect(firstUpper('Vitamin D · missed')).toBe('Vitamin D · missed');
    expect(firstUpper(JUST_NOW)).toBe(JUST_NOW);
    expect(firstUpper('')).toBe('');
    expect(firstUpper('—')).toBe('—');
  });

  it('never splits an astral first character in half', () => {
    // `s[0].toUpperCase() + s.slice(1)` would leave a lone surrogate here
    expect(firstUpper('\u{1F37C} bottle')).toBe('\u{1F37C} bottle');
    expect(Array.from(firstUpper('\u{1F37C}')).length).toBe(1);
  });
});

describe('sideMinutes — a two-sided feed whose sides add up to its total', () => {
  it('gives the spare minute to the side with more left over', () => {
    expect(sideMinutes(450, 450)).toEqual({ total: 15, left: 8, right: 7 }); // 7m 30s a side
    expect(sideMinutes(444, 444)).toEqual({ total: 15, left: 8, right: 7 }); // 7m 24s a side
    expect(sideMinutes(420 + 10, 420 + 50)).toEqual({ total: 15, left: 7, right: 8 });
  });

  it('matches plain rounding whenever that already adds up', () => {
    expect(sideMinutes(8 * 60, 10 * 60)).toEqual({ total: 18, left: 8, right: 10 });
    expect(sideMinutes(18 * 60, 0)).toEqual({ total: 18, left: 18, right: 0 });
    expect(sideMinutes(0, 0)).toEqual({ total: 0, left: 0, right: 0 });
  });

  it('always adds up, whatever the seconds', () => {
    for (let l = 0; l < 400; l += 7) {
      for (let r = 0; r < 400; r += 11) {
        const m = sideMinutes(l, r);
        expect(m.left + m.right, `${l}s + ${r}s`).toBe(m.total);
        expect(m.total).toBe(Math.round((l + r) / 60));
        // never more than a minute from its own seconds
        expect(Math.abs(m.left - l / 60)).toBeLessThan(1);
        expect(Math.abs(m.right - r / 60)).toBeLessThan(1);
      }
    }
  });
});
