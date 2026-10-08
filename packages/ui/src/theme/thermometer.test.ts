/**
 * THE THERMOMETER, MEASURED (`thermometer.ts`; the owner, 2026-09-26). Both printed scales are text
 * — the one that is read and the quiet one, which is the same column read in the other scale — the
 * graduations are the scale a column is read against, and the column is what the reading is drawn
 * as: all of it numbers here, in light, dark and the amber Night. And the column's COLOR is held to
 * the one rule that is not about contrast: it may not say hot.
 */
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, AA_TEXT, contrastRatio, parseColor } from './contrast';
import {
  THERMOMETER_AMBER,
  THERMOMETER_DARK,
  THERMOMETER_LIGHT,
  thermometerFor,
  type ThermometerPicture,
} from './thermometer';
import { resolvePalette, schemes, themes, type SchemeName, type ThemeName } from './theme';

const SETS: readonly [ThemeName, ThermometerPicture][] = [
  ['light', THERMOMETER_LIGHT],
  ['dark', THERMOMETER_DARK],
  ['night', THERMOMETER_AMBER],
];

describe('both scales are text, and read as text', () => {
  it.each(SETS)('%s: the scale that is read clears 4.5:1 on both stops of the glass', (_, p) => {
    expect(parseColor(p.ink).a).toBe(1);
    for (const glass of p.glass)
      expect(contrastRatio(p.ink, glass), glass).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(SETS)(
    '%s: the quiet scale clears 4.5:1 too — it is the same column, read in the other scale',
    (_, p) => {
      expect(parseColor(p.quiet).a).toBe(1);
      for (const glass of p.glass)
        expect(contrastRatio(p.quiet, glass), glass).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each(SETS)(
    '%s: the scale that is read stands out from the quiet one on every ground',
    (_, p) => {
      for (const glass of p.glass)
        expect(contrastRatio(p.ink, glass)).toBeGreaterThan(contrastRatio(p.quiet, glass) + 2);
    },
  );

  it.each(SETS)('%s: the tag’s digits clear 4.5:1 on the tag', (_, p) => {
    expect(parseColor(p.tag).a).toBe(1);
    expect(contrastRatio(p.ink, p.tag)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('the graduations and the column can be seen against the glass', () => {
  // WCAG 1.4.11: the graduations are what the column is read against, and the column is the reading
  it.each(SETS)('%s: the graduations clear 3:1 on the glass', (_, p) => {
    expect(parseColor(p.tick).a).toBe(1);
    for (const glass of p.glass)
      expect(contrastRatio(p.tick, glass), glass).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it.each(SETS)(
    '%s: the tag is outlined in the column’s own color, 3:1 on the tag and on the glass',
    (_, p) => {
      // the reading's end, carrying its number — not a capsule of its own after the column
      expect(p.tagEdge).toBe(p.mercury[1]);
      expect(contrastRatio(p.tagEdge, p.tag)).toBeGreaterThanOrEqual(AA_GRAPHIC);
      for (const glass of p.glass)
        expect(contrastRatio(p.tagEdge, glass), glass).toBeGreaterThanOrEqual(AA_GRAPHIC);
    },
  );

  it.each(SETS)('%s: the graduations are quieter than the numbers beside them', (_, p) => {
    for (const glass of p.glass)
      expect(contrastRatio(p.tick, glass)).toBeLessThan(contrastRatio(p.quiet, glass));
  });

  it.each(SETS)(
    '%s: the mercury clears 3:1 on the empty bore, and the bulb on the glass',
    (_, p) => {
      expect(contrastRatio(p.mercury[1], p.bore)).toBeGreaterThanOrEqual(AA_GRAPHIC);
      for (const glass of p.glass)
        expect(contrastRatio(p.mercury[1], glass), glass).toBeGreaterThanOrEqual(AA_GRAPHIC);
    },
  );
});

describe('the pair of radios is the segmented control’s own colors, and reads as it does', () => {
  const SCHEMES = Object.keys(schemes) as SchemeName[];
  it.each(['light', 'dark', 'night'] as const)(
    '%s: the chosen word on the chip, and the other on the track, clear 4.5:1 in every scheme',
    theme => {
      for (const scheme of SCHEMES) {
        const c = resolvePalette(theme, scheme);
        expect(contrastRatio(c.text, c.surfaceSolid), scheme).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(c.text2, c.surface2), scheme).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );
});

describe('the column never says hot', () => {
  /** How far a color is from gray: its largest channel less its smallest. */
  const chroma = (c: string): number => {
    const { r, g, b } = parseColor(c);
    return Math.max(r, g, b) - Math.min(r, g, b);
  };

  it('draws the mercury near gray in light and dark, and cool rather than warm', () => {
    // a red, orange or pink column is a picture of heat beside a baby's temperature — a fever
    // said by a color (CLAUDE.md §2 rules 1 and 3)
    for (const p of [THERMOMETER_LIGHT, THERMOMETER_DARK])
      for (const c of p.mercury) {
        expect(chroma(c), c).toBeLessThanOrEqual(40);
        const { r, b } = parseColor(c);
        expect(r, c).toBeLessThanOrEqual(b);
      }
  });

  it('keeps the whole light and dark picture near gray: glass, bore, inks, graduations and tag', () => {
    for (const p of [THERMOMETER_LIGHT, THERMOMETER_DARK])
      for (const c of [...p.glass, p.bore, p.ink, p.quiet, p.tick, p.tag])
        expect(chroma(c), c).toBeLessThanOrEqual(40);
  });

  it('never uses the palette’s alarm colors for anything', () => {
    const alarms = new Set(
      (['light', 'dark', 'night'] as const)
        .flatMap(t => [themes[t].crit, themes[t].health, themes[t].dangerFill])
        .map(c => c.toLowerCase()),
    );
    for (const [, p] of SETS)
      for (const c of [...p.glass, p.bore, ...p.mercury, p.ink, p.quiet, p.tick, p.tag, p.tagEdge])
        expect(alarms.has(c.toLowerCase()), c).toBe(false);
  });
});

describe('it follows the theme, and night is the night palette', () => {
  it('paints each theme its own thermometer', () => {
    expect(thermometerFor('light')).toBe(THERMOMETER_LIGHT);
    expect(thermometerFor('dark')).toBe(THERMOMETER_DARK);
    expect(thermometerFor('night')).toBe(THERMOMETER_AMBER);
  });

  it('keeps a dark page dark: the dark glass is darker than the light one by a long way', () => {
    for (const c of THERMOMETER_DARK.glass) expect(contrastRatio(c, '#000000')).toBeLessThan(2);
  });

  it('builds the amber thermometer from the night palette’s roles, warm, with no highlight', () => {
    const own = new Set(Object.values(themes.night).map(c => c.toLowerCase()));
    const p = THERMOMETER_AMBER;
    for (const c of [...p.glass, p.bore, ...p.mercury, p.ink, p.quiet, p.tick, p.tag, p.tagEdge]) {
      expect(own.has(c.toLowerCase()), c).toBe(true);
      const { r, b } = parseColor(c);
      expect(b, c).toBeLessThanOrEqual(r);
    }
    // the quiet scale is the night palette's text2, the read one its text
    expect(p.ink).toBe(themes.night.text);
    expect(p.quiet).toBe(themes.night.text2);
    expect(p.highlight).toBe(false);
    expect(THERMOMETER_LIGHT.highlight && THERMOMETER_DARK.highlight).toBe(true);
  });
});
