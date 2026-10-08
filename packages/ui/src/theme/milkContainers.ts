/**
 * THE STORED-MILK CONTAINERS' COLORS (`MilkContainerArt`; the owner, 2026-09-26: *"make the bag
 * bottle container, a more interesting option"*). Colors of a picture are measured values and a
 * component may not write one (eslint), so they live here beside the bottle toggle's
 * (`bottle.ts`), from which they take their family:
 *
 *   - the line is the FEED module's ink — the stash wears the feed hue (`moduleColor.stash`) — and
 *     the zip band, the cap and the lid are the owner's butter gold, the bottle toggle's collar;
 *   - THE MILK IS MILK in light and in dark, the palette's own `milkSoft`, and on a pale glass its
 *     level is a line of the milk's amber, on a dark glass a dark meniscus: the bottle toggle's rule;
 *   - the amber NIGHT has its own set from the night palette's roles alone, nothing lit.
 *
 * WHAT IS MEASURED (`milkContainers.test.ts`): the line clears 3:1 on every ground a container is
 * drawn on — a tile at rest (`surfaceSolid`), a chosen tile (`accentSoft`, under all six schemes) —
 * and on its own glass; the level is a 3:1 edge against the empty glass, by the milk itself or by
 * the line at its surface; and the cap's outline carries its shape against the cap.
 */
import { composite } from './contrast';
import { moduleDiscSwatch, themes, type ThemeName } from './theme';

export interface MilkContainerPaint {
  /** The container's line, and its fine details. */
  line: string;
  /** The empty inside. */
  glass: string;
  /** The milk, and the line its surface draws. */
  milk: string;
  surface: string;
  /** The zip band, the cap, the lid. */
  cap: string;
}

const BUTTER = moduleDiscSwatch.feed;
const light = themes.light;
const dark = themes.dark;
const amber = themes.night;

export const MILK_CONTAINER_LIGHT: MilkContainerPaint = {
  line: light.feed,
  glass: light.surfaceSolid,
  milk: light.milkSoft,
  surface: light.milk,
  cap: BUTTER,
};

/** A dark glass: the card with a little of the theme's text in it, as the bottle toggle's is. */
const DARK_GLASS = composite(dark.surfaceSolid, dark.text, 0.1);

export const MILK_CONTAINER_DARK: MilkContainerPaint = {
  line: dark.feed,
  glass: DARK_GLASS,
  // the milk is milk: the same pale cream as in light, and the level a dark meniscus on it
  milk: light.milkSoft,
  surface: dark.feedSoft,
  cap: BUTTER,
};

/** The amber theme's, from the night palette's roles only: one milk, nothing lit. */
export const MILK_CONTAINER_NIGHT: MilkContainerPaint = {
  line: amber.feed,
  glass: amber.surface3,
  milk: amber.text3,
  surface: amber.feedSoft,
  cap: amber.surface2,
};

const MILK_CONTAINER_PAINT: Readonly<Record<ThemeName, MilkContainerPaint>> = {
  light: MILK_CONTAINER_LIGHT,
  dark: MILK_CONTAINER_DARK,
  night: MILK_CONTAINER_NIGHT,
};

/** The containers' colors for the theme being painted. */
export const milkContainerPaintFor = (theme: ThemeName): MilkContainerPaint =>
  MILK_CONTAINER_PAINT[theme];
