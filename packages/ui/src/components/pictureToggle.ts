/**
 * THE TWO-STOP PICTURE TOGGLE AS NUMBERS — what `BottleToggle` and `BathToggle` share (the owner,
 * 2026-09-25, of the "that's cool" list: *"might not necessarily be useful, but it's cool … Let's
 * try doing everything. I will then review"*, after the Appearance sheet's sky toggle). Pure
 * TypeScript, so all of it is tested in node — this package's tests cannot render React Native —
 * and `PictureToggle.tsx` only hands these numbers to views and to `Animated.Value#interpolate`.
 *
 * It is the theme toggle's language (`themeSkyToggle.ts`) with two stops instead of three, and it
 * borrows that toggle's curve, its word arithmetic and its shape of test, so the three controls
 * read as one family:
 *
 *   - a PILL that is the picture's own ground, the theme's hairline drawn round it;
 *   - a KNOB that is a small object — the bottle, the duck — resting at the chosen stop's end of
 *     the pill and travelling to the other end when the choice changes;
 *   - BOTH WORDS, always. The theme toggle writes only the chosen word and shows glyphs for the
 *     rest, because a sun and a moon explain themselves; "Some left" and "Not washed" do not, and
 *     the segmented control this replaces showed a parent both answers. So each stop's word is
 *     written in its own half — bold in the full ink when it is chosen, regular in the quieter ink
 *     when it is not — and the knob's empty end carries a faint GHOST of the knob in that stop's
 *     state, so the pill says "the bottle goes here" without a second color doing the work.
 *
 * TWO VALUES DRIVE THE TRACK, as the theme toggle's knob and pictures have values of their own.
 * `pos` is WHERE the knob is (0 at the first stop, 1 at the second) and it is what the words, the
 * ghosts and the knob's travel are read from. `sway` is HOW the knob is moving — 0 at rest, run to
 * +1 through a move to the right and to −1 through a move to the left, then set back to 0, which
 * every frame of it draws exactly as rest. A frame of `pos` cannot tell a move to the right from
 * one to the left, and a bottle pushed along a counter leans BACK as it sets off and FORWARD as it
 * stops, whichever way it goes: that is a question of direction, so it is `sway`'s.
 */
import type { ThemeName } from '../theme/theme';
import { type as typeScale } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import { easeAt, SKY_EASE, spanWidth, type Span } from './themeSkyToggle';

/* ----------------------------------------------------------------------------- the stops */

/** The first option's end of the pill (left) and the second's (right): the knob's value is in these. */
export type PictureStop = 0 | 1;
export const PICTURE_STOPS: readonly PictureStop[] = [0, 1];

/* ---------------------------------------------------------------------------- the size */

/**
 * The pill. 56 tall, twelve more than the segmented control it replaces, because the knob is a
 * PICTURE — a bottle has to be tall enough for a parent to see where its milk stands — and each
 * half of the pill is one stop's tap zone, so every target is well over the 44 floor (CLAUDE.md
 * §6). The knob's box sits `inset` inside every edge, and the `rim`, the theme's hairline, is drawn
 * inside that inset, as the theme toggle's is.
 *
 * ITS WIDTH IS THE SHEET'S BODY, up to `maxWidth`. It sits in a quick-entry sheet directly under
 * a full-width segmented control (the bottle's Type), so it takes the whole body on every phone —
 * 324 pt on a 360 dp Android, 339 on a 375 pt iPhone, 394 on the largest — and stops only past
 * any phone, where a pill a tablet wide would be a banner. `minWidth` is not a clamp: it is the
 * narrowest body the word placement is PROVEN at with room to grow (a 344 pt window, narrower
 * than every phone the app supports), and `pictureToggle.test.ts` walks every half point from it.
 */
export const PICTURE_TOGGLE_SIZE = {
  height: 56,
  inset: 4,
  rim: 1,
  minWidth: 308,
  maxWidth: 440,
} as const;

/**
 * The clear room kept between a word and the knob's slot — `space.md`, the theme toggle's
 * `WORD_GAP` — and, split either side of the middle, between the two words.
 */
export const PICTURE_WORD_GAP = 8;

/**
 * THE WORDS' SIZE AND HOW FAR THEY MAY GROW. The segmented control's own size — `bodySm`, 13 —
 * read from the type scale, drawn bold for the chosen stop as the segmented control draws it.
 *
 * `advance` is the theme toggle's bound on how wide a character may be (0.6 of the size): a BOUND
 * for the app's face and the system face that stands in before it loads, and generous for words
 * in lower case. `floor` and `ceiling` bound the font scale the words follow: they grow with the
 * phone's text size as far as their half of the pill allows (`pictureWordCap`), never past the
 * chrome cap (1.6, `CHROME_FONT_CAP` in Text.tsx), and the placement test holds that the room is
 * never less than 1.3 at any width a phone gives. `shrink` is how far `adjustsFontSizeToFit` may
 * take a word the bound did not foresee: smaller and whole, on one line, never cut off.
 *
 * THE SAME TRADE THE THEME TOGGLE MADE (docs/DESIGN_SYSTEM.md §17.3): the segmented control's
 * words grew without a cap and wrapped the row onto a second line; a picture has a fixed height,
 * so its words stop at 1.6× and shrink rather than break. The radios' names are the words
 * themselves, so a screen reader and the phone's own large-text tools read them whole.
 */
export const PICTURE_WORD = {
  size: typeScale.bodySm.fontSize,
  advance: 0.6,
  floor: 1.3,
  ceiling: 1.6,
  shrink: 0.75,
} as const;

export interface PictureToggleGeometry {
  width: number;
  height: number;
  inset: number;
  rim: number;
  /** The knob's box: `slot` wide — the picture's own width and a little air — and `knob` tall. */
  slot: number;
  knob: number;
  /** How much further in than `inset` the knob rests at either end (a tall picture's shoulders). */
  endPad: number;
  /** The knob box's left edge at rest, at each stop. */
  rest: readonly [number, number];
  /** How far the knob moves from one stop to the other. */
  travel: number;
  /** The middle of each stop's slot: where the knob rests, and where its ghost is drawn. */
  center: readonly [number, number];
  /** Where each stop's word is written: its half of the pill, less the slot at its end. */
  word: readonly [Span, Span];
  /** Each stop's tap zone: half the pill. */
  zone: number;
}

/**
 * The pill at `width`, for a knob `slot` wide. `endPad` is the room a picture needs beyond the
 * inset at the pill's round ends: a square-shouldered bottle standing at the inset would put its
 * foot through the curve, so it rests a few points further in (`BOTTLE_END_PAD`).
 */
export function pictureToggleGeometry(
  width: number,
  slot: number,
  endPad = 0,
): PictureToggleGeometry {
  const { height, inset, rim, maxWidth } = PICTURE_TOGGLE_SIZE;
  // never narrower than two zones as wide as the pill is tall, whatever a first frame measures
  const w = Math.min(Math.max(width, 2 * height), maxWidth);
  const knob = height - 2 * inset;
  const rest = [inset + endPad, w - inset - endPad - slot] as const;
  const travel = rest[1] - rest[0];
  const center = [rest[0] + slot / 2, rest[1] + slot / 2] as const;
  const mid = w / 2;
  const word = [
    // right of the first stop's slot, up to the middle
    { left: rest[0] + slot + PICTURE_WORD_GAP, right: mid - PICTURE_WORD_GAP / 2 },
    // from the middle, up to the second stop's slot
    { left: mid + PICTURE_WORD_GAP / 2, right: rest[1] - PICTURE_WORD_GAP },
  ] as const;
  return {
    width: w,
    height,
    inset,
    rim,
    slot,
    knob,
    endPad,
    rest,
    travel,
    center,
    word,
    zone: w / 2,
  };
}

/* --------------------------------------------------------------------------- the words */

/** How wide `label` may be at `scale` × the words' size: characters × the bound (`PICTURE_WORD`). */
export const pictureWordWidth = (label: string, scale = 1): number =>
  [...label].length * PICTURE_WORD.advance * PICTURE_WORD.size * scale;

/**
 * How far the words may grow with the phone's text size and still fit: the largest scale at which
 * BOTH fit their halves, capped at the chrome cap and never reported below 1 (a word that does not
 * fit even at 1 is `adjustsFontSizeToFit`'s to shrink). Both words are drawn at once, so both
 * decide it; the Text is handed the answer as its `maxFontSizeMultiplier`.
 */
export function pictureWordCap(
  g: PictureToggleGeometry,
  labels: readonly [string, string],
): number {
  const room = PICTURE_STOPS.map(
    s => spanWidth(g.word[s]) / Math.max(1, pictureWordWidth(labels[s])),
  );
  return Math.min(PICTURE_WORD.ceiling, Math.max(1, Math.min(...room)));
}

/* ------------------------------------------------------------------- when nothing moves */

/**
 * WHETHER THE PICTURE MAY MOVE AT ALL — the two rules every piece of the "that's cool" batch
 * keeps, in one place so both toggles keep them the same way:
 *
 *   - REDUCE MOTION sets the end state and starts nothing (docs/DESIGN_SYSTEM.md §7: "disables
 *     transforms and transitions but never hides content"), read from the theme as every
 *     component below `AppearanceProvider` reads it;
 *   - the amber NIGHT theme moves nothing and lights nothing: it exists to keep a dark room dark
 *     (theme.ts, usage rule 7), and a bottle sliding or bubbles rising at 3 a.m. is exactly the
 *     kind of thing on a screen that is not information. The picture is still drawn — in the night
 *     palette's roles (`theme/bottle.ts`, `theme/bath.ts`) — at its end state.
 */
export const pictureStill = (reduceMotion: boolean, theme: ThemeName): boolean =>
  reduceMotion || theme === 'night';

/* --------------------------------------------------------------------------- the move */

/**
 * One move, end to end. The theme toggle takes 728 ms for its two strides; this knob covers about
 * the same distance with nothing to roll, and it answers a question in a form a parent wants to be
 * done with, so it is a little quicker. A move that starts part of the way across is shorter.
 */
export const PICTURE_MS = 600;
export const pictureMoveMs = (distance: number): number =>
  Math.round(PICTURE_MS * (0.35 + 0.65 * Math.min(Math.max(distance, 0), 1)));

/**
 * The knob's curve: the theme toggle's `land` — a slow start and a long, soft arrival, with no
 * overshoot, because both of this toggle's stops are at an END of the pill and the rim is four
 * points away. An object slid along a counter stops where it stops.
 */
export const PICTURE_EASE = SKY_EASE.land;

/** A move in flight: where the knob set off from, where to, when, and for how long. */
export interface PictureMotion {
  from: number;
  to: PictureStop;
  startedAt: number;
  duration: number;
}

/** Where the knob is, as a fraction of the way across, `now` — an estimate; the native driver has the truth. */
export function pictureKnobAt(m: PictureMotion, now: number): number {
  const x = m.duration <= 0 ? 1 : (now - m.startedAt) / m.duration;
  return m.from + (m.to - m.from) * easeAt(PICTURE_EASE, x);
}

export interface PicturePlan {
  animate: boolean;
  /** Where the knob is as the move begins — the next re-target's starting point. */
  from: number;
  to: PictureStop;
  duration: number;
  /** Where `sway` runs to: +1 for a move to the right, −1 to the left, 0 when nothing moves. */
  sway: -1 | 0 | 1;
}

/**
 * WHAT A CHANGE OF STOP DOES. From rest, the knob sets off from its stop; mid-move, it turns round
 * from where the clock and the curve say it is (the native driver moves it; JavaScript only
 * estimates, to size the move — the theme toggle's `knobAt`), so a second tap never makes it jump.
 * When the picture is still (`pictureStill`) nothing animates: `pos` is set to the stop.
 */
export function planPictureMove(
  motion: PictureMotion | null,
  at: PictureStop,
  to: PictureStop,
  now: number,
  still: boolean,
): PicturePlan {
  if (still) return { animate: false, from: to, to, duration: 0, sway: 0 };
  const moving = motion !== null && now < motion.startedAt + motion.duration;
  const from = moving ? pictureKnobAt(motion, now) : at;
  const distance = Math.abs(to - from);
  return {
    animate: distance > 1e-6,
    from,
    to,
    duration: pictureMoveMs(distance),
    sway: to > from ? 1 : to < from ? -1 : 0,
  };
}

/* ------------------------------------------------------------------------- the frames */

export const pictureFrame = (
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => ({ inputRange, outputRange, extrapolate });

export interface PictureTrackFrames {
  /** Of `pos`: the knob's travel, from the first stop's end to the second's. */
  knobX: Frame;
  /**
   * Of `pos`: each stop's word in the chosen ink and weight, and in the quiet one — a cross-fade
   * while the knob is on its way, so the words change with the move rather than before it.
   */
  chosen: readonly [Frame, Frame];
  quiet: readonly [Frame, Frame];
  /**
   * Of `pos`: each stop's ghost. It leaves before the knob arrives over it and comes back only once
   * the knob has gone, so the ghost and the knob are never drawn on top of each other.
   */
  ghost: readonly [Frame, Frame];
}

export function pictureTrackFrames(g: PictureToggleGeometry): PictureTrackFrames {
  return {
    knobX: pictureFrame([0, 1], [0, g.travel]),
    chosen: [pictureFrame([0.25, 0.75], [1, 0]), pictureFrame([0.25, 0.75], [0, 1])],
    quiet: [pictureFrame([0.25, 0.75], [0, 1]), pictureFrame([0.25, 0.75], [1, 0])],
    ghost: [pictureFrame([0.35, 0.8], [0, 1]), pictureFrame([0.2, 0.65], [1, 0])],
  };
}

/**
 * A MOVE'S BODY LANGUAGE, as a frame of `sway`: `amplitude` at the push and less on the way in,
 * mirrored for a move the other way (the frame is odd: f(−s) = −f(s)). Positive `sway` is a move
 * to the right, and a positive angle turns clockwise, so for a knob that LEANS:
 *
 *   at a quarter  −a    the top is left behind as the base is pushed away
 *   at 0.7        +0.6a it carries on over the base as the base slows
 *   at 0.9        −0.3a one small rock back
 *   at the end     0    upright, and exactly what rest draws — `sway` is set back to 0 there
 *
 * The milk inside the bottle takes the same frame the other way round and further (`slosh`), which
 * is what a liquid does in a container that is pushed: it piles up at the back.
 */
export function swayFrame(amplitude: number): Frame {
  const a = amplitude;
  return pictureFrame(
    [-1, -0.9, -0.7, -0.25, 0, 0.25, 0.7, 0.9, 1],
    [0, 0.3 * a, -0.6 * a, a, 0, -a, 0.6 * a, -0.3 * a, 0],
  );
}

/**
 * A MOVE'S EVEN PART, as a frame of `sway` that is the same both ways (f(−s) = f(s)): `values` at
 * the given fractions of a move, 0 at rest and at the end. The duck's bob and its ripples.
 */
export function swayEven(at: readonly number[], values: readonly number[]): Frame {
  const inner = at.map((x, i) => [x, values[i] ?? 0] as const);
  const right = [[0, 0] as const, ...inner, [1, 0] as const];
  const left = [...right].reverse().map(([x, v]) => [-x, v] as const);
  const both = [...left.slice(0, -1), ...right];
  return pictureFrame(
    both.map(([x]) => x),
    both.map(([, v]) => v),
  );
}
