/**
 * THE SCHEDULE'S FINISHED DAYS (`history.ts`; the owner, 2026-09-30: *"yesterday I was at 100%
 * completion, but the day before 80%, etc."*). One household in America/New_York, "now" 2 PM on
 * Wednesday 2026-06-10 unless a case says otherwise; the history is the days before it.
 *
 * What is held: each day counts what the engine counted for that day and nothing else — done with
 * late, missed, a skip in neither column, a GAP's slots in neither column, a slot still open in no
 * column — a rule written later has no slot before it, the days before the household are not
 * listed, a day is a local day on the nights the clocks change, an entry logged late counts on its
 * own day, one child's view counts that child's routine, and the bound on the clock each day is
 * judged by changes nothing a row shows.
 */
import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../today/day';
import { at, rule, sess, TZ } from './fixtures';
import {
  historyDay,
  historyDaysAvailable,
  historyTotals,
  scheduleHistory,
  type HistoryContext,
  type HistoryDay,
} from './history';
import { dayPlus, dayStartOf } from './time';
import { scheduleDay } from './today';
import { occurrence, skipKey, type Rule, type Session } from './types';

const NOW = at('14:00');
const ctxAt = (nowMs: number, extra: Partial<HistoryContext> = {}): HistoryContext => ({
  nowMs,
  timeZone: TZ,
  ...extra,
});

const bottleAt = (id: string, atLocalTime: string, extra: Partial<Rule> = {}): Rule =>
  rule({ id, activity: 'bottle', ruleType: 'FIXED', atLocalTime, ...extra });

/** A day's row, as the page reads it. */
const row = (d: HistoryDay | undefined) =>
  d === undefined
    ? undefined
    : {
        dayKey: d.dayKey,
        done: d.done,
        late: d.late,
        missed: d.missed,
        skipped: d.skipped,
        gaps: d.gaps,
        pct: d.pct,
        activities: d.activities,
      };

describe('a finished day is what the engine counted for it', () => {
  it('done counts late, missed is missed, a skip is in neither column, and the percentage is done over both', () => {
    const rules = [
      bottleAt('f7', '07:00'),
      bottleAt('f10', '10:00'),
      bottleAt('f13', '13:00'),
      bottleAt('f16', '16:00'),
    ];
    const sessions = [
      sess('bottle', '07:05', null, { id: 'on-time', dayOffset: -1 }),
      // fifty minutes after its slot: inside the late window, so it was done, late
      sess('bottle', '10:50', null, { id: 'late', dayOffset: -1 }),
    ];
    const [yesterday] = scheduleHistory(
      rules,
      sessions,
      ctxAt(NOW, { skipped: new Set([skipKey('f16', at('16:00', -1))]) }),
      1,
    );
    expect(yesterday).toMatchObject({
      dayKey: '2026-06-09',
      dayStartMs: zonedToUtc(TZ, 2026, 6, 9),
      done: 2,
      late: 1,
      missed: 1,
      skipped: 1,
      gaps: 0,
      open: 0,
      scheduled: 4,
      // two done of the three that were done or missed: the skip is a decision, in neither column
      pct: 67,
    });
    expect(yesterday?.activities).toEqual([{ key: 'feeding', done: 2, missed: 1, skipped: 1 }]);
  });

  it('a GAP’s slots are in neither column, as the progress card has them, so the number agrees with the words', () => {
    const pump = rule({ id: 'p', activity: 'pump', ruleType: 'INTERVAL', everyMinutes: 120 });
    const d = historyDay(
      [
        occurrence(pump, at('08:00', -1), 'DONE', { matchedId: 'a' }),
        occurrence(pump, at('10:00', -1), 'MISSED'),
        occurrence(pump, at('12:00', -1), 'GAP', { expectedCount: 3 }),
        occurrence(pump, at('18:00', -1), 'DONE', { matchedId: 'b' }),
      ],
      at('00:00', -1),
      at('00:00', 0),
      '2026-06-09',
    );
    // `passedPct` would be 2 of 6 (33); the row says "2 done · 1 missed", so its number is 67
    expect(d).toMatchObject({ done: 2, missed: 1, gaps: 3, scheduled: 6, open: 0, pct: 67 });
    expect(d.activities).toEqual([{ key: 'pump', done: 2, missed: 1, skipped: 0 }]);
  });

  it('a day of skips has no percentage, and a number never says the opposite of the words beside it', () => {
    const r = bottleAt('f', '09:00');
    const start = at('00:00', -1);
    const end = at('00:00', 0);
    const skips = historyDay([occurrence(r, at('09:00', -1), 'SKIPPED')], start, end, 'k');
    expect(skips).toMatchObject({ done: 0, missed: 0, skipped: 1, pct: null });
    // 199 of 200 rounds to 100, and 1 of 201 to 0: neither is what the day was
    const many = (done: number, missed: number) =>
      historyDay(
        [
          ...Array.from({ length: done }, (_, i) =>
            occurrence(r, start + i * 60_000, 'DONE', { matchedId: `d${i}` }),
          ),
          ...Array.from({ length: missed }, (_, i) =>
            occurrence(r, start + (done + i) * 60_000, 'MISSED'),
          ),
        ],
        start,
        end,
        'k',
      ).pct;
    expect(many(199, 1)).toBe(99);
    expect(many(1, 200)).toBe(1);
    expect(many(3, 0)).toBe(100);
    expect(many(0, 3)).toBe(0);
  });

  it('breaks the day down by kind — both kinds of feed as feeding — in the registry’s order', () => {
    const rules = [
      rule({ id: 'diaper', activity: 'diaper', ruleType: 'FIXED', atLocalTime: '08:00' }),
      rule({ id: 'pump', activity: 'pump', ruleType: 'FIXED', atLocalTime: '09:00' }),
      bottleAt('bottle', '10:00'),
      rule({ id: 'breast', activity: 'breastfeed', ruleType: 'FIXED', atLocalTime: '12:00' }),
      rule({ id: 'bath', activity: 'bath', ruleType: 'FIXED', atLocalTime: '18:00' }),
    ];
    const sessions = [
      sess('diaper', '08:00', null, { dayOffset: -1 }),
      sess('breastfeed', '10:02', null, { dayOffset: -1 }),
      sess('bottle', '12:04', null, { dayOffset: -1 }),
    ];
    const [d] = scheduleHistory(
      rules,
      sessions,
      ctxAt(NOW, { skipped: new Set([skipKey('bath', at('18:00', -1))]) }),
      1,
    );
    expect(d?.activities).toEqual([
      { key: 'feeding', done: 2, missed: 0, skipped: 0 },
      { key: 'pump', done: 0, missed: 1, skipped: 0 },
      { key: 'diaper', done: 1, missed: 0, skipped: 0 },
      { key: 'bath', done: 0, missed: 0, skipped: 1 },
    ]);
  });

  it('a rule on a module that is off is not counted, as on the card', () => {
    const rules = [
      bottleAt('f', '09:00'),
      rule({ id: 'p', activity: 'pump', ruleType: 'FIXED', atLocalTime: '10:00' }),
    ];
    const [d] = scheduleHistory(rules, [], ctxAt(NOW), 1, { enabled: a => a !== 'pump' });
    expect(d?.activities.map(a => a.key)).toEqual(['feeding']);
    expect(d?.missed).toBe(1);
  });
});

describe('the routine as it is now, from the day each rule began', () => {
  it('a rule written two days ago has no slot on the days before it, and none before the hour it was written', () => {
    const writtenAt = at('10:00', -2);
    const rules = [
      bottleAt('old', '09:00', { effectiveFromMs: at('09:00', -30) }),
      // the same time, written two days ago at 10:00: its first 9:00 is yesterday's
      rule({
        id: 'new',
        activity: 'pump',
        ruleType: 'FIXED',
        atLocalTime: '09:00',
        effectiveFromMs: writtenAt,
      }),
    ];
    const days = scheduleHistory(rules, [], ctxAt(NOW, { trackingFromMs: at('09:00', -30) }), 3);
    expect(days.map(d => d.dayKey)).toEqual(['2026-06-09', '2026-06-08', '2026-06-07']);
    expect(days.map(d => d.activities.map(a => a.key))).toEqual([
      ['feeding', 'pump'],
      ['feeding'],
      ['feeding'],
    ]);
  });

  it('an interval written mid-afternoon lays out that day from fifteen minutes in, and nothing before', () => {
    const writtenAt = at('16:00', -2);
    const pump = rule({
      id: 'pump',
      activity: 'pump',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
      effectiveFromMs: writtenAt,
    });
    const days = scheduleHistory([pump], [], ctxAt(NOW, { trackingFromMs: at('09:00', -30) }), 3);
    // the day before it: nothing at all
    expect(days[2]).toMatchObject({ dayKey: '2026-06-07', scheduled: 0, pct: null });
    // the day it was written: 4:15, 7:15, 10:15 PM, every one after the rule, every one missed
    const direct = scheduleDay([pump], [], {
      nowMs: NOW,
      timeZone: TZ,
      dayStartMs: at('00:00', -2),
      trackingFromMs: at('09:00', -30),
    }).occurrences;
    expect(direct.every(o => o.atMs >= writtenAt)).toBe(true);
    expect(direct.map(o => o.atMs)).toEqual([at('16:15', -2), at('19:15', -2), at('22:15', -2)]);
    expect(days[1]).toMatchObject({ dayKey: '2026-06-08', missed: 3, done: 0, pct: 0 });
    // and yesterday, a whole day of it
    expect(days[0]?.missed).toBeGreaterThan(3);
  });
});

describe('the days before the household are not listed', () => {
  const SIGNUP = at('10:47', -3);
  const feeding = rule({
    id: 'feed',
    activity: 'bottle',
    ruleType: 'INTERVAL',
    everyMinutes: 180,
    nightMode: 'PAUSE',
    nightFrom: '23:00',
    nightTo: '06:00',
    // setup's rhythms, a minute after the household
    effectiveFromMs: SIGNUP + 60_000,
  });

  it('asks for a week, gets the three days since, and the first day’s morning is in no number', () => {
    const days = scheduleHistory([feeding], [], ctxAt(NOW, { trackingFromMs: SIGNUP }), 7);
    expect(days.map(d => d.dayKey)).toEqual(['2026-06-09', '2026-06-08', '2026-06-07']);
    // 6:00 and 9:00 were before the household: skipped by the engine, counted by nobody
    expect(days[2]).toMatchObject({ beforeStart: 2, skipped: 0, missed: 4, scheduled: 4 });
  });

  it('with no household start known, lists from the day of the earliest rule', () => {
    const days = scheduleHistory([feeding], [], ctxAt(NOW), 7);
    expect(days.map(d => d.dayKey)).toEqual(['2026-06-09', '2026-06-08', '2026-06-07']);
  });

  it('says how many finished days there are to list, whatever the window asked for', () => {
    expect(historyDaysAvailable([feeding], ctxAt(NOW, { trackingFromMs: SIGNUP }))).toBe(3);
    expect(historyDaysAvailable([feeding], ctxAt(NOW))).toBe(3);
    expect(historyDaysAvailable([feeding], ctxAt(NOW, { trackingFromMs: at('08:00') }))).toBe(0);
    expect(historyDaysAvailable([], ctxAt(NOW))).toBe(0);
    // across a clock change the count is still in days: from Oct 30 to Nov 3 is four of them
    const began = zonedToUtc(TZ, 2026, 10, 30, 9, 0);
    const now = zonedToUtc(TZ, 2026, 11, 3, 14, 0);
    expect(historyDaysAvailable([feeding], ctxAt(now, { trackingFromMs: began }))).toBe(4);
  });

  it('lists nothing with nothing to go on, or for no days', () => {
    expect(scheduleHistory([], [], ctxAt(NOW), 7)).toEqual([]);
    expect(scheduleHistory([feeding], [], ctxAt(NOW, { trackingFromMs: SIGNUP }), 0)).toEqual([]);
    // a household that began today has no finished day yet
    expect(scheduleHistory([feeding], [], ctxAt(NOW, { trackingFromMs: at('08:00') }), 7)).toEqual(
      [],
    );
  });
});

describe('a day is a local day on the nights the clocks change', () => {
  const seven = bottleAt('f7', '07:00', { effectiveFromMs: 0 });
  const fedAtSeven = (y: number, m: number, days: readonly number[]): Session[] =>
    days.map((d, i) => ({
      id: `s${y}${m}${d}${i}`,
      type: 'bottle',
      childId: null,
      startMs: zonedToUtc(TZ, y, m, d, 7, 0),
      endMs: null,
    }));

  it('spring forward: the 23-hour Sunday is one day — minus 24 hours would lose it and count Saturday twice', () => {
    const now = zonedToUtc(TZ, 2026, 3, 10, 14, 0);
    const days = scheduleHistory([seven], fedAtSeven(2026, 3, [7, 8, 9]), ctxAt(now), 3);
    expect(days.map(d => d.dayKey)).toEqual(['2026-03-09', '2026-03-08', '2026-03-07']);
    const sunday = days[1]!;
    expect(sunday.dayStartMs).toBe(zonedToUtc(TZ, 2026, 3, 8));
    expect(dayPlus(TZ, sunday.dayStartMs, 1) - sunday.dayStartMs).toBe(23 * 3_600_000);
    for (const d of days) expect(d).toMatchObject({ done: 1, missed: 0, pct: 100 });
    // the stepping this replaces: from Monday's midnight, 24 hours back is 11 PM on Saturday
    const monday = zonedToUtc(TZ, 2026, 3, 9);
    expect(dayStartOf(TZ, monday - 24 * 3_600_000)).toBe(zonedToUtc(TZ, 2026, 3, 7));
  });

  it('fall back: the 25-hour Sunday is one day from its own midnight — minus 24 hours would start it at 1 AM', () => {
    const now = zonedToUtc(TZ, 2026, 11, 3, 14, 0);
    const days = scheduleHistory(
      [seven],
      fedAtSeven(2026, 10, [31]).concat(fedAtSeven(2026, 11, [1, 2])),
      ctxAt(now),
      3,
    );
    expect(days.map(d => d.dayKey)).toEqual(['2026-11-02', '2026-11-01', '2026-10-31']);
    const sunday = days[1]!;
    expect(dayPlus(TZ, sunday.dayStartMs, 1) - sunday.dayStartMs).toBe(25 * 3_600_000);
    for (const d of days) expect(d).toMatchObject({ done: 1, missed: 0, pct: 100 });
    // the stepping this replaces: from Monday's midnight, 24 hours back is 1 AM on Sunday
    const monday = zonedToUtc(TZ, 2026, 11, 2);
    expect(monday - 24 * 3_600_000).toBe(zonedToUtc(TZ, 2026, 11, 1) + 3_600_000);
    expect(sunday.dayStartMs).toBe(zonedToUtc(TZ, 2026, 11, 1));
  });

  it('an interval across both nights lays every slot on the day it falls in, once', () => {
    const pump = rule({ id: 'p', activity: 'pump', ruleType: 'INTERVAL', everyMinutes: 180 });
    for (const [y, m, d] of [
      [2026, 3, 10],
      [2026, 11, 3],
    ] as const) {
      const now = zonedToUtc(TZ, y, m, d, 14, 0);
      const days = scheduleHistory([pump], [], ctxAt(now, { trackingFromMs: 0 }), 3);
      for (const h of days) {
        const direct = scheduleDay([pump], [], {
          nowMs: now,
          timeZone: TZ,
          dayStartMs: h.dayStartMs,
          trackingFromMs: 0,
        }).occurrences;
        const end = dayPlus(TZ, h.dayStartMs, 1);
        expect(direct.every(o => o.atMs >= h.dayStartMs && o.atMs < end)).toBe(true);
        expect(h.missed).toBe(direct.length);
      }
    }
  });
});

describe('recomputed, never frozen', () => {
  const ten = bottleAt('f10', '10:00');

  it('an entry logged late — today, about the day before yesterday — counts on its own day', () => {
    const before = scheduleHistory([ten], [], ctxAt(NOW), 2);
    expect(before.map(d => [d.done, d.missed])).toEqual([
      [0, 1],
      [0, 1],
    ]);
    const late = sess('bottle', '10:05', null, { id: 'late-logged', dayOffset: -2 });
    const after = scheduleHistory([ten], [late], ctxAt(NOW), 2);
    expect(after.map(d => [d.done, d.missed, d.pct])).toEqual([
      [0, 1, 0],
      [1, 0, 100],
    ]);
  });

  it('a feed at 12:20 AM answers the 11:30 PM slot before it, on the day of the slot', () => {
    const late = bottleAt('f2330', '23:30');
    const days = scheduleHistory(
      [late],
      [sess('bottle', '00:20', null, { id: 'after-midnight', dayOffset: -1 })],
      ctxAt(NOW),
      2,
    );
    expect(days[1]).toMatchObject({ dayKey: '2026-06-08', done: 1, late: 1, missed: 0 });
    expect(days[0]).toMatchObject({ dayKey: '2026-06-09', done: 0, missed: 1 });
  });

  it('just after midnight, yesterday’s last slot is still open — in no column — until nothing can answer it', () => {
    const late = bottleAt('f2330', '23:30');
    const early = scheduleHistory([late], [], ctxAt(at('00:10')), 1);
    expect(early[0]).toMatchObject({ done: 0, missed: 0, open: 1, pct: null, scheduled: 1 });
    expect(early[0]?.activities).toEqual([]);
    const settled = scheduleHistory([late], [], ctxAt(at('01:10')), 1);
    expect(settled[0]).toMatchObject({ done: 0, missed: 1, open: 0, pct: 0 });
  });
});

describe('both babies, or one', () => {
  const A = 'kid-a';
  const B = 'kid-b';
  const all = [
    bottleAt('fa', '09:00', { childId: A }),
    bottleAt('fb', '09:00', { childId: B }),
    // the household's own: in every view
    rule({ id: 'p', activity: 'pump', ruleType: 'FIXED', atLocalTime: '12:00' }),
  ];
  const sessions = [
    sess('bottle', '09:05', null, { id: 'a-fed', childId: A, dayOffset: -1 }),
    sess('pump', '12:00', null, { id: 'pumped', dayOffset: -1 }),
  ];
  /** The app's scope (`scopeRules`): a child's rules and the household's; Both is every rule. */
  const scope = (childId: string | null): Rule[] =>
    childId === null ? all : all.filter(r => r.childId === null || r.childId === childId);

  it('one child counts that child’s routine and the household’s; Both counts every rule', () => {
    const one = (childId: string | null) =>
      scheduleHistory(scope(childId), sessions, ctxAt(NOW), 1)[0];
    expect(one(A)).toMatchObject({ done: 2, missed: 0, pct: 100 });
    // A's feed answers nothing of B's
    expect(one(B)).toMatchObject({ done: 1, missed: 1, pct: 50 });
    expect(one(null)).toMatchObject({ done: 2, missed: 1, pct: 67 });
    expect(one(null)?.activities).toEqual([
      { key: 'feeding', done: 1, missed: 1, skipped: 0 },
      { key: 'pump', done: 1, missed: 0, skipped: 0 },
    ]);
  });
});

describe('the window’s line', () => {
  it('adds up the days it lists', () => {
    const days = scheduleHistory(
      [bottleAt('f', '09:00')],
      [sess('bottle', '09:00', null, { dayOffset: -2 })],
      ctxAt(NOW, { skipped: new Set([skipKey('f', at('09:00', -3))]) }),
      3,
    );
    expect(historyTotals(days)).toEqual({ days: 3, done: 1, missed: 1, skipped: 1 });
  });
});

/**
 * EACH DAY IS JUDGED BY A CLOCK THAT STOPS A DAY AFTER IT, AND HANDED A FEW DAYS OF SESSIONS, AND
 * NOTHING A ROW SHOWS MOVES. A household's six weeks, run both ways: the history, and each day
 * straight through the engine with the real clock and the whole read.
 */
describe('what keeps a long history cheap changes nothing a row shows', () => {
  const CHILD = 'c1';
  const r = (input: Parameters<typeof rule>[0]): Rule =>
    rule({ childId: input.activity === 'pump' ? null : CHILD, effectiveFromMs: 0, ...input });
  /** Every kind of rule the setup writes but a bath rhythm, which reads its own day (below). */
  const RULES: Rule[] = [
    r({
      id: 'feed',
      activity: 'bottle',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
      nightMode: 'LONGER',
      nightFrom: '19:30',
      nightTo: '07:00',
      nightEveryMinutes: 240,
    }),
    r({ id: 'diaper', activity: 'diaper', ruleType: 'INTERVAL', everyMinutes: 180 }),
    r({
      id: 'pump',
      activity: 'pump',
      ruleType: 'INTERVAL',
      everyMinutes: 240,
      nightMode: 'PAUSE',
      nightFrom: '23:00',
      nightTo: '06:00',
    }),
    r({ id: 'nap', activity: 'sleep', ruleType: 'INTERVAL', everyMinutes: 150 }),
    r({ id: 'bed', activity: 'sleep', ruleType: 'FIXED', atLocalTime: '19:30', name: 'Bedtime' }),
    r({ id: 'vitd', activity: 'med', ruleType: 'FIXED', atLocalTime: '09:00', careItemId: 'vit' }),
    r({ id: 't1', activity: 'tummy', ruleType: 'FIXED', atLocalTime: '10:00', matchScope: 'DAY' }),
    r({ id: 't2', activity: 'tummy', ruleType: 'FIXED', atLocalTime: '13:00', matchScope: 'DAY' }),
    r({
      id: 'meal',
      activity: 'solids',
      ruleType: 'FIXED',
      atLocalTime: '11:30',
      repeat: 'WEEKDAYS',
    }),
  ];
  const BATH = r({
    id: 'bath',
    activity: 'bath',
    ruleType: 'CADENCE',
    everyDays: 2,
    atLocalTime: '18:30',
  });
  const AFTER_WAKE = r({
    id: 'wake',
    activity: 'diaper',
    ruleType: 'RELATIVE',
    relativeTo: 'WAKE',
    offsetMinutes: 15,
  });

  /** Six weeks, irregular on purpose: thin days, late answers, early ones, gaps in the baths. */
  function sixWeeks(): Session[] {
    const out: Session[] = [];
    let n = 0;
    const add = (type: Session['type'], startMs: number, extra: Partial<Session> = {}) => {
      if (startMs > NOW) return;
      n += 1;
      out.push({
        id: `h${n}`,
        type,
        childId: type === 'pump' ? null : CHILD,
        startMs,
        endMs: null,
        ...extra,
      });
    };
    for (let d = 40; d >= 0; d--) {
      const jitter = ((d * 37) % 50) - 20;
      const t = (hhmm: string) => at(hhmm, -d) + jitter * 60_000;
      const thin = d % 4 === 1;
      const feeds = thin
        ? ['07:10', '13:20']
        : ['07:10', '10:05', '13:20', '16:40', '19:05', '23:30'];
      for (const h of feeds) add(d % 2 === 0 ? 'bottle' : 'breastfeed', t(h));
      for (const h of ['07:30', '11:00', '15:10', '20:00']) add('diaper', t(h));
      if (!thin) for (const h of ['06:30', '10:40', '14:45', '18:50']) add('pump', t(h));
      for (const h of ['09:15', '12:10', '15:30'])
        add('sleep', t(h), { sleepKind: 'NAP', endMs: t(h) + 45 * 60_000 });
      add('sleep', t('19:40'), { sleepKind: 'NIGHT', endMs: at('06:50', -d + 1) });
      if (d % 3 !== 0) add('med', t('08:50'), { careItemId: 'vit' });
      if (d % 2 === 0) add('tummy', t('10:15'));
      add('tummy', t('17:30'));
      if (d % 5 !== 2) add('solids', t('12:15'));
      if (d % 5 === 0 || d % 7 === 3) add('bath', t('18:40'));
    }
    // a pump timer running now
    out.push({
      id: 'running',
      type: 'pump',
      childId: null,
      startMs: NOW - 20 * 60_000,
      endMs: null,
      running: true,
    });
    return out;
  }

  const began = at('09:00', -60);
  const DAY_MS = 86_400_000;
  const within = (sessions: readonly Session[], fromMs: number, toMs: number) =>
    sessions.filter(s => s.startMs >= fromMs && s.startMs <= toMs);

  it('the bounded clock: every day of a fortnight has the done, late, missed, skipped, percentage and kinds the real one gives', () => {
    const sessions = sixWeeks();
    const skipped = new Set([skipKey('vitd', at('09:00', -4)), skipKey('t2', at('13:00', -6))]);
    const ctx = ctxAt(NOW, { skipped, trackingFromMs: began });
    const history = scheduleHistory(RULES, sessions, ctx, 14);
    expect(history).toHaveLength(14);
    for (const h of history) {
      const end = dayPlus(TZ, h.dayStartMs, 1);
      const direct = scheduleDay(RULES, sessions, { ...ctx, dayStartMs: h.dayStartMs });
      const want = historyDay(direct.occurrences, h.dayStartMs, end, h.dayKey);
      expect(row(h), h.dayKey).toEqual(row(want));
    }
    // and the fortnight is neither empty nor clean
    const totals = historyTotals(history);
    expect(totals.done).toBeGreaterThan(100);
    expect(totals.missed).toBeGreaterThan(10);
    expect(totals.skipped).toBe(2);
    expect(history.some(h => h.late > 0)).toBe(true);
  });

  it('…and with the day’s own read, two days or a month of sessions before it', () => {
    const sessions = sixWeeks();
    const ctx = ctxAt(NOW, { trackingFromMs: began });
    for (const lookbackMs of [2 * DAY_MS, 31 * DAY_MS]) {
      const history = scheduleHistory(RULES, sessions, ctx, 14, { lookbackMs });
      for (const h of history) {
        const end = dayPlus(TZ, h.dayStartMs, 1);
        const read = within(sessions, h.dayStartMs - lookbackMs, NOW);
        const direct = scheduleDay(RULES, read, { ...ctx, dayStartMs: h.dayStartMs });
        const want = historyDay(direct.occurrences, h.dayStartMs, end, h.dayKey);
        expect(row(h), `${h.dayKey} ${lookbackMs}`).toEqual(row(want));
      }
    }
  });

  it('the few days of sessions a day is handed are, to the engine, its whole read: a bath rhythm and a slot after waking too', () => {
    const sessions = sixWeeks();
    const rules = [...RULES, BATH, AFTER_WAKE];
    const skipped = new Set([skipKey('bath', at('18:30', -9))]);
    const ctx = ctxAt(NOW, { skipped, trackingFromMs: began });
    const lookbackMs = 31 * DAY_MS;
    const history = scheduleHistory(rules, sessions, ctx, 14, { lookbackMs });
    for (const h of history) {
      const end = dayPlus(TZ, h.dayStartMs, 1);
      // the same bounded clock, a day after the day (every rule here settles within one)
      const judge = Math.min(NOW, end + DAY_MS);
      const read = within(sessions, h.dayStartMs - lookbackMs, judge);
      const direct = scheduleDay(rules, read, { ...ctx, nowMs: judge, dayStartMs: h.dayStartMs });
      expect(h, h.dayKey).toEqual(historyDay(direct.occurrences, h.dayStartMs, end, h.dayKey));
    }
    expect(history.some(h => h.activities.some(a => a.key === 'bath' && a.done > 0))).toBe(true);
  });

  it('counted a week at a time, as the page counts a long window, every day is the day counted in one go', () => {
    const sessions = sixWeeks();
    const ctx = ctxAt(NOW, { trackingFromMs: began });
    const opts = { lookbackMs: 31 * DAY_MS };
    const rules = [...RULES, BATH];
    const whole = scheduleHistory(rules, sessions, ctx, 30, opts);
    const stepped = [1, 8, 15, 22, 29].flatMap(fromDay =>
      scheduleHistory(rules, sessions, ctx, fromDay === 29 ? 2 : 7, { ...opts, fromDay }),
    );
    expect(stepped).toEqual(whole);
    // a step past the household's first day is empty, not a day before it
    const lastListed = historyDaysAvailable(rules, ctx);
    expect(scheduleHistory(rules, sessions, ctx, 7, { ...opts, fromDay: lastListed + 1 })).toEqual(
      [],
    );
    expect(scheduleHistory(rules, sessions, ctx, 7, { ...opts, fromDay: lastListed })).toHaveLength(
      1,
    );
  });

  it('a year of history costs each day the day after it, not every day since', () => {
    const sessions = sixWeeks();
    const started = performance.now();
    const days = scheduleHistory(
      [...RULES, BATH],
      sessions,
      ctxAt(NOW, { trackingFromMs: at('09:00', -400) }),
      365,
      { lookbackMs: 31 * DAY_MS },
    );
    const ms = performance.now() - started;
    expect(days).toHaveLength(365);
    // well under a second here; walking every day on to today, a few months took seconds
    expect(ms).toBeLessThan(8_000);
  });
});
