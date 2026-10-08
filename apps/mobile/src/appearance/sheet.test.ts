/**
 * THE APPEARANCE SHEET, REORDERED AND MADE SMALLER (the owner, 2026-09-25):
 *
 *   - *"make theme (rolling day night dark) to be the first option to change, on top of color"*
 *   - *"color is taking too much space, make it fit into a 1 row 4/5 options, remove the
 *     description text below the color name"*
 *   - *"on the design selection theme, instead of showing just like liquid glass and paper,
 *     separate it into 2 sections options, left and right; and then has a 'preview' of what it is"*
 *
 * The design system proves the row's fit rule and the tiles' geometry over its own fixtures
 * (`packages/ui` `swatchRow.test.ts`, `skinTile.test.ts`). What is left is the app's half: that
 * the sheet puts the sections in the owner's order, feeds the row the words it really draws at the
 * width it really has, keeps every test id the flows and the gate map reach for, and sends every
 * tap through the one `pick`. The sheet is read, never imported: it pulls in React Native.
 */
import { SKIN_TILE, skinTilePair, swatchMinCell, swatchRowLayout } from '@nibblecue/ui/layout';
import { DEFAULT_SKIN, SKIN_NAMES } from '@nibblecue/ui/skins';
import { SCHEME_NAMES } from '@nibblecue/ui/appearance';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DESIGN_OPTIONS, SCHEME_OPTIONS, SKIN_OPTIONS } from './options';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, p), 'utf8');
/** Comments out: the sheet explains its rules, and a scan must not read the explanation. */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const sheet = code(read('AppearanceSheet.tsx'));
const flat = sheet.replace(/\s+/g, ' ');
const sample = code(read('DesignSample.tsx')).replace(/\s+/g, ' ');

/** The sheet's body at every width a phone can give it: the window less 2 × space.xxl. */
const BODIES = Array.from({ length: (430 - 272) * 2 + 1 }, (_, i) => 272 + i / 2);
const GUTTER = 18;

describe('the order: the look, its evening, then the palette, the tiles, and the material', () => {
  it('puts Theme first and Automatic night mode directly under it, then the rest', () => {
    const at = (s: string) => {
      const i = sheet.indexOf(s);
      expect(i, s).toBeGreaterThanOrEqual(0);
      return i;
    };
    const order = [
      at('<Label>Theme</Label>'),
      at('<ThemeSkyToggle'),
      at('<AutoDarkControls'),
      at('<Label>Color</Label>'),
      at('<Label>Shape</Label>'),
      at('<Label>Log row</Label>'),
      // how the app feels, then how it moves (2026-09-28): Vibration, then Calm motion
      at('<HapticsRow />'),
      at('<CalmMotionRow />'),
      at('<Label>Design</Label>'),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('keeps nothing between Theme’s own lines and the automatic control', () => {
    // the two answer the same question, so no other section may come between them
    const between = sheet.slice(
      sheet.indexOf('<ThemeSkyToggle'),
      sheet.indexOf('<AutoDarkControls'),
    );
    expect(between).not.toMatch(/<Label>/);
  });

  it('keeps every test id the flows and the gate map reach for', () => {
    for (const id of [
      'testID="appearance.sheet"',
      'testID="appearance.sheet.theme"',
      'testID="appearance.sheet.theme.system"',
      'testID="appearance.sheet.night_note"',
      'testID="appearance.sheet.auto_now"',
      'testID="appearance.sheet.auto_dark"',
      'testID={`appearance.sheet.scheme.${o.value}`}',
      'testID={`appearance.sheet.shape.${o.value}`}',
      'testID="appearance.sheet.logSlider"',
      'testID={`appearance.sheet.skin.${o.value}`}',
    ])
      expect(flat, id).toContain(id);
  });
});

describe('the colors, in one row', () => {
  it('draws every scheme as a named swatch, and no line describing it', () => {
    expect(flat).toContain('SCHEME_OPTIONS.map(o => ( <Swatch');
    expect(flat).toContain('name={o.label} caption width={colorRow.cell}');
    // the describing line is gone: nothing in the swatches' block reads a note
    const block = flat.slice(flat.indexOf('const swatches = SCHEME_OPTIONS.map('));
    expect(block.slice(0, block.indexOf('));'))).not.toContain('note');
    expect(sheet).not.toContain('o.note}</Meta>');
    // and the grid of three across with it
    expect(sheet).not.toContain("width: '33.333%'");
  });

  it('asks the row’s rule with the sheet’s own body, gutter and the names’ capped text size', () => {
    expect(flat).toContain(
      'const colorRow = swatchRowLayout({ width: bodyWidth, bleed: t.space.xxl, names: SCHEME_OPTIONS.map(o => o.label), fontScale: Math.min(win.fontScale, CHROME_FONT_CAP), });',
    );
  });

  it('scrolls sideways out to the sheet’s edge only when the rule says so', () => {
    expect(flat).toContain('{colorRow.scroll ? ( <ScrollView horizontal');
    expect(flat).toContain('style={{ marginHorizontal: -t.space.xxl }}');
    expect(flat).toContain('contentContainerStyle={{ paddingHorizontal: t.space.xxl }}');
  });

  it('sends every swatch through `pick`, so a sold color opens the gate over the sheet', () => {
    expect(flat).toContain("onPress={() => pick('scheme', o.value, { scheme: o.value })}");
    expect(flat).toContain("locked={isLocked('scheme', o.value, entitled)}");
    expect(flat).toContain('selected={resolved.scheme === o.value}');
  });

  it('fits all six across on every phone at the default text size, over the words it draws', () => {
    const names = SCHEME_OPTIONS.map(o => o.label);
    expect(SCHEME_OPTIONS.map(o => o.value)).toEqual(SCHEME_NAMES);
    for (const width of BODIES) {
      const row = swatchRowLayout({ width, bleed: GUTTER, names, fontScale: 1 });
      expect(row.scroll, `${width}`).toBe(false);
      expect(row.cell).toBeGreaterThanOrEqual(44);
    }
  });

  it('shows four and a half, never fewer than a target, where it scrolls at 1.3×', () => {
    const names = SCHEME_OPTIONS.map(o => o.label);
    for (const width of BODIES) {
      const row = swatchRowLayout({ width, bleed: GUTTER, names, fontScale: 1.3 });
      if (!row.scroll) continue;
      expect(row.visible).toBe(4.5);
      expect(row.cell).toBeGreaterThanOrEqual(swatchMinCell(names, 1.3));
    }
    // a 360 dp Android and every larger phone keep one row even there
    for (const width of [324, 339, 394])
      expect(swatchRowLayout({ width, bleed: GUTTER, names, fontScale: 1.3 }).scroll).toBe(false);
  });
});

describe('the design, as two pictures', () => {
  it('puts the default and free design on the left, the other on the right', () => {
    expect(DESIGN_OPTIONS.map(o => o.value)).toEqual([
      DEFAULT_SKIN,
      ...SKIN_NAMES.filter(s => s !== DEFAULT_SKIN),
    ]);
    expect(DESIGN_OPTIONS.map(o => o.label)).toEqual(['Paper', 'Liquid Glass']);
    // the same two options, words and all, as the popover's list
    expect([...DESIGN_OPTIONS].sort((a, b) => a.value.localeCompare(b.value))).toEqual(
      [...SKIN_OPTIONS].sort((a, b) => a.value.localeCompare(b.value)),
    );
  });

  it('draws them as tiles, not rows, in the order above', () => {
    expect(flat).toContain('DESIGN_OPTIONS.map(o => ( <SkinTile');
    expect(sheet).not.toContain('SKIN_OPTIONS');
    expect(flat).toContain('<DesignSample />');
    // the note is the picture's words for a screen reader, not a line on the page
    expect(flat).toContain('description={o.note}');
  });

  it('marks what is painted and locks what is sold, and every tap goes through `pick`', () => {
    expect(flat).toContain('selected={resolved.skin === o.value}');
    expect(flat).toContain("locked={isLocked('skin', o.value, entitled)}");
    expect(flat).toContain('lockedHint={hint}');
    expect(flat).toContain("onPress={() => pick('skin', o.value, { skin: o.value })}");
  });

  it('shares the body between the two, with the design system’s own gap', () => {
    expect(flat).toContain('const tiles = skinTilePair(bodyWidth);');
    expect(flat).toContain('width={tiles.tile}');
    expect(flat).toContain('{ gap: tiles.gap }');
    for (const width of BODIES) {
      const p = skinTilePair(width);
      expect(2 * p.tile + p.gap).toBeCloseTo(Math.min(width, SKIN_TILE.maxRoom), 6);
    }
  });
});

/**
 * THE SHAPES AND THE SIDEWAYS LOG ROW, SOLD SINCE 2026-10-01 (the owner: "make shapes other than
 * pebble also a plus feature, same with horizontal slider"). Locked the way a sold color or design
 * is on this sheet: the lock drawn from `isLocked` before the tap, the tap through the one `pick`,
 * what is PAINTED shown as chosen, and the quiet tag during the preview.
 */
describe('the shapes and the log row, locked before the tap', () => {
  it('checks the painted shape, locks the sold ones, and sends every tap through `pick`', () => {
    expect(flat).toContain('SHAPE_OPTIONS.map(o => ( <Row');
    expect(flat).toContain('selected={resolved.shape === o.value}');
    expect(flat).toContain("locked={isLocked('shape', o.value, entitled)}");
    expect(flat).toContain("onPress={() => pick('shape', o.value, { shape: o.value })}");
    expect(flat).toContain(
      "{...(looksTagged && isPlusLook('shape', o.value) ? { badge: PREVIEW_TAG } : {})}",
    );
    // the stored shape is never what is drawn as chosen: a Bubble the plan took back shows Pebble,
    // and the "On" badge the rows wore is the tag's place now
    expect(sheet).not.toContain('prefs.shape');
    expect(sheet).not.toContain('badge: ON');
  });

  it('rests the log row’s switch on what is painted, locks the swipe, and asks `pick` for the flip', () => {
    expect(flat).toContain('switchValue={resolved.logSlider}');
    expect(flat).toContain("onSwitch={on => pick('logRow', logRowOf(on), { logSlider: on })}");
    expect(flat).toContain("locked={isLocked('logRow', 'swipe', entitled)}");
    expect(flat).toContain(
      "{...(looksTagged && isPlusLook('logRow', 'swipe') ? { badge: PREVIEW_TAG } : {})}",
    );
    expect(sheet).not.toContain('prefs.logSlider');
    // nothing on the sheet writes a shape or the swipe around the gate
    expect(sheet).not.toMatch(/set\(\{ ?(shape|logSlider)/);
  });

  it('gives every lock on the sheet the one hint, read after the name', () => {
    expect(flat).toContain('const hint = `Included with ${plusName}`;');
    // the theme toggle's Night, the shape rows, the log row and the design tiles
    expect(flat.split('lockedHint={hint}').length - 1).toBe(4);
  });
});

describe('what a design tile shows (tripwires over DesignSample.tsx)', () => {
  it('is the real card holding the household’s own first three Quick tiles, as pebbles', () => {
    expect(sample).toContain('<Card>');
    expect(sample).toContain('<QuickAction');
    expect(sample).toContain('shape="pebble"');
    expect(sample).toContain('quickRow(source).slice(0, DESIGN_SAMPLE_TILES)');
    expect(sample).toContain('export const DESIGN_SAMPLE_TILES = 3;');
  });

  it('carries no times and no counts: a picture of a look is not a reading of the baby', () => {
    expect(sample).not.toMatch(/sinceLabel|countToday|detail=|alert=/);
  });

  it('is inert: no touch, nothing for a screen reader, a handler that does nothing on purpose', () => {
    expect(sample).toContain(
      '<View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"',
    );
    expect(sample).toContain('onPress={noop}');
  });
});
