/**
 * THE HANDOFF BATON (the owner, 2026-09-25, of the "that's cool" list; idea #12): who holds the
 * baby's reminders, drawn as their disc with the row's glyph on its shoulder, and the pass that
 * throws it from one person to the next. Two halves, the way this package tests anything that
 * moves: every frame of the pass is PURE (`handoffBaton.ts`) and is sampled here exactly as
 * `Animated.Value#interpolate` would sample it — where each layer is, how big, how visible, at every
 * thousandth of the pass — and what can only be seen on a device is held by tripwires over
 * `HandoffBaton.tsx`, because this suite has no renderer (`interaction.test.ts` says why).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCHEME_NAMES } from '../theme/appearance';
import { AA_GRAPHIC, contrastRatio } from '../theme/contrast';
import { resolvePalette, themeNames } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import {
  BATON_BADGE,
  BATON_BEATS,
  BATON_DISC,
  BATON_LAND_MS,
  BATON_MS,
  BATON_RING,
  BATON_ROOM,
  BATON_SLOT,
  batonFrames,
  batonGeometry,
  batonPlan,
  shoulderOf,
  type BatonLayerFrames,
} from './handoffBaton';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('HandoffBaton.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('handoffBaton.ts'));

/** `Animated.Value#interpolate` for one number: piecewise-linear, clamped at the ends. */
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

const g = batonGeometry();
const f = batonFrames(g);
const STEPS = Array.from({ length: 1001 }, (_, i) => i / 1000);

/** A disc layer at `p`: its center, its radius and how much of it shows. */
function discAt(l: BatonLayerFrames, p: number) {
  return {
    x: g.rest.disc.x + sample(l.x, p),
    y: g.rest.disc.y + sample(l.y, p),
    r: (g.disc / 2) * sample(l.scale, p),
    opacity: sample(l.opacity, p),
  };
}

/** The baton at `p`: its center, its radius and its turn. */
function batonAt(p: number) {
  return {
    x: g.rest.badge.x + sample(f.baton.x, p),
    y: g.rest.badge.y + sample(f.baton.y, p),
    r: (g.badge / 2) * sample(f.baton.scale, p),
    turn: sample(f.baton.rotate, p),
  };
}

/** Whether a circle is inside the room the card gives the square (its padding, the gap to the words). */
function inRoom(c: { x: number; y: number; r: number }): boolean {
  return (
    c.x - c.r >= -BATON_ROOM.left &&
    c.y - c.r >= -BATON_ROOM.top &&
    c.x + c.r <= g.slot + BATON_ROOM.right &&
    c.y + c.r <= g.slot + BATON_ROOM.bottom
  );
}

/** The initial on a disc of radius r: a 13 letter on the 31 disc (Avatar), 0.62 em by 0.7 em at most. */
const letterHalf = (r: number) => ({ w: 0.31 * 13 * (r / 15.5), h: 0.35 * 13 * (r / 15.5) });

/** The distance from a point to a box centered at (cx, cy) with half-sizes (hw, hh). */
function toBox(px: number, py: number, cx: number, cy: number, hw: number, hh: number): number {
  const dx = Math.max(Math.abs(px - cx) - hw, 0);
  const dy = Math.max(Math.abs(py - cy) - hh, 0);
  return Math.hypot(dx, dy);
}

describe('the square at rest', () => {
  it('is the row glyph’s own 36 square, holding a 31 disc and an 18 badge on its lower right', () => {
    expect(BATON_SLOT).toBe(36);
    expect(BATON_DISC).toBe(31);
    expect(g.rest.disc).toEqual({ x: 15.5, y: 15.5 });
    // the badge touches the square's right and bottom edges, inside it
    expect(g.rest.badge.x + BATON_BADGE / 2).toBe(BATON_SLOT);
    expect(g.rest.badge.y + BATON_BADGE / 2).toBe(BATON_SLOT);
    // it overlaps the disc, as a badge does, but not to its middle
    const gap = Math.hypot(g.rest.badge.x - g.rest.disc.x, g.rest.badge.y - g.rest.disc.y);
    expect(gap).toBeLessThan(BATON_DISC / 2 + BATON_BADGE / 2);
    expect(gap).toBeGreaterThan(BATON_DISC / 2);
    // and the ring is inside the badge's own size
    expect(BATON_BADGE - 2 * BATON_RING).toBe(14);
  });

  it('leaves the holder’s initial clear of the badge', () => {
    const { w, h } = letterHalf(g.disc / 2);
    expect(
      toBox(g.rest.badge.x, g.rest.badge.y, g.rest.disc.x, g.rest.disc.y, w, h),
    ).toBeGreaterThanOrEqual(g.badge / 2);
  });
});

describe('the pass', () => {
  it('starts as exactly the picture the square showed: the giver at rest, holding the baton', () => {
    const giver = discAt(f.giver, 0);
    expect(giver).toEqual({ x: 15.5, y: 15.5, r: 15.5, opacity: 1 });
    expect(discAt(f.taker, 0).opacity).toBe(0);
    expect(batonAt(0)).toEqual({ x: g.rest.badge.x, y: g.rest.badge.y, r: g.badge / 2, turn: 0 });
  });

  it('ends as exactly the picture that stays: the taker at rest, holding the baton, upright', () => {
    const taker = discAt(f.taker, 1);
    expect(taker.x).toBeCloseTo(15.5, 9);
    expect(taker.y).toBeCloseTo(15.5, 9);
    expect(taker.r).toBeCloseTo(15.5, 9);
    expect(taker.opacity).toBe(1);
    expect(discAt(f.giver, 1).opacity).toBe(0);
    const b = batonAt(1);
    expect(b.x).toBeCloseTo(g.rest.badge.x, 9);
    expect(b.y).toBeCloseTo(g.rest.badge.y, 9);
    expect(b.r).toBeCloseTo(g.badge / 2, 9);
    expect(b.turn % 360).toBe(0);
  });

  it('throws from the giver’s shoulder and lands on the taker’s, with both discs in their pair', () => {
    const [t0, t1] = BATON_BEATS.throw;
    for (const [t, from, holder] of [
      [t0, g.throw.from, f.giver],
      [t1, g.throw.to, f.taker],
    ] as const) {
      const b = batonAt(t);
      expect(b.x).toBeCloseTo(from.x, 9);
      expect(b.y).toBeCloseTo(from.y, 9);
      // and the shoulder is the one on the disc as it stands at that moment
      const d = discAt(holder, t);
      const s = shoulderOf({ x: d.x, y: d.y }, d.r / (g.disc / 2));
      expect(s.x).toBeCloseTo(from.x, 9);
      expect(s.y).toBeCloseTo(from.y, 9);
    }
    expect(BATON_BEATS.land).toBe(t1);
  });

  it('goes steadily across and over the top, as high as it says, and never back', () => {
    const [t0, t1] = BATON_BEATS.throw;
    const inFlight = STEPS.filter(p => p >= t0 && p <= t1);
    for (let i = 1; i < inFlight.length; i += 1)
      expect(batonAt(inFlight[i] ?? 0).x).toBeGreaterThan(batonAt(inFlight[i - 1] ?? 0).x);
    const top = Math.min(...inFlight.map(p => batonAt(p).y));
    expect(g.throw.from.y - top).toBeCloseTo(g.throw.height, 0);
    // highest half way over
    const peak = inFlight.reduce((a, p) => (batonAt(p).y < batonAt(a).y ? p : a), t0);
    expect(Math.abs(peak - (t0 + t1) / 2)).toBeLessThan(0.02);
    // OVER the taker's head, not across its face: where the baton passes above the taker's center
    // it is above the disc's top, and its lowest point is above the taker's initial
    const taker = discAt(f.taker, BATON_BEATS.land);
    const over = inFlight.find(p => batonAt(p).x >= taker.x) ?? t1;
    const b = batonAt(over);
    expect(b.y).toBeLessThan(taker.y - taker.r);
    expect(b.y + b.r).toBeLessThan(taker.y - letterHalf(taker.r).h);
  });

  it('turns once in the air and lands the right way up', () => {
    const [t0, t1] = BATON_BEATS.throw;
    expect(batonAt(t0).turn).toBe(0);
    expect(batonAt(t1).turn).toBe(360);
    // still before the throw, and still after it
    expect(batonAt(t0 - 0.05).turn).toBe(0);
    expect(batonAt(t1 + 0.05).turn).toBe(360);
  });

  it('lands with a catch: the taker swells a little and the baton squashes, then both settle', () => {
    const taker = (p: number) => discAt(f.taker, p).r;
    const catchAt = (BATON_BEATS.catch[0] + BATON_BEATS.catch[1]) / 2;
    expect(taker(catchAt)).toBeGreaterThan(taker(BATON_BEATS.land));
    expect(taker(BATON_BEATS.catch[1])).toBeCloseTo(taker(BATON_BEATS.land), 9);
    const squashAt = (BATON_BEATS.squash[0] + BATON_BEATS.squash[1]) / 2;
    expect(batonAt(squashAt).r).toBeLessThan(batonAt(BATON_BEATS.land).r);
  });

  it('keeps the two discs a pair — just touching — without the front one covering the other’s initial', () => {
    const giver = discAt(f.giver, BATON_BEATS.land);
    const taker = discAt(f.taker, BATON_BEATS.land);
    const between = Math.hypot(taker.x - giver.x, taker.y - giver.y);
    expect(between).toBeLessThan(giver.r + taker.r);
    const { w, h } = letterHalf(giver.r);
    expect(toBox(taker.x, taker.y, giver.x, giver.y, w, h)).toBeGreaterThanOrEqual(taker.r);
    // and the baton, held on the giver's shoulder before the throw, leaves the giver's initial clear
    const held = batonAt(BATON_BEATS.throw[0]);
    expect(toBox(held.x, held.y, giver.x, giver.y, w, h)).toBeGreaterThanOrEqual(held.r);
  });

  it('keeps every layer inside the room the card gives the square, at every thousandth of the pass', () => {
    // every layer that can be seen, at every thousandth — collected, then asserted once
    const outside: string[] = [];
    for (const p of STEPS) {
      const giver = discAt(f.giver, p);
      const taker = discAt(f.taker, p);
      if (giver.opacity > 0 && !inRoom(giver)) outside.push(`giver at ${p}`);
      if (taker.opacity > 0 && !inRoom(taker)) outside.push(`taker at ${p}`);
      if (!inRoom(batonAt(p))) outside.push(`baton at ${p}`);
    }
    expect(outside).toEqual([]);
    // the room itself: the card's padding (Today's `space.lg`, 11) and the gap to the words
    // (`space.md`, 8), each less two points of air
    expect(BATON_ROOM).toEqual({ left: 9, top: 9, right: 6, bottom: 9 });
  });

  it('shows the taker only once the giver has made room, and lets the giver go only after the landing', () => {
    expect(discAt(f.taker, BATON_BEATS.enter[0]).opacity).toBe(0);
    expect(discAt(f.taker, BATON_BEATS.room[1]).opacity).toBe(1);
    expect(discAt(f.giver, BATON_BEATS.land).opacity).toBe(1);
    expect(BATON_BEATS.gone[0]).toBeGreaterThan(BATON_BEATS.land);
    expect(discAt(f.giver, BATON_BEATS.gone[1]).opacity).toBe(0);
  });

  it('uses frames Animated can read: ranges inside the pass, in order, clamped', () => {
    const every: [string, Frame][] = [
      ...(['giver', 'taker'] as const).flatMap(k =>
        (['opacity', 'x', 'y', 'scale'] as const).map((p): [string, Frame] => [
          `${k} ${p}`,
          f[k][p],
        ]),
      ),
      ...(['x', 'y', 'rotate', 'scale'] as const).map((p): [string, Frame] => [
        `baton ${p}`,
        f.baton[p],
      ]),
    ];
    for (const [name, fr] of every) {
      expect(fr.inputRange.length, name).toBe(fr.outputRange.length);
      expect(fr.inputRange.length, name).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < fr.inputRange.length; i += 1)
        expect(fr.inputRange[i] ?? 0, name).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
      expect(fr.inputRange[0] ?? -1, name).toBeGreaterThanOrEqual(0);
      expect(fr.inputRange[fr.inputRange.length - 1] ?? 2, name).toBeLessThanOrEqual(1);
      // `p` is driven at a constant rate from 0 to 1 and never past: nothing needs to extend
      expect(fr.extrapolate, name).toBe('clamp');
    }
  });
});

describe('the move', () => {
  it('passes only when there is a pass to show and something may move', () => {
    expect(batonPlan(true, false)).toEqual({ animate: true, start: 0 });
    // reduce motion or amber night: the new holder with the baton, from the first frame
    expect(batonPlan(true, true)).toEqual({ animate: false, start: 1 });
    // at rest: the end, which is the holder with the baton
    expect(batonPlan(false, false)).toEqual({ animate: false, start: 1 });
    expect(batonPlan(false, true)).toEqual({ animate: false, start: 1 });
  });

  it('lands inside the second, where the haptic is timed', () => {
    expect(BATON_MS).toBe(1000);
    expect(BATON_LAND_MS).toBe(600);
    expect(BATON_LAND_MS).toBeLessThan(BATON_MS);
  });
});

describe('the colors, measured', () => {
  it('draws the baton’s glyph at 3:1 on its badge — moon on the sleep tint, bell on paper — everywhere', () => {
    for (const theme of themeNames)
      for (const scheme of SCHEME_NAMES) {
        const c = resolvePalette(theme, scheme);
        const at = `${theme}/${scheme}`;
        expect(contrastRatio(c.sleep, c.sleepSoft), `moon, ${at}`).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
        expect(contrastRatio(c.text, c.paper), `bell, ${at}`).toBeGreaterThanOrEqual(AA_GRAPHIC);
      }
  });
});

describe('the square (tripwires over HandoffBaton.tsx)', () => {
  it('is decoration: out of touch and out of the accessibility tree', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
    expect(component).not.toContain('<Pressable');
    expect(component).not.toContain('accessibilityLabel');
  });

  it('draws people with the disc the app already draws for them, their picture in it when they have one', () => {
    expect(flat).toContain(
      '<Avatar name={holder} size={31} {...(holderPhotoUri ? { photoUri: holderPhotoUri } : {})} />',
    );
    expect(flat).toContain(
      '<Avatar name={from} size={31} {...(fromPhotoUri ? { photoUri: fromPhotoUri } : {})} />',
    );
  });

  it('runs every frame on the native driver: opacity and transforms only', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    const fed = [...flat.matchAll(/(\w+): (?:num|deg)\(/g)].map(m => m[1]);
    expect(fed.length).toBeGreaterThan(0);
    for (const prop of fed)
      expect(['opacity', 'translateX', 'translateY', 'scale', 'rotate'], prop).toContain(prop);
  });

  it('holds still under reduce motion and in the amber night, and still marks the change', () => {
    expect(flat).toContain('const still = t.reduceMotion || t.isNight;');
    expect(flat).toContain('const plan = useRef(batonPlan(pass, still)).current;');
    expect(flat).toContain('if (!plan.animate) { landed.current?.(); return; }');
    expect(flat).toContain('new Animated.Value(plan.start)');
  });

  it('times the landing with the pass, and cancels both if the square goes away mid-flight', () => {
    expect(flat).toContain('setTimeout(() => landed.current?.(), delay + BATON_LAND_MS)');
    expect(flat).toContain('return () => { run.stop(); clearTimeout(timer); };');
  });

  it('wears the row’s own glyph: a moon for a night, a bell for the day', () => {
    expect(flat).toContain("<Icon name={night ? 'moon' : 'bell'} size={G.icon} color={ink} />");
    expect(flat).toContain('const fill = night ? t.color.sleepSoft : t.color.paper;');
    expect(flat).toContain('const ink = night ? t.color.sleep : t.color.text;');
  });

  it('asks for nothing Expo Go does not carry, and writes no color', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native'].includes(source ?? '') || /^\./.test(source ?? ''),
        source,
      ).toBe(true);
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    }
  });

  it('is exported with the design system’s other components', () => {
    expect(read('core.ts')).toContain("export * from './HandoffBaton';");
  });
});
