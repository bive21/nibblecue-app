/**
 * A SMALL BAR WITH ITS NUMBER WRITTEN ON IT — the arithmetic of `NumberBars`, pure, so every phone
 * width and every text size is walked in node and the component only draws what this decides.
 *
 * WHY THE NUMBER IS ON THE BAR (Reports, 2026-09-26; the owner: *"it just feels boring to normal
 * users who are not used to seeing graphs"*). A column chart asks its reader to carry a bar's
 * height across to an axis and read a value off it; a person who does not read graphs does not do
 * that, and reads nothing. Here the value is written on the cap of its own bar — "8", "7", "9" —
 * and the bar is only the picture of it, so a week reads as a row of numbers that happen to have a
 * shape. That is also why this is only ever a week of days or a handful of weeks: a number on
 * every one of thirty bars is the chaos the dataviz method warns about (a number on every point),
 * and a month is folded into weeks before it gets here (`weekGroups`, core).
 *
 * THE MARK SPECS ARE `DayBars`' OWN — at most 24 pt wide, the band's leftover air, a rounded data
 * end and a square baseline — so the two charts on one page are one family.
 *
 * A NUMBER THAT DOES NOT FIT IS DRAWN SMALLER, then in its short form, never cut and never on top of
 * its neighbor: every column's number is the same size (the widest decides), because a row of
 * numbers in three sizes reads as three kinds of number.
 */
import { type as typeScale } from '../theme/theme';
import { BAR_MAX_WIDTH } from './dayBarsLayout';
import { ADVANCE } from './quickScale';

export const NUMBER_BARS = {
  /** The tallest a bar is drawn. */
  plot: 40,
  /** A value that is there is at least this tall, so a 1 is never read as nothing. */
  minBar: 3,
  /** The share of its band a bar takes; the rest is air between bars. */
  share: 0.6,
  /** A bar is never wider than `DayBars`' own. */
  maxBar: BAR_MAX_WIDTH,
  /** Air either side of a number inside its band. */
  pad: 2,
  /** The number on a bar: `meta` in the mono face. The word under it: `meta` in the UI face. */
  size: typeScale.meta.fontSize,
  /** Below this share of its size, a number switches to its short form (13h 20m → 13h). */
  floor: 0.8,
  /**
   * And below this many points, whatever the share: the smallest a small line on Reports or
   * Today's report is drawn (`summaryFit.test.ts`, `reportFit.test.ts`). The share alone lets a
   * number through at 8.2 pt at the smallest text a reader can pick (12 × 0.85 × 0.8), which is
   * what "11.25 oz" did on a 375 phone once ounces were written to the quarter (2026-09-26).
   */
  minPt: 8.5,
} as const;

/** A number's width at a scale of 1: mono, 0.6 em a character (`ADVANCE.mono`). */
export const barNumberWidth = (text: string): number =>
  [...text].length * ADVANCE.mono * NUMBER_BARS.size;

/**
 * A SHORT WORD'S BOUND IN THE UI FACE: 0.7 em a character, not the 0.53 a line of prose averages.
 * A tick is three to six characters — `Wed`, `Mon`, `Sep 13` — and in so few the wide capitals
 * are most of the word: Hanken Grotesk Regular sets "Wed" at 0.695 em a character and "Mon" at
 * 0.654, where a sentence's narrow letters bring the average down. Measured from the TTF the app
 * ships, for every weekday and every date label of a year (`summaryFit.test.ts`).
 */
export const SHORT_WORD_EM = 0.7;
/** A tick's width at a scale of 1. */
export const barTickWidth = (text: string): number =>
  [...text].length * SHORT_WORD_EM * NUMBER_BARS.size;

export interface NumberBarsInput {
  /** The chart's width, in points. */
  width: number;
  /** The number each column carries, in its full form. */
  labels: readonly string[];
  /** The same numbers in their short form, where a figure has one; the full form otherwise. */
  short?: readonly string[] | undefined;
  /** The word under each column. */
  ticks: readonly string[];
  /** The chrome font scale the words are drawn at. */
  scale: number;
}

export interface NumberBarsFit {
  /** Each column's share of the width. */
  band: number;
  /** How wide a bar is drawn. */
  bar: number;
  /** Whether the numbers are in their short form. */
  short: boolean;
  /** How far the numbers are drawn smaller to fit their band: 1 when they need not be. */
  number: number;
  /** The same for the words under the columns. */
  tick: number;
}

const fitIn = (room: number, width: number): number =>
  !(width > 0) ? 1 : !(room > 0) ? 0 : Math.min(1, room / width);

export function numberBarsFit({
  width,
  labels,
  short,
  ticks,
  scale,
}: NumberBarsInput): NumberBarsFit {
  const n = Math.max(1, labels.length);
  const band = Math.max(0, width) / n;
  const bar = Math.min(NUMBER_BARS.maxBar, Math.max(NUMBER_BARS.minBar, band * NUMBER_BARS.share));
  const room = band - 2 * NUMBER_BARS.pad;
  const widest = (xs: readonly string[], measure: (s: string) => number): number =>
    Math.max(0, ...xs.map(measure)) * scale;
  const full = fitIn(room, widest(labels, barNumberWidth));
  const tooSmall = full < NUMBER_BARS.floor || NUMBER_BARS.size * scale * full < NUMBER_BARS.minPt;
  const useShort = tooSmall && short !== undefined;
  const number = useShort ? fitIn(room, widest(short, barNumberWidth)) : full;
  return { band, bar, short: useShort, number, tick: fitIn(room, widest(ticks, barTickWidth)) };
}

/** How tall a column's bar is drawn: nothing for no value, at least `minBar` for any value. */
export function barHeight(value: number | null, max: number): number {
  if (value === null || !(value > 0) || !(max > 0)) return 0;
  return Math.max(NUMBER_BARS.minBar, Math.min(1, value / max) * NUMBER_BARS.plot);
}
