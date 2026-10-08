/**
 * THE BIG NUMBER ON REPORTS' LEAD CARDS — "7", "13h 20m", "18 oz" (2026-09-26; the owner asked for
 * the page to lead with plain sentences and big numbers). How wide it is drawn, pure, so the app can
 * prove in node that it is never broken over two lines or cut, on the narrowest phone at the largest
 * text a reader can pick.
 *
 * IT IS `display` — the mono face at 31 — WITH ITS LETTERS SMALL: the digits big in the module's
 * hue, a length's `h` and `m` and a volume's unit at `meta` in the quiet ink, the way `StatTable`
 * and a stepper's readout already draw a length (`statValueRuns`). That is also what keeps a
 * newborn's "15h 20m" whole: seven characters at 31 pt are 130 pt, and at the reader's largest type
 * 208 — nearly all of a 320 pt phone's text column — where its four digits and two small letters
 * are 96 pt and 154.
 */
import { type as typeScale } from '../theme/theme';
import { ADVANCE } from './quickScale';
import { statValueRuns } from './statTable';

export const LEAD_FIGURE = {
  /** The digits: `display`, IBM Plex Mono SemiBold. */
  big: typeScale.display.fontSize,
  /** A figure's letters, its unit and the space before them: `meta`, the same face. */
  small: typeScale.meta.fontSize,
} as const;

/** How wide a lead figure is at a scale of 1: its digits big, everything else small, all mono. */
export function leadFigureWidth(value: string): number {
  return statValueRuns(value).reduce(
    (w, run) =>
      w +
      [...run.text].length *
        ADVANCE.mono *
        (run.kind === 'big' ? LEAD_FIGURE.big : LEAD_FIGURE.small),
    0,
  );
}

/** How far a lead figure is drawn smaller to stay one line in `room` points: 1 when it need not be. */
export function leadFigureFit(room: number, value: string, scale: number): number {
  const width = leadFigureWidth(value) * scale;
  if (!(width > 0)) return 1;
  if (!(room > 0)) return 0;
  return Math.min(1, room / width);
}
