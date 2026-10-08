/**
 * THE BOX AROUND A NUMBER THAT CAN BE TYPED (`TYPED_BOX` in stepperMath).
 *
 * TWICE REDRAWN ON ONE DAY. The owner, 2026-09-26, first: *"why is the finish logging time and oz
 * have underline on the number?"* — the dotted rule under a typeable number (Android drew it solid,
 * a stray underline) became a small field with a one-point `text3` edge. Then, of that edge: *"the
 * border on it feels not very nice, either make it darker or just remove or redesign, your call."*
 *
 * REMOVED, AND THE FIELD MADE SOFT. A darker edge would have been a box drawn round every number on
 * a sheet — a form from 2005, and the loudest line near the number it frames. Now the number stands
 * in a SOFT FILLED WELL: the page's own `text` ink at `TYPED_FILL_ALPHA` over whatever it lands on,
 * so it is a step darker than its ground in light, a step lighter in dark and in the amber Night —
 * the filled field both platforms use (a search field, a Material filled field) — with no edge at
 * rest. Only while the number is being typed where it stands (the ruler) does an edge appear: the
 * `accent`, `TYPED_BOX.focus` wide, drawn INSIDE the box's air so nothing moves, as a focused
 * `Input`'s edge is.
 *
 * MEASURED, because a fill this soft is the one thing the eye will swear is there when it is not
 * (`typedBox.test.ts`, 3 themes × 6 schemes × 3 skins, blurred and opaque, on the sheet, on a card,
 * on the growth sheet's measurement boxes and a card in one): the fill stands at least
 * `TYPED_FILL_STEP` off every ground it lands on and never more than a soft step; the number (`text`)
 * and its unit (`text2`) clear 4.5:1 on it — the unit is what caps the alpha: at 9% `text2` falls to
 * 4.49:1 on the palest ground; the focused edge clears 3:1 against the fill and the ground round it.
 *
 * NOTHING GLOWS: the fill is flat, the roles are the night palette's own in the amber Night, and
 * there is no edge to light.
 */
import { withAlpha } from './contrast';
import type { Palette } from './theme';

/** How much of the page's own ink the well is: the most the unit beside the number allows. */
export const TYPED_FILL_ALPHA = 0.08;
/** The least the well stands off any ground it is drawn on, as a contrast ratio. */
export const TYPED_FILL_STEP = 1.15;

export interface TypedBoxPaint {
  /** The well: the page's ink, a step over whatever is under it (translucent on purpose). */
  fill: string;
  /** The edge while the number is typed where it stands: the text field's own focused edge. */
  focus: string;
}

/** The box's paint from a resolved palette (`useTheme().color`). Pure, so a test reads it too. */
export function typedBoxPaint(palette: Palette): TypedBoxPaint {
  return { fill: withAlpha(palette.text, TYPED_FILL_ALPHA), focus: palette.accent };
}
