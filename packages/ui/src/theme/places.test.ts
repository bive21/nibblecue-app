/**
 * A place's two colors, and the one thing about the icon square that is a measurement: the
 * owner's artwork sits on it, the artwork does not recolor with the theme, and a square deep
 * enough to lose the drawing's outline is a square that has taken the picture away.
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import {
  PLACE_ART_INK,
  PLACE_ART_MIN,
  PLACE_ART_PAPER,
  PLACE_SQUARE_DEPTH,
  placeSquare,
  placeTone,
  type PlaceKind,
} from './placeTones';
import { themes } from './theme';

const KINDS: readonly PlaceKind[] = ['ROOM', 'THAWED', 'FRIDGE', 'FREEZER', 'DEEP_FREEZER'];

describe('the icon square', () => {
  /**
   * ONE DEPTH, THE SAME FOR EVERY PLACE (the owner, 2026-09-20: *"the background color does not
   * make it look very nice"*). It was a five-step ramp that deepened with the temperature, which
   * the PALETTE already encodes — ochre, teal, blue, violet — so the ramp bought a second copy of
   * that sequence and paid for it in mid-tones.
   *
   * A PASTEL SINCE 2026-09-22 (*"change the solid icon background color to lighter color. This
   * one you selected too dark"*): the answer to the ramp was one depth, not necessarily the
   * deepest one, and 1.0 put a saturated tile beside a page of pale surfaces. What this holds is
   * the shape of the rule — one depth, a real tint, the thaw equal to the fridge — and the two
   * measurements below hold whether the number is any good.
   */
  it('is one pastel of each place’s hue, the same depth for every place', () => {
    expect(PLACE_SQUARE_DEPTH).toBeGreaterThan(0.15);
    expect(PLACE_SQUARE_DEPTH).toBeLessThan(0.5);
    for (const kind of KINDS)
      // a tint of the hue, never the hue itself: that was the tile the owner called too dark
      expect(placeSquare(themes.light, kind).toLowerCase(), kind).not.toBe(
        placeTone(themes.light, kind).fg.toLowerCase(),
      );
    // and a thawing bag is the fridge's teal exactly, which is what ROLE has always said it is
    expect(placeSquare(themes.light, 'THAWED')).toBe(placeSquare(themes.light, 'FRIDGE'));
  });

  it('is a real fraction of the hue, not the wash a name sits on', () => {
    for (const kind of KINDS) {
      const square = placeSquare(themes.light, kind);
      const soft = placeTone(themes.light, kind).soft;
      // every square is further from the card than the `soft` wash it replaced
      expect(contrastRatio(square, themes.light.surfaceSolid), kind).toBeGreaterThan(
        contrastRatio(soft, themes.light.surfaceSolid),
      );
    }
  });

  it('is opaque in every theme — a square sits on a card, a ground and a sheet alike', () => {
    for (const name of ['light', 'dark', 'night'] as const)
      for (const kind of KINDS)
        expect(placeSquare(themes[name], kind), `${name}/${kind}`).toMatch(/^#[0-9a-f]{6}$/i);
  });

  /**
   * THE ARTWORK CANNOT MOVE, so the ground under it has to answer for itself. This is the
   * assertion that makes a full-strength square safe.
   *
   * It is an EITHER/OR and not a single floor, because the owner's drawings are not one ink:
   * each is a pale fill inside a dark outline. The square that would lose the picture is the
   * mid-tone close to BOTH — so what has to hold is that at least one of the two still clears,
   * in every theme.
   */
  it('never lands on a tone that loses both halves of the drawing', () => {
    for (const name of ['light', 'dark', 'night'] as const)
      for (const kind of KINDS) {
        const square = placeSquare(themes[name], kind);
        const best = Math.max(
          contrastRatio(PLACE_ART_INK, square),
          contrastRatio(PLACE_ART_PAPER, square),
        );
        expect(best, `${name}/${kind}`).toBeGreaterThanOrEqual(PLACE_ART_MIN);
      }
  });

  /**
   * AND WHICH HALF CARRIES IT IS THE THEME'S, not the place's. The light theme's place hues are
   * deep, so the drawing's white fills carry the shape on all five; the dark and night themes'
   * are light, so the outline does. That is one rule per theme rather than a crossover partway
   * down a list, which is what the ramp used to be.
   */
  it('hands the drawing to the same half on every place within a theme', () => {
    const carrier = (theme: 'light' | 'dark' | 'night', kind: PlaceKind): 'fills' | 'outline' => {
      const square = placeSquare(themes[theme], kind);
      return contrastRatio(PLACE_ART_PAPER, square) > contrastRatio(PLACE_ART_INK, square)
        ? 'fills'
        : 'outline';
    };
    for (const name of ['light', 'dark', 'night'] as const) {
      const carriers = new Set(KINDS.map(k => carrier(name, k)));
      expect(carriers.size, name).toBe(1);
    }
    /*
      BOTH HALVES SWAPPED WHEN THE SQUARE BECAME A PASTEL, which is the opposite of what a
      lighter tile sounds like it should do and is worth writing down rather than rediscovering.
      A tint is a composite over the CARD, and the card is what differs between themes: 24% of a
      deep hue over the light theme's white card is pale, so the drawing's dark outline carries
      it; the same 24% over the dark and night themes' near-black cards is DARK, so the white
      fills do. One carrier per theme either way — the property above — with the two sides of
      the list changing places.
    */
    expect(carrier('light', 'ROOM')).toBe('outline');
    expect(carrier('dark', 'ROOM')).toBe('fills');
  });

  it('leaves a kind it does not know exactly as it was', () => {
    expect(placeSquare(themes.light, 'A_LATER_KIND')).toBe(
      placeTone(themes.light, 'A_LATER_KIND').soft,
    );
    expect(placeSquare(themes.light, null)).toBe(placeTone(themes.light, null).soft);
  });
});
