/**
 * The bottle sheet's one rule (PRODUCT_SPEC.md §6.1; docs/plans/WP5.md D16).
 *
 * A bottle records two numbers — what was OFFERED and what was TAKEN — and the only
 * relationship between them that cannot be true is taken > offered. Everything else a parent
 * might enter is legitimate, including the two that look like mistakes:
 *
 *   * **Taken 0 is a real feed.** A refused bottle is information — arguably the most useful
 *     entry of the day — and `0 oz taken · 4 oz offered` is exactly what it should read.
 *     Rejecting it, or "helpfully" treating 0 as empty, would throw away the observation.
 *   * **Offered equal to taken is the common case**, which is why the sheet's default is
 *     `Same as taken` rather than two steppers a parent has to reconcile.
 *
 * And the failure mode this guards: taken > offered must be shown INLINE, above the save
 * button, never fixed silently. Swapping the two numbers "because they were obviously the
 * wrong way round" would write a feed that never happened.
 */

export interface BottleAmounts {
  /** Stored ml actually taken. 0 is valid. */
  consumedMl: number;
  /** Stored ml offered, or null when the sheet is on `Same as taken`. */
  offeredMl: number | null;
}

/** The inline message §6.1 specifies, verbatim. Null when the entry is fine. */
export function bottleError(a: BottleAmounts): string | null {
  if (!Number.isFinite(a.consumedMl) || a.consumedMl < 0) return 'Amount cannot be negative';
  if (a.offeredMl === null) return null;
  if (!Number.isFinite(a.offeredMl) || a.offeredMl < 0) return 'Amount cannot be negative';
  if (a.offeredMl < a.consumedMl) return 'The bottle cannot hold less than the baby took';
  return null;
}

/** True when the sheet may save. */
export const bottleValid = (a: BottleAmounts): boolean => bottleError(a) === null;

/**
 * What to store for `offered_ml`.
 *
 * `Same as taken` stores the same number rather than null, so a later read never has to guess
 * what the parent meant — and so a report that sums offered against taken is comparing two
 * populated columns rather than one column and a fallback.
 */
export const offeredToStore = (a: BottleAmounts): number =>
  a.offeredMl === null ? a.consumedMl : a.offeredMl;

/** True when the entry records a refusal: something was offered and none of it was taken. */
export const isRefused = (a: BottleAmounts): boolean => a.consumedMl === 0 && offeredToStore(a) > 0;

/**
 * WHAT THE SHEET ASKS: THE BOTTLE, AND WHAT WAS LEFT IN IT (the owner, 2026-09-25).
 *
 * After a feed a parent can read two numbers off the bottle: how much was made up, and how much
 * is still in it. What the baby took is their difference. The sheet used to ask for what was
 * TAKEN first and then, under `Some left`, for the size of the bottle — so a parent who entered
 * the bottle (4 oz) and then what was left (1 oz) was told the bottle could not hold less than
 * the baby took. The owner: "the logic is inverted, it wouldnt make sense if the some left is
 * more than selected". So the sheet takes the two numbers in the order they are seen, and this
 * turns them into the entry's two fields — `offered_ml` is the bottle, `consumed_ml` the
 * difference — which is why nothing stored, synced or drawn from the stash changes.
 */
export interface BottleWithLeftover {
  /** What was made up in the bottle, in ml. */
  bottleMl: number;
  /** What was still in it after the feed, in ml; null when the baby finished it. */
  leftoverMl: number | null;
}

/** The inline message for the two numbers the sheet asks for. Null when they are a feed. */
export function leftoverError(b: BottleWithLeftover): string | null {
  if (!Number.isFinite(b.bottleMl) || b.bottleMl < 0) return 'Amount cannot be negative';
  if (b.leftoverMl === null) return null;
  if (!Number.isFinite(b.leftoverMl) || b.leftoverMl < 0) return 'Amount cannot be negative';
  if (b.leftoverMl > b.bottleMl) return 'More is left than was in the bottle';
  return null;
}

/**
 * The entry's amounts: taken is the bottle less what was left, offered is the bottle. A finished
 * bottle keeps `offeredMl: null` (`Same as taken`), and all of it left is a refused bottle —
 * 0 taken, the bottle offered — which D16 says is a real feed.
 */
export function fromLeftover(b: BottleWithLeftover): BottleAmounts {
  if (b.leftoverMl === null) return { consumedMl: b.bottleMl, offeredMl: null };
  return { consumedMl: Math.max(0, b.bottleMl - b.leftoverMl), offeredMl: b.bottleMl };
}
