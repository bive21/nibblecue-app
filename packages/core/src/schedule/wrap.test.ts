/**
 * NO GAP LONGER THAN THE RHYTHM (`gridFills`; the owner, 2026-09-27: *"i created accoutn and go
 * with default rhythm at 22.15pm. the scheduled feeding was 9pm (already past), and the next one is
 * 4am … the gap from 9pm to 4am -> 7 hours, was definitelytoo long … we couldve done added a 00.30
 * am(middle time) … having more is better then less in this case"*).
 *
 * With nothing logged, each day's grid starts again from its own midnight, so the night between two
 * such days was wherever one grid ended and the next began: 9:00 PM to 4:00 AM on setup's rhythm
 * (every 3 h, nights every 4 h from 7:30 PM to 7:00 AM), 9:00 PM to 3:00 AM on a plain three-hourly
 * one. The walk now puts the fewest evenly spaced slots between them that keep every gap inside the
 * step the rule itself takes there. One household in America/New_York (`fixtures.ts`), on
 * Wednesday 2026-06-10.
 */
import { describe, expect, it } from 'vitest';
import { scheduleAhead } from './ahead';
import { at, ctx, rule, sess, TZ } from './fixtures';
import {
  emptyDayGrid,
  emptyDaySlots,
  emptySlotsAfter,
  gridFills,
  intervalOccurrences,
  nextDue,
} from './interval';
import { hhmmOf, wallMinutes } from './time';
import { nextEvent, openToday, scheduleDay } from './today';
import { MIN, skipKey, type EngineContext, type Occurrence, type Rule } from './types';

const JUNE_11 = { y: 2026, m: 6, d: 11 };
const JUNE_12 = { y: 2026, m: 6, d: 12 };
const hhmm = (ms: number): string => hhmmOf(wallMinutes(TZ, ms));
/** `00:30 UPCOMING` — one string a row, the way the Schedule tab reads down. */
const day = (occ: readonly Occurrence[]): string[] =>
  occ.map(o => `${hhmm(o.atMs)} ${o.status}${o.beforeStart === true ? ' before start' : ''}`);
/** The same engine a day on: `dayStartMs` moves and `nowMs` does not (`useScheduleDay`'s Tomorrow). */
const dayAfter = (c: EngineContext, n = 1): EngineContext => ({
  ...c,
  dayStartMs: at('00:00', n),
});
/** Whether every gap is within the step the rule itself takes from the slot before it. */
const withinTheRhythm = (r: Rule, times: readonly number[]): boolean =>
  times.every((t, i) => {
    const prev = times[i - 1];
    return prev === undefined || t - prev <= nextDue(prev, r, TZ, prev) - prev;
  });

/** Setup's starting point: every three hours, nights every four between 7:30 PM and 7:00 AM. */
const defaultRhythm = (extra: Partial<Rule> = {}): Rule =>
  rule({
    id: 'r-feed',
    activity: 'bottle',
    ruleType: 'INTERVAL',
    everyMinutes: 180,
    nightMode: 'LONGER',
    nightFrom: '19:30',
    nightTo: '07:00',
    nightEveryMinutes: 240,
    ...extra,
  });

describe('the owner’s evening: signed up at 10:15 PM on the default rhythm, nothing logged', () => {
  const SIGNUP = at('22:15');
  /** `SetupSeeder` writes the rhythms a minute after the household exists. */
  const feeding = defaultRhythm({ effectiveFromMs: at('22:16') });
  const tonight = ctx('22:15', { trackingFromMs: SIGNUP });

  it('the first day is skipped whole; the next has 12:30 AM between 9:00 PM and 4:00 AM', () => {
    const first = intervalOccurrences(feeding, [], tonight);
    // the day they signed up: the grid from midnight, all of it before the household (`start.ts`)
    expect(day(first.occurrences)).toEqual([
      '04:00 SKIPPED before start',
      '08:00 SKIPPED before start',
      '11:00 SKIPPED before start',
      '14:00 SKIPPED before start',
      '17:00 SKIPPED before start',
      '21:00 SKIPPED before start',
    ]);
    expect(first.next).toBeNull();
    expect(first.missedToday).toBe(0);
    expect(first.carried).toBeNull();

    // the next day, as the Schedule tab's Tomorrow and both reminder planners read it
    const next = intervalOccurrences(feeding, [], dayAfter(tonight));
    expect(day(next.occurrences)).toEqual([
      '00:30 UPCOMING', // it was 4:00 AM: seven hours after 9:00 PM on a four-hour night
      '04:00 UPCOMING',
      '08:00 UPCOMING',
      '11:00 UPCOMING',
      '14:00 UPCOMING',
      '17:00 UPCOMING',
      '21:00 UPCOMING',
    ]);
    // the middle time the owner named: 3 h 30 m either side of it
    expect(at('00:30', 1) - at('21:00')).toBe(210 * MIN);
    expect(at('04:00', 1) - at('00:30', 1)).toBe(210 * MIN);
    // and no gap anywhere in the two days is longer than the rule's own step from where it starts
    const both = [...first.occurrences, ...next.occurrences].map(o => o.atMs);
    expect(withinTheRhythm(feeding, both)).toBe(true);
  });

  it('Up next at 10:15 PM is 12:30 AM, and it is what the reminders read', () => {
    const today = scheduleDay([feeding], [], tonight);
    // nothing is open tonight — every slot of the first day was before the household
    expect(nextEvent(today)).toBeNull();
    expect(openToday(today).some(o => o.status === 'DUE' || o.status === 'UPCOMING')).toBe(false);
    // so Up next falls through to the next day, whose first slot is now the middle of the night
    const ahead = scheduleAhead([feeding], [], tonight);
    expect(ahead[0]).toMatchObject({ atMs: at('00:30', 1), status: 'UPCOMING' });
    expect(ahead[0]?.beforeStart).toBe(false);
    // the day both reminder planners take their slots from: tomorrow, DUE and UPCOMING only
    const tomorrow = scheduleDay([feeding], [], dayAfter(tonight));
    expect(nextEvent(tomorrow)?.atMs).toBe(at('00:30', 1));
  });

  it('the 12:30 AM slot is a slot like any other: due, missed, skipped, done, late or early', () => {
    const on = (now: string, extra: Partial<EngineContext> = {}): EngineContext =>
      ctx(now, { trackingFromMs: SIGNUP, ...extra }, JUNE_11);
    // 12:45 AM: it is the one slot due, and 4:00 AM is the plan after it
    const due = intervalOccurrences(feeding, [], on('00:45'));
    expect(day(due.occurrences).slice(0, 2)).toEqual(['00:30 DUE', '04:00 UPCOMING']);
    expect(due.occurrences.filter(o => o.status === 'DUE')).toHaveLength(1);
    // 2:30 AM with nothing logged: missed once its late window closed. The grid still holds
    // 4:00, and that slot is due now because the miss has not been answered.
    const missed = intervalOccurrences(feeding, [], on('02:30'));
    expect(day(missed.occurrences).slice(0, 2)).toEqual(['00:30 MISSED', '04:00 DUE']);
    expect(missed.missedToday).toBe(1);
    // a caregiver's skip of it is honored, and the grid holds 4:00
    const skipped = intervalOccurrences(
      feeding,
      [],
      on('00:45', { skipped: new Set([skipKey(feeding.id, at('00:30', 1))]) }),
    );
    expect(day(skipped.occurrences).slice(0, 2)).toEqual(['00:30 SKIPPED', '04:00 UPCOMING']);
    // fed at 1:30 AM: that slot, an hour late, and the chain runs from the feed — the 4:00 slot
    // it moved says so, once
    const late = intervalOccurrences(
      feeding,
      [sess('bottle', '01:30', null, { dayOffset: 1, id: 'late' })],
      on('01:35'),
    );
    expect(late.occurrences[0]).toMatchObject({
      atMs: at('00:30', 1),
      status: 'LATE',
      matchedId: 'late',
      minutesLate: 60,
    });
    expect(late.next).toMatchObject({ atMs: at('05:30', 1), movedFromMs: at('04:00', 1) });
    // fed at 12:02 AM, before its window opened: the feed IS the slot, off the grid, and since no
    // entry had anchored the grid it moved, nothing is struck through
    const early = intervalOccurrences(
      feeding,
      [sess('bottle', '00:02', null, { dayOffset: 1, id: 'early' })],
      on('00:10'),
    );
    expect(early.occurrences[0]).toMatchObject({
      atMs: at('00:02', 1),
      status: 'DONE',
      offGrid: true,
    });
    expect(early.occurrences.some(o => o.atMs === at('00:30', 1))).toBe(false);
    expect(early.next).toMatchObject({ atMs: at('04:02', 1), movedFromMs: null });
  });

  it('a feed at 12:40 AM answers it: DONE, and the chain runs on from the feed with no seam', () => {
    const fed = sess('bottle', '00:40', null, { dayOffset: 1, id: 'fed' });
    const res = intervalOccurrences(
      feeding,
      [fed],
      ctx('00:50', { trackingFromMs: SIGNUP }, JUNE_11),
    );
    expect(res.occurrences[0]).toMatchObject({
      atMs: at('00:30', 1),
      status: 'DONE',
      matchedId: 'fed',
      matchedAtMs: at('00:40', 1),
    });
    // re-anchored on the feed: four hours at night, then the day's three — and the row that moved
    // off the grid's 4:00 AM says where it was
    expect(day(res.occurrences)).toEqual([
      '00:30 DONE',
      '04:40 UPCOMING',
      '08:40 UPCOMING',
      '11:40 UPCOMING',
      '14:40 UPCOMING',
      '17:40 UPCOMING',
      '21:40 UPCOMING',
    ]);
    expect(res.next).toMatchObject({ atMs: at('04:40', 1), movedFromMs: at('04:00', 1) });
    expect(res.doneToday).toBe(1);
    // and from then on the chain runs from that feed across every midnight: no 12:30 AM fill on
    // the day after, and every gap one of the rule's own steps
    const after = intervalOccurrences(
      feeding,
      [fed],
      ctx('09:00', { trackingFromMs: SIGNUP }, JUNE_12),
    );
    const afterTimes = after.occurrences.map(o => o.atMs);
    expect(afterTimes.includes(at('00:30', 2))).toBe(false);
    expect(withinTheRhythm(feeding, afterTimes)).toBe(true);
  });
});

describe('the wrap, on the other rhythms', () => {
  /** A household a week old, whose rules are older still: every day is an ordinary one. */
  const settled = { trackingFromMs: at('10:00', -7) };
  const every3h = rule({
    id: 'r-feed',
    activity: 'bottle',
    ruleType: 'INTERVAL',
    everyMinutes: 180,
    effectiveFromMs: at('10:01', -7),
  });

  it('every three hours, day and night: the wrap gets 12:00 AM, and every gap is three hours', () => {
    const d0 = intervalOccurrences(every3h, [], ctx('23:30', settled));
    expect(d0.occurrences.map(o => hhmm(o.atMs))).toEqual([
      '00:00', // 9:00 PM → 3:00 AM was six hours, one slot short every night
      '03:00',
      '06:00',
      '09:00',
      '12:00',
      '15:00',
      '18:00',
      '21:00',
    ]);
    // three days end to end: no slot twice across a midnight, every gap exactly three hours
    const run = [-1, 0, 1].flatMap(
      n => intervalOccurrences(every3h, [], dayAfter(ctx('23:30', settled), n)).occurrences,
    );
    const times = run.map(o => o.atMs);
    expect(new Set(times).size).toBe(times.length);
    expect(times.slice(1).every((t, i) => t - (times[i] ?? 0) === 180 * MIN)).toBe(true);
    // the midnight slot is the later day's: yesterday's list stops at 9:00 PM
    const yesterday = intervalOccurrences(every3h, [], dayAfter(ctx('23:30', settled), -1));
    expect(hhmm(yesterday.occurrences[yesterday.occurrences.length - 1]?.atMs ?? 0)).toBe('21:00');
    expect(yesterday.occurrences.some(o => o.atMs === at('00:00'))).toBe(false);
  });

  it('a rhythm whose grid does not divide the night fills it where the middle falls: 2½ h → 12:30 AM', () => {
    const r = rule({ ...every3h, everyMinutes: 150 });
    const res = intervalOccurrences(r, [], ctx('09:00', settled));
    expect(res.occurrences.slice(0, 3).map(o => hhmm(o.atMs))).toEqual(['00:30', '02:30', '05:00']);
    expect(res.occurrences.some(o => o.atMs === at('00:00'))).toBe(false);
  });

  it('a gap that needs two: 9:15 PM to 4:00 AM on a three-hour day step is 11:30 PM and 1:45 AM', () => {
    // a pump rhythm written at 9:00 this morning (first slot a quarter hour in), nights every four
    // hours from 12:30 to 5:00 AM: its first day ends at 9:15 PM — midnight is not night, so 12:15
    // AM would be a day step and falls to the next day — and the next day begins at 4:00 AM
    const pump = rule({
      id: 'r-pump',
      activity: 'pump',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
      nightMode: 'LONGER',
      nightFrom: '00:30',
      nightTo: '05:00',
      nightEveryMinutes: 240,
      effectiveFromMs: at('09:00'),
    });
    const now = ctx('09:05', settled);
    const d0 = intervalOccurrences(pump, [], now);
    const d1 = intervalOccurrences(pump, [], dayAfter(now));
    expect(day(d0.occurrences)).toEqual([
      '09:15 UPCOMING',
      '12:15 UPCOMING',
      '15:15 UPCOMING',
      '18:15 UPCOMING',
      '21:15 UPCOMING',
      '23:30 UPCOMING', // a fill, on the day its time falls in
    ]);
    expect(d1.occurrences.map(o => hhmm(o.atMs))).toEqual([
      '01:45', // the other fill, the next day's
      '04:00',
      '08:00',
      '11:00',
      '14:00',
      '17:00',
      '20:00',
      '23:00',
    ]);
    // 6 h 45 m on a 3 h step: two slots, 2 h 15 m apart, and nothing on either day twice
    const times = [...d0.occurrences, ...d1.occurrences].map(o => o.atMs);
    expect(new Set(times).size).toBe(times.length);
    expect(withinTheRhythm(pump, times)).toBe(true);

    // AT 12:10 AM THE 11:30 PM FILL IS STILL DUE, and it is carried into the new day as any open
    // slot from before midnight is — Up next leads with it, and the day's own list starts at 1:45
    const past = ctx('00:10', settled, JUNE_11);
    const open = intervalOccurrences(pump, [], past);
    expect(open.carried).toMatchObject({ atMs: at('23:30'), status: 'DUE' });
    expect(open.occurrences[0]).toMatchObject({ atMs: at('01:45', 1), status: 'UPCOMING' });
    // a pump at 12:20 AM answers it, late — the same answer the evening's own list gives — and the
    // chain runs from the pump: 4:20 AM, the night's four hours, where 1:45 AM stood
    const pumped = sess('pump', '00:20', null, { dayOffset: 1, id: 'p' });
    const answered = intervalOccurrences(pump, [pumped], ctx('00:25', settled, JUNE_11));
    expect(answered.carried).toBeNull();
    expect(answered.next).toMatchObject({ atMs: at('04:20', 1), movedFromMs: at('01:45', 1) });
    const evening = intervalOccurrences(pump, [pumped], {
      ...past,
      nowMs: at('00:25', 1),
      dayStartMs: at('00:00'),
    });
    expect(evening.occurrences.slice(-1)[0]).toMatchObject({
      atMs: at('23:30'),
      status: 'LATE',
      matchedId: 'p',
    });
  });

  it('the fill is the same slot whichever day computes it, and whatever the clock says', () => {
    const pump = rule({
      id: 'r-pump',
      activity: 'pump',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
      nightMode: 'LONGER',
      nightFrom: '00:30',
      nightTo: '05:00',
      nightEveryMinutes: 240,
      effectiveFromMs: at('09:00'),
    });
    const zone = { timeZone: TZ, ...settled };
    const last = emptyDayGrid(pump, zone, at('00:00')).slice(-1)[0] ?? 0;
    const first = emptyDayGrid(pump, zone, at('00:00', 1))[0] ?? 0;
    expect([hhmm(last), hhmm(first)]).toEqual(['21:15', '04:00']);
    const fills = gridFills(pump, TZ, last, first);
    expect(fills).toEqual([at('23:30'), at('01:45', 1)]);
    // each day's own list is the empty day `emptyDaySlots` names, the fills split between them
    for (const [n, now] of [
      [0, ctx('09:05', settled)],
      [1, ctx('09:05', settled)],
      [1, ctx('00:10', settled, JUNE_11)],
      [0, ctx('23:50', settled)],
    ] as const) {
      const c = n === 0 ? now : { ...now, dayStartMs: at('00:00', 1) };
      const listed = intervalOccurrences(pump, [], c).occurrences.map(o => o.atMs);
      expect(listed).toEqual(emptyDaySlots(pump, zone, at('00:00', n)));
      expect(listed.filter(t => fills.includes(t))).toEqual([fills[n] ?? -1]);
    }
    // the owner's 12:30 AM, likewise, from the night's two ends
    const feeding = defaultRhythm({ effectiveFromMs: at('10:01', -7) });
    const l = emptyDayGrid(feeding, zone, at('00:00')).slice(-1)[0] ?? 0;
    const f = emptyDayGrid(feeding, zone, at('00:00', 1))[0] ?? 0;
    expect(gridFills(feeding, TZ, l, f)).toEqual([at('00:30', 1)]);
    expect(emptyDaySlots(feeding, zone, at('00:00', 1))[0]).toBe(at('00:30', 1));
    expect(emptyDaySlots(feeding, zone, at('00:00')).includes(at('00:30', 1))).toBe(false);
  });

  it('lands on whole minutes: 9:05 PM to 4:00 AM is 12:33 AM, not 12:32:30', () => {
    // a rhythm written at 10:50 this morning runs 11:05 … 5:05 PM, then four hours to 9:05 PM
    const r = defaultRhythm({ effectiveFromMs: at('10:50') });
    const zone = { timeZone: TZ, ...settled };
    expect(emptyDayGrid(r, zone, at('00:00')).map(hhmm)).toEqual([
      '11:05',
      '14:05',
      '17:05',
      '21:05',
    ]);
    const fills = gridFills(r, TZ, at('21:05'), at('04:00', 1));
    expect(fills).toEqual([at('00:33', 1)]);
    expect(fills.every(t => t % MIN === 0)).toBe(true);
  });

  it('a gap within a minute of the step is not filled', () => {
    const r = rule({ ...every3h });
    expect(gridFills(r, TZ, at('21:00'), at('00:00', 1) + 30_000)).toEqual([]);
    expect(gridFills(r, TZ, at('21:00'), at('00:00', 1) + 2 * MIN)).toHaveLength(1);
  });

  it('PAUSE and ONE keep the night the parent chose: nothing is filled', () => {
    const paused = rule({
      ...every3h,
      nightMode: 'PAUSE',
      nightFrom: '23:00',
      nightTo: '06:00',
    });
    const res = intervalOccurrences(paused, [], ctx('09:00', settled));
    expect(res.occurrences.map(o => hhmm(o.atMs))).toEqual([
      '06:00',
      '09:00',
      '12:00',
      '15:00',
      '18:00',
      '21:00',
    ]);
    expect(gridFills(paused, TZ, at('21:00', -1), at('06:00'))).toEqual([]);

    const once = rule({
      ...every3h,
      nightMode: 'ONE',
      nightFrom: '23:00',
      nightTo: '06:00',
      nightAt: '03:00',
    });
    const one = intervalOccurrences(once, [], ctx('09:00', settled));
    expect(one.occurrences.map(o => hhmm(o.atMs))).toEqual([
      '03:00',
      '06:00',
      '09:00',
      '12:00',
      '15:00',
      '18:00',
      '21:00',
    ]);
    expect(gridFills(once, TZ, at('21:00', -1), at('03:00'))).toEqual([]);
  });

  it('with an entry behind it the chain is continuous: no grid, no fill', () => {
    // three-hourly, last fed at 8:00 PM yesterday: 11:00 PM, then 2:00 AM — no 12:00 AM slot, and
    // no 3:00 AM one either
    const res = intervalOccurrences(
      every3h,
      [sess('bottle', '20:00', null, { dayOffset: -1 })],
      ctx('09:00', settled),
    );
    expect(res.occurrences.map(o => hhmm(o.atMs))).toEqual([
      '02:00',
      '05:00',
      '08:00',
      '11:00',
      '14:00',
      '17:00',
      '20:00',
      '23:00',
    ]);
    // and on setup's rhythm, fed at 8:50 PM: 12:50 AM, four hours on, never 12:30 or 4:00 AM
    const feeding = defaultRhythm({ effectiveFromMs: at('10:01', -7) });
    const fed = intervalOccurrences(
      feeding,
      [sess('bottle', '20:50', null, { dayOffset: -1 })],
      ctx('09:00', settled),
    );
    expect(fed.occurrences.slice(0, 3).map(o => hhmm(o.atMs))).toEqual(['00:50', '04:50', '08:50']);
    // an entry today takes the chain off the grid for good: fed at 7:30 PM, tonight is 10:30 PM and
    // tomorrow runs on from it — 1:30 AM, with no midnight fill and no 3:00 AM
    const evening = [sess('bottle', '19:30')];
    const tonight = intervalOccurrences(every3h, evening, ctx('19:35', settled));
    expect(tonight.occurrences.slice(-2).map(o => hhmm(o.atMs))).toEqual(['19:30', '22:30']);
    const tomorrow = intervalOccurrences(every3h, evening, dayAfter(ctx('19:35', settled)));
    expect(tomorrow.occurrences.slice(0, 2).map(o => hhmm(o.atMs))).toEqual(['01:30', '04:30']);
  });

  it('what a rhythm with nothing logged will lay out next, for a preview: the walk’s own days', () => {
    // the Rule sheet's "Next: …" for a draft, opened at 10:15 PM: it counted from the minute and
    // said 2:15 AM, 6:15 AM; the days the walk lays out say 12:30 AM, 4:00 AM, 8:00 AM
    const feeding = defaultRhythm();
    const zone = { timeZone: TZ };
    expect(emptySlotsAfter(feeding, zone, at('22:15'), 3)).toEqual([
      at('00:30', 1),
      at('04:00', 1),
      at('08:00', 1),
    ]);
    // the same slots the walk puts on the next day with nothing logged
    const walked = intervalOccurrences(feeding, [], dayAfter(ctx('22:15'))).occurrences;
    expect(walked.slice(0, 3).map(o => o.atMs)).toEqual(
      emptySlotsAfter(feeding, zone, at('22:15'), 3),
    );
    // and it runs across days as far as it is asked
    expect(emptySlotsAfter(feeding, zone, at('20:00'), 9).map(hhmm)).toEqual([
      '21:00',
      '00:30',
      '04:00',
      '08:00',
      '11:00',
      '14:00',
      '17:00',
      '21:00',
      '00:30',
    ]);
  });

  it('a rule’s first day opens on its own first slot: the day before it has no grid to wrap from', () => {
    // setup's rhythm on the household's first day, signed up at 10:47 AM: no 12:30 AM on that day
    const feeding = defaultRhythm({ effectiveFromMs: at('10:48') });
    const firstDay = { timeZone: TZ, trackingFromMs: at('10:47') };
    expect(emptyDayGrid(feeding, firstDay, at('00:00', -1))).toEqual([]);
    expect(emptyDaySlots(feeding, firstDay, at('00:00'))[0]).toBe(at('04:00'));
    // …and the day after it does
    expect(emptyDaySlots(feeding, firstDay, at('00:00', 1))[0]).toBe(at('00:30', 1));
  });
});

/**
 * AN ENTRY'S CHAIN READS THE SAME FROM EITHER SIDE OF MIDNIGHT (found beside the wrap, 2026-09-27).
 * A night step is not a day step: on setup's rhythm a 5:10 PM feed is due again at 9:10 PM and at
 * 1:10 AM after that, the night's four hours both times. The walk used to carry yesterday's entry
 * to the day in whole DAY steps, which landed it at 8:10 PM and opened the next day at 12:10 AM —
 * an hour off the chain the evening had shown, and off the reminder set from it.
 */
describe('a chain with a night in it, carried across midnight', () => {
  const feeding = defaultRhythm();
  const feed = sess('bottle', '17:10');
  const evening = ctx('17:30');

  it('tonight 9:10 PM, then 1:10 AM: Today, Tomorrow and the day after walk one chain', () => {
    expect(day(intervalOccurrences(feeding, [feed], evening).occurrences).slice(-1)).toEqual([
      '21:10 UPCOMING',
    ]);
    expect(day(intervalOccurrences(feeding, [feed], dayAfter(evening)).occurrences)).toEqual([
      '01:10 UPCOMING',
      '05:10 UPCOMING',
      '09:10 UPCOMING',
      '12:10 UPCOMING',
      '15:10 UPCOMING',
      '18:10 UPCOMING',
      '22:10 UPCOMING',
    ]);
    expect(
      day(intervalOccurrences(feeding, [feed], dayAfter(evening, 2)).occurrences).slice(0, 2),
    ).toEqual(['02:10 UPCOMING', '06:10 UPCOMING']);
  });

  it('every step the days show is the step `nextDue` takes, across both midnights', () => {
    // the slots after the feed; the morning before it is the empty-day grid the feed ended
    const times = [0, 1, 2]
      .flatMap(n => intervalOccurrences(feeding, [feed], dayAfter(evening, n)).occurrences)
      .map(o => o.atMs)
      .filter(t => t > feed.startMs);
    expect(times.length).toBeGreaterThan(12);
    const chain = [feed.startMs, ...times];
    expect(chain.every((t, i) => i === 0 || t === nextDue(chain[i - 1] ?? 0, feeding, TZ))).toBe(
      true,
    );
  });

  it('morning after: the 1:10 AM slot is the one due, not a 12:10 AM one nobody was shown', () => {
    const morning = { ...ctx('01:20'), nowMs: at('01:20', 1), dayStartMs: at('00:00', 1) };
    const woke = intervalOccurrences(feeding, [feed], morning);
    expect(woke.next === null ? null : hhmm(woke.next.atMs)).toBe('01:10');
  });

  it('a plain three-hourly chain still takes the arithmetic shortcut, and lands on the same grid', () => {
    const plain = rule({
      id: 'r-plain',
      activity: 'bottle',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
    });
    expect(
      day(intervalOccurrences(plain, [feed], dayAfter(evening)).occurrences).slice(0, 2),
    ).toEqual(['02:10 UPCOMING', '05:10 UPCOMING']);
  });
});
