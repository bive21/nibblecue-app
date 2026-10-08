/**
 * A MEAL'S LITTLE WINDOW, MEASURED (`mealWindow.ts`, the solids rhythm's rows, 2026-09-28). The
 * picture has three claims to keep: the sun stands where the row's time is in the household's day,
 * a meal that is on always shows its sun and one that is off never does, and nothing moves where the
 * app is asked to keep still. And one it must never break: the sun can be told from its sky.
 */
import { MEALS } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, contrastRatio } from '../theme/contrast';
import { MEAL_SKY, MEAL_SKY_AMBER, type MealSky } from '../theme/mealSky';
import {
  dayFraction,
  hillPath,
  hillTop,
  MEAL_ROW_POP,
  MEAL_WINDOW,
  MEAL_WINDOW_GLIDE_MS,
  MEAL_WINDOW_STARS,
  mealWindowFrames,
  mealWindowStill,
  planSink,
  planSunGlide,
  SUN_SINK,
  sunPoint,
} from './mealWindow';

const here = dirname(fileURLToPath(import.meta.url));
const withoutComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const DAY = { wake: '07:00', bed: '19:30' };
const at = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const steps = (n: number): number[] => Array.from({ length: n + 1 }, (_, i) => i / n);

describe('the sun stands where the row’s time is in the household’s day', () => {
  it('rises at waking, is highest half way to bed, and sets at bed time', () => {
    expect(dayFraction(at('07:00'), DAY)).toEqual({ u: 0, up: true });
    expect(dayFraction(at('19:30'), DAY)).toEqual({ u: 1, up: true });
    expect(dayFraction(at('13:15'), DAY).u).toBeCloseTo(0.5, 5);
    expect(sunPoint(0).y).toBe(MEAL_WINDOW.horizon);
    expect(sunPoint(1).y).toBe(MEAL_WINDOW.horizon);
    expect(sunPoint(0.5).y).toBeCloseTo(MEAL_WINDOW.apex, 5);
  });

  it('stands a breakfast low and a lunch high, and a dinner lower than the afternoon snack', () => {
    const height = (hhmm: string) => MEAL_WINDOW.horizon - sunPoint(dayFraction(at(hhmm), DAY).u).y;
    expect(height('07:30')).toBeLessThan(height('11:30'));
    expect(height('17:30')).toBeLessThan(height('15:00'));
    // and it moves left to right through the day
    expect(sunPoint(dayFraction(at('07:30'), DAY).u).x).toBeLessThan(
      sunPoint(dayFraction(at('17:30'), DAY).u).x,
    );
  });

  it('waits on the horizon at the nearer end for a time outside the day, never lower', () => {
    expect(dayFraction(at('06:00'), DAY)).toEqual({ u: 0, up: false });
    expect(dayFraction(at('21:00'), DAY)).toEqual({ u: 1, up: false });
    // a day that runs past midnight
    const owl = { wake: '11:00', bed: '03:00' };
    expect(dayFraction(at('01:00'), owl).up).toBe(true);
    expect(dayFraction(at('04:00'), owl)).toEqual({ u: 1, up: false });
    expect(dayFraction(at('10:00'), owl)).toEqual({ u: 0, up: false });
    // a day with no night runs round the clock from its wake
    expect(dayFraction(at('19:00'), { wake: '07:00', bed: '07:00' }).u).toBeCloseTo(0.5, 5);
  });

  it('keeps the whole sun inside its window at every point of its day', () => {
    const r = MEAL_WINDOW.sun;
    for (const u of steps(200)) {
      const p = sunPoint(u);
      expect(p.x - r, `u ${u}`).toBeGreaterThanOrEqual(0);
      expect(p.x + r, `u ${u}`).toBeLessThanOrEqual(MEAL_WINDOW.size);
      expect(p.y - r, `u ${u}`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('on shows its sun, off never does', () => {
  it('leaves part of an ON sun above the land at every height, the horizon and the hill both', () => {
    const r = MEAL_WINDOW.sun;
    for (const u of steps(200)) {
      const p = sunPoint(u);
      expect(p.y - r, `u ${u}`).toBeLessThan(Math.min(MEAL_WINDOW.horizon, hillTop(p.x)));
    }
  });

  it('drops an OFF sun wholly under the horizon from any height', () => {
    for (const u of steps(200))
      expect(sunPoint(u).y + SUN_SINK - MEAL_WINDOW.sun, `u ${u}`).toBeGreaterThan(
        MEAL_WINDOW.horizon,
      );
  });

  it('dims an off window toward the table, and leaves an on one untouched', () => {
    const f = mealWindowFrames();
    expect(f.veil.outputRange[0]).toBe(0);
    expect(f.veil.outputRange.at(-1)).toBe(MEAL_WINDOW.veil);
    expect(f.sink.outputRange).toEqual([0, SUN_SINK]);
    expect(MEAL_WINDOW.veil).toBeGreaterThan(0.3);
    expect(MEAL_WINDOW.veil).toBeLessThan(1);
  });

  it('draws a hill that rises from the horizon and peaks at its rise', () => {
    expect(hillPath()).toMatch(/^M[\d.]+ 28Q[\d.]+ 20 [\d.]+ 28Z$/);
    const peak = Math.min(...steps(400).map(k => hillTop(k * MEAL_WINDOW.size)));
    expect(peak).toBeCloseTo(MEAL_WINDOW.horizon - 4, 1);
    expect(hillTop(0)).toBe(MEAL_WINDOW.horizon);
  });
});

describe('the frames are the arc, sampled', () => {
  it('samples the arc evenly from rising to setting', () => {
    const f = mealWindowFrames();
    expect(f.sunX.inputRange[0]).toBe(0);
    expect(f.sunX.inputRange.at(-1)).toBe(1);
    for (let i = 1; i < f.sunX.inputRange.length; i++)
      expect(f.sunX.inputRange[i]).toBeGreaterThan(f.sunX.inputRange[i - 1] ?? 0);
    f.sunX.inputRange.forEach((u, i) => {
      expect(f.sunX.outputRange[i]).toBeCloseTo(sunPoint(u).x, 1);
      expect(f.sunY.outputRange[i]).toBeCloseTo(sunPoint(u).y, 1);
    });
    expect(f.sunX.extrapolate).toBe('clamp');
  });
});

describe('the moves, and the stillness', () => {
  it('glides further for longer, within its bounds, and not at all to where it already is', () => {
    const short = planSunGlide(0.3, 0.35, false);
    const long = planSunGlide(0, 1, false);
    expect(short.animate && long.animate).toBe(true);
    expect(short.duration).toBeGreaterThanOrEqual(MEAL_WINDOW_GLIDE_MS.min);
    expect(long.duration).toBe(MEAL_WINDOW_GLIDE_MS.max);
    expect(long.duration).toBeGreaterThan(short.duration);
    expect(planSunGlide(0.4, 0.4, false).animate).toBe(false);
  });

  it('holds still under reduce motion, Calm motion and the amber Night, with every end state set', () => {
    expect(mealWindowStill(true, 'light')).toBe(true);
    expect(mealWindowStill(false, 'night')).toBe(true);
    expect(mealWindowStill(false, 'light')).toBe(false);
    expect(mealWindowStill(false, 'dark')).toBe(false);
    expect(planSunGlide(0, 1, true)).toEqual({ animate: false, duration: 0 });
    expect(planSink(false, true)).toEqual({ to: 1, animate: false });
    expect(planSink(true, false)).toEqual({ to: 0, animate: true });
  });

  it('pops an added row in from small and unseen to exactly itself, past full on the way', () => {
    expect(MEAL_ROW_POP.scale.outputRange[0]).toBeLessThan(1);
    expect(MEAL_ROW_POP.opacity.outputRange[0]).toBe(0);
    expect(MEAL_ROW_POP.scale.outputRange.at(-1)).toBe(1);
    expect(MEAL_ROW_POP.opacity.outputRange.at(-1)).toBe(1);
    expect(Math.max(...MEAL_ROW_POP.scale.outputRange)).toBeGreaterThan(1);
    // an opacity never past fully on
    expect(Math.max(...MEAL_ROW_POP.opacity.outputRange)).toBe(1);
    expect(MEAL_ROW_POP.ms).toBeLessThanOrEqual(400);
  });
});

describe('the sun can be told from its sky, in every window', () => {
  const SETS: readonly [string, MealSky][] = [
    ['light and dark', MEAL_SKY],
    ['amber night', MEAL_SKY_AMBER],
  ];
  // WCAG 1.4.11: the sun is the one part of the picture that carries anything (the time of day)
  it.each(SETS)(
    '%s: both of the sun’s colors clear 3:1 at every stop of every meal’s sky',
    (_, set) => {
      for (const meal of MEALS)
        for (const ink of set.sun)
          for (const stop of set.scenes[meal].sky)
            expect(contrastRatio(ink, stop), `${meal} ${ink} on ${stop}`).toBeGreaterThanOrEqual(
              AA_GRAPHIC,
            );
    },
  );

  it('brings out dinner’s two stars at 3:1 on its dusk, and keeps them in the dusk’s upper left', () => {
    for (const stop of MEAL_SKY.scenes.DINNER.sky)
      expect(contrastRatio(MEAL_SKY.star, stop)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    for (const s of MEAL_WINDOW_STARS) {
      expect(s.x).toBeLessThan(MEAL_WINDOW.size / 2);
      expect(s.y).toBeLessThan(MEAL_WINDOW.apex);
    }
  });
});

describe('the component, over its source', () => {
  const src = withoutComments(readFileSync(join(here, 'MealWindow.tsx'), 'utf8'));

  it('writes no word on the sky, so there is no text whose contrast a sky could spoil', () => {
    expect(src).not.toMatch(/<(AppText|Text|Numeric)\b/);
  });

  it('is decoration: no touch, and hidden from assistive technology', () => {
    expect(src).toContain('pointerEvents="none"');
    expect(src).toContain('importantForAccessibility="no-hide-descendants"');
    expect(src).toContain('accessibilityElementsHidden');
  });

  it('moves transforms and opacity only, every one on the native driver, and never loops', () => {
    expect(src).not.toContain('useNativeDriver: false');
    expect((src.match(/useNativeDriver: true/g) ?? []).length).toBe(3);
    expect(src).not.toContain('Animated.loop(');
    // the one rule for stillness, read once per piece
    expect((src.match(/mealWindowStill\(t\.reduceMotion, t\.theme\)/g) ?? []).length).toBe(2);
  });

  it('paints the solids sheet’s own skies for the theme in view', () => {
    expect(src).toContain('mealSkyFor(t.theme)');
    expect(src).toContain('sky.scenes[meal]');
  });
});
