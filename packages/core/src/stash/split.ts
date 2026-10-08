/**
 * Splitting a pump session, in milliliters (docs/MILK_STASH.md §2; acceptance test 11).
 *
 * `part1` is converted from the display unit ONCE and `part2` is the integer remainder, never
 * a second oz→ml conversion: 6 oz split 4 + 2 stores 118 + 59 = 177 ml, which is exactly
 * `ozToMl(6)`, so the household total moves by the session and by nothing else. A part that
 * would be zero is not a container (11.5): `initial_ml > 0` is a database rule, and a zero-ml
 * row would be a container with no milk and a ledger row with no delta.
 *
 * INTO SEVERAL CONTAINERS, EACH IN ITS OWN PLACE (the owner, 2026-09-29: *"if user pumps, and the
 * result is 9oz, we have the option to keep in stash but split into 2, what if user wants to split
 * into 3 different bottles, with 2 left in counter (4hours), and 1 in the fridge?"*). The same rule,
 * for up to `MAX_SPLIT_PARTS`: every container but the last is a whole number of steps of the
 * parent's unit, converted to ml once; the LAST is the integer remainder, so the containers add up
 * to the session exactly and nothing is ever left unstored by the arithmetic. The split in two that
 * shipped first is the case of two, and writes what it always wrote.
 */
import { mlToVolume, volumeStep, volumeToMl, type VolumeUnit } from '../entry/units';

export function splitSession(totalMl: number, part1Ml: number | null): number[] {
  if (!Number.isInteger(totalMl) || totalMl <= 0) {
    throw new RangeError(`a session to store needs a positive whole number of ml, got ${totalMl}`);
  }
  if (part1Ml === null) return [totalMl];
  if (!Number.isInteger(part1Ml) || part1Ml < 0 || part1Ml > totalMl) {
    throw new RangeError(`the first part is outside 0..${totalMl} ml: ${part1Ml}`);
  }
  const part2 = totalMl - part1Ml;
  if (part1Ml === 0) return [totalMl];
  if (part2 === 0) return [totalMl];
  return [part1Ml, part2];
}

/* ------------------------------------------------------------------ into several containers */

/**
 * THE MOST CONTAINERS ONE SESSION GOES INTO. Six is a big session poured into a day of small
 * bottles, and still a list a parent reads at a glance on one sheet. It is bookkeeping, like
 * `MIN_SUGGEST_ML`: never a claim about how much a container should hold. The ids a split writes
 * are lettered up to it (`splitPartTag`).
 */
export const MAX_SPLIT_PARTS = 6;

/**
 * The letter a split's container is derived under: `'a'`, `'b'` … `'f'` (§3: `uuidv5(op,'a')`,
 * `uuidv5(op,'b')`). The first two are the halves of the split in two that shipped first, so a
 * two-way split writes the ids it always has; a session kept as one has no letter at all
 * (`containerAddChain`'s plain tags). A retry derives the same letters, so a replay writes nothing
 * twice.
 */
export function splitPartTag(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_SPLIT_PARTS) {
    throw new RangeError(`a split has containers 0..${MAX_SPLIT_PARTS - 1}, got ${index}`);
  }
  return String.fromCharCode(97 + index);
}

const requireSession = (totalMl: number): void => {
  if (!Number.isInteger(totalMl) || totalMl <= 0) {
    throw new RangeError(`a session to store needs a positive whole number of ml, got ${totalMl}`);
  }
};

const sum = (mls: readonly number[]): number => mls.reduce((a, b) => a + b, 0);

/** One step of the unit's grid, a quarter ounce or five milliliters, in whole ml: 7 or 5. */
export const splitStepMl = (unit: VolumeUnit): number => volumeToMl(volumeStep(unit), unit);

/** How many steps of the grid a session reads as: 9 oz is 36 quarters, 250 mL is 50 fives. */
function gridSteps(totalMl: number, unit: VolumeUnit): number {
  return Math.round(mlToVolume(totalMl, unit) / volumeStep(unit));
}

/**
 * The even split, unchecked (`evenSplit` and `maxSplitParts` both read it). The session's steps
 * are shared out as evenly as they go, so two containers never differ by more than one step as
 * they read; the steps that do not share out go to the LAST containers, which is where the split
 * in two always put the odd quarter (5.25 oz is 2.5 + 2.75). The last container takes the
 * remainder in ml, and with it the few ml by which the session is off the grid.
 */
function spread(totalMl: number, count: number, unit: VolumeUnit): number[] {
  const step = volumeStep(unit);
  const steps = gridSteps(totalMl, unit);
  const base = Math.floor(steps / count);
  const extra = steps - base * count;
  const parts: number[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    // a whole number of quarters or fives: `n * step` is exact in floating point for both
    const n = base + (i >= count - extra ? 1 : 0);
    parts.push(volumeToMl(n * step, unit));
  }
  parts.push(totalMl - sum(parts));
  return parts;
}

/**
 * How many containers a session can go into: `MAX_SPLIT_PARTS`, and never so many that one would
 * hold less than a step of the parent's unit, since a container is at least the least a stepper can
 * show. A session too small to split is one container; so is no session at all, which the sheet
 * never offers to store.
 */
export function maxSplitParts(totalMl: number, unit: VolumeUnit): number {
  if (!Number.isInteger(totalMl) || totalMl <= 0) return 1;
  let n = Math.min(MAX_SPLIT_PARTS, Math.max(1, gridSteps(totalMl, unit)));
  // the last container takes the rounding: a count that would leave it nothing is not offered
  while (n > 1 && spread(totalMl, n, unit).some(ml => ml <= 0)) n -= 1;
  return n;
}

/**
 * THE SESSION IN `count` CONTAINERS, EVENLY, on the unit's grid: 9 oz in three is 3 + 3 + 3,
 * 10 oz in three is 3.25 + 3.25 + 3.5, and 250 mL in three is 80 + 85 + 85. In ml, adding up to
 * `totalMl` exactly. One container is the whole session.
 */
export function evenSplit(totalMl: number, count: number, unit: VolumeUnit): number[] {
  requireSession(totalMl);
  const most = maxSplitParts(totalMl, unit);
  if (!Number.isInteger(count) || count < 1 || count > most) {
    throw new RangeError(`${totalMl} ml splits into 1..${most} containers, not ${count}`);
  }
  return count === 1 ? [totalMl] : spread(totalMl, count, unit);
}

/** The most a grid value can be and still convert to no more than `ml`. */
function gridAtMost(ml: number, unit: VolumeUnit): number {
  const step = volumeStep(unit);
  let n = Math.floor(mlToVolume(ml, unit) / step) + 1;
  while (n > 0 && volumeToMl(n * step, unit) > ml) n -= 1;
  return n * step;
}

export interface SplitPartBounds {
  /** The least and the most this container may hold, in ml. */
  minMl: number;
  maxMl: number;
  /** The same bounds on the unit's grid, for its stepper: `max` never converts past `maxMl`. */
  min: number;
  max: number;
}

/**
 * THE RANGE ONE CONTAINER'S STEPPER MOVES IN. Every container but the last has a stepper; the
 * last holds the rest (`setSplitPart`). So a container may hold from one step up to whatever
 * leaves the last container one step of its own, with the others as they are. The amount it holds
 * now is always inside its range, so a stepper never opens on a number it cannot show.
 */
export function splitPartBounds(
  parts: readonly number[],
  index: number,
  unit: VolumeUnit,
): SplitPartBounds {
  const last = parts.length - 1;
  if (!Number.isInteger(index) || index < 0 || index >= last) {
    throw new RangeError(
      `containers 0..${last - 1} are set; the last holds the rest, not ${index}`,
    );
  }
  const step = volumeStep(unit);
  const one = splitStepMl(unit);
  const current = parts[index] ?? 0;
  const others = sum(parts.slice(0, last)) - current;
  const minMl = Math.min(one, current);
  const maxMl = Math.max(sum(parts) - others - one, current);
  const shown = mlToVolume(current, unit);
  return {
    minMl,
    maxMl,
    min: Math.min(step, shown),
    max: Math.max(gridAtMost(maxMl, unit), shown),
  };
}

/**
 * ONE CONTAINER SET, AND THE LAST ONE TAKES THE DIFFERENCE, as the second container always took
 * what the first did not ("Second container: 2 oz"). Nothing a stepper does can make the
 * containers add up to anything but the session: an amount outside the container's range is
 * clamped into it (`splitPartBounds`), and the last is the remainder in ml. The last container is
 * never set on its own; a parent who wants more in it takes it from another.
 */
export function setSplitPart(
  parts: readonly number[],
  index: number,
  ml: number,
  unit: VolumeUnit,
): number[] {
  const { minMl, maxMl } = splitPartBounds(parts, index, unit);
  if (!Number.isFinite(ml)) throw new RangeError(`a container holds a number of ml, not ${ml}`);
  const next = parts.slice();
  next[index] = Math.min(maxMl, Math.max(minMl, Math.round(ml)));
  const last = next.length - 1;
  next[last] = sum(parts) - sum(next.slice(0, last));
  return next;
}

/**
 * THE WRITE'S OWN CHECK on a split it is handed (`storePumpSession` in the app's data layer):
 * one to `MAX_SPLIT_PARTS` containers, each a positive whole number of ml, adding up to the stored
 * part EXACTLY. A split that does not add up would move the household total by something other
 * than the session, and the ledger is only worth having if it never does; so it is refused before
 * a row is written, never rounded into shape here.
 */
export function checkSplitParts(totalMl: number, parts: readonly number[]): void {
  requireSession(totalMl);
  if (parts.length < 1 || parts.length > MAX_SPLIT_PARTS) {
    throw new RangeError(`a split has 1..${MAX_SPLIT_PARTS} containers, got ${parts.length}`);
  }
  for (const ml of parts) {
    if (!Number.isInteger(ml) || ml <= 0) {
      throw new RangeError(`every container holds a positive whole number of ml, got ${ml}`);
    }
  }
  const held = sum(parts);
  if (held !== totalMl) {
    throw new RangeError(`the containers hold ${held} ml of a ${totalMl} ml session`);
  }
}

/**
 * Feed some now (§6d): what goes into a bottle and what is stored, both in ml, both from the
 * one session total. `feedMl` of 0 is "store it all"; `feedMl` of the total is "feed it all".
 */
export interface FeedSplit {
  feedMl: number;
  storeMl: number;
}

export function feedSplit(totalMl: number, feedMl: number): FeedSplit {
  if (!Number.isInteger(totalMl) || totalMl <= 0) {
    throw new RangeError(`a session needs a positive whole number of ml, got ${totalMl}`);
  }
  if (!Number.isInteger(feedMl) || feedMl < 0 || feedMl > totalMl) {
    throw new RangeError(`the fed part is outside 0..${totalMl} ml: ${feedMl}`);
  }
  return { feedMl, storeMl: totalMl - feedMl };
}

/**
 * Combining sessions in one container keeps the EARLIER `pumped_at` (§6e): published guidance
 * dates combined milk from the oldest milk in it. Taking the newer timestamp silently extends
 * a best-use date, which is the one arithmetic error here with a real-world consequence.
 */
export function combinedPumpedAt(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}
