/**
 * THE CART BADGE'S COLORS, MEASURED (`cartBadge.ts`; the owner, 2026-09-26). The digits are text, so
 * 4.5:1 on the disc (§12 rule 6) — in every theme, the amber Night included, and every scheme. The
 * disc is a graphic, so 3:1 against the ground its keyline is drawn in (the Supplies card's tint,
 * `deriveAccent`'s `tint`) and against the cart square it overlaps (`surfaceSolid`), so it reads as
 * a disc on the cart's corner and never as a stain on the card.
 */
import { describe, expect, it } from 'vitest';
import { deriveAccent } from './accent';
import { cartBadgeColors } from './cartBadge';
import { AA_GRAPHIC, AA_TEXT, contrastRatio } from './contrast';
import { resolvePalette, schemes, themeNames, type SchemeName } from './theme';

const SCHEMES = Object.keys(schemes) as SchemeName[];

const CASES = themeNames.flatMap(theme =>
  SCHEMES.map(scheme => {
    const p = resolvePalette(theme, scheme);
    const card = deriveAccent(p).tint;
    return { at: `${theme}/${scheme}`, p, card, c: cartBadgeColors(p, card) };
  }),
);

describe('the cart badge', () => {
  it('covers every theme and every scheme', () => {
    expect(CASES).toHaveLength(themeNames.length * SCHEMES.length);
    expect(themeNames).toContain('night');
  });

  it('draws its digits at 4.5:1 on the disc, everywhere', () => {
    for (const { at, c } of CASES)
      expect(contrastRatio(c.ink, c.fill), `${at} digits`).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('is a disc of its own: 3:1 on the card it sits on and on the cart square it overlaps', () => {
    for (const { at, c, p } of CASES) {
      expect(contrastRatio(c.fill, c.ring), `${at} on the card`).toBeGreaterThanOrEqual(AA_GRAPHIC);
      expect(contrastRatio(c.fill, p.surfaceSolid), `${at} on the cart`).toBeGreaterThanOrEqual(
        AA_GRAPHIC,
      );
    }
  });

  it('paints from the palette the page is painted from, and nothing else', () => {
    for (const { c, p, card } of CASES) {
      const a = deriveAccent(p);
      expect(c).toEqual({ fill: a.accent, ink: a.onAccent, ring: card });
    }
  });
});
