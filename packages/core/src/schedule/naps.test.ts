/**
 * The nap outlook: the wake window a household actually lives, taken per position in the day,
 * and the sentences it is allowed to say about it.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_POSITION_SAMPLES,
  MIN_DAYS,
  MIN_TOTAL_SAMPLES,
  FORGET_AFTER_MS,
  MISSED_NAP_SHARE,
  NAP_HEADS_UP_LEAD_MS,
  RECENCY_HALF_LIFE_DAYS,
  napAsRhythm,
  napOutlook,
  napRhythm,
  recencyWeight,
  wakeWindows,
  type SleepLog,
} from './naps';
import { BANNED } from './foresight.banned';
import {
  NAP_ASLEEP_LABEL,
  NAP_AWAKE_LABEL,
  asleepFor,
  awakeFor,
  napClockLabel,
  napHeadsUpLine,
  napHeadsUpPart,
  napHeadsUpTitle,
  napLength,
  sleepSpan,
  napsTodayLine,
  napWatching,
  nextSleepLine,
  nothingLoggedSince,
  positionWord,
  napLengthLine,
  napWindowLine,
  NAP_HEADER,
  NAP_METHOD,
  NAP_LOCKED,
  NAP_LOCKED_BODY,
  SLEEP_ACTIVE_LEARNING,
  SLEEP_ESTIMATE,
  SLEEP_LEARNING,
  SLEEP_LEARNING_BODY,
  SLEEP_PASSED,
  SLEEP_STALE,
  SLEEP_STALE_MORE,
  SLEEP_UNAVAILABLE,
  napsTodayCount,
  sleepStaleWake,
  NAP_GAP_LINE,
} from './naps.copy';

const H = 60 * 60_000;
const M = 60_000;
const DAY = 24 * H;
/** Local midnight in a fixed zone is not what this tests — a day is a day, supplied as one. */
const DAY0 = Date.parse('2026-09-01T00:00:00.000Z');
const dayStartOf = (ms: number): number => Math.floor((ms - DAY0) / DAY) * DAY + DAY0;
/** Day `d`, at `h:m` local. */
const at = (d: number, h: number, m = 0): number => DAY0 + d * DAY + h * H + m * M;

/** One ordinary day: night ends 07:00, naps 09:00–10:00 and 13:00–14:30, bedtime 19:00. */
const ordinaryDay = (d: number): SleepLog[] => [
  { startMs: at(d - 1, 19), endMs: at(d, 7), kind: 'NIGHT' },
  { startMs: at(d, 9), endMs: at(d, 10), kind: 'NAP' },
  { startMs: at(d, 13), endMs: at(d, 14, 30), kind: 'NAP' },
];

const week = (days: number): SleepLog[] =>
  Array.from({ length: days }, (_, i) => ordinaryDay(i + 1)).flat();

describe('the wake windows a household actually lived', () => {
  it('measures from one sleep ENDING to the next BEGINNING, not start to start', () => {
    const w = wakeWindows(ordinaryDay(1), at(1, 18), dayStartOf);
    // 07:00 → 09:00 is two hours; 10:00 → 13:00 is three
    expect(w.map(x => x.awakeMs)).toEqual([2 * H, 3 * H]);
    expect(w.map(x => x.position)).toEqual([1, 2]);
  });

  it('carries the length of the sleep that followed, so a nap has a usual length too', () => {
    const w = wakeWindows(ordinaryDay(1), at(1, 18), dayStartOf);
    expect(w[0]?.napMs).toBe(1 * H);
    expect(w[1]?.napMs).toBe(1.5 * H);
  });

  it('is not fooled by a nap logged as two, nor by an afternoon nobody logged', () => {
    const day: SleepLog[] = [
      { startMs: at(1, 6), endMs: at(1, 7), kind: 'NIGHT' },
      // a transfer: ten minutes "awake" between two halves of one nap
      { startMs: at(1, 9), endMs: at(1, 9, 30), kind: 'NAP' },
      { startMs: at(1, 9, 40), endMs: at(1, 10, 30), kind: 'NAP' },
      // …and then nine hours with nothing in them
      { startMs: at(1, 19, 30), endMs: at(2, 7), kind: 'NIGHT' },
    ];
    const w = wakeWindows(day, at(1, 23), dayStartOf);
    expect(w.map(x => x.awakeMs)).toEqual([2 * H]); // 07:00 → 09:00 and nothing else
  });

  /**
   * A NAP NOBODY LOGGED (`MISSED_NAP_SHARE`, 2026-09-26). On the sixth day the nine o'clock nap
   * never reached the log, so 07:00 → 13:00 reads as one six-hour "window" — three times this
   * household's own two. It is two windows and a forgotten nap: not counted, and the day counts on
   * past it, so the run-up to that night is still the THIRD window and not the second.
   */
  it('leaves out a window that hid a nap nobody logged, and keeps the day’s count right after it', () => {
    const forgot: SleepLog[] = [
      { startMs: at(5, 19), endMs: at(6, 7), kind: 'NIGHT' },
      { startMs: at(6, 13), endMs: at(6, 14, 30), kind: 'NAP' },
      { startMs: at(6, 19), endMs: at(7, 7), kind: 'NIGHT' },
    ];
    const w = wakeWindows([...week(5), ...forgot], at(7, 8), dayStartOf);
    const sixth = w.filter(x => x.wokeAtMs >= at(6, 0) && x.wokeAtMs < at(7, 0));
    expect(sixth.map(x => [x.position, x.awakeMs / H])).toEqual([[3, 4.5]]);
    expect(w.some(x => x.awakeMs === 6 * H)).toBe(false);
    // and the morning it began is still a morning: the next night's end is read off it too
    const o = napOutlook(
      [...week(5), ...forgot, { startMs: at(7, 19), endMs: null, kind: 'NIGHT' }],
      at(7, 19, 5),
      dayStartOf,
    );
    expect(o.morningSamples).toBe(6);
  });

  it('never reaches across midnight: the overnight gap is not a wake window', () => {
    const w = wakeWindows(week(3), at(3, 18), dayStartOf);
    expect(w.every(x => x.awakeMs <= 8 * H)).toBe(true);
    // three windows a day, and the third is the run-up to bedtime — which is a wake window a
    // parent very much plans around, so it is kept rather than dropped with the overnight gap
    expect(w.filter(x => x.position === 3).map(x => x.awakeMs)).toEqual([4.5 * H, 4.5 * H]);
    expect(w.every(x => x.position <= 3)).toBe(true);
  });
});

describe('the medians', () => {
  it('are taken per position, and say how many days each came from', () => {
    const r = napRhythm(
      wakeWindows(week(6), at(6, 18), dayStartOf),
      week(6),
      at(6, 18),
      dayStartOf,
    );
    expect(r.byPosition.get(1)).toMatchObject({ awakeMs: 2 * H, samples: 6 });
    expect(r.byPosition.get(2)).toMatchObject({ awakeMs: 3 * H, samples: 6 });
    // five, not six: the last day's run-up needs a bedtime the fixture has not reached yet
    expect(r.byPosition.get(3)).toMatchObject({ awakeMs: 4.5 * H, samples: 5 });
    // pooling them gives 3h, which describes none of the three
    expect(r.awakeMs).toBe(3 * H);
  });

  it('counts naps a day over the days with sleep in them, never over the whole two weeks', () => {
    // four days of a two-nap rhythm, looked at on the fifth: the middle is 2, not 8/14
    const r = napRhythm(
      wakeWindows(week(4), at(5, 12), dayStartOf),
      week(4),
      at(5, 12),
      dayStartOf,
    );
    expect(r.napsPerDay).toBe(2);
  });
});

describe('where the household is now', () => {
  it('awake: names the window for THIS position and when the next sleep would fall', () => {
    const log = [
      ...week(6),
      { startMs: at(7, 6) - 11 * H, endMs: at(7, 7), kind: 'NIGHT' as const },
    ];
    const now = at(7, 8); // an hour after waking, before the first nap
    const o = napOutlook(log, now, dayStartOf);
    expect(o.state).toBe('awake');
    expect(o.position).toBe(1);
    expect(o.basis).toBe('position');
    expect(o.awakeMs).toBe(2 * H); // the first window, not the pooled 2.5
    expect(o.awakeForMs).toBe(1 * H);
    expect(o.nextAtMs).toBe(at(7, 9));
    expect(o.samples).toBe(6);
  });

  it('…and the SECOND window is a different number, which is the whole point', () => {
    const log = [...week(6), ...ordinaryDay(7).slice(0, 2)];
    const o = napOutlook(log, at(7, 11), dayStartOf);
    expect(o.position).toBe(2);
    expect(o.awakeMs).toBe(3 * H);
    expect(o.nextAtMs).toBe(at(7, 13));
  });

  it('asleep: answers the other question — how long a sleep here usually runs', () => {
    const log = [
      ...week(6),
      ...ordinaryDay(7).slice(0, 1),
      { startMs: at(7, 9), endMs: null, kind: 'NAP' as const },
    ];
    const o = napOutlook(log, at(7, 9, 20), dayStartOf);
    expect(o.state).toBe('asleep');
    expect(o.asleepForMs).toBe(20 * M);
    expect(o.usualNapMs).toBe(1 * H);
    expect(o.wakeAtMs).toBe(at(7, 10));
    // nothing is predicted about the NEXT sleep while this one is still running
    expect(o.nextAtMs).toBe(null);
  });

  it('falls back to every NAP-followed window pooled where a position has too few days behind it', () => {
    // two days only: position 1 has 2 samples, under MIN_POSITION_SAMPLES
    const log = [...week(2), { startMs: at(2, 19), endMs: at(3, 7), kind: 'NIGHT' as const }];
    const o = napOutlook(log, at(3, 8), dayStartOf);
    expect(MIN_POSITION_SAMPLES).toBe(3);
    expect(o.basis).toBe('pooled');
    expect(o.nextKind).toBe('nap');
    /*
      FOUR, NOT SIX. The run-up to the night used to be pooled in with the naps' windows, which
      pulled a morning prediction towards the length of an evening. The night has its own
      prediction now, so the pooled fallback for a NAP is the windows that ended in naps: 2h and
      3h on each day.

      THREE HOURS, NOT THE 2h 30m AN UNWEIGHTED MIDDLE WOULD GIVE. Two of each is an exact tie,
      and recency is measured by the clock rather than by the day, so each 3h window (from
      10:00) is three hours younger than the 2h window of the same morning and weighs a little
      more. A tie is the only place a tilt that small can show — it is 2% at a 5-day half-life —
      and it tips towards the newer entries, which is the direction the whole weighting leans.
    */
    expect(o.samples).toBe(4);
    expect(o.awakeMs).toBe(3 * H);
  });

  it('says nothing at all until there are enough windows to have a middle', () => {
    const o = napOutlook(ordinaryDay(1), at(1, 11), dayStartOf);
    expect(o.totalSamples).toBeLessThan(MIN_TOTAL_SAMPLES);
    expect(o.awakeMs).toBe(null);
    expect(o.nextAtMs).toBe(null);
  });

  it('waits for two full days, however many windows one day holds — and speaks on the third', () => {
    // one long day with four windows in it is one day's mood, not a rhythm
    const busy = [
      ...ordinaryDay(1),
      { startMs: at(1, 15), endMs: at(1, 16), kind: 'NAP' as const },
    ];
    const one = napOutlook(
      [...busy, { startMs: at(1, 19), endMs: at(2, 7), kind: 'NIGHT' as const }],
      at(2, 8),
      dayStartOf,
    );
    expect(one.totalSamples).toBeGreaterThanOrEqual(MIN_TOTAL_SAMPLES);
    expect(one.days).toBe(1);
    expect(one.awakeMs).toBe(null);
    expect(one.usualNapMs).toBe(null);
    // two days of ordinary sleep, looked at the next morning: the middle speaks, with its count
    const two = napOutlook(
      [...week(2), { startMs: at(2, 19), endMs: at(3, 7), kind: 'NIGHT' as const }],
      at(3, 8),
      dayStartOf,
    );
    expect(MIN_DAYS).toBe(2);
    expect(two.days).toBe(2);
    expect(two.awakeMs).not.toBe(null);
  });

  it('is `unknown` with no sleep logged at all', () => {
    expect(napOutlook([], at(1, 11), dayStartOf).state).toBe('unknown');
  });

  it('counts the naps already finished today beside the usual number', () => {
    const log = [...week(6), ...ordinaryDay(7)];
    const o = napOutlook(log, at(7, 15), dayStartOf);
    expect(o.napsToday).toBe(2);
    expect(o.napsPerDay).toBe(2);
  });
});

describe('the night is not part of the day', () => {
  /** A night logged the way a feeding household logs it: in three pieces, wakings between. */
  const piecedNight = (d: number): SleepLog[] => [
    { startMs: at(d - 1, 19), endMs: at(d - 1, 23), kind: 'NIGHT' },
    { startMs: at(d - 1, 23, 30), endMs: at(d, 3), kind: 'NIGHT' },
    { startMs: at(d, 3, 40), endMs: at(d, 7), kind: 'NIGHT' },
  ];
  const piecedDay = (d: number): SleepLog[] => [...piecedNight(d), ...ordinaryDay(d).slice(1)];

  it('a night waking is not a wake window, and the day still starts at the morning', () => {
    const w = wakeWindows([...piecedDay(1), ...piecedDay(2)], at(2, 18), dayStartOf);
    // no 30- or 40-minute "windows" at 11 p.m. or 3 a.m.
    expect(w.every(x => x.awakeMs >= 2 * H)).toBe(true);
    // and the FIRST window of each day is 07:00 → 09:00, not a night waking
    expect(w.filter(x => x.position === 1).map(x => x.awakeMs)).toEqual([2 * H, 2 * H]);
  });

  it('an evening sleep the sheet filed as a nap is still the night once the night follows it', () => {
    // put down at 6:50, before a 7:30 "bedtime" setting — filed as a nap — then a feed at 10:30
    const day: SleepLog[] = [
      ...ordinaryDay(1),
      { startMs: at(1, 18, 50), endMs: at(1, 22, 30), kind: 'NAP' },
      { startMs: at(1, 23), endMs: at(2, 7), kind: 'NIGHT' },
    ];
    const w = wakeWindows(day, at(2, 8), dayStartOf);
    const runUp = w.filter(x => x.nextIsNight);
    expect(runUp.map(x => x.awakeMs)).toEqual([4 * H + 20 * M]); // 14:30 → 18:50
    expect(w.some(x => x.awakeMs === 30 * M)).toBe(false); // the 10:30 feed is not a window
  });

  it('a nap logged in two pieces counts as one nap', () => {
    const log: SleepLog[] = [
      ...week(6),
      { startMs: at(6, 19), endMs: at(7, 7), kind: 'NIGHT' },
      { startMs: at(7, 9), endMs: at(7, 9, 30), kind: 'NAP' },
      { startMs: at(7, 9, 40), endMs: at(7, 10), kind: 'NAP' },
    ];
    expect(napOutlook(log, at(7, 11), dayStartOf).napsToday).toBe(1);
  });
});

describe('which sleep comes next', () => {
  it('reads the household’s own evenings: after the last nap, the next sleep is the night', () => {
    const log = [...week(6), ...ordinaryDay(7)];
    const o = napOutlook(log, at(7, 15), dayStartOf); // woke at 14:30 from the second nap
    expect(o.nextKind).toBe('night');
    expect(o.nextAtMs).toBe(at(7, 19));
    expect(o.usualStartMs).toBe(at(7, 19));
    // and after the morning waking it is a nap
    const morning = napOutlook([...week(6), ...ordinaryDay(7).slice(0, 1)], at(7, 8), dayStartOf);
    expect(morning.nextKind).toBe('nap');
  });

  it('holds a bedtime the household holds, whenever the last nap ended', () => {
    // the last nap ends anywhere from 14:00 to 15:30, and bedtime is 19:00 regardless
    const ends = [14 * 60, 15 * 60 + 30, 14 * 60 + 30, 15 * 60, 14 * 60, 15 * 60 + 30];
    const log: SleepLog[] = [];
    ends.forEach((end, i) => {
      const d = i + 1;
      log.push(
        { startMs: at(d - 1, 19), endMs: at(d, 7), kind: 'NIGHT' },
        { startMs: at(d, 9), endMs: at(d, 10), kind: 'NAP' },
        { startMs: at(d, 13), endMs: at(d, 0) + end * M, kind: 'NAP' },
      );
    });
    // today the last nap runs late, to 15:40
    log.push(
      { startMs: at(6, 19), endMs: at(7, 7), kind: 'NIGHT' },
      { startMs: at(7, 9), endMs: at(7, 10), kind: 'NAP' },
      { startMs: at(7, 13), endMs: at(7, 15, 40), kind: 'NAP' },
    );
    const o = napOutlook(log, at(7, 16), dayStartOf);
    expect(o.nextKind).toBe('night');
    // the clock, not "the usual run-up added to 15:40" (which would be past 20:00)
    expect(o.nextAtMs).toBe(at(7, 19));
  });

  it('holds a morning nap at its clock time when that is what the household’s days show', () => {
    // waking anywhere from 06:20 to 07:40, first nap at 09:00 every day
    const wakes = [6 * 60 + 20, 7 * 60 + 40, 7 * 60, 6 * 60 + 40, 7 * 60 + 20, 6 * 60 + 30];
    const log: SleepLog[] = [];
    wakes.forEach((wake, i) => {
      const d = i + 1;
      log.push(
        { startMs: at(d - 1, 19), endMs: at(d, 0) + wake * M, kind: 'NIGHT' },
        { startMs: at(d, 9), endMs: at(d, 10), kind: 'NAP' },
        { startMs: at(d, 13), endMs: at(d, 14, 30), kind: 'NAP' },
      );
    });
    log.push({ startMs: at(6, 19), endMs: at(7, 6, 25), kind: 'NIGHT' });
    const o = napOutlook(log, at(7, 7), dayStartOf);
    expect(o.nextAtMs).toBe(at(7, 9));
  });

  it('…and follows the window when the naps follow the waking instead', () => {
    // the first nap is always two hours after waking, whenever that was
    const wakes = [6 * 60 + 20, 7 * 60 + 40, 7 * 60, 6 * 60 + 40, 7 * 60 + 20, 6 * 60 + 30];
    const log: SleepLog[] = [];
    wakes.forEach((wake, i) => {
      const d = i + 1;
      log.push(
        { startMs: at(d - 1, 19), endMs: at(d, 0) + wake * M, kind: 'NIGHT' },
        { startMs: at(d, 0) + (wake + 120) * M, endMs: at(d, 0) + (wake + 180) * M, kind: 'NAP' },
        { startMs: at(d, 13), endMs: at(d, 14, 30), kind: 'NAP' },
      );
    });
    log.push({ startMs: at(6, 19), endMs: at(7, 6, 25), kind: 'NIGHT' });
    const o = napOutlook(log, at(7, 7), dayStartOf);
    expect(o.nextAtMs).toBe(at(7, 8, 25));
  });
});

describe('recent days count most', () => {
  it('halves an entry’s weight every five days', () => {
    expect(RECENCY_HALF_LIFE_DAYS).toBe(5);
    expect(recencyWeight(0)).toBe(1);
    expect(recencyWeight(5 * DAY)).toBeCloseTo(0.5, 10);
    expect(recencyWeight(10 * DAY)).toBeCloseTo(0.25, 10);
  });

  it('follows a window that lengthened this week, where two flat weeks would still say the old one', () => {
    // nine days of a 2h first window, then five days of 2h 30m
    const log: SleepLog[] = [];
    for (let d = 1; d <= 14; d++) {
      const first = d <= 9 ? 9 * 60 : 9 * 60 + 30;
      log.push(
        { startMs: at(d - 1, 19), endMs: at(d, 7), kind: 'NIGHT' },
        { startMs: at(d, 0) + first * M, endMs: at(d, 0) + (first + 60) * M, kind: 'NAP' },
        { startMs: at(d, 13, 30), endMs: at(d, 15), kind: 'NAP' },
      );
    }
    log.push({ startMs: at(14, 19), endMs: at(15, 7), kind: 'NIGHT' });
    const o = napOutlook(log, at(15, 7, 30), dayStartOf);
    // the flat middle of those fourteen windows is 2h; the recent five outweigh the older nine
    expect(o.awakeMs).toBe(2.5 * H);
    expect(o.nextAtMs).toBe(at(15, 9, 30));
  });
});

describe('asleep in the night', () => {
  it('answers with the household’s usual morning, not a nap length', () => {
    const log: SleepLog[] = [
      ...week(6),
      ...ordinaryDay(7),
      { startMs: at(7, 19), endMs: null, kind: 'NIGHT' },
    ];
    const o = napOutlook(log, at(7, 19, 20), dayStartOf);
    expect(o.state).toBe('asleep');
    expect(o.nextKind).toBe('night');
    expect(o.wakeAtMs).toBe(at(8, 7));
  });

  it('knows a 7 p.m. sleep the sheet filed as a nap is the night, from the first minute', () => {
    const log: SleepLog[] = [
      ...week(6),
      ...ordinaryDay(7),
      { startMs: at(7, 18, 55), endMs: null, kind: 'NAP' },
    ];
    const o = napOutlook(log, at(7, 19), dayStartOf);
    expect(o.nextKind).toBe('night');
    expect(o.wakeAtMs).toBe(at(8, 7));
  });

  it('…and that a late-afternoon catnap is still a nap', () => {
    // a household with a 16:30 catnap most days and a 19:00 bedtime
    const log: SleepLog[] = [];
    for (let d = 1; d <= 6; d++) {
      log.push(...ordinaryDay(d), { startMs: at(d, 16, 30), endMs: at(d, 17), kind: 'NAP' });
    }
    log.push(...ordinaryDay(7), { startMs: at(7, 16, 30), endMs: null, kind: 'NAP' });
    const o = napOutlook(log, at(7, 16, 40), dayStartOf);
    expect(o.nextKind).toBe('nap');
    expect(o.wakeAtMs).toBe(at(7, 17));
  });

  it('knows the bedtime of a toddler whose one nap is before noon, with no afternoon naps to go by', () => {
    /*
      One nap, 11:00 to 12:30, and the night at 19:00 — so every afternoon sleep in the log is a
      night and there is no nap to draw the bedtime line against. The household set its bed time
      to 19:30, so the sheet files an 18:40 bedtime as a NAP. It is the night: the line sits an hour
      before the earliest recent bedtime when there is nothing else to put it by.
    */
    const log: SleepLog[] = [];
    for (let d = 1; d <= 6; d++) {
      log.push(
        { startMs: at(d - 1, 19), endMs: at(d, 7), kind: 'NIGHT' },
        { startMs: at(d, 11), endMs: at(d, 12, 30), kind: 'NAP' },
      );
    }
    log.push(
      { startMs: at(6, 19), endMs: at(7, 7), kind: 'NIGHT' },
      { startMs: at(7, 11), endMs: at(7, 12, 30), kind: 'NAP' },
      { startMs: at(7, 18, 40), endMs: null, kind: 'NAP' },
    );
    const o = napOutlook(log, at(7, 18, 45), dayStartOf);
    expect(o.nextKind).toBe('night');
    expect(o.wakeAtMs).toBe(at(8, 7));
  });

  it('keeps the usual morning in the sentence and drops the clock once it has gone by', () => {
    const log: SleepLog[] = [
      ...week(6),
      ...ordinaryDay(7),
      { startMs: at(7, 19), endMs: null, kind: 'NIGHT' },
    ];
    const o = napOutlook(log, at(8, 7, 30), dayStartOf); // a lie-in, half an hour past the usual
    expect(o.state).toBe('asleep');
    expect(o.wakeAtMs).toBe(null);
    const clock = (ms: number) => `${String(Math.floor((ms % DAY) / H)).padStart(2, '0')}:00`;
    expect(napLengthLine(o, clock)).toBe('Nights usually end about 07:00, over the last 7.');
  });
});

describe('awake in the night', () => {
  it('names no nap at a 2 a.m. waking — the night is not over — and says when mornings start', () => {
    const log: SleepLog[] = [
      ...week(6),
      ...ordinaryDay(7),
      // the night, logged in pieces: down at 19:00, up at 01:50 for a feed
      { startMs: at(7, 19), endMs: at(8, 1, 50), kind: 'NIGHT' },
    ];
    const o = napOutlook(log, at(8, 2, 10), dayStartOf);
    expect(o.state).toBe('awake');
    expect(o.awakeForMs).toBe(20 * M);
    expect(o.nextKind).toBe('night');
    expect(o.nextAtMs).toBe(null);
    expect(o.awakeMs).toBe(null);
    expect(o.usualMorningMs).toBe(at(8, 7));
    // …so no heads-up is planned off it either
    expect(napAsRhythm(o)).toBe(null);
    const clock = (ms: number) => `${String(Math.floor((ms % DAY) / H)).padStart(2, '0')}:00`;
    expect(napLengthLine(o, clock)).toBe('Nights usually end about 07:00, over the last 7.');
  });

  it('starts the day at the household’s own morning, and an early one within the hour of it', () => {
    const log: SleepLog[] = [
      ...week(6),
      { startMs: at(6, 19), endMs: at(7, 6, 15), kind: 'NIGHT' },
    ];
    // 6:15 is inside the hour before the usual 7:00, so this is the morning: the first window
    const o = napOutlook(log, at(7, 6, 30), dayStartOf);
    expect(o.position).toBe(1);
    expect(o.nextKind).toBe('nap');
    expect(o.nextAtMs).not.toBe(null);
  });
});

describe('a gap in the log', () => {
  // six ordinary days, then this morning's waking at 7:00 — and nothing logged after it
  const log: SleepLog[] = [...week(6), { startMs: at(6, 19), endMs: at(7, 7), kind: 'NIGHT' }];

  it('after a day nobody logged, names the night by the usual bedtime alone at pickup', () => {
    // 5:30 pm: the naps happened at daycare and never reached the app
    const o = napOutlook(log, at(7, 17, 30), dayStartOf);
    expect(o.state).toBe('awake');
    expect(o.gap).toBe(true);
    expect(o.awakeSinceMs).toBe(at(7, 7));
    expect(o.nextKind).toBe('night');
    expect(o.basis).toBe('clock');
    expect(o.nextAtMs).toBe(at(7, 19));
    // …and it is not mistaken for a night waking because the last sleep in the log was the night
    expect(o.usualMorningMs).toBe(null);
    const clock = (ms: number) => `${String(Math.floor((ms % DAY) / H)).padStart(2, '0')}:00`;
    expect(napWindowLine(o, 'Ada', clock)).toBe(
      'Ada usually goes down for the night about 19:00, over the last 6.',
    );
  });

  it('says nothing it cannot count, in the daytime', () => {
    // 3 a.m. the next day is not the evening, and nothing has been logged for twenty hours
    const o = napOutlook(log, at(8, 3), dayStartOf);
    expect(o.gap).toBe(true);
    expect(o.nextAtMs).toBe(null);
  });

  it('is not a gap for a stretch the household keeps — and a day stretch is not a night waking', () => {
    // an hour and three-quarters after the morning waking: this household's first window is two
    const o = napOutlook(log, at(7, 8, 45), dayStartOf);
    expect(o.gap).toBe(false);
    expect(o.usualMorningMs).toBe(null);
    expect(o.nextKind).toBe('nap');
    expect(o.nextAtMs).toBe(at(7, 9));
  });

  /**
   * A NAP NOBODY LOGGED, WHILE IT IS HAPPENING (`MISSED_NAP_SHARE`; the owner, 2026-09-26: "consider
   * the human aspect of like forget to logging"). This household's first window is two hours; six
   * hours after the morning waking, with nothing logged since, the nine o'clock nap is far likelier
   * to have happened unlogged than to be still to come. It used to be read as an ordinary long
   * stretch — "Next nap about 9:00 AM" at one in the afternoon.
   */
  it('reads a stretch far past the household’s own window as a nap nobody logged, not a nap time gone', () => {
    // 1.8 × the usual two hours is 3h 36m: at 10:30 the nap is late; at 10:45 it is a gap in the log
    expect(napOutlook(log, at(7, 10, 30), dayStartOf).gap).toBe(false);
    for (const now of [at(7, 10, 45), at(7, 13)]) {
      const o = napOutlook(log, now, dayStartOf);
      expect(o.gap).toBe(true);
      expect(o.awakeSinceMs).toBe(at(7, 7));
      // …never a nap time already gone, and still not a night waking
      if (o.nextAtMs !== null) expect(o.nextAtMs).toBeGreaterThan(now);
      expect(o.usualMorningMs).toBe(null);
    }
    // nothing to count from, so the CLOCK speaks (2026-10-06): at 10:45 the nap this household
    // usually starts at one o'clock is still ahead; at one it has come, and the evening is next
    expect(napOutlook(log, at(7, 10, 45), dayStartOf)).toMatchObject({
      basis: 'clock',
      nextKind: 'nap',
      nextAtMs: at(7, 13),
    });
    expect(napOutlook(log, at(7, 13), dayStartOf)).toMatchObject({
      basis: 'clock',
      nextKind: 'night',
      nextAtMs: at(7, 19),
    });
    expect(MISSED_NAP_SHARE).toBe(1.8);
  });

  /**
   * IT DOES NOT FORGET IN TWO DAYS (the owner, 2026-10-06: "I stop logging actively for 2 days and
   * now it's not showing anything for sleep outlook … I get if it's one week").
   */
  it('names the usual nap by the clock after two quiet days, and forgets only after a week', () => {
    // six ordinary days, then nothing logged since the morning of day 7
    const quiet = (days: number, hour: number) => napOutlook(log, at(7 + days, hour), dayStartOf);
    expect(quiet(2, 8)).toMatchObject({ gap: true, basis: 'clock', nextKind: 'nap' });
    expect(quiet(2, 8).nextAtMs).toBe(at(9, 9));
    expect(quiet(2, 11).nextAtMs).toBe(at(9, 13));
    // in the night it names no nap
    expect(quiet(2, 3).nextAtMs).toBe(null);
    // a week on, nothing current is left to say
    expect(quiet(7, 8).nextAtMs).toBe(null);
    expect(FORGET_AFTER_MS).toBe(7 * DAY);
  });

  it('says when the last logged sleep ended — or that it was over a day ago', () => {
    expect(nothingLoggedSince('6:30 AM', 11 * H)).toBe('No sleep logged since 6:30 AM');
    expect(nothingLoggedSince('6:30 AM', 30 * H)).toBe('No sleep logged in the last day');
  });
});

describe('the whole day moved', () => {
  it('moves every usual clock time once the last two mornings both came early', () => {
    // six ordinary days, then two days that run an hour and a half early from the morning on
    const early = (d: number): SleepLog[] => [
      { startMs: at(d - 1, 17, 30), endMs: at(d, 5, 30), kind: 'NIGHT' },
      { startMs: at(d, 7, 30), endMs: at(d, 8, 30), kind: 'NAP' },
      { startMs: at(d, 11, 30), endMs: at(d, 13), kind: 'NAP' },
    ];
    const log: SleepLog[] = [
      ...week(6),
      ...early(7),
      ...early(8),
      { startMs: at(8, 17, 30), endMs: at(9, 5, 30), kind: 'NIGHT' },
    ];
    const o = napOutlook(log, at(9, 5, 45), dayStartOf);
    // 5:30 is the morning now, not a waking in the night an hour and a half before the usual 7:00
    expect(o.state).toBe('awake');
    expect(o.usualMorningMs).toBe(null);
    expect(o.position).toBe(1);
    // the first nap's usual 9:00 has moved to 7:30 with the day, so window and clock agree
    expect(o.usualStartMs).toBe(at(9, 7, 30));
    expect(o.nextAtMs).toBe(at(9, 7, 30));
  });

  it('is not moved by one early morning', () => {
    const log: SleepLog[] = [
      ...week(6),
      { startMs: at(6, 19), endMs: at(7, 5, 30), kind: 'NIGHT' },
    ];
    const o = napOutlook(log, at(7, 6, 15), dayStartOf);
    // the usual first nap stays at 9:00 on the clock; the window from 5:30 says 7:30; the blend
    // sits between them, and the clock half has not moved
    expect(o.usualStartMs).toBe(at(7, 9));
  });
});

describe('asleep in a nap: the naps that got this far', () => {
  /*
    Six days of a first nap that is either one cycle (40 minutes) or three (1h 40m), alternating —
    the two crowds a household's naps really fall into.
  */
  const twoCrowds = (): SleepLog[] => {
    const log: SleepLog[] = [];
    for (let d = 1; d <= 6; d++) {
      const long = d % 2 === 0;
      log.push(
        { startMs: at(d - 1, 19), endMs: at(d, 7), kind: 'NIGHT' },
        { startMs: at(d, 9), endMs: long ? at(d, 10, 40) : at(d, 9, 40), kind: 'NAP' },
        { startMs: at(d, 13), endMs: at(d, 14, 30), kind: 'NAP' },
      );
    }
    log.push({ startMs: at(6, 19), endMs: at(7, 7), kind: 'NIGHT' });
    return log;
  };

  it('at the start, reads every nap here', () => {
    const log = [...twoCrowds(), { startMs: at(7, 9), endMs: null, kind: 'NAP' as const }];
    const o = napOutlook(log, at(7, 9, 10), dayStartOf);
    expect(o.outlastedSome).toBe(false);
    expect(o.lastingSamples).toBe(6);
    expect(o.lastingNapMs).toBe(o.usualNapMs);
  });

  it('once past the short ones, the end is the middle of the ones that went on', () => {
    const log = [...twoCrowds(), { startMs: at(7, 9), endMs: null, kind: 'NAP' as const }];
    // fifty minutes in: every 40-minute nap is behind it, and three 1h 40m naps got this far
    const o = napOutlook(log, at(7, 9, 50), dayStartOf);
    expect(o.outlastedSome).toBe(true);
    expect(o.lastingBasis).toBe('position');
    expect(o.lastingSamples).toBe(3);
    expect(o.lastingNapMs).toBe(100 * M);
    expect(o.wakeAtMs).toBe(at(7, 10, 40));
    const clock = (ms: number) =>
      `${Math.floor((ms % DAY) / H)}:${String(Math.round((ms % H) / M)).padStart(2, '0')}`;
    expect(napLengthLine(o, clock)).toBe(
      'Naps here that got this far usually ran about 1h 40m, to about 10:40, over the last 3.',
    );
  });

  it('gives no end time rather than one already gone, when no nap here or anywhere got this far', () => {
    const log = [...twoCrowds(), { startMs: at(7, 9), endMs: null, kind: 'NAP' as const }];
    const o = napOutlook(log, at(7, 11, 45), dayStartOf); // 2h 45m in; the longest nap was 1h 40m
    expect(o.state).toBe('asleep');
    expect(o.wakeAtMs).toBe(null);
    expect(o.lastingNapMs).toBe(null);
    // the usual stays, as a usual, so the card is not left saying nothing
    expect(o.usualNapMs).not.toBe(null);
    const line = napLengthLine(o, () => 'x') ?? '';
    expect(line).toMatch(/^Naps here usually run about .*, over the last 6\.$/);
    expect(line).not.toContain('to about');
  });
});

describe('the first sleep in the log, on the timer', () => {
  /*
    TAPPING START ON A HOUSEHOLD'S FIRST NAP CRASHED TODAY (the owner, 2026-09-26: "Starting sleep
    timer calls an error, and app crashed" — TypeError: Cannot read property 'night' of undefined).
    The asleep branch places a running nap by the sleep before it, and the first sleep in the log
    has none: `positionAfter` read `sleeps[-1].night`. A running timer has reached this branch
    since the outlook began reading it as the open sleep (2026-09-24), so every first nap on the
    timer threw, on every draw of Today, for as long as it ran.
  */
  const napFrom = (d: number, h: number, m = 0): SleepLog => ({
    startMs: at(d, h, m),
    endMs: null,
    kind: 'NAP',
  });

  it('a running nap with nothing logged before it is asleep, at the day’s first window', () => {
    const o = napOutlook([napFrom(1, 13)], at(1, 13, 5), dayStartOf);
    expect(o).toMatchObject({
      state: 'asleep',
      nextKind: 'nap',
      position: 1,
      asleepSinceMs: at(1, 13),
      asleepForMs: 5 * M,
      // nothing to read a length from: no usual and no end time, never a guess
      usualNapMs: null,
      wakeAtMs: null,
      totalSamples: 0,
    });
  });

  it('…and so is one put back down within twenty minutes of the only sleep before it', () => {
    // the two pieces are one sleep (`MIN_AWAKE_MS`), so the log again holds a single sleep — for
    // its place in the day. Asleep since is the running timer's own (2026-10-06): the card says
    // what the timer says
    const log: SleepLog[] = [
      { startMs: at(1, 13), endMs: at(1, 13, 30), kind: 'NAP' },
      napFrom(1, 13, 40),
    ];
    const o = napOutlook(log, at(1, 13, 50), dayStartOf);
    expect(o).toMatchObject({ state: 'asleep', position: 1, asleepSinceMs: at(1, 13, 40) });
    expect(o.asleepForMs).toBe(10 * M);
  });

  it('once it ends, the window after it is the second — the count that made it the first', () => {
    const o = napOutlook(
      [{ startMs: at(1, 13), endMs: at(1, 14), kind: 'NAP' }],
      at(1, 15),
      dayStartOf,
    );
    expect(o).toMatchObject({ state: 'awake', position: 2, napsToday: 1 });
  });

  it('a first sleep after bedtime is the night, and asks for no position at all', () => {
    const o = napOutlook(
      [{ startMs: at(1, 20), endMs: null, kind: 'NIGHT' }],
      at(1, 20, 30),
      dayStartOf,
    );
    expect(o).toMatchObject({ state: 'asleep', nextKind: 'night', asleepForMs: 30 * M });
  });
});

describe('the notification', () => {
  it('plans off the outlook’s own next sleep, nap or night', () => {
    const o = napOutlook([...week(6), ...ordinaryDay(7)], at(7, 15), dayStartOf);
    const r = napAsRhythm(o);
    expect(r?.nextAtMs).toBe(at(7, 19));
    expect(r?.lastAtMs).toBe(at(7, 14, 30));
    expect(r?.medianGapMs).toBe(4.5 * H);
  });

  /*
    ITS OWN LEAD AND ITS OWN WORDS (2026-09-28): fifteen minutes ahead, whatever the stretch, and
    which sleep it is with the usual stretch awake before it, for the heads-up to say.
  */
  it('carries fifteen minutes’ lead, which sleep comes next, and the usual stretch before it', () => {
    expect(NAP_HEADS_UP_LEAD_MS).toBe(15 * M);
    const night = napAsRhythm(napOutlook([...week(6), ...ordinaryDay(7)], at(7, 15), dayStartOf));
    expect(night).toMatchObject({ leadMs: 15 * M, nap: { kind: 'night', windowMs: 4.5 * H } });
    const log = [...week(6), { startMs: at(6, 19), endMs: at(7, 7), kind: 'NIGHT' as const }];
    const nap = napAsRhythm(napOutlook(log, at(7, 8), dayStartOf));
    expect(nap).toMatchObject({
      nextAtMs: at(7, 9),
      leadMs: 15 * M,
      samples: 6,
      nap: { kind: 'nap', windowMs: 2 * H },
    });
  });

  it('names no stretch where it went by the usual bedtime alone', () => {
    const o = napOutlook([...week(6), ...ordinaryDay(7)], at(7, 15), dayStartOf);
    const r = napAsRhythm({ ...o, basis: 'clock', awakeMs: null, samples: 6 });
    expect(r?.nap).toEqual({ kind: 'night', windowMs: null });
  });

  /*
    WHOSE LOG IT READ (2026-10-01): the planner stands a sleep heads-up down for that child's own
    set nap times or bedtime, so the child rides on the rhythm when the caller names one.
  */
  it('carries the child whose log it read, when the caller names one, and nothing when not', () => {
    const o = napOutlook([...week(6), ...ordinaryDay(7)], at(7, 15), dayStartOf);
    expect(napAsRhythm(o, 'c-ada')?.nap).toEqual({
      kind: 'night',
      windowMs: 4.5 * H,
      childId: 'c-ada',
    });
    expect(napAsRhythm(o, null)?.nap?.childId).toBeNull();
    expect(napAsRhythm(o)?.nap).not.toHaveProperty('childId');
  });
});

describe('the sentences', () => {
  const log = [...week(6), { startMs: at(6, 19), endMs: at(7, 7), kind: 'NIGHT' as const }];
  const o = napOutlook(log, at(7, 8), dayStartOf);
  // the same household at 3 p.m., after the last nap: the night comes next
  const night = napOutlook([...week(6), ...ordinaryDay(7)], at(7, 15), dayStartOf);
  const clock = (ms: number) => `${String(Math.floor((ms % DAY) / H)).padStart(2, '0')}:00`;
  const all = [
    napWatching(0, 0),
    napWatching(1, 1),
    napWatching(3, 1),
    awakeFor(80 * M),
    asleepFor(35 * M),
    NAP_ASLEEP_LABEL,
    NAP_AWAKE_LABEL,
    napClockLabel({ ...o, state: 'asleep', wakeAtMs: at(7, 10) }) ?? '',
    napClockLabel({ ...night, nextKind: 'night', nextAtMs: at(7, 19) }) ?? '',
    napClockLabel({ ...o, state: 'awake', nextKind: 'nap', nextAtMs: at(7, 10), wakeAtMs: null }) ??
      '',
    napWindowLine(o, 'Ada') ?? '',
    napWindowLine(o, 'Ada', clock) ?? '',
    napWindowLine({ ...o, basis: 'pooled' }, 'Ada') ?? '',
    napWindowLine(night, 'Ada', clock) ?? '',
    napWindowLine(night, '', clock) ?? '',
    nextSleepLine('nap', '9:00 AM'),
    nextSleepLine('night', '7:00 PM'),
    nextSleepLine(null, '9:00 AM'),
    napLengthLine({ ...o, usualNapMs: 70 * M, wakeAtMs: at(7, 10), napSamples: 7 }, clock) ?? '',
    napLengthLine(
      {
        ...o,
        usualNapMs: 45 * M,
        lastingNapMs: 95 * M,
        lastingSamples: 4,
        lastingBasis: 'pooled',
        outlastedSome: true,
        wakeAtMs: at(7, 10, 35),
        napSamples: 9,
      },
      clock,
    ) ?? '',
    napLengthLine(
      { ...o, nextKind: 'night', usualMorningMs: at(7, 7), morningSamples: 6 },
      clock,
    ) ?? '',
    napWindowLine(
      { ...o, basis: 'clock', nextKind: 'night', usualStartMs: at(7, 19), samples: 6 },
      'Ada',
      clock,
    ) ?? '',
    nothingLoggedSince('6:30 AM', 11 * H),
    nothingLoggedSince('6:30 AM', 30 * H),
    NAP_GAP_LINE,
    napsTodayLine(o),
    positionWord(1),
    positionWord(9),
    NAP_METHOD,
    NAP_HEADER,
    NAP_LOCKED,
    NAP_LOCKED_BODY,
    SLEEP_STALE,
    SLEEP_STALE_MORE,
    SLEEP_LEARNING,
    SLEEP_LEARNING_BODY,
    SLEEP_ACTIVE_LEARNING,
    SLEEP_UNAVAILABLE,
    SLEEP_PASSED,
    SLEEP_ESTIMATE,
    sleepStaleWake('9:55 AM'),
    sleepSpan(35 * M),
    sleepSpan(90 * M),
    napsTodayCount(1),
    napsTodayCount(2),
    // the heads-up (2026-09-28): a notification, so held to the card's line and then some
    napHeadsUpTitle('nap', 'Ada', '9:00 AM'),
    napHeadsUpTitle('night', 'Ada', '7:00 PM'),
    napHeadsUpTitle('nap', '', '9:00 AM'),
    napHeadsUpLine('nap', 2 * H, 6),
    napHeadsUpLine('night', 4.5 * H, 6),
    napHeadsUpLine('night', null, 6),
    napHeadsUpPart('nap', '9:00 AM', 2 * H, 6),
    napHeadsUpPart('night', '7:00 PM', null, 6),
  ].join(' \n ');

  it('describes the household’s own numbers and diagnoses nothing', () => {
    for (const word of BANNED) expect(all.toLowerCase(), word).not.toContain(word);
  });

  /*
    THE HEADS-UP'S WORDS (2026-09-28): the prediction with its clock, and where the number came
    from with its count. Never how the baby is — no tired, no sleepy — never an instruction, no
    pronoun (the phone knows a name, not how a baby is referred to), and no dash.
  */
  it('says the heads-up as the log’s arithmetic: the sleep, its clock, the stretch and the count', () => {
    expect(napHeadsUpTitle('nap', 'Chiara', '10:40 AM')).toBe(
      'Nap time for Chiara around 10:40 AM',
    );
    expect(napHeadsUpTitle('night', 'Chiara', '7:10 PM')).toBe('Bedtime for Chiara around 7:10 PM');
    expect(napHeadsUpTitle('nap', '', '10:40 AM')).toBe('Nap time around 10:40 AM');
    expect(napHeadsUpLine('nap', 130 * M, 9)).toBe(
      'Naps have started about 2h 10m after waking, over the last 9.',
    );
    expect(napHeadsUpLine('night', null, 6)).toBe(
      'Nights have started around then, over the last 6.',
    );
    expect(napHeadsUpPart('nap', '10:40 AM', 130 * M, 9)).toBe(
      'Nap time around 10:40 AM: naps have started about 2h 10m after waking, over the last 9.',
    );
    const heads = [
      napHeadsUpTitle('nap', 'Ada', '9:00 AM'),
      napHeadsUpTitle('night', 'Ada', '7:00 PM'),
      napHeadsUpLine('nap', 2 * H, 6),
      napHeadsUpLine('night', null, 6),
      napHeadsUpPart('night', '7:00 PM', 4.5 * H, 6),
    ];
    for (const s of heads) {
      expect(s, s).not.toMatch(/tired|sleepy|should|need|ready|\b(she|he|her|his|him)\b/i);
      expect(s, s).not.toMatch(/[—–]| - /);
    }
  });

  it('never compares one window to another — no longer, no shorter, no drift', () => {
    // "later in the day" is a position, not a verdict, so lateness words are not on this list —
    // what is on it is every way of saying one number is bigger than another
    for (const word of ['longer', 'shorter', 'more than', 'less than', 'drift', 'usually longer']) {
      expect(all.toLowerCase(), word).not.toContain(word);
    }
  });

  it('names the clock on the closed card, so the end of this sleep is not the next one', () => {
    expect(napClockLabel({ ...o, state: 'asleep', wakeAtMs: at(7, 10) })).toBe('Usually up');
    expect(napClockLabel({ ...night, nextKind: 'night', nextAtMs: at(7, 19) })).toBe('Bedtime');
    expect(
      napClockLabel({ ...o, state: 'awake', nextKind: 'nap', nextAtMs: at(7, 10), wakeAtMs: null }),
    ).toBe('Next nap');
    expect(
      napClockLabel({
        ...o,
        state: 'awake',
        nextKind: 'night',
        nextAtMs: null,
        wakeAtMs: null,
        usualMorningMs: at(7, 7),
      }),
    ).toBe('Usually up');
    expect(napClockLabel({ ...o, state: 'asleep', wakeAtMs: null })).toBeNull();
    expect(NAP_ASLEEP_LABEL).toBe('Asleep');
    expect(NAP_AWAKE_LABEL).toBe('Awake');
  });

  it('always carries how many entries it came from', () => {
    expect(napWindowLine(o, 'Ada')).toContain('over the last 6');
    expect(napWatching(3, 1)).toContain('3 wake windows over 1 day');
  });

  it('while it is still collecting, shows the count and asks them to keep logging', () => {
    expect(napWatching(0, 0)).toBe(
      'Every nap and night you log fills this in. The usual awake time shows here after 2 full days.',
    );
    expect(napWatching(1, 1)).toBe(
      '1 wake window over 1 day so far. Keep logging. The usual awake time shows here after 2 full days.',
    );
    expect(napWatching(3, 2)).toBe(
      '3 wake windows over 2 days so far. Keep logging. A few more wake windows and the usual awake time shows here.',
    );
  });

  it('names both halves of the prediction: the window from the waking, and the clock', () => {
    expect(napWindowLine(o, 'Ada', clock)).toBe(
      'Ada is usually awake about 2h after the night, and down about 09:00, over the last 6.',
    );
  });

  it('says which sleep it means — the night gets its own words, not a nap’s', () => {
    expect(night.nextKind).toBe('night');
    expect(napWindowLine(night, 'Ada', clock)).toBe(
      'Ada is usually awake about 4h 30m before the night, and down about 19:00, over the last 6.',
    );
    expect(nextSleepLine('night', '7:00 PM')).toBe(
      'Night sleep about 7:00 PM if today runs like the usual.',
    );
    expect(nextSleepLine('nap', '9:00 AM')).toBe(
      'Next nap about 9:00 AM if today runs like the usual.',
    );
  });

  it('keeps the conditional on the prediction: it is an if, not a plan', () => {
    for (const kind of ['nap', 'night', null] as const) {
      expect(nextSleepLine(kind, '9:00 AM')).toContain('if today runs like the usual');
    }
  });

  it('spells a duration the way every other card does', () => {
    expect(napLength(90 * M)).toBe('1h 30m');
    expect(napLength(35 * M)).toBe('35m');
    expect(napLength(2 * H)).toBe('2h');
  });

  it('spells the big now figure in hours and minutes, with no seconds', () => {
    expect(sleepSpan(35 * M)).toBe('35 min');
    expect(sleepSpan(45 * M)).toBe('45 min');
    expect(sleepSpan(90 * M)).toBe('1h 30m');
    expect(sleepSpan(65 * M)).toBe('1h 05m');
    expect(sleepSpan(2 * H)).toBe('2h');
    expect(sleepSpan(35 * M + 40_000)).toBe('35 min');
    expect(sleepSpan(50_000)).toBe('0 min');
  });
});

describe('the sleep running now is the one the outlook speaks of (2026-10-06)', () => {
  // the owner's screenshot: a night logged 9:00 PM → 2:27 PM, and a nap timer started at 2:29 PM
  const logs: SleepLog[] = [
    ...week(6),
    { startMs: at(6, 21), endMs: at(7, 14, 27), kind: 'NIGHT' },
    { startMs: at(7, 14, 29), endMs: null, kind: 'NAP' },
  ];
  const now = at(7, 19, 57);

  it('reads asleep since the running timer’s own start, not the night two minutes before it', () => {
    const o = napOutlook(logs, now, dayStartOf);
    expect(o.state).toBe('asleep');
    expect(o.asleepSinceMs).toBe(at(7, 14, 29));
    expect(o.asleepForMs).toBe(5 * H + 28 * M);
  });

  it('still reads the night two minutes before it as the sleep it continues, for the patterns', () => {
    const o = napOutlook(logs, now, dayStartOf);
    // a sleep that has run past five hours since 9 p.m. is the night, as before; only the clock
    // beside the timer changed
    expect(o.nextKind).toBe('night');
  });

  it('still joins two FINISHED pieces of one sleep, as the patterns always have', () => {
    const ended = logs.map(l => (l.endMs === null ? { ...l, endMs: at(7, 19) } : l));
    const o = napOutlook(ended, now, dayStartOf);
    expect(o.state).toBe('awake');
    // no two-minute wake window between the pieces
    expect(wakeWindows(ended, now, dayStartOf).every(w => w.awakeMs >= 20 * M)).toBe(true);
  });
});
