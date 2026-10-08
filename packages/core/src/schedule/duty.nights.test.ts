/**
 * WHO'S ON TONIGHT, NIGHT BY NIGHT (the owner, 2026-10-08: *"make sure who's on tonight works, run
 * some test with real life scenarios that may happen"*).
 *
 * Real nights in one Chicago household, each asked of the one decision every phone and the server
 * make for every reminder (`routeFor` / `deliveryFor`; the server's `app.sync_reminders` is held to
 * the same table by `packages/db/src/integration/sync-duty.test.ts`):
 *
 *   Mom (OWNER), Dad (PARENT), Nana (CAREGIVER, sometimes on a timed seat), Gran (VIEW_ONLY).
 *
 * `duty.test.ts` holds the rules one by one; this file walks whole nights through them, including
 * the two nights a year the clocks change.
 */
import { describe, expect, it } from 'vitest';
import type { Role } from '../domain/domain-types';
import { zonedToUtc } from '../today/day';
import {
  defaultSplitAt,
  deliveryFor,
  dutyEndOptions,
  dutyNow,
  dutyProblem,
  handOver,
  isTonight,
  liveShifts,
  newDutyList,
  routeFor,
  withSeen,
  type DutyShift,
  type ReminderPref,
} from './duty';
import { wallMinutes } from './time';

const TZ = 'America/Chicago';
const MIN = 60_000;
const HOUR = 60 * MIN;
const WINDOW = { wake: '07:00', bed: '20:00' };

const MOM = 'mom';
const DAD = 'dad';
const NANA = 'nana';
const GRAN = 'gran';
const ROLE: Record<string, Role> = {
  mom: 'OWNER',
  dad: 'PARENT',
  nana: 'CAREGIVER',
  gran: 'VIEW_ONLY',
};
const EVERYONE = [MOM, DAD, NANA, GRAN];
const PARENTS = new Set([MOM, DAD]);
const CAN_BE_ON = new Set([MOM, DAD, NANA]);

/** Chicago wall time on a date, as a UTC instant. */
const at = (y: number, mo: number, d: number, h: number, mi = 0) => zonedToUtc(TZ, y, mo, d, h, mi);

/**
 * Whose phone rings for one reminder, and how: every member asked, as the server asks (and as each
 * phone asks for itself). `prefs` is each person's row for the kind; none means the default (on,
 * sound).
 */
function ringing(
  activity: string,
  atMs: number,
  shifts: readonly DutyShift[],
  opts: { audience?: string[]; prefs?: Record<string, ReminderPref> } = {},
) {
  const out: Record<string, string> = {};
  for (const userId of EVERYONE) {
    const d = deliveryFor({
      activity,
      atMs,
      audience: opts.audience ?? [MOM],
      userId,
      role: ROLE[userId] ?? null,
      pref: opts.prefs?.[userId],
      shifts,
    });
    if (d !== null)
      out[userId] =
        `${d.level}${d.onShift ? ' on' : ''}${d.quietHours ? '' : ' (through quiet hours)'}`;
  }
  return out;
}

describe('a split night: Mom 10 PM to 2 AM, Dad 2 AM to 6 AM', () => {
  const night = [
    { userId: MOM, fromMs: at(2026, 10, 8, 22), untilMs: at(2026, 10, 9, 2) },
    { userId: DAD, fromMs: at(2026, 10, 9, 2), untilMs: at(2026, 10, 9, 6) },
  ];

  it('is a list the phone and the server both take, set at 9:30 PM', () => {
    expect(dutyProblem(night, at(2026, 10, 8, 21, 30), CAN_BE_ON)).toBeNull();
    // the sheet's own default split of a 10 to 6 night is 2 AM
    expect(defaultSplitAt(at(2026, 10, 8, 22), at(2026, 10, 9, 6), TZ)).toBe(at(2026, 10, 9, 2));
  });

  it('11 PM feed: Mom’s phone only, at the slot’s time; nobody else’s', () => {
    expect(ringing('bottle', at(2026, 10, 8, 23), night)).toEqual({
      mom: 'sound on (through quiet hours)',
    });
  });

  it('3 AM feed: Dad’s phone only — Mom sleeps', () => {
    expect(ringing('bottle', at(2026, 10, 9, 3), night)).toEqual({
      dad: 'sound on (through quiet hours)',
    });
  });

  it('a nap heads-up at 1:30 AM follows the shift too; Mom on vibrate is woken by vibration', () => {
    expect(
      ringing('sleep', at(2026, 10, 9, 1, 30), night, {
        prefs: { mom: { enabled: true, sound: false, vibrate: true } },
      }),
    ).toEqual({ mom: 'vibrate on (through quiet hours)' });
  });

  it('a kind Dad turned off still rings him while he is on: a shift that reaches nobody is the one failure', () => {
    expect(
      ringing('bottle', at(2026, 10, 9, 4), night, {
        prefs: { dad: { enabled: false, sound: false, vibrate: false } },
      }),
    ).toEqual({ dad: 'sound on (through quiet hours)' });
  });

  it('Mom’s 3 AM pump reminder is hers, whoever is on; never Dad’s, never Nana’s', () => {
    expect(ringing('pump', at(2026, 10, 9, 3), night, { audience: [MOM] })).toEqual({
      mom: 'sound',
    });
  });

  it('7 AM, after the night: both parents again by their own settings, quiet hours and all; never Nana or Gran', () => {
    expect(
      ringing('bottle', at(2026, 10, 9, 7), night, {
        prefs: { dad: { enabled: true, sound: false, vibrate: false } },
      }),
    ).toEqual({ mom: 'sound', dad: 'silent' });
  });

  it('Dad wakes at 1 AM and takes over: his from now to 6, one shift, Mom off', () => {
    const now = at(2026, 10, 9, 1);
    const after = handOver(night, DAD, now);
    expect(after).toEqual([{ userId: DAD, fromMs: now, untilMs: at(2026, 10, 9, 6) }]);
    expect(dutyProblem(after, now, CAN_BE_ON)).toBeNull();
    expect(ringing('bottle', at(2026, 10, 9, 1, 30), after)).toEqual({
      dad: 'sound on (through quiet hours)',
    });
    expect(dutyNow(after, now).current?.userId).toBe(DAD);
  });

  it('two phones: Dad set the list and Mom’s phone has not confirmed it — Dad’s covers her half, Mom’s rings too', () => {
    const list = newDutyList(night, {
      rev: 'r1',
      by: DAD,
      atMs: at(2026, 10, 8, 21, 30),
      replacing: null,
    });
    const route = (userId: string, atMs: number, meta = list.meta) =>
      routeFor({
        activity: 'bottle',
        atMs,
        audience: [MOM],
        userId,
        role: ROLE[userId] ?? null,
        pref: undefined,
        shifts: list.shifts,
        meta,
        parents: PARENTS,
      });
    // 11 PM: Mom is on but her phone never opened the list; Dad's phone keeps ringing as if on
    expect(route(MOM, at(2026, 10, 8, 23))?.onShift?.userId).toBe(MOM);
    expect(route(DAD, at(2026, 10, 8, 23))?.onShift?.userId).toBe(MOM);
    // Mom's phone opens the list at 10:05 PM and confirms it: Dad's goes quiet for her half
    const seen = withSeen(list, MOM, at(2026, 10, 8, 22, 5));
    expect(route(DAD, at(2026, 10, 8, 23), seen.meta)).toBeNull();
    expect(route(MOM, at(2026, 10, 8, 23), seen.meta)).not.toBeNull();
    // Nana and Gran never ring, confirmed or not
    expect(route(NANA, at(2026, 10, 8, 23))).toBeNull();
    expect(route(GRAN, at(2026, 10, 8, 23))).toBeNull();
  });
});

describe('Nana on for the evening, then nobody on', () => {
  it('5 PM: the sheet offers bedtime first (a day shift), and Nana’s phone takes the 7 PM feed alone', () => {
    const now = at(2026, 10, 8, 17);
    expect(isTonight(now, WINDOW, TZ)).toBe(false);
    const options = dutyEndOptions(now, WINDOW, TZ);
    expect(options.map(o => o.key)).toEqual(['bedtime', 'hours']);
    expect(options[0]?.atMs).toBe(at(2026, 10, 8, 20));
    const evening = [{ userId: NANA, fromMs: now, untilMs: at(2026, 10, 8, 20) }];
    expect(dutyProblem(evening, now, CAN_BE_ON)).toBeNull();
    expect(ringing('bottle', at(2026, 10, 8, 19), evening)).toEqual({
      nana: 'sound on (through quiet hours)',
    });
    // after bedtime nobody is on: the parents again, and Nana's phone is quiet
    expect(ringing('bottle', at(2026, 10, 8, 22), evening)).toEqual({ mom: 'sound', dad: 'sound' });
  });

  it('nobody on at all: both parents, each by their own choice; a parent who turned the kind off is not rung', () => {
    expect(
      ringing('bottle', at(2026, 10, 9, 3), [], {
        prefs: { mom: { enabled: false, sound: true, vibrate: true } },
      }),
    ).toEqual({ dad: 'sound' });
  });

  it('Gran (view only) can never be put on, and is never rung', () => {
    const now = at(2026, 10, 8, 21);
    expect(
      dutyProblem([{ userId: GRAN, fromMs: now, untilMs: now + 4 * HOUR }], now, CAN_BE_ON),
    ).toBe('notEligible');
    // even a list that names her (written by an older phone) rings nobody through her
    expect(
      deliveryFor({
        activity: 'bottle',
        atMs: now + HOUR,
        audience: [],
        userId: GRAN,
        role: 'VIEW_ONLY',
        pref: undefined,
        shifts: [{ userId: GRAN, fromMs: now, untilMs: now + 4 * HOUR }],
      }),
    ).toBeNull();
  });
});

describe('Nana on a six-hour seat that ends at midnight', () => {
  const now = at(2026, 10, 8, 18);
  const seatEnd = at(2026, 10, 9, 0);
  const seats = new Map([[NANA, seatEnd]]);

  it('cannot be put on until the morning: "until her access ends" is offered first, and taken', () => {
    expect(
      dutyProblem(
        [{ userId: NANA, fromMs: now, untilMs: at(2026, 10, 9, 7) }],
        now,
        CAN_BE_ON,
        seats,
      ),
    ).toBe('pastAccess');
    // 6 PM is not "tonight" yet (bed 8 PM): bedtime and three hours fit, the access end comes last
    expect(dutyEndOptions(now, WINDOW, TZ, seatEnd).map(o => o.key)).toEqual([
      'bedtime',
      'hours',
      'access',
    ]);
    // at 8 PM it is tonight: the morning would run past her seat, so "until access ends" leads
    const eight = at(2026, 10, 8, 20);
    expect(dutyEndOptions(eight, WINDOW, TZ, seatEnd).map(o => o.key)).toEqual(['access', 'hours']);
    const toMidnight = [{ userId: NANA, fromMs: eight, untilMs: seatEnd }];
    expect(dutyProblem(toMidnight, eight, CAN_BE_ON, seats)).toBeNull();
  });

  it('at 12:01 AM her seat and her shift are over together: the 1 AM feed is both parents’ again', () => {
    const shifts = [{ userId: NANA, fromMs: at(2026, 10, 8, 20), untilMs: seatEnd }];
    expect(ringing('bottle', at(2026, 10, 9, 1), shifts)).toEqual({ mom: 'sound', dad: 'sound' });
  });

  it('removed early at 10 PM (or her seat lapsed early): the list is read without her, and the parents are rung', () => {
    const shifts = [{ userId: NANA, fromMs: at(2026, 10, 8, 20), untilMs: seatEnd }];
    const stillHere = new Set([MOM, DAD]);
    const live = liveShifts(shifts, at(2026, 10, 8, 22), stillHere);
    expect(live).toEqual([]);
    expect(ringing('bottle', at(2026, 10, 8, 23), live)).toEqual({ mom: 'sound', dad: 'sound' });
  });
});

describe('the nights the clocks change', () => {
  it('fall back (Sunday 2026-11-01): Mom 10 PM to 2 AM, Dad 2 AM to 6 AM holds, the hour repeated is Mom’s', () => {
    const from = at(2026, 10, 31, 22);
    const until = at(2026, 11, 1, 6);
    // nine real hours, under the day's limit
    expect((until - from) / HOUR).toBe(9);
    const split = defaultSplitAt(from, until, TZ);
    expect(wallMinutes(TZ, split)).toBe(2 * 60);
    const night = [
      { userId: MOM, fromMs: from, untilMs: split },
      { userId: DAD, fromMs: split, untilMs: until },
    ];
    expect(dutyProblem(night, at(2026, 10, 31, 21), CAN_BE_ON)).toBeNull();
    // the first 1:30 AM (CDT) and the second (CST) are both before 2 AM standard: Mom's
    const firstOneThirty = from + 3.5 * HOUR;
    const secondOneThirty = firstOneThirty + HOUR;
    expect(wallMinutes(TZ, firstOneThirty)).toBe(90);
    expect(wallMinutes(TZ, secondOneThirty)).toBe(90);
    expect(Object.keys(ringing('bottle', firstOneThirty, night))).toEqual([MOM]);
    expect(Object.keys(ringing('bottle', secondOneThirty, night))).toEqual([MOM]);
    expect(Object.keys(ringing('bottle', split + 30 * MIN, night))).toEqual([DAD]);
    // "until the morning" is 7 AM on the clock, not 7 AM of yesterday's offset
    const options = dutyEndOptions(at(2026, 10, 31, 21), WINDOW, TZ);
    expect(options[0]).toEqual({ key: 'morning', atMs: at(2026, 11, 1, 7) });
  });

  it('spring forward (Sunday 2027-03-14): a 10 PM to 6 AM night is seven hours, and splits on a real hour', () => {
    const from = at(2027, 3, 13, 22);
    const until = at(2027, 3, 14, 6);
    expect((until - from) / HOUR).toBe(7);
    const split = defaultSplitAt(from, until, TZ);
    // 2 AM does not exist that night: the split lands on a time the clock shows
    expect([60, 180]).toContain(wallMinutes(TZ, split));
    expect(split).toBeGreaterThanOrEqual(from + HOUR);
    expect(split).toBeLessThanOrEqual(until - HOUR);
    const night = [
      { userId: MOM, fromMs: from, untilMs: split },
      { userId: DAD, fromMs: split, untilMs: until },
    ];
    expect(dutyProblem(night, at(2027, 3, 13, 21), CAN_BE_ON)).toBeNull();
    expect(dutyEndOptions(at(2027, 3, 13, 21), WINDOW, TZ)[0]).toEqual({
      key: 'morning',
      atMs: at(2027, 3, 14, 7),
    });
  });
});
