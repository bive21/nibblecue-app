import { describe, expect, it } from 'vitest';
import { tileAlert, tileLine } from './quickLine';
import { ADVANCE, lineBudget, tileStride, tileWidth, TILE_PEEK, TILE_TRACKING } from './quickScale';

describe('the log row scrolls sideways', () => {
  it('leaves the next tile peeking, which is the only thing that says it slides', () => {
    // three whole tiles, their gaps, and a slice of the fourth: the row cannot look complete
    const w = tileWidth(331, 3, 10);
    const shown = 3 * w + 3 * 10;
    expect(shown).toBeLessThan(331);
    expect(331 - shown).toBeCloseTo(TILE_PEEK * w, 6);
    // and the slice is a tile's edge, not a sliver nobody reads as one
    expect(TILE_PEEK).toBeGreaterThan(0.1);
    expect(TILE_PEEK).toBeLessThan(0.4);
  });

  it('never returns a negative width, whatever the row is given', () => {
    expect(tileWidth(0, 3, 10)).toBe(0);
    expect(tileWidth(10, 3, 10)).toBe(0);
    expect(tileWidth(331, 0, 10)).toBe(0);
  });

  it('strides by a tile and the gap after it, so a tile never stops half-shown', () => {
    expect(tileStride(331, 3, 10)).toBeCloseTo(tileWidth(331, 3, 10) + 10, 6);
  });
});

/**
 * THE BUDGET IS THE THING THAT BROKE (quickScale.ts `lineBudget` has the account). The pill the
 * line sits in took `space.md` off each side of it and nothing lowered the character count to
 * match, so the pebble tiles in the owner's 2026-09-19 screenshot read `58m · 1.5…` and
 * `1h 1m · B…` — the ellipsis quickLine.ts exists to prevent.
 *
 * The widths below are the subtraction spelled out, in the tokens that produce them, on the
 * 390pt reference phone: screen − 2×18 gutter, + 2×4 for the grid's negative margin, ÷ 3
 * columns, − 2×4 cell padding, − 2×6 the pebble's own, − 2×`pill` the pill's, − 2 for the
 * card's border.
 */
const pebbleText = (screen: number, pill: number): number =>
  (screen - 2 * 18 + 2 * 4) / 3 - 2 * 4 - 2 * 6 - 2 * pill - 2;

const META = 12;

describe('how many characters a tile line holds', () => {
  it('is the arithmetic that the old constant only remembered', () => {
    // what shipped: a pill of `space.md` and no tracking — eleven characters of room for a
    // twelve-character line, which is the screenshot
    expect(lineBudget(pebbleText(390, 8), META, 'mono')).toBe(11);
    // what it is now: the pill at `space.sm`, the mono line tracked in
    expect(lineBudget(pebbleText(390, 6), META, 'mono', TILE_TRACKING)).toBe(12);
  });

  it('holds the two lines the owner photographed, whole', () => {
    const budget = lineBudget(pebbleText(390, 6), META, 'mono', TILE_TRACKING);
    expect(tileLine('58m', '1.5 oz', budget)).toBe('58m · 1.5 oz');
    expect(tileLine('1h 1m', 'Both', budget)).toBe('1h 1m · Both');
    expect(tileLine('12h', '3h 4m', budget)).toBe('12h · 3h 4m');
    for (const line of ['58m · 1.5 oz', '1h 1m · Both']) {
      // and they fit in points, not only in characters: 12 × (0.6 × 12 − 0.3) = 82.8
      expect(line.length * (META * ADVANCE.mono + TILE_TRACKING)).toBeLessThanOrEqual(
        pebbleText(390, 6),
      );
    }
  });

  it('keeps both facts on a narrower phone, where it used to keep one', () => {
    // 360pt: eleven characters, so the spaces round the middot go and the detail stays
    const budget = lineBudget(pebbleText(360, 6), META, 'mono', TILE_TRACKING);
    expect(budget).toBe(11);
    expect(tileLine('58m', '1.5 oz', budget)).toBe('58m·1.5 oz');
    expect(tileLine('1h 1m', 'Both', budget)).toBe('1h 1m·Both');
  });

  it('charges the proportional face its own width, not the monospace’s', () => {
    // "Never logged" is twelve characters the UI face sets in 72.0pt and the mono face in 86.4:
    // one budget for both shortens it to "Never" on a tile with room to spare, and it does it
    // on the 360pt phone where the room is tightest
    for (const screen of [390, 360]) {
      const w = pebbleText(screen, 6);
      expect(lineBudget(w, META, 'ui'), `${screen}`).toBeGreaterThanOrEqual(12);
      expect(tileAlert('never logged', 'never', lineBudget(w, META, 'ui'))).toBe('Never logged');
      // 12 × 0.500 em × 12px = 72.0, which is the width the face actually sets it in
      expect(12 * 0.5 * META).toBeLessThanOrEqual(w);
    }
    expect(ADVANCE.ui).toBeLessThan(ADVANCE.mono);
  });

  it('never returns a budget a line could overflow, and never a negative one', () => {
    expect(lineBudget(0, META)).toBe(0);
    expect(lineBudget(-10, META)).toBe(0);
    expect(lineBudget(1, META)).toBe(1);
    // a font scale narrows the budget, because the same box holds fewer bigger characters
    expect(lineBudget(pebbleText(390, 6), META * 1.6, 'mono', TILE_TRACKING)).toBeLessThan(
      lineBudget(pebbleText(390, 6), META, 'mono', TILE_TRACKING),
    );
  });
});
