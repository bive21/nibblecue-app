/**
 * REPORTS, THE FIRST TIME EACH CARD IS SEEN: its bars grow up out of the baseline and its headline
 * figures count up to what they are (the owner's delight list, 2026-09-26: *"lets try doing number
 * 5-14, apply it, and if i dont like it then i will let you know"*). The numbers of it, pure, so the
 * suite can walk every frame — this package's tests cannot render React Native — and `DayBars`,
 * `CountUp` and the Reports cards only hand them to `Animated.Value#interpolate` and to a Text.
 *
 * THREE STATES, AND THE CARD DECIDES WHICH (`Reveal`). A card that has not been on screen yet this
 * session HOLDS: its bars sit under the baseline and its figures read zero, so nothing jumps from
 * full to empty when it arrives. When it comes into view it PLAYS, once. Everything else is at
 * REST — a card seen before this session, a chart that refreshed, a child or a range switched: the
 * picture simply shows the new numbers (`useRevealProgress` and `CountUp` only ever play on the
 * way from hold to play).
 *
 * THE BARS. Each column rises out of the baseline, 420 ms on an ease-out, the next one a beat
 * behind it — 35 ms apart on a week of columns, closing to 25 on a month so a 30-day chart is not
 * a slow wave (`barStagger`). One value drives a whole chart, 0 → 1 over its whole run
 * (`growTimeline`); each column reads its own window of it (`growFrame`) as how far it still sits
 * below the baseline. A column is clipped at the baseline and moved, never squashed: its rounded
 * top is the shape it lands with from the first frame it shows.
 *
 * THE FIGURES. 600 ms on the same ease-out, from zero, and every frame is written by the figure's
 * own formatter from a value cut to the figure's own step (`countText`): "4.5 oz" passes through
 * "3.9 oz" and "4.4 oz" and never shows "4.4999", a count of diapers never shows a fraction, and
 * the last frame is `format(value)` itself — not a value that happens to round to it. A screen
 * reader never hears a number in flight: the figure's label is the final value from the first
 * frame (`CountUp`).
 *
 * WHAT DOES NOT MOVE. A locked chart's placeholder (the gate's flat bars) never plays. Reduce motion
 * and the amber Night show the end state: bars up, figures written (`motionStill`).
 *
 * NOTHING HERE READS THE NUMBERS FOR MEANING. A tall bar grows exactly like a short one — the same
 * duration, the same curve — and no figure is colored, slowed or celebrated by its size
 * (CLAUDE.md §2).
 */
import type { Frame } from './dayNightSwitch';
import { easeAt } from './themeSkyToggle';

/** Where a card is in its entrance: waiting to be seen, playing it, or simply showing its numbers. */
export type Reveal = 'rest' | 'hold' | 'play';

export const REVEAL = {
  /** One column's rise. */
  barMs: 420,
  /** Between neighboring columns: `most` for a week of them, down to `least` for a month. */
  stagger: { most: 35, least: 25, fewAt: 7, manyAt: 30 },
  /** A figure's count, zero to its value. */
  countMs: 600,
  /** `Easing.bezier`'s four points: easeOutCubic — off at speed, settling onto the value. */
  ease: [0.33, 1, 0.68, 1] as const,
  /** Samples across one column's window: every 35 ms of a 420 ms rise, shorter than two frames. */
  steps: 12,
  /**
   * How long a card counts as playing. Anything that appears inside it after this — a chart that
   * arrives with late data — appears at rest. Longer than the longest entrance: 30 columns end at
   * 29 × 25 + 420 = 1145 ms.
   */
  windowMs: 1400,
} as const;

/**
 * The beat between one column and the next, for a chart of `n` columns: 35 ms for a week, closing
 * to 25 ms for a month. Past a month (a custom range) the WAVE keeps the month's length — 29 beats
 * of 25 ms — and the beat shrinks to fit it, so two years of columns still land in about a second.
 */
export function barStagger(n: number): number {
  const { most, least, fewAt, manyAt } = REVEAL.stagger;
  if (n <= fewAt) return most;
  if (n > manyAt) return (least * (manyAt - 1)) / (n - 1);
  if (n === manyAt) return least;
  return Math.round(most - ((most - least) * (n - fewAt)) / (manyAt - fewAt));
}

export interface GrowTimeline {
  stagger: number;
  /** From the first column setting off to the last one landing. */
  totalMs: number;
}

export function growTimeline(n: number): GrowTimeline {
  const count = Math.max(0, Math.floor(n));
  const stagger = barStagger(count);
  return { stagger, totalMs: count === 0 ? 0 : (count - 1) * stagger + REVEAL.barMs };
}

/** Column `i`'s rise as a window of the chart's one value: when it sets off, and when it lands. */
export function barWindow(i: number, n: number): readonly [number, number] {
  const { stagger, totalMs } = growTimeline(n);
  if (totalMs <= 0) return [0, 1];
  const start = (Math.max(0, i) * stagger) / totalMs;
  return [Math.min(1, start), Math.min(1, start + REVEAL.barMs / totalMs)];
}

/** How far a column still sits below its baseline, `u` of the way through its own rise. */
export const barSink = (rise: number, u: number): number =>
  rise * (1 - easeAt(REVEAL.ease, Math.min(1, Math.max(0, u))));

/**
 * Column `i` of `n`, as a frame of the chart's value: `rise` points down (hidden under the
 * baseline) before its window, sampled along its ease-out within it, and 0 — at rest — after.
 * Clamped both ends, so nothing sinks further or rises past its place.
 */
export function growFrame(i: number, n: number, rise: number): Frame {
  const [a, b] = barWindow(i, n);
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  if (a > 0) {
    inputRange.push(0);
    outputRange.push(rise);
  }
  for (let k = 0; k <= REVEAL.steps; k += 1) {
    const at = a + ((b - a) * k) / REVEAL.steps;
    // `interpolate` wants its input strictly increasing: a window squeezed to nothing is one point
    if (inputRange.length > 0 && at <= (inputRange[inputRange.length - 1] ?? -1)) continue;
    inputRange.push(at);
    outputRange.push(barSink(rise, k / REVEAL.steps));
  }
  if ((inputRange[inputRange.length - 1] ?? 0) < 1) {
    inputRange.push(1);
    outputRange.push(0);
  }
  if (inputRange.length < 2)
    return { inputRange: [0, 1], outputRange: [0, 0], extrapolate: 'clamp' };
  return { inputRange, outputRange, extrapolate: 'clamp' };
}

/** The decimal places a step is written to: 1 → 0, 0.1 → 1, 0.25 → 2. */
function placesOf(step: number): number {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/**
 * A figure `u` of the way through its count: zero at the start, the value itself at the end, and
 * between them the eased share of it — cut back to the figure's own `step` (toward zero), so an
 * intermediate never shows a place the figure does not have and never shows more than the value.
 */
export function countValue(target: number, u: number, step?: number): number {
  if (!Number.isFinite(target)) return target;
  if (u >= 1) return target;
  if (u <= 0) return 0;
  const v = target * easeAt(REVEAL.ease, u);
  if (step === undefined || !(step > 0)) return v;
  const whole = Math.trunc(v / step + Math.sign(v) * 1e-9);
  return Number((whole * step).toFixed(placesOf(step)));
}

/** What a counting figure reads `u` of the way through: always its own formatter's words. */
export function countText(
  target: number,
  u: number,
  format: (n: number) => string,
  step?: number,
): string {
  return u >= 1 || !Number.isFinite(target) ? format(target) : format(countValue(target, u, step));
}

/**
 * WHEN A CARD HAS COME INTO VIEW: its top is above the line 80% of the way down the window — past
 * the floating tab bar, with a little of the card showing — and it has not gone off the top
 * (below the top 12%, where the bar is). Measured in window points (`measureInWindow`), so it holds
 * whatever the bar, the banner or the phone.
 */
export const REVEAL_VIEW = { line: 0.8, roof: 0.12 } as const;

export function revealDue(box: { y: number; height: number }, windowHeight: number): boolean {
  if (!(windowHeight > 0) || !(box.height > 0)) return false;
  return (
    box.y < windowHeight * REVEAL_VIEW.line && box.y + box.height > windowHeight * REVEAL_VIEW.roof
  );
}
