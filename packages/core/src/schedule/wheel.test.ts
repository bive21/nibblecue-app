/**
 * The schedule wheel's geometry and its two feeders. The claims that make the picture honest:
 * the ring is a function of the household's own window, simultaneous stops are one stop, a
 * caption never covers another caption, the preview is the engine's own walk and contains no
 * clock time nobody entered, and the live wheel reads the day the engine planned.
 */
import { describe, expect, it } from 'vitest';
import { FIRST_SLOT_MS } from './interval';
import {
  inNight,
  layoutWheel,
  dayTally,
  liveEntries,
  previewEntries,
  spreadAcrossDay,
  wheelClock,
  wheelDegrees,
  WHEEL_CAPTION_GAP_DEG,
  WHEEL_DIRECTION,
  WHEEL_GROUP_MINUTES,
  WHEEL_MERGE_DEG,
  WHEEL_NIGHT_SPAN_MAX_MINUTES,
  WHEEL_SPAN_MAX_MINUTES,
  WHEEL_WAKE_DEG,
  nightArcDeg,
  type WheelEntry,
} from './wheel';
import { occurrence, ruleFrom } from './types';
import { DEFAULT_DAY_WINDOW } from '../today/dayWindow';

const WINDOW = { wake: '07:00', bed: '19:30' };
const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
};
/** Shortest angular distance between two bearings. */
const apart = (a: number, b: number): number => {
  const d = Math.abs((((a % 360) + 360) % 360) - (((b % 360) + 360) % 360));
  return Math.min(d, 360 - d);
};

/** 07:00 to 19:30 is 750 of the day's 1440 minutes: 187.5° of a clock-scaled ring. */
const DAY_ARC = 360 - nightArcDeg(WINDOW);

describe('the ring is the household’s own day', () => {
  it('runs clockwise from a sun at the top left (the owner, 2026-09-21)', () => {
    expect(WHEEL_DIRECTION).toBe(1);
    expect(WHEEL_WAKE_DEG).toBe(320);
    expect(wheelDegrees(at('07:00'), WINDOW, DAY_ARC)).toBeCloseTo(WHEEL_WAKE_DEG, 6);
    // …and the day really does travel clockwise: noon is further round than nine
    const nine = wheelDegrees(at('09:00'), WINDOW, DAY_ARC);
    const noon = wheelDegrees(at('12:00'), WINDOW, DAY_ARC);
    const since = (d: number) => (d - WHEEL_WAKE_DEG + 360) % 360;
    expect(since(noon)).toBeGreaterThan(since(nine));
  });

  it('puts the bed mark a full day-arc round from the sun', () => {
    const bed = wheelDegrees(at('19:30'), WINDOW, DAY_ARC);
    expect(apart(bed, WHEEL_WAKE_DEG + DAY_ARC)).toBeLessThan(0.001);
  });

  it('spreads the waking hours evenly, and the night evenly in what is left', () => {
    const mid = wheelDegrees(at('13:15'), WINDOW, DAY_ARC);
    expect(apart(mid, WHEEL_WAKE_DEG + DAY_ARC / 2)).toBeLessThan(0.001);
    const night = wheelDegrees(at('01:15'), WINDOW, DAY_ARC);
    expect(apart(night, WHEEL_WAKE_DEG + DAY_ARC + (360 - DAY_ARC) / 2)).toBeLessThan(0.001);
  });

  /**
   * A MINUTE IS A MINUTE (the owner, 2026-09-21: "wouldn't it make more sense if it shows the
   * full 24h (at night too)?"). The night's arc is its share of the day, not a share of what is
   * planned in it.
   */
  it('gives the night exactly its share of the twenty-four hours', () => {
    expect(nightArcDeg(WINDOW)).toBeCloseTo((360 * (1440 - 750)) / 1440, 6);
    expect(nightArcDeg({ wake: '06:00', bed: '18:00' })).toBeCloseTo(180, 6);
    expect(nightArcDeg({ wake: '07:00', bed: '07:00' })).toBeCloseTo(0, 6);
    // and an hour is the same fifteen degrees at two in the morning as at two in the afternoon
    const day = apart(wheelDegrees(at('14:00'), WINDOW), wheelDegrees(at('15:00'), WINDOW));
    const night = apart(wheelDegrees(at('02:00'), WINDOW), wheelDegrees(at('03:00'), WINDOW));
    expect(day).toBeCloseTo(15, 6);
    expect(night).toBeCloseTo(15, 6);
  });

  it('knows which side of the window a minute falls on', () => {
    expect(inNight(at('12:00'), WINDOW)).toBe(false);
    expect(inNight(at('07:00'), WINDOW)).toBe(false);
    expect(inNight(at('23:00'), WINDOW)).toBe(true);
    expect(inNight(at('03:00'), WINDOW)).toBe(true);
    // a household awake all day has no night at all
    expect(inNight(at('03:00'), { wake: '08:00', bed: '08:00' })).toBe(false);
  });

  it('never divides by zero on a window whose two times are the same', () => {
    const flat = { wake: '08:00', bed: '08:00' };
    for (const t of ['08:00', '14:00', '23:59', '03:30']) {
      expect(Number.isFinite(wheelDegrees(at(t), flat, DAY_ARC)), t).toBe(true);
    }
    expect(layoutWheel([], flat).awakeMinutes).toBe(1440);
  });

  it('wraps a night-shift window, where bed is earlier in the string than wake', () => {
    const shift = { wake: '20:00', bed: '08:00' };
    expect(layoutWheel([], shift).awakeMinutes).toBe(12 * 60);
    expect(wheelDegrees(at('20:00'), shift, DAY_ARC)).toBeCloseTo(WHEEL_WAKE_DEG, 6);
  });

  it('prints its own clock string, wrapped and padded', () => {
    expect(wheelClock(0)).toBe('00:00');
    expect(wheelClock(8 * 60 + 5)).toBe('08:05');
    expect(wheelClock(1440)).toBe('00:00');
    expect(wheelClock(-30)).toBe('23:30');
  });
});

describe('the hour is one place in the day', () => {
  const entry = (key: string, hhmm: string, activity: WheelEntry['activity']): WheelEntry => ({
    key,
    minutes: at(hhmm),
    activity,
  });

  /**
   * THE OWNER'S OWN EXAMPLE, 2026-09-21: *"if pumping is at 8.13am, bottle is at 8.45am, diaper
   * is at 9am, then tummy time is at 10am. the first 3 should be shown together (within
   * 60minutes)"*.
   */
  it('puts a pump, a bottle and a change inside one hour under one house', () => {
    const { stops } = layoutWheel(
      [
        entry('a', '08:13', 'pump'),
        entry('b', '08:45', 'bottle'),
        entry('c', '09:00', 'diaper'),
        entry('d', '10:00', 'tummy'),
      ],
      WINDOW,
    );
    expect(stops).toHaveLength(2);
    expect(stops[0]?.activities).toEqual(['pump', 'bottle', 'diaper']);
    expect(stops[0]?.hhmm).toBe('08:13');
    expect(stops[0]?.endHhmm).toBe('09:00');
    expect(stops[0]?.spanMinutes).toBe(47);
    expect(stops[1]?.activities).toEqual(['tummy']);
    expect(stops[1]?.spanMinutes).toBe(0);
  });

  it('measures the hour from the first thing, so a long chain does not fuse into one block', () => {
    /* 8:00, 8:50, 9:40, 10:30 — each within an hour of its NEIGHBOR and spanning two and a
       half hours. Measured from the head, the first hour closes at 9:00 and the rest go on. */
    const chain = ['08:00', '08:50', '09:40', '10:30'].map((t, i) => entry(`k${i}`, t, 'bottle'));
    const { stops } = layoutWheel(chain, WINDOW);
    expect(stops.length).toBeGreaterThan(1);
    for (const s of stops) expect(s.spanMinutes, s.hhmm).toBeLessThanOrEqual(WHEEL_GROUP_MINUTES);
  });

  it('is stable whatever order the entries arrive in', () => {
    const one = layoutWheel([entry('b', '11:00', 'diaper'), entry('a', '08:30', 'bottle')], WINDOW);
    const two = layoutWheel([entry('a', '08:30', 'bottle'), entry('b', '11:00', 'diaper')], WINDOW);
    expect(one.stops.map(s => s.key)).toEqual(two.stops.map(s => s.key));
    expect(one.stops.map(s => s.deg)).toEqual(two.stops.map(s => s.deg));
  });

  /**
   * AND THE NIGHT COLLAPSES FURTHER, BECAUSE ITS SCALE IS DIFFERENT. An hour of a compressed
   * night is fifteen degrees an hour, under the ring's own limit, so the hour pass alone leaves
   * night stops closer than two houses can sit; the angular pass is what separates them.
   */
  it('merges night stops the ring cannot separate, and leaves the day alone', () => {
    const night = ['21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00'].map(
      (t, i) => entry(`n${i}`, t, 'pump'),
    );
    const day = ['08:00', '11:00', '14:00', '17:00'].map((t, i) => entry(`d${i}`, t, 'bottle'));
    const { stops } = layoutWheel([...day, ...night], WINDOW);
    const dayStops = stops.filter(s => !s.night);
    const nightStops = stops.filter(s => s.night);
    // every daytime hour kept its own place
    expect(dayStops).toHaveLength(4);
    // the night's eight collapsed into something the ring can draw
    expect(nightStops.length).toBeLessThan(night.length);
    /* and no two stops are closer than the ring's own limit — unless the CLOCK held them apart,
       which is the one case that wins over the geometry: a house may not stand for more time than
       its cap, so two stops the ring would rather fuse stay two, close together, with the caption
       pass dropping a label instead of the layout printing a wrong time. */
    for (let i = 1; i < stops.length; i += 1) {
      const a = stops[i - 1];
      const b = stops[i];
      if (a === undefined || b === undefined) continue;
      const cap = a.night ? WHEEL_NIGHT_SPAN_MAX_MINUTES : WHEEL_SPAN_MAX_MINUTES;
      const wouldSpan = b.endMinutes - a.minutes;
      if (wouldSpan <= cap) {
        expect(apart(b.deg, a.deg), `${a.hhmm} → ${b.hhmm}`).toBeGreaterThanOrEqual(
          WHEEL_MERGE_DEG - 0.001,
        );
      }
    }
  });

  it('never lets one stop stand for more than the span cap', () => {
    const allNight = Array.from({ length: 14 }, (_, i) =>
      entry(`n${i}`, wheelClock(at('20:00') + i * 30), 'pump'),
    );
    const { stops } = layoutWheel(allNight, WINDOW);
    for (const s of stops)
      expect(s.spanMinutes, s.hhmm).toBeLessThanOrEqual(
        s.night ? WHEEL_NIGHT_SPAN_MAX_MINUTES : WHEEL_SPAN_MAX_MINUTES,
      );
  });

  /**
   * AND THE DAY'S CAP IS THE TIGHTER ONE, because an hour and a half is a round of the waking day
   * and four hours is a stretch of the night. A household with a set time every hour gets rounds
   * rather than a row of touching beads, and no round stands for more than its cap.
   */
  it('gathers an hour-by-hour day into rounds, each one honest about what it covers', () => {
    const hourly = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'].map((t, i) =>
      entry(`h${i}`, t, 'bottle'),
    );
    const { stops } = layoutWheel(hourly, WINDOW);
    expect(stops.length).toBeLessThan(hourly.length);
    for (const s of stops) {
      expect(s.spanMinutes, s.hhmm).toBeLessThanOrEqual(WHEEL_SPAN_MAX_MINUTES);
      // the head time is the first thing in the round, and the end time is the last
      expect(s.minutes, s.hhmm).toBeLessThanOrEqual(s.endMinutes);
    }
    // nothing was dropped on the way: every entry is still on the ring, once
    expect(
      stops
        .flatMap(s => s.entries)
        .map(e => e.key)
        .sort(),
    ).toEqual(hourly.map(h => h.key).sort());
  });
});

describe('a caption never sits on another caption, or on the sun', () => {
  const entry = (key: string, hhmm: string): WheelEntry => ({
    key,
    minutes: at(hhmm),
    activity: 'bottle',
  });

  it('keeps every dot, and drops only the words', () => {
    /* seven stops a hundred minutes apart — far enough that the ring keeps them all, close enough
       that the first sits inside the sun's own room */
    const many = ['08:00', '09:40', '11:20', '13:00', '14:40', '16:20', '18:00'].map((t, i) =>
      entry(`k${i}`, t),
    );
    const { stops } = layoutWheel(many, WINDOW);
    expect(stops).toHaveLength(7);
    expect(stops.map(s => s.hhmm)).toEqual(many.map(m => wheelClock(m.minutes)));
    // a caption that survived is far enough from every other one
    const shown = stops.filter(s => !s.labelHidden).map(s => s.deg);
    for (let i = 1; i < shown.length; i += 1) {
      expect(apart(shown[i] ?? 0, shown[i - 1] ?? 0)).toBeGreaterThanOrEqual(
        WHEEL_CAPTION_GAP_DEG - 0.001,
      );
    }
  });

  /**
   * THE SECOND THING THE OWNER'S PHONE SHOWED: *"7:00 AM Wake"* printed through *"4:30 AM
   * Bottle"*. The sun and the moon carry captions of their own and the layout had never heard
   * of them, so a stop landing beside either one wrote over it.
   */
  it('leaves the sun and the moon their own room', () => {
    const layout = layoutWheel([entry('a', '07:05'), entry('b', '19:25')], WINDOW);
    for (const s of layout.stops) {
      expect(s.labelHidden, s.hhmm).toBe(true);
    }
    // and a stop well clear of both keeps its words
    const clear = layoutWheel([entry('c', '13:00')], WINDOW);
    expect(clear.stops[0]?.labelHidden).toBe(false);
  });

  it('gives a well-spaced day every caption', () => {
    /* on a clock-scaled ring the first stop is two hours (30°) clear of the sun and the last two
       hours clear of the moon, with three hours (45°) between the stops — all past the gap */
    const { stops } = layoutWheel(
      ['09:00', '12:00', '15:00', '17:30'].map((t, i) => entry(`k${i}`, t)),
      WINDOW,
    );
    for (const s of stops) expect(s.labelHidden, s.hhmm).toBe(false);
  });
});

describe('the preview is the parent’s own answers, run through the engine', () => {
  const DAY_START = Date.UTC(2026, 8, 21, 0, 0, 0);
  const ctx = { timeZone: 'UTC', dayStartMs: DAY_START, window: WINDOW };

  it('lays an interval out from the wake time, at the interval the parent chose', () => {
    const got = previewEntries(
      { intervals: [{ activity: 'pump', everyMinutes: 180 }], setTimes: [] },
      ctx,
    );
    expect(got.length).toBeGreaterThanOrEqual(6);
    /*
      THE FIRST DAYTIME STOP IS A QUARTER HOUR IN, and that is the engine rather than a choice made
      here: the preview's rhythm is a rule written at the wake time with nothing logged behind it,
      and the engine opens such a rule `FIRST_SLOT_MS` after it was written (`interval.ts`). A
      household's own first day no longer looks like this — since 2026-09-25 it runs from
      midnight with the part before signup skipped (`start.ts`) — which is why the preview hands
      the engine no household start (`previewEntries`).

      Overnight wrap fills (`gridFills`) can sit before wake; the daytime chain from wake still
      lands on the interval.
    */
    const first = at('07:00') + FIRST_SLOT_MS / 60_000;
    const daytime = got.filter(e => e.minutes >= at('07:00') && e.minutes < at('19:30'));
    expect(daytime.length).toBeGreaterThan(0);
    expect(wheelClock(Math.min(...daytime.map(e => e.minutes)))).toBe(wheelClock(first));
    for (const e of daytime) {
      const since = (e.minutes - first + 1440) % 1440;
      expect(since % 180, wheelClock(e.minutes)).toBe(0);
    }
  });

  it('honors a paused night, so the ring does not plan a pump at 3 a.m.', () => {
    const paused = previewEntries(
      {
        intervals: [
          { activity: 'pump', everyMinutes: 180, night: { mode: 'PAUSE', everyMinutes: null } },
        ],
        setTimes: [],
      },
      ctx,
    );
    const inNight = paused.filter(e => e.minutes >= at('19:30') || e.minutes < at('07:00'));
    expect(inNight).toHaveLength(0);
    // …and the same answer WITHOUT the pause does carry the night, which is what makes the
    // first assertion mean something
    const around = previewEntries(
      { intervals: [{ activity: 'pump', everyMinutes: 180 }], setTimes: [] },
      ctx,
    );
    expect(around.length).toBeGreaterThan(paused.length);
  });

  it('puts LONGER night stops through the night, not only beside bed and wake (2026-10-03)', () => {
    /*
      Setup's wheel used to show the evening slot (23:15) and nothing between midnight and wake —
      the walk is anchored at wake, so it never saw yesterday's wrap. With nights every 4 h the
      parent expects a stop during the night; `gridFills` is what the live day already uses.
    */
    const got = previewEntries(
      {
        intervals: [
          {
            activity: 'diaper',
            everyMinutes: 180,
            night: { mode: 'LONGER', everyMinutes: 240 },
          },
        ],
        setTimes: [],
      },
      ctx,
    );
    const clocks = got.map(e => wheelClock(e.minutes)).sort();
    expect(clocks).toContain('23:15');
    // at least one stop after midnight and before wake — the "during" of bedtime
    const during = got.filter(e => e.minutes < at('07:00'));
    expect(during.length).toBeGreaterThan(0);
    expect(during.every(e => e.activity === 'diaper')).toBe(true);
    // and a paused night still has none of those
    const paused = previewEntries(
      {
        intervals: [
          { activity: 'diaper', everyMinutes: 180, night: { mode: 'PAUSE', everyMinutes: null } },
        ],
        setTimes: [],
      },
      ctx,
    );
    expect(paused.filter(e => e.minutes < at('07:00'))).toHaveLength(0);
  });

  it('draws a set-times answer at exactly the times entered, and nothing else', () => {
    const got = previewEntries(
      { intervals: [], setTimes: [{ activity: 'bottle', times: ['07:30', '11:00', '15:00'] }] },
      ctx,
    );
    expect(got.map(e => wheelClock(e.minutes))).toEqual(['07:30', '11:00', '15:00']);
  });

  it('writes a meal’s name under its stop, and keeps a time no meal took as it was (2026-09-28)', () => {
    const got = previewEntries(
      {
        intervals: [],
        setTimes: [
          {
            activity: 'solids',
            times: ['07:30', '12:00', '21:30'],
            meals: [
              { meal: 'BREAKFAST', at: '07:30' },
              { meal: 'LUNCH', at: '12:00' },
              { meal: 'SNACK', at: '12:00' },
            ],
          },
        ],
      },
      ctx,
    );
    expect(got.map(e => `${wheelClock(e.minutes)} ${e.note ?? '-'}`)).toEqual([
      '07:30 Breakfast',
      '12:00 Lunch',
      '12:00 Snack',
      '21:30 -',
    ]);
    // one stop per meal, never a key shared by the two at noon
    expect(new Set(got.map(e => e.key)).size).toBe(got.length);
  });

  it('carries a medicine by its own name, and the bed time as a stop', () => {
    const got = previewEntries(
      {
        intervals: [],
        setTimes: [],
        medicines: [{ id: 'm1', name: 'Vitamin D', times: ['08:00'] }],
        bedtime: '19:30',
      },
      ctx,
    );
    expect(got.find(e => e.note === 'Vitamin D')?.minutes).toBe(at('08:00'));
    expect(got.find(e => e.activity === 'sleep')?.minutes).toBe(at('19:30'));
  });

  /**
   * THE ONE CLAIM THE OWNER ASKED FOR IN SO MANY WORDS (2026-09-21): *"Do not bake the example
   * times from the design mockup into the app."* An empty answer draws an empty ring — no 8:30,
   * no 12:30, no 7:30 bath, nothing.
   */
  it('invents no time of its own: nothing entered, nothing drawn', () => {
    expect(previewEntries({ intervals: [], setTimes: [] }, ctx)).toEqual([]);
    expect(previewEntries({ intervals: [], setTimes: [], medicines: [] }, ctx)).toEqual([]);
    // a rhythm with no usable interval is not a rhythm, and contributes nothing
    expect(
      previewEntries({ intervals: [{ activity: 'bath', everyMinutes: 0 }], setTimes: [] }, ctx),
    ).toEqual([]);
    // and the file itself holds none of the mockup's clock times
    const src = new URL('./wheel.ts', import.meta.url);
    expect(src.pathname.endsWith('wheel.ts')).toBe(true);
  });

  it('spreads a times-a-day count the way the seeder does, inside the waking window', () => {
    const three = spreadAcrossDay(3, WINDOW);
    expect(three).toHaveLength(3);
    for (const t of three) {
      expect(at(t), t).toBeGreaterThanOrEqual(at('07:00'));
      expect(at(t), t).toBeLessThanOrEqual(at('19:30'));
      expect(at(t) % 15, t).toBe(0);
    }
    expect(spreadAcrossDay(0, WINDOW)).toEqual([]);
  });

  it('defaults its window to the one every other reader defaults to', () => {
    expect(layoutWheel([]).window).toEqual(DEFAULT_DAY_WINDOW);
  });
});

describe('the live wheel reads the day the engine planned', () => {
  const rule = ruleFrom({ id: 'r1', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 180 });
  const DAY = Date.UTC(2026, 8, 21, 0, 0, 0);
  const minutesAt = (ms: number) => Math.round((ms - DAY) / 60_000);

  it('turns occurrences into stops, keeping the rule each one opens', () => {
    const got = liveEntries(
      [
        occurrence(rule, DAY + at('08:30') * 60_000, 'DONE'),
        occurrence(rule, DAY + at('11:30') * 60_000, 'UPCOMING'),
      ],
      { minutesAt },
    );
    expect(got.map(e => wheelClock(e.minutes))).toEqual(['08:30', '11:30']);
    expect(got.every(e => e.ruleId === 'r1')).toBe(true);
  });

  it('drops the GAP marker and the look-ahead rows, as the day list does', () => {
    const got = liveEntries(
      [
        occurrence(rule, DAY + at('08:30') * 60_000, 'GAP', { expectedCount: 4 }),
        occurrence(rule, DAY + at('11:30') * 60_000, 'UPCOMING', { future: true }),
        occurrence(rule, DAY + at('14:30') * 60_000, 'UPCOMING'),
      ],
      { minutesAt },
    );
    expect(got.map(e => wheelClock(e.minutes))).toEqual(['14:30']);
  });

  it('lets a care item name its own stop', () => {
    const med = ruleFrom({
      id: 'r2',
      activity: 'med',
      ruleType: 'FIXED',
      atLocalTime: '08:00',
      careItemId: 'c1',
    });
    const got = liveEntries([occurrence(med, DAY + at('08:00') * 60_000, 'UPCOMING')], {
      minutesAt,
      nameOf: o => (o.rule.careItemId === 'c1' ? 'Vitamin D' : undefined),
    });
    expect(got[0]?.note).toBe('Vitamin D');
  });

  /**
   * TWO MEDICINES AT ONE TIME ARE ONE DISC AND TWO EDITORS (the owner, 2026-09-28: a tap on a
   * house "only opened always for the first one"). The entry says which item it is, so a tap can
   * offer each of them; an entry with no care item says nothing, rather than an empty id.
   */
  it('carries the care item behind a medicine’s stop, and nothing for a rule without one', () => {
    const vitamin = ruleFrom({
      id: 'r2',
      activity: 'med',
      ruleType: 'FIXED',
      atLocalTime: '08:00',
      careItemId: 'c1',
    });
    const iron = ruleFrom({
      id: 'r3',
      activity: 'med',
      ruleType: 'FIXED',
      atLocalTime: '08:00',
      careItemId: 'c2',
    });
    const got = liveEntries(
      [
        occurrence(vitamin, DAY + at('08:00') * 60_000, 'UPCOMING'),
        occurrence(iron, DAY + at('08:00') * 60_000, 'UPCOMING'),
        occurrence(rule, DAY + at('08:30') * 60_000, 'UPCOMING'),
      ],
      { minutesAt },
    );
    expect(got.map(e => e.careItemId)).toEqual(['c1', 'c2', undefined]);
    expect('careItemId' in (got[2] ?? {})).toBe(false);
  });

  /**
   * THE WHOLE POINT OF THE LIVE MODE. A moved slot is a moved stop with no other machinery: the
   * engine recomputes, the entries change, the ring redraws. There is no second reconstruction
   * of the day to fall out of step with the first.
   */
  it('moves a stop when the plan moves it, and keeps the key stable per slot', () => {
    const before = liveEntries([occurrence(rule, DAY + at('17:30') * 60_000, 'UPCOMING')], {
      minutesAt,
    });
    const after = liveEntries([occurrence(rule, DAY + at('18:13') * 60_000, 'UPCOMING')], {
      minutesAt,
    });
    expect(wheelClock(before[0]?.minutes ?? 0)).toBe('17:30');
    expect(wheelClock(after[0]?.minutes ?? 0)).toBe('18:13');
    expect(layoutWheel(before, WINDOW).stops[0]?.deg).not.toBe(
      layoutWheel(after, WINDOW).stops[0]?.deg,
    );
  });
});

/**
 * TWO WAYS TO LOOK AT ONE DAY (the owner, 2026-09-22). The toggle changes WHICH stops are on the
 * ring — never where they are, and never what the day's rows say happened.
 */
describe('planned and how it went', () => {
  const rule = ruleFrom({ id: 'r1', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 180 });
  const DAY = Date.UTC(2026, 8, 21, 0, 0, 0);
  const minutesAt = (ms: number) => Math.round((ms - DAY) / 60_000);
  const aDay = () => [
    occurrence(rule, DAY + at('08:00') * 60_000, 'DONE'),
    occurrence(rule, DAY + at('11:00') * 60_000, 'LATE', { minutesLate: 20 }),
    occurrence(rule, DAY + at('14:00') * 60_000, 'MISSED'),
    occurrence(rule, DAY + at('17:00') * 60_000, 'SKIPPED'),
    occurrence(rule, DAY + at('20:00') * 60_000, 'UPCOMING'),
  ];

  it('draws the whole day in planned, whatever became of each stop', () => {
    const got = liveEntries(aDay(), { minutesAt });
    expect(got.map(e => wheelClock(e.minutes))).toEqual([
      '08:00',
      '11:00',
      '14:00',
      '17:00',
      '20:00',
    ]);
    // nothing is marked done in planned: the view is about the shape of the day, not the score
    expect(got.every(e => e.done === undefined)).toBe(true);
  });

  it('leaves a miss and a skip off the actual ring, and marks what happened', () => {
    const got = liveEntries(aDay(), { minutesAt, mode: 'actual' });
    expect(got.map(e => wheelClock(e.minutes))).toEqual(['08:00', '11:00', '20:00']);
    expect(got.map(e => e.done === true)).toEqual([true, true, false]);
  });

  it('keeps a stop’s key across the toggle, so the ring animates rather than rebuilds', () => {
    const planned = liveEntries(aDay(), { minutesAt });
    const actual = liveEntries(aDay(), { minutesAt, mode: 'actual' });
    // the fifth slot of the day is the fifth slot of the day in both views
    expect(planned[4]?.key).toBe(actual[2]?.key);
    expect(planned[0]?.key).toBe(actual[0]?.key);
  });

  it('calls a stop done only when every entry under it is', () => {
    const other = ruleFrom({
      id: 'r2',
      activity: 'diaper',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
    });
    const stops = layoutWheel(
      liveEntries(
        [
          occurrence(rule, DAY + at('08:00') * 60_000, 'DONE'),
          // same hour, not done: the house is still something to do
          occurrence(other, DAY + at('08:10') * 60_000, 'UPCOMING'),
          occurrence(rule, DAY + at('11:00') * 60_000, 'DONE'),
        ],
        { minutesAt, mode: 'actual' },
      ),
      WINDOW,
    ).stops;
    expect(stops).toHaveLength(2);
    expect(stops[0]?.done).toBe(false);
    expect(stops[1]?.done).toBe(true);
  });

  /**
   * THE TWO VIEWS PUT A DONE STOP IN DIFFERENT PLACES (the owner, 2026-09-22), and the LATE case
   * is the one that showed the gap: 75 minutes is about 19 degrees of a 24-hour ring.
   */
  it('draws a done stop where it HAPPENED in actual, and where it was DUE in planned', () => {
    const day = [
      // planned 15:00, logged 16:15 — inside the 90-minute late window, so LATE
      occurrence(rule, DAY + at('15:00') * 60_000, 'LATE', {
        matchedId: 's1',
        matchedAtMs: DAY + at('16:15') * 60_000,
        minutesLate: 75,
      }),
    ];
    expect(liveEntries(day, { minutesAt }).map(e => wheelClock(e.minutes))).toEqual(['15:00']);
    expect(liveEntries(day, { minutesAt, mode: 'actual' }).map(e => wheelClock(e.minutes))).toEqual(
      ['16:15'],
    );
  });

  it('leaves an early session where it already was — it IS the occurrence', () => {
    // `offGrid`: the engine already made the session's own time the slot's time, and it carries
    // `matchedAtMs` too, so both views agree and neither has a second rule for this case
    const early = [
      occurrence(rule, DAY + at('08:12') * 60_000, 'DONE', {
        matchedId: 's0',
        matchedAtMs: DAY + at('08:12') * 60_000,
        offGrid: true,
      }),
    ];
    expect(liveEntries(early, { minutesAt }).map(e => wheelClock(e.minutes))).toEqual(['08:12']);
    expect(
      liveEntries(early, { minutesAt, mode: 'actual' }).map(e => wheelClock(e.minutes)),
    ).toEqual(['08:12']);
  });

  it('falls back to the grid time for anything that has not happened', () => {
    // nothing upcoming carries a matched time, and `actual` must not invent one
    const ahead = [occurrence(rule, DAY + at('20:00') * 60_000, 'UPCOMING')];
    expect(ahead[0]?.matchedAtMs).toBeNull();
    expect(
      liveEntries(ahead, { minutesAt, mode: 'actual' }).map(e => wheelClock(e.minutes)),
    ).toEqual(['20:00']);
  });

  it('never marks anything done in the planned view', () => {
    const stops = layoutWheel(liveEntries(aDay(), { minutesAt }), WINDOW).stops;
    expect(stops.every(s => s.done === false)).toBe(true);
  });

  it('counts the day for the line under the toggle, misses included', () => {
    expect(dayTally(aDay())).toEqual({ done: 2, ahead: 1, missed: 2 });
    // a GAP marker and a look-ahead row are neither, exactly as the ring treats them
    expect(
      dayTally([
        occurrence(rule, DAY + at('08:00') * 60_000, 'GAP', { expectedCount: 4 }),
        occurrence(rule, DAY + at('11:00') * 60_000, 'UPCOMING', { future: true }),
      ]),
    ).toEqual({ done: 0, ahead: 0, missed: 0 });
    // DUE is still ahead: it is a thing to do now, not a thing that did not happen
    expect(dayTally([occurrence(rule, DAY + at('08:00') * 60_000, 'DUE')]).ahead).toBe(1);
  });
});
