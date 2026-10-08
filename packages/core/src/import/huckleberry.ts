/**
 * A HUCKLEBERRY EXPORT, the importer's third reader (docs/IMPORT.md §2). It is the one named app
 * this importer reads, because it is the one it has a real export of: the owner's own, sent on
 * 2026-09-28. The header is the whole signature, so the file needs no mapping step and cannot be
 * mapped wrong, exactly like this app's own download.
 *
 * IT READS EXACTLY WHAT THE SAMPLE HOLDS, cell by cell, in the shapes that file has:
 *
 *   Type  Start Location  becomes       read from
 *   Feed  Bottle          a bottle      Start Condition the milk ("Breast Milk" or "Formula"),
 *                                       End Condition the amount (`<n>ml`, `<n>oz`, `<n.nn>oz`)
 *   Feed  Breast          a breastfeed  Start; End, or Duration (`HH:MM`), when there is one; the
 *                                       minutes on each side (`HH:MMR`, `HH:MML`), when there are;
 *                                       30 minutes long when the row has its Start and nothing else
 *   Pump  (empty)         a pump        Start Condition the amount (4 oz when it is 0 or empty); End
 *                                       or Duration when there is one
 *   Sleep (not read)      a sleep       Start, and End (or Duration)
 *
 * Every row's Notes come in as the entry's note. What does NOT come in, and the plan says so
 * before anything is written: Start Location beyond telling a bottle from a breast, a Condition
 * that is not a milk, an amount or a side (a sleep's, say), and Logged By, which names somebody in
 * the other app rather than anyone in this household.
 *
 * THE SIDES ARE READ FROM THEIR LETTER, AND THE COLUMNS SAY NOTHING ABOUT WHICH CAME FIRST. In the
 * sample, every breastfeed's Start Condition names the right side and every End Condition the
 * left, the one-sided feeds included: the right alone appears, the left alone never does. A file
 * that wrote the first side and then the last would have put the left first some of the time, so
 * the two columns are per side (right, then left), not first and last, and nothing in the file
 * says which side a feed began on. Each cell's minutes go to the side its LETTER names, which reads
 * this file right and would still read one that swapped the columns. `first_side` is written only
 * when one side has all the minutes, as the app's own form does it (`manualFirstSide`): a feed only
 * ever on the right began on the right. With both sides it stays empty rather than being guessed
 * from the column order.
 *
 * A BREASTFEED WITH ONLY ITS START IS 30 MINUTES LONG (`START_ONLY_FEED_MINUTES`; the owner,
 * 2026-09-28: "Breastfeed only records start time in huckleberry that we use. But default should
 * be 30 minutes."). Most of the sample's breastfeeds are that shape: a tap when the feed began,
 * and no End, no Duration and no side. Until then each came in as a moment with no minutes, so
 * Today, Reports and the visit sheet added nothing for a feed that happened. It is the one length
 * this reader supplies, so it is said on the plan before anything is written (`lengthAssumed`),
 * and it claims no side, so the Log reads it as its span, "30m", like any feed with no sides
 * (`recordedMs`). It never ends in the future: a feed begun less than half an hour before the
 * file is read ends at the moment it is read. Only this reader does it: a mapped file's
 * start-only breastfeed is from an app nobody has said anything about, and stays a moment.
 *
 * A PUMP AT 0, OR WITH NO AMOUNT, IS 4 OZ (`ASSUMED_PUMP_OZ`; the owner, 2026-09-28: "Pump written
 * as 0 does not necessarily mean 0. We used huckleberry only to record the time. We didnot put the
 * oz, but it's never 0. Assume 4 oz per pump in this case."). Huckleberry writes `0oz` for a
 * session saved without an amount, so a nought there is a blank, not a measurement, and a pump that
 * gave nothing is not something a parent logs. It is the second value this reader supplies, said on
 * the plan beside the first (`amountAssumed`), in the household's own unit. A bottle's zero is not
 * touched: nobody has said what a nought means there, and the sample has none.
 *
 * END FIRST, THEN DURATION. In the sample, End minus Start is the Duration to within a minute on
 * every row that has both: the export writes each time to the minute on its own. The clock times
 * are what the parent saw, and they are what a sleep timed here records too (a paused sleep is
 * saved from its start to its end), so End wins and Duration is used only where there is no End.
 *
 * EVERYTHING ELSE IS SKIPPED AND COUNTED, NEVER GUESSED INTO THE NEAREST MODULE:
 *   - any other Type (`notReadYet`). Huckleberry logs diapers, solids, growth, medicine, potty,
 *     temperature and more, and the sample has none of them, so how it writes one is not known
 *     here; each needs a sample file first (docs/IMPORT.md §2). A Feed at any other location is
 *     one of these too.
 *   - a cell in a shape the sample never had (`unreadable`): another milk, a bottle with a time it
 *     ended, a side that is not minutes and a letter, two cells naming one side, a Duration that is
 *     not hours and minutes, an End before its Start, and anything at all in a pump's Start
 *     Location or End Condition, which could be one side's amount and would make the Start
 *     Condition one side's rather than the whole session's.
 *   - a bottle with an empty amount (`needsAmount`; a zero with its unit is read as zero, `amountOf`
 *     says why), an amount that is not ml or oz (`badQuantity`), a sleep with no end
 *     (`needsEnd`: a sleep still going, which this app would show as asleep from then on), and the
 *     time checks every reader makes.
 *
 * TIMES ARE THE PHONE'S WALL CLOCK. The file gives no zone, so each time is read in the phone's
 * own zone by `parseWhen`, as every zoneless time this importer reads is.
 *
 * MEDICALLY INERT, like the rest of the importer: it copies rows and converts units.
 */
import { ML_PER_OZ } from '../domain/domain-types';
import {
  FUTURE_SLACK_MS,
  parseWhen,
  planFrom,
  type ImportDraft,
  type ImportPlan,
  type ReadRowContext,
  type RowOutcome,
  type SkipReason,
  type Table,
} from './index';

/**
 * How long a breastfeed with only its Start is taken to have lasted, in minutes (the header's
 * "A BREASTFEED WITH ONLY ITS START"). The plan's line reads it from here, so the words and the
 * entries cannot disagree.
 */
export const START_ONLY_FEED_MINUTES = 30;

/**
 * What a pump written as 0, or with no amount, is taken to have given, in ounces and in the
 * canonical ml it is stored as (the header's "A PUMP AT 0"). The plan's line shows the ml in the
 * household's unit, so an ounce household reads "4 oz" and a metric one the same amount in mL.
 */
export const ASSUMED_PUMP_OZ = 4;
export const ASSUMED_PUMP_ML = Math.round(ASSUMED_PUMP_OZ * ML_PER_OZ);

/** The header, exactly as the sample has it. */
export const HUCKLEBERRY_HEADER = [
  'Type',
  'Start',
  'End',
  'Duration',
  'Start Condition',
  'Start Location',
  'End Condition',
  'Notes',
  'Logged By',
] as const;

const COL = {
  type: 0,
  start: 1,
  end: 2,
  duration: 3,
  startCondition: 4,
  startLocation: 5,
  endCondition: 6,
  notes: 7,
} as const;

/**
 * Whether a header is a Huckleberry export's, EXACTLY: every name, in order, nothing more or less.
 * A UTF-8 BOM and CRLF line ends never reach here (`parseDelimited` takes both off, and trims the
 * names). A file with a column renamed or added is not this file: it goes through the column
 * mapping like any other, where the parent sees every guess.
 */
export function isHuckleberryExport(header: readonly string[]): boolean {
  return (
    header.length === HUCKLEBERRY_HEADER.length &&
    HUCKLEBERRY_HEADER.every((name, i) => header[i] === name)
  );
}

/** The whole file into a plan, through the same counting every reader's plan goes through. */
export function readHuckleberry(table: Table, ctx: ReadRowContext): ImportPlan {
  return planFrom(
    table.rows.map((cells, i) => readHuckleberryRow(cells, table.lines[i] ?? i + 2, ctx)),
    // every amount in this file names its own unit, so none is ever assumed
    { unitsNamed: true },
  );
}

type Kind = 'bottle' | 'breastfeed' | 'pump' | 'sleep';

/** The milk words the sample has on a bottle, and this app's kind for each. */
const MILK: ReadonlyMap<string, 'EBM' | 'FORMULA'> = new Map([
  ['breast milk', 'EBM'],
  ['formula', 'FORMULA'],
]);

export function readHuckleberryRow(
  cells: readonly string[],
  line: number,
  ctx: ReadRowContext,
): RowOutcome {
  const cell = (i: number): string => (cells[i] ?? '').trim();
  const skip = (reason: SkipReason): RowOutcome => ({ ok: false, reason, line });

  const type = cell(COL.type);
  if (type === '') return skip('noType');
  const location = cell(COL.startLocation);
  const kind = kindOf(type, location);
  if (kind === null) {
    // the word the plan lists, so a parent can see WHICH kinds stayed behind
    const word = type.toLowerCase() === 'feed' && location !== '' ? `${type} (${location})` : type;
    return { ok: false, reason: 'notReadYet', line, word };
  }

  const rawStart = cell(COL.start);
  if (rawStart === '') return skip('noTime');
  const startMs = parseWhen(rawStart);
  if (startMs === null) return skip('badTime');
  if (startMs > ctx.nowMs + FUTURE_SLACK_MS) return skip('future');

  const rawEnd = cell(COL.end);
  const rawDuration = cell(COL.duration);
  const minutes = rawDuration === '' ? null : hoursAndMinutes(rawDuration);
  if (rawDuration !== '' && minutes === null) return skip('unreadable');
  let endMs: number | null = null;
  if (rawEnd !== '') {
    endMs = parseWhen(rawEnd);
    if (endMs === null) return skip('badTime');
    // a negative length is a broken row, not a clue to which of the two is wrong
    if (endMs < startMs) return skip('unreadable');
  } else if (minutes !== null) {
    endMs = startMs + minutes * 60_000;
  }
  if (endMs !== null && endMs > ctx.nowMs + FUTURE_SLACK_MS) return skip('future');

  const notes = cell(COL.notes);
  const draft = (
    fields: Pick<
      ImportDraft,
      'type' | 'endMs' | 'quantity' | 'canonicalUnit' | 'detail' | 'lengthAssumed' | 'amountAssumed'
    >,
  ): RowOutcome => ({
    ok: true,
    draft: { ...fields, startMs, notes: notes === '' ? null : notes, childName: null, line },
  });

  switch (kind) {
    case 'bottle': {
      // every bottle in the sample is a moment, with no End and no Duration: one with either is a
      // shape this reader has never seen, so it is not read as if the time meant nothing
      if (rawEnd !== '' || rawDuration !== '') return skip('unreadable');
      const milk = MILK.get(cell(COL.startCondition).toLowerCase());
      if (milk === undefined) return skip('unreadable');
      const amount = amountOf(cell(COL.endCondition));
      if ('skip' in amount) return skip(amount.skip);
      return draft({
        type: 'bottle',
        endMs: null,
        quantity: amount.ml,
        canonicalUnit: 'ml',
        detail: { kind: milk, consumed_ml: amount.ml },
      });
    }
    case 'pump': {
      if (location !== '' || cell(COL.endCondition) !== '') return skip('unreadable');
      const amount = amountOf(cell(COL.startCondition));
      // no amount, or a nought, is Huckleberry's blank: 4 oz (the header says why). An amount in a
      // shape the sample never had is still skipped, never read as a blank.
      const blank = 'skip' in amount ? amount.skip === 'needsAmount' : amount.ml === 0;
      if ('skip' in amount && !blank) return skip(amount.skip);
      const ml = 'skip' in amount || blank ? ASSUMED_PUMP_ML : amount.ml;
      // one number and no sides: `sides` keeps the column's own default, BOTH, which claims no
      // side, as a "Total only" session saved here does (`storePumpSession`)
      return draft({
        type: 'pump',
        endMs,
        quantity: ml,
        canonicalUnit: 'ml',
        detail: { total_ml: ml },
        ...(blank ? { amountAssumed: true } : {}),
      });
    }
    case 'breastfeed': {
      const startCondition = cell(COL.startCondition);
      const endCondition = cell(COL.endCondition);
      const sides = sidesOf(startCondition, endCondition);
      if (sides === null) return skip('unreadable');
      // the minutes at the breast, both sides, which is what this app's own feeds carry as their
      // amount; a feed the file gave no minutes has none, rather than a false zero
      const atBreast = (sides.leftSeconds + sides.rightSeconds) / 60;
      // ONLY ITS START: no End, no Duration and no side (the header says why it is 30 minutes).
      // Ended at the moment of reading, at the latest, and never before it began.
      const startOnly = endMs === null && startCondition === '' && endCondition === '';
      return draft({
        type: 'breastfeed',
        endMs: startOnly
          ? Math.max(startMs, Math.min(startMs + START_ONLY_FEED_MINUTES * 60_000, ctx.nowMs))
          : endMs,
        quantity: atBreast > 0 ? atBreast : null,
        canonicalUnit: atBreast > 0 ? 'min' : null,
        detail: sides.detail,
        ...(startOnly ? { lengthAssumed: true } : {}),
      });
    }
    case 'sleep': {
      if (endMs === null) return skip('needsEnd');
      // nap or night is decided when it is written, by the household's own day window
      // (`withSleepKind` in the app), exactly as every other imported sleep is
      return draft({ type: 'sleep', endMs, quantity: null, canonicalUnit: null, detail: {} });
    }
  }
}

/** The kind a row's Type and Start Location make, or null for one this reader does not read. */
function kindOf(type: string, location: string): Kind | null {
  const t = type.toLowerCase();
  if (t === 'pump') return 'pump';
  if (t === 'sleep') return 'sleep';
  if (t !== 'feed') return null;
  const where = location.toLowerCase();
  if (where === 'bottle') return 'bottle';
  if (where === 'breast') return 'breastfeed';
  return null;
}

/**
 * AN AMOUNT, `<n>ml` or `<n>oz` with a point for decimals, in canonical ml (CLAUDE.md §6: an ounce
 * is `ML_PER_OZ`, converted here at the edge and rounded as every other reader rounds). An empty
 * cell is no amount; anything else is an amount this reader cannot read.
 *
 * A ZERO WITH ITS UNIT IS READ AS ZERO HERE, and the caller decides what it means. The mapped
 * reader drops a bare `0` (`readRow`), because a quantity column of noughts in a spreadsheet is as
 * often "nothing typed" as a count. For a pump, a Huckleberry `0oz` is exactly that, a session saved
 * with no amount (the owner, 2026-09-28), so the pump case reads it as a blank and supplies 4 oz. A
 * bottle's zero stays a zero: the detail table holds one (`consumed_ml >= 0`), and dropping the
 * row would lose it under a reason that is not true, "no amount in the file".
 */
function amountOf(raw: string): { ml: number } | { skip: SkipReason } {
  if (raw === '') return { skip: 'needsAmount' };
  const m = /^(\d+(?:\.\d+)?)\s*(ml|oz)$/i.exec(raw);
  if (m === null) return { skip: 'badQuantity' };
  const n = Number(m[1]);
  return { ml: Math.round((m[2] ?? '').toLowerCase() === 'oz' ? n * ML_PER_OZ : n) };
}

/** `HH:MM`, the one shape of Duration in the sample, in minutes; null for any other. */
function hoursAndMinutes(raw: string): number | null {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(raw);
  return m === null ? null : Number(m[1]) * 60 + Number(m[2]);
}

/**
 * THE SECONDS ON EACH SIDE, from the two Condition cells (see the header for why by letter), and
 * the detail row they make; null when a cell is in another shape or both cells name one side.
 */
function sidesOf(
  startCondition: string,
  endCondition: string,
): { leftSeconds: number; rightSeconds: number; detail: Record<string, unknown> } | null {
  const given = [startCondition, endCondition].filter(c => c !== '');
  // no sides at all: the detail row's own defaults, no side and no seconds, and nothing claimed
  if (given.length === 0) return { leftSeconds: 0, rightSeconds: 0, detail: {} };
  let left: number | null = null;
  let right: number | null = null;
  for (const c of given) {
    const m = /^(\d{1,2}):([0-5]\d)\s*([LR])$/i.exec(c);
    if (m === null) return null;
    const seconds = (Number(m[1]) * 60 + Number(m[2])) * 60;
    if ((m[3] ?? '').toUpperCase() === 'L') {
      if (left !== null) return null;
      left = seconds;
    } else {
      if (right !== null) return null;
      right = seconds;
    }
  }
  const leftSeconds = left ?? 0;
  const rightSeconds = right ?? 0;
  const first =
    leftSeconds > 0 && rightSeconds === 0
      ? 'LEFT'
      : rightSeconds > 0 && leftSeconds === 0
        ? 'RIGHT'
        : null;
  return {
    leftSeconds,
    rightSeconds,
    detail: {
      ...(first === null ? {} : { first_side: first }),
      left_seconds: leftSeconds,
      right_seconds: rightSeconds,
    },
  };
}
