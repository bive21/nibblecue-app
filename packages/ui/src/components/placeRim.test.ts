/**
 * EVERY STORAGE PLACE'S PICTURE (the owner, 2026-09-26: *"it should be on every category"*). The
 * way this package tests anything that moves: where every piece of every picture sits, what each
 * looks like at every point of every change, and which change a picture plays are PURE
 * (`placeRim.ts`, with frost's own half in `frostRim.ts` and `frostRim.test.ts`) and are sampled
 * here exactly as `Animated.Value#interpolate` samples them; what only a device can show — that the
 * picture is behind the words, hidden from a screen reader, on the native driver, still when it
 * must be and cheap enough for a hundred rows — is held by tripwires over `PlaceRim.tsx`, because
 * this suite has no renderer (`interaction.test.ts` says why that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PlaceKind } from '../theme/placeTones';
import { SKINS } from '../theme/skins';
import { radius as baseRadius, space } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import {
  DROP,
  DROP_MAX_STRETCH,
  FROST_HOLD_MS,
  FROST_MIN_RIM,
  FROST_MIN_STRIP,
  FROST_MS,
  FROST_SPECK,
  THAW_TRAIL,
  TRAIL_WIDTH,
  frostCalm,
  frostFrames,
  type Box,
  type DropFrames,
  type FrostCorners,
  type FrostInset,
  type PieceFrames,
} from './frostRim';
import {
  PLACE_RIM_LOOKS,
  RIM_ARRIVE_MS,
  RIM_HANDOFF_MS,
  RIM_HOLD_MS,
  RIM_ZONE,
  RUNNER_STRETCH,
  arriveFrames,
  isFrostLook,
  placeRimLook,
  placeRimShow,
  rimClip,
  rimGeometry,
  rimMotion,
  rimPlan,
  rimZone,
  type ArriveFrames,
  type PlaceRimCue,
  type RimGeometry,
  type RimSides,
} from './placeRim';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('PlaceRim.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('placeRim.ts'));

/** The three pictures this file places; frost's two are `frostRim.test.ts`'s. */
const OWN: readonly PlaceKind[] = ['ROOM', 'FRIDGE', 'THAWED'];
const LOOKS = PLACE_RIM_LOOKS;

/**
 * THE HOSTS IT IS PROVEN FOR, as the stash uses them: a Use first row (`space.xl` × `space.lg`), a
 * place's header (`space.xl` all round), the container sheet's head (`space.xl` × `space.md`), a
 * narrower padding than any of them; and a storage-window card's empty right side, from the
 * narrowest a piece is placed in to the widest `rimZone` gives (`space.lg` down from its top).
 */
const ROW: FrostInset = { x: space.xl, y: space.lg };
const HEADER: FrostInset = { x: space.xl, y: space.xl };
const HEAD: FrostInset = { x: space.xl, y: space.md };
const NARROW: FrostInset = { x: FROST_MIN_RIM, y: space.md };
const ZONES: readonly FrostInset[] = Array.from(
  { length: RIM_ZONE.max - FROST_MIN_RIM + 1 },
  (_, i) => ({ x: FROST_MIN_RIM + i, y: space.lg }),
);
const HOSTS: readonly { rim: FrostInset; sides: RimSides }[] = [
  ...[ROW, HEADER, HEAD, NARROW].map(rim => ({ rim, sides: 'both' as const })),
  ...ZONES.map(rim => ({ rim, sides: 'right' as const })),
];
/** Every strip a host can give, a point apart, from the smallest a piece is placed in. */
const STRIPS = Array.from({ length: 240 - FROST_MIN_STRIP + 1 }, (_, i) => FROST_MIN_STRIP + i);
const built = new Map<string, RimGeometry[]>();
/**
 * Every geometry a host gives, built once for all the walks that read it: they build tens of
 * thousands between them, and a suite running beside the others has to stay well inside the
 * default timeout (master's own lesson, 2026-09-25).
 */
const geometries = (
  look: PlaceKind,
  rim: FrostInset,
  sides: RimSides,
  corners: FrostCorners | null = null,
): RimGeometry[] => {
  const key = JSON.stringify([look, rim, sides, corners]);
  const had = built.get(key);
  if (had) return had;
  const made = STRIPS.map(s => rimGeometry(look, s + 2 * rim.y, rim, sides, corners));
  built.set(key, made);
  return made;
};

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
const discBox = (cx: number, cy: number, r: number): Box => ({
  left: cx - r,
  top: cy - r,
  width: 2 * r,
  height: 2 * r,
});
const apart = (
  a: { cx: number; cy: number; r: number },
  b: { cx: number; cy: number; r: number },
) => Math.hypot(a.cx - b.cx, a.cy - b.cy) >= a.r + b.r;

describe('which picture a place wears', () => {
  it('knows the five places, and draws nothing for a kind it does not know', () => {
    expect([...LOOKS].sort()).toEqual(['DEEP_FREEZER', 'FREEZER', 'FRIDGE', 'ROOM', 'THAWED']);
    for (const look of LOOKS) expect(placeRimLook(look)).toBe(look);
    for (const other of [null, undefined, '', 'GARAGE', 'freezer'])
      expect(placeRimLook(other)).toBeNull();
  });

  it('keeps frost’s own motions for the two frosts, and only for them', () => {
    expect(LOOKS.filter(isFrostLook)).toEqual(['FREEZER', 'DEEP_FREEZER']);
    expect(isFrostLook(null)).toBe(false);
  });
});

describe('where each picture is: in the host’s padding, beside its words and never under them', () => {
  it('lives in strips exactly as wide as the side padding and as tall as the content', () => {
    for (const look of LOOKS)
      for (const { rim, sides } of HOSTS)
        for (const s of [FROST_MIN_STRIP, 38, 120]) {
          const g = rimGeometry(look, s + 2 * rim.y, rim, sides);
          expect(g.strip).toEqual({ top: rim.y, height: s, width: rim.x });
          expect(g.sides).toEqual(sides === 'right' ? ['right'] : ['left', 'right']);
          // the wash is centered on the edge and gone at the strip's inner edge and its two ends
          expect(g.wash).toEqual({ rx: rim.x, ry: s / 2, cy: s / 2 });
        }
  });

  /*
    The walks collect what is wrong and assert once (frostRim.test.ts says why): every piece of the
    three pictures, at every height of every host, both side sets and every card's right side.
  */
  it('keeps every bead, shaft, mote and drop inside its strip, on its own side, at every height', () => {
    const wrong: string[] = [];
    for (const look of OWN)
      for (const { rim, sides } of HOSTS)
        for (const g of geometries(look, rim, sides)) {
          const { width: w, height: S } = g.strip;
          const at = `${look} ${rim.x}×${rim.y} ${sides} strip ${S}`;
          const onSide = (side: string) => g.sides.includes(side as never);
          if (g.look === 'FRIDGE') {
            if (g.beads.length !== (sides === 'both' ? 7 : 3)) wrong.push(`${at}: beads`);
            for (const b of g.beads) {
              if (!onSide(b.side)) wrong.push(`${at}: a bead on the ${b.side}`);
              if (!inside(discBox(b.cx, b.cy, b.r), w, S)) wrong.push(`${at}: bead outside`);
            }
            const run = g.runner;
            if (run === null) wrong.push(`${at}: no runner`);
            else {
              const reach = run.r * RUNNER_STRETCH;
              if (!(run.y1 > run.y0)) wrong.push(`${at}: runner runs up`);
              if (run.y0 - reach < 0 || run.y1 + reach > S) wrong.push(`${at}: runner outside`);
              if (run.cx - run.r < 0 || run.cx + run.r > w) wrong.push(`${at}: runner too wide`);
            }
          }
          if (g.look === 'ROOM') {
            if (g.rays.length !== (sides === 'both' ? 4 : 2)) wrong.push(`${at}: rays`);
            for (const r of g.rays) {
              if (!onSide(r.side)) wrong.push(`${at}: a shaft on the ${r.side}`);
              if (!inside(r.box, w, S)) wrong.push(`${at}: shaft outside`);
              // it starts at the edge and slants inward and down, as light through a window does
              const edge = r.side === 'left' ? r.root.x : w - r.root.x;
              if (edge > 1.5) wrong.push(`${at}: shaft root ${edge} from the edge`);
              const inward = r.side === 'left' ? r.tip.x - r.root.x : r.root.x - r.tip.x;
              if (!(inward > 0) || !(r.tip.y > r.root.y))
                wrong.push(`${at}: shaft goes the wrong way`);
            }
            for (const m of g.motes)
              if (!inside(discBox(m.cx, m.cy, m.r), w, S)) wrong.push(`${at}: mote outside`);
          }
          if (g.look === 'THAWED') {
            if (g.drops.length !== (sides === 'both' ? 3 : 1)) wrong.push(`${at}: drops`);
            const half = (DROP.height / 2) * DROP_MAX_STRETCH;
            for (const d of g.drops) {
              if (!onSide(d.side)) wrong.push(`${at}: a drop on the ${d.side}`);
              if (d.y0 - half < 0 || d.y1 + half > S) wrong.push(`${at}: drop outside`);
              if (d.x - DROP.width / 2 < 0 || d.x + DROP.width / 2 > w)
                wrong.push(`${at}: drop wide`);
            }
            for (const b of g.beads)
              if (!inside(discBox(b.cx, b.cy, b.r), w, S)) wrong.push(`${at}: bead outside`);
          }
        }
    expect(wrong).toEqual([]);
  });

  it('never lets two pieces land on one another, at rest or along a run', () => {
    const wrong: string[] = [];
    for (const look of OWN)
      for (const { rim, sides } of HOSTS)
        for (const g of geometries(look, rim, sides)) {
          const at = `${look} ${rim.x}×${rim.y} ${sides} strip ${g.strip.height}`;
          if (g.look === 'FRIDGE') {
            const beads = g.beads;
            for (let i = 0; i < beads.length; i += 1)
              for (let j = i + 1; j < beads.length; j += 1)
                if (beads[i]!.side === beads[j]!.side && !apart(beads[i]!, beads[j]!))
                  wrong.push(`${at}: beads ${i} and ${j} touch`);
            const run = g.runner;
            if (run !== null)
              for (const b of beads.filter(x => x.side === run.side)) {
                // at rest, and where it formed
                for (const cy of [run.y0, run.y1])
                  if (!apart({ cx: run.cx, cy, r: run.r }, b))
                    wrong.push(`${at}: runner on a bead`);
                // and its wet track, a line down its run, clear of every bead beside it
                const alongside = b.cy + b.r > run.y0 && b.cy - b.r < run.y1;
                if (alongside && Math.abs(b.cx - run.cx) < b.r + TRAIL_WIDTH / 2)
                  wrong.push(`${at}: track through a bead`);
              }
          }
          if (g.look === 'ROOM') {
            const motes = g.motes;
            for (let i = 0; i < motes.length; i += 1)
              for (let j = i + 1; j < motes.length; j += 1)
                if (motes[i]!.side === motes[j]!.side && !apart(motes[i]!, motes[j]!))
                  wrong.push(`${at}: motes touch`);
          }
          if (g.look === 'THAWED') {
            const half = DROP.height / 2;
            for (const b of g.beads)
              for (const d of g.drops.filter(x => x.side === b.side)) {
                // clear of the drop at rest and of the line it left
                const rest = discBox(d.x, d.y1, Math.max(DROP.width / 2, half));
                if (
                  Math.abs(b.cx - d.x) < b.r + DROP.width / 2 &&
                  b.cy + b.r > rest.top &&
                  b.cy - b.r < rest.top + rest.height
                )
                  wrong.push(`${at}: bead on a drop`);
                const alongside = b.cy + b.r > d.y0 && b.cy - b.r < d.y1;
                if (alongside && Math.abs(b.cx - d.x) < b.r + TRAIL_WIDTH / 2)
                  wrong.push(`${at}: line through a bead`);
              }
            // two drops resting side by side are not level: they ran, they were not stamped
            const left = g.drops.filter(d => d.side === 'left');
            if (
              left.length === 2 &&
              g.strip.height >= 30 &&
              Math.abs(left[0]!.y1 - left[1]!.y1) < 2
            )
              wrong.push(`${at}: drops rest level`);
          }
        }
    expect(wrong).toEqual([]);
  });

  it('draws only the wash on a host too small for a piece to sit in whole', () => {
    for (const look of OWN) {
      const g = rimGeometry(look, FROST_MIN_STRIP - 1 + 2 * ROW.y, ROW);
      const pieces =
        g.look === 'FRIDGE'
          ? g.beads.length + (g.runner ? 1 : 0)
          : g.look === 'ROOM'
            ? g.rays.length + g.motes.length
            : g.look === 'THAWED'
              ? g.drops.length + g.beads.length
              : -1;
      expect(pieces, look).toBe(0);
      const thin = rimGeometry(look, 60, { x: FROST_MIN_RIM - 1, y: space.lg });
      expect(JSON.stringify(thin)).not.toMatch(/"(beads|rays|motes|drops)":\[\{/);
    }
  });

  it('spreads the dew and the light across a wider strip, and keeps the water near its edge', () => {
    const narrow = rimGeometry('FRIDGE', 60, { x: 14, y: space.lg }, 'right');
    const wide = rimGeometry('FRIDGE', 60, { x: 36, y: space.lg }, 'right');
    const reach = (g: RimGeometry) =>
      g.look === 'FRIDGE' ? Math.max(...g.beads.map(b => g.strip.width - b.cx)) : 0;
    expect(reach(wide)).toBeGreaterThan(reach(narrow) * 2);
    const rays = (w: number) => {
      const g = rimGeometry('ROOM', 60, { x: w, y: space.lg }, 'right');
      return g.look === 'ROOM' ? Math.max(...g.rays.map(r => r.box.width)) : 0;
    };
    expect(rays(36)).toBeGreaterThan(rays(14) * 2);
  });
});

/**
 * THE ROUNDED CORNERS OF THE CARD A HOST IS IN (`frostRim.test.ts` has the frost's half and why the
 * clip exists). Every piece near an end that is a card's corner is PLACED clear of the arc, so the
 * clip only ever trims a wash's thin tail — and a real host of the stash loses nothing to it.
 */
describe('every picture keeps to a card’s rounded corners', () => {
  const R = (key: 'm' | 'l') =>
    Math.max(baseRadius[key], ...Object.values(SKINS).map(s => s.radius[key]));
  const round = (r: number): FrostCorners => ({ radius: r, top: true, bottom: true });
  /** A card's right side at its narrowest, a padding's width, two between, and its widest. */
  const EDGES = ZONES.filter(z => [FROST_MIN_RIM, space.lg, 20, 28, RIM_ZONE.max].includes(z.x));
  const CORNERED = [
    { rim: ROW, sides: 'both' as const, r: R('m') },
    { rim: HEADER, sides: 'both' as const, r: R('m') },
    { rim: HEAD, sides: 'both' as const, r: R('l') },
    ...EDGES.map(rim => ({ rim, sides: 'right' as const, r: R('m') })),
  ];
  /**
   * Whether a disc of radius `pad` at (x from the side, y from the nearer end) leaves the arc — to
   * within `slack`: a shaft is read back from its path, which is written to a thousandth of a point.
   */
  const outside = (r: number, x: number, y: number, pad = 0, slack = 1e-9) =>
    x < r && y < r && Math.hypot(r - x, r - y) > r - pad + slack;
  const folded = (g: RimGeometry, side: 'left' | 'right', x: number, y: number) => {
    const H = g.strip.height + 2 * g.strip.top;
    const hy = g.strip.top + y;
    return [side === 'left' ? x : g.strip.width - x, Math.min(hy, H - hy)] as const;
  };

  it('puts no bead, shaft, mote or drop outside the corner arc, at any height', () => {
    const out: string[] = [];
    for (const look of OWN)
      for (const { rim, sides, r } of CORNERED)
        for (const g of geometries(look, rim, sides, round(r))) {
          const at = `${look} ${rim.x}×${rim.y} strip ${g.strip.height}`;
          const disc = (
            side: 'left' | 'right',
            x: number,
            y: number,
            pad: number,
            what: string,
            slack = 1e-9,
          ) => {
            const [fx, fy] = folded(g, side, x, y);
            if (outside(r, fx, fy, pad, slack)) out.push(`${at} ${what}`);
          };
          if (g.look === 'FRIDGE') {
            for (const b of g.beads) disc(b.side, b.cx, b.cy, b.r, 'bead');
            const run = g.runner;
            if (run !== null) {
              const reach = run.r * RUNNER_STRETCH;
              disc(run.side, run.cx, run.y0 - reach + run.r, run.r, 'runner');
              disc(run.side, run.cx, run.y1 + reach - run.r, run.r, 'runner');
            }
          }
          if (g.look === 'ROOM') {
            for (const ray of g.rays) {
              // a shaft is its four corners and everything between: the clip is convex
              const pts = ray.dStrip.match(/-?[\d.]+ -?[\d.]+/g) ?? [];
              for (const pt of pts) {
                const [x, y] = pt.split(' ').map(Number) as [number, number];
                disc(ray.side, x, y, 0, 'shaft', 1e-3);
              }
            }
            for (const m of g.motes) disc(m.side, m.cx, m.cy, m.r, 'mote');
          }
          if (g.look === 'THAWED') {
            const half = (DROP.height / 2) * DROP_MAX_STRETCH;
            for (const d of g.drops) {
              disc(d.side, d.x, d.y0 - half, DROP.width / 2, 'drop');
              disc(d.side, d.x, d.y1 + half, DROP.width / 2, 'drop');
            }
            for (const b of g.beads) disc(b.side, b.cx, b.cy, b.r, 'bead');
          }
        }
    expect(out).toEqual([]);
  });

  it('costs a row, a header and a card’s right side nothing: every piece is still drawn', () => {
    const count = (g: RimGeometry): string =>
      'frost' in g
        ? `${g.frost.ferns.length}/${g.frost.sparkles.length}/${g.frost.drops.length}`
        : g.look === 'FRIDGE'
          ? `${g.beads.length}/${g.runner ? 1 : 0}`
          : g.look === 'ROOM'
            ? `${g.rays.length}/${g.motes.length}`
            : g.look === 'THAWED'
              ? `${g.drops.length}/${g.beads.length}`
              : '';
    const lost: string[] = [];
    for (const look of LOOKS)
      for (const { rim, sides, r } of CORNERED.filter(h => h.rim !== HEAD)) {
        const free = geometries(look, rim, sides);
        const cut = geometries(look, rim, sides, round(r));
        for (const [i, g] of cut.entries())
          if (count(g) !== count(free[i]!))
            lost.push(`${look} ${rim.x}×${rim.y} strip ${STRIPS[i]}`);
      }
    expect(lost).toEqual([]);
  });

  it('clips only the ends that are a card’s corners — and only the right ones for a right side', () => {
    const r = R('m');
    expect(rimClip(undefined)).toBeNull();
    expect(rimClip({ radius: r, top: false, bottom: false })).toBeNull();
    expect(rimClip({ radius: 0, top: true, bottom: true })).toBeNull();
    expect(rimClip({ radius: r, top: true, bottom: false })).toEqual({
      topLeft: r,
      topRight: r,
      bottomLeft: 0,
      bottomRight: 0,
    });
    expect(rimClip({ radius: r, top: false, bottom: true })).toEqual({
      topLeft: 0,
      topRight: 0,
      bottomLeft: r,
      bottomRight: r,
    });
    // a card's right side: its strip's left edge is in the middle of the card, which has no corner
    expect(rimClip({ radius: r, top: true, bottom: true }, 'right')).toEqual({
      topLeft: 0,
      topRight: r,
      bottomLeft: 0,
      bottomRight: r,
    });
  });
});

/**
 * A CARD'S EMPTY RIGHT SIDE (`rimZone`). The design system proves the arithmetic over every card
 * and every place its words can end; the app proves it again over the words the stash's storage
 * windows really write, at every phone width and text size (`apps/mobile/src/screens/stash/rims.test.ts`).
 */
describe('a card’s empty right side, as a strip for its picture', () => {
  const BORDER = 1 / 3;
  const PAD = space.lg;

  it('never reaches the words, whatever their measured edge, and never takes less than the padding', () => {
    const wrong: string[] = [];
    for (let width = 100; width <= 260; width += 2)
      for (let words = PAD + 1; words <= width - PAD - BORDER; words += 0.5) {
        const zone = rimZone({ width, words, border: BORDER, pad: PAD });
        if (zone === null) {
          wrong.push(`${width}/${words}: nothing`);
          continue;
        }
        // the strip is drawn from the card's right edge, inside its border
        const left = width - BORDER - zone;
        if (left < words - 1e-9) wrong.push(`${width}/${words}: under the words`);
        if (zone < PAD - 1e-9) wrong.push(`${width}/${words}: narrower than the padding`);
        if (zone > RIM_ZONE.max + 1e-9) wrong.push(`${width}/${words}: a banner`);
        // and a clear gap from the words, whenever it is wider than the padding
        if (zone > PAD + 1e-9 && left < words + RIM_ZONE.gap - 1e-9)
          wrong.push(`${width}/${words}: against the words`);
      }
    expect(wrong).toEqual([]);
  });

  it('takes the emptiness there is, up to its most', () => {
    // short words on a wide card: the most there is
    expect(rimZone({ width: 190, words: 80, border: BORDER, pad: PAD })).toBe(RIM_ZONE.max);
    // a little room: what is left past the words and the gap
    expect(rimZone({ width: 140, words: 100, border: 0, pad: PAD })).toBeCloseTo(
      40 - RIM_ZONE.gap,
      9,
    );
    // words to the padding (a long label, the largest text): the padding, which no word is in
    expect(rimZone({ width: 140, words: 140 - PAD, border: 0, pad: PAD })).toBe(PAD);
  });

  it('is nothing until the card and its words have both been measured', () => {
    expect(rimZone({ width: 0, words: 80, border: BORDER, pad: PAD })).toBeNull();
    expect(rimZone({ width: 160, words: 0, border: BORDER, pad: PAD })).toBeNull();
    expect(rimZone({ width: Number.NaN, words: 80, border: BORDER, pad: PAD })).toBeNull();
  });
});

/* ------------------------------------------------------------------------------ the motion */

const NOW = 1_000_000;
const cue = (
  from: PlaceKind | null,
  to: PlaceKind | null,
  startAt: number | null,
): PlaceRimCue => ({
  from,
  to,
  startAt,
});
const FROM: readonly (PlaceKind | null)[] = [null, ...LOOKS];

describe('what a change plays', () => {
  it('plays nothing for no change, and nothing between the two frosts: that is set directly', () => {
    for (const look of LOOKS) expect(rimPlan(look, look)).toBeNull();
    expect(rimPlan('FREEZER', 'DEEP_FREEZER')).toBeNull();
    expect(rimPlan('DEEP_FREEZER', 'FREEZER')).toBeNull();
    for (const from of FROM) expect(rimPlan(from, null)).toBeNull();
  });

  it('keeps frost’s own arrival: whatever was there fades under the sheet while frost creeps in', () => {
    for (const to of ['FREEZER', 'DEEP_FREEZER'] as const)
      for (const from of [null, 'ROOM', 'FRIDGE', 'THAWED'] as const)
        expect(rimPlan(from, to)).toEqual({
          total: FROST_MS.creep,
          fade: from,
          frost: { look: to, motion: 'creep' },
          arrive: null,
        });
  });

  it('keeps frost’s own departure: a melt, then the next picture as the ice goes', () => {
    for (const from of ['FREEZER', 'DEEP_FREEZER'] as const) {
      for (const to of ['ROOM', 'FRIDGE'] as const)
        expect(rimPlan(from, to)).toEqual({
          total: FROST_MS.melt,
          fade: null,
          frost: { look: from, motion: 'melt' },
          arrive: { look: to, at: RIM_HANDOFF_MS, runs: true },
        });
      // into thawing, the frost THAWS: its drops stay, and are the new picture's drops
      expect(rimPlan(from, 'THAWED')).toEqual({
        total: FROST_MS.thaw,
        fade: null,
        frost: { look: from, motion: 'thaw' },
        arrive: { look: 'THAWED', at: RIM_HANDOFF_MS, runs: false },
      });
    }
  });

  it('gives every other change one short arrival after the beat, the old picture fading in it', () => {
    for (const from of [null, 'ROOM', 'FRIDGE', 'THAWED'] as const)
      for (const to of ['ROOM', 'FRIDGE', 'THAWED'] as const) {
        if (from === to) continue;
        expect(rimPlan(from, to)).toEqual({
          total: RIM_HOLD_MS + RIM_ARRIVE_MS,
          fade: from,
          frost: null,
          arrive: { look: to, at: RIM_HOLD_MS, runs: true },
        });
      }
    // the beat is frost's, for frost's reason: the sheet that made the change slides away over it
    expect(RIM_HOLD_MS).toBe(FROST_HOLD_MS);
  });

  it('hands over from a melting frost when its glaze has gone, and is over by the melt’s end', () => {
    const g = rimGeometry('FREEZER', 60, ROW);
    const melt = frostFrames('frost' in g ? g.frost : (null as never)).melt;
    const glazeGone = (melt.glaze.left.opacity.inputRange.at(-1) ?? 1) * FROST_MS.melt;
    expect(RIM_HANDOFF_MS).toBeCloseTo(glazeGone, 6);
    expect(RIM_HANDOFF_MS + RIM_ARRIVE_MS).toBeLessThanOrEqual(FROST_MS.melt);
  });
});

describe('what a picture draws now', () => {
  it('draws the look it has when nothing changed — a list that first appears opens still', () => {
    for (const look of [...LOOKS, null]) {
      expect(placeRimShow(look, null, NOW, false)).toEqual({ kind: 'still', look });
      expect(placeRimShow(look, undefined, NOW, false)).toEqual({ kind: 'still', look });
    }
  });

  it('plays a change from as far as it has got, so a second picture joins rather than restarts', () => {
    expect(placeRimShow('FRIDGE', cue(null, 'FRIDGE', NOW), NOW, false)).toEqual({
      kind: 'play',
      from: null,
      to: 'FRIDGE',
      at: 0,
    });
    const half = placeRimShow(
      'THAWED',
      cue('FREEZER', 'THAWED', NOW - FROST_MS.thaw / 2),
      NOW,
      false,
    );
    expect(half).toEqual({ kind: 'play', from: 'FREEZER', to: 'THAWED', at: 0.5 });
    // a clock a hair behind the cue starts it at its beginning, not before it
    expect(placeRimShow('FREEZER', cue('ROOM', 'FREEZER', NOW + 5), NOW, false)).toEqual({
      kind: 'play',
      from: 'ROOM',
      to: 'FREEZER',
      at: 0,
    });
  });

  it('rests in the look a change ended on once it is over', () => {
    for (const from of FROM)
      for (const to of LOOKS) {
        const plan = rimPlan(from, to);
        if (plan === null) continue;
        expect(placeRimShow(to, cue(from, to, NOW - plan.total), NOW, false)).toEqual({
          kind: 'still',
          look: to,
        });
      }
  });

  it('shows the look a waiting change is leaving, so its first frame is where it starts', () => {
    expect(placeRimShow('FREEZER', cue('FRIDGE', 'FREEZER', null), NOW, false)).toEqual({
      kind: 'still',
      look: 'FRIDGE',
    });
    expect(placeRimShow('ROOM', cue(null, 'ROOM', null), NOW, false)).toEqual({
      kind: 'still',
      look: null,
    });
  });

  it('ignores a change that does not lead to the look it has now, or that has nothing to play', () => {
    expect(placeRimShow('FRIDGE', cue('FRIDGE', 'FREEZER', NOW), NOW, false)).toEqual({
      kind: 'still',
      look: 'FRIDGE',
    });
    expect(placeRimShow('DEEP_FREEZER', cue('FREEZER', 'DEEP_FREEZER', NOW), NOW, false)).toEqual({
      kind: 'still',
      look: 'DEEP_FREEZER',
    });
  });

  it('under reduce motion and in Night: the end state, set directly, whatever the cue', () => {
    for (const calm of [
      frostCalm('light', true),
      frostCalm('dark', true),
      frostCalm('night', false),
    ]) {
      expect(calm).toBe(true);
      for (const from of FROM)
        for (const to of LOOKS) {
          expect(placeRimShow(to, cue(from, to, NOW), NOW, calm)).toEqual({
            kind: 'still',
            look: to,
          });
          // and a waiting change does not hold the old look either
          expect(placeRimShow(to, cue(from, to, null), NOW, calm)).toEqual({
            kind: 'still',
            look: to,
          });
        }
    }
    expect(frostCalm('light', false)).toBe(false);
    expect(frostCalm('dark', false)).toBe(false);
  });
});

describe('the frames of a change', () => {
  const G = (look: PlaceKind) => rimGeometry(look, 38 + 2 * ROW.y, ROW);
  const every = (a: ArriveFrames): [string, Frame][] => {
    const piece = (name: string, p: PieceFrames): [string, Frame][] => [
      [`${name} opacity`, p.opacity],
      [`${name} scale`, p.scale],
    ];
    const run = (name: string, d: DropFrames): [string, Frame][] => [
      [`${name} opacity`, d.opacity],
      [`${name} scale`, d.scale],
      [`${name} y`, d.y],
      [`${name} stretch`, d.stretch],
      [`${name} trail`, d.trail],
      [`${name} trail opacity`, d.trailOpacity],
    ];
    const out = piece('wash', a.wash);
    if (a.look === 'FRIDGE') {
      out.push(...a.beads.flatMap((b, i) => piece(`bead ${i}`, b)));
      if (a.runner) out.push(...run('runner', a.runner));
    }
    if (a.look === 'ROOM') {
      out.push(...a.rays.flatMap((r, i) => piece(`shaft ${i}`, r)));
      out.push(...a.motes.map((m, i): [string, Frame] => [`mote ${i}`, m]));
    }
    if (a.look === 'THAWED') {
      out.push(...a.drops.flatMap((d, i) => run(`drop ${i}`, d)));
      out.push(...a.beads.flatMap((b, i) => piece(`bead ${i}`, b)));
    }
    return out;
  };
  const CHANGES = FROM.flatMap(from =>
    LOOKS.flatMap(to => {
      const plan = rimPlan(from, to);
      return plan === null
        ? []
        : [{ from, to, plan, motion: rimMotion(plan, from ? G(from) : null, G(to)) }];
    }),
  );

  it('are frames Animated can read: in order, one output per input, inside the change, clamped', () => {
    const wrong: string[] = [];
    for (const { from, to, motion } of CHANGES) {
      const frames: [string, Frame][] = [
        ...(motion.fade ? ([['fade', motion.fade]] as [string, Frame][]) : []),
        ...(motion.arrive ? every(motion.arrive) : []),
      ];
      for (const [name, fr] of frames) {
        const at = `${from}→${to} ${name}`;
        if (fr.inputRange.length !== fr.outputRange.length || fr.inputRange.length < 2)
          wrong.push(`${at}: shape`);
        for (let i = 1; i < fr.inputRange.length; i += 1)
          if (!((fr.inputRange[i] ?? 0) > (fr.inputRange[i - 1] ?? 0))) wrong.push(`${at}: order`);
        if ((fr.inputRange[0] ?? -1) < 0 || (fr.inputRange.at(-1) ?? 2) > 1)
          wrong.push(`${at}: range`);
        if (fr.extrapolate !== 'clamp') wrong.push(`${at}: extends`);
        if (/scale|stretch|trail$/.test(name))
          for (const v of fr.outputRange) if (v < FROST_SPECK) wrong.push(`${at}: a zero scale`);
      }
    }
    expect(wrong).toEqual([]);
    expect(CHANGES.length).toBeGreaterThan(20);
  });

  it('is one flourish of no more than 600 ms, after the beat, for every picture that is not frost', () => {
    for (const { from, to, plan, motion } of CHANGES) {
      if (motion.arrive === null) continue;
      const times = every(motion.arrive).flatMap(([, fr]) => [
        fr.inputRange[0] ?? 0,
        fr.inputRange.at(-1) ?? 1,
      ]);
      const start = Math.min(...times) * plan.total;
      const end = Math.max(...times) * plan.total;
      expect(end - start, `${from}→${to}`).toBeLessThanOrEqual(RIM_ARRIVE_MS + 1e-6);
      expect(RIM_ARRIVE_MS).toBeLessThanOrEqual(600);
      // after the beat the sheet slides away in, or after a melting frost has handed over
      expect(start, `${from}→${to}`).toBeGreaterThanOrEqual(
        (isFrostLook(from) ? RIM_HANDOFF_MS : RIM_HOLD_MS) - 1e-6,
      );
      expect(end).toBeLessThanOrEqual(plan.total + 1e-6);
    }
  });

  it('arrives from nothing and rests in the still picture: every piece whole at the end', () => {
    for (const look of OWN) {
      const a = arriveFrames(
        G(look) as Exclude<RimGeometry, { look: 'FREEZER' | 'DEEP_FREEZER' }>,
        RIM_HOLD_MS,
        RIM_HOLD_MS + RIM_ARRIVE_MS,
        true,
      );
      for (const [name, fr] of every(a)) {
        if (/opacity$/.test(name) && !/trail opacity/.test(name)) {
          expect(sample(fr, 0), `${look} ${name}`).toBe(0);
          expect(sample(fr, 1), `${look} ${name}`).toBe(1);
        }
        if (/scale$|stretch$/.test(name)) expect(sample(fr, 1), `${look} ${name}`).toBe(1);
        if (/^mote/.test(name)) {
          expect(sample(fr, 0)).toBe(0);
          expect(sample(fr, 1)).toBe(1);
        }
      }
    }
  });

  it('runs the fridge’s bead down once and leaves it, and its track, where it stopped', () => {
    const g = G('FRIDGE');
    const a = arriveFrames(g as never, RIM_HOLD_MS, RIM_HOLD_MS + RIM_ARRIVE_MS, true);
    if (a.look !== 'FRIDGE' || g.look !== 'FRIDGE' || a.runner === null || g.runner === null)
      throw new Error('no runner');
    const run = a.runner;
    const ys = STEPS.map(p => sample(run.y, p));
    for (let k = 1; k < ys.length; k += 1) expect(ys[k]!).toBeGreaterThanOrEqual(ys[k - 1]! - 1e-9);
    expect(ys.at(-1)).toBeCloseTo(g.runner.y1 - g.runner.y0, 9);
    // seen from when it forms to the end: it never goes out again
    const o = STEPS.map(p => sample(run.opacity, p));
    const on = o.findIndex(v => v >= 1);
    expect(Math.min(...o.slice(on))).toBe(1);
    // the track's foot is where the bead is while it runs, and stays drawn
    expect(sample(run.trailOpacity, 1)).toBe(1);
    expect(sample(run.trail, 1)).toBe(1);
  });

  it('runs meltwater’s drops in once and rests them where a thaw would, lines faded to the same', () => {
    const g = G('THAWED');
    const a = arriveFrames(g as never, RIM_HOLD_MS, RIM_HOLD_MS + RIM_ARRIVE_MS, true);
    if (a.look !== 'THAWED' || g.look !== 'THAWED') throw new Error('not meltwater');
    expect(a.drops).toHaveLength(g.drops.length);
    for (const [i, d] of a.drops.entries()) {
      const drop = g.drops[i]!;
      expect(sample(d.y, 1)).toBeCloseTo(drop.y1 - drop.y0, 9);
      expect(sample(d.opacity, 1)).toBe(1);
      expect(sample(d.stretch, 1)).toBe(1);
      expect(sample(d.trailOpacity, 1)).toBe(THAW_TRAIL);
    }
    // after a thaw, the drops are the frost's: this picture brings only its sheen and its beads
    const after = arriveFrames(g as never, RIM_HANDOFF_MS, FROST_MS.thaw, false);
    expect(after.look === 'THAWED' && after.drops).toEqual([]);
  });

  it('ends a thaw on the thawing picture exactly: its drops come to rest where that picture draws them', () => {
    for (const from of ['FREEZER', 'DEEP_FREEZER'] as const) {
      const plan = rimPlan(from, 'THAWED')!;
      const motion = rimMotion(plan, G(from), G('THAWED'));
      const still = G('THAWED');
      if (motion.frost === null || still.look !== 'THAWED') throw new Error('no thaw');
      expect(motion.frost.motion).toBe('thaw');
      expect(motion.frost.g.drops).toEqual(still.drops);
      for (const [i, d] of motion.frost.frames.drops.entries()) {
        const drop = still.drops[i]!;
        expect(sample(d.y, 1)).toBeCloseTo(drop.y1 - drop.y0, 9);
        expect(sample(d.opacity, 1)).toBe(1);
        expect(sample(d.trailOpacity, 1)).toBe(THAW_TRAIL);
      }
    }
  });

  it('fades the picture that is leaving inside the beat, and never a frost, which melts instead', () => {
    for (const { from, plan, motion } of CHANGES) {
      if (motion.fade === null) {
        expect(from === null || isFrostLook(from)).toBe(true);
        continue;
      }
      expect(sample(motion.fade, 0)).toBe(1);
      expect(sample(motion.fade, RIM_HOLD_MS / plan.total)).toBe(0);
      expect(sample(motion.fade, 1)).toBe(0);
    }
  });

  it('nothing loops: every piece reaches its last value once and stays there', () => {
    const wrong: string[] = [];
    for (const { from, to, motion } of CHANGES) {
      if (motion.arrive === null) continue;
      for (const [name, fr] of every(motion.arrive)) {
        if (!/opacity$/.test(name) || /trail opacity/.test(name)) continue;
        const o = STEPS.map(p => sample(fr, p));
        const first = o.findIndex(v => v >= 1 - 1e-9);
        if (first < 0 || Math.min(...o.slice(first)) < 1 - 1e-9)
          wrong.push(`${from}→${to} ${name}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('the component (tripwires over PlaceRim.tsx)', () => {
  it('is decoration: no touch, hidden from assistive technology, and nothing pressable in it', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
    expect(component).not.toContain('<Pressable');
    expect(component).not.toContain('onPress');
    expect(component).not.toMatch(/accessibilityRole|accessibilityLabel/);
  });

  it('fills its host and is clipped to the host’s corners only where it is handed them', () => {
    expect(flat).toContain('StyleSheet.absoluteFill,');
    expect(flat).toContain('const clip = rimClip(corners, sides);');
    expect(flat).toContain(
      "clip === null ? null : { overflow: 'hidden', borderTopLeftRadius: clip.topLeft, borderTopRightRadius: clip.topRight, borderBottomLeftRadius: clip.bottomLeft, borderBottomRightRadius: clip.bottomRight, }",
    );
    // and places every piece clear of those same corners
    expect(flat).toContain('rimGeometry(l, height, { x: insetX, y: insetY }, sides, clipped)');
  });

  it('reads reduce motion and Night from the theme, and plays only through the planner', () => {
    expect(flat).toContain('const calm = frostCalm(t.theme, t.reduceMotion);');
    expect(flat).toContain('const show = placeRimShow(look, cue, Date.now(), calm);');
    // nothing drawn at all for a host with no picture
    expect(flat).toContain("if (show.kind === 'still' && show.look === null) return null;");
    // the still picture moves nothing: no animated value anywhere in it
    const still = flat.slice(
      flat.indexOf('const Still = memo('),
      flat.indexOf('interface MovingProps'),
    );
    expect(still.length).toBeGreaterThan(0);
    expect(still).not.toContain('Animated');
  });

  it('draws nothing that shines where the palette has none — Night', () => {
    expect(flat).toContain('{sparkle ? g.frost.sparkles.map(');
    expect(flat).toContain('{highlight ? ( <Circle');
    expect(flat).toContain('{glint ? ( <Circle');
    expect(flat).toContain('{ray ? g.rays.map(');
    expect(flat).toContain('{mote ? g.motes.map(');
  });

  it('runs every frame on the native driver: opacity and transforms only, on a linear clock', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    expect(flat).toContain('easing: Easing.linear');
    // every animated number is an opacity or a transform
    const fed = [...flat.matchAll(/(\w+): num\(/g)].map(m => m[1]);
    expect(fed.length).toBeGreaterThan(0);
    for (const prop of fed)
      expect(['opacity', 'scale', 'scaleX', 'scaleY', 'translateY'], prop).toContain(prop);
    // a re-render mid-change continues it: the layer starts from where it began, keyed by its cue
    expect(flat).toContain('const start = useRef(at).current;');
    expect(flat).toContain("key={`${show.from ?? 'new'}>${show.to}:${cue?.startAt ?? 0}`}");
    expect(flat).toContain('return () => run.stop();');
    // and gets the SAME animated nodes back: the change's frames are built once, and each frame's
    // interpolation is made once and handed back, so nothing native is rebuilt under a motion
    expect(flat).toContain('}, [from, to, geometry]);');
    expect(flat).toContain(
      'const made = new WeakMap<Frame, Animated.AnimatedInterpolation<number>>();',
    );
    expect(flat).toContain('if (had !== undefined) return had;');
  });

  it('stacks a change as the still picture is stacked: every wash under every piece', () => {
    const moving = flat.slice(flat.indexOf('function Moving('), flat.indexOf('const piece = ('));
    const fade = moving.indexOf('<Still g={geometry(from)}');
    const wash = moving.indexOf('part="wash"');
    const frost = moving.indexOf('<FrostMoving');
    const pieces = moving.indexOf('part="pieces"');
    // the leaving picture at the bottom, the arriving wash, the frost going, the arriving pieces:
    // so a thaw's last frame is the meltwater picture exactly, its sheen beneath the frost's drops
    expect(fade).toBeGreaterThan(-1);
    expect(wash).toBeGreaterThan(fade);
    expect(frost).toBeGreaterThan(wash);
    expect(pieces).toBeGreaterThan(frost);
    const still = flat.slice(
      flat.indexOf('const Still = memo('),
      flat.indexOf('function StillPieces('),
    );
    expect(still.indexOf('<WashFill')).toBeLessThan(still.indexOf('<StillPieces'));
  });

  it('grows each piece from where it is rooted, and each wash from its edge', () => {
    expect(flat).toContain("transformOrigin: [side === 'left' ? 0 : w, S / 2, 0]");
    expect(flat).toContain('transformOrigin: [fern.origin.x, fern.origin.y, 0]');
    expect(flat).toContain('transformOrigin: [r.origin.x, r.origin.y, 0]');
    expect(flat).toContain('transformOrigin: [TRAIL_WIDTH / 2, 0, 0]');
  });

  it('is cheap enough for a hundred rows: memoized on its props, one SVG a strip, no filter', () => {
    expect(flat).toContain('export const PlaceRim = memo(PlaceRimBase, sameRim);');
    expect(flat).toContain('const Still = memo(function Still(');
    // compared by value, so a row re-rendered by the minute's tick redraws none of it
    for (const field of ['a.kind === b.kind', 'a.inset.x === b.inset.x', 'a.inset.y === b.inset.y'])
      expect(flat).toContain(field);
    // geometry built once per shape and look
    expect(flat).toContain('const geometry = useMemo(');
    expect(component).not.toMatch(/Filter|feGaussianBlur|BlurView/);
    // at rest, one Svg per strip
    const still = flat.slice(
      flat.indexOf('const Still = memo('),
      flat.indexOf('function StillPieces('),
    );
    expect(still.match(/<Svg /g)).toHaveLength(1);
  });

  it('asks for nothing Expo Go does not carry: React Native, react-native-svg, and its own files', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
    expect(component).not.toContain('reanimated');
    expect(pure).not.toMatch(/from 'react/);
  });

  it('writes no color: every fill is a palette’s', () => {
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    }
    for (const reads of [
      'DEW_PALETTES[theme]',
      'GLOW_PALETTES[theme]',
      'MELT_PALETTES[theme]',
      'rimWash(',
    ])
      expect(flat).toContain(reads);
    expect(flat).toContain("look === 'DEEP_FREEZER' ? deepFrostFor(theme) : frostFor(theme)");
  });

  it('draws a thaw’s resting lines at the strength the thaw leaves them', () => {
    expect(flat).toContain('opacity={THAW_TRAIL}');
  });

  it('is exported with the design system’s other controls, and the old frost-only one is gone', () => {
    const core = read('core.ts');
    expect(core).toContain("export * from './PlaceRim';");
    expect(core).not.toContain('FrostRim');
    // `RIM_ZONE` left this line on 2026-09-26: nothing imported it through the barrel
    expect(flat).toContain("export { placeRimLook, rimZone } from './placeRim';");
  });
});
