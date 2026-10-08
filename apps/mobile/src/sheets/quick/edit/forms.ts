/**
 * AN EDIT IS THE SHEET THAT LOGGED THE ENTRY, OPENED ON IT (the owner, 2026-09-26: "shouldnt editing
 * from today's log look the same as you would as if you want to entry (finished module for some
 * with timer)? why does it have a different UI? keep it the same").
 *
 * A tap on an entry — Today's log, the Log tab, a temperature or growth history, the catch-up card
 * — opens that module's own capture sheet, filled in from the entry: a timed module straight on its
 * "Already finished" form, every other module on its one form. The sheet saves the way it always
 * does, and in an edit its fields correct the entry it was opened on instead of adding a row
 * (`useQuickWrite`). This file is the arithmetic between the two, pure so every rule is a table
 * test:
 *
 *   * `formStart` — what the sheet opens on: the entry's own values, in the shapes the sheet holds
 *     (a sleep's length in minutes, a bottle's two numbers, a growth entry's measurements).
 *   * `resolveEdit` — the sheet's fields back into the editor's draft, and the patch that writes
 *     ONLY what changed (`entryPatch`, which the server merges per field).
 *
 * A SAVED VALUE THAT WAS NOT TOUCHED IS NOT REWRITTEN (the feeding audit, H5; CLAUDE.md rule 7). A
 * sheet shows a value its own way — a 35m 40s sleep as 36 minutes, a 110 ml bottle on the quarter-
 * ounce grid, 4533 g as 4.53 kg — and writes what it shows. So each field the sheet hands back is
 * compared with what the SAME sheet would have written had nothing been touched (`sheetFields` of
 * the form it opened on, run through the same shared rules the sheets use): equal, and the entry
 * keeps its own exact value; different, and the parent changed it, and it is written. Nothing is
 * rounded behind a parent's back.
 *
 * Nothing here interprets. An amount is what the parent typed; a time is what they chose.
 */
import {
  fromLeftover,
  localDayKey,
  MEALS,
  mealForTime,
  offeredToStore,
  seenOf,
  type ActivityType,
  type LengthUnit,
  type Meal,
  type SolidsItem,
  type VolumeUnit,
  type WeightUnit,
  type WellbeingSeen,
} from '@nibblecue/core';
import type { ActivityFields } from '../../../data/activities';
import type { EntryRecord } from '../../../db/queries/today';
import {
  bottleShown,
  draftFrom,
  editError,
  entryPatch,
  pickedDate,
  type EntryDraft,
  type EntryPatch,
} from '../../entry/editor';
import { BOTTLE_KIND_LABEL, DIAPER_LABEL, TEMP_METHODS } from '../copy';
import { middayOfDay } from '../measuredOn';
import { manualFeed } from '../modules/breastfeedForm';
import { lengthMillimetres, lengthValue, weightGrams, weightValue } from '../modules/growthForm';
import { pumpOutput, pumpSession, shownTotal, type PumpState } from '../modules/pumpForm';
import { onGrid } from '../modules/pumpPrefill';
import { manualBounds, MIN } from '../timerMath';

export type BottleKind = keyof typeof BOTTLE_KIND_LABEL;
export type DiaperKind = keyof typeof DIAPER_LABEL;
export type TempMethod = (typeof TEMP_METHODS)[number];
export type SleepKind = 'NAP' | 'NIGHT';

/**
 * THE FORMS WHOSE TIME ROW IS WHEN THE THING ENDED — "Woke up at", "End time" — with the length
 * counting back from it (`manualBounds`, `pumpSession`). Their row opens on the entry's END — the
 * pump's too since 2026-09-26, when its row stopped being a start (the owner: "it would make more
 * sense to do 'end time' now") — and every other form's row is the entry's own moment.
 */
const ENDS_AT_ROW: readonly ActivityType[] = ['sleep', 'breastfeed', 'tummy', 'pump'];

/**
 * WHAT A SHEET OPENS ON WHEN IT IS CORRECTING AN ENTRY — every value in the shape that sheet holds
 * it. One record for every module, so a sheet reads the few it has and nothing is narrowed in a
 * component; the rest are the sheet's own starting positions and are never read.
 */
export interface FormStart {
  /** Where the time row starts, as a Custom time: the entry's end on an "Ended" row, else its start. */
  rowAtMs: number;
  /**
   * The entry's own saved start and end (the end is the start for a moment), for the forms that
   * show both as explicit rows: an edited sleep's Fell asleep and Woke up, a timed feed's Started
   * and Ended (the owner's Option 2, 2026-10-05).
   */
  startMs: number;
  endMs: number;
  /**
   * Whether a TIMER recorded this entry's start and end (`metadata.timer_id`, which every timer
   * stop writes — D26). A feed typed in after the fact has only an end the parent gave and a start
   * worked back from its minutes, and its form says that start is approximate.
   */
  timed: boolean;
  /** The note as saved; '' for none. */
  note: string;
  /** Sleep, tummy time and the pump: the entry's length, in whole minutes. */
  minutes: number;
  /** Breastfeed: each side in whole minutes, and the side it started on. */
  leftMin: number;
  rightMin: number;
  firstSide: 'LEFT' | 'RIGHT' | null;
  /** Breastfeed: the minutes the entry spans beyond its two sides — a timed feed's pause. */
  pausedMinutes: number;
  /** Pump: the sides, or the one total a total-only session was logged with (`pumpForm.ts`). */
  pump: PumpState;
  /** Sleep: nap or night, as saved. */
  sleepKind: SleepKind;
  /** Bottle: what was in it, what was left in it (null: finished), and what it was. */
  bottleMl: number;
  leftoverMl: number | null;
  bottleKind: BottleKind;
  /** Diaper. */
  diaperKind: DiaperKind;
  diaperColor: string | null;
  diaperRash: boolean;
  /** Bath: the toggle's two answers; a bath that never said opens on the sheet's own first. */
  hair: 'washed' | 'not';
  /** Solids: the meal (null for one saved without), the foods, and what they noticed. */
  meal: Meal | null;
  items: SolidsItem[];
  observation: string;
  /** Medicine: the name as logged, the amount as given, the item and its route. */
  medName: string;
  medAmount: string;
  medItemId: string | null;
  medRoute: string | null;
  /** Temperature: the reading in °C×100, and how it was taken (null when it never said). */
  tempCHundredths: number;
  tempMethod: TempMethod | null;
  /** Growth: canonical grams and millimeters; null = not measured, and switched off. */
  weightG: number | null;
  lengthMm: number | null;
  headMm: number | null;
  /**
   * Health note: the chips as tapped, and whether the note has a stop at all — `endMs` is the start
   * for a note still going, so the end's presence is its own fact (`WellbeingSheet`).
   */
  wellbeingSeen: WellbeingSeen[];
  wellbeingEnded: boolean;
}

/** The units and clock a sheet shows its values in — what "untouched" is measured against. */
export interface EditContext {
  volume: VolumeUnit;
  weight: WeightUnit;
  length: LengthUnit;
  timeZone: string;
  nowMs: number;
}

const isKey = <T extends object>(table: T, v: unknown): v is keyof T =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(table, v);
const isMeal = (v: unknown): v is Meal => typeof v === 'string' && MEALS.includes(v as Meal);
const isMethod = (v: unknown): v is TempMethod =>
  typeof v === 'string' && (TEMP_METHODS as readonly string[]).includes(v);
const side = (v: unknown): 'LEFT' | 'RIGHT' | null => (v === 'LEFT' || v === 'RIGHT' ? v : null);

/** The entry, as the sheet that logged it opens on it. */
export function formStart(record: EntryRecord): FormStart {
  const b = draftFrom(record);
  const type = record.activity.type;
  const spanMs = b.endMs === null ? 0 : Math.max(0, b.endMs - b.startMs);
  const minutes = Math.round(spanMs / MIN);
  const leftMin = Math.round((b.leftSeconds ?? 0) / 60);
  const rightMin = Math.round((b.rightSeconds ?? 0) / 60);
  /*
    A PAUSE IS THE SPAN BEYOND THE SIDES, SO IT NEEDS SIDES. A feed with none recorded (a
    Huckleberry breastfeed with only its start, brought in as 30 minutes) has its span as its whole
    length (`recordedMs`), not 30 minutes of pause: read as one, typing 15 and 15 into its sides
    made it an hour long and moved its start, the one time the file gave, half an hour earlier.
  */
  const sided = (b.leftSeconds ?? 0) + (b.rightSeconds ?? 0) > 0;
  const bottle = bottleShown(b.consumedMl ?? 0, b.offeredMl ?? null);
  return {
    rowAtMs: ENDS_AT_ROW.includes(type) ? (b.endMs ?? b.startMs) : b.startMs,
    startMs: b.startMs,
    endMs: b.endMs ?? b.startMs,
    timed: timedEntry(record.activity.metadata),
    note: b.notes,
    minutes,
    leftMin,
    rightMin,
    firstSide: side(b.firstSide),
    pausedMinutes: type === 'breastfeed' && sided ? Math.max(0, minutes - leftMin - rightMin) : 0,
    pump: {
      mode: b.pumpMode ?? 'side',
      amounts: { leftMl: b.leftMl ?? 0, rightMl: b.rightMl ?? 0, totalMl: b.totalMl ?? 0 },
    },
    sleepKind: b.sleepKind === 'NIGHT' ? 'NIGHT' : 'NAP',
    bottleMl: bottle.bottleMl,
    leftoverMl: bottle.leftoverMl > 0 ? bottle.leftoverMl : null,
    bottleKind: isKey(BOTTLE_KIND_LABEL, b.bottleKind) ? b.bottleKind : 'EBM',
    diaperKind: isKey(DIAPER_LABEL, b.diaperKind) ? b.diaperKind : 'WET',
    diaperColor: b.diaperColor ?? null,
    diaperRash: b.diaperRash === true,
    hair: b.hairWashed === false ? 'not' : 'washed',
    meal: isMeal(b.meal) ? b.meal : null,
    items: b.solidsItems ?? [],
    observation: b.observation ?? '',
    medName: b.medName ?? '',
    medAmount: b.medAmount ?? '',
    medItemId: b.medItemId ?? null,
    medRoute: b.medRoute ?? null,
    tempCHundredths: b.tempCHundredths ?? 3700,
    tempMethod: isMethod(b.tempMethod) ? b.tempMethod : null,
    weightG: b.weightG ?? null,
    lengthMm: b.lengthMm ?? null,
    headMm: b.headMm ?? null,
    wellbeingSeen: b.wellbeingSeen ?? [],
    wellbeingEnded: type === 'wellbeing' && b.endMs !== null,
  };
}

/** True when the row's metadata names the timer that recorded it. */
export function timedEntry(metadata: string | null | undefined): boolean {
  if (!metadata) return false;
  try {
    const m = JSON.parse(metadata) as Record<string, unknown> | null;
    return typeof m?.timer_id === 'string' && m.timer_id !== '';
  } catch {
    return false;
  }
}

const iso = (ms: number): string => new Date(ms).toISOString();
const noteOf = (note: string): string | null => note.trim() || null;

/**
 * A MODULE'S SAVE, AS DATA — the fields its capture sheet hands its Save while it holds `form`,
 * through the same shared rules the sheet runs (`manualBounds`, `manualFeed`, `pumpSession`,
 * `fromLeftover` on the stepper's grid, the growth steppers' grids). Run on what `formStart` opened
 * the sheet on, it is the yardstick for "untouched" (`resolveEdit`), never something written; run on
 * a form a test has changed, it is the sheet's Save with the parent's changes on it.
 */
export function sheetFields(
  record: EntryRecord,
  form: FormStart,
  ctx: EditContext,
): ActivityFields {
  const type = record.activity.type;
  const at = form.rowAtMs;
  const notes = noteOf(form.note);
  switch (type) {
    case 'bottle': {
      const amounts = fromLeftover({
        bottleMl: onGrid(form.bottleMl, ctx.volume),
        leftoverMl: form.leftoverMl === null ? null : onGrid(form.leftoverMl, ctx.volume),
      });
      return {
        type,
        startAt: iso(at),
        notes,
        detail: {
          kind: form.bottleKind,
          consumed_ml: amounts.consumedMl,
          offered_ml: offeredToStore(amounts),
        },
      };
    }
    case 'diaper':
      return {
        type,
        startAt: iso(at),
        notes,
        detail: { kind: form.diaperKind, color: form.diaperColor, rash: form.diaperRash },
      };
    case 'bath':
      return { type, startAt: iso(at), notes, metadata: { hair_washed: form.hair === 'washed' } };
    case 'sleep': {
      const b = manualBounds(at, form.minutes);
      return {
        type,
        startAt: iso(b.startMs),
        endAt: iso(b.endMs),
        notes,
        detail: { kind: form.sleepKind },
      };
    }
    case 'tummy': {
      const b = manualBounds(at, form.minutes);
      return { type, startAt: iso(b.startMs), endAt: iso(b.endMs), notes };
    }
    case 'breastfeed': {
      const feed = manualFeed({
        endMs: at,
        leftMin: form.leftMin,
        rightMin: form.rightMin,
        firstPicked: form.firstSide,
        pair: null,
        pausedMinutes: form.pausedMinutes,
      });
      return {
        type,
        startAt: iso(feed.startMs),
        endAt: iso(feed.endMs),
        notes,
        detail: feed.fields.detail,
      };
    }
    case 'pump': {
      const s = pumpSession(at, form.minutes, ctx.nowMs);
      const out = pumpOutput(form.pump.mode, {
        ...form.pump.amounts,
        totalMl: shownTotal(form.pump),
      });
      return {
        type,
        startAt: iso(s.startMs),
        endAt: iso(s.endMs),
        notes,
        detail: { left_ml: out.leftMl, right_ml: out.rightMl, total_ml: out.totalMl },
      };
    }
    case 'solids':
      return {
        type,
        startAt: iso(at),
        notes,
        detail: {
          meal: form.meal ?? mealForTime(at, ctx.timeZone),
          items: form.items,
          observation: form.observation.trim() || null,
        },
      };
    case 'med':
      return {
        type,
        startAt: iso(at),
        notes,
        detail: {
          name: form.medName,
          amount_text: form.medAmount.trim() || null,
          care_item_id: form.medItemId,
          route: form.medRoute,
        },
      };
    case 'temp':
      return {
        type,
        startAt: iso(at),
        notes,
        detail: {
          temp_c_hundredths: form.tempCHundredths,
          // a reading that never said how it was taken shows the sheet's first answer
          temp_method: form.tempMethod ?? 'Axillary',
        },
      };
    case 'growth':
      return {
        type,
        // a date row: midday on the entry's own day (`QuickEntry`'s `date` mode)
        startAt: iso(middayOfDay(at, ctx.timeZone)),
        notes,
        detail: {
          weight_g:
            form.weightG === null ? null : weightGrams(weightValue(form.weightG, ctx.weight)),
          length_mm:
            form.lengthMm === null
              ? null
              : lengthMillimetres(lengthValue(form.lengthMm, ctx.length)),
          head_mm:
            form.headMm === null ? null : lengthMillimetres(lengthValue(form.headMm, ctx.length)),
        },
      };
    case 'wellbeing':
      // the start, the stop or none (still going), the words and the chips — `WellbeingSheet`'s Save
      return {
        type,
        startAt: iso(at),
        endAt: form.wellbeingEnded ? iso(form.endMs) : null,
        notes,
        detail: { seen: form.wellbeingSeen },
      };
    default:
      return { type, startAt: iso(at), notes };
  }
}

const has = (d: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(d, key);
const numOr = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * A sheet's fields, read as the editor's draft. What the sheet did not hand back — a module whose
 * form has no note, a detail it does not ask — is the entry's own, unchanged.
 */
function draftFromFields(
  before: EntryDraft,
  type: ActivityType,
  fields: ActivityFields,
): EntryDraft {
  const next: EntryDraft = { ...before, startMs: Date.parse(fields.startAt) };
  if (fields.endAt !== undefined) {
    next.endMs = fields.endAt === null ? null : Date.parse(fields.endAt);
  }
  if (fields.notes !== undefined) next.notes = fields.notes ?? '';
  const d = fields.detail ?? {};
  switch (type) {
    case 'bottle': {
      if (has(d, 'consumed_ml')) next.consumedMl = numOr(d['consumed_ml'], 0);
      if (has(d, 'offered_ml')) next.offeredMl = numOrNull(d['offered_ml']);
      if (has(d, 'kind')) next.bottleKind = strOrNull(d['kind']) ?? 'EBM';
      // the two numbers `fieldError` reads, from the pair the sheet made them into
      Object.assign(next, bottleShown(next.consumedMl ?? 0, next.offeredMl ?? null));
      break;
    }
    case 'diaper':
      if (has(d, 'kind')) next.diaperKind = strOrNull(d['kind']) ?? 'WET';
      if (has(d, 'color')) next.diaperColor = strOrNull(d['color']);
      if (has(d, 'rash')) next.diaperRash = d['rash'] === true;
      break;
    case 'sleep':
      if (has(d, 'kind')) next.sleepKind = strOrNull(d['kind']) ?? 'NAP';
      break;
    case 'breastfeed':
      if (has(d, 'left_seconds')) next.leftSeconds = numOr(d['left_seconds'], 0);
      if (has(d, 'right_seconds')) next.rightSeconds = numOr(d['right_seconds'], 0);
      if (has(d, 'first_side')) next.firstSide = strOrNull(d['first_side']);
      break;
    case 'pump': {
      if (!has(d, 'total_ml')) break;
      const left = numOrNull(d['left_ml']);
      const right = numOrNull(d['right_ml']);
      const total = numOr(d['total_ml'], 0);
      // both sides null is a total-only session: it stays one, with no invented split
      Object.assign(
        next,
        left === null && right === null
          ? { pumpMode: 'total' as const, leftMl: 0, rightMl: 0, totalMl: total }
          : {
              pumpMode: 'side' as const,
              leftMl: left ?? 0,
              rightMl: right ?? 0,
              totalMl: (left ?? 0) + (right ?? 0),
            },
      );
      break;
    }
    case 'solids':
      if (has(d, 'meal')) next.meal = strOrNull(d['meal']);
      if (has(d, 'items') && Array.isArray(d['items']))
        next.solidsItems = d['items'] as SolidsItem[];
      if (has(d, 'observation')) next.observation = strOrNull(d['observation']) ?? '';
      break;
    case 'med':
      if (has(d, 'name')) next.medName = strOrNull(d['name']) ?? '';
      if (has(d, 'amount_text')) next.medAmount = strOrNull(d['amount_text']) ?? '';
      if (has(d, 'care_item_id')) next.medItemId = strOrNull(d['care_item_id']);
      if (has(d, 'route')) next.medRoute = strOrNull(d['route']);
      break;
    case 'temp':
      if (has(d, 'temp_c_hundredths')) next.tempCHundredths = numOrNull(d['temp_c_hundredths']);
      if (has(d, 'temp_method')) next.tempMethod = strOrNull(d['temp_method']);
      break;
    case 'growth':
      if (has(d, 'weight_g')) next.weightG = numOrNull(d['weight_g']);
      if (has(d, 'length_mm')) next.lengthMm = numOrNull(d['length_mm']);
      if (has(d, 'head_mm')) next.headMm = numOrNull(d['head_mm']);
      break;
    case 'bath': {
      const hair = fields.metadata?.['hair_washed'];
      if (typeof hair === 'boolean') next.hairWashed = hair;
      break;
    }
    case 'wellbeing':
      if (has(d, 'seen')) next.wellbeingSeen = seenOf(d['seen']);
      break;
    default:
      break;
  }
  return next;
}

const same = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * EACH FIELD THE PARENT DID NOT CHANGE IS THE ENTRY'S OWN (see the header): what the sheet handed
 * back, except where it is exactly what the untouched sheet would have handed back — there the
 * stored value stands, to the second and the milliliter.
 */
function settle(before: EntryDraft, next: EntryDraft, untouched: EntryDraft): EntryDraft {
  const out: Record<string, unknown> = { ...next };
  const was = before as unknown as Record<string, unknown>;
  const now = next as unknown as Record<string, unknown>;
  const rest = untouched as unknown as Record<string, unknown>;
  for (const key of Object.keys(now)) if (same(now[key], rest[key])) out[key] = was[key];
  return out as unknown as EntryDraft;
}

export interface ResolvedEdit {
  /** The entry as it will be. */
  draft: EntryDraft;
  /** Why it cannot be saved as it stands, in the editor's words, or null. */
  error: string | null;
  /** Only what changed (`entryPatch`). */
  patch: EntryPatch;
}

/**
 * A SHEET'S SAVE, AS A CORRECTION of the entry it was opened on: its fields read as the draft, every
 * untouched value put back to the entry's own, the editor's checks (`editError`), and the patch.
 */
export function resolveEdit(
  record: EntryRecord,
  fields: ActivityFields,
  ctx: EditContext,
): ResolvedEdit {
  const type = record.activity.type;
  const before = draftFrom(record);
  const next = draftFromFields(before, type, fields);
  const untouched = draftFromFields(before, type, sheetFields(record, formStart(record), ctx));
  let draft = settle(before, next, untouched);
  // A MEASUREMENT MOVED TO ANOTHER DAY KEEPS ITS TIME OF DAY (the solids audit, H8): the growth
  // sheet's date row says midday, and "the day changes, nothing else" is the rule the editor kept
  if (type === 'growth' && draft.startMs !== before.startMs) {
    const day = localDayKey(ctx.timeZone, draft.startMs);
    draft = { ...draft, startMs: pickedDate(day, before.startMs, ctx.nowMs, ctx.timeZone) };
  }
  return { draft, error: editError(record, draft, ctx.nowMs), patch: entryPatch(record, draft) };
}

/**
 * A MEAL'S FOODS AS THE SHEET SAVES THEM IN AN EDIT: the entry's own list while the lines are as
 * they opened — an older meal's text is read whole, and a line of it can be longer than a saved
 * name may be (`lineProblem` 'long'), so re-saving it would cut it where the parent cannot see —
 * else the lines as typed.
 */
export function editedItems<L>(
  opened: { lines: readonly L[]; items: SolidsItem[] } | null,
  lines: readonly L[],
  sameLines: (a: readonly L[], b: readonly L[]) => boolean,
  fromLines: (lines: readonly L[]) => SolidsItem[],
): SolidsItem[] {
  return opened !== null && sameLines(lines, opened.lines) ? opened.items : fromLines(lines);
}
