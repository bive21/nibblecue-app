/**
 * BRINGING A HISTORY IN FROM ANOTHER APP (`assets/entitlements.ts` → `importData`: *"A switching
 * cost we are paid to remove"*). Pure: a file's text in, a PLAN out. Nothing here writes.
 *
 * THE PLAN IS THE POINT. Import is the one feature that ADDS rows a parent did not type, and this
 * app's first rule is that a log is never lost — which cuts both ways: it must never be silently
 * added to either. So every row of the file lands in exactly one of two buckets, a draft or a
 * skip-with-a-reason, both counted, and the screen shows the count before anything is written.
 * An import that quietly dropped a quarter of a file would be worse than one that refused it.
 *
 * NOTHING IS EVER GUESSED INTO THE NEAREST MODULE. A row whose type this app does not have is
 * SKIPPED and counted as unknown, never rounded to something close: a "walk" row becoming a
 * tummy-time entry is an invented fact about somebody's baby, and no summary a parent reads
 * afterwards could undo it.
 *
 * THREE READERS, and each is honest about what it is:
 *
 *   1. **This app's own CSV** (`ACTIVITY_CSV_HEADER`), recognized by its header and mapped with no
 *      questions asked — the case that is provably right, and the one a parent moving phones or
 *      restoring a download actually has.
 *   2. **A Huckleberry export** (`huckleberry.ts`), recognized by its exact header and mapped with
 *      no questions asked either. It is the one named app this importer reads, because it is the
 *      one it has a real export of (the owner's own, 2026-09-28), and it reads exactly the shapes
 *      that file holds: any other kind of row in a Huckleberry file is skipped and counted.
 *   3. **Any other delimited file**, through a COLUMN MAPPING the parent confirms. Every tracker
 *      exports a CSV and no two agree on a single column name, so the honest shape is to read the
 *      header, guess what it can, and show the guess. Claiming to support another named app's
 *      export without a sample file in hand would be inventing a fact (CLAUDE.md §6).
 *
 * ALREADY THERE IS THE SAME KIND WITHIN A MINUTE (`newDrafts`). Running a file twice adds nothing
 * the second time, and an entry the parent also logged here, at the time the file gives it, is not
 * added a second time either.
 *
 * MEDICALLY INERT. It copies rows and converts units. It interprets nothing, and a medicine row
 * carries the amount the FILE says, exactly as a typed one carries what the parent typed
 * (CLAUDE.md §2 rule 4).
 */
import type { ZodTypeAny } from 'zod';
import {
  ActivityType,
  BottleDetail,
  BreastfeedDetail,
  DiaperDetail,
  MeasurementDetail,
  MedDetail,
  PumpDetail,
  SleepDetail,
  SolidsDetail,
} from '../domain/domain-types';
import { ML_PER_OZ } from '../domain/domain-types';

/* ------------------------------------------------------------------ the file */

export interface Table {
  header: string[];
  /** One entry per data row, each padded or truncated to the header's width. */
  rows: string[][];
  /** The 1-based line each row came from, for a skip message a person can act on. */
  lines: number[];
}

/**
 * RFC 4180 enough for the files that exist: quoted fields, doubled quotes inside them, embedded
 * newlines and commas, CRLF or LF, and a UTF-8 BOM that Excel writes and nobody asks for.
 *
 * THE DELIMITER IS SNIFFED, not asked for. A tab-separated file is what a spreadsheet hands you
 * when the locale uses a comma for decimals, and a parent should not have to know that.
 */
export function parseDelimited(text: string): Table {
  const clean = text.replace(/^\uFEFF/, '');
  const delimiter = sniffDelimiter(clean);
  const rows: string[][] = [];
  const lines: number[] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    // a row of nothing but empty strings is a blank line, not a record
    if (row.some(c => c.trim() !== '')) {
      rows.push(row);
      lines.push(rowLine);
    }
    row = [];
    rowLine = line;
  };
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i] as string;
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else {
        if (c === '\n') line += 1;
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
    } else if (c === delimiter) {
      endField();
    } else if (c === '\r') {
      // swallowed; the \n that follows ends the row
    } else if (c === '\n') {
      line += 1;
      endRow();
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  const header = (rows.shift() ?? []).map(h => h.trim());
  lines.shift();
  const width = header.length;
  return {
    header,
    rows: rows.map(r =>
      r.length === width ? r : [...r, ...Array(width).fill('')].slice(0, width),
    ),
    lines,
  };
}

/** Whichever of tab, semicolon or comma appears most on the first line. Comma breaks the tie. */
function sniffDelimiter(text: string): string {
  const first = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  const count = (ch: string) => first.split(ch).length - 1;
  const tabs = count('\t');
  const semis = count(';');
  const commas = count(',');
  if (tabs > commas && tabs >= semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

/* ------------------------------------------------------------------ the mapping */

/**
 * What a column can supply. Deliberately SHORT: the fields every tracker has, and nothing whose
 * absence would make a row a guess. A detail (a diaper's kind, a breastfeed's side) is not here —
 * those live in `notes` when a file carries them, because a wrong detail is a wrong fact and a
 * note is a quote.
 */
export const IMPORT_FIELDS = [
  'type',
  'startAt',
  'endAt',
  'durationMinutes',
  'quantity',
  'unit',
  'detailText',
  'notes',
  'childName',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** One entry per header column; `null` means "ignore this column". */
export type ColumnMap = (ImportField | null)[];

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  type: 'What it was',
  startAt: 'When it started',
  endAt: 'When it ended',
  durationMinutes: 'How long, in minutes',
  quantity: 'How much',
  unit: 'The unit of "how much"',
  detailText: 'Which kind, or which medicine',
  notes: 'Note',
  childName: "The baby's name",
};

/** Header names that have meant each field in a file somebody actually had. */
const SYNONYMS: Record<ImportField, readonly string[]> = {
  type: ['type', 'activity', 'event', 'kind', 'category', 'what'],
  startAt: [
    'start_at',
    'start',
    'start time',
    'starttime',
    'time',
    'date',
    'datetime',
    'when',
    'begin',
  ],
  endAt: ['end_at', 'end', 'end time', 'endtime', 'finish', 'stop'],
  durationMinutes: ['duration_minutes', 'duration', 'minutes', 'length', 'mins'],
  quantity: ['quantity_canonical', 'quantity', 'amount', 'volume', 'value', 'qty'],
  unit: ['canonical_unit', 'unit', 'units', 'measure'],
  detailText: [
    'detail',
    'kind',
    'sub type',
    'subtype',
    'variant',
    'which',
    'medicine',
    'diaper type',
  ],
  notes: ['notes', 'note', 'comment', 'comments', 'description'],
  childName: ['child_name', 'child', 'baby', 'name', 'baby name'],
};

const norm = (s: string): string => s.trim().toLowerCase().replace(/[_-]+/g, ' ');

/**
 * A first guess at what each column is, from its name alone. It is a GUESS and the screen says so:
 * the parent confirms or changes every field before a single row is read.
 *
 * FIRST MATCH WINS, PER FIELD. A file with both `start` and `time` should not have two columns
 * claiming to be the start, and the earlier column is the likelier one in every export format
 * anybody has.
 */
export function guessColumns(header: readonly string[]): ColumnMap {
  const taken = new Set<ImportField>();
  return header.map(h => {
    const n = norm(h);
    for (const field of IMPORT_FIELDS) {
      if (taken.has(field)) continue;
      if (SYNONYMS[field].some(s => norm(s) === n)) {
        taken.add(field);
        return field;
      }
    }
    return null;
  });
}

/**
 * THIS APP'S OWN EXPORT, recognized exactly — the header is the whole signature, so a file it
 * wrote needs no mapping step and cannot be mapped wrong. `null` for anything else.
 *
 * `quantity_canonical` and `canonical_unit` are taken rather than the display pair, because a
 * canonical number is exact and a displayed one has already been rounded for a human to read.
 */
export function ownExportMap(header: readonly string[]): ColumnMap | null {
  const map: ColumnMap = header.map(h => {
    switch (norm(h)) {
      case 'type':
        return 'type';
      case 'start at':
        return 'startAt';
      case 'end at':
        return 'endAt';
      case 'quantity canonical':
        return 'quantity';
      case 'canonical unit':
        return 'unit';
      case 'notes':
        return 'notes';
      case 'child name':
        return 'childName';
      /* THE STORED DETAIL ROW, as `activityCsv` writes it — the only place this app's own file
         says a diaper's kind, a medicine's name or which side a feed was on. It was left unmapped
         until 2026-09-24, and restoring a download then skipped every diaper and every medicine
         as unstorable (`ownDetail` below says how it is read). */
      case 'detail':
        return 'detailText';
      default:
        return null;
    }
  });
  const needed: ImportField[] = ['type', 'startAt', 'quantity', 'unit'];
  return needed.every(f => map.includes(f)) ? map : null;
}

/* ------------------------------------------------------------------ one row */

export type SkipReason =
  | 'noType'
  | 'unknownType'
  | 'notReadYet'
  | 'noTime'
  | 'badTime'
  | 'future'
  | 'badQuantity'
  | 'needsAmount'
  | 'needsKind'
  | 'needsName'
  | 'needsEnd'
  | 'unreadable'
  | 'repeated'
  | 'otherChild';

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  noType: 'no activity in the row',
  unknownType: 'an activity this app does not have',
  /* A NAMED APP'S KIND OF ENTRY THIS IMPORT HAS NO SAMPLE OF (`huckleberry.ts`). Not "an activity
     this app does not have": a Huckleberry diaper is a diaper here too, and saying otherwise would
     be false. What is missing is a file that shows how that app writes one. */
  notReadYet: 'a kind of entry this import does not read yet',
  noTime: 'no time in the row',
  badTime: 'a time that could not be read',
  future: 'a time in the future',
  // "could not be read" rather than "is not a number": `3 cups` has a number in it
  badQuantity: 'an amount that could not be read',
  needsAmount: 'a feed or a pump with no amount in the file',
  needsKind: 'a diaper with nothing saying wet or dirty',
  needsName: 'a medicine with no name in the file',
  /* A sleep with a start and no end is a sleep still going: this app would show the baby asleep
     from then until somebody ended it (the widget's `sleepState`, the nap outlook). */
  needsEnd: 'a sleep with no end time in the file',
  /** A row of a kind a reader knows, with a cell in a shape it has never seen (`huckleberry.ts`). */
  unreadable: 'an entry with details this import could not read',
  /** The second copy of a row the same file lists twice (`planFrom`). */
  repeated: 'a repeat of another row in the file',
  otherChild: 'another baby, not the one you picked',
};

/** What one accepted row becomes. Canonical units already, per CLAUDE.md §6. */
export interface ImportDraft {
  type: ActivityType;
  startMs: number;
  endMs: number | null;
  quantity: number | null;
  canonicalUnit: 'ml' | 'min' | 'g' | 'mm' | 'c_hundredths' | 'count' | null;
  notes: string | null;
  /**
   * The detail row this type needs, already in the shape the write takes. Derived at PLAN time
   * (`draftDetail`) rather than at write time, which is the whole reason it is here: a bottle with
   * no amount and a diaper with no kind cannot be stored at all, and a parent has to be told that
   * in the count BEFORE they say yes rather than discover it in a list of failures afterwards.
   */
  detail: Record<string, unknown> | null;
  /** The name the file gave, kept so the screen can say whose rows these are. */
  childName: string | null;
  /** The file line, so a parent can find the row this came from. */
  line: number;
  /**
   * The end is the reader's, not the file's: a Huckleberry breastfeed with only its start
   * (`START_ONLY_FEED_MINUTES` in `huckleberry.ts`). Carried per draft so the plan can say how many,
   * counting only the ones that will actually be written, before the parent says yes.
   */
  lengthAssumed?: boolean;
  /**
   * The amount is the reader's, not the file's: a Huckleberry pump written as 0 or with none
   * (`ASSUMED_PUMP_OZ` in `huckleberry.ts`), counted for the plan like `lengthAssumed`.
   */
  amountAssumed?: boolean;
}

export type RowOutcome =
  | { ok: true; draft: ImportDraft }
  | {
      ok: false;
      reason: SkipReason;
      line: number;
      /**
       * The word the file used for the row's kind, when the KIND is why it was skipped
       * (`unknownType`, `notReadYet`), so the plan can say which kinds were left out rather than
       * only how many rows.
       */
      word?: string;
    };

/**
 * The words a file may use for each of this app's types. Lower-cased and compared whole, so
 * `nursing` is a breastfeed and `nursery` is not anything.
 *
 * SLEEP DOES NOT SWALLOW `nap`'s SIBLINGS. `nap` and `night sleep` are both `sleep` because that
 * is one module in this app and the nap/night split is derived from the household's own day window
 * (docs/SCHEDULE_AND_LOCATIONS.md), not from a word in somebody else's file.
 */
const TYPE_WORDS: Record<string, ActivityType> = {
  bottle: 'bottle',
  formula: 'bottle',
  'bottle feed': 'bottle',
  feeding: 'bottle',
  feed: 'bottle',
  breastfeed: 'breastfeed',
  breastfeeding: 'breastfeed',
  nursing: 'breastfeed',
  nurse: 'breastfeed',
  breast: 'breastfeed',
  pump: 'pump',
  pumping: 'pump',
  expressing: 'pump',
  diaper: 'diaper',
  nappy: 'diaper',
  'diaper change': 'diaper',
  sleep: 'sleep',
  nap: 'sleep',
  'night sleep': 'sleep',
  asleep: 'sleep',
  solids: 'solids',
  solid: 'solids',
  food: 'solids',
  meal: 'solids',
  med: 'med',
  medicine: 'med',
  medication: 'med',
  vitamin: 'med',
  water: 'water',
  growth: 'growth',
  weight: 'growth',
  length: 'growth',
  height: 'growth',
  measurement: 'growth',
  temp: 'temp',
  temperature: 'temp',
  tummy: 'tummy',
  'tummy time': 'tummy',
  playtime: 'tummy',
  bath: 'bath',
  bathing: 'bath',
  milestone: 'milestone',
  note: 'note',
  notes: 'note',
};

/**
 * A WORD THE TABLE ITSELF HOLDS, never one an object inherits. The tables are plain objects, so
 * `TYPE_WORDS['constructor']` is `Object`'s constructor function, not `undefined`: a file whose
 * cell read "constructor", "toString" or "__proto__" came back as a type or a unit that is not
 * one, and the plan threw. A cell is somebody else's text; only the table's own words answer it.
 */
function ownWord<T>(table: Readonly<Record<string, T>>, word: string): T | undefined {
  return Object.hasOwn(table, word) ? table[word] : undefined;
}

/**
 * THE TYPE A CELL NAMES, or `null`.
 *
 * Exact first. Then, because trackers write *"Wet diaper"* and *"Diaper (wet)"* and *"Bottle —
 * formula"* rather than a bare word, a search for a type word as a WHOLE WORD inside the cell —
 * and ONLY when exactly one type is found.
 *
 * ONE MATCH IS THE FILE SAYING IT; TWO IS A GUESS. "wet diaper" contains `diaper` and nothing else,
 * so reading it as a diaper is not inference, it is reading. A cell saying "sleep feeding" contains
 * two and is refused — picking either would be inventing which one the parent meant, and a
 * `unknownType` skip that they can see beats a silent wrong answer they cannot.
 */
function matchType(raw: string): ActivityType | null {
  const n = norm(raw);
  const exact = ownWord(TYPE_WORDS, n);
  if (exact !== undefined) return exact;
  const found = new Set<ActivityType>();
  for (const [word, type] of Object.entries(TYPE_WORDS)) {
    // whole words only, so `nurse` is not found inside `nursery` and `bm` not inside `bmi`
    if (new RegExp(`(^| )${word}( |$)`).test(n)) found.add(type);
  }
  return found.size === 1 ? ([...found][0] as ActivityType) : null;
}

/** The unit words a file may use, and what each one means in canonical terms. */
const UNIT_WORDS: Record<
  string,
  { unit: ImportDraft['canonicalUnit']; toCanonical: (n: number) => number }
> = {
  ml: { unit: 'ml', toCanonical: n => n },
  millilitre: { unit: 'ml', toCanonical: n => n },
  milliliter: { unit: 'ml', toCanonical: n => n },
  cc: { unit: 'ml', toCanonical: n => n },
  oz: { unit: 'ml', toCanonical: n => n * ML_PER_OZ },
  ounce: { unit: 'ml', toCanonical: n => n * ML_PER_OZ },
  ounces: { unit: 'ml', toCanonical: n => n * ML_PER_OZ },
  floz: { unit: 'ml', toCanonical: n => n * ML_PER_OZ },
  'fl oz': { unit: 'ml', toCanonical: n => n * ML_PER_OZ },
  min: { unit: 'min', toCanonical: n => n },
  mins: { unit: 'min', toCanonical: n => n },
  minute: { unit: 'min', toCanonical: n => n },
  minutes: { unit: 'min', toCanonical: n => n },
  g: { unit: 'g', toCanonical: n => n },
  gram: { unit: 'g', toCanonical: n => n },
  grams: { unit: 'g', toCanonical: n => n },
  kg: { unit: 'g', toCanonical: n => n * 1000 },
  lb: { unit: 'g', toCanonical: n => n * 453.59237 },
  lbs: { unit: 'g', toCanonical: n => n * 453.59237 },
  mm: { unit: 'mm', toCanonical: n => n },
  cm: { unit: 'mm', toCanonical: n => n * 10 },
  in: { unit: 'mm', toCanonical: n => n * 25.4 },
  inch: { unit: 'mm', toCanonical: n => n * 25.4 },
  inches: { unit: 'mm', toCanonical: n => n * 25.4 },
  count: { unit: 'count', toCanonical: n => n },
  /* the canonical unit this app itself writes for a temperature (`canonical_unit` in its own
     download). Without it a reading of 3720 fell back to the household's VOLUME unit and was
     skipped as an amount with no unit — every temperature in a restored download was lost. */
  'c hundredths': { unit: 'c_hundredths', toCanonical: n => n },
};

/**
 * THE DETAIL A TYPE CANNOT BE STORED WITHOUT, or the reason it cannot be.
 *
 * Three of this app's tables have a NOT NULL column that no default can honestly fill:
 * `bottle_details.consumed_ml`, `pump_details.total_ml` and `diaper_details.kind`, plus
 * `med_details.name`. A bottle with no amount is not a bottle of zero millilitres — it is a row
 * this app has no way to hold, and writing 0 would put a false number in somebody's history.
 * `med_details.name` is the same: an unnamed medicine is not a medicine called "".
 *
 * SO THE ROW IS SKIPPED, WITH A REASON, AT PLAN TIME. That is the important half. A failure
 * discovered at write time is a line in an error list after the parent has already said yes; a
 * skip at plan time is a number in the summary they read before they decide.
 *
 * NOTHING IS GUESSED. A diaper's kind comes from the file — the detail column, or the type word
 * itself where a tracker writes "wet diaper" — and never from a note, a time of day or a default.
 */
function draftDetail(
  type: ActivityType,
  input: {
    quantity: number | null;
    canonicalUnit: ImportDraft['canonicalUnit'];
    detailText: string;
    rawType: string;
    endMs: number | null;
    startMs: number;
  },
): { detail: Record<string, unknown> | null } | { skip: SkipReason } {
  const own = ownDetail(input.detailText);
  // what this app's own detail cell says about the entry, checked field by field (empty for any
  // other file). A kind or a name is read out of a file's WORDS only when the cell is words: this
  // app's own record is read by its keys, never searched for a word.
  const kept = own === null ? {} : ownFields(type, own);
  const words = `${norm(input.rawType)} ${own === null ? norm(input.detailText) : ''}`;
  switch (type) {
    case 'bottle': {
      if (input.quantity === null || input.canonicalUnit !== 'ml') return { skip: 'needsAmount' };
      return { detail: { ...kept, consumed_ml: input.quantity } };
    }
    case 'pump': {
      if (input.quantity === null || input.canonicalUnit !== 'ml') return { skip: 'needsAmount' };
      return { detail: { ...kept, total_ml: input.quantity } };
    }
    case 'diaper': {
      const stored = typeof kept['kind'] === 'string' ? kept['kind'] : undefined;
      const kind = stored ?? DIAPER_WORDS.find(w => words.includes(w.word))?.kind;
      return kind === undefined ? { skip: 'needsKind' } : { detail: { ...kept, kind } };
    }
    case 'med': {
      const stored = typeof kept['name'] === 'string' ? kept['name'] : null;
      const name = (stored ?? (own === null ? input.detailText : '')).trim();
      return name === '' ? { skip: 'needsName' } : { detail: { ...kept, name } };
    }
    case 'growth': {
      // which measurement it is comes from the UNIT, which is the only thing that can say — or,
      // in this app's own file, from the stored row, which names every measurement taken
      if (input.quantity !== null && input.canonicalUnit === 'g') {
        return { detail: { ...kept, weight_g: input.quantity } };
      }
      if (input.quantity !== null && input.canonicalUnit === 'mm') {
        return { detail: { ...kept, length_mm: input.quantity } };
      }
      const measured = ['weight_g', 'length_mm', 'head_mm'].some(k => typeof kept[k] === 'number');
      return measured ? { detail: kept } : { skip: 'needsAmount' };
    }
    case 'temp': {
      if (input.quantity !== null && input.canonicalUnit === 'c_hundredths') {
        return { detail: { ...kept, temp_c_hundredths: input.quantity } };
      }
      return typeof kept['temp_c_hundredths'] === 'number'
        ? { detail: kept }
        : { skip: 'needsAmount' };
    }
    case 'breastfeed': {
      // the sides as they were recorded, when the file has them (this app's own does)
      if (typeof kept['left_seconds'] === 'number' || typeof kept['right_seconds'] === 'number') {
        return { detail: kept };
      }
      // a breastfeed's sides default to zero seconds, so a duration-only row is storable as it is
      const minutes = input.endMs === null ? 0 : Math.round((input.endMs - input.startMs) / 60_000);
      return { detail: minutes > 0 ? { left_seconds: minutes * 60 } : {} };
    }
    case 'sleep':
    case 'solids':
      // every column on both tables is nullable: whatever the file had is already in the note
      return { detail: kept };
    default:
      return { detail: null };
  }
}

/**
 * THIS APP'S OWN DETAIL CELL — the stored detail row as JSON, which `activityCsv` writes whole —
 * or null for anything else. The one place this app's own download says a diaper's kind, a
 * medicine's name or which side a feed was on; before 2026-09-24 nothing read it, and a parent
 * restoring their own download lost every diaper, medicine and temperature in it (IMPORT.md §2
 * calls that file "the case that is provably right").
 */
function ownDetail(text: string): Record<string, unknown> | null {
  const cell = text.trim();
  if (!cell.startsWith('{')) return null;
  try {
    const value: unknown = JSON.parse(cell);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * THE FIELDS A STORED DETAIL ROW MAY CARRY BACK, per type, each held to the schema a stored detail
 * row is held to (`domain-types.ts`) — a value that would not pass there is dropped here, never
 * written. Left out on purpose: the entry's own id, every field that points at another row of the
 * household the file came from (the bag a bottle was poured from, a pump session's trip to the
 * stash, the saved medicine it was logged against), which would name rows the household it is
 * restored into does not have; and the two a spreadsheet cell carries in the phone's own storage
 * encoding rather than the entry's (a diaper's rash tick as 0/1, a meal's food lines as text).
 */
const OWN_DETAIL_FIELDS: Partial<
  Record<ActivityType, { shape: Record<string, ZodTypeAny>; fields: readonly string[] }>
> = {
  bottle: { shape: BottleDetail.shape, fields: ['kind', 'offered_ml', 'consumed_ml'] },
  breastfeed: {
    shape: BreastfeedDetail.shape,
    fields: ['first_side', 'left_seconds', 'right_seconds'],
  },
  pump: { shape: PumpDetail.shape, fields: ['sides', 'left_ml', 'right_ml', 'total_ml'] },
  sleep: { shape: SleepDetail.shape, fields: ['kind', 'wake_count', 'location'] },
  diaper: { shape: DiaperDetail.shape, fields: ['kind', 'color', 'consistency'] },
  solids: { shape: SolidsDetail.shape, fields: ['meal', 'food', 'taken', 'observation'] },
  med: { shape: MedDetail.shape, fields: ['name', 'amount_text', 'route'] },
  growth: { shape: MeasurementDetail.shape, fields: ['weight_g', 'length_mm', 'head_mm'] },
  temp: { shape: MeasurementDetail.shape, fields: ['temp_c_hundredths', 'temp_method'] },
};

function ownFields(type: ActivityType, own: Record<string, unknown>): Record<string, unknown> {
  const spec = OWN_DETAIL_FIELDS[type];
  if (spec === undefined) return {};
  const out: Record<string, unknown> = {};
  for (const field of spec.fields) {
    const value = own[field];
    if (value === null || value === undefined) continue;
    if (spec.shape[field]?.safeParse(value).success === true) out[field] = value;
  }
  return out;
}

/** The words a file uses for a diaper, longest first so "both" is not read out of "bothered". */
const DIAPER_WORDS: readonly { word: string; kind: string }[] = [
  { word: 'mixed', kind: 'BOTH' },
  { word: 'both', kind: 'BOTH' },
  { word: 'dirty', kind: 'DIRTY' },
  { word: 'poop', kind: 'DIRTY' },
  { word: 'poo', kind: 'DIRTY' },
  { word: 'bm', kind: 'DIRTY' },
  { word: 'soiled', kind: 'DIRTY' },
  { word: 'wet', kind: 'WET' },
  { word: 'pee', kind: 'WET' },
  { word: 'dry', kind: 'DRY' },
];

export interface ReadRowContext {
  /** Now, so a row in the future can be told from one in the past. */
  nowMs: number;
  /**
   * The unit to assume when a file gives an amount with NO unit column. The screen states this
   * assumption out loud before the import runs, because a file of `4`s is 4 oz or 4 ml and the
   * difference is sevenfold.
   */
  assumeVolumeUnit: 'ml' | 'oz';
  /** Only rows for this baby, by the name in the file. `null` takes every row. */
  onlyChildName?: string | null;
}

/**
 * A minute of slack, so a row stamped "now" by the exporting app is not called the future. Every
 * reader uses it (`huckleberry.ts` too).
 */
export const FUTURE_SLACK_MS = 60_000;

export function readRow(
  cells: readonly string[],
  map: ColumnMap,
  line: number,
  ctx: ReadRowContext,
): RowOutcome {
  const at = (field: ImportField): string => {
    const i = map.indexOf(field);
    return i < 0 ? '' : (cells[i] ?? '').trim();
  };
  const bad = (reason: SkipReason): RowOutcome => ({ ok: false, reason, line });

  const childName = at('childName');
  if (
    ctx.onlyChildName !== undefined &&
    ctx.onlyChildName !== null &&
    childName !== '' &&
    norm(childName) !== norm(ctx.onlyChildName)
  ) {
    return bad('otherChild');
  }

  const rawType = at('type');
  if (rawType === '') return bad('noType');
  const type = matchType(rawType);
  if (type === null) return { ok: false, reason: 'unknownType', line, word: rawType };

  const rawStart = at('startAt');
  if (rawStart === '') return bad('noTime');
  const startMs = parseWhen(rawStart);
  if (startMs === null) return bad('badTime');
  if (startMs > ctx.nowMs + FUTURE_SLACK_MS) return bad('future');

  // the end comes from an explicit end, or from a duration, and an end before its start is
  // dropped rather than reversed: a negative length is a broken row, not a clue
  let endMs: number | null = null;
  const rawEnd = at('endAt');
  if (rawEnd !== '') {
    const parsed = parseWhen(rawEnd);
    if (parsed !== null && parsed > startMs) endMs = parsed;
  }
  if (endMs === null) {
    const minutes = Number(at('durationMinutes'));
    if (Number.isFinite(minutes) && minutes > 0) endMs = startMs + Math.round(minutes) * 60_000;
  }

  let quantity: number | null = null;
  let canonicalUnit: ImportDraft['canonicalUnit'] = null;
  const rawQuantity = at('quantity');
  if (rawQuantity !== '') {
    const n = Number(rawQuantity.replace(',', '.'));
    if (!Number.isFinite(n)) return bad('badQuantity');
    if (n !== 0) {
      const rawUnit = at('unit');
      const known = rawUnit === '' ? undefined : ownWord(UNIT_WORDS, norm(rawUnit));
      if (known !== undefined) {
        quantity = Math.round(known.toCanonical(n));
        canonicalUnit = known.unit;
      } else {
        // no unit column, or a word nobody recognizes: fall back to the household's assumption,
        // which the screen has already stated
        quantity = Math.round(ctx.assumeVolumeUnit === 'oz' ? n * ML_PER_OZ : n);
        canonicalUnit = 'ml';
      }
    }
  }

  // the detail the type cannot be stored without, decided HERE so an unstorable row is a number in
  // the summary rather than a failure after the parent has said yes
  const detailText = at('detailText');
  const derived = draftDetail(type, {
    quantity,
    canonicalUnit,
    detailText,
    rawType,
    startMs,
    endMs,
  });
  if ('skip' in derived) return bad(derived.skip);

  const notes = at('notes');
  return {
    ok: true,
    draft: {
      type,
      startMs,
      endMs,
      quantity,
      canonicalUnit,
      detail: derived.detail,
      notes: notes === '' ? null : notes,
      childName: childName === '' ? null : childName,
      line,
    },
  };
}

/**
 * A timestamp from a file, or `null`.
 *
 * ISO FIRST, because that is what this app writes and what a well-behaved exporter writes. Then
 * two forgiving shapes that spreadsheets produce: `YYYY-MM-DD HH:MM` with a space instead of a T,
 * and `M/D/YYYY H:MM` with an optional AM/PM.
 *
 * AN AMBIGUOUS DAY/MONTH IS REFUSED, not guessed. `03/04/2026` is March 4th to half the world and
 * April 3rd to the other half, and a history silently shifted by a month is the kind of wrong that
 * a parent discovers six months later. It parses only when the first number cannot be a month.
 */
export function parseWhen(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;
  // a bare number is an epoch, in seconds or milliseconds — accepted because exporters emit both
  if (/^\d{10}$/.test(text)) return Number(text) * 1000;
  if (/^\d{13}$/.test(text)) return Number(text);
  const iso = Date.parse(text);
  if (!Number.isNaN(iso) && /^\d{4}-\d{2}-\d{2}/.test(text)) return iso;
  const spaced = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (spaced) {
    const [, y, mo, d, h, mi, se] = spaced;
    return Date.parse(`${y}-${mo}-${d}T${String(h).padStart(2, '0')}:${mi}:${se ?? '00'}`);
  }
  const slashed = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i,
  );
  if (slashed) {
    const [, a, b, y, h, mi, se, ampm] = slashed;
    const first = Number(a);
    const second = Number(b);
    // only unambiguous when one of the two cannot be a month
    if (first <= 12 && second <= 12) return null;
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    let hour = h === undefined ? 0 : Number(h);
    if (ampm !== undefined) {
      const pm = ampm.toLowerCase() === 'pm';
      hour = (hour % 12) + (pm ? 12 : 0);
    }
    const stamp = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${mi ?? '00'}:${se ?? '00'}`;
    const parsed = Date.parse(stamp);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/* ------------------------------------------------------------------ the plan */

export interface ImportPlan {
  drafts: ImportDraft[];
  skipped: { reason: SkipReason; line: number }[];
  /** How many drafts of each type, so the confirm screen can say what is coming. */
  byType: Partial<Record<ActivityType, number>>;
  /** How many were skipped for each reason, so nothing is dropped silently. */
  bySkip: Partial<Record<SkipReason, number>>;
  firstMs: number | null;
  lastMs: number | null;
  /** Names the file mentioned, so a household with twins can be asked which one. */
  childNames: string[];
  /** True when a quantity was read with no unit column and the assumption was used. */
  assumedUnit: boolean;
  /**
   * The words the file used for the rows skipped for their KIND, per reason, first seen first:
   * "walk", or a Huckleberry "Diaper". A count says how many rows were left out; these say which
   * kinds, which is what a parent can act on.
   */
  skippedKinds: Partial<Record<SkipReason, string[]>>;
}

export function readTable(table: Table, map: ColumnMap, ctx: ReadRowContext): ImportPlan {
  return planFrom(
    table.rows.map((cells, i) => readRow(cells, map, table.lines[i] ?? i + 2, ctx)),
    { unitsNamed: map.includes('unit') },
  );
}

/**
 * THE PLAN FROM EVERY ROW'S OUTCOME, whichever reader made them (`readTable`, and
 * `readHuckleberry` in `huckleberry.ts`): each row a draft or a counted skip, the drafts oldest
 * first, the span, the names.
 *
 * A ROW THE FILE LISTS TWICE IS A COUNTED SKIP HERE (`repeated`), the second copy, rather than a
 * draft quietly dropped at write time. A file that lists the same feed twice is a file with a bug,
 * and importing both would make the second one somebody's real history; the parent is told, in the
 * count they read before anything is written. Until 2026-09-28 the repeat was dropped by
 * `newDrafts` and shown as "already in your log" on a first import, which was not true.
 *
 * `unitsNamed` is whether the file names its units, so an amount read with the household's unit
 * assumed is flagged (`assumedUnit`).
 */
export function planFrom(
  outcomes: readonly RowOutcome[],
  opts: { unitsNamed: boolean },
): ImportPlan {
  const drafts: ImportDraft[] = [];
  const skipped: { reason: SkipReason; line: number }[] = [];
  const byType: Partial<Record<ActivityType, number>> = {};
  const bySkip: Partial<Record<SkipReason, number>> = {};
  const skippedKinds: Partial<Record<SkipReason, string[]>> = {};
  const names = new Set<string>();
  const seen = new Set<string>();
  let assumedUnit = false;
  const skip = (reason: SkipReason, line: number): void => {
    skipped.push({ reason, line });
    bySkip[reason] = (bySkip[reason] ?? 0) + 1;
  };
  for (const outcome of outcomes) {
    if (!outcome.ok) {
      skip(outcome.reason, outcome.line);
      if (outcome.word !== undefined) {
        const words = skippedKinds[outcome.reason] ?? [];
        if (!words.includes(outcome.word)) words.push(outcome.word);
        skippedKinds[outcome.reason] = words;
      }
      continue;
    }
    // in FILE order, so the copy kept is the first one and the line counted is the later one
    const key = draftKey(outcome.draft);
    if (seen.has(key)) {
      skip('repeated', outcome.draft.line);
      continue;
    }
    seen.add(key);
    drafts.push(outcome.draft);
    byType[outcome.draft.type] = (byType[outcome.draft.type] ?? 0) + 1;
    if (outcome.draft.childName !== null) names.add(outcome.draft.childName);
    if (!opts.unitsNamed && outcome.draft.quantity !== null) assumedUnit = true;
  }
  // oldest first, so an import reads like a history being written rather than unwound
  drafts.sort((a, b) => a.startMs - b.startMs || a.line - b.line);
  return {
    drafts,
    skipped,
    byType,
    bySkip,
    firstMs: drafts[0]?.startMs ?? null,
    lastMs: drafts[drafts.length - 1]?.startMs ?? null,
    childNames: [...names].sort(),
    assumedUnit,
    skippedKinds,
  };
}

/**
 * ONE ROW'S IDENTITY IN ITS FILE: what it is, when it started, how much, until when, and its
 * detail. It decides one thing, a row the same file lists twice (`planFrom`).
 *
 * THE DETAIL IS IN IT so that a breast-milk bottle and a formula bottle given in the same minute,
 * the same size, are two rows (a mixed feed logged as two entries) rather than one row and its
 * repeat. THE NOTE IS NOT: two rows that differ only in a note are the same entry typed twice. Its
 * position in the file is not either, so the same rows in any order key the same.
 *
 * It is NOT how the household's own entries are matched: an entry typed here has seconds in its
 * time and the file does not, so no exact key could ever find it (`newDrafts`).
 */
export const draftKey = (d: ImportDraft): string =>
  `${d.type}:${d.startMs}:${d.quantity ?? ''}:${d.endMs ?? ''}:${detailKey(d.detail)}`;

/** A detail row as text, its fields in one fixed order, so two equal rows are one string. */
function detailKey(detail: Record<string, unknown> | null): string {
  if (detail === null) return '';
  const fields = Object.keys(detail)
    .sort()
    .map(k => [k, detail[k]]);
  return JSON.stringify(fields);
}

/**
 * AN ENTRY THE HOUSEHOLD ALREADY HOLDS, as `newDrafts` reads it: its kind and when it started, and
 * nothing else. Not the amount: a feed typed as 90 ml here and written as 3 oz in the other app is
 * still one feed. Deleted entries count too (the app's `existingEntries` says why).
 */
export interface HeldEntry {
  type: string;
  startMs: number;
}

/**
 * How far beyond the file's first and last row the household's entries are read
 * (`existingEntries`): a held entry can start up to two minutes from a row and still be the
 * minute before or after it (`newDrafts`).
 */
export const HELD_SLACK_MS = 2 * 60_000;

/** The minute an instant falls in. Every zone in use is a whole number of minutes from UTC. */
const minuteOf = (ms: number): number => Math.floor(ms / 60_000);
const slotOf = (type: string, minute: number): string => `${type}:${minute}`;

/**
 * THE DRAFTS TO WRITE: every one the household does not already hold.
 *
 * ALREADY THERE MEANS AN ENTRY OF THE SAME KIND THAT STARTED IN THE SAME MINUTE, OR THE MINUTE
 * EITHER SIDE. Two cases need it, and an exact key served neither well:
 *
 *   - THE SAME FILE TWICE. A parent whose import failed halfway (offline, app killed, battery)
 *     picks the same file again and must not end up with two of everything. Each row finds the
 *     entry the first run wrote, in its own minute.
 *   - THE SAME FEED LOGGED IN BOTH APPS (the owner, 2026-09-28, logging in both while switching).
 *     An entry typed here starts at the second Save was tapped; the other app's file gives the
 *     minute only, and the two taps can fall either side of a minute's turn. The minute either
 *     side catches that and nothing wider: in the sample export, no two entries of one kind
 *     started within two minutes of each other except a row listed twice, while two bottles a few
 *     minutes apart do happen and must both stay.
 *
 * ONE HELD ENTRY ANSWERS FOR ONE ROW. A breast-milk bottle and a formula bottle at 6:25 are two
 * rows, and one bottle logged here at 6:25 is the same feed as one of them, not both; the other is
 * still added. The same minute is matched first for every row, then the minutes either side, so a
 * file run twice always finds each row's own entry.
 *
 * A row the list repeats (`draftKey`) is dropped here too, as `planFrom` already did for a plan.
 */
export function newDrafts(
  drafts: readonly ImportDraft[],
  held: readonly HeldEntry[],
): ImportDraft[] {
  const free = new Map<string, number>();
  for (const h of held) {
    const slot = slotOf(h.type, minuteOf(h.startMs));
    free.set(slot, (free.get(slot) ?? 0) + 1);
  }
  const take = (slot: string): boolean => {
    const n = free.get(slot) ?? 0;
    if (n === 0) return false;
    free.set(slot, n - 1);
    return true;
  };
  const seen = new Set<string>();
  const unique = drafts.filter(d => {
    const key = draftKey(d);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const sameMinute = unique.map(d => take(slotOf(d.type, minuteOf(d.startMs))));
  return unique.filter((d, i) => {
    if (sameMinute[i] === true) return false;
    const minute = minuteOf(d.startMs);
    return !(take(slotOf(d.type, minute - 1)) || take(slotOf(d.type, minute + 1)));
  });
}
