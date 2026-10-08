/**
 * THE MEAL SKY (the owner, 2026-09-25: the solids sheet's meal as the sun crossing the sky — "Let's
 * try doing everything. I will then review"). Two halves, the way this package tests anything that
 * moves: the geometry, the planner and the picture at every point of its animated values are PURE
 * (`mealSkyToggle.ts`) and are sampled here exactly as `Animated.Value#interpolate` would sample
 * them; what can only be seen on a device — that it is one radio group to a screen reader, runs on
 * the native driver and honors reduce motion — is held by tripwires over `MealSkyToggle.tsx`,
 * because this suite has no renderer (`interaction.test.ts` says why that is the honest instrument).
 */
import { MEAL_LABEL, MEALS, mealForTime, type Meal } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { SKINS } from '../theme/skins';
import { type Frame } from './dayNightSwitch';
import {
  arcAtPos,
  arcPoint,
  MEAL_HILLS,
  MEAL_SKY_SIZE,
  MEAL_STOPS,
  MEAL_WORD,
  mealIndex,
  mealSkyFrames,
  mealSkyGeometry,
  mealSkyStill,
  mealSkyWeights,
  mealWordLayout,
  mealWordWidth,
  planMealMove,
  SUN_AT,
  sunAt,
  type MealMotion,
  type MealPlan,
} from './mealSkyToggle';
import { PICTURE_WORD } from './pictureToggle';
import { easeAt, moveMs, SKY_EASE, spanWidth, THEME_SKY_MS } from './themeSkyToggle';

// every width the sheet can have, and long walks of simulated taps a millisecond at a time: pure
// arithmetic, but a few seconds on a machine busy with other suites, so it gets room past vitest's
// 5 s default — the walks are deterministic, and room is all a slow machine needs
vi.setConfig({ testTimeout: 20_000 });

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('MealSkyToggle.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('mealSkyToggle.ts'));

/** Every width the quick sheet's body can be, half a point apart, and two a larger phone gives. */
const WIDTHS = [
  ...Array.from(
    { length: (MEAL_SKY_SIZE.maxWidth - MEAL_SKY_SIZE.minWidth) * 2 + 1 },
    (_, i) => MEAL_SKY_SIZE.minWidth + i / 2,
  ),
  430,
  768,
];
/** The words the solids sheet really passes: core's own labels, the segmented control's words. */
const WORDS = MEAL_LABEL;

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

/** Whether a point is inside a rounded rectangle of corner radius `rad`, `margin` in from its edge. */
function insideFrame(w: number, h: number, rad: number, x: number, y: number, margin: number) {
  if (x < margin || x > w - margin || y < margin || y > h - margin) return false;
  const cx = Math.min(Math.max(x, rad), w - rad);
  const cy = Math.min(Math.max(y, rad), h - rad);
  return Math.hypot(x - cx, y - cy) <= rad - margin + 1e-9;
}

/** The largest corner radius any skin gives the picture (`t.radius.m`). */
const CORNER = Math.max(...Object.values(SKINS).map(s => s.radius.m));

describe('the size of it', () => {
  it('is a picture with four zones, each a target tall and wide, at every width', () => {
    for (const width of WIDTHS) {
      const g = mealSkyGeometry(width);
      expect(g.height).toBeGreaterThanOrEqual(44);
      expect(g.zone, `at ${width}`).toBeGreaterThanOrEqual(44);
      expect(g.zone * 4).toBeCloseTo(g.width, 9);
    }
    // and the component makes the zones exactly that: four equal quarters of the picture
    expect(flat).toContain('style={styles.zone}');
    expect(component).toMatch(/zone: \{ flex: 1 \}/);
  });

  it('takes the room it is given, and stops growing past a phone’s width', () => {
    expect(mealSkyGeometry(300).width).toBe(300);
    expect(mealSkyGeometry(768).width).toBe(MEAL_SKY_SIZE.maxWidth);
    // a first frame that measured nothing still draws four whole targets, not a crushed picture
    expect(mealSkyGeometry(0).zone).toBeGreaterThanOrEqual(44);
  });

  it('is as short as it reads: 60 pt, a ground no taller than the word needs, a sky for the arc', () => {
    // the owner, 2026-09-26, of the 90 pt it first was: "yes always make things shorter when you
    // can". Growing it back is a decision that edits this line, not a drift
    const { height, horizon, apex, sun, rim } = MEAL_SKY_SIZE;
    expect(height).toBe(60);
    // the ground: the fewest whole points that hold the word's line at the floor, and its insets
    const needs = MEAL_WORD.size * MEAL_WORD.line * MEAL_WORD.floor + 2 * MEAL_WORD.inset;
    expect(height - horizon).toBe(Math.ceil(needs));
    // the sky: an arc that climbs three suns high — room for breakfast to stand whole on the
    // horizon under half way up — with noon's sun a clear two points inside the rim above it
    expect(horizon - apex).toBeGreaterThanOrEqual(3 * sun);
    expect(apex - sun - rim).toBeGreaterThanOrEqual(2);
    // and the sky is still the larger part of the picture: a sky over a strip of land
    expect(horizon).toBeGreaterThan(height - horizon);
  });
});

describe('where the sun stands for each meal', () => {
  it('rises low on the left for breakfast, stands high at noon, lowers for snack and sets for dinner', () => {
    for (const width of WIDTHS) {
      const g = mealSkyGeometry(width);
      const s = g.sun;
      const at = `at ${width}`;
      // left to right, the day's order
      expect(s.BREAKFAST.x).toBeLessThan(s.LUNCH.x);
      expect(s.LUNCH.x).toBeLessThan(s.SNACK.x);
      expect(s.SNACK.x).toBeLessThan(s.DINNER.x);
      // lunch is the highest, and within a point of the top of the arc
      expect(s.LUNCH.y, at).toBeLessThan(Math.min(s.BREAKFAST.y, s.SNACK.y, s.DINNER.y));
      expect(s.LUNCH.y - g.apex, at).toBeLessThan(1);
      // snack is visibly lower than lunch — the afternoon, not a second noon: by a fifth of the
      // arc's climb or more (the 8 pt of 40 this held when the picture was 90 tall)
      expect(s.SNACK.y - s.LUNCH.y, at).toBeGreaterThanOrEqual((g.horizon - g.apex) / 5);
      // breakfast is just risen: low, its whole disc above the horizon
      expect(s.BREAKFAST.y + g.sunR, at).toBeLessThanOrEqual(g.horizon);
      expect(g.horizon - s.BREAKFAST.y, at).toBeLessThan((g.horizon - g.apex) / 2);
      // dinner is setting: its center on the horizon, half behind the land, at the right edge
      expect(s.DINNER.y).toBe(g.horizon);
      expect(s.DINNER.x, at).toBeGreaterThan(0.9 * g.width);
    }
  });

  it('stands each sun wholly inside its own meal’s quarter, so a tap where a sun could be picks it', () => {
    for (const width of WIDTHS) {
      const g = mealSkyGeometry(width);
      MEAL_STOPS.forEach((meal, i) => {
        const { x } = g.sun[meal];
        expect(x - g.sunR, `${meal} at ${width}`).toBeGreaterThanOrEqual(i * g.zone);
        expect(x + g.sunR, `${meal} at ${width}`).toBeLessThanOrEqual((i + 1) * g.zone);
      });
    }
  });

  it('keeps the four meals in core’s order, the order the segmented control drew them in', () => {
    expect(MEAL_STOPS).toEqual(MEALS);
    expect(MEAL_STOPS.map(mealIndex)).toEqual([0, 1, 2, 3]);
    expect(Object.keys(SUN_AT)).toEqual([...MEALS]);
  });

  it('opens roughly where the real sun is, because the sheet’s meal comes from the clock', () => {
    // mealForTime: 05:00–10:30 breakfast · 10:30–14:00 lunch · 17:00–21:00 dinner · else a snack
    const at = (h: number, m = 0) => Date.UTC(2026, 8, 25, h, m);
    expect(mealForTime(at(7, 30), 'UTC')).toBe('BREAKFAST');
    expect(mealForTime(at(12, 40), 'UTC')).toBe('LUNCH');
    expect(mealForTime(at(15, 30), 'UTC')).toBe('SNACK');
    expect(mealForTime(at(18, 15), 'UTC')).toBe('DINNER');
    // and those are the morning, noon, afternoon and setting suns above
    const g = mealSkyGeometry(324);
    expect(g.sun.LUNCH.y).toBeLessThan(g.sun.SNACK.y);
    expect(g.sun.DINNER.y).toBeGreaterThan(g.sun.SNACK.y);
  });
});

describe('the arc stays inside the frame', () => {
  it('draws the sun’s whole path inside the picture, above the land', () => {
    for (const width of WIDTHS) {
      const g = mealSkyGeometry(width);
      const nums = (g.path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      expect(nums.length).toBeGreaterThan(40);
      for (let i = 0; i < nums.length; i += 2) {
        const [x = 0, y = 0] = [nums[i], nums[i + 1]];
        expect(
          insideFrame(g.width, g.height, CORNER, x, y, g.rim),
          `(${x}, ${y}) at ${width}`,
        ).toBe(true);
        expect(y).toBeLessThanOrEqual(g.horizon + 1e-9);
      }
    }
  });

  it('glides the sun along that same path, and keeps its disc in the frame all the way', () => {
    for (const width of [MEAL_SKY_SIZE.minWidth, 324, 339, MEAL_SKY_SIZE.maxWidth]) {
      const g = mealSkyGeometry(width);
      const f = mealSkyFrames(g);
      for (let p = 0; p <= 3; p += 0.01) {
        const [x, y] = [sample(f.sunX, p), sample(f.sunY, p)];
        // on the arc: the point at the same parameter, to a hair (the path is sampled finely)
        const on = arcPoint(g, arcAtPos(p));
        expect(Math.hypot(x - on.x, y - on.y), `at ${p}`).toBeLessThan(0.6);
        // the disc inside the frame's top and sides, clear of the rounded corners above the land
        for (const [dx, dy] of [
          [-g.sunR, 0],
          [g.sunR, 0],
          [0, -g.sunR],
        ] as const)
          expect(insideFrame(g.width, g.height, CORNER, x + dx, y + dy, g.rim), `at ${p}`).toBe(
            true,
          );
      }
    }
  });

  it('keeps the two hills to the middle, clear of the two low suns', () => {
    for (const width of WIDTHS) {
      const g = mealSkyGeometry(width);
      for (const hill of Object.values(MEAL_HILLS)) {
        expect(hill.from * g.width, `at ${width}`).toBeGreaterThan(g.sun.BREAKFAST.x + g.sunR);
        expect(hill.to * g.width, `at ${width}`).toBeLessThan(g.sun.DINNER.x - g.sunR);
        // low enough never to touch a sun high enough to be above them
        expect(hill.rise).toBeLessThan(g.horizon - (g.sun.SNACK.y + g.sunR));
      }
    }
  });

  it('puts the dusk stars in the sky, above the sun’s path, and inside the frame', () => {
    for (const width of WIDTHS) {
      const g = mealSkyGeometry(width);
      for (const s of g.stars) {
        const under = arcPoint(g, (s.x - g.x0) / (g.x1 - g.x0));
        expect(s.y + s.size / 2, `at ${width}`).toBeLessThan(under.y - 4);
        expect(insideFrame(g.width, g.height, CORNER, s.x, s.y, s.size / 2 + g.rim)).toBe(true);
        // and clear of every meal's mark, so no star reads as a fifth meal on the path
        for (const meal of MEAL_STOPS) {
          const m = g.sun[meal];
          const gap = Math.hypot(s.x - m.x, s.y - m.y) - s.size / 2 - g.stationR;
          expect(gap, `${meal} at ${width}`).toBeGreaterThan(4);
        }
      }
    }
  });

  it('rings the sun with light no taller than the sky, so it stays the sun’s and not a second sky', () => {
    const g = mealSkyGeometry(324);
    const [inner, outer] = g.halo;
    expect(inner).toBeGreaterThan(2 * g.sunR);
    expect(outer).toBeGreaterThan(inner);
    expect(outer).toBeLessThanOrEqual(g.horizon);
  });
});

describe('the chosen word is written on the land, never under the sun', () => {
  it('writes every word below the horizon, where no sun is ever drawn over it', () => {
    for (const width of WIDTHS) {
      const g = mealSkyGeometry(width);
      expect(g.band.top).toBeGreaterThanOrEqual(g.horizon + MEAL_WORD.inset);
    }
    // the land is drawn over the sun, so what shows of a sun is only ever above the horizon — at
    // every point of a glide, not only at rest (its height is the same at every width)
    for (let p = 0; p <= 3; p += 0.01) {
      const top = sample(f324.sunY, p) - g324.sunR;
      expect(top, `at ${p}`).toBeLessThan(g324.horizon);
    }
    // and the sun's light is under the land too, so the halo never lies across a word
    expect(component.indexOf('<GroundLayer scene={sky.scenes.BREAKFAST}')).toBeGreaterThan(
      component.indexOf('anim.halo'),
    );
  });

  it('fits every word at 1.3× the phone’s text size or more, never past the chrome cap', () => {
    for (const width of WIDTHS) {
      const g = mealSkyGeometry(width);
      const { cap, box } = mealWordLayout(g, WORDS);
      expect(cap, `at ${width}`).toBeGreaterThanOrEqual(MEAL_WORD.floor);
      expect(cap).toBeLessThanOrEqual(MEAL_WORD.ceiling);
      // the line at its largest inside the strip of land
      expect(MEAL_WORD.size * MEAL_WORD.line * cap).toBeLessThanOrEqual(
        g.band.bottom - g.band.top + 1e-9,
      );
      for (const meal of MEAL_STOPS) {
        const b = box[meal];
        expect(spanWidth(b), `${meal} at ${width}`).toBeGreaterThanOrEqual(
          mealWordWidth(WORDS[meal], cap) - 1e-9,
        );
        expect(b.left, `${meal} at ${width}`).toBeGreaterThanOrEqual(MEAL_WORD.pad - 1e-9);
        expect(b.right, `${meal} at ${width}`).toBeLessThanOrEqual(g.width - MEAL_WORD.pad + 1e-9);
      }
    }
    // the ceiling IS the chrome cap every other capped role stops at (Text.tsx)
    expect(read('Text.tsx')).toContain(`export const CHROME_FONT_CAP = ${MEAL_WORD.ceiling};`);
    // bold, at the bottle's and the bath's size, and drawn at exactly the size the strip is
    // measured for — a Text left at its role's own 15 would outgrow the strip at 1.3× — on the
    // face's own line, which is what `MEAL_WORD.line` bounds: no line height is set anywhere
    expect(MEAL_WORD.size).toBe(PICTURE_WORD.size);
    expect(flat).toContain('variant="bodyStrong"');
    expect(flat).toContain('style={{ fontSize: MEAL_WORD.size }}');
    expect(flat).not.toMatch(/lineHeight/);
  });

  it('writes each word under its own sun, moved in only as far as the picture’s side makes it', () => {
    for (const width of WIDTHS) {
      const g = mealSkyGeometry(width);
      const { box } = mealWordLayout(g, WORDS);
      for (const meal of MEAL_STOPS) {
        const b = box[meal];
        const center = (b.left + b.right) / 2;
        const sun = g.sun[meal].x;
        // either centered under the sun, or pressed against the pad on the sun's own side
        const pressed = b.left <= MEAL_WORD.pad + 1e-9 || b.right >= g.width - MEAL_WORD.pad - 1e-9;
        if (!pressed) expect(center, `${meal} at ${width}`).toBeCloseTo(sun, 9);
        else
          expect(Math.abs(center - sun), `${meal} at ${width}`).toBeLessThan(
            spanWidth(b) / 2 + g.sunR,
          );
      }
    }
  });

  it('bounds the four words by what the shipped face measures, with room to spare', () => {
    // Hanken Grotesk Bold, read out of the app's own TTF: em widths at 1000 units
    const measured: Record<Meal, number> = {
      BREAKFAST: 4.391,
      LUNCH: 2.718,
      SNACK: 2.767,
      DINNER: 3.014,
    };
    for (const meal of MEAL_STOPS)
      expect(mealWordWidth(WORDS[meal]), meal).toBeGreaterThan(measured[meal] * MEAL_WORD.size);
    // and its line, the box a Text with no line height draws: the face's ascender 1000 and
    // descender 303 in its 1000 units, no line gap (hhea and OS/2 agree)
    expect(MEAL_WORD.line).toBeGreaterThanOrEqual(1.303);
  });
});

describe('the move', () => {
  it('takes the theme toggle’s 560 ms for a meal, a little longer — never double — for more', () => {
    const plan = (from: Meal, to: Meal) => planMealMove(null, from, to, 0, false);
    expect(plan('BREAKFAST', 'LUNCH').duration).toBe(THEME_SKY_MS);
    expect(plan('BREAKFAST', 'DINNER').duration).toBe(moveMs(3));
    expect(plan('BREAKFAST', 'DINNER').duration).toBeLessThan(1.5 * THEME_SKY_MS);
  });

  it('settles past lunch and snack, and lands at breakfast and dinner, the ends of the arc', () => {
    expect(planMealMove(null, 'BREAKFAST', 'LUNCH', 0, false).ease).toBe('settle');
    expect(planMealMove(null, 'DINNER', 'SNACK', 0, false).ease).toBe('settle');
    expect(planMealMove(null, 'LUNCH', 'BREAKFAST', 0, false).ease).toBe('land');
    expect(planMealMove(null, 'LUNCH', 'DINNER', 0, false).ease).toBe('land');
    // landing never carries past: a sun at dinner does not dip under the horizon and come back
    expect(peakOf(SKY_EASE.land)).toBeLessThanOrEqual(1);
    // and the carry past an inner meal stays on the arc between its neighbors
    const carry = (peakOf(SKY_EASE.settle) - 1) * 3;
    expect(carry).toBeLessThan(0.5);
  });

  it('sends the sun to the new meal and swaps exactly two words', () => {
    for (const from of MEAL_STOPS)
      for (const to of MEAL_STOPS.filter(m => m !== from)) {
        const p = planMealMove(null, from, to, 0, false);
        expect(p.animate).toBe(true);
        expect(p.from).toBe(mealIndex(from));
        expect(p.pos).toBe(mealIndex(to));
        for (const meal of MEAL_STOPS)
          expect(p.words[meal], `${from} → ${to}`).toBe(meal === to ? 1 : 0);
      }
  });

  it('turns round mid-glide from where the sun is estimated to be, in less than a fresh move', () => {
    const m: MealMotion = {
      from: 0,
      to: 'DINNER',
      startedAt: 1000,
      duration: moveMs(3),
      ease: 'land',
    };
    const quarter = 1000 + m.duration / 4;
    expect(sunAt(m, 1000)).toBe(0);
    expect(sunAt(m, 1000 + m.duration)).toBeCloseTo(3, 9);
    expect(sunAt(m, quarter)).toBeCloseTo(3 * easeAt(SKY_EASE.land, 0.25), 9);
    // a quarter of the way to dinner and turned round: back to breakfast from there
    const back = planMealMove(m, 'DINNER', 'BREAKFAST', quarter, false);
    expect(back.from).toBeCloseTo(sunAt(m, quarter), 9);
    expect(back.duration).toBe(moveMs(back.from));
    expect(back.duration).toBeLessThan(
      planMealMove(null, 'DINNER', 'BREAKFAST', 0, false).duration,
    );
  });
});

/**
 * THE PICTURE, SIMULATED. The component starts one timing for the sun and one per word on every
 * move, each from wherever it is to where the plan sends it, and draws the layers through the
 * frames. This does the same on a clock, and reads what reaches the screen.
 */
interface Values {
  pos: number;
  words: Record<Meal, number>;
}
function simulate(start: Meal, taps: readonly (readonly [number, Meal])[], still = false) {
  let values: Values = {
    pos: mealIndex(start),
    words: { BREAKFAST: 0, LUNCH: 0, SNACK: 0, DINNER: 0, [start]: 1 },
  };
  let run: { at: number; plan: MealPlan; start: Values } | null = null;
  let motion: MealMotion | null = null;
  let at: Meal = start;
  const frames: { t: number; v: Values }[] = [];
  const end = (taps[taps.length - 1]?.[0] ?? 0) + 1200;
  let next = 0;
  for (let t = 0; t <= end; t += 1) {
    if (run) {
      const r = run;
      const x = r.plan.duration <= 0 ? 1 : (t - r.at) / r.plan.duration;
      const e = easeAt(SKY_EASE[r.plan.ease], x);
      const land = easeAt(SKY_EASE.land, x);
      const word = (m: Meal) => r.start.words[m] + (r.plan.words[m] - r.start.words[m]) * land;
      values = {
        pos: r.start.pos + (r.plan.pos - r.start.pos) * e,
        words: {
          BREAKFAST: word('BREAKFAST'),
          LUNCH: word('LUNCH'),
          SNACK: word('SNACK'),
          DINNER: word('DINNER'),
        },
      };
    }
    while (next < taps.length && (taps[next]?.[0] ?? Infinity) <= t) {
      const [, to] = taps[next] ?? [0, 'BREAKFAST'];
      next += 1;
      if (to === at && (!motion || t >= motion.startedAt + motion.duration)) continue;
      const plan = planMealMove(motion, at, to, t, still);
      if (!plan.animate) {
        values = { pos: plan.pos, words: { ...plan.words } };
        run = null;
        motion = null;
      } else {
        expect(plan.from).toBeCloseTo(values.pos, 6);
        run = { at: t, plan, start: values };
        motion = { from: plan.from, to, startedAt: t, duration: plan.duration, ease: plan.ease };
      }
      at = to;
    }
    frames.push({ t, v: values });
  }
  return { frames, last: frames[frames.length - 1] };
}

const g324 = mealSkyGeometry(324);
const f324 = mealSkyFrames(g324);
const skiesAt = (p: number) =>
  mealSkyWeights(sample(f324.sky.LUNCH, p), sample(f324.sky.SNACK, p), sample(f324.sky.DINNER, p));

describe('the picture on the way', () => {
  it('is the day in time-lapse: breakfast to dinner passes through noon’s sky and the afternoon’s', () => {
    const { frames, last } = simulate('BREAKFAST', [[10, 'DINNER']]);
    expect(frames.some(fr => skiesAt(fr.v.pos).LUNCH > 0.99)).toBe(true);
    expect(frames.some(fr => skiesAt(fr.v.pos).SNACK > 0.99)).toBe(true);
    expect(skiesAt(last?.v.pos ?? 0).DINNER).toBeCloseTo(1, 9);
  });

  it('shares the sky between the two times of day either side of the sun, and nothing else', () => {
    for (let p = 0; p <= 3; p += 0.01) {
      const w = skiesAt(p);
      const total = MEAL_STOPS.reduce((s, m) => s + w[m], 0);
      expect(total, `at ${p}`).toBeCloseTo(1, 9);
      const lo = Math.floor(p);
      MEAL_STOPS.forEach((m, i) => {
        if (i !== lo && i !== lo + 1) expect(w[m], `${m} at ${p}`).toBe(0);
      });
    }
    // and at each meal, that meal's sky alone
    MEAL_STOPS.forEach((m, i) => expect(skiesAt(i)[m]).toBe(1));
  });

  it('never writes a meal the sun only passes: two words cross-fade and the others stay unwritten', () => {
    for (const from of MEAL_STOPS)
      for (const to of MEAL_STOPS.filter(m => m !== from)) {
        const { frames, last } = simulate(from, [[10, to]]);
        for (const fr of frames)
          for (const m of MEAL_STOPS.filter(x => x !== from && x !== to))
            expect(sample(f324.word.opacity, fr.v.words[m]), `${m} on ${from} → ${to}`).toBe(0);
        expect(sample(f324.word.opacity, last?.v.words[to] ?? 0)).toBeCloseTo(1, 9);
        expect(last?.v.pos).toBeCloseTo(mealIndex(to), 6);
      }
  });

  it('turns round mid-glide without a jump, whatever the taps, and ends on the last one', () => {
    let seed = 11;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let walk = 0; walk < 24; walk += 1) {
      const taps: [number, Meal][] = [];
      let t = 0;
      for (let i = 0; i < 6; i += 1) {
        t += Math.round(20 + rnd() * 900);
        taps.push([t, MEAL_STOPS[Math.floor(rnd() * 4)] ?? 'LUNCH']);
      }
      const { frames, last } = simulate(MEAL_STOPS[walk % 4] ?? 'LUNCH', taps);
      let step = 0;
      for (let i = 1; i < frames.length; i += 1) {
        const [a, b] = [frames[i - 1], frames[i]];
        if (!a || !b) continue;
        step = Math.max(step, Math.abs(b.v.pos - a.v.pos));
        for (const m of MEAL_STOPS) step = Math.max(step, Math.abs(b.v.words[m] - a.v.words[m]));
      }
      expect(step, `walk ${walk}`).toBeLessThan(0.03);
      const final = taps[taps.length - 1]?.[1] ?? 'LUNCH';
      expect(last?.v.pos, `walk ${walk}`).toBeCloseTo(mealIndex(final), 6);
    }
  });
});

describe('reduce motion, and the amber night', () => {
  it('is still under reduce motion or in the night theme, and moves otherwise', () => {
    expect(mealSkyStill(true, 'light')).toBe(true);
    expect(mealSkyStill(true, 'dark')).toBe(true);
    expect(mealSkyStill(false, 'night')).toBe(true);
    expect(mealSkyStill(false, 'light')).toBe(false);
    expect(mealSkyStill(false, 'dark')).toBe(false);
  });

  it('sets where the move ends and animates nothing: the sun at its meal, its word written', () => {
    for (const from of MEAL_STOPS)
      for (const to of MEAL_STOPS.filter(m => m !== from)) {
        const plan = planMealMove(null, from, to, 0, true);
        expect(plan.animate).toBe(false);
        expect(plan.duration).toBe(0);
        const { frames } = simulate(from, [[10, to]], true);
        // from the frame of the tap, the picture IS the new meal — nothing in between
        for (const fr of frames.filter(x => x.t >= 10)) {
          expect(fr.v.pos).toBe(mealIndex(to));
          expect(sample(f324.word.opacity, fr.v.words[to])).toBe(1);
        }
      }
  });

  it('reads both from the theme, and sets the values — even over a glide already in flight', () => {
    expect(flat).toContain('const still = mealSkyStill(t.reduceMotion, t.theme);');
    expect(flat).toMatch(/if \(!plan\.animate\) \{[^}]*pos\.setValue\(plan\.pos\)/);
    expect(flat).toContain('[pos, word, value, still]');
  });

  it('draws no halo, no stars and no second sky in the amber night: only what is information', () => {
    expect(flat).toContain(
      '{sky.scenery ? ( <Animated.View style={[StyleSheet.absoluteFill, anim.halo]}>',
    );
    expect(flat).toContain('{sky.scenery ? g.stars.map(');
    expect(flat).toContain('{sky.scenery ? LATER.map(');
  });
});

describe('the frames', () => {
  const f = f324;
  const EVERY: readonly [string, Frame][] = [
    ['sunX', f.sunX],
    ['sunY', f.sunY],
    ['halo', f.halo],
    ['haloScale', f.haloScale],
    ['sky lunch', f.sky.LUNCH],
    ['sky snack', f.sky.SNACK],
    ['sky dinner', f.sky.DINNER],
    ['word opacity', f.word.opacity],
    ['word rise', f.word.rise],
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
      expect(fr.extrapolate, name).toBe('clamp');
    }
  });

  it('rests the sun exactly at each meal’s place', () => {
    MEAL_STOPS.forEach((meal, i) => {
      expect(sample(f.sunX, i)).toBeCloseTo(g324.sun[meal].x, 1);
      expect(sample(f.sunY, i)).toBeCloseTo(g324.sun[meal].y, 1);
    });
  });

  it('blooms the light round the sun at every meal and draws it in between', () => {
    MEAL_STOPS.forEach((_, i) => expect(sample(f.halo, i)).toBeGreaterThanOrEqual(0.85));
    for (const mid of [0.5, 1.5, 2.5]) expect(sample(f.halo, mid)).toBeLessThan(0.6);
    MEAL_STOPS.forEach((_, i) => expect(sample(f.haloScale, i)).toBe(1));
  });

  it('brings the stars out only as the sun goes down to dinner, one after another', () => {
    const starts = g324.stars.map(s => s.at);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    for (const s of f.stars) {
      expect(sample(s.opacity, 2)).toBe(0);
      expect(sample(s.opacity, 3)).toBe(1);
      expect(sample(s.scale, 3)).toBe(1);
    }
  });

  it('writes a word whole at rest and not at all when it is not chosen, rising into place', () => {
    expect(sample(f.word.opacity, 1)).toBe(1);
    expect(sample(f.word.opacity, 0)).toBe(0);
    expect(sample(f.word.rise, 1)).toBe(0);
    expect(sample(f.word.rise, 0)).toBeGreaterThan(0);
  });
});

describe('the component (tripwires over MealSkyToggle.tsx)', () => {
  it('is one radio group with a name, and four radios that each say what they are', () => {
    expect(flat).toContain('accessibilityRole="radiogroup"');
    expect(flat).toContain('accessibilityLabel={label}');
    expect(flat).toContain('accessibilityRole="radio"');
    expect(flat).toContain('accessibilityLabel={labels[meal]}');
    expect(flat).toContain(
      'accessibilityState={{ checked: meal === value, selected: meal === value, disabled }}',
    );
    expect(component.split('<Pressable')).toHaveLength(2);
    expect(flat).toContain('{MEAL_STOPS.map(meal => ( <Pressable');
  });

  it('names each meal for a flow: <testID>.BREAKFAST, .LUNCH, .SNACK and .DINNER', () => {
    expect(flat).toContain('testID: `${testID}.${meal}`');
  });

  it('ignores a tap on the chosen meal, and is felt as a choice on any other', () => {
    // the segmented control's rule: a meal read off the clock stays the clock's until another is
    // picked, so re-picking it must not quietly stop it following the time row — and it is felt
    // as the pills were (`feedback/choice.ts`): a tap for a new meal, nothing for the chosen one
    expect(flat).toContain(
      "const current = meal === value; feelChoice({ locked: false, current, kind: 'tap' }); if (!current) onChange(meal);",
    );
    expect(flat).toContain('onPress={() => choose(meal)}');
    expect(component).toContain("import { feelChoice } from '../feedback/choice';");
    // once, in the press handler — never again when the value arrives back and the sun glides
    expect(flat.split('feelChoice(')).toHaveLength(2);
    expect(flat).not.toContain('haptic(');
  });

  it('hides the picture from touch and from assistive technology', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
  });

  it('stacks the skies in the order `mealSkyWeights` reads them, the sun under the land, the words on top', () => {
    const day = component.indexOf('<SkyLayer id={`${id}-sky-BREAKFAST`}');
    const later = component.indexOf('<SkyLayer id={`${id}-sky-${meal}`}');
    const sun = component.indexOf('anim.sun');
    const land = component.indexOf('<GroundLayer scene={sky.scenes.BREAKFAST}');
    const word = component.indexOf('anim.written[i]');
    expect(day).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(day);
    expect(sun).toBeGreaterThan(later);
    expect(land).toBeGreaterThan(sun);
    expect(word).toBeGreaterThan(land);
    expect(component).toContain("const LATER = ['LUNCH', 'SNACK', 'DINNER'] as const;");
  });

  it('runs every frame on the native driver: opacity and transforms only', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    const fed = [...flat.matchAll(/(\w+): num\(/g)].map(m => m[1]);
    expect(fed.length).toBeGreaterThan(0);
    for (const prop of fed)
      expect(['opacity', 'translateX', 'translateY', 'scale'], prop).toContain(prop);
    expect(flat).toContain('Easing.bezier(...SKY_EASE');
  });

  it('asks for nothing Expo Go does not carry: React Native, react-native-svg, and its own files', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg', '@nibblecue/core'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
    // and from core, only the type
    expect(component).toContain("import type { Meal } from '@nibblecue/core';");
    expect(component).not.toContain('reanimated');
  });

  it('writes no color and no word: the picture’s colors, the theme’s rim, the caller’s labels', () => {
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
      expect(src).not.toMatch(/['"`](Breakfast|Lunch|Snack|Dinner|Meal)['"`]/);
    }
    expect(flat).toContain('borderColor: t.color.line2');
    expect(flat).toContain('maxFontSizeMultiplier={words.cap}');
    expect(flat).toContain('numberOfLines={1}');
    expect(flat).toContain('adjustsFontSizeToFit');
    expect(flat).toContain('const sky = mealSkyFor(t.theme);');
  });

  it('is exported with the design system’s other controls, and its arithmetic is not', () => {
    expect(read('core.ts')).toContain("export * from './MealSkyToggle';");
    expect(read('core.ts')).not.toContain("'./mealSkyToggle'");
  });
});
