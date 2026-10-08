/**
 * Stepper arithmetic shared by NumberStepper and RoundStepper (docs/DESIGN_SYSTEM.md §5,
 * §15.2; docs/MOBILE.md §8). Pure TypeScript: the clamping, the rounding, the display string,
 * the long-press repeat and the typed entry are tested here without a renderer.
 *
 * Rounding goes through a power of ten rather than `toFixed` on the raw sum because
 * 0.1 + 0.2 must read as 0.3, and a bottle stepped in halves must never show 4.499999. The
 * display trims trailing zeros ("4", "4.5") the way the prototype's stepper does: a parent
 * reads "4 oz", not "4.0 oz", and tabular digits keep the column steady either way.
 *
 * Long-press repeat starts at 120 ms and drops to 60 ms after eight steps: fast enough to
 * cross a range without a hundred taps, slow enough at first that a thumb can stop on the
 * number it wanted.
 *
 * TYPING THE NUMBER (the owner, 2026-09-25: "Make 35 min tappable so users can enter an exact
 * duration. Holding + or – should change it continuously"). A sleep of 2h 40m is thirty-one taps
 * of five minutes from the 45 the sheet opens on; typed, it is "160". `typedValue` is the whole
 * rule — what a parent may type, and what it becomes — so the dialog and the ruler's field that ask
 * for it hold no arithmetic of their own; `sanitizeTyped` is what may stand in the field at all
 * (the owner, 2026-09-26: numbers only — digits and one point, so "2:40" is no longer typed).
 */
import { durationLabel } from '@nibblecue/core';
import { space, type as typeScale } from '../theme/theme';

export const REPEAT_INITIAL_MS = 120;
export const REPEAT_FAST_MS = 60;
export const REPEAT_ACCELERATE_AFTER = 8;
/** How long a press must be held before it starts repeating. */
export const LONG_PRESS_MS = 320;

const MIN_MS = 60_000;

export function roundTo(value: number, decimals: number): number {
  const p = Math.pow(10, Math.max(0, Math.trunc(decimals)));
  return Math.round(value * p) / p;
}

/** How many decimal places a step needs to display without loss (0.5 → 1, 0.25 → 2, 10 → 0). */
export function decimalsOfStep(step: number): number {
  const s = String(Math.abs(step));
  const i = s.indexOf('.');
  return i < 0 ? 0 : Math.min(3, s.length - i - 1);
}

/** The next value after a step of `delta`, rounded and clamped to [min, max]. */
export function stepValue(
  value: number,
  delta: number,
  min: number,
  max: number,
  decimals: number,
): number {
  const next = roundTo((Number.isFinite(value) ? value : min) + delta, decimals);
  return Math.min(max, Math.max(min, next));
}

/** Whether stepping by `delta` would change the value at all (false at the bound). */
export function canStep(value: number, delta: number, min: number, max: number): boolean {
  if (delta > 0) return value < max;
  if (delta < 0) return value > min;
  return false;
}

/** The delay before repeat number `index` (0-based) fires. */
export function repeatDelay(index: number): number {
  return index >= REPEAT_ACCELERATE_AFTER ? REPEAT_FAST_MS : REPEAT_INITIAL_MS;
}

/** "4" · "4.5" · "120" · "0.25" — trailing zeros trimmed, never an exponent. */
export function formatStepValue(value: number, decimals: number): string {
  const d = Math.max(0, Math.trunc(decimals));
  const s = roundTo(Number.isFinite(value) ? value : 0, d).toFixed(d);
  return d > 0 ? s.replace(/\.?0+$/, '') : s;
}

/* ---------------------------------------------------------------- the compact stepper */

/**
 * THE COMPACT STEPPER, ONE ROW (the owner, 2026-09-26, of the bottle sheet's leftover: *"(-) x oz
 * (+) all in one row, and smaller than current"*): its name on the left and, on the right, a round
 * − and + either side of the number. Smaller than both of the others, which is the point — it is
 * the second number on a sheet, answering the control above it:
 *
 *   NumberStepper   54 pt circles, 27 pt value      the one primary number on a sheet
 *   RoundStepper    38 pt circles (34 narrow), 21   a pair side by side
 *   compact         32 pt circles, 18 pt value      a row
 *
 * Each compact circle is drawn inside a full `hit.min` target, which is the button itself rather
 * than a `hitSlop`: a slop reaching past the row's edge is not hit-tested on Android, nor inside a
 * clip (the leftover's roll-down), and the + sits at the row's edge.
 *
 * ONE FAMILY SINCE 2026-09-30 (the owner, over the pump's LEFT, RIGHT and TOTAL: *"Did the grey
 * highlight box look okay to you? And the icon plus and minus is not exactly on the aligned in the
 * middle of the border. This is very bad and need fixing."*). The primary number's 54 pt squares
 * are circles now, like the other two, and on all three the − and + are drawn (`stepGlyph`) and
 * the typed box is a pill exactly as tall as the circles beside it (`stepperBoxShape`).
 */
export const COMPACT_STEPPER = {
  circle: 32,
  value: 18,
} as const;
/** The primary number's stepper: its circles a primary target (`hit.primary`), its number 27 pt. */
export const BIG_STEPPER = {
  circle: 54,
  value: 27,
} as const;

/* ---------------------------------------------------------------- the − and + */

/**
 * THE − AND + ARE DRAWN, NOT SET (the owner, 2026-09-30: *"the icon plus and minus is not exactly on
 * the aligned in the middle of the border. This is very bad and need fixing."*). They were the text
 * "−" and "+" in the h2 face, and a glyph stands where its font puts it: the minus on the face's
 * math axis, a little under the middle of a line box made of the face's ascent and descent, with
 * Android's own padding added to the line. So the mark sat a point or two off the circle's center,
 * by a different amount on each phone and in each face. Two rounded bars placed by arithmetic are
 * at the center on every phone.
 *
 * A bar is `length` of the circle's diameter long and `thickness` of it thick, rounded to a whole
 * point and to half a point, and never thinner than 2: at 38 pt, 14 by 2.5, the weight the h2
 * face's own plus had there. The plus is that bar with its twin standing across it; the two cross
 * at the circle's center, and each bar's center IS the center, by construction.
 */
export const STEP_GLYPH = { length: 0.37, thickness: 0.066, minThickness: 2 } as const;

export interface StepGlyphGeometry {
  length: number;
  thickness: number;
  /** Where the lying bar (the −, and the +'s crossbar) starts, from the circle's top left. */
  bar: { left: number; top: number };
  /** Where the standing bar of the + starts. */
  post: { left: number; top: number };
}

/** The − and + for a circle `box` points across (`StepGlyph` draws it). */
export function stepGlyph(box: number): StepGlyphGeometry {
  const length = Math.round(box * STEP_GLYPH.length);
  const thickness = Math.max(
    STEP_GLYPH.minThickness,
    Math.round(box * STEP_GLYPH.thickness * 2) / 2,
  );
  return {
    length,
    thickness,
    bar: { left: (box - length) / 2, top: (box - thickness) / 2 },
    post: { left: (box - thickness) / 2, top: (box - length) / 2 },
  };
}

/**
 * THE TYPED BOX TAKES THE HEIGHT AND THE SHAPE OF WHAT IT SITS BESIDE (the owner, 2026-09-30: *"Did
 * the grey highlight box look okay to you?"*). It was a small `radius.s` rectangle two points taller
 * than its digits, floating between two 38 pt circles inside a white pill with a shadow: three
 * shapes of three heights on one row. Between two circles it is now a pill exactly as tall as they
 * are, on the same axis, with the number centered in it; beside a ruler's strip it is as tall as the
 * strip, on the strip's own corner. There is no card round the row: the three shapes are the
 * control. At a text size where the number is taller than the circles (past about 1.4 times) the box
 * grows round it rather than clip it (`typedBoxHeight`), and stays a pill.
 */
export interface TypedBoxShape {
  /** As tall as what the box sits beside: the circles, or a ruler's strip. */
  height: number;
  /**
   * Its corner: a ruler strip's own beside a ruler. Absent, a pill, whatever height the box is drawn
   * at: the pill radius, which React Native holds to half the box's height.
   */
  radius?: number;
}

/** The box between a stepper's two circles: exactly as tall as they are, and a pill. */
export const stepperBoxShape = (circle: number): TypedBoxShape => ({ height: circle });

/**
 * IBM Plex Mono's line: its ascent and descent (1.025 + 0.275 em, no gap), the line a number in the
 * mono face takes with the font padding off, as `Text.tsx` sets it.
 */
export const MONO_LINE = 1.3;

/**
 * How tall a typed box is drawn: the height of what it sits beside, or its number's line if that is
 * taller (a number at `valueSize`, grown as its role grows, which for a stepper's number is the
 * chrome cap).
 */
export const typedBoxHeight = (height: number, valueSize: number, fontScale: number): number =>
  Math.max(height, valueSize * Math.min(Math.max(fontScale, 0), 1.6) * MONO_LINE);

/** The mono face's advance, in ems: IBM Plex Mono draws every character 600 units of 1000 wide. */
export const MONO_ADVANCE = 0.6;

/**
 * THE UI FACE'S CAPITALS, in ems — Hanken Grotesk Bold's advance widths, read from the TTF the app
 * ships (units per em 1000). The unit beside a compact stepper's number is the `label` role, and
 * the label left the mono face on 2026-09-26 (theme.ts `type.label`), so its width is no longer
 * one number per character: "ML" is 1.36 em where the mono drew 1.20. A character with no entry
 * counts as the widest one here, M, so an unforeseen unit can only make the box too wide.
 */
export const CAPS_ADVANCE: Readonly<Record<string, number>> = {
  A: 0.674,
  B: 0.611,
  C: 0.709,
  D: 0.674,
  E: 0.578,
  F: 0.558,
  G: 0.735,
  H: 0.693,
  I: 0.263,
  J: 0.556,
  K: 0.663,
  L: 0.504,
  M: 0.856,
  N: 0.689,
  O: 0.747,
  P: 0.562,
  Q: 0.785,
  R: 0.612,
  S: 0.575,
  T: 0.584,
  U: 0.657,
  V: 0.672,
  W: 0.979,
  X: 0.67,
  Y: 0.625,
  Z: 0.605,
  '°': 0.422,
};
const CAPS_FALLBACK = 0.856;

/**
 * A UNIT THAT CARRIES ITS OWN CAPITALS KEEPS THEM (2026-09-26, the owner's milliliters: "mL", "L").
 * The `label` role sets a unit in capitals — "OZ", "MIN" — and "ML" is not how a milliliter is
 * written (it is a megaliter). So a unit whose own spelling already has a capital in it is drawn
 * as spelled; every other unit keeps the role's capitals, as before. The box a unit sits in is
 * still measured in capitals (`labelWidth`), and the shipped face's lowercase m is narrower than
 * its capital M (0.843 em to 0.856), so a unit drawn as spelled never outgrows its box.
 */
export const unitKeepsCase = (unit: string): boolean => /[A-Z]/.test(unit);

/** The style that draws such a unit as spelled, or nothing for one the role may capitalize. */
export const unitCaseStyle = (unit: string): { textTransform: 'none' } | undefined =>
  unitKeepsCase(unit) ? { textTransform: 'none' } : undefined;

/** A small-caps word's width in the `label` role at a text scale of 1: advances plus tracking. */
export function labelWidth(text: string): number {
  const label = typeScale.label;
  return [...text.toUpperCase()].reduce(
    (w, c) => w + (CAPS_ADVANCE[c] ?? CAPS_FALLBACK) * label.fontSize + label.letterSpacing,
    0,
  );
}

/**
 * How many characters the widest number on a stepper's range takes, as `formatStepValue` writes
 * it: the longest whole part at either end, a point and every place when there are places, and a
 * sign below zero. 0–17 in halves is "16.5", four; 0–500 in tens is "500", three.
 */
export function widestStepChars(min: number, max: number, decimals: number): number {
  const whole = (v: number) => String(Math.trunc(Math.abs(Number.isFinite(v) ? v : 0))).length;
  const d = Math.max(0, Math.trunc(decimals));
  return Math.max(whole(min), whole(max)) + (d > 0 ? d + 1 : 0) + (min < 0 ? 1 : 0);
}

/**
 * THE COMPACT STEPPER'S NUMBER BOX, at a text scale of 1: as wide as the widest number its range
 * can show, the gap, and the unit in the `label` role. The row is right-aligned, so a box that
 * hugged its number would move the − every time "1" became "1.5" — under the thumb that is about
 * to tap it again. The number is mono and the unit's capitals are tabled (`CAPS_ADVANCE`), so the
 * width is known rather than measured: the caller scales it with the chrome text
 * (`fontScale.chrome`), as the two roles scale, and adds the typed box's air and edge
 * (`typedBoxExtra`), which do not scale. A length that reaches an hour is as wide as its widest
 * "16h 59m" (`widestReadoutWidth`), so the − stays put when 59 minutes become 1h.
 */
export function compactValueWidth(
  min: number,
  max: number,
  decimals: number,
  unitLabel: string,
  kind: TypedKind = 'amount',
): number {
  return widestReadoutWidth(min, max, decimals, unitLabel, kind, COMPACT_STEPPER.value);
}

/* ---------------------------------------------------------------- the readout */

/**
 * AN HOUR AND MORE READS AS HOURS AND MINUTES (the owner, 2026-09-26: *"Minutes are typed as digits
 * only now: 80, not 1:20 … normally, 1h20m is easier to read for user"*). A length is still TYPED as
 * minutes — digits only, the field says "min" beside it and "In minutes" under it — and still held
 * as minutes by every sheet; only what a stepper, a ruler or a round stepper SHOWS changes, from 60
 * minutes on: "1h 20m", "2h", "16h", spelled exactly as the app spells a length everywhere else
 * (core `durationLabel`: the sleep line under the ruler, the Log, the tiles). Under an hour a length
 * keeps today's look — "45" and the unit, "MIN" — because "45m" would be a second spelling of the
 * same forty-five minutes on the same screen for no gain.
 */
export const LONG_LENGTH_MIN = 60;

/** One part of a number as it is shown: its digits, and the unit that follows them. */
export interface ReadoutPart {
  number: string;
  unit: string;
}

/**
 * A NUMBER AS A STEPPER SHOWS IT: one part and its unit label ("4.5" · "oz"), or a length of an
 * hour and more as hours and minutes (`duration`: "1" · "h", "20" · "m"), whose letters are drawn
 * small beside the digits and whose unit label is not drawn at all — "1h 20m MIN" would say it twice.
 */
export interface Readout {
  parts: ReadoutPart[];
  duration: boolean;
}

/** What kind of number a stepper shows: how it is typed, or — not typeable — what its unit says. */
export const readoutKind = (typed: TypedEntry | undefined, unitLabel: string): TypedKind =>
  typed?.kind ?? (unitLabel.trim().toLowerCase() === 'min' ? 'minutes' : 'amount');

export function stepReadout(
  value: number,
  decimals: number,
  unitLabel: string,
  kind: TypedKind,
): Readout {
  if (kind === 'minutes' && Number.isFinite(value) && value >= LONG_LENGTH_MIN) {
    // "1h 20m" / "2h", split at the space into its two halves, each its digits and one letter
    const parts = durationLabel(Math.round(value) * MIN_MS)
      .split(' ')
      .map(p => ({ number: p.slice(0, -1), unit: p.slice(-1) }));
    return { parts, duration: true };
  }
  return {
    parts: [{ number: formatStepValue(value, decimals), unit: unitLabel }],
    duration: false,
  };
}

/** The readout as one line of text — "4.5 oz", "1h 20m" — for a test, a flow, or a sentence. */
export const readoutText = (r: Readout): string =>
  r.duration
    ? r.parts.map(p => `${p.number}${p.unit}`).join(' ')
    : r.parts.map(p => (p.unit ? `${p.number} ${p.unit}` : p.number)).join(' ');

/**
 * How a screen reader says a readout: "1 hour 20 minutes", "2 hours" — the words, never "1h", which
 * more than one reader spells out letter by letter — and anything shorter as `spokenStepValue` says
 * it ("45 minutes", "4.5 oz").
 */
export function spokenReadout(r: Readout, kind?: TypedKind): string {
  if (!r.duration) {
    const only = r.parts[0] ?? { number: '', unit: '' };
    return spokenStepValue(only.number, only.unit, kind);
  }
  const word = (p: ReadoutPart): string =>
    p.unit === 'h'
      ? p.number === '1'
        ? 'hour'
        : 'hours'
      : p.number === '1'
        ? 'minute'
        : 'minutes';
  return r.parts.map(p => `${p.number} ${word(p)}`).join(' ');
}

/** A duration's letters, as a share of its digits' size: small, like a unit, in the digits' face. */
export const DURATION_UNIT_SCALE = 0.55;

/**
 * How wide a readout is at a text scale of 1, with its digits at `size` in the mono face: a plain
 * number, the gap and its unit in the `label` role; or a duration's digits, and its letters and the
 * space between the two halves at `DURATION_UNIT_SCALE` of the size, in the same face.
 */
export function readoutWidth(r: Readout, size: number): number {
  const digits = r.parts.reduce((n, p) => n + p.number.length, 0) * MONO_ADVANCE * size;
  if (r.duration) {
    const small = r.parts.length + (r.parts.length - 1);
    return Math.ceil(digits + small * MONO_ADVANCE * size * DURATION_UNIT_SCALE);
  }
  const unit = r.parts[0]?.unit ?? '';
  return Math.ceil(digits + (unit ? space.xs + labelWidth(unit) : 0));
}

/**
 * THE WIDEST READOUT A RANGE CAN SHOW, measured: the widest plain number it can hold under an hour
 * (every amount, and a length that stays short), and — for a length that reaches an hour — the
 * widest hours it can reach with "59m" beside them. Whichever is wider.
 */
export function widestReadoutWidth(
  min: number,
  max: number,
  decimals: number,
  unitLabel: string,
  kind: TypedKind,
  size: number,
): number {
  const long = kind === 'minutes' && max >= LONG_LENGTH_MIN;
  const plainTop = long ? Math.min(max, LONG_LENGTH_MIN - 1) : max;
  const plain =
    kind === 'minutes' && min >= LONG_LENGTH_MIN
      ? 0
      : readoutWidth(
          {
            parts: [
              { number: '9'.repeat(widestStepChars(min, plainTop, decimals)), unit: unitLabel },
            ],
            duration: false,
          },
          size,
        );
  if (!long) return plain;
  const hours = String(Math.floor(max / LONG_LENGTH_MIN)).length;
  const duration = readoutWidth(
    {
      parts: [
        { number: '9'.repeat(hours), unit: 'h' },
        { number: '59', unit: 'm' },
      ],
      duration: true,
    },
    size,
  );
  return Math.max(plain, duration);
}

/* ---------------------------------------------------------------- the typed box */

/**
 * THE CUE THAT A NUMBER CAN BE TYPED IS A SOFT BOX AROUND IT (the owner, 2026-09-26: *"why is the
 * finish logging time and oz have underline on the number?"*, and of the edge that replaced the
 * underline: *"the border on it feels not very nice … your call"*). It was a dotted rule under the
 * number — which Android draws solid, so it read as a stray underline rather than "tap me" — then a
 * box with a one-point edge. Now every typeable number stands in a soft filled well with no edge
 * (`typedBoxPaint` has the paint and the measurements): one cue for every stepper — the box, the
 * compact row, the round pair and the ruler — so a number that can be typed looks the same
 * everywhere.
 *
 * The geometry: a `radius.s` corner and a little air round the digits — `space.xs` across, half that
 * up and down — so the box grows the row by a hair and a compact row stays one target tall. Across
 * it is kept to the least that still reads as a field, because every point it takes on the compact
 * row comes out of the caption's words beside it ("Left in the bottle") and out of the growth
 * sheet's pounds and ounces, which sit side by side in their box on a 360 pt phone with 2 pt to
 * spare. `focus` is the edge while a number is typed where it stands, drawn INSIDE that air
 * (`padding − focus`), so the box never changes size when it lights.
 */
export const TYPED_BOX = {
  padX: space.xs,
  padY: space.xs / 2,
  focus: 1.5,
} as const;

/** What the box adds to a readout's width: its air, both sides. The focused edge is inside it. */
export const typedBoxExtra = (): number => 2 * TYPED_BOX.padX;

/* ---------------------------------------------------------------- press and hold */

/** The clock a repeat runs on: `setTimeout` / `clearTimeout` on a phone, a fake one in a test. */
export interface RepeatTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface StepRepeater {
  /**
   * One step NOW, then one every `repeatDelay(n)` until `fire` reports that the value did not
   * move (a bound) or `stop` is called. The first step is immediate because the hold starts from
   * `onLongPress`, after which Pressable drops the `onPress` of that touch: a hold that waited
   * for its first tick would step zero times when released inside that wait.
   */
  start(fire: () => boolean): void;
  /** Cancel whatever is pending. Safe at any moment, any number of times — release, unmount. */
  stop(): void;
  /** Whether a step is scheduled: false before a start, after a stop, and at a bound. */
  readonly running: boolean;
}

/**
 * THE HOLD, AS A MACHINE THAT OWNS AT MOST ONE TIMER. `useStepRepeat` wraps it for the two
 * steppers; this is the part with rules worth a test:
 *
 *  - a new hold cancels the old one (a thumb that slides from − to + is one hold at a time);
 *  - a bound ends it — `fire` returns false and nothing further is scheduled;
 *  - a stop that lands WHILE a step is running (an `onChange` that unmounts the stepper) wins:
 *    the step that was under way does not schedule the next one, so nothing outlives the control.
 */
export function createStepRepeater(timers: RepeatTimers): StepRepeater {
  let handle: unknown = null;
  let pending = false;
  // every start and stop begins a new run; a step from an older run schedules nothing
  let run = 0;
  const cancel = (): void => {
    if (pending) timers.clear(handle);
    handle = null;
    pending = false;
  };
  const stop = (): void => {
    run += 1;
    cancel();
  };
  return {
    start(fire) {
      stop();
      const mine = run;
      // n counts the steps taken so far; the wait before step n + 1 is repeatDelay(n)
      let n = 0;
      const tick = (): void => {
        pending = false;
        handle = null;
        if (!fire() || mine !== run) return;
        n += 1;
        handle = timers.set(tick, repeatDelay(n));
        pending = true;
      };
      tick();
    },
    stop,
    get running() {
      return pending;
    },
  };
}

/* ---------------------------------------------------------------- the tick */

/**
 * THE SOFT TICK PER STEP, NEVER A BUZZ (the owner, 2026-09-25, of the "that's cool" list: "a soft
 * tick per stepper step"). Every step a stepper takes is felt as a `tick` — a tap on − or +, each
 * step of a hold, a screen reader's swipe — and 40 ms is the floor under all of them.
 *
 * The hold never comes near it: it steps every 120 ms, then every 60 (`repeatDelay`), and every
 * one of those is felt, which is what makes a held + feel like a wheel turning rather than a
 * motor running. The floor is for what is faster than any hold — a thumb drumming the button, a
 * slow phone catching up on a stalled run and firing two steps in one frame — where ticks stop
 * being felt as ticks at all and become one long buzz under the thumb. The step itself is never
 * held back: only the feel of it is.
 */
export const TICK_MIN_GAP_MS = 40;

/**
 * Whether a step at `nowMs` is felt, given the last one that was (`lastMs`, null for none yet).
 * A clock that has gone BACKWARDS — the phone's time changed — is felt too: a floor measured
 * against a moment in the future would keep the stepper silent until the clock caught up.
 */
export function tickDue(lastMs: number | null, nowMs: number, gapMs = TICK_MIN_GAP_MS): boolean {
  return lastMs === null || nowMs < lastMs || nowMs - lastMs >= gapMs;
}

/* ---------------------------------------------------------------- typing the number */

/**
 * What a typed entry is: a LENGTH in whole minutes (a sleep, a feed, tummy time, a pump session),
 * a plain AMOUNT in the stepper's own unit and precision, or a COUNT of whole things whose word the
 * caption carries — "How many bottles" over a 3 (2026-09-30, the containers a pump session goes
 * into): typed as a whole number, with no unit beside it, and heard as the caller says it
 * (`NumberStepper`'s `say`: "3 bottles").
 */
export type TypedKind = 'minutes' | 'amount' | 'count';

const MIN_WORD = '(?:m|min|mins|minute|minutes)';
const HOUR_WORD = '(?:h|hr|hrs|hour|hours)';
const PLAIN_MINUTES = new RegExp(`^(\\d{1,4}) ?${MIN_WORD}?$`);
const CLOCK_MINUTES = /^(\d{1,2}):([0-5]\d)$/;
const HOURS_MINUTES = new RegExp(`^(\\d{1,2}) ?${HOUR_WORD}(?: ?(\\d{1,2}) ?${MIN_WORD}?)?$`);

/**
 * A length as a parent types it, in whole minutes: `90`, `90m`, `90 min`, `1:30`, `1h`, `1h 30m`,
 * `1 hr 30 min`. Null for everything else — empty, negative, a decimal (`1.5` is an hour and a
 * half to one parent and a minute and a half to another), a clock with 60 or more minutes, text —
 * and a null changes nothing.
 */
export function parseMinutes(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (s === '') return null;
  const plain = PLAIN_MINUTES.exec(s);
  if (plain) return Number(plain[1]);
  const clock = CLOCK_MINUTES.exec(s);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const hm = HOURS_MINUTES.exec(s);
  if (hm) {
    const minutes = hm[2] === undefined ? 0 : Number(hm[2]);
    return minutes > 59 ? null : Number(hm[1]) * 60 + minutes;
  }
  return null;
}

/**
 * An amount as a parent types it: `4`, `4.5`, `.5`, and `4,5` — a comma IS the decimal point on
 * half the keyboards this app ships to. Null for anything else, negative included.
 */
export function parseAmount(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * WHAT A TYPED ENTRY SETS THE STEPPER TO, or null — and on null the stepper keeps its value.
 *
 * A length is whole minutes; an amount keeps the stepper's own precision (`decimals`). Either way
 * the result is clamped into [min, max] rather than refused: the dialog states the range beside
 * the field, so a 20-hour nap typed by mistake becomes the longest the stepper allows instead of
 * a form that will not close. A length is NOT snapped to the step — "Make 35 min tappable so users
 * can enter an exact duration": an exact 37 is the point, and the arrows carry on from it.
 *
 * AN AMOUNT IS PUT ON ITS GRID when the caller hands the grid in (`step`; 2026-09-26). Every sheet
 * holds an amount on its unit's grid — a quarter ounce, five milliliters (core `STEP`) — and shows
 * it there, so a 5.13 kept as typed would be shown as 5 or 5.25 a moment later by the sheet itself.
 * Snapped here, the number the field lets go of is the number the sheet keeps: typed 5.13 reads 5.25
 * as the field closes, never later. Measured from `min`, which every caller keeps on its grid.
 */
export function typedValue(
  text: string,
  kind: TypedKind,
  min: number,
  max: number,
  decimals: number,
  step?: number,
): number | null {
  const n = kind === 'minutes' ? parseMinutes(text) : parseAmount(text);
  if (n === null) return null;
  const clamp = (v: number): number => Math.min(max, Math.max(min, v));
  // a length and a count are whole: the nearest one, inside the range
  if (kind !== 'amount') return clamp(Math.round(n));
  const onGrid =
    step !== undefined && step > 0 ? min + Math.round((clamp(n) - min) / step) * step : n;
  return clamp(roundTo(onGrid, decimals));
}

/* ---------------------------------------------------------------- only numbers, as typed */

/** How many digits the whole part of a number up to `max` can have: 34 → 2, 960 → 3, 1000 → 4. */
export const wholeDigits = (max: number): number =>
  String(Math.trunc(Math.abs(Number.isFinite(max) ? max : 0))).length;

/**
 * WHAT A FIELD KEEPS OF A KEYSTROKE (the owner, 2026-09-26: *"for those number, users must be able
 * to enter only numerical value … instead of 5.5oz, user can type 5.25oz"*). The whole rule for
 * what can stand in the field, applied to every change of its text, so nothing that is not a number
 * is ever on the screen to be refused later:
 *
 *   - digits, and at most ONE decimal point — and only where the number can have places (an amount
 *     whose precision is above zero). A comma is the point on half the keyboards this app ships to,
 *     so it is kept as one, written as a point;
 *   - no more places than the stepper keeps (`decimals`: two for a quarter ounce, none for ml or a
 *     length), and no more whole digits than its largest number has (`wholeDigits`) — a slip that
 *     types 999 into a bag of at most 34 oz stops at 99, and the clamp does the rest;
 *   - a length is whole minutes, digits only: "1:20" and "1h 20m" went with the letters (a long
 *     length is a flick of the ruler now, or its minutes typed).
 *
 * Anything else — a letter, a sign, a second point, a space, a pasted "4 oz" — is simply not kept.
 */
export function sanitizeTyped(
  text: string,
  kind: TypedKind,
  decimals: number,
  maxWhole = 6,
): string {
  const places = kind === 'amount' ? Math.max(0, Math.trunc(decimals)) : 0;
  let whole = '';
  let frac = '';
  let point = false;
  for (const c of text) {
    if (c >= '0' && c <= '9') {
      if (!point && whole.length < maxWhole) whole += c;
      else if (point && frac.length < places) frac += c;
    } else if ((c === '.' || c === ',') && places > 0 && !point) {
      point = true;
    }
  }
  return point ? `${whole}.${frac}` : whole;
}

/**
 * The keypad a number is typed on: the decimal pad where the number can have places, the number
 * pad — digits only, on both platforms — where it cannot (a length, milliliters, a count).
 */
export const typedKeyboard = (kind: TypedKind, decimals: number): 'decimal-pad' | 'number-pad' =>
  kind === 'amount' && decimals > 0 ? 'decimal-pad' : 'number-pad';

/**
 * Turns on typing for a stepper: what its entry is called and what kind of number it takes. Lives
 * here, beside the rules that read it, so the default below is a node test; `StepperEntry` re-exports
 * it under the name the steppers have always used.
 */
export interface TypedEntry {
  /** The entry's title and the field's name — the stepper's visible label ("Slept for"). */
  title: string;
  kind: TypedKind;
  /** The line under the field. Defaults to how to type it and how far it goes (`typedHint`). */
  hint?: string;
}

/**
 * EVERY STEPPER'S NUMBER CAN BE TYPED (2026-09-26, the owner: *"users must be able to enter only
 * numerical value … when they click the number"*). It used to be opt-in, on for lengths and off for
 * amounts, because an amount's sheet snapped a typed value back to a coarser grid; the grid is a
 * quarter ounce now and a typed amount is put on it as it is typed (`typedValue`), so there is
 * nothing left to protect. A stepper that says nothing gets its own name as the title and a kind
 * read off its unit — `min` is a length, anything else an amount; `false` turns typing off.
 */
export function typedEntryFor(args: {
  typeable: TypedEntry | false | undefined;
  caption?: string | undefined;
  accessibilityLabel: string;
  unitLabel: string;
}): TypedEntry | undefined {
  const { typeable, caption, accessibilityLabel, unitLabel } = args;
  if (typeable === false) return undefined;
  if (typeable !== undefined) return typeable;
  return {
    title: caption ?? accessibilityLabel,
    kind: unitLabel.trim().toLowerCase() === 'min' ? 'minutes' : 'amount',
  };
}

/** The text the typing field opens with: the number exactly as the stepper shows it. */
export const typedText = (value: number, decimals: number): string =>
  formatStepValue(value, decimals);

/**
 * THE LINE UNDER THE TYPING FIELD: what may be typed, and the range it is clamped to, said before
 * the parent types rather than discovered after — `In minutes. Up to 16h.` A length's range is in
 * the app's own duration words; an amount's in its unit; a count's as bare numbers, its word being
 * the caption's ("From 1 to 6."). (A length said "Minutes, or 1:20 for 1h 20m" until 2026-09-26,
 * when the field took numbers only — `sanitizeTyped`.)
 */
export function typedHint(
  kind: TypedKind,
  min: number,
  max: number,
  decimals: number,
  unitLabel: string,
): string {
  const say = (v: number): string =>
    kind === 'minutes'
      ? durationLabel(v * MIN_MS)
      : kind === 'count' || !unitLabel
        ? formatStepValue(v, decimals)
        : `${formatStepValue(v, decimals)} ${unitLabel}`;
  const range = min > 0 ? `From ${say(min)} to ${say(max)}.` : `Up to ${say(max)}.`;
  return kind === 'minutes' ? `In minutes. ${range}` : range;
}

/** The screen-reader hint on a number that can be typed: what a double tap does. */
export const typedA11yHint = (kind: TypedKind): string =>
  kind === 'minutes'
    ? 'Double tap to type an exact length'
    : kind === 'count'
      ? 'Double tap to type an exact number'
      : 'Double tap to type an exact amount';

/**
 * How a screen reader says the stepper's value. A length says its unit as a word — "35 minutes",
 * "1 minute" — because "35 min" is read as "35 minimum" by more than one reader; everything else
 * keeps the unit as written ("4.5 oz"), and a number with no unit is just the number (a count,
 * whose words the stepper's `say` gives: "3 bottles").
 */
export function spokenStepValue(display: string, unitLabel: string, kind?: TypedKind): string {
  if (kind === 'minutes') return `${display} ${display === '1' ? 'minute' : 'minutes'}`;
  return unitLabel ? `${display} ${unitLabel}` : display;
}
