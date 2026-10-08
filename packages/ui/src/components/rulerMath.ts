/**
 * THE RULER'S ARITHMETIC (the owner, 2026-09-26: *"the interface for when user needs to enter oz, or
 * minute, feel very repetitive… think about this and come up with a solution"*). Pure TypeScript,
 * so every claim is a node test (`rulerMath.test.ts`) and `NumberRuler.tsx` only hands these
 * numbers to a horizontal ScrollView.
 *
 * WHAT IT REPLACES. An amount was a − and a + and a number between them: 1 oz to 5 oz was eight
 * taps, and a sleep of 2h 40m from the 45 the sheet opens on was twenty-three. The ruler is the
 * number's own scale under it: one flick carries the value most of the way, it SNAPS to the step
 * as it settles, and the old − and + stay at the ruler's two ends to correct by one step. A tap on
 * the number types it.
 *
 * THE SCALE. One step of the value is one `tick` of distance; a longer tick every `mid`, and a
 * labeled one every `major` (`rulerMarks`) — a whole ounce, 30 ml (an ounce, and the marks a
 * dual-scale bottle carries), ten minutes, half an hour for a sleep counted in fives. A label
 * sits on a round number because the marks are counted from ZERO, not from the ruler's start.
 *
 * WHERE THE VALUE IS. The ScrollView's content is the ticks with half the strip's width of air at
 * each end, so at a scroll offset of `i · tick` tick `i` sits under the needle in the middle: the
 * offset IS the value, and the platform's own `snapToInterval` is the snap. A value off the grid —
 * a saved 110 ml shown exactly as 3.7 oz — simply sits between two ticks until it is moved.
 *
 * A COUNT IS ITS OWN SCALE (2026-09-30, the containers a pump session goes into, one to six:
 * `rulerCounts`). Ten points a step would put all six under one thumb, and marks counted in tens
 * would label none of them; so a short run of whole numbers stands `RULER.countTick` apart, every
 * one a long tick with its number under it, like a number line. No sheet counts on a ruler since
 * 2026-10-01: that count is a − and a + (`NumberStepper compact`; the owner: *"I hate how it's
 * clickable on a ruler, it does not make sense"*), and this stays the ruler's answer to a range
 * that happens to be one.
 */
import { durationLabel } from '@nibblecue/core';
import { hit, space, type as typeScale } from '../theme/theme';
import {
  formatStepValue,
  LONG_LENGTH_MIN,
  MONO_ADVANCE,
  roundTo,
  typedBoxExtra,
  widestReadoutWidth,
  widestStepChars,
  type TypedKind,
} from './stepperMath';

/** The ruler's measures, in points at a text scale of 1. */
export const RULER = {
  /** Between two ticks: one step of the value. */
  tick: 10,
  /**
   * Between two ticks of a COUNT (`rulerCounts`): wide enough that a thumb settles on one of six
   * without landing on the next, and six of them still inside the 120 pt the shortest strip in a
   * row's gap shows.
   */
  countTick: 24,
  /** The most whole numbers a ruler draws as a count; a longer run is an amount's scale. */
  countMost: 12,
  /**
   * A count's line (`countLineX`): its first and last number this far in from the strip's ends,
   * past the strip's rounded corners (`radius.m`, 15), so the end numbers sit clear of them.
   */
  countEnd: 16,
  /** How far a finger goes sideways, and how much more sideways than not, to drag the line. */
  countClaim: 8,
  countDominance: 1.5,
  /** The needle's glide to a number tapped, or to the nearest one when a drag lets go. */
  countGlideMs: 140,
  /** How long each kind of tick is, up from the strip's top edge of ticks. */
  minor: 9,
  mid: 14,
  major: 20,
  /** How thick. */
  minorWidth: 1.5,
  majorWidth: 2,
  /** The needle in the middle: its width, and how far it stands past the longest tick. */
  needle: 3,
  needleOver: 6,
  /** The number under a labeled tick, in the mono face; chrome, so it stops growing at 1.6. */
  label: 11,
  /** Air above the ticks, between a tick and its label, and under the label. */
  padTop: 6,
  labelGap: 2,
  padBottom: 5,
  /** The fades at each end of the strip, where the scale runs out of sight. */
  fade: 22,
  /** The narrowest strip that is still a ruler: a dozen steps in view. */
  minStrip: 120,
  /** The most ticks a ruler draws; past it the stepper keeps its box (`rulerFits`). */
  maxTicks: 480,
  /** How often a drag tells the sheet: the hold's own floor, so a sheet redraws no faster. */
  emitMs: 50,
  /**
   * The number, in the mono face, in its typed box at the right of the header row (2026-09-26):
   * bigger than the compact leftover's 18 so the primary number reads as the primary one, and
   * smaller than the 34 it was when it had a row of its own.
   */
  value: 30,
  /** Room kept between two labels, so they never touch. */
  labelAir: 4,
  /** The least room the caption keeps beside the number before the number goes under it. */
  captionMin: 96,
  /**
   * THE SHORTEST STRIP THAT STILL SITS IN THE ROW (2026-09-30, `rulerInline`): nine steps in view,
   * a labeled tick and most of the next either side of the needle. Under it the ruler takes the two
   * rows it had, with its − and + back at its ends.
   */
  inlineMin: 96,
} as const;

/* ------------------------------------------------------------------------------ the marks */

/** Every how many steps a tick is longer (`mid`, or none) and labeled (`major`). */
export interface RulerMarks {
  major: number;
  mid: number | null;
}

/**
 * THE MARKS FOR A STEP, from its leading digit, so a label always lands on a round number:
 *
 *   step 1·10ⁿ    labeled every 10 steps, longer at 5     1 min → 10 min · 0.1 °F → 1° · 0.01 kg
 *   step 2.5·10ⁿ  labeled every 4, longer at 2            0.25 oz → every ounce, 0.5 between
 *   step 5·10ⁿ    labeled every 6, longer at 3            5 ml → 30 ml · 5 min → half an hour
 *   step 5·10⁻ⁿ   labeled every 2                         0.5 oz → every ounce
 *   step 2·10ⁿ    labeled every 5                         2 → 10
 *   anything else labeled every 10, longer at 5
 */
export function rulerMarks(step: number): RulerMarks {
  if (!(step > 0) || !Number.isFinite(step)) return { major: 10, mid: 5 };
  const e = Math.floor(Math.log10(step) + 1e-9);
  const lead = roundTo(step / Math.pow(10, e), 6);
  if (lead === 1) return { major: 10, mid: 5 };
  if (lead === 2.5) return { major: 4, mid: 2 };
  if (lead === 5) return e < 0 ? { major: 2, mid: null } : { major: 6, mid: 3 };
  if (lead === 2) return { major: 5, mid: null };
  return { major: 10, mid: 5 };
}

/**
 * A LENGTH THAT REACHES AN HOUR IS LABELED IN HOURS (the owner, 2026-09-26: *"1h20m is easier to
 * read"*). The number over the ruler reads "1h 20m" from sixty minutes on (`stepReadout`), so its
 * scale does too: a sleep counted in fives is labeled every hour — 1h, 2h … 16h — with the half
 * hour a longer tick, where it was labeled every half hour in minutes (90, 120, 150, which is
 * arithmetic at three in the morning); a length counted in single minutes keeps a label every ten
 * and writes it the app's way — 50m, 1h, 1h 10m. A range that stays under an hour is unchanged.
 */
export const rulerReadsHours = (kind: TypedKind, max: number): boolean =>
  kind === 'minutes' && max >= LONG_LENGTH_MIN;

/**
 * The marks for a step, and — for a length that reads in hours — a label on every hour; a count
 * (`rulerCounts`) labels every one of its numbers.
 */
export function rulerMarksFor(step: number, hours: boolean, counts = false): RulerMarks {
  if (counts) return { major: 1, mid: null };
  if (!hours || !(step > 0)) return rulerMarks(step);
  const perHour = LONG_LENGTH_MIN / step;
  // a step of a minute keeps ten-minute labels: an hour of them is 600 pt, too far between numbers
  if (step >= 5 && Number.isInteger(perHour)) {
    const half = perHour / 2;
    return { major: perHour, mid: Number.isInteger(half) ? half : null };
  }
  return rulerMarks(step);
}

export type TickKind = 'major' | 'mid' | 'minor';

/**
 * Which kind tick `index` is. Counted from ZERO in whole steps, so on a ruler that starts at 95.0 °F
 * the labels still fall on 95, 96, 97 and not on 95, 96.0-and-a-bit.
 */
export function tickKind(index: number, min: number, step: number, marks: RulerMarks): TickKind {
  const k = Math.round((min + index * step) / step);
  if (k % marks.major === 0) return 'major';
  if (marks.mid !== null && k % marks.mid === 0) return 'mid';
  return 'minor';
}

/* ------------------------------------------------------------------ value ⇄ scroll offset */

/**
 * How many ticks the ruler has: one per step from `min`, and one more at `max` when the range is not
 * a whole number of steps (a split bounded by a 3.7 oz bag), so the far end can always be reached.
 */
export function rulerCount(min: number, max: number, step: number): number {
  if (!(step > 0) || !(max > min)) return 1;
  return Math.ceil((max - min) / step - 1e-9) + 1;
}

/** Whether a range is drawn as a ruler at all: a step, a range, and not more ticks than it draws. */
export const rulerFits = (min: number, max: number, step: number): boolean =>
  step > 0 && max > min && rulerCount(min, max, step) <= RULER.maxTicks;

/**
 * WHETHER A RULER COUNTS (see the header): whole numbers a step of one apart, from a whole number,
 * no more of them than `RULER.countMost`. Read off the range, so a count is drawn as one however it
 * is typed, or whether it can be typed at all. No ruler the app drew before 2026-09-30 is one: an
 * amount steps by a quarter ounce or five milliliters, and tummy time's minutes run to 120.
 */
export const rulerCounts = (min: number, max: number, step: number): boolean =>
  step === 1 &&
  Number.isInteger(min) &&
  rulerFits(min, max, step) &&
  rulerCount(min, max, step) <= RULER.countMost;

/** The distance between two ticks: one step of the value, a count's wider (`RULER.countTick`). */
export const rulerTickFor = (min: number, max: number, step: number): number =>
  rulerCounts(min, max, step) ? RULER.countTick : RULER.tick;

/* ------------------------------------------------------------ a count, all of it in view */

/**
 * A COUNT IS A LINE, ALL OF IT IN VIEW (the owner, 2026-09-30, of "How many bottles" on Where it
 * goes: *"The slider with the empty space on the left don't look very nice. Think about it and
 * then fix it"*). A ruler keeps its value under a needle in the middle of its strip, so at its
 * first number half the strip is empty scale. That is right for an amount, whose scale runs far
 * past what any strip shows, and wrong for a count: one to six fit in the strip with room over,
 * and the empty half was all that showed of it at one bottle.
 *
 * So a count's numbers stand evenly from one end of the strip to the other, `RULER.countEnd` in
 * from each, and the NEEDLE moves instead of the scale: to a number tapped, or along under a finger
 * dragged sideways, settling on the nearest. Nothing scrolls and nothing fades, because nothing
 * runs out of sight. Where the numbers would not keep apart (a dozen of them in a short strip at a
 * large text size, which no count the app draws comes near) the count keeps the ruler it had.
 */
export const countLineGap = (strip: number, count: number): number =>
  count > 1 ? (strip - 2 * RULER.countEnd) / (count - 1) : 0;

/** Where number `index` stands on a count's line, in the strip. */
export const countLineX = (strip: number, count: number, index: number): number =>
  RULER.countEnd + Math.min(count - 1, Math.max(0, index)) * countLineGap(strip, count);

/** The number nearest a point of the strip: a tap's, or a finger's as it drags. */
export function countLineIndexAt(x: number, strip: number, count: number): number {
  const gap = countLineGap(strip, count);
  if (!(gap > 0) || !Number.isFinite(x)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round((x - RULER.countEnd) / gap)));
}

/** The number a count's value stands at on its line: whole, and inside it. */
export const countLineIndexOf = (value: number, min: number, count: number): number =>
  Number.isFinite(value) ? Math.min(count - 1, Math.max(0, Math.round(value - min))) : 0;

/**
 * Whether a count is drawn as a line on a strip this wide at a text scale: it is a count, and its
 * widest number and a little air fit between two of its numbers, so no two labels ever touch.
 */
export function countLineFits(strip: number, min: number, max: number, scale: number): boolean {
  if (!(strip > 0) || !rulerCounts(min, max, 1)) return false;
  const between = countLineGap(strip, rulerCount(min, max, 1));
  return rulerLabelWidth(min, max, 1, scale) + RULER.labelAir <= between;
}

/**
 * WHETHER A FINGER ON THE LINE IS DRAGGING IT: gone sideways past `RULER.countClaim`, and clearly
 * more sideways than up or down, the side slider's rule (`claimsSlide`). Never on contact, so a
 * scroll of the sheet that starts on the line is the sheet's, and a tap is a tap.
 */
export const countLineClaims = (dx: number, dy: number): boolean =>
  Math.abs(dx) >= RULER.countClaim && Math.abs(dx) > RULER.countDominance * Math.abs(dy);

/** Whether a touch that ended on the line was a tap: it hardly moved. */
export const countLineTapped = (dx: number, dy: number): boolean =>
  Math.abs(dx) < RULER.countClaim && Math.abs(dy) < RULER.countClaim;

/** The value at tick `index`, rounded to the stepper's places and never past `max`. */
export function rulerValueAt(
  index: number,
  min: number,
  max: number,
  step: number,
  decimals: number,
): number {
  return Math.min(max, Math.max(min, roundTo(min + index * step, decimals)));
}

/** The tick under the needle at a scroll offset: the nearest one, inside the ruler. */
export function rulerIndexAt(offset: number, count: number, tick: number = RULER.tick): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(offset / tick)));
}

/**
 * The scroll offset that puts `value` under the needle — continuous, so a value off the grid sits
 * between its two ticks, and inside the ruler however far outside the range the value is.
 */
export function rulerOffsetOf(
  value: number,
  min: number,
  step: number,
  count: number,
  tick: number = RULER.tick,
): number {
  if (!Number.isFinite(value) || !(step > 0)) return 0;
  const steps = Math.min(count - 1, Math.max(0, (value - min) / step));
  return roundTo(steps * tick, 3);
}

/** The content's width: the ticks, and half the strip's width of air at each end. */
export const rulerContentWidth = (
  strip: number,
  count: number,
  tick: number = RULER.tick,
): number => strip + Math.max(0, count - 1) * tick;

/** Where tick `index` stands in the content: the air at the start, then one `tick` per step. */
export const rulerTickX = (strip: number, index: number, tick: number = RULER.tick): number =>
  strip / 2 + index * tick;

/**
 * Whether the ruler has to be MOVED to show the value — a − or +, a number typed, a screen reader's
 * swipe, a sheet that clamped what the drag reported. Not while the parent's own thumb is on it,
 * and not for the fraction of a point a native scroll view rounds an offset to.
 */
export const rulerMustFollow = (
  valueOffset: number,
  shownOffset: number,
  dragging: boolean,
): boolean => !dragging && Math.abs(valueOffset - shownOffset) > 0.5;

/* ------------------------------------------------------------------ what a drag reports */

/**
 * Whether a drag tells the sheet NOW (`RULER.emitMs`): the first report, and then no more often than
 * the hold steps. The number on the ruler follows every tick; the sheet — the milk in the bag, the
 * line under a bottle — follows at most twenty times a second, and the settle always reports last.
 * A clock gone backwards reports rather than waiting for it to catch up.
 */
export const rulerEmitDue = (lastMs: number | null, nowMs: number, gapMs = RULER.emitMs): boolean =>
  lastMs === null || nowMs < lastMs || nowMs - lastMs >= gapMs;

/* ------------------------------------------------------------------------------ the layout */

/** The strip's height at a text scale: the longest tick, its label's line, and the air. */
export function rulerHeight(scale: number): number {
  const s = Math.max(1, scale);
  return Math.ceil(
    RULER.padTop + RULER.major + RULER.labelGap + RULER.label * s * 1.25 + RULER.padBottom,
  );
}

/**
 * THE ROW ON A PHONE: the sheet's body less the − and + — each a whole target — and the gaps beside
 * them. What is left is the strip. (There was a card round the ruler, and its padding came off the
 * strip too, until 2026-09-26: the number moved into a header row with its caption, in its own typed
 * box, and the strip is its own track, so the card had nothing left to frame.)
 */
export function rulerStripWidth(body: number): number {
  return body - 2 * hit.min - 2 * space.xs;
}

/**
 * The widest label a ruler can draw, at a text scale, in the mono face: its major values — or, on a
 * length that reads in hours, the longest of the labels it really draws ("1h 10m"), counted.
 */
export function rulerLabelWidth(
  min: number,
  max: number,
  step: number,
  scale: number,
  hours = false,
): number {
  if (!hours) {
    const places = rulerLabelPlaces(step);
    return widestStepChars(min, max, places) * MONO_ADVANCE * RULER.label * scale;
  }
  const marks = rulerMarksFor(step, true);
  const count = rulerCount(min, max, step);
  let widest = 0;
  for (let i = 0; i < count; i += 1)
    if (tickKind(i, min, step, marks) === 'major')
      widest = Math.max(
        widest,
        rulerLabelFor(rulerValueAt(i, min, max, step, 6), step, true).length,
      );
  return widest * MONO_ADVANCE * RULER.label * scale;
}

/** How many places a LABEL needs: its marks are round, so fewer than the step (0.25 → none). */
export function rulerLabelPlaces(step: number): number {
  const marks = rulerMarks(step);
  const every = roundTo(step * marks.major, 6);
  const s = String(every);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** A labeled tick's number: its value, as few places as the round number needs. */
export const rulerLabel = (value: number, step: number): string =>
  formatStepValue(value, rulerLabelPlaces(step));

/**
 * A labeled tick's words: the round number (`rulerLabel`), or — on a length that reads in hours —
 * the app's own spelling of it: "0", "50m", "1h", "1h 10m", "16h".
 */
export function rulerLabelFor(value: number, step: number, hours: boolean): string {
  if (!hours) return rulerLabel(value, step);
  return value <= 0 ? '0' : durationLabel(Math.round(value) * 60_000);
}

/**
 * Whether two neighboring labels keep apart at a text scale: the widest label and a little air fit
 * in the distance between two labeled ticks.
 */
export function rulerLabelsFit(
  min: number,
  max: number,
  step: number,
  scale: number,
  hours = false,
): boolean {
  const counts = rulerCounts(min, max, step);
  const between = rulerMarksFor(step, hours, counts).major * rulerTickFor(min, max, step);
  return rulerLabelWidth(min, max, step, scale, hours) + RULER.labelAir <= between;
}

/**
 * THE NUMBER'S BOX AT ITS WIDEST, in the header row: the widest readout the range can show at
 * `RULER.value` — a plain number and its unit, or "16h 59m" — grown by the chrome scale as its roles
 * grow, and the typed box's air and edge, which do not. The box keeps this width whatever the number
 * is, so a drag does not make its edge wander. And never narrower than a target, since a tap on it
 * types the number: a count's one digit ("3", its word on the caption) is a box of 44.
 */
export function rulerBoxWidth(
  min: number,
  max: number,
  decimals: number,
  unitLabel: string,
  kind: TypedKind,
  scale: number,
): number {
  return Math.max(
    hit.min,
    Math.ceil(
      widestReadoutWidth(min, max, decimals, unitLabel, kind, RULER.value) * scale +
        typedBoxExtra(),
    ),
  );
}

/**
 * THE HEADER ROW ON A PHONE (2026-09-26, the owner: the bottle's number *"does not need a whole row
 * for itself … it can follow the design in left in bottle"*): the caption on the left and the
 * number's box on the right, on one row, when the caption keeps at least `RULER.captionMin` beside
 * the box; otherwise the row wraps and the box goes under the caption, never off the edge.
 */
export const rulerHeaderFits = (body: number, box: number): boolean =>
  body - box - space.md >= RULER.captionMin;

/**
 * The Done beside a number being typed: the design system's small secondary `Button` — its word in
 * `bodySm`, bounded at 0.6 of the size a character (generous for "Done"), `space.xl` of padding
 * either side — and never narrower than a target.
 */
export function rulerDoneWidth(scale: number): number {
  const word = 'Done'.length * 0.6 * typeScale.bodySm.fontSize * scale;
  return Math.max(hit.min, Math.ceil(word + 2 * space.xl));
}

/**
 * The room the header row has: the whole of the sheet's body, now that the ruler has no card. The
 * Done beside a number being typed sits on the line under the header, beside the hint.
 */
export const rulerInnerWidth = (body: number): number => body;

/* ------------------------------------------------------------------ the ruler in the row's gap */

/**
 * THE RULER IN THE GAP (the owner, 2026-09-30, over the bottle sheet: *"Would it make sense to you
 * if the slider is inside the red circle I made instead? We don't need a very long slider for
 * this."* The circle was the empty stretch of the "In the bottle" row between its words and the
 * number's box). One row: the caption at its own width, the strip in the gap, the number's box at its
 * widest, `space.md` between each. The strip keeps its ticks' spacing, its labels and its needle; only
 * the window onto the scale is shorter. The − and + go: a flick of the strip and a tap on the number
 * already give a quick answer and an exact one, and the row is one element to a screen reader, whose
 * swipe is still a step.
 *
 * WHEN IT DOES NOT FIT, TWO ROWS, as before: the caption and the box on the first, the strip with its
 * − and + under them. That is a strip shorter than `RULER.inlineMin`: a narrow phone, a long caption
 * (a twin's name in "Ada's bottle"), or a large text size, which grows the caption and the box alike.
 */
export const rulerInlineStrip = (row: number, caption: number, box: number): number =>
  row - caption - box - 2 * space.md;

/** Whether the ruler sits in its row's gap (see above). A row not yet measured is not decided here. */
export const rulerInline = (row: number, caption: number, box: number): boolean =>
  row > 0 && rulerInlineStrip(row, caption, box) >= RULER.inlineMin;

/**
 * A CAPTION'S WIDTH BEFORE IT IS MEASURED, so the first frame is already the right layout: Hanken
 * Grotesk Regular's own advances, in em, for every character a caption in this language can hold,
 * read out of the TTF the app ships and rounded up (the app's `rulerInline.test.ts` re-reads the TTF
 * and holds the table to it). No kerning, which is the safe side. A character not in the table (a
 * name in another script) is charged a whole em, wider than any here. The ruler then measures the
 * caption as it is drawn and decides again (`NumberRuler`), which is what a face not yet loaded, or
 * a name in another script, needs.
 */
export const CAPTION_ADVANCE_EM: Readonly<Record<string, number>> = {
  ' ': 0.26,
  '!': 0.24,
  '"': 0.338,
  '#': 0.699,
  $: 0.56,
  '%': 0.747,
  '&': 0.686,
  "'": 0.174,
  '(': 0.222,
  ')': 0.222,
  '*': 0.398,
  '+': 0.56,
  ',': 0.24,
  '-': 0.327,
  '.': 0.24,
  '/': 0.418,
  '0': 0.56,
  '1': 0.56,
  '2': 0.56,
  '3': 0.56,
  '4': 0.56,
  '5': 0.56,
  '6': 0.56,
  '7': 0.56,
  '8': 0.56,
  '9': 0.56,
  ':': 0.24,
  ';': 0.24,
  '<': 0.56,
  '=': 0.56,
  '>': 0.56,
  '?': 0.516,
  '@': 0.874,
  A: 0.637,
  B: 0.601,
  C: 0.704,
  D: 0.682,
  E: 0.585,
  F: 0.565,
  G: 0.731,
  H: 0.678,
  I: 0.246,
  J: 0.552,
  K: 0.634,
  L: 0.495,
  M: 0.839,
  N: 0.676,
  O: 0.748,
  P: 0.554,
  Q: 0.774,
  R: 0.598,
  S: 0.564,
  T: 0.587,
  U: 0.656,
  V: 0.656,
  W: 0.957,
  X: 0.641,
  Y: 0.602,
  Z: 0.582,
  '[': 0.258,
  '\\': 0.448,
  ']': 0.258,
  '^': 0.552,
  _: 0.405,
  '`': 0.292,
  a: 0.54,
  b: 0.587,
  c: 0.518,
  d: 0.587,
  e: 0.54,
  f: 0.335,
  g: 0.514,
  h: 0.547,
  i: 0.226,
  j: 0.226,
  k: 0.532,
  l: 0.265,
  m: 0.828,
  n: 0.547,
  o: 0.577,
  p: 0.587,
  q: 0.587,
  r: 0.407,
  s: 0.47,
  t: 0.346,
  u: 0.547,
  v: 0.521,
  w: 0.748,
  x: 0.52,
  y: 0.521,
  z: 0.472,
  '{': 0.239,
  '|': 0.258,
  '}': 0.239,
  '~': 0.56,
  '’': 0.263,
};
/** What a character not in the table is charged: a whole em, wider than any character in it. */
export const CAPTION_FALLBACK_EM = 1;
export const rulerCaptionGuess = (caption: string, fontScale: number): number =>
  Array.from(caption).reduce(
    (sum, ch) => sum + (CAPTION_ADVANCE_EM[ch] ?? CAPTION_FALLBACK_EM),
    0,
  ) *
  typeScale.body.fontSize *
  Math.max(fontScale, 0);
