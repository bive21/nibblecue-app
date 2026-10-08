/**
 * WHAT ONE RECOMPUTE OF THE ROUTINE ASKS `Intl` (2026-09-28). The owner, testing on Android, found
 * the app slow after every save, and the trace put most of it here: Today's schedule recompute
 * made about 2,000 `formatToParts` calls for a household with one entry and 7,500 for one with a
 * fortnight of them, each a trip across JNI into ICU on the phone. `today/day.ts` now reads a
 * zone's offset once per quarter hour and remembers it, so a recompute reads the quarter hours it
 * has not seen and nothing else — and the next save, which moves the clock a minute, has almost
 * none left to read. A tripwire on the COUNT, which is what a phone pays for and what does not
 * vary with the machine running the suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { localDayBounds, zonedToUtc } from '../today/day';
import { adherence } from './adherence';
import { scheduleAhead } from './ahead';
import { dayPlus } from './time';
import { listedToday, nextEvent, nextInterval, openToday, scheduleDay } from './today';
import { ruleFrom, type EngineContext, type Rule, type RuleInput, type Session } from './types';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const CHILD = 'c1';

/** A rule for the baby — or, for pumping, for the parent. */
const rule = (input: RuleInput): Rule =>
  ruleFrom({ childId: input.activity === 'pump' ? null : CHILD, ...input });

/** The routine onboarding writes for one baby: four rhythms, three fixed times, a bath, tummy time. */
const RULES: readonly Rule[] = [
  rule({
    id: 'feed',
    activity: 'bottle',
    ruleType: 'INTERVAL',
    everyMinutes: 180,
    nightMode: 'LONGER',
    nightFrom: '19:30',
    nightTo: '07:00',
    nightEveryMinutes: 240,
  }),
  rule({ id: 'diaper', activity: 'diaper', ruleType: 'INTERVAL', everyMinutes: 180 }),
  rule({ id: 'pump', activity: 'pump', ruleType: 'INTERVAL', everyMinutes: 240 }),
  rule({ id: 'nap', activity: 'sleep', ruleType: 'INTERVAL', everyMinutes: 150 }),
  rule({ id: 'bed', activity: 'sleep', ruleType: 'FIXED', atLocalTime: '19:30' }),
  rule({ id: 'vitd', activity: 'med', ruleType: 'FIXED', atLocalTime: '09:00' }),
  rule({ id: 'cream', activity: 'med', ruleType: 'FIXED', atLocalTime: '21:00' }),
  rule({ id: 'bath', activity: 'bath', ruleType: 'CADENCE', everyDays: 2, atLocalTime: '18:30' }),
  rule({ id: 't1', activity: 'tummy', ruleType: 'FIXED', atLocalTime: '10:00', matchScope: 'DAY' }),
  rule({ id: 't2', activity: 'tummy', ruleType: 'FIXED', atLocalTime: '13:00', matchScope: 'DAY' }),
  rule({ id: 't3', activity: 'tummy', ruleType: 'FIXED', atLocalTime: '16:00', matchScope: 'DAY' }),
];

/**
 * What `useScheduleDay` computes on every save: today, tomorrow, the cards, the days ahead.
 * `beganMs` is `households.created_at`, which does not move from one save to the next.
 */
function recompute(
  timeZone: string,
  sessions: readonly Session[],
  nowMs: number,
  beganMs: number,
): void {
  const ctx: EngineContext = {
    nowMs,
    timeZone,
    dayStartMs: localDayBounds(timeZone, nowMs).startMs,
    skipped: new Set(),
    trackingFromMs: beganMs,
  };
  const on = { enabled: () => true };
  const day = scheduleDay(RULES, sessions, ctx, on);
  // the same tomorrow `useScheduleDay` builds once and passes into `scheduleAhead`
  const tomorrow = scheduleDay(
    RULES,
    sessions,
    { ...ctx, dayStartMs: dayPlus(timeZone, ctx.dayStartMs, 1) },
    on,
  );
  for (const rule of RULES) nextInterval(rule, sessions, ctx);
  scheduleAhead(RULES, sessions, ctx, { ...on, knownDays: new Map([[1, tomorrow]]) });
  openToday(day);
  listedToday(day);
  nextEvent(day);
  adherence(day.occurrences);
}

/** A fortnight of a household's log, every feed, change, pump and sleep of it. */
function fortnight(timeZone: string, nowMs: number): Session[] {
  const out: Session[] = [];
  const today = localDayBounds(timeZone, nowMs).startMs;
  let n = 0;
  const add = (type: Session['type'], startMs: number, minutes = 0): void => {
    if (startMs > nowMs) return;
    n += 1;
    const endMs = minutes === 0 ? null : Math.min(startMs + minutes * MIN, nowMs);
    out.push({ id: `a${n}`, type, childId: type === 'pump' ? null : CHILD, startMs, endMs });
  };
  for (let d = 14; d >= 0; d--) {
    const day = dayPlus(timeZone, today, -d);
    const at = (hours: number): number => day + Math.round(hours * 60 + ((d * 7) % 23) - 11) * MIN;
    for (const h of [2.5, 6.5, 9.5, 12.5, 15.5, 18.5, 22.5]) add('bottle', at(h));
    for (const h of [2.6, 6.6, 9.6, 12.6, 15.6, 18.6, 22.6]) add('diaper', at(h));
    for (const h of [7, 11, 15, 19]) add('pump', at(h), 20);
    for (const h of [8.5, 11.5, 14.5, 17]) add('sleep', at(h), 60);
    add('sleep', at(19.75), 645);
    add('med', at(9.1));
    add('med', at(21.2));
    if (d % 2 === 0) add('bath', at(18.6));
    for (const h of [10.1, 13.1, 16.1]) add('tummy', at(h), 10);
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

let formatToParts: MockInstance;
beforeEach(() => {
  formatToParts = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts');
});
afterEach(() => {
  formatToParts.mockRestore();
});

/** How many times `Intl` was asked while `fn` ran. */
function asked(fn: () => void): number {
  formatToParts.mockClear();
  fn();
  return formatToParts.mock.calls.length;
}

// each case its own zone, so none of them starts with the quarter hours another has read
describe('one recompute of the routine, in Intl calls', () => {
  it('a household with one entry: each quarter hour touched is read once, and then never again', () => {
    const zone = 'America/Chicago';
    const nowMs = zonedToUtc(zone, 2026, 9, 28, 15, 10);
    const began = nowMs - 30 * DAY;
    const log: Session[] = [
      { id: 'x1', type: 'bottle', childId: CHILD, startMs: nowMs - 2 * MIN, endMs: null },
    ];
    // was 2,081 on every pass; two readings for each quarter hour it touches is about 150
    expect(asked(() => recompute(zone, log, nowMs, began))).toBeLessThan(300);
    expect(asked(() => recompute(zone, log, nowMs, began))).toBe(0);
  });

  it('a fortnight of entries: nothing once the log has been read', () => {
    const zone = 'Europe/Berlin';
    const nowMs = zonedToUtc(zone, 2026, 9, 28, 15, 10);
    const began = nowMs - 30 * DAY;
    const log = fortnight(zone, nowMs);
    expect(log.length).toBeGreaterThan(400);
    recompute(zone, log, nowMs, began);
    // was 7,502 on every pass
    expect(asked(() => recompute(zone, log, nowMs, began))).toBe(0);
  });

  it('the next save, into a quarter hour not yet read, reads that quarter hour and little else', () => {
    const zone = 'Australia/Adelaide'; // +9:30: its local quarter hours are UTC's too
    const nowMs = zonedToUtc(zone, 2026, 9, 28, 15, 10);
    const began = nowMs - 30 * DAY;
    const log = fortnight(zone, nowMs);
    recompute(zone, log, nowMs, began);
    const laterMs = nowMs + 20 * MIN;
    const saved: Session = {
      id: 'new',
      type: 'diaper',
      childId: CHILD,
      startMs: laterMs,
      endMs: null,
    };
    // measured at 2: the quarter hour the clock moved into, read at its first second and its last
    expect(asked(() => recompute(zone, [...log, saved], laterMs, began))).toBeLessThanOrEqual(4);
  });
});
