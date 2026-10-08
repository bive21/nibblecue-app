/**
 * The coach: what a household's own log says about the settings that household chose — and,
 * as much as anything, the sentences it is not allowed to say while saying it.
 */
import { describe, expect, it } from 'vitest';
import { ruleFrom, type Rule } from '../schedule/types';
import type { Beat } from '../schedule/foresight';
import type { SleepLog } from '../schedule/naps';
import {
  COACH_DAILY_MODULES,
  COACH_MIN_DAYS,
  COACH_MIN_SAMPLES,
  COACH_RHYTHM_KEYS,
  coach,
  driftFloor,
  gapsOf,
  hhmmOfMinutes,
  round5,
  unusedModules,
} from './coach';
import { BANNED } from '../schedule/foresight.banned';
import {
  COACH_DISMISS,
  COACH_DISMISSED,
  COACH_METHOD,
  COACH_TITLE,
  COACH_UNUSED,
  COACH_USE_HEADS_UP,
  coachAction,
  coachApplied,
  coachGap,
  coachHint,
} from './copy';

const M = 60_000;
const H = 60 * M;
const DAY = 24 * H;
/** A fixed zone is not what this tests: a day is a day and a wall clock is minutes, supplied. */
const DAY0 = Date.parse('2026-09-01T00:00:00.000Z');
const dayStartOf = (ms: number): number => Math.floor((ms - DAY0) / DAY) * DAY + DAY0;
const wallMinutes = (ms: number): number => Math.floor((ms - dayStartOf(ms)) / M);
const at = (d: number, h: number, m = 0): number => DAY0 + d * DAY + h * H + m * M;
const NOW = at(14, 12);

const rule = (input: Parameters<typeof ruleFrom>[0]): Rule => ruleFrom(input);
const base = {
  nowMs: NOW,
  enabled: new Set<string>(),
  dayStartOf,
  wallMinutes,
};

/**
 * A household's sleep, day by day: the night to 7:00, a nap 9:00 to 10:00 and another 1:00 to
 * 2:30 PM, and down for the night at 7:00 PM. The stretch awake before the first nap is 2h and
 * before the second 3h, so their middle is 2h 30m.
 */
const sleeps = (fromDay: number, toDay: number): SleepLog[] => {
  const out: SleepLog[] = [];
  for (let d = fromDay; d <= toDay; d += 1) {
    out.push({ startMs: at(d - 1, 19), endMs: at(d, 7), kind: 'NIGHT' });
    out.push({ startMs: at(d, 9), endMs: at(d, 10), kind: 'NAP' });
    out.push({ startMs: at(d, 13), endMs: at(d, 14, 30), kind: 'NAP' });
  }
  return out;
};
/** A nap set time, as the Naps row's rules hold it: FIXED, named "Nap". */
const napTime = (id: string, atLocalTime: string, extra: Partial<Rule> = {}): Rule =>
  ruleFrom({ id, activity: 'sleep', ruleType: 'FIXED', atLocalTime, name: 'Nap', ...extra });

/** `n` feeds a day, `gap` apart from `startHour`, over `days` days. */
const run = (
  activity: string,
  days: number,
  startHour: number,
  gapMs: number,
  n: number,
): Beat[] => {
  const out: Beat[] = [];
  for (let d = 1; d <= days; d += 1) {
    for (let i = 0; i < n; i += 1) out.push({ activity, startMs: at(d, startHour) + i * gapMs });
  }
  return out;
};

describe('the interval a household set, against the one they keep', () => {
  const beats = run('bottle', 10, 7, 2.5 * H, 5); // every 2h 30m, all day, for ten days

  it('says the setting, the measurement and the count, and proposes the measurement', () => {
    const [s] = coach({
      ...base,
      rules: [rule({ id: 'f', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 180 })],
      beats,
    });
    expect(s?.kind).toBe('interval');
    expect(s?.currentMinutes).toBe(180);
    expect(s?.observedMinutes).toBe(150);
    expect(s?.samples).toBeGreaterThanOrEqual(COACH_MIN_SAMPLES);
    expect(s?.apply).toEqual({ verb: 'setInterval', ruleId: 'f', everyMinutes: 150 });
    expect(s?.driftMinutes).toBe(30);
  });

  it('stays quiet while the setting and the log agree well enough', () => {
    // 2h 30m logged against a 2h 35m setting: five minutes apart, and a card would be noise
    expect(
      coach({
        ...base,
        rules: [rule({ id: 'f', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 155 })],
        beats,
      }),
    ).toEqual([]);
  });

  it('will not argue with a setting on a thin sample', () => {
    const thin = run('pump', 1, 8, 2 * H, 4); // three gaps
    expect(
      coach({
        ...base,
        rules: [rule({ id: 'p', activity: 'pump', ruleType: 'INTERVAL', everyMinutes: 240 })],
        beats: thin,
      }),
    ).toEqual([]);
  });

  it('reads either kind of feed against a feeding rule, as the engine does', () => {
    const mixed = run('breastfeed', 10, 7, 2.5 * H, 5);
    const [s] = coach({
      ...base,
      rules: [rule({ id: 'f', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 180 })],
      beats: mixed,
    });
    expect(s?.kind).toBe('interval');
  });

  /**
   * A RULE WITH A NIGHT OF ITS OWN IS READ BY DAY. Its every-minutes is the day's interval; the
   * night runs on its own columns. Four-hourly days and two-hourly nights, kept to the minute,
   * used to come back as "every 2h" — the night's gaps outnumber the day's, and the median over
   * both was a number the setting never claimed.
   */
  it('compares a rule that has its own night against the day’s gaps only', () => {
    const beats: Beat[] = [];
    for (let d = 1; d <= 10; d += 1) {
      for (const h of [8, 12, 16, 20, 22]) beats.push({ activity: 'bottle', startMs: at(d, h) });
      for (const h of [0, 2, 4, 6]) beats.push({ activity: 'bottle', startMs: at(d + 1, h) });
    }
    const kept = rule({
      id: 'f',
      activity: 'bottle',
      ruleType: 'INTERVAL',
      everyMinutes: 240,
      nightMode: 'LONGER',
      nightFrom: '20:00',
      nightTo: '08:00',
      nightEveryMinutes: 120,
    });
    expect(coach({ ...base, rules: [kept], beats })).toEqual([]);
  });
});

describe('the night, when a rule runs one speed round the clock', () => {
  /** Days of 3h gaps from 08:00, and 5h gaps once past 22:00. */
  const beats: Beat[] = [];
  for (let d = 1; d <= 10; d += 1) {
    for (const h of [8, 11, 14, 17, 20, 23]) beats.push({ activity: 'pump', startMs: at(d, h) });
    beats.push({ activity: 'pump', startMs: at(d + 1, 4) }); // 23:00 → 04:00 is five hours
  }
  const pump = rule({ id: 'p', activity: 'pump', ruleType: 'INTERVAL', everyMinutes: 180 });

  it('offers the measured night gap, with the count it came from', () => {
    const s = coach({ ...base, rules: [pump], beats }).find(x => x.kind === 'nightGap');
    expect(s).toBeDefined();
    expect(s?.observedMinutes).toBe(300);
    expect(s?.apply).toMatchObject({ verb: 'setNight', nightEveryMinutes: 300 });
    expect(s?.samples).toBeGreaterThanOrEqual(COACH_MIN_SAMPLES);
  });

  it('measures the household’s own night, and writes that night if the change is taken', () => {
    // Routine passes its Day card, bed to wake — the window the Rule sheet writes too
    const s = coach({
      ...base,
      rules: [pump],
      beats,
      night: { from: '21:00', to: '06:00' },
    }).find(x => x.kind === 'nightGap');
    expect(s?.apply).toMatchObject({ nightFrom: '21:00', nightTo: '06:00' });
  });

  it('says nothing about a rule that already has a night of its own', () => {
    const s = coach({
      ...base,
      rules: [
        rule({
          id: 'p',
          activity: 'pump',
          ruleType: 'INTERVAL',
          everyMinutes: 180,
          nightMode: 'LONGER',
          nightFrom: '22:00',
          nightTo: '06:00',
          nightEveryMinutes: 300,
        }),
      ],
      beats,
    }).find(x => x.kind === 'nightGap');
    expect(s).toBeUndefined();
  });
});

/**
 * THE NIGHT A RULE KEEPS OF ITS OWN (the owner, 2026-09-28: *"is this only considering during the
 * day? what about the night prediction model?"*). A LONGER night is read against the gaps that
 * begin in its own window, as the day is read against the rest.
 */
describe('the night a rule keeps of its own, against the nights the log keeps', () => {
  /** Days of 3h gaps from 08:00, and a 5h gap once past 22:00: the same household as above. */
  const beats: Beat[] = [];
  for (let d = 1; d <= 10; d += 1) {
    for (const h of [8, 11, 14, 17, 20, 23]) beats.push({ activity: 'pump', startMs: at(d, h) });
    beats.push({ activity: 'pump', startMs: at(d + 1, 4) });
  }
  const longer = (nightEveryMinutes: number, nightMode: 'LONGER' | 'ONE' | 'PAUSE' = 'LONGER') =>
    rule({
      id: 'p',
      activity: 'pump',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
      nightMode,
      nightFrom: '22:00',
      nightTo: '06:00',
      nightEveryMinutes: nightMode === 'LONGER' ? nightEveryMinutes : null,
      nightAt: nightMode === 'ONE' ? '02:00' : null,
    });

  it('names the night setting and the log’s own nights, and offers the measured night', () => {
    const cards = coach({ ...base, rules: [longer(240)], beats });
    const s = cards.find(x => x.kind === 'nightInterval');
    expect(s).toBeDefined();
    expect(s?.currentMinutes).toBe(240);
    expect(s?.observedMinutes).toBe(300);
    expect(s?.samples).toBeGreaterThanOrEqual(COACH_MIN_SAMPLES);
    // written with the rule's own window, the one its night was already kept in
    expect(s?.apply).toEqual({
      verb: 'setNight',
      ruleId: 'p',
      nightEveryMinutes: 300,
      nightFrom: '22:00',
      nightTo: '06:00',
    });
    expect(s?.driftMinutes).toBe(60);
    // and the day beside it, read by day only, agrees with its 3h: no day card
    expect(cards.find(x => x.kind === 'interval')).toBeUndefined();
    // the id is the setting's, so "Not this" holds until the night setting changes
    expect(s?.id).toBe('nightInterval:p:240');
  });

  it('keeps quiet when the night setting and the log’s nights agree', () => {
    expect(coach({ ...base, rules: [longer(300)], beats })).toEqual([]);
    // inside a seventh of the interval is agreement too
    expect(coach({ ...base, rules: [longer(285)], beats })).toEqual([]);
  });

  it('never proposes an interval for a night kept once at a time, or kept without reminders', () => {
    for (const mode of ['ONE', 'PAUSE'] as const)
      expect(
        coach({ ...base, rules: [longer(0, mode)], beats }).filter(x => x.kind.startsWith('night')),
        mode,
      ).toEqual([]);
  });

  it('waits for six nights before it says anything about them', () => {
    const few = beats.filter(b => b.startMs < at(5, 12));
    expect(
      coach({ ...base, rules: [longer(240)], beats: few }).find(x => x.kind === 'nightInterval'),
    ).toBeUndefined();
  });
});

describe('the clock a reminder is set to, against the clock it is answered at', () => {
  /** A vitamin given at 08:25 every morning, against an 08:00 reminder. */
  const beats: Beat[] = Array.from({ length: 9 }, (_, d) => ({
    activity: 'med',
    startMs: at(d + 1, 8, 25),
  }));

  it('proposes the time it is actually logged at, to the nearest five', () => {
    const [s] = coach({
      ...base,
      rules: [rule({ id: 'v', activity: 'med', ruleType: 'FIXED', atLocalTime: '08:00' })],
      beats,
    });
    expect(s?.kind).toBe('slotTime');
    expect(s?.currentMinutes).toBe(8 * 60);
    expect(s?.observedMinutes).toBe(8 * 60 + 25);
    expect(s?.apply).toEqual({ verb: 'setTime', ruleId: 'v', atLocalTime: '08:25' });
    expect(s?.samples).toBe(9);
  });

  it('counts DAYS, not entries: three doses one morning are one day', () => {
    const thrice = [
      ...beats.slice(0, 3),
      { activity: 'med', startMs: at(1, 8, 30) },
      { activity: 'med', startMs: at(1, 8, 35) },
    ];
    const [s] = coach({
      ...base,
      rules: [rule({ id: 'v', activity: 'med', ruleType: 'FIXED', atLocalTime: '08:00' })],
      beats: thrice,
    });
    expect(s).toBeUndefined(); // three days is under COACH_MIN_DAYS
    expect(COACH_MIN_DAYS).toBe(5);
  });

  it('cannot be dragged by the next slot’s entries: nothing past three hours counts', () => {
    const lunch = Array.from({ length: 9 }, (_, d) => ({
      activity: 'med',
      startMs: at(d + 1, 18),
    }));
    expect(
      coach({
        ...base,
        rules: [rule({ id: 'v', activity: 'med', ruleType: 'FIXED', atLocalTime: '08:00' })],
        beats: lunch,
      }),
    ).toEqual([]);
  });
});

describe('a rhythm the routine has never heard of', () => {
  /** Pumping three times a day, two hours apart, for twelve days — and no rule for it. */
  const pumps = run('pump', 12, 9, 2 * H, 3);

  it('names it once there is a fortnight of it, and opens the row where a rhythm is set', () => {
    const [s] = coach({ ...base, rules: [], beats: pumps });
    expect(s?.kind).toBe('noRule');
    expect(s?.activity).toBe('pump');
    expect(s?.apply).toEqual({ verb: 'openRhythm', activity: 'pump' });
  });

  it('files a feeding rhythm under the feeding row, which is the bottle’s', () => {
    const [s] = coach({ ...base, rules: [], beats: run('breastfeed', 12, 7, 3 * H, 4) });
    expect(s?.activity).toBe('bottle');
    expect(s?.apply).toEqual({ verb: 'openRhythm', activity: 'bottle' });
  });

  it('is quiet where a rule for that activity already exists', () => {
    expect(
      coach({
        ...base,
        rules: [rule({ id: 'p', activity: 'pump', ruleType: 'INTERVAL', everyMinutes: 120 })],
        beats: pumps,
      }),
    ).toEqual([]);
  });

  /**
   * NEVER A MEDICINE, A NAP OR A DAILY GOAL (`COACH_RHYTHM_KEYS` says why). A medicine given
   * steadily with no reminder would have been offered "Set a rhythm" — the app proposing when to
   * give a medicine — and tummy time with a daily goal was told the routine had none of it.
   */
  it('never proposes a rhythm for a medicine, for sleep or for tummy time', () => {
    expect(COACH_RHYTHM_KEYS).toEqual(['feeding', 'pump', 'diaper', 'solids']);
    for (const activity of ['med', 'sleep', 'tummy', 'temp', 'bath']) {
      expect(
        coach({ ...base, rules: [], beats: run(activity, 12, 8, 2 * H, 4) }),
        activity,
      ).toEqual([]);
    }
  });

  /**
   * AND IT NEVER GUESSES AT A ONCE-A-DAY HABIT. Gaps of a day are dropped by `gapsOf` as nights
   * or holes in the logging, so no card is drawn — the right silence: those gaps are
   * indistinguishable from a fortnight of not logging.
   */
  it('says nothing about a rhythm measured in days', () => {
    expect(coach({ ...base, rules: [], beats: run('pump', 12, 9, 24 * H, 1) })).toEqual([]);
  });
});

/**
 * SET NAP TIMES, AGAINST THE NAPS THE LOG KEEPS (the owner, 2026-10-01: *"perhaps ask user if they
 * want to switch to smart nap outlook reminder?"*). Set times win over the nap heads-up, so a
 * household whose times have drifted from its naps is asked, under the Naps row, whether to take
 * the heads-up instead. Never about the baby: the setting, the log with its count, one change.
 */
describe('set nap times, against the naps the log keeps', () => {
  const set = [napTime('n1', '09:30'), napTime('n2', '13:30')];
  const naps = (times: readonly Rule[], logs: readonly SleepLog[]) =>
    coach({ ...base, rules: [...times], beats: [], naps: { times, logs } }).filter(
      s => s.kind === 'napTimes',
    );

  it('offers the heads-up once the naps start 20 minutes or more from the set times', () => {
    const [s] = naps(set, sleeps(7, 13));
    expect(s).toMatchObject({
      kind: 'napTimes',
      activity: 'sleep',
      ruleId: null,
      // seven days of two naps each, and how far they started from the set times, in the middle
      samples: 14,
      observedMinutes: 30,
      setTimes: ['09:30', '13:30'],
      apply: { verb: 'useHeadsUp', activity: 'sleep' },
      driftMinutes: 30,
    });
    // the setting, and nothing of the log's numbers: a median that moves keeps the same card
    expect(s?.id).toBe('napTimes:n1@09:30,n2@13:30');
  });

  it('stays quiet while the set times and the naps agree', () => {
    // 9:00 and 1:10 PM: on time, and ten minutes out, so the middle is under twenty
    expect(naps([napTime('n1', '09:00'), napTime('n2', '13:10')], sleeps(7, 13))).toEqual([]);
  });

  it('needs set nap times to switch from', () => {
    expect(naps([], sleeps(7, 13))).toEqual([]);
    // a paused nap time is no setting at all
    expect(naps([napTime('n1', '09:30', { isActive: false })], sleeps(7, 13))).toEqual([]);
  });

  it('waits for the bar a proposal keeps: six naps over five days', () => {
    expect(COACH_MIN_SAMPLES).toBe(6);
    expect(COACH_MIN_DAYS).toBe(5);
    // four days is eight naps, and still too few days to argue with a setting
    expect(naps(set, sleeps(10, 13))).toEqual([]);
    expect(naps(set, sleeps(9, 13))).toHaveLength(1);
  });

  it('needs the outlook to speak for this child: no naps logged is nothing to offer', () => {
    expect(naps(set, [])).toEqual([]);
    // nights alone: windows to the night, and not one nap among them
    const nights = sleeps(7, 13).filter(l => l.kind === 'NIGHT');
    expect(naps(set, nights)).toEqual([]);
  });

  it('is never drawn while Sleep is off on What you track', () => {
    expect(
      coach({
        ...base,
        enabled: new Set(['bottle']),
        rules: [...set],
        beats: [],
        naps: { times: set, logs: sleeps(7, 13) },
      }),
    ).toEqual([]);
  });

  it('asks again only when the setting changes: "Not this" was said about these times', () => {
    const [s] = naps(set, sleeps(7, 13));
    const dismissed = new Set([s?.id ?? '']);
    const args = { ...base, rules: [...set], beats: [], dismissed };
    expect(coach({ ...args, naps: { times: set, logs: sleeps(7, 13) } })).toEqual([]);
    // the same times on a shifted week: the same card, still hidden
    expect(coach({ ...args, naps: { times: set, logs: sleeps(6, 12) } })).toEqual([]);
    // a time moved by hand is a new setting, and a new card
    const moved = [napTime('n1', '09:45'), napTime('n2', '13:30')];
    expect(
      coach({ ...args, rules: [...moved], naps: { times: moved, logs: sleeps(7, 13) } }).map(
        x => x.id,
      ),
    ).toEqual(['napTimes:n1@09:45,n2@13:30']);
  });

  it('names every set time, the measurement with its count, and the one change', () => {
    const [s] = naps(set, sleeps(7, 13));
    const clock = (hhmm: string) => (hhmm === '09:30' ? '9:30 AM' : '1:30 PM');
    expect(s && coachHint(s, clock)).toBe(
      'Naps are set for 9:30 AM and 1:30 PM. About 30m away · 14.',
    );
    // never the stretch awake before a nap: the nap outlook's own number, which is Plus
    expect(s && coachHint(s, clock)).not.toMatch(/after waking/);
    expect(s && coachHint(s, clock)).not.toMatch(/2h 30m/);
    expect(s && coachAction(s, clock)).toBe(COACH_USE_HEADS_UP);
    expect(COACH_USE_HEADS_UP).toBe('Use a heads-up instead');
    expect(s && coachApplied(s, clock)).toBe('Naps are from your log now');
  });
});

describe('a module that is on with nothing in it', () => {
  const MONTH_AGO = NOW - 30 * DAY;
  const enabled = ['bottle', 'diaper', 'solids', 'bath', 'vaccine', 'growth', 'med', 'temp'];

  it('is named only among the modules a household logs most days', () => {
    expect(
      unusedModules({
        nowMs: NOW,
        counts: { bottle: 30, diaper: 20 },
        enabled,
        firstEntryMs: MONTH_AGO,
      }),
    ).toEqual(['solids', 'bath']);
    // a fortnight without a vaccine, a growth reading, a medicine or a temperature is ordinary
    for (const quiet of ['vaccine', 'growth', 'med', 'temp']) {
      expect(COACH_DAILY_MODULES).not.toContain(quiet);
    }
  });

  it('reads each module on its own: breastfeeds are not bottles', () => {
    expect(
      unusedModules({
        nowMs: NOW,
        counts: { breastfeed: 40 },
        enabled: ['bottle', 'breastfeed'],
        firstEntryMs: MONTH_AGO,
      }),
    ).toEqual(['bottle']);
  });

  it('says nothing to a household that has not been logging, or has not for a fortnight', () => {
    // put the app down for three weeks: nothing to compare against
    expect(unusedModules({ nowMs: NOW, counts: {}, enabled, firstEntryMs: MONTH_AGO })).toEqual([]);
    // three days in: "the last 14 days" would be about days before they arrived
    expect(
      unusedModules({
        nowMs: NOW,
        counts: { bottle: 9 },
        enabled,
        firstEntryMs: NOW - 3 * DAY,
      }),
    ).toEqual([]);
    expect(
      unusedModules({ nowMs: NOW, counts: { bottle: 9 }, enabled, firstEntryMs: null }),
    ).toEqual([]);
  });
});

describe('every card, together', () => {
  it('leads with the setting that disagrees most, and draws them all', () => {
    const beats = [
      ...run('bottle', 10, 7, 2.5 * H, 5), // 30m out
      ...run('pump', 10, 8, 4 * H, 4), // 120m out
    ];
    const list = coach({
      ...base,
      rules: [
        rule({ id: 'f', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 180 }),
        rule({ id: 'p', activity: 'pump', ruleType: 'INTERVAL', everyMinutes: 120 }),
      ],
      beats,
    });
    expect(list.map(s => s.ruleId)).toEqual(['p', 'f']);
  });

  it('keeps a card away once it has been waved off, and the id does not move with the median', () => {
    const args = {
      ...base,
      rules: [rule({ id: 'f', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 180 })],
      beats: run('bottle', 10, 7, 2.5 * H, 5),
    };
    expect(coach(args)[0]?.id).toBe('interval:f:180');
    expect(coach({ ...args, dismissed: new Set(['interval:f:180']) })).toEqual([]);
    // a different median, the same id — a dismissal that expired on a one-minute drift would
    // be a dismissal that does not work
    const moved = coach({ ...args, beats: run('bottle', 10, 7, 2.4 * H, 5) });
    expect(moved[0]?.id).toBe('interval:f:180');
  });

  it('asks again once the setting itself has changed: "not this" was about that setting', () => {
    const beats = run('bottle', 10, 7, 2.5 * H, 5);
    const dismissed = new Set(['interval:f:180']);
    const changed = coach({
      ...base,
      rules: [rule({ id: 'f', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 210 })],
      beats,
      dismissed,
    });
    expect(changed[0]?.id).toBe('interval:f:210');
  });
});

/**
 * THE FORGOTTEN ENTRY (the owner, 2026-09-26: "we have to also consider the human aspect of like
 * forget to logging, so some data might be spiked /not"). Every card rests on the MIDDLE gap, with
 * anything past eight hours left out as a night or a hole in the log (`gapsOf`) and a drift floor
 * under it (`driftFloor`), so a household that keeps its own setting and forgets one feed in five,
 * a whole day, or the time of one feed is not told its setting is out of step.
 */
describe('a log with holes in it', () => {
  const every3h = [rule({ id: 'f', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 180 })];
  // every three hours from 6 a.m. to 9 p.m., six feeds a day, for ten days: the setting, kept
  const kept = run('bottle', 10, 6, 3 * H, 6);

  it('keeps quiet when one feed in five was never logged', () => {
    const holes = kept.filter((_, i) => i % 5 !== 4);
    // a six-hour gap wherever a feed went unlogged — and the middle is still three hours
    expect(gapsOf(holes.map(b => b.startMs))).toContain(6 * H);
    expect(coach({ ...base, rules: every3h, beats: holes })).toEqual([]);
  });

  it('keeps quiet across a day nobody logged', () => {
    const blank = kept.filter(b => dayStartOf(b.startMs) !== at(5, 0));
    expect(coach({ ...base, rules: every3h, beats: blank })).toEqual([]);
  });

  it('keeps quiet when a feed was logged hours late, at the time it was written', () => {
    const late = kept.map((b, i) => (i === 20 ? { ...b, startMs: b.startMs + 2 * H } : b));
    expect(coach({ ...base, rules: every3h, beats: late })).toEqual([]);
  });

  it('still speaks when the household really keeps another rhythm, holes and all', () => {
    const other = run('bottle', 10, 6, 2.5 * H, 7).filter((_, i) => i % 5 !== 4);
    expect(coach({ ...base, rules: every3h, beats: other })[0]).toMatchObject({
      kind: 'interval',
      observedMinutes: 150,
    });
  });
});

describe('the arithmetic helpers', () => {
  it('rounds a proposal to a number a parent would type', () => {
    expect(round5(152)).toBe(150);
    expect(round5(153)).toBe(155);
    expect(round5(1)).toBe(5);
  });
  it('drops a double log and an overnight hole from the gaps', () => {
    const starts = [0, 5 * M, 3 * H, 3 * H + 12 * H, 3 * H + 15 * H];
    expect(gapsOf(starts)).toEqual([3 * H - 5 * M, 3 * H]);
  });
  it('scales the threshold with the interval', () => {
    expect(driftFloor(40 * M)).toBe(20 * M);
    expect(driftFloor(7 * H)).toBe(60 * M);
  });
  it('spells a time back out', () => {
    expect(hhmmOfMinutes(8 * 60 + 25)).toBe('08:25');
    expect(hhmmOfMinutes(-5)).toBe('23:55');
  });
});

describe('the sentences', () => {
  const clock = (hhmm: string) => hhmm;
  /** One of every kind: a drifted interval, a moved reminder, a slow night, a rhythm with no rule. */
  const nightPumps: Beat[] = [];
  for (let d = 1; d <= 10; d += 1) {
    for (const h of [8, 11, 14, 17, 20, 23])
      nightPumps.push({ activity: 'pump', startMs: at(d, h) });
    nightPumps.push({ activity: 'pump', startMs: at(d + 1, 4) });
  }
  const kinds = coach({
    ...base,
    enabled: new Set(['bottle', 'pump', 'med', 'diaper']),
    rules: [
      rule({ id: 'f', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 180 }),
      rule({ id: 'v', activity: 'med', ruleType: 'FIXED', atLocalTime: '08:00' }),
      rule({ id: 'p', activity: 'pump', ruleType: 'INTERVAL', everyMinutes: 180 }),
    ],
    beats: [
      ...run('bottle', 10, 7, 2.5 * H, 5),
      ...Array.from({ length: 9 }, (_, d) => ({ activity: 'med', startMs: at(d + 1, 8, 25) })),
      ...nightPumps,
      ...run('diaper', 12, 8, 3 * H, 4),
    ],
  });
  // and a night kept of its own, read against its own nights (2026-09-28)
  kinds.push(
    ...coach({
      ...base,
      enabled: new Set(['pump']),
      rules: [
        rule({
          id: 'n',
          activity: 'pump',
          ruleType: 'INTERVAL',
          everyMinutes: 180,
          nightMode: 'LONGER',
          nightFrom: '22:00',
          nightTo: '06:00',
          nightEveryMinutes: 240,
        }),
      ],
      beats: nightPumps,
    }),
  );
  // and set nap times the log's naps have moved away from (2026-10-01)
  const napSet = [napTime('n1', '09:30'), napTime('n2', '13:30')];
  kinds.push(
    ...coach({
      ...base,
      enabled: new Set(['sleep']),
      rules: napSet,
      beats: [],
      naps: { times: napSet, logs: sleeps(7, 13) },
    }),
  );
  const all = [
    COACH_TITLE,
    COACH_METHOD,
    COACH_DISMISS,
    COACH_DISMISSED,
    COACH_UNUSED,
    ...kinds.flatMap(s => [
      coachHint(s, clock),
      coachHint(s, clock, { name: 'Bedtime' }),
      coachAction(s, clock),
      coachApplied(s, clock),
    ]),
  ].join(' \n ');

  it('covers every kind of card the engine can produce', () => {
    expect(new Set(kinds.map(s => s.kind))).toEqual(
      new Set(['interval', 'slotTime', 'nightGap', 'nightInterval', 'noRule', 'napTimes']),
    );
  });

  it('diagnoses nothing and instructs nobody about a baby', () => {
    for (const word of BANNED) expect(all.toLowerCase(), word).not.toContain(word);
  });

  it('never says a number is big, small, better or worse', () => {
    for (const word of [
      'too much',
      'too little',
      'longer',
      'shorter',
      'higher',
      'lower',
      'improve',
      'better',
      'worse',
      'rising',
      'falling',
      'trend',
      'you are',
      'your baby is',
    ]) {
      expect(all.toLowerCase(), word).not.toContain(word);
    }
  });

  it('always shows the count the claim rests on, and the setting it is about', () => {
    for (const s of kinds) {
      const line = coachHint(s, clock);
      expect(line, s.kind).toContain(String(s.samples));
      expect(line, s.kind).toMatch(/^(Set to|Set for|No rhythm is set|Naps are set for)/);
    }
  });

  it('names a clock time that has a name of its own — the bed time under the Day card', () => {
    const slot = kinds.find(s => s.kind === 'slotTime');
    expect(slot && coachHint(slot, clock, { name: 'Bedtime' })).toBe(
      'Bedtime is set for 08:00. Logged at 08:25 · 9 days.',
    );
  });

  it('names exactly what the one control will change', () => {
    const interval = kinds.find(s => s.kind === 'interval');
    expect(interval && coachAction(interval, clock)).toBe('Set to every 2h 30m');
    const noRule = kinds.find(s => s.kind === 'noRule');
    expect(noRule && coachAction(noRule, clock)).toBe('Set a rhythm');
  });

  it('spells a duration the way every other card does', () => {
    expect(coachGap(150)).toBe('2h 30m');
    expect(coachGap(45)).toBe('45m');
    expect(coachGap(120)).toBe('2h');
  });
});
