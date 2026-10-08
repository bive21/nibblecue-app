/**
 * WHEN THE CELEBRATION SHEET MAY RISE (docs/CELEBRATIONS.md §1, §5; 2026-09-28). The one sheet in
 * the app that speaks first used to rise whenever a note was owed: on launch, over a running feed,
 * at 3 a.m. These are the rules that now keep it for a quiet moment in the daytime, walked the way
 * a parent's day meets them.
 */
import { describe, expect, it } from 'vitest';
import { PROMPT_TIMING } from '../plan/welcome';
import { zonedToUtc } from '../today/day';
import {
  CELEBRATION_QUIET_MS,
  celebrationMayRise,
  celebrationShown,
  MARK_FROM_HOUR,
  markDue,
  markDueAt,
  type CelebrationMoment,
} from './index';

const NY = 'America/New_York';
const BORN = '2026-04-10';
/** The household's own wall clock, as an instant. */
const local = (iso: string, hour: number, minute = 0, zone = NY): number => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return zonedToUtc(zone, y, m, d, hour, minute);
};

describe('the monthly note is owed from nine on its own morning (§1, "from 09:00 local")', () => {
  it('waits until nine on the mark day, in the household’s zone', () => {
    // five months on 10 September
    expect(markDue(BORN, '2026-09-10')?.monthNumber).toBe(5);
    expect(MARK_FROM_HOUR).toBe(9);
    expect(markDueAt(BORN, NY, local('2026-09-10', 6))).toBeNull();
    expect(markDueAt(BORN, NY, local('2026-09-10', 8, 59))).toBeNull();
    expect(markDueAt(BORN, NY, local('2026-09-10', 9))?.monthNumber).toBe(5);
    expect(markDueAt(BORN, NY, local('2026-09-10', 23, 30))?.onIso).toBe('2026-09-10');
  });

  it('owes a day of the grace from its first minute, and nothing once the week is gone', () => {
    // the next morning at six: still the five-month note, dated to its own day
    expect(markDueAt(BORN, NY, local('2026-09-11', 6))?.onIso).toBe('2026-09-10');
    expect(markDueAt(BORN, NY, local('2026-09-17', 0, 5))?.onIso).toBe('2026-09-10');
    expect(markDueAt(BORN, NY, local('2026-09-18', 12))).toBeNull();
  });

  it('reads nine where the household is, not where the instant happens to be UTC nine', () => {
    // 09:00 in New York is 13:00 UTC in September; a UTC reading would have owed it at 5 a.m.
    const nineUtc = Date.UTC(2026, 8, 10, 9, 0);
    expect(markDueAt(BORN, NY, nineUtc)).toBeNull();
    expect(markDueAt(BORN, 'UTC', nineUtc)?.monthNumber).toBe(5);
  });

  it('keeps the calendar’s clamp: born on the 31st, owed from nine on the last day of a short month', () => {
    expect(markDueAt('2026-01-31', NY, local('2026-02-28', 8))).toBeNull();
    expect(markDueAt('2026-01-31', NY, local('2026-02-28', 9))?.monthNumber).toBe(1);
  });
});

/** A quiet afternoon on Today: the one moment every rule allows. */
const quiet: CelebrationMoment = {
  hour: 14,
  timerRunning: false,
  overlay: false,
  tour: false,
  awake: true,
  night: false,
  quietMs: 60_000,
};

describe('the card rises only into a quiet moment in the daytime', () => {
  it('rises on Today, in the afternoon, with nothing else going on', () => {
    expect(celebrationMayRise(quiet)).toBe(true);
  });

  it('keeps to the daytime on the phone’s clock: 8 a.m. to 9 p.m.', () => {
    expect(celebrationMayRise({ ...quiet, hour: 3 })).toBe(false);
    expect(celebrationMayRise({ ...quiet, hour: 7 })).toBe(false);
    expect(celebrationMayRise({ ...quiet, hour: 8 })).toBe(true);
    expect(celebrationMayRise({ ...quiet, hour: 20 })).toBe(true);
    expect(celebrationMayRise({ ...quiet, hour: 21 })).toBe(false);
    expect(celebrationMayRise({ ...quiet, hour: 23 })).toBe(false);
  });

  it('never over a running timer, a sheet or the tour, never off Today and never in Night', () => {
    expect(celebrationMayRise({ ...quiet, timerRunning: true })).toBe(false);
    expect(celebrationMayRise({ ...quiet, overlay: true })).toBe(false);
    expect(celebrationMayRise({ ...quiet, tour: true })).toBe(false);
    expect(celebrationMayRise({ ...quiet, awake: false })).toBe(false);
    expect(celebrationMayRise({ ...quiet, night: true })).toBe(false);
  });

  it('waits out the save toast and its Undo once the last of those has gone, as the trial sheets do', () => {
    expect(CELEBRATION_QUIET_MS).toBe(PROMPT_TIMING.afterSaveMs);
    expect(celebrationMayRise({ ...quiet, quietMs: 0 })).toBe(false);
    expect(celebrationMayRise({ ...quiet, quietMs: CELEBRATION_QUIET_MS - 1 })).toBe(false);
    expect(celebrationMayRise({ ...quiet, quietMs: CELEBRATION_QUIET_MS })).toBe(true);
  });
});

describe('once up, it stays until it is answered; off Today, it goes down and waits', () => {
  it('rises only when it may, and only with a card to show', () => {
    expect(celebrationShown({ wasUp: false, card: true, may: true, awake: true })).toBe(true);
    expect(celebrationShown({ wasUp: false, card: true, may: false, awake: true })).toBe(false);
    expect(celebrationShown({ wasUp: false, card: false, may: true, awake: true })).toBe(false);
  });

  it('stays up through what starts after it: the gate over it, another parent’s timer, nine o’clock', () => {
    expect(celebrationShown({ wasUp: true, card: true, may: false, awake: true })).toBe(true);
  });

  it('goes down, unanswered, when Today is left or the app is put away', () => {
    expect(celebrationShown({ wasUp: true, card: true, may: false, awake: false })).toBe(false);
    expect(celebrationShown({ wasUp: true, card: true, may: true, awake: false })).toBe(false);
    // answered: nothing left to show
    expect(celebrationShown({ wasUp: true, card: false, may: true, awake: true })).toBe(false);
  });

  it('walks a day: owed at 3 a.m., up at eight, put away at five to nine, not back until morning', () => {
    let up = false;
    const step = (m: CelebrationMoment) => {
      up = celebrationShown({ wasUp: up, card: true, may: celebrationMayRise(m), awake: m.awake });
      return up;
    };
    // 3 a.m., a bottle to log: nothing rises, and nothing has to be dismissed first
    expect(step({ ...quiet, hour: 3 })).toBe(false);
    // …and not over the feed either, once the morning comes
    expect(step({ ...quiet, hour: 8, timerRunning: true })).toBe(false);
    // the feed is stopped and its toast is up with Undo: not over that either
    expect(step({ ...quiet, hour: 8, quietMs: 2_000 })).toBe(false);
    // the Undo has had its time and the parent is still on Today: it rises
    expect(step({ ...quiet, hour: 8 })).toBe(true);
    // the locked weekly cells open the gate over it: it stays
    expect(step({ ...quiet, hour: 8, overlay: true })).toBe(true);
    // the phone goes in a pocket at 20:55
    expect(step({ ...quiet, hour: 20, awake: false })).toBe(false);
    // picked up at 3 a.m.: nothing waiting over Today
    expect(step({ ...quiet, hour: 3 })).toBe(false);
    // and the next quiet moment in the daytime, it is there again
    expect(step({ ...quiet, hour: 9 })).toBe(true);
  });
});
