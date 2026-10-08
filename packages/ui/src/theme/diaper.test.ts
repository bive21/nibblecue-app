/**
 * THE DIAPER TOGGLE'S PICTURE, MEASURED (`diaper.ts`; the owner, 2026-09-26). The words against the
 * pill they are written on; the ghost, the whiffs, the droplets and the sparkle against it; the
 * diaper's edge against it; and the wet stripe — the one part of the picture that says something at
 * rest — against the diaper it is drawn on. Every one a number, in every theme.
 */
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, luminance, parseColor } from './contrast';
import {
  DIAPER_PICTURE,
  DIAPER_PICTURE_DARK,
  DIAPER_PICTURE_LIGHT,
  DIAPER_PICTURE_NIGHT,
  diaperPictureFor,
  type DiaperPicture,
} from './diaper';
import { themeNames, themes } from './theme';

const SETS: readonly [string, DiaperPicture][] = themeNames.map(n => [n, DIAPER_PICTURE[n]]);

describe('the words are text, written on the pill', () => {
  it.each(SETS)(
    '%s: both inks clear 4.5:1 on the pill, and the other answers’ is quieter',
    (_, p) => {
      for (const ink of [p.word, p.quiet]) {
        expect(parseColor(ink).a).toBe(1);
        expect(contrastRatio(ink, p.ground)).toBeGreaterThanOrEqual(AA_TEXT);
      }
      expect(contrastRatio(p.quiet, p.ground)).toBeLessThan(contrastRatio(p.word, p.ground));
    },
  );

  it('writes them in the theme’s own text pair, on the diaper module’s own soft tint', () => {
    for (const name of themeNames) {
      const p = DIAPER_PICTURE[name];
      expect(p.word).toBe(themes[name].text);
      expect(p.quiet).toBe(themes[name].text2);
      expect(p.ground).toBe(themes[name].diaperSoft);
      expect(p.ghost).toBe(themes[name].text3);
    }
  });
});

describe('the marks can be seen', () => {
  it.each(SETS)('%s: the ghost, the whiffs and the droplets clear 3:1 on the pill', (_, p) => {
    for (const mark of [p.ghost, p.whiff, p.drop])
      expect(contrastRatio(mark, p.ground), mark).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it.each(SETS)('%s: the diaper has a 3:1 edge on the pill — its body or its outline', (_, p) => {
    const byBody = contrastRatio(p.body, p.ground) >= AA_GRAPHIC;
    const byLine = contrastRatio(p.line, p.ground) >= AA_GRAPHIC;
    expect(byBody || byLine).toBe(true);
  });

  it.each(SETS)(
    '%s: the wet stripe clears 3:1 on the diaper, and the dry one is quieter',
    (_, p) => {
      // "wet" is there at rest, on the diaper itself: the stripe is what says it
      expect(contrastRatio(p.wet, p.body)).toBeGreaterThanOrEqual(AA_GRAPHIC);
      expect(contrastRatio(p.dry, p.body)).toBeLessThan(contrastRatio(p.wet, p.body));
    },
  );

  it('draws the sparkle in a gold that clears 3:1 on the pill, where anything may be lit', () => {
    for (const p of [DIAPER_PICTURE_LIGHT, DIAPER_PICTURE_DARK]) {
      expect(p.sparkle).not.toBeNull();
      expect(contrastRatio(p.sparkle ?? p.ground, p.ground)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });
});

describe('one diaper, the owner’s, in light and in dark', () => {
  it('is the same diaper in both, the way milk is milk whatever the room is painted', () => {
    for (const key of ['body', 'line', 'tab', 'dry', 'wet'] as const)
      expect(DIAPER_PICTURE_DARK[key], key).toBe(DIAPER_PICTURE_LIGHT[key]);
    expect(diaperPictureFor('light')).toBe(DIAPER_PICTURE_LIGHT);
    expect(diaperPictureFor('dark')).toBe(DIAPER_PICTURE_DARK);
    expect(diaperPictureFor('night')).toBe(DIAPER_PICTURE_NIGHT);
  });

  it('turns a yellow stripe blue: the dry one is yellow, the wet one the water module’s blue', () => {
    const dry = parseColor(DIAPER_PICTURE_LIGHT.dry);
    expect(Math.min(dry.r, dry.g)).toBeGreaterThan(dry.b + 100);
    const wet = parseColor(DIAPER_PICTURE_LIGHT.wet);
    expect(wet.b).toBeGreaterThan(wet.r + 100);
    expect(DIAPER_PICTURE_LIGHT.wet).toBe(themes.light.cyan);
  });

  it('carries no status color anywhere: nothing in it is good, a warning or an alarm', () => {
    const status = new Set(
      themeNames.flatMap(n => {
        const t = themes[n];
        return [t.good, t.warn, t.crit, t.dangerFill].map(c => c.toLowerCase());
      }),
    );
    for (const [, p] of SETS)
      for (const c of Object.values(p))
        if (typeof c === 'string') expect(status.has(c.toLowerCase()), c).toBe(false);
  });
});

describe('the amber Night: its own roles, nothing lit', () => {
  const own = new Set(Object.values(themes.night).map(c => c.toLowerCase()));
  const p = DIAPER_PICTURE_NIGHT;
  const roles = [p.ground, p.word, p.quiet, p.ghost, p.body, p.line, p.wet, p.drop, p.whiff];

  it('draws the diaper from the night palette’s roles, or a blend of two of them', () => {
    for (const c of roles) expect(own.has(c.toLowerCase()), c).toBe(true);
    expect(p.tab).toBe(composite(themes.night.surface3, themes.night.diaper, 0.45));
    expect(p.dry).toBe(composite(themes.night.surface3, themes.night.text3, 0.45));
  });

  it('puts no blue anywhere (theme.ts usage rule 7), and nothing brighter than its words', () => {
    for (const c of [...roles, p.tab, p.dry]) {
      const { r, b } = parseColor(c);
      expect(b, c).toBeLessThanOrEqual(r);
      expect(luminance(c), c).toBeLessThanOrEqual(luminance(p.word));
    }
  });

  it('lights nothing: there is no sparkle at all', () => {
    expect(p.sparkle).toBeNull();
  });
});
