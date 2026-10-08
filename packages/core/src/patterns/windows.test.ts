/**
 * The usual windows, held to the rule that defines them (CLAUDE.md §2 rule 6): descriptive, with
 * the sample size in the sentence, and never a prediction, a recommendation or an instruction.
 *
 * Three kinds of check, and the third is the one that matters most:
 *
 *   · the arithmetic — one sighting per day, the spread, the tight cluster, the boundaries;
 *   · the minimum N — four sightings is a wait, five is a window, and nothing in between;
 *   · the lint — `reportBannedHits` over every string the feature can produce, at every sample
 *     size from one to a full fortnight, because the defect this feature is capable of is a
 *     well-meant edit to a sentence rather than a wrong number.
 */
import { describe, expect, it } from 'vitest';
import { reportBannedHits } from '../reports/observations';
import { shiftDay, zonedToUtc } from '../today/day';
import type { TodayActivity } from '../today/rows';
import {
  allUsualWindowLines,
  usualBlankDaysLine,
  usualClusterLine,
  usualHourWord,
  usualLengthLine,
  usualWatchLine,
  usualWindowClock,
  usualWindowLine,
  USUAL_WINDOW_LABEL,
} from './copy';
import {
  usualWindowDays,
  usualWindowFromMs,
  usualWindows,
  usualWindowsEmpty,
  USUAL_WINDOW_DAYS,
  USUAL_WINDOW_MIN_SAMPLES,
  type UsualWindowId,
  type UsualWindows,
} from './windows';

const TZ = 'America/Los_Angeles';
/** Noon on 18 Sep 2026 — so the fortnight the card measures is the 4th to the 17th. */
const NOW = zonedToUtc(TZ, 2026, 9, 18, 12);
const DAYS = usualWindowDays(TZ, NOW);
const at = (day: number, h: number, m = 0): number => zonedToUtc(TZ, 2026, 9, day, h, m);

let seq = 0;
const row = (over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>) => {
  seq += 1;
  return {
    id: `p${seq}`,
    childId: 'kid',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  } as TodayActivity;
};

const feed = (day: number, h: number, m = 0) => row({ type: 'bottle', startMs: at(day, h, m) });
const nap = (day: number, h: number, m = 0) =>
  row({ type: 'sleep', sleepKind: 'NAP', startMs: at(day, h, m), endMs: at(day, h + 1, m) });
const night = (day: number, h: number, m = 0, hours = 6) =>
  row({
    type: 'sleep',
    sleepKind: 'NIGHT',
    startMs: at(day, h, m),
    endMs: at(day, h + hours, m),
  });

const windowFor = (w: UsualWindows, id: UsualWindowId) => w.windows.find(x => x.id === id);
/** The 14 days the card measures, oldest first. */
const EVERY_DAY = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

describe('the fortnight is fourteen complete days, ending yesterday', () => {
  it('walks the calendar and stops before today', () => {
    expect(DAYS).toHaveLength(USUAL_WINDOW_DAYS);
    expect(DAYS[0]?.startMs).toBe(at(4, 0));
    expect(DAYS[USUAL_WINDOW_DAYS - 1]?.startMs).toBe(at(17, 0));
    // today is half a day: counting it would score every evening window as one miss until
    // the evening arrived
    expect(DAYS.some(d => d.startMs === at(18, 0))).toBe(false);
    expect(usualWindowFromMs(TZ, NOW)).toBe(at(4, 0));
  });

  it('is built from the calendar rather than from 24-hour steps, so DST cannot shift it', () => {
    // 8 March 2026 is a 23-hour day in Los Angeles
    const afterDst = zonedToUtc(TZ, 2026, 3, 12, 12);
    const days = usualWindowDays(TZ, afterDst);
    expect(days).toHaveLength(USUAL_WINDOW_DAYS);
    for (const d of days) expect(d.endMs).toBeGreaterThan(d.startMs);
    // and a 9 a.m. nap on the short day is still at minute 540, not at 480
    const rows = EVERY_DAY.map((_, i) =>
      row({
        type: 'sleep',
        sleepKind: 'NAP',
        startMs: zonedToUtc(TZ, 2026, 3, 12 - USUAL_WINDOW_DAYS + i, 9, 0),
        endMs: zonedToUtc(TZ, 2026, 3, 12 - USUAL_WINDOW_DAYS + i, 10, 0),
      }),
    );
    const w = windowFor(usualWindows(rows, days, TZ), 'morningNap');
    expect(w?.clock).toMatchObject({ from: 9 * 60, to: 9 * 60, median: 9 * 60 });
  });
});

describe('the window maths', () => {
  it('takes one sighting a day, so a busy morning does not count three times', () => {
    const rows = EVERY_DAY.flatMap(d => [feed(d, 7, 0), feed(d, 7, 30), feed(d, 11, 0)]);
    const w = windowFor(usualWindows(rows, DAYS, TZ), 'firstFeed');
    expect(w?.samples).toBe(14);
    expect(w?.clock).toMatchObject({ from: 7 * 60, to: 7 * 60 });
  });

  it('a bottle of water is not a feed: the first feed is the first bottle of milk (M7)', () => {
    const rows = EVERY_DAY.flatMap(d => [
      row({ type: 'bottle', bottleKind: 'WATER', startMs: at(d, 5, 30) }),
      feed(d, 7, 0),
    ]);
    const w = windowFor(usualWindows(rows, DAYS, TZ), 'firstFeed');
    expect(w?.clock).toMatchObject({ from: 7 * 60, to: 7 * 60 });
  });

  it('spreads from the earliest to the latest, and clusters where the days actually landed', () => {
    // twelve mornings between 6:40 and 7:10, and one outlier at 5:40
    const starts = [400, 400, 405, 410, 415, 420, 420, 425, 425, 425, 430, 430, 340];
    const rows = starts.map((minute, i) =>
      feed(EVERY_DAY[i] as number, Math.floor(minute / 60), minute % 60),
    );
    const w = windowFor(usualWindows(rows, DAYS, TZ), 'firstFeed');
    expect(w?.samples).toBe(13);
    // the honest headline is the whole spread, outlier included
    expect(w?.clock.from).toBe(340);
    expect(w?.clock.to).toBe(430);
    // and the tight window holds at least half of them, in the minutes they clustered in
    expect(w?.cluster.count).toBeGreaterThanOrEqual(7);
    expect(w?.cluster.from).toBeGreaterThanOrEqual(400);
    expect(w?.cluster.to).toBeLessThanOrEqual(430);
    expect((w?.cluster.to ?? 0) - (w?.cluster.from ?? 0)).toBeLessThan(90);
  });

  it('counts the cluster rather than assuming it, so ties are not rounded away', () => {
    const rows = EVERY_DAY.slice(0, 7).map(d => feed(d, 7, 0));
    const w = windowFor(usualWindows(rows, DAYS, TZ), 'firstFeed');
    expect(w?.cluster).toMatchObject({ from: 420, to: 420, count: 7 });
    // every sighting is inside the cluster, so the second sentence would repeat the first
    expect(usualClusterLine(w!)).toBeNull();
  });

  it('takes the median of an even sample from the two middle values', () => {
    const minutes = [400, 410, 420, 430, 440, 450];
    const rows = minutes.map((m, i) => feed(EVERY_DAY[i] as number, Math.floor(m / 60), m % 60));
    const w = windowFor(usualWindows(rows, DAYS, TZ), 'firstFeed');
    expect(w?.clock.median).toBe(425);
  });
});

describe('the morning nap is a definition, and the card prints it', () => {
  it('ignores a sleep the parent marked as night, whatever the clock says', () => {
    const rows = EVERY_DAY.flatMap(d => [night(d, 6), nap(d, 9, 20)]);
    const w = windowFor(usualWindows(rows, DAYS, TZ), 'morningNap');
    expect(w?.clock.from).toBe(9 * 60 + 20);
  });

  it('holds its boundaries: before 5 a.m. and from noon on are not a morning nap', () => {
    const early = EVERY_DAY.map(d => nap(d, 4, 30));
    const late = EVERY_DAY.map(d => nap(d, 12, 10));
    expect(windowFor(usualWindows(early, DAYS, TZ), 'morningNap')).toBeUndefined();
    expect(windowFor(usualWindows(late, DAYS, TZ), 'morningNap')).toBeUndefined();
    const inside = EVERY_DAY.map(d => nap(d, 11, 59));
    expect(windowFor(usualWindows(inside, DAYS, TZ), 'morningNap')?.samples).toBe(14);
  });
});

describe('bedtime belongs to the evening it began in', () => {
  it('prefers the sleep the parent called night, and keeps the catnap out of it', () => {
    const rows = EVERY_DAY.flatMap(d => [nap(d, 17, 15), night(d, 19, 30)]);
    const w = windowFor(usualWindows(rows, DAYS, TZ), 'bedtime');
    expect(w?.clock).toMatchObject({ from: 19 * 60 + 30, to: 19 * 60 + 30 });
  });

  it('falls back to the first sleep from 6 p.m. when a household never marks one as night', () => {
    // the entry sheet defaults a sleep to NAP, so this is the common household, not the odd one
    const rows = EVERY_DAY.flatMap(d => [nap(d, 17, 15), nap(d, 19, 0)]);
    const w = windowFor(usualWindows(rows, DAYS, TZ), 'bedtime');
    expect(w?.clock.from).toBe(19 * 60);
  });

  it('counts a 00:20 bedtime as that evening’s, past the 1440th minute', () => {
    // every one of these is logged on the following calendar day, and every one of them belongs
    // to the evening before it — including the 00:20 that falls in the small hours of today,
    // because the evening it belongs to is yesterday, and yesterday is complete
    const rows = EVERY_DAY.map(d => night(d + 1, 0, 20));
    const w = windowFor(usualWindows(rows, DAYS, TZ), 'bedtime');
    expect(w?.samples).toBe(USUAL_WINDOW_DAYS);
    expect(w?.clock.from).toBe(1440 + 20);
    expect(usualWindowLine(w!)).toContain('12:20 a.m.');
  });
});

describe('the longest stretch at night is a length as well as a time', () => {
  it('takes the longest finished sleep of the night and carries both numbers', () => {
    const rows = EVERY_DAY.flatMap(d => [
      night(d, 20, 0, 3),
      row({ type: 'sleep', sleepKind: 'NIGHT', startMs: at(d, 23, 0), endMs: at(d + 1, 5, 0) }),
    ]);
    const w = windowFor(usualWindows(rows, DAYS, TZ), 'longestNight');
    expect(w?.samples).toBe(14);
    expect(w?.clock.from).toBe(23 * 60);
    expect(w?.length).toMatchObject({ from: 360, to: 360, median: 360 });
    expect(usualLengthLine(w!)).toBe('Those stretches were all 6h.');
  });

  it('will not take a sleep that is still running — it has no length yet', () => {
    const rows = EVERY_DAY.map(d => row({ type: 'sleep', sleepKind: 'NIGHT', startMs: at(d, 21) }));
    expect(windowFor(usualWindows(rows, DAYS, TZ), 'longestNight')).toBeUndefined();
    // and it is not even something to wait for, because none of those days holds one
    expect(usualWindows(rows, DAYS, TZ).watching.some(x => x.id === 'longestNight')).toBe(false);
  });

  it('reports the spread of lengths and the middle one, and nothing about a direction', () => {
    const hours = [4, 5, 5, 6, 6, 6, 7, 7, 8];
    const rows = hours.map((h, i) => night(EVERY_DAY[i] as number, 21, 0, h));
    const w = windowFor(usualWindows(rows, DAYS, TZ), 'longestNight');
    expect(w?.length).toMatchObject({ from: 240, to: 480, median: 360 });
    const line = usualLengthLine(w!);
    expect(line).toBe('Those stretches ran from 4h to 8h. The middle one was 6h.');
    expect(line).not.toMatch(/longer|shorter|improv|better|worse/i);
  });
});

describe('a window needs five days before it exists', () => {
  const build = (n: number) =>
    usualWindows(
      EVERY_DAY.slice(0, n).map(d => feed(d, 7)),
      DAYS,
      TZ,
    );

  it('says it is still watching at four, and draws a window at five', () => {
    expect(USUAL_WINDOW_MIN_SAMPLES).toBe(5);
    const four = build(4);
    expect(four.windows).toEqual([]);
    expect(four.watching).toEqual([{ id: 'firstFeed', days: 14, samples: 4, needed: 5 }]);
    expect(usualWatchLine(four.watching[0]!)).toBe(
      '4 of the last 14 days carry a feed. A window appears once there are 5.',
    );

    const five = build(5);
    expect(five.watching).toEqual([]);
    expect(five.windows.map(w => w.id)).toEqual(['firstFeed']);
    expect(five.windows[0]?.samples).toBe(5);
  });

  it('says nothing at all about an event this household has never logged', () => {
    const w = build(6);
    expect(w.windows.map(x => x.id)).toEqual(['firstFeed']);
    expect(w.watching).toEqual([]);
    expect(usualWindowsEmpty(w)).toBe(false);
  });

  it('is empty, not wrong, for a household with nothing in the fortnight', () => {
    const w = usualWindows([], DAYS, TZ);
    expect(w).toMatchObject({ days: 14, loggedDays: 0, windows: [], watching: [] });
    expect(usualWindowsEmpty(w)).toBe(true);
  });

  it('is empty for a household that only started logging today', () => {
    const w = usualWindows([feed(18, 7), nap(18, 9)], DAYS, TZ);
    expect(usualWindowsEmpty(w)).toBe(true);
  });
});

describe('a household whose bedtime is moving', () => {
  /** Bedtime walks from 6:30 p.m. to 8:20 p.m. across the fortnight, ten minutes a day. */
  const drifting = EVERY_DAY.map((d, i) => night(d, 18, 30 + i * 10));

  it('widens the window instead of naming a direction', () => {
    const w = windowFor(usualWindows(drifting, DAYS, TZ), 'bedtime');
    expect(w?.samples).toBe(14);
    expect(w?.clock.from).toBe(18 * 60 + 30);
    expect(w?.clock.to).toBe(20 * 60 + 40);
    // the cluster is narrower than the spread, and it is still a window rather than a trend
    expect((w?.cluster.to ?? 0) - (w?.cluster.from ?? 0)).toBeLessThan(
      (w?.clock.to ?? 0) - (w?.clock.from ?? 0),
    );
    const lines = [usualWindowLine(w!), usualClusterLine(w!)].filter(
      (s): s is string => s !== null,
    );
    expect(lines[0]).toBe(
      'The first sleep of the evening began between 6:30 p.m. and 8:40 p.m. on 14 of the last 14 days.',
    );
    for (const line of lines) {
      expect(line).not.toMatch(/\b(later|earlier|drift|trend|moving|changing|since last)\b/i);
      expect(reportBannedHits(line)).toEqual([]);
    }
  });

  it('never splits the fortnight into an earlier half and a later one', () => {
    // the whole guard against a trend: there is one pooled sample and no second number to
    // compare it to, so no sentence can be written that names a direction
    const w = windowFor(usualWindows(drifting, DAYS, TZ), 'bedtime');
    expect(Object.keys(w ?? {}).sort()).toEqual([
      'clock',
      'cluster',
      'days',
      'id',
      'length',
      'samples',
    ]);
  });
});

describe('a household with no pattern at all', () => {
  /** Feeds scattered from 5 a.m. to 11 a.m. — a window that is honest about being wide. */
  const scattered = [300, 660, 330, 600, 420, 540, 315, 645, 480, 390, 570, 345, 615, 450].map(
    (m, i) => feed(EVERY_DAY[i] as number, Math.floor(m / 60), m % 60),
  );

  it('draws the window it actually has, wide, rather than inventing a narrow one', () => {
    const w = windowFor(usualWindows(scattered, DAYS, TZ), 'firstFeed');
    expect(w?.clock).toMatchObject({ from: 300, to: 660 });
    expect(usualWindowLine(w!)).toBe(
      'The first feed was logged between 5:00 a.m. and 11:00 a.m. on 14 of the last 14 days.',
    );
    // the cluster still says where half of them were, and it is visibly not a narrow claim
    expect((w?.cluster.to ?? 0) - (w?.cluster.from ?? 0)).toBeGreaterThan(120);
  });

  it('separates a day nobody logged from a day the baby did something else', () => {
    const half = usualWindows(scattered.slice(0, 7), DAYS, TZ);
    expect(half.loggedDays).toBe(7);
    expect(usualBlankDaysLine(half)).toBe('7 of those 14 days have nothing logged at all.');
    const all = usualWindows(scattered, DAYS, TZ);
    expect(usualBlankDaysLine(all)).toBeNull();
  });
});

describe('the clock is the one in the room', () => {
  it('writes a window in US form, and wraps past midnight', () => {
    expect(usualWindowClock(6 * 60 + 5)).toBe('6:05 a.m.');
    expect(usualWindowClock(12 * 60)).toBe('12:00 p.m.');
    expect(usualWindowClock(0)).toBe('12:00 a.m.');
    expect(usualWindowClock(1440 + 20)).toBe('12:20 a.m.');
    expect(usualWindowClock(23 * 60 + 59)).toBe('11:59 p.m.');
  });

  it('writes a boundary as a word where there is one', () => {
    expect(usualHourWord(5 * 60)).toBe('5 a.m.');
    expect(usualHourWord(12 * 60)).toBe('noon');
    expect(usualHourWord(0)).toBe('midnight');
    expect(usualHourWord(31 * 60)).toBe('7 a.m.');
  });
});

describe('every sentence the feature can write', () => {
  /** One household per sample size, with all four events at that size. */
  const householdOf = (n: number): UsualWindows => {
    const days = EVERY_DAY.slice(0, n);
    const rows = days.flatMap((d, i) => [
      feed(d, 6, 40 + i),
      nap(d, 9, 5 + i * 3),
      night(d, 19, 10 + i * 5, 4 + (i % 3)),
    ]);
    return usualWindows(rows, DAYS, TZ);
  };

  it('carries no verdict, no advice, no comparison — at every sample size', () => {
    let checked = 0;
    for (let n = 0; n <= USUAL_WINDOW_DAYS; n += 1) {
      const w = householdOf(n);
      const lines = allUsualWindowLines(w);
      expect(lines.length).toBeGreaterThan(8);
      for (const line of lines) {
        expect({ n, line, hits: reportBannedHits(line) }).toEqual({ n, line, hits: [] });
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('prints its sample size in the sentence, never only beside it', () => {
    for (let n = USUAL_WINDOW_MIN_SAMPLES; n <= USUAL_WINDOW_DAYS; n += 1) {
      const w = householdOf(n);
      expect(w.windows.length).toBeGreaterThan(0);
      for (const win of w.windows) {
        expect(usualWindowLine(win)).toContain(`on ${win.samples} of the last ${win.days}`);
      }
    }
  });

  it('is US English and sentence case, like every other word a parent reads', () => {
    for (let n = 0; n <= USUAL_WINDOW_DAYS; n += 1) {
      for (const line of allUsualWindowLines(householdOf(n))) {
        expect(line, line).not.toMatch(
          /\b(colour|favourite|cancelled|grey|centre|analyse|customise)\b/i,
        );
      }
    }
  });

  /**
   * The GENERATED sentences only — the four forms. The card's fixed chrome is allowed to address
   * the parent ("counted from your own entries"), and has to: it is the app explaining itself.
   * What may never happen is a sentence ABOUT THE LOG that takes the parent as its subject or
   * names a day that has not happened, which is the line between a description and an
   * instruction.
   */
  const generated = (w: UsualWindows): string[] => [
    ...w.windows.flatMap(win =>
      [usualWindowLine(win), usualClusterLine(win), usualLengthLine(win)].filter(
        (s): s is string => s !== null,
      ),
    ),
    ...w.watching.map(usualWatchLine),
  ];

  it('never writes a sentence with the parent as its subject, or a day that has not happened', () => {
    for (let n = 0; n <= USUAL_WINDOW_DAYS; n += 1) {
      for (const line of generated(householdOf(n))) {
        expect(line, line).not.toMatch(
          /\b(you|your|we|tomorrow|tonight|next|expect|expected|likely|probably|around|usually|should|try)\b/i,
        );
      }
    }
  });

  it('writes every generated sentence in the past tense, and none about what comes next', () => {
    const w = householdOf(USUAL_WINDOW_DAYS);
    for (const line of generated(w)) {
      expect(line, line).toMatch(/\b(was|were|began|started|ran|logged|fell|carry|appears)\b/);
      expect(line, line).not.toMatch(/\b(will|is going to|due)\b/i);
    }
  });

  it('labels every event, so no row is a number with no name', () => {
    for (const id of Object.keys(USUAL_WINDOW_LABEL) as UsualWindowId[]) {
      expect(USUAL_WINDOW_LABEL[id].length).toBeGreaterThan(6);
    }
  });
});

describe('the days come from the household’s zone, never the device’s', () => {
  it('moves the whole fortnight when the household is somewhere else', () => {
    const auckland = usualWindowDays('Pacific/Auckland', NOW);
    expect(auckland[0]?.startMs).not.toBe(DAYS[0]?.startMs);
    expect(auckland).toHaveLength(USUAL_WINDOW_DAYS);
  });

  it('reads no clock of its own — the same arguments give the same answer twice', () => {
    const rows = EVERY_DAY.map(d => feed(d, 7));
    expect(usualWindows(rows, DAYS, TZ)).toEqual(usualWindows(rows, DAYS, TZ));
    expect(shiftDay(TZ, NOW, -1).startMs).toBe(at(17, 0));
  });
});
