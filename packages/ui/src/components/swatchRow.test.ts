/**
 * THE COLOR ROW (the owner, 2026-09-25: *"color is taking too much space, make it fit into a 1 row
 * 4/5 options, remove the description text below the color name"*). The one decision the row makes
 * — six across, or a sideways row showing four and a half — is walked here over every half point of
 * body the Appearance sheet can have and every text size from 1× to 1.3×, over the six names the
 * app really ships (`schemes`), and the name bound is held to the widths measured out of the face.
 * What only a device can show — that the name is inside the target and the swatch is felt — is
 * held by tripwires over `Swatch.tsx`, because this suite has no renderer.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hit, schemes, space, type as typeScale } from '../theme/theme';
import {
  SWATCH_NAME,
  SWATCH_PEEK,
  swatchMinCell,
  swatchNameWidth,
  swatchRowLayout,
} from './swatchRow';

const here = dirname(fileURLToPath(import.meta.url));
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const swatch = code(readFileSync(join(here, 'Swatch.tsx'), 'utf8'));

const NAMES = Object.values(schemes).map(s => s.name);
/** The sheet's body: the window less `space.xxl` each side — 272 on a 308 pt window, 394 on a 430. */
const BODIES = Array.from({ length: (430 - 272) * 2 + 1 }, (_, i) => 272 + i / 2);
const SCALES = Array.from({ length: 7 }, (_, i) => 1 + i * 0.05);
const BLEED = space.xxl;

describe('the name bound covers the names the app draws', () => {
  it('is the six schemes, in the order the resolver keeps them', () => {
    // the default first (2026-09-27), and no two neighbors of one hue family
    expect(NAMES).toEqual(['Ocean', 'Lilac', 'Rose', 'Leaf', 'Reef', 'Slate']);
    expect(SWATCH_NAME.size).toBe(typeScale.meta.fontSize);
  });

  it('is never narrower than the name set in the face the app ships, or the system’s', () => {
    // Hanken Grotesk Regular, read out of its TTF (1000 units to the em), and Ocean in the system
    // faces that draw it before the app's own are registered
    const measured: Record<string, number> = {
      Ocean: 2.893,
      Lilac: 2.044,
      Rose: 2.185,
      // NibbleCue's green, in Sunny's place (2026-10-08), measured in the same TTF
      Leaf: 1.91,
      Reef: 2.013,
      Slate: 2.255,
    };
    for (const name of NAMES) {
      const em = measured[name] ?? Infinity;
      expect(swatchNameWidth(name, 1), name).toBeGreaterThanOrEqual(em * SWATCH_NAME.size);
    }
    expect(swatchNameWidth('Ocean', 1)).toBeGreaterThanOrEqual(2.86 * SWATCH_NAME.size);
  });
});

describe('six across whenever six cells can each have their room', () => {
  it('decides exactly on the rule: a 44 pt target, and the longest name with air either side', () => {
    for (const width of BODIES)
      for (const scale of SCALES) {
        const row = swatchRowLayout({ width, bleed: BLEED, names: NAMES, fontScale: scale });
        const room = Math.max(
          hit.min,
          Math.max(...NAMES.map(n => swatchNameWidth(n, scale))) + SWATCH_NAME.gap,
        );
        expect(row.scroll, `${width} at ${scale}×`).toBe(6 * room > width);
      }
  });

  it('shares the body equally when it fits, every cell a whole target with its name inside', () => {
    for (const width of BODIES)
      for (const scale of SCALES) {
        const row = swatchRowLayout({ width, bleed: BLEED, names: NAMES, fontScale: scale });
        if (row.scroll) continue;
        expect(row.cell * 6).toBeCloseTo(width, 6);
        expect(row.visible).toBe(6);
        expect(row.cell).toBeGreaterThanOrEqual(hit.min);
        for (const n of NAMES)
          expect(row.cell - swatchNameWidth(n, scale), n).toBeGreaterThanOrEqual(SWATCH_NAME.gap);
      }
  });

  it('keeps all six on the page on today’s phones at the default text size, and at 1.3× from 360 dp', () => {
    // 272 is a 308 pt window, below any phone sold today; 324 is a 360 dp Android, 339 a 375 pt
    // iPhone, 394 a 430 pt one
    for (const width of [324, 339, 358, 394])
      for (const scale of [1, 1.3])
        expect(
          swatchRowLayout({ width, bleed: BLEED, names: NAMES, fontScale: scale }).scroll,
        ).toBe(false);
    for (const width of BODIES)
      expect(swatchRowLayout({ width, bleed: BLEED, names: NAMES, fontScale: 1 }).scroll).toBe(
        false,
      );
  });
});

describe('otherwise a sideways row that shows it is one', () => {
  const scrolled = BODIES.flatMap(width =>
    SCALES.map(scale => ({
      width,
      scale,
      row: swatchRowLayout({ width, bleed: BLEED, names: NAMES, fontScale: scale }),
    })),
  ).filter(c => c.row.scroll);

  it('happens somewhere in the range — the narrowest bodies at the larger text sizes', () => {
    expect(scrolled.length).toBeGreaterThan(0);
    expect(Math.max(...scrolled.map(c => c.width))).toBeLessThan(324);
  });

  it('shows four and a half, counted to the sheet’s edge, so the fifth is cut in half', () => {
    for (const { width, scale, row } of scrolled) {
      expect(row.visible, `${width} at ${scale}×`).toBe(SWATCH_PEEK);
      expect((width + BLEED) / row.cell).toBeCloseTo(SWATCH_PEEK, 6);
    }
  });

  it('never makes a cell narrower than a target, or than its name needs', () => {
    for (const { scale, row } of scrolled) {
      expect(row.cell).toBeGreaterThanOrEqual(swatchMinCell(NAMES, scale));
      expect(row.cell).toBeGreaterThanOrEqual(hit.min);
    }
  });

  it('leaves more to scroll to than the view holds', () => {
    for (const { width, row } of scrolled) expect(6 * row.cell).toBeGreaterThan(width + BLEED);
  });

  it('still cuts the last cell in half at the largest text the name’s role allows', () => {
    // the name's role is capped at 1.6× (Text.tsx): four and a half still fit at every width
    for (const width of [272, 300, 324]) {
      const row = swatchRowLayout({ width, bleed: BLEED, names: NAMES, fontScale: 1.6 });
      expect(row.scroll).toBe(true);
      expect(row.visible).toBe(SWATCH_PEEK);
      expect(row.cell).toBeGreaterThanOrEqual(swatchMinCell(NAMES, 1.6));
    }
  });

  it('shows fewer whole cells, never a whole number of them, for names wider than that', () => {
    // not reachable through the capped role today; the rule holds for a caller that is not capped
    for (const scale of [2, 2.5, 3]) {
      const row = swatchRowLayout({ width: 272, bleed: BLEED, names: NAMES, fontScale: scale });
      expect(row.visible).toBeLessThan(SWATCH_PEEK);
      expect(row.visible % 1).toBe(0.5);
      expect(row.cell).toBeGreaterThanOrEqual(swatchMinCell(NAMES, scale));
    }
  });
});

describe('the swatch (tripwires over Swatch.tsx)', () => {
  it('writes the name inside its own target, so a cell is one press and one focus stop', () => {
    // the caption is a child of the Pressable, after the disc's box and before it closes
    const pressable = swatch.slice(swatch.indexOf('<Pressable'), swatch.indexOf('</Pressable>'));
    expect(pressable).toContain('{caption ? (');
    expect(pressable).toContain('{name}');
    // and the name is still said once, as "<Name> colors", with the lock's hint and the state
    // with the status word after it when there is one, drawn under the name (the app's quiet
    // "Plus" tag during the preview, 2026-09-28)
    expect(swatch).toContain(
      'accessibilityLabel={caption && badge ? `${name} colors, ${badge.label}` : `${name} colors`}',
    );
    expect(swatch).toContain("accessibilityHint: 'Included with Plus'");
    expect(swatch).toContain('accessibilityState={{ selected, disabled }}');
  });

  it('takes the row’s cell, and is never narrower than a target', () => {
    expect(swatch).toContain('width: Math.max(t.hit.min, width ?? t.hit.min)');
    expect(swatch).toContain('minHeight: t.hit.min');
  });

  it('draws its marks from the shared table, the lock included', () => {
    expect(swatch).toContain('const marks = choiceMarks(t.color);');
    expect(swatch).toContain("borderColor: selected ? marks.ring : 'transparent'");
    expect(swatch).toContain('<Icon name="lock" size={12} color={marks.lock} />');
  });
});
