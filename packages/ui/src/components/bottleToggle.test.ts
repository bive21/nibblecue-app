/**
 * THE BOTTLE THAT DRAINS (the owner, 2026-09-25, idea 3 of the "that's cool" list: the bottle
 * sheet's "Finished it / Some left" as a bottle whose milk drains to empty or stands at a line).
 * The level is arithmetic on the sheet's own two numbers, so it is tested as arithmetic: where the
 * milk stands for a fraction, what it does with a fraction that is out of range or unknown, and how
 * a new level moves. The drawing is tested as geometry: the bottle stays inside the pill at rest and
 * through every point of a move, leaning; the milk fills exactly the glass below its surface at
 * every level and every angle the slosh can reach. What only a device can show is held by
 * tripwires over `BottleToggle.tsx`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BOTTLE,
  BOTTLE_END_PAD,
  BOTTLE_LEAN,
  BOTTLE_SLOT,
  bottleFrames,
  bottleLevel,
  FOLLOW_MS,
  leftFraction,
  milkLayer,
  NOMINAL_LEFT,
  planLevel,
  SLOSH,
} from './bottleToggle';
import type { Frame } from './dayNightSwitch';
import {
  PICTURE_EASE,
  PICTURE_TOGGLE_SIZE,
  pictureToggleGeometry,
  pictureTrackFrames,
  type PictureToggleGeometry,
} from './pictureToggle';
import { easeAt } from './themeSkyToggle';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('BottleToggle.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('bottleToggle.ts'));

function sample(fr: Frame, p: number): number {
  const xs = fr.inputRange;
  const ys = fr.outputRange;
  const last = xs.length - 1;
  const seg = (i: number) => {
    const [x0, x1, y0, y1] = [xs[i] ?? 0, xs[i + 1] ?? 1, ys[i] ?? 0, ys[i + 1] ?? 0];
    return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
  };
  if (p <= (xs[0] ?? 0)) return fr.extrapolate === 'clamp' ? (ys[0] ?? 0) : seg(0);
  if (p >= (xs[last] ?? 1)) return fr.extrapolate === 'clamp' ? (ys[last] ?? 0) : seg(last - 1);
  let i = 0;
  while ((xs[i + 1] ?? 1) < p) i += 1;
  return seg(i);
}

function insidePill(g: PictureToggleGeometry, x: number, y: number, margin: number): boolean {
  const r = g.height / 2;
  const cx = Math.min(Math.max(x, r), g.width - r);
  return Math.hypot(x - cx, y - r) <= r - margin + 1e-9;
}

/** Points round a rounded rectangle's edge. */
function roundRect(b: { x: number; y: number; width: number; height: number; r: number }) {
  const pts: [number, number][] = [];
  const corners = [
    [b.x + b.r, b.y + b.r, Math.PI],
    [b.x + b.width - b.r, b.y + b.r, 1.5 * Math.PI],
    [b.x + b.width - b.r, b.y + b.height - b.r, 0],
    [b.x + b.r, b.y + b.height - b.r, 0.5 * Math.PI],
  ] as const;
  for (const [cx, cy, from] of corners)
    for (let i = 0; i <= 8; i += 1) {
      const a = from + (i / 8) * (Math.PI / 2);
      pts.push([cx + b.r * Math.cos(a), cy + b.r * Math.sin(a)]);
    }
  return pts;
}

/**
 * Every point of the bottle's outline, in the knob's box: the teat's anchors and control points
 * (control points lie outside a curve, so they bound it) and the edges of the collar and body.
 */
const OUTLINE: readonly [number, number][] = (() => {
  const nums = (BOTTLE.teat.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const teat: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) teat.push([nums[i] ?? 0, nums[i + 1] ?? 0]);
  return [...teat, ...roundRect(BOTTLE.collar), ...roundRect(BOTTLE.body)];
})();
/** The foot the bottle leans about: the middle of its base. */
const FOOT = [BOTTLE_SLOT / 2, BOTTLE.body.y + BOTTLE.body.height] as const;
const STEPS = Array.from({ length: 201 }, (_, i) => i / 200);
const WIDTHS = Array.from(
  { length: (PICTURE_TOGGLE_SIZE.maxWidth - 272) / 4 + 1 },
  (_, i) => 272 + i * 4,
);

/** The outline, placed: the knob `knobX` along from its left rest, leaning `deg` about its foot. */
function placed(g: PictureToggleGeometry, knobX: number, deg: number): [number, number][] {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return OUTLINE.map(([x, y]) => {
    const [dx, dy] = [x - FOOT[0], y - FOOT[1]];
    return [g.rest[0] + knobX + FOOT[0] + dx * c - dy * s, g.inset + FOOT[1] + dx * s + dy * c];
  });
}

describe('where the milk stands', () => {
  it('is empty on the drained stop, whatever is known', () => {
    for (const f of [null, 0, 0.25, 1, 3]) expect(bottleLevel(true, f)).toBe(0);
  });

  it('stands at the leftover over the bottle on the other stop', () => {
    expect(bottleLevel(false, 0.25)).toBe(0.25);
    expect(bottleLevel(false, leftFraction(30, 120))).toBe(0.25);
    // all of it left is a full bottle — a refused feed is a real feed (D16)
    expect(bottleLevel(false, 1)).toBe(1);
    // nothing left, on "Some left", is what the parent entered: the picture does not argue
    expect(bottleLevel(false, 0)).toBe(0);
  });

  it('clamps to the bottle: never above the collar, never below empty', () => {
    // more left than was in the bottle is refused in words by the sheet; the picture stops at full
    expect(bottleLevel(false, 1.4)).toBe(1);
    expect(bottleLevel(false, -0.2)).toBe(0);
    for (const f of [-5, -1, 0, 0.3, 0.99, 1, 1.01, 7]) {
      const l = bottleLevel(false, f);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
    }
  });

  it('draws a nominal third when the sheet cannot say', () => {
    expect(NOMINAL_LEFT).toBeCloseTo(1 / 3, 12);
    expect(bottleLevel(false, null)).toBe(NOMINAL_LEFT);
    expect(bottleLevel(false, Number.NaN)).toBe(NOMINAL_LEFT);
    expect(bottleLevel(false, Number.POSITIVE_INFINITY)).toBe(NOMINAL_LEFT);
  });

  it('knows the fraction only when there was a bottle, in any unit', () => {
    expect(leftFraction(1, 4)).toBe(0.25);
    expect(leftFraction(29.57, 118.28)).toBeCloseTo(0.25, 3);
    expect(leftFraction(0, 4)).toBe(0);
    expect(leftFraction(1, 0)).toBeNull();
    expect(leftFraction(1, -4)).toBeNull();
    expect(leftFraction(Number.NaN, 4)).toBeNull();
    expect(leftFraction(1, Number.NaN)).toBeNull();
  });
});

describe('how a new level moves', () => {
  it('arrives with the bottle on a change of answer: the move’s own clock and curve', () => {
    expect(planLevel(0, true, 600, false)).toEqual({
      animate: true,
      to: 0,
      duration: 600,
      ease: PICTURE_EASE,
    });
    // a move turned round part way is shorter, and the milk keeps its clock
    expect(planLevel(0.25, true, 405, false).duration).toBe(405);
  });

  it('follows a leftover changed on its stepper quickly, on its own', () => {
    const p = planLevel(0.5, false, 600, false);
    expect(p.animate).toBe(true);
    expect(p.duration).toBe(FOLLOW_MS);
    expect(p.duration).toBeLessThan(600);
    // quick off the mark: a tap on + is answered at once
    expect(easeAt(p.ease, 0.25)).toBeGreaterThan(0.4);
    expect(easeAt(p.ease, 1)).toBe(1);
  });

  it('is set, never animated, when the picture is still — reduce motion and the amber Night', () => {
    for (const toggled of [true, false]) {
      const p = planLevel(0.4, toggled, 600, true);
      expect(p.animate).toBe(false);
      expect(p.to).toBe(0.4);
      expect(p.duration).toBe(0);
    }
  });
});

describe('the milk in the glass', () => {
  const f = bottleFrames();
  const H = BOTTLE.body.height;
  const W = BOTTLE.body.width;
  const layer = milkLayer();

  it('stands at the body’s foot when empty and at its top when full', () => {
    // the layer's middle is the surface: at 0 it is the body's bottom edge, at 1 its top
    const surface = (level: number) => layer.top + layer.height / 2 + sample(f.milkY, level);
    expect(surface(0)).toBe(H);
    expect(surface(1)).toBe(0);
    expect(surface(0.25)).toBeCloseTo(0.75 * H, 9);
    // and the milk is the half below it
    expect(layer.milk.top).toBe(layer.height / 2);
    expect(layer.milk.top + layer.milk.height).toBe(layer.height);
  });

  it('is not there at all when the bottle is empty, so a slosh cannot show a sliver', () => {
    expect(sample(f.milk, 0)).toBe(0);
    expect(sample(f.milk, 0.03)).toBe(1);
    expect(sample(f.milk, 0.25)).toBe(1);
  });

  it('fills exactly the glass below its surface, at every level and every angle it can reach', () => {
    const angles = STEPS.map(s => sample(f.slosh, 2 * s - 1));
    const most = Math.max(...angles.map(Math.abs));
    expect(most).toBeCloseTo(SLOSH * BOTTLE_LEAN, 9);
    const gaps: string[] = [];
    let below = 0;
    for (const level of [0.04, 0.1, 0.25, 1 / 3, 0.5, 0.75, 0.9, 1])
      for (const deg of [-most, -most / 2, 0, most / 2, most]) {
        const a = (-deg * Math.PI) / 180;
        const [cx, cy] = [W / 2, (1 - level) * H];
        for (let x = 0; x <= W; x += W / 14)
          for (let y = 0; y <= H; y += H / 30) {
            // the point in the layer's own frame: turned back about the surface's middle
            const [dx, dy] = [x - cx, y - cy];
            const lx = dx * Math.cos(a) - dy * Math.sin(a);
            const ly = dx * Math.sin(a) + dy * Math.cos(a);
            if (ly < 0) continue; // above the surface: glass
            below += 1;
            // below it, the milk has to be there: inside the layer's lower half
            if (Math.abs(lx) > W || ly > layer.milk.height)
              gaps.push(`level ${level}, ${deg}°, (${x}, ${y})`);
          }
      }
    // the sweep is not vacuous: most of what it looked at was milk
    expect(below).toBeGreaterThan(5000);
    expect(gaps.slice(0, 3)).toEqual([]);
  });

  it('sloshes against the lean, so its surface tilts half the lean the other way in the room', () => {
    for (const s of STEPS.map(x => 2 * x - 1)) {
      const lean = sample(f.lean, s);
      const slosh = sample(f.slosh, s);
      expect(slosh).toBeCloseTo(-SLOSH * lean, 9);
      // the surface as the room sees it: the bottle's turn plus the milk's own
      expect(lean + slosh).toBeCloseTo((1 - SLOSH) * lean, 9);
    }
    // and it lies level at rest and at the end of a move
    for (const s of [-1, 0, 1]) expect(sample(f.slosh, s)).toBe(0);
  });
});

describe('where the bottle stands', () => {
  // inside the rim, by half its own outline
  const margin = (g: PictureToggleGeometry) => g.rim + BOTTLE.stroke / 2;

  it('fits its slot at rest, clear of the words, at both ends', () => {
    for (const [x] of OUTLINE) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(BOTTLE_SLOT);
    }
    for (const [, y] of OUTLINE) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(48);
    }
    // the knob's box is the pill less its inset: 48 tall, as the drawing assumes
    expect(pictureToggleGeometry(324, BOTTLE_SLOT, BOTTLE_END_PAD).knob).toBe(48);
  });

  it('stands inside the pill’s round ends at rest, at every width', () => {
    for (const width of WIDTHS) {
      const g = pictureToggleGeometry(width, BOTTLE_SLOT, BOTTLE_END_PAD);
      for (const knobX of [0, g.travel])
        for (const [x, y] of placed(g, knobX, 0))
          expect(insidePill(g, x, y, margin(g)), `at ${width}, (${x}, ${y})`).toBe(true);
    }
  });

  it('would put its foot through the curve at the bare inset — which is why it rests further in', () => {
    const g = pictureToggleGeometry(324, BOTTLE_SLOT, 0);
    expect(placed(g, 0, 0).every(([x, y]) => insidePill(g, x, y, margin(g)))).toBe(false);
  });

  it('stays inside the pill through every point of a move either way, leaning', () => {
    const f = bottleFrames();
    // every point checked, the first one out reported: one assertion, not a quarter of a million
    const out: string[] = [];
    for (const width of [272, 308, 324, 339, 394, 440]) {
      const g = pictureToggleGeometry(width, BOTTLE_SLOT, BOTTLE_END_PAD);
      const track = pictureTrackFrames(g);
      for (const t of STEPS) {
        const e = easeAt(PICTURE_EASE, t);
        for (const [pos, sway] of [
          [e, t],
          [1 - e, -t],
        ] as const) {
          for (const [x, y] of placed(g, sample(track.knobX, pos), sample(f.lean, sway)))
            if (!insidePill(g, x, y, margin(g))) out.push(`${width}, t ${t}, (${x}, ${y})`);
        }
      }
    }
    expect(out.slice(0, 3)).toEqual([]);
  });

  it('draws its graduations at a quarter, a half and three quarters, inside the glass', () => {
    expect(BOTTLE.ticks).toEqual([0.25, 0.5, 0.75]);
    expect(BOTTLE.tick.to).toBeLessThan(BOTTLE.body.width / 2);
    // the highlight is inside the glass too, down its far side
    const s = BOTTLE.shine;
    expect(s.x).toBeGreaterThan(BOTTLE.body.x + BOTTLE.body.width / 2);
    expect(s.x + s.width).toBeLessThan(BOTTLE.body.x + BOTTLE.body.width);
    expect(s.y).toBeGreaterThan(BOTTLE.collar.y + BOTTLE.collar.height);
    expect(s.y + s.height).toBeLessThan(BOTTLE.body.y + BOTTLE.body.height - BOTTLE.body.r);
  });
});

describe('the component (tripwires over BottleToggle.tsx)', () => {
  it('is the picture track with the caller’s options, answer, name and ids', () => {
    expect(flat).toContain('<PictureTrack options={options} value={value} onChange={onChange}');
    expect(flat).toContain('label={label}');
    expect(flat).toContain('{...(testID ? { testID } : {})}');
    expect(flat).toContain('ink={{ word: pic.word, quiet: pic.quiet }}');
    expect(flat).toContain('const pic = bottlePictureFor(t.theme);');
  });

  it('keeps the milk a value of its own, which a change of answer and a leftover both move', () => {
    expect(flat).toContain('const target = bottleLevel(value === drained, fraction);');
    expect(flat).toContain('const level = useRef(new Animated.Value(target)).current;');
    expect(flat).toContain(
      'const p = planLevel(target, toggled, plan.current?.duration ?? PICTURE_MS, still);',
    );
    expect(flat).toMatch(/if \(!p\.animate\) \{ level\.setValue\(p\.to\); return; \}/);
    expect(flat).toContain('[level, value, target, still, plan]');
  });

  it('drains and sloshes on the native driver: the level moves the layer, the sway turns it', () => {
    expect(flat).toContain('opacity: num(level, f.milk)');
    expect(flat).toContain(
      'transform: [{ translateY: num(level, f.milkY) }, { rotate: deg(knob.sway, f.slosh) }]',
    );
    expect(flat).toContain(
      '{ scale: BOTTLE_KNOB_SCALE }, { translateY: foot }, { rotate: deg(knob.sway, f.lean) }, { translateY: -foot },',
    );
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    const fed = [...flat.matchAll(/(\w+): (?:num|deg)\(/g)].map(m => m[1]);
    for (const prop of fed) expect(['opacity', 'translateY', 'rotate'], prop).toContain(prop);
  });

  it('clips the milk to the glass, and lights the glass only where anything may be lit', () => {
    expect(flat).toContain("body: { position: 'absolute', overflow: 'hidden' }");
    expect(flat).toContain('{pic.shine ? (');
  });

  it('draws the ghost with no line on the drained stop and the milk’s line on the other', () => {
    expect(flat).toContain('level={drainedStop === 0 ? 0 : ghostLevel}');
    expect(flat).toContain('level={drainedStop === 1 ? 0 : ghostLevel}');
    expect(flat).toContain('const ghostLevel = bottleLevel(false, fraction);');
  });

  it('asks for nothing Expo Go does not carry: React Native, react-native-svg, and its own files', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
  });

  it('writes no color and no word, and no number of the baby’s', () => {
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
      expect(src).not.toMatch(/['"`](Finished it|Some left|The bottle)['"`]/);
    }
    // it pictures the answer and nothing more: no amount is drawn, no praise for finishing
    for (const word of ['oz', 'ml', 'Great', 'Well done', 'confetti', 'sparkle'])
      expect(component, word).not.toMatch(new RegExp(`['"\`][^'"\`]*\\b${word}\\b`, 'i'));
  });

  it('is exported with the design system’s other controls, and its arithmetic without them', () => {
    expect(read('core.ts')).toContain("export * from './BottleToggle';");
    expect(read('core.ts')).not.toContain("'./bottleToggle'");
    expect(read('../layout.ts')).toContain("from './components/bottleToggle';");
    expect(flat).toContain("export { leftFraction } from './bottleToggle';");
    expect(read('../index.ts')).toContain("export * from './theme/bottle';");
  });
});
