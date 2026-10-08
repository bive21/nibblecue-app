/**
 * IMPORT IS THE ONE FEATURE THAT ADDS ROWS NOBODY TYPED, so every one of these tests is about a
 * way it could put something false in somebody's history and call it their own.
 *
 * The dangerous ones, and each has a test: a type rounded to the nearest module, an ambiguous
 * date read as the wrong month, an ounce imported as a millilitre, a re-run doubling the file, a
 * row dropped without being counted.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_CSV_HEADER,
  draftKey,
  guessColumns,
  HELD_SLACK_MS,
  newDrafts,
  ownExportMap,
  parseDelimited,
  parseWhen,
  readRow,
  readTable,
  SKIP_REASON_LABEL,
  type ColumnMap,
  type HeldEntry,
  type ImportDraft,
} from '../index';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const CTX = { nowMs: NOW, assumeVolumeUnit: 'ml' as const };

describe('parseDelimited — the file, whatever a spreadsheet did to it', () => {
  it('reads a plain comma file, trimming the header and keeping the data', () => {
    const t = parseDelimited('type , start\nbottle,2026-09-20T08:00:00Z\n');
    expect(t.header).toEqual(['type', 'start']);
    expect(t.rows).toEqual([['bottle', '2026-09-20T08:00:00Z']]);
    expect(t.lines).toEqual([2]);
  });

  it('survives what Excel adds: a BOM, CRLF, and a quoted field with a comma in it', () => {
    const t = parseDelimited('﻿type,notes\r\nbottle,"took 20 min, fussy"\r\n');
    expect(t.header).toEqual(['type', 'notes']);
    expect(t.rows[0]).toEqual(['bottle', 'took 20 min, fussy']);
  });

  it('reads a doubled quote as one quote, and a newline inside a quoted field as text', () => {
    const t = parseDelimited('type,notes\nnote,"she said ""more"" and\nthen slept"\n');
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]?.[1]).toBe('she said "more" and\nthen slept');
  });

  it('sniffs a tab or semicolon file, which is what a comma-decimal locale exports', () => {
    expect(parseDelimited('type\tstart\nbottle\t1\n').header).toEqual(['type', 'start']);
    expect(parseDelimited('type;start;amount\nbottle;1;2\n').header).toEqual([
      'type',
      'start',
      'amount',
    ]);
  });

  it('drops a blank line rather than reading it as a row of empty fields', () => {
    const t = parseDelimited('type,start\nbottle,1\n\n\nbottle,2\n');
    expect(t.rows).toHaveLength(2);
    // and the line numbers still point at the real file, for a skip message a person can use
    expect(t.lines).toEqual([2, 5]);
  });

  it('pads a short row and truncates a long one, so a ragged file still lines up', () => {
    const t = parseDelimited('a,b,c\n1\n1,2,3,4\n');
    expect(t.rows[0]).toEqual(['1', '', '']);
    expect(t.rows[1]).toEqual(['1', '2', '3']);
  });
});

describe('parseWhen — a wrong month is a history silently shifted', () => {
  it('reads ISO, which is what this app writes', () => {
    expect(parseWhen('2026-09-20T08:30:00Z')).toBe(Date.parse('2026-09-20T08:30:00Z'));
  });

  it('reads the spreadsheet shape with a space instead of a T', () => {
    expect(parseWhen('2026-09-20 08:30')).toBe(Date.parse('2026-09-20T08:30:00'));
    expect(parseWhen('2026-09-20 8:30:15')).toBe(Date.parse('2026-09-20T08:30:15'));
  });

  it('reads an epoch in seconds or milliseconds, because exporters emit both', () => {
    expect(parseWhen('1758628800')).toBe(1758628800 * 1000);
    expect(parseWhen('1758628800000')).toBe(1758628800000);
  });

  /**
   * THE ONE THAT MATTERS. `03/04/2026` is March 4th to half the world and April 3rd to the other
   * half, and a history moved by a month is the kind of wrong a parent finds six months later. It
   * is REFUSED, and the row is counted as unreadable rather than guessed.
   */
  it('refuses a date whose day and month could be either way round', () => {
    expect(parseWhen('03/04/2026')).toBeNull();
    expect(parseWhen('12/11/2026 08:30')).toBeNull();
  });

  it('accepts one only when the first number cannot be a month', () => {
    expect(parseWhen('20/09/2026 08:30')).toBe(Date.parse('2026-09-20T08:30:00'));
    expect(parseWhen('09/20/2026 08:30')).toBe(Date.parse('2026-09-20T08:30:00'));
  });

  it('reads a 12-hour clock, including midnight and noon', () => {
    expect(parseWhen('09/20/2026 8:30 PM')).toBe(Date.parse('2026-09-20T20:30:00'));
    expect(parseWhen('09/20/2026 12:30 AM')).toBe(Date.parse('2026-09-20T00:30:00'));
    expect(parseWhen('09/20/2026 12:30 PM')).toBe(Date.parse('2026-09-20T12:30:00'));
  });

  it('returns null for anything else, rather than a date near today', () => {
    for (const junk of ['', 'yesterday', 'soon', 'n/a', '—', 'Sept 20']) {
      expect(parseWhen(junk), junk).toBeNull();
    }
  });
});

describe('readRow — nothing is guessed into the nearest module', () => {
  const MAP: ColumnMap = ['type', 'startAt', 'quantity', 'unit', 'notes'];
  const row = (...cells: string[]) => readRow(cells, MAP, 7, CTX);

  it('reads a feed, converting the unit at the edge', () => {
    const out = row('bottle', '2026-09-20T08:00:00Z', '4', 'oz', 'hungry');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft).toMatchObject({
      type: 'bottle',
      quantity: 118, // 4 oz, rounded — canonical ml, per CLAUDE.md §6
      canonicalUnit: 'ml',
      notes: 'hungry',
      line: 7,
    });
  });

  it('knows the words other apps use for the same thing', () => {
    // an amount is given throughout, so only the TYPE word is under test here — a pump or a feed
    // with no amount is a separate, deliberate skip (see `draftDetail`)
    for (const [word, type, unit] of [
      ['Nursing', 'breastfeed', 'ml'],
      ['NAP', 'sleep', 'ml'],
      ['Expressing', 'pump', 'ml'],
      ['Playtime', 'tummy', 'ml'],
      ['weight', 'growth', 'kg'],
    ] as const) {
      const out = row(word, '2026-09-20T08:00:00Z', '4', unit, '');
      expect(out.ok, word).toBe(true);
      if (out.ok) expect(out.draft.type, word).toBe(type);
    }
  });

  /**
   * A TYPE WORD INSIDE A CELL IS THE FILE SAYING IT; TWO WORDS IS A GUESS. Trackers write "Wet
   * diaper" and "Bottle — formula" rather than a bare word, and reading the one type word in a cell
   * is reading, not inference. Two is refused.
   */
  it('reads the one type word in a longer cell, and refuses a cell with two', () => {
    const wet = row('Wet nappy', '2026-09-20T08:00:00Z', '', '', '');
    expect(wet.ok).toBe(true);
    if (wet.ok) expect(wet.draft).toMatchObject({ type: 'diaper', detail: { kind: 'WET' } });
    expect(row('sleep feeding', '2026-09-20T08:00:00Z')).toMatchObject({
      ok: false,
      reason: 'unknownType',
    });
    // and a word merely CONTAINING a type word is not that type
    expect(row('nursery tidy', '2026-09-20T08:00:00Z')).toMatchObject({
      ok: false,
      reason: 'unknownType',
    });
  });

  /**
   * A CELL IS SOMEBODY ELSE'S TEXT, and the word tables are plain objects: "constructor" read as a
   * type (Object's own constructor) and as a unit, and the plan threw. Only a table's own words
   * answer a cell (`ownWord`).
   */
  it('reads a word an object inherits as no type and no unit, and never throws on it', () => {
    for (const word of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(row(word, '2026-09-20T08:00:00Z'), word).toMatchObject({
        ok: false,
        reason: 'unknownType',
      });
      const out = row('bottle', '2026-09-20T08:00:00Z', '4', word, '');
      expect(out.ok, word).toBe(true);
      // an unknown unit falls back to the household's stated assumption, as any unknown word does
      if (out.ok) expect(out.draft.canonicalUnit, word).toBe('ml');
    }
  });

  /**
   * A "walk" row becoming a tummy-time entry would be an invented fact about somebody's baby, and
   * no summary shown afterwards could undo it. So an unknown word is a SKIP with a reason.
   */
  it('skips a type this app does not have, and never rounds it to something close', () => {
    for (const word of ['walk', 'mood', 'teething', 'tooth', 'visitors']) {
      const out = row(word, '2026-09-20T08:00:00Z', '', '', '');
      expect(out.ok, word).toBe(false);
      if (!out.ok) expect(out.reason).toBe('unknownType');
    }
  });

  it('skips a row with no type, no time, or an unreadable time, each with its own reason', () => {
    expect(row('', '2026-09-20T08:00:00Z')).toMatchObject({ ok: false, reason: 'noType' });
    expect(row('bottle', '')).toMatchObject({ ok: false, reason: 'noTime' });
    expect(row('bottle', '03/04/2026')).toMatchObject({ ok: false, reason: 'badTime' });
  });

  it('skips a row in the future, allowing a minute of slack for the exporter’s own clock', () => {
    // `bath` needs no detail, so nothing but the TIME can be the reason either way round
    expect(row('bath', new Date(NOW + 3_600_000).toISOString())).toMatchObject({
      ok: false,
      reason: 'future',
    });
    expect(row('bath', new Date(NOW + 30_000).toISOString()).ok).toBe(true);
  });

  it('skips an amount that is not a number rather than importing a zero', () => {
    expect(row('bottle', '2026-09-20T08:00:00Z', 'a lot', 'ml')).toMatchObject({
      ok: false,
      reason: 'badQuantity',
    });
  });

  it('reads a comma decimal, which is what half the world’s spreadsheets write', () => {
    const out = row('growth', '2026-09-20T08:00:00Z', '4,5', 'kg');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.draft).toMatchObject({ quantity: 4500, canonicalUnit: 'g' });
  });

  /**
   * A FILE OF BARE `4`s IS 4 OZ OR 4 ML AND THE DIFFERENCE IS SEVENFOLD. There is no right answer
   * from the data, so the household's own unit is the assumption AND the plan flags that it was
   * used, so the screen can say so before anything is written.
   */
  it('falls back to the household’s unit when the file names none, and says it did', () => {
    const asMl = readRow(
      ['bottle', '2026-09-20T08:00:00Z', '4'],
      ['type', 'startAt', 'quantity'],
      2,
      CTX,
    );
    expect(asMl.ok && asMl.draft.quantity).toBe(4);
    const asOz = readRow(
      ['bottle', '2026-09-20T08:00:00Z', '4'],
      ['type', 'startAt', 'quantity'],
      2,
      { ...CTX, assumeVolumeUnit: 'oz' },
    );
    expect(asOz.ok && asOz.draft.quantity).toBe(118);
  });

  it('takes an end time, or a duration, and refuses an end before its start', () => {
    const map: ColumnMap = ['type', 'startAt', 'endAt', 'durationMinutes'];
    const withEnd = readRow(
      ['sleep', '2026-09-20T08:00:00Z', '2026-09-20T09:30:00Z', ''],
      map,
      2,
      CTX,
    );
    expect(withEnd.ok && withEnd.draft.endMs).toBe(Date.parse('2026-09-20T09:30:00Z'));
    const withDuration = readRow(['sleep', '2026-09-20T08:00:00Z', '', '45'], map, 2, CTX);
    expect(withDuration.ok && withDuration.draft.endMs).toBe(Date.parse('2026-09-20T08:45:00Z'));
    // backwards: dropped, not reversed — a negative length is a broken row, not a clue
    const backwards = readRow(
      ['sleep', '2026-09-20T08:00:00Z', '2026-09-20T07:00:00Z', ''],
      map,
      2,
      CTX,
    );
    expect(backwards.ok && backwards.draft.endMs).toBeNull();
  });

  it('keeps only the chosen baby’s rows when a household has more than one', () => {
    const map: ColumnMap = ['type', 'startAt', 'childName'];
    const ada = readRow(['bath', '2026-09-20T08:00:00Z', 'Ada'], map, 2, {
      ...CTX,
      onlyChildName: 'ada',
    });
    expect(ada.ok).toBe(true);
    const liam = readRow(['bath', '2026-09-20T08:00:00Z', 'Liam'], map, 2, {
      ...CTX,
      onlyChildName: 'Ada',
    });
    expect(liam).toMatchObject({ ok: false, reason: 'otherChild' });
    // a row with no name at all belongs to whoever was picked: a one-baby export has no name column
    const nameless = readRow(['bath', '2026-09-20T08:00:00Z', ''], map, 2, {
      ...CTX,
      onlyChildName: 'Ada',
    });
    expect(nameless.ok).toBe(true);
  });
});

/**
 * THE DETAIL A TYPE CANNOT BE STORED WITHOUT, decided at PLAN time so it is a number in the summary
 * a parent reads rather than a failure after they have said yes.
 */
describe('draftDetail — a row this app cannot hold is skipped, never faked', () => {
  const MAP: ColumnMap = ['type', 'startAt', 'quantity', 'unit', 'detailText'];
  const row = (...cells: string[]) => readRow(cells, MAP, 5, CTX);

  it('needs an amount for a feed and a pump, and says so rather than writing zero', () => {
    expect(row('bottle', '2026-09-20T08:00:00Z')).toMatchObject({
      ok: false,
      reason: 'needsAmount',
    });
    expect(row('pump', '2026-09-20T08:00:00Z')).toMatchObject({
      ok: false,
      reason: 'needsAmount',
    });
    const fed = row('bottle', '2026-09-20T08:00:00Z', '4', 'oz');
    expect(fed.ok && fed.draft.detail).toEqual({ consumed_ml: 118 });
  });

  it('needs the file to say which kind of diaper, and never reads it off a note', () => {
    expect(row('diaper', '2026-09-20T08:00:00Z')).toMatchObject({
      ok: false,
      reason: 'needsKind',
    });
    for (const [word, kind] of [
      ['wet', 'WET'],
      ['Dirty', 'DIRTY'],
      ['poop', 'DIRTY'],
      ['mixed', 'BOTH'],
      ['both', 'BOTH'],
      ['dry', 'DRY'],
    ] as const) {
      const out = row('diaper', '2026-09-20T08:00:00Z', '', '', word);
      expect(out.ok, word).toBe(true);
      if (out.ok) expect(out.draft.detail, word).toEqual({ kind });
    }
  });

  it('needs a medicine to have a name, because "" is not a medicine', () => {
    expect(row('medicine', '2026-09-20T08:00:00Z')).toMatchObject({
      ok: false,
      reason: 'needsName',
    });
    const dosed = row('medicine', '2026-09-20T08:00:00Z', '', '', 'Vitamin D');
    expect(dosed.ok && dosed.draft.detail).toEqual({ name: 'Vitamin D' });
  });

  /** A MEDICINE ROW CARRIES WHAT THE FILE SAID AND NOTHING THIS APP WORKED OUT (CLAUDE.md rule 4). */
  it('never computes a dose: the amount is the file’s own text, and no dose is derived', () => {
    const src = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');
    for (const forbidden of ['perKg', 'mgPerKg', 'dosePer', 'weightBased']) {
      expect(src, forbidden).not.toContain(forbidden);
    }
  });

  it('decides which growth measurement it is from the UNIT, the only thing that can say', () => {
    const weight = row('weight', '2026-09-20T08:00:00Z', '4.5', 'kg');
    expect(weight.ok && weight.draft.detail).toEqual({ weight_g: 4500 });
    const length = row('length', '2026-09-20T08:00:00Z', '55', 'cm');
    expect(length.ok && length.draft.detail).toEqual({ length_mm: 550 });
    // millilitres on a growth row says nothing about what was measured
    expect(row('weight', '2026-09-20T08:00:00Z', '4500', 'ml')).toMatchObject({
      ok: false,
      reason: 'needsAmount',
    });
  });

  it('lets a duration-only breastfeed through, because its sides default to zero', () => {
    const out = readRow(
      ['breastfeed', '2026-09-20T08:00:00Z', '18'],
      ['type', 'startAt', 'durationMinutes'],
      5,
      CTX,
    );
    expect(out.ok && out.draft.detail).toEqual({ left_seconds: 18 * 60 });
  });

  it('asks nothing extra of the types whose columns are all optional', () => {
    for (const word of ['bath', 'tummy time', 'note', 'milestone', 'water']) {
      expect(row(word, '2026-09-20T08:00:00Z').ok, word).toBe(true);
    }
  });
});

describe('the column mapping', () => {
  it('recognizes this app’s own export exactly, so it needs no mapping step', () => {
    const map = ownExportMap([...ACTIVITY_CSV_HEADER]);
    expect(map).not.toBeNull();
    expect(map?.[ACTIVITY_CSV_HEADER.indexOf('type')]).toBe('type');
    expect(map?.[ACTIVITY_CSV_HEADER.indexOf('start_at')]).toBe('startAt');
    // the CANONICAL pair, not the display pair — a displayed number has been rounded for a human
    expect(map?.[ACTIVITY_CSV_HEADER.indexOf('quantity_canonical')]).toBe('quantity');
    expect(map?.[ACTIVITY_CSV_HEADER.indexOf('quantity_display')]).toBeNull();
    expect(map?.[ACTIVITY_CSV_HEADER.indexOf('canonical_unit')]).toBe('unit');
  });

  it('says no to a header that is not ours, rather than half-matching it', () => {
    expect(ownExportMap(['type', 'start_at'])).toBeNull();
    expect(ownExportMap(['Event', 'Time', 'Amount'])).toBeNull();
  });

  it('guesses from common column names, and claims each field only once', () => {
    const map = guessColumns(['Start', 'Activity', 'Amount', 'Unit', 'Comment', 'Time']);
    expect(map).toEqual(['startAt', 'type', 'quantity', 'unit', 'notes', null]);
  });

  it('leaves a column it does not recognize alone', () => {
    expect(guessColumns(['type', 'mood', 'weather'])).toEqual(['type', null, null]);
  });
});

describe('readTable — every row lands in exactly one bucket, and both are counted', () => {
  const file = [
    'type,start,amount,unit,baby',
    'bottle,2026-09-20T08:00:00Z,4,oz,Ada',
    'nap,2026-09-20T10:00:00Z,,,Ada',
    'walk,2026-09-20T11:00:00Z,,,Ada',
    'bottle,03/04/2026,4,oz,Ada',
    'bottle,2026-09-19T08:00:00Z,3,oz,Ada',
  ].join('\n');

  const plan = () => {
    const t = parseDelimited(file);
    return readTable(t, guessColumns(t.header), CTX);
  };

  it('accounts for every data row', () => {
    const p = plan();
    expect(p.drafts.length + p.skipped.length).toBe(5);
  });

  it('counts the skips by reason, so nothing is dropped silently', () => {
    expect(plan().bySkip).toEqual({ unknownType: 1, badTime: 1 });
    // and every reason has words a parent can act on
    for (const reason of Object.keys(plan().bySkip)) {
      expect(SKIP_REASON_LABEL[reason as keyof typeof SKIP_REASON_LABEL].length).toBeGreaterThan(8);
    }
  });

  it('says which kinds it left out, in the file’s own words', () => {
    expect(plan().skippedKinds).toEqual({ unknownType: ['walk'] });
  });

  /**
   * A ROW LISTED TWICE IS A COUNTED SKIP, the second copy, and not a draft dropped at write time,
   * where it used to be counted as "already in your log" on a file's very first import.
   */
  it('counts a row the file lists twice as a skip, keeping the first copy', () => {
    const t = parseDelimited(
      [
        'type,start,amount,unit',
        'bottle,2026-09-20T08:00:00Z,4,oz',
        'bottle,2026-09-20T08:00:00Z,4,oz',
        'bottle,2026-09-20T09:00:00Z,4,oz',
      ].join('\n'),
    );
    const p = readTable(t, guessColumns(t.header), CTX);
    expect(p.drafts.map(d => d.line)).toEqual([2, 4]);
    expect(p.skipped).toEqual([{ reason: 'repeated', line: 3 }]);
    expect(p.byType).toEqual({ bottle: 2 });
    expect(p.drafts.length + p.skipped.length).toBe(t.rows.length);
  });

  it('counts the drafts by type and reports the span, oldest first', () => {
    const p = plan();
    expect(p.byType).toEqual({ bottle: 2, sleep: 1 });
    expect(p.drafts.map(d => d.startMs)).toEqual([
      Date.parse('2026-09-19T08:00:00Z'),
      Date.parse('2026-09-20T08:00:00Z'),
      Date.parse('2026-09-20T10:00:00Z'),
    ]);
    expect(p.firstMs).toBe(Date.parse('2026-09-19T08:00:00Z'));
    expect(p.lastMs).toBe(Date.parse('2026-09-20T10:00:00Z'));
  });

  it('names the babies the file mentions, so a household with twins can be asked', () => {
    expect(plan().childNames).toEqual(['Ada']);
  });

  it('does not flag the unit assumption when the file named its units', () => {
    expect(plan().assumedUnit).toBe(false);
    const bare = parseDelimited('type,start,amount\nbottle,2026-09-20T08:00:00Z,4\n');
    expect(readTable(bare, guessColumns(bare.header), CTX).assumedUnit).toBe(true);
  });
});

describe('running the same import twice adds nothing the second time', () => {
  const draft = (over: Partial<ImportDraft>): ImportDraft => ({
    type: 'bottle',
    startMs: NOW - 86_400_000,
    endMs: null,
    quantity: 118,
    canonicalUnit: 'ml',
    detail: { consumed_ml: 118 },
    notes: null,
    childName: null,
    line: 2,
    ...over,
  });
  const heldAs = (d: ImportDraft, startMs = d.startMs): HeldEntry => ({ type: d.type, startMs });

  it('keys a row on what it is, not where it was in the file', () => {
    // the same feed, re-exported at a different line with a reworded note, is the same row
    expect(draftKey(draft({ line: 99, notes: 'edited later' }))).toBe(draftKey(draft({})));
    // two genuinely different feeds are two keys
    expect(draftKey(draft({ startMs: NOW }))).not.toBe(draftKey(draft({})));
    expect(draftKey(draft({ quantity: 90 }))).not.toBe(draftKey(draft({})));
    expect(draftKey(draft({ type: 'water' }))).not.toBe(draftKey(draft({})));
    // a breast-milk bottle and a formula bottle of one size in one minute are a mixed feed, two rows
    expect(draftKey(draft({ detail: { kind: 'FORMULA', consumed_ml: 118 } }))).not.toBe(
      draftKey(draft({ detail: { kind: 'EBM', consumed_ml: 118 } })),
    );
    // and the order a detail's fields were written in is not a difference
    expect(draftKey(draft({ detail: { consumed_ml: 118, kind: 'EBM' } }))).toBe(
      draftKey(draft({ detail: { kind: 'EBM', consumed_ml: 118 } })),
    );
  });

  it('drops what the household already has', () => {
    const mine = draft({});
    expect(newDrafts([mine], [heldAs(mine)])).toEqual([]);
    expect(newDrafts([mine], [])).toEqual([mine]);
  });

  it('drops a duplicate WITHIN one list, because importing both would invent a feed', () => {
    const twice = [draft({ line: 2 }), draft({ line: 3 })];
    expect(newDrafts(twice, [])).toHaveLength(1);
  });
});

/**
 * ALREADY THERE IS THE SAME KIND WITHIN A MINUTE (2026-09-28). A file gives the minute; an entry
 * typed here has the second Save was tapped. An exact key never matched the two, so a parent who
 * had logged the same week in both apps got every one of those feeds twice.
 */
describe('newDrafts — an entry already logged here is not added a second time', () => {
  const MIN = 60_000;
  const at = Date.parse('2026-08-10T07:40:00Z');
  const draft = (over: Partial<ImportDraft>): ImportDraft => ({
    type: 'bottle',
    startMs: at,
    endMs: null,
    quantity: 120,
    canonicalUnit: 'ml',
    detail: { kind: 'EBM', consumed_ml: 120 },
    notes: null,
    childName: null,
    line: 2,
    ...over,
  });

  it('matches an entry typed here in the same minute, whatever its seconds', () => {
    expect(newDrafts([draft({})], [{ type: 'bottle', startMs: at + 47_000 }])).toEqual([]);
  });

  it('matches the minute either side, because two taps can straddle a minute’s turn', () => {
    expect(newDrafts([draft({})], [{ type: 'bottle', startMs: at - MIN + 5_000 }])).toEqual([]);
    expect(newDrafts([draft({})], [{ type: 'bottle', startMs: at + MIN + 55_000 }])).toEqual([]);
  });

  it('keeps a row two minutes from anything held: that is another feed, not this one', () => {
    expect(newDrafts([draft({})], [{ type: 'bottle', startMs: at + 2 * MIN }])).toHaveLength(1);
    expect(
      newDrafts([draft({})], [{ type: 'bottle', startMs: at - 2 * MIN + 59_000 }]),
    ).toHaveLength(1);
  });

  it('matches the same KIND only: a diaper at 7:40 is not the bottle at 7:40', () => {
    expect(newDrafts([draft({})], [{ type: 'diaper', startMs: at }])).toHaveLength(1);
  });

  it('does not look at the amount: 90 ml here and 3 oz there are one feed', () => {
    expect(newDrafts([draft({ quantity: 89 })], [{ type: 'bottle', startMs: at }])).toEqual([]);
  });

  /** One held entry answers for one row, so a mixed feed logged as two keeps its second half. */
  it('lets one held entry answer for one row only', () => {
    const milk = draft({ line: 2 });
    const formula = draft({ line: 3, detail: { kind: 'FORMULA', consumed_ml: 120 } });
    expect(newDrafts([milk, formula], [{ type: 'bottle', startMs: at + 10_000 }])).toEqual([
      formula,
    ]);
    // …and two held entries answer for both
    expect(
      newDrafts(
        [milk, formula],
        [
          { type: 'bottle', startMs: at },
          { type: 'bottle', startMs: at },
        ],
      ),
    ).toEqual([]);
  });

  it('gives every row its own minute first, so a file run twice always finds its own entries', () => {
    // two rows a minute apart, both written by a first run
    const a = draft({ line: 2 });
    const b = draft({ line: 3, startMs: at + MIN, quantity: 60 });
    const written: HeldEntry[] = [
      { type: 'bottle', startMs: a.startMs },
      { type: 'bottle', startMs: b.startMs },
    ];
    expect(newDrafts([a, b], written)).toEqual([]);
    expect(newDrafts([b, a], [...written].reverse())).toEqual([]);
  });

  it('reads the household a little past the file’s span, so the minute either side is seen', () => {
    expect(HELD_SLACK_MS).toBeGreaterThanOrEqual(2 * MIN);
  });
});

describe('what this module may never be', () => {
  // every reader, the Huckleberry one included (2026-09-28)
  const sources = ['./index.ts', './huckleberry.ts'].map(file => ({
    file,
    src: readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8'),
  }));

  it('has no clock, no network and no randomness — a plan is a pure function of a file', () => {
    for (const { file, src } of sources) {
      for (const forbidden of ['Date.now', 'Math.random', 'fetch(', 'crypto.']) {
        expect(src, `${file} ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('interprets nothing: no word here describes a baby or a problem', () => {
    for (const { file, src } of sources) {
      for (const forbidden of ['normal', 'healthy', 'concern', 'recommend', 'should be']) {
        expect(src.toLowerCase(), `${file} ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('never computes a dose, in any reader', () => {
    for (const { file, src } of sources) {
      for (const forbidden of ['perKg', 'mgPerKg', 'dosePer', 'weightBased']) {
        expect(src, `${file} ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
