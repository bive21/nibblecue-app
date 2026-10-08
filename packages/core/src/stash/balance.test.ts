import { describe, expect, it } from 'vitest';
import { volumeText } from '../entry/units';
import { deriveOpId } from '../sync/ids';
import {
  isNetZeroKind,
  ledgerWindow,
  stashBuckets,
  stashWeekDays,
  undoIdOf,
  weeklyBalance,
  weekStartMs,
  withoutUndone,
  type LedgerLine,
} from './balance';
import type { MilkTxnKind } from './constants';

const TZ = 'America/New_York';
const now = Date.parse('2026-06-12T15:00:00-04:00'); // a Friday
const DAY = 24 * 60 * 60_000;
const iso = (dayOffset: number) => new Date(now + dayOffset * DAY).toISOString();

/** A fixed namespace for the rows' ids, so every run mints the same uuids. */
const SEED = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
let n = 0;
/** A ledger row as the app writes it: its id IS its op id (`chains.ts` `ledgerOp`). */
function line(kind: MilkTxnKind, delta: number, occurredAt: string, tag?: string): LedgerLine {
  n += 1;
  const id = deriveOpId(SEED, tag ?? `row-${n}`);
  return { id, client_op_id: id, kind, delta_ml: delta, occurred_at: occurredAt };
}
/** The row an Undo writes to take `row` back — `data/undo.ts` `compensate`, to the letter. */
function undoOf(row: LedgerLine, occurredAt: string): LedgerLine {
  const id = deriveOpId(row.client_op_id, 'undo');
  return { id, client_op_id: id, kind: 'ADJUST', delta_ml: -row.delta_ml, occurred_at: occurredAt };
}

describe('the weekly balance identity (MILK_STASH §9)', () => {
  const rows: LedgerLine[] = [
    line('ADD', 177, iso(-3)),
    line('ADD', 118, iso(-1)),
    line('USE', -118, iso(-2)),
    line('DISCARD', -59, iso(-1)),
    line('ADJUST', -3, iso(-1)),
    line('ADJUST', 30, iso(0)),
    line('MOVE', 0, iso(-1)),
    line('THAW', 0, iso(-1)),
    line('SPLIT', -60, iso(-1)),
    line('SPLIT', 60, iso(-1)),
    // last week: outside the window
    line('ADD', 500, iso(-10)),
  ];
  it('starts the week on Monday in the household zone', () => {
    const monday = weekStartMs(TZ, now);
    expect(new Date(monday).toISOString()).toBe('2026-06-08T04:00:00.000Z');
    expect(weekStartMs(TZ, monday + 60_000)).toBe(monday);
  });
  it('sums each term from the ledger and derives the start from the identity', () => {
    const b = weeklyBalance(rows, weekStartMs(TZ, now), 1000);
    expect(b).toMatchObject({
      // ADD rows only: the +30 correction is a correction, not milk pumped (2026-09-24)
      pumpedMl: 177 + 118,
      usedMl: 118,
      discardedMl: 59,
      adjustedUpMl: 30,
      adjustedDownMl: 3,
      correctedMl: 27,
      currentMl: 1000,
    });
    // the books' own check: the identity closes by itself
    expect(b.startMl + b.pumpedMl - b.usedMl - b.discardedMl + b.correctedMl).toBe(1000);
  });
  it('MOVE, THAW and SPLIT cannot move the balance', () => {
    const without = weeklyBalance(
      rows.filter(r => !isNetZeroKind(r.kind)),
      weekStartMs(TZ, now),
      1000,
    );
    const withThem = weeklyBalance(rows, weekStartMs(TZ, now), 1000);
    expect(withThem).toEqual(without);
    expect(['MOVE', 'THAW', 'SPLIT'].every(k => isNetZeroKind(k as never))).toBe(true);
    expect(isNetZeroKind('USE')).toBe(false);
  });
  it('the seven-day window is the same arithmetic over a shorter span', () => {
    const w = ledgerWindow(rows, now - 7 * DAY);
    expect(w.pumpedMl).toBe(295);
    expect(w.adjustedUpMl).toBe(30);
    expect(w.usedMl).toBe(118);
  });
});

/**
 * A WRITE AND ITS UNDO CANCEL OUT (2026-09-27). The owner's first-run tour saved a trial bag into
 * the stash; the tour's clean-up took it back through Undo after the write had already reached the
 * server, and the ledger — append-only — kept both rows. Reports then read "Pumped +4 oz" and
 * "Corrected −4 oz" for milk that was never there.
 */
describe('a write and its Undo cancel out before anything is summed', () => {
  const since = now - 7 * DAY;
  const pump = line('ADD', 118, iso(-1), 'tour-trial-add');
  const bottle = line('USE', -120, iso(-2), 'bottle-use');
  const deleteBack = line('ADJUST', 120, iso(-1), 'log-delete-adjust');

  it('names the row an Undo writes exactly as the app mints it', () => {
    expect(undoIdOf(pump)).toBe(deriveOpId(pump.client_op_id, 'undo'));
    // a fixture that is not a uuid is never paired, and never throws
    expect(undoIdOf({ client_op_id: 'not-a-uuid' })).toBeNull();
  });

  it.each([
    {
      name: 'a trial entry the tour saved into the stash and took back',
      rows: [pump, undoOf(pump, iso(-1))],
      want: { pumpedMl: 0, usedMl: 0, adjustedUpMl: 0, adjustedDownMl: 0, useCount: 0 },
    },
    {
      name: 'a synced pump a parent took back with Undo',
      rows: [
        line('ADD', 148, iso(-3), 'pump-148'),
        undoOf(line('ADD', 148, iso(-3), 'pump-148'), iso(-3)),
      ],
      want: { pumpedMl: 0, adjustedUpMl: 0, adjustedDownMl: 0 },
    },
    {
      name: 'an undone bottle is milk never used, and not a use to rate',
      rows: [bottle, undoOf(bottle, iso(-2))],
      want: { usedMl: 0, useCount: 0, adjustedUpMl: 0 },
    },
    {
      name: 'a delete from the Log that was undone leaves the bottle standing',
      rows: [bottle, deleteBack, undoOf(deleteBack, iso(-1))],
      want: { usedMl: 120, useCount: 1, adjustedUpMl: 0, adjustedDownMl: 0 },
    },
    {
      name: 'a delete from the Log that stood puts the milk back as a correction',
      rows: [bottle, deleteBack],
      want: { usedMl: 120, adjustedUpMl: 120 },
    },
    {
      name: 'a parent’s own “Correct the amount” is kept',
      rows: [pump, line('ADJUST', -15, iso(0), 'correct-down')],
      want: { pumpedMl: 118, adjustedDownMl: 15 },
    },
    {
      name: 'two bags, one taken back: only that one goes',
      rows: [pump, undoOf(pump, iso(-1)), line('ADD', 90, iso(-1), 'kept-bag')],
      want: { pumpedMl: 90 },
    },
    {
      name: 'an Undo whose write fell before the window stays the correction it is',
      rows: [undoOf(line('ADD', 60, iso(-20), 'old-bag'), iso(-1))],
      want: { pumpedMl: 0, adjustedDownMl: 60 },
    },
  ])('$name', ({ rows, want }) => {
    expect(ledgerWindow(rows, since)).toMatchObject(want);
  });

  it('pairs across the window: a write read from before it still finds its Undo inside it', () => {
    const early = line('ADD', 60, iso(-9), 'early-bag');
    const undone = undoOf(early, iso(-1));
    // read with the write: both go, and nothing moved this week
    expect(ledgerWindow([early, undone], since)).toMatchObject({ pumpedMl: 0, adjustedDownMl: 0 });
  });

  it('takes out each pair once and keeps every other row in its order', () => {
    const a = line('ADD', 10, iso(-3));
    const b = line('USE', -5, iso(-2));
    const c = line('DISCARD', -2, iso(-1));
    const rows = [a, b, undoOf(b, iso(-2)), c];
    expect(withoutUndone(rows)).toEqual([a, c]);
    expect(withoutUndone([a, c])).toEqual([a, c]);
    // an Undo alone, without the write it takes back, is not paired with anything
    const lone = undoOf(line('ADD', 7, iso(-30)), iso(-1));
    expect(withoutUndone([a, lone])).toEqual([a, lone]);
  });

  it('never moves the balance: every pair sums to nothing', () => {
    const rows = [
      pump,
      undoOf(pump, iso(-1)),
      bottle,
      undoOf(bottle, iso(-2)),
      line('ADD', 30, iso(-1)),
    ];
    const sum = (xs: readonly LedgerLine[]) => xs.reduce((s, r) => s + r.delta_ml, 0);
    expect(sum(withoutUndone(rows))).toBe(sum(rows));
  });
});

describe('the stash’s week, a day at a time (Reports, 2026-09-27)', () => {
  const at = (day: number, hh: number) =>
    new Date(weekStartMs(TZ, now) + day * DAY + hh * 3_600_000).toISOString();

  it('is Monday to Sunday in the household’s zone, today marked and the rest still to come', () => {
    const w = stashWeekDays([], TZ, now);
    expect(w.days).toHaveLength(7);
    expect(new Date(w.days[0]!.startMs).toISOString()).toBe('2026-06-08T04:00:00.000Z');
    expect(w.today).toBe(4); // Friday
    expect(w.days.map(d => d.ahead)).toEqual([false, false, false, false, false, true, true]);
    for (let i = 1; i < 7; i += 1) expect(w.days[i]!.startMs).toBe(w.days[i - 1]!.endMs);
  });

  it('counts what went in and what came out on the day it happened', () => {
    const rows = [
      line('ADD', 120, at(0, 8)),
      line('ADD', 90, at(0, 20)),
      line('USE', -60, at(1, 9)),
      line('DISCARD', -30, at(1, 10)),
      line('MOVE', 0, at(2, 9)),
      line('ADJUST', -5, at(3, 9)),
      line('ADD', 150, at(4, 7)),
      // last week and next week are not this week
      line('ADD', 500, at(-1, 12)),
    ];
    const w = stashWeekDays(rows, TZ, now);
    expect(w.days.map(d => d.inMl)).toEqual([210, 0, 0, 0, 150, 0, 0]);
    expect(w.days.map(d => d.outMl)).toEqual([0, 90, 0, 0, 0, 0, 0]);
    expect(w.days[1]).toMatchObject({ usedMl: 60, discardedMl: 30 });
    // a day with only a move or a correction had an entry; a day with none is a gap, not a zero
    expect(w.days.map(d => d.logged)).toEqual([true, true, true, true, true, false, false]);
    expect(w).toMatchObject({
      inMl: 360,
      usedMl: 60,
      discardedMl: 30,
      outMl: 90,
      adds: 3,
      uses: 1,
      discards: 1,
    });
  });

  it.each([
    {
      name: 'the tour’s trial bag, saved and taken back',
      rows: () => {
        const trial = line('ADD', 118, at(4, 9), 'week-trial');
        return [trial, undoOf(trial, at(4, 9))];
      },
      want: { inMl: 0, outMl: 0, adds: 0 },
      logged: false,
    },
    {
      name: 'a trial bottle poured from a real bag and taken back',
      rows: () => {
        const use = line('USE', -60, at(4, 10), 'week-trial-use');
        return [use, undoOf(use, at(4, 10))];
      },
      want: { inMl: 0, outMl: 0, uses: 0 },
      logged: false,
    },
  ])('leaves nothing of $name — not a figure, not a day', ({ rows, want, logged }) => {
    const w = stashWeekDays(rows(), TZ, now);
    expect(w).toMatchObject(want);
    expect(w.days[4]?.logged).toBe(logged);
  });

  it('keeps seven whole days across a clock change', () => {
    const march = Date.parse('2026-03-11T12:00:00-04:00'); // the Wednesday after the spring change
    const w = stashWeekDays([], TZ, march);
    const hours = w.days.map(d => (d.endMs - d.startMs) / 3_600_000);
    expect(hours).toEqual([24, 24, 24, 24, 24, 24, 24]);
    const spring = Date.parse('2026-03-06T12:00:00-05:00'); // the Friday before it
    expect(stashWeekDays([], TZ, spring).days.map(d => (d.endMs - d.startMs) / 3_600_000)).toEqual([
      24, 24, 24, 24, 24, 24, 23,
    ]);
  });
});

describe('the buckets (§10)', () => {
  it('counts room with fridge, thawing apart, frozen apart, and only what is still in the stash', () => {
    const b = stashBuckets([
      { amountMl: 100, kind: 'FRIDGE', status: 'STORED' },
      { amountMl: 50, kind: 'ROOM', status: 'STORED' },
      { amountMl: 118, kind: 'THAWED', status: 'THAWING' },
      { amountMl: 500, kind: 'FREEZER', status: 'STORED' },
      { amountMl: 200, kind: 'DEEP_FREEZER', status: 'STORED' },
      { amountMl: 0, kind: 'FREEZER', status: 'USED' },
      { amountMl: 0, kind: 'FRIDGE', status: 'DISCARDED' },
    ]);
    expect(b).toEqual({
      totalMl: 968,
      fridgeMl: 150,
      thawedMl: 118,
      frozenMl: 700,
      containers: 5,
      thawing: 1,
    });
  });
});

describe('in the household’s unit: every figure is its rows as they read (the pre-launch sweep, 2026-09-27)', () => {
  // a 4 oz bag is stored as 118 ml (4 oz is 118.29): thirteen of them are 1534 ml, which is
  // 51.87 oz and read "51.75 oz" as one sum. Each bag counts the 4 oz its own row says.
  const FOUR = 118;
  const read = (ml: number) => volumeText(ml, 'oz');

  it('the stash is thirteen bags of 4 oz: 52 oz, in the freezer and in all', () => {
    const bags = Array.from({ length: 13 }, () => ({
      amountMl: FOUR,
      kind: 'FREEZER' as const,
      status: 'STORED' as const,
    }));
    expect(read(stashBuckets(bags).totalMl)).toBe('51.75 oz');
    const b = stashBuckets(bags, 'oz');
    expect(read(b.totalMl)).toBe('52 oz');
    expect(read(b.frozenMl)).toBe('52 oz');
    expect(b.containers).toBe(13);
    // and in mL, the stored ml as they are
    expect(stashBuckets(bags, 'ml').totalMl).toBe(13 * FOUR);
  });

  it('the week’s in and out, and the seven days, are the ounces that went in and came out', () => {
    const monday = weekStartMs(TZ, now);
    const rows = [
      ...Array.from({ length: 13 }, (_, i) =>
        line('ADD', FOUR, new Date(monday + (i + 1) * 60 * 60_000).toISOString()),
      ),
      ...Array.from({ length: 9 }, (_, i) =>
        line('USE', -30, new Date(monday + DAY + (i + 1) * 60 * 60_000).toISOString()),
      ),
    ];
    const week = stashWeekDays(rows, TZ, now, 'oz');
    expect(read(week.inMl)).toBe('52 oz');
    expect(read(week.usedMl)).toBe('9 oz');
    expect(read(week.days[0]?.inMl ?? 0)).toBe('52 oz');
    expect(read(week.days[1]?.usedMl ?? 0)).toBe('9 oz');
    const seven = ledgerWindow(rows, monday, 'oz');
    expect([read(seven.pumpedMl), read(seven.usedMl)]).toEqual(['52 oz', '9 oz']);
    // the books keep the stored ml
    expect(ledgerWindow(rows, monday).pumpedMl).toBe(13 * FOUR);
    expect(stashWeekDays(rows, TZ, now).inMl).toBe(13 * FOUR);
  });

  it('a bottle drawn from two bags is the bottle, and a session stored in two bags the session', () => {
    const monday = weekStartMs(TZ, now);
    const at = new Date(monday + 3 * 60 * 60_000).toISOString();
    const withEntry = (row: LedgerLine, activityId: string): LedgerLine => ({
      ...row,
      activity_id: activityId,
    });
    // a 4 oz bottle (118 ml) drawn as the last 107 ml of one bag and 11 of the next: part by part
    // that is 3.5 + 0.25 oz; the bottle is 4 oz. And a 4 oz session split into 2.5 + 1.5 oz bags.
    const rows = [
      withEntry(line('USE', -107, at), 'bottle-1'),
      withEntry(line('USE', -11, at), 'bottle-1'),
      withEntry(line('ADD', 74, at), 'session-1'),
      withEntry(line('ADD', 44, at), 'session-1'),
    ];
    const week = stashWeekDays(rows, TZ, now, 'oz');
    expect([read(week.usedMl), read(week.inMl)]).toEqual(['4 oz', '4 oz']);
    const seven = ledgerWindow(rows, monday, 'oz');
    expect([read(seven.usedMl), read(seven.pumpedMl)]).toEqual(['4 oz', '4 oz']);
    // counted as the rows they are: two draws and two bags
    expect([week.uses, week.adds, seven.useCount]).toEqual([2, 2, 2]);
  });
});
