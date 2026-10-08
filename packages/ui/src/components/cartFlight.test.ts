/**
 * THE THROW INTO THE SUPPLIES PAGE'S CART, ITS BOUNCE AND ITS COUNT (the owner, 2026-09-26:
 * *"Shopping: adding from Supplies flies the item into the list, and the cart bounces."*). The route,
 * the frames, the landing, the bounce and the roll are PURE (`cartFlight.ts`) and are sampled here
 * exactly as `Animated.Value#interpolate` samples them; that the three components are decoration,
 * run on the native driver, measure on the throw and draw nothing under reduce motion or in the
 * amber Night is held by tripwires over them, since this suite has no renderer
 * (`interaction.test.ts` says why that is the honest instrument).
 *
 * THE PROMISES THAT MATTER MOST: the thing thrown goes UP and comes DOWN into the cart, never out of
 * the top of the page on its way to a cart that is on it; it lands, is felt and bounces inside half
 * a second; a cart scrolled away is flown toward, not landed on; and nothing is left once it has.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveAccent } from '../theme/accent';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_GRAPHIC, contrastRatio } from '../theme/contrast';
import { moduleColor, themeNames, type Palette } from '../theme/theme';
import {
  ARC_CLEAR,
  CART_BOUNCE_KEYS,
  CART_BOUNCE_MS,
  CART_CHIP,
  CART_EMERGE_MS,
  CART_FADE_MS,
  CART_LAND_MS,
  CART_POP_PEAK_MS,
  CART_STEP_MS,
  cartBounceFrames,
  cartFlightFrames,
  cartLanding,
  cartRoute,
  CHIP_SCALE,
  CHIP_TILT,
  chipScaleAt,
  COUNT_ROLL_MS,
  COUNT_ROLL_SHIFT,
  countRollFrames,
  LOB,
  routeAt,
  routeTop,
  tossAt,
  type CartRoom,
  type Pt,
} from './cartFlight';
import type { Frame } from './dayNightSwitch';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flatOf = (f: string) => withoutComments(read(f)).replace(/\s+/g, ' ');

/** `Animated.Value#interpolate` for one number: piecewise-linear, clamped past the ends. */
function sample(fr: Frame, p: number): number {
  const xs = fr.inputRange;
  const ys = fr.outputRange;
  const last = xs.length - 1;
  if (p <= (xs[0] ?? 0)) return ys[0] ?? 0;
  if (p >= (xs[last] ?? 1)) return ys[last] ?? 0;
  let i = 0;
  while ((xs[i + 1] ?? 1) < p) i += 1;
  const [x0, x1, y0, y1] = [xs[i] ?? 0, xs[i + 1] ?? 1, ys[i] ?? 0, ys[i + 1] ?? 0];
  return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
}

/** At a millisecond from the tap, as the one value of the throw is sampled. */
const at = (fr: Frame, ms: number): number => sample(fr, ms / CART_LAND_MS);
const EVERY_MS = Array.from({ length: CART_LAND_MS + 1 }, (_, i) => i);

function readable(name: string, fr: Frame) {
  expect(fr.inputRange.length, name).toBe(fr.outputRange.length);
  for (let i = 1; i < fr.inputRange.length; i += 1)
    expect(fr.inputRange[i] ?? 0, name).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
  expect(fr.inputRange[0] ?? -1, name).toBeGreaterThanOrEqual(0);
  expect(fr.inputRange[fr.inputRange.length - 1] ?? 2, name).toBeLessThanOrEqual(1);
  expect(fr.extrapolate, name).toBe('clamp');
}

/**
 * THE PAGES IT IS THROWN ACROSS: a phone's scroller (390 × 640), the + at the right of a catalog
 * row and the cart square at the top left of the page — from the first row under the cart to the
 * last one on the screen, a + level with the cart, and a cart close under the page's top edge.
 */
const ROOM: CartRoom = { width: 390, height: 640 };
const CART: Pt = { x: 49, y: 124 };
const THROWS: [string, Pt, Pt][] = [
  ['the first row', { x: 341, y: 245 }, CART],
  ['a row half way down', { x: 341, y: 420 }, CART],
  ['the last row on the screen', { x: 341, y: 610 }, CART],
  ['a + level with the cart', { x: 341, y: 124 }, CART],
  ['a cart close under the top', { x: 341, y: 300 }, { x: 49, y: 22 }],
  ['a + close under the top', { x: 341, y: 24 }, { x: 49, y: 60 }],
];
const HALF = CART_CHIP / 2;

describe('the route', () => {
  it('runs from the + to the cart, across at an even pace', () => {
    for (const [name, from, to] of THROWS) {
      const r = cartRoute(from, to, ROOM);
      expect(r.lands, name).toBe(true);
      expect(routeAt(r, 0), name).toEqual(from);
      expect(routeAt(r, 1).x, name).toBeCloseTo(to.x, 9);
      expect(routeAt(r, 1).y, name).toBeCloseTo(to.y, 9);
      for (let t = 0; t <= 1; t += 0.1)
        expect(routeAt(r, t).x, name).toBeCloseTo(from.x + (to.x - from.x) * t, 9);
    }
  });

  it('goes up and comes DOWN into the cart, from above it', () => {
    for (const [name, from, to] of THROWS.slice(0, 4)) {
      const r = cartRoute(from, to, ROOM);
      const top = routeTop(r);
      // it peaks between its ends, above the higher of them by a lob
      expect(top.t, name).toBeGreaterThan(0);
      expect(top.t, name).toBeLessThan(1);
      const lob = Math.min(from.y, to.y) - top.y;
      expect(lob, name).toBeGreaterThanOrEqual(LOB.min - 1e-9);
      expect(lob, name).toBeLessThanOrEqual(LOB.max + 1e-9);
      // and the last of it is a drop: y still rising (downward on the screen) as it lands
      expect(routeAt(r, 1).y - routeAt(r, 0.95).y, name).toBeGreaterThan(0);
    }
  });

  it('never flies out of the top of the page on its way to a cart that is on it', () => {
    for (const [name, from, to] of THROWS) {
      const r = cartRoute(from, to, ROOM);
      expect(routeTop(r).y, name).toBeGreaterThanOrEqual(
        Math.min(ARC_CLEAR + HALF, from.y, to.y) - 1e-6,
      );
      for (let t = 0; t <= 1; t += 0.01)
        expect(routeAt(r, t).y, `${name} at ${t}`).toBeGreaterThanOrEqual(
          Math.min(ARC_CLEAR + HALF, from.y, to.y) - 1e-6,
        );
    }
  });

  it('flies toward a cart scrolled off the top, and leaves by the top edge rather than landing', () => {
    const r = cartRoute({ x: 341, y: 420 }, { x: 49, y: -380 }, ROOM);
    expect(r.lands).toBe(false);
    // straight at the edge, ending just past it, over where the cart is
    expect(r.a).toBe(0);
    expect(r.to).toEqual({ x: 49, y: -HALF });
    for (let t = 0; t < 1; t += 0.05) expect(routeAt(r, t + 0.05).y).toBeLessThan(routeAt(r, t).y);
    // a cart off to one side is flown toward from on the page
    expect(cartRoute({ x: 200, y: 300 }, { x: -40, y: -20 }, ROOM).to.x).toBe(HALF);
    // and one below the page is left by the bottom edge
    expect(cartRoute({ x: 200, y: 300 }, { x: 49, y: 900 }, ROOM).to.y).toBe(ROOM.height + HALF);
  });
});

describe('the frames', () => {
  const r = cartRoute(THROWS[1]?.[1] ?? CART, CART, ROOM);
  const f = cartFlightFrames(r);

  it('are frames Animated can read: in order, one output per input, inside the throw, clamped', () => {
    for (const [name, fr] of Object.entries(f)) readable(name, fr);
    // sampled finer than a frame
    expect(CART_STEP_MS).toBeLessThanOrEqual(16);
  });

  it('pops out of the + — small, past full, full — and only then leaves it', () => {
    expect(at(f.x, 0)).toBeCloseTo(r.from.x, 9);
    expect(at(f.y, 0)).toBeCloseTo(r.from.y, 9);
    expect(at(f.scale, 0)).toBeCloseTo(CHIP_SCALE.out, 9);
    expect(at(f.scale, CART_POP_PEAK_MS)).toBeCloseTo(CHIP_SCALE.peak, 9);
    expect(at(f.scale, CART_EMERGE_MS)).toBeCloseTo(CHIP_SCALE.full, 9);
    for (const ms of EVERY_MS.filter(ms => ms <= CART_EMERGE_MS)) {
      expect(at(f.x, ms), `${ms} ms`).toBeCloseTo(r.from.x, 6);
      expect(tossAt(ms), `${ms} ms`).toBe(0);
    }
    // it answers the tap on the next frame
    expect(at(f.opacity, 0)).toBe(0);
    expect(at(f.opacity, 16)).toBe(1);
  });

  it('flies the route, shrinking into the cart, and lands on it inside half a second', () => {
    for (let ms = CART_EMERGE_MS; ms <= CART_LAND_MS; ms += CART_STEP_MS) {
      const p = routeAt(r, tossAt(ms));
      expect(at(f.x, ms), `${ms} ms`).toBeCloseTo(p.x, 6);
      expect(at(f.y, ms), `${ms} ms`).toBeCloseTo(p.y, 6);
    }
    expect(at(f.x, CART_LAND_MS)).toBeCloseTo(CART.x, 6);
    expect(at(f.y, CART_LAND_MS)).toBeCloseTo(CART.y, 6);
    expect(at(f.scale, CART_LAND_MS)).toBeCloseTo(CHIP_SCALE.landed, 9);
    // never bigger than its pop, never smaller than it lands
    for (const ms of EVERY_MS) {
      expect(chipScaleAt(ms)).toBeLessThanOrEqual(CHIP_SCALE.peak + 1e-9);
      expect(chipScaleAt(ms)).toBeGreaterThanOrEqual(CHIP_SCALE.out - 1e-9);
    }
    expect(CART_LAND_MS).toBeLessThanOrEqual(450);
  });

  it('is whole all the way and fades into the cart over the last of it, gone as it lands', () => {
    for (const ms of EVERY_MS.filter(ms => ms >= 16 && ms <= CART_LAND_MS - CART_FADE_MS))
      expect(at(f.opacity, ms), `${ms} ms`).toBe(1);
    expect(at(f.opacity, CART_LAND_MS)).toBe(0);
  });

  it('tips a little on its way and lands upright', () => {
    expect(at(f.turn, CART_EMERGE_MS)).toBeCloseTo(0, 9);
    expect(at(f.turn, CART_LAND_MS)).toBeCloseTo(0, 9);
    const most = Math.max(...EVERY_MS.map(ms => Math.abs(at(f.turn, ms))));
    expect(most).toBeCloseTo(Math.abs(CHIP_TILT), 1);
    expect(Math.abs(CHIP_TILT)).toBeLessThanOrEqual(20);
  });
});

describe('the landing: felt once, on the caller’s clock', () => {
  it('throws on the tap and feels the landing as one tap, in light and dark', () => {
    for (const theme of themeNames.filter(x => x !== 'night'))
      expect(cartLanding(false, theme), theme).toEqual({
        fly: true,
        landAt: CART_LAND_MS,
        felt: [{ at: CART_LAND_MS, kind: 'tap' }],
      });
  });

  it('throws nothing under reduce motion or in the amber Night, and is felt on the tap', () => {
    for (const theme of themeNames)
      for (const reduceMotion of [false, true]) {
        if (!reduceMotion && theme !== 'night') continue;
        expect(cartLanding(reduceMotion, theme), `${theme} ${reduceMotion}`).toEqual({
          fly: false,
          landAt: 0,
          felt: [{ at: 0, kind: 'tap' }],
        });
      }
  });
});

describe('the bounce', () => {
  const b = cartBounceFrames();
  const bat = (fr: Frame, ms: number) => sample(fr, ms / CART_BOUNCE_MS);
  const MS = Array.from({ length: CART_BOUNCE_MS + 1 }, (_, i) => i);

  it('goes 1 → 1.18 → just under → just over → 1, and is over in 340 ms', () => {
    expect(CART_BOUNCE_KEYS.map(([, s]) => s)).toEqual([1, 1.18, 0.95, 1.03, 1]);
    for (const [ms, s, d] of CART_BOUNCE_KEYS) {
      expect(bat(b.scale, ms), `${ms} ms`).toBeCloseTo(s, 9);
      expect(bat(b.turn, ms), `${ms} ms`).toBeCloseTo(d, 9);
    }
    expect(Math.max(...MS.map(ms => bat(b.scale, ms)))).toBeCloseTo(1.18, 9);
    // the overshoot back is small
    expect(Math.min(...MS.map(ms => bat(b.scale, ms)))).toBeGreaterThanOrEqual(0.94);
    expect(CART_BOUNCE_MS).toBeLessThanOrEqual(450);
    readable('scale', b.scale);
    readable('turn', b.turn);
  });

  it('is round, not a zigzag: no step between samples bigger than a tenth of the rise', () => {
    for (let ms = 1; ms <= CART_BOUNCE_MS; ms += 1)
      expect(Math.abs(bat(b.scale, ms) - bat(b.scale, ms - 1))).toBeLessThan(0.018);
  });

  it('rocks on its wheels a few degrees at most, and stands still at both ends', () => {
    for (const ms of MS) expect(Math.abs(bat(b.turn, ms))).toBeLessThanOrEqual(8 + 1e-9);
    expect(bat(b.turn, 0)).toBe(0);
    expect(bat(b.turn, CART_BOUNCE_MS)).toBe(0);
  });
});

describe('the count’s roll', () => {
  const LINE = 22;

  it('rolls up for a rise and down for a fall, like a counter’s wheel', () => {
    for (const dir of [1, -1] as const) {
      const f = countRollFrames(LINE, dir);
      // the old words leave the way the wheel turns, the new come in from the other side
      expect(sample(f.outY, 0)).toBeCloseTo(0, 9);
      expect(Math.sign(sample(f.outY, 1))).toBe(-dir);
      expect(sample(f.inY, 0)).toBeCloseTo(dir * LINE * COUNT_ROLL_SHIFT, 9);
      expect(sample(f.inY, 1)).toBeCloseTo(0, 9);
      // the old gone before the new is whole, and the new whole at the end
      expect(sample(f.outOpacity, 0.7)).toBe(0);
      expect(sample(f.inOpacity, 0)).toBe(0);
      expect(sample(f.inOpacity, 1)).toBe(1);
      for (const fr of Object.values(f)) readable('roll', fr);
    }
    expect(COUNT_ROLL_MS).toBeLessThanOrEqual(450);
  });
});

/**
 * THE INKS, MEASURED (every mark at least 3:1). What flies is the thing's own category square —
 * whose glyph on its disc the token gate already holds — ringed in its category's ink, `fg`, which
 * is `categoryColors(palette, role).fg`: the palette's own role. The ring is its edge, so it is
 * measured on everything the throw crosses: the page, a card, the wash under a supply already on
 * the list, and the tinted card the cart sits in. For every module's hue — a superset of the
 * supply categories' — in every scheme, light and dark: nothing flies in the amber Night.
 */
describe('the inks', () => {
  it('rings the thrown square at 3:1 or better on every ground it crosses', () => {
    const roles = [...new Set(Object.values(moduleColor))];
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames.filter(x => x !== 'night')) {
        const c = resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme },
          'light',
          PLUS_APPEARANCE,
        ).palette;
        const a = deriveAccent(c);
        const grounds: Record<string, string> = {
          paper: c.paper,
          card: c.surfaceSolid,
          'on-list wash': a.tintSoft,
          'the cart’s card': a.tint,
        };
        for (const role of roles)
          for (const [ground, bg] of Object.entries(grounds))
            expect(
              contrastRatio((c as Palette)[role], bg),
              `${scheme}/${theme}: ${role} ring on ${ground}`,
            ).toBeGreaterThanOrEqual(AA_GRAPHIC);
      }
  });
});

describe('the components (tripwires)', () => {
  const flight = flatOf('CartFlight.tsx');
  const bounce = flatOf('CartBounce.tsx');
  const roll = flatOf('CountRoll.tsx');

  it('throws decoration only: hidden from touch and from assistive technology', () => {
    expect(flight).toContain(
      'pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={StyleSheet.absoluteFill}',
    );
    expect(flight).not.toContain('<Pressable');
    // the words leaving the count are a copy nobody reads twice
    expect(roll).toContain(
      'pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden',
    );
  });

  it('measures the +, the cart and itself in the window, once, as the chip is thrown', () => {
    expect(flight).toContain('layer.measureInWindow((lx, ly, lw, lh) => {');
    expect(flight).toContain('from.measureInWindow((fx, fy, fw, fh) => {');
    expect(flight).toContain('to.measureInWindow((tx, ty, tw, th) => {');
    expect(flight).toContain('}, [thrown, sky]);');
  });

  it('keeps to the caller’s clock: a chip measured late joins the throw where it should be', () => {
    expect(flight).toContain(
      'const gone = Math.min(Math.max(Date.now() - thrown.at, 0), CART_LAND_MS);',
    );
    expect(flight).toContain('duration: CART_LAND_MS - gone,');
  });

  it('draws, bounces and rolls nothing under reduce motion or in the amber Night', () => {
    for (const src of [flight, bounce, roll])
      expect(src).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(flight).toContain('{still ? null : throws.map(');
    expect(bounce).toContain('if (still) return undefined;');
    expect(roll).toContain('if (motion === null || leaving === null || still) return');
  });

  it('plays only a landing it saw: the first number bounces and rolls nothing', () => {
    expect(bounce).toContain('const seen = useRef(bump);');
    expect(bounce).toContain('if (bump === seen.current) return undefined;');
    expect(roll).toContain('if (before.value === value) return;');
    // a count that changes with nothing landing — the list read in as the page opens — is just set
    expect(roll).toContain(
      'if (still || before.bump === bump) { setLeaving(null); v.setValue(1); return; }',
    );
  });

  it('runs on the native driver: opacity and transforms only', () => {
    for (const src of [flight, bounce, roll]) {
      expect(src).toContain('useNativeDriver: true');
      expect(src).not.toContain('useNativeDriver: false');
    }
    const fed = [flight, bounce, roll].flatMap(src =>
      [...src.matchAll(/(\w+): (?:num|deg)\(/g)].map(m => m[1]),
    );
    expect(fed.length).toBeGreaterThan(0);
    for (const prop of fed)
      expect(['opacity', 'translateX', 'translateY', 'rotate', 'scale'], prop).toContain(prop);
  });

  it('asks for nothing Expo Go does not carry, and writes no color of its own', () => {
    for (const f of ['CartFlight.tsx', 'CartBounce.tsx', 'CountRoll.tsx', 'cartFlight.ts']) {
      const src = withoutComments(read(f));
      for (const m of src.matchAll(/from '([^']+)'/g)) {
        const source = m[1] ?? '';
        expect(
          ['react', 'react-native'].includes(source) || /^\./.test(source),
          `${f}: ${source}`,
        ).toBe(true);
      }
      expect(src, f).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src, f).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    }
  });

  it('is exported with the controls, and its arithmetic through the node-safe entry', () => {
    for (const c of ['CartFlight', 'CartBounce', 'CountRoll'])
      expect(read('core.ts')).toContain(`export * from './${c}';`);
    expect(read('core.ts')).not.toContain("'./cartFlight'");
    expect(read('../layout.ts')).toContain("from './components/cartFlight';");
  });
});
