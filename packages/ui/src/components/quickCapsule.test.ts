/**
 * THE CAPSULE'S WORDS, WALKED (`quickCapsule.ts`; the owner, 2026-09-26: *"check the text warp in
 * capsule mode, it still shows "....." on my display"*). Every name a capsule can show, on every
 * phone from 320 to 430 pt a half point at a time, at every text size a phone offers — the name
 * whole, on two lines at most, never below the floor; the count beside the line or under it and
 * never over a word; and, over the component, no line in a capsule held to a number of lines.
 * This package cannot render React Native, so the arithmetic is proved here and the component is
 * held to it by tripwires; the app's own test holds the widths to the TTF it ships.
 */
import { MODULE_VARIANTS, MODULES } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { space, type as typeScale } from '../theme/theme';
import { PATH_WORD_EM } from './pathCard';
import {
  CAPSULE_CHIP_GAP,
  CAPSULE_LABEL,
  capsuleChrome,
  capsuleLabelFit,
  capsuleLines,
  capsuleSecondRow,
  capsuleTextWidth,
  capsuleTileWidth,
  countChipWidth,
  QUICK_HOLDER_CAPSULE,
  UI_BOLD_EM,
  UI_BOLD_FALLBACK_EM,
  uiBoldWidth,
} from './quickCapsule';
import { tileAlert, tileLine } from './quickLine';
import { ADVANCE, lineBudget, TILE_TRACKING } from './quickScale';
import { CAPS_ADVANCE } from './stepperMath';

const here = dirname(fileURLToPath(import.meta.url));
/** Comments out, whitespace flattened: the component explains its rules, and a scan must not read them. */
const component = readFileSync(join(here, 'QuickAction.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ');

/** Every name a capsule on Today can print: each quick-loggable module's, and each one's other word. */
const NAMES = [
  ...MODULES.filter(m => m.quickLog).map(m => m.label),
  ...Object.values(MODULE_VARIANTS).map(v => v.label),
];

/** Every phone from the 320 pt one to the largest, a half point apart. */
const PHONES = Array.from({ length: (430 - 320) * 2 + 1 }, (_, i) => 320 + i / 2);
/** The text sizes a phone offers, from Android's smallest to past every cap. */
const SCALES = [0.85, 1, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 2, 3] as const;

const nominalAt = (scale: number) => CAPSULE_LABEL.size * Math.min(scale, CAPSULE_LABEL.cap);

describe('a capsule’s room, as Today lays it out', () => {
  it('is the phone less its gutters and the grid’s, two to a row, less the capsule’s own edges', () => {
    expect(capsuleTileWidth(360)).toBe(158);
    expect(capsuleTileWidth(320)).toBe(138);
    expect(capsuleTileWidth(430)).toBe(193);
    // the hairline pair, the two gutters, the holder and the gap after it
    expect(capsuleChrome()).toBe(2 + space.sm + space.xl + QUICK_HOLDER_CAPSULE + space.md);
    expect(capsuleChrome()).toBe(66);
    expect(capsuleChrome(true)).toBe(68);
    expect(capsuleTextWidth(158)).toBe(92);
    expect(capsuleTextWidth(138)).toBe(72);
    expect(capsuleTextWidth(0)).toBe(0);
  });
});

describe('the name: whole, on two lines at most, never below the floor', () => {
  it('knows every character of every name, so none is measured by the fallback', () => {
    expect(NAMES).toContain('Temperature');
    expect(NAMES).toContain('Playtime');
    for (const name of NAMES)
      for (const c of name) expect(UI_BOLD_EM[c], `${name}: ${c}`).toBeDefined();
    // the fallback is the face's widest glyph, so an unforeseen character is measured too wide
    expect(UI_BOLD_FALLBACK_EM).toBe(Math.max(...Object.values(UI_BOLD_EM)));
  });

  it('measures in the face the path tiles and the steppers measure in — one TTF, one table', () => {
    for (const [word, em] of Object.entries(PATH_WORD_EM))
      expect(uiBoldWidth(word, 1), word).toBeCloseTo(em, 2);
    for (const [c, em] of Object.entries(CAPS_ADVANCE))
      if (c in UI_BOLD_EM) expect(UI_BOLD_EM[c], c).toBe(em);
  });

  it('fits every name on every phone at every text size — the walk the owner’s phone is one point of', () => {
    let walked = 0;
    for (const name of NAMES)
      for (const phone of PHONES)
        for (const scale of SCALES) {
          const room = capsuleTextWidth(capsuleTileWidth(phone));
          const fit = capsuleLabelFit(name, room, scale);
          const at = `${name} at ${phone} pt, ${scale}×`;
          expect(fit.fits, at).toBe(true);
          expect(fit.lines, at).toBeLessThanOrEqual(CAPSULE_LABEL.lines);
          // no word broken: every word is narrower than the column at the size it is drawn
          for (const word of name.split(' '))
            expect(uiBoldWidth(word, fit.size), `${at}: ${word}`).toBeLessThanOrEqual(room + 1e-9);
          expect(capsuleLines(name, room, fit.size), at).toBeLessThanOrEqual(2);
          // never bigger than the phone asked for, never smaller than the floor
          expect(fit.size, at).toBeLessThanOrEqual(nominalAt(scale) + 1e-9);
          expect(fit.size, at).toBeGreaterThanOrEqual(
            Math.min(CAPSULE_LABEL.floor, nominalAt(scale)) - 1e-9,
          );
          expect(fit.lineHeight, at).toBeCloseTo(
            (fit.size * CAPSULE_LABEL.lineHeight) / CAPSULE_LABEL.size,
            9,
          );
          walked += 1;
        }
    expect(walked).toBe(NAMES.length * PHONES.length * SCALES.length);
  });

  it('keeps the phone’s own size wherever the name fits it, and follows it to the chrome cap', () => {
    const at = (phone: number) => capsuleTextWidth(capsuleTileWidth(phone));
    expect(CAPSULE_LABEL.size).toBe(typeScale.bodySm.fontSize);
    expect(capsuleLabelFit('Bath', at(360), 1).size).toBe(13);
    expect(capsuleLabelFit('Bath', at(360), 1.3).size).toBeCloseTo(16.9, 9);
    // past the cap it stops growing: a tile's name is chrome in a box of a fixed width
    expect(capsuleLabelFit('Bath', at(360), 3).size).toBeCloseTo(20.8, 9);
    // "Temperature" fits a 360 dp phone's column at 1×, one line …
    expect(capsuleLabelFit('Temperature', at(360), 1)).toMatchObject({ size: 13, lines: 1 });
    // … and is made SMALLER on the 320 pt phone and at 1.3× text, where it used to break
    for (const [phone, scale] of [
      [320, 1],
      [360, 1.3],
    ] as const) {
      const fit = capsuleLabelFit('Temperature', at(phone), scale);
      expect(fit.size, `${phone}, ${scale}`).toBeLessThan(nominalAt(scale));
      expect(fit.size, `${phone}, ${scale}`).toBeGreaterThanOrEqual(CAPSULE_LABEL.floor);
      expect(uiBoldWidth('Temperature', nominalAt(scale)), `${phone}, ${scale}`).toBeGreaterThan(
        at(phone),
      );
    }
    // a name of two words takes its second line before it gives up any size
    expect(capsuleLabelFit('Tummy time', at(360), 1.6)).toMatchObject({ lines: 2 });
    expect(capsuleLabelFit('Tummy time', at(360), 1.6).size).toBeCloseTo(20.8, 9);
  });

  it('draws a name nobody has written yet at the floor, wrapping, rather than cutting it', () => {
    const fit = capsuleLabelFit('Supercalifragilistic', 72, 1);
    expect(fit.fits).toBe(false);
    expect(fit.size).toBe(CAPSULE_LABEL.floor);
    // and a column not measured yet is drawn at the phone's size, as a first frame is
    expect(capsuleLabelFit('Temperature', 0, 1.3).size).toBeCloseTo(16.9, 9);
  });
});

/**
 * THE COUNT AND THE LINE ON THE SECOND ROW, measured in the faces they are drawn in: the line in
 * the mono face (0.6 em a character, tracked in) or an alert in the UI face (its 0.53 bound), and
 * the chip's digits in the mono face. Beside each other when both fit; the chip under the line when
 * not — never one over the other.
 */
describe('the count: beside the line or under it, never over a word', () => {
  const LINES: readonly (readonly [string | undefined, string | undefined])[] = [
    ['37m', '4 oz'],
    ['2h 10m', '4 oz'],
    ['13h 14m', 'Both'],
    ['9m', '120 ml'],
    ['running', undefined],
    ['Now', '1.5 oz'],
  ];
  const ALERTS: readonly (readonly [string, string, string | undefined])[] = [
    ['due now', 'due', '1h 18m'],
    ['missed', 'missed', '14h 26m'],
    ['Vitamin D · missed', 'missed', '3h 5m'],
    ['never logged', 'never', undefined],
  ];
  const COUNTS = [1, 9, 10, 99, 120] as const;
  /** A line's width at `size`: n mono characters, tracked in — or n of the UI face's 0.53 bound. */
  const monoWidth = (line: string, size: number) =>
    Array.from(line).length * (size * ADVANCE.mono + TILE_TRACKING);
  const uiWidth = (line: string, size: number) => Array.from(line).length * size * ADVANCE.ui;

  it('measures the chip as it is drawn: its edges, and its digits and × in the mono face', () => {
    // "3×": a hairline and 5 either side, two characters of 11.5 pt mono
    expect(countChipWidth(3, 1)).toBeCloseTo(2 * (1 + 5) + 2 * 0.6 * 11.5, 9);
    expect(countChipWidth(12, 1)).toBeCloseTo(2 * (1 + 5) + 3 * 0.6 * 11.5, 9);
    // and it grows with the text to the chrome cap, as the `meta` role it is drawn in does
    expect(countChipWidth(3, 3)).toBeCloseTo(countChipWidth(3, 1.6), 9);
    expect(CAPSULE_CHIP_GAP).toBe(space.sm);
  });

  it('shares the row when both fit, wraps the chip under the line when not, and fits the line', () => {
    let beside = 0;
    let under = 0;
    let smaller = 0;
    for (const phone of PHONES.filter((_, i) => i % 4 === 0))
      for (const scale of SCALES) {
        const text = capsuleTextWidth(capsuleTileWidth(phone));
        const meta = typeScale.meta.fontSize * Math.min(scale, 1.6);
        for (const count of [0, ...COUNTS]) {
          const chip = count > 0 ? countChipWidth(count, scale) : 0;
          const rows = [
            ...LINES.map(
              ([since, detail]) =>
                [
                  capsuleSecondRow(text, chip, 'mono', meta, b => tileLine(since, detail, b)),
                  monoWidth,
                ] as const,
            ),
            ...ALERTS.map(
              ([why, short, since]) =>
                [
                  capsuleSecondRow(text, chip, 'ui', meta, b => tileAlert(why, short, b, since)),
                  uiWidth,
                ] as const,
            ),
          ];
          for (const [row, width] of rows) {
            const at = `${phone} pt, ${scale}×, ${count}×: "${row.line}"`;
            // never larger than the phone asked for, and never so small it stops being a line
            expect(row.size, at).toBeLessThanOrEqual(meta + 1e-9);
            expect(row.size, at).toBeGreaterThanOrEqual(10);
            if (row.size < meta - 1e-9) smaller += 1;
            if (row.chipBeside) {
              expect(width(row.line, row.size) + CAPSULE_CHIP_GAP + chip, at).toBeLessThanOrEqual(
                text + 1e-9,
              );
              beside += 1;
            } else {
              // the line has the column to itself, and the chip a row of its own under it
              expect(width(row.line, row.size), at).toBeLessThanOrEqual(text + 1e-9);
              expect(chip, at).toBeLessThanOrEqual(text);
              if (count > 0) under += 1;
            }
          }
        }
      }
    // all three happen: most phones keep the pair on one row, the narrowest at the largest text
    // put the chip under the line, and a word no rung can shorten ("Running") is drawn smaller
    expect(beside).toBeGreaterThan(under);
    expect(under).toBeGreaterThan(0);
    expect(smaller).toBeGreaterThan(0);
  });

  it('draws "Running" whole on the 320 pt phone at 1.5×, where one line of it used to be "Runni…"', () => {
    const text = capsuleTextWidth(capsuleTileWidth(320));
    const meta = typeScale.meta.fontSize * 1.5;
    expect(monoWidth('Running', meta)).toBeGreaterThan(text);
    const row = capsuleSecondRow(text, 0, 'mono', meta, b => tileLine('running', undefined, b));
    expect(row.line).toBe('Running');
    expect(row.size).toBeLessThan(meta);
    expect(monoWidth('Running', row.size)).toBeLessThanOrEqual(text + 1e-9);
  });

  it('gives the line the whole column when there is no count', () => {
    // 92 pt at 12 pt is thirteen mono characters: "37m ago·4 oz", with nothing beside it
    expect(lineBudget(92, 12, 'mono', TILE_TRACKING)).toBe(13);
    const row = capsuleSecondRow(92, 0, 'mono', 12, b => tileLine('37m', '4 oz', b));
    expect(row).toEqual({ line: '37m ago·4 oz', chipBeside: false, size: 12 });
    // with a count, the same phone keeps the pair on one row and the line gives up its "ago"
    const shared = capsuleSecondRow(92, countChipWidth(3, 1), 'mono', 12, b =>
      tileLine('37m', '4 oz', b),
    );
    expect(shared).toEqual({ line: '37m·4 oz', chipBeside: true, size: 12 });
  });
});

describe('QuickAction.tsx draws the capsule it was measured for (tripwires)', () => {
  const start = component.indexOf('const capsuleWords = capsuleTextWidth(tileNow, !!alertInk);');
  const end = component.indexOf('return ( <Pressable');
  const capsule = component.slice(start, end);

  it('holds no text in a capsule to a number of lines: nothing in it can end in "…"', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(capsule).not.toContain('numberOfLines');
    expect(capsule).not.toContain('ellipsizeMode');
  });

  it('draws the name at its fitted size with the phone’s scaling off, the size already having it', () => {
    expect(capsule).toContain(
      'const nameFit = capsuleLabelFit(label, capsuleWords, win.fontScale);',
    );
    expect(capsule).toContain(
      'allowFontScaling={false} style={[styles.bold, { fontSize: nameFit.size, lineHeight: nameFit.lineHeight }]}',
    );
  });

  it('puts the count on the second row, in its flow, and lets it wrap under the line', () => {
    expect(capsule).toContain('const capsuleChip = chipOf(styles.chipInRow);');
    expect(capsule).toContain('{capsuleChip}');
    expect(component).toContain(
      "capsuleSecond: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }",
    );
    expect(component).toContain("chipInRow: { position: 'relative', paddingVertical: 0 }");
    // and no capsule chip in a corner, over the name
    expect(component).toContain(
      "const chip = resolvedShape === 'capsule' ? null : chipOf(CHIP_CORNER[resolvedShape]);",
    );
    expect(component).toMatch(
      /const CHIP_CORNER: Record<Exclude<QuickShape, 'capsule'>, ViewStyle>/,
    );
    // the line and the chip are measured together, in the line's own face
    expect(capsule).toContain("capsuleSecondRow(capsuleWords, chipWide, 'ui', metaSize,");
    expect(capsule).toContain("capsuleSecondRow(capsuleWords, chipWide, 'mono', metaSize,");
    // and each line is drawn at the size the row fitted it to, the phone's scaling off
    expect(capsule.split('allowFontScaling={false}')).toHaveLength(4);
    expect(capsule).toContain('{ fontSize: second.size }');
  });

  it('measures the first frame from the window, not from the reference phone', () => {
    expect(component).toContain(
      "const tileNow = tileW > 0 ? tileW : resolvedShape === 'capsule' ? capsuleTileWidth(win.width) : 0;",
    );
  });
});
