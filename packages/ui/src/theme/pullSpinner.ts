/**
 * THE REFRESH SPINNER'S COLORS, when a page is pulled down to sync (Today, 2026-09-26). The spinner
 * is the platform's own — iOS turns it on the page itself, Android on a small disc of its own — and
 * only its colors are the theme's: the accent's ink by day and in dark, the one the tab bar's
 * current tab is drawn in; the night palette's `text2` in the amber Night, where a scheme's accent
 * can be a blue (`resolvePalette` hands it through) and nothing should be lit. Android's disc is the
 * solid surface, so the spinner is a small card of the app's own.
 *
 * Measured in `pullSpinner.test.ts`: the ink at 3:1 or better — a graphic that says "working" — on
 * the disc, and on every ground a page can put under iOS's spinner, in all six schemes and all
 * three themes.
 */
import type { Palette, ThemeName } from './theme';

export interface PullSpinnerColors {
  /** The spinner itself: iOS's `tintColor`, Android's `colors`. */
  ink: string;
  /** Android's disc behind it (`progressBackgroundColor`). */
  disc: string;
}

export const pullSpinnerColors = (p: Palette, theme: ThemeName): PullSpinnerColors => ({
  ink: theme === 'night' ? p.text2 : p.accent2,
  disc: p.surfaceSolid,
});
