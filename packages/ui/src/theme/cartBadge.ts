/**
 * THE CART BADGE'S COLORS (`CartBadge`; the owner, 2026-09-26: *"the cart has no count badge ...
 * add this feature"*) — every one a role of the palette the page is already painted from, so it
 * takes the six schemes, dark and the amber Night without a color of its own.
 *
 * A NUMBER ON THE ACCENT, in the ink the accent's own buttons carry (`deriveAccent`'s `onAccent`:
 * the palette's `onAccent`, or its body text where that does not reach 4.5:1 on the scheme's
 * accent). It is the top bar's notification badge in the Supplies page's colors, and the same rule
 * holds it: a digit is text, so 4.5:1 (§12 rule 6), measured in node for every theme and scheme
 * (`cartBadge.test.ts`). The RING is the ground the badge's corner sits over — the card's tint on
 * Supplies — so the badge reads as a disc of its own over the cart square's corner rather than a
 * blot joined to it; the fill is measured against that ground at 3:1, as a graphic.
 */
import { deriveAccent } from './accent';
import type { Palette } from './theme';

export interface CartBadgeColors {
  /** The disc. */
  fill: string;
  /** The digits on it: 4.5:1 on `fill`. */
  ink: string;
  /** The keyline round the disc: the ground the badge sits over. */
  ring: string;
}

export function cartBadgeColors(p: Palette, ground: string): CartBadgeColors {
  const a = deriveAccent(p);
  return { fill: a.accent, ink: a.onAccent, ring: ground };
}
