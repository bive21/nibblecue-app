/**
 * THE NIGHT'S TWO EDGES: the day's rhythm resumes at wake-up (`nextDue`; the owner, 2026-09-29,
 * diapers every 2 h by day and every 8 h by night, the day from 8:30 AM to 8:00 PM: *"i have diaper
 * change schedule at 1am, then 8am (not sure why 7 hr but it's still not a big problem) but since
 * 8am is before the day starts, the next diaper is at 4pm. This is obviously doesn't make sense,
 * there needs to be some sort of rule for this"*).
 *
 * 8:00 AM is still night, so the night's eight-hour step applied, and nothing held it at the end of
 * the night: it ran on into a day whose step is two. A night step now carries past wake-up by one
 * day step at most — the next slot is the earlier of the night's step and wake-up plus the day's —
 * so no stretch of a gap is longer than the step of the side it falls on, at either edge of the
 * night. One household in America/New_York (`fixtures.ts`), on Wednesday 2026-06-10.
 */
import { describe, expect, it } from 'vitest';
import { scheduleAhead } from './ahead';
import { at, ctx, rule, sess, TZ } from './fixtures';
import { emptyDayGrid, emptyDaySlots, gridFills, intervalOccurrences, nextDue } from './interval';
import { hhmmOf, inWindow, wallMinutes } from './time';
import { MIN, skipKey, type EngineContext, type Occurrence, type Rule } from './types';

const hhmm = (ms: number): string => hhmmOf(wallMinutes(TZ, ms));
/** `10:30 UPCOMING` — one string a row, the way the Schedule tab reads down. */
const day = (occ: readonly Occurrence[]): string[] => occ.map(o => `${hhmm(o.atMs)} ${o.status}`);
/** The same engine a day on: `dayStartMs` moves and `nowMs` does not (`useScheduleDay`'s Tomorrow). */
const dayAfter = (c: EngineContext, n = 1): EngineContext => ({ ...c, dayStartMs: at('00:00', n) });

/** A household a week old, whose rules are older still: every day is an ordinary one. */
const settled = { trackingFromMs: at('10:00', -7) };

/** The owner's diapers: every 2 h by day, every 8 h by night, the day 8:30 AM to 8:00 PM. */
const ownersDiapers = (extra: Partial<Rule> = {}): Rule =>
  rule({
    id: 'r-diaper',
    activity: 'diaper',
    ruleType: 'INTERVAL',
    everyMinutes: 120,
    nightMode: 'LONGER',
    nightFrom: '20:00',
    nightTo: '08:30',
    nightEveryMinutes: 480,
    effectiveFromMs: at('10:01', -7),
    ...extra,
  });

/**
 * THE STEP AS IT WAS until this fix, kept only to reproduce what the owner saw: the night's step
 * whenever the anchor is in the night or the day's step would land in it, and nothing holding it
 * at wake-up.
 */
const stepAsItWas = (anchorMs: number, r: Rule): number => {
  const next = anchorMs + (r.everyMinutes ?? 0) * MIN;
  const night = (ts: number) => inWindow(TZ, ts, r.nightFrom ?? '00:00', r.nightTo ?? '00:00');
  return night(anchorMs) || night(next) ? anchorMs + (r.nightEveryMinutes ?? 0) * MIN : next;
};

describe('the owner’s diapers: every 2 h by day, 8 h by night, the day 8:30 AM to 8:00 PM', () => {
  const diapers = ownersDiapers();

  it('was 1:00 AM, 8:00 AM, 4:00 PM, 6:00 PM with nothing logged — reproduced from its parts', () => {
    // the day's grid from its midnight, stepped the old way: midnight is night, so 8:00 AM is the
    // night's eight hours from it; 8:00 AM is still night (the day begins at 8:30), so eight more
    const grid: number[] = [];
    for (let t = stepAsItWas(at('00:00'), diapers); t < at('00:00', 1);) {
      grid.push(t);
      t = stepAsItWas(t, diapers);
    }
    expect(grid.map(hhmm)).toEqual(['08:00', '16:00', '18:00']);
    // and 1:00 AM is the middle of the fourteen hours between yesterday's 6:00 PM and this 8:00
    // AM (`gridFills`): the owner's "not sure why 7 hr" is the seven hours either side of it
    expect(gridFills(diapers, TZ, at('18:00', -1), at('08:00'))).toEqual([at('01:00')]);
    // the step that made it: 8:00 AM → 4:00 PM, eight hours into a day whose step is two
    expect(hhmm(stepAsItWas(at('08:00'), diapers))).toBe('16:00');
  });

  it('now: 1:15 AM, 8:00 AM, then every two hours from 10:30 AM — never 4:00 PM', () => {
    expect(nextDue(at('08:00'), diapers, TZ)).toBe(at('10:30'));
    const res = intervalOccurrences(diapers, [], ctx('00:30', settled));
    expect(day(res.occurrences)).toEqual([
      '01:15 UPCOMING', // the night's middle, now of 6:30 PM → 8:00 AM: 6 h 45 m either side
      '08:00 UPCOMING', // the night's eight hours from midnight, half an hour before wake-up
      '10:30 UPCOMING', // one day step after wake-up: it was 4:00 PM
      '12:30 UPCOMING',
      '14:30 UPCOMING',
      '16:30 UPCOMING',
      '18:30 UPCOMING',
    ]);
    const zone = { timeZone: TZ, ...settled };
    expect(gridFills(diapers, TZ, at('18:30', -1), at('08:00'))).toEqual([at('01:15')]);
    expect(emptyDayGrid(diapers, zone, at('00:00')).map(hhmm)).toEqual([
      '08:00',
      '10:30',
      '12:30',
      '14:30',
      '16:30',
      '18:30',
    ]);
  });

  it('the owner’s 8:00 AM change: the next is 10:30 AM, and the day runs every two hours on', () => {
    const changed = sess('diaper', '08:00', null, { id: 'd8' });
    const res = intervalOccurrences(diapers, [changed], ctx('08:05', settled));
    expect(day(res.occurrences)).toEqual([
      '01:15 MISSED',
      '08:00 DONE',
      '10:30 UPCOMING',
      '12:30 UPCOMING',
      '14:30 UPCOMING',
      '16:30 UPCOMING',
      '18:30 UPCOMING',
    ]);
    expect(res.next).toMatchObject({ atMs: at('10:30'), status: 'UPCOMING', movedFromMs: null });
    // due at 10:30, the one slot due, and missed only an hour after it — it is an ordinary slot
    const later = intervalOccurrences(diapers, [changed], ctx('10:40', settled));
    expect(later.next).toMatchObject({ atMs: at('10:30'), status: 'DUE' });
    expect(later.occurrences.filter(o => o.status === 'DUE')).toHaveLength(1);
  });
});

describe('a night gap that lands exactly at wake-up', () => {
  it('is the day’s first slot, and the day’s step follows it', () => {
    const diapers = ownersDiapers();
    // eight hours from 12:30 AM is 8:30 AM, the first minute of the day, not the night's last
    expect(nextDue(at('00:30'), diapers, TZ)).toBe(at('08:30'));
    expect(nextDue(at('08:30'), diapers, TZ)).toBe(at('10:30'));
    const res = intervalOccurrences(
      diapers,
      [sess('diaper', '00:30', null, { id: 'n' })],
      ctx('00:40', settled),
    );
    expect(day(res.occurrences)).toEqual([
      '00:30 DONE',
      '08:30 UPCOMING',
      '10:30 UPCOMING',
      '12:30 UPCOMING',
      '14:30 UPCOMING',
      '16:30 UPCOMING',
      '18:30 UPCOMING',
    ]);
    // setup's feeding rhythm the same way: a 3:00 AM feed, four hours to 7:00 AM, then three
    const feeding = rule({
      id: 'r-feed',
      activity: 'bottle',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
      nightMode: 'LONGER',
      nightFrom: '19:30',
      nightTo: '07:00',
      nightEveryMinutes: 240,
    });
    expect(nextDue(at('03:00'), feeding, TZ)).toBe(at('07:00'));
    expect(nextDue(at('07:00'), feeding, TZ)).toBe(at('10:00'));
  });
});

describe('a slot within one night interval of wake-up', () => {
  const diapers = ownersDiapers();

  it('steps the night’s eight hours, but never past one day step after wake-up', () => {
    const next = (hm: string): string => hhmm(nextDue(at(hm), diapers, TZ));
    expect(next('01:00')).toBe('09:00'); // half an hour into the day: inside one day step, kept
    expect(next('02:30')).toBe('10:30'); // exactly one day step past wake-up: the two agree
    expect(next('03:00')).toBe('10:30'); // was 11:00
    expect(next('05:00')).toBe('10:30'); // was 1:00 PM
    expect(next('07:00')).toBe('10:30'); // was 3:00 PM
    expect(next('08:00')).toBe('10:30'); // was 4:00 PM
    expect(next('08:29')).toBe('10:30'); // was 4:29 PM
    expect(next('09:00')).toBe('11:00'); // a day slot: the day's own step
  });

  it('moves with the night’s slot, never earlier than the day step and never later than it was', () => {
    let previous = -Infinity;
    for (let t = at('20:00', -1); t < at('08:30'); t += 5 * MIN) {
      const now = nextDue(t, diapers, TZ);
      expect(now).toBeGreaterThanOrEqual(previous); // a later night slot never brings the next one sooner
      expect(now).toBeGreaterThanOrEqual(t + 120 * MIN);
      expect(now).toBeLessThanOrEqual(stepAsItWas(t, diapers));
      previous = now;
    }
  });

  it('a night change at 3:00 AM: 10:30 AM is the one slot due by mid-morning, not 11:00', () => {
    const res = intervalOccurrences(
      diapers,
      [sess('diaper', '03:00', null, { id: 'n3' })],
      ctx('10:40', settled),
    );
    expect(day(res.occurrences).slice(0, 4)).toEqual([
      '01:15 MISSED',
      '03:00 DONE', // off the grid: it pre-empted the 8:00 AM slot
      '10:30 DUE',
      '12:30 UPCOMING',
    ]);
  });
});

describe('bedtime: a day step that crosses into the night', () => {
  const diapers = ownersDiapers();

  it('takes the night’s step from the same slot, so each side of the gap is within its own step', () => {
    // 8:00 PM is the night's first minute: two hours from 6:00 PM would land on it
    expect(hhmm(nextDue(at('18:00'), diapers, TZ))).toBe('02:00');
    expect(hhmm(nextDue(at('19:00'), diapers, TZ))).toBe('03:00');
    expect(hhmm(nextDue(at('17:59'), diapers, TZ))).toBe('19:59'); // still the day's
    expect(hhmm(nextDue(at('20:00'), diapers, TZ))).toBe('04:00'); // a night slot
    // the evening's part under the day's two hours, the night's part under its eight
    for (const hm of ['18:00', '18:30', '19:00', '19:59']) {
      const from = at(hm);
      const to = nextDue(from, diapers, TZ);
      expect(at('20:00') - from).toBeLessThanOrEqual(120 * MIN);
      expect(to - at('20:00')).toBeLessThanOrEqual(480 * MIN);
    }
  });

  it('a night step taken at bedtime that runs past the NEXT wake-up is held there too', () => {
    // a short night, 10 PM to 6 AM, kept at twelve hours: from 9:00 PM that was 9:00 AM
    const short = ownersDiapers({ nightFrom: '22:00', nightTo: '06:00', nightEveryMinutes: 720 });
    expect(nextDue(at('21:00'), short, TZ)).toBe(at('08:00', 1));
    expect(nextDue(at('22:00'), short, TZ)).toBe(at('08:00', 1));
  });

  it('a day step as long as the night itself steps into it, not clean over it', () => {
    // every 10 h by day, 4 h by night, the night 10 PM to 6 AM: from 8:00 PM the day's step
    // landed on 6:00 AM, and the whole night passed on a four-hour night step with no slot in it
    const long = ownersDiapers({
      everyMinutes: 600,
      nightFrom: '22:00',
      nightTo: '06:00',
      nightEveryMinutes: 240,
    });
    const chain = [at('20:00')];
    for (let i = 0; i < 5; i++) chain.push(nextDue(chain[chain.length - 1] ?? 0, long, TZ));
    expect(chain.map(hhmm)).toEqual(['20:00', '00:00', '04:00', '08:00', '18:00', '22:00']);
  });
});

describe('across midnight', () => {
  const diapers = ownersDiapers();
  const change = sess('diaper', '23:00', null, { dayOffset: -1, id: 'late' });
  const morning = ctx('07:10', settled);

  it('a change at 11:00 PM: 7:00 AM, then 10:30 AM — Today, Tomorrow and the evening before agree', () => {
    // the evening of the change: its list ends with it, and what comes next is tomorrow's
    const evening = { ...morning, nowMs: at('23:05', -1), dayStartMs: at('00:00', -1) };
    const that = intervalOccurrences(diapers, [change], evening);
    expect(day(that.occurrences).slice(-1)).toEqual(['23:00 DONE']);
    expect(that.next).toBeNull();
    expect(scheduleAhead([diapers], [change], evening)[0]).toMatchObject({ atMs: at('07:00') });
    // the next morning, and the day after it: one chain
    expect(day(intervalOccurrences(diapers, [change], morning).occurrences)).toEqual([
      '07:00 DUE',
      '10:30 UPCOMING', // was 3:00 PM
      '12:30 UPCOMING',
      '14:30 UPCOMING',
      '16:30 UPCOMING',
      '18:30 UPCOMING',
    ]);
    expect(day(intervalOccurrences(diapers, [change], dayAfter(morning)).occurrences)).toEqual([
      '02:30 UPCOMING',
      '10:30 UPCOMING',
      '12:30 UPCOMING',
      '14:30 UPCOMING',
      '16:30 UPCOMING',
      '18:30 UPCOMING',
    ]);
  });

  it('every step the days show is the step `nextDue` takes, across both midnights', () => {
    const times = [0, 1, 2]
      .flatMap(n => intervalOccurrences(diapers, [change], dayAfter(morning, n)).occurrences)
      .map(o => o.atMs);
    const chain = [change.startMs, ...times];
    expect(chain.length).toBeGreaterThan(15);
    expect(chain.every((t, i) => i === 0 || t === nextDue(chain[i - 1] ?? 0, diapers, TZ))).toBe(
      true,
    );
  });

  it('with nothing logged, the night’s middle slot belongs to the later day alone', () => {
    const zone = { timeZone: TZ, ...settled };
    expect(emptyDaySlots(diapers, zone, at('00:00', -1)).slice(-1).map(hhmm)).toEqual(['18:30']);
    expect(emptyDaySlots(diapers, zone, at('00:00'))[0]).toBe(at('01:15'));
    const yesterday = intervalOccurrences(diapers, [], dayAfter(ctx('09:00', settled), -1));
    expect(yesterday.occurrences.some(o => o.atMs >= at('00:00'))).toBe(false);
  });
});

describe('the nights a parent keeps their own way are kept', () => {
  it('None: nothing in the night, and the day opens at wake-up', () => {
    const paused = ownersDiapers({ nightMode: 'PAUSE', nightEveryMinutes: null });
    const res = intervalOccurrences(paused, [], ctx('07:00', settled));
    expect(day(res.occurrences)).toEqual([
      '08:30 UPCOMING',
      '10:30 UPCOMING',
      '12:30 UPCOMING',
      '14:30 UPCOMING',
      '16:30 UPCOMING',
      '18:30 UPCOMING',
    ]);
    expect(nextDue(at('18:30'), paused, TZ)).toBe(at('08:30', 1));
    // a change in the night all the same: the next is wake-up, and one at 7:30 is the day's step
    expect(nextDue(at('03:00'), paused, TZ)).toBe(at('08:30'));
    expect(nextDue(at('07:30'), paused, TZ)).toBe(at('09:30'));
    // and the wake-up slot keeps a full interval before it can be missed (the audit's B5)
    const late = intervalOccurrences(paused, [], ctx('09:45', settled));
    expect(late.next).toMatchObject({ atMs: at('08:30'), status: 'DUE' });
  });

  it('Once a night: the one slot at its time, then wake-up', () => {
    const once = ownersDiapers({ nightMode: 'ONE', nightEveryMinutes: null, nightAt: '02:00' });
    const res = intervalOccurrences(once, [], ctx('00:30', settled));
    expect(day(res.occurrences)).toEqual([
      '02:00 UPCOMING',
      '08:30 UPCOMING',
      '10:30 UPCOMING',
      '12:30 UPCOMING',
      '14:30 UPCOMING',
      '16:30 UPCOMING',
      '18:30 UPCOMING',
    ]);
    // the night's one change, ten minutes after its time: the next is wake-up, never 4:10 AM
    const done = intervalOccurrences(
      once,
      [sess('diaper', '02:10', null, { id: 'one' })],
      ctx('02:20', settled),
    );
    expect(day(done.occurrences).slice(0, 2)).toEqual(['02:00 DONE', '08:30 UPCOMING']);
    // a caregiver's skip of it keeps wake-up next
    const skipped = intervalOccurrences(
      once,
      [],
      ctx('02:20', { ...settled, skipped: new Set([skipKey(once.id, at('02:00'))]) }),
    );
    expect(day(skipped.occurrences).slice(0, 2)).toEqual(['02:00 SKIPPED', '08:30 UPCOMING']);
  });
});

describe('every interval with a night of its own, not only diapers', () => {
  it('pumping and feeding on the owner’s rhythm lay out the diapers’ day', () => {
    const diapers = intervalOccurrences(ownersDiapers(), [], ctx('00:30', settled));
    for (const activity of ['pump', 'bottle', 'breastfeed'] as const) {
      const r = ownersDiapers({ id: `r-${activity}`, activity });
      const res = intervalOccurrences(r, [], ctx('00:30', settled));
      expect(
        res.occurrences.map(o => o.atMs),
        activity,
      ).toEqual(diapers.occurrences.map(o => o.atMs));
    }
  });

  it('setup’s feeding rhythm and §4’s worked example are exactly as they were', () => {
    const feeding = rule({
      id: 'r-feed',
      activity: 'bottle',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
      nightMode: 'LONGER',
      nightFrom: '19:30',
      nightTo: '07:00',
      nightEveryMinutes: 240,
      effectiveFromMs: at('10:01', -7),
    });
    // 4:00 AM → 8:00 AM is one hour into a day whose step is three: nothing to hold
    expect(emptyDaySlots(feeding, { timeZone: TZ, ...settled }, at('00:00')).map(hhmm)).toEqual([
      '00:30',
      '04:00',
      '08:00',
      '11:00',
      '14:00',
      '17:00',
      '21:00',
    ]);
    const pump = rule({
      id: 'r-pump',
      activity: 'pump',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
      nightMode: 'LONGER',
      nightFrom: '23:00',
      nightTo: '06:00',
      nightEveryMinutes: 240,
    });
    expect(nextDue(at('22:40'), pump, TZ)).toBe(at('02:40', 1));
    expect(nextDue(at('02:50', 1), pump, TZ)).toBe(at('06:50', 1));
    // …and where its night step would run on past 9:00 AM, it no longer does
    expect(nextDue(at('05:55', 1), pump, TZ)).toBe(at('09:00', 1));
  });
});

/**
 * THE RULE ITSELF: from any slot, no stretch of the gap to the next one is longer than the step of
 * the side it falls on — at most one day step of day, at most one night step of night. Checked for
 * every five-minute anchor through a day, on rhythms whose edges sit on five-minute marks, so each
 * five-minute cell of a gap is wholly day or wholly night. Paused and once-a-night nights are the
 * parent's own and are not held to it, as they are not filled (`gridFills`).
 */
describe('no stretch of a gap is longer than its own side’s step', () => {
  const rhythms: [string, Rule][] = [
    ['the owner’s diapers', ownersDiapers()],
    [
      'setup’s feeding',
      ownersDiapers({
        everyMinutes: 180,
        nightFrom: '19:30',
        nightTo: '07:00',
        nightEveryMinutes: 240,
      }),
    ],
    [
      '§4’s pump',
      ownersDiapers({
        everyMinutes: 180,
        nightFrom: '23:00',
        nightTo: '06:00',
        nightEveryMinutes: 240,
      }),
    ],
    [
      'a night step shorter than the day’s',
      ownersDiapers({
        everyMinutes: 240,
        nightFrom: '19:30',
        nightTo: '07:00',
        nightEveryMinutes: 180,
      }),
    ],
    [
      'a short night kept long',
      ownersDiapers({ nightFrom: '22:00', nightTo: '06:00', nightEveryMinutes: 720 }),
    ],
    [
      'a day step longer than the night',
      ownersDiapers({
        everyMinutes: 600,
        nightFrom: '22:00',
        nightTo: '06:00',
        nightEveryMinutes: 240,
      }),
    ],
  ];

  it.each(rhythms)('%s', (_name, r) => {
    const CELL = 5 * MIN;
    const isNight = (t: number) => inWindow(TZ, t, r.nightFrom ?? '00:00', r.nightTo ?? '00:00');
    for (let a = at('00:00'); a < at('00:00', 1); a += CELL) {
      const t = nextDue(a, r, TZ);
      expect(t).toBeGreaterThan(a);
      let longest = { day: 0, night: 0 };
      let run = 0;
      let side: 'day' | 'night' | null = null;
      for (let c = a; c < t; c += CELL) {
        const here = isNight(c) ? 'night' : 'day';
        run = here === side ? run + CELL : CELL;
        side = here;
        longest = { ...longest, [here]: Math.max(longest[here], run) };
      }
      const where = `${hhmm(a)} → ${hhmm(t)}`;
      expect(longest.day, where).toBeLessThanOrEqual((r.everyMinutes ?? 0) * MIN);
      expect(longest.night, where).toBeLessThanOrEqual((r.nightEveryMinutes ?? 0) * MIN);
    }
  });
});
