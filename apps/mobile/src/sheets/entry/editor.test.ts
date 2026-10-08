import { leftoverError, zonedToUtc } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import type { EntryRecord } from '../../db/queries/today';
import {
  attributionLine,
  bottleUpdated,
  draftFrom,
  editError,
  END_AFTER_NOW,
  END_BEFORE_START,
  ENTRY_DELETED,
  ENTRY_RESTORED,
  ENTRY_UPDATED,
  entryPatch,
  fieldError,
  filterChips,
  GROWTH_ABOVE_ZERO,
  GROWTH_ONE_NEEDED,
  leftoverProblem,
  MED_NAME_NEEDED,
  pickedDate,
  pickedNear,
  rangeError,
  whenPhrase,
} from './editor';

const T0 = '2026-09-14T13:02:00.000Z';
const T1 = '2026-09-14T14:37:00.000Z';

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
      start_at: T0,
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
    by: { byName: null, createdAtMs: Date.parse(T0), editedAtMs: null, editedByName: null },
  };
}

describe('draftFrom', () => {
  it('opens on the row as stored, in canonical units', () => {
    const r = record(
      { type: 'bottle', quantity: 120, notes: 'sleepy' },
      { consumed_ml: 120, offered_ml: 150, kind: 'FORMULA' },
    );
    expect(draftFrom(r)).toEqual({
      startMs: Date.parse(T0),
      endMs: null,
      notes: 'sleepy',
      consumedMl: 120,
      offeredMl: 150,
      bottleKind: 'FORMULA',
      // and the two numbers the sheet asks: the bottle, and what was left in it
      bottleMl: 150,
      leftoverMl: 30,
    });
  });
  it('a missing detail row falls back to the sheet defaults rather than crashing', () => {
    expect(draftFrom(record({ type: 'sleep', end_at: T1 })).sleepKind).toBe('NAP');
    expect(draftFrom(record({ type: 'sleep', end_at: T1 })).endMs).toBe(Date.parse(T1));
  });
});

describe('entryPatch — only what changed (OFFLINE_SYNC §5)', () => {
  it('is empty when nothing changed', () => {
    const r = record({}, { kind: 'WET' });
    expect(entryPatch(r, draftFrom(r))).toEqual({
      patch: {},
      detailPatch: undefined,
      changed: false,
    });
  });
  it('a moved start is the one field, as ISO', () => {
    const r = record({}, { kind: 'WET' });
    const p = entryPatch(r, { ...draftFrom(r), startMs: Date.parse(T1) });
    expect(p.patch).toEqual({ start_at: T1 });
    expect(p.detailPatch).toBeUndefined();
  });
  it('a bottle amount moves the detail AND the canonical quantity together', () => {
    const r = record(
      { type: 'bottle', quantity: 120 },
      { consumed_ml: 120, offered_ml: null, kind: 'EBM' },
    );
    const p = entryPatch(r, { ...draftFrom(r), consumedMl: 90 });
    expect(p.patch).toEqual({ quantity: 90 });
    expect(p.detailPatch).toEqual({ consumed_ml: 90 });
  });
  it('a pump side edit rewrites both sides, the total, and which sides were pumped', () => {
    const r = record({ type: 'pump', quantity: 100 }, { left_ml: 40, right_ml: 60, total_ml: 100 });
    const p = entryPatch(r, { ...draftFrom(r), leftMl: 50, totalMl: 110 });
    expect(p.detailPatch).toEqual({ sides: 'BOTH', left_ml: 50, right_ml: 60, total_ml: 110 });
    expect(p.patch).toEqual({ quantity: 110 });
  });
  it('a cleared note is null, not an empty string', () => {
    const r = record({ notes: 'x' }, { kind: 'WET' });
    expect(entryPatch(r, { ...draftFrom(r), notes: '   ' }).patch).toEqual({ notes: null });
  });

  /**
   * AN OLDER MEAL (docs/SOLIDS.md §3) opens with its text read whole as a list — a part longer
   * than a saved name included — and nothing about its foods is written unless they change: a
   * corrected time leaves the parent's words exactly as they were stored.
   */
  it('an older meal keeps its text when only its time changes', () => {
    const food = 'Homemade oatmeal with mashed banana and a little bit of cinnamon on top, pear';
    const r = record({ type: 'solids' }, { meal: 'BREAKFAST', food, items: null, taken: 'MOST' });
    const d = draftFrom(r);
    expect(d.solidsItems?.map(i => i.name)).toEqual([
      'Homemade oatmeal with mashed banana and a little bit of cinnamon on top',
      'pear',
    ]);
    const p = entryPatch(r, { ...d, startMs: Date.parse(T1) });
    expect(p.patch).toEqual({ start_at: T1 });
    expect(p.detailPatch).toBeUndefined();
  });

  it('a meal whose foods changed writes the list and the text beside it, together', () => {
    const r = record({ type: 'solids' }, { meal: 'LUNCH', food: 'Pear', items: null });
    const d = draftFrom(r);
    const items = [{ name: 'Pear', amount: 2, unit: 'PIECE' as const, response: 'LOVED' as const }];
    const p = entryPatch(r, { ...d, solidsItems: items });
    expect(p.detailPatch).toEqual({ items, food: 'Pear' });
  });
});

describe('the words (§16)', () => {
  it('a bottle names itself; the rest say Entry updated', () => {
    expect(bottleUpdated('4 oz', '1:02 PM')).toBe('Bottle updated: 4 oz at 1:02 PM');
    expect(ENTRY_UPDATED).toBe('Entry updated');
    expect(ENTRY_DELETED).toBe('Entry deleted');
    expect(ENTRY_RESTORED).toBe('Entry restored');
  });
});

describe('rangeError', () => {
  it('refuses an end before the start and allows a zero length', () => {
    expect(rangeError({ startMs: 10, endMs: 5, notes: '' })).toBe(
      'The end cannot be before the start',
    );
    expect(rangeError({ startMs: 10, endMs: 10, notes: '' })).toBeNull();
    expect(rangeError({ startMs: 10, endMs: null, notes: '' })).toBeNull();
  });
});

describe('filterChips (§4)', () => {
  it('is the types present in the data that are also enabled, in data order', () => {
    expect(filterChips(['bath', 'bottle', 'diaper'], ['diaper', 'bottle', 'sleep'])).toEqual([
      'bottle',
      'diaper',
    ]);
  });
});

/*
  THE BYLINE (WP11). Two things are worth a table: the day never disappears when the write was
  not today (a Friday entry typed on Sunday must not read as Sunday evening), and a missing
  profile degrades to the plain fact instead of inventing a person.
*/
describe('whenPhrase', () => {
  const NY = 'America/New_York';
  const clock = (ms: number) =>
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: NY,
    }).format(ms);

  it('says only the clock when the write was today, in the reader’s own zone', () => {
    const now = Date.UTC(2026, 8, 14, 23, 0); // 7 pm New York
    expect(whenPhrase(Date.UTC(2026, 8, 14, 20, 14), now, NY, clock)).toBe('at 4:14 PM');
  });

  it('says yesterday, lower case, because it lands mid-sentence', () => {
    const now = Date.UTC(2026, 8, 14, 23, 0);
    expect(whenPhrase(Date.UTC(2026, 8, 14, 2, 14), now, NY, clock)).toBe('yesterday at 10:14 PM');
  });

  it('names the day for anything older', () => {
    const now = Date.UTC(2026, 8, 14, 23, 0);
    expect(whenPhrase(Date.UTC(2026, 8, 12, 20, 14), now, NY, clock)).toBe(
      'on Sat Sep 12 at 4:14 PM',
    );
  });

  it('reads the zone, not the device: a write after midnight UTC is still last night', () => {
    // 00:30 UTC on Sep 15 is 8:30 pm on Sep 14 in New York — the same evening the parent had
    const now = Date.UTC(2026, 8, 15, 1, 0);
    expect(whenPhrase(Date.UTC(2026, 8, 15, 0, 30), now, NY, clock)).toBe('at 8:30 PM');
  });
});

describe('attributionLine', () => {
  const when = (atMs: number) => `at ${atMs}`;
  const base = { createdAtMs: 1, editedAtMs: null, editedByName: null };

  it('names the caregiver who logged it', () => {
    expect(attributionLine({ ...base, byName: 'Dana' }, when)).toBe('Added by Dana at 1');
  });

  it('states the fact without inventing a person when the profile has not arrived', () => {
    expect(attributionLine({ ...base, byName: null }, when)).toBe('Added at 1');
  });

  it('adds who corrected it, and when', () => {
    expect(
      attributionLine({ byName: 'Dana', createdAtMs: 1, editedAtMs: 2, editedByName: 'Sam' }, when),
    ).toBe('Added by Dana at 1 · edited by Sam at 2');
  });

  it('reports the edit even when the editor has no name yet', () => {
    expect(
      attributionLine({ byName: 'Dana', createdAtMs: 1, editedAtMs: 2, editedByName: null }, when),
    ).toBe('Added by Dana at 1 · edited at 2');
  });

  it('says nothing about an edit that has not happened', () => {
    expect(attributionLine({ ...base, byName: 'Dana' }, when)).not.toContain('edited');
  });
});

/* ======================================================================================
   THE MODULE AUDITS OF 2026-09-24 — every value a sheet saves, shown and corrected.
   ====================================================================================== */

const NY = 'America/New_York';
/** A New York wall clock on a September 2026 day. */
const ny = (day: number, h: number, m = 0): number => zonedToUtc(NY, 2026, 9, day, h, m);
const NOON_14 = ny(14, 12);

/*
  C5 — A CORRECTION ACROSS MIDNIGHT (the care audit). The picker answers only the hour and
  minute; the day was always the entry's own, so every midnight correction went a day wrong.
*/
describe('pickedNear — the day nearest the value being corrected', () => {
  it('(a) a night sleep’s 11:30 PM start corrected to 12:15 AM stays on that night', () => {
    const start = ny(13, 23, 30);
    expect(pickedNear({ hours: 0, minutes: 15 }, start, NOON_14, NY)).toBe(ny(14, 0, 15));
  });

  it('(b) an 11:40 PM end corrected to 5:00 AM is the next morning, not before the start', () => {
    const d = { startMs: ny(13, 22), endMs: ny(13, 23, 40), notes: '' };
    const endMs = pickedNear({ hours: 5, minutes: 0 }, d.endMs, NOON_14, NY);
    expect(endMs).toBe(ny(14, 5));
    expect(rangeError({ ...d, endMs }, NOON_14)).toBeNull();
  });

  it('(c) on an older entry, an end of 00:30 corrected to 11:50 PM is the night before', () => {
    const endMs = pickedNear({ hours: 23, minutes: 50 }, ny(12, 0, 30), NOON_14, NY);
    expect(endMs).toBe(ny(11, 23, 50));
    // the sleep that began at 11 PM is 50 minutes long, not 26.8 hours
    expect((endMs - ny(11, 23)) / 60_000).toBe(50);
  });

  it('(d) on an older entry, a start of 00:30 corrected to 11:50 PM moves back, never a day on', () => {
    expect(pickedNear({ hours: 23, minutes: 50 }, ny(12, 0, 30), NOON_14, NY)).toBe(ny(11, 23, 50));
  });

  it('keeps the D13 rule: more than a minute past now is last night', () => {
    const now = ny(14, 23, 5);
    expect(pickedNear({ hours: 23, minutes: 30 }, ny(14, 23), now, NY)).toBe(ny(13, 23, 30));
    // and 11:50 PM typed at 00:05 on an entry from a minute ago is the evening before
    const justAfter = ny(15, 0, 5);
    expect(pickedNear({ hours: 23, minutes: 50 }, ny(15, 0, 1), justAfter, NY)).toBe(
      ny(14, 23, 50),
    );
  });
});

describe('a time moved into the future is refused (the care audit, C5)', () => {
  it('says so for an end later than now, and for an end before the start', () => {
    const pump = { startMs: ny(14, 11), endMs: ny(14, 11, 50), notes: '' };
    const moved = { ...pump, startMs: ny(14, 11, 40), endMs: ny(14, 12, 30) };
    expect(rangeError(moved, NOON_14)).toBe(END_AFTER_NOW);
    expect(rangeError(pump, NOON_14)).toBeNull();
    expect(rangeError({ ...pump, endMs: ny(14, 10) }, NOON_14)).toBe(END_BEFORE_START);
  });
});

describe('a sleep’s nap or night, a tummy session’s minutes (the care audit, H5)', () => {
  it('writes the kind when it changes', () => {
    const r = record({ type: 'sleep', start_at: T0, end_at: T1 }, { kind: 'NIGHT' });
    expect(entryPatch(r, { ...draftFrom(r), sleepKind: 'NAP' }).detailPatch).toEqual({
      kind: 'NAP',
    });
  });

  it('tummy minutes follow its edited times, so the download never disagrees with itself', () => {
    const r = record({
      type: 'tummy',
      start_at: T0,
      end_at: new Date(Date.parse(T0) + 10 * 60_000).toISOString(),
      quantity: 10,
    });
    const d = draftFrom(r);
    const longer = entryPatch(r, { ...d, endMs: Date.parse(T0) + 15 * 60_000 });
    expect(longer.patch).toMatchObject({ quantity: 15 });
    // a moved start that keeps the length writes the times and not a quantity that is the same
    const five = 5 * 60_000;
    const moved = entryPatch(r, {
      ...d,
      startMs: d.startMs - five,
      endMs: (d.endMs ?? d.startMs) - five,
    });
    expect(moved.patch).not.toHaveProperty('quantity');
  });
});

describe('a diaper’s color and rash tick (the care audit, H5, H6)', () => {
  it('opens on the color chip and the tick as saved, and writes only what changed', () => {
    const r = record({ type: 'diaper' }, { kind: 'DIRTY', color: 'Green', rash: 1 });
    const d = draftFrom(r);
    expect(d).toMatchObject({ diaperKind: 'DIRTY', diaperColor: 'Green', diaperRash: true });
    expect(entryPatch(r, d).changed).toBe(false);
    expect(entryPatch(r, { ...d, diaperColor: null, diaperRash: false }).detailPatch).toEqual({
      color: null,
      rash: false,
    });
    expect(entryPatch(r, { ...d, diaperColor: 'Yellow' }).detailPatch).toEqual({
      color: 'Yellow',
    });
  });
});

describe('a bath’s hair (the care audit, H5)', () => {
  const meta = JSON.stringify({ source: 'app', field_clocks: { notes: T0 } });
  it('opens on the hair as saved, or on neither for a bath that never said', () => {
    expect(draftFrom(record({ type: 'bath', metadata: meta })).hairWashed).toBeNull();
    expect(
      draftFrom(record({ type: 'bath', metadata: JSON.stringify({ hair_washed: false }) }))
        .hairWashed,
    ).toBe(false);
    // a damaged column reads as empty, never throws
    expect(draftFrom(record({ type: 'bath', metadata: '{oops' })).hairWashed).toBeNull();
  });

  it('writes the whole metadata with the row’s own keys kept', () => {
    const r = record({ type: 'bath', metadata: meta });
    const p = entryPatch(r, { ...draftFrom(r), hairWashed: true });
    expect(p.patch).toEqual({
      metadata: { source: 'app', field_clocks: { notes: T0 }, hair_washed: true },
    });
    expect(p.detailPatch).toBeUndefined();
  });
});

describe('a medicine’s name and the amount as given (the solids audit, H7)', () => {
  const r = record({ type: 'med' }, { name: 'Fever reducer', amount_text: '5 ml', route: 'MOUTH' });

  it('corrects the amount as text — trimmed, never read as a number — and clears it to null', () => {
    const d = draftFrom(r);
    expect(d).toMatchObject({ medName: 'Fever reducer', medAmount: '5 ml' });
    expect(entryPatch(r, { ...d, medAmount: ' 2.5 ml ' }).detailPatch).toEqual({
      amount_text: '2.5 ml',
    });
    expect(entryPatch(r, { ...d, medAmount: '  ' }).detailPatch).toEqual({ amount_text: null });
  });

  it('corrects the name, and refuses an empty one rather than writing it', () => {
    const d = draftFrom(r);
    expect(entryPatch(r, { ...d, medName: 'Vitamin D' }).detailPatch).toEqual({
      name: 'Vitamin D',
    });
    expect(fieldError('med', { ...d, medName: '  ' })).toBe(MED_NAME_NEEDED);
    expect(entryPatch(r, { ...d, medName: '  ' }).changed).toBe(false);
    expect(fieldError('med', d)).toBeNull();
  });
});

describe('a temperature and a growth entry (the solids audit, H8)', () => {
  it('corrects the reading, with the row’s quantity, and how it was taken', () => {
    const r = record(
      { type: 'temp', quantity: 3840, canonical_unit: 'c_hundredths' },
      { temp_c_hundredths: 3840, temp_method: 'Rectal' },
    );
    const d = draftFrom(r);
    expect(d).toMatchObject({ tempCHundredths: 3840, tempMethod: 'Rectal' });
    const p = entryPatch(r, { ...d, tempCHundredths: 3830, tempMethod: 'Ear' });
    expect(p.detailPatch).toEqual({ temp_c_hundredths: 3830, temp_method: 'Ear' });
    expect(p.patch).toEqual({ quantity: 3830 });
  });

  it('corrects a measurement and removes a stray one, the weight carrying the quantity', () => {
    const r = record(
      { type: 'growth', quantity: 3500, canonical_unit: 'g' },
      { weight_g: 3500, length_mm: 500, head_mm: null, standard: null },
    );
    const d = draftFrom(r);
    expect(d).toMatchObject({ weightG: 3500, lengthMm: 500, headMm: null });
    // the length nobody took (the solids audit, C1) comes off without deleting the entry
    expect(entryPatch(r, { ...d, lengthMm: null })).toMatchObject({
      patch: {},
      detailPatch: { length_mm: null },
    });
    expect(entryPatch(r, { ...d, weightG: 3600 }).patch).toEqual({ quantity: 3600 });
    expect(entryPatch(r, { ...d, weightG: null }).patch).toEqual({
      quantity: null,
      canonical_unit: null,
    });
  });

  it('never saves a growth entry with no measurement, or a measurement of zero', () => {
    const d = { startMs: 0, endMs: null, notes: '' };
    expect(fieldError('growth', { ...d, weightG: null, lengthMm: null, headMm: null })).toBe(
      GROWTH_ONE_NEEDED,
    );
    expect(fieldError('growth', { ...d, weightG: 0, lengthMm: 500 })).toBe(GROWTH_ABOVE_ZERO);
    expect(fieldError('growth', { ...d, weightG: 3500, lengthMm: null })).toBeNull();
  });

  it('moves a measurement to another day and keeps its time of day, never past now', () => {
    const at = ny(10, 15, 15);
    expect(pickedDate('2026-09-12', at, NOON_14, NY)).toBe(ny(12, 15, 15));
    expect(pickedDate('2026-09-14', at, NOON_14, NY)).toBe(NOON_14);
    expect(pickedDate('not a day', at, NOON_14, NY)).toBe(at);
  });
});

/*
  C7 — A TOTAL-ONLY PUMP (the feeding audit). It opened as Left 0 / Right 0 with no total, and one
  tap on a side overwrote its 4 oz with 0.5 oz. It now opens on its total, as the pump sheet shows
  one: the sides are dim until touched, and touching one is the sheet's own rule.
*/
describe('a pump logged as one total', () => {
  const r = record(
    { type: 'pump', quantity: 118 },
    { sides: 'BOTH', left_ml: null, right_ml: null, total_ml: 118 },
  );

  it('opens on its total and writes nothing untouched', () => {
    const d = draftFrom(r);
    expect(d).toMatchObject({ pumpMode: 'total', totalMl: 118 });
    expect(entryPatch(r, d).changed).toBe(false);
  });

  it('a corrected total keeps both sides null — no invented split', () => {
    const p = entryPatch(r, { ...draftFrom(r), pumpMode: 'total', totalMl: 133 });
    expect(p.detailPatch).toEqual({ sides: 'BOTH', left_ml: null, right_ml: null, total_ml: 133 });
    expect(p.patch).toEqual({ quantity: 133 });
  });

  it('sides as the source write both, and `sides` says which were pumped', () => {
    const sides = (leftMl: number, rightMl: number) => ({
      ...draftFrom(r),
      pumpMode: 'side' as const,
      leftMl,
      rightMl,
      totalMl: leftMl + rightMl,
    });
    expect(entryPatch(r, sides(60, 58)).detailPatch).toEqual({
      sides: 'BOTH',
      left_ml: 60,
      right_ml: 58,
      total_ml: 118,
    });
    expect(entryPatch(r, sides(90, 0)).detailPatch).toMatchObject({
      sides: 'LEFT',
      right_ml: null,
    });
    // nothing on either side is not "the right" (the feeding audit, C13)
    expect(entryPatch(r, sides(0, 0)).detailPatch).toMatchObject({ sides: 'BOTH', total_ml: 0 });
  });
});

/*
  A BOTTLE IS CORRECTED WITH THE QUICK SHEET'S TWO NUMBERS (the owner, 2026-09-25). The editor
  asked "Amount taken" and then "Made up in the bottle", and clamped the second to the first: a
  4 oz bottle whose "made up" was stepped to 1 oz showed 1 oz while the entry stayed 4 oz, and
  Save stayed off with nothing to say why. It now asks what was in the bottle and what was left,
  works the stored pair out with core's `fromLeftover`, and says an impossible pair out loud.
*/
describe('a bottle: the bottle, then what was left in it', () => {
  const r = (consumed_ml: number, offered_ml: number | null) =>
    record(
      { type: 'bottle', quantity: consumed_ml },
      { consumed_ml, offered_ml, kind: 'EBM', from_stash: false, container_id: null },
    );

  it('opens a stored bottle on the two numbers a parent reads off it', () => {
    expect(draftFrom(r(90, 120))).toMatchObject({ bottleMl: 120, leftoverMl: 30 });
    // "same as taken" (offered null, from before both were stored) is a finished bottle
    expect(draftFrom(r(120, null))).toMatchObject({ bottleMl: 120, leftoverMl: 0 });
    // a refused bottle: all of it left
    expect(draftFrom(r(0, 120))).toMatchObject({ bottleMl: 120, leftoverMl: 120 });
    // a row no sheet writes (offered below taken) opens finished, never on a negative leftover
    expect(draftFrom(r(120, 90))).toMatchObject({ bottleMl: 120, leftoverMl: 0 });
  });

  it('writes nothing for a bottle that was opened and not touched', () => {
    for (const row of [r(90, 120), r(120, null), r(0, 120), r(120, 90)]) {
      expect(entryPatch(row, draftFrom(row)).changed).toBe(false);
      expect(editError(row, draftFrom(row), NOON_14)).toBeNull();
    }
  });

  it('the owner’s bottle: 4 oz in it and 1 oz left is 3 oz taken from a 4 oz bottle', () => {
    const row = r(118, 118);
    const d = { ...draftFrom(row), leftoverMl: 30, consumedMl: 88, offeredMl: 118 };
    expect(fieldError('bottle', d)).toBeNull();
    // the diff is the one the editor always wrote: the taken amount, and the row's quantity
    const p = entryPatch(row, d);
    expect(p.patch).toEqual({ quantity: 88 });
    expect(p.detailPatch).toEqual({ consumed_ml: 88 });
  });

  it('a bigger bottle writes both numbers of the pair', () => {
    const row = r(90, 120);
    const d = { ...draftFrom(row), bottleMl: 150, consumedMl: 120, offeredMl: 150 };
    expect(entryPatch(row, d).detailPatch).toEqual({ consumed_ml: 120, offered_ml: 150 });
    expect(entryPatch(row, d).patch).toEqual({ quantity: 120 });
  });

  /**
   * THE BUG, AS THE OWNER WOULD HAVE MET IT: a 4 oz bottle whose second stepper was taken down to
   * 1 oz. It used to be clamped back to what was taken — the stepper said 1 oz, the entry kept
   * 4 oz, Save stayed off. Now a smaller bottle is a smaller feed, and more left than was in the
   * bottle is said, in core's own words, and not written.
   */
  it('says “More is left than was in the bottle” instead of clamping, and saves nothing until fixed', () => {
    const row = r(118, 118);
    const tooMuchLeft = { ...draftFrom(row), bottleMl: 118, leftoverMl: 148 };
    expect(leftoverProblem(tooMuchLeft)).toBe('More is left than was in the bottle');
    expect(fieldError('bottle', tooMuchLeft)).toBe('More is left than was in the bottle');
    expect(editError(row, tooMuchLeft, NOON_14)).toBe('More is left than was in the bottle');
    // the same words the bottle sheet shows (its copy test ties them to core)
    expect(leftoverProblem(tooMuchLeft)).toBe(leftoverError({ bottleMl: 118, leftoverMl: 148 }));
    // and a leftover no bigger than the bottle is a feed again
    expect(fieldError('bottle', { ...tooMuchLeft, leftoverMl: 118 })).toBeNull();
  });
});

describe('a breastfeed’s minutes and first side (timers 10, 12)', () => {
  const r = record(
    {
      type: 'breastfeed',
      start_at: '2026-09-14T12:00:00.000Z',
      end_at: '2026-09-14T12:10:00.000Z',
      quantity: 10,
    },
    { first_side: null, left_seconds: 300, right_seconds: 300 },
  );

  it('writes both sides and the quantity when a side changes', () => {
    const p = entryPatch(r, { ...draftFrom(r), leftSeconds: 900 });
    expect(p.detailPatch).toEqual({ left_seconds: 900, right_seconds: 300 });
    expect(p.patch).toEqual({ quantity: 20 });
  });

  it('records which side it started on', () => {
    expect(entryPatch(r, { ...draftFrom(r), firstSide: 'RIGHT' }).detailPatch).toEqual({
      first_side: 'RIGHT',
    });
  });
});

/*
  M6 — TWO DEAD ENDS FOR OLDER MEALS (the solids audit). "Changed" was judged on the TRIMMED
  lists, so removing the 21st part, or shortening an over-long part to its first 60 characters,
  counted as no change and Save stayed disabled.
*/
describe('an older meal’s foods, compared whole', () => {
  it('removing the 21st part is a change, and saves the twenty', () => {
    const food = Array.from({ length: 21 }, (_, i) => `food ${i + 1}`).join(', ');
    const r = record({ type: 'solids' }, { meal: 'LUNCH', food, items: null });
    const d = draftFrom(r);
    expect(d.solidsItems).toHaveLength(21);
    const p = entryPatch(r, { ...d, solidsItems: d.solidsItems?.slice(0, 20) ?? [] });
    expect(p.changed).toBe(true);
    expect((p.detailPatch?.['items'] as unknown[]).length).toBe(20);
  });

  it('shortening a long part to exactly its first sixty characters is a change', () => {
    const long = 'A'.repeat(80);
    const r = record({ type: 'solids' }, { meal: 'LUNCH', food: long, items: null });
    const d = draftFrom(r);
    const p = entryPatch(r, {
      ...d,
      solidsItems: [{ name: 'A'.repeat(60), amount: null, unit: null, response: null }],
    });
    expect(p.changed).toBe(true);
    expect(p.detailPatch?.['food']).toBe('A'.repeat(60));
  });
});

describe('a meal saved with no meal type opens with none, not Snack (the solids audit, low)', () => {
  it('reads it as none and writes nothing until one is picked', () => {
    const r = record({ type: 'solids' }, { meal: null, food: 'Pear', items: null });
    const d = draftFrom(r);
    expect(d.meal).toBeNull();
    expect(entryPatch(r, d).changed).toBe(false);
    expect(entryPatch(r, { ...d, meal: 'LUNCH' }).detailPatch).toEqual({ meal: 'LUNCH' });
  });
});

describe('editError — what stops a save', () => {
  it('holds a moved time to now, and leaves an untouched future end alone', () => {
    // another phone's clock ran fast: the saved end is five minutes ahead of this one's now
    const r = record({
      type: 'pump',
      start_at: new Date(NOON_14 - 20 * 60_000).toISOString(),
      end_at: new Date(NOON_14 + 5 * 60_000).toISOString(),
    });
    const d = draftFrom(r);
    expect(editError(r, { ...d, notes: 'left early' }, NOON_14)).toBeNull();
    const earlier = { ...d, startMs: d.startMs - 60_000, endMs: (d.endMs ?? 0) - 60_000 };
    expect(editError(r, earlier, NOON_14)).toBe(END_AFTER_NOW);
  });

  it('then asks for a field the row cannot be saved without', () => {
    const r = record({ type: 'med' }, { name: 'Fever reducer', amount_text: null });
    expect(editError(r, { ...draftFrom(r), medName: '' }, NOON_14)).toBe(MED_NAME_NEEDED);
  });
});
