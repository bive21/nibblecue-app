/**
 * EVERY STORAGE PLACE'S PICTURE, in color (`PlaceRim`; the owner, 2026-09-26: *"why do you only
 * have the new background image in milk stash only for frozen, this is a fun one, and it should be
 * on every category"*). Frost was first (`theme/frost.ts`, a freezer's and a deep freezer's); these
 * are its three siblings, one per place, each drawn at the rim of a surface exactly where frost is:
 *
 *   - a COUNTER'S WARM LIGHT (`GLOW_PALETTES`): a soft glow at the edge like a little sunbeam, two
 *     shafts of light slanting in from it, and a couple of motes in them;
 *   - a FRIDGE'S DEW (`DEW_PALETTES`): a faint cool mist at the edge and beads of condensation, one
 *     of which ran a little way down when it arrived and left a wet track;
 *   - THAWING'S MELTWATER (`MELT_PALETTES`): what a freezer's frost leaves when it melts — the
 *     drops that ran down, resting at the foot of their runs with the wet lines behind them, a bead
 *     or two, and a faint wet sheen.
 *
 * THE SAME PROMISE FROST MAKES, MEASURED THE SAME WAY (`placeRim.test.ts`). Each picture has one
 * broad layer — the glow, the mist, the sheen — and that is the only part of it a word could ever
 * be near, so it is held to what frost's glaze is held to: every ink a card writes (`text`, `text2`
 * at 4.5:1; `text3` and the four place hues as marks at 3:1) clears its floor over it where it is
 * densest, on every card ground, in all 54 appearances. It is drawn in the host's padding and never
 * under a word (`placeRim.ts` proves that geometry), so this is the belt to that brace: a row that
 * grew into its own padding at the largest text would still read. The small pieces — beads, drops,
 * shafts, motes — are held to be SEEN, and to stay quieter than the words beside them.
 *
 * THEY FOLLOW THE CARD, as frost does, not one picture for every theme: pale color on the light
 * card, faint light on the dark one — and in NIGHT (the amber theme) a dim rim in `text3`, the
 * night palette's quietest role, at a fraction. Nothing in night shines: no highlight on a bead, no
 * glint on a drop, and no sunbeam at all — the counter keeps its rim and loses its light, because
 * at 3 a.m. "no brightness" is the rule (the brief, 2026-09-26) and a glow is brightness by
 * definition. Nothing blue either: night "drops blue entirely" (theme.ts, usage rule 7).
 */
import { withAlpha } from './contrast';
import { DEEP_FROST_PALETTES, FROST_PALETTES, FROST_WATER, GLAZE_STOPS } from './frost';
import type { PlaceKind } from './placeTones';
import { themes, type ThemeName } from './theme';

/** A broad layer's profile, edge to inner edge: how much of its color is left at each fraction. */
export type WashStops = readonly (readonly [offset: number, strength: number])[];

/* ----------------------------------------------------------------------- a fridge's dew */

export interface DewPalette {
  /** The mist at the very edge, alpha included: its densest (`MIST_STOPS` fades it inward). */
  mist: string;
  /** A bead of water. */
  bead: string;
  /** The light caught on a bead. Null in night. */
  highlight: string | null;
  /** The wet track the running bead leaves, at rest. */
  trail: string;
}

/**
 * A MIST IS FAINTER THAN A GLAZE. It has a softer shoulder than frost's rime — condensation is a
 * film, not a crust — and it is gone at the strip's inner edge like every wash here.
 */
export const MIST_STOPS: WashStops = [
  [0, 1],
  [0.5, 0.5],
  [0.8, 0.16],
  [1, 0],
];

/**
 * LIGHT: the fridge's own cool, a pale aqua — the teal the place's dot is drawn in, washed nearly
 * to white — about 1.1–1.3:1 off the card; the beads a clearer aqua near 1.6–1.8:1 with a white
 * catch-light, so a bead reads as water and not as a dot.
 */
const DEW_LIGHT: DewPalette = {
  mist: '#CCE7EA',
  bead: '#93C8CF',
  highlight: '#FFFFFF',
  trail: withAlpha('#8CC3CB', 0.55),
};

/** DARK: a cool white at a fraction, as frost's rime is — it LOWERS a word's contrast, so it is thin. */
const DEW_DARK: DewPalette = {
  mist: withAlpha('#BFE6EA', 0.12),
  bead: withAlpha('#CDEEF1', 0.45),
  highlight: withAlpha('#FFFFFF', 0.85),
  trail: withAlpha('#BFE6EA', 0.24),
};

const amber = themes.night;

const DEW_NIGHT: DewPalette = {
  mist: withAlpha(amber.text3, 0.12),
  bead: withAlpha(amber.text3, 0.42),
  highlight: null,
  trail: withAlpha(amber.text3, 0.22),
};

export const DEW_PALETTES: Readonly<Record<ThemeName, DewPalette>> = {
  light: DEW_LIGHT,
  dark: DEW_DARK,
  night: DEW_NIGHT,
};

/* ------------------------------------------------------------------ a counter's warm light */

export interface GlowPalette {
  /** The glow at the very edge, alpha included: its densest (`GLOW_STOPS`). */
  glow: string;
  /** A shaft of light at its root, fading to nothing at its tip. Null in night: no sunbeam. */
  ray: string | null;
  /** A mote in the light. Null in night. */
  mote: string | null;
}

/** A glow blooms: fuller than a mist near the edge, then gone. */
export const GLOW_STOPS: WashStops = [
  [0, 1],
  [0.35, 0.7],
  [0.7, 0.25],
  [1, 0],
];

/**
 * LIGHT: a warm peach — the counter's ochre, washed out — about 1.15–1.35:1 off the card; the
 * shafts a deeper apricot at their root, near 1.5–1.7:1, and the motes the counter's gold.
 */
const GLOW_LIGHT: GlowPalette = {
  glow: '#FADAB0',
  ray: '#F2BF78',
  mote: '#E4AE62',
};

/** DARK: warm lamplight at a fraction — thin for the same reason frost's dark rime is. */
const GLOW_DARK: GlowPalette = {
  glow: withAlpha('#FFC885', 0.14),
  ray: withAlpha('#FFD39C', 0.32),
  mote: withAlpha('#FFE0B5', 0.5),
};

/** NIGHT: the rim alone, dim, in `text3`. A glow is brightness, and there is none at 3 a.m. */
const GLOW_NIGHT: GlowPalette = {
  glow: withAlpha(amber.text3, 0.12),
  ray: null,
  mote: null,
};

export const GLOW_PALETTES: Readonly<Record<ThemeName, GlowPalette>> = {
  light: GLOW_LIGHT,
  dark: GLOW_DARK,
  night: GLOW_NIGHT,
};

/* ------------------------------------------------------------------- thawing's meltwater */

export interface MeltPalette {
  /** The wet sheen at the very edge, alpha included: its densest (`SHEEN_STOPS`). */
  sheen: string;
  /** A drop resting where it ran to, its glint, and the wet line behind it. */
  drop: string;
  dropGlint: string | null;
  trail: string;
  /** A bead of meltwater that did not run. */
  bead: string;
  highlight: string | null;
}

/** A sheen is the thinnest wash of the five: water, not ice. */
export const SHEEN_STOPS: WashStops = [
  [0, 1],
  [0.4, 0.45],
  [0.75, 0.12],
  [1, 0],
];

/**
 * LIGHT and DARK take their drops, glints and wet lines from the FROST's water (`FROST_WATER`) —
 * they are the frost's own melt (`frostRim.ts`'s `thaw` runs them down and leaves them there),
 * and a picture that changed their color on the frame the motion ends would flicker. Only the
 * sheen and the beads are this picture's own.
 */
const MELT_LIGHT: MeltPalette = {
  sheen: '#D2E5F5',
  ...FROST_WATER.light,
  bead: '#A7CBEC',
  highlight: '#FFFFFF',
};

const ICE = '#CEE6FC';
const MELT_DARK: MeltPalette = {
  sheen: withAlpha(ICE, 0.12),
  ...FROST_WATER.dark,
  bead: withAlpha(ICE, 0.4),
  highlight: withAlpha('#FFFFFF', 0.85),
};

/**
 * NIGHT: frost has no water at night (nothing melts where nothing moves), so the thawing picture
 * brings its own — dim `text3` drops with no glint, the lines they left, and a bead.
 */
const MELT_NIGHT: MeltPalette = {
  sheen: withAlpha(amber.text3, 0.1),
  drop: withAlpha(amber.text3, 0.45),
  dropGlint: null,
  trail: withAlpha(amber.text3, 0.4),
  bead: withAlpha(amber.text3, 0.36),
  highlight: null,
};

export const MELT_PALETTES: Readonly<Record<ThemeName, MeltPalette>> = {
  light: MELT_LIGHT,
  dark: MELT_DARK,
  night: MELT_NIGHT,
};

/* ------------------------------------------------------------------------- the washes */

/**
 * EACH PICTURE'S BROAD LAYER — its color at its densest and its profile — in one place, because
 * it is the one part of any of them a word could meet: the tests hold every ink over each of these
 * five, and the drawing reads the same table. A picture is named by the storage place it is drawn
 * for (`placeTones.ts`'s `PlaceKind`), as a place's dot and its icon square are.
 */
export function rimWash(look: PlaceKind, theme: ThemeName): { color: string; stops: WashStops } {
  switch (look) {
    case 'ROOM':
      return { color: GLOW_PALETTES[theme].glow, stops: GLOW_STOPS };
    case 'FRIDGE':
      return { color: DEW_PALETTES[theme].mist, stops: MIST_STOPS };
    case 'THAWED':
      return { color: MELT_PALETTES[theme].sheen, stops: SHEEN_STOPS };
    case 'FREEZER':
      return { color: FROST_PALETTES[theme].glaze, stops: GLAZE_STOPS };
    case 'DEEP_FREEZER':
      return { color: DEEP_FROST_PALETTES[theme].glaze, stops: GLAZE_STOPS };
  }
}
