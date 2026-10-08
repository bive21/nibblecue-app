/**
 * A stacked bar's arithmetic, apart from the view that draws it (`StackedBar.tsx`) so it is
 * tested in node — the same split `chartLayout.ts` and `quickScale.ts` make, and for the same
 * reason: "is the 1% segment visible" is a question about numbers and a phone is a poor place
 * to check it.
 */

export interface BarSegment {
  key: string;
  /** Any non-negative number in any unit; the bar works in shares of their sum. */
  value: number;
  color: string;
}

/** A segment smaller than this is drawn at this, so a 1% share is still a shape on the bar. */
export const MIN_SHARE = 0.035;

/**
 * Shares that add to 1, with nothing visible rounded away.
 *
 * THE SMALLEST SEGMENT IS STILL A SHAPE. A counter holding 1.5 oz of 184.5 is eight tenths of a
 * percent, which across a phone's width is under three points and reads as the gap beside it. So
 * every visible segment is lifted to `MIN_SHARE`, and what that costs is taken from the LARGEST
 * one — the bar has to keep adding to 1 or its last rounded end leaves the track.
 *
 * A value that is not a positive number is nothing, never a segment: a bar is not the place to
 * discover that a total arrived as NaN.
 */
export function barShares(values: readonly number[]): number[] {
  const safe = values.map(v => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = safe.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return safe.map(() => 0);
  const shares = safe.map(v => v / total);
  let owed = 0;
  for (let i = 0; i < shares.length; i++) {
    const s = shares[i] ?? 0;
    if (s > 0 && s < MIN_SHARE) {
      owed += MIN_SHARE - s;
      shares[i] = MIN_SHARE;
    }
  }
  if (owed === 0) return shares;
  let biggest = 0;
  for (let i = 1; i < shares.length; i++)
    if ((shares[i] ?? 0) > (shares[biggest] ?? 0)) biggest = i;
  shares[biggest] = Math.max(MIN_SHARE, (shares[biggest] ?? 0) - owed);
  return shares;
}
