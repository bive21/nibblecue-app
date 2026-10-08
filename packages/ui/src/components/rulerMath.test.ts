/**
 * THE RULER, PROVED IN NODE (`rulerMath.ts`; the owner, 2026-09-26: entering an ounce or a minute
 * was "very repetitive"). This suite cannot render React Native, so everything the ruler decides is
 * here as arithmetic: where each tick stands and what it says, that a value and its scroll offset
 * are the same thing both ways round, that a drag tells the sheet no faster than the hold does, and
 * that the whole control fits every phone from 308 to 430 pt at every text size up to the chrome cap.
 */
import { describe, expect, it } from 'vitest';
import { hit, space } from '../theme/theme';
import {
  CAPTION_ADVANCE_EM,
  CAPTION_FALLBACK_EM,
  countLineClaims,
  countLineFits,
  countLineGap,
  countLineIndexAt,
  countLineIndexOf,
  countLineTapped,
  countLineX,
  RULER,
  rulerBoxWidth,
  rulerCaptionGuess,
  rulerContentWidth,
  rulerCount,
  rulerCounts,
  rulerDoneWidth,
  rulerEmitDue,
  rulerFits,
  rulerHeaderFits,
  rulerHeight,
  rulerIndexAt,
  rulerInline,
  rulerInlineStrip,
  rulerInnerWidth,
  rulerLabel,
  rulerLabelFor,
  rulerLabelPlaces,
  rulerLabelsFit,
  rulerLabelWidth,
  rulerMarks,
  rulerMarksFor,
  rulerMustFollow,
  rulerOffsetOf,
  rulerReadsHours,
  rulerStripWidth,
  rulerTickFor,
  rulerTickX,
  rulerValueAt,
  tickKind,
} from './rulerMath';
import { decimalsOfStep, typedBoxExtra, widestStepChars, type TypedKind } from './stepperMath';

/**
 * THE APP'S RULERS, at their widest (the sheets that draw one pass these ranges): an ounce stash
 * container up to a liter (34 oz), the same in milliliters, a bottle to 500 ml, a sleep to 16 hours
 * in fives, tummy time to two hours in ones.
 */
const RULERS: readonly {
  name: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  kind: TypedKind;
}[] = [
  { name: 'stash, oz', min: 0, max: 34, step: 0.25, unit: 'oz', kind: 'amount' },
  { name: 'stash, ml', min: 0, max: 1000, step: 5, unit: 'ml', kind: 'amount' },
  { name: 'bottle, oz', min: 0, max: 17, step: 0.25, unit: 'oz', kind: 'amount' },
  { name: 'bottle, ml', min: 0, max: 500, step: 5, unit: 'ml', kind: 'amount' },
  { name: 'sleep', min: 0, max: 960, step: 5, unit: 'min', kind: 'minutes' },
  { name: 'tummy', min: 0, max: 120, step: 1, unit: 'min', kind: 'minutes' },
];
const hoursOf = (r: (typeof RULERS)[number]): boolean => rulerReadsHours(r.kind, r.max);

/** A sheet's body on a phone: the window less `space.xxl` each side — 272 at 308 pt, 394 at 430. */
const BODIES: number[] = [];
for (let w = 308; w <= 430; w += 0.5) BODIES.push(w - 2 * space.xxl);
/** Every text size a chrome role takes, from the phone's default to the cap. */
const SCALES = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6];

describe('the marks fall on round numbers', () => {
  it('labels every ounce, 30 ml, ten minutes, half an hour of a sleep in fives, a degree', () => {
    expect(rulerMarks(0.25)).toEqual({ major: 4, mid: 2 });
    expect(rulerMarks(5)).toEqual({ major: 6, mid: 3 });
    expect(rulerMarks(1)).toEqual({ major: 10, mid: 5 });
    expect(rulerMarks(0.1)).toEqual({ major: 10, mid: 5 });
    expect(rulerMarks(0.01)).toEqual({ major: 10, mid: 5 });
    expect(rulerMarks(0.5)).toEqual({ major: 2, mid: null });
    expect(rulerMarks(10)).toEqual({ major: 10, mid: 5 });
    expect(rulerMarks(2)).toEqual({ major: 5, mid: null });
    // anything unforeseen still has marks, never a division by nothing
    expect(rulerMarks(0).major).toBeGreaterThan(0);
    expect(rulerMarks(7).major).toBeGreaterThan(0);
  });

  it('counts from zero, so a ruler that starts elsewhere still labels round numbers', () => {
    const marks = rulerMarks(0.1);
    // a thermometer from 95.0 °F: 95 is labeled, 95.5 is a half mark, 95.1 a step
    expect(tickKind(0, 95, 0.1, marks)).toBe('major');
    expect(tickKind(5, 95, 0.1, marks)).toBe('mid');
    expect(tickKind(1, 95, 0.1, marks)).toBe('minor');
    expect(tickKind(10, 95, 0.1, marks)).toBe('major');
    // ounces from nothing: every fourth quarter
    const oz = rulerMarks(0.25);
    expect([0, 1, 2, 3, 4].map(i => tickKind(i, 0, 0.25, oz))).toEqual([
      'major',
      'minor',
      'mid',
      'minor',
      'major',
    ]);
  });

  it('writes a label as the round number it is — "5", not "5.00"', () => {
    expect(rulerLabelPlaces(0.25)).toBe(0);
    expect(rulerLabelPlaces(5)).toBe(0);
    expect(rulerLabelPlaces(0.01)).toBe(1);
    expect(rulerLabel(5, 0.25)).toBe('5');
    expect(rulerLabel(30, 5)).toBe('30');
    expect(rulerLabel(4.5, 0.01)).toBe('4.5');
  });
});

/**
 * A LENGTH THAT REACHES AN HOUR IS LABELED IN HOURS (the owner, 2026-09-26: *"1h20m is easier to
 * read"*): the number over it reads "1h 20m", and so does its scale.
 */
describe('a long length reads in hours', () => {
  it('is a length whose range reaches an hour, and nothing else', () => {
    expect(rulerReadsHours('minutes', 960)).toBe(true);
    expect(rulerReadsHours('minutes', 60)).toBe(true);
    expect(rulerReadsHours('minutes', 45)).toBe(false);
    expect(rulerReadsHours('amount', 960)).toBe(false);
  });

  it('labels a sleep in fives every hour, with the half hour a longer tick', () => {
    expect(rulerMarksFor(5, true)).toEqual({ major: 12, mid: 6 });
    const marks = rulerMarksFor(5, true);
    expect(tickKind(12, 0, 5, marks)).toBe('major');
    expect(tickKind(6, 0, 5, marks)).toBe('mid');
    expect(tickKind(3, 0, 5, marks)).toBe('minor');
    // a minute a step keeps its ten-minute labels: an hour of ticks is too far between numbers
    expect(rulerMarksFor(1, true)).toEqual({ major: 10, mid: 5 });
    // and a range that stays short, or an amount, keeps the marks it had
    expect(rulerMarksFor(5, false)).toEqual(rulerMarks(5));
  });

  it('writes each label the app’s way: 0, 50m, 1h, 1h 10m, 16h', () => {
    expect(rulerLabelFor(0, 1, true)).toBe('0');
    expect(rulerLabelFor(50, 1, true)).toBe('50m');
    expect(rulerLabelFor(60, 1, true)).toBe('1h');
    expect(rulerLabelFor(70, 1, true)).toBe('1h 10m');
    expect(rulerLabelFor(960, 5, true)).toBe('16h');
    // not a length: the plain round number, as before
    expect(rulerLabelFor(30, 5, false)).toBe('30');
  });

  it('measures the labels it really draws: "1h 10m" on tummy time, "16h" on a sleep', () => {
    expect(rulerLabelWidth(0, 120, 1, 1, true)).toBeCloseTo(6 * 0.6 * RULER.label, 6);
    expect(rulerLabelWidth(0, 960, 5, 1, true)).toBeCloseTo(3 * 0.6 * RULER.label, 6);
  });
});

describe('a value and its place on the ruler are the same thing, both ways round', () => {
  it('puts every step of every app ruler under the needle, and reads it back', () => {
    for (const r of RULERS) {
      const places = decimalsOfStep(r.step);
      const count = rulerCount(r.min, r.max, r.step);
      for (let i = 0; i < count; i += 1) {
        const v = rulerValueAt(i, r.min, r.max, r.step, places);
        const x = rulerOffsetOf(v, r.min, r.step, count);
        expect(x, `${r.name} #${i}`).toBeCloseTo(i * RULER.tick, 6);
        expect(rulerIndexAt(x, count), `${r.name} #${i}`).toBe(i);
      }
      // the two ends are the range's two ends
      expect(rulerValueAt(0, r.min, r.max, r.step, places)).toBe(r.min);
      expect(rulerValueAt(count - 1, r.min, r.max, r.step, places)).toBe(r.max);
    }
  });

  it('lands a quarter ounce as a quarter, never 5.249999', () => {
    expect(rulerValueAt(21, 0, 34, 0.25, 2)).toBe(5.25);
    expect(rulerValueAt(3, 0, 34, 0.25, 2)).toBe(0.75);
  });

  it('snaps a drag that stops between two ticks to the nearer one, inside the ruler', () => {
    const count = rulerCount(0, 34, 0.25);
    expect(rulerIndexAt(204, count)).toBe(20);
    expect(rulerIndexAt(206, count)).toBe(21);
    expect(rulerIndexAt(-40, count)).toBe(0);
    expect(rulerIndexAt(1e6, count)).toBe(count - 1);
    expect(rulerIndexAt(Number.NaN, count)).toBe(0);
  });

  it('shows a saved value off the grid exactly, between its two ticks — 3.7 oz is not moved', () => {
    const count = rulerCount(0, 34, 0.25);
    expect(rulerOffsetOf(3.7, 0, 0.25, count)).toBeCloseTo(148, 6);
    // and a value outside the range sits at the end it passed
    expect(rulerOffsetOf(50, 0, 0.25, count)).toBe((count - 1) * RULER.tick);
    expect(rulerOffsetOf(-3, 0, 0.25, count)).toBe(0);
  });

  it('reaches the far end of a range that is not a whole number of steps', () => {
    // a split bounded by a 3.7 oz bag: 3.5 and then 3.7, never a tick past what the bag holds
    const count = rulerCount(0, 3.7, 0.25);
    expect(count).toBe(16);
    expect(rulerValueAt(count - 1, 0, 3.7, 0.25, 2)).toBe(3.7);
    expect(rulerValueAt(count - 2, 0, 3.7, 0.25, 2)).toBe(3.5);
  });

  it('lays the ticks out from the middle of the strip, one step apart', () => {
    expect(rulerTickX(200, 0)).toBe(100);
    expect(rulerTickX(200, 3)).toBe(130);
    // the content is the strip plus the ticks, so the last tick can reach the needle too
    expect(rulerContentWidth(200, 137)).toBe(200 + 136 * RULER.tick);
    expect(rulerContentWidth(200, 1)).toBe(200);
  });

  it('draws every app ruler, and hands a range too long to draw back to the box', () => {
    for (const r of RULERS) expect(rulerFits(r.min, r.max, r.step), r.name).toBe(true);
    // a growth weight in hundredths of a kilogram would be three thousand ticks
    expect(rulerFits(0.3, 30, 0.01)).toBe(false);
    expect(rulerFits(0, 0, 1)).toBe(false);
    expect(rulerFits(0, 10, 0)).toBe(false);
  });
});

describe('what a drag tells the sheet', () => {
  it('reports at once, then no more often than the hold steps, and always after a clock change', () => {
    expect(RULER.emitMs).toBe(50);
    expect(rulerEmitDue(null, 1_000)).toBe(true);
    expect(rulerEmitDue(1_000, 1_049)).toBe(false);
    expect(rulerEmitDue(1_000, 1_050)).toBe(true);
    expect(rulerEmitDue(10_000, 5_000)).toBe(true);
  });

  it('moves the ruler to a number set another way, never under the thumb, never for a rounding', () => {
    expect(rulerMustFollow(210, 200, false)).toBe(true);
    expect(rulerMustFollow(210, 200, true)).toBe(false);
    expect(rulerMustFollow(200.3, 200, false)).toBe(false);
  });
});

describe('the control fits every phone, at every text size up to the chrome cap', () => {
  it('keeps every target whole and a dozen steps of scale in view, from 308 to 430 pt', () => {
    for (const body of BODIES) {
      const strip = rulerStripWidth(body);
      expect(strip, `body ${body}`).toBeGreaterThanOrEqual(RULER.minStrip);
      expect(strip / RULER.tick, `body ${body}`).toBeGreaterThanOrEqual(12);
      // the row adds up to the room it has, and no more — no card round it since 2026-09-26
      expect(strip + 2 * hit.min + 2 * space.xs).toBeCloseTo(body, 6);
    }
    // the strip is a target taller than the floor at every size
    for (const s of SCALES) expect(rulerHeight(s)).toBeGreaterThanOrEqual(hit.min);
  });

  it('never lets two labels touch, on any app ruler, at any text size — hours included', () => {
    for (const r of RULERS)
      for (const s of SCALES) {
        const hours = hoursOf(r);
        expect(rulerLabelsFit(r.min, r.max, r.step, s, hours), `${r.name} at ${s}`).toBe(true);
        expect(rulerLabelWidth(r.min, r.max, r.step, s, hours)).toBeLessThan(
          rulerMarksFor(r.step, hours).major * RULER.tick,
        );
      }
  });

  /**
   * THE HEADER ROW (2026-09-26): the caption on the left and the number's box on the right. The box
   * alone always fits the body; on every phone of 360 pt and up (a 324 pt body) the caption keeps
   * `RULER.captionMin` beside it at every size up to the chrome cap, so the two share a row. On the
   * 308 pt window at the largest sizes the row wraps and the box goes under the caption — never off
   * the edge.
   */
  it('keeps the number’s box on the caption’s row, and wraps it under rather than off the edge', () => {
    for (const r of RULERS) {
      const places = decimalsOfStep(r.step);
      for (const body of BODIES)
        for (const s of SCALES) {
          const box = rulerBoxWidth(r.min, r.max, places, r.unit, r.kind, s);
          expect(box, `${r.name}, body ${body}, at ${s}`).toBeLessThanOrEqual(
            rulerInnerWidth(body),
          );
          if (body >= 324)
            expect(rulerHeaderFits(body, box), `${r.name}, body ${body}, at ${s}`).toBe(true);
        }
      // at the phone's own text size the caption fits beside the number on every phone
      for (const body of BODIES)
        expect(rulerHeaderFits(body, rulerBoxWidth(r.min, r.max, places, r.unit, r.kind, 1))).toBe(
          true,
        );
    }
  });

  it('keeps the Done under a typed number on every phone, at every size', () => {
    for (const body of BODIES)
      for (const s of SCALES)
        expect(rulerDoneWidth(s) + space.md + RULER.captionMin / 2).toBeLessThanOrEqual(
          rulerInnerWidth(body),
        );
    expect(rulerDoneWidth(1)).toBeGreaterThanOrEqual(hit.min);
  });

  it('sizes the number box for the widest number the range can show, and its box round it', () => {
    expect(widestStepChars(0, 34, 2)).toBe(5); // "33.75"
    expect(rulerBoxWidth(0, 34, 2, 'oz', 'amount', 1)).toBeGreaterThan(
      rulerBoxWidth(0, 500, 0, 'ml', 'amount', 1),
    );
    // a sleep's widest is "16h 59m", wider than the "59 MIN" it reads under an hour
    expect(rulerBoxWidth(0, 960, 0, 'min', 'minutes', 1)).toBeGreaterThan(
      rulerBoxWidth(0, 59, 0, 'min', 'minutes', 1),
    );
    // the box's air and edge do not grow with the text; the number does
    const one = rulerBoxWidth(0, 34, 2, 'oz', 'amount', 1) - typedBoxExtra();
    const big = rulerBoxWidth(0, 34, 2, 'oz', 'amount', 1.5) - typedBoxExtra();
    expect(big).toBeGreaterThan(one * 1.45);
  });
});

/**
 * THE RULER IN THE ROW'S GAP (the owner, 2026-09-30, over the bottle's "In the bottle" row: *"Would it
 * make sense to you if the slider is inside the red circle I made instead? We don't need a very long
 * slider for this."*). The captions the app really draws are measured in its own face by the app's
 * test (`apps/mobile/src/sheets/quick/modules/rulerInline.test.ts`); here is the rule itself.
 */
describe('the ruler in its row’s gap', () => {
  it('gives the strip what the caption and the box leave, with the row’s gaps between them', () => {
    expect(rulerInlineStrip(354, 90, 110)).toBe(354 - 90 - 110 - 2 * space.md);
    // one row when that is the shortest strip that still reads as a ruler, two rows below it
    const box = 110;
    const caption = 90;
    const edge = caption + box + 2 * space.md + RULER.inlineMin;
    expect(rulerInline(edge, caption, box)).toBe(true);
    expect(rulerInline(edge - 0.5, caption, box)).toBe(false);
    expect(RULER.inlineMin).toBe(96);
  });

  it('decides nothing for a row not yet measured, and never fits a caption wider than the row', () => {
    expect(rulerInline(0, 90, 110)).toBe(false);
    expect(rulerInline(354, 400, 110)).toBe(false);
  });

  it('guesses a caption from the face’s own advances, so the first frame is the right layout', () => {
    const em = (text: string): number =>
      Array.from(text).reduce((sum, ch) => sum + (CAPTION_ADVANCE_EM[ch] ?? 0), 0);
    expect(rulerCaptionGuess('In the bottle', 1)).toBeCloseTo(em('In the bottle') * 15, 6);
    // every character of a caption in this language is in the table, the right quote of a name too
    for (const ch of 'AZaz09 ’?,.'.split('')) expect(CAPTION_ADVANCE_EM[ch], ch).toBeGreaterThan(0);
    // a character the table does not hold is charged a whole em, wider than any in it
    expect(Math.max(...Object.values(CAPTION_ADVANCE_EM))).toBeLessThan(CAPTION_FALLBACK_EM);
    expect(rulerCaptionGuess('Ада', 1)).toBe(3 * CAPTION_FALLBACK_EM * 15);
    // and it grows with the text, as the caption does
    expect(rulerCaptionGuess('In the bottle', 1.5)).toBeCloseTo(
      rulerCaptionGuess('In the bottle', 1) * 1.5,
      6,
    );
  });
});

/**
 * A COUNT IS ITS OWN SCALE (2026-09-30, the containers a pump session goes into, one to six; the
 * owner: the row of 1 to 6 said nothing of what it counted, and should be the app's slider). The
 * app's count and its caption are `apps/mobile/src/sheets/quick/modules/rulerInline.test.ts`.
 */
describe('a count on a ruler', () => {
  it('is a short run of whole numbers, and no amount or length the app draws', () => {
    expect(rulerCounts(1, 6, 1)).toBe(true);
    expect(rulerCounts(1, 2, 1)).toBe(true);
    expect(rulerCounts(0, 11, 1)).toBe(true);
    // longer than a dozen, a fraction of a step, a start between two numbers, or no range at all
    expect(rulerCounts(0, 12, 1)).toBe(false);
    expect(rulerCounts(1, 6, 0.5)).toBe(false);
    expect(rulerCounts(0.5, 6.5, 1)).toBe(false);
    expect(rulerCounts(1, 1, 1)).toBe(false);
    for (const r of RULERS) expect(rulerCounts(r.min, r.max, r.step), r.name).toBe(false);
  });

  it('stands its numbers a thumb apart and labels every one, where an amount keeps its scale', () => {
    expect(rulerTickFor(1, 6, 1)).toBe(RULER.countTick);
    expect(RULER.countTick).toBe(24);
    for (const r of RULERS) expect(rulerTickFor(r.min, r.max, r.step), r.name).toBe(RULER.tick);
    const marks = rulerMarksFor(1, false, true);
    expect(marks).toEqual({ major: 1, mid: null });
    for (let i = 0; i < 6; i += 1) expect(tickKind(i, 1, 1, marks)).toBe('major');
    // and the numbers never touch, at every text size up to the chrome cap
    for (const s of SCALES) expect(rulerLabelsFit(1, 6, 1, s), `at ${s}`).toBe(true);
    // the six, all in the 120 pt the shortest strip in a row's gap shows
    expect(5 * RULER.countTick).toBeLessThanOrEqual(120);
  });

  it('puts each number under the needle a count’s tick apart, and reads it back', () => {
    const tick = rulerTickFor(1, 6, 1);
    const count = rulerCount(1, 6, 1);
    expect(count).toBe(6);
    for (let i = 0; i < count; i += 1) {
      const v = rulerValueAt(i, 1, 6, 1, 0);
      expect(v).toBe(i + 1);
      const x = rulerOffsetOf(v, 1, 1, count, tick);
      expect(x).toBe(i * 24);
      expect(rulerIndexAt(x, count, tick)).toBe(i);
    }
    // a drag let go of between two numbers settles on the nearer
    expect(rulerIndexAt(35, count, tick)).toBe(1);
    expect(rulerIndexAt(37, count, tick)).toBe(2);
    expect(rulerContentWidth(140, count, tick)).toBe(140 + 5 * 24);
    expect(rulerTickX(140, 2, tick)).toBe(70 + 48);
  });

  it('keeps its bare number in a box never narrower than a target', () => {
    // one digit at 30 pt and the box's air: 26 pt drawn, 44 kept, since a tap on it types
    expect(rulerBoxWidth(1, 6, 0, '', 'count', 1)).toBe(hit.min);
    expect(rulerBoxWidth(1, 6, 0, '', 'count', 1.6)).toBe(hit.min);
    // every other box was wider than a target already, and is unchanged
    for (const r of RULERS)
      expect(
        rulerBoxWidth(r.min, r.max, decimalsOfStep(r.step), r.unit, r.kind, 1),
        r.name,
      ).toBeGreaterThan(hit.min);
  });
});

/**
 * A COUNT IS A LINE, ALL OF IT IN VIEW (the owner, 2026-09-30, of "How many bottles": *"The slider
 * with the empty space on the left don't look very nice. Think about it and then fix it"*). The
 * ruler's needle stayed in the middle, so at one bottle half the strip was empty scale; a count's
 * numbers now stand from one end of the strip to the other and the needle moves to the chosen one.
 */
describe('a count, all of it in view', () => {
  it('stands its numbers evenly from end to end, the first and last clear of the corners', () => {
    const strip = 119;
    const count = 6;
    expect(countLineX(strip, count, 0)).toBe(RULER.countEnd);
    expect(countLineX(strip, count, count - 1)).toBeCloseTo(strip - RULER.countEnd, 9);
    const gap = countLineGap(strip, count);
    for (let i = 1; i < count; i += 1)
      expect(countLineX(strip, count, i) - countLineX(strip, count, i - 1)).toBeCloseTo(gap, 9);
    // no empty half: the first number is at the start of the strip, not in its middle
    expect(countLineX(strip, count, 0)).toBeLessThan(strip / 4);
    // clear of the strip's rounded corners (radius 15)
    expect(RULER.countEnd).toBeGreaterThan(15);
    // a place past either end is the end
    expect(countLineX(strip, count, -3)).toBe(countLineX(strip, count, 0));
    expect(countLineX(strip, count, 9)).toBe(countLineX(strip, count, count - 1));
  });

  it('finds the nearest number under a finger, and the number a value stands at', () => {
    const strip = 143;
    const count = 6;
    for (let i = 0; i < count; i += 1) {
      const x = countLineX(strip, count, i);
      expect(countLineIndexAt(x, strip, count)).toBe(i);
      // anywhere nearer this number than the next is this number
      expect(countLineIndexAt(x + countLineGap(strip, count) * 0.45, strip, count)).toBe(i);
    }
    // the strip's ends are its first and last numbers
    expect(countLineIndexAt(0, strip, count)).toBe(0);
    expect(countLineIndexAt(strip, strip, count)).toBe(count - 1);
    expect(countLineIndexAt(Number.NaN, strip, count)).toBe(0);
    // a value's place: one bottle is the first, six the last, and never past either end
    expect(countLineIndexOf(1, 1, count)).toBe(0);
    expect(countLineIndexOf(6, 1, count)).toBe(5);
    expect(countLineIndexOf(9, 1, count)).toBe(5);
    expect(countLineIndexOf(0, 1, count)).toBe(0);
  });

  it('is drawn wherever its numbers keep apart, and is the ruler it was where they would not', () => {
    // one to six, on the shortest strip a row keeps and at the text size a row keeps it at
    for (const s of [1, 1.15, 1.3])
      expect(countLineFits(RULER.inlineMin, 1, 6, s), `${s}`).toBe(true);
    // two rows give it the whole width, and it fits at every text size up to the chrome cap
    for (const phone of [308, 360, 430])
      for (const s of SCALES)
        expect(countLineFits(rulerStripWidth(phone - 2 * space.xxl), 1, 6, s)).toBe(true);
    // a dozen numbers in a short strip at a large size would touch: the ruler keeps them apart
    expect(countLineFits(RULER.inlineMin, 0, 11, 1.6)).toBe(false);
    // and only a count is ever a line
    expect(countLineFits(200, 0, 17, 1)).toBe(false);
    for (const r of RULERS) expect(countLineFits(300, r.min, r.max, 1), r.name).toBe(false);
    expect(countLineFits(0, 1, 6, 1)).toBe(false);
  });

  it('is dragged only by a finger gone sideways, and a touch that stayed put is a tap', () => {
    expect(countLineClaims(RULER.countClaim, 0)).toBe(true);
    expect(countLineClaims(-RULER.countClaim - 2, 3)).toBe(true);
    // not on contact, and not a scroll of the sheet that began on the line
    expect(countLineClaims(RULER.countClaim - 1, 0)).toBe(false);
    expect(countLineClaims(12, 10)).toBe(false);
    expect(countLineClaims(3, 30)).toBe(false);
    expect(countLineTapped(2, 3)).toBe(true);
    expect(countLineTapped(RULER.countClaim, 0)).toBe(false);
    expect(countLineTapped(0, 12)).toBe(false);
  });
});
