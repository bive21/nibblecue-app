/**
 * THE STARFIELD'S WORDS, MEASURED (`starfield.ts`; the owner, 2026-09-25). The stars drift, so
 * any of them can pass behind any letter: every word is measured over the brightest thing that
 * can ever be under it — each stop of the sky with the nearest sparkle on it at full strength, its
 * glow round it, through the panel — and never over the bare sky alone.
 */
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from './contrast';
import { DAY_NIGHT_SKY } from './sky';
import { STARFIELD, STARFIELD_AMBER, starfieldFor, type StarfieldScene } from './starfield';
import { themes } from './theme';

const SETS: readonly [string, StarfieldScene][] = [
  ['light and dark', STARFIELD],
  ['amber night', STARFIELD_AMBER],
];

/** Every ground a word can land on: the sky, a star, a sparkle and its glow — through the panel. */
function underTheWords(scene: StarfieldScene): string[] {
  const out: string[] = [];
  for (const sky of scene.sky) {
    const lit = scene.glow === null ? sky : composite(sky, scene.glow);
    for (const ground of [sky, lit, composite(sky, scene.star), composite(lit, scene.sparkle)])
      out.push(composite(ground, scene.panel));
  }
  return out;
}

describe('every word reads, whatever star is behind it', () => {
  it.each(SETS)('%s: the name, the lines and the hint clear 4.5:1', (_, scene) => {
    for (const ground of underTheWords(scene)) {
      expect(contrastRatio(scene.title, ground), `title on ${ground}`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(contrastRatio(scene.text, ground), `text on ${ground}`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(contrastRatio(scene.hint, ground), `hint on ${ground}`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    }
  });

  it.each(SETS)(
    '%s: the words themselves are opaque, so what is measured is what is drawn',
    (_, scene) => {
      for (const ink of [scene.title, scene.text, scene.hint]) expect(parseColor(ink).a).toBe(1);
    },
  );
});

describe('the stars are stars', () => {
  it.each(SETS)('%s: a star and a sparkle clear 3:1 on the sky they drift across', (_, scene) => {
    for (const sky of scene.sky) {
      expect(contrastRatio(scene.star, sky)).toBeGreaterThanOrEqual(AA_GRAPHIC);
      expect(contrastRatio(scene.sparkle, sky)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('is the theme switch’s own night: its sky and its white stars', () => {
    expect(STARFIELD.sky).toBe(DAY_NIGHT_SKY.nightSky);
    expect(STARFIELD.star).toBe(DAY_NIGHT_SKY.star);
  });

  it('keeps the glow faint, and the panel mostly opaque', () => {
    expect(parseColor(STARFIELD.glow ?? '').a).toBeLessThanOrEqual(0.2);
    for (const [, scene] of SETS) expect(parseColor(scene.panel).a).toBeGreaterThanOrEqual(0.8);
  });
});

describe('amber night: the night palette’s own sky, and nothing glows', () => {
  const own = new Set(Object.values(themes.night).map(c => c.toLowerCase()));

  it('builds every color from the night palette’s roles', () => {
    const s = STARFIELD_AMBER;
    for (const c of [...s.sky, s.star, s.sparkle, s.title, s.text, s.hint])
      expect(own.has(c.toLowerCase()), c).toBe(true);
    // the panel is the darkest ground, at most of full strength
    const { r, g, b } = parseColor(s.panel);
    expect(`#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase()).toBe(
      themes.night.page,
    );
  });

  it('has no glow, and no blue anywhere in it', () => {
    expect(STARFIELD_AMBER.glow).toBeNull();
    const s = STARFIELD_AMBER;
    for (const c of [...s.sky, s.star, s.sparkle, s.title, s.text, s.hint, s.panel]) {
      const { r, b } = parseColor(c);
      expect(b, c).toBeLessThanOrEqual(r);
    }
  });

  it('is drawn when the app is painted night, and the switch’s night everywhere else', () => {
    expect(starfieldFor('night')).toBe(STARFIELD_AMBER);
    expect(starfieldFor('light')).toBe(STARFIELD);
    expect(starfieldFor('dark')).toBe(STARFIELD);
  });
});
