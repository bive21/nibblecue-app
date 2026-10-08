/**
 * THE DAY/NIGHT SWITCH'S SKY, MEASURED (`sky.ts`; the owner, 2026-09-25). A pretty sky can still
 * be a switch nobody can read, and the eye is the instrument this repository has learned not to
 * trust for that (docs/PREFLIGHT.md): so the knob against its sky, the scenery against the sky it
 * sits on, and the pill against the page are all numbers here.
 */
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from './contrast';
import {
  DAY_NIGHT_SKY,
  DAY_NIGHT_SKY_AMBER,
  dayNightSkyFor,
  THEME_SKY,
  THEME_SKY_AMBER,
  themeSkyFor,
  type DayNightSky,
  type ThemeSky,
} from './sky';
import { themes } from './theme';

/** The worst contrast between any of `inks` and any of `grounds`. */
const worst = (inks: readonly string[], grounds: readonly string[]): number =>
  Math.min(...inks.flatMap(ink => grounds.map(g => contrastRatio(ink, g))));

const BOTH: readonly [string, DayNightSky][] = [
  ['light and dark', DAY_NIGHT_SKY],
  ['amber night', DAY_NIGHT_SKY_AMBER],
];

describe('the knob can be told from its sky', () => {
  // WCAG 1.4.11: the part of a control that shows its state clears 3:1 against what is next to it
  it.each(BOTH)('%s: the sun on the day sky, at every stop of both gradients', (_, sky) => {
    expect(worst(sky.sun, sky.daySky)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it.each(BOTH)('%s: the moon on the night sky', (_, sky) => {
    expect(worst([sky.moon], sky.nightSky)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('and the sun is a pale gold, because a saturated orange one fails the floor on this sky', () => {
    // the reason the sun is not the orange of most sun icons: on the same blue it measures ~2.6:1
    expect(worst(['#FFB02E'], DAY_NIGHT_SKY.daySky)).toBeLessThan(AA_GRAPHIC);
  });
});

describe('the scenery reads on the sky it sits on', () => {
  it('stars on the night sky, and the cloud on the day sky', () => {
    expect(worst([DAY_NIGHT_SKY.star], DAY_NIGHT_SKY.nightSky)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    expect(worst([DAY_NIGHT_SKY.cloud], DAY_NIGHT_SKY.daySky)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('draws day and night as two skies that differ in lightness, not only in hue', () => {
    // the STATE is the knob's position and face, never the sky (CLAUDE.md §6: nothing by color
    // alone); but on a grayscale screen the two skies should still be told apart at a glance
    expect(worst(DAY_NIGHT_SKY.daySky, DAY_NIGHT_SKY.nightSky)).toBeGreaterThanOrEqual(2);
  });

  it('keeps a crater a shade of the moon, and the halo and shadow faint', () => {
    const crater = contrastRatio(DAY_NIGHT_SKY.crater, DAY_NIGHT_SKY.moon);
    expect(crater).toBeGreaterThan(1.2);
    expect(crater).toBeLessThan(2);
    expect(parseColor(DAY_NIGHT_SKY.halo).a).toBeLessThanOrEqual(0.15);
    expect(parseColor(DAY_NIGHT_SKY.shade).a).toBeLessThanOrEqual(0.5);
  });
});

describe('the pill against the page', () => {
  it('shows the day sky clearly on the ground and the cards of both themes', () => {
    // day is what every parent sees before the first tap — on a dark page too, when the phone is
    for (const page of [
      themes.light.app,
      themes.light.surfaceSolid,
      themes.dark.app,
      themes.dark.surfaceSolid,
    ]) {
      expect(worst(DAY_NIGHT_SKY.daySky, [page]), page).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('leaves the night sky on a dark page to the rim, which is the theme’s own edge', () => {
    // night is only ever shown on a dark page (it IS the dark preview), where indigo on near-black
    // has no edge of its own — so the pill's outline is the theme's `line2`, drawn over the sky
    expect(worst(DAY_NIGHT_SKY.nightSky, [themes.dark.app])).toBeLessThan(1.5);
  });
});

describe('one picture whatever the theme — except the one that keeps a dark room dark', () => {
  it('draws the same sky in light and in dark, so flipping the theme cannot repaint it mid-roll', () => {
    expect(dayNightSkyFor('light')).toBe(DAY_NIGHT_SKY);
    expect(dayNightSkyFor('dark')).toBe(DAY_NIGHT_SKY);
  });

  it('gives the amber theme its own set, from the night palette’s own roles and nothing else', () => {
    const sky = dayNightSkyFor('night');
    expect(sky).toBe(DAY_NIGHT_SKY_AMBER);
    expect(sky.scenery).toBe(false);
    const own = new Set(Object.values(themes.night).map(c => c.toLowerCase()));
    for (const c of [...sky.daySky, ...sky.nightSky, ...sky.sun, sky.moon, sky.crater, sky.star])
      expect(own.has(c.toLowerCase()), c).toBe(true);
  });

  it('puts no blue in the amber theme: every color there is warm', () => {
    // theme.ts usage rule 7: night "drops blue entirely"
    const sky = DAY_NIGHT_SKY_AMBER;
    for (const c of [...sky.daySky, ...sky.nightSky, ...sky.sun, sky.moon, sky.crater, sky.star]) {
      const { r, b } = parseColor(c);
      expect(b, c).toBeLessThanOrEqual(r);
    }
  });
});

/**
 * THE THEME TOGGLE'S THREE PICTURES (`THEME_SKY`, `ThemeSkyToggle`; the owner, 2026-09-25). The
 * same measurements as the switch's, plus the two things this control adds: a WORD written on
 * the sky, which is text and so held to 4.5:1 rather than 3:1, and a GLYPH at each unchosen stop,
 * drawn in a color with its own alpha — so it is measured as it lands, composited over each stop
 * of the sky under it, never as the bare color.
 */
const SETS: readonly [string, ThemeSky][] = [
  ['light and dark', THEME_SKY],
  ['amber night', THEME_SKY_AMBER],
];
const STOPS = ['light', 'night', 'dark'] as const;

/** A color with alpha, as it reaches the screen over each stop of a sky. */
const landed = (ink: string, sky: readonly string[]): string[] =>
  sky.map(ground => composite(ground, ink));

/**
 * What an unchosen stop's glyph is drawn ON since 2026-09-26: its halo, landed on each stop of the
 * sky. A white glyph on a lighter disc is LESS contrast than on the bare sky, so this is the ground
 * every glyph is measured against.
 */
const haloGround = (scene: { sky: readonly string[]; markerHalo: string }): string[] =>
  landed(scene.markerHalo, scene.sky);

describe('the theme toggle: every word is text, and reads as text', () => {
  it.each(SETS)('%s: each chosen word clears 4.5:1 at every stop of its own sky', (_, set) => {
    for (const stop of STOPS) {
      const scene = set[stop];
      // the word is opaque; a word with alpha would have to be measured the way the glyphs are
      expect(parseColor(scene.word).a, stop).toBe(1);
      expect(worst([scene.word], scene.sky), stop).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

describe('the theme toggle: the other stops can be seen, and so can the knob', () => {
  it.each(SETS)(
    '%s: each glyph clears 3:1 as it lands on its halo, on every stop of its sky',
    (_, set) => {
      for (const stop of STOPS) {
        const scene = set[stop];
        const grounds = haloGround(scene);
        for (const [i, ink] of landed(scene.marker, grounds).entries())
          expect(contrastRatio(ink, grounds[i] ?? ''), `${stop} glyph`).toBeGreaterThanOrEqual(
            AA_GRAPHIC,
          );
      }
    },
  );

  it.each(SETS)('%s: the glyphs are quieter than the word they sit beside', (_, set) => {
    // a glyph says where else the knob can go; the word says where it is, and stays the louder
    for (const stop of STOPS) {
      const scene = set[stop];
      const grounds = haloGround(scene);
      for (const [i, ink] of landed(scene.marker, grounds).entries())
        expect(contrastRatio(ink, grounds[i] ?? ''), stop).toBeLessThan(
          contrastRatio(scene.word, scene.sky[i] ?? ''),
        );
    }
  });

  /**
   * AND PLAIN TO SEE (the owner, 2026-09-26: *"the moon icons (for night and dark) need tto be
   * highlighted more, in case if user wont understand how to change it"*). Brighter than the 80% and
   * 62% white they were, on a halo that is soft — a disc a parent sees, not a second knob — and a
   * ring that is seen and stays quieter than the glyph it rims.
   */
  it('draws the day’s and the dark’s glyphs brighter than they were, on a soft halo and a fine ring', () => {
    expect(parseColor(THEME_SKY.light.marker).a).toBeGreaterThan(0.8);
    expect(parseColor(THEME_SKY.dark.marker).a).toBeGreaterThan(0.62);
    for (const stop of ['light', 'dark'] as const) {
      const scene = THEME_SKY[stop];
      for (const [i, halo] of haloGround(scene).entries()) {
        const sky = scene.sky[i] ?? '';
        const soft = contrastRatio(halo, sky);
        expect(soft, `${stop} halo`).toBeGreaterThan(1.2);
        expect(soft, `${stop} halo`).toBeLessThan(2);
        const ring = contrastRatio(composite(sky, scene.markerRing), sky);
        expect(ring, `${stop} ring`).toBeGreaterThanOrEqual(1.5);
        expect(ring, `${stop} ring`).toBeLessThan(
          contrastRatio(composite(halo, scene.marker), halo),
        );
      }
    }
  });

  it('lights nothing in the amber pictures: a brighter glyph and a ring, and no disc', () => {
    for (const scene of [
      THEME_SKY.night,
      THEME_SKY_AMBER.light,
      THEME_SKY_AMBER.night,
      THEME_SKY_AMBER.dark,
    ]) {
      expect(parseColor(scene.markerHalo).a).toBe(0);
      // `text2`, a step up from the `text3` the glyphs were, and ringed in `text3`
      expect(scene.marker).toBe(themes.night.text2);
      expect(scene.markerRing).toBe(themes.night.text3);
      for (const sky of scene.sky)
        expect(contrastRatio(scene.markerRing, sky)).toBeLessThan(contrastRatio(scene.marker, sky));
    }
  });

  it.each(SETS)('%s: every knob face clears 3:1 against the sky it rests on', (_, set) => {
    expect(worst(set.light.sun, set.light.sky)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    expect(worst([set.night.crescent], set.night.sky)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    expect(worst([set.dark.moon], set.dark.sky)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('draws the crescent on a disc that is dimmer than it and a shade off the sky', () => {
    // the lit limb is the face; the rest of the disc is only there so the knob stays round
    const n = THEME_SKY.night;
    expect(contrastRatio(n.crescent, n.unlit)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    const offSky = Math.min(...n.sky.map(s => contrastRatio(n.unlit, s)));
    expect(offSky).toBeGreaterThan(1.1);
    expect(offSky).toBeLessThan(2);
  });
});

describe('the theme toggle: one picture language with setup’s switch', () => {
  it('draws Light and Dark in exactly the switch’s day and night', () => {
    // the right-hand stop is the picture setup already calls dark mode
    expect(THEME_SKY.light.sky).toBe(DAY_NIGHT_SKY.daySky);
    expect(THEME_SKY.light.sun).toBe(DAY_NIGHT_SKY.sun);
    expect(THEME_SKY.dark.sky).toBe(DAY_NIGHT_SKY.nightSky);
    expect(THEME_SKY.dark.moon).toBe(DAY_NIGHT_SKY.moon);
    expect(THEME_SKY.dark.crater).toBe(DAY_NIGHT_SKY.crater);
    expect(THEME_SKY.halo).toBe(DAY_NIGHT_SKY.halo);
    expect(THEME_SKY.shade).toBe(DAY_NIGHT_SKY.shade);
    expect(THEME_SKY_AMBER.light.sky).toBe(DAY_NIGHT_SKY_AMBER.daySky);
    expect(THEME_SKY_AMBER.dark.sky).toBe(DAY_NIGHT_SKY_AMBER.nightSky);
  });

  it('draws the same toggle in light and in dark, and the amber set only in night', () => {
    expect(themeSkyFor('light')).toBe(THEME_SKY);
    expect(themeSkyFor('dark')).toBe(THEME_SKY);
    expect(themeSkyFor('night')).toBe(THEME_SKY_AMBER);
    expect(THEME_SKY.scenery).toBe(true);
    expect(THEME_SKY_AMBER.scenery).toBe(false);
  });

  it('shares ONE Night picture between the two sets, so changing sets on Night moves nothing', () => {
    expect(THEME_SKY_AMBER.night).toBe(THEME_SKY.night);
  });
});

describe('the theme toggle: Night is amber and nothing else', () => {
  const own = new Set(Object.values(themes.night).map(c => c.toLowerCase()));
  const warm = (c: string): boolean => {
    const { r, b } = parseColor(c);
    return b <= r;
  };

  it('builds the Night picture from the night palette’s roles, or a blend of two of them', () => {
    const n = THEME_SKY.night;
    for (const c of [...n.sky, n.word, n.marker, n.crescent])
      expect(own.has(c.toLowerCase()), c).toBe(true);
    // the unlit side of the crescent: the sky with a little of the accent in it
    expect(n.unlit).toBe(composite(themes.night.surfaceSolid, themes.night.accent, 0.16));
  });

  it('puts no blue anywhere in the Night picture (theme.ts usage rule 7)', () => {
    const n = THEME_SKY.night;
    for (const c of [...n.sky, n.word, n.marker, n.crescent, n.unlit])
      expect(warm(c), c).toBe(true);
  });

  it('draws all three pictures from the night palette when the app is painted night', () => {
    const set = THEME_SKY_AMBER;
    const colors = [
      ...set.light.sky,
      set.light.word,
      set.light.marker,
      ...set.light.sun,
      ...set.dark.sky,
      set.dark.word,
      set.dark.marker,
      set.dark.moon,
      set.dark.crater,
      set.star,
      set.cloud,
    ];
    for (const c of colors) {
      expect(own.has(c.toLowerCase()), c).toBe(true);
      expect(warm(c), c).toBe(true);
    }
    // and the only two colors that are not roles carry no light at all: nothing glows at 3 a.m.
    expect(parseColor(set.halo).a).toBe(0);
    expect(parseColor(set.shade).a).toBe(0);
  });
});
