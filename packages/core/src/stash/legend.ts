/**
 * THE LOCATION STRIP UNDER THE STASH TOTAL — which cells it has, and why it is never two rows.
 *
 * The owner, 2026-09-22, looking at the card with four places holding milk: *"thaw can be
 * combined with fridge so it remain 1 row by doing fridge + thaw and on the second line 4 + 4
 * oz. if there is a counter, we need to make it into 4 column, to ensure the strip remains in 1
 * line/row."*
 *
 * TWO RULES, AND THE FIRST IS ABOUT WHERE THE MILK ACTUALLY IS. `THAWED` is not a place a
 * household keeps milk — it is a STATE a bottle is in while it sits on the same fridge shelf as
 * everything else (`ContainerStatus` has `THAWING` for exactly this). Giving it a cell of its
 * own said there were two fridges. Folded, the cell reads `Fridge + thaw` over `4 + 4 oz`: the
 * shelf is one thing, and what is on it is two numbers a parent can still tell apart.
 *
 * The fold is BY KIND and keeps the FRIDGE's own name, because a household may have renamed it
 * — the screenshot that prompted this has a deep freeze called "Garage". A thaw with no fridge
 * beside it keeps its own cell rather than vanishing.
 *
 * THE SECOND RULE IS ARITHMETIC. After the fold the five kinds can produce at most four cells —
 * fridge(+thaw), freezer, deep freeze, counter — so four across always fits one row, and
 * `legendColumns` is that count rather than a constant. A household that ADDED locations of its
 * own can exceed four; there the strip wraps at four rather than at three, which is the honest
 * fallback and still the shortest the legend can be.
 *
 * Pure, and in core rather than beside the screen, because it is the part with a rule in it.
 */
import type { MilkStorageKind } from './constants';

/** What the strip needs to know about one place: its kind, its name and how much is in it. */
export interface LegendPlace<T> {
  kind: MilkStorageKind | null;
  /** What the cell is labelled — the household's short name, already resolved. */
  name: string;
  ml: number;
  /** Whatever the caller needs back to draw the row: the location row, an id, anything. */
  place: T;
}

/** One cell of the strip. `extraMl` is the thaw folded into a fridge, and is null otherwise. */
export interface LegendCell<T> {
  kind: MilkStorageKind | null;
  name: string;
  /** What the fridge itself holds — the FIRST number when a thaw is folded in. */
  ml: number;
  /** The thawing milk on the same shelf, or null when there is none to fold. */
  extraMl: number | null;
  /** The total, which is what the bar segment and the spoken name use. */
  totalMl: number;
  place: T;
}

/** The most cells the five kinds can produce once `THAWED` is folded into `FRIDGE`. */
export const LEGEND_MAX_COLUMNS = 4;

/**
 * The cells, in the order they were given, with any THAWED place folded into the FRIDGE.
 *
 * Several thaws fold into one fridge — a household can have more than one location of a kind —
 * and the fridge keeps its position, because the strip's order is the bar's order and the two
 * have to agree.
 */
export function legendCells<T>(places: readonly LegendPlace<T>[]): LegendCell<T>[] {
  const fridge = places.find(p => p.kind === 'FRIDGE');
  const thawMl = places.filter(p => p.kind === 'THAWED').reduce((n, p) => n + p.ml, 0);
  // the fold happens whenever there IS a fridge, so an empty thaw simply disappears rather than
  // becoming a `+ 0 oz` on the shelf beside it
  const folds = fridge !== undefined;
  return places
    .filter(p => !(folds && p.kind === 'THAWED'))
    .map(p => {
      const extraMl = folds && p === fridge && thawMl > 0 ? thawMl : null;
      return {
        kind: p.kind,
        name: p.name,
        ml: p.ml,
        extraMl,
        totalMl: p.ml + (extraMl ?? 0),
        place: p.place,
      };
    });
}

/**
 * How many cells sit across one row. Never more than four, so the strip is one line for every
 * household that has not made locations of its own — and four rather than three for one that
 * has, so what does wrap, wraps as little as possible.
 */
export const legendColumns = (cells: number): number =>
  Math.max(1, Math.min(LEGEND_MAX_COLUMNS, cells));
