/**
 * THE PAPER PLANE SHARE THROWS (the owner, 2026-09-25, of the "that's cool" list; made to be SEEN on
 * 2026-09-26: *"the share button animation looks very minimal, like its not showing anything. make it
 * look more better and feel better"*). The drawings, the fold, the flight, the trail and the launch
 * are PURE (`paperPlane.ts`) and sampled here exactly as `Animated.Value#interpolate` samples them;
 * that the plane is decoration, runs on the native driver one turn per view, measures itself against
 * the button on the throw, and never draws under reduce motion or in the amber night is held by
 * tripwires over `PaperPlane.tsx`, since this suite has no renderer (`interaction.test.ts`).
 *
 * THE PROMISES THAT MATTER MOST: it is big enough and long enough to be seen, out from under the
 * thumb and on the page; it is short, because the share sheet waits for it to be gone (the owner,
 * 2026-09-26: *"can we wait until animation complete, then pop up show up?"*); and nothing of it is
 * left once it has gone.
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
import { hit, space, themeNames } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import {
  CORNER,
  CORNER_AT,
  CORNER_MS,
  CREASE_Y,
  distanceAt,
  DRAWN_HEADING,
  FOLD_SPOT,
  LAUNCH_HEADING,
  LOOP_RADIUS,
  mirrorAcross,
  paperPlaneFrames,
  PLANE_BANK,
  PLANE_BOX,
  PLANE_CORNERS,
  PLANE_CREASE_MS,
  PLANE_FADE_MS,
  PLANE_FOLDED_MS,
  PLANE_GRID,
  PLANE_LAUNCH_MS,
  PLANE_LEGS,
  PLANE_MS,
  PLANE_NOSE,
  PLANE_NOTCH,
  PLANE_OPEN_MS,
  PLANE_PATH_LENGTH,
  PLANE_TAIL,
  PLANE_UNIT,
  PLANE_WING_TIP,
  planeLaunch,
  planeOrigin,
  planePoint,
  planeTrail,
  SHARE_SAFETY_MS,
  SHEET,
  SHEET_CREASE_PATH,
  SHEET_OUT_MS,
  timeAt,
  TRAIL_BEHIND,
  TRAIL_DOT,
  TRAIL_GAP,
  TRAIL_LIFE_MS,
  WIND_BACK,
  WIND_SPOT,
} from './paperPlane';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('PaperPlane.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('paperPlane.ts'));

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

const f = paperPlaneFrames();
const trail = planeTrail();
/** Sampled at a millisecond from the tap, as the one animated value is. */
const at = (fr: Frame, ms: number): number => sample(fr, ms / PLANE_MS);
const EVERY_MS = Array.from({ length: PLANE_MS + 1 }, (_, i) => i);
const rad = (deg: number) => (deg * Math.PI) / 180;
/** How much of a face shows at a turn of `deg` about its crease: all of it flat, none edge on. */
const faceOn = (deg: number) => Math.abs(Math.cos(rad(deg)));

type Pt = readonly [number, number];
const PLANE_POINTS: readonly Pt[] = [PLANE_NOSE, PLANE_WING_TIP, PLANE_NOTCH, PLANE_TAIL];
const SHEET_POINTS: readonly Pt[] = [
  [SHEET.left, SHEET.top],
  [SHEET.right, SHEET.top],
  [SHEET.right, SHEET.bottom],
  [SHEET.left, SHEET.bottom],
];
/**
 * Grid points as the box draws them at `ms`, in points from the glyph's center: scaled about the
 * box's center (`scaleY` and `scaleX` first, then `scale`), turned, then moved — the order React
 * Native applies the box's transform list in.
 */
function drawn(points: readonly Pt[], ms: number): [number, number][] {
  const [x, y, turn, s, sx, sy] = [f.x, f.y, f.turn, f.scale, f.scaleX, f.scaleY].map(fr =>
    at(fr, ms),
  ) as [number, number, number, number, number, number];
  const [c, sn] = [Math.cos(rad(turn)), Math.sin(rad(turn))];
  return points.map(([gx, gy]) => {
    const u = (gx - PLANE_GRID / 2) * PLANE_UNIT * s * sx;
    const v = (gy - PLANE_GRID / 2) * PLANE_UNIT * s * sy;
    return [x + u * c - v * sn, y + u * sn + v * c];
  });
}
/** Whatever of the paper is showing at `ms`: the sheet until the swap, the plane after it. */
const paperAt = (ms: number) => drawn(ms < PLANE_FOLDED_MS ? SHEET_POINTS : PLANE_POINTS, ms);

/**
 * THE PAGE AROUND THE BUTTON, from its glyph's center. The Share button is the first row of the
 * shopping list: the page's top edge is `space.sm` over a title row at least `hit.min` tall, whose
 * middle the button sits on; its left edge is its padding and half its 18 pt glyph left of it.
 */
const PAGE_TOP = -(space.sm + hit.min / 2);
const BUTTON_LEFT = -(space.xl + 18 / 2);
/**
 * Where the glyph is on phones the list is used on, from the screen's left edge: the gutter, and the
 * button — its padding either side, the glyph, the gap and "Share", 30 pt at the least.
 */
const PHONES = [360, 375, 390, 414, 430];
const glyphFromLeft = (width: number) =>
  width - space.xxl - (2 * space.xl + 18 + space.sm + 30) + space.xl + 18 / 2;
/** How far down the page the plane may go: the platform's share sheet rises over the lower half. */
const SHEET_RISES_BELOW = 130;

const legStart = (name: string): number => {
  let s = 0;
  for (const leg of PLANE_LEGS) {
    if (leg.name === name) return s;
    s += leg.length;
  }
  throw new Error(name);
};
const LOOP = PLANE_LEGS.find(l => l.name === 'loop');
const LOOP_FROM = legStart('loop');
const LOOP_TO = LOOP_FROM + (LOOP?.length ?? 0);
const AWAY_FROM = legStart('away');
/** How fast the plane is going at `ms`, in points a millisecond. */
const speed = (ms: number) => (distanceAt(ms + 0.5) - distanceAt(ms - 0.5)) / 1;

describe('the drawings', () => {
  it('is big enough to be seen from arm’s length: the sheet and the plane about 40 pt across', () => {
    expect((SHEET.right - SHEET.left) * PLANE_UNIT).toBeGreaterThanOrEqual(36);
    const length = (Math.max(...PLANE_POINTS.map(p => p[0])) - PLANE_NOSE[0]) * PLANE_UNIT;
    expect(length).toBeGreaterThanOrEqual(40);
    expect(length).toBeLessThanOrEqual(56);
    // and the whole of each drawing is inside the box, on the icon set's grid
    for (const [x, y] of [...PLANE_POINTS, ...SHEET_POINTS]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(PLANE_GRID);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(PLANE_GRID);
    }
    expect(PLANE_UNIT).toBe(PLANE_BOX / PLANE_GRID);
  });

  it('draws a plane pointing left, where it is thrown: the nose first, the wing above, the fold below', () => {
    expect(Math.min(...PLANE_POINTS.map(p => p[0]))).toBe(PLANE_NOSE[0]);
    expect(PLANE_WING_TIP[1]).toBeLessThan(CREASE_Y);
    expect(PLANE_TAIL[1]).toBeGreaterThan(CREASE_Y);
    expect(DRAWN_HEADING).toBe(180);
    // the notch between the wing's tip and the tail is what makes it read as a paper plane
    expect(PLANE_NOTCH[0]).toBeLessThan(PLANE_WING_TIP[0]);
    expect(PLANE_NOTCH[0]).toBeLessThan(PLANE_TAIL[0]);
  });

  it('folds along one line: the sheet’s crease, the plane’s and the box’s middle are the same', () => {
    expect(CREASE_Y).toBe(PLANE_GRID / 2);
    expect(PLANE_NOSE[1]).toBe(CREASE_Y);
    expect(PLANE_NOTCH[1]).toBe(CREASE_Y);
    expect(SHEET_CREASE_PATH).toBe(`M${SHEET.left} ${CREASE_Y}L${SHEET.right} ${CREASE_Y}`);
    expect((SHEET.top + SHEET.bottom) / 2).toBe(CREASE_Y);
  });

  it('folds each front corner in to the crease, where the two meet as the nose of a dart', () => {
    for (const c of [PLANE_CORNERS.top, PLANE_CORNERS.bottom]) {
      // the fold line runs from the nose on the crease to the sheet's long edge, a corner along
      expect(c.line).toContainEqual([SHEET.left, CREASE_Y]);
      expect(c.square.size).toBe(CORNER);
      expect(CORNER).toBe((SHEET.bottom - SHEET.top) / 2);
      // it is a diagonal of the corner's square, and the corner is the half of it off the sheet
      const [[x0, y0], [x1, y1]] = c.line;
      expect(Math.abs(x1 - x0)).toBe(c.square.size);
      expect(Math.abs(y1 - y0)).toBe(c.square.size);
      // folded, the corner lies on the sheet, its tip on the crease
      for (const [x, y] of c.folded) {
        expect(x).toBeGreaterThanOrEqual(SHEET.left);
        expect(x).toBeLessThanOrEqual(SHEET.left + CORNER);
        expect(y).toBeGreaterThanOrEqual(SHEET.top);
        expect(y).toBeLessThanOrEqual(SHEET.bottom);
      }
      expect(c.folded).toContainEqual([SHEET.left + CORNER, CREASE_Y]);
      expect(c.folded).toEqual(c.flat.map(p => mirrorAcross(p, c.line[0], c.line[1])));
    }
  });

  it('turns each corner about its fold line: the vertical, turned by the tilt, runs along it', () => {
    for (const c of [PLANE_CORNERS.top, PLANE_CORNERS.bottom]) {
      const a = rad(c.tilt);
      // `rotate` is clockwise on a screen whose y runs down: the vertical (0, 1) goes to this
      const axis = [-Math.sin(a), Math.cos(a)] as const;
      const [[x0, y0], [x1, y1]] = c.line;
      expect(axis[0] * (y1 - y0) - axis[1] * (x1 - x0), c.name).toBeCloseTo(0, 9);
    }
  });

  it('lifts each corner toward the eye: in its turned frame the corner is on the side rotateY brings forward', () => {
    // React Native's rotateY (Transform::RotateY) sends a point at x to depth −x·sin θ: for a
    // positive turn the side at negative x comes toward the camera
    for (const c of [PLANE_CORNERS.top, PLANE_CORNERS.bottom]) {
      const [cx, cy] = [c.square.x + c.square.size / 2, c.square.y + c.square.size / 2];
      const mid = c.flat.reduce(([sx, sy], [x, y]) => [sx + x / 3, sy + y / 3], [0, 0]);
      const a = rad(-c.tilt);
      const [dx, dy] = [(mid[0] ?? 0) - cx, (mid[1] ?? 0) - cy];
      expect(dx * Math.cos(a) - dy * Math.sin(a), c.name).toBeLessThan(0);
    }
  });
});

describe('the fold', () => {
  it('answers the tap at once: the paper is out of the glyph and showing within the first frame', () => {
    expect(at(f.opacity, 0)).toBe(0);
    expect(at(f.opacity, 16)).toBe(1);
    expect(at(f.sheetOpacity, 0)).toBe(1);
    // it starts ON the glyph, no bigger than it
    expect(at(f.x, 0)).toBeCloseTo(0, 9);
    expect(at(f.y, 0)).toBeCloseTo(0, 9);
    expect((SHEET.right - SHEET.left) * PLANE_UNIT * at(f.scale, 0)).toBeLessThanOrEqual(18);
  });

  it('is out from under the thumb within 45 ms, and folds clear of the button', () => {
    const rightmost = (ms: number) => Math.max(...paperAt(ms).map(p => p[0]));
    for (const ms of EVERY_MS.filter(ms => ms >= 45 && ms <= PLANE_LAUNCH_MS))
      expect(rightmost(ms), `${ms} ms`).toBeLessThan(BUTTON_LEFT);
    // and, once it is there, a clear gap from the button while it folds and is drawn back
    for (const ms of EVERY_MS.filter(ms => ms >= SHEET_OUT_MS && ms <= PLANE_LAUNCH_MS))
      expect(rightmost(ms), `${ms} ms`).toBeLessThan(BUTTON_LEFT - 6);
    // it arrives where it folds, full size, and is held there while it does
    expect(at(f.x, SHEET_OUT_MS)).toBeCloseTo(FOLD_SPOT.x, 9);
    expect(at(f.y, SHEET_OUT_MS)).toBeCloseTo(FOLD_SPOT.y, 9);
    expect(at(f.scale, SHEET_OUT_MS)).toBe(1);
    expect(at(f.x, PLANE_OPEN_MS)).toBeCloseTo(FOLD_SPOT.x, 9);
    expect(at(f.y, PLANE_OPEN_MS)).toBeCloseTo(FOLD_SPOT.y, 9);
  });

  it('folds in steps that are each seen, a fifth of a second in all', () => {
    const { top, bottom } = f.corners;
    // the sheet, whole and flat, out of the button
    expect(at(top.lift, SHEET_OUT_MS)).toBe(0);
    expect(at(top.liftOpacity, SHEET_OUT_MS)).toBe(1);
    expect(at(f.sheetHalve, SHEET_OUT_MS)).toBe(0);
    // the corners in, one after the other: the nose of a dart, before anything else moves
    expect(CORNER_AT.bottom - CORNER_AT.top).toBeGreaterThanOrEqual(15);
    const cornersIn = CORNER_AT.bottom + CORNER_MS;
    for (const k of [top, bottom]) {
      expect(at(k.land, cornersIn)).toBe(0);
      expect(at(k.landOpacity, cornersIn)).toBe(1);
      expect(at(k.liftOpacity, cornersIn)).toBe(0);
    }
    expect(at(f.sheetHalve, cornersIn)).toBe(0);
    // then in half, edge on, and the plane open out of the same line
    expect(at(f.sheetHalve, PLANE_FOLDED_MS)).toBe(90);
    expect(at(f.planeOpen, PLANE_OPEN_MS)).toBe(0);
    expect(at(f.planeOpacity, PLANE_OPEN_MS)).toBe(1);
    expect(at(f.sheetOpacity, PLANE_OPEN_MS)).toBe(0);
    expect(PLANE_OPEN_MS).toBeGreaterThanOrEqual(200);
    expect(PLANE_OPEN_MS).toBeLessThanOrEqual(300);
  });

  it('never shows two drawings of one piece of paper: every swap is made edge on', () => {
    for (const k of [f.corners.top, f.corners.bottom])
      for (const ms of EVERY_MS) {
        const seen = at(k.liftOpacity, ms) * faceOn(at(k.lift, ms));
        const after = at(k.landOpacity, ms) * faceOn(at(k.land, ms));
        expect(seen + after, `corner at ${ms}`).toBeLessThanOrEqual(1 + 1e-9);
      }
    for (const ms of EVERY_MS) {
      const seen =
        at(f.sheetOpacity, ms) * faceOn(at(f.sheetHalve, ms)) +
        at(f.planeOpacity, ms) * faceOn(at(f.planeOpen, ms));
      expect(seen, `sheet and plane at ${ms}`).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(at(f.planeOpen, PLANE_FOLDED_MS)).toBe(-90);
  });

  it('keeps every 3-D turn inside ±90°, where Android reads it back without ambiguity', () => {
    const turns = [
      f.sheetHalve,
      f.planeOpen,
      ...[f.corners.top, f.corners.bottom].flatMap(k => [k.lift, k.land]),
    ];
    for (const fr of turns)
      for (const d of fr.outputRange) {
        expect(d).toBeGreaterThanOrEqual(-90);
        expect(d).toBeLessThanOrEqual(90);
      }
  });

  it('is drawn back before it is thrown: away from where it goes, nose up, squashed, then stretched', () => {
    expect(WIND_BACK.x).toBeGreaterThan(0);
    expect(at(f.x, PLANE_LAUNCH_MS)).toBe(WIND_SPOT.x);
    expect(at(f.y, PLANE_LAUNCH_MS)).toBe(WIND_SPOT.y);
    expect(at(f.turn, PLANE_LAUNCH_MS)).toBe(LAUNCH_HEADING - DRAWN_HEADING);
    expect(at(f.turn, PLANE_LAUNCH_MS)).toBeGreaterThan(at(f.turn, PLANE_OPEN_MS));
    expect(at(f.scaleX, PLANE_LAUNCH_MS - 5)).toBeLessThan(1);
    expect(at(f.scaleX, PLANE_LAUNCH_MS + 15)).toBeGreaterThan(1);
  });
});

describe('the flight', () => {
  it('starts where it was drawn back to, pointing the way it is thrown', () => {
    expect(planePoint(0)).toEqual({ x: WIND_SPOT.x, y: WIND_SPOT.y, heading: LAUNCH_HEADING });
    expect(distanceAt(PLANE_LAUNCH_MS)).toBe(0);
    expect(distanceAt(PLANE_MS)).toBeCloseTo(PLANE_PATH_LENGTH, 9);
    expect(timeAt(0)).toBe(PLANE_LAUNCH_MS);
  });

  it('is one smooth path, and the nose follows it', () => {
    for (let s = 0; s + 0.5 <= PLANE_PATH_LENGTH; s += 0.5) {
      const [a, b] = [planePoint(s), planePoint(s + 0.5)];
      expect(Math.hypot(b.x - a.x, b.y - a.y), `${s}`).toBeLessThanOrEqual(0.5 + 1e-9);
      // the heading is the path's own direction
      const along = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const off = ((((along - (a.heading + b.heading) / 2) % 360) + 540) % 360) - 180;
      expect(Math.abs(off), `${s}`).toBeLessThan(0.5);
    }
    // and the frames draw exactly that: the box where the path is, turned the way it points
    for (let ms = PLANE_LAUNCH_MS + 10; ms <= PLANE_MS; ms += 10) {
      const q = planePoint(distanceAt(ms));
      expect(at(f.x, ms)).toBeCloseTo(q.x, 9);
      expect(at(f.y, ms)).toBeCloseTo(q.y, 9);
      expect(at(f.turn, ms)).toBeCloseTo(q.heading - DRAWN_HEADING, 9);
    }
  });

  it('noses over into a dive, loops once, and climbs away to the left', () => {
    const heading = (s: number) => planePoint(s).heading;
    // down first: the nose drops below level
    expect(heading(legStart('dive'))).toBeLessThan(150);
    // one whole loop, the one way round, of the radius it says
    expect(LOOP?.turn).toBe(360);
    expect(heading(LOOP_TO) - heading(LOOP_FROM)).toBeCloseTo(360, 9);
    const entry = planePoint(LOOP_FROM);
    let top = planePoint(LOOP_FROM);
    for (let s = LOOP_FROM; s <= LOOP_TO; s += 1) if (planePoint(s).y < top.y) top = planePoint(s);
    expect(entry.y - top.y).toBeCloseTo(2 * LOOP_RADIUS, 0);
    // on its back over the top
    expect(Math.abs(top.heading - 360)).toBeLessThan(5);
    // and away: always further left and never lower, to the end
    for (let s = LOOP_TO; s + 1 <= PLANE_PATH_LENGTH; s += 1) {
      expect(planePoint(s + 1).x).toBeLessThan(planePoint(s).x);
      expect(planePoint(s + 1).y).toBeLessThanOrEqual(planePoint(s).y + 1e-9);
    }
  });

  it('stays on the page until it climbs away, and over the top of the list, never down the page', () => {
    for (const ms of EVERY_MS.filter(ms => ms <= timeAt(AWAY_FROM))) {
      const top = Math.min(...paperAt(ms).map(p => p[1]));
      expect(top, `${ms} ms`).toBeGreaterThanOrEqual(PAGE_TOP);
    }
    for (const ms of EVERY_MS) {
      const low = Math.max(...paperAt(ms).map(p => p[1]));
      expect(low, `${ms} ms`).toBeLessThanOrEqual(SHEET_RISES_BELOW);
    }
  });

  it('leaves the phone by its left edge, on every phone the list is used on', () => {
    for (const width of PHONES) {
      const glyph = glyphFromLeft(width);
      const gone = EVERY_MS.find(ms => Math.max(...paperAt(ms).map(p => p[0])) < -glyph);
      expect(gone, `${width} pt`).toBeDefined();
      expect(gone ?? PLANE_MS, `${width} pt`).toBeLessThan(PLANE_MS);
    }
  });

  it('is thrown hard, slowest over the top of the loop, and never stops', () => {
    const topOfLoop = timeAt((LOOP_FROM + LOOP_TO) / 2);
    expect(speed(PLANE_LAUNCH_MS + 5)).toBeGreaterThan(1.1);
    expect(speed(topOfLoop)).toBeLessThan(speed(PLANE_LAUNCH_MS + 5) * 0.75);
    for (let ms = PLANE_LAUNCH_MS + 1; ms < PLANE_MS; ms += 1)
      expect(speed(ms), `${ms} ms`).toBeGreaterThan(0.6);
    // a real flight: across most of the page and round a loop
    expect(PLANE_PATH_LENGTH).toBeGreaterThan(500);
  });

  it('banks into its turns and flies level on the straight, never flattened', () => {
    const inLoop = timeAt((LOOP_FROM + LOOP_TO) / 2);
    expect(at(f.scaleY, inLoop)).toBeLessThan(0.8);
    expect(at(f.scaleY, timeAt(AWAY_FROM + 30))).toBe(1);
    for (const v of f.scaleY.outputRange) expect(v).toBeGreaterThanOrEqual(1 - PLANE_BANK - 1e-9);
    expect(PLANE_BANK).toBeLessThanOrEqual(0.3);
  });

  it('recedes and fades as it goes, and draws nothing before the tap or once it has gone', () => {
    expect(at(f.opacity, 0)).toBe(0);
    expect(at(f.opacity, PLANE_MS)).toBe(0);
    expect(at(f.scale, PLANE_MS)).toBeLessThan(0.7);
    // whole from the tap until well into the climb
    for (const ms of EVERY_MS.filter(ms => ms >= 16 && ms <= PLANE_FADE_MS))
      expect(at(f.opacity, ms)).toBe(1);
    expect(PLANE_FADE_MS).toBeGreaterThan(timeAt(LOOP_TO));
  });

  it('is over in 700 ms, and uses frames Animated can read: in order, one output per input, clamped', () => {
    // the share sheet waits for it: long enough to be a flight, short enough not to be a wait
    expect(PLANE_MS).toBeGreaterThanOrEqual(600);
    expect(PLANE_MS).toBeLessThanOrEqual(700);
    const frames: [string, Frame][] = [
      ...(Object.entries(f).filter(([k]) => k !== 'corners') as [string, Frame][]),
      ...Object.entries(f.corners).flatMap(([name, k]) =>
        Object.entries(k).map(([n, fr]) => [`${name}.${n}`, fr] as [string, Frame]),
      ),
      ...trail.flatMap(
        (d, i) =>
          [
            [`dot ${i} opacity`, d.opacity],
            [`dot ${i} scale`, d.scale],
          ] as [string, Frame][],
      ),
    ];
    for (const [name, fr] of frames) {
      expect(fr.inputRange.length, name).toBe(fr.outputRange.length);
      for (let i = 1; i < fr.inputRange.length; i += 1)
        expect(fr.inputRange[i] ?? 0, name).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
      expect(fr.inputRange[0] ?? -1, name).toBeGreaterThanOrEqual(0);
      expect(fr.inputRange[fr.inputRange.length - 1] ?? 2, name).toBeLessThanOrEqual(1);
      expect(fr.extrapolate, name).toBe('clamp');
    }
  });
});

describe('the trail', () => {
  it('marks only where the plane has been: each dot shows once the tail has passed it', () => {
    // behind the drawing's rearmost point, so no dot ever shows under the plane
    const rearmost = (Math.max(...PLANE_POINTS.map(p => p[0])) - PLANE_GRID / 2) * PLANE_UNIT;
    expect(TRAIL_BEHIND).toBeGreaterThanOrEqual(rearmost);
    for (const d of trail) {
      expect(d.shown).toBeGreaterThan(PLANE_LAUNCH_MS);
      for (const ms of EVERY_MS)
        if (at(d.opacity, ms) > 0)
          expect(distanceAt(ms), `dot at ${d.s}, ${ms} ms`).toBeGreaterThanOrEqual(
            d.s + TRAIL_BEHIND - 1e-6,
          );
      expect(planePoint(d.s)).toMatchObject({ x: d.x, y: d.y });
    }
  });

  it('is short: a few dots at a time, each gone within its life', () => {
    let most = 0;
    for (const ms of EVERY_MS)
      most = Math.max(most, trail.filter(d => at(d.opacity, ms) > 0).length);
    expect(most).toBeGreaterThanOrEqual(3);
    expect(most).toBeLessThanOrEqual(8);
    for (const d of trail) expect(at(d.opacity, d.shown + TRAIL_LIFE_MS)).toBe(0);
  });

  it('runs from the throw through the loop, evenly, and is gone before the plane is', () => {
    expect(trail[0]?.s).toBeLessThanOrEqual(TRAIL_GAP);
    expect(trail[trail.length - 1]?.s ?? 0).toBeGreaterThan(LOOP_TO);
    for (let i = 1; i < trail.length; i += 1)
      expect((trail[i]?.s ?? 0) - (trail[i - 1]?.s ?? 0)).toBeCloseTo(TRAIL_GAP, 9);
    for (const d of trail) {
      expect(d.shown + TRAIL_LIFE_MS).toBeLessThanOrEqual(PLANE_MS);
      expect(at(d.opacity, PLANE_MS)).toBe(0);
    }
    expect(TRAIL_DOT).toBeGreaterThanOrEqual(3);
    expect(TRAIL_DOT).toBeLessThanOrEqual(6);
  });
});

describe('the share sheet: it waits for the plane to be gone, and never long', () => {
  it('is asked for when the flight ends, and by then there is nothing left on the page', () => {
    // with a plane, the plan names no time to send at: the caller waits for `onLanded`
    expect(planeLaunch(false, 'light')).toMatchObject({ fly: true, shareBy: SHARE_SAFETY_MS });
    // the plane and its trail are both gone by the flight's end
    expect(at(f.opacity, PLANE_MS)).toBe(0);
    for (const d of trail) expect(at(d.opacity, PLANE_MS)).toBe(0);
    // and it has flown the whole of its path: the loop, the climb and away off the page
    expect(distanceAt(PLANE_MS)).toBeCloseTo(PLANE_PATH_LENGTH, 9);
    expect(PLANE_MS).toBeLessThanOrEqual(700);
  });

  it('waits at the latest for a plane that set off late, and never much longer than the flight', () => {
    // a lost end never keeps the list from being sent — nor cuts short a plane that is still flying
    expect(SHARE_SAFETY_MS).toBeGreaterThanOrEqual(PLANE_MS + 200);
    expect(SHARE_SAFETY_MS).toBeLessThanOrEqual(1000);
  });

  it('is felt: the first crease as a tap, the throw as a success — and the send alone with no plane', () => {
    expect(planeLaunch(false, 'light').felt).toEqual([
      { at: PLANE_CREASE_MS, kind: 'tap' },
      { at: PLANE_LAUNCH_MS, kind: 'success' },
    ]);
    // the crease is the first corner landing, soon enough to belong to the tap
    expect(at(f.corners.top.land, PLANE_CREASE_MS)).toBe(0);
    expect(at(f.corners.top.land, PLANE_CREASE_MS - 5)).toBeLessThan(0);
    expect(PLANE_CREASE_MS).toBeLessThanOrEqual(150);
    // two moments, felt as two: further apart than the motor's own double
    expect(PLANE_LAUNCH_MS - PLANE_CREASE_MS).toBeGreaterThanOrEqual(130);
    expect(planeLaunch(true, 'light').felt).toEqual([{ at: 0, kind: 'success' }]);
  });

  it('opens at once, with no plane, under reduce motion or in the amber night', () => {
    for (const theme of themeNames) {
      expect(planeLaunch(true, theme), `reduce motion, ${theme}`).toMatchObject({
        fly: false,
        shareBy: 0,
      });
      expect(planeLaunch(false, theme), theme).toMatchObject(
        theme === 'night' ? { fly: false, shareBy: 0 } : { fly: true, shareBy: SHARE_SAFETY_MS },
      );
    }
  });

  it('starts from the glyph a compact button draws', () => {
    // a compact button's glyph is 18, `space.xl` in from its edge, in a 44 row (Button.tsx)
    expect(planeOrigin(space.xl, 18, hit.min)).toEqual({ x: space.xl + 9, y: hit.min / 2 });
  });
});

/**
 * THE INKS, MEASURED (every mark at least 3:1). The paper's and the plane's outline is the accent
 * and the tone away from it, and the trail is the accent; each is measured on the ground it flies
 * over — the page's paper — and the one it leaves from, the Share button's solid surface. In light
 * and dark: the amber night never throws a plane (above), so there is nothing there to measure.
 */
describe('the inks', () => {
  it('draws the paper, the wing, the fold and the trail at 3:1 or better on the page and the button', () => {
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames.filter(x => x !== 'night')) {
        const c = resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme },
          'light',
          PLUS_APPEARANCE,
        ).palette;
        const a = deriveAccent(c);
        for (const [ink, color] of [
          ['paper, wing and trail', a.accent],
          ['paper’s back and fold', a.dark],
        ] as const)
          for (const [ground, bg] of [
            ['paper', c.paper],
            ['button', c.surfaceSolid],
          ] as const)
            expect(
              contrastRatio(color, bg),
              `${scheme}/${theme}: ${ink} on ${ground}`,
            ).toBeGreaterThanOrEqual(AA_GRAPHIC);
      }
  });
});

describe('the component (tripwires over PaperPlane.tsx)', () => {
  it('is decoration: hidden from touch and from assistive technology', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style=\{StyleSheet\.absoluteFill\}/,
    );
    expect(component).not.toContain('<Pressable');
  });

  it('is a layer over the page, measured against the button on the throw', () => {
    expect(flat).toContain('<View ref={sky} collapsable={false}');
    expect(flat).toContain('layer.measureInWindow((lx, ly) => {');
    expect(flat).toContain('button.measureInWindow((bx, by, bw, bh) => {');
    expect(flat).toContain('setFlight({ id: launch, x: bx - lx + at.x, y: by - ly + at.y });');
    // and everything it draws is placed from that point
    expect(flat).toContain('left: flight.x - PLANE_BOX / 2, top: flight.y - PLANE_BOX / 2');
    expect(flat).toContain('left: flight.x + d.x - TRAIL_DOT / 2,');
  });

  it('draws nothing under reduce motion or in the amber night, nothing between flights, one plane at a time', () => {
    expect(flat).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(flat).toContain('{flight === null || still ? null : (');
    // a launch it is given while still, or while a plane is up, is let go — not saved for later
    expect(flat).toContain('if (still || airborne.current) { none(); return; }');
    // the first value it is handed throws nothing: only a new tap does
    expect(flat).toContain('const seen = useRef(launch);');
  });

  it('leaves nothing behind: the flight clears itself however its run ends, and says so', () => {
    expect(flat).toContain(
      'run.start(() => { airborne.current = false; setFlight(f => (f !== null && f.id === id ? null : f)); landed.current?.(id); });',
    );
    expect(flat).toContain('return () => run.stop();');
  });

  it('tells the caller once for every launch: when its plane has gone, or at once when it throws none', () => {
    // the latest callback, read at the landing, so a re-render mid-flight never loses it
    expect(flat).toContain('const landed = useRef(onLanded); landed.current = onLanded;');
    expect(flat).toContain('const none = () => landed.current?.(launch);');
    // still or already flying, nothing to measure, a button with no box: each lands on the spot
    expect(flat).toContain('if (layer === null || button === null) { none(); return; }');
    expect(flat).toContain('if (bw <= 0 || bh <= 0) { none(); return; }');
    expect(flat.split('none();').length - 1).toBe(3);
    // and a plane that flies says so once, from its run's own end — never from a timer of its own
    expect(flat.split('landed.current?.(id)').length - 1).toBe(1);
    expect(component).not.toMatch(/setTimeout\(/);
  });

  it('runs on the native driver: opacity and transforms only, one turn per view', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    const fed = [...flat.matchAll(/(\w+): (?:num|deg)\(/g)].map(m => m[1]);
    expect(fed.length).toBeGreaterThan(0);
    for (const prop of fed)
      expect(
        [
          'opacity',
          'translateX',
          'translateY',
          'rotate',
          'rotateX',
          'rotateY',
          'scale',
          'scaleX',
          'scaleY',
        ],
        prop,
      ).toContain(prop);
    // every 3-D turn is its view's whole transform, the camera first
    const turns = [...flat.matchAll(/transform: \[[^\]]*rotate[XY]: [^\]]*\]/g)].map(m => m[0]);
    expect(turns).toHaveLength(4);
    for (const list of turns) {
      expect(list, list).toMatch(
        /^transform: \[\{ perspective: (PLANE|CORNER)_PERSPECTIVE \}, \{ rotate[XY]: deg\([\w.]+\) \}\]$/,
      );
    }
    // the tilt that aims a corner's turn along its fold line is a view of its own, each way
    expect(flat).toContain('transform: [{ rotate: `${c.tilt}deg` }],');
    expect(flat.split('{ transform: [{ rotate: `${-c.tilt}deg` }] }').length - 1).toBe(2);
  });

  it('paints in the household’s accent and nothing else', () => {
    expect(flat).toContain('const a = useAccent();');
    expect(flat).toContain('<Path d={PLANE_WING} fill={a.accent} />');
    expect(flat).toContain('<Path d={PLANE_FOLD} fill={a.dark} />');
    expect(flat).toContain('d={SHEET_BODY} fill={a.accent} stroke={a.accent}');
    expect(flat).toContain('d={cornerPath(c.flat)} fill={a.accent} stroke={a.accent}');
    expect(flat).toContain('d={cornerPath(c.folded)} fill={a.dark} stroke={a.dark}');
    expect(flat).toContain('d={SHEET_CREASE_PATH} stroke={a.onAccent}');
    expect(flat).toContain('backgroundColor: a.accent,');
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    }
  });

  it('asks for nothing Expo Go does not carry', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
    expect(component).not.toContain('reanimated');
  });

  it('is exported with the controls, and its arithmetic through the node-safe entry', () => {
    expect(read('core.ts')).toContain("export * from './PaperPlane';");
    expect(read('core.ts')).not.toContain("'./paperPlane'");
    expect(read('../layout.ts')).toContain("from './components/paperPlane';");
  });
});
