/**
 * "A color is a color ON A GROUND" (docs/DESIGN_SYSTEM.md §12 rule 1) and "if a hue cannot
 * survive that, take a dark ink instead — do not keep it and hope" (rule 4). The token gate
 * verifies a category hue on its soft companion only as a GLYPH (3:1); the moment a control
 * puts a letter on that ground — a badge, an avatar initial — it needs 4.5:1 (rule 6), which
 * `milk` on `milkSoft` misses in the light theme. So a filled control measures its own ink and
 * falls back to the text ink rather than shipping a pair that reads on a desk and not at 3 a.m.
 *
 * Pure: no React, no React Native, so the invariant is unit-tested over every theme × scheme.
 */
import { AA_TEXT, contrastRatio } from '../theme/contrast';

/**
 * `preferred` when it clears `floor` (AA text by default) on an OPAQUE `fill`, otherwise
 * `fallback`. Composite a translucent fill over its ground before asking; luminance ignores
 * alpha, so a translucent value would be measured as if it were opaque.
 */
export function readableInk(
  preferred: string,
  fill: string,
  fallback: string,
  floor: number = AA_TEXT,
): string {
  return contrastRatio(preferred, fill) >= floor ? preferred : fallback;
}
