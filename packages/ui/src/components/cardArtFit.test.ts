import { describe, expect, it } from 'vitest';
import {
  anchoredCover,
  anchoredWindow,
  artFit,
  illustrationVisible,
  type Rect,
} from './cardArtFit';

/**
 * The owner's four backgrounds at their rendered sizes (`cardArt.generated.ts` holds the same
 * numbers on the app side; these are copied rather than imported because packages/ui may not
 * reach into apps/).
 */
const ART = {
  breastfeed: { width: 1280, height: 576 },
  sleep: { width: 1280, height: 373 },
  stash: { width: 1280, height: 320 },
  shopping: { width: 1280, height: 320 },
} satisfies Record<string, Rect>;

/** Where the plain gradient stops and the drawing starts, in all four. */
const ILLUSTRATION_FROM = 0.62;
/** The measured content column per card — the app never puts a word past its own. */
const CONTENT_FRACTION = {
  breastfeed: 0.52,
  sleep: 0.62,
  stash: 0.72,
  shopping: 0.72,
} satisfies Record<keyof typeof ART, number>;

/** Screen widths the app supports, less the screen's 16 pt gutters. */
const CARD_WIDTHS = [320, 360, 375, 390, 393, 412, 430, 448].map(w => w - 32);
/** Each card at ordinary type and at 200%, where a text-height card nearly doubles. */
const CARD_HEIGHTS = {
  breastfeed: [160, 300],
  sleep: [120, 230],
  stash: [104, 200],
  shopping: [86, 170],
};

describe('the centered cover the cards used to draw with — the comparison', () => {
  /**
   * WHAT CENTERING BOUGHT, recorded because it was given up on purpose: under a centered cover
   * the middle of the card is always the middle of the picture, so the card's left half always
   * shows the picture's left half — where the ink was measured — and no crop can move the words
   * onto the drawing. The price was the drawing itself: on a card taller than its picture the
   * crop comes off BOTH sides, and the right side is where the mother and the milk bags are.
   * The owner looked at that and chose the drawing (`anchoredCover`, below).
   */
  it('kept the card’s content column on the art’s content column, whatever the phone', () => {
    for (const [slot, art] of Object.entries(ART))
      for (const width of CARD_WIDTHS)
        for (const height of CARD_HEIGHTS[slot as keyof typeof CARD_HEIGHTS]) {
          const fit = artFit({ width, height }, art);
          // the card's own midpoint, expressed in the art's coordinates
          const middle = fit.from + fit.visibleWidth / 2;
          expect(middle, `${slot} ${width}×${height}`).toBeCloseTo(0.5, 6);
          // and so the end of the content column lands no further right than the measured band.
          // It is the crop that makes this true for free: a narrower window is a window whose
          // own fraction of the ART is smaller, so the words move LEFT into safer pixels, never
          // right onto the drawing.
          const band = CONTENT_FRACTION[slot as keyof typeof CONTENT_FRACTION];
          const contentEnds = fit.from + fit.visibleWidth * band;
          expect(contentEnds, `${slot} ${width}×${height}`).toBeLessThanOrEqual(band + 1e-9);
        }
  });

  /** And what it cost the drawing — the numbers the owner's phone was showing. */
  it('lost the right edge of the drawing on every card taller than its picture', () => {
    const at = (slot: keyof typeof ART, width: number, height: number) =>
      illustrationVisible(artFit({ width, height }, ART[slot]), ILLUSTRATION_FROM);

    // a 390 pt phone, the middle of the range, at ordinary type: all of it or nearly
    expect(at('breastfeed', 358, 160)).toBe(1);
    expect(at('sleep', 358, 120)).toBeGreaterThan(0.8);
    expect(at('stash', 358, 104)).toBeGreaterThan(0.8);
    expect(at('shopping', 358, 86)).toBe(1);

    // the smallest phone the app supports, ordinary type: the edges go, the subject stays
    expect(at('breastfeed', 288, 160)).toBeGreaterThan(0.7);
    expect(at('sleep', 288, 120)).toBeGreaterThan(0.55);

    // and 200% type on that phone is where it becomes a gradient with a hint of a drawing
    expect(at('breastfeed', 288, 300)).toBeGreaterThan(0.2);
    expect(at('stash', 288, 200)).toBeGreaterThan(0.1);
  });

  it('never letterboxes: one axis is always full', () => {
    for (const [slot, art] of Object.entries(ART))
      for (const width of CARD_WIDTHS)
        for (const height of CARD_HEIGHTS[slot as keyof typeof CARD_HEIGHTS]) {
          const fit = artFit({ width, height }, art);
          expect(
            Math.max(fit.visibleWidth, fit.visibleHeight),
            `${slot} ${width}×${height}`,
          ).toBeCloseTo(1, 6);
        }
  });

  it('a degenerate box shows everything rather than dividing by zero', () => {
    expect(artFit({ width: 0, height: 0 }, ART.stash)).toEqual({
      visibleWidth: 1,
      visibleHeight: 1,
      from: 0,
      to: 1,
    });
    expect(illustrationVisible({ visibleWidth: 1, visibleHeight: 1, from: 0, to: 1 }, 1)).toBe(1);
  });
});

/**
 * THE PLACEMENT IS IN NUMBERS, held as a test because the alternative looks simpler.
 *
 * React Native composes an <Image>'s style as `[{width, height} from the asset, base, yours]`,
 * so a style that only sets the four edges — `StyleSheet.absoluteFill` — leaves the picture at
 * its own pixel size: a 1280 px PNG laid out 1280 dp wide inside a 360 dp card, clipped, showing
 * its top-left corner at three times life. That is what the owner's phone showed for an
 * afternoon (2026-09-18): four cards wearing their old flat tints, with the illustration a
 * thousand points off the right edge. The component cannot be rendered in this workspace, so the
 * source is read instead — the same way the brand and copy gates read theirs.
 */
describe('the picture layer', () => {
  it('measures its box and places the image from anchoredCover, never from absoluteFill', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'CardArtLayer.tsx'), 'utf8');
    expect(src).toMatch(/onLayout=\{onLayout\}/);
    expect(src).toMatch(
      /anchoredCover\(box, \{ width: art\.width, height: art\.height \}, place \?\? \{\}\)/,
    );
    expect(src).toMatch(/style=\{\[styles\.picture, placed,/);
    expect(src).not.toMatch(/<Image[^>]*StyleSheet\.absoluteFill/);
  });
});

/**
 * WHAT THE CARDS DRAW WITH NOW: the picture scaled to cover the box and pinned to its right edge.
 * Whatever the card's shape, the drawing — the right third of every one of these artworks — is
 * on screen whole, and the crop, when there is one, comes out of the plain gradient on the left.
 */
describe('anchoredCover, over the owner’s artwork', () => {
  it('always puts the art’s right edge on the card’s right edge', () => {
    for (const [slot, art] of Object.entries(ART))
      for (const width of CARD_WIDTHS)
        for (const height of CARD_HEIGHTS[slot as keyof typeof CARD_HEIGHTS]) {
          const box = anchoredCover({ width, height }, art);
          expect(box.left + box.width, `${slot} ${width}×${height}`).toBeCloseTo(width, 6);
          // and never leaves a gap on either axis
          expect(box.width, `${slot} ${width}×${height}`).toBeGreaterThanOrEqual(width - 1e-6);
          expect(box.height, `${slot} ${width}×${height}`).toBeGreaterThanOrEqual(height - 1e-6);
          expect(box.top, `${slot} ${width}×${height}`).toBeLessThanOrEqual(1e-6);
        }
  });

  /**
   * THE DRAWING IS WHOLE — the thing the owner asked for, as an assertion. The window that
   * survives is `[1 − visible, 1]` and the drawing lives in `[ILLUSTRATION_FROM, 1]`, so it is
   * whole whenever the window is wider than the drawing. That is every supported card at
   * ordinary type. At 200% type on the narrowest phone the window is a hair narrower than the
   * drawing on three of the four — 36% of the art against a drawing that is 38% of it — and
   * about 5% of the cloud's, the bags' and the basket's left edge goes. Stated as the number it
   * is rather than rounded up to "always".
   */
  it('shows the whole drawing at ordinary type on every phone, and 94% of it at 200%', () => {
    for (const [slot, art] of Object.entries(ART)) {
      const [ordinary, large] = CARD_HEIGHTS[slot as keyof typeof CARD_HEIGHTS] as [number, number];
      for (const width of CARD_WIDTHS) {
        const at = (height: number) => {
          const w = anchoredWindow({ width, height }, art);
          expect(w.to).toBe(1);
          return illustrationVisible(
            { visibleWidth: w.to - w.from, visibleHeight: 1, from: w.from, to: w.to },
            ILLUSTRATION_FROM,
          );
        };
        expect(at(ordinary), `${slot} ${width}×${ordinary}`).toBe(1);
        expect(at(large), `${slot} ${width}×${large}`).toBeGreaterThanOrEqual(0.94);
      }
    }
  });

  /**
   * AND WHAT IT COSTS THE WORDS, as the numbers rather than a reassurance. The content column is
   * capped in CARD coordinates, and a right-anchored window slides the art LEFT under it as the
   * card gets taller, so the column's end in art coordinates is `from + visible·cap` — further
   * right than the measured band whenever the card is taller than its picture. The worst case is
   * the narrowest phone at ordinary type, and this is where each card's column can reach there:
   *
   *   * rose, 0.62 — the gap between the hearts and the mother's hair, which is dark: the white
   *     ink is fine there, and the veil is still at strength.
   *   * teal, 0.74 — the cloud's left edge, under a fading veil: the one soft spot, and the
   *     sleep card's lines are the shortest in the app ("Started 11:22 AM").
   *   * yellow, 0.81 and green, 0.77 — over the milk bags and the basket. These two take DARK
   *     ink on light drawings, and their cap is generous because a long location line has
   *     nowhere else to go; the owner's mockup runs the stash line to the bags too.
   *
   * Move a number and this fails, which is the point: a taller card, a narrower phone or a
   * wider cap changes where the words land, and that is a decision, not a drift.
   */
  it('lets the words reach exactly this far into the art on the narrowest phone', () => {
    const WORST_COLUMN_END = { breastfeed: 0.62, sleep: 0.74, stash: 0.81, shopping: 0.77 };
    for (const [slot, art] of Object.entries(ART)) {
      const key = slot as keyof typeof ART;
      const height = CARD_HEIGHTS[key][0] as number;
      let worst = 0;
      for (const width of CARD_WIDTHS) {
        const w = anchoredWindow({ width, height }, art);
        worst = Math.max(worst, w.from + (w.to - w.from) * CONTENT_FRACTION[key]);
      }
      expect(worst, slot).toBeLessThanOrEqual(WORST_COLUMN_END[key]);
      // and not a smaller number either: a cap that shrank quietly would be a card wrapping
      // its words for a reason nobody chose
      expect(worst, slot).toBeGreaterThan(WORST_COLUMN_END[key] - 0.03);
    }
  });

  it('a degenerate box draws nothing rather than dividing by zero', () => {
    expect(anchoredCover({ width: 0, height: 0 }, ART.stash)).toEqual({
      width: 0,
      height: 0,
      left: 0,
      top: 0,
    });
    expect(anchoredWindow({ width: 0, height: 0 }, ART.stash)).toEqual({ from: 0, to: 1 });
  });
});

/**
 * TODAY'S HALF-CARD STAMPS (the owner, 2026-10-05: *"made smaller and more to the right"*).
 * Cover-by-height on a nearly-square half zooms the bags and basket into the words. Width-fit
 * at 0.65, flushed right, keeps the illustration past the 72% content column.
 */
describe('anchoredCover width-fit for Today’s supply stamps', () => {
  const PLACE = { fit: 'width' as const, scale: 0.65 };
  const HALF_WIDTHS = CARD_WIDTHS.map(w => (w - 12) / 2); // row gap ≈ space.md
  const HALF_HEIGHTS = { stash: [104, 200], shopping: [86, 170] } as const;

  it('pins a smaller stamp to the right and leaves ground on the left', () => {
    for (const width of HALF_WIDTHS) {
      for (const height of HALF_HEIGHTS.stash) {
        const box = anchoredCover({ width, height }, ART.stash, PLACE);
        expect(box.left + box.width).toBeCloseTo(width, 6);
        expect(box.width).toBeCloseTo(width * 0.65, 6);
        expect(box.left).toBeGreaterThan(0);
        expect(box.height).toBeLessThan(height);
      }
    }
  });

  it('keeps the illustration clear of the 72% content column on every half-card', () => {
    const ILLUSTRATION_FROM_SUPPLY = 0.72; // measured contentFraction on stash / shopping
    for (const slot of ['stash', 'shopping'] as const) {
      for (const width of HALF_WIDTHS) {
        for (const height of HALF_HEIGHTS[slot]) {
          const box = anchoredCover({ width, height }, ART[slot], PLACE);
          const illustrationLeft = box.left + ILLUSTRATION_FROM_SUPPLY * box.width;
          expect(illustrationLeft / width, `${slot} ${width}×${height}`).toBeGreaterThanOrEqual(
            CONTENT_FRACTION[slot],
          );
        }
      }
    }
  });
});

describe('a stamp: the drawing small in the corner (2026-10-05)', () => {
  it('draws the drawing at the width asked, pinned to the bottom-right corner', () => {
    const box = { width: 175, height: 112 };
    const art = { width: 1280, height: 533 };
    const p = anchoredCover(box, art, { fit: 'stamp', stampWidth: 44, drawingFrom: 0.72 });
    // the drawing is the right 28% of the picture, so the picture is 44 / 0.28 wide
    expect(p.width).toBeCloseTo(44 / 0.28, 5);
    expect(p.width * 0.28).toBeCloseTo(44, 5);
    expect(p.left + p.width).toBeCloseTo(box.width, 5);
    expect(p.top + p.height).toBeCloseTo(box.height, 5);
    // only the right part of the card holds it
    expect(p.left).toBeGreaterThan(box.width * 0.05);
  });

  it('may run past the card’s left edge, clipped, but never past twice its width (2026-10-06)', () => {
    const p = anchoredCover(
      { width: 100, height: 80 },
      { width: 1280, height: 320 },
      {
        fit: 'stamp',
        stampWidth: 90,
        drawingFrom: 0.7,
      },
    );
    expect(p.width).toBeLessThanOrEqual(200);
    expect(p.left + p.width).toBeCloseTo(100, 5);
  });
});
