/**
 * A DELETED ROW CRUMPLES INTO A PAPER BALL, AND UNDO UNCRUMPLES IT (the owner, 2026-09-26,
 * "agreed"). The plans, the frames, the drawings and the inks are PURE (`crumple.ts`) and held here;
 * that `CrumpleRow.tsx` puts the room on the JavaScript driver and nothing else, hides a crumpling
 * row from touch and from assistive technology, is two plain wrappers at rest, and plays nothing
 * under reduce motion or in the amber Night, is held by tripwires over its source (this suite has no
 * renderer — `interaction.test.ts`). The ball's edge and the creases are measured as graphics on
 * every ground the Log's page can be, in every skin, scheme and theme.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, contrastRatio, parseColor } from '../theme/contrast';
import { groundComposites, patternComposites } from '../theme/ground';
import { SKINS, skinForTheme, type SkinName } from '../theme/skins';
import { hit, resolvePalette, schemes, themeNames, type SchemeName } from '../theme/theme';
import {
  CRUMPLE_AFTER_SHEET_MS,
  CRUMPLE_BALL,
  CRUMPLE_BALL_CREASE_LINES,
  CRUMPLE_BALL_EDGE,
  CRUMPLE_BALL_OUTLINE,
  CRUMPLE_BALL_POINTS,
  CRUMPLE_BALL_POSE,
  CRUMPLE_CLOSE_LEAD,
  CRUMPLE_CLOSE_MS,
  CRUMPLE_CREASE_PLAN,
  CRUMPLE_DROP_FALL,
  CRUMPLE_DROP_LEAD,
  CRUMPLE_DROP_MS,
  CRUMPLE_DROP_ROLL,
  CRUMPLE_DROP_TURN,
  CRUMPLE_GONE,
  CRUMPLE_MS,
  CRUMPLE_OPEN_MS,
  CRUMPLE_REST,
  crumpleCreases,
  crumpleFrames,
  crumpleInks,
  crumplePlanMs,
  crumplePoseAt,
  planCrumple,
  planUncrumple,
  UNCRUMPLE_MS,
  UNCRUMPLE_WAIT,
  type CrumplePose,
} from './crumple';
import type { Frame } from './dayNightSwitch';
import { motionStill } from './tickDraw';

const here = dirname(fileURLToPath(import.meta.url));
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flat = (f: string) =>
  withoutComments(readFileSync(join(here, f), 'utf8')).replace(/\s+/g, ' ');

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

const STEPS = Array.from({ length: 201 }, (_, i) => i / 200);
/** Rows as the Log draws them: the 44 pt floor, one line of detail, two, a twin's name and a lock. */
const HEIGHTS = [hit.min, 52, 64, 78, 96];
/** The list's width on a 320, a 390 and a 430 pt phone, less the page's gutters. */
const WIDTHS = [284, 354, 394];

describe('the crumple’s clock', () => {
  it('squeezes in 260, drops as the ball lands, closes as it fades: 640 ms in all', () => {
    const p = planCrumple(CRUMPLE_REST);
    expect(CRUMPLE_MS).toBe(260);
    expect(p.c).toMatchObject({ from: 0, to: 1, delay: 0, duration: CRUMPLE_MS });
    expect(p.d).toMatchObject({
      from: 0,
      to: 1,
      delay: CRUMPLE_MS - CRUMPLE_DROP_LEAD,
      duration: CRUMPLE_DROP_MS,
    });
    expect(p.e).toMatchObject({
      from: 1,
      to: 0,
      delay: CRUMPLE_MS - CRUMPLE_DROP_LEAD + CRUMPLE_DROP_MS - CRUMPLE_CLOSE_LEAD,
      duration: CRUMPLE_CLOSE_MS,
    });
    expect(crumplePlanMs(p)).toBe(640);
  });

  it('never delays the delete: the plan is a drawing, and a sheet leaving only shifts it', () => {
    const late = planCrumple(CRUMPLE_REST, CRUMPLE_AFTER_SHEET_MS);
    const now = planCrumple(CRUMPLE_REST);
    for (const k of ['c', 'd', 'e'] as const) {
      expect(late[k].delay - now[k].delay, k).toBe(CRUMPLE_AFTER_SHEET_MS);
      expect(late[k].duration, k).toBe(now[k].duration);
    }
    expect(CRUMPLE_AFTER_SHEET_MS).toBeLessThan(220);
  });

  it('uncrumples in 300 ms once the room has begun to open, the ball seen as a ball first', () => {
    const p = planUncrumple(CRUMPLE_BALL_POSE);
    expect(UNCRUMPLE_MS).toBe(300);
    expect(p.e).toMatchObject({ from: 0, to: 1, delay: 0, duration: CRUMPLE_OPEN_MS });
    expect(p.c).toMatchObject({ from: 1, to: 0, delay: UNCRUMPLE_WAIT, duration: UNCRUMPLE_MS });
    // the ball is already in its place: nothing to roll back
    expect(p.d.duration).toBe(0);
    expect(UNCRUMPLE_WAIT).toBeLessThan(CRUMPLE_OPEN_MS);
    expect(crumplePlanMs(p)).toBe(UNCRUMPLE_WAIT + UNCRUMPLE_MS);
  });

  it('turns round from where it is: an Undo mid-squeeze unfolds at once, and in less time', () => {
    const half: CrumplePose = { c: 0.5, d: 0, e: 1 };
    const back = planUncrumple(half);
    // there is room already: no wait, no opening
    expect(back.e.duration).toBe(0);
    expect(back.c).toMatchObject({ from: 0.5, to: 0, delay: 0 });
    expect(back.c.duration).toBe(Math.round(UNCRUMPLE_MS / 2));
    // a ball already falling rolls back as it unfolds
    const falling = planUncrumple({ c: 1, d: 0.4, e: 1 });
    expect(falling.d).toMatchObject({ from: 0.4, to: 0, delay: 0 });
    expect(falling.d.duration).toBe(Math.round(CRUMPLE_DROP_MS * 0.4));
  });

  it('and a delete again mid-unfold goes back from there, never from the start', () => {
    const p = planCrumple({ c: 0.3, d: 0, e: 0.6 });
    expect(p.c).toMatchObject({ from: 0.3, to: 1, delay: 0 });
    expect(p.c.duration).toBe(Math.round(CRUMPLE_MS * 0.7));
    expect(p.e).toMatchObject({ from: 0.6, to: 0 });
    expect(p.e.duration).toBe(Math.round(CRUMPLE_CLOSE_MS * 0.6));
  });

  it('knows where it is on the way: the pose at the start is where it set off, at the end where it rests', () => {
    for (const [plan, from, to] of [
      [planCrumple(CRUMPLE_REST), CRUMPLE_REST, CRUMPLE_GONE],
      [planUncrumple(CRUMPLE_BALL_POSE), CRUMPLE_BALL_POSE, CRUMPLE_REST],
    ] as const) {
      expect(crumplePoseAt(plan, 0)).toEqual(from);
      expect(crumplePoseAt(plan, crumplePlanMs(plan))).toEqual(to);
      // every value moves one way only
      let prev = crumplePoseAt(plan, 0);
      for (let ms = 0; ms <= crumplePlanMs(plan); ms += 5) {
        const now = crumplePoseAt(plan, ms);
        for (const k of ['c', 'd', 'e'] as const) {
          const dir = Math.sign(to[k] - from[k]);
          expect((now[k] - prev[k]) * dir, `${k} at ${ms}`).toBeGreaterThanOrEqual(-1e-9);
        }
        prev = now;
      }
    }
  });
});

describe('the frames', () => {
  it('packs the row down to the ball’s own size on both axes, from its whole self', () => {
    for (const w of WIDTHS)
      for (const h of HEIGHTS) {
        const f = crumpleFrames(w, h).content;
        expect(sample(f.scaleX, 0)).toBe(1);
        expect(sample(f.scaleY, 0)).toBe(1);
        expect(sample(f.scaleX, 1) * w).toBeCloseTo(CRUMPLE_BALL, 6);
        expect(sample(f.scaleY, 1) * h).toBeCloseTo(CRUMPLE_BALL, 6);
        // it only ever gets smaller on the way
        for (const p of STEPS) {
          expect(sample(f.scaleX, p)).toBeLessThanOrEqual(1);
          expect(sample(f.scaleY, p)).toBeLessThanOrEqual(1);
          expect(sample(f.scaleX, p)).toBeGreaterThan(0);
        }
      }
  });

  it('fades the row’s words out as the ball fades in over the last of it: never two things at once, never nothing', () => {
    const f = crumpleFrames(354, 64);
    expect(sample(f.content.opacity, 0)).toBe(1);
    expect(sample(f.content.opacity, 1)).toBe(0);
    expect(sample(f.ball.opacity, 0)).toBe(0);
    expect(sample(f.ball.opacity, 1)).toBe(1);
    for (const p of STEPS) {
      const row = sample(f.content.opacity, p);
      const ball = sample(f.ball.opacity, p);
      // something is always there to look at
      expect(Math.max(row, ball, sample(f.creases.opacity, p)), `at ${p}`).toBeGreaterThan(0.25);
      // the ball is never drawn over the row's own words at full strength
      expect(Math.min(row, ball), `at ${p}`).toBeLessThanOrEqual(0.3);
    }
    // the creases come and go inside the squeeze
    expect(sample(f.creases.opacity, 0)).toBe(0);
    expect(sample(f.creases.opacity, 1)).toBe(0);
    // the ball lands at its own size, upright
    expect(sample(f.ball.scale, 1)).toBe(1);
    expect(sample(f.ball.rotate, 1)).toBe(0);
    // and the squeeze ends square: no skew left on the ball it became
    expect(sample(f.content.skewX, 1)).toBe(0);
  });

  it('drops a little, onto the floor of the shortest row and never through it, and rolls without slipping', () => {
    const f = crumpleFrames(354, hit.min).drop;
    expect(sample(f.y, 0)).toBe(0);
    expect(sample(f.y, 1)).toBe(CRUMPLE_DROP_FALL);
    // from the middle of a 44 pt row, the ball's foot lands on the floor at most
    expect(hit.min / 2 + CRUMPLE_BALL / 2 + CRUMPLE_DROP_FALL).toBeLessThanOrEqual(hit.min);
    // a fall: slow off the mark, faster as it goes
    const quarter = sample(f.y, 0.25);
    const last = sample(f.y, 1) - sample(f.y, 0.75);
    expect(last).toBeGreaterThan(quarter);
    // the turn is the distance over the radius: a ball rolling, not sliding
    expect(CRUMPLE_DROP_TURN).toBe(
      Math.round(((CRUMPLE_DROP_ROLL / (CRUMPLE_BALL / 2)) * 180) / Math.PI),
    );
    expect(sample(f.rotate, 1)).toBe(CRUMPLE_DROP_TURN);
    expect(sample(f.x, 1)).toBe(CRUMPLE_DROP_ROLL);
    expect(sample(f.opacity, 1)).toBe(0);
  });

  it('closes the room from the row’s own height to nothing', () => {
    for (const h of HEIGHTS) {
      const f = crumpleFrames(354, h).height;
      expect(sample(f, 1)).toBe(h);
      expect(sample(f, 0)).toBe(0);
    }
    // a row not yet measured takes no room
    expect(sample(crumpleFrames(Number.NaN, Number.NaN).height, 1)).toBe(0);
  });
});

describe('the drawings', () => {
  /** Whether a point is inside a polygon (even-odd). */
  const inside = (
    [x, y]: readonly [number, number],
    poly: readonly (readonly [number, number])[],
  ) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, yi] = poly[i] ?? [0, 0];
      const [xj, yj] = poly[j] ?? [0, 0];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  it('draws the ball whole inside its 24 pt box, stroke and all, as a closed outline', () => {
    const half = CRUMPLE_BALL_EDGE / 2;
    for (const [x, y] of CRUMPLE_BALL_POINTS) {
      expect(x).toBeGreaterThanOrEqual(half);
      expect(y).toBeGreaterThanOrEqual(half);
      expect(x).toBeLessThanOrEqual(CRUMPLE_BALL - half);
      expect(y).toBeLessThanOrEqual(CRUMPLE_BALL - half);
    }
    expect(CRUMPLE_BALL_OUTLINE.endsWith('Z')).toBe(true);
    // round enough to read as a ball: every corner within a few points of one circle
    const radii = CRUMPLE_BALL_POINTS.map(([x, y]) => Math.hypot(x - 12, y - 12));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThanOrEqual(2);
  });

  it('keeps every crease inside the ball', () => {
    for (const line of CRUMPLE_BALL_CREASE_LINES)
      for (const p of line) expect(inside(p, CRUMPLE_BALL_POINTS), `${p.join(',')}`).toBe(true);
  });

  it('creases a row inside its own box, the same way every time', () => {
    for (const w of WIDTHS)
      for (const h of HEIGHTS) {
        const lines = crumpleCreases(w, h);
        expect(lines).toHaveLength(CRUMPLE_CREASE_PLAN.length);
        for (const d of lines) {
          const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
          for (let i = 0; i < nums.length; i += 2) {
            expect(nums[i]).toBeGreaterThanOrEqual(0);
            expect(nums[i]).toBeLessThanOrEqual(w);
            expect(nums[i + 1]).toBeGreaterThanOrEqual(0);
            expect(nums[i + 1]).toBeLessThanOrEqual(h);
          }
        }
        expect(crumpleCreases(w, h)).toEqual(lines);
      }
  });
});

/*
  THE BALL CAN BE SEEN, on every ground the Log's page can be — the paper, the lit ground of a
  glass household, the doodle pattern over either — in every skin, scheme and theme; and its creases
  on its own paper. The night palette is measured too, though nothing is drawn there (below).
*/
describe('the paper ball’s inks', () => {
  const SKIN_NAMES = Object.keys(SKINS) as SkinName[];
  const SCHEMES = Object.keys(schemes) as SchemeName[];

  it('draws the edge and the creases at 3:1 or better on every ground the page can be', () => {
    let checked = 0;
    for (const theme of themeNames)
      for (const scheme of SCHEMES)
        for (const skin of SKIN_NAMES) {
          const p = resolvePalette(theme, scheme);
          const tokens = skinForTheme(SKINS[skin], theme);
          const grounds = [
            p.paper,
            p.app,
            p.surfaceSolid,
            ...Object.values(patternComposites(p, tokens, theme) ?? {}),
            ...Object.values(groundComposites(p, tokens) ?? {}),
          ];
          const inks = crumpleInks(p);
          for (const ground of grounds)
            for (const [what, ink] of [
              ['edge', inks.edge],
              ['crease', inks.crease],
            ] as const) {
              expect(
                contrastRatio(ink, ground),
                `${theme}/${scheme}/${skin}: ${what} on ${ground}`,
              ).toBeGreaterThanOrEqual(AA_GRAPHIC);
              checked += 1;
            }
          // the creases on the ball's own paper
          expect(
            contrastRatio(inks.crease, inks.paper),
            `${theme}/${scheme}`,
          ).toBeGreaterThanOrEqual(AA_GRAPHIC);
        }
    expect(checked).toBeGreaterThan(themeNames.length * SCHEMES.length * SKIN_NAMES.length * 6);
  });

  it('is the palette’s own roles, opaque, and no color of its own', () => {
    for (const theme of themeNames)
      for (const scheme of SCHEMES) {
        const p = resolvePalette(theme, scheme);
        const own = new Set(Object.values(p));
        for (const ink of Object.values(crumpleInks(p))) {
          expect(own.has(ink), `${theme}/${scheme} ${ink}`).toBe(true);
          expect(parseColor(ink).a).toBe(1);
        }
      }
  });

  it('plays nothing under reduce motion, and nothing at all in the amber Night', () => {
    for (const theme of themeNames) {
      expect(motionStill(true, theme)).toBe(true);
      expect(motionStill(false, theme)).toBe(theme === 'night');
    }
  });
});

describe('CrumpleRow (tripwires over the source)', () => {
  const src = flat('CrumpleRow.tsx');

  it('puts the room on the JavaScript driver, and the squeeze and the ball on the native one', () => {
    expect(src).toContain('timing(c, plan.c, true)');
    expect(src).toContain('timing(d, plan.d, true)');
    expect(src).toContain('timing(e, plan.e, false)');
    expect(src.match(/timing\([cde], plan\.[cde], (true|false)\)/g)).toHaveLength(3);
    // the room is the one value laid out: a height, and nothing else rides `e`
    expect(src).toContain('room: { height: num(e, frames.height) }');
    expect(src.match(/num\(e,|deg\(e,/g)).toHaveLength(1);
  });

  it('is two plain wrappers at rest: no clip, no transform, no paper — and nothing built for it', () => {
    expect(src).toContain("const moving = phase !== 'rest' && !still;");
    expect(src).toContain('const anim = useMemo(() => { if (!moving) return null;');
    expect(src).toContain('style={anim !== null ? [styles.room, anim.room] : null}');
    expect(src).toContain('style={anim !== null ? anim.content : null}');
    expect(src).toContain('{anim !== null && size !== null ? (');
  });

  it('takes a crumpling row out of reach of touch and of screen readers from its first frame', () => {
    expect(src).toContain("const gone = phase === 'crumpling';");
    expect(src).toContain("pointerEvents={gone ? 'none' : 'auto'}");
    expect(src).toContain(
      "{...(gone ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, } : {})}",
    );
    // the paper and the ball are never anything but a drawing
    expect(
      src.match(
        /pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"/g,
      ),
    ).toHaveLength(2);
  });

  it('under reduce motion and in the amber Night, lands at once and says so', () => {
    expect(src).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(src).toContain(
      "if (still || (size === null && phase === 'crumpling')) { land(phase === 'crumpling' ? CRUMPLE_GONE : CRUMPLE_REST); settledRef.current?.(phase); return undefined; }",
    );
  });

  it('turns round from where it is, and a row that arrives unfolding starts as the ball', () => {
    expect(src).toContain(
      'const from = m === null ? resting.current : crumplePoseAt(m.plan, now - m.startedAt);',
    );
    expect(src).toMatch(
      /useState<CrumplePose>\(\(\) =>\s*\(?phase === 'uncrumpling' \? CRUMPLE_BALL_POSE : CRUMPLE_REST/,
    );
  });

  it('draws in the palette’s inks, and is felt as nothing', () => {
    expect(src).toContain('const inks = crumpleInks(t.color);');
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(src).not.toContain('haptic(');
  });
});
