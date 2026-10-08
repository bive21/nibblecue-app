/**
 * THE ILLUSTRATED SET AND THE OWNER'S COLOR REFERENCE — a trial, held to the same rules.
 *
 * Two claims are worth an instrument here, and neither is about how the pictures look:
 *
 *   1. The illustrations must NEVER reach the small sizes. That is the whole reason the
 *      threshold exists, and a later "just use the picture everywhere" would look like a
 *      simplification rather than a regression.
 *   2. The owner's swatches must never become ink. Every one of them fails as text by a
 *      wide margin; used as a label color they would undo the contrast pass that closed 160
 *      measured failures.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  drawIllustrated,
  ILLUSTRATED_MIN_SIZE,
  ILLUSTRATED_NAMES,
  ILLUSTRATED_TIERS,
  illustratedTier,
} from './illustrated';
import { moduleDisc, moduleDiscSwatch, discFor } from '../theme/theme';

/** WCAG relative luminance, so the claim about these colors is measured and not asserted. */
const lum = (hex: string): number => {
  const v = hex.replace('#', '');
  const ch = [0, 2, 4].map(i => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
};
const ratio = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

describe('the illustrated icons', () => {
  it('cover the twenty the owner has drawn and the two care kinds drawn to their rules, and no name the glyph set does not have', () => {
    expect([...ILLUSTRATED_NAMES].sort()).toEqual([
      'bath',
      'bottle',
      'breast',
      // what a care item is: a vitamin and anything else (2026-09-26, drawn in the repository —
      // `tools/brand/render-care-pictures.mjs`); the medicine and the cream jar are the owner's
      'care-other',
      'care-vitamin',
      'diaper',
      'growth',
      'med',
      'pump',
      'sleep',
      'solids',
      'supply-clothing',
      'supply-cream',
      'supply-formula',
      'supply-laundry',
      'supply-milk-storage',
      'supply-nipples',
      'supply-other',
      'supply-pacifiers',
      'supply-wipes',
      'temp',
      'tummy',
    ]);
  });

  /**
   * EVERY NAME HAS ITS FILES, and every file its name. `illustrated.assets.ts` is the one place
   * a name and a picture are tied together, and the type system checks it for completeness but
   * not for truth: a wrong path is `undefined` at runtime and draws nothing, silently, on the
   * device. So the rendered folder is read off disk — a folder per tier, two densities per picture.
   *
   * AND NO 1× FILE (2026-09-26): no supported phone is 1×, and the files cost every iOS build
   * 126 KB. The `require` keeps naming `<name>.png`, which is how Metro finds the `@2x` and `@3x`
   * siblings (`tools/ui/import-png-icons.mjs`, `SCALES`, has the whole argument).
   */
  it('has every tier at every density for every name, and renders nothing it does not name', () => {
    const dir = join(__dirname, 'illustrated');
    expect(readdirSync(dir).sort()).toEqual(ILLUSTRATED_TIERS.map(String).sort());
    const expected = ILLUSTRATED_NAMES.flatMap(n => [`${n}@2x.png`, `${n}@3x.png`]);
    const assets = readFileSync(join(__dirname, 'illustrated.assets.ts'), 'utf8');
    for (const tier of ILLUSTRATED_TIERS) {
      expect(readdirSync(join(dir, String(tier))).sort(), `tier ${tier}`).toEqual(expected.sort());
      for (const name of ILLUSTRATED_NAMES)
        expect(assets, `${name} at ${tier}`).toContain(
          `require('./illustrated/${tier}/${name}.png')`,
        );
    }
  });

  /**
   * A DENSITY FILE IS ITS SUFFIX'S SIZE. React Native trusts the name: it hands `bath@3x.png` to a
   * 3× screen as a picture three times the point size, so a file written at the wrong size would
   * draw at the right box and the wrong sharpness, which is the defect these files exist to fix.
   * The PNG header carries width and height at bytes 16 and 20.
   *
   * AND IT IS A SEE-THROUGH PNG. From 2026-09-28 to 2026-10-01 these were lossless WebP, and the
   * owner's iPhone drew see-through WebP pictures as nothing (`tools/ui/import-png-icons.mjs` has
   * the story), so the signature is held here. Byte 25 is the color type: 3 is an 8-bit palette
   * (since 2026-10-08, half the bytes), and its alpha is the tRNS chunk, which must be there or
   * every picture would sit on a square.
   */
  it('renders each density at its tier times its scale, in pixels, as a see-through PNG', () => {
    for (const tier of ILLUSTRATED_TIERS) {
      for (const [suffix, scale] of [
        ['@2x', 2],
        ['@3x', 3],
      ] as const) {
        for (const name of ILLUSTRATED_NAMES) {
          const png = readFileSync(
            join(__dirname, 'illustrated', String(tier), `${name}${suffix}.png`),
          );
          const where = `${tier}/${name}${suffix}`;
          expect(png.subarray(0, 8).toString('hex'), `${where} is a PNG`).toBe('89504e470d0a1a0a');
          expect([png[24], png[25]], `${where} is an 8-bit palette`).toEqual([8, 3]);
          expect(png.includes(Buffer.from('tRNS')), `${where} keeps its alpha`).toBe(true);
          const size = [png.readUInt32BE(16), png.readUInt32BE(20)];
          expect(size, where).toEqual([tier * scale, tier * scale]);
        }
      }
    }
  });

  it('draws each size from the smallest render at least as big, so a picture only shrinks', () => {
    for (let size = ILLUSTRATED_MIN_SIZE; size <= 24; size += 1)
      expect(illustratedTier(size)).toBe(24);
    for (let size = 25; size <= 48; size += 1) expect(illustratedTier(size)).toBe(48);
    // every size a module surface draws at is served by a tier at least that big
    for (const size of [16, 18, 20, 22, 24, 26, 28, 30, 33, 37, 44]) {
      expect(illustratedTier(size), `${size}pt`).toBeGreaterThanOrEqual(size);
    }
    // a tablet's doodles are larger than any tier: the largest is stretched rather than nothing
    expect(illustratedTier(65)).toBe(48);
  });

  it('draws at every module size, and never beside a word', () => {
    // the inline places — a chevron on a row, a clock on a timestamp — stay glyphs, because a
    // picture set into a line of text is wrong at any fidelity
    for (const inline of [10, 12, 13, 14, 15]) {
      expect(drawIllustrated('bottle', inline), `${inline}px sits beside a word`).toBe(false);
    }
    // and every size a module surface actually draws at is a picture (owner, 2026-09-22)
    for (const big of [ILLUSTRATED_MIN_SIZE, 20, 24, 26, 30, 44]) {
      expect(drawIllustrated('bottle', big), `${big}px is a module surface`).toBe(true);
    }
  });

  it('never claim a name that has no file', () => {
    expect(drawIllustrated('shield', 44)).toBe(false);
    expect(drawIllustrated('clock', 44)).toBe(false);
  });

  it('is drawn as an image, so `color` cannot silently do nothing on a glyph', () => {
    const src = readFileSync(join(__dirname, 'Icon.tsx'), 'utf8');
    // the picture branch returns BEFORE the svg is built, rather than being painted over it
    expect(src).toMatch(/if \(illustration !== undefined\) \{[\s\S]{0,400}<Image/);
    expect(src).toContain('resizeMode="contain"');
    // and it draws the render made for the size, not one file for every size
    expect(src).toContain('ILLUSTRATED_ICONS[name as IllustratedName][illustratedTier(size)]');
    // and it keeps the same accessibility contract as the glyph
    expect(src).toMatch(/illustration[\s\S]{0,600}accessibilityLabel/);
  });
});

describe('the owner’s color reference (2026-09-22)', () => {
  it('is the swatches, exactly as given', () => {
    expect(moduleDiscSwatch).toEqual({
      feed: '#FFD166',
      // the eighth, 2026-09-22 — breastfeeding is no longer the bottle's amber
      breastfeed: '#E87C8E',
      pump: '#A7E3C1',
      diaper: '#FFB3A7',
      sleep: '#C7B4EB',
      tummy: '#A7DBFF',
      solids: '#BDE3A7',
      health: '#FFB3CB',
      // derived, not on the sheet — see moduleDiscSwatch for why bath and medicine need one
      bath: '#D9F5A1',
      med: '#D2A1F5',
    });
  });

  /**
   * THE SHEET IS ONLY REAL IF SOMETHING PAINTS IT (the owner, 2026-09-22: "why is it still not
   * showing on these color? was it because of the overlay?"). It was: every holder filled itself
   * with the `<role>Soft` token composited over the page at the skin's tint alpha, so the pixel
   * on the phone was a dilution of a hue rather than a hex off the sheet. `useCategory` carries
   * `disc` now and every holder prefers it, so this scans the surfaces that draw one.
   */
  it('is painted at full strength by every holder, not composited toward the ground', () => {
    const holders: [string, RegExp][] = [
      ['components/QuickAction.tsx', /cat\.disc \?\?/],
      ['components/Row.tsx', /chip\.disc \?\?/],
      // the Log's chip, drawn once for the Log's rows and Today's "Also running" rows (2026-09-26)
      ['components/ModuleDisc.tsx', /cat\.disc \?\? cat\.soft/],
      ['components/TimelineItem.tsx', /<ModuleDisc moduleId=\{moduleId\}/],
      ['components/AlsoRunning.tsx', /<ModuleDisc moduleId=\{item\.type as ModuleId\} \/>/],
    ];
    for (const [file, pattern] of holders) {
      expect(readFileSync(join(__dirname, '..', file), 'utf8'), file).toMatch(pattern);
    }
  });

  it('gives every module a swatch, so none falls back to a gray circle', () => {
    for (const [module, swatch] of Object.entries(moduleDisc)) {
      expect(moduleDiscSwatch[swatch], module).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  /**
   * THE LOAD-BEARING ONE. These are fills. Not one of them is legible as text, so a future
   * edit that reaches for `moduleDiscSwatch` to paint a label is caught here rather than by a
   * parent squinting at a 1.4:1 word.
   */
  it('is unusable as ink and excellent as a fill — which is why it paints the disc', () => {
    for (const [name, hex] of Object.entries(moduleDiscSwatch)) {
      // the bound is AA itself, not a tighter number, because breastfeeding's 2.73:1 is the
      // owner's own swatch and the only one above 2.1 — what matters is that no swatch could
      // ever be mistaken for a legible label, and 4.5 is where that line actually is
      expect(ratio(hex, '#FFFFFF'), `${name} as text on white`).toBeLessThan(4.5);
      expect(ratio(hex, '#12343B'), `${name} with the brand ink on it`).toBeGreaterThan(4.5);
    }
  });

  it('shows no disc in night mode, which exists to keep a dark room dark', () => {
    expect(discFor('bottle', 'night')).toBeNull();
    expect(discFor('bottle', 'light')).toBe('#FFD166');
    expect(discFor('bottle', 'dark')).toBe('#FFD166');
  });
});
