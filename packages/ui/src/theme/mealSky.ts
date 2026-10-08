/**
 * THE MEAL SKY'S COLORS — four pictures of the time of day, not a theme.
 *
 * `MealSkyToggle` draws the solids sheet's meal as the sun's place in a small sky (the owner,
 * 2026-09-25, of the "that's cool" list: *"Let's try doing everything. I will then review"*):
 * breakfast a dawn, lunch a noon, snack an afternoon, dinner a dusk. Its colors live here, in
 * `theme/`, for the reason `sky.ts` gives for the theme toggle's: they are a PICTURE. A dawn is a
 * dawn whatever the screen around it is painted in, so light and dark draw the same four skies;
 * only the rim round the picture is the theme's (`line2`), because that edge is what parts the
 * picture from the page.
 *
 * WHAT IS MEASURED (`mealSky.test.ts`), because a pretty sky can still be an unreadable control:
 *
 *   - the chosen meal's WORD is text, written on the ground under its sun, so it clears 4.5:1 on
 *     the ground of its own picture;
 *   - the SUN is the part of the control that shows which meal is chosen (WCAG 1.4.11), so it
 *     clears 3:1 against every stop of its sky. That is why every sky here is a deep one: the sun
 *     is setup's pale gold (`sky.ts`), and a pale gold on a pale peach dawn would vanish. The
 *     warmth of dawn and dusk is in the HUE of the horizon, not in its lightness;
 *   - a STATION — the small mark where another meal's sun would stand — shows the control's other
 *     options, so it clears 3:1 as it lands on every stop of EVERY sky: the marks stay where they
 *     are while the sky changes under them;
 *   - the dusk stars clear 3:1 on the dusk sky, as setup's stars do on theirs.
 *
 * NIGHT (the amber theme) GETS ITS OWN SET, built from the night palette's roles and nothing else,
 * for the reason every picture in this package does: that theme exists to keep a dark room dark and
 * "drops blue entirely" (theme.ts, usage rule 7). One warm near-black sky for all four meals — the
 * sun's place and the word say which meal it is, and a tint that changed with it would be the one
 * thing on the screen that is not information — no halo, no stars, and nothing moves
 * (`mealSkyStill`).
 */
import type { Meal } from '@nibblecue/core';
import { withAlpha } from './contrast';
import { DAY_NIGHT_SKY } from './sky';
import { themes, type ThemeName } from './theme';

export interface MealScene {
  /** The sky, top to horizon: two or three stops, drawn as one vertical gradient. */
  sky: readonly string[];
  /** The ground the word is written on, which is also the near hill. */
  ground: string;
  /** The far hill: a shade between the ground and the sky, so the land has depth. */
  hill: string;
  /** The chosen meal's word, on the ground: text, so 4.5:1. */
  word: string;
}

export interface MealSky {
  scenes: Readonly<Record<Meal, MealScene>>;
  /** The sun: its highlight, then its body — setup's pale gold, one picture language. */
  sun: readonly [string, string];
  /** The dashes of the sun's path across the sky: scenery. */
  path: string;
  /** The mark where another meal's sun would stand, alpha included: 3:1 on every sky. */
  station: string;
  /** The rings of light round the sun, as a color with its own alpha. */
  halo: string;
  star: string;
  /** Whether the halo and the dusk stars are drawn at all: false only in the amber theme. */
  scenery: boolean;
}

const WHITE = '#FFFFFF';

/**
 * The four skies, top to horizon, and their ground. Each is kept deep — at most about 0.19
 * relative luminance at any stop — which is what lets one pale-gold sun and one set of white marks
 * clear 3:1 on all of them:
 *
 *   BREAKFAST  a dawn: night-blue overhead, violet, and a rose horizon the sun has just left
 *   LUNCH      noon: a clear cobalt, a little lighter toward the horizon, like setup's day sky
 *   SNACK      afternoon: blue overhead going gold at the horizon
 *   DINNER     dusk: indigo overhead, plum, and an ember horizon the sun is setting into
 *
 * The grounds are the land in that light — a blue-shadowed dawn, a green noon, an olive
 * afternoon, a plum dusk: lit by day and in shadow at either end of it, and every one dark enough
 * that the white word on it clears AAA. The far hill is a shade lighter than the land in front of
 * it, which is what makes the two read as distance rather than as one shape.
 */
const SCENES: Readonly<Record<Meal, MealScene>> = {
  BREAKFAST: {
    sky: ['#34508F', '#7A5A92', '#B0587A'],
    ground: '#243157',
    hill: '#34467A',
    word: WHITE,
  },
  LUNCH: {
    sky: ['#1F62AE', '#2A6FB4', '#3579B8'],
    ground: '#245C43',
    hill: '#2F7353',
    word: WHITE,
  },
  SNACK: {
    sky: ['#2B5E9E', '#5D77A0', '#A36A34'],
    ground: '#4A4A26',
    hill: '#5E5C31',
    word: WHITE,
  },
  DINNER: {
    sky: ['#2A2A63', '#6E3A6B', '#B5523A'],
    ground: '#221A2E',
    hill: '#30253F',
    word: WHITE,
  },
};

/** Light and dark draw the same four pictures; only their edge (the theme's `line2`) differs. */
export const MEAL_SKY: MealSky = {
  scenes: SCENES,
  sun: DAY_NIGHT_SKY.sun,
  path: withAlpha(WHITE, 0.4),
  station: withAlpha(WHITE, 0.85),
  halo: DAY_NIGHT_SKY.halo,
  star: WHITE,
  scenery: true,
};

const amber = themes.night;

/** One picture for all four meals in the amber theme: the night palette's grounds and inks. */
const NIGHT_SCENE: MealScene = {
  sky: [amber.surface3, amber.surface2],
  ground: amber.page,
  hill: amber.surfaceSolid,
  word: amber.text,
};

/**
 * The amber theme's sky, from the night palette's roles only: its grounds for the sky and the
 * land, its accent pair for the sun (the theme toggle's amber sun), its quiet ink for the marks and
 * its own hairline for the path. No new color, no light of any kind.
 */
export const MEAL_SKY_AMBER: MealSky = {
  scenes: { BREAKFAST: NIGHT_SCENE, LUNCH: NIGHT_SCENE, SNACK: NIGHT_SCENE, DINNER: NIGHT_SCENE },
  sun: [amber.accent2, amber.accent],
  path: amber.line2,
  station: amber.text3,
  halo: withAlpha(amber.accent, 0),
  star: amber.text3,
  scenery: false,
};

/** The meal sky's colors for the theme being painted. */
export const mealSkyFor = (theme: ThemeName): MealSky =>
  theme === 'night' ? MEAL_SKY_AMBER : MEAL_SKY;
