/**
 * THE DAY'S TABLE AS NUMBERS — how wide each line of a `StatTable` cell is, and how far it is
 * drawn smaller so that it stays ONE line (the owner, 2026-09-26: *"in today's report, keep the
 * information in one line … this way description can be in oneline"*). Pure, so every phone width
 * and every text size is walked in node — this package's tests cannot render React Native — and
 * `StatTable.tsx` only hands these numbers to its Text and its glyphs.
 *
 * THREE LINES A CELL, AND EACH IS ONE LINE: the label, the figure, the note. A line that is wider
 * than its cell is DRAWN SMALLER, never wrapped and never cut to an ellipsis: a wrapped figure
 * ("15h" over "20m") reads as two numbers, and "1 wet · 1 dirty · 1…" was the defect of 2026-09-24
 * that made the diaper kinds a list — the list the owner has now asked to be one line again. A
 * mixed-feeding day keeps the three (2026-09-27): its label carries the day's count in a chip
 * (`statHeaderFit`), and its second figure, the minutes at the breast, is the third line, where
 * its neighbors' notes are (`STAT_SECOND_SIZES`). Each of its two figures is led by its module's
 * picture, which never gives and whose room comes out of the cell's padding, so the figure beside it
 * is drawn as large as it would be alone (`STAT_FIGURE_ICON`, `STAT_FIGURE_BLEED`).
 *
 * THE WIDTHS ARE BOUNDS, measured once from the faces the app ships (the app's own test re-reads
 * the TTFs and holds these to them, `screens/today/reportFit.test.ts`):
 *
 *   * IBM Plex Mono is a monospace, so a figure's digits and its small letters are exactly 0.6 em
 *     a character (`MONO_EM`). The statValue role's −0.4 tracking is left out: it only narrows a
 *     line, so leaving it out is the safe side.
 *   * The label is Hanken Grotesk Bold in capitals, tracked 0.8. 0.66 em a capital bounds every
 *     label the table draws (the widest, PUMPED, runs 0.648).
 *   * The note is Hanken Grotesk Regular. 0.53 em a character — the Quick tile's own bound for its
 *     proportional line (`ADVANCE.ui`) — bounds every note the table draws ("no naps" runs 0.504).
 *
 * A FIGURE'S UNITS ARE SMALL. "1h 35m" is the digits at the figure's size and its letters at the
 * unit's, in the quiet ink — the way a stepper's readout has always drawn a length
 * (`StepReadout`, `DURATION_UNIT_SCALE`) and the way this table already drew "12 oz". It is also
 * what keeps a newborn's day of sleep ("15h 20m") on one line of a third of a 320 pt phone at the
 * figure's full size: 52.8 pt of digits, 14.4 of letters and a 4 pt gap, in the 71.3 pt the cell
 * leaves — where the whole of it at the figure's size was 89.6 pt and broke in two.
 *
 * WHERE THE TABLE GIVES UP A COLUMN, twice. Three "4h 05m" values and their labels do not fit
 * across a 360 pt screen once the reader has scaled type up, and a clipped number is worse than
 * a taller table (docs/MOBILE.md §9) — so it steps to two and then to one rather than holding
 * three and truncating. 1.5 is the threshold `SummaryRow` used for the same reason; the step at
 * 1.25 is the extra one three columns needs. (Moved here from `StatTable.tsx` with the rest of the
 * arithmetic; the component re-exports them.)
 */
import { ILLUSTRATED_MIN_SIZE } from '../icons/illustrated';
import type { IconName } from '../icons/paths';
import { space, type as typeScale } from '../theme/theme';
import { COUNT_CHIP_LINE, COUNT_MARK } from './countRoll';
import { COUNT_CHIP } from './quickCapsule';
import { ADVANCE } from './quickScale';

export const STAT_TABLE_ONE_UP_SCALE = 1.5;
export const STAT_TABLE_TWO_UP_SCALE = 1.25;

/** The full column count, when type is at its normal size. */
export const STAT_TABLE_COLUMNS = 3;

/** How many columns the table lays out at this chrome font scale. */
export const statColumns = (scale: number): number =>
  scale >= STAT_TABLE_ONE_UP_SCALE ? 1 : scale >= STAT_TABLE_TWO_UP_SCALE ? 2 : STAT_TABLE_COLUMNS;

/** The cells in rows of `columns`; an odd last row is shorter, and its cells take the whole row. */
export function statRows<T>(cells: readonly T[], columns: number): T[][] {
  const per = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let i = 0; i < cells.length; i += per) rows.push(cells.slice(i, i + per));
  return rows;
}

/**
 * A cell's side padding: tighter at three across, where the cell gives up the room and the
 * numeral keeps its size (`StatCard` made the same trade for the same reason).
 */
export const statCellPad = (columns: number): number => (columns >= 3 ? space.lg : space.xl);

/**
 * WHAT A CELL LEAVES ITS LINES, in points: the table's width, less the surface's own edge on
 * both sides (at most a point each, `Surface`'s `bw`), shared between the cells of that row with
 * a point for each hairline between them, less the cell's padding on both sides. `cellsInRow` is
 * the row's own count, not the column count: an odd last cell spans its row.
 */
export const STAT_EDGE = 1;
export function statCellRoom(tableWidth: number, cellsInRow: number, columns: number): number {
  const n = Math.max(1, cellsInRow);
  const inner = tableWidth - 2 * STAT_EDGE - (n - 1) * STAT_EDGE;
  return Math.max(0, inner / n - 2 * statCellPad(columns));
}

/* ------------------------------------------------------------------------------- the sizes */

/** The three roles a cell is set in, read from the type scale so a token change moves the bound. */
export const STAT_TYPE = {
  label: typeScale.label.fontSize,
  labelTracking: typeScale.label.letterSpacing,
  figure: typeScale.statValue.fontSize,
  /** A figure's small parts — its unit, a length's letters. */
  unit: typeScale.meta.fontSize,
  note: typeScale.meta.fontSize,
} as const;

/** Advance bounds, in em — see the header for where each comes from. */
export const MONO_EM = ADVANCE.mono;
export const STAT_LABEL_EM = 0.66;
export const STAT_NOTE_EM = ADVANCE.ui;

/**
 * A LINE'S HEIGHT, in em of its size: both faces the table sets its words and figures in are 1.3 em
 * from the top of their ascent to the foot of their descent (Hanken Grotesk 1.303, IBM Plex Mono
 * 1.3; the app's test reads both out of the TTFs), and a line no taller than that is one the
 * platform lays out at its own height.
 */
export const STAT_LINE_EM = 1.3;

/**
 * EACH LINE'S BOX, at a text scale of 1 — the label's, the figure's and the note's — and a line KEEPS
 * it when it is drawn smaller to fit (2026-09-27). Left to itself a line is as tall as its type, so a
 * figure drawn at 0.6 of its size was a line 11 pt shorter than its neighbors' and pulled the note
 * under it up out of line with theirs. Held to these boxes, every cell is a label's line, a figure's
 * and a note's — whatever it holds, the mixed day's minutes in a note's box included — so the three
 * cells are one height and their lines stay level at every phone width and text size; a smaller
 * line sits in the middle of its box.
 */
export const STAT_LINE = {
  label: STAT_LINE_EM * STAT_TYPE.label,
  figure: STAT_LINE_EM * STAT_TYPE.figure,
  note: STAT_LINE_EM * STAT_TYPE.note,
} as const;

/**
 * THE NOTE AS COUNTS AND GLYPHS — the diaper kinds, "1 [drop] 2 [poo] 3 [poo][drop]" (the owner,
 * 2026-09-26). The count in the mono face at the note's size, its glyphs after it, the parts a
 * small gap apart. `STAT_GLYPH` is the glyph at a scale of 1: a little over the note's own 12 so
 * a drop and a pile read as pictures and not as punctuation, and under its line so the note line
 * is no taller than the others. 13 and not 14: at 14 the owner's own example — one wet, two
 * dirty, three mixed — was two points wider than a third of a 390 pt phone and had to give.
 *
 * The glyphs are SOLID since 2026-09-27 (`DIAPER_KIND_SOLID_GLYPHS` in `icons/paths.ts`): filled
 * in their own inks, on the outlines' own boxes, so nothing here moved but the pair's gap.
 */
export const STAT_GLYPH = 13;
/** Between a count and its first glyph. */
export const STAT_GLYPH_GAP = 2;
/**
 * A MIXED DIAPER'S PILE AND DROP TOUCH, AS ONE MARK (the owner, 2026-09-27: *"there is spacing
 * between the poo icon and water icon, remove the sapcing, theyre supposed to be together to better
 * indicate what that means"*). Each glyph is drawn in a 24-unit box with air either side of its
 * shape, and a point between the boxes left the two about five points apart. So the drop's box is
 * pulled OVER the pile's by `STAT_PAIR_TUCK` of those units: 7.84 is where the drop's lower left
 * meets the pile's lowest tier (the two solid shapes' own edges, their strokes included — the
 * package's test finds the contact from the paths themselves), and half a unit more, so a layout
 * rounded to a 2× screen's pixels never opens a hairline between them. The drop is drawn last, so
 * that half unit is the drop's blue over the pile's brown, at the one place they meet.
 */
export const STAT_PAIR_TUCK = 8.34;
/** Between the two glyphs of one part: negative, the tuck at the glyph's size (−4.5 pt at 13). */
export const STAT_PAIR_GAP = -(STAT_PAIR_TUCK / 24) * STAT_GLYPH;
/** Between one part and the next. */
export const STAT_PART_GAP = space.sm;
/** The trend arrow a compared note carries before it, and the gap after it. */
export const STAT_TREND = 14;
export const STAT_TREND_GAP = space.xs;

/* ------------------------------------------------------------------------------ the figure */

/** One figure: `12` and `oz`, or `1h 20m` with no unit (its letters are its units). */
export interface StatFigureSpec {
  value: string;
  unit?: string;
}

/**
 * A run of one figure line: DIGITS at the figure's size, SMALL parts (a unit, a length's letters)
 * at the unit's, or a GAP — one space, set at the size that makes it `STAT_FIGURE_GAP` wide. A
 * monospace sets a space as wide as a digit, so a space at the unit's size would be 7.2 pt of air
 * for the 4 pt the table has always put between "12" and "oz"; the gap is its own span so the line
 * keeps its old spacing and a third of a phone keeps the room.
 */
export type StatRunKind = 'big' | 'small' | 'gap';

export interface StatRun {
  text: string;
  kind: StatRunKind;
}

/** The air between a figure and its unit, and between a length's two halves. */
export const STAT_FIGURE_GAP = space.xs;

/** The font size a gap's one space is set at, so that it is `STAT_FIGURE_GAP` wide in the mono face. */
export const STAT_GAP_SIZE = STAT_FIGURE_GAP / MONO_EM;

/** Digits, a decimal point or a comma between them: the big part. Spaces: gaps. The rest: small. */
const PARTS = /([0-9.,]+)|(\s+)|([^0-9.,\s]+)/g;

/** A value split into its digits, its letters and its gaps: `1h 35m` → `1` `h` ` ` `35` `m`. */
export function statValueRuns(value: string): StatRun[] {
  const out: StatRun[] = [];
  for (const m of value.matchAll(PARTS)) {
    if (m[1] !== undefined) out.push({ text: m[1], kind: 'big' });
    else if (m[2] !== undefined) out.push({ text: ' ', kind: 'gap' });
    else if (m[3] !== undefined) out.push({ text: m[3], kind: 'small' });
  }
  return out;
}

/**
 * ONE FIGURE AS RUNS: its digits and letters, and its unit after a gap. A line holds one figure:
 * the mixed-feeding day's ounces and minutes shared a line after a middle dot until 2026-09-27, and
 * each has a line of its own now (`STAT_SECOND_SIZES`).
 */
export function statFigureRuns(figure: StatFigureSpec): StatRun[] {
  const out = statValueRuns(figure.value);
  if (figure.unit) out.push({ text: ' ', kind: 'gap' }, { text: figure.unit, kind: 'small' });
  return out;
}

/** The line as it reads: `12 oz`. For a test and for nothing a parent sees. */
export const statFigureText = (runs: readonly StatRun[]): string => runs.map(r => r.text).join('');

/** The two sizes a figure line is set in, at a text scale of 1: its digits, and its small parts. */
export interface StatFigureSizes {
  readonly big: number;
  readonly small: number;
}

/** The figure line: the `statValue` digits and the `meta` small parts. */
export const STAT_FIGURE_SIZES: StatFigureSizes = { big: STAT_TYPE.figure, small: STAT_TYPE.unit };

/**
 * How wide a figure line is at a text scale of 1: mono digits at its `big` size, small parts at its
 * `small` one, and each gap its own fixed width.
 */
export const statFigureWidth = (
  runs: readonly StatRun[],
  sizes: StatFigureSizes = STAT_FIGURE_SIZES,
): number =>
  runs.reduce(
    (w, r) =>
      w +
      (r.kind === 'gap'
        ? STAT_FIGURE_GAP
        : [...r.text].length * MONO_EM * (r.kind === 'big' ? sizes.big : sizes.small)),
    0,
  );

/* --------------------------------------------------------------- the second figure line */

/**
 * A MIXED-FEEDING DAY'S SECOND FIGURE, ON A LINE OF ITS OWN (the owner, 2026-09-27: *"feeding in
 * today home page reeport is way too long when having both bottle and breastfeed, making the text to
 * small … then row 1, x oz (still int he same golden color), then row 2 the breastfeeding 1h 37m"*).
 * `29.75 oz · 3h 45m` was one line, 157.6 pt wide at the figure's size, and in a third of a 390 pt
 * phone it was drawn at 13 pt; the ounces alone are 84.4 pt and never give below 18.6 on any phone,
 * their picture beside them or not (`STAT_FIGURE_BLEED`).
 *
 * The minutes take the third line, where the neighbors' notes are ("4 naps", the diaper kinds), so
 * the three cells stay one height and their lines stay level: the label, then the figure — the
 * ounces — then the minutes. They are a figure still — the mono face, the digits in breastfeeding's
 * own hue and the letters small in the quiet ink — set at 15 over the units' 11, in a note's line
 * box (`STAT_SECOND_LINE`, `STAT_LINE.note`) so the cell is no taller than its neighbors.
 *
 * 15, because the digits must never be drawn under the report's floor (`STAT_FIGURE_FLOOR`) and the
 * smallest text a phone offers draws them at 0.85 of their size: 15 is 12.75 there. Much larger
 * would not sit in a note's line: the digits' tops must clear it where Android keeps the whole of
 * the face's descent (a 15.6 pt line holds 11.5 pt of ascent at 15, and the digits stand 10.5).
 * 11 for the letters keeps them a size under the digits, as a figure's units are, and at the
 * smallest text the phone offers they are 9.35, over the notes' own floor.
 */
export const STAT_SECOND_SIZES: StatFigureSizes = { big: 15, small: 11 };

/** The second figure's line box: a note's, so the cell is no taller than one with a note. */
export const STAT_SECOND_LINE = STAT_LINE.note;

/* ------------------------------------------------------------------------------ the header */

/**
 * THE DAY'S COUNT BESIDE THE LABEL — "FEEDING [15×]" — on a mixed-feeding day (the owner,
 * 2026-09-27: *"change them from "FEEDING" to "FEEDING (15x)" the 15x indicates how many feed
 * sessions done today and circle them or highlight"*). It is drawn as the Quick tiles' own count
 * chip (`QuickAction`'s `chip`, `COUNT_CHIP` and `COUNT_CHIP_LINE`): the same fill, hairline, radius,
 * face, weight and size, and the same `×`, so the report's count and a tile's read as one family.
 * It replaces the "15 feeds" line that stood under the figure.
 */
export const STAT_BADGE = {
  size: COUNT_CHIP.size,
  line: COUNT_CHIP_LINE,
  pad: COUNT_CHIP.pad,
  /** QuickAction's `chip`: 2 above and below its line. */
  padV: 2,
  border: COUNT_CHIP.border,
  /** Between the label and the chip. */
  gap: space.xs,
} as const;

/**
 * HOW FAR A HEADER THAT CARRIES A CHIP MAY RUN INTO THE CELL'S SIDE PADDING, each side. "FEEDING"
 * and a two-digit chip are 88.5 pt at the bound, in the 71.3 a third of a 320 pt phone leaves: held
 * to the room alone the label would be drawn at 7.6 pt. Four of the padding's eleven points a side
 * let it stay at 8.7, over the smallest text setting's own label, and leave seven to the hairline.
 * Only a header with a chip does this, and only as far as its line needs.
 */
export const STAT_HEADER_BLEED = space.xs;

/** The chip's words: the count and its mark — `15×`, as a Quick tile writes it (`countMark`). */
export const statBadgeText = (count: number): string =>
  `${Math.max(0, Math.round(count))}${COUNT_MARK}`;

/** A chip's hairline and padding, either side: its width that does not grow with the text. */
export const STAT_BADGE_CHROME = 2 * (STAT_BADGE.border + STAT_BADGE.pad);

/**
 * How wide a header is at a text scale of 1, in two parts: what grows with the text (the label and
 * the chip's digits) and what does not (the gap and the chip's hairline and padding).
 */
export function statHeaderWidths(label: string, badge?: number): { scaled: number; fixed: number } {
  if (badge === undefined) return { scaled: statLabelWidth(label), fixed: 0 };
  const chars = [...statBadgeText(badge)].length;
  return {
    scaled: statLabelWidth(label) + chars * MONO_EM * STAT_BADGE.size,
    fixed: STAT_BADGE.gap + STAT_BADGE_CHROME,
  };
}

/**
 * HOW FAR A HEADER IS DRAWN SMALLER TO STAY ONE LINE: the label alone as any line is
 * (`statFit`), or the label and the chip together, drawn smaller as one — the gap and the chip's
 * hairline and padding keep their points — in the room plus `STAT_HEADER_BLEED` either side.
 */
export function statHeaderFit(room: number, label: string, badge?: number, scale = 1): number {
  if (badge === undefined) return statFit(room, statLabelWidth(label), scale);
  const { scaled, fixed } = statHeaderWidths(label, badge);
  return statFit(room + 2 * STAT_HEADER_BLEED - fixed, scaled, scale);
}

/* --------------------------------------------------------------------- a figure's picture */

/**
 * A MIXED-FEEDING DAY'S FIGURES, EACH LED BY ITS MODULE'S PICTURE — the bottle before the ounces,
 * breastfeeding's picture before the minutes (the owner, 2026-09-27: *"add a small icon on the left
 * size before showing the oz, and breastfeeding icon before on the left (before) how many minutes
 * (both icons same like the main icon we use)"*). The name is the Quick tile's own (`MODULE_ICON`,
 * which the app's `rows.ts` holds to), and `Icon` draws it.
 *
 * 16, BECAUSE THAT IS WHERE IT IS STILL THE PICTURE. `Icon` draws the owner's picture of a module at
 * `ILLUSTRATED_MIN_SIZE` and up and the old stroke glyph under it, which the owner had removed from
 * every screen (2026-09-26, `pictureSize.scan.test.ts`), so the 14 or 15 of a cap height would be
 * the wrong drawing, not a smaller one. 16 is the ounces' cap height near enough (15.4 at 22; the
 * app's test reads it out of the TTF), and it is one size on both lines. Like the trend arrow and
 * the disc's glyph, it keeps its size at every text size, and it never shrinks with a line that is
 * drawn smaller: under 16 it would be the old glyph again.
 */
export const STAT_FIGURE_ICON = ILLUSTRATED_MIN_SIZE;
/** Between the picture and the figure: the gap a figure keeps between its digits and its unit. */
export const STAT_FIGURE_ICON_GAP = STAT_FIGURE_GAP;
/** What the picture takes from its line, its gap included. Neither gives when the line does. */
export const STAT_FIGURE_ICON_ROOM = STAT_FIGURE_ICON + STAT_FIGURE_ICON_GAP;
/**
 * HOW FAR A FIGURE LINE THAT CARRIES A PICTURE MAY RUN INTO THE CELL'S SIDE PADDING, each side: half
 * the picture's room, so the picture is paid for by the padding and never by the digits. They were
 * to lose nothing to it (2026-09-27: the icons must not make the numbers shrink on a 320 to 360 pt
 * phone), and a third of a phone had nothing to spare: `12.5 oz` fills the 71.3 pt of a 320 pt
 * phone's third, and `29.75 oz` gives to 18.6 pt there and to 22 only from 360. Held to the header's
 * 4 pt of bleed, the picture took those two to 18.3 and 15.5 pt.
 *
 * So a line can come within a point of its cell's edge, three across, when its digits fill their
 * room — a figure that already fills its third on a small phone, and the picture beside it — and
 * within four at two across or one (`statCellPad`). A line that fits leaves the padding alone: it is
 * centered, as every line is. Only a line led by a picture does this.
 */
export const STAT_FIGURE_BLEED = STAT_FIGURE_ICON_ROOM / 2;

/**
 * THE ROOM A FIGURE LINE'S DIGITS AND LETTERS HAVE: the cell's, or with a picture before them the
 * cell's and the bleed either side, less the picture and its gap — which comes to the cell's again,
 * by the bleed's own choice (`STAT_FIGURE_BLEED`). `statFit` over this room is how far the digits and
 * letters give; the picture keeps its points.
 */
export const statFigureRoom = (room: number, figureIcon?: IconName): number =>
  figureIcon === undefined ? room : room + 2 * STAT_FIGURE_BLEED - STAT_FIGURE_ICON_ROOM;

/**
 * HOW FAR THE PICTURE REACHES PAST ITS LINE'S BOX, above and below, as a (negative) margin that keeps
 * the box: `box` is the line's height at a text scale of 1 (`STAT_LINE.figure`, `STAT_SECOND_LINE`),
 * which grows with `scale`. The ounces' 28.6 holds it at every text size; the minutes' 15.6 is a
 * little under 16 up to 1.03, so there the picture overhangs its line, as the header's chip does,
 * and the cell keeps its height.
 */
export const statFigureIconInset = (box: number, scale = 1): number =>
  Math.min(0, (box * scale - STAT_FIGURE_ICON) / 2);

/* --------------------------------------------------------------------- the label and the note */

/** How wide a label is at a scale of 1: its capitals at the bound, and the tracking after each. */
export const statLabelWidth = (label: string): number => {
  const n = [...label].length;
  return n * (STAT_LABEL_EM * STAT_TYPE.label + STAT_TYPE.labelTracking);
};

/** How wide a note is at a scale of 1, with the trend arrow before it when it carries one. */
export const statNoteWidth = (note: string, trend = false): number =>
  [...note].length * STAT_NOTE_EM * STAT_TYPE.note + (trend ? STAT_TREND + STAT_TREND_GAP : 0);

/** One part of a note drawn as counts and glyphs: `2` and the glyphs that say what of. */
export interface StatPartSpec {
  count: string;
  /** How many glyphs follow the count: one for wet or dirty, two for mixed. */
  glyphs: number;
}

/**
 * How wide a note of parts is at a scale of 1 (its gaps scale with it, as the glyphs do). A mixed
 * part's two glyphs overlap by the tuck (`STAT_PAIR_GAP` is negative), so the pair is narrower
 * than two boxes.
 */
export function statPartsWidth(parts: readonly StatPartSpec[]): number {
  let w = 0;
  parts.forEach((p, i) => {
    if (i > 0) w += STAT_PART_GAP;
    w += [...p.count].length * MONO_EM * STAT_TYPE.note;
    if (p.glyphs > 0) w += STAT_GLYPH_GAP + p.glyphs * STAT_GLYPH + (p.glyphs - 1) * STAT_PAIR_GAP;
  });
  return w;
}

/* ------------------------------------------------------------------------------------ fit */

/**
 * HOW FAR A LINE IS DRAWN SMALLER TO STAY ONE LINE: 1 when it fits at the reader's text size,
 * otherwise the share of that size at which it does. `scale` is the chrome font scale the Text
 * will be drawn at (the OS scale, capped at 1.6 — `CHROME_FONT_CAP`), because a line set at 1.3×
 * is 1.3 times as wide. There is no floor: a line drawn smaller is still the whole line, and a
 * floor would only buy back the wrap it exists to prevent — the app's test holds that the lines
 * the table really draws stay legible on the narrowest phone (`reportFit.test.ts`).
 */
export function statFit(room: number, width: number, scale = 1): number {
  if (!(width > 0) || !(scale > 0)) return 1;
  if (!(room > 0)) return 0;
  return Math.min(1, room / (width * scale));
}

/**
 * What `adjustsFontSizeToFit` may still take, on top of the fit: the insurance the other one-line
 * words in this design system carry (`PICTURE_WORD.shrink`) for a character the bound did not
 * foresee — the system face before the app's own has loaded, say. Smaller and whole, on one
 * line; never cut.
 */
export const STAT_FIT_INSURANCE = 0.8;

/* ------------------------------------------------------------------------ the short form */

/**
 * THE SMALLEST A FIGURE'S DIGITS ARE DRAWN, in points — the floor the app's test holds every heavy
 * day to on the narrowest phone (`reportFit.test.ts`), the second figure line's included. It is not
 * lowered to let a figure through (2026-09-26): a figure that would be drawn under it is drawn in
 * its SHORT FORM instead, where it has one. Since the mixed day's minutes moved to a line of their
 * own (2026-09-27), no figure Today draws comes near it — a volume gives to 18.6 at worst, its
 * picture beside it or not — and the short form stays for a volume that ever would (Pumped's among
 * them).
 */
export const STAT_FIGURE_FLOOR = 11.5;

/** A figure, and the picture its line may lead with. */
export interface StatPicturedFigure extends StatFigureSpec {
  /**
   * The module's picture before the figure (`STAT_FIGURE_ICON`). It never gives, and its room comes
   * out of the cell's padding (`STAT_FIGURE_BLEED`, `statFigureRoom`).
   */
  figureIcon?: IconName;
}

/** A cell's figure line as the table reads it: the figure, its picture and its short form. */
export interface StatFigureCell extends StatPicturedFigure {
  /**
   * THE FIGURE IN FEWER DIGITS — `30` `oz` for `29.75` `oz` — drawn in place of `value` and `unit`
   * only where they would be drawn under the floor (`statFigureLine`). A figure without one (a
   * length, a count) never is.
   */
  short?: StatFigureSpec;
}

/** The figure line a cell draws: its runs, how far they give to stay one line, and which form. */
export interface StatFigureLine {
  runs: StatRun[];
  fit: number;
  /** Whether the line is the short form. */
  short: boolean;
}

/**
 * WHICH FIGURE A CELL DRAWS, AND HOW SMALL: the exact figure wherever its digits are drawn at the
 * floor or larger, and the short form only where they would not be — decided by the arithmetic the
 * line's fit already is (`statFit` over `statFigureWidth`), so `StatTable` and the app's test make
 * the same choice at every phone and text size. The short form is taken only when it is drawn larger
 * than the exact figure would be: a rounding that buys no size is precision thrown away. A line led
 * by a picture fits in what the picture leaves it (`statFigureRoom`).
 */
export function statFigureLine(cell: StatFigureCell, room: number, scale = 1): StatFigureLine {
  const digits = statFigureRoom(room, cell.figureIcon);
  const exact = statFigureRuns(cell);
  const fit = statFit(digits, statFigureWidth(exact), scale);
  if (cell.short === undefined || STAT_TYPE.figure * scale * fit >= STAT_FIGURE_FLOOR)
    return { runs: exact, fit, short: false };
  const runs = statFigureRuns(cell.short);
  const shortFit = statFit(digits, statFigureWidth(runs), scale);
  return shortFit > fit ? { runs, fit: shortFit, short: true } : { runs: exact, fit, short: false };
}

/**
 * THE SECOND FIGURE'S LINE: its runs at `STAT_SECOND_SIZES`, and how far they give to stay one
 * line. A length never has a short form, and the minutes at the breast never need one — "15h 20m"
 * at these sizes is 53.2 pt, in the 71.3 of the narrowest phone's third, and 73.2 behind their
 * picture, in the 91.3 that third has with the bleed.
 */
export function statSecondLine(
  figure: StatPicturedFigure,
  room: number,
  scale = 1,
): StatFigureLine {
  const runs = statFigureRuns(figure);
  return {
    runs,
    fit: statFit(
      statFigureRoom(room, figure.figureIcon),
      statFigureWidth(runs, STAT_SECOND_SIZES),
      scale,
    ),
    short: false,
  };
}
