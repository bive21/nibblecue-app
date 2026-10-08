/**
 * TODAY'S SKY — the colors of a picture that follows the clock (the owner, 2026-09-25, of the
 * "that's cool" list: *"might not necessarily be useful, but it's cool … Let's try doing
 * everything. I will then review"*). Behind Today's top bar, and nowhere else, a band of sky in
 * the colors of the hour where the household is: dawn early in the morning, a clear day, a warm
 * dusk, and a night sky with a few still stars. `LiveSky.tsx` draws it; `components/liveSky.ts`
 * says which phase an hour is in and where the stars sit.
 *
 * IT IS WEATHER, NOT BRANDING, AND IT IS QUIET ON PURPOSE. CLAUDE.md §7 keeps the brand off Today
 * because the chrome belongs to the baby; a sky names nothing and sells nothing, so it may be
 * there — but only as a tint. Every color here sits within a small step of the page it fades into
 * (`liveSky.test.ts` holds the light ones within 1.4:1 of the paper ground and the dark ones within
 * 1.8:1), so a parent sees the top of the screen take the color of the hour and does not see a
 * banner.
 *
 * ITS LIGHTNESS FOLLOWS THE THEME, NOT THE HOUR. The light theme's night is a pale periwinkle and
 * the dark theme's noon is a deep blue, which sounds backwards and is not: the status bar's clock
 * and battery are drawn by the phone in the theme's ink (`statusBarStyleFor`: dark on light, light
 * on dark), and the child chip, the bell and the account avatar keep their own theme colors. A
 * night sky that went dark under a light theme's dark status-bar ink would put the phone's own
 * clock out of sight. So the hour is carried by HUE — lilac to peach at dawn, blue by day, rose to
 * apricot at dusk, periwinkle and stars at night — and the lightness stays the theme's.
 *
 * WHAT IS MEASURED (`liveSky.test.ts`), because a sky is still a ground and the words on it are
 * still words: the chip's name and age, the bell's glyph on its translucent circle, the Glass
 * skin's see-through chip in every color scheme, and the phone's status-bar ink, each over every
 * color of every sky, all the way down the fade into the page — never below 4.5:1. The stars are
 * held to be visible (3:1 and more on their sky) and QUIETER than the words beside them.
 *
 * AMBER NIGHT GETS ONE FLAT DARK GROUND and nothing else, whatever the hour: the theme exists to
 * keep a dark room dark and "drops blue entirely" (theme.ts, usage rule 7), and at 3 a.m. there is
 * nothing on the screen that is not information (`sky.ts`, `StopButton`, `ChildChip`). No stars,
 * no gradient, and no fade from one phase to the next — the night palette's own `page`.
 */
import { composite, withAlpha } from './contrast';
import { themes, type ThemeName } from './theme';

/** The four skies an hour can have, in the order a day meets them. */
export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';
export const SKY_PHASES: readonly SkyPhase[] = ['dawn', 'day', 'dusk', 'night'];

export interface LiveSkyScene {
  /**
   * The sky, top to bottom: overhead, then the horizon the foot of the band fades out from. Both
   * opaque — the fade into the page is the band's own alpha, drawn by `LiveSky`, not the colors'.
   */
  sky: readonly [string, string];
  /** The few still stars, alpha included; null for a phase that has none. */
  star: string | null;
}

/**
 * The light theme's four skies: pale enough that the page's own `text2` still clears 4.5:1 on the
 * deepest of them, so nothing on the bar had to change color for the sky to arrive.
 */
const LIGHT: Record<SkyPhase, LiveSkyScene> = {
  /** Lilac overhead, peach at the horizon: the sun not up yet, the sky warming from below. */
  dawn: { sky: ['#DCE2F4', '#FBE2D2'], star: null },
  /** A clear pale blue, lighter toward the horizon. */
  day: { sky: ['#C9E2F5', '#E2F0F7'], star: null },
  /** Dusky rose overhead, apricot where the sun went down: the warm end of the day. */
  dusk: { sky: ['#EAD2E2', '#F8DBC4'], star: null },
  /**
   * Periwinkle and a few stars in a deeper periwinkle ink. White stars on a pale sky are glints
   * nobody sees; stars a shade darker than their sky read as the drawn stars of a picture book.
   */
  night: { sky: ['#D0D3EE', '#E3E1F1'], star: '#6A6EB4' },
};

/**
 * The dark theme's: the same four hues at the dark theme's lightness. The night is setup's indigo
 * one step deeper (`sky.ts` `NIGHT_SKY`), and its stars a soft white at a little over half
 * strength — plainly stars, and still quieter than the chip's words beside them.
 */
const DARK: Record<SkyPhase, LiveSkyScene> = {
  dawn: { sky: ['#1C1B3B', '#3A2234'], star: null },
  day: { sky: ['#0F3350', '#15405A'], star: null },
  dusk: { sky: ['#2A1F45', '#4A2A2A'], star: null },
  night: { sky: ['#0E1230', '#171B40'], star: withAlpha('#F4F1FF', 0.55) },
};

export const LIVE_SKY: Readonly<Record<'light' | 'dark', Record<SkyPhase, LiveSkyScene>>> = {
  light: LIGHT,
  dark: DARK,
};

const amber = themes.night;

/**
 * The amber theme's sky, for every hour: the night palette's darkest ground, flat. It is a hair
 * darker than the paper it fades into (the night sky over a lamp-lit room), which is all it is.
 */
export const LIVE_SKY_AMBER: LiveSkyScene = { sky: [amber.page, amber.page], star: null };

/**
 * THE DAY SKY IS THE HOUSEHOLD'S COLOR (the owner, 2026-10-06: "when changing the theme color to
 * anything other than blue, the top part where the profile icons are still blue. Is this fixable to
 * follow the theme's color instead?"). Dawn, dusk and night keep the hour's own hue — they are the
 * time of day — but a clear day was always blue, so a rose or a sage household opened Today under
 * somebody else's sky. By day the band is the scheme's accent laid thinly over the page's paper (the
 * light theme) or its ground (the dark), the same tint-of-the-page the blue was, measured the same
 * way across every scheme in `liveSky.test.ts`.
 */
const DAY_ACCENT = { light: [0.2, 0.09], dark: [0.3, 0.2] } as const;

function daySkyIn(theme: 'light' | 'dark', accent: string): LiveSkyScene {
  const ground = theme === 'light' ? themes.light.paper : themes.dark.page;
  const [top, foot] = DAY_ACCENT[theme];
  return { sky: [composite(ground, accent, top), composite(ground, accent, foot)], star: null };
}

/** What the sky is at `phase`, in the theme being painted — by day, in the scheme's `accent`. */
export const liveSkyFor = (theme: ThemeName, phase: SkyPhase, accent?: string): LiveSkyScene =>
  theme === 'night'
    ? LIVE_SKY_AMBER
    : phase === 'day' && accent !== undefined
      ? daySkyIn(theme, accent)
      : LIVE_SKY[theme][phase];
