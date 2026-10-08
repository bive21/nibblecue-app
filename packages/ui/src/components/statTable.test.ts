import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { drawIllustrated, ILLUSTRATED_MIN_SIZE } from '../icons/illustrated';
import { ICON_PATHS } from '../icons/paths';
import { space } from '../theme/theme';
import { COUNT_CHIP_LINE, COUNT_MARK } from './countRoll';
import { COUNT_CHIP } from './quickCapsule';
import {
  MONO_EM,
  STAT_BADGE,
  STAT_BADGE_CHROME,
  STAT_FIGURE_BLEED,
  STAT_FIGURE_FLOOR,
  STAT_FIGURE_GAP,
  STAT_FIGURE_ICON,
  STAT_FIGURE_ICON_GAP,
  STAT_FIGURE_ICON_ROOM,
  STAT_GAP_SIZE,
  STAT_GLYPH,
  STAT_HEADER_BLEED,
  STAT_LINE,
  STAT_LINE_EM,
  STAT_PAIR_GAP,
  STAT_PAIR_TUCK,
  STAT_PART_GAP,
  STAT_SECOND_LINE,
  STAT_SECOND_SIZES,
  STAT_TYPE,
  statBadgeText,
  statCellPad,
  statCellRoom,
  statColumns,
  statFigureIconInset,
  statFigureLine,
  statFigureRoom,
  statFigureRuns,
  statFigureText,
  statFigureWidth,
  statFit,
  statHeaderFit,
  statHeaderWidths,
  statLabelWidth,
  statNoteWidth,
  statPartsWidth,
  statRows,
  statSecondLine,
  statValueRuns,
  type StatFigureSpec,
} from './statTable';

const here = dirname(fileURLToPath(import.meta.url));
/** Comments out: the component explains itself, and a scan must not read the explanation. */
const code = (file: string): string =>
  readFileSync(join(here, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

/** Screen widths the app supports, and the Screen's own gutter either side (`space.xxl`). */
const PHONES = [320, 360, 375, 390, 393, 412, 414, 428, 430];
const table = (phone: number) => phone - 2 * space.xxl;
/** A third of a phone, three across. */
const third = (phone: number) => statCellRoom(table(phone), 3, 3);
const SCALES = [0.85, 1, 1.1, 1.24, 1.25, 1.4, 1.5, 1.6];

describe('the columns and the rows', () => {
  it('steps from three to two to one as the reader scales type up', () => {
    expect(statColumns(0.85)).toBe(3);
    expect(statColumns(1)).toBe(3);
    expect(statColumns(1.24)).toBe(3);
    expect(statColumns(1.25)).toBe(2);
    expect(statColumns(1.49)).toBe(2);
    expect(statColumns(1.5)).toBe(1);
    expect(statColumns(1.6)).toBe(1);
  });

  it('lays three cells out as one row, or a pair and a last cell that spans its row', () => {
    expect(statRows(['a', 'b', 'c'], 3)).toEqual([['a', 'b', 'c']]);
    expect(statRows(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
    expect(statRows(['a', 'b', 'c'], 1)).toEqual([['a'], ['b'], ['c']]);
  });

  it('gives each cell a third of the table less its edges and its padding', () => {
    // 320 pt: 284 of table, a point of edge each side and one per hairline, 11 of padding a side
    expect(statCellRoom(table(320), 3, 3)).toBeCloseTo((284 - 4) / 3 - 22, 6);
    // a last cell on its own row spans it, with the roomier padding of fewer columns
    expect(statCellRoom(table(320), 1, 2)).toBeCloseTo(284 - 2 - 28, 6);
    expect(statCellRoom(0, 3, 3)).toBe(0);
  });
});

describe('the figure line', () => {
  it('splits a length into its digits, its letters and the gap between its halves', () => {
    expect(statValueRuns('1h 35m')).toEqual([
      { text: '1', kind: 'big' },
      { text: 'h', kind: 'small' },
      { text: ' ', kind: 'gap' },
      { text: '35', kind: 'big' },
      { text: 'm', kind: 'small' },
    ]);
    // a decimal stays one number
    expect(statValueRuns('11.6')).toEqual([{ text: '11.6', kind: 'big' }]);
  });

  it('puts a unit after a gap, and holds one figure to a line', () => {
    expect(statFigureText(statFigureRuns({ value: '12', unit: 'oz' }))).toBe('12 oz');
    expect(statFigureText(statFigureRuns({ value: '45m' }))).toBe('45m');
    // the middle dot that joined a mixed day's two figures went with the shared line (2026-09-27)
    expect(code('statTable.ts')).not.toContain('STAT_FIGURE_JOIN');
    expect(code('statTable.ts')).not.toContain("'·'");
  });

  it('measures digits at the figure’s size, the rest at the unit’s, and a gap at its own width', () => {
    const digit = MONO_EM * STAT_TYPE.figure;
    const small = MONO_EM * STAT_TYPE.unit;
    expect(statFigureWidth(statFigureRuns({ value: '12', unit: 'oz' }))).toBeCloseTo(
      2 * digit + STAT_FIGURE_GAP + 2 * small,
      6,
    );
    expect(statFigureWidth(statFigureRuns({ value: '15h 20m' }))).toBeCloseTo(
      4 * digit + 2 * small + STAT_FIGURE_GAP,
      6,
    );
    // a gap's one space is set at the size that makes it that wide in the mono face
    expect(STAT_GAP_SIZE * MONO_EM).toBeCloseTo(STAT_FIGURE_GAP, 9);
  });

  /**
   * A NEWBORN'S DAY OF SLEEP, WHOLE, ON THE NARROWEST PHONE. At the figure's size throughout,
   * "15h 20m" was 89.6 pt in a 71.3 pt cell and broke into two numbers; with its letters small it
   * fits at the reader's own size.
   */
  it('keeps a long day of sleep at full size on a 320 pt phone', () => {
    const w = statFigureWidth(statFigureRuns({ value: '15h 20m' }));
    expect(statFit(third(320), w, 1)).toBe(1);
    expect(7 * MONO_EM * STAT_TYPE.figure).toBeGreaterThan(third(320));
  });
});

/**
 * A MIXED-FEEDING DAY'S MINUTES, ON A LINE OF THEIR OWN (the owner, 2026-09-27: *"then row 1, x oz
 * … then row 2 the breastfeeding 1h 37m"*): a figure a size under the ounces, in a note's line box,
 * never drawn under the report's floor.
 */
describe('the second figure line', () => {
  it('sets the digits at 15 and the letters at 11, a size under the figure', () => {
    expect(STAT_SECOND_SIZES).toEqual({ big: 15, small: 11 });
    const runs = statFigureRuns({ value: '1h 37m' });
    expect(statFigureWidth(runs, STAT_SECOND_SIZES)).toBeCloseTo(
      3 * MONO_EM * 15 + 2 * MONO_EM * 11 + STAT_FIGURE_GAP,
      9,
    );
    expect(statSecondLine({ value: '1h 37m' }, 1000, 1)).toEqual({ runs, fit: 1, short: false });
  });

  it('sits in a note’s line box, so the cell is no taller than its neighbors', () => {
    expect(STAT_SECOND_LINE).toBe(STAT_LINE.note);
    expect(STAT_LINE).toEqual({
      label: STAT_LINE_EM * STAT_TYPE.label,
      figure: STAT_LINE_EM * STAT_TYPE.figure,
      note: STAT_LINE_EM * STAT_TYPE.note,
    });
  });

  it('keeps the longest day at the breast at full size, three across on the narrowest phone', () => {
    for (const value of ['23h 59m', '15h 20m', '6h 35m', '1h 37m', '45m', '0m']) {
      const line = statSecondLine({ value }, third(320), 1);
      expect(line.fit, value).toBe(1);
    }
  });

  it('never draws its digits under the floor, at any phone or text size', () => {
    for (const phone of PHONES)
      for (const scale of SCALES) {
        const columns = statColumns(scale);
        const room = statCellRoom(table(phone), columns === 1 ? 1 : columns, columns);
        const line = statSecondLine({ value: '15h 20m' }, room, scale);
        expect(
          STAT_SECOND_SIZES.big * scale * line.fit,
          `${phone} ×${scale}`,
        ).toBeGreaterThanOrEqual(STAT_FIGURE_FLOOR);
      }
    // the smallest text a phone offers draws the digits at 12.75
    expect(STAT_SECOND_SIZES.big * 0.85).toBeCloseTo(12.75, 9);
  });
});

/**
 * A MIXED-FEEDING DAY'S FIGURES, EACH LED BY ITS MODULE'S PICTURE (the owner, 2026-09-27: *"add a
 * small icon on the left size before showing the oz, and breastfeeding icon before on the left
 * (before) how many minutes (both icons same like the main icon we use)"*): the Quick tile's own
 * picture at the one size that is still that picture, paid for by the cell's padding, so that the
 * figure beside it is drawn exactly as large as it would be alone — on a 320 or 360 pt phone too.
 */
describe('the picture before a figure', () => {
  const ounces = (value: string) => ({ value, unit: 'oz', figureIcon: 'bottle' as const });
  const minutes = (value: string) => ({ value, figureIcon: 'breast' as const });
  /** The same figure without its picture. */
  const bare = (f: StatFigureSpec): StatFigureSpec => ({
    value: f.value,
    ...(f.unit ? { unit: f.unit } : {}),
  });
  /** A day's bottles in every unit, the quarter ounce and a liter's two decimals the widest. */
  const AMOUNTS = [
    ...['0', '9.5', '12', '12.5', '29.75', '43.75', '99.75'].map(ounces),
    { value: '640', unit: 'mL', figureIcon: 'bottle' as const },
    { value: '1.25', unit: 'L', figureIcon: 'bottle' as const },
  ];
  const LENGTHS = ['0m', '45m', '1h 37m', '15h 20m', '23h 59m'];

  it('is drawn at the size that is still the owner’s picture, never the old glyph', () => {
    expect(STAT_FIGURE_ICON).toBe(ILLUSTRATED_MIN_SIZE);
    expect(STAT_FIGURE_ICON).toBe(16);
    for (const name of ['bottle', 'breast'] as const) {
      expect(drawIllustrated(name, STAT_FIGURE_ICON), name).toBe(true);
      // a point smaller is the stroke glyph the owner had taken off every screen (2026-09-26)
      expect(drawIllustrated(name, STAT_FIGURE_ICON - 1), name).toBe(false);
    }
    // a figure's own gap after it
    expect(STAT_FIGURE_ICON_GAP).toBe(STAT_FIGURE_GAP);
    expect(STAT_FIGURE_ICON_ROOM).toBe(STAT_FIGURE_ICON + STAT_FIGURE_ICON_GAP);
  });

  it('is paid for by the padding: half its room either side, inside the cell’s own', () => {
    expect(STAT_FIGURE_BLEED).toBe(STAT_FIGURE_ICON_ROOM / 2);
    expect(STAT_FIGURE_BLEED).toBe(10);
    // a point short of the padding three across, four at two across or one
    expect(statCellPad(3) - STAT_FIGURE_BLEED).toBe(1);
    expect(statCellPad(2) - STAT_FIGURE_BLEED).toBe(4);
    expect(statCellPad(1) - STAT_FIGURE_BLEED).toBe(4);
    // so the digits have the room they had
    expect(statFigureRoom(71.3)).toBe(71.3);
    expect(statFigureRoom(71.3, 'bottle')).toBeCloseTo(71.3, 9);
  });

  /**
   * THE PICTURE NEVER MAKES A FIGURE SMALLER (2026-09-27: the icons must not make the numbers shrink
   * on a 320 to 360 pt phone): at every phone width and text size, each figure behind its picture is
   * drawn exactly as it is without it — the same runs, the same fit.
   */
  it('costs the figure nothing, at every phone and text size', () => {
    for (const phone of PHONES)
      for (const scale of SCALES) {
        const columns = statColumns(scale);
        for (const inRow of columns === 1 ? [1] : columns === 2 ? [2, 1] : [3]) {
          const room = statCellRoom(table(phone), inRow, columns);
          const at = `${phone} ×${scale}`;
          for (const f of AMOUNTS)
            expect(statFigureLine(f, room, scale), `${at} ${f.value}`).toEqual(
              statFigureLine(bare(f), room, scale),
            );
          for (const f of LENGTHS.map(minutes))
            expect(statSecondLine(f, room, scale), `${at} ${f.value}`).toEqual(
              statSecondLine(bare(f), room, scale),
            );
        }
      }
    // `12.5 oz` fills a 320 pt phone's third and is drawn whole; `29.75 oz` gives to 18.6 there and
    // is whole from 360 — as they are alone. At the header's 4 pt of bleed they were 18.3 and 15.5
    const size = (value: string, phone: number) =>
      STAT_TYPE.figure * statFigureLine(ounces(value), third(phone), 1).fit;
    expect(size('12.5', 320)).toBe(STAT_TYPE.figure);
    expect(size('29.75', 320)).toBeCloseTo(18.59, 2);
    expect(size('29.75', 360)).toBe(STAT_TYPE.figure);
    for (const value of LENGTHS)
      expect(statSecondLine(minutes(value), third(320), 1).fit, value).toBe(1);
  });

  it('keeps the line and its picture inside the cell, at every phone and text size', () => {
    for (const phone of PHONES)
      for (const scale of SCALES) {
        const columns = statColumns(scale);
        for (const inRow of columns === 1 ? [1] : columns === 2 ? [2, 1] : [3]) {
          const room = statCellRoom(table(phone), inRow, columns);
          const at = `${phone} ×${scale}`;
          // the room and the bleed, at least a point short of the cell's edge either side
          const reach = room + 2 * STAT_FIGURE_BLEED;
          expect(reach, at).toBeLessThanOrEqual(room + 2 * (statCellPad(columns) - 1) + 1e-9);
          for (const f of AMOUNTS) {
            const line = statFigureLine(f, room, scale);
            expect(line.fit, `${at} ${f.value}`).toBeGreaterThan(0);
            const drawn = statFigureWidth(line.runs) * scale * line.fit;
            expect(drawn + STAT_FIGURE_ICON_ROOM, `${at} ${f.value}`).toBeLessThanOrEqual(
              reach + 1e-9,
            );
          }
          for (const f of LENGTHS.map(minutes)) {
            const line = statSecondLine(f, room, scale);
            const drawn = statFigureWidth(line.runs, STAT_SECOND_SIZES) * scale * line.fit;
            expect(drawn + STAT_FIGURE_ICON_ROOM, `${at} ${f.value}`).toBeLessThanOrEqual(
              reach + 1e-9,
            );
          }
        }
      }
  });

  it('never grows its line: it overhangs a line box lower than itself, and is centered on it', () => {
    for (const scale of SCALES)
      for (const box of [STAT_LINE.figure, STAT_SECOND_LINE]) {
        const inset = statFigureIconInset(box, scale);
        expect(inset).toBeLessThanOrEqual(0);
        // the picture's box, its margins included, is exactly as tall as the line's, or shorter
        expect(STAT_FIGURE_ICON + 2 * inset).toBeCloseTo(
          Math.min(STAT_FIGURE_ICON, box * scale),
          9,
        );
      }
    // the ounces' line holds it at every text size; the minutes' is 0.4 pt lower at the phone's own
    expect(statFigureIconInset(STAT_LINE.figure, 0.85)).toBe(0);
    expect(statFigureIconInset(STAT_SECOND_LINE, 1)).toBeCloseTo(-0.2, 9);
    expect(statFigureIconInset(STAT_SECOND_LINE, 1.1)).toBe(0);
  });
});

/**
 * THE LABEL AND ITS COUNT (the owner, 2026-09-27: *"change them from "FEEDING" to "FEEDING (15x)"
 * … circle them or highlight"*): the Quick tiles' own chip, beside the word, fitted with it as one
 * line.
 */
describe('the header', () => {
  it('is the Quick tiles’ count chip: its size, line, padding, hairline and mark', () => {
    expect(STAT_BADGE).toMatchObject({
      size: COUNT_CHIP.size,
      line: COUNT_CHIP_LINE,
      pad: COUNT_CHIP.pad,
      border: COUNT_CHIP.border,
      padV: 2,
    });
    expect(statBadgeText(15)).toBe(`15${COUNT_MARK}`);
    expect(statBadgeText(9)).toBe('9×');
    // and those are the numbers the tile's chip is drawn with
    const tile = code('QuickAction.tsx');
    expect(tile).toContain(
      "chip: { position: 'absolute', borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2, }",
    );
    expect(tile).toContain("chipText: { fontSize: 11.5, fontWeight: '700', lineHeight: 14 }");
    expect(tile).toContain(
      'backgroundColor: t.color.surfaceSolid, borderColor: t.color.line, borderRadius: t.radius.s,',
    );
    expect(tile).toContain('export const countMark = (n: number): string => `${n}×`;');
  });

  it('measures what grows with the text apart from what does not', () => {
    expect(statHeaderWidths('Sleep')).toEqual({ scaled: statLabelWidth('Sleep'), fixed: 0 });
    const { scaled, fixed } = statHeaderWidths('Feeding', 15);
    expect(scaled).toBeCloseTo(statLabelWidth('Feeding') + 3 * MONO_EM * STAT_BADGE.size, 9);
    expect(fixed).toBe(STAT_BADGE.gap + STAT_BADGE_CHROME);
    expect(STAT_BADGE_CHROME).toBe(2 * (1 + 5));
  });

  it('fits a label alone as any line, and the label and its chip together, a little wider', () => {
    expect(statHeaderFit(71.3, 'Feeding', undefined, 1)).toBe(
      statFit(71.3, statLabelWidth('Feeding'), 1),
    );
    // 320 pt, three across: held to the room the label would be 7.6 pt; with the bleed, 8.7
    const { scaled, fixed } = statHeaderWidths('Feeding', 15);
    expect(STAT_TYPE.label * statFit(third(320) - fixed, scaled, 1)).toBeCloseTo(7.632, 3);
    const fit = statHeaderFit(third(320), 'Feeding', 15, 1);
    expect(STAT_TYPE.label * fit).toBeCloseTo(8.736, 3);
    expect(STAT_HEADER_BLEED).toBe(space.xs);
    expect(STAT_HEADER_BLEED).toBeLessThan(11);
  });

  it('keeps the whole header inside its cell and its bleed, at every phone and text size', () => {
    for (const phone of PHONES)
      for (const scale of SCALES) {
        const columns = statColumns(scale);
        const room = statCellRoom(table(phone), columns === 1 ? 1 : columns, columns);
        for (const count of [1, 9, 15, 99]) {
          const fit = statHeaderFit(room, 'Feeding', count, scale);
          const { scaled, fixed } = statHeaderWidths('Feeding', count);
          const at = `${phone} ×${scale} ${count}×`;
          expect(scaled * scale * fit + fixed, at).toBeLessThanOrEqual(
            room + 2 * STAT_HEADER_BLEED + 1e-9,
          );
          // and a label is never drawn under the smallest text setting's own, a two-digit count
          // beside it
          if (count < 100)
            expect(STAT_TYPE.label * scale * fit, at).toBeGreaterThanOrEqual(
              STAT_TYPE.label * 0.85,
            );
        }
      }
  });
});

describe('the note line', () => {
  it('measures counts and glyphs, the gaps between them included, a pair overlapping', () => {
    const count = MONO_EM * STAT_TYPE.note;
    expect(statPartsWidth([{ count: '1', glyphs: 1 }])).toBeCloseTo(count + 2 + STAT_GLYPH, 6);
    expect(
      statPartsWidth([
        { count: '1', glyphs: 1 },
        { count: '2', glyphs: 1 },
        { count: '3', glyphs: 2 },
      ]),
    ).toBeCloseTo(3 * count + 3 * 2 + 4 * STAT_GLYPH + STAT_PAIR_GAP + 2 * STAT_PART_GAP, 6);
    expect(statPartsWidth([])).toBe(0);
    // the pair is narrower than two glyphs side by side: they overlap by the tuck
    expect(STAT_PAIR_GAP).toBeCloseTo(-(STAT_PAIR_TUCK / 24) * STAT_GLYPH, 9);
    expect(STAT_PAIR_GAP).toBeLessThan(-4);
  });

  it('charges a compared note for its arrow', () => {
    expect(statNoteWidth('same as yesterday', true)).toBeGreaterThan(
      statNoteWidth('same as yesterday'),
    );
  });

  it('bounds a label by its capitals and its tracking', () => {
    expect(statLabelWidth('Milk')).toBeCloseTo(4 * (0.66 * 10 + 0.8), 6);
  });
});

/**
 * THE SOLID PAIR, MEASURED FROM ITS OWN PATHS (the owner, 2026-09-27: *"remove the sapcing, theyre
 * supposed to be together"*). The pile and the drop are sampled as the phone draws them — each
 * shape's outline widened by half its stroke — and the drop's box is slid toward the pile's until the
 * two first meet: that is the tuck, and the table's is it and half a unit more.
 */
describe('a mixed diaper’s pile and drop touch', () => {
  type Pt = { x: number; y: number };
  /** The subpaths of an absolute M/C/S/H/A/Z path (and a relative `a`), as points along them. */
  function subpaths(d: string, per = 120): Pt[][] {
    const toks = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
    const out: Pt[][] = [];
    let i = 0;
    let cmd = '';
    let cur: Pt = { x: 0, y: 0 };
    let start: Pt = cur;
    let lastCtrl: Pt | null = null;
    let run: Pt[] = [];
    const num = () => Number(toks[i++]);
    const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt) => {
      for (let k = 1; k <= per; k += 1) {
        const t = k / per;
        const m = 1 - t;
        run.push({
          x: m ** 3 * p0.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t ** 3 * p3.x,
          y: m ** 3 * p0.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t ** 3 * p3.y,
        });
      }
    };
    const line = (to: Pt) => {
      for (let k = 1; k <= per; k += 1)
        run.push({ x: cur.x + ((to.x - cur.x) * k) / per, y: cur.y + ((to.y - cur.y) * k) / per });
    };
    /** A circular arc with no rotation, from its endpoints (SVG 1.1 F.6.5). */
    const arc = (r0: number, large: number, sweep: number, to: Pt) => {
      const hx = (cur.x - to.x) / 2;
      const hy = (cur.y - to.y) / 2;
      const r = Math.max(r0, Math.hypot(hx, hy));
      const k =
        (large === sweep ? -1 : 1) *
        Math.sqrt(Math.max(0, (r * r - hx * hx - hy * hy) / (hx * hx + hy * hy)));
      const cx = k * hy + (cur.x + to.x) / 2;
      const cy = -k * hx + (cur.y + to.y) / 2;
      const a0 = Math.atan2(cur.y - cy, cur.x - cx);
      let da = Math.atan2(to.y - cy, to.x - cx) - a0;
      if (sweep === 0 && da > 0) da -= 2 * Math.PI;
      if (sweep === 1 && da < 0) da += 2 * Math.PI;
      for (let n = 1; n <= per; n += 1)
        run.push({
          x: cx + r * Math.cos(a0 + (da * n) / per),
          y: cy + r * Math.sin(a0 + (da * n) / per),
        });
    };
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i]!)) cmd = toks[i++]!;
      let ctrl: Pt | null = null;
      if (cmd === 'M') {
        if (run.length) out.push(run);
        cur = { x: num(), y: num() };
        start = cur;
        run = [cur];
        cmd = 'L';
      } else if (cmd === 'L') {
        const to = { x: num(), y: num() };
        line(to);
        cur = to;
      } else if (cmd === 'H') {
        const to = { x: num(), y: cur.y };
        line(to);
        cur = to;
      } else if (cmd === 'C') {
        const p1 = { x: num(), y: num() };
        const p2 = { x: num(), y: num() };
        const to = { x: num(), y: num() };
        cubic(cur, p1, p2, to);
        ctrl = p2;
        cur = to;
      } else if (cmd === 'S') {
        const p1 = lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur;
        const p2 = { x: num(), y: num() };
        const to = { x: num(), y: num() };
        cubic(cur, p1, p2, to);
        ctrl = p2;
        cur = to;
      } else if (cmd === 'A' || cmd === 'a') {
        const r = num();
        num();
        num();
        const large = num();
        const sweep = num();
        const x = num();
        const y = num();
        const to = cmd === 'a' ? { x: cur.x + x, y: cur.y + y } : { x, y };
        arc(r, large, sweep, to);
        cur = to;
      } else if (cmd === 'Z' || cmd === 'z') {
        line(start);
        cur = start;
      } else throw new Error(`no ${cmd}`);
      lastCtrl = ctrl;
    }
    if (run.length) out.push(run);
    return out;
  }
  const HALF = 1.7 / 2;
  /** The widened shape's edge at height y, to the right (+1) or the left (−1). */
  const edge = (pts: readonly Pt[], y: number, side: 1 | -1): number => {
    let best = side > 0 ? -Infinity : Infinity;
    for (const p of pts) {
      const dy = Math.abs(p.y - y);
      if (dy > HALF) continue;
      const x = p.x + side * Math.sqrt(HALF * HALF - dy * dy);
      best = side > 0 ? Math.max(best, x) : Math.min(best, x);
    }
    return best;
  };
  const pathOf = (name: 'drop-solid' | 'poo-solid'): string => {
    const el = ICON_PATHS[name].elements[0];
    if (el?.type !== 'path') throw new Error(name);
    return el.d;
  };
  const [pile, ...grooves] = subpaths(pathOf('poo-solid'));
  const [drop] = subpaths(pathOf('drop-solid'));
  const area = (poly: readonly Pt[]) =>
    poly.reduce((s, a, i) => {
      const b = poly[(i + 1) % poly.length]!;
      return s + a.x * b.y - b.x * a.y;
    }, 0) / 2;

  it('draws each solid glyph filled and stroked in its one ink, on the outline’s own shape', () => {
    for (const [solid, outline] of [
      ['drop-solid', 'drop'],
      ['poo-solid', 'poo'],
    ] as const) {
      const def = ICON_PATHS[solid];
      expect(def).toMatchObject({ viewBox: '0 0 24 24', fill: 'none', strokeWidth: 1.7 });
      expect(def.elements).toHaveLength(1);
      expect(def.elements[0]).toMatchObject({ type: 'path', fill: 'currentColor' });
      // the outline's own silhouette, first
      const shape = ICON_PATHS[outline].elements[0];
      expect(
        shape?.type === 'path' && pathOf(solid).startsWith(shape.d.replace(/z$/i, '')),
        solid,
      ).toBe(true);
    }
  });

  it('leaves the pile’s two grooves open: wound against its outline, inside it, short of its sides', () => {
    expect(grooves).toHaveLength(2);
    expect(area(pile!)).toBeGreaterThan(0);
    for (const g of grooves) {
      // the other way round from the outline, so the nonzero rule leaves it unfilled
      expect(area(g)).toBeLessThan(0);
      let near = Infinity;
      for (const q of g)
        for (const p of pile!) near = Math.min(near, Math.hypot(p.x - q.x, p.y - q.y));
      // a third of a unit or more inside: with the stroke either side, two units of brown at the ends
      expect(near).toBeGreaterThan(0.3);
    }
  });

  it('pulls the drop over the pile until they meet, and half a unit more', () => {
    let reach = -Infinity;
    for (let y = 2; y <= 22; y += 0.02) {
      const r = edge(pile!, y, 1);
      const l = edge(drop!, y, -1);
      if (Number.isFinite(r) && Number.isFinite(l)) reach = Math.max(reach, r - l);
    }
    // the drop's box starts `reach` units after the pile's where the two first touch
    const touch = 24 - reach;
    expect(touch).toBeCloseTo(7.84, 1);
    expect(STAT_PAIR_TUCK - touch).toBeGreaterThan(0.4);
    expect(STAT_PAIR_TUCK - touch).toBeLessThan(0.6);
  });
});

describe('statFit — drawn smaller, never wrapped', () => {
  it('is 1 while a line fits and the share of the size at which it does after that', () => {
    expect(statFit(100, 80, 1)).toBe(1);
    expect(statFit(100, 200, 1)).toBeCloseTo(0.5, 9);
    // a line at a larger text size is wider, so it gives more
    expect(statFit(100, 80, 1.5)).toBeCloseTo(100 / 120, 9);
    // a smaller text size leaves the line as it is
    expect(statFit(100, 80, 0.85)).toBe(1);
    expect(statFit(0, 80, 1)).toBe(0);
    expect(statFit(100, 0, 1)).toBe(1);
  });

  it('always leaves the line inside its cell, at every phone and every text size', () => {
    const lines = [
      statFigureWidth(statFigureRuns({ value: '1200', unit: 'ml' })),
      statFigureWidth(statFigureRuns({ value: '9h 59m' }), STAT_SECOND_SIZES),
      statFigureWidth(statFigureRuns({ value: '23h 59m' })),
      statPartsWidth([
        { count: '12', glyphs: 1 },
        { count: '10', glyphs: 1 },
        { count: '11', glyphs: 2 },
      ]),
      statLabelWidth('Breastfed'),
      statNoteWidth('12 bottles'),
    ];
    for (const phone of PHONES)
      for (const scale of SCALES) {
        const columns = statColumns(scale);
        for (const inRow of columns === 1 ? [1] : columns === 2 ? [2, 1] : [3]) {
          const room = statCellRoom(table(phone), inRow, columns);
          for (const w of lines) {
            const fit = statFit(room, w, scale);
            expect(fit, `${phone} ${scale}`).toBeGreaterThan(0);
            expect(w * scale * fit, `${phone} ${scale}`).toBeLessThanOrEqual(room + 1e-9);
          }
        }
      }
  });
});

/**
 * THE SHORT FORM, ONLY UNDER THE FLOOR (2026-09-26). A volume whose digits would be drawn under the
 * floor is drawn in fewer of them. Since the mixed day's minutes have a line of their own
 * (2026-09-27) no figure Today draws comes near it; the choice stays for a volume that ever would.
 */
describe('statFigureLine — the exact figure wherever it fits, the short form only under the floor', () => {
  const quarter = { value: '29.75', unit: 'oz', short: { value: '30', unit: 'oz' } };
  const size = (fit: number, scale: number) => STAT_TYPE.figure * scale * fit;

  it('keeps the quarter on every phone, three across on the narrowest at 18.6 pt', () => {
    for (const phone of PHONES)
      for (const scale of SCALES) {
        const columns = statColumns(scale);
        const line = statFigureLine(quarter, statCellRoom(table(phone), columns, columns), scale);
        expect(line.short, `${phone} ×${scale}`).toBe(false);
        expect(statFigureText(line.runs)).toBe('29.75 oz');
        expect(size(line.fit, scale)).toBeGreaterThanOrEqual(STAT_FIGURE_FLOOR);
      }
    expect(size(statFigureLine(quarter, third(320), 1).fit, 1)).toBeCloseTo(18.6, 1);
  });

  it('draws the short form where the exact figure would fall under the floor, at its own fit', () => {
    const room = 40;
    const exact = statFigureRuns(quarter);
    expect(size(statFit(room, statFigureWidth(exact), 1), 1)).toBeLessThan(STAT_FIGURE_FLOOR);
    const line = statFigureLine(quarter, room, 1);
    expect(line.short).toBe(true);
    expect(statFigureText(line.runs)).toBe('30 oz');
    expect(line.fit).toBe(statFit(room, statFigureWidth(line.runs), 1));
    expect(size(line.fit, 1)).toBeGreaterThanOrEqual(STAT_FIGURE_FLOOR);
  });

  it('never shortens a figure that has no short form — a length, a count — however small it is', () => {
    const bare: StatFigureSpec[] = [
      { value: '23h 59m' },
      { value: '17' },
      { value: '12', unit: 'oz' },
    ];
    for (const cell of bare) {
      const line = statFigureLine(cell, 10, 1);
      expect(line.short).toBe(false);
      expect(statFigureText(line.runs)).toBe(`${cell.value}${cell.unit ? ` ${cell.unit}` : ''}`);
      expect(size(line.fit, 1)).toBeLessThan(STAT_FIGURE_FLOOR);
    }
  });

  it('takes a short form only when it is drawn larger than the exact figure', () => {
    // no narrower, so no larger: the exact figure stays
    const same = { value: '29.75', unit: 'oz', short: { value: '29.75', unit: 'oz' } };
    expect(statFigureLine(same, 20, 1).short).toBe(false);
    // a figure drawn small only because the reader's text is small has nothing to gain by rounding
    const whole = statFigureLine(quarter, 1000, 0.5);
    expect(whole.fit).toBe(1);
    expect(size(whole.fit, 0.5)).toBeLessThan(STAT_FIGURE_FLOOR);
    expect(whole.short).toBe(false);
  });
});

/**
 * HOW THE COMPONENT USES IT, read from the source — this suite has no renderer. Every text line is
 * one line and drawn at the fitted size, with `adjustsFontSizeToFit` as the insurance the other
 * one-line words in the design system carry; the counts and glyphs never wrap.
 */
describe('StatTable draws every line on one line', () => {
  const src = code('StatTable.tsx');

  it('holds the label and the figure to one line, at the fitted size, in their own boxes', () => {
    expect(src).toContain('<Label align="center" numberOfLines={1} adjustsFontSizeToFit');
    expect(src).toContain('fontSize: STAT_TYPE.label * labelFit');
    expect(src).toContain('lineHeight: STAT_LINE.label,');
    expect(src).toMatch(
      /<Numeric variant="statValue"[^>]*numberOfLines=\{1\} adjustsFontSizeToFit/,
    );
    expect(src).toContain(
      '{ fontSize: STAT_TYPE.figure * figureFit, lineHeight: STAT_LINE.figure },',
    );
  });

  it('leads a figure with its picture only where the cell gives one, no taller than its line', () => {
    // the ounces' line and the minutes' line, each with its own picture, in its own box
    expect(src).toContain('pictured( c.figureIcon, STAT_LINE.figure, figureInk, <Numeric');
    expect(src).toContain('pictured( c.also?.figureIcon, STAT_SECOND_LINE, secondInk, <Numeric');
    // a figure without one is the line alone, as it always was
    expect(src).toContain('figureIcon === undefined ? ( line ) : (');
    // the picture at its size, centered on the line, overhanging a lower box rather than growing it
    expect(src).toContain('<Icon name={figureIcon} size={STAT_FIGURE_ICON} color={ink} />');
    expect(src).toContain('<View style={{ marginVertical: statFigureIconInset(box, scale) }}>');
    expect(src).toContain(
      "pictured: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', },",
    );
    // side by side, a gap apart, allowed half the picture's room of the padding either side
    expect(src).toContain('{ gap: STAT_FIGURE_ICON_GAP, marginHorizontal: -STAT_FIGURE_BLEED },');
    // the figure beside it may be narrowed by the row, never the picture
    expect(src).toContain('besidePicture: { flexShrink: 1 },');
    expect(src).toContain('c.figureIcon ? styles.besidePicture : null,');
    // decoration to a screen reader, which hears the cell's own label
    expect(src).not.toMatch(/<Icon name=\{figureIcon\}[^>]*accessibilityLabel/);
  });

  it('draws a second figure on a line of its own, in a note’s box, in its own hue', () => {
    expect(src).toContain('const second = c.also ? statSecondLine(c.also, room, scale) : null;');
    expect(src).toContain(
      'fontSize: STAT_SECOND_SIZES.big * second.fit, lineHeight: STAT_SECOND_LINE,',
    );
    expect(src).toContain('alsoCat?.fg ?? cat?.fg ?? t.color.text');
    // the notes keep a note's box too, a sentence or counts and glyphs
    expect(src).toContain('{ lineHeight: STAT_LINE.note },');
    expect(src).toContain('fontSize: STAT_TYPE.note * noteFit, lineHeight: STAT_LINE.note,');
  });

  it('puts the count beside the label as the Quick tiles’ chip, as tall as the label’s line', () => {
    expect(src).toContain(
      'const badge = c.badge !== undefined && c.badge > 0 ? c.badge : undefined;',
    );
    expect(src).toContain('const labelFit = statHeaderFit(room, c.label, badge, scale);');
    expect(src).toContain('marginHorizontal: -STAT_HEADER_BLEED');
    expect(src).toContain(
      'marginVertical: -( (STAT_BADGE.line * labelFit - STAT_LINE.label) * scale + 2 * (STAT_BADGE.padV + STAT_BADGE.border) ) / 2,',
    );
    expect(src).toContain(
      'backgroundColor: t.color.surfaceSolid, borderColor: t.color.line, borderRadius: t.radius.s,',
    );
    expect(src).toContain(
      "style={{ fontSize: STAT_BADGE.size * labelFit, lineHeight: STAT_BADGE.line * labelFit, fontWeight: '700', }}",
    );
    expect(src).toContain('{statBadgeText(badge)}');
  });

  it('draws the counts and glyphs at the note’s fitted size, on a row that never wraps', () => {
    expect(src).toContain('size={px(STAT_GLYPH)}');
    expect(src).toContain('const px = (n: number) => n * scale * noteFit;');
    expect(src).toContain(
      "parts: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center' }",
    );
    // a part's second glyph is pulled back over the first: the pair touches
    expect(src).toContain('style={g === 0 ? null : { marginLeft: px(STAT_PAIR_GAP) }}');
  });

  it('asks `statFigureLine` which figure to draw, and says the exact one aloud', () => {
    expect(src).toContain('const { runs, fit: figureFit } = statFigureLine(c, room, scale);');
    // the spoken label is the exact figure: the component never reads the short form itself
    expect(src).toContain('c.accessibilityLabel ?? `${c.label}, ${c.value}');
    expect(src).not.toMatch(/c\.short/);
  });

  it('measures its own width, and guesses the first frame from the window', () => {
    expect(src).toContain('onLayout={onLayout}');
    expect(src).toContain('windowWidth - 2 * t.space.xxl');
  });

  it('writes no color: every ink is the theme’s', () => {
    expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
    expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
  });
});
