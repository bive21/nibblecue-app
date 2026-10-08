/**
 * Schedule from your log: a week of a household's own entries, read back as set times, an
 * interval or nothing — and the sentences it may use while doing it.
 */
import { describe, expect, it } from 'vitest';
import { BANNED } from './foresight.banned';
import type { Beat } from './foresight';
import {
  FROM_LOG_DAYS,
  FROM_LOG_MIN_DAYS,
  fromLogCloser,
  fromLogWeek,
  scheduleFromLog,
  type FromLogInput,
  type FromLogRhythm,
  type FromLogShape,
} from './fromLog';
import {
  FROM_LOG_LEDE,
  FROM_LOG_METHOD,
  FROM_LOG_NAPS_LINE,
  FROM_LOG_OFFER_LOCKED,
  FROM_LOG_TITLE,
  fromLogDayEvidence,
  fromLogEvidence,
  fromLogNightsLine,
  fromLogOfferBody,
  fromLogOfferPart,
  fromLogRoutineDetail,
  fromLogShape,
  fromLogShapeLocked,
  fromLogToGo,
} from './fromLog.copy';
import * as COPY from './fromLog.copy';
import { mulberry32 } from './naps.sim';
import type { SleepLog } from './naps';

const M = 60_000;
const H = 60 * M;
const DAY = 24 * H;
/** A fixed zone is not what this tests: a day is a day, a wall clock is minutes — supplied. */
const DAY0 = Date.parse('2026-09-07T00:00:00.000Z'); // a Monday
const dayStartOf = (ms: number): number => Math.floor((ms - DAY0) / DAY) * DAY + DAY0;
const wallMinutes = (ms: number): number => Math.floor((ms - dayStartOf(ms)) / M);
const weekday = (ms: number): number => new Date(dayStartOf(ms)).getUTCDay();
const at = (d: number, h: number, m = 0): number => DAY0 + d * DAY + h * H + m * M;
/** Day 14 is a Monday, so the week read is days 7..13: Monday to Sunday. */
const NOW = at(14, 12);

const base: FromLogInput = {
  nowMs: NOW,
  beats: [],
  sleeps: [],
  firstEntryMs: at(0, 8),
  window: { wake: '07:00', bed: '19:30' },
  enabled: new Set<string>(),
  dayStartOf,
  wallMinutes,
  weekday,
};

const WEEK = [7, 8, 9, 10, 11, 12, 13];
/** The same clock times every day of the week, each moved by up to `jitter` minutes. */
function clockDays(
  activity: string,
  hours: readonly number[],
  jitter = 10,
  days: readonly number[] = WEEK,
  seed = 1,
): Beat[] {
  const r = mulberry32(seed);
  return days.flatMap(d =>
    hours.map(h => ({
      activity,
      startMs: at(d, 0) + h * H + Math.round((r() * 2 - 1) * jitter) * M,
    })),
  );
}
/** A baby who feeds `gapMin` after the last feed, give or take — the times drift, the gap does not. */
function gapDays(activity: string, firstH: number, gapMin: number, n: number, seed = 2): Beat[] {
  const r = mulberry32(seed);
  const out: Beat[] = [];
  for (const d of WEEK) {
    let t = at(d, firstH) + Math.round((r() * 2 - 1) * 45) * M;
    for (let i = 0; i < n; i += 1) {
      out.push({ activity, startMs: t });
      t += (gapMin + Math.round((r() * 2 - 1) * 20)) * M;
    }
  }
  return out;
}
const rhythm = (plan: ReturnType<typeof scheduleFromLog>, a: string): FromLogRhythm | undefined =>
  plan.rhythms.find(x => x.activity === a);
/** Set times, each within ten minutes of the one expected: the jitter moves a median by a step. */
function expectTimes(
  shape: FromLogShape | undefined,
  expected: readonly string[],
  weekdays = false,
): void {
  expect(shape?.kind).toBe('times');
  if (shape?.kind !== 'times') return;
  expect(shape.weekdays).toBe(weekdays);
  expect(shape.times).toHaveLength(expected.length);
  const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  shape.times.forEach((t, i) => {
    expect(Math.abs(min(t) - min(expected[i] ?? '')), `${t} vs ${expected[i]}`).toBeLessThanOrEqual(
      10,
    );
    expect(min(t) % 5).toBe(0);
  });
}

describe('when it is ready', () => {
  it('waits for a week from the first entry, and says how long', () => {
    const plan = scheduleFromLog({
      ...base,
      firstEntryMs: at(11, 9),
      beats: clockDays('bottle', [7, 10, 13], 5, [11, 12, 13]),
    });
    expect(plan.ready).toBe(false);
    expect(plan.daysToGo).toBe(4);
  });

  it('then wants five of the seven days to have something in them', () => {
    const thin = scheduleFromLog({ ...base, beats: clockDays('diaper', [9], 5, [7, 9, 11, 13]) });
    expect(thin.daysLogged).toBe(4);
    expect(thin.ready).toBe(false);
    expect(thin.daysToGo).toBe(1);
    const enough = scheduleFromLog({
      ...base,
      beats: clockDays('diaper', [9], 5, [7, 9, 10, 11, 13]),
    });
    expect(enough.ready).toBe(true);
    expect(enough.daysToGo).toBe(0);
  });

  it('counts any entry of any kind as a day logged, and never today', () => {
    const plan = scheduleFromLog({
      ...base,
      beats: [...clockDays('diaper', [9], 5, [7, 8]), ...clockDays('bottle', [9], 5, [14])],
      sleeps: [7, 8, 9].map(d => ({ startMs: at(d + 2, 13), endMs: at(d + 2, 14), kind: 'NAP' })),
    });
    expect(plan.daysLogged).toBe(FROM_LOG_MIN_DAYS);
  });

  it('counts each entry once — a sleep is among the beats already', () => {
    const sleeps: SleepLog[] = WEEK.map(d => ({
      startMs: at(d, 13),
      endMs: at(d, 14),
      kind: 'NAP',
    }));
    const feeds = clockDays('bottle', [8, 12], 5);
    const plan = scheduleFromLog({
      ...base,
      beats: [...feeds, ...sleeps.map(x => ({ activity: 'sleep', startMs: x.startMs }))],
      sleeps,
    });
    expect(plan.entries).toBe(feeds.length + sleeps.length);
  });

  it('with nothing logged at all, is a whole week away', () => {
    expect(scheduleFromLog({ ...base, firstEntryMs: null }).daysToGo).toBe(FROM_LOG_DAYS);
  });

  it('reads the seven complete days before today, oldest first', () => {
    expect(fromLogWeek(NOW, dayStartOf)).toEqual(WEEK.map(d => at(d, 0)));
  });
});

describe('set times', () => {
  it('are the clock times the week keeps coming back to, to the nearest five minutes', () => {
    const plan = scheduleFromLog({ ...base, beats: clockDays('bottle', [7, 10.5, 14, 17.5], 12) });
    const feeding = rhythm(plan, 'feeding');
    expectTimes(feeding?.shape, ['07:00', '10:30', '14:00', '17:30']);
    expect(feeding?.samples).toBe(7);
    expect(feeding?.days).toBe(7);
  });

  it('count a breastfeed and its bottle top-up as one feed', () => {
    const topped = clockDays('breastfeed', [7, 11, 15, 19], 5).flatMap(b => [
      b,
      { activity: 'bottle', startMs: b.startMs + 20 * M },
    ]);
    const shape = rhythm(scheduleFromLog({ ...base, beats: topped }), 'feeding')?.shape;
    expect(shape?.kind).toBe('times');
    expect(shape?.kind === 'times' && shape.times.length).toBe(4);
  });

  it('are Monday to Friday for something only ever logged on weekdays', () => {
    const work = clockDays('pump', [10, 13, 16], 10, [7, 8, 9, 10, 11]);
    const pump = rhythm(scheduleFromLog({ ...base, beats: work }), 'pump');
    expectTimes(pump?.shape, ['10:00', '13:00', '16:00'], true);
    expect(pump?.ofDays).toBe(5);
  });

  it('are every day for feeds and meals, even when only the weekdays were logged', () => {
    // a baby eats on Saturday whether or not anybody wrote it down: a log with no weekend is a
    // log that missed two days, and a schedule silent every weekend is the wrong thing to hand back
    const weekdaysOnly = [7, 8, 9, 10, 11];
    const plan = scheduleFromLog({
      ...base,
      beats: [
        ...clockDays('bottle', [7, 11, 15], 10, weekdaysOnly),
        ...clockDays('solids', [8, 12], 10, weekdaysOnly, 4),
      ],
    });
    expectTimes(rhythm(plan, 'feeding')?.shape, ['07:00', '11:00', '15:00']);
    expectTimes(rhythm(plan, 'solids')?.shape, ['08:00', '12:00']);
    expect(rhythm(plan, 'feeding')?.ofDays).toBe(7);
  });

  it('stay in clock order when a late one rounds past midnight', () => {
    // a household up late: bed at 23:45, and a last feed at 23:58 that rounds to 00:00
    const beats = WEEK.flatMap(d =>
      [
        [7, 0],
        [11, 0],
        [15, 0],
        [19, 0],
        [23, 58],
      ].map(([h, m]) => ({ activity: 'bottle', startMs: at(d, h ?? 0, m ?? 0) })),
    );
    const shape = rhythm(
      scheduleFromLog({ ...base, window: { wake: '07:00', bed: '23:45' }, beats }),
      'feeding',
    )?.shape;
    expect(shape).toEqual({
      kind: 'times',
      times: ['00:00', '07:00', '11:00', '15:00', '19:00'],
      weekdays: false,
    });
  });

  it('keep only the times kept on five days, and drop one kept on three', () => {
    const beats = [
      ...clockDays('solids', [8, 12], 10),
      ...clockDays('solids', [17], 10, [7, 9, 12], 3),
    ];
    const shape = rhythm(scheduleFromLog({ ...base, beats }), 'solids')?.shape;
    expectTimes(shape, ['08:00', '12:00']);
  });

  it('never put a time in the night: the night stays on demand', () => {
    const beats = [
      ...clockDays('bottle', [7, 11, 15, 19], 10),
      ...clockDays('bottle', [23, 27], 10, WEEK, 5), // 11 p.m. and 3 a.m. the next morning
    ];
    const shape = rhythm(scheduleFromLog({ ...base, beats }), 'feeding')?.shape;
    expectTimes(shape, ['07:00', '11:00', '15:00', '19:00']);
  });
});

describe('an interval', () => {
  it('is the steady gap when the clock times drift', () => {
    const feeding = rhythm(
      scheduleFromLog({ ...base, beats: gapDays('bottle', 7, 180, 5) }),
      'feeding',
    );
    expect(feeding?.shape.kind).toBe('every');
    const every = feeding?.shape.kind === 'every' ? feeding.shape.everyMinutes : 0;
    expect(every).toBeGreaterThanOrEqual(170);
    expect(every).toBeLessThanOrEqual(190);
    expect(every % 5).toBe(0);
    expect(feeding?.samples).toBe(7 * 4);
  });

  it('is never offered for solids, which are meals rather than a gap', () => {
    const shape = rhythm(
      scheduleFromLog({ ...base, beats: gapDays('solids', 8, 240, 3) }),
      'solids',
    )?.shape;
    expect(shape?.kind === 'every').toBe(false);
  });

  it('is not offered for gaps that are all over the place', () => {
    const r = mulberry32(9);
    const beats: Beat[] = [];
    for (const d of WEEK) {
      let t = at(d, 7);
      while (t < at(d, 19)) {
        beats.push({ activity: 'pump', startMs: t });
        t += (40 + r() * 280) * M;
      }
    }
    const pump = rhythm(scheduleFromLog({ ...base, beats }), 'pump');
    expect(pump?.shape).toEqual({ kind: 'none', reason: 'unsteady' });
  });
});

/*
  THE NIGHTS A RHYTHM KEEPS (the owner, 2026-09-29: "do 7day report create schedule for the night
  shift too?"). Read for feeding and pumping beside the day; whether a tap writes them is the
  routine's question (`apps/mobile/src/screens/fromLog/diff.ts`, only a night interval the
  household set itself).
*/
describe('the nights', () => {
  /** Pumps at 10 p.m., 1 a.m. and 4 a.m. after each evening listed: three hours apart. */
  const nightPumps = (
    evenings: readonly number[],
    hours: readonly number[] = [22, 25, 28],
  ): Beat[] =>
    evenings.flatMap(d => hours.map(h => ({ activity: 'pump', startMs: at(d, 0) + h * H })));

  it('are the middle of the gaps that began after bedtime, today’s small hours ending the last', () => {
    const plan = scheduleFromLog({
      ...base,
      // the evening before the week is not one of its nights, whatever it holds
      beats: [...gapDays('pump', 7, 150, 5), ...nightPumps([6, ...WEEK])],
    });
    // three a night; the last night's 4 a.m. has nothing after it yet
    expect(rhythm(plan, 'pump')?.night).toEqual({ everyMinutes: 180, gaps: 20, nights: 7 });
  });

  it('are read beside whatever the day is, and never for solids', () => {
    const plan = scheduleFromLog({
      ...base,
      beats: [
        ...clockDays('bottle', [7, 11, 15, 19], 10),
        ...nightPumps(WEEK).map(b => ({ ...b, activity: 'bottle' })),
        ...clockDays('solids', [12, 17], 10),
        ...nightPumps(WEEK).map(b => ({ ...b, activity: 'solids' })),
      ],
    });
    const feeding = rhythm(plan, 'feeding');
    expect(feeding?.shape.kind).toBe('times');
    expect(feeding?.night?.everyMinutes).toBe(180);
    expect(rhythm(plan, 'solids')?.night).toBeNull();
  });

  it('are not read from nights slept through, or from fewer than five of the seven', () => {
    const through = scheduleFromLog({ ...base, beats: gapDays('pump', 7, 150, 5) });
    expect(rhythm(through, 'pump')?.night).toBeNull();
    // nine gaps, but on three nights: that is three nights, not a rhythm
    const few = scheduleFromLog({
      ...base,
      beats: [...gapDays('pump', 7, 150, 5), ...nightPumps([7, 9, 11])],
    });
    expect(rhythm(few, 'pump')?.night).toBeNull();
  });

  it('need no steadiness: nights that vary still have a middle, as the Routine page reads it', () => {
    // two, five and three hours: far past the day's bar for a steady gap
    const plan = scheduleFromLog({
      ...base,
      beats: [...gapDays('pump', 7, 150, 5), ...nightPumps(WEEK, [21, 23, 28])],
    });
    expect(rhythm(plan, 'pump')?.night?.everyMinutes).toBeGreaterThan(0);
  });

  it('count the stretch after a feed at or past bedtime, and leave the day’s last gap to the day', () => {
    const at1945 = scheduleFromLog({
      ...base,
      beats: WEEK.flatMap(d =>
        [19.75, 23.75, 27.75].map(h => ({ activity: 'bottle', startMs: at(d, 0) + h * H })),
      ),
    });
    // 7:45 PM is past the 7:30 bedtime, so its four hours are the night's: two a night (the
    // sixteen hours from 3:45 AM to the next evening are no gap anybody set)
    expect(rhythm(at1945, 'feeding')?.night?.gaps).toBe(2 * 7);
    const at1915 = scheduleFromLog({
      ...base,
      beats: WEEK.flatMap(d =>
        [19.25, 23.25, 27.25].map(h => ({ activity: 'bottle', startMs: at(d, 0) + h * H })),
      ),
    });
    // 7:15 PM is the day's, so only the gap from 11:15 PM is the night's
    expect(rhythm(at1915, 'feeding')?.night?.gaps).toBe(7);
  });
});

describe('which of the two', () => {
  it('takes set times for a clock routine and the interval for a baby who sets the pace', () => {
    // one routine day: the entries sit on the clock whatever the gap before them was
    const clock = [
      [420, 600, 780, 960, 1140],
      [440, 590, 790, 950, 1150],
    ];
    expect(fromLogCloser(clock, [420, 600, 780, 960, 1140], 180)).toBe('times');
    // one paced day: each entry three hours after the last, the whole day later than the clock
    const paced = [
      [480, 660, 840, 1020],
      [400, 580, 760, 940],
    ];
    expect(fromLogCloser(paced, [440, 620, 800, 980], 180)).toBe('every');
  });
});

describe('what it leaves alone', () => {
  it('says why, when an activity has too few days behind it', () => {
    const pump = rhythm(
      scheduleFromLog({ ...base, beats: clockDays('pump', [9, 15], 5, [7, 10, 12]) }),
      'pump',
    );
    expect(pump?.shape).toEqual({ kind: 'none', reason: 'fewEntries' });
    expect(pump?.days).toBe(3);
  });

  it('reads nothing for a module that is off, and no day when sleep is off', () => {
    const plan = scheduleFromLog({
      ...base,
      enabled: new Set(['bottle']),
      beats: [...clockDays('bottle', [8, 12], 5), ...clockDays('pump', [9], 5)],
    });
    expect(plan.rhythms.map(r => r.activity)).toEqual(['feeding']);
    expect(plan.bed.at).toBeNull();
    expect(plan.wake.at).toBeNull();
  });

  it('never reads medicine, diapers, bath or tummy time into a rhythm', () => {
    const plan = scheduleFromLog({
      ...base,
      beats: ['med', 'diaper', 'bath', 'tummy', 'vaccine'].flatMap(a => clockDays(a, [9, 18], 5)),
    });
    expect(plan.rhythms.map(r => r.activity).sort()).toEqual(['feeding', 'pump', 'solids']);
    expect(plan.rhythms.every(r => r.shape.kind === 'none')).toBe(true);
  });
});

describe('the day', () => {
  /** A night from `bedH` to `wakeH` the next morning, in pieces when `wakings` is set. */
  const night = (d: number, bedMin: number, wakeMin: number, wakings = false): SleepLog[] => {
    const start = at(d, 0) + bedMin * M;
    const end = at(d + 1, 0) + wakeMin * M;
    if (!wakings) return [{ startMs: start, endMs: end, kind: 'NIGHT' }];
    const mid = start + (end - start) / 2;
    return [
      { startMs: start, endMs: mid, kind: 'NIGHT' },
      { startMs: mid + 30 * M, endMs: end, kind: 'NIGHT' },
    ];
  };

  it('runs from the waking to the bedtime the nights come back to', () => {
    const r = mulberry32(3);
    const sleeps = [6, ...WEEK].flatMap(d =>
      night(
        d,
        19 * 60 + 40 + Math.round((r() * 2 - 1) * 15),
        6 * 60 + 20 + Math.round((r() * 2 - 1) * 15),
        d % 2 === 0,
      ),
    );
    const plan = scheduleFromLog({ ...base, sleeps });
    expect(plan.bed.at).toMatch(/^19:[3-5]\d$/);
    expect(plan.wake.at).toMatch(/^06:[1-3]\d$/);
    expect(plan.bed.days).toBeGreaterThanOrEqual(FROM_LOG_MIN_DAYS);
  });

  it('takes a middle across midnight as the middle, not as noon', () => {
    const sleeps = [7, 8, 9, 10, 11, 12].flatMap((d, i) =>
      night(
        d,
        [23 * 60 + 40, 23 * 60 + 50, 24 * 60 + 5, 24 * 60 + 10, 23 * 60 + 55, 24 * 60][i] ?? 0,
        8 * 60,
      ),
    );
    expect(scheduleFromLog({ ...base, sleeps }).bed.at).toBe('00:00');
  });

  it('says nothing when the nights do not come back to one time', () => {
    const sleeps = [7, 8, 9, 10, 11, 12, 13].flatMap((d, i) =>
      night(d, 18 * 60 + i * 50, 6 * 60 + ((i * 97) % 240)),
    );
    const plan = scheduleFromLog({ ...base, sleeps });
    expect(plan.bed.at).toBeNull();
    expect(plan.wake.at).toBeNull();
  });

  it('frames the day the rhythms are read in: an early wake brings the first feed in', () => {
    const sleeps = [6, ...WEEK].flatMap(d => night(d, 19 * 60, 5 * 60 + 30));
    const beats = clockDays('bottle', [5.75, 9.5, 13, 16.5], 5);
    // with the household's 7:00 wake, a 5:45 feed is the night; the nights say the day starts 5:30
    const plan = scheduleFromLog({ ...base, sleeps, beats });
    expect(plan.wake.at).toBe('05:30');
    expectTimes(rhythm(plan, 'feeding')?.shape, ['05:45', '09:30', '13:00', '16:30']);
  });
});

/**
 * THE FORGOTTEN ENTRY (the owner, 2026-09-26: "consider the human aspect of like forget to
 * logging"). A set time needs five of the seven days, not seven; a day keeps a time once, by its
 * nearest entry; and a nap timer found the next morning starts its "night" in the afternoon, which
 * is not read as a bedtime at all — only the morning it ended on is.
 */
describe('a week with holes in it', () => {
  it('keeps every set time through a day nobody logged and a feed forgotten on another', () => {
    const beats = clockDays('bottle', [7, 11, 15, 19], 10)
      // Wednesday, nothing logged at all
      .filter(b => dayStartOf(b.startMs) !== at(9, 0))
      // Friday's three o'clock feed never reached the log
      .filter(
        b => !(dayStartOf(b.startMs) === at(11, 0) && Math.abs(wallMinutes(b.startMs) - 900) < 60),
      );
    const plan = scheduleFromLog({ ...base, beats });
    expect(plan.ready).toBe(true);
    expectTimes(rhythm(plan, 'feeding')?.shape, ['07:00', '11:00', '15:00', '19:00']);
  });

  it('never reads a nap timer left running into the morning as a bedtime', () => {
    const nights: SleepLog[] = [6, ...WEEK].map(d => ({
      startMs: at(d, 19, 30),
      endMs: at(d + 1, 6, 30),
      kind: 'NIGHT' as const,
    }));
    // Thursday's one o'clock nap timer ran until Friday morning; that night was never logged
    const sleeps: SleepLog[] = [
      ...nights.filter(s => dayStartOf(s.startMs) !== at(10, 0)),
      { startMs: at(10, 13), endMs: at(11, 6, 30), kind: 'NAP' },
    ];
    const plan = scheduleFromLog({ ...base, sleeps });
    expect(plan.bed).toEqual({ at: '19:30', days: 6 });
    expect(plan.wake.at).toBe('06:30');
  });
});

describe('the sentences', () => {
  const clock = (hhmm: string) => hhmm;
  const plan = scheduleFromLog({
    ...base,
    beats: [
      ...clockDays('bottle', [7, 11, 15, 19], 10),
      ...gapDays('pump', 8, 200, 4),
      ...clockDays('solids', [12], 10, [7, 10]),
    ],
  });
  const lines = [
    FROM_LOG_TITLE,
    FROM_LOG_LEDE,
    FROM_LOG_METHOD,
    FROM_LOG_NAPS_LINE,
    FROM_LOG_OFFER_LOCKED,
    fromLogNightsLine('7:30 PM', '6:45 AM'),
    fromLogNightsLine('7:30 PM', '6:45 AM', true),
    fromLogToGo(3),
    fromLogRoutineDetail(false, 1, 0),
    fromLogRoutineDetail(true, 0, 2),
    fromLogRoutineDetail(true, 0, 0),
    fromLogRoutineDetail(true, 0, 0, false),
    // every sentence the file exports, so one added later cannot slip past the lists below
    ...Object.values(COPY).filter((v): v is string => typeof v === 'string'),
    ...Object.values(COPY.FROM_LOG_NOUN),
    fromLogDayEvidence({ at: '06:30', days: 6 }, { at: '19:30', days: 5 }),
    fromLogOfferBody(plan.rhythms.flatMap(r => fromLogOfferPart(r) ?? [])),
    ...plan.rhythms.flatMap(r => [
      fromLogShape(r.shape, clock),
      fromLogEvidence(r),
      fromLogEvidence(r, true),
      fromLogOfferPart(r, 160) ?? '',
    ]),
  ];
  const all = lines.join(' \n ').toLowerCase();

  it('covers the three shapes', () => {
    expect(new Set(plan.rhythms.map(r => r.shape.kind))).toEqual(
      new Set(['times', 'every', 'none']),
    );
  });

  it('diagnoses nothing and instructs nobody about a baby', () => {
    for (const word of BANNED) expect(all, word).not.toContain(word);
    expect(all).not.toMatch(/should|hungry|overdue|your baby (is|needs)|ideal|on track/);
  });

  it('never calls a time or a gap big, small, better or worse', () => {
    for (const word of [
      'too much',
      'too little',
      'longer',
      'shorter',
      'better',
      'worse',
      'improve',
      'trend',
      'late',
      'early',
    ]) {
      expect(all, word).not.toContain(word);
    }
  });

  it('puts the count beside every proposal', () => {
    for (const r of plan.rhythms) {
      if (r.shape.kind === 'none') continue;
      expect(fromLogEvidence(r)).toContain(String(r.samples));
    }
  });

  it('puts the night’s count beside a night it sets, and says the night in the offer', () => {
    const r: FromLogRhythm = {
      activity: 'pump',
      shape: { kind: 'every', everyMinutes: 140 },
      days: 7,
      ofDays: 7,
      samples: 29,
      night: { everyMinutes: 155, gaps: 13, nights: 7 },
    };
    expect(fromLogEvidence(r)).toBe('The middle of 29 gaps between entries in the day');
    expect(fromLogEvidence(r, true)).toBe(
      'The middle of 29 gaps between entries in the day, and of 13 at night',
    );
    expect(fromLogOfferPart(r, 155)).toBe('pumping every 2h 20m, 2h 35m at night');
    expect(fromLogNightsLine('8:00 PM', '8:30 AM', true)).toBe(
      'Between 8:00 PM and 8:30 AM, a night rhythm you set yourself follows your own nights. Nothing else is set.',
    );
  });

  it('withholds every number on the locked page, and keeps the shape', () => {
    for (const r of plan.rhythms) {
      if (r.shape.kind === 'none') continue;
      expect(fromLogShapeLocked(r.shape)).not.toMatch(/\d/);
    }
    const feeding = rhythm(plan, 'feeding');
    expect(feeding && fromLogShapeLocked(feeding.shape).split(' · ')).toHaveLength(4);
  });

  it('spells the offer as one sentence', () => {
    expect(fromLogOfferBody(['feeding at 4 set times', 'pumping every 3h 20m'])).toBe(
      'Feeding at 4 set times and pumping every 3h 20m, from your last 7 days. Nothing changes until you choose it.',
    );
    expect(fromLogOfferBody(['a', 'b', 'c'])).toMatch(/^A, b and 1 more,/);
  });
});
