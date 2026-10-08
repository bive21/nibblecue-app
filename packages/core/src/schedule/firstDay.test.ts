/**
 * THE HOUSEHOLD'S FIRST DAY (`start.ts`; the owner, 2026-09-25: *"It should still show from
 * midnight in case if user wants to 'fix' the schedule or update it with their actual time. …
 * I think it should be skipped, since user can 'fix' it with actual time"*).
 *
 * One household in America/New_York, created at 10:47 AM on Wednesday 2026-06-10, whose setup
 * wrote feeding every three hours with the night paused from 11 PM to 6 AM — a minute later, as
 * `SetupSeeder` does. Its day, like every day with nothing logged: 6:00, 9:00, 12:00, 3:00, 6:00
 * and 9:00.
 */
import { describe, expect, it } from 'vitest';
import { adherence } from './adherence';
import { scheduleAhead } from './ahead';
import { at, ctx, rule, sess, TZ } from './fixtures';
import { FIRST_SLOT_MS, intervalOccurrences } from './interval';
import { householdStartFor, isBeforeStart, slotsBeginAt, STARTED_WITH_MS } from './start';
import { hhmmOf, wallMinutes } from './time';
import { listedToday, nextEvent, openToday, scheduleDay } from './today';
import { MIN, skipKey, type Occurrence, type Rule } from './types';
import { dayTally } from './wheel';

const SIGNUP = at('10:47');
/** Setup's rhythms are written a minute after the household exists (`SetupSeeder`). */
const SEEDED = at('10:48');

const feeding = (extra: Partial<Rule> = {}): Rule =>
  rule({
    id: 'r-feed',
    activity: 'bottle',
    ruleType: 'INTERVAL',
    everyMinutes: 180,
    nightMode: 'PAUSE',
    nightFrom: '23:00',
    nightTo: '06:00',
    effectiveFromMs: SEEDED,
    ...extra,
  });

const setTime = (id: string, atLocalTime: string, extra: Partial<Rule> = {}): Rule =>
  rule({
    id,
    activity: 'bottle',
    ruleType: 'FIXED',
    atLocalTime,
    effectiveFromMs: SEEDED,
    ...extra,
  });

/** The fixture day, read as the household's first. */
const firstDay = (now: string, extra: Parameters<typeof ctx>[1] = {}) =>
  ctx(now, { trackingFromMs: SIGNUP, ...extra });

const hhmm = (ms: number): string => hhmmOf(wallMinutes(TZ, ms));
/** `09:00 SKIPPED before start` — one string a row, the way the Schedule tab reads down. */
const day = (occ: readonly Occurrence[]): string[] =>
  occ.map(o => `${hhmm(o.atMs)} ${o.status}${o.beforeStart === true ? ' before start' : ''}`);

describe('the first day runs from midnight, and what came before the household is skipped', () => {
  it('a household created at 10:47 AM: the midnight grid, the morning skipped, 12:00 next', () => {
    const res = intervalOccurrences(feeding(), [], firstDay('10:50'));
    expect(day(res.occurrences)).toEqual([
      '06:00 SKIPPED before start',
      '09:00 SKIPPED before start',
      '12:00 UPCOMING',
      '15:00 UPCOMING',
      '18:00 UPCOMING',
      '21:00 UPCOMING',
    ]);
    // not missed: the app was not in the parent's hands at 6 or at 9
    expect(res.missedToday).toBe(0);
    // the first upcoming slot is the next one on the grid after signup — no fifteen-minute slot
    expect(res.next).toMatchObject({ atMs: at('12:00'), status: 'UPCOMING' });
    expect(res.carried).toBeNull();
  });

  it('is the same day through `scheduleDay`: Up next, the open rows and the list agree', () => {
    const d = scheduleDay([feeding()], [], firstDay('10:50'));
    expect(day(listedToday(d))).toEqual(
      day(intervalOccurrences(feeding(), [], firstDay('10:50')).occurrences),
    );
    // Up next and the reminders read DUE and UPCOMING only; nothing before signup is either
    expect(nextEvent(d)?.atMs).toBe(at('12:00'));
    const open = openToday(d).filter(o => o.status === 'DUE' || o.status === 'UPCOMING');
    expect(open[0]?.atMs).toBe(at('12:00'));
    expect(openToday(d).some(o => o.status === 'MISSED')).toBe(false);
    expect(d.occurrences.filter(o => o.atMs < SIGNUP).every(o => o.status === 'SKIPPED')).toBe(
      true,
    );
  });

  it('those skips are the engine’s: neutral, outside the day’s totals, unlike a skip a parent made', () => {
    // the parent skipped the noon feed themselves — a stored skip, which the server keeps
    const d = scheduleDay(
      [feeding()],
      [],
      firstDay('10:50', { skipped: new Set([skipKey('r-feed', at('12:00'))]) }),
    );
    expect(day(d.occurrences)).toEqual([
      '06:00 SKIPPED before start',
      '09:00 SKIPPED before start',
      '12:00 SKIPPED',
      '15:00 UPCOMING',
      '18:00 UPCOMING',
      '21:00 UPCOMING',
    ]);
    const a = adherence(d.occurrences);
    // the four slots since signup, one of them skipped by choice; the morning is in none of it
    expect(a).toMatchObject({ scheduled: 4, skipped: 1, missed: 0, done: 0, toCome: 3 });
    expect(a.beforeStart).toBe(2);
    // the wheel's "how it went" line: the chosen skip is "not marked", the morning is nothing
    expect(dayTally(d.occurrences)).toEqual({ done: 0, ahead: 3, missed: 1 });
  });

  it('a feed logged afterwards with its real time, 9:20 AM, makes the 9:00 slot DONE and re-anchors', () => {
    const fix = sess('bottle', '09:20', null, { id: 'fix' });
    const res = intervalOccurrences(feeding(), [fix], firstDay('11:00'));
    expect(day(res.occurrences)).toEqual([
      '06:00 SKIPPED before start',
      '09:00 DONE',
      '12:20 UPCOMING',
      '15:20 UPCOMING',
      '18:20 UPCOMING',
      '21:20 UPCOMING',
    ]);
    const nine = res.occurrences.find(o => o.atMs === at('09:00'));
    expect(nine).toMatchObject({ matchedId: 'fix', matchedAtMs: at('09:20'), beforeStart: false });
    // the chain runs from the entry, exactly as on any other day: the next slot says where it was
    expect(res.next).toMatchObject({ atMs: at('12:20'), movedFromMs: at('12:00') });
    expect(res.doneToday).toBe(1);
    // and the answered slot counts like any done one; the one still before signup does not
    const a = adherence(scheduleDay([feeding()], [fix], firstDay('11:00')).occurrences);
    expect(a).toMatchObject({ scheduled: 5, done: 1, beforeStart: 1 });
  });

  it('the next day is the same grid, with nothing skipped', () => {
    // the household began yesterday at 10:47; today nothing is logged yet
    const nextDay = { ...ctx('08:00'), trackingFromMs: at('10:47', -1) };
    const r = feeding({ effectiveFromMs: at('10:48', -1) });
    const res = intervalOccurrences(r, [], nextDay);
    expect(day(res.occurrences)).toEqual([
      // the wake slot after a paused night is due, never missed, for a full interval (B5)
      '06:00 DUE',
      '09:00 UPCOMING',
      '12:00 UPCOMING',
      '15:00 UPCOMING',
      '18:00 UPCOMING',
      '21:00 UPCOMING',
    ]);
    // the first day's slots are the ones the parent sees the next morning
    const first = intervalOccurrences(feeding(), [], firstDay('10:50')).occurrences;
    expect(res.occurrences.map(o => hhmm(o.atMs))).toEqual(first.map(o => hhmm(o.atMs)));
    // and the first day itself looks two days on exactly as it always did
    const ahead = scheduleAhead([feeding()], [], firstDay('22:00'));
    expect(ahead[0]).toMatchObject({ atMs: at('06:00', 1), status: 'UPCOMING' });
    expect(ahead[0]?.beforeStart).toBe(false);
  });
});

describe('a rule written later keeps the rule it always had', () => {
  it('4 PM on a later day: the first slot fifteen minutes in, and no morning at all', () => {
    const later = rule({
      id: 'r-pump',
      activity: 'pump',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
      effectiveFromMs: at('16:00'),
    });
    const now = { ...ctx('16:05'), trackingFromMs: at('10:47', -3) };
    const res = intervalOccurrences(later, [], now);
    expect(res.occurrences[0]?.atMs).toBe(at('16:00') + FIRST_SLOT_MS);
    expect(res.occurrences[1]?.atMs).toBe(at('19:15'));
    const d = scheduleDay([later], [], now);
    expect(d.occurrences.some(o => o.atMs < at('16:00'))).toBe(false);
    expect(d.occurrences.some(o => o.beforeStart === true)).toBe(false);
  });

  it('two hours after setup on the first day: written into a day already going', () => {
    const r = feeding({ effectiveFromMs: at('12:47') });
    const res = intervalOccurrences(r, [], firstDay('12:50'));
    expect(day(res.occurrences)).toEqual([
      '13:02 UPCOMING',
      '16:02 UPCOMING',
      '19:02 UPCOMING',
      '22:02 UPCOMING',
    ]);
    // and a set time written then does not reach back into the morning either
    const d = scheduleDay(
      [setTime('t7', '07:00', { effectiveFromMs: at('12:47') })],
      [],
      firstDay('12:50'),
    );
    expect(d.occurrences).toEqual([]);
  });

  it('draws the line half an hour after the household began', () => {
    const ctxOf = { trackingFromMs: SIGNUP, timeZone: TZ };
    expect(householdStartFor(feeding({ effectiveFromMs: SIGNUP + STARTED_WITH_MS }), ctxOf)).toBe(
      SIGNUP,
    );
    expect(
      householdStartFor(feeding({ effectiveFromMs: SIGNUP + STARTED_WITH_MS + 1 }), ctxOf),
    ).toBeNull();
    // a rule dated before the household (the server's clock ahead of the phone's) started with it
    expect(householdStartFor(feeding({ effectiveFromMs: SIGNUP - 5 * MIN }), ctxOf)).toBe(SIGNUP);
    // where slots may exist at all: the first day's midnight, or the rule's own moment
    expect(slotsBeginAt(feeding(), ctxOf)).toBe(at('00:00'));
    expect(slotsBeginAt(feeding({ effectiveFromMs: at('12:47') }), ctxOf)).toBe(at('12:47'));
    expect(isBeforeStart(feeding(), at('09:00'), ctxOf)).toBe(true);
    expect(isBeforeStart(feeding(), SIGNUP, ctxOf)).toBe(false);
    // a rhythm changed twenty minutes into the first sitting is still setup
    const res = intervalOccurrences(
      feeding({ effectiveFromMs: SIGNUP + 20 * MIN }),
      [],
      firstDay('11:10'),
    );
    expect(day(res.occurrences).slice(0, 3)).toEqual([
      '06:00 SKIPPED before start',
      '09:00 SKIPPED before start',
      '12:00 UPCOMING',
    ]);
  });

  it('a caller that does not know when the household began changes nothing', () => {
    // no `trackingFromMs`: every rule grids from its own moment, first slot fifteen minutes in
    const res = intervalOccurrences(feeding(), [], ctx('10:50'));
    expect(res.occurrences[0]?.atMs).toBe(SEEDED + FIRST_SLOT_MS);
    expect(res.occurrences.some(o => o.beforeStart === true)).toBe(false);
    expect(householdStartFor(feeding(), {})).toBeNull();
  });
});

describe('set times, a bath and a medicine on the first day', () => {
  it('set times before signup are skipped; one after it is the day’s next', () => {
    const d = scheduleDay(
      [setTime('t7', '07:00'), setTime('t10', '10:00'), setTime('t13', '13:00')],
      [],
      firstDay('10:50'),
    );
    // 10:00 is still inside its window at 10:50, and it is still before the household: skipped
    expect(day(d.occurrences)).toEqual([
      '07:00 SKIPPED before start',
      '10:00 SKIPPED before start',
      '13:00 UPCOMING',
    ]);
    expect(nextEvent(d)?.atMs).toBe(at('13:00'));
    expect(adherence(d.occurrences)).toMatchObject({ scheduled: 1, beforeStart: 2, skipped: 0 });
  });

  it('a fix inside the slot’s window answers it; so does one later that morning, by the second look', () => {
    const rules = [setTime('t7', '07:00'), setTime('t16', '16:00')];
    const onTime = scheduleDay(
      rules,
      [sess('bottle', '07:10', null, { id: 'a' })],
      firstDay('11:00'),
    );
    expect(day(onTime.occurrences)).toEqual(['07:00 DONE', '16:00 UPCOMING']);
    // 8:40 is past the 7:00 slot's late window; it is still the 7:00 feed, given late, as any day
    const late = scheduleDay(
      rules,
      [sess('bottle', '08:40', null, { id: 'b' })],
      firstDay('11:00'),
    );
    expect(late.occurrences[0]).toMatchObject({ status: 'LATE', matchedId: 'b', minutesLate: 100 });
  });

  it('a feed logged after signup is never billed to a slot from before it', () => {
    const rules = [setTime('t7', '07:00'), setTime('t16', '16:00')];
    const noon = sess('bottle', '12:00', null, { id: 'noon' });
    const d = scheduleDay(rules, [noon], firstDay('12:05'));
    expect(day(d.occurrences)).toEqual(['07:00 SKIPPED before start', '16:00 UPCOMING']);
    expect(d.extras.map(s => s.id)).toEqual(['noon']);
    // on a day the household already had, the same noon feed closes the 7:00 slot, late
    const yesterdays = [
      setTime('t7', '07:00', { effectiveFromMs: at('10:48', -1) }),
      setTime('t16', '16:00', { effectiveFromMs: at('10:48', -1) }),
    ];
    const olderDay = scheduleDay(yesterdays, [noon], {
      ...ctx('12:05'),
      trackingFromMs: at('10:47', -1),
    });
    expect(olderDay.occurrences[0]).toMatchObject({ status: 'LATE', matchedId: 'noon' });
  });

  it('a bath due at 6:30 PM in a household that began at 7 PM is skipped, and a bath that day counts', () => {
    const bath = rule({
      id: 'bath',
      activity: 'bath',
      ruleType: 'CADENCE',
      everyDays: 2,
      atLocalTime: '18:30',
      effectiveFromMs: at('19:06'),
    });
    const evening = { ...ctx('19:10'), trackingFromMs: at('19:05') };
    expect(day(scheduleDay([bath], [], evening).occurrences)).toEqual([
      '18:30 SKIPPED before start',
    ]);
    // with none given the rhythm is still owed, so tomorrow's is the next one
    expect(scheduleAhead([bath], [], evening)[0]?.atMs).toBe(at('18:30', 1));
    const bathed = scheduleDay([bath], [sess('bath', '17:00')], evening);
    expect(bathed.occurrences.filter(o => !o.future).map(o => o.status)).toEqual(['DONE']);
  });

  it('a medicine is a day question on the first day too: a dose that afternoon answers the 8 AM one', () => {
    const drops = rule({
      id: 'drops',
      activity: 'med',
      ruleType: 'FIXED',
      atLocalTime: '08:00',
      careItemId: 'drops',
      effectiveFromMs: SEEDED,
    });
    const before = scheduleDay([drops], [], firstDay('13:00'));
    expect(day(before.occurrences)).toEqual(['08:00 SKIPPED before start']);
    const given = scheduleDay(
      [drops],
      [sess('med', '14:00', null, { id: 'dose', careItemId: 'drops' })],
      firstDay('14:05'),
    );
    // as on any day: done that day, later than its time
    expect(given.occurrences[0]).toMatchObject({
      status: 'LATE',
      matchedId: 'dose',
      beforeStart: false,
    });
  });
});

describe('the edges of the first day', () => {
  it('a slot at the very minute the household began is its own, not skipped', () => {
    const r = feeding({
      nightMode: 'NONE',
      nightFrom: null,
      nightTo: null,
      effectiveFromMs: at('09:01'),
    });
    const res = intervalOccurrences(r, [], { ...ctx('09:05'), trackingFromMs: at('09:00') });
    expect(day(res.occurrences).slice(0, 4)).toEqual([
      '03:00 SKIPPED before start',
      '06:00 SKIPPED before start',
      '09:00 DUE',
      '12:00 UPCOMING',
    ]);
  });

  it('a slot from the evening before a just-after-midnight signup is skipped, never carried as due', () => {
    // signed up at 12:05 AM and backdated the last feed to 8:50 PM: the 11:50 PM slot was before
    // the household, so it is not the one open slot Today leads with at 12:10 (`carried`)
    const r = feeding({
      nightMode: 'NONE',
      nightFrom: null,
      nightTo: null,
      effectiveFromMs: at('00:06'),
    });
    const lastFeed = sess('bottle', '20:50', null, { dayOffset: -1 });
    const res = intervalOccurrences(r, [lastFeed], {
      ...ctx('00:10'),
      trackingFromMs: at('00:05'),
    });
    expect(res.carried).toBeNull();
    expect(res.next).toMatchObject({ atMs: at('02:50'), status: 'UPCOMING' });
    // in a household three days old, the same slot is still due at 12:10, and carried
    const had = intervalOccurrences(
      feeding({
        nightMode: 'NONE',
        nightFrom: null,
        nightTo: null,
        effectiveFromMs: at('10:01', -3),
      }),
      [lastFeed],
      { ...ctx('00:10'), trackingFromMs: at('10:00', -3) },
    );
    expect(had.carried).toMatchObject({ atMs: at('23:50', -1), status: 'DUE' });
  });

  /*
    THE LATE EVENING (the owner, 2026-09-26: "i created the account at 11.30pm, but i only see the
    schedule at 11.46, and nothing before… user needs to show previous schedule as well… but mark
    it as skipped"). The rhythms setup fills in: every three hours, nights every four between the
    default bedtime and waking. The engine was right; the phone handed it no household start, and
    `blind` below is what it drew then.
  */
  const setupNight: Partial<Rule> = {
    nightMode: 'LONGER',
    nightFrom: '19:30',
    nightTo: '07:00',
    nightEveryMinutes: 240,
  };
  const JUNE_11 = { y: 2026, m: 6, d: 11 };
  const JUNE_12 = { y: 2026, m: 6, d: 12 };

  it('a household created at 11:30 PM, after the day’s last slot: the whole day skipped, tomorrow next', () => {
    const late = feeding({ ...setupNight, effectiveFromMs: at('23:31') });
    const res = intervalOccurrences(late, [], { ...ctx('23:32'), trackingFromMs: at('23:30') });
    expect(day(res.occurrences)).toEqual([
      '04:00 SKIPPED before start',
      '08:00 SKIPPED before start',
      '11:00 SKIPPED before start',
      '14:00 SKIPPED before start',
      '17:00 SKIPPED before start',
      '21:00 SKIPPED before start',
    ]);
    // nothing is open tonight, nothing is missed, and nothing is carried into tomorrow
    expect(res.next).toBeNull();
    expect(res.missedToday).toBe(0);
    expect(res.carried).toBeNull();
    // Up next falls through to tomorrow, laid out from ITS midnight like any day — and its first
    // slot is the one between tonight's 9:00 PM and its 4:00 AM, seven hours on a four-hour night:
    // 12:30 AM (the owner, 2026-09-27, signed up at 10:15 PM to a next feed at 4:00 AM; `wrap.test.ts`)
    const ahead = scheduleAhead([late], [], { ...ctx('23:32'), trackingFromMs: at('23:30') });
    expect(ahead[0]).toMatchObject({
      atMs: at('00:30', 1),
      status: 'UPCOMING',
      beforeStart: false,
    });
    // without the household's start: one slot, fifteen minutes after the rule — the report
    const blind = intervalOccurrences(late, [], ctx('23:32'));
    expect(day(blind.occurrences)).toEqual(['23:46 UPCOMING']);
  });

  it('an 11:59 PM sign-up whose rhythms are written after midnight: the next day is an ordinary one', () => {
    const r = feeding({ ...setupNight, effectiveFromMs: at('00:00', 1) + 30_000 });
    const began = { trackingFromMs: at('23:59') };
    const res = intervalOccurrences(r, [], ctx('00:05', began, JUNE_11));
    expect(day(res.occurrences)).toEqual([
      // the household's first day ended at 9:00 PM, so an ordinary day opens with the night's
      // fill (`gridFills`) — after the household began, so the household's own
      '00:30 UPCOMING',
      '04:00 UPCOMING',
      '08:00 UPCOMING',
      '11:00 UPCOMING',
      '14:00 UPCOMING',
      '17:00 UPCOMING',
      '21:00 UPCOMING',
    ]);
    expect(res.carried).toBeNull();
    // the day after is the same grid again
    const after = intervalOccurrences(r, [], ctx('00:05', began, JUNE_12));
    expect(after.occurrences.map(o => hhmm(o.atMs))).toEqual(
      res.occurrences.map(o => hhmm(o.atMs)),
    );
    // without the household's start that day began with a slot at a quarter past midnight
    const blind = intervalOccurrences(r, [], ctx('00:05', {}, JUNE_11));
    expect(blind.occurrences.map(o => hhmm(o.atMs))[0]).toBe('00:15');
  });
});
