/**
 * THE STARFIELD'S COLORS — the About sheet's hidden credits (the owner, 2026-09-25, of the "that's
 * cool" list: *"might not necessarily be useful, but it's cool … Let's try doing everything"*).
 * Seven taps on the wordmark open a night sky of slowly drifting stars with the credits on it;
 * `StarfieldCredits.tsx` draws it and `components/starfield.ts` lays out the stars and counts the
 * taps.
 *
 * ONE PICTURE LANGUAGE WITH THE THEME SWITCH: the sky is setup's indigo night (`sky.ts`, the dark
 * picture a parent has already seen on the switch), the stars are its white dots, and the few
 * near ones are its four-point sparkle in a pale gold with a faint light round each. It is the
 * same picture in light and in dark — a night sky is a night sky, whatever the page behind the
 * sheet was.
 *
 * THE WORDS SIT ON A PANEL, and that is what the measurement needed rather than a style. The stars
 * drift, so any star can pass behind any letter, and white words over a white star are not words;
 * the panel is the sky's own darkest indigo at most of full strength, so a star behind it dims to
 * a glimmer and every word is measured over the brightest thing that can ever be under it
 * (`starfield.test.ts`): the nearest sparkle at full strength, with its glow, through the panel.
 *
 * AMBER NIGHT GETS ITS OWN SET, from the night palette's roles alone: warm grounds for the sky,
 * the palette's own dim inks for the stars, its text for the words — and no glow at all, because
 * nothing glows at 3 a.m. (and nothing drifts either: `StarfieldCredits` holds them still).
 */
import { withAlpha } from './contrast';
import { DAY_NIGHT_SKY } from './sky';
import { themes, type ThemeName } from './theme';

export interface StarfieldScene {
  /** The sky, top to bottom. */
  sky: readonly [string, string];
  /** The dots, opaque: each star's own strength is applied over it (`starfield.ts`). */
  star: string;
  /** The near stars' four-point sparkle, opaque. */
  sparkle: string;
  /** A faint disc of light round each sparkle, as a color with its alpha; null where none glows. */
  glow: string | null;
  /** The panel behind the words, with its alpha. */
  panel: string;
  /** The name at the head of the credits. */
  title: string;
  /** The lines under it. */
  text: string;
  /** The small line that says how to close it. */
  hint: string;
}

const PANEL_INDIGO = '#0D1033';

export const STARFIELD: StarfieldScene = {
  sky: DAY_NIGHT_SKY.nightSky,
  star: DAY_NIGHT_SKY.star,
  sparkle: '#FFE9A8',
  glow: withAlpha('#FFE9A8', 0.16),
  panel: withAlpha(PANEL_INDIGO, 0.84),
  title: '#FFFFFF',
  text: '#DCDFF7',
  hint: '#BEC3EA',
};

const amber = themes.night;

export const STARFIELD_AMBER: StarfieldScene = {
  sky: [amber.surface3, amber.page],
  star: amber.text3,
  sparkle: amber.text2,
  glow: null,
  panel: withAlpha(amber.page, 0.86),
  title: amber.text,
  text: amber.text2,
  hint: amber.text2,
};

/** The starfield for the theme being painted. */
export const starfieldFor = (theme: ThemeName): StarfieldScene =>
  theme === 'night' ? STARFIELD_AMBER : STARFIELD;
