/**
 * THE BOTTLE TOGGLE'S PICTURE, MEASURED (`bottle.ts`; the owner, 2026-09-25). A pretty bottle can
 * still be a control nobody can read, and the eye is the instrument this repository has learned not
 * to trust for that (docs/PREFLIGHT.md): so the words against the pill, the ghost and the bottle's
 * outline against what they sit on, and — the one this picture adds — the milk's level against the
 * empty glass above it, are all numbers here, in every theme and for every milk.
 */
import { describe, expect, it } from 'vitest';
import {
  BOTTLE_MILKS,
  BOTTLE_PICTURE,
  BOTTLE_PICTURE_DARK,
  BOTTLE_PICTURE_LIGHT,
  BOTTLE_PICTURE_NIGHT,
  bottlePictureFor,
  type BottlePicture,
} from './bottle';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from './contrast';
import { moduleDiscSwatch, themes, themeNames } from './theme';

const SETS: readonly [string, BottlePicture][] = themeNames.map(n => [n, BOTTLE_PICTURE[n]]);

describe('the words are text, and read as text', () => {
  it.each(SETS)('%s: both words clear 4.5:1 on the pill, and the other one is quieter', (_, p) => {
    for (const ink of [p.word, p.quiet]) {
      // opaque: a word with alpha would have to be measured as it lands
      expect(parseColor(ink).a).toBe(1);
      expect(contrastRatio(ink, p.ground)).toBeGreaterThanOrEqual(AA_TEXT);
    }
    expect(contrastRatio(p.quiet, p.ground)).toBeLessThan(contrastRatio(p.word, p.ground));
  });

  it('writes them in the theme’s own text pair — the segmented control’s — never in text3', () => {
    for (const name of themeNames) {
      const p = BOTTLE_PICTURE[name];
      expect(p.word).toBe(themes[name].text);
      expect(p.quiet).toBe(themes[name].text2);
    }
  });
});

describe('the marks can be seen', () => {
  it.each(SETS)('%s: the ghost clears 3:1 on the pill, quieter than the words', (_, p) => {
    expect(contrastRatio(p.ghost, p.ground)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    expect(contrastRatio(p.ghost, p.ground)).toBeLessThan(contrastRatio(p.quiet, p.ground));
  });

  it.each(SETS)('%s: the bottle’s outline clears 3:1 on the pill and on its own glass', (_, p) => {
    expect(contrastRatio(p.outline, p.ground)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    expect(contrastRatio(p.outline, p.glass)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it.each(SETS)('%s: the graduations can be seen on the empty glass', (_, p) => {
    // They carry no state — the milk's own edge is the level (below) — so they are measured where
    // a parent sees them against nothing. On the dark and amber glasses no one ink could clear
    // 3:1 against both the dark glass and the pale milk, and the marks go quiet over the milk.
    expect(contrastRatio(p.tick, p.glass)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('keeps them crisp over the milk too where the glass is pale', () => {
    const p = BOTTLE_PICTURE_LIGHT;
    for (const m of BOTTLE_MILKS)
      expect(contrastRatio(p.tick, p.milk[m]), m).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });
});

describe('the level reads, for every milk in every theme', () => {
  it.each(SETS)('%s: where the milk meets the empty glass there is a 3:1 edge', (_, p) => {
    for (const m of BOTTLE_MILKS) {
      const milk = p.milk[m];
      const line = p.surface[m];
      // the line is drawn ON the milk, so it is seen against it wherever it is
      expect(contrastRatio(line, milk), m).toBeGreaterThanOrEqual(AA_GRAPHIC);
      // and the level is an edge against the glass: the milk itself, or the line
      const byFill = contrastRatio(milk, p.glass) >= AA_GRAPHIC;
      const byLine = contrastRatio(line, p.glass) >= AA_GRAPHIC;
      expect(byFill || byLine, m).toBe(true);
    }
  });

  it('draws the line where the pale milk has no edge of its own: on the light glass', () => {
    const p = BOTTLE_PICTURE_LIGHT;
    for (const m of BOTTLE_MILKS) {
      expect(contrastRatio(p.milk[m], p.glass), m).toBeLessThan(AA_GRAPHIC);
      expect(contrastRatio(p.surface[m], p.glass), m).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('lets the milk be its own edge on the dark glass', () => {
    const p = BOTTLE_PICTURE_DARK;
    for (const m of BOTTLE_MILKS)
      expect(contrastRatio(p.milk[m], p.glass), m).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });
});

describe('the milk is the milk’s, whatever the room', () => {
  it('pours the same three milks in light and in dark', () => {
    expect(BOTTLE_PICTURE_DARK.milk).toBe(BOTTLE_PICTURE_LIGHT.milk);
    expect(BOTTLE_PICTURE_LIGHT.milk.breast).toBe(themes.light.milkSoft);
    expect(BOTTLE_PICTURE_LIGHT.milk.water).toBe(themes.light.cyanSoft);
  });

  it('tints breast milk, formula and water apart — a second signal beside the Type’s words', () => {
    const { breast, formula, water } = BOTTLE_PICTURE_LIGHT.milk;
    expect(new Set([breast, formula, water]).size).toBe(3);
    // formula a shade deeper and warmer than breast milk; water the blue of the water module
    expect(contrastRatio(formula, '#FFFFFF')).toBeGreaterThan(contrastRatio(breast, '#FFFFFF'));
    const w = parseColor(water);
    expect(w.b).toBeGreaterThan(w.r);
  });

  it('wears the bottle module’s own colors: its soft tint for the pill, its ink, the owner’s gold', () => {
    for (const name of ['light', 'dark'] as const) {
      const p = BOTTLE_PICTURE[name];
      expect(p.ground).toBe(themes[name].feedSoft);
      expect(p.outline).toBe(themes[name].feed);
      expect(p.collar).toBe(moduleDiscSwatch.feed);
    }
    expect(bottlePictureFor('light')).toBe(BOTTLE_PICTURE_LIGHT);
    expect(bottlePictureFor('dark')).toBe(BOTTLE_PICTURE_DARK);
    expect(bottlePictureFor('night')).toBe(BOTTLE_PICTURE_NIGHT);
  });

  it('keeps the highlight on the glass faint, and makes the teat the glass with the gold through it', () => {
    for (const p of [BOTTLE_PICTURE_LIGHT, BOTTLE_PICTURE_DARK]) {
      expect(p.shine).not.toBeNull();
      expect(parseColor(p.shine ?? '').a).toBeLessThanOrEqual(0.7);
      // silicone: a clear thing with the collar's gold let through, in the glass the theme draws
      expect(p.teat).toBe(composite(p.glass, moduleDiscSwatch.feed, 0.45));
    }
  });
});

describe('the amber Night: its own roles, one milk, nothing lit', () => {
  const own = new Set(Object.values(themes.night).map(c => c.toLowerCase()));
  const p = BOTTLE_PICTURE_NIGHT;
  const every = [
    p.ground,
    p.word,
    p.quiet,
    p.ghost,
    p.glass,
    p.outline,
    p.collar,
    p.teat,
    p.tick,
    ...BOTTLE_MILKS.map(m => p.milk[m]),
    ...BOTTLE_MILKS.map(m => p.surface[m]),
  ];

  it('draws the whole bottle from the night palette’s roles and nothing else', () => {
    for (const c of every) expect(own.has(c.toLowerCase()), c).toBe(true);
  });

  it('puts no blue anywhere (theme.ts usage rule 7)', () => {
    for (const c of every) {
      const { r, b } = parseColor(c);
      expect(b, c).toBeLessThanOrEqual(r);
    }
  });

  it('pours one milk whatever is in the bottle, and lights nothing', () => {
    expect(new Set(BOTTLE_MILKS.map(m => p.milk[m])).size).toBe(1);
    expect(p.shine).toBeNull();
  });
});
