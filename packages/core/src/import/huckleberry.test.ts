/**
 * A HUCKLEBERRY EXPORT (`huckleberry.ts`, 2026-09-28).
 *
 * THE FIXTURE IS SYNTHETIC. The reader was built from the owner's real export, which is their
 * baby's log and stays out of this repository: the file below has its header, its quoting (a filled
 * cell in quotes, an empty one bare, no newline at the end) and the shape of every value it holds,
 * with times, amounts and notes made up for this test.
 */
import { describe, expect, it } from 'vitest';
import {
  guessColumns,
  HUCKLEBERRY_HEADER,
  isHuckleberryExport,
  ML_PER_OZ,
  newDrafts,
  ownExportMap,
  parseDelimited,
  readHuckleberry,
  readHuckleberryRow,
  ASSUMED_PUMP_ML,
  ASSUMED_PUMP_OZ,
  SKIP_REASON_LABEL,
  START_ONLY_FEED_MINUTES,
  type ImportDraft,
  type ReadRowContext,
} from '../index';

const NOW = Date.parse('2026-09-01T12:00:00Z');
const CTX: ReadRowContext = { nowMs: NOW, assumeVolumeUnit: 'ml' };

/** A time as the file writes it, read the way the reader reads it: the phone's own wall clock. */
const wall = (s: string): number => Date.parse(`${s.replace(' ', 'T')}:00`);

const HEADER = HUCKLEBERRY_HEADER.map(h => `"${h}"`).join(',');
const ROWS = [
  '"Feed","2026-08-14 06:40",,,"Breast Milk","Bottle","6oz",,',
  '"Feed","2026-08-14 09:15",,,"Formula","Bottle","95ml","took it slowly",',
  '"Feed","2026-08-14 11:50",,,"Breast Milk","Bottle","2.75oz",,',
  '"Feed","2026-08-14 12:05",,,"Formula","Bottle","1.5oz",,',
  '"Feed","2026-08-14 14:20","2026-08-14 14:48","00:28","00:16R","Breast","00:12L",,',
  '"Feed","2026-08-14 17:30","2026-08-14 17:41","00:11","00:11R","Breast",,,',
  '"Feed","2026-08-14 19:55",,,,"Breast",,"a short one before bed",',
  '"Pump","2026-08-14 07:10",,,"5oz",,,,',
  '"Pump","2026-08-14 13:00","2026-08-14 13:25","00:25","85ml",,,,',
  '"Pump","2026-08-14 21:30",,,"8ml",,,,',
  '"Sleep","2026-08-14 10:30","2026-08-14 11:45","01:15",,,,,',
  // across midnight, and a minute longer by its clock times than by its Duration, as the export
  // writes each time to the minute on its own
  '"Sleep","2026-08-14 20:10","2026-08-15 05:50","09:39",,,,,',
  '"Diaper","2026-08-14 08:00",,,,,,,',
  '"Solids","2026-08-14 12:30",,,,,,,',
  // the first row again, as a file with a row logged twice has it
  '"Feed","2026-08-14 06:40",,,"Breast Milk","Bottle","6oz",,',
];
const FILE = [HEADER, ...ROWS].join('\n');

const plan = (text: string = FILE) => readHuckleberry(parseDelimited(text), CTX);
const row = (...cells: string[]) => readHuckleberryRow(cells, 9, CTX);
/** A row with only the cells named; the rest empty, as the export writes them. */
const cells = (over: Partial<Record<(typeof HUCKLEBERRY_HEADER)[number], string>>): string[] =>
  HUCKLEBERRY_HEADER.map(h => over[h] ?? '');
const draftOf = (text: string, start: string, type?: string): ImportDraft | undefined =>
  plan(text).drafts.find(d => d.startMs === wall(start) && (type === undefined || d.type === type));

describe('a Huckleberry export is recognized by its header, exactly', () => {
  it('is its header, and needs no mapping step', () => {
    const table = parseDelimited(FILE);
    expect(isHuckleberryExport(table.header)).toBe(true);
    // not mistaken for this app's own download, and never sent through the guessing path
    expect(ownExportMap(table.header)).toBeNull();
  });

  it('survives a UTF-8 BOM and CRLF line ends, and reads to the same plan', () => {
    // built from its code, so this file holds no invisible character a linter would refuse
    const bom = String.fromCharCode(0xfeff);
    const excel = `${bom}${[HEADER, ...ROWS].join('\r\n')}\r\n`;
    expect(isHuckleberryExport(parseDelimited(excel).header)).toBe(true);
    expect(plan(excel)).toEqual(plan());
  });

  it('is not a file with a column renamed, added, missing or moved', () => {
    const names = [...HUCKLEBERRY_HEADER];
    expect(isHuckleberryExport(names.map(n => (n === 'Notes' ? 'Note' : n)))).toBe(false);
    expect(isHuckleberryExport([...names, 'Child'])).toBe(false);
    expect(isHuckleberryExport(names.slice(0, -1))).toBe(false);
    expect(isHuckleberryExport([names[1] ?? '', names[0] ?? '', ...names.slice(2)])).toBe(false);
    // a generic tracker's header with some of the same words is not it either
    expect(isHuckleberryExport(['Type', 'Start', 'End', 'Notes'])).toBe(false);
    // and the mapping path still guesses such a file, as before
    expect(guessColumns(['Type', 'Start', 'End', 'Notes'])).toEqual([
      'type',
      'startAt',
      'endAt',
      'notes',
    ]);
  });
});

describe('every row lands in one bucket, and both are counted', () => {
  it('counts the drafts per kind and the skips per reason, and misses no row', () => {
    const p = plan();
    expect(p.byType).toEqual({ bottle: 4, breastfeed: 3, pump: 3, sleep: 2 });
    expect(p.bySkip).toEqual({ notReadYet: 2, repeated: 1 });
    expect(p.drafts.length + p.skipped.length).toBe(ROWS.length);
    // the kinds left out, in the file's own words, so a parent knows what stayed behind
    expect(p.skippedKinds).toEqual({ notReadYet: ['Diaper', 'Solids'] });
    // every amount names its unit, so nothing was assumed
    expect(p.assumedUnit).toBe(false);
    // the file names no baby: every row is the one the parent picked
    expect(p.childNames).toEqual([]);
  });

  it('keeps the first copy of a row the file lists twice and counts the second', () => {
    const p = plan();
    expect(p.skipped.find(s => s.reason === 'repeated')).toEqual({
      reason: 'repeated',
      line: ROWS.length + 1,
    });
    expect(p.drafts.filter(d => d.startMs === wall('2026-08-14 06:40'))).toHaveLength(1);
  });

  it('spans the file oldest first', () => {
    const p = plan();
    expect(p.firstMs).toBe(wall('2026-08-14 06:40'));
    expect(p.lastMs).toBe(wall('2026-08-14 21:30'));
    const starts = p.drafts.map(d => d.startMs);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('gives each skip reason words a parent can act on', () => {
    for (const reason of ['notReadYet', 'unreadable', 'needsEnd', 'repeated'] as const) {
      expect(SKIP_REASON_LABEL[reason]).not.toMatch(/[A-Z]{2,}|_|—/);
      expect(SKIP_REASON_LABEL[reason].length).toBeGreaterThan(8);
    }
    // a Huckleberry diaper is a diaper here too: the label never says this app lacks one
    expect(SKIP_REASON_LABEL.notReadYet).not.toContain('does not have');
  });
});

describe('a bottle', () => {
  it('takes its milk from Start Condition and its amount from End Condition, in canonical ml', () => {
    expect(draftOf(FILE, '2026-08-14 06:40')).toMatchObject({
      type: 'bottle',
      endMs: null,
      quantity: Math.round(6 * ML_PER_OZ),
      canonicalUnit: 'ml',
      detail: { kind: 'EBM', consumed_ml: Math.round(6 * ML_PER_OZ) },
      notes: null,
    });
    expect(draftOf(FILE, '2026-08-14 09:15')).toMatchObject({
      quantity: 95,
      detail: { kind: 'FORMULA', consumed_ml: 95 },
      // the note comes in as the entry's note
      notes: 'took it slowly',
    });
  });

  it('reads both units and a decimal ounce, converted at the edge', () => {
    expect(draftOf(FILE, '2026-08-14 11:50')?.quantity).toBe(Math.round(2.75 * ML_PER_OZ));
    expect(draftOf(FILE, '2026-08-14 12:05')?.quantity).toBe(Math.round(1.5 * ML_PER_OZ));
    // 6 oz is 177 ml, exactly as the bottle sheet stores it (`ozToMl`)
    expect(draftOf(FILE, '2026-08-14 06:40')?.quantity).toBe(177);
  });

  it('is skipped, never guessed, when its milk or its amount cannot be read', () => {
    const bottle = (over: Record<string, string>) =>
      readHuckleberryRow(
        cells({
          Type: 'Feed',
          Start: '2026-08-14 06:40',
          'Start Location': 'Bottle',
          'Start Condition': 'Formula',
          'End Condition': '2oz',
          ...over,
        }),
        9,
        CTX,
      );
    expect(bottle({}).ok).toBe(true);
    // a milk the sample never had, or none at all: the database would default it to breast milk
    expect(bottle({ 'Start Condition': 'Cow Milk' })).toMatchObject({ reason: 'unreadable' });
    expect(bottle({ 'Start Condition': '' })).toMatchObject({ reason: 'unreadable' });
    expect(bottle({ 'End Condition': '' })).toMatchObject({ reason: 'needsAmount' });
    expect(bottle({ 'End Condition': '3 cups' })).toMatchObject({ reason: 'badQuantity' });
    // a zero with its unit is the other app saying zero, not an amount missing from the file
    const nothing = bottle({ 'End Condition': '0oz' });
    expect(nothing.ok && nothing.draft.detail).toEqual({ kind: 'FORMULA', consumed_ml: 0 });
    // a bottle with a time it ended is a shape the sample never had
    expect(bottle({ End: '2026-08-14 07:00' })).toMatchObject({ reason: 'unreadable' });
    expect(bottle({ Duration: '00:20' })).toMatchObject({ reason: 'unreadable' });
  });
});

describe('a breastfeed', () => {
  it('reads the minutes on each side, and says nothing of which came first when both have some', () => {
    expect(draftOf(FILE, '2026-08-14 14:20')).toMatchObject({
      type: 'breastfeed',
      endMs: wall('2026-08-14 14:48'),
      quantity: 28,
      canonicalUnit: 'min',
      detail: { left_seconds: 12 * 60, right_seconds: 16 * 60 },
    });
    expect(draftOf(FILE, '2026-08-14 14:20')?.detail).not.toHaveProperty('first_side');
  });

  it('reads a one-sided feed as begun on its one side, as the feed form does', () => {
    expect(draftOf(FILE, '2026-08-14 17:30')?.detail).toEqual({
      first_side: 'RIGHT',
      left_seconds: 0,
      right_seconds: 11 * 60,
    });
    const leftOnly = row(
      ...cells({
        Type: 'Feed',
        Start: '2026-08-14 17:30',
        End: '2026-08-14 17:39',
        Duration: '00:09',
        'Start Location': 'Breast',
        'End Condition': '00:09L',
      }),
    );
    expect(leftOnly.ok && leftOnly.draft.detail).toEqual({
      first_side: 'LEFT',
      left_seconds: 9 * 60,
      right_seconds: 0,
    });
  });

  it('puts each side’s minutes on the side its LETTER names, whichever column holds it', () => {
    const swapped = row(
      ...cells({
        Type: 'Feed',
        Start: '2026-08-14 14:20',
        'Start Location': 'Breast',
        'Start Condition': '00:10L',
        'End Condition': '00:05R',
      }),
    );
    expect(swapped.ok && swapped.draft.detail).toEqual({ left_seconds: 600, right_seconds: 300 });
  });

  /*
    ONLY ITS START (the owner, 2026-09-28: "Breastfeed only records start time in huckleberry that
    we use. But default should be 30 minutes."). It lasts 30 minutes from the time the file gives,
    claims no side and no minutes at the breast, so it reads as its span, and says it was given a
    length so the plan can tell the parent before anything is written.
  */
  it('brings a feed with only its start in as 30 minutes from that start, with no side', () => {
    expect(START_ONLY_FEED_MINUTES).toBe(30);
    expect(draftOf(FILE, '2026-08-14 19:55')).toMatchObject({
      type: 'breastfeed',
      startMs: wall('2026-08-14 19:55'),
      endMs: wall('2026-08-14 20:25'),
      quantity: null,
      canonicalUnit: null,
      detail: {},
      notes: 'a short one before bed',
      lengthAssumed: true,
    });
    // the only one in the file: every other feed's length is the file's own
    expect(plan().drafts.filter(d => d.lengthAssumed === true)).toHaveLength(1);
  });

  it('never ends a start-only feed after the moment the file is read', () => {
    const start = cells({ Type: 'Feed', Start: '2026-08-14 19:55', 'Start Location': 'Breast' });
    const tenMinutesOn = readHuckleberryRow(start, 9, { ...CTX, nowMs: wall('2026-08-14 20:05') });
    expect(tenMinutesOn.ok && tenMinutesOn.draft.endMs).toBe(wall('2026-08-14 20:05'));
    // a start inside the future slack is kept, and ends where it begins rather than before
    const justAhead = readHuckleberryRow(start, 9, { ...CTX, nowMs: wall('2026-08-14 19:54') });
    expect(justAhead.ok && justAhead.draft.endMs).toBe(wall('2026-08-14 19:55'));
  });

  it('gives no length to a feed the file gave one, or gave its sides', () => {
    // End and both sides
    expect(draftOf(FILE, '2026-08-14 14:20')).not.toHaveProperty('lengthAssumed');
    // End and one side
    expect(draftOf(FILE, '2026-08-14 17:30')).not.toHaveProperty('lengthAssumed');
    // Duration only
    const timed = row(
      ...cells({
        Type: 'Feed',
        Start: '2026-08-14 14:20',
        Duration: '00:12',
        'Start Location': 'Breast',
      }),
    );
    expect(timed.ok && timed.draft).toMatchObject({ endMs: wall('2026-08-14 14:32') });
    expect(timed.ok && timed.draft).not.toHaveProperty('lengthAssumed');
    // sides and no end: the minutes at the breast are the file's, and no end is made up for them
    const sided = row(
      ...cells({
        Type: 'Feed',
        Start: '2026-08-14 14:20',
        'Start Location': 'Breast',
        'Start Condition': '00:10R',
      }),
    );
    expect(sided.ok && sided.draft).toMatchObject({ endMs: null, quantity: 10 });
    expect(sided.ok && sided.draft).not.toHaveProperty('lengthAssumed');
  });

  it('takes the end from Duration when there is no End', () => {
    const timed = row(
      ...cells({
        Type: 'Feed',
        Start: '2026-08-14 14:20',
        Duration: '00:25',
        'Start Location': 'Breast',
        'Start Condition': '00:25R',
      }),
    );
    expect(timed.ok && timed.draft.endMs).toBe(wall('2026-08-14 14:45'));
  });

  it('is skipped when a side is in another shape, or both cells name one side', () => {
    const feed = (a: string, b: string) =>
      row(
        ...cells({
          Type: 'Feed',
          Start: '2026-08-14 14:20',
          'Start Location': 'Breast',
          'Start Condition': a,
          'End Condition': b,
        }),
      );
    expect(feed('15 min', '')).toMatchObject({ reason: 'unreadable' });
    expect(feed('00:14', '')).toMatchObject({ reason: 'unreadable' });
    expect(feed('00:14R', '00:09R')).toMatchObject({ reason: 'unreadable' });
    expect(feed('00:14X', '')).toMatchObject({ reason: 'unreadable' });
  });
});

describe('a pump', () => {
  it('takes its amount from Start Condition, and its end when there is one', () => {
    expect(draftOf(FILE, '2026-08-14 07:10')).toMatchObject({
      type: 'pump',
      endMs: null,
      quantity: Math.round(5 * ML_PER_OZ),
      canonicalUnit: 'ml',
      detail: { total_ml: Math.round(5 * ML_PER_OZ) },
    });
    expect(draftOf(FILE, '2026-08-14 13:00')).toMatchObject({
      endMs: wall('2026-08-14 13:25'),
      quantity: 85,
      detail: { total_ml: 85 },
    });
    expect(draftOf(FILE, '2026-08-14 21:30')?.quantity).toBe(8);
  });

  /**
   * ANYTHING IN A PUMP'S OTHER CELLS COULD BE A SIDE'S AMOUNT, which would make Start Condition one
   * side's rather than the session's. Reading it as the total would be a guess, so it is skipped.
   */
  it('is skipped when Start Location or End Condition holds anything', () => {
    const pump = (over: Record<string, string>) =>
      readHuckleberryRow(
        cells({ Type: 'Pump', Start: '2026-08-14 07:10', 'Start Condition': '2oz', ...over }),
        9,
        CTX,
      );
    expect(pump({}).ok).toBe(true);
    expect(pump({ 'Start Location': 'Left' })).toMatchObject({ reason: 'unreadable' });
    expect(pump({ 'End Condition': '1oz' })).toMatchObject({ reason: 'unreadable' });
    // an amount in a shape the sample never had is still skipped, never taken for a blank
    expect(pump({ 'Start Condition': '2 cups' })).toMatchObject({ reason: 'badQuantity' });
  });

  /*
    A PUMP AT 0, OR WITH NO AMOUNT, IS 4 OZ (the owner, 2026-09-28: "Pump written as 0 does not
    necessarily mean 0. We used huckleberry only to record the time. We didnot put the oz, but
    it's never 0. Assume 4 oz per pump in this case.").
  */
  it('reads a pump written as 0, or with no amount, as 4 oz, and says so', () => {
    expect(ASSUMED_PUMP_OZ).toBe(4);
    expect(ASSUMED_PUMP_ML).toBe(Math.round(4 * ML_PER_OZ));
    for (const blank of ['0oz', '0ml', '0.0oz', '']) {
      const out = readHuckleberryRow(
        cells({ Type: 'Pump', Start: '2026-08-14 07:10', 'Start Condition': blank }),
        9,
        CTX,
      );
      expect(out.ok && out.draft, blank).toMatchObject({
        type: 'pump',
        quantity: ASSUMED_PUMP_ML,
        canonicalUnit: 'ml',
        detail: { total_ml: ASSUMED_PUMP_ML },
        amountAssumed: true,
      });
    }
    // a pump with an amount keeps its own, and is not flagged
    expect(draftOf(FILE, '2026-08-14 21:30')).not.toHaveProperty('amountAssumed');
    expect(plan().drafts.filter(d => d.amountAssumed === true)).toHaveLength(0);
  });
});

describe('a sleep', () => {
  it('keeps its start and end, across midnight too, and leaves nap or night to the household', () => {
    expect(draftOf(FILE, '2026-08-14 10:30', 'sleep')).toMatchObject({
      endMs: wall('2026-08-14 11:45'),
      quantity: null,
      detail: {},
    });
    const night = draftOf(FILE, '2026-08-14 20:10', 'sleep');
    // End wins over Duration: the clock times are what the parent saw
    expect(night?.endMs).toBe(wall('2026-08-15 05:50'));
    expect(night?.detail).toEqual({});
  });

  it('is skipped with no end at all, because it would read as a sleep still going', () => {
    expect(row(...cells({ Type: 'Sleep', Start: '2026-08-14 10:30' }))).toMatchObject({
      reason: 'needsEnd',
    });
    const byLength = row(...cells({ Type: 'Sleep', Start: '2026-08-14 10:30', Duration: '00:45' }));
    expect(byLength.ok && byLength.draft.endMs).toBe(wall('2026-08-14 11:15'));
  });

  it('carries no condition, location or name: those are not needed and not kept', () => {
    const out = row(
      ...cells({
        Type: 'Sleep',
        Start: '2026-08-14 10:30',
        End: '2026-08-14 11:05',
        Duration: '00:35',
        'Start Condition': 'Calm',
        'Start Location': 'Crib',
        'End Condition': 'Woke up',
        'Logged By': 'Sam',
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const kept = JSON.stringify(out.draft);
    for (const dropped of ['Calm', 'Crib', 'Woke up', 'Sam']) expect(kept).not.toContain(dropped);
  });
});

describe('what is never guessed', () => {
  it('skips a Type it has no sample of, and names it', () => {
    expect(row(...cells({ Type: 'Potty', Start: '2026-08-14 08:00' }))).toEqual({
      ok: false,
      reason: 'notReadYet',
      line: 9,
      word: 'Potty',
    });
    // a Feed somewhere other than a bottle or a breast is one of those too
    expect(
      row(...cells({ Type: 'Feed', Start: '2026-08-14 08:00', 'Start Location': 'Solids' })),
    ).toMatchObject({ reason: 'notReadYet', word: 'Feed (Solids)' });
  });

  it('checks the times every reader checks', () => {
    const at = (Start: string, extra: Record<string, string> = {}) =>
      row(...cells({ Type: 'Sleep', Start, End: '2026-08-14 11:00', ...extra }));
    expect(row(...cells({ Start: '2026-08-14 08:00' }))).toMatchObject({ reason: 'noType' });
    expect(at('')).toMatchObject({ reason: 'noTime' });
    expect(at('yesterday')).toMatchObject({ reason: 'badTime' });
    expect(at('2026-08-14 10:30', { End: 'later' })).toMatchObject({ reason: 'badTime' });
    // an end before its start is a broken row, not a clue
    expect(at('2026-08-14 12:30')).toMatchObject({ reason: 'unreadable' });
    expect(at('2026-08-14 10:30', { End: '', Duration: '30 min' })).toMatchObject({
      reason: 'unreadable',
    });
    expect(
      row(...cells({ Type: 'Pump', Start: '2026-09-02 08:00', 'Start Condition': '2oz' })),
    ).toMatchObject({ reason: 'future' });
  });
});

describe('importing the same export twice, or over entries already logged here', () => {
  /** What the app writes for a draft, as the household's own entries read back (type, start). */
  const written = (drafts: readonly ImportDraft[]) =>
    drafts.map(d => ({ type: d.type, startMs: d.startMs }));

  it('adds nothing the second time', () => {
    const first = plan();
    expect(newDrafts(first.drafts, [])).toHaveLength(first.drafts.length);
    expect(newDrafts(plan().drafts, written(first.drafts))).toEqual([]);
  });

  it('does not double what was logged here in the same minute, with its seconds', () => {
    const p = plan();
    const loggedHere = [
      { type: 'bottle', startMs: wall('2026-08-14 06:40') + 32_000 },
      { type: 'sleep', startMs: wall('2026-08-14 20:10') + 50_000 },
      // a pump saved here a minute after the other app's, as two taps a moment apart can be
      { type: 'pump', startMs: wall('2026-08-14 07:11') + 5_000 },
    ];
    const added = newDrafts(p.drafts, loggedHere);
    expect(added).toHaveLength(p.drafts.length - 3);
    expect(added.map(d => d.startMs)).not.toContain(wall('2026-08-14 06:40'));
    expect(added.map(d => d.startMs)).not.toContain(wall('2026-08-14 20:10'));
    expect(added.map(d => d.startMs)).not.toContain(wall('2026-08-14 07:10'));
  });
});
