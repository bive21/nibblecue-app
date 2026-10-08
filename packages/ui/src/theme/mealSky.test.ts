/**
 * THE MEAL SKY, MEASURED (`mealSky.ts`; the owner, 2026-09-25). Four pretty skies can still be a
 * control nobody can read, and the eye is the instrument this repository has learned not to trust
 * for that (docs/PREFLIGHT.md): so the word on its ground, the sun on its sky and the marks on
 * every sky they can sit on are all numbers here.
 */
import { MEALS, type Meal } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from './contrast';
import { MEAL_SKY, MEAL_SKY_AMBER, mealSkyFor, type MealSky } from './mealSky';
import { DAY_NIGHT_SKY, THEME_SKY } from './sky';
import { themes } from './theme';

/** The worst contrast between any of `inks` and any of `grounds`. */
const worst = (inks: readonly string[], grounds: readonly string[]): number =>
  Math.min(...inks.flatMap(ink => grounds.map(g => contrastRatio(ink, g))));

/** A color with alpha as it reaches the screen over `ground`. */
const landed = (ink: string, ground: string): string => composite(ground, ink);

const SETS: readonly [string, MealSky][] = [
  ['light and dark', MEAL_SKY],
  ['amber night', MEAL_SKY_AMBER],
];

describe('the chosen word is text, and reads as text', () => {
  it.each(SETS)('%s: every word clears 4.5:1 on the ground it is written on', (_, set) => {
    for (const meal of MEALS) {
      const scene = set.scenes[meal];
      // opaque: a word with alpha would have to be measured the way the marks are
      expect(parseColor(scene.word).a, meal).toBe(1);
      expect(contrastRatio(scene.word, scene.ground), meal).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('writes the plain set’s words at AAA: white on land lit by day or in shadow', () => {
    for (const meal of MEALS)
      expect(
        contrastRatio(MEAL_SKY.scenes[meal].word, MEAL_SKY.scenes[meal].ground),
      ).toBeGreaterThanOrEqual(7);
  });

  it('lifts the far hill off the land in front of it, so the two read as distance', () => {
    for (const meal of MEALS) {
      const s = MEAL_SKY.scenes[meal];
      expect(contrastRatio(s.hill, '#000000'), meal).toBeGreaterThan(
        contrastRatio(s.ground, '#000000'),
      );
    }
  });
});

describe('the sun can be told from its sky', () => {
  // WCAG 1.4.11: the part of a control that shows its state clears 3:1 against what is next to it
  it.each(SETS)('%s: both of the sun’s colors, at every stop of its own sky', (_, set) => {
    for (const meal of MEALS)
      expect(worst(set.sun, set.scenes[meal].sky), meal).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('keeps every plain sky deep — the one rule that lets a pale sun clear them all', () => {
    // the warmth of dawn and dusk is in the horizon's hue, never in its lightness: a pale peach
    // horizon would measure under 2:1 against the sun
    for (const meal of MEALS)
      for (const stop of MEAL_SKY.scenes[meal].sky)
        expect(contrastRatio(stop, '#000000'), `${meal} ${stop}`).toBeLessThan(5);
  });
});

describe('the other meals’ marks can be seen on every sky', () => {
  it.each(SETS)('%s: a station clears 3:1 as it lands on every stop of every sky', (_, set) => {
    // the stations stay where they are while the sky changes under them, so each is measured over
    // all four pictures, alpha and all — never as the bare color
    for (const meal of MEALS)
      for (const ground of set.scenes[meal].sky)
        expect(
          contrastRatio(landed(set.station, ground), ground),
          `${meal} over ${ground}`,
        ).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('brings out dusk stars that clear 3:1 on the dusk sky, as setup’s do on theirs', () => {
    expect(worst([MEAL_SKY.star], MEAL_SKY.scenes.DINNER.sky)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('keeps the halo faint and the path’s dashes quieter than the marks', () => {
    expect(parseColor(MEAL_SKY.halo).a).toBeLessThanOrEqual(0.15);
    expect(parseColor(MEAL_SKY.path).a).toBeLessThan(parseColor(MEAL_SKY.station).a);
  });
});

describe('four pictures of the day', () => {
  const hue = (c: string) => {
    const { r, g, b } = parseColor(c);
    return { warm: r > b, r, g, b };
  };

  it('warms the horizon at dawn, the afternoon and dusk, and keeps noon blue', () => {
    const horizon = (m: Meal) => MEAL_SKY.scenes[m].sky[MEAL_SKY.scenes[m].sky.length - 1] ?? '';
    expect(hue(horizon('BREAKFAST')).warm).toBe(true);
    expect(hue(horizon('SNACK')).warm).toBe(true);
    expect(hue(horizon('DINNER')).warm).toBe(true);
    expect(hue(horizon('LUNCH')).warm).toBe(false);
    // and overhead it is blue at every meal: the sky is still the sky
    for (const meal of MEALS)
      expect(hue(MEAL_SKY.scenes[meal].sky[0] ?? '').warm, meal).toBe(false);
  });

  it('draws dusk darker overhead than noon, so the day visibly turns', () => {
    const top = (m: Meal) => MEAL_SKY.scenes[m].sky[0] ?? '';
    expect(contrastRatio(top('DINNER'), '#FFFFFF')).toBeGreaterThan(
      contrastRatio(top('LUNCH'), '#FFFFFF'),
    );
  });
});

describe('one picture language with the theme toggle', () => {
  it('shines setup’s own pale-gold sun, and its faint halo', () => {
    expect(MEAL_SKY.sun).toBe(DAY_NIGHT_SKY.sun);
    expect(MEAL_SKY.halo).toBe(DAY_NIGHT_SKY.halo);
  });

  it('draws the same four skies in light and in dark, and the amber set only in night', () => {
    expect(mealSkyFor('light')).toBe(MEAL_SKY);
    expect(mealSkyFor('dark')).toBe(MEAL_SKY);
    expect(mealSkyFor('night')).toBe(MEAL_SKY_AMBER);
    expect(MEAL_SKY.scenery).toBe(true);
    expect(MEAL_SKY_AMBER.scenery).toBe(false);
  });

  it('shines the amber sun the theme toggle does in the amber theme', () => {
    expect(MEAL_SKY_AMBER.sun).toEqual([themes.night.accent2, themes.night.accent]);
    expect(THEME_SKY.light.sun).toBe(MEAL_SKY.sun);
  });
});

describe('amber night: the night palette and nothing else', () => {
  const own = new Set(Object.values(themes.night).map(c => c.toLowerCase()));
  const warm = (c: string): boolean => {
    const { r, b } = parseColor(c);
    return b <= r;
  };

  it('builds every color from the night palette’s roles, and puts no blue anywhere', () => {
    const set = MEAL_SKY_AMBER;
    const colors = [
      ...MEALS.flatMap(m => [
        ...set.scenes[m].sky,
        set.scenes[m].ground,
        set.scenes[m].hill,
        set.scenes[m].word,
      ]),
      ...set.sun,
      set.path,
      set.station,
      set.star,
    ];
    for (const c of colors) {
      expect(own.has(c.toLowerCase()), c).toBe(true);
      expect(warm(c), c).toBe(true);
    }
  });

  it('draws one sky for all four meals, and no light of any kind', () => {
    const scenes = MEALS.map(m => MEAL_SKY_AMBER.scenes[m]);
    for (const s of scenes) expect(s).toBe(scenes[0]);
    expect(parseColor(MEAL_SKY_AMBER.halo).a).toBe(0);
  });
});
