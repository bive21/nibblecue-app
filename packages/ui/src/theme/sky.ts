/**
 * THE DAY/NIGHT SWITCH'S SKY — the colors of a PICTURE, not of a theme.
 *
 * `DayNightSwitch` draws a small scene: a day sky with a sun and a cloud, a night sky with a moon
 * and stars. The owner asked for it on 2026-09-25 as setup's live dark preview ("make this an
 * interesting animation toggle", after a sun-and-moon switcher they had seen). Its colors live
 * here, in `theme/`, and not as tokens on the palette, for the reason `artInk.ts` gives for its
 * inks: they must NOT move with the theme.
 *
 * The switch is the thing that changes the theme. Tapping it paints the whole app dark in the
 * same frame the knob starts to roll, so a sky drawn from `t.color` would jump from one palette to
 * the other half way through its own animation — the day sky would turn into a dark-theme day sky
 * mid-roll. A picture of day and a picture of night stay the same pictures whatever the screen
 * around them is painted in; only the hairline round the pill is the theme's (`line2`), because
 * that edge is what separates the pill from the page, and the page is the theme's.
 *
 * WHAT IS MEASURED (`sky.test.ts`), because a pretty sky can still be an unreadable switch:
 *
 *   - the knob against its sky, at every stop of both gradients, clears 3:1 — WCAG's floor for
 *     the part of a control that shows its state (1.4.11). The sun is a pale gold on a cobalt
 *     blue, not the saturated orange of most sun icons, which measures about 2.6:1 there;
 *   - the stars clear 3:1 on the night sky, and the cloud on the day sky;
 *   - the day sky clears 3:1 on the ground and the cards of both themes, since every parent sees
 *     day first. Night is only ever shown on a dark page (it is the dark preview), where indigo
 *     on near-black has no edge of its own — which is what the theme's rim is for.
 *
 * NIGHT (the amber theme) GETS ITS OWN SET, built from the night palette's own roles and nothing
 * else: that theme exists to keep a dark room dark and "drops blue entirely" (theme.ts, usage rule
 * 7), so a blue sky and a lit sun are exactly what it may not show. The scene goes too — no cloud,
 * no stars, no halo, no shadow — the rule `StopButton` and `ChildChip` already follow at 3 a.m.:
 * nothing on the screen that is not information. The knob's shape and where it sits still say
 * which way the switch is.
 */
import { composite, withAlpha } from './contrast';
import { themes, type ThemeName } from './theme';

export interface DayNightSky {
  /** The day sky, top to bottom: deeper overhead, a little lighter toward the horizon. */
  daySky: readonly [string, string];
  /** The night sky, top to bottom. */
  nightSky: readonly [string, string];
  /** The sun: its highlight, then the body the edge is drawn in. */
  sun: readonly [string, string];
  moon: string;
  crater: string;
  star: string;
  cloud: string;
  /** The rings of light round the knob, as a color with its own alpha. */
  halo: string;
  /** The knob's shadow on the sky under it. */
  shade: string;
  /**
   * Whether the scenery is drawn at all: the cloud, the stars, the halo and the knob's shadow.
   * False only in the amber theme, where nothing that is not information is drawn.
   */
  scenery: boolean;
}

/**
 * A cobalt afternoon, a touch deeper overhead. It sits in a narrow band on purpose: deep enough
 * that a pale sun clears 3:1 on it, light enough that the pill still clears 3:1 on the dark
 * theme's ground and cards, where a parent whose phone is dark sees it by day.
 */
const DAY_SKY = ['#2C6EB2', '#2E74B9'] as const;
/** Indigo, because indigo is night in this app already (theme.ts gives sleep the same hue). */
const NIGHT_SKY = ['#232861', '#161A45'] as const;
/** A pale gold: the highlight, then the body. */
const SUN = ['#FFE17A', '#FFD04D'] as const;
const MOON = '#EEF1F7';
/** A crater is a shade of the moon's own gray, never a second color. */
const CRATER_DEPTH = 0.2;
const WHITE = '#FFFFFF';

/** Light and dark draw the same picture; only its edge (the theme's `line2`) differs. */
export const DAY_NIGHT_SKY: DayNightSky = {
  daySky: DAY_SKY,
  nightSky: NIGHT_SKY,
  sun: SUN,
  moon: MOON,
  crater: composite(MOON, NIGHT_SKY[1], CRATER_DEPTH),
  star: WHITE,
  cloud: WHITE,
  halo: withAlpha(WHITE, 0.12),
  shade: withAlpha(NIGHT_SKY[1], 0.45),
  scenery: true,
};

const amber = themes.night;

/**
 * The amber theme's switch, from the night palette's roles only: a darker and a lighter ground for
 * the two skies, the accent pair for the sun, the text inks for the moon. No new color at all.
 */
export const DAY_NIGHT_SKY_AMBER: DayNightSky = {
  daySky: [amber.surface3, amber.surface2],
  nightSky: [amber.surfaceSolid, amber.page],
  sun: [amber.accent2, amber.accent],
  moon: amber.text,
  crater: amber.text2,
  star: amber.text3,
  cloud: amber.text3,
  halo: withAlpha(amber.accent, 0),
  shade: withAlpha(amber.page, 0),
  scenery: false,
};

/** The switch's colors for the theme being painted. */
export const dayNightSkyFor = (theme: ThemeName): DayNightSky =>
  theme === 'night' ? DAY_NIGHT_SKY_AMBER : DAY_NIGHT_SKY;

/* ------------------------------------------------------------ the theme toggle's three skies */

/**
 * THE THEME TOGGLE'S PICTURES (`ThemeSkyToggle`; the owner, 2026-09-25, of the Appearance sheet:
 * *"from the theme animation to switch to dark in onboarding, create one more with enough spacing
 * to fit the text (Light, Night, or Dark) … Make 3 a 3 way toggle: left day, middle night, right
 * dark"*). The same small scene as setup's switch, one stop wider: three pictures instead of two,
 * and the chosen stop's word written on the sky beside the knob.
 *
 * LIGHT AND DARK ARE SETUP'S OWN TWO PICTURES, color for color — the cobalt afternoon with its
 * pale-gold sun and the indigo night with its cratered moon. Setup's switch already calls the
 * indigo one dark mode, so the right-hand stop is the picture a parent has seen before, and the
 * two controls are one picture language rather than two.
 *
 * NIGHT, THE MIDDLE STOP, IS NEW: a picture of the amber theme ("Dim amber for 2 a.m."), built
 * from the night palette's roles and nothing else, because that theme "drops blue entirely"
 * (theme.ts, usage rule 7) and a picture of it that carried blue would be a picture of something
 * else. A warm near-black sky, the palette's own `text` for the word, and for the knob an amber
 * CRESCENT on a faintly lit disc — a face that cannot be taken for Dark's white full moon, so the
 * two dark pictures are told apart by the knob's shape and not only by the sky's hue. No stars and
 * no glow: it is drawn the way the night theme draws everything, with nothing on it that is not
 * information. (There is a second reason, in `ThemeSkyToggle`: a parent only ever RESTS on Night
 * while the app is painted night, so anything drawn only in the plain set's Night would show
 * mid-roll and vanish on arrival.)
 *
 * THE WORD IS TEXT, so it clears 4.5:1 against its sky at every stop of the gradient, not 3:1.
 * The unchosen stops carry a glyph each — a sun, a crescent, a moon — so a parent can see there
 * are three places to go; they are the part of the control that shows its options, so they clear
 * 3:1 (WCAG 1.4.11), measured over what they are drawn on, alpha and all. `sky.test.ts` measures
 * every one of them.
 *
 * AND THE GLYPHS ARE PLAIN TO SEE NOW (the owner, 2026-09-26: *"the moon icons (for night and dark)
 * need tto be highlighted more, in case if user wont understand how to change it"*). They were a
 * white at 80% on the day and 62% on the night, small, straight on the sky: quiet enough that the
 * two stops a parent could go to did not read as places to tap. Each is brighter (94% and 86%) and
 * sits on a HALO — a soft disc of its own white, 16% and 14%, edged by a fine ring of it at 45% and
 * 32% — the shape of a thing to press, while the chosen stop's word stays the whole white and the
 * knob the one solid thing. The glyph is measured on its halo, not on the bare sky: a lighter disc
 * under a white glyph is LESS contrast, and it still clears 3:1. In the amber pictures nothing is
 * lit (usage rule 7): the glyph is the palette's `text2` instead of `text3`, and its ring is
 * `text3` with no disc inside it — a drawn edge, not a glow.
 *
 * AMBER NIGHT GETS ITS OWN SET, for the reason the switch's does: when the app is painted night,
 * all three pictures come from the night palette and the scenery goes. Night's picture is the
 * SAME object in both sets, which is what lets the toggle change sets while it rests on Night
 * without a pixel moving: the other two pictures are hidden under it then.
 */
export interface SkyScene {
  /** The sky, top to bottom. */
  sky: readonly [string, string];
  /** The chosen stop's word, written on this sky: text, so 4.5:1 at every stop of it. */
  word: string;
  /** The unchosen stops' glyphs (and a lock) drawn on this sky, over their halo, alpha included: 3:1. */
  marker: string;
  /** The soft disc behind each unchosen stop's glyph, alpha included; none (0) where nothing is lit. */
  markerHalo: string;
  /** The fine ring round that disc, alpha included: seen, and quieter than the glyph it rims. */
  markerRing: string;
}

export interface ThemeSky {
  /** Light: the day sky, and the sun for the knob — its highlight, then its body. */
  light: SkyScene & { sun: readonly [string, string] };
  /** Night: the amber sky, and a crescent for the knob — its lit limb, then the disc's dim rest. */
  night: SkyScene & { crescent: string; unlit: string };
  /** Dark: the night sky, and the full moon for the knob, with its craters. */
  dark: SkyScene & { moon: string; crater: string };
  star: string;
  cloud: string;
  /** The rings of light round the knob, as a color with its own alpha. */
  halo: string;
  /** The knob's shadow on the sky under it. */
  shade: string;
  /** Whether the cloud, the stars, the halo and the shadow are drawn at all. */
  scenery: boolean;
}

/**
 * Night's own picture, shared by both sets. The unlit side of the crescent is the sky with a
 * little of the accent in it — earthshine — so the knob still reads as a round thing that rolled
 * in, and the crescent is what is lit on it. Both are composites of two night roles, the way a
 * crater is a shade of the moon's own gray, never a new color.
 */
const NIGHT_SCENE: ThemeSky['night'] = {
  sky: [amber.surface3, amber.surfaceSolid],
  word: amber.text,
  // brighter than it was (`text3`), and ringed rather than lit: nothing glows at 3 a.m.
  marker: amber.text2,
  markerHalo: withAlpha(amber.text2, 0),
  markerRing: amber.text3,
  crescent: amber.accent2,
  unlit: composite(amber.surfaceSolid, amber.accent, 0.16),
};

/**
 * Light and dark paint the same toggle, as they paint the same switch. The markers are the white
 * of the word at less than full strength: quieter than the word, still 3:1 on their halo — the day
 * sky needs more of it than the night sky does, because cobalt is the lighter of the two, and a
 * white halo lightens it further under the glyph.
 */
export const THEME_SKY: ThemeSky = {
  light: {
    sky: DAY_SKY,
    word: WHITE,
    marker: withAlpha(WHITE, 0.94),
    markerHalo: withAlpha(WHITE, 0.16),
    markerRing: withAlpha(WHITE, 0.45),
    sun: SUN,
  },
  night: NIGHT_SCENE,
  dark: {
    sky: NIGHT_SKY,
    word: WHITE,
    marker: withAlpha(WHITE, 0.86),
    markerHalo: withAlpha(WHITE, 0.14),
    markerRing: withAlpha(WHITE, 0.32),
    moon: MOON,
    crater: DAY_NIGHT_SKY.crater,
  },
  star: WHITE,
  cloud: WHITE,
  halo: DAY_NIGHT_SKY.halo,
  shade: DAY_NIGHT_SKY.shade,
  scenery: true,
};

/**
 * The toggle in the amber theme: the three skies are the palette's grounds, lightest to darkest
 * left to right, the knobs are the switch's amber sun and moon, and every word and glyph is the
 * palette's own `text` and `text2`, each glyph ringed in `text3` with nothing lit inside. No new
 * color, and no scenery.
 */
export const THEME_SKY_AMBER: ThemeSky = {
  light: {
    sky: DAY_NIGHT_SKY_AMBER.daySky,
    word: amber.text,
    marker: amber.text2,
    markerHalo: withAlpha(amber.text2, 0),
    markerRing: amber.text3,
    sun: DAY_NIGHT_SKY_AMBER.sun,
  },
  night: NIGHT_SCENE,
  dark: {
    sky: DAY_NIGHT_SKY_AMBER.nightSky,
    word: amber.text,
    marker: amber.text2,
    markerHalo: withAlpha(amber.text2, 0),
    markerRing: amber.text3,
    moon: DAY_NIGHT_SKY_AMBER.moon,
    crater: DAY_NIGHT_SKY_AMBER.crater,
  },
  star: amber.text3,
  cloud: amber.text3,
  halo: DAY_NIGHT_SKY_AMBER.halo,
  shade: DAY_NIGHT_SKY_AMBER.shade,
  scenery: false,
};

/** The toggle's pictures for the theme being painted. */
export const themeSkyFor = (theme: ThemeName): ThemeSky =>
  theme === 'night' ? THEME_SKY_AMBER : THEME_SKY;
