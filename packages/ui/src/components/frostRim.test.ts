/**
 * FROST AT THE RIM (the owner, 2026-09-25: frozen milk wears frost, "might not necessarily be
 * useful, but it's cool"; 2026-09-26: two weights of it, a freezer's and a deep freezer's heavier
 * one, among five place pictures). Where every piece sits and what it looks like at every point of
 * its three motions are PURE (`frostRim.ts`) and are sampled here exactly as
 * `Animated.Value#interpolate` would sample them. Which motion a picture plays, and what can only
 * be seen on a device — that the picture is behind the words, hidden from a screen reader, on the
 * native driver and still when it must be — are held by `placeRim.test.ts`, beside the component
 * that draws all five pictures (`interaction.test.ts` says why a tripwire is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SKINS } from '../theme/skins';
import { radius as baseRadius, space } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import {
  DEEP_FROST,
  DROP,
  DROP_MAX_STRETCH,
  FERN_STROKE,
  FROST_HOLD_MS,
  FROST_MIN_STRIP,
  FROST_MS,
  FROST_RECIPE,
  FROST_SIDES,
  FROST_SPECK,
  THAW_TRAIL,
  TRAIL_WIDTH,
  cornerClear,
  frostDrops,
  frostFrames,
  frostGeometry,
  glazeReach,
  type Box,
  type FrostCorners,
  type FrostGeometry,
  type FrostInset,
  type FrostRecipe,
  type FrostSide,
  type MotionFrames,
  type PieceFrames,
} from './frostRim';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');

/**
 * THE HOSTS IT IS PROVEN FOR. A stash row: `space.xl` in from each side, `space.lg` down from its
 * top. A place's header in the stash: `space.xl` all round. The container sheet's head: `space.xl`
 * and `space.md`. A narrower padding than any of them, so a caller with less room still gets frost
 * that fits it. And a card's empty right side (`placeRim.ts`, `rimZone`), as wide as it ever gets.
 */
const ROW: FrostInset = { x: space.xl, y: space.lg };
const HEADER: FrostInset = { x: space.xl, y: space.xl };
const HEAD: FrostInset = { x: space.xl, y: space.md };
const NARROW: FrostInset = { x: 10, y: space.md };
const ZONE: FrostInset = { x: 36, y: space.lg };
const RIMS = [ROW, HEADER, HEAD, NARROW] as const;
const RECIPES: readonly (readonly [string, FrostRecipe])[] = [
  ['freezer', FROST_RECIPE],
  ['deep freezer', DEEP_FROST],
];
/** Down both sides (a row), or down the right only (a card's empty right side). */
const SIDE_SETS: readonly (readonly FrostSide[])[] = [FROST_SIDES, ['right']];
/** Every strip height a host can give, half a point apart, from the smallest crystals are placed for. */
const STRIPS = Array.from(
  { length: (240 - FROST_MIN_STRIP) * 2 + 1 },
  (_, i) => FROST_MIN_STRIP + i / 2,
);
/**
 * The same heights a whole point apart, for the combinations added on 2026-09-26 (the deep frost,
 * one side, a header, a card's right side): the walks below build thousands of geometries, and a
 * suite running beside the others has to stay well inside the default timeout (master's own lesson,
 * 2026-09-25). The freezer's own hosts keep the half-point walk they were first proven at.
 */
const WHOLE = STRIPS.filter(s => Number.isInteger(s));
const built = new Map<string, FrostGeometry[]>();
/** Every geometry a host gives, built once for all the walks that read it. */
const geometries = (
  rim: FrostInset,
  recipe: FrostRecipe = FROST_RECIPE,
  sides: readonly FrostSide[] = FROST_SIDES,
  corners: FrostCorners | null = null,
): FrostGeometry[] => {
  const fine = recipe === FROST_RECIPE && sides.length === 2 && rim !== HEADER && rim !== ZONE;
  const key = JSON.stringify([rim, recipe === DEEP_FROST, sides, corners]);
  const had = built.get(key);
  if (had) return had;
  const made = (fine ? STRIPS : WHOLE).map(s =>
    frostGeometry(s + 2 * rim.y, rim, { recipe, sides, corners }),
  );
  built.set(key, made);
  return made;
};
/** Every host, every recipe, both side sets — and the right-only zone, as wide as it gets. */
const EVERY = [
  ...RIMS.flatMap(rim =>
    RECIPES.flatMap(([name, recipe]) => SIDE_SETS.map(sides => ({ rim, name, recipe, sides }))),
  ),
  ...RECIPES.map(([name, recipe]) => ({ rim: ZONE, name, recipe, sides: ['right'] as const })),
];

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

const STEPS = Array.from({ length: 1001 }, (_, i) => i / 1000);
const inside = (b: Box, w: number, h: number, slack = 1e-9) =>
  b.left >= -slack &&
  b.top >= -slack &&
  b.left + b.width <= w + slack &&
  b.top + b.height <= h + slack;
const overlap = (a: Box, b: Box) =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

/** Every piece's frames in one list, named, for the checks every frame must pass. */
function everyFrame(m: MotionFrames): [string, Frame][] {
  const piece = (name: string, p: PieceFrames): [string, Frame][] => [
    [`${name} opacity`, p.opacity],
    [`${name} scale`, p.scale],
  ];
  return [
    ...FROST_SIDES.flatMap(s => piece(`glaze ${s}`, m.glaze[s])),
    ...m.ferns.flatMap((p, i) => piece(`fern ${i}`, p)),
    ...m.sparkles.flatMap((p, i) => piece(`sparkle ${i}`, p)),
    ...m.drops.flatMap((d, i): [string, Frame][] => [
      [`drop ${i} opacity`, d.opacity],
      [`drop ${i} scale`, d.scale],
      [`drop ${i} y`, d.y],
      [`drop ${i} stretch`, d.stretch],
      [`drop ${i} trail`, d.trail],
      [`drop ${i} trail opacity`, d.trailOpacity],
    ]),
  ];
}

describe('where the frost is: in the host’s padding, beside its words and never under them', () => {
  it('lives in strips exactly as wide as the side padding and as tall as the content', () => {
    for (const rim of [...RIMS, ZONE])
      for (const s of [FROST_MIN_STRIP, 36, 58, 120]) {
        const g = frostGeometry(s + 2 * rim.y, rim);
        expect(g.strip).toEqual({ top: rim.y, height: s, width: rim.x });
      }
  });

  /*
    The walks below collect what is wrong and assert once: an `expect` per point, over every
    height of every host, is thousands of calls, and a suite running beside the others has to
    stay well inside the default timeout (master's own lesson, 2026-09-25).
  */
  const sparkleBox = (s: { cx: number; cy: number; size: number }): Box => ({
    left: s.cx - s.size / 2,
    top: s.cy - s.size / 2,
    width: s.size,
    height: s.size,
  });

  it('keeps every fern, glint and droplet inside its strip, for both frosts, at every height', () => {
    const wrong: string[] = [];
    for (const { rim, name, recipe, sides } of EVERY)
      for (const g of geometries(rim, recipe, sides)) {
        const { width: w, height: S } = g.strip;
        const at = `${name} ${rim.x}×${rim.y} ${sides.join('+')} strip ${S}`;
        const each = recipe.ferns.left.filter(p => !p.middle || S >= recipe.middleFrom).length;
        if (g.ferns.length !== each * sides.length) wrong.push(`${at}: ${g.ferns.length} ferns`);
        for (const fern of g.ferns) {
          if (!sides.includes(fern.side)) wrong.push(`${at}: a fern on the ${fern.side}`);
          if (!inside(fern.box, w, S)) wrong.push(`${at}: fern ${fern.side} outside`);
          // it grows FROM the edge, inward
          const edge = fern.side === 'left' ? fern.root.x : w - fern.root.x;
          if (edge > 1) wrong.push(`${at}: fern ${fern.side} root ${edge} from its edge`);
          if (Math.abs(fern.tip.x - fern.root.x) <= 5) wrong.push(`${at}: fern ${fern.side} short`);
        }
        for (const s of g.sparkles)
          if (!inside(sparkleBox(s), w, S)) wrong.push(`${at}: sparkle ${s.side} outside`);
        for (const d of g.drops) {
          // whole at both ends of its run, stretched as far as it ever is
          const half = (DROP.height / 2) * DROP_MAX_STRETCH;
          if (!sides.includes(d.side)) wrong.push(`${at}: a drop on the ${d.side}`);
          if (!(d.y1 > d.y0)) wrong.push(`${at}: drop runs up`);
          if (d.y0 - half < 0) wrong.push(`${at}: drop starts above the strip`);
          if (d.y1 + half > S) wrong.push(`${at}: drop ends below the strip`);
          if (d.x - DROP.width / 2 < 0 || d.x + DROP.width / 2 > w)
            wrong.push(`${at}: drop outside the strip's width`);
          if (d.x - TRAIL_WIDTH / 2 < 0) wrong.push(`${at}: trail outside`);
        }
      }
    expect(wrong).toEqual([]);
  });

  it('never lets two crystals land on one another', () => {
    const wrong: string[] = [];
    for (const { rim, name, recipe, sides } of EVERY)
      for (const g of geometries(rim, recipe, sides))
        for (const side of sides) {
          const ferns = g.ferns.filter(f => f.side === side);
          const at = `${name} ${rim.x}×${rim.y} strip ${g.strip.height} ${side}`;
          for (let i = 0; i < ferns.length; i += 1)
            for (let j = i + 1; j < ferns.length; j += 1)
              if (overlap(ferns[i]!.box, ferns[j]!.box)) wrong.push(`${at}: ferns overlap`);
          for (const s of g.sparkles.filter(x => x.side === side))
            for (const f of ferns)
              if (overlap(sparkleBox(s), f.box)) wrong.push(`${at}: sparkle on a fern`);
        }
    expect(wrong).toEqual([]);
  });

  it('has a glint each side on any row the stash draws, and drops that run a real distance', () => {
    // a two-line row at the smallest text a phone offers still has room between its ferns
    const wrong: string[] = [];
    for (const [name, recipe] of RECIPES)
      for (const s of STRIPS) {
        const g = frostGeometry(s + 2 * ROW.y, ROW, { recipe });
        if (g.sparkles.map(x => x.side).join() !== 'left,right')
          wrong.push(`${name} strip ${s}: glints`);
        for (const d of g.drops) if (d.y1 - d.y0 < 8) wrong.push(`strip ${s}: a short run`);
      }
    expect(wrong).toEqual([]);
  });

  it('draws the glaze out to the strip’s inner edge at mid-height and to nothing at its ends', () => {
    for (const g of geometries(ROW)) {
      for (const side of FROST_SIDES) {
        const edgeX = side === 'left' ? 0 : g.strip.width;
        const innerX = side === 'left' ? g.strip.width : 0;
        expect(glazeReach(g, side, { x: edgeX, y: g.glaze.cy })).toBe(0);
        expect(glazeReach(g, side, { x: innerX, y: g.glaze.cy })).toBeCloseTo(1, 9);
        expect(glazeReach(g, side, { x: edgeX, y: 0 })).toBeCloseTo(1, 9);
        expect(glazeReach(g, side, { x: edgeX, y: g.strip.height })).toBeCloseTo(1, 9);
      }
    }
  });

  it('shortens its crystals for a narrower padding, rather than letting them reach the words', () => {
    const wide = frostGeometry(60, ROW);
    const narrow = frostGeometry(60, NARROW);
    const reach = (g: FrostGeometry) => Math.max(...g.ferns.map(f => f.box.width));
    expect(reach(narrow)).toBeLessThan(reach(wide));
    expect(reach(narrow)).toBeLessThanOrEqual(NARROW.x);
  });

  it('draws only the glaze on a host too small for a crystal to sit in whole', () => {
    for (const [, recipe] of RECIPES) {
      const g = frostGeometry(FROST_MIN_STRIP - 1 + 2 * ROW.y, ROW, { recipe });
      expect(g.ferns).toEqual([]);
      expect(g.sparkles).toEqual([]);
      expect(g.drops).toEqual([]);
    }
  });
});

describe('a deep freezer’s frost is heavier: more ferns, where there is room for them', () => {
  it('grows three ferns a side where a freezer grows two, on every row tall enough to hold them', () => {
    for (const s of STRIPS) {
      const freezer = frostGeometry(s + 2 * ROW.y, ROW);
      const deep = frostGeometry(s + 2 * ROW.y, ROW, { recipe: DEEP_FROST });
      expect(freezer.ferns).toHaveLength(4);
      expect(deep.ferns, `strip ${s}`).toHaveLength(s >= DEEP_FROST.middleFrom ? 6 : 4);
    }
  });

  it('takes its middle ferns from a strip a two-line row gives at an ordinary text size', () => {
    // a use-first row is a 22 pt line and a 16 pt line: 38 between its paddings
    expect(DEEP_FROST.middleFrom).toBeLessThanOrEqual(38);
    expect(FROST_RECIPE.middleFrom).toBe(Number.POSITIVE_INFINITY);
    // and only a middle fern is ever left out
    for (const side of FROST_SIDES)
      expect(DEEP_FROST.ferns[side].filter(p => !p.middle)).toHaveLength(2);
  });

  it('leans its outer ferns further into the corners than a freezer’s', () => {
    for (const side of FROST_SIDES) {
      const [top, bottom] = DEEP_FROST.ferns[side].filter(p => !p.middle);
      const [ftop, fbottom] = FROST_RECIPE.ferns[side];
      expect(top!.at).toBeLessThan(ftop!.at);
      expect(bottom!.at).toBeGreaterThan(fbottom!.at);
    }
  });
});

describe('a picture down one side draws that side only', () => {
  it('puts every fern, glint and droplet on the right, and exactly the right side’s share', () => {
    for (const [, recipe] of RECIPES)
      for (const s of [30, 38, 60]) {
        const both = frostGeometry(s + 2 * ROW.y, ROW, { recipe });
        const right = frostGeometry(s + 2 * ROW.y, ROW, { recipe, sides: ['right'] });
        expect(right.ferns.every(f => f.side === 'right')).toBe(true);
        expect(right.ferns.map(f => f.box)).toEqual(
          both.ferns.filter(f => f.side === 'right').map(f => f.box),
        );
        expect(right.sparkles.map(x => x.side)).toEqual(['right']);
        expect(right.drops.map(d => d.side)).toEqual(['right']);
        expect(frostDrops(right.strip, ['right'])).toEqual(right.drops);
      }
  });
});

/**
 * THE ROUNDED CORNERS OF THE CARD A HOST IS IN. A stash row is the first or the last thing in its
 * card often enough — the top of Use first, a place's header — and a card does not clip what is
 * inside it (`Surface` keeps `overflow: 'visible'` for its shadow). So such a host says which of its
 * ends are the card's corners and its picture is clipped to them (`placeRim.ts`, `rimClip`); a row
 * in the middle is not clipped at all. The clip must only ever trim the glaze's thin tail, so every
 * crystal near such an end is PLACED clear of the arc (`clearBand`): proven here at every height,
 * for the roundest corner any skin draws on each host — a card's `m` on the rows, the headers and a
 * card's right side, and the sheet head's own `l`, which the glass skin makes 26 over 8 of padding
 * and which cut the freezer's own frost there before this rule was written (2026-09-26).
 */
describe('the frost keeps to a card’s rounded corners', () => {
  const R = (key: 'm' | 'l') =>
    Math.max(baseRadius[key], ...Object.values(SKINS).map(s => s.radius[key]));
  const HOSTS = [
    { rim: ROW, r: R('m'), sides: FROST_SIDES },
    { rim: HEADER, r: R('m'), sides: FROST_SIDES },
    { rim: ZONE, r: R('m'), sides: ['right'] as const },
    { rim: HEAD, r: R('l'), sides: FROST_SIDES },
  ];
  const round = (r: number): FrostCorners => ({ radius: r, top: true, bottom: true });
  /**
   * Whether a disc of radius `pad` round a point of a host (measured from the nearest corner)
   * reaches outside a card corner of radius r.
   */
  const outside = (r: number, x: number, y: number, pad = 0) =>
    x < r && y < r && Math.hypot(r - x, r - y) > r - pad + 1e-9;
  /** A point of a strip, folded into the corner nearest it: the four corners are one arc. */
  const folded = (g: FrostGeometry, side: 'left' | 'right', x: number, y: number) => {
    const H = g.strip.height + 2 * g.strip.top;
    const hy = g.strip.top + y;
    return [side === 'left' ? x : g.strip.width - x, Math.min(hy, H - hy)] as const;
  };

  it('finds the lowest a disc may sit under a corner: on the arc, and nowhere a corner is not', () => {
    for (const r of [15, 20, 26])
      for (const u of [0.5, 2, 6, 12])
        for (const pad of [0, 0.45, 1.8]) {
          const y = cornerClear(u, pad, r);
          if (u >= r) expect(y).toBe(0);
          else if (r - pad <= r - u) expect(y).toBe(r);
          else expect(Math.hypot(r - u, r - y)).toBeCloseTo(r - pad, 9);
        }
    expect(cornerClear(3, 0.5, 0)).toBe(0);
  });

  it('puts no stroke of a fern, no glint and no droplet outside the corner arc, at any height', () => {
    const out: string[] = [];
    for (const { rim, r, sides } of HOSTS)
      for (const [name, recipe] of RECIPES)
        for (const g of geometries(rim, recipe, sides, round(r))) {
          const at = `${name} ${rim.x}×${rim.y} strip ${g.strip.height}`;
          /*
            A stroke's two ends are enough. Where a disc of the stroke's half-width fits inside a
            rounded card is itself a convex shape (the card, eroded by the disc), and a straight
            stroke whose two ends are in a convex shape is in it all the way along.
          */
          for (const fern of g.ferns)
            for (const [p, q] of fern.segments)
              for (const e of [p, q]) {
                const [x, y] = folded(g, fern.side, e.x, e.y);
                // the stroke is a line FERN_STROKE wide with round caps: its edge is half of that out
                if (outside(r, x, y, FERN_STROKE / 2))
                  out.push(`${at} fern ${fern.side} at ${x},${y}`);
              }
          for (const s of g.sparkles) {
            // the sparkle's four points are the middles of its box's sides
            const edge = s.side === 'left' ? s.cx - s.size / 2 : s.cx + s.size / 2;
            for (const [x, y] of [
              folded(g, s.side, edge, s.cy),
              folded(g, s.side, s.cx, s.cy - s.size / 2),
            ])
              if (outside(r, x, y)) out.push(`${at} sparkle`);
          }
          for (const d of g.drops) {
            const half = (DROP.height / 2) * DROP_MAX_STRETCH;
            for (const y of [d.y0 - half, d.y1 + half]) {
              const [x, hy] = folded(g, d.side, d.x, y);
              if (outside(r, x, hy, DROP.width / 2)) out.push(`${at} drop`);
            }
          }
        }
    expect(out).toEqual([]);
  });
});

describe('the frames', () => {
  const cases = RECIPES.map(([name, recipe]) => {
    const g = frostGeometry(40 + 2 * ROW.y, ROW, { recipe });
    return { name, g, f: frostFrames(g) };
  });
  const { g, f } = cases[0]!;

  it('are frames Animated can read: in order, one output per input, inside the motion, clamped', () => {
    for (const c of cases)
      for (const motion of ['creep', 'melt', 'thaw'] as const)
        for (const [name, fr] of everyFrame(c.f[motion])) {
          const at = `${c.name} ${motion} ${name}`;
          expect(fr.inputRange.length, at).toBe(fr.outputRange.length);
          expect(fr.inputRange.length, at).toBeGreaterThanOrEqual(2);
          for (let i = 1; i < fr.inputRange.length; i += 1)
            expect(fr.inputRange[i] ?? 0, at).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
          expect(fr.inputRange[0] ?? -1, at).toBeGreaterThanOrEqual(0);
          expect(fr.inputRange[fr.inputRange.length - 1] ?? 2, at).toBeLessThanOrEqual(1);
          expect(fr.extrapolate, at).toBe('clamp');
        }
  });

  it('arrives from nothing and rests frosted: the still picture is the arrival’s last frame', () => {
    for (const c of cases) {
      const m = c.f.creep;
      for (const p of [m.glaze.left, m.glaze.right, ...m.ferns, ...m.sparkles]) {
        expect(sample(p.opacity, 0)).toBe(0);
        expect(sample(p.opacity, 1)).toBe(1);
        expect(sample(p.scale, 1)).toBe(1);
      }
      expect(m.drops).toEqual([]);
    }
  });

  it('melts from the frosted picture and rests with nothing left', () => {
    for (const c of cases) {
      const m = c.f.melt;
      for (const p of [m.glaze.left, m.glaze.right, ...m.ferns, ...m.sparkles]) {
        expect(sample(p.opacity, 0)).toBe(1);
        expect(sample(p.scale, 0)).toBe(1);
        expect(sample(p.opacity, 1)).toBe(0);
      }
      for (const d of m.drops) {
        expect(sample(d.opacity, 0)).toBe(0);
        expect(sample(d.opacity, 1)).toBe(0);
        expect(sample(d.trailOpacity, 1)).toBe(0);
      }
    }
  });

  it('thaws the same way, and leaves its water where it ran to: drops round, lines faint', () => {
    for (const c of cases) {
      const melt = c.f.melt;
      const thaw = c.f.thaw;
      // the ice goes exactly as it does in a melt
      expect(thaw.glaze).toEqual(melt.glaze);
      expect(thaw.ferns).toEqual(melt.ferns);
      expect(thaw.sparkles).toEqual(melt.sparkles);
      for (const [i, d] of thaw.drops.entries()) {
        const drop = c.g.drops[i]!;
        expect(sample(d.opacity, 0)).toBe(0);
        expect(sample(d.opacity, 1)).toBe(1);
        expect(sample(d.y, 1)).toBeCloseTo(drop.y1 - drop.y0, 9);
        expect(sample(d.stretch, 1)).toBe(1);
        expect(sample(d.scale, 1)).toBe(1);
        expect(sample(d.trail, 1)).toBe(1);
        expect(sample(d.trailOpacity, 1)).toBe(THAW_TRAIL);
        // and runs down exactly as the melt's does
        expect(d.y).toEqual(melt.drops[i]!.y);
      }
      expect(FROST_MS.thaw).toBe(FROST_MS.melt);
    }
    expect(THAW_TRAIL).toBeGreaterThan(0);
    expect(THAW_TRAIL).toBeLessThan(1);
  });

  it('holds still while the sheet that caused it slides away', () => {
    // BottomSheet's own slide, read from its source so the two cannot drift apart
    const slide = Number(/SHEET_DURATION_MS = (\d+)/.exec(read('BottomSheet.tsx'))?.[1]);
    expect(slide).toBeGreaterThan(0);
    expect(FROST_HOLD_MS).toBeGreaterThanOrEqual(slide);
    for (const c of cases)
      for (const motion of ['creep', 'melt', 'thaw'] as const) {
        const hold = FROST_HOLD_MS / FROST_MS[motion];
        const rest = motion === 'creep' ? 0 : 1;
        for (const p of STEPS.filter(x => x <= hold)) {
          const m = c.f[motion];
          for (const piece of [m.glaze.left, m.glaze.right, ...m.ferns, ...m.sparkles])
            expect(sample(piece.opacity, p), `${motion} at ${p}`).toBe(rest);
          for (const d of m.drops) expect(sample(d.opacity, p)).toBe(0);
        }
      }
  });

  it('never draws a piece at a scale of nothing: a zero scale is a transform with no inverse', () => {
    for (const c of cases)
      for (const motion of ['creep', 'melt', 'thaw'] as const)
        for (const [name, fr] of everyFrame(c.f[motion]))
          if (/scale|stretch|trail$/.test(name))
            for (const v of fr.outputRange)
              expect(v, `${motion} ${name}`).toBeGreaterThanOrEqual(FROST_SPECK);
  });

  it('arrives edges first: the fern furthest from the middle grows first, the glints last', () => {
    for (const c of cases) {
      const middle = c.g.strip.height / 2;
      const byStart = [...c.g.ferns].sort((a, b) => a.growAt - b.growAt);
      for (let i = 1; i < byStart.length; i += 1)
        expect(Math.abs(byStart[i]!.root.y - middle)).toBeLessThanOrEqual(
          Math.abs(byStart[i - 1]!.root.y - middle) + 1e-9,
        );
      // the glaze is already creeping in when the first fern starts
      expect(Math.min(...c.g.ferns.map(x => x.growAt))).toBeGreaterThan(FROST_HOLD_MS);
      // every fern has grown before the first glint twinkles — six of them as well as four
      const grown = Math.max(...c.f.creep.ferns.map(p => p.scale.inputRange.at(-1) ?? 0));
      const twinkle = Math.min(...c.f.creep.sparkles.map(p => p.opacity.inputRange[0] ?? 1));
      expect(twinkle, c.name).toBeGreaterThanOrEqual(grown);
    }
    expect(cases[1]!.g.ferns).toHaveLength(6);
  });

  it('melts from the middle out: the glints first, then the nearest fern, the glaze last', () => {
    for (const c of cases) {
      const middle = c.g.strip.height / 2;
      const byStart = [...c.g.ferns].sort((a, b) => a.meltAt - b.meltAt);
      for (let i = 1; i < byStart.length; i += 1)
        expect(Math.abs(byStart[i]!.root.y - middle) + 1e-9).toBeGreaterThanOrEqual(
          Math.abs(byStart[i - 1]!.root.y - middle),
        );
      // the moment ice starts to melt it stops shining: the glints go before any fern has moved,
      // and are out before the last fern starts
      const m = c.f.melt;
      const glintsFrom = Math.min(...m.sparkles.map(p => p.opacity.inputRange[0] ?? 1));
      const glintsOut = Math.max(...m.sparkles.map(p => p.opacity.inputRange.at(-1) ?? 1));
      const firstFern = Math.min(...m.ferns.map(p => p.scale.inputRange[0] ?? 0));
      const lastFern = Math.max(...m.ferns.map(p => p.scale.inputRange[0] ?? 0));
      expect(glintsFrom).toBeLessThan(firstFern);
      expect(glintsOut).toBeLessThan(lastFern);
      // the glaze starts to go after the first fern has, and is the last of the ice to leave
      const glazeFrom = m.glaze.left.scale.inputRange[0] ?? 0;
      const glazeGone = m.glaze.left.opacity.inputRange.at(-1) ?? 0;
      expect(glazeFrom).toBeGreaterThan(firstFern);
      for (const p of m.ferns) expect(p.opacity.inputRange.at(-1) ?? 1).toBeLessThan(glazeGone);
    }
  });

  it('anchors each fern at its root, inside the box it is drawn in', () => {
    // the drawing grows a fern about `origin` (`PlaceRim.tsx`, held by placeRim.test.ts)
    for (const c of cases)
      for (const fern of c.g.ferns) {
        expect(fern.origin.x).toBeCloseTo(fern.root.x - fern.box.left, 9);
        expect(fern.origin.y).toBeCloseTo(fern.root.y - fern.box.top, 9);
      }
  });

  it('twinkles each glint on once as the frost arrives, and leaves it lit', () => {
    for (const s of f.creep.sparkles) {
      const seen = STEPS.map(p => sample(s.opacity, p));
      const top = seen.findIndex(o => o > 0.99);
      expect(top).toBeGreaterThan(0);
      const after = seen.slice(top);
      expect(Math.min(...after)).toBeLessThan(0.5);
      expect(after.at(-1)).toBe(1);
      expect(Math.max(...STEPS.map(p => sample(s.scale, p)))).toBeGreaterThan(1);
    }
  });

  it('runs each droplet down once: it forms, hangs, falls faster as it goes, and dries', () => {
    const m = f.melt;
    expect(m.drops.length).toBeGreaterThanOrEqual(2);
    for (const [i, d] of m.drops.entries()) {
      const drop = g.drops[i]!;
      const ys = STEPS.map(p => sample(d.y, p));
      // down only, and all the way
      for (let k = 1; k < ys.length; k += 1)
        expect(ys[k]!).toBeGreaterThanOrEqual(ys[k - 1]! - 1e-9);
      expect(ys.at(-1)).toBeCloseTo(drop.y1 - drop.y0, 9);
      // it gathers speed: the second half of the fall is quicker than the first
      const fallFrom = d.y.inputRange[d.y.inputRange.length - 9] ?? 0;
      const fallTo = d.y.inputRange.at(-1) ?? 1;
      const mid = (fallFrom + fallTo) / 2;
      const first = sample(d.y, mid) - sample(d.y, fallFrom);
      const second = sample(d.y, fallTo) - sample(d.y, mid);
      expect(second).toBeGreaterThan(first);
      // seen once: its opacity rises to full and falls back to nothing, and never returns
      const o = STEPS.map(p => sample(d.opacity, p));
      const on = o.findIndex(v => v >= 1);
      const off = o.findIndex((v, k) => k > on && v <= 0);
      expect(on).toBeGreaterThan(0);
      expect(off).toBeGreaterThan(on);
      expect(Math.max(...o.slice(off))).toBe(0);
      // and its trail's foot is where the droplet is, all the way down
      for (const p of STEPS.filter(x => x >= fallFrom && x <= fallTo))
        expect(sample(d.trail, p) * (drop.y1 - drop.y0)).toBeCloseTo(sample(d.y, p), 6);
    }
    // they follow one another rather than falling together
    const starts = g.drops.map(d => d.at);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('keeps the droplets to the melt: nothing runs while the frost arrives', () => {
    expect(f.creep.drops).toHaveLength(0);
    expect(g.drops.every(d => d.at > FROST_HOLD_MS)).toBe(true);
  });

  it('draws the fern stroke the geometry padded its boxes for', () => {
    expect(read('PlaceRim.tsx').replace(/\s+/g, ' ')).toContain('strokeWidth={FERN_STROKE}');
    expect(FERN_STROKE).toBeLessThan(1);
  });
});
