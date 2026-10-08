/**
 * AN ENTRY CORRECTED ON THE SHEET THAT LOGGED IT (the owner, 2026-09-26: "shouldnt editing from
 * today's log look the same as you would as if you want to entry … keep it the same").
 *
 * The separate editor sheet could do things the capture sheets could not, and every one of them is
 * carried over here, as a rule on data: each module's sheet opens on the entry (`formStart`), its
 * Save's fields (`sheetFields`, the sheet's own rules) become a correction (`resolveEdit`) that
 * writes ONLY what the parent changed — and never rounds, re-draws or re-pours what they did not.
 *
 *   * a past entry's start and end, and the day a picked time lands on (`pickedNear`)
 *   * a value shown on a grid but stored off it (seconds, 110 ml, 4533 g) left exactly as it was
 *   * the note, on every module, including the five whose new-entry form asks for none
 *   * the bottle's stash links: never drawn again, never rewritten; all five kinds
 *   * a pump logged as one total stays one total; no second pour into the stash
 *   * a sleep's nap or night; a breastfeed's sides, first side and a timed feed's pause
 *   * a medicine's name as logged, amount as given, and which item it was
 *   * a temperature's method, a bath's hair and a meal's type left unsaid when they were unsaid
 *   * a growth entry's day, keeping its time of day, and each measurement on or off
 *   * an older meal's foods kept whole while they are untouched
 *   * a retired module's entry: its time and its note
 *   * the checks that stop a save (`editError`)
 */
import {
  lbOzToGrams,
  volumeToMl,
  zonedToUtc,
  type SolidsItem,
  type VolumeUnit,
} from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import type { EntryRecord } from '../../../db/queries/today';
import { END_AFTER_NOW, GROWTH_ONE_NEEDED, MED_NAME_NEEDED, pickedNear } from '../../entry/editor';
import { linesFromItems, sameLines, itemsFromLines } from '../modules/solids/foodLines';
import {
  editedItems,
  formStart,
  resolveEdit,
  sheetFields,
  type EditContext,
  type FormStart,
} from './forms';

const TZ = 'America/New_York';
/** A New York wall clock on a September 2026 day. */
const ny = (day: number, h: number, m = 0, s = 0): number =>
  zonedToUtc(TZ, 2026, 9, day, h, m) + s * 1000;
const iso = (ms: number): string => new Date(ms).toISOString();
const NOW = ny(14, 12);
const MIN = 60_000;

function record(
  over: Partial<EntryRecord['activity']>,
  detail: EntryRecord['detail'] = null,
): EntryRecord {
  return {
    activity: {
      id: 'a1',
      household_id: 'h',
      child_id: 'c',
      type: 'diaper',
      start_at: iso(ny(14, 9)),
      end_at: null,
      quantity: null,
      canonical_unit: null,
      notes: null,
      is_private: 0,
      created_by: 'u',
      photo_path: null,
      photo_updated_at: null,
      ...over,
    },
    detail,
    by: { byName: null, createdAtMs: ny(14, 9), editedAtMs: null, editedByName: null },
  };
}

const ctx = (volume: VolumeUnit = 'oz', over: Partial<EditContext> = {}): EditContext => ({
  volume,
  weight: 'lb_oz',
  length: 'in',
  timeZone: TZ,
  nowMs: NOW,
  ...over,
});

/** The sheet opened on `r`, with the parent's `change` made on it, saved as a correction. */
function edit(
  r: EntryRecord,
  change: (f: FormStart) => FormStart = f => f,
  c: EditContext = ctx(),
) {
  return resolveEdit(r, sheetFields(r, change(formStart(r)), c), c);
}

/* ================================================================ untouched is not rewritten */

describe('a sheet opened on an entry and saved untouched writes nothing', () => {
  const rows: [string, EntryRecord, VolumeUnit][] = [
    [
      'a timed sleep, to the second',
      record(
        { type: 'sleep', start_at: iso(ny(14, 1, 12, 41)), end_at: iso(ny(14, 3, 48, 7)) },
        { kind: 'NIGHT' },
      ),
      'oz',
    ],
    [
      'a breastfeed timed in seconds',
      record(
        { type: 'breastfeed', start_at: iso(ny(14, 8, 0, 5)), end_at: iso(ny(14, 8, 21, 40)) },
        { first_side: 'LEFT', left_seconds: 754, right_seconds: 541 },
      ),
      'oz',
    ],
    [
      'a breastfeed that was paused for twenty minutes',
      record(
        { type: 'breastfeed', start_at: iso(ny(14, 8)), end_at: iso(ny(14, 9)) },
        { first_side: 'RIGHT', left_seconds: 1200, right_seconds: 1200 },
      ),
      'oz',
    ],
    [
      'a pump timed in seconds, one total',
      record(
        { type: 'pump', start_at: iso(ny(14, 6, 2, 9)), end_at: iso(ny(14, 6, 20, 51)) },
        { sides: 'BOTH', left_ml: null, right_ml: null, total_ml: 118 },
      ),
      'oz',
    ],
    [
      'tummy time from a timer',
      record({ type: 'tummy', start_at: iso(ny(14, 10, 0, 30)), end_at: iso(ny(14, 10, 6, 2)) }),
      'oz',
    ],
    [
      'a 110 ml bottle read in ounces (3.7, off the quarter grid)',
      record(
        { type: 'bottle', quantity: 110 },
        { consumed_ml: 110, offered_ml: 110, kind: 'FORMULA' },
      ),
      'oz',
    ],
    [
      'a bottle with some left, in ml, off the 5 ml grid',
      record({ type: 'bottle', quantity: 87 }, { consumed_ml: 87, offered_ml: 121, kind: 'EBM' }),
      'ml',
    ],
    [
      'a "same as taken" bottle from before both were stored',
      record(
        { type: 'bottle', quantity: 120 },
        { consumed_ml: 120, offered_ml: null, kind: 'EBM' },
      ),
      'oz',
    ],
    [
      'a mixed bottle from the stash',
      record(
        { type: 'bottle', quantity: 90 },
        { consumed_ml: 90, offered_ml: 90, kind: 'MIXED', from_stash: 1, container_id: 'bag' },
      ),
      'oz',
    ],
    [
      'a diaper with a color word',
      record({ type: 'diaper' }, { kind: 'BOTH', color: 'Green', rash: 1 }),
      'oz',
    ],
    ['a bath that never said about the hair', record({ type: 'bath', metadata: '{}' }), 'oz'],
    [
      'a meal saved without a meal type',
      record({ type: 'solids' }, { meal: null, food: 'Pear, banana', items: null }),
      'oz',
    ],
    [
      'a medicine of an item since archived',
      record(
        { type: 'med' },
        { name: 'Drops', amount_text: '0.5 ml', route: 'MOUTH', care_item_id: 'gone' },
      ),
      'oz',
    ],
    [
      'a temperature that never said how it was taken',
      record({ type: 'temp', quantity: 3812 }, { temp_c_hundredths: 3812, temp_method: null }),
      'oz',
    ],
    [
      'a clinic weight of 4533 g, taken at 3:15 PM',
      record(
        { type: 'growth', start_at: iso(ny(10, 15, 15)), quantity: 4533, canonical_unit: 'g' },
        { weight_g: 4533, length_mm: 521, head_mm: null },
      ),
      'oz',
    ],
    ['a retired note', record({ type: 'note', notes: 'first smile' }), 'oz'],
  ];

  it.each(rows)('%s', (_what, r, unit) => {
    const out = edit(r, f => f, ctx(unit));
    expect(out.error).toBeNull();
    expect(out.patch).toEqual({ patch: {}, detailPatch: undefined, changed: false });
  });

  it('…and a growth weight read in kilograms is exact too', () => {
    const r = rows.find(([w]) => w.startsWith('a clinic weight'))![1];
    expect(edit(r, f => f, ctx('ml', { weight: 'kg', length: 'cm' })).patch.changed).toBe(false);
  });
});

/* ================================================================ what each sheet opens on */

describe('each sheet opens on the entry, in the shapes it holds', () => {
  it('a timed sleep: the row on its end, "Slept for" its length, and its word', () => {
    const r = record(
      {
        type: 'sleep',
        start_at: iso(ny(14, 1, 12, 41)),
        end_at: iso(ny(14, 3, 48, 7)),
        notes: 'car',
      },
      { kind: 'NIGHT' },
    );
    expect(formStart(r)).toMatchObject({
      rowAtMs: ny(14, 3, 48, 7),
      minutes: 155,
      sleepKind: 'NIGHT',
      note: 'car',
    });
  });

  it('a pump: the row on its END, as the sheet asks it ("End time", since 2026-09-26)', () => {
    const r = record(
      { type: 'pump', start_at: iso(ny(14, 6)), end_at: iso(ny(14, 6, 18)) },
      { sides: 'LEFT', left_ml: 90, right_ml: null, total_ml: 90 },
    );
    expect(formStart(r)).toMatchObject({
      rowAtMs: ny(14, 6, 18),
      minutes: 18,
      pump: { mode: 'side', amounts: { leftMl: 90, rightMl: 0, totalMl: 90 } },
    });
    const total = record(
      { type: 'pump', start_at: iso(ny(14, 6)), end_at: iso(ny(14, 6, 18)) },
      { sides: 'BOTH', left_ml: null, right_ml: null, total_ml: 133 },
    );
    expect(formStart(total).pump).toEqual({
      mode: 'total',
      amounts: { leftMl: 0, rightMl: 0, totalMl: 133 },
    });
  });

  it('a breastfeed: each side, the first, and the pause a timed feed held', () => {
    const r = record(
      { type: 'breastfeed', start_at: iso(ny(14, 8)), end_at: iso(ny(14, 9)) },
      { first_side: 'RIGHT', left_seconds: 1200, right_seconds: 1200 },
    );
    expect(formStart(r)).toMatchObject({
      rowAtMs: ny(14, 9),
      leftMin: 20,
      rightMin: 20,
      firstSide: 'RIGHT',
      pausedMinutes: 20,
    });
  });

  it('a bottle: what was in it and what was left, and all five kinds', () => {
    const some = record({ type: 'bottle' }, { consumed_ml: 90, offered_ml: 120, kind: 'OTHER' });
    expect(formStart(some)).toMatchObject({ bottleMl: 120, leftoverMl: 30, bottleKind: 'OTHER' });
    const finished = record({ type: 'bottle' }, { consumed_ml: 120, offered_ml: 120, kind: 'EBM' });
    expect(formStart(finished)).toMatchObject({ bottleMl: 120, leftoverMl: null });
  });

  it('the rest: a diaper, a bath, a meal, a medicine, a reading, a measurement', () => {
    expect(
      formStart(record({ type: 'diaper' }, { kind: 'DRY', color: null, rash: 0 })),
    ).toMatchObject({ diaperKind: 'DRY', diaperColor: null, diaperRash: false });
    expect(
      formStart(record({ type: 'bath', metadata: JSON.stringify({ hair_washed: false }) })).hair,
    ).toBe('not');
    expect(
      formStart(
        record(
          { type: 'solids' },
          { meal: 'LUNCH', food: 'Pear', items: null, observation: 'messy' },
        ),
      ),
    ).toMatchObject({ meal: 'LUNCH', observation: 'messy', items: [{ name: 'Pear' }] });
    expect(
      formStart(
        record(
          { type: 'med' },
          { name: 'Drops', amount_text: '1', route: 'MOUTH', care_item_id: 'i1' },
        ),
      ),
    ).toMatchObject({ medName: 'Drops', medAmount: '1', medItemId: 'i1', medRoute: 'MOUTH' });
    expect(
      formStart(record({ type: 'temp' }, { temp_c_hundredths: 3812, temp_method: 'Ear' })),
    ).toMatchObject({ tempCHundredths: 3812, tempMethod: 'Ear' });
    expect(
      formStart(record({ type: 'growth' }, { weight_g: null, length_mm: 521, head_mm: 350 })),
    ).toMatchObject({ weightG: null, lengthMm: 521, headMm: 350 });
  });
});

/* ================================================================ a past entry's times */

describe('a past entry’s start and end', () => {
  const sleep = record(
    { type: 'sleep', start_at: iso(ny(11, 22)), end_at: iso(ny(12, 5, 30)) },
    { kind: 'NIGHT' },
  );

  it('the wake-up time moved: the sleep keeps its length, on its own night — not today', () => {
    // 5:30 AM three days ago, corrected to 6:10: the picker's answer lands on the day nearest it
    const woke = pickedNear({ hours: 6, minutes: 10 }, formStart(sleep).rowAtMs, NOW, TZ);
    expect(woke).toBe(ny(12, 6, 10));
    const out = edit(sleep, f => ({ ...f, rowAtMs: woke }));
    expect(out.patch.patch).toEqual({ start_at: iso(ny(11, 22, 40)), end_at: iso(ny(12, 6, 10)) });
  });

  it('the length changed: the start moves and the wake-up time stays', () => {
    const out = edit(sleep, f => ({ ...f, minutes: f.minutes + 30 }));
    expect(out.patch.patch).toEqual({ start_at: iso(ny(11, 21, 30)) });
  });

  it('both: any start and end can be reached, a minute at a time', () => {
    const out = edit(sleep, f => ({ ...f, rowAtMs: ny(12, 6), minutes: 9 * 60 }));
    expect(out.patch.patch).toEqual({ start_at: iso(ny(11, 21)), end_at: iso(ny(12, 6)) });
  });

  /**
   * THE PUMP'S ROW IS ITS END since 2026-09-26, as the sleep's is: a moved end keeps the length, and
   * a changed length moves the start. The stored pair means what it always meant.
   */
  it('a pump’s end moved keeps its length; its length moves its start', () => {
    const pump = record(
      { type: 'pump', start_at: iso(ny(14, 6)), end_at: iso(ny(14, 6, 18)) },
      { sides: 'BOTH', left_ml: 60, right_ml: 58, total_ml: 118 },
    );
    expect(edit(pump, f => ({ ...f, rowAtMs: ny(14, 5, 58) })).patch.patch).toEqual({
      start_at: iso(ny(14, 5, 40)),
      end_at: iso(ny(14, 5, 58)),
    });
    expect(edit(pump, f => ({ ...f, minutes: 25 })).patch.patch).toEqual({
      start_at: iso(ny(14, 5, 53)),
    });
  });

  it('a pump’s end picked on the Log lands on the session’s own day, not today', () => {
    // a session that ended at 11:50 PM two nights ago, its end corrected to 11:55 PM
    const pump = record(
      { type: 'pump', start_at: iso(ny(12, 23, 30)), end_at: iso(ny(12, 23, 50)) },
      { sides: 'BOTH', left_ml: 60, right_ml: 58, total_ml: 118 },
    );
    const ended = pickedNear({ hours: 23, minutes: 55 }, formStart(pump).rowAtMs, NOW, TZ);
    expect(ended).toBe(ny(12, 23, 55));
    expect(edit(pump, f => ({ ...f, rowAtMs: ended })).patch.patch).toEqual({
      start_at: iso(ny(12, 23, 35)),
      end_at: iso(ny(12, 23, 55)),
    });
  });

  it('a time that would end in the future is refused, never written (the care audit, C5)', () => {
    const recent = record({
      type: 'tummy',
      start_at: iso(NOW - 10 * MIN),
      end_at: iso(NOW - 5 * MIN),
    });
    const out = resolveEdit(
      recent,
      { type: 'tummy', startAt: iso(NOW), endAt: iso(NOW + 30 * MIN) },
      ctx(),
    );
    expect(out.error).toBe(END_AFTER_NOW);
  });
});

/* ================================================================ the note, everywhere */

describe('the note, on every module — the five whose new-entry form asks none too', () => {
  const rows: EntryRecord[] = [
    record(
      { type: 'breastfeed', end_at: iso(ny(14, 9, 20)) },
      { left_seconds: 600, right_seconds: 600 },
    ),
    record(
      { type: 'pump', end_at: iso(ny(14, 9, 18)) },
      { left_ml: 60, right_ml: 60, total_ml: 120 },
    ),
    record({ type: 'tummy', end_at: iso(ny(14, 9, 5)) }),
    record({ type: 'solids' }, { meal: 'LUNCH', food: 'Pear', items: null }),
    record({ type: 'growth' }, { weight_g: 4500, length_mm: null, head_mm: null }),
    record(
      { type: 'med' },
      { name: 'Drops', amount_text: null, route: 'MOUTH', care_item_id: null },
    ),
    record({ type: 'sleep', end_at: iso(ny(14, 10)) }, { kind: 'NAP' }),
    record({ type: 'bottle' }, { consumed_ml: 90, offered_ml: 90, kind: 'EBM' }),
    record({ type: 'diaper' }, { kind: 'WET' }),
    record({ type: 'bath' }),
    record({ type: 'temp' }, { temp_c_hundredths: 3700, temp_method: 'Ear' }),
    record({ type: 'note' }),
  ];

  it.each(rows.map(r => [r.activity.type, r] as const))('%s', (_type, r) => {
    expect(edit(r, f => ({ ...f, note: '  in the car ' })).patch.patch).toEqual({
      notes: 'in the car',
    });
    // and a note cleared is null, not an empty string
    const noted = { ...r, activity: { ...r.activity, notes: 'x' } };
    expect(edit(noted, f => ({ ...f, note: '' })).patch.patch).toEqual({ notes: null });
  });
});

/* ================================================================ module by module */

describe('a bottle: its two numbers, its kind — and never the stash', () => {
  const fromStash = record(
    { type: 'bottle', quantity: 61 },
    { consumed_ml: 61, offered_ml: 61, kind: 'EBM', from_stash: 1, container_id: 'bag' },
  );

  it('some left: what was taken follows, the bottle it was poured into stays exactly', () => {
    const out = edit(fromStash, f => ({ ...f, leftoverMl: 16 }), ctx('ml'));
    expect(out.patch.detailPatch).toEqual({ consumed_ml: 45 });
    expect(out.patch.patch).toEqual({ quantity: 45 });
  });

  it('never rewrites where the milk came from: no from_stash, no container, no ledger row', () => {
    for (const change of [
      (f: FormStart) => ({ ...f, bottleMl: 120 }),
      (f: FormStart) => ({ ...f, bottleKind: 'FORMULA' as const }),
      (f: FormStart) => ({ ...f, rowAtMs: ny(14, 8, 30) }),
    ]) {
      const detail = edit(fromStash, change, ctx('ml')).patch.detailPatch ?? {};
      expect(detail).not.toHaveProperty('from_stash');
      expect(detail).not.toHaveProperty('container_id');
    }
  });

  it('corrects the kind to one only an edit offers', () => {
    expect(edit(fromStash, f => ({ ...f, bottleKind: 'MIXED' })).patch.detailPatch).toEqual({
      kind: 'MIXED',
    });
  });

  it('a bigger bottle, finished, writes both numbers on the grid the sheet showed', () => {
    const r = record(
      { type: 'bottle', quantity: 90 },
      { consumed_ml: 90, offered_ml: 90, kind: 'EBM' },
    );
    const out = edit(r, f => ({ ...f, bottleMl: volumeToMl(5, 'oz') }));
    expect(out.patch.detailPatch).toEqual({ consumed_ml: 148, offered_ml: 148 });
  });
});

describe('a pump: one total stays one total, and nothing is poured again', () => {
  const total = record(
    { type: 'pump', quantity: 118, start_at: iso(ny(14, 6)), end_at: iso(ny(14, 6, 18)) },
    { sides: 'BOTH', left_ml: null, right_ml: null, total_ml: 118 },
  );

  it('a corrected total keeps both sides null — no invented split', () => {
    const out = edit(total, f => ({
      ...f,
      pump: { ...f.pump, amounts: { ...f.pump.amounts, totalMl: 133 } },
    }));
    expect(out.patch.detailPatch).toEqual({
      sides: 'BOTH',
      left_ml: null,
      right_ml: null,
      total_ml: 133,
    });
    expect(out.patch.patch).toEqual({ quantity: 133 });
  });

  it('a side touched makes the sides the source, as the pump sheet does', () => {
    const out = edit(total, f => ({
      ...f,
      pump: { mode: 'side', amounts: { leftMl: 60, rightMl: 58, totalMl: 118 } },
    }));
    expect(out.patch.detailPatch).toEqual({
      sides: 'BOTH',
      left_ml: 60,
      right_ml: 58,
      total_ml: 118,
    });
  });

  it('writes the session and nothing of the stash: no container, no ledger, no timer', () => {
    // a longer session moves its START: the row is the end (2026-09-26)
    const detail = edit(total, f => ({ ...f, minutes: 20 })).patch;
    expect(detail.detailPatch).toBeUndefined();
    expect(Object.keys(detail.patch)).toEqual(['start_at']);
  });
});

describe('a sleep’s nap or night, and a tummy session’s minutes', () => {
  it('the word corrected by hand is written, and nothing else', () => {
    const r = record({ type: 'sleep', end_at: iso(ny(14, 11)) }, { kind: 'NAP' });
    expect(edit(r, f => ({ ...f, sleepKind: 'NIGHT' })).patch).toMatchObject({
      patch: {},
      detailPatch: { kind: 'NIGHT' },
    });
  });

  it('"How long" changed: the start moves back and the minutes follow', () => {
    const r = record({
      type: 'tummy',
      start_at: iso(ny(14, 11, 25)),
      end_at: iso(ny(14, 11, 30)),
      quantity: 5,
    });
    expect(edit(r, f => ({ ...f, minutes: 8 })).patch.patch).toEqual({
      start_at: iso(ny(14, 11, 22)),
      quantity: 8,
    });
  });
});

describe('a breastfeed’s sides, first side and pause', () => {
  const timed = record(
    {
      type: 'breastfeed',
      start_at: iso(ny(14, 8, 0, 5)),
      end_at: iso(ny(14, 8, 21, 40)),
      quantity: 22,
    },
    { first_side: 'LEFT', left_seconds: 754, right_seconds: 541 },
  );

  it('a side changed: its minutes are written, the other side keeps its seconds exactly', () => {
    const out = edit(timed, f => ({ ...f, leftMin: 15 }));
    expect(out.patch.detailPatch).toEqual({ left_seconds: 900, right_seconds: 541 });
    // the end is the row, untouched; the start counts back from it by the minutes
    expect(out.patch.patch).toMatchObject({ start_at: iso(ny(14, 7, 57, 40)), quantity: 24 });
  });

  it('the first side, when both had minutes, is the parent’s answer', () => {
    expect(edit(timed, f => ({ ...f, firstSide: 'RIGHT' })).patch.detailPatch).toEqual({
      first_side: 'RIGHT',
    });
  });

  it('a paused feed keeps its pause between its start and its end', () => {
    const paused = record(
      { type: 'breastfeed', start_at: iso(ny(14, 8)), end_at: iso(ny(14, 9)), quantity: 40 },
      { first_side: 'RIGHT', left_seconds: 1200, right_seconds: 1200 },
    );
    const out = edit(paused, f => ({ ...f, rightMin: 25 }));
    // five more minutes at the breast, and the twenty-minute pause still between: 7:55 → 9:00
    expect(out.patch.patch).toEqual({ start_at: iso(ny(14, 7, 55)), quantity: 45 });
  });

  /*
    NO SIDES, NO PAUSE (2026-09-28). A Huckleberry breastfeed with only its start comes in as 30
    minutes with no side. Its span is its whole length; read as a 30-minute pause, typing 15 and 15
    made it an hour long and moved its start, the one time the file gave, to 7:30.
  */
  it('a feed with no sides recorded: its span is its length, never a pause', () => {
    const startOnly = record(
      { type: 'breastfeed', start_at: iso(ny(14, 8)), end_at: iso(ny(14, 8, 30)) },
      {},
    );
    expect(formStart(startOnly)).toMatchObject({
      rowAtMs: ny(14, 8, 30),
      leftMin: 0,
      rightMin: 0,
      pausedMinutes: 0,
    });
    const out = edit(startOnly, f => ({ ...f, leftMin: 15, rightMin: 15 }));
    // fifteen and fifteen, ending where it ended: it still began at 8:00
    expect(out.patch.patch).not.toHaveProperty('start_at');
    expect(out.patch.patch).toMatchObject({ quantity: 30 });
    expect(out.patch.detailPatch).toMatchObject({ left_seconds: 900, right_seconds: 900 });
  });
});

describe('a medicine: the name as logged, the amount as given, which item it was', () => {
  const r = record(
    { type: 'med' },
    { name: 'Fever reducer', amount_text: '5 ml', route: 'MOUTH', care_item_id: 'i1' },
  );

  it('another row ticked: the entry becomes that item — its name, its route and its id', () => {
    const out = edit(r, f => ({
      ...f,
      medName: 'Barrier cream',
      medAmount: 'a pea-sized amount',
      medItemId: 'i2',
      medRoute: 'SKIN',
    }));
    expect(out.patch.detailPatch).toEqual({
      name: 'Barrier cream',
      amount_text: 'a pea-sized amount',
      care_item_id: 'i2',
      route: 'SKIN',
    });
  });

  it('the text corrected as text — trimmed, never read as a number — and an empty name refused', () => {
    expect(edit(r, f => ({ ...f, medAmount: ' 2.5 ml ' })).patch.detailPatch).toEqual({
      amount_text: '2.5 ml',
    });
    expect(edit(r, f => ({ ...f, medName: 'Fever reducer (liquid)' })).patch.detailPatch).toEqual({
      name: 'Fever reducer (liquid)',
    });
    expect(edit(r, f => ({ ...f, medName: '  ' })).error).toBe(MED_NAME_NEEDED);
  });
});

describe('a temperature, a diaper and a bath', () => {
  it('a reading and how it was taken', () => {
    const r = record(
      { type: 'temp', quantity: 3840 },
      { temp_c_hundredths: 3840, temp_method: null },
    );
    expect(
      edit(r, f => ({ ...f, tempCHundredths: 3830, tempMethod: 'Rectal' })).patch,
    ).toMatchObject({
      patch: { quantity: 3830 },
      detailPatch: { temp_c_hundredths: 3830, temp_method: 'Rectal' },
    });
  });

  it('a diaper’s kind, color and rash, each only when changed', () => {
    const r = record({ type: 'diaper' }, { kind: 'WET', color: null, rash: 0 });
    expect(
      edit(r, f => ({ ...f, diaperKind: 'DIRTY', diaperColor: 'Yellow' })).patch.detailPatch,
    ).toEqual({
      kind: 'DIRTY',
      color: 'Yellow',
    });
    expect(edit(r, f => ({ ...f, diaperRash: true })).patch.detailPatch).toEqual({ rash: true });
  });

  it('a bath’s hair, in its metadata, with the row’s own keys kept', () => {
    const r = record({ type: 'bath', metadata: JSON.stringify({ source: 'app' }) });
    expect(edit(r, f => ({ ...f, hair: 'not' })).patch.patch).toEqual({
      metadata: { source: 'app', hair_washed: false },
    });
  });
});

describe('a growth entry: its day, and each measurement', () => {
  const r = record(
    { type: 'growth', start_at: iso(ny(10, 15, 15)), quantity: 4533, canonical_unit: 'g' },
    { weight_g: 4533, length_mm: 521, head_mm: null },
  );

  it('moved to another day keeps its time of day (the solids audit, H8)', () => {
    // the date row answers with midday on the chosen day, as it does for a new measurement
    const out = edit(r, f => ({ ...f, rowAtMs: ny(12, 12) }));
    expect(out.patch.patch).toEqual({ start_at: iso(ny(12, 15, 15)) });
  });

  it('a weight corrected; a stray length switched off; never none at all', () => {
    expect(edit(r, f => ({ ...f, weightG: lbOzToGrams({ lb: 10, oz: 6 }) })).patch).toMatchObject({
      patch: { quantity: 4706 },
      detailPatch: { weight_g: 4706 },
    });
    expect(edit(r, f => ({ ...f, lengthMm: null })).patch.detailPatch).toEqual({ length_mm: null });
    expect(edit(r, f => ({ ...f, weightG: null, lengthMm: null })).error).toBe(GROWTH_ONE_NEEDED);
  });
});

describe('a meal', () => {
  const older = record(
    { type: 'solids' },
    { meal: 'LUNCH', food: `${'A'.repeat(80)}, pear`, items: null, observation: null },
  );

  it('an older meal’s foods are kept whole while its lines are as they opened', () => {
    const f = formStart(older);
    const opened = { lines: linesFromItems(f.items, 'PIECE'), items: f.items };
    // one line longer than a saved name may be: saved as it stands, the list is the entry's own
    const kept = editedItems(opened, opened.lines, sameLines, itemsFromLines);
    expect(kept).toBe(f.items);
    const out = edit(older, form => ({ ...form, meal: 'DINNER', items: kept }));
    expect(out.patch.detailPatch).toEqual({ meal: 'DINNER' });
  });

  it('changed foods are written whole, with the text beside them', () => {
    const items: SolidsItem[] = [{ name: 'Pear', amount: 2, unit: 'PIECE', response: null }];
    expect(edit(older, f => ({ ...f, items })).patch.detailPatch).toEqual({ items, food: 'Pear' });
  });

  it('a meal saved without a type keeps none — unless the time moves or one is picked', () => {
    const none = record({ type: 'solids' }, { meal: null, food: 'Pear', items: null });
    expect(edit(none, f => ({ ...f, observation: 'loved it' })).patch.detailPatch).toEqual({
      observation: 'loved it',
    });
    expect(edit(none, f => ({ ...f, meal: 'SNACK' })).patch.detailPatch).toEqual({ meal: 'SNACK' });
  });
});

describe('a retired module’s entry', () => {
  it('its time and its note; a length it had moves with its start', () => {
    const r = record({
      type: 'milestone',
      start_at: iso(ny(13, 9)),
      end_at: iso(ny(13, 9, 30)),
      notes: 'rolled over',
    });
    const out = resolveEdit(
      r,
      {
        type: 'milestone',
        startAt: iso(ny(13, 8)),
        endAt: iso(ny(13, 8, 30)),
        notes: 'rolled over!',
      },
      ctx(),
    );
    expect(out.patch.patch).toEqual({
      start_at: iso(ny(13, 8)),
      end_at: iso(ny(13, 8, 30)),
      notes: 'rolled over!',
    });
  });
});

/* ================================================================ the Health note (2026-10-08) */

describe('a Health note, corrected on its own sheet', () => {
  const note = (over: Partial<EntryRecord['activity']> = {}, seen = '["RASH","SWELLING"]') =>
    record(
      {
        id: 'n1',
        type: 'wellbeing',
        start_at: iso(ny(13, 19, 30, 12)),
        end_at: iso(ny(14, 8, 15)),
        notes: 'red patches on her cheeks',
        ...over,
      },
      { activity_id: 'n1', seen },
    );

  it('opens on its chips, its words, its start and whether it stopped', () => {
    const f = formStart(note());
    expect(f.wellbeingSeen).toEqual(['RASH', 'SWELLING']);
    expect(f.note).toBe('red patches on her cheeks');
    expect(f.rowAtMs).toBe(ny(13, 19, 30, 12));
    expect(f.wellbeingEnded).toBe(true);
    expect(formStart(note({ end_at: null })).wellbeingEnded).toBe(false);
  });

  it('saved untouched writes nothing, to the second', () => {
    expect(edit(note()).patch.changed).toBe(false);
    expect(edit(note({ end_at: null })).patch.changed).toBe(false);
  });

  it('writes the chips whole when they change, and nothing else', () => {
    const r = edit(note(), f => ({ ...f, wellbeingSeen: ['RASH'] }));
    expect(r.error).toBeNull();
    expect(r.patch.detailPatch).toEqual({ seen: ['RASH'] });
    expect(r.patch.patch).toEqual({});
  });

  it('marks it still going by clearing its stop, and stops it again', () => {
    const going = edit(note(), f => ({ ...f, wellbeingEnded: false }));
    expect(going.patch.patch).toEqual({ end_at: null });
    const stopped = edit(note({ end_at: null }), f => ({
      ...f,
      wellbeingEnded: true,
      endMs: ny(14, 9),
    }));
    expect(stopped.patch.patch).toEqual({ end_at: iso(ny(14, 9)) });
  });

  it('will not be corrected to say nothing at all, nor to stop before it started', () => {
    const empty = edit(note(), f => ({ ...f, wellbeingSeen: [], note: '  ' }));
    expect(empty.error).not.toBeNull();
    const backwards = edit(note(), f => ({ ...f, endMs: ny(13, 18) }));
    expect(backwards.error).not.toBeNull();
  });
});
