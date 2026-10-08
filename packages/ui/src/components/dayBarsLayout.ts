/**
 * `DayBars`' geometry, kept out of the component so the mark specs can be tested in node —
 * the same seam `chartLayout.ts` and `quickLine.ts` already use, because importing a file that
 * imports `react-native` into a node test does not parse.
 *
 * These numbers are FIXED ACROSS EVERY CHART IN THE APP rather than tuned per chart. A bar that
 * quietly grew to 40px or gained a rounded baseline is the kind of drift nobody notices until
 * the whole screen reads loud, so they are constants with a test on them.
 */

/** The two spacers, in points. Both are surface-colored space, never a stroke. */
export const BAR_GAP = 2;
/** A column never fills its band; the leftover is air. */
export const BAR_MAX_WIDTH = 24;
export const BAR_RADIUS = 4;
export const DAY_BARS_HEIGHT = 132;
/** Below this a band is too narrow for a tick, and the ticks go before the bars do. */
export const TICK_MIN_BAND = 22;

/**
 * A rectangle with a rounded data end and a square baseline end.
 *
 * An `rx` on a `Rect` rounds all four corners, which makes a bar look like it is floating rather
 * than growing from the axis — so the mark is a `Path`. The radius is clamped to what the mark
 * can hold: a 3px stub asked for 4px would invert the curve.
 */
export function topRoundedPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return [
    `M${x} ${y + h}`,
    `L${x} ${y + rr}`,
    `Q${x} ${y} ${x + rr} ${y}`,
    `L${x + w - rr} ${y}`,
    `Q${x + w} ${y} ${x + w} ${y + rr}`,
    `L${x + w} ${y + h}`,
    'Z',
  ].join(' ');
}

/** The tallest column — the one gridline's value: a stack is its sum, a group its largest. */
export function columnMax(values: number[][], mode: 'stacked' | 'grouped'): number {
  const days = values[0]?.length ?? 0;
  let max = 0;
  for (let d = 0; d < days; d += 1) {
    const column = values.map(row => row[d] ?? 0);
    max = Math.max(
      max,
      mode === 'stacked' ? column.reduce((a, b) => a + b, 0) : Math.max(0, ...column),
    );
  }
  return max;
}
