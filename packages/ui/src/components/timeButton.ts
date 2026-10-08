/**
 * A TIME YOU TAP TO CHANGE, as numbers and paint — what `TimeButton` draws (the owner, 2026-09-26,
 * of the medicine form's reminder times: *"let user know that 'at' is clickable"*). Pure, so it is
 * measured in node (`timeButton.test.ts`); the component only hands these to its views.
 *
 * THE TYPED BOX'S WELL, WITH A CLOCK IN THE ACCENT. A number a parent can tap to type already
 * stands in a soft well of the page's own ink (`theme/typedBox.ts`), so a time that can be tapped
 * stands in the same one — the app's one look for "this value can be changed". The clock before it,
 * in the accent, says what a tap changes and that it can be tapped at all. No underline (the owner
 * took the dotted rule off every typeable number on 2026-09-26: *"why is the finish logging time and
 * oz have underline on the number?"*) and no edge at rest (the same day, of the edge that replaced
 * it: *"the border on it feels not very nice"*).
 *
 * EVERY COLOR IS ALREADY MEASURED where the well is: the time is `text` (4.5:1 on the well), the
 * clock is the `accent` the well's focused edge is drawn in (3:1 on the well), on every ground a
 * sheet or a card can put under it, in every theme, scheme and design (`typedBox.test.ts`; held
 * again for this control in `timeButton.test.ts`). In the amber Night all three are its own roles.
 */
import { typedBoxPaint } from '../theme/typedBox';
import { space, type Palette } from '../theme/theme';

export const TIME_BUTTON = {
  /** The clock's size, in points: a glyph beside a 15 pt time, big enough to read as a clock. */
  glyph: 16,
  /** The box's air either side, and between the clock and the time. */
  padX: space.lg,
  gap: space.sm,
} as const;

export interface TimeButtonPaint {
  /** The typed box's well: the page's ink, a soft step over whatever is under it. */
  fill: string;
  /** The clock: the accent, as the well's focused edge is. */
  glyph: string;
  /** The time. */
  text: string;
}

/** The paint from a resolved palette (`useTheme().color`). */
export function timeButtonPaint(p: Palette): TimeButtonPaint {
  return { fill: typedBoxPaint(p).fill, glyph: p.accent, text: p.text };
}
