/**
 * THE BATH WITH BUBBLES (the owner, 2026-09-25, idea 6 of the "that's cool" list: the bath sheet's
 * "Hair — Washed / Not washed", where "yes" sends a few bubbles rising once and "no" leaves still
 * water). The scene is geometry and the bubbles are frames, so both are tested as numbers: the duck
 * floats inside the pill at rest and through every point of a move; the foam sits on the water,
 * clear of the words; every rising bubble starts out of the foam, rises, LEAVES THE PILL through its
 * top and is gone — and nothing is left running. When a change blows bubbles, and when it cannot,
 * is the planner's, and is tested as a table. What only a device can show is held by tripwires over
 * `BathToggle.tsx`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type as typeScale } from '../theme/theme';
import {
  BATH_SLOT,
  bathFrames,
  bathScene,
  bubbleAt,
  DUCK,
  DUCK_ROCK,
  FOAM,
  GHOST_BUBBLES,
  planBath,
  RISE_DELAY,
  RISE_FROM,
  riserFrom,
  RISERS,
  WATER,
} from './bathToggle';
import type { Frame } from './dayNightSwitch';
import {
  PICTURE_EASE,
  PICTURE_STOPS,
  PICTURE_TOGGLE_SIZE,
  PICTURE_WORD,
  pictureToggleGeometry,
  pictureTrackFrames,
  type PictureStop,
  type PictureToggleGeometry,
} from './pictureToggle';
import { easeAt } from './themeSkyToggle';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('BathToggle.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('bathToggle.ts'));

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

const pairs = (d: string): [number, number][] => {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i] ?? 0, n[i + 1] ?? 0]);
  return out;
};
/** The duck's outline in the knob's box: its paths' anchors and control points, and its head. */
const DUCK_OUTLINE: readonly [number, number][] = [
  ...pairs(DUCK.body),
  ...pairs(DUCK.beak),
  ...Array.from({ length: 24 }, (_, i): [number, number] => {
    const a = (i / 24) * 2 * Math.PI;
    return [DUCK.head.cx + DUCK.head.r * Math.cos(a), DUCK.head.cy + DUCK.head.r * Math.sin(a)];
  }),
];

/** The duck, placed: `knobX` along, bobbed, and rocked `deg` about its waterline. */
function placedDuck(g: PictureToggleGeometry, knobX: number, bob: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const { x: px, y: py } = DUCK.pivot;
  return DUCK_OUTLINE.map(([x, y]): [number, number] => {
    const [dx, dy] = [x - px, y - py];
    return [g.rest[0] + knobX + px + dx * c - dy * s, g.inset + bob + py + dx * s + dy * c];
  });
}

const STEPS = Array.from({ length: 201 }, (_, i) => i / 200);
const WIDTHS = Array.from(
  { length: (PICTURE_TOGGLE_SIZE.maxWidth - 272) / 4 + 1 },
  (_, i) => 272 + i * 4,
);
const geo = (w: number) => pictureToggleGeometry(w, BATH_SLOT);

describe('the scene', () => {
  it('lays the water along the pill’s foot and floats the duck on its surface', () => {
    const g = geo(324);
    const scene = bathScene(g);
    expect(scene.surface).toBe(g.height - WATER.depth);
    // the duck is drawn for this waterline, in the knob's box
    expect(scene.waterline).toBe(DUCK.pivot.y);
    expect(scene.waterline).toBe(scene.surface - g.inset);
    // its keel goes a few points under, where the water drawn over it makes it float
    expect(DUCK.bounds.bottom).toBeGreaterThan(scene.waterline);
    expect(DUCK.bounds.bottom - scene.waterline).toBeLessThan(5);
  });

  it('writes the words on the wall, never on the water, at their largest', () => {
    for (const width of WIDTHS) {
      const scene = bathScene(geo(width));
      expect(scene.words.top).toBe(0);
      expect(scene.words.top + scene.words.height).toBeLessThanOrEqual(scene.surface);
      // the tallest a word's line can be, centered in that room, still clears the water
      expect(scene.words.height).toBeGreaterThanOrEqual(
        typeScale.bodySm.lineHeight * PICTURE_WORD.ceiling,
      );
    }
  });
});

describe('the duck', () => {
  const margin = (g: PictureToggleGeometry) => g.rim + DUCK.stroke / 2;

  it('fits its slot, clear of the words, and floats inside the pill’s ends at rest', () => {
    for (const [x, y] of DUCK_OUTLINE) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(BATH_SLOT);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(48);
    }
    for (const width of WIDTHS) {
      const g = geo(width);
      for (const knobX of [0, g.travel])
        for (const [x, y] of placedDuck(g, knobX, 0, 0))
          expect(insidePill(g, x, y, margin(g)), `${width}: (${x}, ${y})`).toBe(true);
    }
  });

  it('stays inside the pill through every point of a move either way, bobbing and rocking', () => {
    const out: string[] = [];
    for (const width of [272, 308, 324, 339, 394, 440]) {
      const g = geo(width);
      const f = bathFrames(bathScene(g), 0);
      const track = pictureTrackFrames(g);
      for (const t of STEPS) {
        const e = easeAt(PICTURE_EASE, t);
        for (const [pos, sway] of [
          [e, t],
          [1 - e, -t],
        ] as const)
          for (const [x, y] of placedDuck(
            g,
            sample(track.knobX, pos),
            sample(f.bob, sway),
            sample(f.rock, sway),
          ))
            if (!insidePill(g, x, y, margin(g))) out.push(`${width}, t ${t}: (${x}, ${y})`);
      }
    }
    expect(out.slice(0, 3)).toEqual([]);
  });

  it('rocks and bobs only while it moves, and ripples the water only then', () => {
    const f = bathFrames(bathScene(geo(324)), 0);
    for (const s of [-1, 0, 1]) {
      expect(sample(f.rock, s)).toBe(0);
      expect(sample(f.bob, s)).toBe(0);
      expect(sample(f.ripple, s)).toBe(0);
    }
    // the rock is the push's, mirrored the other way; the bob and the ripples are the same both ways
    for (const s of STEPS) {
      expect(sample(f.rock, -s)).toBeCloseTo(-sample(f.rock, s), 9);
      expect(sample(f.bob, -s)).toBeCloseTo(sample(f.bob, s), 9);
      expect(sample(f.ripple, -s)).toBeCloseTo(sample(f.ripple, s), 9);
      expect(Math.abs(sample(f.rock, s))).toBeLessThanOrEqual(DUCK_ROCK);
      expect(Math.abs(sample(f.bob, s))).toBeLessThanOrEqual(1.5);
    }
    expect(sample(f.ripple, 0.5)).toBeGreaterThan(0.5);
  });
});

describe('the foam', () => {
  it('sits on the water round the duck at the bubbles stop, inside the pill, clear of the words', () => {
    for (const width of WIDTHS)
      for (const stop of PICTURE_STOPS) {
        const g = geo(width);
        const scene = bathScene(g);
        for (const b of FOAM) {
          const at = bubbleAt(g, scene, stop, b);
          // at its largest: the swell, and half its rim
          const r = at.r * 1.18 + 0.45;
          expect(insidePill(g, at.x - r, at.y, g.rim) && insidePill(g, at.x + r, at.y, g.rim)).toBe(
            true,
          );
          expect(insidePill(g, at.x, at.y - r, g.rim)).toBe(true);
          // on the water: its middle within a few points of the surface
          expect(Math.abs(at.y - scene.surface)).toBeLessThan(5);
          // never over the word beside it: the first stop's is to its right, the second's to its left
          if (stop === 0) expect(at.x + r).toBeLessThan(g.word[0].left);
          else expect(at.x - r).toBeGreaterThan(g.word[1].right);
          const slot = g.rest[stop];
          expect(at.x - r).toBeGreaterThan(slot - g.inset);
          expect(at.x + r).toBeLessThan(slot + g.slot + g.inset);
        }
      }
  });

  it('puffs up one bubble after another as the duck arrives, swells and settles', () => {
    const f = bathFrames(bathScene(geo(324)), 0);
    const starts = FOAM.map(b => b.at);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    for (const [i, b] of f.foam.entries()) {
      expect(sample(b.opacity, 0), `foam ${i}`).toBe(0);
      expect(sample(b.opacity, 1), `foam ${i}`).toBe(1);
      expect(sample(b.scale, 1), `foam ${i}`).toBe(1);
      const peak = Math.max(...STEPS.map(s => sample(b.scale, s)));
      expect(peak).toBeCloseTo(1.18, 9);
      // whole before the move ends, so the foam is up when the duck is in
      expect(b.scale.inputRange.at(-1) ?? 2).toBeLessThanOrEqual(1);
    }
  });
});

describe('the bubbles that rise — once, and out', () => {
  const g = geo(324);
  const scene = bathScene(g);
  const f = bathFrames(scene, 0);

  it('are gone before they start and gone at rest: nothing rises on a sheet that just opened', () => {
    // `rise` sits at 1 at rest — the first frame included — and every riser is invisible there
    for (const [i, b] of f.risers.entries()) {
      expect(sample(b.opacity, 0), `riser ${i}`).toBe(0);
      expect(sample(b.opacity, 1), `riser ${i}`).toBe(0);
      // and seen, fully, somewhere on the way
      expect(Math.max(...STEPS.map(s => sample(b.opacity, s))), `riser ${i}`).toBe(1);
    }
  });

  it('leave through the top of the pill, one after another, and stop', () => {
    const starts = RISERS.map(r => r.at);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    for (const [i, b] of f.risers.entries()) {
      const r = RISERS[i]!;
      const from = riserFrom(g, scene, 0, i);
      const end = r.at + r.span;
      expect(end).toBeLessThanOrEqual(1);
      // at the end of its span, the whole bubble — grown to its last size — is above the pill
      const top = from.y + sample(b.y, end);
      expect(top + r.r * sample(b.scale, end), `riser ${i}`).toBeLessThan(0);
      // and it STOPS there: the frames are clamped, so the rise's rest draws exactly that
      for (const fr of [b.y, b.x, b.opacity, b.scale]) {
        expect(fr.extrapolate).toBe('clamp');
        expect(sample(fr, 1)).toBe(sample(fr, end));
        expect(sample(fr, 7)).toBe(sample(fr, 1));
      }
      // it only ever goes up
      let last = Number.POSITIVE_INFINITY;
      for (const s of STEPS) {
        const y = sample(b.y, s);
        expect(y).toBeLessThanOrEqual(last + 1e-9);
        last = y;
      }
    }
  });

  it('come out of the foam, above the water, never out of the water itself', () => {
    for (const i of RISERS.keys()) {
      const from = riserFrom(g, scene, 0, i);
      expect(from.y).toBe(scene.surface - RISE_FROM);
      expect(from.y + RISERS[i]!.r).toBeLessThanOrEqual(scene.surface + 1e-9);
    }
  });

  it('rise in the duck’s own column, never across a word, at either end, at every width', () => {
    for (const width of WIDTHS)
      for (const stop of PICTURE_STOPS) {
        const gg = geo(width);
        const sc = bathScene(gg);
        const ff = bathFrames(sc, stop);
        for (const [i, b] of ff.risers.entries()) {
          const from = riserFrom(gg, sc, stop, i);
          const most = Math.max(...STEPS.map(s => Math.abs(sample(b.x, s))));
          const r = RISERS[i]!.r * Math.max(...STEPS.map(s => sample(b.scale, s)));
          if (stop === 0)
            expect(from.x + most + r, `${width} ${stop} ${i}`).toBeLessThan(gg.word[0].left);
          else expect(from.x - most - r, `${width} ${stop} ${i}`).toBeGreaterThan(gg.word[1].right);
          expect(from.x - most - r).toBeGreaterThan(0);
          expect(from.x + most + r).toBeLessThan(gg.width);
        }
      }
  });

  it('go with the foam: leaving the bubbles stop takes any bubble still on its way up', () => {
    expect(sample(f.gate, 0)).toBe(0);
    expect(sample(f.gate, 0.5)).toBe(0);
    expect(sample(f.gate, 0.8)).toBe(1);
    expect(sample(f.gate, 1)).toBe(1);
  });
});

describe('when bubbles rise, and when they cannot', () => {
  it('rises once on a change TO the bubbles stop, starting most of the way into the move', () => {
    expect(planBath(false, true, 600, false)).toEqual({
      animate: true,
      suds: 1,
      rise: true,
      duration: 600,
      riseDelay: Math.round(600 * RISE_DELAY),
    });
  });

  it('pops the foam and blows nothing on a change away from it', () => {
    const p = planBath(true, false, 600, false);
    expect(p.animate).toBe(true);
    expect(p.suds).toBe(0);
    expect(p.rise).toBe(false);
  });

  it('does nothing at all when the answer has not changed: no bubbles on a sheet that opens', () => {
    for (const on of [true, false]) {
      const p = planBath(on, on, 600, false);
      expect(p.animate).toBe(false);
      expect(p.rise).toBe(false);
      expect(p.suds).toBe(on ? 1 : 0);
    }
  });

  it('under reduce motion and in the amber Night, sets the foam and blows nothing', () => {
    for (const [was, is] of [
      [false, true],
      [true, false],
      [true, true],
      [false, false],
    ] as const) {
      const p = planBath(was, is, 600, true);
      expect(p.animate).toBe(false);
      expect(p.rise).toBe(false);
      expect(p.duration).toBe(0);
      // the end state, which is the answer: foam on the water for "washed", still water for not
      expect(p.suds).toBe(is ? 1 : 0);
    }
  });
});

describe('the ghost', () => {
  it('floats its outline bubbles over the ghost duck, inside its slot and the pill, at both ends', () => {
    for (const width of WIDTHS)
      for (const stop of PICTURE_STOPS) {
        const g = geo(width);
        const scene = bathScene(g);
        for (const b of GHOST_BUBBLES) {
          const x = g.rest[stop] + BATH_SLOT / 2 + b.dx;
          const y = scene.surface + b.dy;
          expect(x - b.r).toBeGreaterThan(g.rest[stop]);
          expect(x + b.r).toBeLessThan(g.rest[stop] + BATH_SLOT);
          expect(insidePill(g, x, y - b.r, g.rim + 0.6)).toBe(true);
          expect(y + b.r).toBeLessThan(scene.surface);
        }
      }
  });
});

describe('the frames', () => {
  it('are frames Animated can read: in order, one output per input, and clamped', () => {
    const f = bathFrames(bathScene(geo(324)), 1);
    const every: Frame[] = [
      f.gate,
      f.rock,
      f.bob,
      f.ripple,
      ...f.foam.flatMap(b => [b.opacity, b.scale]),
      ...f.risers.flatMap(b => [b.x, b.y, b.opacity, b.scale]),
    ];
    for (const fr of every) {
      expect(fr.inputRange.length).toBe(fr.outputRange.length);
      for (let i = 1; i < fr.inputRange.length; i += 1)
        expect(fr.inputRange[i] ?? 0).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
      expect(fr.extrapolate).toBe('clamp');
    }
  });

  it('mirrors a bubble’s place and wobble at the right-hand end, so it leans away from the word', () => {
    const g = geo(324);
    const scene = bathScene(g);
    const b = FOAM[0]!;
    const left = bubbleAt(g, scene, 0 as PictureStop, b);
    const right = bubbleAt(g, scene, 1 as PictureStop, b);
    expect(left.x - g.center[0]).toBeCloseTo(b.dx, 9);
    expect(right.x - g.center[1]).toBeCloseTo(-b.dx, 9);
    const l = bathFrames(scene, 0).risers[0]!;
    const r = bathFrames(scene, 1).risers[0]!;
    for (const s of STEPS) expect(sample(r.x, s)).toBeCloseTo(-sample(l.x, s), 9);
  });
});

describe('the component (tripwires over BathToggle.tsx)', () => {
  it('is the picture track with the caller’s options, answer, name and ids, words on the wall', () => {
    expect(flat).toContain('<PictureTrack options={options} value={value} onChange={onChange}');
    expect(flat).toContain('label={label}');
    expect(flat).toContain('words={scene.words}');
    expect(flat).toContain('{...(testID ? { testID } : {})}');
    expect(flat).toContain('const pic = bathPictureFor(t.theme);');
  });

  it('starts every bubble already gone, and blows them only on a change to the bubbles stop', () => {
    expect(flat).toContain('const rise = useRef(new Animated.Value(1)).current;');
    expect(flat).toContain('const suds = useRef(new Animated.Value(on ? 1 : 0)).current;');
    // the one place the rise is wound back is the one place it is run
    expect(component.split('rise.setValue(0)')).toHaveLength(2);
    expect(flat).toMatch(/if \(p\.rise\) \{ rise\.setValue\(0\); runs\.push\(/);
    expect(flat).toContain('delay: p.riseDelay');
    // once: nothing loops
    expect(component).not.toContain('Animated.loop');
    expect(component).not.toContain('repeat');
  });

  it('sets the end state, not an animation, when the picture is still', () => {
    expect(flat).toMatch(
      /if \(!p\.animate\) \{ suds\.setValue\(p\.suds\); rise\.setValue\(1\); return; \}/,
    );
    expect(flat).toContain(
      'const p = planBath(was.current, on, plan.current?.duration ?? PICTURE_MS, still);',
    );
    expect(flat).toContain('[on, still, plan, suds, rise]');
  });

  it('lets a rising bubble be seen only while the foam is up', () => {
    expect(flat).toContain('opacity: Animated.multiply(num(rise, b.opacity), gate)');
    expect(flat).toContain('const gate = num(suds, f.gate);');
  });

  it('runs every frame on the native driver: opacity and transforms only', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    const fed = [...flat.matchAll(/(\w+): (?:num|deg)\(/g)].map(m => m[1]);
    expect(fed.length).toBeGreaterThan(0);
    for (const prop of fed)
      expect(['opacity', 'translateX', 'translateY', 'scale', 'rotate'], prop).toContain(prop);
  });

  it('lights nothing where nothing may be lit', () => {
    expect(component.split('pic.shine ? (')).toHaveLength(3);
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

  it('writes no color and no word, and congratulates nobody', () => {
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
      expect(src).not.toMatch(/['"`](Washed|Not washed|Hair)['"`]/);
      expect(src).not.toMatch(/confetti|sparkle|well done|great job/i);
    }
  });

  it('is exported with the design system’s other controls, and its arithmetic without them', () => {
    expect(read('core.ts')).toContain("export * from './BathToggle';");
    expect(read('core.ts')).not.toContain("'./bathToggle'");
    expect(read('../layout.ts')).toContain("from './components/bathToggle';");
    expect(read('../index.ts')).toContain("export * from './theme/bath';");
  });
});
