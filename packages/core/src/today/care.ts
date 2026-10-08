/**
 * The Care strip (PRODUCT_SPEC.md Addendum C.2; docs/plans/WP5.md D6).
 *
 * Bath, tummy time, medicine and temperature are too infrequent to each deserve a card and
 * too important to hide behind a menu, so they share a two-column strip of compact cells.
 * The strip renders only if at least one of those modules is on — a household that tracks
 * none of them never sees it.
 *
 * A module's due or missed state is not decided here: it is the same `quickAlertFor` the Quick
 * tiles use (`apps/mobile/src/screens/today/nextCard.ts`). The strip's own cell builder, which
 * carried a `due` flag for a caller with no engine, lost its last caller on 2026-09-16 and went
 * on 2026-09-27; what is left here is which modules the strip holds, the medicine's day against
 * its own plan, and the cell's second line.
 */
import { localDayBounds } from './day';
import type { ModuleId } from '../modules/module-registry';
import { agoLabel } from './since';

/**
 * The three modules that can appear in the strip, in their display order.
 *
 * TEMPERATURE IS NOT ONE OF THEM (the owner, 2026-09-16: "temperature should not be in baby
 * care, baby care is only for 3: bath, tummy time, and medicine"). The three that stay are
 * ROUTINES — things a household does on a rhythm and can be late for, which is the whole
 * reason the strip carries a due state. A temperature is a MEASUREMENT: you take one because
 * something is happening, not because it is half past four, and nothing schedules it. It goes
 * back to the Log slider, where a measurement belongs (`logRow` puts everything that is not a
 * care module there).
 */
export const CARE_MODULES = ['bath', 'tummy', 'med'] as const;
export type CareModule = (typeof CARE_MODULES)[number];

/**
 * BATH IS ALWAYS IN THE STRIP (the owner, 2026-09-18: "instead of being able to unhide 'baby
 * care', just have users be able to select which module is shown instead. bath will always, just
 * like in quick log 'edit->'").
 *
 * It is the one of the three that every household with a baby does, on a rhythm, whether or not
 * they schedule it — so it is the anchor that keeps the strip from being a section that
 * disappears for no reason a parent can see. The other two are theirs to choose.
 */
export const CARE_ALWAYS: CareModule = 'bath';

/**
 * WHICH CARE CELLS TODAY DRAWS: the modules the household has on, minus the ones it switched off
 * here, with `CARE_ALWAYS` never removable.
 *
 * THIS REPLACED A HIDE FLAG. The strip used to be all-or-nothing — one crossed-out eye that put
 * the whole thing away, and a heading with "Show" on it to bring it back. That was the right fix
 * for "I do not want to track this" and the wrong shape for "I want two of these three", which is
 * what a household that baths and medicates but does not do tummy time actually wants. A picker
 * is also the same idiom as the Log row's Edit, so there is one way to decide what is on Today
 * rather than two.
 *
 * THE COUNT IS THE LAYOUT, and the caller needs nothing else: three cells is a 1×3 row, two is
 * 1×2, one fills the surface, and an empty list draws nothing at all (`CareTable` returns null).
 * `hidden` carrying an id that is not available, or `CARE_ALWAYS`, is simply ignored — the same
 * defensive read `quickRowWith` does, for the same reason: this is persisted preference data and
 * a stale entry must not be able to empty a section.
 */
export function careShown(
  enabled: readonly CareModule[],
  hidden: readonly ModuleId[] = [],
): CareModule[] {
  const off = new Set(hidden.filter(id => id !== CARE_ALWAYS));
  return CARE_MODULES.filter(m => enabled.includes(m) && !off.has(m));
}

/** What a cell's second line is made from (`careCellLabel`). */
export interface CareCell {
  /** When this module was last logged, or null if never. */
  lastAtMs: number | null;
  /** Bath reads in days ("yesterday"); the others read in elapsed time ("10h 28m ago"). */
  style: 'days' | 'elapsed';
}

/** One care item's day: what its own reminders ask for, and what the log holds. */
export interface CareDayItem {
  /** How many reminder times the item carries. Zero means it asked for none. */
  reminders: number;
  /** How many entries name the item today. */
  today: number;
  /**
   * Today's count PER BABY, when the day is being read for more than one ("Both"). An item's
   * reminders are one baby's plan, so twins' plan is twice it — and two babies' entries added up
   * against one baby's plan read "2 of 1" (the audit of 2026-09-24). Given, it replaces `today`.
   */
  perChild?: readonly number[];
}

/**
 * ONE NUMBER FOR SEVERAL BABIES' DAY OF ONE ITEM, where a reader has room for only one: the
 * count EVERY baby has reached — the smallest. It never says a plan is met while one baby's is
 * not, which is the direction that matters: "1 of 1" on Both after only Ada's vitamin would tell
 * the other parent Liam has had his. Adding them said "2 of 1". A reader that can show each baby
 * (`careRowDetail`'s per-child line, `careDay`'s `perChild`) should.
 */
export function careCountForAll(perChild: readonly number[]): number {
  if (perChild.length === 0) return 0;
  return Math.min(...perChild);
}

export interface CareDay {
  /** The household's own plan for the day, summed over the items that carry reminders. */
  target: number;
  /** What today's log holds for those same items. */
  done: number;
}

/**
 * The day's count for the care items — "1 of 3" — across every item that carries reminders.
 *
 * A cream set to three times a day and applied once is a fact the day should state, and until
 * 2026-09-16 Today stated it nowhere: the tile said "1", the strip said "4h ago", and neither
 * number knew there were meant to be three (the owner: "I've logged once, it does not show
 * alert that it's not enough for today"). The slots carry the alert — that is the schedule's
 * job, and `scheduleDay` does it — and this carries the arithmetic beside it.
 *
 * IT IS ADDITION AND NOTHING ELSE. `target` is the number of reminder times the household typed
 * and `done` is how many entries name those items today. Nothing here judges the gap between
 * them, computes an amount, or has a view about when a thing should be given (CLAUDE.md §2).
 * An item with no reminders is outside the sum entirely — it asked for no plan, so it has none
 * to fall short of — and a fourth application of a three-times item reads "4 of 3", because
 * that is what happened and the app does not correct a caregiver's record.
 */
export function careDay(items: readonly CareDayItem[]): CareDay {
  let target = 0;
  let done = 0;
  for (const item of items) {
    if (item.reminders <= 0) continue;
    // several babies: each carries the item's plan, and each baby's entries count against it
    const babies = item.perChild !== undefined && item.perChild.length > 0 ? item.perChild : null;
    target += item.reminders * (babies === null ? 1 : babies.length);
    done += babies === null ? item.today : babies.reduce((sum, n) => sum + n, 0);
  }
  return { target, done };
}

/** `1 of 3` — short enough for a tile line; null when nothing on the list asked for a plan. */
export const careDayLine = (day: CareDay): string | null =>
  day.target > 0 ? `${day.done} of ${day.target}` : null;

/** True when the strip should render at all. */
export const careStripVisible = (enabled: readonly CareModule[]): boolean => enabled.length > 0;

/** The cell's second line when nothing has ever been logged. */
export const NOT_LOGGED_YET = 'not logged yet';

/**
 * The cell's second line (Addendum C.2; D6): bath reads in DAYS — "today", "yesterday",
 * "4 days ago" — because that is how people talk about baths; the others read in elapsed
 * time — "10h 28m ago". Two functions folded into one switch on `style`, never one function
 * with a flag the caller could get wrong.
 */
export function careCellLabel(
  cell: Pick<CareCell, 'lastAtMs' | 'style'>,
  nowMs: number,
  timeZone: string,
): string {
  if (cell.lastAtMs === null) return NOT_LOGGED_YET;
  if (cell.style === 'elapsed') return agoLabel(cell.lastAtMs, nowMs);
  const today = localDayBounds(timeZone, nowMs);
  if (cell.lastAtMs >= today.startMs) return 'today';
  // count whole local days back from today's start; a day can be 23 or 25 hours long, so the
  // walk is by local day key rather than by 24-hour steps
  let days = 0;
  let cursor = today.startMs;
  while (cell.lastAtMs < cursor && days < 365) {
    days += 1;
    cursor = localDayBounds(timeZone, cursor - 12 * 3_600_000).startMs;
  }
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
