/**
 * THE SIDE SLIDER (the owner, 2026-09-26, of the breastfeed sheet's two buttons: *"what about user
 * has to swipe to left or right from a button in the middle that needs to be dragged"*). Two
 * halves, the way this package tests anything a thumb touches. The geometry, the gesture's rules,
 * the motion and the colors are PURE (`sideSlider.ts`), and are walked here: a finger's path point
 * by point, the spring step by step, every width a phone gives, every theme and scheme. What only a
 * device can show — that the slider takes only a sideways drag, runs on the native driver, is felt
 * once and is three named targets to a screen reader — is held by tripwires over `SideSlider.tsx`,
 * because this suite has no renderer (`interaction.test.ts` says why that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ILLUSTRATED_MIN_SIZE } from '../icons/illustrated';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from '../theme/contrast';
import {
  moduleColor,
  resolvePalette,
  schemes,
  themeNames,
  themes,
  type SchemeName,
  type ThemeName,
} from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import {
  armAfter,
  claimsSlide,
  GLOW_STOPS,
  knobOffset,
  planKnob,
  SIDE_CHEVRON,
  SIDE_GESTURE,
  SIDE_MOTION,
  SIDE_SLIDER,
  SIDE_WORD,
  sideOf,
  sideOnRelease,
  sideSign,
  sideSliderColors,
  sideSliderFrames,
  sideSliderGeometry,
  sideSliderStill,
  sideWordCap,
  sideWordWidth,
  SLIDER_SIDES,
  slideMs,
  yieldsToScroll,
  type SideSliderGeometry,
  type SliderSide,
} from './sideSlider';
import { spanWidth } from './themeSkyToggle';

const here = dirname(fileURLToPath(import.meta.url));
/** Comments out, whitespace flattened: the component explains its rules, and a scan must not read them. */
const component = readFileSync(join(here, 'SideSlider.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ');
const count = (src: string, needle: string): number => src.split(needle).length - 1;

/**
 * The breastfeed sheet's words today, as a FIXTURE: the design system types no word, and
 * `apps/mobile/src/sheets/quick/modules/sideSlider.test.ts` runs the same proof over the words the
 * sheet really passes.
 */
const WORDS = { left: 'Left', right: 'Right' } as const;

/** Every width a sheet's body can be, half a point apart, from the proven floor to the cap. */
const WIDTHS = Array.from(
  { length: (SIDE_SLIDER.maxWidth - SIDE_SLIDER.minWidth) * 2 + 1 },
  (_, i) => SIDE_SLIDER.minWidth + i / 2,
);
/** The body on a 360 dp Android, a 375 pt iPhone and the largest phone: the window less 2 × 18. */
const PHONES = [324, 339, 394] as const;
const at = (width: number): SideSliderGeometry => sideSliderGeometry(width, WORDS);

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

/**
 * A FINGER'S PATH, as the move handler sees it: each point is where the knob is put, and a tick is
 * felt each time `armAfter` returns a side it did not have — exactly the component's rule.
 */
function drag(g: SideSliderGeometry, path: readonly number[]) {
  let armed: SliderSide | null = null;
  const ticks: { x: number; side: SliderSide }[] = [];
  for (const dx of path) {
    const x = knobOffset(dx, g);
    const next = armAfter(armed, x, g);
    if (next !== armed && next !== null) ticks.push({ x, side: next });
    armed = next;
  }
  return { armed, ticks };
}
/** From `from` to `to` in steps of `step` points, both ends included. */
const line = (from: number, to: number, step = 0.25): number[] => {
  const n = Math.max(1, Math.round(Math.abs(to - from) / step));
  return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
};

describe('the size of it', () => {
  it('is a pill 52 tall holding a 44 pt knob, and each end is a 44 pt target at least', () => {
    expect(SIDE_SLIDER.height).toBeGreaterThanOrEqual(52);
    expect(SIDE_SLIDER.height).toBeLessThanOrEqual(56);
    for (const width of WIDTHS) {
      const g = at(width);
      expect(g.height).toBe(SIDE_SLIDER.height);
      expect(g.knob).toBe(g.height - 2 * g.inset);
      // the knob is what a thumb has to find, and the words are buttons (CLAUDE.md §6)
      expect(g.knob).toBeGreaterThanOrEqual(44);
      expect(g.end, `at ${width}`).toBeGreaterThanOrEqual(44);
      expect(spanWidth(g.middle), `at ${width}`).toBeGreaterThanOrEqual(g.knob);
    }
  });

  it('takes the room it is given, whole phones included, and stops past any phone', () => {
    for (const phone of PHONES) expect(at(phone).width).toBe(phone);
    expect(at(900).width).toBe(SIDE_SLIDER.maxWidth);
    // a first frame that measured nothing still draws both ends and a knob that can move
    expect(at(0).width).toBe(2 * at(0).end + 2 * at(0).knob);
    expect(at(0).half).toBe(at(0).knob / 2);
  });

  it('rests the knob in the true middle, the same drag away from either end', () => {
    for (const width of WIDTHS) {
      const g = at(width);
      expect(g.rest + g.knob / 2).toBeCloseTo(g.width / 2, 9);
      expect(g.middle.left).toBe(g.end);
      expect(g.width - g.middle.right).toBe(g.end);
      // at either end the knob comes to rest against that word's zone, not in it
      expect(g.rest - g.half).toBeCloseTo(g.end, 9);
      expect(g.rest + g.half + g.knob).toBeCloseTo(g.width - g.end, 9);
    }
  });

  it('sizes both ends by the longer word, so a short word does not move the middle', () => {
    const g = at(339);
    expect(spanWidth(g.word.left)).toBe(spanWidth(g.word.right));
    expect(g.end).toBe(Math.ceil(SIDE_WORD.edge + sideWordWidth('Right', 1.3) + SIDE_WORD.gap));
  });

  it('travels far enough to be a decision, at every width, and further on a phone', () => {
    for (const width of WIDTHS) {
      const g = at(width);
      // well past the point the slider took the touch, and past a flick's own travel
      expect(g.arm, `at ${width}`).toBeGreaterThan(2 * SIDE_GESTURE.claim);
      expect(g.half, `at ${width}`).toBeGreaterThan(SIDE_GESTURE.fling.travel);
    }
    for (const phone of PHONES) {
      expect(at(phone).half).toBeGreaterThanOrEqual(60);
      // and never so far that a thumb has to aim for the end: the arm point is a little past half
      expect(at(phone).arm).toBeLessThan(at(phone).half);
    }
  });
});

describe('the words fit their ends, at every width a phone gives', () => {
  it('grow with the phone’s text to at least 1.3×, and never past the chrome cap', () => {
    for (const width of WIDTHS) {
      const cap = sideWordCap(at(width), WORDS);
      expect(cap, `at ${width}`).toBeGreaterThanOrEqual(SIDE_WORD.floor);
      expect(cap).toBeLessThanOrEqual(SIDE_WORD.ceiling);
    }
  });

  it('never reach the knob at its end, nor out past the pill’s round end', () => {
    for (const width of WIDTHS) {
      const g = at(width);
      const cap = sideWordCap(g, WORDS);
      for (const side of SLIDER_SIDES) {
        const span = g.word[side];
        const w = sideWordWidth(WORDS[side], cap);
        const left = span.left + (spanWidth(span) - w) / 2;
        expect(left, `${side} at ${width}`).toBeGreaterThanOrEqual(SIDE_WORD.edge - 1e-9);
        expect(left + w).toBeLessThanOrEqual(g.width - SIDE_WORD.edge + 1e-9);
      }
      // the knob at its left end starts where the left word's room (and its gap) ends
      expect(g.rest - g.half - g.word.left.right).toBeCloseTo(SIDE_WORD.gap, 9);
      expect(g.word.right.left - (g.rest + g.half + g.knob)).toBeCloseTo(SIDE_WORD.gap, 9);
    }
  });

  it('keep off the round end: where a word starts, the curve still has a line at 1.3× in it', () => {
    const r = SIDE_SLIDER.height / 2;
    const chord = 2 * Math.sqrt(r * r - (r - SIDE_WORD.edge) ** 2);
    expect(chord).toBeGreaterThanOrEqual(SIDE_WORD.lineHeight * SIDE_WORD.floor);
  });
});

describe('the hint and the light stay out of the way', () => {
  it('puts a chevron each side of the knob at rest, clear of it and of both words', () => {
    for (const width of WIDTHS) {
      const g = at(width);
      const mid = g.width / 2;
      const s = SIDE_CHEVRON.size;
      expect(mid - g.chevron.left).toBeCloseTo(g.chevron.right - mid, 9);
      // clear of the knob by the gap…
      expect(g.chevron.left + s / 2).toBeCloseTo(g.rest - SIDE_CHEVRON.gap, 9);
      // …and inside the knob's own zone, never over a word
      expect(g.chevron.left - s / 2).toBeGreaterThan(g.middle.left);
      expect(g.chevron.right + s / 2).toBeLessThan(g.middle.right);
    }
  });

  it('lights a word from behind it, inside its end, never under the knob that stops beside it', () => {
    for (const width of WIDTHS) {
      const g = at(width);
      for (const side of SLIDER_SIDES) {
        const glow = g.glow[side];
        const word = g.word[side];
        expect((glow.left + glow.right) / 2).toBeCloseTo((word.left + word.right) / 2, 9);
        expect(glow.left).toBeGreaterThan(0);
        expect(glow.right).toBeLessThan(g.width);
      }
      expect(g.glow.left.right).toBeLessThan(g.rest - g.half);
      expect(g.glow.right.left).toBeGreaterThan(g.rest + g.half + g.knob);
    }
  });
});

describe('which touches are the slider’s (claimsSlide, yieldsToScroll)', () => {
  it('takes a sideways move past 8 points, either way, and not a tap’s wobble', () => {
    expect(SIDE_GESTURE.claim).toBe(8);
    expect(claimsSlide({ dx: 8, dy: 0 })).toBe(true);
    expect(claimsSlide({ dx: -8, dy: 0 })).toBe(true);
    expect(claimsSlide({ dx: 7.9, dy: 0 })).toBe(false);
    expect(claimsSlide({ dx: -7.9, dy: 1 })).toBe(false);
    expect(claimsSlide({ dx: 0, dy: 0 })).toBe(false);
  });

  it('takes only a move one and a half times further sideways than up or down', () => {
    expect(claimsSlide({ dx: 12, dy: 7.9 })).toBe(true);
    // exactly 1.5× is not "further": the boundary belongs to the scroll
    expect(claimsSlide({ dx: 12, dy: 8 })).toBe(false);
    expect(claimsSlide({ dx: -12, dy: -8 })).toBe(false);
    expect(claimsSlide({ dx: 30, dy: 30 })).toBe(false);
    expect(claimsSlide({ dx: 0, dy: 40 })).toBe(false);
    // swept round a quarter circle at 20 points: taken below about 33.7° from level, never above
    const edge = (Math.atan(1 / SIDE_GESTURE.dominance) * 180) / Math.PI;
    for (let deg = 0; deg <= 90; deg += 0.5) {
      const rad = (deg * Math.PI) / 180;
      const move = { dx: 20 * Math.cos(rad), dy: 20 * Math.sin(rad) };
      if (deg < edge - 0.01) expect(claimsSlide(move), `${deg}°`).toBe(true);
      if (deg > edge + 0.01) expect(claimsSlide(move), `${deg}°`).toBe(false);
      expect(claimsSlide({ dx: -move.dx, dy: -move.dy })).toBe(claimsSlide(move));
    }
  });

  it('hands a drag that turned into a scroll back to the sheet — unless a side is armed', () => {
    expect(yieldsToScroll({ dx: 10, dy: 30 }, null)).toBe(true);
    expect(yieldsToScroll({ dx: -10, dy: -30 }, null)).toBe(true);
    expect(yieldsToScroll({ dx: 30, dy: 10 }, null)).toBe(false);
    for (const side of SLIDER_SIDES) expect(yieldsToScroll({ dx: 10, dy: 90 }, side)).toBe(false);
  });
});

describe('the knob follows the finger, and one tick arms a side (armAfter)', () => {
  it('is under the finger, and never past either end', () => {
    const g = at(339);
    expect(knobOffset(0, g)).toBe(0);
    expect(knobOffset(23.5, g)).toBe(23.5);
    expect(knobOffset(-23.5, g)).toBe(-23.5);
    expect(knobOffset(500, g)).toBe(g.half);
    expect(knobOffset(-500, g)).toBe(-g.half);
  });

  it('arms at 60% of the way to an end and not a quarter point sooner', () => {
    for (const phone of PHONES) {
      const g = at(phone);
      expect(g.arm).toBeCloseTo(0.6 * g.half, 9);
      for (const side of SLIDER_SIDES) {
        const path = line(0, sideSign(side) * g.half);
        const { ticks } = drag(g, path);
        expect(ticks).toHaveLength(1);
        expect(ticks[0]?.side).toBe(side);
        expect(Math.abs(ticks[0]?.x ?? 0)).toBeGreaterThanOrEqual(g.arm);
        expect(Math.abs(ticks[0]?.x ?? 0)).toBeLessThan(g.arm + 0.25 + 1e-9);
      }
    }
  });

  it('out to the end and all the way back: one tick out, none on the way home, nothing armed', () => {
    const g = at(324);
    const { armed, ticks } = drag(g, [...line(0, g.half), ...line(g.half, 0)]);
    expect(ticks).toHaveLength(1);
    expect(armed).toBeNull();
  });

  it('a thumb resting on the line is felt once, not as a buzz', () => {
    const g = at(324);
    // a tremble of two points either side of the line, twenty times over
    const tremble = Array.from({ length: 40 }, (_, i) => g.arm + (i % 2 === 0 ? 2 : -2));
    const { armed, ticks } = drag(g, [...line(0, g.arm), ...tremble]);
    expect(ticks).toHaveLength(1);
    expect(armed).toBe('right');
  });

  it('un-arms under 50%, and crossing the line again arms it again, with a second tick', () => {
    const g = at(324);
    expect(g.disarm).toBeCloseTo(0.5 * g.half, 9);
    const back = drag(g, [...line(0, 0.65 * g.half), ...line(0.65 * g.half, 0.51 * g.half)]);
    expect(back.armed).toBe('right');
    const under = drag(g, [...line(0, 0.65 * g.half), ...line(0.65 * g.half, 0.49 * g.half)]);
    expect(under.armed).toBeNull();
    const again = drag(g, [
      ...line(0, 0.65 * g.half),
      ...line(0.65 * g.half, 0.45 * g.half),
      ...line(0.45 * g.half, 0.65 * g.half),
    ]);
    expect(again.ticks).toHaveLength(2);
    expect(again.armed).toBe('right');
  });

  it('from one side across to the other: the first lets go, the second arms, one tick each', () => {
    const g = at(339);
    const { armed, ticks } = drag(g, line(0.7 * g.half, -0.7 * g.half));
    expect(ticks.map(k => k.side)).toEqual(['right', 'left']);
    expect(armed).toBe('left');
  });
});

describe('what a lift chooses (sideOnRelease)', () => {
  const g = at(339);

  it('armed: letting go chooses that side — the tick and the result never disagree', () => {
    for (const side of SLIDER_SIDES) {
      const x = sideSign(side) * 0.62 * g.half;
      expect(sideOnRelease({ x, vx: 0, armed: side })).toBe(side);
      // still moving on toward it, even quickly
      expect(sideOnRelease({ x, vx: sideSign(side) * 1.2, armed: side })).toBe(side);
    }
    // armed from the hysteresis band, a little back from the line, still chooses it
    expect(sideOnRelease({ x: 0.55 * g.half, vx: 0, armed: 'right' })).toBe('right');
  });

  it('armed, but flicked back toward the middle as the finger lifts: a change of mind, nothing', () => {
    expect(sideOnRelease({ x: 0.55 * g.half, vx: -0.8, armed: 'right' })).toBeNull();
    expect(sideOnRelease({ x: -0.55 * g.half, vx: 0.8, armed: 'left' })).toBeNull();
    // a slow drift back is not a flick
    expect(sideOnRelease({ x: 0.55 * g.half, vx: -0.3, armed: 'right' })).toBe('right');
  });

  it('short of the line and slow: nothing, and the knob springs home', () => {
    for (const x of [0, 10, -10, 0.45 * g.half, -0.59 * g.half])
      expect(sideOnRelease({ x, vx: 0.1 * Math.sign(x), armed: null })).toBeNull();
  });

  it('a quick flick toward a side chooses it, however short the drag', () => {
    expect(SIDE_GESTURE.fling).toEqual({ velocity: 0.5, travel: 16 });
    expect(sideOnRelease({ x: 16, vx: 0.5, armed: null })).toBe('right');
    expect(sideOnRelease({ x: -20, vx: -1.4, armed: null })).toBe('left');
  });

  it('but not a slow one, not one against the knob, and not a wobble at speed', () => {
    expect(sideOnRelease({ x: 20, vx: 0.49, armed: null })).toBeNull();
    expect(sideOnRelease({ x: -20, vx: 0.9, armed: null })).toBeNull();
    expect(sideOnRelease({ x: 15.9, vx: 0.9, armed: null })).toBeNull();
  });
});

describe('how the knob moves on its own', () => {
  it('slides the rest of the way in 200 ms from the middle, less from nearer, never under 80', () => {
    const g = at(339);
    expect(slideMs(0, 'right', g)).toBe(SIDE_MOTION.slideMs);
    expect(slideMs(0, 'left', g)).toBe(SIDE_MOTION.slideMs);
    expect(slideMs(0.3 * g.half, 'right', g)).toBe(140);
    // from the line it arms at: what is left is short, and quick
    expect(slideMs(g.arm, 'right', g)).toBe(SIDE_MOTION.slideMinMs);
    expect(slideMs(g.half, 'right', g)).toBe(SIDE_MOTION.slideMinMs);
    for (let x = -g.half; x <= g.half; x += 1) {
      for (const side of SLIDER_SIDES) {
        expect(slideMs(x, side, g)).toBeGreaterThanOrEqual(80);
        expect(slideMs(x, side, g)).toBeLessThanOrEqual(200);
      }
    }
  });

  it('plans a slide to a chosen end, a spring home, and under reduce motion a jump for both', () => {
    const g = at(339);
    expect(planKnob(g.arm, 'right', g, false)).toEqual({
      to: g.half,
      how: 'slide',
      duration: slideMs(g.arm, 'right', g),
    });
    expect(planKnob(0, 'left', g, false).to).toBe(-g.half);
    expect(planKnob(20, null, g, false)).toEqual({ to: 0, how: 'spring', duration: 0 });
    expect(planKnob(g.arm, 'right', g, true)).toEqual({ to: g.half, how: 'jump', duration: 0 });
    expect(planKnob(20, null, g, true)).toEqual({ to: 0, how: 'jump', duration: 0 });
  });

  /**
   * THE SPRING HOME, walked: React Native's spring is x'' = −(k/m)(x − to) − (c/m)x', which is
   * integrated here a tenth of a millisecond at a time from a knob let go just short of arming.
   */
  it('springs home like a rubber band: over the middle by a little, and still within 0.4 s', () => {
    const { stiffness: k, damping: c, mass: m } = SIDE_MOTION.spring;
    const zeta = c / (2 * Math.sqrt(k * m));
    expect(zeta).toBeGreaterThan(0.6);
    expect(zeta).toBeLessThan(0.8);
    for (const phone of PHONES) {
      const g = at(phone);
      const x0 = 0.99 * g.arm;
      let x = x0;
      let v = 0;
      let furthest = 0;
      let settled = Infinity;
      const dt = 0.0001;
      for (let step = 0; step * dt < 1; step += 1) {
        v += (-(k / m) * x - (c / m) * v) * dt;
        x += v * dt;
        furthest = Math.min(furthest, x);
        if (Math.abs(x) > 0.5) settled = Infinity;
        else if (settled === Infinity) settled = step * dt;
      }
      // past the middle by about 5% of where it was let go, and never by more than 3 points
      expect(-furthest / x0, `at ${phone}`).toBeGreaterThan(0.02);
      expect(-furthest / x0).toBeLessThan(0.08);
      expect(-furthest).toBeLessThan(3);
      expect(settled, `at ${phone}`).toBeLessThan(0.4);
    }
  });

  it('nudges a tapped knob by less than a drag takes, so a nudge never looks like one', () => {
    expect(SIDE_MOTION.nudge.distance).toBeLessThan(SIDE_GESTURE.claim);
    // the chevrons dim with it, and never go out
    expect(SIDE_MOTION.nudge.distance).toBeLessThan(SIDE_CHEVRON.fade);
    const total = SIDE_MOTION.nudge.ms.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(300);
  });

  it('holds still under reduce motion alone — the amber Night still moves, it only loses its light', () => {
    expect(sideSliderStill(true)).toBe(true);
    expect(sideSliderStill(false)).toBe(false);
    expect(sideSliderColors(themes.night, 'breastfeed', 'night').glow).toBeNull();
  });
});

describe('what the two values draw (sideSliderFrames)', () => {
  const f = sideSliderFrames();

  it('shows the chevrons at rest and takes them away as soon as the knob moves, either way', () => {
    expect(sample(f.chevron, 0)).toBe(1);
    expect(sample(f.chevron, SIDE_CHEVRON.fade / 2)).toBeCloseTo(0.5, 9);
    expect(sample(f.chevron, -SIDE_CHEVRON.fade / 2)).toBeCloseTo(0.5, 9);
    for (const x of [SIDE_CHEVRON.fade, -SIDE_CHEVRON.fade, 60, -120])
      expect(sample(f.chevron, x)).toBe(0);
  });

  it('lights one word at a time, and the quiet word gives way to it exactly', () => {
    for (const side of SLIDER_SIDES) {
      expect(sample(f.lit[side], 0)).toBe(0);
      expect(sample(f.quiet[side], 0)).toBe(1);
      expect(sample(f.lit[side], sideSign(side))).toBe(1);
      expect(sample(f.quiet[side], sideSign(side))).toBe(0);
      // the other side's lighting leaves this word quiet
      expect(sample(f.lit[side], -sideSign(side))).toBe(0);
      expect(sample(f.quiet[side], -sideSign(side))).toBe(1);
      for (let p = -1; p <= 1; p += 0.05)
        expect(sample(f.lit[side], p) + sample(f.quiet[side], p)).toBeCloseTo(1, 9);
    }
  });
});

describe('the colors, measured in every theme and every scheme', () => {
  const SCHEMES = Object.keys(schemes) as SchemeName[];
  const sets = themeNames.flatMap(theme =>
    SCHEMES.map(scheme => ({
      theme,
      scheme,
      palette: resolvePalette(theme, scheme),
      c: sideSliderColors(resolvePalette(theme, scheme), 'breastfeed', theme),
    })),
  );
  const brightest = Math.max(...GLOW_STOPS.map(s => s.opacity));

  it('writes both words as text, 4.5:1 on the pill, the quiet one quieter', () => {
    for (const { theme, scheme, c } of sets) {
      const at = `${theme}/${scheme}`;
      for (const ink of [c.word, c.quiet]) {
        expect(parseColor(ink).a, at).toBe(1);
        expect(contrastRatio(ink, c.ground), at).toBeGreaterThanOrEqual(AA_TEXT);
      }
      expect(contrastRatio(c.quiet, c.ground)).toBeLessThan(contrastRatio(c.word, c.ground));
    }
  });

  it('keeps a lit word 4.5:1 where its glow is brightest', () => {
    for (const { theme, scheme, c } of sets) {
      if (c.glow === null) continue;
      const lit = composite(c.ground, c.glow, brightest);
      expect(contrastRatio(c.word, lit), `${theme}/${scheme}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('draws the knob, its glyph and the chevrons as marks, 3:1 on what they sit on', () => {
    for (const { theme, scheme, c } of sets) {
      const at = `${theme}/${scheme}`;
      expect(contrastRatio(c.knob, c.ground), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
      expect(contrastRatio(c.glyph, c.knob), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
      expect(contrastRatio(c.chevron, c.ground), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('wears the breastfeed module’s own pair — the tint and ink of the sheet’s tandem card', () => {
    for (const { palette, c } of sets) {
      expect(c.ground).toBe(palette.breastfeedSoft);
      expect(c.knob).toBe(palette.breastfeed);
      expect(c.glyph).toBe(palette.breastfeedSoft);
      expect(c.word).toBe(palette.text);
      expect(c.quiet).toBe(palette.text2);
    }
  });

  it('casts a shadow of dark ink, never the near-white text, which would be a glow', () => {
    const light = sideSliderColors(themes.light, 'breastfeed', 'light');
    const dark = sideSliderColors(themes.dark, 'breastfeed', 'dark');
    for (const c of [light, dark]) {
      expect(c.shadow).not.toBeNull();
      expect(contrastRatio(composite(c.ground, c.shadow ?? ''), '#000000')).toBeLessThan(
        contrastRatio(c.ground, '#000000'),
      );
    }
  });

  it('holds for every module’s pair, so another sheet may wear it without a new measurement', () => {
    const roles = [...new Set(Object.values(moduleColor))];
    expect(roles.length).toBeGreaterThanOrEqual(10);
    for (const theme of themeNames)
      for (const role of roles) {
        const c = sideSliderColors(themes[theme], role, theme);
        const lit = c.glow === null ? c.ground : composite(c.ground, c.glow, brightest);
        const at = `${theme}/${role}`;
        expect(contrastRatio(c.knob, c.ground), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
        expect(contrastRatio(c.quiet, c.ground), at).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(c.word, lit), at).toBeGreaterThanOrEqual(AA_TEXT);
      }
  });

  it('keeps the knob’s glyph the one-ink drawing, never the owner’s four-color picture', () => {
    expect(SIDE_SLIDER.glyph).toBeLessThan(ILLUSTRATED_MIN_SIZE);
  });

  describe('the amber Night: its own roles, nothing lit, no shadow', () => {
    const own = new Set(Object.values(themes.night).map(v => v.toLowerCase()));
    const nights = sets.filter(s => s.theme === ('night' satisfies ThemeName));

    it('draws from the night palette’s roles and nothing else, with no blue in any', () => {
      for (const { c, palette } of nights) {
        expect(c.glow).toBeNull();
        expect(c.shadow).toBeNull();
        for (const v of [c.ground, c.knob, c.glyph, c.chevron, c.word, c.quiet]) {
          // the scheme may move night's accent and nothing here reads it
          expect(own.has(v.toLowerCase()) || v === palette.accent, v).toBe(true);
          const { r, b } = parseColor(v);
          expect(b, v).toBeLessThanOrEqual(r);
        }
      }
    });
  });
});

describe('the side arithmetic', () => {
  it('signs the sides, and reads a side back from any signed number', () => {
    expect(SLIDER_SIDES).toEqual(['left', 'right']);
    expect(sideSign('left')).toBe(-1);
    expect(sideSign('right')).toBe(1);
    expect(sideOf(-0.1)).toBe('left');
    expect(sideOf(0.1)).toBe('right');
    expect(sideOf(0)).toBeNull();
  });
});

describe('where the device-only rules live (tripwires over SideSlider.tsx)', () => {
  it('takes a touch only by the rule — never on contact — and hands a scroll back by the rule', () => {
    expect(count(component, 'PanResponder.create(')).toBe(1);
    expect(component).toContain('onStartShouldSetPanResponder: () => false,');
    expect(component).toContain(
      'onMoveShouldSetPanResponder: (_e, gs) => live() && claimsSlide(gs),',
    );
    expect(component).toContain(
      'onPanResponderTerminationRequest: (_e, gs) => yieldsToScroll(gs, armed),',
    );
    // never a capture: the sheet's scroll and the words' taps are asked first
    expect(component).not.toContain('ShouldSetPanResponderCapture');
    // and the lift is decided by the rule the tests above walk
    expect(component).toContain('const side = sideOnRelease({ x: shown, vx: gs.vx, armed });');
  });

  it('uses no gesture library: PanResponder and Animated only', () => {
    expect(component).not.toMatch(/react-native-gesture-handler|react-native-reanimated/);
  });

  it('runs every animation on the native driver', () => {
    const runs = count(component, 'Animated.timing(') + count(component, 'Animated.spring(');
    expect(runs).toBeGreaterThanOrEqual(5);
    expect(count(component, 'useNativeDriver: true')).toBe(runs);
    expect(component).not.toContain('useNativeDriver: false');
  });

  it('is felt once, as a side arms — and never for the choice, which the start it makes is felt as', () => {
    expect(count(component, 'haptic(')).toBe(1);
    expect(component).toContain("if (next === armed) return; if (next !== null) haptic('tick');");
    expect(component).not.toContain("haptic('double')");
    expect(component).not.toContain('feelChoice(');
  });

  it('hears a choice once, as the knob lands, and takes a refused one back', () => {
    expect(count(component, 'latest.current.onChoose(side)')).toBe(1);
    expect(component).toContain(
      'if (!mounted.current || chosen !== side) return; const out = latest.current.onChoose(side);',
    );
    expect(component).toContain('if (!took) handBack();');
    // a spent slider takes nothing: every way in goes through `live()`
    expect(component).toContain('const live = () => chosen === null && !latest.current.disabled;');
    expect(component).toContain(
      'const choose = (side: SliderSide, from: number) => { if (!live()) return;',
    );
  });

  it('jumps under reduce motion: no slide, no spring, no fade, no nudge', () => {
    expect(component).toContain('const still = sideSliderStill(t.reduceMotion);');
    expect(component).toContain("if (plan.how === 'jump') { x.setValue(plan.to);");
    expect(component).toContain('if (latest.current.still) { lit.setValue(to); return; }');
    expect(component).toContain('if (!live() || latest.current.still) return;');
  });

  it('draws no glow where the colors have none (the amber Night)', () => {
    expect(component).toContain('const glow = colors.glow;');
    expect(component).toContain('{glow === null ? null : SLIDER_SIDES.map(');
  });

  it('is three named buttons to a screen reader, in order, over a drawing hidden from it', () => {
    expect(component).toMatch(
      /<View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
    expect(component).toContain(
      'accessibilityRole="button" accessibilityLabel={actionLabels[side]} accessibilityState={{ disabled }} disabled={disabled} onPress={() => control.choose(side, 0)}',
    );
    expect(component).toContain(
      "accessibilityRole=\"button\" accessibilityLabel={label} accessibilityHint={hint} accessibilityActions={[ { name: 'left', label: actionLabels.left }, { name: 'right', label: actionLabels.right }, ]} onAccessibilityAction={onAction} accessibilityState={{ disabled }} disabled={disabled}",
    );
    expect(component).toContain(
      "if (name === 'left' || name === 'right') control.choose(name, 0);",
    );
    const left = component.indexOf("{end('left'");
    const knob = component.indexOf('accessibilityHint={hint}');
    const right = component.indexOf("{end('right'");
    expect(left).toBeGreaterThan(-1);
    expect(left).toBeLessThan(knob);
    expect(knob).toBeLessThan(right);
  });

  it('names its targets from the caller’s id: `.left` and `.right` on the words', () => {
    // each written beside the word `testID`, which is where the flow linter reads a component's
    // own id shapes (tools/e2e-testids.mjs), and handed to the word's button whole
    expect(component).toContain("{end('left', testID ? { testID: `${testID}.left` } : {})}");
    expect(component).toContain("{end('right', testID ? { testID: `${testID}.right` } : {})}");
    expect(component).toContain('{...(ids.testID ? { testID: ids.testID } : {})}');
    expect(component).toContain('testID: `${testID}.knob`');
    expect(component).toContain('testID: `${testID}.slider`');
  });

  it('dims as one picture when disabled, and nothing on it answers', () => {
    expect(component).toContain('needsOffscreenAlphaCompositing={disabled}');
    expect(component).toContain('{ opacity: disabled ? 0.5 : 1 }');
    expect(count(component, 'disabled={disabled}')).toBe(2);
  });
});
