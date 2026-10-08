/**
 * THE NIGHT LIGHT'S COLORS — a warm glow to see by in a dark room (the owner, 2026-09-25, of the
 * "that's cool" list: *"might not necessarily be useful, but it's cool … Let's try doing
 * everything"*). `NightLight.tsx` draws them; `components/nightLight.ts` holds the level and the
 * gesture. They live here, in `theme/`, because they are a picture's colors and not a theme's —
 * the light is the same light whatever the rest of the app is painted in — with one exception,
 * below, for the theme that keeps a dark room dark.
 *
 * HOW THE LIGHT IS MADE. Two glows, each a radial gradient from a CORE through a HALO to nothing,
 * over a near-black ground: a small, deep ember that is always there, and a larger golden one laid
 * over it at the level the parent chose (0 to 1). What the eye meets at the heart of the light is
 * therefore the bright core over the dim one at that level — `nightLightCore` — and every pixel
 * anywhere else is darker than that heart, because each halo is darker than its core and fades
 * to the ground.
 *
 * THE CEILING IS A COLOR, NOT A PROMISE (`NIGHT_LIGHT_CEILING`, `nightLight.test.ts`). At its
 * brightest the heart is a golden amber: its blue channel under half its red, its green under
 * five sixths of it, and its luminance under two thirds of white's — so no level the drag or the
 * accessibility action can reach is blue-white, and none is white. Warm light is the point: blue
 * light is what wakes a person up, and a white screen in a dark nursery wakes the baby too. The
 * app cannot turn the phone's own backlight down (that would take `expo-brightness`, a native
 * module this over-the-air update may not add); these colors are the whole of what it controls.
 *
 * AMBER NIGHT GETS ITS OWN SET, from the night palette's roles and composites of two of them —
 * the rule the theme toggle's Night picture follows (`sky.ts`) — so a parent who painted the app
 * amber gets the same amber here, a shade lower at its brightest. Its hint is the palette's own
 * `text2`.
 */
import { composite, parseColor } from './contrast';
import { themes, type ThemeName } from './theme';

export interface NightLightGlow {
  /** The heart of the glow, opaque. */
  core: string;
  /** The color it falls off in, darker than the core, fading to the ground. */
  halo: string;
}

export interface NightLightScene {
  /** The room: near-black, warm. */
  ground: string;
  /** The ember that is always there, even at the lowest level. */
  dim: NightLightGlow;
  /** The golden glow laid over it, at the parent's level. */
  bright: NightLightGlow;
  /** The one line of words, at the foot: text, so 4.5:1 on the ground. */
  hint: string;
}

/** The light for the light and dark themes: an ember rising to a golden amber. */
export const NIGHT_LIGHT: NightLightScene = {
  ground: '#0A0503',
  dim: { core: '#7A3410', halo: '#3D1606' },
  bright: { core: '#FFC271', halo: '#E0892F' },
  hint: '#9C7852',
};

const amber = themes.night;

/** The light in the amber theme: the night palette's accent pair, and its darkest ground. */
export const NIGHT_LIGHT_AMBER: NightLightScene = {
  ground: amber.page,
  dim: {
    core: composite(amber.page, amber.accent, 0.4),
    halo: composite(amber.page, amber.accent, 0.12),
  },
  bright: { core: amber.accent2, halo: amber.accent },
  hint: amber.text2,
};

/** The light for the theme being painted. */
export const nightLightFor = (theme: ThemeName): NightLightScene =>
  theme === 'night' ? NIGHT_LIGHT_AMBER : NIGHT_LIGHT;

/**
 * THE CEILING every level stays under, as ratios of the heart's own channels: `blueOverRed` is
 * what keeps it from ever going blue-white, `greenOverRed` what keeps it from going to a cold
 * yellow-white, and `luminance` what keeps it from ever being white (1 is white; a warm white is
 * about 0.9).
 */
export const NIGHT_LIGHT_CEILING = { luminance: 0.62, blueOverRed: 0.55, greenOverRed: 0.82 };

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** The heart of the light at `level`: the bright core over the dim one, at that strength. */
export function nightLightCore(scene: NightLightScene, level: number): string {
  return composite(scene.dim.core, scene.bright.core, clamp01(level));
}

/** The heart's channels as the ceiling reads them. */
export function warmthOf(color: string): { blueOverRed: number; greenOverRed: number } {
  const { r, g, b } = parseColor(color);
  return r <= 0 ? { blueOverRed: 1, greenOverRed: 1 } : { blueOverRed: b / r, greenOverRed: g / r };
}
