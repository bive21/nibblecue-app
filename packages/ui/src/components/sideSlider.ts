/**
 * THE SIDE SLIDER AS NUMBERS (the owner, 2026-09-26, of the breastfeed sheet's two buttons: *"what
 * about user has to swipe to left or right from a button in the middle that needs to be
 * dragged"*). Pure TypeScript, so all of it is tested in node — this package's tests cannot render
 * React Native — and `SideSlider.tsx` only hands a finger's travel to these and draws what they
 * return.
 *
 * WHAT IT IS: a pill with a knob resting in the MIDDLE and a word at each end. Drag the knob far
 * enough toward a word, or flick it that way, and let go: it slides the rest of the way and that
 * side is chosen. Let go short of that and it springs home. Each word is also a button of its own,
 * so a parent with one hand full is never made to drag.
 *
 * WHY A DRAG CAN LIVE IN A SHEET THAT SCROLLS. The theme and picture toggles refused one ("a
 * sideways drag fights the scroll"), and they were right for a drag that claims a touch where it
 * lands. This one never does: it asks for the touch only once the finger has travelled `claim`
 * points sideways AND clearly further sideways than up or down (`claimsSlide`), so a scroll that
 * starts on it is the sheet's, and a tap is its words' or its knob's. And while nothing is armed,
 * a drag that has turned into a scroll is handed back to the sheet (`yieldsToScroll`).
 *
 * ONE TICK MEANS "LET GO NOW". The knob arms a side at `arm` of the way to it — one `tick` as it
 * crosses, and the word lights — and stays armed until it is dragged back under `disarm`, a little
 * nearer the middle, so a thumb resting on the line is felt once rather than as a buzz. Letting go
 * while armed chooses that side: the tick and the result never disagree.
 */
import { withAlpha } from '../theme/contrast';
import { hit, moduleColor, type as typeScale, type Palette, type ThemeName } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import { spanWidth, type Span } from './themeSkyToggle';

/* ----------------------------------------------------------------------------- the sides */

/** Which way the knob went. Physical sides: a breast's left is the parent's left in any language. */
export type SliderSide = 'left' | 'right';
export const SLIDER_SIDES = ['left', 'right'] as const satisfies readonly SliderSide[];

/** −1 for the left, +1 for the right: the knob's offset from the middle carries its side's sign. */
export const sideSign = (side: SliderSide): -1 | 1 => (side === 'left' ? -1 : 1);

/** The side a signed number points to — an offset or a velocity — or null for none. */
export const sideOf = (n: number): SliderSide | null => (n < 0 ? 'left' : n > 0 ? 'right' : null);

/* ---------------------------------------------------------------------------- the size */

/**
 * THE PILL. 52 tall — as short as reads well: the knob it holds is 44, the floor for something a
 * thumb has to find (CLAUDE.md §6), with `inset` of the pill's own ground round it, and the pill is
 * no taller than it must be to hold that. The two picture toggles in the same sheets are 56 because
 * their knob is a picture; this one is a disc.
 *
 * ITS WIDTH IS THE SHEET'S BODY, up to `maxWidth` (the picture toggles' cap, so the quick sheets'
 * wide controls end at one line): 324 pt on a 360 dp Android, 339 on a 375 pt iPhone, 394 on the
 * largest phone. `minWidth` is not a clamp; it is the narrowest body the placement is PROVEN at (the
 * theme toggle's floor, below every phone the app supports), and `sideSlider.test.ts` walks every
 * half point from it.
 *
 * `glyph` is the knob's drawing, one size under the illustrated set's threshold
 * (`ILLUSTRATED_MIN_SIZE`, 16) so it stays the one-ink glyph the knob can paint in its own pair,
 * never the owner's four-color picture, which would sit on the knob's ink as a sticker.
 */
export const SIDE_SLIDER = {
  height: 52,
  inset: 4,
  rim: 1,
  minWidth: 272,
  maxWidth: 440,
  glyph: 15,
} as const;

/**
 * THE WORDS AT THE ENDS. `bodyStrong`'s size, 15 — they are the two answers, the biggest words on
 * the control — on `body`'s line, so the quiet and the lit word, drawn one over the other, stand on
 * the same baseline.
 *
 * `advance` is the theme toggle's BOUND on how wide a character may be (0.6 of the size), generous
 * for the app's face and the system face that stands in before it loads. Each end is sized so its
 * word fits at `floor` × the phone's text (1.3×, the floor every capped word in the design system
 * holds); past that the word is capped (`sideWordCap`), and a word the bound did not foresee is made
 * smaller rather than cut off (`shrink`, `adjustsFontSizeToFit`). `ceiling` is the chrome cap (1.6).
 *
 * `edge` keeps a word off the pill's round end — at 12 points in, the curve still leaves 43 of the
 * 52 points of height, room for a word at 1.3× — and `gap` is `space.md`, the air between a word and
 * the knob when the knob comes to rest beside it.
 */
export const SIDE_WORD = {
  size: typeScale.bodyStrong.fontSize,
  lineHeight: typeScale.body.lineHeight,
  advance: 0.6,
  floor: 1.3,
  ceiling: 1.6,
  shrink: 0.75,
  edge: 12,
  gap: 8,
} as const;

/**
 * THE HINT BESIDE THE KNOB: a chevron each side of it at rest, pointing out (‹ ›), `gap` clear of
 * the knob. They say "this moves, either way" and nothing else, so they leave as soon as the knob
 * does — gone once it has moved `fade` points — and come back when it is home.
 */
export const SIDE_CHEVRON = { size: 14, gap: 3, fade: 10 } as const;

/**
 * WHEN A FINGER IS THE SLIDER'S, AND WHAT IT MEANS WHEN IT LIFTS.
 *
 *   claim      the finger has moved this far sideways (points) — past a tap's wobble, the same
 *              order as the Log's swipe and the tour card's — before the slider asks for it…
 *   dominance  …and this many times further sideways than up or down: within about 34° of level.
 *              A thumb's arc across a phone is rarely flatter than that; a scroll is never this flat.
 *   arm        the share of the way from the middle to an end that arms that side: a little over
 *              half, so it is a decision and not a nudge, and never the whole way, which a thumb
 *              would have to aim for.
 *   disarm     the share it has to come back under to let the side go again — the band between the
 *              two is what keeps a resting thumb from ticking on and off the line.
 *   fling      a flick counts however short the drag: at least `velocity` points a millisecond
 *              (500 a second, a quick flick and not a drag) toward a side, with the knob already
 *              `travel` points on its way there, so a wobble at speed is not a choice.
 */
export const SIDE_GESTURE = {
  claim: 8,
  dominance: 1.5,
  arm: 0.6,
  disarm: 0.5,
  fling: { velocity: 0.5, travel: 16 },
} as const;

export interface SideSliderGeometry {
  width: number;
  height: number;
  inset: number;
  rim: number;
  /** The knob's diameter. */
  knob: number;
  /** Each end's zone — its word's room and its tap target — from the pill's end to the knob's stop. */
  end: number;
  /** The knob's left edge at rest, in the middle. */
  rest: number;
  /** How far the knob travels from the middle to either end. */
  half: number;
  /** How far from the middle the knob arms a side, and how far back it has to come to let it go. */
  arm: number;
  disarm: number;
  /** Where each word is written. */
  word: Record<SliderSide, Span>;
  /** The soft light behind a lit word: its box, inside the word's end and clear of the knob. */
  glow: Record<SliderSide, Span>;
  /** The center of each chevron beside the knob at rest. */
  chevron: Record<SliderSide, number>;
  /** The middle zone between the two ends: the knob's own target. */
  middle: Span;
}

/** How wide `label` may be at `scale` × the words' size: characters × the bound (`SIDE_WORD`). */
export const sideWordWidth = (label: string, scale = 1): number =>
  [...label].length * SIDE_WORD.advance * SIDE_WORD.size * scale;

/**
 * The pill at `width`, for the caller's two words. The ends are sized by the LONGER word, both the
 * same, so the knob's rest is the true middle and both sides are the same drag away.
 */
export function sideSliderGeometry(
  width: number,
  words: Readonly<Record<SliderSide, string>>,
): SideSliderGeometry {
  const { height, inset, rim, maxWidth } = SIDE_SLIDER;
  const { edge, gap, floor } = SIDE_WORD;
  const knob = height - 2 * inset;
  const longest = Math.max(sideWordWidth(words.left, floor), sideWordWidth(words.right, floor));
  // every end is a 44 pt target at least, whatever the word
  const end = Math.max(hit.min, Math.ceil(edge + longest + gap));
  // never so narrow that the knob cannot move its own width, whatever a first frame measures
  const w = Math.min(Math.max(width, 2 * end + 2 * knob), maxWidth);
  const half = Math.max(0, (w - 2 * end - knob) / 2);
  const rest = (w - knob) / 2;
  const mid = w / 2;
  const chevron = knob / 2 + SIDE_CHEVRON.gap + SIDE_CHEVRON.size / 2;
  const word = {
    left: { left: edge, right: end - gap },
    right: { left: w - end + gap, right: w - edge },
  };
  // the light sits on the word, centered on it and no wider than its room between the pill's end
  // and the knob at rest beside it, so it never falls on the knob
  const glowOf = (s: Span): Span => {
    const c = (s.left + s.right) / 2;
    const r = Math.min(c - edge / 2, s.right + gap / 2 - c);
    return { left: c - r, right: c + r };
  };
  return {
    width: w,
    height,
    inset,
    rim,
    knob,
    end,
    rest,
    half,
    arm: SIDE_GESTURE.arm * half,
    disarm: SIDE_GESTURE.disarm * half,
    word,
    glow: { left: glowOf(word.left), right: glowOf(word.right) },
    chevron: { left: mid - chevron, right: mid + chevron },
    middle: { left: end, right: w - end },
  };
}

/**
 * How far the words may grow with the phone's text size and still fit their ends: the largest
 * scale at which both fit, capped at the chrome cap, never reported below 1. The ends are sized for
 * `floor`, so this is at least 1.3 for any pair of words (the test walks it); the Text is handed it
 * as its `maxFontSizeMultiplier`.
 */
export function sideWordCap(
  g: SideSliderGeometry,
  words: Readonly<Record<SliderSide, string>>,
): number {
  const room = SLIDER_SIDES.map(s => spanWidth(g.word[s]) / Math.max(1, sideWordWidth(words[s])));
  return Math.min(SIDE_WORD.ceiling, Math.max(1, Math.min(...room)));
}

/* ------------------------------------------------------------------------- the gesture */

/** A finger's travel since it went down, as a `PanResponder` reports it. */
export interface SlideMove {
  dx: number;
  dy: number;
}

/** Whether a move is the parent sliding the knob: sideways past `claim`, and mostly sideways. */
export function claimsSlide(g: SlideMove): boolean {
  const across = Math.abs(g.dx);
  return across >= SIDE_GESTURE.claim && across > SIDE_GESTURE.dominance * Math.abs(g.dy);
}

/**
 * Whether the slider lets the sheet's scroll take a touch it is holding: when the finger has
 * turned more up-and-down than sideways and nothing is armed. An armed side is kept — the parent
 * has already been told, by the tick and the lit word, that letting go chooses it.
 */
export function yieldsToScroll(g: SlideMove, armed: SliderSide | null): boolean {
  return armed === null && Math.abs(g.dy) > Math.abs(g.dx);
}

/** The knob's offset from the middle while a finger drags it `dx`: under the finger, never past an end. */
export const knobOffset = (dx: number, g: Pick<SideSliderGeometry, 'half'>): number =>
  Math.max(-g.half, Math.min(g.half, dx));

/**
 * WHICH SIDE IS ARMED once the knob is at `x`, given the side that was: a side arms at `arm` and
 * stays armed down to `disarm` (see `SIDE_GESTURE`). The caller ticks when this returns a side it
 * did not have, and only then.
 */
export function armAfter(
  armed: SliderSide | null,
  x: number,
  g: Pick<SideSliderGeometry, 'arm' | 'disarm'>,
): SliderSide | null {
  const side = sideOf(x);
  const reach = Math.abs(x);
  if (side === null) return null;
  if (side === armed && reach >= g.disarm) return armed;
  return reach >= g.arm ? side : null;
}

/**
 * WHAT A LIFT OF THE FINGER CHOOSES, or null to spring home. `x` is where the knob was, `vx` the
 * finger's speed at the lift in points a millisecond (React Native's `gestureState.vx`), `armed`
 * what `armAfter` last said.
 *
 *   armed        that side — unless the finger was flicking it back toward the middle as it lifted,
 *                which is a parent changing their mind, and the knob goes home;
 *   not armed    a flick toward a side, with the knob already on its way there, chooses it;
 *   otherwise    nothing: the knob springs home and nothing starts.
 */
export function sideOnRelease(r: {
  x: number;
  vx: number;
  armed: SliderSide | null;
}): SliderSide | null {
  const { velocity, travel } = SIDE_GESTURE.fling;
  const flung = Math.abs(r.vx) >= velocity ? sideOf(r.vx) : null;
  if (r.armed !== null) return flung !== null && flung !== r.armed ? null : r.armed;
  if (flung !== null && flung === sideOf(r.x) && Math.abs(r.x) >= travel) return flung;
  return null;
}

/* --------------------------------------------------------------------------- the motion */

/**
 * HOW THE KNOB MOVES WHEN THE FINGER IS NOT MOVING IT.
 *
 *   slide     the rest of the way to a chosen end: `slideMs` for the whole half, less for less and
 *             never under `slideMinMs`, on the sheet's own ease-out (docs/DESIGN_SYSTEM.md §7) —
 *             fast off the mark, because a released knob is already moving, and no overshoot,
 *             because the end is a wall with a word behind it.
 *   spring    home to the middle when nothing was chosen: stiffness 300 and damping 24 on a mass of
 *             1 is a damping ratio of 0.69 — a knob that comes back like a rubber band, over the
 *             middle by about 5% of where it was let go, and still inside a third of a second.
 *   litMs     how long a word takes to light, or to go out.
 *   nudge     a tap on the knob itself shows it moves: this far out one way, then the other, then
 *             home, over these three steps. Nothing is chosen by it.
 */
export const SIDE_MOTION = {
  slideMs: 200,
  slideMinMs: 80,
  ease: [0.22, 0.8, 0.28, 1] as const,
  spring: { stiffness: 300, damping: 24, mass: 1 },
  litMs: 120,
  nudge: { distance: 5, ms: [70, 120, 90] as const },
} as const;

/**
 * WHETHER THE SLIDER MAY ANIMATE: not under REDUCE MOTION, which "disables transforms and
 * transitions but never hides content" (docs/DESIGN_SYSTEM.md §7). There the knob jumps to where
 * a choice sends it and the word is simply lit; the drag itself still follows the finger, because
 * that is the parent's own hand moving, not the screen.
 *
 * UNLIKE THE PICTURE TOGGLES (`pictureStill`), THE AMBER NIGHT DOES NOT HOLD IT STILL. Theirs is a
 * picture played for a choice made by a tap; here the knob's travel IS the answer to a drag, and a
 * knob that froze where the thumb let go at 3 a.m. would leave the parent unsure what they had
 * done. What Night takes away is the light: no glow behind a lit word and no shadow under the knob
 * (`sideSliderColors`), only the night palette's own roles.
 */
export const sideSliderStill = (reduceMotion: boolean): boolean => reduceMotion;

/** How long the slide the rest of the way takes, from `x` to the end of `side`. */
export function slideMs(x: number, side: SliderSide, g: Pick<SideSliderGeometry, 'half'>): number {
  if (!(g.half > 0)) return 0;
  const left = Math.min(1, Math.abs(sideSign(side) * g.half - x) / g.half);
  return Math.round(Math.max(SIDE_MOTION.slideMinMs, SIDE_MOTION.slideMs * left));
}

/** Where the knob goes next, and how: jumped, slid to a chosen end, or sprung home. */
export interface KnobPlan {
  to: number;
  how: 'jump' | 'slide' | 'spring';
  duration: number;
}

export function planKnob(
  x: number,
  side: SliderSide | null,
  g: Pick<SideSliderGeometry, 'half'>,
  still: boolean,
): KnobPlan {
  const to = side === null ? 0 : sideSign(side) * g.half;
  if (still) return { to, how: 'jump', duration: 0 };
  if (side === null) return { to, how: 'spring', duration: 0 };
  return { to, how: 'slide', duration: slideMs(x, side, g) };
}

/* ------------------------------------------------------------------------- the frames */

const frame = (
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => ({ inputRange, outputRange, extrapolate });

/**
 * WHAT THE TWO VALUES DRAW, for `Animated.Value#interpolate` on the native driver. `x` is the knob's
 * offset from the middle in points (the knob is translated by it directly); `lit` runs from −1 (the
 * left word lit) through 0 (neither) to +1 (the right word lit), and is moved only when a side is
 * armed, chosen or let go — so a word lights exactly when the tick says it may.
 */
export interface SideSliderFrames {
  /** Of `x`: both chevrons, whole at rest and gone once the knob has moved `fade` either way. */
  chevron: Frame;
  /** Of `lit`: each side's lit word and the glow behind it… */
  lit: Record<SliderSide, Frame>;
  /** …and its quiet word, which gives way to it. */
  quiet: Record<SliderSide, Frame>;
}

export function sideSliderFrames(): SideSliderFrames {
  const f = SIDE_CHEVRON.fade;
  return {
    chevron: frame([-f, 0, f], [0, 1, 0]),
    lit: { left: frame([-1, 0], [1, 0]), right: frame([0, 1], [0, 1]) },
    quiet: { left: frame([-1, 0], [0, 1]), right: frame([0, 1], [1, 0]) },
  };
}

/* ------------------------------------------------------------------------- the colors */

/** A module's color role: its ink, and — by the palette's own naming — `${role}Soft`, its tint. */
export type SideSliderRole = (typeof moduleColor)[keyof typeof moduleColor];

/**
 * THE GLOW BEHIND A LIT WORD: the module's ink, `GLOW_STOPS` strong at its heart and gone at its
 * edge, drawn in light and dark and never in the amber Night. The lit word is measured over its
 * heart, where it is strongest (`sideSlider.test.ts`).
 */
export const GLOW_STOPS: readonly { offset: number; opacity: number }[] = [
  { offset: 0, opacity: 0.32 },
  { offset: 0.6, opacity: 0.14 },
  { offset: 1, opacity: 0 },
];

/** How strong the knob's shadow is where it is drawn, as the color's own alpha. */
export const KNOB_SHADOW_ALPHA = 0.3;

export interface SideSliderColors {
  /** The pill: the module's soft tint. */
  ground: string;
  /** The knob, and the chevrons beside it: the module's ink — a mark, 3:1 on the pill. */
  knob: string;
  chevron: string;
  /** The knob's glyph: the pill's own ground, so the pair on the knob is the pill's pair reversed. */
  glyph: string;
  /** A lit word and a quiet one: the theme's text pair, 4.5:1 on the pill, and on the glow. */
  word: string;
  quiet: string;
  /** The glow's color at full strength; null where nothing may be lit (the amber Night). */
  glow: string | null;
  /** The knob's shadow, alpha included; null where there are no shadows (the amber Night). */
  shadow: string | null;
}

/**
 * THE SLIDER'S COLORS, FROM THE PALETTE AND NOTHING ELSE: the module's ink and its soft tint — the
 * pair the sheet's own tandem card is drawn in — and the theme's text pair for the words. The
 * scheme overlays neither (theme.ts: a scheme never touches the category hues or the text), so one
 * measurement per theme holds in all six schemes; the test walks them anyway.
 */
export function sideSliderColors(
  palette: Palette,
  role: SideSliderRole,
  theme: ThemeName,
): SideSliderColors {
  const ink = palette[role];
  const soft = palette[`${role}Soft`];
  const night = theme === 'night';
  return {
    ground: soft,
    knob: ink,
    chevron: ink,
    glyph: soft,
    word: palette.text,
    quiet: palette.text2,
    glow: night ? null : ink,
    // under a light theme the shadow is the page's dark ink; under dark, the page itself, darker
    // than anything on it — never the near-white text, which would draw a glow, not a shadow
    shadow: night
      ? null
      : withAlpha(theme === 'light' ? palette.text : palette.page, KNOB_SHADOW_ALPHA),
  };
}
