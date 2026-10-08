/**
 * THE EMPTY SHOPPING LIST'S PICTURE, as numbers (the owner, 2026-09-26: *"add animation in
 * shopping list to make it more fun"* — and for the list with nothing on it, a friendly picture
 * rather than a lone 28 pt glyph). `EmptyCart.tsx` draws it; `emptyCart.test.ts` holds it.
 *
 * AN EMPTY CART, BECAUSE THE LIST IS EMPTY. A cart full of things would be the one picture that is
 * untrue about this screen. What it shows instead is the next thing to do: a bottle over the cart,
 * tipped toward it, with a dotted path from it down into the basket — the same throw the Supplies
 * page makes when a parent taps + (`cartFlight.ts`), and the same words the empty state already
 * says, "Start from your supplies". Two small sparkles, and a soft disc of the household's own
 * color behind it all.
 *
 * BUILT FROM THE ICON SET, NOT A PICTURE FILE: the cart, the bottle and the sparkles are the set's
 * own `cart`, `bottle` and `plus` drawings, placed and sized here and inked from the palette. The
 * owner's illustrated bottle is not used — it is a finished picture that cannot take the amber
 * Night's colors (`illustrated.ts`), and this one is drawn in every theme from the theme's own
 * inks: the cart and the sparkles in the accent, the bottle and its path in the bottle's own
 * module ink, the disc in the accent's tint. Nothing in it moves, in any theme.
 */

/** The picture's box, in points. It stands where the empty state's 28 pt glyph stood. */
export const EMPTY_CART_BOX = { width: 120, height: 96 } as const;

/** The icon set's grid: every glyph is drawn in a 24 box (`paths.ts`). */
export const GLYPH_GRID = 24;

/** One glyph, placed: its box's top left, its size, its stroke on the grid, and a turn about its center. */
export interface PlacedGlyph {
  x: number;
  y: number;
  size: number;
  stroke: number;
  turn: number;
}

export interface EmptyCartArt {
  /** The soft disc behind it all. */
  disc: { cx: number; cy: number; r: number };
  cart: PlacedGlyph;
  bottle: PlacedGlyph;
  /** The dotted path from the bottle down into the basket: a cubic, and its dots. */
  path: {
    from: readonly [number, number];
    c1: readonly [number, number];
    c2: readonly [number, number];
    to: readonly [number, number];
  };
  pathStroke: number;
  pathDash: readonly [number, number];
  sparkles: readonly PlacedGlyph[];
}

export const EMPTY_CART: EmptyCartArt = {
  disc: { cx: 60, cy: 52, r: 40 },
  cart: { x: 26, y: 26, size: 64, stroke: 1.35, turn: 0 },
  bottle: { x: 60, y: 5, size: 22, stroke: 1.7, turn: 22 },
  path: { from: [62, 30.5], c1: [57, 36], c2: [53, 40], to: [51.5, 45] },
  pathStroke: 2.2,
  // a dash of nothing and a round cap is a dot: one every 5.2 pt
  pathDash: [0.1, 5.2],
  sparkles: [
    { x: 90, y: 26, size: 9, stroke: 2.2, turn: 0 },
    { x: 30, y: 20, size: 6, stroke: 2.6, turn: 0 },
  ],
};

/** The path's SVG data. */
export const emptyCartPath = (a: EmptyCartArt = EMPTY_CART): string => {
  const { from, c1, c2, to } = a.path;
  return `M${from[0]} ${from[1]}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${to[0]} ${to[1]}`;
};

/** A glyph's transform, in the picture's points: moved to its box, scaled from the grid, turned about its center. */
export const glyphTransform = (g: PlacedGlyph): string => {
  const half = g.size / 2;
  const turn = g.turn === 0 ? '' : ` rotate(${g.turn} ${half} ${half})`;
  return `translate(${g.x} ${g.y})${turn} scale(${g.size / GLYPH_GRID})`;
};

/**
 * THE CART'S BASKET, in the picture's points: the `cart` glyph's rim runs from (6.4, 7.3) to
 * (19.5, 7.3) on its grid and its floor is at 14.7 (`paths.ts`, `M3 4.5h2.2l2.3 10.2h9.9l2.1-7.4H6.4`).
 * The dotted path ends in the basket, just over the rim.
 */
export function basketOf(g: PlacedGlyph = EMPTY_CART.cart): {
  rim: number;
  floor: number;
  left: number;
  right: number;
} {
  const unit = g.size / GLYPH_GRID;
  return {
    rim: g.y + 7.3 * unit,
    floor: g.y + 14.7 * unit,
    left: g.x + 6.4 * unit,
    right: g.x + 19.5 * unit,
  };
}
