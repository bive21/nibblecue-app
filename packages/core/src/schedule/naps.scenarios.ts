/**
 * THE SCENARIO CATALOG — named, recognizable sleep patterns the nap outlook is tested against, one
 * population of simulated households each. Test support; never shipped.
 *
 * The owner, 2026-09-23: *"run test with multiple scenarios about baby's sleeping pattern and check
 * it's accuracy."* The backtest (`naps.backtest.test.ts`) measures the engine over a broad mix of
 * babies; this names the situations a parent would describe — a newborn, the four-month
 * regression, the nap transitions, daycare, a clock change, a trip, a sick week, a parent too tired
 * to log every nap — so the accuracy can be read one situation at a time, and so a change that
 * breaks one of them fails the build even when the average hides it.
 *
 * Each scenario is a set of `naps.sim.ts` levers over the default household; every lever is
 * described where it is defined. `from` is the day the situation starts, where it has one, so the
 * days after it can be scored on their own.
 */
import type { SimZone } from './naps.bench';
import { DEFAULT_SIM, type SimParams } from './naps.sim';

export interface Scenario {
  key: string;
  /** How a parent would say it. */
  name: string;
  /** What is simulated, in a line. */
  story: string;
  /** Corrected age at the start, in days. */
  ages: readonly [number, number];
  params: SimParams;
  /** The day the situation begins, for the "days after" segment. */
  from?: number;
  /** The day it ends, where that is its own change — the flight home — for a second segment. */
  until?: number;
  /**
   * Where the phone that is read was, when it was somewhere else (`today/travel.ts`). Absent, the
   * phone never left home — which, for a trip, is the phone of the parent who stayed behind.
   */
  zones?: readonly SimZone[];
  /** Replays another scenario's households, draw for draw, so the two can be compared directly. */
  households?: string;
}

/** Careful logging: every nap and every day, no timers left running. */
const CAREFUL = { napMiss: 0, timerLeft: 0, daySkip: 0 } as const;
/** The default household's habits, spelled out so a scenario can change one of them. */
const USUAL_LOGGING = { napMiss: 0.03, timerLeft: 0.03, daySkip: 0.02 } as const;
/** No routine change unless the scenario is about one. */
const STEADY: SimParams = { ...DEFAULT_SIM, shiftShare: 0 };

/**
 * A WEEK AWAY, THREE ZONES EAST. By the home clock the family's day moves three hours earlier —
 * an hour a day, the pace a baby's clock catches up with a new one — holds there, and comes back
 * the same way after the flight home on day 17.
 */
const TRIP_EAST: SimParams = {
  ...STEADY,
  clock: { day: 10, jump: 0, ease: 60, hold: { offset: -180, until: 17 } },
};

/** 8:30 a.m. to 5 p.m., two naps at 9:45 and 1:15 — a common infant-room day. */
const DAYCARE_HOURS = { napsAt: [9 * 60 + 45, 13 * 60 + 15], from: 8 * 60 + 30, to: 17 * 60 };

export const SCENARIOS: readonly Scenario[] = [
  {
    key: 'steady',
    name: 'A steady routine, logged carefully',
    story: '6–8 months, three naps, no changes, every sleep logged',
    ages: [180, 240],
    params: { ...STEADY, pieceNightShare: 0, logging: CAREFUL },
  },
  {
    key: 'newborn',
    name: 'Newborn weeks',
    story: '2–7 weeks: no body clock yet, short windows, four to six naps, a broken night',
    ages: [14, 49],
    params: STEADY,
  },
  {
    key: 'regression',
    name: 'The four-month regression',
    story: '3½–4½ months: for two weeks naps shrink to one cycle and the night breaks up',
    ages: [105, 135],
    params: {
      ...STEADY,
      pieceNightShare: 1,
      spell: {
        day: 8,
        days: 14,
        windows: 0.9,
        naps: 0.85,
        noise: 1.5,
        shortNaps: 0.35,
        nightWakings: 2.5,
        bedtime: 0,
      },
    },
    from: 8,
  },
  {
    key: 'three-to-two',
    name: 'Dropping from three naps to two',
    story: '6½–8½ months: some days three naps, some days two, and then two',
    ages: [195, 255],
    params: STEADY,
  },
  {
    key: 'two-to-one',
    name: 'Dropping from two naps to one',
    story: '13–17 months: the afternoon nap goes, and the one nap drifts to midday',
    ages: [400, 510],
    params: STEADY,
  },
  {
    key: 'catnapper',
    name: 'A catnapper',
    story: '3–7 months: most naps stop after one sleep cycle, 30–45 minutes',
    ages: [100, 200],
    params: { ...STEADY, shortNapAdd: 0.45 },
  },
  {
    key: 'early-riser',
    name: 'An early riser',
    story: 'Up about 5:15, down for the night about 6:30 pm',
    ages: [150, 450],
    params: { ...STEADY, clockShift: { wake: -90, bed: -60 } },
  },
  {
    key: 'late-family',
    name: 'A late family who never set their times',
    story: 'Up about 8:30, down about 9:30 pm; the app still thinks bedtime is 7:30 pm',
    ages: [150, 450],
    params: { ...STEADY, clockShift: { wake: 105, bed: 120 }, setWindowShare: 0 },
  },
  {
    key: 'weekends',
    name: 'Weekend lie-ins',
    story: 'Saturdays and Sundays start, nap and end about 50 minutes later',
    ages: [150, 450],
    params: { ...STEADY, weekendLater: 50 },
  },
  {
    key: 'daycare-logged',
    name: 'Daycare on weekdays, naps copied in',
    story:
      '10–13 months: weekday naps at the daycare’s 9:45 and 1:15; parents log them from the report',
    ages: [300, 400],
    params: { ...STEADY, daycare: { ...DAYCARE_HOURS, logged: true } },
  },
  {
    key: 'daycare-unlogged',
    name: 'Daycare on weekdays, naps never logged',
    story: 'As above, but the daycare naps never reach the app — only mornings, evenings, nights',
    ages: [300, 400],
    params: { ...STEADY, daycare: { ...DAYCARE_HOURS, logged: false } },
  },
  {
    key: 'spring-forward',
    name: 'Clocks spring forward',
    story: 'Overnight the whole day is an hour later by the clock; it eases back 15 minutes a day',
    ages: [120, 500],
    params: { ...STEADY, clock: { day: 14, jump: 60, ease: 15 } },
    from: 14,
  },
  {
    key: 'fall-back',
    name: 'Clocks fall back',
    story:
      'Overnight the whole day is an hour earlier by the clock; it eases back 15 minutes a day',
    ages: [120, 500],
    params: { ...STEADY, clock: { day: 14, jump: -60, ease: 15 } },
    from: 14,
  },
  {
    key: 'trip',
    name: 'A week three zones east, on a phone that stayed home',
    story: 'By the home clock the day moves three hours earlier over three days, and back after',
    ages: [150, 500],
    params: TRIP_EAST,
    from: 10,
    until: 17,
  },
  {
    key: 'bedtime-earlier',
    name: 'Parents move bedtime 45 minutes earlier',
    story: 'From one evening on, the night starts 45 minutes sooner and stays there',
    ages: [150, 500],
    params: { ...DEFAULT_SIM, shiftShare: 1, shift: { kinds: [1], sign: -1, size: 0.5, day: 14 } },
    from: 14,
  },
  {
    key: 'leap',
    name: 'A developmental leap',
    story: 'Within a day the wake windows stretch by a fifth, and stay stretched',
    ages: [90, 400],
    params: { ...DEFAULT_SIM, shiftShare: 1, shift: { kinds: [2], sign: 1, size: 1, day: 14 } },
    from: 14,
  },
  {
    key: 'sick',
    name: 'Sick for four days',
    story: 'Sleepier and more broken for four days — shorter windows, longer naps, earlier nights',
    ages: [150, 500],
    params: {
      ...STEADY,
      spell: {
        day: 14,
        days: 4,
        windows: 0.8,
        naps: 1.3,
        noise: 2,
        shortNaps: 0,
        nightWakings: 2,
        bedtime: -30,
      },
    },
    from: 14,
  },
  {
    key: 'patchy',
    name: 'Patchy logging',
    story: 'A third of naps never logged, one timer in eight left running, a day in ten skipped',
    ages: [90, 450],
    params: { ...STEADY, logging: { napMiss: 0.3, timerLeft: 0.12, daySkip: 0.1 } },
  },
  {
    key: 'night-pieces',
    name: 'Every night waking logged',
    story: '2–8 months, night logged in pieces, up every two to three hours',
    ages: [60, 240],
    params: { ...STEADY, pieceNightShare: 1, logging: { ...USUAL_LOGGING, nightWakings: 2.5 } },
  },
  // last in the list, so every scenario before it keeps its seed: it replays 'trip''s households
  {
    key: 'trip-along',
    name: 'A week three zones east, on the phone that went',
    story:
      'The same week, read on the clock where the baby is: the clocks jump three hours on landing ' +
      'and the baby catches up over three days — and the same the other way home',
    ages: [150, 500],
    params: TRIP_EAST,
    from: 10,
    until: 17,
    households: 'trip',
    // the phone notices the new zone on landing, early on the first day, and home again the same way
    zones: [
      { day: 10, hour: 4, offset: 180 },
      { day: 17, hour: 4, offset: 0 },
    ],
  },
  /*
    THE HUMAN SIDE OF LOGGING (the owner, 2026-09-26: "we have to also consider the human aspect of
    like forget to logging, so some data might be spiked /not"). Patchy logging above is naps never
    logged; these two are the entries that DO reach the log, wrong. Last in the list, like the trip
    on the phone that went, so every scenario before them keeps its seed.
  */
  {
    key: 'timer-left-on',
    name: 'A nap timer found the next morning',
    story:
      'One nap in twenty-five: the timer runs until the next morning, one "sleep" of fifteen hours ' +
      'and more, and the rest of that day and night never logged',
    ages: [150, 450],
    params: { ...STEADY, logging: { ...USUAL_LOGGING, runaway: 0.04 } },
  },
  {
    key: 'logged-late',
    name: 'Naps written down afterwards, at the time they were written',
    story:
      'One nap in six is logged 30 minutes to 2½ hours after it ended, with the time of logging — ' +
      'the right length, at the wrong time',
    ages: [150, 450],
    params: { ...STEADY, logging: { ...USUAL_LOGGING, late: 0.15 } },
  },
  // appended at the end, so every scenario before it keeps its seed
  {
    key: 'hectic-mornings',
    name: 'Hectic mornings',
    story: 'The first nap of the day goes unlogged two mornings in three; the rest logged as usual',
    ages: [90, 300],
    params: { ...STEADY, logging: { ...USUAL_LOGGING, firstNapMiss: 0.65 } },
  },
];
