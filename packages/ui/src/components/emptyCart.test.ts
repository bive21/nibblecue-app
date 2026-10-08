/**
 * THE EMPTY SHOPPING LIST'S PICTURE (the owner, 2026-09-26: *"add animation in shopping list to
 * make it more fun"*). Where everything in it is placed is PURE (`emptyCart.ts`) and held here; that
 * it is drawn from the icon set, in the palette's own inks, still, and out of reach of assistive
 * technology is held by tripwires over `EmptyCart.tsx`. It is shown in EVERY theme — the amber Night
 * included — so its inks are measured in all three, every scheme, every skin.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ICON_PATHS } from '../icons/paths';
import { CUSTOM_ICON_PATHS } from '../icons/paths.custom';
import { deriveAccent } from '../theme/accent';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_GRAPHIC, composite, contrastRatio } from '../theme/contrast';
import { materialBase, SKIN_NAMES } from '../theme/skins';
import { moduleColor, themeNames, type Palette } from '../theme/theme';
import {
  basketOf,
  EMPTY_CART,
  EMPTY_CART_BOX,
  emptyCartPath,
  GLYPH_GRID,
  glyphTransform,
  type PlacedGlyph,
} from './emptyCart';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('EmptyCart.tsx'));
const flat = component.replace(/\s+/g, ' ');

/** The four corners of a placed glyph's box, turned about its center as it is drawn. */
function corners(g: PlacedGlyph): [number, number][] {
  const c = [g.x + g.size / 2, g.y + g.size / 2];
  const r = (g.turn * Math.PI) / 180;
  return [
    [g.x, g.y],
    [g.x + g.size, g.y],
    [g.x + g.size, g.y + g.size],
    [g.x, g.y + g.size],
  ].map(([x, y]) => {
    const [dx, dy] = [(x ?? 0) - (c[0] ?? 0), (y ?? 0) - (c[1] ?? 0)];
    return [
      (c[0] ?? 0) + dx * Math.cos(r) - dy * Math.sin(r),
      (c[1] ?? 0) + dx * Math.sin(r) + dy * Math.cos(r),
    ];
  });
}

/** The glyph's own drawn extent on the grid, from its elements' coordinates. */
const inBox = ([x, y]: [number, number]) => {
  expect(x).toBeGreaterThanOrEqual(0);
  expect(x).toBeLessThanOrEqual(EMPTY_CART_BOX.width);
  expect(y).toBeGreaterThanOrEqual(0);
  expect(y).toBeLessThanOrEqual(EMPTY_CART_BOX.height);
};

describe('the picture', () => {
  it('stays inside its own box: the disc, every glyph turned as it is drawn, and the path', () => {
    const { cx, cy, r } = EMPTY_CART.disc;
    for (const p of [
      [cx - r, cy - r],
      [cx + r, cy + r],
    ] as [number, number][])
      inBox(p);
    for (const g of [EMPTY_CART.cart, EMPTY_CART.bottle, ...EMPTY_CART.sparkles])
      for (const p of corners(g)) inBox(p);
    const { from, c1, c2, to } = EMPTY_CART.path;
    for (const p of [from, c1, c2, to]) inBox([p[0], p[1]]);
  });

  it('is an EMPTY cart with the next thing on its way in: a bottle over it, a dotted path into the basket', () => {
    const basket = basketOf();
    const [ex, ey] = EMPTY_CART.path.to;
    // the path ends in the basket, just over its floor and between its sides
    expect(ex).toBeGreaterThan(basket.left);
    expect(ex).toBeLessThan(basket.right);
    expect(ey).toBeGreaterThan(basket.rim - 4);
    expect(ey).toBeLessThan(basket.floor);
    // and starts at the bottle, which is over the cart and above its rim
    const bottle = EMPTY_CART.bottle;
    expect(bottle.y + bottle.size).toBeLessThanOrEqual(basket.rim + 8);
    const [sx, sy] = EMPTY_CART.path.from;
    expect(sx).toBeGreaterThan(bottle.x);
    expect(sx).toBeLessThan(bottle.x + bottle.size);
    expect(sy).toBeGreaterThan(bottle.y);
    // the dots are dots: a dash of nothing, round-capped, a few points apart
    expect(EMPTY_CART.pathDash[0]).toBeLessThan(0.5);
    expect(EMPTY_CART.pathDash[1]).toBeGreaterThanOrEqual(4);
    expect(emptyCartPath()).toMatch(/^M[\d. ]+C[\d. ]+$/);
  });

  it('stands where the empty state’s glyph stood, bigger than it and no wider than the words', () => {
    expect(EMPTY_CART_BOX.width).toBeLessThanOrEqual(140);
    expect(EMPTY_CART_BOX.height).toBeLessThanOrEqual(110);
    expect(EMPTY_CART.cart.size).toBeGreaterThan(28);
  });

  it('draws the set’s own glyphs, scaled from their grid, turned about their middles', () => {
    for (const name of ['cart', 'bottle', 'plus'] as const)
      expect(CUSTOM_ICON_PATHS[name] ?? ICON_PATHS[name], name).toBeDefined();
    expect(glyphTransform(EMPTY_CART.cart)).toBe(`translate(26 26) scale(${64 / GLYPH_GRID})`);
    expect(glyphTransform(EMPTY_CART.bottle)).toBe(
      `translate(60 5) rotate(22 11 11) scale(${22 / GLYPH_GRID})`,
    );
  });
});

/**
 * THE INKS, MEASURED — every mark at 3:1 or better on what it is drawn over: the disc of the
 * accent's tint, and the empty state's own surface round it (solid, and in each skin's material over
 * the page), where the bottle and a sparkle reach past the disc. In light, dark AND the amber Night:
 * this picture is still, so it is drawn in Night too.
 */
describe('the inks', () => {
  it('draws the cart, the sparkles, the bottle and its path at 3:1 on every ground, in every look', () => {
    for (const skin of SKIN_NAMES)
      for (const scheme of SCHEME_NAMES)
        for (const theme of themeNames) {
          const r = resolveAppearance(
            { ...DEFAULT_APPEARANCE, theme, scheme, skin },
            'light',
            PLUS_APPEARANCE,
          );
          const c = r.palette;
          const s = r.skinTokens;
          const a = deriveAccent(c);
          const bottle = (c as Palette)[moduleColor.bottle];
          const grounds: Record<string, string> = {
            disc: a.tint,
            surfaceSolid: c.surfaceSolid,
            surfaceOnPaper: composite(c.paper, materialBase(c, s.surface), s.surface.alpha),
          };
          for (const [ink, color] of [
            ['cart and sparkles', a.accent],
            ['bottle and its path', bottle],
          ] as const)
            for (const [ground, bg] of Object.entries(grounds))
              expect(
                contrastRatio(color, bg),
                `${skin}/${scheme}/${theme}: ${ink} on ${ground}`,
              ).toBeGreaterThanOrEqual(AA_GRAPHIC);
        }
  });
});

describe('the component (tripwires over EmptyCart.tsx)', () => {
  it('is a picture beside words that say it all: out of reach of touch and assistive technology', () => {
    expect(flat).toContain(
      'pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden',
    );
    expect(component).not.toContain('<Pressable');
  });

  it('looks each glyph up as Icon does — the owner’s drawing first — and inks it from the palette', () => {
    expect(flat).toContain('const def: IconDef = CUSTOM_ICON_PATHS[name] ?? ICON_PATHS[name];');
    expect(flat).toContain(
      '<Circle cx={art.disc.cx} cy={art.disc.cy} r={art.disc.r} fill={a.tint} />',
    );
    expect(flat).toContain('<Glyph name="cart" at={art.cart} ink={a.accent} />');
    expect(flat).toContain('<Glyph name="bottle" at={art.bottle} ink={bottle.fg} />');
    expect(flat).toContain("const bottle = useCategory('bottle');");
    expect(component).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
    expect(component).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
  });

  it('is still in every theme: nothing in it moves', () => {
    expect(component).not.toContain('Animated');
    expect(component).not.toContain('useNativeDriver');
  });

  it('asks for nothing Expo Go does not carry', () => {
    for (const m of component.matchAll(/from '([^']+)'/g)) {
      const source = m[1] ?? '';
      expect(
        ['react-native', 'react-native-svg'].includes(source) || /^\./.test(source),
        source,
      ).toBe(true);
    }
  });

  it('is exported with the controls, and the empty state takes it in its glyph’s place', () => {
    expect(read('core.ts')).toContain("export * from './EmptyCart';");
    const empty = withoutComments(read('EmptyState.tsx')).replace(/\s+/g, ' ');
    expect(empty).toContain('{art ?? <Icon name={icon} size={GLYPH} color={t.color.text2} />}');
  });
});
