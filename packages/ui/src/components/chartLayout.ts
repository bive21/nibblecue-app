/**
 * The geometry behind `Chart` (docs/DESIGN_SYSTEM.md §5 "Chart", the prototype's barChart):
 * bars sized to the slot, the current period distinguished, a dashed gridline at the REAL
 * maximum with its value labeled, and at most eight x ticks. Pure so it can be unit-tested
 * and reused by the admin console's report pages; `Chart.tsx` only draws what this returns.
 */
export interface ChartPoint {
  /** The period's timestamp (epoch ms). */
  t: number;
  v: number;
}

export interface ChartBar {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Horizontal center, for the value label and the line's point. */
  cx: number;
  /** The period being lived in now: full opacity; the rest at 52%. */
  current: boolean;
}

export interface ChartGeometry {
  width: number;
  height: number;
  /** The real maximum of the series (never the padded scale top). */
  max: number;
  /** Scale top: the maximum with 20% of air above it, so the tallest bar never touches the label. */
  scaleMax: number;
  baselineY: number;
  /** Where the dashed maximum gridline sits. */
  maxY: number;
  slot: number;
  barWidth: number;
  bars: ChartBar[];
  /** Line-chart vertices, one per point. */
  points: { x: number; y: number }[];
  /** Indexes that get an x label: every point up to eight, then every ceil(n/7)th. */
  tickIndexes: number[];
  /** The current period's index, or -1 for an empty series. */
  currentIndex: number;
  /** Whether the current bar carries its own value label (only when it is not the maximum). */
  labelCurrent: boolean;
}

export interface ChartLayoutOptions {
  width: number;
  height: number;
  /** Defaults to the last period. */
  currentIndex?: number;
  /** Room above the tallest bar for its label. */
  top?: number;
  /** Room under the baseline for the x labels. */
  bottom?: number;
  maxBarWidth?: number;
}

export const CHART_DEFAULTS = { height: 112, top: 16, bottom: 18, maxBarWidth: 26 } as const;

export function chartLayout(series: ChartPoint[], o: ChartLayoutOptions): ChartGeometry {
  const { width, height } = o;
  const top = o.top ?? CHART_DEFAULTS.top;
  const bottom = o.bottom ?? CHART_DEFAULTS.bottom;
  const n = series.length;
  const baselineY = height - bottom;
  const plotH = Math.max(0, height - top - bottom);
  const values = series.map(p => (Number.isFinite(p.v) ? Math.max(0, p.v) : 0));
  // `Math.max(1, …)`: an all-zero week still draws a baseline and a "0" line, not a NaN
  const max = values.length ? Math.max(1, ...values) : 1;
  const scaleMax = max * 1.2;
  const slot = n > 0 ? width / n : width;
  const barWidth = Math.min(o.maxBarWidth ?? CHART_DEFAULTS.maxBarWidth, slot * 0.6);
  const currentIndex = n === 0 ? -1 : clampIndex(o.currentIndex ?? n - 1, n);
  const yFor = (v: number): number => baselineY - (v / scaleMax) * plotH;
  const bars: ChartBar[] = values.map((v, i) => {
    // a logged zero shows as a 2px stub so "nothing" and "not yet drawn" look different
    const h = v > 0 ? Math.max(2, (v / scaleMax) * plotH) : 0;
    const x = i * slot + (slot - barWidth) / 2;
    return {
      index: i,
      x,
      y: baselineY - h,
      w: barWidth,
      h,
      cx: x + barWidth / 2,
      current: i === currentIndex,
    };
  });
  const points = values.map((v, i) => ({ x: i * slot + slot / 2, y: yFor(v) }));
  const every = n <= 8 ? 1 : Math.ceil(n / 7);
  const tickIndexes = values.map((_, i) => i).filter(i => i % every === 0);
  const currentValue = currentIndex >= 0 ? values[currentIndex] : undefined;
  return {
    width,
    height,
    max,
    scaleMax,
    baselineY,
    maxY: yFor(max),
    slot,
    barWidth,
    bars,
    points,
    tickIndexes,
    currentIndex,
    labelCurrent: currentValue !== undefined && currentValue !== max,
  };
}

function clampIndex(i: number, n: number): number {
  if (!Number.isFinite(i)) return n - 1;
  return Math.min(n - 1, Math.max(0, Math.floor(i)));
}

/** The SVG `points` attribute for a polyline, rounded so the string stays small. */
export const polylinePoints = (points: { x: number; y: number }[]): string =>
  points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** The closed area under a line, back along the baseline. */
export function areaPoints(points: { x: number; y: number }[], baselineY: number): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return '';
  return `${first.x.toFixed(1)},${baselineY.toFixed(1)} ${polylinePoints(points)} ${last.x.toFixed(1)},${baselineY.toFixed(1)}`;
}
