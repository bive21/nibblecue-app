/**
 * The arithmetic of a correction (docs/PRODUCT_SPEC.md §4 "Edit", §16; WP5.8), pure so every rule
 * is a table test: the entry as a draft (`draftFrom`), which fields an edit actually changed (the
 * patch carries ONLY those — the server merges per field, and a field that did not change must not
 * claim a newer clock than a caregiver's real edit of it), what stops a save, the words an edit
 * earns, and where a picked time or day lands.
 *
 * AN ENTRY IS CORRECTED ON THE SHEET THAT LOGGED IT since 2026-09-26 (the owner: "shouldnt editing
 * from today's log look the same as you would as if you want to entry … keep it the same"). The
 * separate editor sheet is gone; `sheets/quick/edit` opens the module's own capture sheet on the
 * entry and turns its Save into a draft that ends here, in `entryPatch`, on the same write path.
 *
 * EVERY VALUE A SHEET SAVED IS A VALUE A CORRECTION CAN CHANGE (the owner, 2026-09-19: "logs need
 * to be able to edit anything that user inputs"). A sleep's nap or night, a diaper's color and rash
 * tick, a bath's hair, a pump logged as one total, a breastfeed's first side, a medicine's name, the
 * amount as given and which item it was, a temperature and how it was taken, a growth entry's
 * measurements and its date.
 *
 * Nothing here interprets. An amount is what the parent typed; a time is what they chose.
 */
import {
  dayHeading,
  foodListText,
  itemsForSave,
  itemsOf,
  leftoverError,
  localDayKey,
  noteProblem,
  seenOf,
  tidySpaces,
  wallClock,
  zonedToUtc,
  type ActivityType,
  type SolidsItem,
  type WellbeingSeen,
} from '@nibblecue/core';
import type { EntryAuthorship, EntryRecord } from '../../db/queries/today';
import { pumpOutput, type PumpMode, type PumpState } from '../quick/modules/pumpForm';

/** An entry as a correction reads it, in canonical units (ml, seconds, UTC ms). */
export interface EntryDraft {
  startMs: number;
  /** null for an instant entry, or one whose end the parent cleared. */
  endMs: number | null;
  notes: string;
  /** bottle: ml taken / offered (null = same as taken); kind — what is STORED, and diffed */
  consumedMl?: number;
  offeredMl?: number | null;
  bottleKind?: string;
  /**
   * bottle: THE TWO NUMBERS THE SHEET ASKS, in ml — what was in the bottle, and what was left in
   * it (the owner, 2026-09-25). The stored pair above is what is written; these are what the bottle
   * sheet opens on (`bottleShown`), and a pair that cannot be a feed is SAID (`leftoverProblem`),
   * never clamped.
   */
  bottleMl?: number;
  leftoverMl?: number;
  /** diaper: what was in it, the color chip's word (null when none was tapped), the rash tick */
  diaperKind?: string;
  diaperColor?: string | null;
  diaperRash?: boolean;
  sleepKind?: string;
  /**
   * pump: the two sides, or the ONE TOTAL a total-only session was logged with. A total-only pump
   * opened as Left 0 / Right 0, and one tap on either side overwrote its total with the sum (the
   * feeding audit, C7); `pumpMode` is the pump sheet's own rule (`pumpForm.ts`): the stepper last
   * touched is the source, and a total is written with no invented split.
   */
  pumpMode?: PumpMode;
  leftMl?: number;
  rightMl?: number;
  totalMl?: number;
  /** breastfeed: seconds per side, and which one it started on */
  leftSeconds?: number;
  rightSeconds?: number;
  firstSide?: string | null;
  /**
   * solids: the four things the sheet asks for. They were writable from the first release and
   * EDITABLE from none of it — the editor knew about five types and solids was not one, so a
   * parent who chose the wrong meal or mistyped the food had no way back to it (the owner,
   * 2026-09-19: "logs need to be able to edit anything that user inputs").
   *
   * `observation` is the parent's own sentence and is stored verbatim, here as everywhere: the
   * editor hands it back unchanged and writes back whatever they leave.
   *
   * SINCE 2026-09-24 THE FOODS ARE A LIST (`solidsItems`, docs/SOLIDS.md), edited with the capture
   * sheet's own food lines. A meal from before opens with its text read as that list, and is
   * left exactly as it was unless the foods are actually changed. `taken`, the older "how much of
   * it" scale, is no longer asked and is never rewritten.
   *
   * `meal` is null for a meal saved without one: it used to be written as Snack, a choice nobody
   * made (the solids audit, low). The solids sheet opens such a meal on the sun its time implies,
   * as it does a new one, and the null is kept unless the parent picks a meal or moves the time.
   */
  meal?: string | null;
  solidsItems?: SolidsItem[];
  observation?: string;
  /**
   * med: the item's name AS LOGGED, and the amount AS GIVEN — the parent's own text, repeated and
   * corrected, never parsed, compared or added (CLAUDE.md rule 4; the solids audit, H7).
   */
  medName?: string;
  medAmount?: string;
  /**
   * med: WHICH OF THE HOUSEHOLD'S ITEMS it was, and how it is given. The medicine sheet corrects an
   * entry by ticking another row of its list (edit mode, `sheets/quick/edit`), and the row it ticks
   * is an item: its name, its route and its id travel together, or the care list's "1 of 1 today"
   * would go on counting the entry against the item it no longer names. Null for an entry from
   * before the list, or of an item since archived.
   */
  medItemId?: string | null;
  medRoute?: string | null;
  /** temp: hundredths of a degree Celsius, and how it was taken (the solids audit, H8) */
  tempCHundredths?: number | null;
  tempMethod?: string | null;
  /** growth: canonical grams and millimeters, each independent; null = not measured (H8) */
  weightG?: number | null;
  lengthMm?: number | null;
  headMm?: number | null;
  /** bath: `metadata.hair_washed`, or null for a bath that never said */
  hairWashed?: boolean | null;
  /**
   * wellbeing (the Health note, 2026-10-08): the chips as tapped, in the sheet's order. Its words
   * are `notes` and its stop is `endMs` (null: still going), like any entry's.
   */
  wellbeingSeen?: WellbeingSeen[];
}

const ms = (iso: string | null): number | null => (iso === null ? null : Date.parse(iso));
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : fallback);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** The row's `metadata` as an object; a damaged or absent one reads as empty, never throws. */
function metadataOf(record: EntryRecord): Record<string, unknown> {
  const raw = record.activity.metadata;
  if (typeof raw !== 'string' || raw === '') return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The draft as the row is today — the editor opens on it and diffs against it. */
export function draftFrom(record: EntryRecord): EntryDraft {
  const { activity: a, detail: d } = record;
  const base: EntryDraft = {
    startMs: Date.parse(a.start_at),
    endMs: ms(a.end_at),
    notes: a.notes ?? '',
  };
  switch (a.type) {
    case 'bottle': {
      const consumedMl = num(d?.['consumed_ml']);
      const offeredMl = typeof d?.['offered_ml'] === 'number' ? d['offered_ml'] : null;
      return {
        ...base,
        consumedMl,
        offeredMl,
        bottleKind: str(d?.['kind'], 'EBM'),
        ...bottleShown(consumedMl, offeredMl),
      };
    }
    case 'diaper': {
      const color = d?.['color'];
      return {
        ...base,
        diaperKind: str(d?.['kind'], 'WET'),
        diaperColor: typeof color === 'string' && color.trim() !== '' ? color : null,
        // the mirror stores 0/1; a delta pull can hand the driver a JSON boolean
        diaperRash: d?.['rash'] === 1 || d?.['rash'] === true,
      };
    }
    case 'sleep':
      return { ...base, sleepKind: str(d?.['kind'], 'NAP') };
    case 'pump': {
      const left = numOrNull(d?.['left_ml']);
      const right = numOrNull(d?.['right_ml']);
      // BOTH SIDES NULL IS A TOTAL-ONLY SESSION ("Total only" on the sheet, `storePumpSession`):
      // it opens on its total, not on two zeros that a tap would add up over it
      return left === null && right === null
        ? { ...base, pumpMode: 'total', leftMl: 0, rightMl: 0, totalMl: num(d?.['total_ml']) }
        : {
            ...base,
            pumpMode: 'side',
            leftMl: left ?? 0,
            rightMl: right ?? 0,
            totalMl: (left ?? 0) + (right ?? 0),
          };
    }
    case 'breastfeed':
      return {
        ...base,
        leftSeconds: num(d?.['left_seconds']),
        rightSeconds: num(d?.['right_seconds']),
        firstSide: typeof d?.['first_side'] === 'string' ? d['first_side'] : null,
      };
    case 'solids':
      return {
        ...base,
        meal: typeof d?.['meal'] === 'string' && d['meal'] !== '' ? d['meal'] : null,
        solidsItems: itemsOf({
          items: d?.['items'] ?? null,
          food: typeof d?.['food'] === 'string' ? d['food'] : null,
        }),
        observation: str(d?.['observation']),
      };
    case 'med':
      return {
        ...base,
        medName: str(d?.['name']),
        medAmount: str(d?.['amount_text']),
        medItemId: typeof d?.['care_item_id'] === 'string' ? d['care_item_id'] : null,
        medRoute: typeof d?.['route'] === 'string' ? d['route'] : null,
      };
    case 'temp':
      return {
        ...base,
        tempCHundredths: numOrNull(d?.['temp_c_hundredths']),
        tempMethod: typeof d?.['temp_method'] === 'string' ? d['temp_method'] : null,
      };
    case 'growth':
      return {
        ...base,
        weightG: numOrNull(d?.['weight_g']),
        lengthMm: numOrNull(d?.['length_mm']),
        headMm: numOrNull(d?.['head_mm']),
      };
    case 'bath': {
      const hair = metadataOf(record)['hair_washed'];
      return { ...base, hairWashed: typeof hair === 'boolean' ? hair : null };
    }
    case 'wellbeing':
      // the mirror holds the chips as JSON array text; a note whose chips have not arrived is none
      return { ...base, wellbeingSeen: seenOf(d?.['seen'] ?? null) };
    default:
      return base;
  }
}

export interface EntryPatch {
  patch: Record<string, unknown>;
  detailPatch: Record<string, unknown> | undefined;
  /** Something actually changed. */
  changed: boolean;
}

/** A pump draft as `pumpForm`'s state, read by the sheet's own rule for what is written. */
const pumpStateOf = (d: EntryDraft): PumpState => ({
  mode: d.pumpMode ?? 'side',
  amounts: { leftMl: d.leftMl ?? 0, rightMl: d.rightMl ?? 0, totalMl: d.totalMl ?? 0 },
});

/** What a pump draft writes: the two sides, or the one total with both sides null. */
function pumpWrite(d: EntryDraft): {
  sides: 'LEFT' | 'RIGHT' | 'BOTH';
  left_ml: number | null;
  right_ml: number | null;
  total_ml: number;
} {
  const s = pumpStateOf(d);
  const out = pumpOutput(s.mode, {
    ...s.amounts,
    totalMl: s.mode === 'total' ? s.amounts.totalMl : s.amounts.leftMl + s.amounts.rightMl,
  });
  // `sides` says which sides were pumped. A total says both, with the split unknown; so does a
  // session with nothing on either side, which is not a claim that it was the right (the feeding
  // audit, C13)
  const sides =
    out.leftMl !== null && out.rightMl === null
      ? 'LEFT'
      : out.rightMl !== null && out.leftMl === null
        ? 'RIGHT'
        : 'BOTH';
  return { sides, left_ml: out.leftMl, right_ml: out.rightMl, total_ml: out.totalMl };
}

const minutesBetween = (fromMs: number, toMs: number): number =>
  Math.max(0, Math.round((toMs - fromMs) / 60_000));

/**
 * Only the fields that differ from the row, so an untouched field keeps its own clock
 * (OFFLINE_SYNC §5). `quantity` mirrors the canonical amount the way the sheets write it — for a
 * tummy session that is its minutes, which follow its edited times (the care audit, H5).
 */
export function entryPatch(record: EntryRecord, draft: EntryDraft): EntryPatch {
  const before = draftFrom(record);
  const patch: Record<string, unknown> = {};
  const detail: Record<string, unknown> = {};
  if (draft.startMs !== before.startMs) patch['start_at'] = new Date(draft.startMs).toISOString();
  if (draft.endMs !== before.endMs) {
    patch['end_at'] = draft.endMs === null ? null : new Date(draft.endMs).toISOString();
  }
  const notes = draft.notes.trim() || null;
  if (notes !== (record.activity.notes ?? null)) patch['notes'] = notes;

  switch (record.activity.type) {
    case 'bottle':
      if (draft.consumedMl !== before.consumedMl) {
        detail['consumed_ml'] = draft.consumedMl;
        patch['quantity'] = draft.consumedMl;
      }
      if (draft.offeredMl !== before.offeredMl) detail['offered_ml'] = draft.offeredMl ?? null;
      if (draft.bottleKind !== before.bottleKind) detail['kind'] = draft.bottleKind;
      break;
    case 'diaper':
      if (draft.diaperKind !== before.diaperKind) detail['kind'] = draft.diaperKind;
      if ((draft.diaperColor ?? null) !== (before.diaperColor ?? null)) {
        detail['color'] = draft.diaperColor ?? null;
      }
      if ((draft.diaperRash ?? false) !== (before.diaperRash ?? false)) {
        detail['rash'] = draft.diaperRash === true;
      }
      break;
    case 'sleep':
      if (draft.sleepKind !== before.sleepKind) detail['kind'] = draft.sleepKind;
      break;
    case 'tummy':
      // THE MINUTES FOLLOW THE TIMES: an edited start or end left `quantity` at the old minutes,
      // and the download's duration and quantity disagreed about the same session
      if (
        draft.endMs !== null &&
        (draft.startMs !== before.startMs || draft.endMs !== before.endMs)
      ) {
        const minutes = minutesBetween(draft.startMs, draft.endMs);
        if (minutes !== record.activity.quantity) patch['quantity'] = minutes;
      }
      break;
    case 'solids': {
      if ((draft.meal ?? null) !== (before.meal ?? null)) detail['meal'] = draft.meal ?? null;
      // THE LIST, WHOLE, AND THE TEXT BESIDE IT — written together, exactly as `SolidsSheet` writes
      // them, and only when the foods actually changed: an older meal whose foods were not touched
      // keeps its text and gets no list (docs/SOLIDS.md §3).
      //
      // CHANGED IS JUDGED ON THE FULL LISTS, BEFORE `itemsForSave` TRIMS THEM (the solids audit,
      // M6). An older meal can open with 21 parts, or a part longer than a saved name; comparing
      // the TRIMMED lists called "remove the 21st" or "shorten it to its first 60 characters" no
      // change at all, and Save stayed disabled on exactly the edit the sheet had asked for.
      const full = (items: readonly SolidsItem[]): string =>
        JSON.stringify(
          items.map(i => ({ ...i, name: tidySpaces(i.name) })).filter(i => i.name !== ''),
        );
      if (full(draft.solidsItems ?? []) !== full(before.solidsItems ?? [])) {
        const items = itemsForSave(draft.solidsItems ?? []);
        detail['items'] = items;
        detail['food'] = foodListText(items);
      }
      const observation = (draft.observation ?? '').trim() || null;
      if (observation !== ((before.observation ?? '').trim() || null)) {
        detail['observation'] = observation;
      }
      break;
    }
    case 'pump': {
      const now = pumpWrite(draft);
      const was = pumpWrite(before);
      if (
        now.left_ml !== was.left_ml ||
        now.right_ml !== was.right_ml ||
        now.total_ml !== was.total_ml
      ) {
        detail['sides'] = now.sides;
        detail['left_ml'] = now.left_ml;
        detail['right_ml'] = now.right_ml;
        detail['total_ml'] = now.total_ml;
        patch['quantity'] = now.total_ml;
      }
      break;
    }
    case 'breastfeed':
      if (draft.leftSeconds !== before.leftSeconds || draft.rightSeconds !== before.rightSeconds) {
        const l = draft.leftSeconds ?? 0;
        const r = draft.rightSeconds ?? 0;
        detail['left_seconds'] = l;
        detail['right_seconds'] = r;
        patch['quantity'] = Math.round((l + r) / 60);
      }
      if (draft.firstSide !== before.firstSide) detail['first_side'] = draft.firstSide ?? null;
      break;
    case 'med': {
      // the name is required by the row (`med_details.name not null`); an emptied one is refused
      // by `fieldError` and never written
      const name = tidySpaces(draft.medName ?? '');
      if (name !== '' && name !== tidySpaces(before.medName ?? '')) detail['name'] = name;
      const amount = (draft.medAmount ?? '').trim() || null;
      if (amount !== ((before.medAmount ?? '').trim() || null)) detail['amount_text'] = amount;
      // the item and its route, only when another row was ticked (the server merges them per
      // field, 0114's `med_details` branch); an untouched entry keeps its own, null included
      if ((draft.medItemId ?? null) !== (before.medItemId ?? null)) {
        detail['care_item_id'] = draft.medItemId ?? null;
      }
      if ((draft.medRoute ?? null) !== (before.medRoute ?? null) && draft.medRoute) {
        detail['route'] = draft.medRoute;
      }
      break;
    }
    case 'temp':
      if (
        typeof draft.tempCHundredths === 'number' &&
        draft.tempCHundredths !== before.tempCHundredths
      ) {
        detail['temp_c_hundredths'] = draft.tempCHundredths;
        // the row's own quantity is the reading, as `TempSheet` writes it
        if (draft.tempCHundredths !== record.activity.quantity) {
          patch['quantity'] = draft.tempCHundredths;
        }
      }
      if ((draft.tempMethod ?? null) !== (before.tempMethod ?? null)) {
        detail['temp_method'] = draft.tempMethod ?? null;
      }
      break;
    case 'growth': {
      const weight = draft.weightG ?? null;
      if (weight !== (before.weightG ?? null)) {
        detail['weight_g'] = weight;
        // the row's own quantity is the weight where there is one, as `GrowthSheet` writes it: a
        // growth entry with no weight is a length, and a quantity of 0 would read "weighed nothing"
        if (weight !== record.activity.quantity) patch['quantity'] = weight;
        const unit = weight === null ? null : 'g';
        if (unit !== record.activity.canonical_unit) patch['canonical_unit'] = unit;
      }
      if ((draft.lengthMm ?? null) !== (before.lengthMm ?? null)) {
        detail['length_mm'] = draft.lengthMm ?? null;
      }
      if ((draft.headMm ?? null) !== (before.headMm ?? null)) {
        detail['head_mm'] = draft.headMm ?? null;
      }
      break;
    }
    case 'wellbeing': {
      // the chips, replaced whole when they changed (0160's branch replaces, never merges)
      const now = draft.wellbeingSeen ?? [];
      if (JSON.stringify(now) !== JSON.stringify(before.wellbeingSeen ?? [])) detail['seen'] = now;
      break;
    }
    case 'bath':
      // HAIR LIVES IN `metadata` (bath has no detail table). The WHOLE object is written, the
      // row's own keys kept: the local write replaces the column, and the server merges what it
      // is sent into what it has, recomputing its own field clocks over the top.
      if (typeof draft.hairWashed === 'boolean' && draft.hairWashed !== before.hairWashed) {
        patch['metadata'] = { ...metadataOf(record), hair_washed: draft.hairWashed };
      }
      break;
    default:
      break;
  }
  const changed = Object.keys(patch).length > 0 || Object.keys(detail).length > 0;
  return { patch, detailPatch: Object.keys(detail).length > 0 ? detail : undefined, changed };
}

/* ------------------------------------------------------------ a bottle's two numbers */

/**
 * The two numbers a stored bottle opens on. For every row a capture sheet writes, the bottle is
 * `offered_ml` — or `consumed_ml` when offered is null ("same as taken", from before the sheet
 * stored both) — and what was left is the bottle less what was taken. The `max` only matters for a
 * row no sheet writes (offered below taken): it opens as a finished bottle of what was taken rather
 * than as a negative leftover.
 */
export function bottleShown(
  consumedMl: number,
  offeredMl: number | null,
): { bottleMl: number; leftoverMl: number } {
  const bottleMl = Math.max(offeredMl ?? consumedMl, consumedMl);
  return { bottleMl, leftoverMl: bottleMl - consumedMl };
}

/** The two numbers as core reads them. */
const bottlePair = (draft: EntryDraft) => ({
  bottleMl: draft.bottleMl ?? draft.consumedMl ?? 0,
  leftoverMl: draft.leftoverMl ?? 0,
});

/**
 * Why a bottle's two numbers are not a feed, in core's words (`leftoverError`: "More is left than
 * was in the bottle"), or null when they are.
 */
export function leftoverProblem(draft: EntryDraft): string | null {
  return leftoverError(bottlePair(draft));
}

/* ------------------------------------------------------------ attribution (WP11) */

/**
 * "at 8:14 PM" · "yesterday at 8:14 PM" · "on Sun Sep 14 at 8:14 PM" — a write's own clock,
 * as a phrase that can be dropped into a sentence.
 *
 * THE DAY IS PART OF IT, and that is the whole reason this is not just `formatClock`. The
 * sheet's Time row shows when the FEED happened; this shows when somebody TYPED it, and the
 * two can be days apart — a parent catching up on Sunday evening writes Friday's entries.
 * "Added by Dad at 8:14 PM" on a Friday row read on Sunday is a small lie about who was
 * awake when.
 *
 * `dayHeading` owns the relative words so the editor and the log agree on what "Yesterday"
 * means across a DST boundary; only its capital Y is adjusted, because it lands mid-sentence
 * here and "on yesterday" is not English.
 */
export function whenPhrase(
  atMs: number,
  nowMs: number,
  timeZone: string,
  clock: (ms: number) => string,
): string {
  const at = clock(atMs);
  const dayKey = localDayKey(timeZone, atMs);
  if (dayKey === localDayKey(timeZone, nowMs)) return `at ${at}`;
  const heading = dayHeading(dayKey, nowMs, timeZone);
  return heading === 'Yesterday' ? `yesterday at ${at}` : `on ${heading} at ${at}`;
}

/**
 * The byline: who logged the entry, and who last changed it if anyone has.
 *
 * It NAMES AND TIMES, and stops there. No "you", no "not you", no ordering of one caregiver
 * against another — the household reads this line, and an app that phrases a record as
 * somebody's fault is doing something other than record-keeping. A missing name degrades to
 * the plain fact ("Added at 8:14 PM") rather than to a placeholder, because "Added by
 * Unknown" invents a person.
 */
export function attributionLine(by: EntryAuthorship, when: (atMs: number) => string): string {
  const added =
    by.byName === null
      ? `Added ${when(by.createdAtMs)}`
      : `Added by ${by.byName} ${when(by.createdAtMs)}`;
  if (by.editedAtMs === null) return added;
  const edited =
    by.editedByName === null
      ? `edited ${when(by.editedAtMs)}`
      : `edited by ${by.editedByName} ${when(by.editedAtMs)}`;
  return `${added} · ${edited}`;
}

/** §16: a bottle says what it is now; everything else is `Entry updated`. Neither is undoable. */
export const ENTRY_UPDATED = 'Entry updated';
/**
 * Somebody else's entry, open on a caregiver's phone (PRODUCT_SPEC §11: a caregiver changes only
 * their own entries). Said at the sheet's foot in place of Delete, with the sheet's Save off, in
 * the words the baby's photo already uses.
 */
export const ENTRY_READ_ONLY = 'A parent or the owner can change this entry.';
export const ENTRY_DELETED = 'Entry deleted';
export const ENTRY_RESTORED = 'Entry restored';
export const bottleUpdated = (amount: string, clock: string): string =>
  `Bottle updated: ${amount} at ${clock}`;

/** A minute of slack for "now", as the time picks allow (`pickedNear`). */
const NOW_SLACK_MS = 60_000;

export const END_BEFORE_START = 'The end cannot be before the start';
export const END_AFTER_NOW = 'The end cannot be later than now';
const START_AFTER_NOW = 'The start cannot be later than now';

/**
 * The end may not precede the start; a length of zero is allowed (a nap that did not take). With
 * `nowMs`, neither may be later than now: a start moved later carried the end with it into the
 * future and nothing said so (the care audit, C5).
 */
export function rangeError(draft: EntryDraft, nowMs?: number): string | null {
  if (draft.endMs !== null && draft.endMs < draft.startMs) return END_BEFORE_START;
  if (nowMs !== undefined) {
    if (draft.endMs !== null && draft.endMs > nowMs + NOW_SLACK_MS) return END_AFTER_NOW;
    if (draft.startMs > nowMs + NOW_SLACK_MS) return START_AFTER_NOW;
  }
  return null;
}

/**
 * WHAT STOPS A SAVE, in the order a parent would fix it: the times, then a field the row needs.
 *
 * The "later than now" half applies only once the parent has MOVED a time. An entry another phone
 * wrote a minute into the future (its clock ran fast) must not refuse a corrected note: the check
 * exists so an edit cannot push an entry into the future, not to reopen what was already written.
 */
export function editError(record: EntryRecord, draft: EntryDraft, nowMs: number): string | null {
  const before = draftFrom(record);
  const moved = draft.startMs !== before.startMs || draft.endMs !== before.endMs;
  return rangeError(draft, moved ? nowMs : undefined) ?? fieldError(record.activity.type, draft);
}

export const MED_NAME_NEEDED = 'Name what was given';
export const GROWTH_ONE_NEEDED = 'Keep at least one measurement';
export const GROWTH_ABOVE_ZERO = 'A measurement needs a number above zero. Switch it off instead.';

/**
 * A field the row cannot be saved without. A medicine entry's name is required by its row; a growth
 * entry with no measurement is not an entry (`GrowthSheet` says so by disabling Save), and the
 * server refuses a measurement of zero. A bottle's two numbers have to be a feed — said, never
 * clamped (`leftoverProblem`).
 */
export function fieldError(type: ActivityType, draft: EntryDraft): string | null {
  if (type === 'bottle' && draft.bottleMl !== undefined) return leftoverProblem(draft);
  // a Health note keeps a chip or some words: corrected to neither, it would say nothing
  if (type === 'wellbeing') return noteProblem(draft.wellbeingSeen ?? [], draft.notes);
  if (type === 'med' && tidySpaces(draft.medName ?? '') === '') return MED_NAME_NEEDED;
  if (type === 'growth') {
    const values = [draft.weightG, draft.lengthMm, draft.headMm].filter(
      (v): v is number => typeof v === 'number',
    );
    if (values.length === 0) return GROWTH_ONE_NEEDED;
    if (values.some(v => v <= 0)) return GROWTH_ABOVE_ZERO;
  }
  return null;
}

/**
 * Filter chips (§4): `Everything` plus one chip per type PRESENT in the data AND enabled. A type
 * that was logged and then turned off still shows its rows under Everything, but earns no chip.
 */
export function filterChips(
  present: readonly ActivityType[],
  enabled: readonly string[],
): ActivityType[] {
  return present.filter(t => enabled.includes(t));
}

/**
 * A PICKED CLOCK TIME, ON THE DAY NEAREST THE VALUE IT CORRECTS (the care audit, C5).
 *
 * The picker answers only "which hour and minute", so the day has to be worked out, and the
 * entry's OWN day was wrong at every midnight: a night sleep's 11:30 PM start corrected to
 * 12:15 AM landed on the morning of the day it began (and moved the entry back a day), an 11:40 PM
 * end corrected to 5:00 AM was "before the start", and 00:30 corrected to 11:50 PM made a 26-hour
 * sleep. A correction is a small move, so of the three candidates — the day before, the same day,
 * the day after — the one nearest the old value is the one meant. Then the "later than now" rule
 * still applies: more than a minute past now is last night (D13).
 */
export function pickedNear(
  picked: { hours: number; minutes: number },
  anchorMs: number,
  nowMs: number,
  timeZone: string,
): number {
  const w = wallClock(timeZone, anchorMs);
  let best: number | null = null;
  for (const offset of [0, -1, 1]) {
    const c = zonedToUtc(timeZone, w.year, w.month, w.day + offset, picked.hours, picked.minutes);
    // the same day wins a tie, then the earlier one: neither ever moves an entry into the future
    if (best === null || Math.abs(c - anchorMs) < Math.abs(best - anchorMs)) best = c;
  }
  let at = best ?? anchorMs;
  if (at > nowMs + NOW_SLACK_MS) {
    const b = wallClock(timeZone, at);
    at = zonedToUtc(timeZone, b.year, b.month, b.day - 1, picked.hours, picked.minutes);
  }
  return at;
}

/**
 * A MEASUREMENT'S DATE, CORRECTED (the solids audit, H8: a growth entry offered a clock time and no
 * way to change the day). The chosen day at the entry's own time of day, in the household's zone —
 * the day is what changes, nothing else — and never later than now. The growth sheet's date row
 * says a day; a correction moved to another one keeps its time here (`sheets/quick/edit/forms.ts`).
 */
export function pickedDate(
  dayKey: string,
  anchorMs: number,
  nowMs: number,
  timeZone: string,
): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined || [y, m, d].some(Number.isNaN)) {
    return anchorMs;
  }
  const w = wallClock(timeZone, anchorMs);
  return Math.min(zonedToUtc(timeZone, y, m, d, w.hour, w.minute), nowMs);
}
