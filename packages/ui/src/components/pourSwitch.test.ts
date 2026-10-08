/**
 * THE POUR SWITCH (the owner, 2026-09-27, of setup's "Feeding and milk": *"make animation on the
 * toogle on the feeding: feeding and milk page. make it more interesting"*). Two halves, the way
 * this package tests anything that moves: the picture at every point of its five values is PURE
 * (`pourSwitch.ts`) and is watched here frame by frame, on the same curves and the same frames the
 * component hands the native driver; what only a device could show (that it is one switch to a
 * screen reader, runs on the native driver, keeps still under reduce motion and in the amber
 * Night, and never glows there) is held by tripwires over `PourSwitch.tsx` and `Row.tsx`, because
 * this suite has no renderer (`interaction.test.ts` says why that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BELL_SIZE } from './bellSwitch';
import type { Frame } from './dayNightSwitch';
import { sampleFrame } from './keyframes';
import {
  GLOW_SPREAD,
  POUR_EASE,
  POUR_LAND_PIVOT,
  POUR_MAX_MS,
  POUR_MS,
  POUR_REST_MARGIN,
  POUR_SIZE,
  milkSurfaceAt,
  pourFrames,
  pourGeometry,
  pourPicture,
  pourPlan,
  pourValuesAt,
  pourValuesAtRest,
  pourWavePath,
  surfaceY,
  waveFraction,
  type PourPlan,
  type PourValues,
} from './pourSwitch';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const g = pourGeometry();
/** Every point across the track, a quarter point apart. */
const ACROSS = Array.from({ length: g.width * 4 + 1 }, (_, i) => i / 4);

/** Frame by frame, every 10 ms, from `from` through `plan` to its end and a little past. */
function film(from: PourValues, plan: PourPlan): { ms: number; v: PourValues }[] {
  const out: { ms: number; v: PourValues }[] = [];
  for (let ms = 0; ms <= plan.total + 40; ms += 10)
    out.push({ ms, v: pourValuesAt(from, plan, ms) });
  return out;
}

/**
 * Whether a point is inside the pill: within half the height of the segment joining the two
 * ends' centers (a capsule), with a hair for the float.
 */
function inPill(x: number, y: number): boolean {
  const r = g.height / 2;
  const cx = Math.min(Math.max(x, r), g.width - r);
  return Math.hypot(x - cx, y - r) <= r + 1e-9;
}

const offRest = pourValuesAtRest(false);
const onRest = pourValuesAtRest(true);
const fill = pourPlan(true, false, true);
const drain = pourPlan(false, false, true);

describe('the size', () => {
  it('is the bell switch’s own, so every drawn switch in the app is one size', () => {
    expect(POUR_SIZE).toEqual(BELL_SIZE);
    expect(g.knob).toBe(26);
    expect(g.travel).toBe(24);
  });

  it('keeps the knob inside the pill at both ends', () => {
    for (const x0 of [g.inset, g.inset + g.travel]) {
      const cx = x0 + g.knob / 2;
      for (let a = 0; a < 360; a += 5) {
        const t = (a * Math.PI) / 180;
        expect(
          inPill(cx + (g.knob / 2) * Math.cos(t), g.height / 2 + (g.knob / 2) * Math.sin(t)),
        ).toBe(true);
      }
    }
  });
});

describe('the milk', () => {
  it('is one path drawn once: the wave along the top, closed round the body under it', () => {
    const d = pourWavePath(g);
    expect(d.startsWith('M0 ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const ys = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(m => Number(m[2]));
    const xs = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(m => Number(m[1]));
    // the wave stays in its band; the body's two corners are at the foot of the layer
    for (const y of ys.slice(0, -2)) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(g.layer.band);
    }
    expect(Math.max(...xs)).toBeCloseTo(g.layer.width, 5);
    expect(ys.slice(-2)).toEqual([g.layer.height, g.layer.height]);
  });

  it('repeats every wavelength, so sliding it one wavelength shows the same surface', () => {
    for (const x of ACROSS) expect(surfaceY(g, x + g.wave.length)).toBeCloseTo(surfaceY(g, x), 9);
  });

  it('is a wavelength wider than the track, so any offset still covers it edge to edge', () => {
    const f = pourFrames(g);
    for (let i = 0; i <= 100; i += 1) {
      const x = sampleFrame(f.milkX, i / 100);
      expect(x).toBeLessThanOrEqual(0);
      expect(x + g.layer.width).toBeGreaterThanOrEqual(g.width);
    }
  });

  it('shows nothing in an empty track and fills a full one to the brim, with room to spare', () => {
    const empty = pourPicture(g, offRest);
    const full = pourPicture(g, onRest);
    for (const x of ACROSS) {
      expect(milkSurfaceAt(g, empty, x)).toBeGreaterThanOrEqual(g.height + POUR_REST_MARGIN - 1e-9);
      expect(milkSurfaceAt(g, full, x)).toBeLessThanOrEqual(-POUR_REST_MARGIN + 1e-9);
    }
    // and the body reaches the foot of the track when full
    expect(full.milkY + g.layer.height).toBeGreaterThanOrEqual(g.height);
  });

  it('shows a surface inside the track while it pours, so the pour is seen', () => {
    const seen = film(offRest, fill).some(({ v }) => {
      const p = pourPicture(g, v);
      return ACROSS.some(x => {
        const y = milkSurfaceAt(g, p, x);
        return y > g.height * 0.25 && y < g.height * 0.75;
      });
    });
    expect(seen).toBe(true);
  });
});

describe('the plan', () => {
  it('pours in 400 to 600 ms and drains in less, starting everything on the tap', () => {
    expect(fill.total).toBeGreaterThanOrEqual(400);
    expect(fill.total).toBeLessThanOrEqual(POUR_MAX_MS);
    expect(POUR_MAX_MS).toBe(600);
    expect(drain.total).toBeLessThan(fill.total);
    // the knob and the milk move at once: nothing waits, so the next tap can land at any frame
    for (const p of [fill, drain]) {
      expect(p.slide.delay).toBe(0);
      expect(p.level.delay).toBe(0);
      expect(p.wave.delay).toBe(0);
    }
  });

  it('celebrates a fill once, with a landing and a glow, and a drain not at all', () => {
    expect(fill.act).toBe('fill');
    expect(fill.land).not.toBeNull();
    expect(fill.bloom).not.toBeNull();
    expect(drain.act).toBe('drain');
    expect(drain.land).toBeNull();
    expect(drain.bloom).toBeNull();
  });

  it('draws no glow where the switch may not glow (the amber Night, a design with no shadows)', () => {
    const noGlow = pourPlan(true, false, false);
    expect(noGlow.animate).toBe(true);
    expect(noGlow.bloom).toBeNull();
    expect(noGlow.total).toBeLessThanOrEqual(POUR_MAX_MS);
  });

  it('under reduce motion and in the amber Night, sets the end and moves nothing', () => {
    for (const value of [true, false]) {
      const p = pourPlan(value, true, true);
      expect(p.animate).toBe(false);
      expect(p.land).toBeNull();
      expect(p.bloom).toBeNull();
      expect(p.total).toBe(0);
      // the picture at any moment is the one at rest
      expect(pourValuesAt(value ? offRest : onRest, p, 0)).toEqual(pourValuesAtRest(value));
    }
  });

  it('sends the ripple one wavelength, the way the knob goes', () => {
    expect(fill.wave.by).toBe(1);
    expect(drain.wave.by).toBe(-1);
    expect(fill.wave.duration).toBe(fill.level.duration);
    expect(drain.wave.duration).toBe(drain.level.duration);
  });

  it('holds its eases to the ones written down', () => {
    expect(fill.slide.ease).toBe('slide');
    expect(fill.level.ease).toBe('fill');
    expect(drain.level.ease).toBe('drain');
    for (const e of Object.values(POUR_EASE)) {
      expect(e[0]).toBeGreaterThanOrEqual(0);
      expect(e[0]).toBeLessThanOrEqual(1);
      expect(e[2]).toBeGreaterThanOrEqual(0);
      expect(e[2]).toBeLessThanOrEqual(1);
    }
  });
});

describe('frame by frame', () => {
  it('fills only up and drains only down, and the knob only ever moves toward its end', () => {
    for (const [from, plan, sign] of [
      [offRest, fill, 1],
      [onRest, drain, -1],
    ] as const) {
      const frames = film(from, plan);
      for (let i = 1; i < frames.length; i += 1) {
        const a = frames[i - 1]?.v as PourValues;
        const b = frames[i]?.v as PourValues;
        expect(sign * (b.level - a.level)).toBeGreaterThanOrEqual(-1e-9);
        expect(sign * (b.pos - a.pos)).toBeGreaterThanOrEqual(-1e-9);
        expect(b.pos).toBeGreaterThanOrEqual(0);
        expect(b.pos).toBeLessThanOrEqual(1);
      }
      expect(frames[frames.length - 1]?.v.level).toBe(plan.to.level);
      expect(frames[frames.length - 1]?.v.pos).toBe(plan.to.pos);
    }
  });

  it('moves the ripple the way the knob goes, and ends showing the surface it began with', () => {
    for (const [from, plan, sign] of [
      [offRest, fill, 1],
      [onRest, drain, -1],
    ] as const) {
      const frames = film(from, plan).map(({ v }) => pourPicture(g, v).milkX);
      const L = g.wave.length;
      for (let i = 1; i < frames.length; i += 1) {
        // the step between two frames, as the eye sees it: modulo one wavelength, nearest way
        const raw = (frames[i] ?? 0) - (frames[i - 1] ?? 0);
        const step = raw - L * Math.round(raw / L);
        expect(sign * step).toBeGreaterThanOrEqual(-1e-9);
      }
      const drift = (frames[frames.length - 1] ?? 0) - (frames[0] ?? 0);
      expect(Math.abs(drift - L * Math.round(drift / L))).toBeLessThan(1e-9);
    }
  });

  it('keeps the knob inside the pill at every frame of its landing', () => {
    for (const { v } of film(offRest, fill)) {
      const p = pourPicture(g, v);
      // the knob's center, moved by its squash about the edge it lands on (`POUR_LAND_PIVOT`,
      // `px` from the center): scaled about a point, a center moves by px × (1 - scale)
      const px = g.knob * POUR_LAND_PIVOT.x;
      const cx = g.inset + p.knobX + g.knob / 2 + px * (1 - p.squashX);
      const rx = (g.knob / 2) * p.squashX;
      const ry = (g.knob / 2) * p.squashY;
      for (let a = 0; a < 360; a += 5) {
        const t = (a * Math.PI) / 180;
        expect(inPill(cx + rx * Math.cos(t), g.height / 2 + ry * Math.sin(t)), `${a}°`).toBe(true);
      }
    }
  });

  it('squashes the knob only while it lands, and round before and after', () => {
    const frames = film(offRest, fill);
    for (const { ms, v } of frames) {
      const p = pourPicture(g, v);
      if (ms < POUR_MS.landDelay || ms >= POUR_MS.landDelay + POUR_MS.land) {
        expect(p.squashX, `${ms}`).toBeCloseTo(1, 9);
        expect(p.squashY, `${ms}`).toBeCloseTo(1, 9);
      }
    }
    const squashed = frames.some(({ v }) => pourPicture(g, v).squashX > 1.05);
    expect(squashed).toBe(true);
  });

  it('blooms only once the track is full, grows no further than its spread, and is gone at the end', () => {
    const start = fill.bloom?.delay ?? 0;
    expect(pourValuesAt(offRest, fill, start).level).toBeGreaterThanOrEqual(0.9);
    const frames = film(offRest, fill).map(({ ms, v }) => ({ ms, p: pourPicture(g, v) }));
    const peak = Math.max(...frames.map(f => f.p.glow));
    expect(peak).toBeCloseTo(1, 1);
    for (const { ms, p } of frames) {
      if (ms <= start) expect(p.glow, `${ms}`).toBe(0);
      expect(g.width * p.glowX).toBeLessThanOrEqual(g.width + 2 * GLOW_SPREAD + 1e-9);
      expect(g.height * p.glowY).toBeLessThanOrEqual(g.height + 2 * GLOW_SPREAD + 1e-9);
    }
    expect(frames[frames.length - 1]?.p.glow).toBe(0);
    // a halo of 5 points round a 32 point pill stays inside the 44 point target's height
    expect(g.height + 2 * GLOW_SPREAD).toBeLessThanOrEqual(44);
  });

  it('turns round where it is when tapped mid-pour: nothing jumps', () => {
    for (const at of [60, 150, 260, 340]) {
      const mid = pourValuesAt(offRest, fill, at);
      // the component stops the run and the clocks go back to rest; the rest carries on from here
      const from = { ...mid, land: 1, bloom: 1 };
      const back = pourPlan(false, false, true);
      const first = pourValuesAt(from, back, 0);
      expect(first.pos).toBeCloseTo(mid.pos, 9);
      expect(first.level).toBeCloseTo(mid.level, 9);
      expect(pourPicture(g, first).milkX).toBeCloseTo(pourPicture(g, mid).milkX, 9);
      const end = pourValuesAt(from, back, back.total);
      expect(end.pos).toBe(0);
      expect(end.level).toBe(0);
    }
  });
});

describe('the frames', () => {
  const f = pourFrames(g);
  const EVERY: [string, Frame][] = Object.entries(f);

  it('are all clamped: nothing carries the knob, the milk or the glow past its ends', () => {
    for (const [n, fr] of EVERY) expect(fr.extrapolate, n).toBe('clamp');
  });

  it('reset each clock only where its layer is at rest and unseen', () => {
    // the component sets `land` and `bloom` to 0 as a fill starts: both draw at 0 what they draw
    // at rest, so the reset cannot be seen
    expect(sampleFrame(f.squashX, 0)).toBe(sampleFrame(f.squashX, 1));
    expect(sampleFrame(f.squashY, 0)).toBe(sampleFrame(f.squashY, 1));
    expect(sampleFrame(f.glow, 0)).toBe(0);
    expect(sampleFrame(f.glow, 1)).toBe(0);
  });

  it('read the wave by its fraction, never a negative one', () => {
    for (const w of [-2.25, -1, -0.5, 0, 0.5, 1, 3.75]) {
      expect(waveFraction(w)).toBeGreaterThanOrEqual(0);
      expect(waveFraction(w)).toBeLessThan(1);
    }
    expect(waveFraction(-0.25)).toBeCloseTo(0.75, 9);
  });
});

describe('the component, where a device would be needed to see it', () => {
  const src = withoutComments(read('PourSwitch.tsx'));
  const flat = src.replace(/\s+/g, ' ');

  it('is one switch: its role, its checked state, a required name, one press, a 44 pt target', () => {
    expect(flat).toContain('accessibilityRole="switch"');
    expect(flat).toContain('accessibilityState={{ checked: value, disabled }}');
    expect(flat).toMatch(/accessibilityLabel: string;/);
    expect(flat).toContain('onValueChange(!value);');
    expect(flat).toContain('{ minHeight: t.hit.min, minWidth: t.hit.min }');
  });

  it('draws the picture untouchable and hidden from assistive technology', () => {
    expect(flat).toMatch(
      /<View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
  });

  it('is felt as `Switch` is: a tap, once, in the press handler, after the flip', () => {
    expect(flat).toContain("onPress={() => { onValueChange(!value); haptic('tap'); }}");
    expect(flat.split('haptic(').length - 1).toBe(1);
  });

  it('keeps still under reduce motion and in the amber Night, and draws no glow where it may not', () => {
    expect(flat).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(flat).toContain('const plan = pourPlan(value, still, glows);');
    expect(flat).toContain(
      "const c = pourColors(t.color, milk, t.theme, t.skinTokens.surface.shadow !== 'none');",
    );
    expect(flat).toContain('{c.glow === null ? null : (');
  });

  it('runs on the native driver, opacity and transforms only', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    expect(flat).not.toMatch(/(width|height|left|top|backgroundColor): (num|Animated)\(/);
    // the ripple moves by the wave's fraction, a node the native driver carries
    expect(flat).toContain('num(Animated.modulo<number>(wave, 1), f.milkX)');
  });

  it('never leaves a decoration half way: a stopped run puts the landing and the glow at rest', () => {
    expect(flat).toContain('return () => { run.stop(); land.setValue(1); bloom.setValue(1); };');
  });

  it('draws the milk once and moves it, never redrawing a path per frame', () => {
    expect(flat).toContain('const MILK_PATH = pourWavePath(G);');
    expect(flat).toContain('<Path d={MILK_PATH} fill={c.milk} />');
  });

  it('takes its colors from the palette through `pourColors`, never a literal', () => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/rgba?\(/);
  });
});

describe('Row: a switch row may draw its switch as the pour', () => {
  const row = read('Row.tsx');
  const code = withoutComments(row).replace(/\s+/g, ' ');

  it('draws it in the same hidden, untouchable wrapper as the platform switch', () => {
    expect(row).toMatch(/<View\s+pointerEvents="none"[\s\S]{0,700}?<PourSwitch/);
    expect(row).toMatch(/accessibilityElementsHidden[\s\S]{0,700}?<PourSwitch/);
    expect(code).toContain(
      '<PourSwitch value={switchValue} onValueChange={onSwitch} milk={switchPour} accessibilityLabel={title} disabled={disabled} />',
    );
  });

  it('is an opt-in: a row that asks for neither drawing keeps the platform switch', () => {
    expect(code).toContain(') : switchPour !== undefined ? ( <PourSwitch');
    expect(code).toContain(
      ') : ( <Switch value={switchValue} onValueChange={onSwitch} accessibilityLabel={title} disabled={disabled} /> )}',
    );
  });
});
