/**
 * The lit ground (docs/DESIGN_SYSTEM.md §1, §13; theme.ts usage rule 6): three soft radial
 * washes behind every screen, four soft-tint orbs behind glass, and four very faint line
 * glyphs behind the first-run screens only. All of the arithmetic lives here, with no React and
 * no react-native, for two reasons: contrast.test.ts has to composite the result to measure it,
 * and a composition is the kind of thing that is only ever verified by a test in a workspace
 * with no renderer.
 *
 * Usage rule 6 asks for exactly this — "Grounds stay tinted: `app` + the soft radial washes.
 * Never pure #FFF or flat gray" — and §1 names the washes as "lavender top-right, peach bottom".
 * The tokens for them (`page`, `pageWarm`, `pageCool`) have existed in all three themes since
 * WP3 and were painted by nothing. This is not a new idea; it is the unbuilt half of an old one.
 * Usage rule 2 — "never a page background" — governs the five saturated BRAND gradients (brand,
 * milk, sleep, rose, clay), which are the CTA's, the FAB's and a running timer's. It is not this.
 *
 * EVERYTHING SCALES OFF ONE SCALAR: `SkinTokens.groundWash`, which skins.ts has declared since
 * WP3 and nothing has read — 0.12 Soft, 0.22 Glass, 0 Paper, and `skinForTheme` already forces 0
 * in night. Every function here returns an empty list or a zero when it is 0, so Paper draws flat
 * and night draws nothing WITHOUT a single `theme ===` check anywhere in the ground. A conditional
 * that repeats a rule the resolver already applies is a second place for the two to disagree.
 *
 * The ground carries NO meaning. Its two inks are chosen for warmth and coolness, not as category
 * coding: usage rule 4 ties a hue to a module everywhere it identifies one, and a decoration
 * identifies nothing. Nothing here may be read as `moduleColor`.
 */
import type { IconName } from '../icons/paths';
import { composite } from './contrast';
import { materialBase, type SkinTokens } from './skins';
import type { Palette } from './theme';

/** Soft is the first-run default (no household yet, so no scheme and no paid skin): tune here. */
export const GROUND_WASH_REF = 0.12;

/** Multipliers on `groundWash`, one per wash. */
export const WARM_K = 3.6;
export const COOL_K = 3.0;
export const BLOOM_K = 1.8;

/** The motif's multiplier, and the ceiling the contrast gate was measured against. */
const MOTIF_K = 0.75;
export const MOTIF_ALPHA_MAX = 0.09;

export const washAlpha = (w: number, k: number): number => Math.min(1, Math.max(0, w) * k);

/** A tablet must not blow the glyphs up past the vertical spacing, so height bounds the base. */
const MOTIF_BASE_HEIGHT_FRACTION = 0.55;

/**
 * THE ORBS (prototype block 54, `.orbs`): four heavily blurred discs at the edges of the glass
 * skin's ground — "a handful of blurred orbs, the way the reference does". The prototype paints
 * the raw category hues at 26% (13% in dark) through a 44px blur; ours paint the `*Soft` tint
 * tokens instead, because the raw hues fail the matrix: over a rose or accent orb, `warn` on
 * a glass panel measured 4.11–4.45:1 at every alpha down to 10%, and the slate scheme's accent
 * orb took `text2` to 3.71:1. The soft tints are the category card grounds, which every ink is
 * already held to, and they hold 4.74:1 or better with the same panel over them.
 *
 * Geometry is the prototype's, in fractions of the 390pt device it was drawn on; the disc's
 * center is half a diameter below its box top, and half a diameter in from the overhang. The
 * peak alpha is `SkinTokens.orbAlpha` (glass .58 light and .13 dark, else 0, night 0), and the
 * profile is a blurred disc: flat inside `r − blur`, half at the rim, a sixth one blur out, gone
 * at two.
 *
 * THESE FOUR TOKENS ARE THE ONE PLACE THE GROUND IS PAINTED FROM SOMETHING A PANEL IS ALSO MADE
 * OF, and that is what the alpha buys back. The profile is FLAT inside `r − blur`, so a peak of
 * 1 does not tint the ground at the core of a disc, it replaces it: the page there was exactly
 * `roseSoft`, and a breastfeed tile is filled with `roseSoft`. skins.ts `orbAlpha` has the
 * measurement and the reference's numbers.
 */
const ORB_BLUR_W = 44 / 390;
export const ORB_PLAN = [
  { key: 'rose', token: 'roseSoft', dW: 150 / 390, cyH: 0.02, side: 'right', overW: 72 / 390 },
  { key: 'milk', token: 'milkSoft', dW: 96 / 390, cyH: 0.24, side: 'left', overW: 52 / 390 },
  { key: 'sleep', token: 'sleepSoft', dW: 170 / 390, cyH: 0.58, side: 'right', overW: 92 / 390 },
  { key: 'accent', token: 'accentSoft', dW: 120 / 390, cyH: 0.83, side: 'left', overW: 64 / 390 },
] as const;

export type OrbKey = (typeof ORB_PLAN)[number]['key'];

export interface OrbStop {
  /** Fraction of `reach`. */
  offset: number;
  alpha: number;
}

export interface OrbSpec {
  key: OrbKey;
  token: keyof Palette;
  /** Center, in points. */
  cx: number;
  cy: number;
  /** The disc's radius, in points. */
  r: number;
  /** The radius at which the blur has faded to nothing, in points. */
  reach: number;
  /** The peak alpha, at the center. */
  alpha: number;
  stops: OrbStop[];
}

/** The blurred-disc profile, as gradient stops over `reach = r + 2·blur`. */
function orbStops(r: number, blur: number, alpha: number): OrbStop[] {
  const reach = r + 2 * blur;
  const at = (radius: number) => Math.max(0, Math.min(1, radius / reach));
  return [
    { offset: 0, alpha },
    { offset: at(r - blur), alpha },
    { offset: at(r), alpha: alpha * 0.5 },
    { offset: at(r + blur), alpha: alpha * 0.16 },
    { offset: 1, alpha: 0 },
  ];
}

/**
 * What the orbs and the motif scale off: the width, bounded by the height — on a landscape
 * or tablet viewport a disc sized from a 932pt width alone falls off a 430pt-tall page.
 */
const groundBase = (width: number, height: number): number =>
  Math.min(width, height * MOTIF_BASE_HEIGHT_FRACTION);

export function orbs(width: number, height: number, a: number): OrbSpec[] {
  if (a <= 0) return [];
  const base = groundBase(width, height);
  const blur = ORB_BLUR_W * base;
  return ORB_PLAN.map(p => {
    const d = p.dW * base;
    const r = d / 2;
    const over = p.overW * base;
    return {
      key: p.key,
      token: p.token as keyof Palette,
      cx: p.side === 'right' ? width + over - r : -over + r,
      cy: p.cyH * height + r,
      r,
      reach: r + 2 * blur,
      alpha: a,
      stops: orbStops(r, blur, a),
    };
  });
}

/** The alpha the orb profile paints at `radius` from its center — the model the tests sample. */
export function orbAlphaAt(orb: OrbSpec, radius: number): number {
  const t = radius / orb.reach;
  if (t >= 1) return 0;
  const stops = orb.stops;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (t <= b.offset) {
      const span = b.offset - a.offset;
      return span <= 0 ? b.alpha : a.alpha + ((b.alpha - a.alpha) * (t - a.offset)) / span;
    }
  }
  return 0;
}

/**
 * Clamped, so Glass does not get a louder motif than Soft. Glass would reach 0.165, and the paid
 * skin must not receive the strongest version of the one layer the register is most at risk from.
 * There is no headroom above 0.09 either: at 0.105 the status inks start failing on a glass
 * surface over the motif, so "make it stronger" means another glyph or a heavier stroke, never
 * a higher alpha.
 */
export const motifAlpha = (w: number): number =>
  w <= 0 ? 0 : Math.min(MOTIF_ALPHA_MAX, w * MOTIF_K);

export interface WashSpec {
  key: 'warm' | 'cool' | 'bloom';
  token: keyof Palette;
  /** Center, in points. */
  cx: number;
  cy: number;
  /** Radii, in points. */
  rx: number;
  ry: number;
  alpha: number;
  /** The offset at which the stop reaches zero opacity. */
  fade: number;
}

/**
 * Ported from prototype/ui-prototype.html:108-113. The prototype's pixel ellipses (760×520,
 * 700×520, 900×700) are divided by ~390 so they become multiples of the viewport WIDTH: the
 * aspect is then constant on every screen and reproduces the prototype exactly at 390pt.
 *
 * ONE DELIBERATE SUBSTITUTION, TWICE. The prototype's bottom wash is raw `accent` at 16%.
 * Measured, raw accent at any visible alpha costs the status inks their headroom — `warn` lands
 * at 3.93:1 directly on it — so the first substitution was `accentSoft`, the same gesture with a
 * token that survives the matrix.
 *
 * That was half right, and the other half is why the bloom is `page` now. `accentSoft` is not a
 * ground token: it is what an accent-tinted CARD is filled with, what an accent row chip is
 * filled with, and what dark glass itself is made of. Painting the ground from it put an object
 * and the page behind it on the same color — an accent tile on the bloom measured ΔE 0.35, under
 * the threshold at which two large fields are distinguishable at all. `page` is the third of the
 * three ground tokens, it is a scheme token so the bloom still follows the household's color,
 * and until now it was the one member of the group consumed by nothing. Every layer of this
 * ground is now painted from a token whose only job is to be a ground, and nothing a panel is
 * made of appears in it. (The orbs are the deliberate exception and pay for it with their alpha:
 * skins.ts `orbAlpha`.)
 */
const WASH_PLAN = [
  {
    key: 'warm',
    token: 'pageWarm',
    k: WARM_K,
    cx: 0.88,
    cy: -0.04,
    rxW: 1.95,
    ryW: 1.33,
    fade: 0.72,
  },
  {
    key: 'cool',
    token: 'pageCool',
    k: COOL_K,
    cx: 0.04,
    cy: 0.08,
    rxW: 1.79,
    ryW: 1.33,
    fade: 0.7,
  },
  {
    key: 'bloom',
    token: 'page',
    k: BLOOM_K,
    cx: 0.5,
    cy: 1.08,
    rxW: 2.31,
    ryW: 1.79,
    fade: 0.72,
  },
] as const;

export function washes(width: number, height: number, w: number): WashSpec[] {
  if (w <= 0) return [];
  return WASH_PLAN.map(p => ({
    key: p.key,
    token: p.token as keyof Palette,
    cx: p.cx * width,
    cy: p.cy * height,
    // both radii scale with WIDTH so the ellipse keeps its shape on a tall phone and a tablet
    rx: p.rxW * width,
    ry: p.ryW * width,
    alpha: washAlpha(w, p.k),
    fade: p.fade,
  }));
}

/** The ground's two inks. `accent`, `text` and every category hue are deliberately not assignable. */
export type MotifInk = 'milk' | 'sleep';

/**
 * The ink budget, set just above the measured worst viewport (5.42% at 320x568) rather than at a
 * round number with room to spare. It was 0.065, which left space for a fifth glyph to be added
 * without failing anything — a budget nobody can exceed is not a budget. The count is asserted
 * directly as well, because a small enough glyph would always fit under any area ceiling.
 */
export const MOTIF_COVERAGE_MAX = 0.056;
/** Where the track, the eyebrow and the H1 land at 1× — no glyph center may sit here. */
export const MOTIF_READING_BAND = [0.1, 0.3] as const;
/** Above this sizeK a glyph MUST cross an edge, so it reads as texture and not as a sticker. */
export const MOTIF_BLEED_MIN_SIZE_K = 0.2;

/**
 * Four glyphs, two inks. `babyface` is the only glyph in the sprite that means "baby" and
 * nothing else, which is why it anchors — and why it is placed so that roughly a third of it is
 * off-canvas and it never makes eye contact. Nothing that fills is used: a filled shape renders as
 * a solid blob at this scale. `med`, `temp`, `growth`, `chart`, `cal`, `lock`, `sliders` and `grid`
 * are excluded as clinical or as the vocabulary of a settings screen (CLAUDE.md §2 rules 1-3).
 */
export const MOTIF_PLAN = [
  { key: 'face', glyph: 'babyface', ink: 'milk', sizeK: 0.62, cx: 1.01, cy: 0.085, rotate: -8 },
  { key: 'moon', glyph: 'moon', ink: 'sleep', sizeK: 0.4, cx: -0.06, cy: 0.345, rotate: 16 },
  { key: 'bottle', glyph: 'bottle', ink: 'milk', sizeK: 0.46, cx: 0.05, cy: 0.865, rotate: -13 },
  { key: 'star', glyph: 'star', ink: 'sleep', sizeK: 0.14, cx: 0.8, cy: 0.585, rotate: 0 },
] as const;

/**
 * The sprite's 1.7 stroke is in 24-unit user space and is NOT non-scaling, so it scales with the
 * glyph: 1.7 at size 227 renders 16px, a marker line. These clamp the RENDERED width instead.
 * Large, generously stroked and very faint is the correct pairing — large, thin and faint
 * aliases to nothing on Android. Stroke width is the visibility lever; alpha is spent.
 */
const MOTIF_STROKE_RATIO = 0.03;
export const MOTIF_STROKE_MIN_PX = 3.0;
export const MOTIF_STROKE_MAX_PX = 6.0;

const renderedStroke = (size: number): number =>
  Math.max(MOTIF_STROKE_MIN_PX, Math.min(MOTIF_STROKE_MAX_PX, MOTIF_STROKE_RATIO * size));

/** What to hand `<Icon strokeWidth>`: the user-space width that renders `renderedStroke` px. */
const motifStrokeWidth = (size: number): number =>
  size <= 0 ? 0 : (24 * renderedStroke(size)) / size;

export interface MotifSpec {
  key: string;
  /** Typed against the sprite, so a renamed or mistyped glyph fails typecheck rather than
   *  rendering nothing. paths.ts imports nothing, so this keeps the module pure. */
  glyph: IconName;
  ink: MotifInk;
  size: number;
  /** The box's top-left, in points. */
  x: number;
  y: number;
  /** The glyph's center, in points. */
  cx: number;
  cy: number;
  rotate: number;
  strokeWidth: number;
  renderedStroke: number;
}

export function motif(width: number, height: number, w: number): MotifSpec[] {
  if (w <= 0) return [];
  const base = groundBase(width, height);
  return MOTIF_PLAN.map(p => {
    const size = p.sizeK * base;
    const cx = p.cx * width;
    const cy = p.cy * height;
    return {
      key: p.key,
      glyph: p.glyph as IconName,
      ink: p.ink as MotifInk,
      size,
      x: cx - size / 2,
      y: cy - size / 2,
      cx,
      cy,
      rotate: p.rotate,
      strokeWidth: motifStrokeWidth(size),
      renderedStroke: renderedStroke(size),
    };
  });
}

/** The axis-aligned side of a size×size square rotated by `rotate` degrees. */
export const rotatedExtent = (size: number, rotate: number): number => {
  const r = (rotate * Math.PI) / 180;
  return size * (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)));
};

/**
 * A stroke glyph's inked area, as a fraction of the viewport. A 24-unit glyph's drawn path is
 * roughly 4.2 box-widths long across this sprite, so area ≈ 4.2 · size · strokePx. It is an
 * estimate, and it is only ever used as a budget ceiling.
 */
const PERIMETER_FACTOR = 4.2;

export function motifCoverage(
  specs: readonly { size: number; renderedStroke: number }[],
  width: number,
  height: number,
): number {
  if (width <= 0 || height <= 0) return 0;
  const ink = specs.reduce((sum, m) => sum + PERIMETER_FACTOR * m.size * m.renderedStroke, 0);
  return ink / (width * height);
}

export interface GroundComposites {
  /**
   * Every layer is an opaque color under one of these keys, and the matrix measures every ink
   * on all of them. The named ones are the wash stack; `orb<Key>` is that orb's peak over the
   * stack, `orb<Key>Half` the same at half its alpha (a blend can measure worse than either of
   * its corners — luminance is convex in the channels — so the middle is a gate too), and
   * `surfaceOn…` is the content material over that point.
   */
  [layer: string]: string;
  /** The darkest point of the wash stack: all three composited in order. */
  ground: string;
  groundWarm: string;
  groundCool: string;
  groundBloom: string;
  groundMotifMilk: string;
  groundMotifSleep: string;
  surfaceOnGround: string;
  accentSoftOnGround: string;
}

/** The `orb<Key>` layer names, so the matrix and the field test agree on the spelling. */
export const orbLayer = (key: OrbKey): string => `orb${key[0]!.toUpperCase()}${key.slice(1)}`;

/** All three washes composited in order — the darkest point of the lit ground. */
function washStack(palette: Palette, w: number): string {
  const warm = composite(palette.app, palette.pageWarm, washAlpha(w, WARM_K));
  const cool = composite(warm, palette.pageCool, washAlpha(w, COOL_K));
  return composite(cool, palette.page, washAlpha(w, BLOOM_K));
}

/* -------------------------------------------------------------- the pattern */

/**
 * THE DOODLE PATTERN — the first-run background (the owner, 2026-09-21, with a picture: *"during
 * the whole onboarding process, make the background this attached. it is the same color but added
 * some icons related to babies"*).
 *
 * IT IS THE APP'S OWN GLYPHS, NOT AN IMAGE, and that is the whole reason it can ship. A PNG is one
 * color at one size: it would have to be redrawn for six schemes, three themes and every screen
 * ratio, it could not follow a scheme change, and the rendered-contrast sweep could not see
 * through it. This is two dozen glyphs from the icon sprite, laid on a brick grid, tinted with the
 * theme's own two soft inks at an alpha the contrast matrix measures — about two kilobytes of
 * arithmetic that is correct in every scheme by construction.
 *
 * IT IS NOT THE LIT GROUND. The washes and the orbs belong to the skin and are zero on Paper,
 * which is the default household — so the hero motif that was built for the first-run screens has
 * never been seen by anyone on the free plan. The pattern is the screen's own decision and draws
 * on any skin, which is why its alpha is its own number rather than a multiple of `groundWash`.
 * Night is the one theme that gets nothing: at 3 a.m. the amber page carries no decoration.
 *
 * WHAT IT MAY NOT BE. No glyph here may be read as a category (usage rule 4: a decoration
 * identifies nothing), and the set is deliberately the nursery rather than the clinic — no
 * medicine, thermometer, growth chart, calendar or settings glyph (CLAUDE.md §2 rules 1–3). A
 * parent must not be able to read a diagnosis, a schedule or a state of their baby out of the
 * wallpaper.
 */
export type PatternInk = 'milk' | 'sleep' | 'rose';

/**
 * How many glyph cells across the narrow side. Three is a doodle; six is a duvet cover.
 *
 * FOUR SINCE 2026-09-22, when the pattern became the whole app's background and the owner looked
 * at a full page of it: *"the doodle doesn't have enough doodle icons. you can see some area is
 * bald, add the icons at these bald areas"*. Three columns put TWENTY glyphs on a 390×844 phone
 * — spaced for a sign-in page with a card in the middle of it, and visibly sparse behind a page
 * that scrolls. Four puts thirty-six there, at three quarters the size, which is the trade that
 * makes it read as wallpaper rather than as a scatter of stickers, and it still lands inside the
 * ink budget the three-column layout was not using.
 */
const PATTERN_COLS = 4;
/** A glyph's size as a fraction of its cell, so the pattern scales with the phone. */
const PATTERN_SIZE_K = 0.34;
/** Rendered stroke, in points. Thinner than the hero motif's, because the glyphs are smaller. */
const PATTERN_STROKE_PX = 2.4;
/** How far a glyph may lean, in degrees — a hand-drawn scatter, not a tiled wallpaper. */
const PATTERN_ROTATE_MAX = 14;
/** How much of its own cell a glyph may wander, as a fraction of the room it has. */
const PATTERN_JITTER_K = 0.7;

/**
 * THE ALPHA, PER THEME, and it is a measured number rather than a taste one: every text ink is
 * checked against this ink over both grounds it can sit on (`patternComposites`, and
 * `theme/contrast.test.ts` measures them). Dark carries a little more because a light ink at 7%
 * over a near-black page is invisible; night carries none.
 */
const PATTERN_ALPHA: Record<'light' | 'dark' | 'night', number> = {
  light: 0.07,
  dark: 0.1,
  night: 0,
};

export const patternAlpha = (theme: 'light' | 'dark' | 'night'): number => PATTERN_ALPHA[theme];

/**
 * The nursery, in the order a cell cycles through it. Nothing that fills is in it (a filled shape
 * renders as a blob at this scale), and neither is any clinical or settings glyph.
 */
export const PATTERN_GLYPHS = [
  'babyface',
  'bottle',
  'moon',
  'star',
  'bath',
  'tummy',
  'diaper',
  'sun',
  'solids',
  'sleep',
] as const;

const PATTERN_INKS: readonly PatternInk[] = ['milk', 'sleep', 'rose'];

/**
 * The ink budget, as a fraction of the viewport — the same measure the hero motif is held to.
 *
 * UNCHANGED BY THE 2026-09-22 DENSITY PASS, which is the interesting part: going from three
 * columns to four is 1.8× the glyphs, but coverage is linear in SIZE and the glyphs shrank to
 * three quarters, so the page went from 0.027 to 0.037 of a 0.05 ceiling. There was simply
 * headroom the sparse layout was not using, and a fifth column is still inside it if the owner
 * wants one.
 *
 * Note what this budget is NOT: it is busyness, not contrast. Contrast is `PATTERN_ALPHA`, which
 * `patternComposites` hands the matrix so every text ink is re-measured over the glyphs whatever
 * the density is.
 */
export const PATTERN_COVERAGE_MAX = 0.05;

export interface PatternSpec {
  key: string;
  glyph: IconName;
  ink: PatternInk;
  size: number;
  /** The box's top-left, in points. */
  x: number;
  y: number;
  cx: number;
  cy: number;
  rotate: number;
  /** User-space stroke width to hand `<Icon strokeWidth>`, so the RENDERED width is constant. */
  strokeWidth: number;
  renderedStroke: number;
}

/**
 * A deterministic 0..1 from a cell and a salt. Not `Math.random`: the pattern has to be the same
 * on every render of the same screen — a wallpaper that reshuffles when the keyboard opens is a
 * bug a parent can see — and the tests have to be able to state where the glyphs are.
 */
export function patternNoise(row: number, col: number, salt: number): number {
  /*
    An integer avalanche rather than the usual `sin(a*12.9898 + b*78.233)` trick, which was the
    first draft and picked the same glyph six times out of nineteen: its inputs are near-linear at
    this scale, so neighboring cells land near each other in the output and a small table read
    with it comes out lumpy. This mixes every input bit into every output bit, which is what makes
    "pick one of ten glyphs" actually look like ten.
  */
  let h = (Math.imul(row, 73856093) ^ Math.imul(col, 19349663) ^ Math.imul(salt, 83492791)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The glyphs, laid out. A BRICK grid — every other row offset by half a cell — with each glyph
 * jittered inside its own cell, so nothing lines up into a column a parent could read as a list,
 * and nothing overlaps its neighbor. A glyph whose box hangs over an edge is kept: a pattern that
 * stops short of the edges reads as a sheet of stickers, and one that runs off them reads as
 * texture. A glyph entirely outside the viewport is dropped, because drawing it costs a view.
 */
export function pattern(width: number, height: number): PatternSpec[] {
  if (width <= 0 || height <= 0) return [];
  const cell = width / PATTERN_COLS;
  const size = cell * PATTERN_SIZE_K;
  const room = ((cell - size) / 2) * PATTERN_JITTER_K;
  const rows = Math.ceil(height / cell) + 1;
  const out: PatternSpec[] = [];
  for (let r = 0; r < rows; r += 1) {
    const brick = r % 2 === 1 ? cell / 2 : 0;
    for (let c = 0; c <= PATTERN_COLS; c += 1) {
      const cx = (c + 0.5) * cell + brick + (patternNoise(r, c, 1) * 2 - 1) * room;
      const cy = (r + 0.5) * cell + (patternNoise(r, c, 2) * 2 - 1) * room;
      // wholly off-canvas: a view that paints nothing
      if (cx + size / 2 <= 0 || cx - size / 2 >= width) continue;
      if (cy + size / 2 <= 0 || cy - size / 2 >= height) continue;
      const g = PATTERN_GLYPHS[Math.floor(patternNoise(r, c, 3) * PATTERN_GLYPHS.length)];
      const ink = PATTERN_INKS[(r + c) % PATTERN_INKS.length];
      out.push({
        key: `p${r}-${c}`,
        glyph: (g ?? 'star') as IconName,
        ink: ink ?? 'milk',
        size,
        x: cx - size / 2,
        y: cy - size / 2,
        cx,
        cy,
        rotate: (patternNoise(r, c, 4) * 2 - 1) * PATTERN_ROTATE_MAX,
        strokeWidth: size <= 0 ? 0 : (24 * PATTERN_STROKE_PX) / size,
        renderedStroke: PATTERN_STROKE_PX,
      });
    }
  }
  return out;
}

/**
 * The opaque colors a text ink is measured against where the pattern draws: over the flat page
 * every household gets (`paper`), and over the lit ground a glass household gets. Two inks would
 * do for the arithmetic; all three are returned because all three are painted, and a gate that
 * measures two of the three colors on the screen is not a gate.
 */
export function patternComposites(
  palette: Palette,
  skin: SkinTokens,
  theme: 'light' | 'dark' | 'night',
): Record<string, string> | null {
  const a = patternAlpha(theme);
  if (a <= 0) return null;
  const bases: [string, string][] = [['Paper', palette.paper]];
  if (skin.groundWash > 0) bases.push(['Lit', washStack(palette, skin.groundWash)]);
  const out: Record<string, string> = {};
  for (const [where, base] of bases)
    for (const ink of PATTERN_INKS)
      out[`pattern${ink[0]!.toUpperCase()}${ink.slice(1)}On${where}`] = composite(
        base,
        palette[ink],
        a,
      );
  return out;
}

/**
 * The opaque colors the contrast matrix measures every ink against. `null` when there is no
 * ground to measure — Paper, and every skin in night. Asserting on a layer that does not render
 * is a false gate, so the caller skips the whole group rather than substituting `app`.
 */
export function groundComposites(palette: Palette, skin: SkinTokens): GroundComposites | null {
  const w = skin.groundWash;
  const a = skin.orbAlpha;
  if (w <= 0 && a <= 0) return null;
  const warm = washAlpha(w, WARM_K);
  const cool = washAlpha(w, COOL_K);
  const bloom = washAlpha(w, BLOOM_K);
  const m = motifAlpha(w);
  const groundWarm = composite(palette.app, palette.pageWarm, warm);
  const ground = washStack(palette, w);
  const groundMotifMilk = composite(ground, palette.milk, m);
  const panel = materialBase(palette, skin.surface);
  const out: GroundComposites = {
    ground,
    groundWarm,
    groundCool: composite(palette.app, palette.pageCool, cool),
    groundBloom: composite(palette.app, palette.page, bloom),
    groundMotifMilk,
    groundMotifSleep: composite(ground, palette.sleep, m),
    // a panel floats over the busiest point of the ground, not over a clean one
    surfaceOnGround: composite(groundMotifMilk, panel, skin.surface.alpha),
    accentSoftOnGround: composite(groundMotifMilk, palette.accentSoft, skin.tintAlpha),
  };
  if (a > 0) {
    for (const o of ORB_PLAN) {
      // The rose orb overlaps the first-run face glyph and the sleep orb the star, so the orb
      // is composited over the motif's own ink: strictly more ink than any real point carries.
      const under = composite(ground, palette[o.key === 'sleep' ? 'sleep' : 'milk'], m);
      const peak = composite(under, palette[o.token], a);
      const half = composite(under, palette[o.token], a / 2);
      const name = orbLayer(o.key);
      out[name] = peak;
      out[`${name}Half`] = half;
      out[`surfaceOn${name[0]!.toUpperCase()}${name.slice(1)}`] = composite(
        peak,
        panel,
        skin.surface.alpha,
      );
      out[`surfaceOn${name[0]!.toUpperCase()}${name.slice(1)}Half`] = composite(
        half,
        panel,
        skin.surface.alpha,
      );
    }
  }
  return out;
}
