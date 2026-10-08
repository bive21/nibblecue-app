/**
 * THE RULER'S COLORS (`NumberRuler`; the owner, 2026-09-26: entering an amount or a length was "very
 * repetitive"). A ruler is marks on a strip, and every mark is a GRAPHIC the parent has to see to
 * aim with — so each one is a palette role, measured on the one ground it is ever drawn on, in all
 * three themes and all six schemes (`ruler.test.ts`):
 *
 *   track    the strip, `surface2` — solid, so what lands on it is known exactly, and the same
 *            ground the box stepper's squares were drawn on;
 *   minor    a step's tick, `text3`: quiet, and still 3:1 (a graphic) on the track;
 *   major    a labelled tick and its number, `text2`: the number is TEXT, so 4.5:1;
 *   needle   the value's mark in the middle, the scheme's `accent`: 3:1 on the track, and the one
 *            thing on the strip in a hue, so it is never mistaken for a tick. It is also longer and
 *            thicker than any tick, so the hue is never the only thing that says which it is;
 *   chosen   the number the needle stands on, on a count's line (`countLineX`), in `text`: the
 *            page's full ink, a step darker than the other numbers, so the chosen one is read
 *            without looking for the needle, and never by the hue alone.
 *
 * NOTHING GLOWS. In the amber Night the roles are the night palette's own and the needle is a flat
 * bar like every other mark — there is no shadow, no halo and no light anywhere on the strip.
 */
import type { Palette } from './theme';

export interface RulerPaint {
  track: string;
  minor: string;
  major: string;
  label: string;
  needle: string;
  chosen: string;
}

/** The ruler's paint from a resolved palette (`useTheme().color`). Pure, so a test reads it too. */
export function rulerPaintFor(palette: Palette, soft = false): RulerPaint {
  // SOFT (the pump's amount, 2026-10-06: "softer and one with the background … to not overcrowd the
  // page"): the strip is the page's own white and the scale a step quieter; the needle keeps its hue
  if (soft)
    return {
      track: palette.surfaceSolid,
      minor: palette.line2,
      major: palette.text3,
      label: palette.text3,
      needle: palette.accent,
      chosen: palette.text,
    };
  return {
    track: palette.surface2,
    minor: palette.text3,
    major: palette.text2,
    label: palette.text2,
    needle: palette.accent,
    chosen: palette.text,
  };
}
