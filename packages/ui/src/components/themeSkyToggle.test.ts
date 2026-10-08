/**
 * THE THEME TOGGLE (the owner, 2026-09-25: the Appearance sheet's Theme as "a 3 way toggle: left
 * day, middle night, right dark", in setup's sun-and-moon picture, "with enough spacing to fit the
 * text"). Two halves, the way this package tests anything that moves: the geometry, the planner
 * and the picture at every point of its animated values are PURE (`themeSkyToggle.ts`) and are
 * sampled here exactly as `Animated.Value#interpolate` would sample them; what can only be seen on
 * a device — that it is one radio group to a screen reader, runs on the native driver and honors
 * reduce motion — is held by tripwires over `ThemeSkyToggle.tsx`, because this suite has no
 * renderer (`interaction.test.ts` says why that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DAY_NIGHT_EASE, DAY_NIGHT_MS, type Frame } from './dayNightSwitch';
import {
  crescentPath,
  DIM_STOPS,
  easeAt,
  knobAt,
  MARKER,
  MARKER_HALO,
  MARKER_LOCK,
  MARKER_LOCK_GAP,
  MARKER_PAD,
  markerWidth,
  MOON_GLYPH_CRATERS,
  MOON_GLYPH_R,
  moveMs,
  planSkyMove,
  ROLL_PER_STRIDE,
  SKY_EASE,
  SKY_STOPS,
  skyHold,
  skyStops,
  skyWeights,
  spanWidth,
  stopIndex,
  SUN_GLYPH_R,
  SUN_RAY_STROKE,
  SUN_RAYS,
  THEME_SKY_MS,
  THEME_SKY_SIZE,
  themeSkyFrames,
  themeSkyGeometry,
  WORD_GAP,
  WORD_TYPE,
  wordScaleCap,
  wordWidth,
  type SkyMotion,
  type SkyPlan,
  type SkyStop,
  type ThemeSkyFrames,
  type ThemeSkyGeometry,
} from './themeSkyToggle';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('ThemeSkyToggle.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('themeSkyToggle.ts'));

/**
 * The words the Appearance sheet passes today. They are a FIXTURE here: the component never types
 * a word, and `apps/mobile/src/appearance/themeToggle.test.ts` runs the same proof over the labels
 * the app really hands it.
 */
const WORDS: Record<SkyStop, string> = { light: 'Light', night: 'Night', dark: 'Dark' };

/** Every width the Appearance sheet's body can be, half a point apart, and two a larger phone gives. */
const WIDTHS = [
  ...Array.from(
    { length: (THEME_SKY_SIZE.maxWidth - THEME_SKY_SIZE.minWidth) * 2 + 1 },
    (_, i) => THEME_SKY_SIZE.minWidth + i / 2,
  ),
  394,
  430,
];
const LOCKS = [{}, { night: true }] as const;

/** `Animated.Value#interpolate` for one number: piecewise-linear, clamped or extended past the ends. */
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

/** The highest point a cubic Bézier easing reaches — how far past its target it carries a value. */
function peakOf([, y1, , y2]: readonly [number, number, number, number]): number {
  let peak = 0;
  for (let i = 0; i <= 2000; i += 1) {
    const s = i / 2000;
    peak = Math.max(peak, 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s * s * y2 + s ** 3);
  }
  return peak;
}

/** Whether a point is inside the pill, a `margin` in from its edge (a stadium: two caps and a band). */
function insidePill(g: ThemeSkyGeometry, x: number, y: number, margin: number): boolean {
  const r = g.height / 2;
  const cx = Math.min(Math.max(x, r), g.width - r);
  return Math.hypot(x - cx, y - r) <= r - margin + 1e-9;
}

/**
 * A marker's halo is inside the pill, clear of the rim: a capsule `MARKER_HALO` tall centered on the
 * pill's middle line — a disc when it is as wide as it is tall — walked round its whole outline.
 */
function haloInside(g: ThemeSkyGeometry, left: number, width: number): boolean {
  const r = MARKER_HALO / 2;
  const cy = g.height / 2;
  const caps = [left + r, left + width - r];
  for (let i = 0; i < 72; i += 1) {
    const a = (i * Math.PI) / 36;
    for (const cx of caps)
      if (!insidePill(g, cx + r * Math.cos(a), cy + r * Math.sin(a), g.rim)) return false;
  }
  return true;
}

/** A box's four corners are all inside the pill, clear of the rim. */
function boxInside(g: ThemeSkyGeometry, x: number, y: number, w: number, h: number): boolean {
  return [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ].every(([px, py]) => insidePill(g, px ?? 0, py ?? 0, g.rim));
}

/** The word's box at `scale`: centered in its span, as the component centers it. */
function wordBox(g: ThemeSkyGeometry, stop: SkyStop, label: string, scale: number) {
  const span = g.word[stop];
  const w = wordWidth(label, scale);
  const left = span.left + (spanWidth(span) - w) / 2;
  return { left, right: left + w };
}

describe('the size of it', () => {
  it('is a pill a target tall, split into three zones a target wide at every width', () => {
    for (const width of WIDTHS) {
      const g = themeSkyGeometry(width);
      expect(g.height).toBeGreaterThanOrEqual(44);
      expect(g.zone, `at ${width}`).toBeGreaterThanOrEqual(44);
      expect(g.zone * 3).toBeCloseTo(g.width, 9);
      expect(g.knob).toBe(g.height - 2 * g.inset);
    }
    // and the component makes the zones exactly that: three equal thirds of the pill
    expect(flat).toContain('style={styles.zone}');
    expect(component).toMatch(/zone: \{ flex: 1 \}/);
  });

  it('takes the room it is given, and stops growing at a phone’s width', () => {
    expect(themeSkyGeometry(300).width).toBe(300);
    expect(themeSkyGeometry(THEME_SKY_SIZE.maxWidth).width).toBe(THEME_SKY_SIZE.maxWidth);
    expect(themeSkyGeometry(430).width).toBe(THEME_SKY_SIZE.maxWidth);
    // a first frame that measured nothing still draws three whole targets, not a crushed pill
    expect(themeSkyGeometry(0).zone).toBeGreaterThanOrEqual(44);
  });

  it('rests the knob at three stops, the middle one dead center', () => {
    for (const width of WIDTHS) {
      const g = themeSkyGeometry(width);
      expect(g.rest.light).toBe(g.inset);
      expect(g.rest.dark + g.knob).toBeCloseTo(g.width - g.inset, 9);
      expect(g.center.night).toBeCloseTo(g.width / 2, 9);
      expect(g.rest.night - g.rest.light).toBeCloseTo(g.stride, 9);
      expect(g.rest.dark - g.rest.night).toBeCloseTo(g.stride, 9);
    }
  });

  it('turns the knob once from one end to the other, at every width', () => {
    // the owner, 2026-09-26: one turn, not the two and a half a wheel of its size would roll
    for (const width of WIDTHS) {
      const g = themeSkyGeometry(width);
      const f = themeSkyFrames(g);
      expect(g.roll).toBe(ROLL_PER_STRIDE);
      for (const stop of SKY_STOPS)
        expect(sample(f.turn[stop], 2) - sample(f.turn[stop], 0)).toBeCloseTo(360, 6);
    }
  });

  it('brings every face to its own stop upright, whatever the turn', () => {
    const f = themeSkyFrames(themeSkyGeometry(320));
    SKY_STOPS.forEach((stop, i) => expect(sample(f.turn[stop], i) % 360).toBeCloseTo(0, 6));
  });
});

describe('the chosen word fits beside the knob, at every width the sheet can have', () => {
  it('grows with the phone’s text to at least 1.3×, and never past the chrome cap', () => {
    for (const locked of LOCKS)
      for (const width of WIDTHS) {
        const cap = wordScaleCap(themeSkyGeometry(width, locked), WORDS);
        expect(cap, `at ${width}`).toBeGreaterThanOrEqual(WORD_TYPE.floor);
        expect(cap).toBeLessThanOrEqual(WORD_TYPE.ceiling);
      }
    // the ceiling IS the chrome cap every other capped role stops at (Text.tsx)
    expect(read('Text.tsx')).toContain(`export const CHROME_FONT_CAP = ${WORD_TYPE.ceiling};`);
    expect(WORD_TYPE.floor).toBeGreaterThanOrEqual(1.3);
  });

  it('never lets the word touch the knob, a glyph or the rim, at its largest', () => {
    for (const locked of LOCKS)
      for (const width of WIDTHS) {
        const g = themeSkyGeometry(width, locked);
        const cap = wordScaleCap(g, WORDS);
        for (const stop of SKY_STOPS) {
          const box = wordBox(g, stop, WORDS[stop], cap);
          const at = `${stop} at ${width}${'night' in locked ? ', locked' : ''}`;
          // the knob, where it rests for this word
          const knob = { left: g.rest[stop], right: g.rest[stop] + g.knob };
          const clear = Math.max(knob.left - box.right, box.left - knob.right);
          expect(clear, at).toBeGreaterThanOrEqual(WORD_GAP);
          // the two glyphs this picture shows at the other stops
          for (const other of SKY_STOPS.filter(s => s !== stop)) {
            const glyph = {
              left: g.center[other] - g.marker[other] / 2,
              right: g.center[other] + g.marker[other] / 2,
            };
            const gap = Math.max(glyph.left - box.right, box.left - glyph.right);
            expect(gap, `${at}, beside the ${other} glyph`).toBeGreaterThanOrEqual(WORD_GAP);
          }
          // and the pill's own edge, the line box at the size it is drawn
          const line = WORD_TYPE.size * cap * 1.3;
          const top = (g.height - line) / 2;
          expect(line, at).toBeLessThanOrEqual(g.height - 2 * g.rim);
          expect(boxInside(g, box.left, top, box.right - box.left, line), at).toBe(true);
        }
      }
  });

  it('bounds the three words by what the shipped face measures, with room to spare', () => {
    // Hanken Grotesk Bold, read out of the app's own TTF: em widths at 1000 units
    const measured: Record<SkyStop, number> = { light: 2.202, night: 2.387, dark: 2.206 };
    for (const stop of SKY_STOPS)
      expect(wordWidth(WORDS[stop]), stop).toBeGreaterThan(measured[stop] * WORD_TYPE.size);
  });

  it('sits Light right of the sun, Night right of the middle knob, and Dark left of the moon', () => {
    const g = themeSkyGeometry(320, { night: true });
    expect(g.word.light.left).toBeGreaterThan(g.rest.light + g.knob);
    expect(g.word.light.right).toBeLessThan(g.center.night);
    expect(g.word.night.left).toBeGreaterThan(g.rest.night + g.knob);
    expect(g.word.night.right).toBeLessThan(g.center.dark);
    expect(g.word.dark.left).toBeGreaterThan(g.center.night);
    expect(g.word.dark.right).toBeLessThan(g.rest.dark);
  });

  it('keeps the knob clear of the Night word while it settles past the middle', () => {
    // arriving at the middle is the one move that overshoots; the word is on the far side of it
    const peak = peakOf(SKY_EASE.settle);
    for (const locked of LOCKS)
      for (const width of WIDTHS) {
        const g = themeSkyGeometry(width, locked);
        const box = wordBox(g, 'night', WORDS.night, wordScaleCap(g, WORDS));
        const carried = g.rest.night + g.knob + (peak - 1) * g.stride;
        expect(box.left - carried, `at ${width}`).toBeGreaterThan(0);
        // and, the other way, clear of the sun's glyph on the left
        const back = g.rest.night - (peak - 1) * g.stride;
        expect(back).toBeGreaterThan(g.center.light + g.marker.light / 2);
      }
  });
});

describe('the other stops show where they are', () => {
  /**
   * AND SAY THAT THEY ARE PLACES TO GO (the owner, 2026-09-26: *"the moon icons (for night and
   * dark) need tto be highlighted more, in case if user wont understand how to change it"*). Each
   * glyph is 18 pt, a third bigger than the 14 it was, on a halo 26 across; a locked stop's lock
   * sits inside the same halo, which grows into a capsule round the two.
   */
  it('draws each glyph on its halo inside the pill, a locked one with its lock in the same halo', () => {
    expect(MARKER).toBe(18);
    expect(MARKER_HALO).toBe(26);
    // the halo is the glyph with MARKER_PAD of air all round, and the lock fits inside it
    expect(MARKER + 2 * MARKER_PAD).toBe(MARKER_HALO);
    expect(markerWidth(false)).toBe(MARKER_HALO);
    expect(markerWidth(true)).toBe(
      MARKER_PAD + MARKER + MARKER_LOCK_GAP + MARKER_LOCK + MARKER_PAD,
    );
    // and never as tall as the knob, which stays the one solid thing on the sky
    expect(MARKER_HALO).toBeLessThan(themeSkyGeometry(320).knob);
    for (const locked of LOCKS)
      for (const width of [THEME_SKY_SIZE.minWidth, 320, THEME_SKY_SIZE.maxWidth]) {
        const g = themeSkyGeometry(width, locked);
        for (const stop of SKY_STOPS) {
          const w = g.marker[stop];
          expect(haloInside(g, g.markerLeft[stop], w), stop).toBe(true);
          // centered on its stop: on three stops none is near enough an end to be moved in
          expect(g.markerLeft[stop] + w / 2, stop).toBeCloseTo(g.center[stop], 9);
        }
        expect(g.marker.night).toBe(markerWidth('night' in locked));
        expect(g.marker.light).toBe(MARKER_HALO);
        expect(g.marker.dark).toBe(MARKER_HALO);
      }
  });

  it('keeps a glyph out from under the knob, wherever the knob rests', () => {
    const g = themeSkyGeometry(THEME_SKY_SIZE.minWidth, { night: true });
    for (const at of SKY_STOPS)
      for (const other of SKY_STOPS.filter(s => s !== at)) {
        const gap = Math.abs(g.center[other] - g.center[at]) - g.knob / 2 - g.marker[other] / 2;
        expect(gap, `${other} glyph with the knob at ${at}`).toBeGreaterThan(WORD_GAP);
      }
  });

  it('draws a sun with rays, a crescent and a full moon — three shapes, not three colors', () => {
    // every ray, with its round cap, inside the glyph's box
    for (const [x1, y1, x2, y2] of SUN_RAYS)
      for (const [x, y] of [
        [x1, y1],
        [x2, y2],
      ] as const) {
        expect(Math.hypot(x - MARKER / 2, y - MARKER / 2)).toBeLessThanOrEqual(
          MARKER / 2 - SUN_RAY_STROKE / 2,
        );
        expect(Math.hypot(x - MARKER / 2, y - MARKER / 2)).toBeGreaterThan(SUN_GLYPH_R);
      }
    expect(SUN_RAYS).toHaveLength(8);
    expect(MOON_GLYPH_R).toBeLessThan(MARKER / 2);
    for (const c of MOON_GLYPH_CRATERS)
      expect(Math.hypot(c.cx - MARKER / 2, c.cy - MARKER / 2) + c.r).toBeLessThan(MOON_GLYPH_R);
  });
});

describe('the crescent', () => {
  /** The path's numbers: M x y A r r 0 1 1 x y A rc rc 0 0 0 x y Z. */
  const parse = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  it('is the disc with a disc taken out, its horns on both circles', () => {
    for (const size of [12, 38]) {
      const [x1 = 0, y1 = 0, r = 0, , , , , x2 = 0, y2 = 0, rc = 0] = parse(crescentPath(size));
      expect(r).toBeCloseTo(size / 2, 2);
      const c = size / 2;
      // both horns on the outer circle
      expect(Math.hypot(x1 - c, y1 - c)).toBeCloseTo(r, 2);
      expect(Math.hypot(x2 - c, y2 - c)).toBeCloseTo(r, 2);
      // and the chord between them no longer than the cut's diameter, so the arc is drawn at the
      // radius written and not silently enlarged (SVG scales a radius too small for its chord)
      expect(Math.hypot(x1 - x2, y1 - y2)).toBeLessThanOrEqual(2 * rc + 1e-3);
      // the horns point up and to the right, the way the app's own moon glyph does
      expect(x1).toBeGreaterThan(c);
      expect(y2).toBeLessThan(c);
    }
  });

  it('is plainly a crescent: lit well short of half the disc, and more than a sliver', () => {
    // along the axis away from the cut, the lit limb runs from the far edge to the cut's edge
    const cut = 0.84;
    const offset = 0.62;
    const thickness = 1 + offset - cut; // in outer radii
    expect(thickness / 2).toBeGreaterThan(0.3);
    expect(thickness / 2).toBeLessThan(0.5);
    expect(crescentPath(38)).toBe(crescentPath(38, cut, offset));
  });
});

describe('the move', () => {
  it('takes setup’s 560 ms for a stop, and a little longer — never double — for two', () => {
    expect(THEME_SKY_MS).toBe(DAY_NIGHT_MS);
    expect(moveMs(1)).toBe(DAY_NIGHT_MS);
    expect(moveMs(2)).toBeGreaterThan(moveMs(1));
    expect(moveMs(2)).toBeLessThan(1.5 * moveMs(1));
    for (let d = 0.1; d <= 2; d += 0.1) expect(moveMs(d)).toBeGreaterThan(moveMs(d - 0.1));
  });

  it('moves on setup’s curve, with its overshoot only where there is room for it', () => {
    // one family: the same control points in time, and only the overshoot differs
    expect(SKY_EASE.settle).toBe(DAY_NIGHT_EASE);
    expect(SKY_EASE.land[0]).toBe(DAY_NIGHT_EASE[0]);
    expect(SKY_EASE.land[2]).toBe(DAY_NIGHT_EASE[2]);
    expect(peakOf(SKY_EASE.settle)).toBeGreaterThan(1.01);
    // landing at an end never carries past it: the knob cannot reach the rim
    expect(peakOf(SKY_EASE.land)).toBeLessThanOrEqual(1);
    for (const ease of Object.values(SKY_EASE)) {
      expect(ease[0]).toBeGreaterThanOrEqual(0);
      expect(ease[2]).toBeLessThanOrEqual(1);
    }
    // and the knob's travel is clamped at the two ends besides, so no curve could take it there
    for (const width of WIDTHS) {
      const g = themeSkyGeometry(width);
      const f = themeSkyFrames(g);
      expect(f.knobX.extrapolate).toBe('clamp');
      expect(g.inset + sample(f.knobX, -1)).toBe(g.inset);
      expect(g.inset + sample(f.knobX, 3) + g.knob).toBeCloseTo(g.width - g.inset, 9);
      expect(g.inset - g.rim).toBeGreaterThan(0);
    }
  });

  it('settles at the middle and lands at the ends', () => {
    expect(planSkyMove(null, 'light', 'night', 0, false).ease).toBe('settle');
    expect(planSkyMove(null, 'dark', 'night', 0, false).ease).toBe('settle');
    expect(planSkyMove(null, 'night', 'light', 0, false).ease).toBe('land');
    expect(planSkyMove(null, 'night', 'dark', 0, false).ease).toBe('land');
    expect(planSkyMove(null, 'light', 'dark', 0, false).ease).toBe('land');
    expect(planSkyMove(null, 'dark', 'light', 0, false).ease).toBe('land');
  });

  it('plans every move from rest as the two pictures it is between, and nothing else', () => {
    const plan = (from: SkyStop, to: SkyStop) => planSkyMove(null, from, to, 0, false);
    expect(plan('light', 'dark')).toMatchObject({ pos: 2, night: 0, dark: 1, duration: 728 });
    expect(plan('dark', 'light')).toMatchObject({ pos: 0, night: 0, dark: 0, duration: 728 });
    expect(plan('light', 'night')).toMatchObject({ pos: 1, night: 1, duration: 560 });
    expect(plan('dark', 'night')).toMatchObject({ pos: 1, night: 1, duration: 560 });
    expect(plan('night', 'light')).toMatchObject({ pos: 0, night: 0, dark: 0, snapDark: 0 });
    expect(plan('night', 'dark')).toMatchObject({ pos: 2, night: 0, dark: 1, snapDark: 1 });
    // Night arrives OVER whatever is showing: the Dark layer is held, not sent anywhere
    expect('dark' in plan('light', 'night')).toBe(false);
    expect('dark' in plan('dark', 'night')).toBe(false);
    // and only a Night at rest snaps anything
    for (const [from, to] of [
      ['light', 'dark'],
      ['dark', 'light'],
      ['light', 'night'],
      ['dark', 'night'],
    ] as const)
      expect('snapDark' in plan(from, to), `${from} → ${to}`).toBe(false);
  });

  it('estimates the knob from the clock and the curve, only to size a re-targeted move', () => {
    const m: SkyMotion = { from: 0, to: 'dark', startedAt: 1000, duration: 728, ease: 'land' };
    expect(knobAt(m, 1000)).toBe(0);
    expect(knobAt(m, 1728)).toBeCloseTo(2, 9);
    expect(knobAt(m, 1364)).toBeCloseTo(2 * easeAt(SKY_EASE.land, 0.5), 9);
    // half way across and turned round: half the way back, in less than a whole stop's time
    const back = planSkyMove(m, 'dark', 'light', 1364, false);
    expect(back.from).toBeCloseTo(knobAt(m, 1364), 9);
    expect(back.duration).toBeLessThan(moveMs(2));
    expect(back.duration).toBeCloseTo(moveMs(back.from), 0);
  });
});

/**
 * THE PICTURE, SIMULATED. The component starts one timing per value on every move — the knob on
 * the plan's curve, the two picture layers on `land`, each from wherever it is to where the plan
 * sends it — and draws the layers through the frames. This does the same, on a clock, and reads
 * what reaches the screen through `skyWeights`: the share of each picture in every pixel of sky.
 */
interface Values {
  pos: number;
  night: number;
  dark: number;
}
interface Run {
  at: number;
  plan: SkyPlan;
  start: Values;
}

const g320 = themeSkyGeometry(320);
const f320 = themeSkyFrames(g320);
const shown = (v: Values) =>
  skyWeights(sample(f320.nightSky, v.night), sample(f320.darkSky, v.dark));

/** Each face's opacity on the knob, for the two layer values, as the component multiplies them. */
function knobFaces(f: ThemeSkyFrames, night: number, dark: number): Record<SkyStop, number> {
  return {
    light: sample(f.covered, dark) * sample(f.covered, night),
    dark: sample(f.moonFace, dark) * sample(f.covered, night),
    night: sample(f.crescentFace, night),
  };
}

function valuesAt(run: Run, now: number): Values {
  const x = run.plan.duration <= 0 ? 1 : (now - run.at) / run.plan.duration;
  const land = easeAt(SKY_EASE.land, x);
  const lerp = (a: number, b: number | undefined, e: number) =>
    b === undefined ? a : a + (b - a) * e;
  return {
    pos: lerp(run.start.pos, run.plan.pos, easeAt(SKY_EASE[run.plan.ease], x)),
    night: lerp(run.start.night, run.plan.night, land),
    dark: lerp(run.start.dark, run.plan.dark, land),
  };
}

/** A parent's taps, at the times given; the frames between them, one a millisecond. */
function simulate(
  start: SkyStop,
  taps: readonly (readonly [number, SkyStop])[],
  stops: readonly SkyStop[] = SKY_STOPS,
) {
  let values: Values = {
    pos: stopIndex(start, stops),
    night: start === 'night' ? 1 : 0,
    dark: start === 'dark' ? 1 : 0,
  };
  let run: Run | null = null;
  let motion: SkyMotion | null = null;
  let at: SkyStop = start;
  const frames: { t: number; v: Values; w: Record<SkyStop, number> }[] = [];
  const snaps: { before: Record<SkyStop, number>; after: Record<SkyStop, number> }[] = [];
  const end = (taps[taps.length - 1]?.[0] ?? 0) + 1000;
  let next = 0;
  for (let t = 0; t <= end; t += 1) {
    if (run) values = valuesAt(run, t);
    while (next < taps.length && (taps[next]?.[0] ?? Infinity) <= t) {
      const [, to] = taps[next] ?? [0, 'light'];
      next += 1;
      if (to === at && (!motion || t >= motion.startedAt + motion.duration)) continue;
      const plan = planSkyMove(motion, at, to, t, false, stops);
      // the estimate the planner sized the move by is where the knob really is
      expect(plan.from).toBeCloseTo(values.pos, 6);
      if (plan.snapDark !== undefined) {
        const before = shown(values);
        values = { ...values, dark: plan.snapDark };
        snaps.push({ before, after: shown(values) });
      }
      run = { at: t, plan, start: values };
      motion = { from: plan.from, to, startedAt: t, duration: plan.duration, ease: plan.ease };
      at = to;
    }
    frames.push({ t, v: values, w: shown(values) });
  }
  return { frames, snaps, last: frames[frames.length - 1] };
}

describe('the picture on the way', () => {
  it('never shows the amber Night on a jump between Light and Dark — not for one frame', () => {
    for (const [from, to] of [
      ['light', 'dark'],
      ['dark', 'light'],
    ] as const) {
      const { frames, last } = simulate(from, [[10, to]]);
      for (const fr of frames) {
        expect(fr.w.night, `${from} → ${to} at ${fr.t} ms`).toBe(0);
        // nor the crescent on the knob
        expect(sample(themeSkyFrames(g320).crescentFace, fr.v.night)).toBe(0);
      }
      // while the knob rolls THROUGH the middle on its way
      expect(frames.some(fr => Math.abs(fr.v.pos - 1) < 0.01)).toBe(true);
      expect(last?.w[to]).toBeCloseTo(1, 9);
    }
  });

  it('cross-fades exactly two pictures on every move from rest: the third is never seen', () => {
    for (const from of SKY_STOPS)
      for (const to of SKY_STOPS.filter(s => s !== from)) {
        const third = SKY_STOPS.find(s => s !== from && s !== to) ?? 'light';
        const { frames, last } = simulate(from, [[10, to]]);
        for (const fr of frames) expect(fr.w[third], `${from} → ${to} at ${fr.t}`).toBe(0);
        expect(last?.w[to], `${from} → ${to}`).toBeCloseTo(1, 9);
        expect(last?.v.pos).toBeCloseTo(stopIndex(to), 9);
      }
  });

  it('takes its one snap where nobody can see it: under a Night at rest', () => {
    for (const via of ['light', 'dark'] as const)
      for (const to of ['light', 'dark'] as const) {
        const { snaps } = simulate(via, [
          [10, 'night'],
          [1000, to],
        ]);
        expect(snaps).toHaveLength(1);
        for (const s of snaps) expect(s.after).toEqual(s.before);
      }
  });

  // a long walk of simulated taps: ~3 s of pure arithmetic, so it gets room past vitest's 5 s
  // default on a machine busy with other suites — the walk itself is deterministic
  it('turns round mid-roll without a jump, whatever the taps, and ends on the last one', () => {
    // a fixed pseudo-random walk of taps, some mid-roll and some at rest
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let walk = 0; walk < 60; walk += 1) {
      const taps: [number, SkyStop][] = [];
      let t = 0;
      for (let i = 0; i < 6; i += 1) {
        t += Math.round(20 + rnd() * 900);
        taps.push([t, SKY_STOPS[Math.floor(rnd() * 3)] ?? 'light']);
      }
      const start = SKY_STOPS[walk % 3] ?? 'light';
      const { frames, snaps, last } = simulate(start, taps);
      // measured over every frame, asserted once: the largest step from one frame to the next,
      // how far the sky is ever from whole, and the least of the knob's strongest face
      let step = 0;
      let skyGap = 0;
      let knobLeast = 1;
      for (let i = 1; i < frames.length; i += 1) {
        const [a, b] = [frames[i - 1], frames[i]];
        if (!a || !b) continue;
        for (const stop of SKY_STOPS) step = Math.max(step, Math.abs(b.w[stop] - a.w[stop]));
        step = Math.max(step, Math.abs(b.v.pos - a.v.pos));
        // the sky is always whole: the day at the bottom is never faded
        skyGap = Math.max(skyGap, Math.abs(b.w.light + b.w.dark + b.w.night - 1));
        // and so is the knob: whatever mix is on it, one of its faces is fully drawn
        const faces = knobFaces(f320, b.v.night, b.v.dark);
        knobLeast = Math.min(knobLeast, Math.max(faces.light, faces.dark, faces.night));
      }
      expect(step, `walk ${walk}`).toBeLessThan(0.02);
      expect(skyGap, `walk ${walk}`).toBeLessThan(1e-9);
      expect(knobLeast, `walk ${walk}`).toBe(1);
      for (const s of snaps) expect(s.after).toEqual(s.before);
      const final = taps[taps.length - 1]?.[1] ?? 'light';
      expect(last?.w[final], `walk ${walk}`).toBeCloseTo(1, 9);
      expect(last?.v.pos).toBeCloseTo(stopIndex(final), 6);
    }
  }, 20_000);
});

describe('reduce motion', () => {
  it('sets where the move ends and animates nothing', () => {
    for (const from of SKY_STOPS)
      for (const to of SKY_STOPS.filter(s => s !== from)) {
        const plan = planSkyMove(null, from, to, 0, true);
        expect(plan.animate).toBe(false);
        expect(plan.duration).toBe(0);
        expect(plan.pos).toBe(stopIndex(to));
        const values = {
          night: plan.night,
          dark: plan.dark ?? plan.snapDark ?? (from === 'dark' ? 1 : 0),
        };
        const w = skyWeights(
          sample(f320.nightSky, values.night),
          sample(f320.darkSky, values.dark),
        );
        expect(w[to], `${from} → ${to}`).toBe(1);
      }
  });

  it('is read from the theme, and sets the values — even over a move already in flight', () => {
    expect(flat).toContain('t.reduceMotion');
    expect(flat).toMatch(/if \(!plan\.animate\) \{[^}]*pos\.setValue\(plan\.pos\)/);
    expect(flat).toContain('[dark, night, pos, value, t.reduceMotion, g.stops]');
  });
});

describe('which set it is drawn in', () => {
  it('holds the plain pictures through a roll to Night that repaints the app amber', () => {
    expect(skyHold('light', 'night', 'night', false)).toBe('light');
    expect(skyHold('dark', 'night', 'night', false)).toBe('dark');
  });

  it('follows the painted theme in every other case', () => {
    // already amber (an evening window painting night) — nothing to hold
    expect(skyHold('night', 'night', 'night', false)).toBeNull();
    // leaving Night: the app repaints while the toggle rests on Night, which hides the change
    expect(skyHold('night', 'light', 'light', false)).toBeNull();
    expect(skyHold('night', 'dark', 'dark', false)).toBeNull();
    // a move that repaints nothing amber has nothing to hold
    expect(skyHold('light', 'dark', 'dark', false)).toBeNull();
    // a Night the plan took back is painted dark, and so is drawn in the plain set already
    expect(skyHold('light', 'night', 'dark', false)).toBeNull();
    // and under reduce motion there is no roll to hold it through
    expect(skyHold('light', 'night', 'night', true)).toBeNull();
  });

  it('decides it as the value changes, and lets go when the roll to Night has arrived', () => {
    expect(flat).toContain('skyHold(latch.shown, value, t.theme, t.reduceMotion)');
    expect(flat).toContain('const drawn = next.held ?? t.theme;');
    expect(flat).toContain('const sky = themeSkyFor(drawn);');
    expect(flat).toMatch(/\(\{ finished \}\) => \{ if \(finished\) setLatch\(/);
  });
});

describe('the frames', () => {
  const f = themeSkyFrames(themeSkyGeometry(320));
  const EVERY: readonly [string, Frame][] = [
    ...Object.entries(f).filter(
      (e): e is [string, Frame] => !Array.isArray(e[1]) && 'inputRange' in e[1],
    ),
    ...SKY_STOPS.map((s): [string, Frame] => [`turn ${s}`, f.turn[s]]),
    ...f.stars.flatMap((s, i): [string, Frame][] => [
      [`star ${i} opacity`, s.opacity],
      [`star ${i} scale`, s.scale],
    ]),
  ];

  it('are frames Animated can read: in order, one output per input, and clamped', () => {
    for (const [name, fr] of EVERY) {
      expect(fr.inputRange.length, name).toBe(fr.outputRange.length);
      expect(fr.inputRange.length, name).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < fr.inputRange.length; i += 1)
        expect(fr.inputRange[i] ?? 0, name).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
      // nothing follows a value past its range: the knob's ends are the rim's side of the pill
      expect(fr.extrapolate, name).toBe('clamp');
    }
  });

  it('turns each face into place upright at its own stop', () => {
    expect(sample(f.turn.light, 0)).toBe(0);
    expect(sample(f.turn.night, 1)).toBeCloseTo(0, 9);
    expect(sample(f.turn.dark, 2)).toBe(0);
  });

  it('draws only the face on show at rest — no face’s edge round another’s', () => {
    for (const stop of SKY_STOPS) {
      // Night at rest may have Dark under it at 0 or at 1, depending on where it came from
      const darks = stop === 'night' ? [0, 1] : [stop === 'dark' ? 1 : 0];
      for (const d of darks) {
        const faces = knobFaces(f, stop === 'night' ? 1 : 0, d);
        expect(faces, `${stop}, dark ${d}`).toEqual({
          light: stop === 'light' ? 1 : 0,
          dark: stop === 'dark' ? 1 : 0,
          night: stop === 'night' ? 1 : 0,
        });
      }
    }
    // and that is what the component multiplies: the sun by both, the moon by Night's
    expect(flat).toContain(
      'opacity: Animated.multiply(num(dark, f.covered), num(night, f.covered))',
    );
    expect(flat).toContain(
      'opacity: Animated.multiply(num(dark, f.moonFace), num(night, f.covered))',
    );
    expect(flat).toContain('opacity: num(night, f.crescentFace)');
  });

  it('dims the light round the knob to nothing at Night, and fainter round the moon', () => {
    expect(sample(f.haloOpacity, 0)).toBe(1);
    expect(sample(f.haloOpacity, 1)).toBe(0);
    expect(sample(f.haloOpacity, 2)).toBeGreaterThan(0);
    expect(sample(f.haloOpacity, 2)).toBeLessThan(1);
    // and the shadow is gone once Night is up: no indigo shade on an amber sky
    expect(sample(f.shadow, 1)).toBe(0);
    expect(sample(f.shadow, 0)).toBe(1);
  });

  it('parts the clouds as the day is covered, and brings the stars on one after another', () => {
    expect(sample(f.cloudOpacity, 0)).toBe(1);
    expect(sample(f.cloudOpacity, 1)).toBe(0);
    expect(f.wispX.inputRange[1] ?? 1).toBeLessThan(f.cloudX.inputRange[1] ?? 0);
    const starts = g320.stars.map(s => s.at);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    for (const s of f.stars) {
      expect(sample(s.opacity, 0)).toBe(0);
      expect(sample(s.opacity, 1)).toBe(1);
      expect(
        Math.max(...Array.from({ length: 101 }, (_, i) => sample(s.scale, i / 100))),
      ).toBeCloseTo(1.25, 9);
    }
  });
});

describe('where the scenery sits', () => {
  it('keeps the clouds in the day’s free half, clear of the glyphs, while they can be seen', () => {
    for (const locked of LOCKS)
      for (const width of WIDTHS) {
        const g = themeSkyGeometry(width, locked);
        const f = themeSkyFrames(g);
        for (const c of [g.cloud, g.wisp]) {
          // how far it has drifted by the time it has faded out
          const fadedAt = (c === g.cloud ? f.cloudOpacity : f.wispOpacity).inputRange[1] ?? 1;
          const drift = sample(c === g.cloud ? f.cloudX : f.wispX, fadedAt);
          expect(c.x, `at ${width}`).toBeGreaterThanOrEqual(g.scenery.light.left);
          expect(c.x + c.width + drift, `at ${width}`).toBeLessThanOrEqual(g.scenery.light.right);
          expect(boxInside(g, c.x, c.y, c.width + drift, c.height)).toBe(true);
        }
      }
  });

  it('keeps the stars in the dark’s free half, clear of the glyphs and the word', () => {
    for (const locked of LOCKS)
      for (const width of WIDTHS) {
        const g = themeSkyGeometry(width, locked);
        for (const s of g.stars) {
          const [left, right] = [s.x - s.size / 2, s.x + s.size / 2];
          expect(left, `at ${width}`).toBeGreaterThanOrEqual(g.scenery.dark.left - 1e-9);
          expect(right, `at ${width}`).toBeLessThanOrEqual(g.scenery.dark.right + 1e-9);
          // even where they start, six points to the left, before they slide in
          expect(boxInside(g, left - 6, s.y - s.size / 2, s.size, s.size)).toBe(true);
          expect(right).toBeLessThan(g.word.dark.left);
        }
      }
  });
});

describe('the component (tripwires over ThemeSkyToggle.tsx)', () => {
  it('is one radio group with a name, and three radios that each say what they are', () => {
    expect(flat).toContain('accessibilityRole="radiogroup"');
    expect(flat).toContain('accessibilityLabel={label}');
    expect(flat).toContain('accessibilityRole="radio"');
    // its word, and a status word after it when the caller hands one (the app's quiet "Plus" tag
    // on Night during the preview, 2026-09-28): the drawing is untouched either way
    expect(flat).toContain(
      "accessibilityLabel={ badges?.[stop] ? `${labels[stop] ?? ''}, ${badges[stop]}` : (labels[stop] ?? '') }",
    );
    expect(flat).toContain(
      'accessibilityState={{ checked: stop === value, selected: stop === value, disabled }}',
    );
    // a locked stop says what unlocks it, in the caller's words
    expect(flat).toContain('locked?.[stop] && lockedHint ? { accessibilityHint: lockedHint } : {}');
    // and while the whole control is disabled every stop says why instead (2026-09-29: the
    // Appearance sheet's Theme, held while automatic night mode decides the look), and takes no tap
    expect(flat).toContain(
      '{...(disabled && disabledHint ? { accessibilityHint: disabledHint } : locked?.[stop] && lockedHint',
    );
    expect(flat).toContain('disabled={disabled}');
    // one Pressable per stop it offers, and no other
    expect(component.split('<Pressable')).toHaveLength(2);
    expect(flat).toContain('{g.stops.map(stop => (');
  });

  it('names each stop for a flow: <testID>.light, .night and .dark', () => {
    expect(flat).toContain('testID: `${testID}.${stop}`');
  });

  it('reports every tap — a locked stop and the chosen one included — and moves only on value', () => {
    // the caller decides what a tap means: open the gate for a lock, turn off "Match phone" for
    // a stop that was checked without being chosen. The knob follows `value` and nothing else.
    // Felt first (the owner, 2026-09-25: "a click at each theme-switch stop"), then reported
    // unconditionally: the feel decides nothing about whether the tap is passed on.
    expect(flat).toMatch(/onPress=\{\(\) => \{ feelChoice\(\{[^}]*\}\); onChange\(stop\); \}\}/);
    expect(flat).not.toMatch(/onPress=\{\(\) => \{?\s*if/);
  });

  it('hides the picture from touch and from assistive technology', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
  });

  it('stacks the pictures day, dark, night — the order `skyWeights` reads them in', () => {
    const dayAt = component.indexOf("picture('light')");
    const darkAt = component.indexOf("picture('dark')");
    const nightAt = component.indexOf("picture('night')");
    expect(dayAt).toBeGreaterThan(0);
    expect(darkAt).toBeGreaterThan(dayAt);
    expect(nightAt).toBeGreaterThan(darkAt);
  });

  it('runs every frame on the native driver: opacity and transforms only', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    const fed = [...flat.matchAll(/(\w+): (?:num|deg)\(/g)].map(m => m[1]);
    expect(fed.length).toBeGreaterThan(0);
    for (const prop of fed)
      expect(['opacity', 'translateX', 'scaleX', 'scale', 'rotate'], prop).toContain(prop);
    expect(flat).toContain('Easing.bezier(...SKY_EASE');
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
  });

  it('writes no color and no word: the sky’s colors, the theme’s rim, the caller’s labels', () => {
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
      expect(src).not.toMatch(/['"`](Light|Night|Dark|Match phone|Plus)['"`]/);
    }
    expect(flat).toContain('borderColor: t.color.line2');
    expect(flat).toContain('maxFontSizeMultiplier={cap}');
    expect(flat).toContain('numberOfLines={1}');
    expect(flat).toContain('adjustsFontSizeToFit');
  });

  it('is exported with the design system’s other controls, and its arithmetic without them', () => {
    expect(read('core.ts')).toContain("export * from './ThemeSkyToggle';");
    // the pure half is not in the barrel, as setup's switch's is not: the barrel pulls React
    // Native in, so a node test reaches the numbers through `@nibblecue/ui/layout`
    expect(read('core.ts')).not.toContain("'./themeSkyToggle'");
    expect(read('../layout.ts')).toContain("from './components/themeSkyToggle';");
    expect(flat).toContain("export type { SkyStop } from './themeSkyToggle';");
    expect(read('../index.ts')).toContain("export * from './theme/sky';");
  });
});

/**
 * "DIM TO": THE SAME TOGGLE WITH TWO OF ITS STOPS (the owner, 2026-09-26: *"in theme selection if
 * automatic night mode is on, the dim to should be a toggle like previously but only bettwen dark
 * or night"*). Night on the left and Dark on the right — the Theme toggle's own two, in its order —
 * in two halves of one pill. Everything the three-stop toggle is held to above, held again here for
 * two: the size, the words, the halos, the move, the picture, the knob.
 */
describe('“Dim to”: the toggle with two of its stops', () => {
  const DIM_WORDS = { night: WORDS.night, dark: WORDS.dark };

  it('offers two or three of the stops in their order, and anything else gets all three', () => {
    expect(DIM_STOPS).toEqual(['night', 'dark']);
    expect(skyStops(DIM_STOPS)).toBe(DIM_STOPS);
    expect(skyStops()).toBe(SKY_STOPS);
    expect(skyStops(['dark', 'night'])).toBe(SKY_STOPS);
    expect(skyStops(['night'])).toBe(SKY_STOPS);
    expect(skyStops(['night', 'night'])).toBe(SKY_STOPS);
    expect(stopIndex('night', DIM_STOPS)).toBe(0);
    expect(stopIndex('dark', DIM_STOPS)).toBe(1);
    // the three-stop answers are the ones they always were
    expect(SKY_STOPS.map(s => stopIndex(s))).toEqual([0, 1, 2]);
  });

  it('is two halves of the pill, each a target, the knob resting at either end', () => {
    for (const locked of LOCKS)
      for (const width of WIDTHS) {
        const g = themeSkyGeometry(width, locked, DIM_STOPS);
        const at = `${width}${'night' in locked ? ', locked' : ''}`;
        expect(g.stops, at).toEqual(DIM_STOPS);
        expect(g.height, at).toBeGreaterThanOrEqual(44);
        expect(g.zone, at).toBeCloseTo(g.width / 2, 9);
        expect(g.zone, at).toBeGreaterThanOrEqual(44);
        expect(g.rest.night, at).toBe(g.inset);
        expect(g.rest.dark + g.knob + g.inset, at).toBeCloseTo(g.width, 9);
        expect(g.stride, at).toBeCloseTo(g.width - 2 * g.inset - g.knob, 9);
        // the same pill the Theme toggle is, at the same room
        expect(g.width, at).toBe(themeSkyGeometry(width, locked).width);
      }
  });

  it('writes Night right of its knob and Dark left of the moon, in the room the Theme toggle gives each', () => {
    for (const locked of LOCKS)
      for (const width of WIDTHS) {
        const g = themeSkyGeometry(width, locked, DIM_STOPS);
        const three = themeSkyGeometry(width, locked);
        const at = `${width}${'night' in locked ? ', locked' : ''}`;
        expect(g.word.night.left, at).toBeCloseTo(g.rest.night + g.knob + WORD_GAP, 9);
        expect(g.word.dark.right, at).toBeCloseTo(g.rest.dark - WORD_GAP, 9);
        expect(spanWidth(g.word.night), at).toBeCloseTo(spanWidth(three.word.night), 9);
        expect(spanWidth(g.word.dark), at).toBeCloseTo(spanWidth(three.word.dark), 9);
        // clear of the other stop's halo by the word's own room
        expect(g.markerLeft.dark - g.word.night.right, at).toBeGreaterThanOrEqual(WORD_GAP);
        expect(g.word.dark.left - (g.markerLeft.night + g.marker.night), at).toBeGreaterThanOrEqual(
          WORD_GAP - 1e-9,
        );
        // so the two words grow with the phone's text to 1.3× at least, as the Theme toggle's do
        const cap = wordScaleCap(g, DIM_WORDS);
        expect(cap, at).toBeGreaterThanOrEqual(WORD_TYPE.floor);
        expect(cap, at).toBeLessThanOrEqual(WORD_TYPE.ceiling);
        for (const stop of DIM_STOPS) {
          const box = wordBox(g, stop, DIM_WORDS[stop], cap);
          expect(box.left, `${at}: ${stop}`).toBeGreaterThanOrEqual(g.word[stop].left - 1e-9);
          expect(box.right, `${at}: ${stop}`).toBeLessThanOrEqual(g.word[stop].right + 1e-9);
        }
      }
  });

  it('keeps each halo inside the pill — a locked Night at the left end moved in off the rim', () => {
    for (const locked of LOCKS)
      for (const width of WIDTHS) {
        const g = themeSkyGeometry(width, locked, DIM_STOPS);
        for (const stop of DIM_STOPS) {
          const at = `${width}${'night' in locked ? ', locked' : ''}: ${stop}`;
          expect(g.markerLeft[stop], at).toBeGreaterThanOrEqual(g.inset);
          expect(g.markerLeft[stop] + g.marker[stop], at).toBeLessThanOrEqual(g.width - g.inset);
          expect(haloInside(g, g.markerLeft[stop], g.marker[stop]), at).toBe(true);
        }
        // and never under the knob that rests at the other end
        expect(g.markerLeft.dark, `${width}`).toBeGreaterThan(g.rest.night + g.knob + WORD_GAP);
        expect(g.markerLeft.night + g.marker.night, `${width}`).toBeLessThan(
          g.rest.dark - WORD_GAP,
        );
      }
  });

  it('scatters the dark picture’s stars between the Night halo and the Dark word', () => {
    for (const locked of LOCKS)
      for (const width of WIDTHS) {
        const g = themeSkyGeometry(width, locked, DIM_STOPS);
        const field = g.scenery.dark;
        expect(field.left).toBeGreaterThanOrEqual(g.markerLeft.night + g.marker.night);
        expect(field.right).toBeLessThanOrEqual(g.word.dark.left);
        expect(spanWidth(field), `${width}`).toBeGreaterThan(40);
        for (const star of g.stars) {
          expect(star.x - star.size / 2).toBeGreaterThanOrEqual(field.left - 1e-9);
          expect(star.x + star.size / 2).toBeLessThanOrEqual(field.right + 1e-9);
        }
      }
  });

  it('rolls the knob one stride, each face upright at its own end, and lands at both', () => {
    const g = themeSkyGeometry(320, {}, DIM_STOPS);
    const f = themeSkyFrames(g);
    expect(sample(f.knobX, 0)).toBe(0);
    expect(sample(f.knobX, 1)).toBeCloseTo(g.stride, 9);
    expect(sample(f.knobStretch, 0.5)).toBeCloseTo(1.08, 9);
    expect(sample(f.turn.night, 0)).toBe(0);
    expect(sample(f.turn.dark, 1)).toBe(0);
    // half a turn across the one stride, as between two neighbors on the Theme toggle
    expect(sample(f.turn.night, 1)).toBe(ROLL_PER_STRIDE);
    // no light round the crescent, and the moon's fainter light at Dark
    expect(sample(f.haloOpacity, 0)).toBe(0);
    expect(sample(f.haloOpacity, 1)).toBeCloseTo(0.6, 9);
    for (const [from, to] of [
      ['night', 'dark'],
      ['dark', 'night'],
    ] as const) {
      const plan = planSkyMove(null, from, to, 0, false, DIM_STOPS);
      expect(plan.pos).toBe(stopIndex(to, DIM_STOPS));
      expect(plan.ease).toBe('land');
      expect(plan.duration).toBe(moveMs(1));
      const still = planSkyMove(null, from, to, 0, true, DIM_STOPS);
      expect(still.animate).toBe(false);
      expect(still.pos).toBe(stopIndex(to, DIM_STOPS));
    }
  });

  // another deterministic walk, as the three-stop one above: pure arithmetic, given room
  it('never leaves the knob without a face, and Night always fades off a whole Dark', () => {
    const f = themeSkyFrames(themeSkyGeometry(320, {}, DIM_STOPS));
    let seed = 11;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let walk = 0; walk < 40; walk += 1) {
      const taps: [number, SkyStop][] = [];
      let t = 0;
      for (let i = 0; i < 6; i += 1) {
        t += Math.round(20 + rnd() * 900);
        taps.push([t, DIM_STOPS[Math.floor(rnd() * 2)] ?? 'dark']);
      }
      const start = DIM_STOPS[walk % 2] ?? 'dark';
      const { frames, last } = simulate(start, taps, DIM_STOPS);
      let knobLeast = 1;
      let darkLeast = 1;
      for (const fr of frames) {
        const faces = knobFaces(f, fr.v.night, fr.v.dark);
        knobLeast = Math.min(knobLeast, Math.max(faces.dark, faces.night));
        // the day is not drawn here: what shows through a Night on its way out is all Dark
        if (fr.v.night < 1) darkLeast = Math.min(darkLeast, fr.v.dark);
      }
      expect(knobLeast, `walk ${walk}`).toBe(1);
      expect(darkLeast, `walk ${walk}`).toBe(1);
      const final = taps[taps.length - 1]?.[1] ?? 'dark';
      expect(last?.v.pos, `walk ${walk}`).toBeCloseTo(stopIndex(final, DIM_STOPS), 6);
      expect(last?.v.night, `walk ${walk}`).toBeCloseTo(final === 'night' ? 1 : 0, 9);
    }
  }, 20_000);

  it('draws only what it offers: no day, no sun and no clouds on “Dim to”', () => {
    expect(flat).toContain('const offered = skyStops(stops);');
    expect(flat).toContain("const hasDay = g.stops.includes('light');");
    expect(flat).toContain(
      "{hasDay ? <View style={StyleSheet.absoluteFill}>{picture('light')}</View> : null}",
    );
    // without the day, Dark is the bottom of the stack and drawn whole
    expect(flat).toContain(
      "hasDark ? ( <View style={StyleSheet.absoluteFill}>{picture('dark')}</View> ) : null}",
    );
    expect(flat).toContain(
      '{hasDay ? ( <Animated.View style={[StyleSheet.absoluteFill, anim.sunFace]}>',
    );
    // the stops, the planner and the knob's first place all read what it offers
    expect(flat).toContain(
      'const plan = planSkyMove(m, at.current, value, now, t.reduceMotion, g.stops);',
    );
    expect(flat).toContain(
      'const pos = useRef(new Animated.Value(stopIndex(value, offered))).current;',
    );
    expect(flat).toContain('.filter(other => other !== stop)');
    expect(flat).toContain('left={g.markerLeft[other]}');
  });
});

describe('the halo on the component (tripwires over ThemeSkyToggle.tsx)', () => {
  it('draws each glyph on its halo and ring, the lock inside it, in the picture’s own colors', () => {
    expect(flat).toContain('top={(g.height - MARKER_HALO) / 2}');
    expect(flat).toContain('width={g.marker[other]}');
    expect(flat).toContain('backgroundColor: scene.markerHalo,');
    expect(flat).toContain('borderColor: scene.markerRing,');
    expect(flat).toContain('borderWidth: MARKER_RING,');
    expect(flat).toContain('borderRadius: MARKER_HALO / 2,');
    expect(flat).toContain('paddingHorizontal: MARKER_PAD - MARKER_RING,');
    expect(flat).toContain(
      '{locked ? <Icon name="lock" size={MARKER_LOCK} color={ink} strokeWidth={2.4} /> : null}',
    );
    expect(flat).toContain('strokeWidth={SUN_RAY_STROKE}');
  });
});
