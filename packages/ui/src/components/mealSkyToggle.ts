/**
 * The solids sheet's meal as a picture, in numbers: where the sun stands for each meal, the arc it
 * glides along, where the chosen meal's word is written, how a tap turns into a move, and what
 * every layer looks like at each point of the one value that animates them (the owner, 2026-09-25,
 * of the "that's cool" list: *"might not necessarily be useful, but it's cool … Let's try doing
 * everything. I will then review"*). Pure TypeScript, so all of it is tested in node — this
 * package's tests cannot render React Native — and `MealSkyToggle.tsx` only hands these numbers to
 * views and to `Animated.Value#interpolate`.
 *
 * It is the theme toggle's picture language (`themeSkyToggle.ts`) moved to the other thing a sky
 * can say, which is the time of day: the same pale-gold sun, the same curve family, the same rule
 * that the words come from the caller and the colors from `theme/`.
 *
 * ONE VALUE DRIVES THE PICTURE, AND THAT IS THE POINT OF A DAY. `pos` is the sun's place in meals —
 * 0 breakfast, 1 lunch, 2 snack, 3 dinner — and the sun's position on its arc and each sky's share
 * of the picture are functions of it. The theme toggle needed three values because its middle stop
 * is a DIFFERENT CHOICE that must not flash up on a jump across it; here the stops between two
 * meals are the hours between them, so a tap from breakfast to dinner is a time-lapse of the day —
 * the sun climbs through noon and the sky goes blue on the way — and that is the truth of the
 * picture rather than a thing to hide. Only the WORDS are not a function of `pos`: "Lunch" and
 * "Snack" flickering past on the way to "Dinner" would be reading noise, so each word has its own
 * value and the two in a move simply cross-fade (`planMealMove`).
 */
import { MEALS, type Meal } from '@nibblecue/core';
import { type as typeScale, type ThemeName } from '../theme/theme';
import type { Frame, Star } from './dayNightSwitch';
import { easeAt, moveMs, SKY_EASE, type SkyEase, type Span } from './themeSkyToggle';

/* ----------------------------------------------------------------------------- the stops */

/**
 * Left to right, the day's own order, which is the order `@nibblecue/core` lists the meals in and
 * the order the segmented control drew them in — the sun rises on the left.
 */
export const MEAL_STOPS: readonly Meal[] = MEALS;

/** A meal's place along the day: 0 to 3. The sun's value is in these units. */
export const mealIndex = (meal: Meal): number => Math.max(0, MEAL_STOPS.indexOf(meal));

/* ---------------------------------------------------------------------------- the size */

/**
 * The picture: a sky over a strip of ground, as tall as it needs to be for an arc — a 44 pt pill
 * has no room for the sun to climb in — AND NO TALLER. It was 90 pt, and the owner's answer to
 * shortening it was *"yes always make things shorter when you can"* (2026-09-26): so the ground is
 * the fewest whole points that hold the chosen word at 1.3× (`MEAL_WORD`), and the sky over it is
 * an arc that climbs three suns high — enough for breakfast to stand whole just over the horizon
 * and still be under half way up, and for noon's sun to clear the rim. Every one of the four tap
 * zones is the picture's full height and a quarter of its width: 60 × 68 at the narrowest proven
 * width, past the 44 pt floor both ways (CLAUDE.md §6).
 *
 *   `horizon`  where the sky meets the ground; the chosen word is written below it
 *   `apex`     the sun's center at the top of its arc
 *   `sun`      the sun's radius; `station` the radius of a mark where another meal's sun would be
 *   `side`     how far in from each side the arc meets the horizon, as a fraction of the width
 *
 * ITS WIDTH IS THE ROOM IT IS GIVEN, up to `maxWidth`: the quick sheet's body is the window less
 * `space.xxl` either side — 324 pt on a 360 dp phone, 339 on a 375 pt iPhone — and past 400 the
 * picture stops growing and is centered. `minWidth` is not a clamp; it is the narrowest width the
 * placement is PROVEN at (a 308 pt window, the theme toggle's floor), and `mealSkyToggle.test.ts`
 * walks every half point from it to `maxWidth`.
 */
export const MEAL_SKY_SIZE = {
  height: 60,
  horizon: 35,
  apex: 11,
  sun: 8,
  station: 2.5,
  side: 0.05,
  rim: 1,
  minWidth: 272,
  maxWidth: 400,
} as const;

/**
 * WHERE ON ITS ARC THE SUN STANDS FOR EACH MEAL: 0 is the left horizon, 1 the right. Breakfast just
 * risen, low on the left; lunch at the top; snack lower, in the afternoon; dinner setting, its
 * center on the horizon and its lower half behind the ground. Each is chosen so the sun's whole
 * disc stays inside its own meal's quarter of the picture at every width (the test proves it), so
 * a parent who taps where a sun could be gets that sun's meal — the picture and the targets agree.
 * Breakfast stands a little further along than it did in the taller sky, because a flatter arc
 * has to be followed further to lift a whole sun off the horizon: a point and a half clear of it.
 */
export const SUN_AT: Readonly<Record<Meal, number>> = {
  BREAKFAST: 0.13,
  LUNCH: 0.455,
  SNACK: 0.73,
  DINNER: 1,
};

/**
 * THE WORD'S SIZE AND HOW FAR IT MAY GROW: `bodyStrong`'s weight at `bodySm`'s size, 13, read from
 * the type scale — the size the bottle's and the bath's words are written at (`PICTURE_WORD`). It
 * was `bodyStrong`'s own 15 while the picture was 90 tall; at 60 the strip that holds a 15 pt word
 * at 1.3× would be nearly half the picture, and the sky is what the picture is for. Bounded by the
 * theme toggle's own measure of a character (`WORD_TYPE.advance`, 0.6 em — "Breakfast" is 4.39 em
 * in the Hanken Grotesk Bold the app ships, a bound of 5.4), and `line` is that face's own line,
 * 1.303 em (its ascender 1000 and descender 303, in 1000 units): the Text sets no line height, so
 * that is the box it draws. It grows with the phone's text size as far as the ground strip has
 * room — the strip is `line` × the size tall at `floor`, and the test holds the room to at least
 * 1.3 at every width — never past the chrome cap (1.6), and `adjustsFontSizeToFit` stays on the
 * Text for a word the bound does not cover.
 */
export const MEAL_WORD = {
  size: typeScale.bodySm.fontSize,
  advance: 0.6,
  line: 1.303,
  /** Clear room between the word and the picture's side. */
  pad: 12,
  /**
   * Clear room between the word's line and the horizon above it or the foot below it. One point,
   * because the face's own line already keeps every meal's ink more than a quarter of an em inside
   * it, top and foot (no meal has a descender): even at the cap the word never touches the land's
   * edge.
   */
  inset: 1,
  floor: 1.3,
  ceiling: 1.6,
  shrink: 0.75,
} as const;

/** A point in the picture's own coordinates. */
export interface Point {
  x: number;
  y: number;
}

export interface MealSkyGeometry {
  width: number;
  height: number;
  /** The theme's hairline round the picture, drawn inside its edge. */
  rim: number;
  horizon: number;
  apex: number;
  sunR: number;
  stationR: number;
  /** Each meal's tap zone: a quarter of the picture. */
  zone: number;
  /** Where the arc meets the horizon, left and right. */
  x0: number;
  x1: number;
  /** The sun's center at rest, for each meal. */
  sun: Record<Meal, Point>;
  /** The two rings of light round the sun, inner and outer diameter. */
  halo: readonly [number, number];
  /** The sun's path, as an SVG path the dashes are drawn along. */
  path: string;
  /** The two low hills on the ground, far and near, as SVG paths. */
  hills: { far: string; near: string };
  /** The stars that come out as the sun sets. */
  stars: readonly Star[];
  /** The strip of ground the chosen word is written on: below the horizon, above the foot. */
  band: { top: number; bottom: number };
}

/** How many straight pieces the drawn arc is made of: enough that no chord shows at 400 pt. */
const PATH_PIECES = 48;

/**
 * The stars, as places across the picture and heights in it, all in the upper left — the part of a
 * dusk sky furthest from the setting sun — and each coming on as the sun passes `at` on its way
 * down to dinner (`at` is in meals, like the sun's value). Setup's shapes and twinkle, drawn into
 * the shorter sky's upper half and kept off the mark where breakfast's sun stands, so no star
 * reads as a fifth meal.
 */
const STAR_FIELD: readonly (Omit<Star, 'x'> & { across: number })[] = [
  { across: 0.07, y: 8, size: 5.5, kind: 'sparkle', at: 2.35 },
  { across: 0.13, y: 19, size: 2.5, kind: 'dot', at: 2.5 },
  { across: 0.25, y: 7.5, size: 4.5, kind: 'sparkle', at: 2.6 },
  { across: 0.36, y: 4.5, size: 2, kind: 'dot', at: 2.7 },
];

/**
 * Two low hills on the ground, as fractions of the width and a rise above the horizon — a
 * landscape rather than a bar under the sky — kept to the middle, clear of the two low suns, and
 * a little lower than the taller sky had them, so they stay a skyline and not a second ground.
 */
export const MEAL_HILLS = {
  far: { from: 0.2, to: 0.62, rise: 5 },
  near: { from: 0.46, to: 0.88, rise: 3.5 },
} as const;

const f2 = (n: number): number => Number(n.toFixed(2));

/** The point on the arc at `u` — 0 the left horizon, 1 the right: a sine arch, highest at noon. */
export function arcPoint(g: Pick<MealSkyGeometry, 'x0' | 'x1' | 'horizon' | 'apex'>, u: number) {
  const k = Math.min(Math.max(u, 0), 1);
  // exactly on the horizon at either end: sin(π) is a hair above zero in floating point, and a
  // setting sun is on the horizon, not a femtopoint over it
  const rise = k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k);
  return {
    x: g.x0 + k * (g.x1 - g.x0),
    y: g.horizon - (g.horizon - g.apex) * rise,
  };
}

const hill = (w: number, horizon: number, h: { from: number; to: number; rise: number }) => {
  const [a, b] = [h.from * w, h.to * w];
  // a quadratic whose control point is twice the rise up peaks at exactly the rise
  return `M${f2(a)} ${horizon}Q${f2((a + b) / 2)} ${f2(horizon - 2 * h.rise)} ${f2(b)} ${horizon}Z`;
};

export function mealSkyGeometry(width: number): MealSkyGeometry {
  const { height, horizon, apex, sun, station, side, rim, maxWidth } = MEAL_SKY_SIZE;
  // never narrower than four 44 pt zones, whatever a caller measures on its first frame
  const w = Math.min(Math.max(width, 4 * 44), maxWidth);
  const base = { x0: side * w, x1: (1 - side) * w, horizon, apex };
  const at = (m: Meal) => arcPoint(base, SUN_AT[m]);
  const points = Array.from({ length: PATH_PIECES + 1 }, (_, i) => arcPoint(base, i / PATH_PIECES));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${f2(p.x)} ${f2(p.y)}`).join('');
  return {
    width: w,
    height,
    rim,
    horizon,
    apex,
    sunR: sun,
    stationR: station,
    zone: w / 4,
    x0: base.x0,
    x1: base.x1,
    sun: {
      BREAKFAST: at('BREAKFAST'),
      LUNCH: at('LUNCH'),
      SNACK: at('SNACK'),
      DINNER: at('DINNER'),
    },
    // rings of 4 and 8 pt round the sun: no taller than the sky, so the light stays the sun's and
    // never reads as a second sky. Noon's is cut by the top edge, as a window cuts the real glow
    halo: [2 * sun + 8, 2 * sun + 16],
    path,
    hills: { far: hill(w, horizon, MEAL_HILLS.far), near: hill(w, horizon, MEAL_HILLS.near) },
    stars: STAR_FIELD.map(({ across, ...s }) => ({ ...s, x: across * w })),
    band: { top: horizon + MEAL_WORD.inset, bottom: height - MEAL_WORD.inset },
  };
}

/* --------------------------------------------------------------------------- the word */

/** How wide `label` may be at `scale` × the word's size: characters × the bound. */
export const mealWordWidth = (label: string, scale = 1): number =>
  [...label].length * MEAL_WORD.advance * MEAL_WORD.size * scale;

export interface MealWordLayout {
  /** How far the words may grow with the phone's text size: the Text's `maxFontSizeMultiplier`. */
  cap: number;
  /** Where each meal's word is written when it is the chosen one. */
  box: Record<Meal, Span>;
}

/**
 * WHERE THE CHOSEN WORD IS WRITTEN: on the ground, under its own sun — centered on the sun's
 * place, then moved in just far enough to keep `pad` from the picture's side, which is what
 * happens to "Dinner" under a sun setting at the right edge. Its box is the word's bound at the
 * cap, so the Text centered in it sits under the sun whatever the face really measures.
 *
 * The cap is the largest scale at which every word fits both the strip's height and the picture's
 * width, never past the chrome cap and never reported below 1 (a word that does not fit even at 1
 * is `adjustsFontSizeToFit`'s to shrink, not this rule's).
 */
export function mealWordLayout(
  g: MealSkyGeometry,
  labels: Readonly<Record<Meal, string>>,
): MealWordLayout {
  const room = g.width - 2 * MEAL_WORD.pad;
  const tall = (g.band.bottom - g.band.top) / (MEAL_WORD.size * MEAL_WORD.line);
  const wide = MEAL_STOPS.map(m => room / Math.max(1, mealWordWidth(labels[m])));
  const cap = Math.min(MEAL_WORD.ceiling, Math.max(1, Math.min(tall, ...wide)));
  const boxOf = (m: Meal): Span => {
    const width = Math.min(room, mealWordWidth(labels[m], cap));
    const lo = MEAL_WORD.pad + width / 2;
    const hi = g.width - MEAL_WORD.pad - width / 2;
    const center = Math.min(Math.max(g.sun[m].x, lo), hi);
    return { left: center - width / 2, right: center + width / 2 };
  };
  return {
    cap,
    box: {
      BREAKFAST: boxOf('BREAKFAST'),
      LUNCH: boxOf('LUNCH'),
      SNACK: boxOf('SNACK'),
      DINNER: boxOf('DINNER'),
    },
  };
}

/* --------------------------------------------------------------------------- the move */

/**
 * WHEN NOTHING MOVES: under REDUCE MOTION (docs/DESIGN_SYSTEM.md §7), and in the amber NIGHT theme,
 * which exists to keep a dark room dark — a picture that glides and glows at 3 a.m. is exactly what
 * it may not show (the batch's rule, 2026-09-25). Either way the end state is set directly and the
 * content is never hidden: the sun is at its meal and the word is written.
 */
export const mealSkyStill = (reduceMotion: boolean, theme: ThemeName): boolean =>
  reduceMotion || theme === 'night';

/** A move in flight: where the sun set off from, where to, when, and on which curve. */
export interface MealMotion {
  from: number;
  to: Meal;
  startedAt: number;
  duration: number;
  ease: SkyEase;
}

/** Where the sun is, in meals, `now` — the planner's estimate; the native driver has the truth. */
export function sunAt(m: MealMotion, now: number): number {
  const x = m.duration <= 0 ? 1 : (now - m.startedAt) / m.duration;
  return m.from + (mealIndex(m.to) - m.from) * easeAt(SKY_EASE[m.ease], x);
}

/**
 * WHAT A NEW MEAL DOES TO THE VALUES. The sun goes from wherever it is to the new meal, on the
 * theme toggle's curves: `settle` — a small carry past and back — arriving at lunch or snack,
 * where the arc goes on either side, and `land` arriving at breakfast or dinner, the two ends,
 * where a carry past would take the sun below the horizon. A move of one meal takes the toggle's
 * 560 ms, of two or three a little longer and never double (`moveMs`, capped at two).
 *
 * The words: the new meal's goes to 1 and every other to 0, on `land` — a word never overshoots
 * into more than fully written. A move from rest is two words cross-fading; a tap mid-glide turns
 * everything round from where it is, the sun's estimate (`sunAt`) only sizing the duration.
 *
 * STILL — reduce motion or amber Night — nothing animates: every value is set where the move
 * ends, and the picture simply IS the new meal.
 */
export interface MealPlan {
  animate: boolean;
  /** The sun's place as the move begins, in meals — the next re-target's starting point. */
  from: number;
  /** Where the sun goes, in meals. */
  pos: number;
  /** Where each word's value goes. */
  words: Record<Meal, 0 | 1>;
  duration: number;
  ease: SkyEase;
}

export function planMealMove(
  motion: MealMotion | null,
  at: Meal,
  to: Meal,
  now: number,
  still: boolean,
): MealPlan {
  const moving = motion !== null && now < motion.startedAt + motion.duration;
  const pos = mealIndex(to);
  const words = {
    BREAKFAST: to === 'BREAKFAST' ? 1 : 0,
    LUNCH: to === 'LUNCH' ? 1 : 0,
    SNACK: to === 'SNACK' ? 1 : 0,
    DINNER: to === 'DINNER' ? 1 : 0,
  } as const;
  if (still) return { animate: false, from: pos, pos, words, duration: 0, ease: 'land' };
  const from = moving ? sunAt(motion, now) : mealIndex(at);
  const inner = to === 'LUNCH' || to === 'SNACK';
  return {
    animate: true,
    from,
    pos,
    words,
    duration: moveMs(Math.abs(pos - from)),
    ease: inner ? 'settle' : 'land',
  };
}

/* ------------------------------------------------------------------------- the frames */

const frame = (
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => ({ inputRange, outputRange, extrapolate });

/** How finely the sun's path is sampled for `interpolate`: twelve points between two meals. */
const SUN_SAMPLES_PER_MEAL = 12;
/** How long a star takes to come on, dip once and settle, in meals of the sun's travel. */
const TWINKLE = [0, 0.12, 0.2, 0.26] as const;

/** The arc's parameter at a point of the sun's value: straight between two meals' places. */
export function arcAtPos(pos: number): number {
  const p = Math.min(Math.max(pos, 0), MEAL_STOPS.length - 1);
  const i = Math.min(Math.floor(p), MEAL_STOPS.length - 2);
  const a = SUN_AT[MEAL_STOPS[i] ?? 'BREAKFAST'];
  const b = SUN_AT[MEAL_STOPS[i + 1] ?? 'DINNER'];
  return a + (b - a) * (p - i);
}

export interface MealSkyFrames {
  /** Of the sun's value: its center's place, sampled along the arc so it glides round the curve. */
  sunX: Frame;
  sunY: Frame;
  /** Of the sun's value: the light round it draws in between meals and blooms at each one. */
  halo: Frame;
  haloScale: Frame;
  /**
   * Of the sun's value: each later sky's opacity over the ones under it. Breakfast is at the
   * bottom and always whole, so the picture is never see-through; at any point exactly the two
   * skies either side of the sun share it (`mealSkyWeights`).
   */
  sky: { LUNCH: Frame; SNACK: Frame; DINNER: Frame };
  /** Of the sun's value: the dusk stars, one after another as the sun goes down. */
  stars: readonly { opacity: Frame; scale: Frame }[];
  /**
   * Of a word's own value: it leaves over the first part of a move and arrives over the last,
   * rising a few points into place as it comes and sinking as it goes.
   */
  word: { opacity: Frame; rise: Frame };
}

export function mealSkyFrames(g: MealSkyGeometry): MealSkyFrames {
  const last = MEAL_STOPS.length - 1;
  const inputs = Array.from(
    { length: last * SUN_SAMPLES_PER_MEAL + 1 },
    (_, i) => i / SUN_SAMPLES_PER_MEAL,
  );
  const points = inputs.map(p => arcPoint(g, arcAtPos(p)));
  return {
    sunX: frame(
      inputs,
      points.map(p => f2(p.x)),
    ),
    sunY: frame(
      inputs,
      points.map(p => f2(p.y)),
    ),
    halo: frame([0, 0.5, 1, 1.5, 2, 2.5, 3], [1, 0.5, 1, 0.5, 1, 0.5, 0.85]),
    haloScale: frame([0, 0.5, 1, 1.5, 2, 2.5, 3], [1, 0.8, 1, 0.8, 1, 0.8, 1]),
    sky: {
      LUNCH: frame([0, 1], [0, 1]),
      SNACK: frame([1, 2], [0, 1]),
      DINNER: frame([2, 3], [0, 1]),
    },
    stars: g.stars.map(s => ({
      opacity: frame(
        TWINKLE.map(d => s.at + d),
        [0, 1, 0.35, 1],
      ),
      scale: frame(
        TWINKLE.map(d => s.at + d),
        [0.3, 1.25, 0.8, 1],
      ),
    })),
    word: { opacity: frame([0.35, 1], [0, 1]), rise: frame([0, 1], [5, 0]) },
  };
}

/**
 * How much of each sky reaches the screen at the layers' opacities: breakfast at the bottom and
 * always whole, then lunch, snack and dinner, each over the ones before it. The component stacks
 * its layers in exactly this order, and the test holds it to that.
 */
export function mealSkyWeights(lunch: number, snack: number, dinner: number): Record<Meal, number> {
  return {
    BREAKFAST: (1 - lunch) * (1 - snack) * (1 - dinner),
    LUNCH: lunch * (1 - snack) * (1 - dinner),
    SNACK: snack * (1 - dinner),
    DINNER: dinner,
  };
}
