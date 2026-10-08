/**
 * THE RUNNING TIMERS' SMALL MOVES — THEIR COLORS (the owner, 2026-09-26: the hold-to-stop ring and
 * the nap's "z"s). They live here, in `theme/`, because a color is a measured value and a
 * component may not write one (eslint).
 *
 * THE HOLD RING AND ITS HINT are the palette's, on the stop button's own surface:
 *
 *   - the ring is the ACCENT in light and dark — the household's own color, closing round the
 *     button — and the amber TEXT ink in Night, which draws from the night palette only (a scheme's
 *     accent reaches Night, and it can be a teal; nothing blue belongs in a dark room);
 *   - its track, while a finger is down, is the same ink at `HOLD_RING.track`;
 *   - "Hold to stop" is the text ink on the solid surface with the `line2` hairline — the pair the
 *     button's own caption is drawn in, so it reads wherever the button does.
 *
 * `timerMotion.test.ts` measures the ring at 3:1 against the button in every scheme and theme,
 * over the solid surface AND over the translucent one a picture shows through (`PILL_OVER_ART_ALPHA`,
 * at the brightest and darkest pixel the pictures put under it), and the hint at 4.5:1.
 *
 * THE NAP'S "Z"S take no color from here: they are drawn over the owner's picture in the
 * picture's own deepest hue (`CardArt.veilColor`, measured from the file by `render-card-art.mjs`),
 * and the app measures them against its pixels (`apps/mobile/src/ui/cardArtParts.test.ts`). The
 * pump's two bottles, whose colors lived here, are gone (2026-09-26, the owner: *"the pumping
 * animation doesnot mean much, you can remove this"*).
 */
import { withAlpha } from './contrast';
import { accentInk, moduleSoft } from './moduleAccent';
import type { TintModule } from './moduleButton';
import type { Palette, ThemeName } from './theme';

/* --------------------------------------------------------------------------- hold to stop */

export interface StopHoldColors {
  ring: string;
  track: string;
  hintGround: string;
  hintInk: string;
  hintEdge: string;
}

/** The ring's share of its own ink while it waits under a finger (`HOLD_RING.track`). */
const TRACK_ALPHA = 0.2;

export const stopHoldColors = (
  p: Palette,
  theme: ThemeName,
  /** The timer's own module: the ring is its deep color, wherever the button sits (2026-10-08). */
  module?: TintModule,
): StopHoldColors => {
  /*
    ON A LOG SHEET THE ACCENT IS THE MODULE'S PASTEL FILL (the pump's soft green), and a ring in it
    barely showed under a finger (the owner, 2026-10-08: "the green is too soft … change it to dark
    green"). The ring is ink, so it takes the accent as ink (`accentInk`): the module's deep color
    there, and a scheme's accent, which already reads, everywhere else.
  */
  // AND A TIMER'S RING IS ITS MODULE'S DEEP COLOR, wherever the button is drawn (the owner,
  // 2026-10-08: "why does the darker pumping color show as theme color now? it should be in darker
  // module color"): on Today the page's accent is the household's scheme, not the pump's green
  const ring =
    theme === 'night'
      ? p.text
      : module !== undefined
        ? moduleSoft(p, module, theme).deep
        : accentInk(p);
  return {
    ring,
    track: withAlpha(ring, TRACK_ALPHA),
    hintGround: p.surfaceSolid,
    hintInk: p.text,
    hintEdge: p.line2,
  };
};
