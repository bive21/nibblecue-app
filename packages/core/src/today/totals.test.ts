import { describe, expect, it } from 'vitest';
import { volumeText } from '../entry/units';
import { localDayBounds, zonedToUtc } from './day';
import { visibleTo, type ActiveTimer, type TodayActivity } from './rows';
import {
  countsAsDiaper,
  countsAsFeed,
  countsAsMilk,
  diaperKinds,
  recordedMs,
  sameTimeYesterday,
  todayTotals,
} from './totals';

const TZ = 'America/Los_Angeles';
const at = (h: number, m = 0, day = 14): number => zonedToUtc(TZ, 2026, 9, day, h, m);
const NOON = at(12);
const BOUNDS = localDayBounds(TZ, NOON);

let seq = 0;
function row(
  over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>,
): TodayActivity {
  seq += 1;
  return {
    id: `a${seq}`,
    childId: 'kid',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  };
}

const NOTHING: ActiveTimer[] = [];

describe('todayTotals — tummy time toward a goal', () => {
  it('sums today’s tummy time by overlap and includes a running go so far', () => {
    const rows = [
      row({ type: 'tummy', startMs: at(9), endMs: at(9, 4) }),
      row({ type: 'tummy', startMs: at(11), endMs: at(11, 6) }),
    ];
    const running: ActiveTimer[] = [
      { id: 't1', type: 'tummy', childId: 'kid', startedAtMs: at(11, 50), startedBy: 'dana' },
    ];
    expect(todayTotals(rows, NOTHING, BOUNDS, NOON).tummyMinutes).toBe(10);
    expect(todayTotals(rows, running, BOUNDS, NOON).tummyMinutes).toBe(20);
  });

  it('gives a go that straddles midnight to each day exactly once', () => {
    const late = row({ type: 'tummy', startMs: at(23, 55, 13), endMs: at(0, 5) });
    const yesterday = localDayBounds(TZ, at(12, 0, 13));
    const a = todayTotals([late], NOTHING, yesterday, at(12, 0, 13)).tummyMinutes;
    const b = todayTotals([late], NOTHING, BOUNDS, NOON).tummyMinutes;
    expect(a + b).toBe(10);
  });
});

describe('todayTotals — milk, feeds and diapers', () => {
  it('sums today’s bottles and counts them as feeds', () => {
    const t = todayTotals(
      [
        row({ type: 'bottle', startMs: at(8), consumedMl: 120 }),
        row({ type: 'bottle', startMs: at(11), consumedMl: 90 }),
      ],
      NOTHING,
      BOUNDS,
      NOON,
    );
    expect(t.milkMl).toBe(210);
    expect(t.feeds).toBe(2);
  });

  it('counts a refused bottle as a feed and adds nothing to the milk (D16)', () => {
    const t = todayTotals(
      [row({ type: 'bottle', startMs: at(8), consumedMl: 0 })],
      NOTHING,
      BOUNDS,
      NOON,
    );
    expect(t.milkMl).toBe(0);
    expect(t.feeds).toBe(1);
  });

  it('counts breastfeeds as feeds but not as milk — no volume was measured', () => {
    const t = todayTotals(
      [row({ type: 'breastfeed', startMs: at(9), endMs: at(9, 20) })],
      NOTHING,
      BOUNDS,
      NOON,
    );
    expect(t.feeds).toBe(1);
    expect(t.milkMl).toBe(0);
  });

  /*
    THE MINUTES AT THE BREAST (the owner, 2026-09-26: "milk also comes from breastfeeding … it just
    shows intake per day"). Today's milk figure carries them beside the ounces. Each feed counts at
    its RECORDED length, in whole minutes as its own log row says them, then the rows are added —
    never converted into an amount.
  */
  it('adds today’s breastfeeds at their recorded minutes, and counts them', () => {
    const t = todayTotals(
      [
        // paused half way: 30 minutes on the clock, 18 at the breast (10 left, 8 right)
        row({
          type: 'breastfeed',
          startMs: at(7),
          endMs: at(7, 30),
          leftSeconds: 600,
          rightSeconds: 480,
        }),
        // 12m 40s at the breast reads "13m" on its row, so it adds 13
        row({
          type: 'breastfeed',
          startMs: at(10),
          endMs: at(10, 13),
          leftSeconds: 760,
          rightSeconds: 0,
        }),
        // no sides recorded: its span is its length
        row({ type: 'breastfeed', startMs: at(11), endMs: at(11, 20) }),
        // yesterday's feed is yesterday's
        row({ type: 'breastfeed', startMs: at(21, 0, 13), endMs: at(21, 25, 13) }),
        // a bottle is a feed with no minutes at the breast
        row({ type: 'bottle', startMs: at(9), consumedMl: 90 }),
      ],
      NOTHING,
      BOUNDS,
      NOON,
    );
    expect(t.breastfeeds).toBe(3);
    expect(t.breastfeedMinutes).toBe(18 + 13 + 20);
    expect(t.feeds).toBe(4);
    // and never an amount: the milk is the bottle's alone
    expect(t.milkMl).toBe(90);
  });

  it('leaves a breastfeed still being timed out until it is saved', () => {
    const running: ActiveTimer[] = [
      { id: 't1', type: 'breastfeed', childId: 'kid', startedAtMs: at(11, 40), startedBy: 'dana' },
    ];
    const t = todayTotals([], running, BOUNDS, NOON);
    expect(t.breastfeedMinutes).toBe(0);
    expect(t.breastfeeds).toBe(0);
  });

  it('ignores yesterday’s bottle entirely', () => {
    const t = todayTotals(
      [row({ type: 'bottle', startMs: at(22, 0, 13), consumedMl: 150 })],
      NOTHING,
      BOUNDS,
      NOON,
    );
    expect(t.milkMl).toBe(0);
    expect(t.feeds).toBe(0);
  });

  /*
    WATER IS NOT MILK (the feeding audit, M7; decided 2026-09-24). A 2 oz water bottle made "Milk
    today" 2 oz larger and counted as a feed on Today, the widget, Reports and the visit summary.
    The entry is still a bottle in the log; it is only left out of the two figures it is not.
  */
  it('leaves a bottle of water out of the milk and out of the feeds, and counts the milk bottles', () => {
    const t = todayTotals(
      [
        row({ type: 'bottle', startMs: at(8), consumedMl: 120, bottleKind: 'EBM' }),
        row({ type: 'bottle', startMs: at(9), consumedMl: 60, bottleKind: 'WATER' }),
        row({ type: 'bottle', startMs: at(11), consumedMl: 90, bottleKind: 'FORMULA' }),
        // a bottle whose kind has not arrived yet is still milk, as it always was
        row({ type: 'bottle', startMs: at(11, 30), consumedMl: 30 }),
      ],
      NOTHING,
      BOUNDS,
      NOON,
    );
    expect(t.milkMl).toBe(240);
    expect(t.milkBottles).toBe(3);
    expect(t.feeds).toBe(3);
  });

  it('excludes DRY from the diaper count and counts the other three', () => {
    const t = todayTotals(
      [
        row({ type: 'diaper', startMs: at(7), diaperKind: 'WET' }),
        row({ type: 'diaper', startMs: at(9), diaperKind: 'DIRTY' }),
        row({ type: 'diaper', startMs: at(10), diaperKind: 'BOTH' }),
        row({ type: 'diaper', startMs: at(11), diaperKind: 'DRY' }),
      ],
      NOTHING,
      BOUNDS,
      NOON,
    );
    expect(t.diapers).toBe(3);
  });
});

describe('todayTotals — sleep is summed by overlap (D2)', () => {
  it('gives last night’s sleep only the part that fell after midnight', () => {
    const t = todayTotals(
      [row({ type: 'sleep', startMs: at(23, 30, 13), endMs: at(7, 0) })],
      NOTHING,
      BOUNDS,
      NOON,
    );
    expect(t.sleepMinutes).toBe(7 * 60);
  });

  it('adds up to the whole sleep across the two days it touches, exactly once', () => {
    const sleep = row({ type: 'sleep', startMs: at(23, 30, 13), endMs: at(7, 0) });
    const yesterday = localDayBounds(TZ, at(12, 0, 13));
    const a = todayTotals([sleep], NOTHING, yesterday, at(12, 0, 13)).sleepMinutes;
    const b = todayTotals([sleep], NOTHING, BOUNDS, NOON).sleepMinutes;
    expect(a).toBe(30);
    expect(a + b).toBe((sleep.endMs! - sleep.startMs) / 60_000);
  });

  it('includes the part of a still-running sleep that has already happened', () => {
    const running: ActiveTimer[] = [
      { id: 't1', type: 'sleep', childId: 'kid', startedAtMs: at(11, 30), startedBy: 'dana' },
    ];
    const t = todayTotals([], running, BOUNDS, NOON);
    expect(t.sleepMinutes).toBe(30);
  });

  it('clips a running sleep that began yesterday to today’s part', () => {
    const running: ActiveTimer[] = [
      { id: 't1', type: 'sleep', childId: 'kid', startedAtMs: at(23, 0, 13), startedBy: 'dana' },
    ];
    // it is 01:00 and the baby has been asleep since 23:00 yesterday
    const oneAm = at(1);
    expect(todayTotals([], running, BOUNDS, oneAm).sleepMinutes).toBe(60);
  });

  it('counts a running timer that is not sleep toward nothing', () => {
    const running: ActiveTimer[] = [
      { id: 't1', type: 'tummy', childId: 'kid', startedAtMs: at(11, 30), startedBy: 'dana' },
    ];
    expect(todayTotals([], running, BOUNDS, NOON).sleepMinutes).toBe(0);
  });
});

describe('todayTotals — pump', () => {
  it('sums output and counts sessions', () => {
    const t = todayTotals(
      [
        row({ type: 'pump', childId: null, startMs: at(6), totalMl: 220 }),
        row({ type: 'pump', childId: null, startMs: at(10), totalMl: 190 }),
      ],
      NOTHING,
      BOUNDS,
      NOON,
    );
    expect(t.pumpedMl).toBe(410);
    expect(t.pumpSessions).toBe(2);
    // pumping is not a feed — nothing was given to the baby
    expect(t.feeds).toBe(0);
  });
});

describe('todayTotals — minutes as the rows say them, then added', () => {
  // the pre-launch sweep, 2026-09-27: a timer's entries have seconds. Three naps of 44m 40s,
  // 1h 29m 40s and 29m 35s are Log rows of 45m, 1h 30m and 30m; three goes of tummy time of
  // 4m 40s, 4m 35s and 4m 45s are three "5m" rows. The day read 2h 44m and 14m of them.
  const s = (m: number, sec: number) => (m * 60 + sec) * 1000;
  const rows = [
    row({ type: 'sleep', startMs: at(8, 0), endMs: at(8, 0) + s(44, 40), sleepKind: 'NAP' }),
    row({ type: 'sleep', startMs: at(10, 0), endMs: at(10, 0) + s(89, 40), sleepKind: 'NAP' }),
    row({ type: 'sleep', startMs: at(11, 40), endMs: at(11, 40) + s(29, 35), sleepKind: 'NAP' }),
    row({ type: 'tummy', startMs: at(9, 0), endMs: at(9, 0) + s(4, 40) }),
    row({ type: 'tummy', startMs: at(9, 30), endMs: at(9, 30) + s(4, 35) }),
    row({ type: 'tummy', startMs: at(11, 20), endMs: at(11, 20) + s(4, 45) }),
  ];

  it('the day is the sum of its rows: 2h 45m of naps, and a 15-minute goal met', () => {
    const t = todayTotals(rows, NOTHING, BOUNDS, NOON);
    expect(t.sleepMinutes).toBe(45 + 90 + 30);
    expect(t.tummyMinutes).toBe(15);
  });

  it('a sleep across midnight gives each day its own part, the two adding to the row', () => {
    const late = row({
      type: 'sleep',
      startMs: at(23, 30, 13) + 20_000,
      endMs: at(0, 40) + 10_000,
      sleepKind: 'NIGHT',
    });
    const yesterday = todayTotals([late], NOTHING, localDayBounds(TZ, at(12, 0, 13)), NOON);
    const today = todayTotals([late], NOTHING, BOUNDS, NOON);
    expect([yesterday.sleepMinutes, today.sleepMinutes]).toEqual([30, 40]);
  });
});

describe('todayTotals — volumes added up as they read in the household’s unit', () => {
  // the pre-launch sweep, 2026-09-27: a newborn's ten 1 oz bottles, each stored as 30 ml, read
  // "10.25 oz" as a plain sum; and five pump sessions of 1 oz a side, 60 ml each, "10.25 oz"
  const bottles = Array.from({ length: 10 }, (_, i) =>
    row({ type: 'bottle', startMs: at(i + 1), consumedMl: 30 }),
  );
  const sessions = Array.from({ length: 5 }, (_, i) =>
    row({ type: 'pump', childId: null, startMs: at(i + 2, 30), totalMl: 60 }),
  );

  it('in ounces, each bottle and each session counts what its own row reads', () => {
    const t = todayTotals([...bottles, ...sessions], NOTHING, BOUNDS, NOON, 'oz');
    expect(volumeText(t.milkMl, 'oz')).toBe('10 oz');
    expect(volumeText(t.pumpedMl, 'oz')).toBe('10 oz');
    expect(t.milkBottles).toBe(10);
    expect(t.pumpSessions).toBe(5);
  });

  it('in milliliters, and with no unit, the plain sums of what is stored', () => {
    for (const t of [
      todayTotals([...bottles, ...sessions], NOTHING, BOUNDS, NOON, 'ml'),
      todayTotals([...bottles, ...sessions], NOTHING, BOUNDS, NOON),
    ]) {
      expect(t.milkMl).toBe(300);
      expect(t.pumpedMl).toBe(300);
    }
  });
});

describe('visibleTo — private pump sessions', () => {
  const rows = [
    row({
      type: 'pump',
      childId: null,
      startMs: at(6),
      totalMl: 220,
      isPrivate: true,
      createdBy: 'mom',
    }),
    row({ type: 'pump', childId: null, startMs: at(10), totalMl: 190, createdBy: 'mom' }),
  ];

  it('hides a private session from everyone but its creator', () => {
    expect(visibleTo(rows, 'dana')).toHaveLength(1);
    expect(visibleTo(rows, 'mom')).toHaveLength(2);
  });

  it('changes the totals the two of them see, which is the point', () => {
    expect(todayTotals(visibleTo(rows, 'dana'), NOTHING, BOUNDS, NOON).pumpedMl).toBe(190);
    expect(todayTotals(visibleTo(rows, 'mom'), NOTHING, BOUNDS, NOON).pumpedMl).toBe(410);
  });
});

describe('diaperKinds — the breakdown under the count', () => {
  it('counts wet, dirty and both inside the day, and never dry', () => {
    const k = diaperKinds(
      [
        row({ type: 'diaper', startMs: at(7), diaperKind: 'WET' }),
        row({ type: 'diaper', startMs: at(9), diaperKind: 'BOTH' }),
        row({ type: 'diaper', startMs: at(10), diaperKind: 'BOTH' }),
        row({ type: 'diaper', startMs: at(11), diaperKind: 'DIRTY' }),
        row({ type: 'diaper', startMs: at(11, 30), diaperKind: 'DRY' }),
        // yesterday's change is not today's
        row({ type: 'diaper', startMs: at(23, 0, 13), diaperKind: 'WET' }),
      ],
      BOUNDS,
    );
    expect(k).toEqual({ wet: 1, dirty: 1, both: 2 });
  });
});

describe('sameTimeYesterday — a fair "than yesterday"', () => {
  const yesterday = localDayBounds(TZ, at(12, 0, 13));
  it('clips yesterday to the hours today has had', () => {
    const w = sameTimeYesterday(BOUNDS, yesterday, at(9, 30));
    expect(w.startMs).toBe(yesterday.startMs);
    expect(w.endMs).toBe(yesterday.startMs + 9.5 * 3_600_000);
  });
  it('is the whole of yesterday once today is over', () => {
    const w = sameTimeYesterday(BOUNDS, yesterday, BOUNDS.endMs + 5);
    expect(w).toEqual(yesterday);
  });
  it('so a sleep that ran across midnight is shared with yesterday the way today shares it', () => {
    // asleep 10 p.m. yesterday to 6 a.m. today; asked at 9 a.m.
    const rows = [row({ type: 'sleep', startMs: at(22, 0, 13), endMs: at(6) })];
    const now = at(9);
    const today = todayTotals(rows, NOTHING, BOUNDS, now);
    const y = todayTotals(rows, NOTHING, sameTimeYesterday(BOUNDS, yesterday, now), now);
    expect(today.sleepMinutes).toBe(6 * 60);
    // yesterday's window is midnight to 9 a.m. of the 13th, and the sleep began at 10 p.m.
    expect(y.sleepMinutes).toBe(0);
  });
});

describe('what counts as what — one definition for every surface', () => {
  it('a bottle of water is neither milk nor a feed; a breastfeed is a feed and not milk', () => {
    expect(countsAsMilk({ type: 'bottle', bottleKind: 'WATER' })).toBe(false);
    expect(countsAsFeed({ type: 'bottle', bottleKind: 'WATER' })).toBe(false);
    for (const kind of ['EBM', 'FORMULA', 'MIXED', 'OTHER', null] as const) {
      expect(countsAsMilk({ type: 'bottle', bottleKind: kind })).toBe(true);
      expect(countsAsFeed({ type: 'bottle', bottleKind: kind })).toBe(true);
    }
    // a bottle whose detail row has not arrived yet is still milk, as it always was
    expect(countsAsMilk({ type: 'bottle' })).toBe(true);
    expect(countsAsMilk({ type: 'breastfeed' })).toBe(false);
    expect(countsAsFeed({ type: 'breastfeed' })).toBe(true);
    expect(countsAsFeed({ type: 'pump' })).toBe(false);
  });

  it('a DRY check is not a diaper change; every other kind, and a kind not yet arrived, is', () => {
    expect(countsAsDiaper({ type: 'diaper', diaperKind: 'DRY' })).toBe(false);
    for (const kind of ['WET', 'DIRTY', 'BOTH', null] as const) {
      expect(countsAsDiaper({ type: 'diaper', diaperKind: kind })).toBe(true);
    }
    expect(countsAsDiaper({ type: 'bath' })).toBe(false);
  });
});

/*
  A BREASTFEED LASTS THE MINUTES AT THE BREAST (the feeding audit, H1). A pause, a Finish tapped
  while paused, a corrected start or a tandem feed all stretch the wall clock; the toast said
  "18 min" and every reader said "30m". The sides are what was recorded.
*/
describe('recordedMs', () => {
  const MIN = 60_000;
  it('is left plus right for a breastfeed whose sides were recorded', () => {
    expect(
      recordedMs({
        type: 'breastfeed',
        startMs: at(8),
        endMs: at(8, 30),
        leftSeconds: 600,
        rightSeconds: 480,
      }),
    ).toBe(18 * MIN);
  });

  it('is the span for a breastfeed with no sides, and for every other type', () => {
    expect(recordedMs({ type: 'breastfeed', startMs: at(8), endMs: at(8, 20) })).toBe(20 * MIN);
    expect(
      recordedMs({
        type: 'breastfeed',
        startMs: at(8),
        endMs: at(8, 20),
        leftSeconds: 0,
        rightSeconds: 0,
      }),
    ).toBe(20 * MIN);
    expect(recordedMs({ type: 'sleep', startMs: at(8), endMs: at(9, 35) })).toBe(95 * MIN);
    expect(recordedMs({ type: 'diaper', startMs: at(8), endMs: null })).toBe(0);
    // an end before the start is nothing, never a negative length
    expect(recordedMs({ type: 'tummy', startMs: at(8), endMs: at(7) })).toBe(0);
  });
});
