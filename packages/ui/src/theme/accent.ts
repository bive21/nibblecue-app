/**
 * THE FIVE COLORS DERIVED FROM ONE (the shopping brief, 2026-09-19 §"THEME"): the household
 * picks an accent — that is what the six color schemes are — and the chips, the tints, the
 * pressed state, the shadow and the ink on a filled button all follow from it.
 *
 * WHY DERIVE RATHER THAN TABULATE. Five more roles × six schemes × three themes is ninety
 * values to keep in step, and the one that matters most — whether white text survives on a
 * filled button — is a MEASUREMENT, not a taste. A table would have to be re-measured every
 * time a scheme moved; this is computed from the accent the theme already resolved, so a scheme
 * change, a dark switch and night mode all carry without anything else being edited.
 *
 * `composite` and `readableInk` do the work and were already here: the first mixes a color into
 * a ground at an alpha and returns an opaque value, the second picks a preferred ink or falls
 * back when it cannot clear AA. This file is the naming, the ratios, and the one rule the brief
 * asked to be written once rather than per component.
 */
import { AA_TEXT, composite, contrastRatio, withAlpha } from './contrast';
import type { Palette } from './theme';

export interface AccentTheme {
  /** The accent itself: primary buttons, the FAB, a filled pill, a ticked circle, links. */
  accent: string;
  /** 14% of the accent over the surface — chips, icon squares, the active tab pill. */
  tint: string;
  /** 6% — the wash under a row that is already on the list. Half a step, deliberately. */
  tintSoft: string;
  /** The pressed state: the accent taken toward the ink rather than toward black. */
  dark: string;
  /** The FAB's shadow, and nothing else. A shadow is the one place an alpha belongs. */
  shadow: string;
  /**
   * What reads on a FILLED accent surface — white where the accent can carry it, the text ink
   * where it cannot.
   *
   * THIS IS THE RULE THE BRIEF ASKED FOR ONCE, NOT PER COMPONENT ("If the user's accent is too
   * light for white text … write this rule once in the theme"). A pale accent is a real setting
   * — the schemes include one — and a button that keeps white on it is unreadable rather than
   * merely pale. Every filled surface reads this, so none of them can disagree.
   */
  onAccent: string;
  /** True when the accent could not carry white: for a caller that wants to know why. */
  onAccentIsInk: boolean;
}

/** 14% over the surface (§THEME): enough to read as the accent's own, never as a fill. */
export const ACCENT_TINT = 0.14;
/** 6%: the "already on the list" wash, which must stay quieter than a chip. */
export const ACCENT_TINT_SOFT = 0.06;
/** How far toward the ink a press takes the accent. */
const ACCENT_DARKEN = 0.15;
/** The FAB's shadow alpha. */
export const ACCENT_SHADOW = 0.28;

/**
 * The accent's family, over the ground it will actually sit on.
 *
 * `surface` is passed in rather than assumed white because a tint is a color ON A GROUND
 * (DESIGN_SYSTEM §12 rule 1): the same 14% over a dark card is a different value, and mixing
 * toward white in dark mode would produce the one thing a dark theme must not have — a pale
 * rectangle. For the same reason `dark` mixes toward the TEXT ink rather than toward black: in
 * dark mode the text ink is nearly white, so a press correctly lightens instead of vanishing.
 */
export function deriveAccent(palette: Palette, accent: string = palette.accent): AccentTheme {
  const white = composite(palette.surfaceSolid, accent, ACCENT_TINT);
  const onAccent =
    contrastRatio(palette.onAccent, accent) >= AA_TEXT ? palette.onAccent : palette.text;
  return {
    accent,
    tint: white,
    tintSoft: composite(palette.surfaceSolid, accent, ACCENT_TINT_SOFT),
    dark: composite(accent, palette.text, ACCENT_DARKEN),
    shadow: withAlpha(accent, ACCENT_SHADOW),
    onAccent,
    onAccentIsInk: onAccent !== palette.onAccent,
  };
}
