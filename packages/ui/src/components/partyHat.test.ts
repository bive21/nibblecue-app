/**
 * THE MONTH-DAY PARTY HAT (the owner, 2026-09-26). Two halves, the way this package tests anything
 * that moves: the drawing, the pop and the words are PURE (`partyHat.ts`) and are measured here —
 * every hat inside the room the bar gives it, clear of every face and of every other hat, the pop
 * sampled exactly as `Animated.Value#interpolate` samples it — and what can only be seen on a device
 * (that it is decoration, runs on the native driver and holds still when it must) is held by
 * tripwires over `PartyHat.tsx` and `ChildChip.tsx`, because this suite has no renderer
 * (`interaction.test.ts` says why that is the honest instrument). Its colors are measured in
 * `theme/partyHat.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { space } from '../theme/theme';
import { pairGeometry, PAIR_MAX } from './childPair';
import { sampleFrame } from './keyframes';
import {
  childChipLabel,
  HAT,
  HAT_POP,
  HAT_POP_FRAMES,
  hatArrival,
  hatGeometry,
  hatPoints,
  hatTilt,
  type HatGeometry,
  type HatHead,
  type HatPoint,
} from './partyHat';
import { easeAt } from './themeSkyToggle';
import { TOP_BAR_AVATAR } from './topBarLayout';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flatten = (text: string): string => withoutComments(text).replace(/\s+/g, ' ');

/* ------------------------------------------------------------------ the heads the chip draws */

/** The one avatar, in the avatar square's own coordinates (0,0 its top left). */
const ONE: HatHead = { cx: TOP_BAR_AVATAR / 2, cy: TOP_BAR_AVATAR / 2, r: TOP_BAR_AVATAR / 2 };

/** Each disc of Both, in the same square: the pair's own centers and diameter (`childPair.ts`). */
const discs = (count: 2 | 3): HatHead[] => {
  const g = pairGeometry(count);
  return g.centers.map(c => ({ cx: c.x, cy: c.y, r: g.disc / 2 }));
};

/** Every chip a hat can be drawn in: its heads, and each head's hat at its own tilt. */
const CHIPS: readonly { name: string; heads: HatHead[]; hats: HatGeometry[]; letter: number }[] = [
  { name: 'one baby', heads: [ONE], letter: 13 },
  { name: 'Both, two', heads: discs(2), letter: pairGeometry(2).letter },
  { name: 'Both, three', heads: discs(3), letter: pairGeometry(3).letter },
].map(c => ({
  ...c,
  hats: c.heads.map((h, i) => hatGeometry(h, hatTilt(c.heads.length, i))),
}));

/** Points along the hat's whole outline — the cone's edges and the pom-pom's rim — keyline out. */
function outline(g: HatGeometry, steps = 24): { p: HatPoint; pad: number }[] {
  const out: { p: HatPoint; pad: number }[] = [];
  const [a, b, c] = g.cone;
  for (const [from, to] of [
    [a, b],
    [b, c],
    [c, a],
  ] as const)
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      out.push({
        p: { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u },
        pad: g.halo,
      });
    }
  for (let i = 0; i < steps; i += 1) {
    const a2 = (2 * Math.PI * i) / steps;
    out.push({
      p: { x: g.pom.cx + g.pom.r * Math.cos(a2), y: g.pom.cy + g.pom.r * Math.sin(a2) },
      pad: g.halo,
    });
  }
  return out;
}

/** The furthest the drawn hat reaches in each direction, keyline included. */
function reach(g: HatGeometry) {
  const pts = outline(g);
  return {
    top: Math.min(...pts.map(({ p, pad }) => p.y - pad)),
    bottom: Math.max(...pts.map(({ p, pad }) => p.y + pad)),
    left: Math.min(...pts.map(({ p, pad }) => p.x - pad)),
    right: Math.max(...pts.map(({ p, pad }) => p.x + pad)),
  };
}

const dist = (p: HatPoint, q: HatPoint) => Math.hypot(p.x - q.x, p.y - q.y);
const inside = (p: HatPoint, h: HatHead) => dist(p, { x: h.cx, y: h.cy }) < h.r;

/**
 * Whether a point lies inside the cone (a triangle) or on its edge, by the signs of three cross
 * products — a band's corners are ON the edge by construction, so a rounding hair counts as on it.
 */
function inCone(p: HatPoint, [a, b, c]: HatGeometry['cone']): boolean {
  const s = (u: HatPoint, v: HatPoint) => {
    const cross = (v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x);
    return Math.abs(cross) < 1e-9 ? 0 : cross;
  };
  const d1 = s(a, b);
  const d2 = s(b, c);
  const d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/* ------------------------------------------------------------------------------ the drawing */

describe('the hat is worn on the head, in proportion to it', () => {
  it('stands on the head’s rim along its radius, its base sunk inside the circle', () => {
    for (const { name, heads, hats } of CHIPS)
      hats.forEach((g, i) => {
        const h = heads[i] as HatHead;
        // the middle of the base is `seat` of the diameter inside the rim
        expect(h.r - dist(g.pivot, { x: h.cx, y: h.cy }), name).toBeCloseTo(HAT.seat * 2 * h.r, 6);
        // and both ends of the base are on the head too: nothing of it floats beside the head
        expect(inside(g.cone[0], h), `${name} base left`).toBe(true);
        expect(inside(g.cone[2], h), `${name} base right`).toBe(true);
        // the tip points away from the head, along the tilt
        expect(inside(g.cone[1], h), `${name} tip`).toBe(false);
      });
  });

  it('draws each head a hat of its own size: the 31 pt avatar’s and each disc’s', () => {
    const one = CHIPS[0]?.hats[0] as HatGeometry;
    const two = CHIPS[1]?.hats[0] as HatGeometry;
    const height = (g: HatGeometry) => dist(g.pivot, g.cone[1]);
    expect(height(one)).toBeCloseTo(HAT.height * TOP_BAR_AVATAR, 6);
    expect(height(two) / height(one)).toBeCloseTo(pairGeometry(2).disc / TOP_BAR_AVATAR, 6);
    // about ten points on the avatar: a hat, not a crown
    expect(height(one)).toBeGreaterThan(9);
    expect(height(one)).toBeLessThan(11);
  });

  it('leans: right on the one avatar, away from the others on Both', () => {
    expect(hatTilt(1, 0)).toBeGreaterThan(0);
    const [back, front] = [hatTilt(2, 0), hatTilt(2, 1)];
    expect(back).toBeLessThan(0);
    expect(front).toBeGreaterThan(0);
    const [top, left, right] = [hatTilt(3, 0), hatTilt(3, 1), hatTilt(3, 2)];
    expect(Math.abs(top)).toBeLessThan(Math.abs(left));
    expect(left).toBeLessThan(0);
    expect(right).toBeGreaterThan(0);
    // and never so far over that it lies down
    for (const n of [1, 2, 3])
      for (let i = 0; i < n; i += 1) expect(Math.abs(hatTilt(n, i))).toBeLessThan(60);
  });

  it('keeps the pom-pom and the bands where they belong: off every head, and on the cone', () => {
    for (const { name, heads, hats } of CHIPS)
      for (const g of hats) {
        // the pom-pom never lies on a head — so it may be the brighter accent (theme/partyHat.ts)
        for (const h of heads)
          expect(dist({ x: g.pom.cx, y: g.pom.cy }, { x: h.cx, y: h.cy }), name).toBeGreaterThan(
            h.r + g.pom.r + g.halo,
          );
        // every corner of every band is on the cone
        for (const band of g.stripes)
          for (const p of band) expect(inCone(p, g.cone), name).toBe(true);
      }
  });

  it('holds its keyline to a line: never thinner than a hairline pair, never a frame', () => {
    for (const { hats } of CHIPS)
      for (const g of hats) {
        expect(g.halo).toBeGreaterThanOrEqual(HAT.haloMin);
        expect(g.halo).toBeLessThanOrEqual(HAT.haloMax);
      }
  });
});

describe('the hat keeps to the room the bar gives it', () => {
  /**
   * ABOVE: the chip's own padding (`space.xs`) and the bar's space above the chip (`space.sm`,
   * TopBar's `paddingTop` past the status bar). A hat reaching further would draw into the phone's
   * status bar, where the clock is.
   */
  const ABOVE = space.xs + space.sm;
  /** RIGHT: the gap before the chip's words (ChildChip's row `gap`). */
  const RIGHT = TOP_BAR_AVATAR + space.md;
  /** LEFT: the chip's own padding before the avatar; the pill's rounded end is checked below. */
  const LEFT = -space.xs;

  it('never reaches the status bar, the words, or past the chip’s left edge', () => {
    for (const { name, hats } of CHIPS)
      for (const g of hats) {
        const r = reach(g);
        expect(r.top, `${name} top`).toBeGreaterThanOrEqual(-ABOVE);
        expect(r.right, `${name} right`).toBeLessThanOrEqual(RIGHT);
        expect(r.left, `${name} left`).toBeGreaterThanOrEqual(LEFT);
      }
  });

  /**
   * A HAT POKES OUT OF THE TOP OF THE CHIP, NEVER OUT OF ITS SIDE. Up by the chip's top it rises
   * past the pill's rounded end on purpose — that is a hat on a head, and the end curves away there
   * — but lower down, where the end is the chip's side, a hat leaning out over it (the lower-left
   * baby of three) stays inside it, so no hat looks as if it is sliding off the chip.
   */
  it('stays inside the chip’s rounded end at its side, and leaves it only over the top', () => {
    // the pill's left end is a half circle about the avatar's own center, `space.xs` past its rim
    const end = { cx: ONE.cx, cy: ONE.cy, r: ONE.r + space.xs };
    // below the chip's top quarter the end is its side
    const side = ONE.cy - ONE.r / 2;
    let checked = 0;
    for (const { name, hats } of CHIPS)
      for (const g of hats)
        for (const { p, pad } of outline(g))
          if (p.x < end.cx && p.y > side) {
            checked += 1;
            expect(dist(p, { x: end.cx, y: end.cy }) + pad, name).toBeLessThanOrEqual(end.r);
          }
    // the lower-left hat of three is down there, so this is a claim about something
    expect(checked).toBeGreaterThan(0);
  });

  it('boxes the whole drawing: its view holds every point of it, keyline and all', () => {
    for (const { name, hats } of CHIPS)
      for (const g of hats) {
        const r = reach(g);
        expect(g.box.x, name).toBeLessThanOrEqual(r.left);
        expect(g.box.y, name).toBeLessThanOrEqual(r.top);
        expect(g.box.x + g.box.width, name).toBeGreaterThanOrEqual(r.right);
        expect(g.box.y + g.box.height, name).toBeGreaterThanOrEqual(r.bottom);
        for (const v of [g.box.x, g.box.y, g.box.width, g.box.height])
          expect(Number.isInteger(v), name).toBe(true);
      }
  });
});

describe('the hat never covers a face, or another baby’s hat', () => {
  it('stays clear of every initial: the letter the head carries is never under a hat', () => {
    for (const { name, heads, hats, letter } of CHIPS)
      for (const g of hats)
        for (const h of heads) {
          // the letter as a disc a little wider than half its size, about the head's center
          const face = { x: h.cx, y: h.cy };
          for (const { p, pad } of outline(g))
            expect(dist(p, face) - pad, name).toBeGreaterThan(0.55 * letter);
          expect(inCone(face, g.cone), name).toBe(false);
        }
  });

  it('on Both, keeps each hat off the other babies’ discs', () => {
    for (const { name, heads, hats } of CHIPS.slice(1))
      hats.forEach((g, i) =>
        heads.forEach((h, j) => {
          if (i === j) return;
          for (const { p, pad } of outline(g))
            expect(
              dist(p, { x: h.cx, y: h.cy }) - pad,
              `${name} hat ${i} on disc ${j}`,
            ).toBeGreaterThan(h.r);
        }),
      );
  });

  it('on Both, keeps the hats apart from each other', () => {
    for (const { name, hats } of CHIPS.slice(1))
      for (let i = 0; i < hats.length; i += 1)
        for (let j = i + 1; j < hats.length; j += 1) {
          const a = reach(hats[i] as HatGeometry);
          const b = reach(hats[j] as HatGeometry);
          const apart =
            a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top;
          expect(apart, `${name}: hats ${i} and ${j}`).toBe(true);
        }
  });

  it('draws a hat for every disc Both can show, and no more', () => {
    expect(PAIR_MAX).toBe(3);
    expect(CHIPS.map(c => c.hats.length)).toEqual([1, 2, 3]);
  });

  it('writes its points as SVG does', () => {
    expect(
      hatPoints([
        { x: 1, y: 2.345 },
        { x: -0.5, y: 3 },
      ]),
    ).toBe('1,2.35 -0.5,3');
  });
});

/* ------------------------------------------------------------------------------- the pop */

describe('the pop', () => {
  it('grows from nothing past full size and settles, in about a third of a second', () => {
    const scale = HAT_POP_FRAMES.scale;
    expect(sampleFrame(scale, 0)).toBe(0);
    expect(Math.max(...scale.outputRange)).toBeCloseTo(1.1, 6);
    expect(sampleFrame(scale, 1)).toBe(1);
    expect(scale.extrapolate).toBe('clamp');
    expect(HAT_POP.ms).toBe(350);
    // the overshoot comes first and the settle after it: the peak is past half way
    const peakAt = scale.inputRange[scale.outputRange.indexOf(Math.max(...scale.outputRange))] ?? 0;
    expect(peakAt).toBeGreaterThan(0.4);
    expect(peakAt).toBeLessThan(0.8);
  });

  it('is never a speck: nothing is drawn until it has some size, and it is whole early', () => {
    const { opacity, scale } = HAT_POP_FRAMES;
    expect(sampleFrame(opacity, 0)).toBe(0);
    const whole = opacity.inputRange[opacity.inputRange.length - 1] ?? 1;
    expect(whole).toBeLessThanOrEqual(0.15);
    expect(sampleFrame(opacity, 1)).toBe(1);
    // both are frames of the one value: where the hat is whole, it already has a fifth of its size
    expect(sampleFrame(scale, whole)).toBeGreaterThan(0.2);
    // and on the component's curve that is within the first 50 ms of the pop
    let at = 0;
    while (easeAt(HAT_POP.ease, at) < whole) at += 0.001;
    expect(at * HAT_POP.ms).toBeLessThan(50);
  });

  it('runs on a plain ease-out: the overshoot is in the frames, and the curve never passes 1', () => {
    for (let i = 0; i <= 40; i += 1) {
      const v = easeAt(HAT_POP.ease, i / 40);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // at its fullest about a third of the way through the 350 ms — a pop, not a snap and not a
    // swell — and settling over the rest
    const peak = HAT_POP_FRAMES.scale.inputRange[1] ?? 0;
    let at = 0;
    while (easeAt(HAT_POP.ease, at) < peak) at += 0.001;
    expect(at).toBeGreaterThan(0.25);
    expect(at).toBeLessThan(0.45);
  });

  it('waits a beat for the page, and is over before half a second and a bit', () => {
    expect(HAT_POP.delayMs).toBeGreaterThan(0);
    expect(HAT_POP.delayMs + HAT_POP.ms).toBeLessThanOrEqual(650);
  });

  it('pops only when asked to and allowed to; otherwise the hat is simply there, whole', () => {
    expect(hatArrival('pop', false)).toEqual({
      from: 0,
      animate: true,
      delay: HAT_POP.delayMs,
      duration: HAT_POP.ms,
    });
    // reduce motion or the amber Night (`motionStill`), and a hat that arrives still
    for (const [entrance, still] of [
      ['pop', true],
      ['still', false],
      ['still', true],
    ] as const)
      expect(hatArrival(entrance, still)).toEqual({
        from: 1,
        animate: false,
        delay: 0,
        duration: 0,
      });
  });
});

/* ----------------------------------------------------------------------- what it says */

describe('what the chip says on a month-day', () => {
  it('is the chip’s name exactly as it was on every other day', () => {
    expect(childChipLabel('Ada', '3 months')).toBe('Ada, 3 months. Switch child');
    expect(childChipLabel('Ada', '3 months', undefined)).toBe('Ada, 3 months. Switch child');
    expect(childChipLabel('Ada', '3 months', '')).toBe('Ada, 3 months. Switch child');
    expect(childChipLabel('Ada', '')).toBe('Ada. Switch child');
    expect(childChipLabel('Both', '2 children')).toBe('Both, 2 children. Switch child');
  });

  it('adds the day as a plain fact, and does not read the age twice', () => {
    expect(childChipLabel('Ada', '3 months', '3 months today')).toBe(
      'Ada, 3 months today. Switch child',
    );
    // the age in weeks and the month-day are two different facts, so both are read
    expect(childChipLabel('Ada', '4 weeks', '1 month today')).toBe(
      'Ada, 4 weeks, 1 month today. Switch child',
    );
    expect(childChipLabel('Both', '2 children', 'Ada is 3 months today')).toBe(
      'Both, 2 children, Ada is 3 months today. Switch child',
    );
    // an age that merely starts the same is not the same age
    expect(childChipLabel('Ada', '1 month', '12 months today')).toBe(
      'Ada, 1 month, 12 months today. Switch child',
    );
  });
});

/* ------------------------------------------------------------- the component (tripwires) */

describe('the hat (tripwires over PartyHat.tsx)', () => {
  const src = withoutComments(read('PartyHat.tsx'));
  const flat = src.replace(/\s+/g, ' ');

  it('is decoration: no touches, hidden from assistive technology, no name', () => {
    expect(flat).toContain(
      '<Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden',
    );
    expect(flat).not.toMatch(/accessibilityLabel|accessibilityRole|onPress/);
  });

  it('decides its arrival once, and pops on the native driver, opacity and scale only', () => {
    expect(flat).toContain('const arrival = useRef(hatArrival(entrance, still)).current;');
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    expect(flat).toContain('opacity: drive(pop, HAT_POP_FRAMES.opacity)');
    expect(flat).toContain('transform: [{ scale: drive(pop, HAT_POP_FRAMES.scale) }]');
    expect(flat).toContain('Easing.bezier(...HAT_POP.ease)');
  });

  it('reads reduce motion and the amber Night, and is never left part-grown', () => {
    expect(flat).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(flat).toContain('if (still) pop.setValue(1);');
    expect(flat).toContain('return () => { run.stop(); pop.setValue(1); };');
  });

  it('grows out of the middle of its base', () => {
    expect(flat).toContain('transformOrigin: [g.pivot.x - box.x, g.pivot.y - box.y, 0]');
  });

  it('writes no color: every ink is the theme’s, through partyHatColors', () => {
    expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
    expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    expect(flat).toContain('const c = partyHatColors(t.color, t.theme);');
  });

  it('asks for nothing Expo Go does not carry', () => {
    const imports = [...src.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
  });
});

describe('the chip wears it (tripwires over ChildChip.tsx)', () => {
  const flat = flatten(read('ChildChip.tsx'));

  it('draws the one avatar’s hat over the avatar, riding the avatar’s own split', () => {
    expect(flat).toContain(
      '<Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, pair !== null ? anim.one : null]} >',
    );
    expect(flat).toContain('tilt={hatTilt(1, 0)} entrance={single.hat}');
    // a switch to another baby is that baby's own hat
    expect(flat).toContain('key={single.who}');
  });

  it('puts each baby’s hat on its own disc on Both, and only its own', () => {
    expect(flat).toContain('{face?.hat !== undefined ? (');
    expect(flat).toContain('tilt={hatTilt(g.count, i)} entrance={face.hat}');
    // the one avatar wears none on Both: Both is not one baby
    expect(flat).toContain('const oneHat = isBoth ? undefined : hat;');
  });

  it('says the month-day in its one name, composed in one pure place', () => {
    expect(flat).toContain('const label = childChipLabel(shown, ageLabel, monthDay);');
    expect(flat).toContain('accessibilityLabel={label}');
  });
});
