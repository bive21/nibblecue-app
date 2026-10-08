/**
 * THE LONG-RUN STRIP, MEASURED (`longRunFit.ts`; the owner, 2026-09-30: *"The reminder is taller
 * than the timer card itself, that didn't make sense. You understand the importance of spacing
 * efficiency for me."*). Node cannot lay out a React Native view, so the strip is built here from
 * the numbers it is drawn with and the face the app ships (`testing/ttf.ts`): its words as wide as
 * the TTF sets them, its lines as tall. What is held:
 *
 *   * the width tables are the font's own, and every word a question can print is in them;
 *   * at the phone's own text size, every question keeps to one row on every phone from 360 pt,
 *     and the strip is no taller than 56 pt on a 390 pt phone (48 on one line, 53 on two);
 *   * a word is never broken, whether the row holds or the answers go under the question;
 *   * and at every text size a phone offers, on every phone from 308 to 430 pt, the strip is
 *     shorter than the timer card it sits under.
 */
import { space, type as typeScale } from '@nibblecue/ui/theme';
import { describe, expect, it } from 'vitest';
import { shippedFace, shippedFaceHeights } from '../../testing/ttf';
import { LONG_RUN, longRunTitleWord, TIMER_WORD } from './copy';
import {
  LONG_RUN_ANSWER_EM,
  LONG_RUN_STRIP,
  LONG_RUN_WORD_EM,
  LONG_RUN_WORD_FALLBACK_EM,
  LONG_RUN_ROW_LINES,
  LONG_RUN_SPACE_EM,
  longRunAnswersWidth,
  longRunLines,
  longRunQuestionRoom,
  longRunScale,
  longRunStacks,
  longRunWordWidth,
} from './longRunFit';

const ANSWERS = [LONG_RUN.stillGoing, LONG_RUN.ended] as const;
/** Every question the strip can ask: each timer by its own word, and tummy time by its other name. */
const QUESTIONS = [
  ...(Object.keys(TIMER_WORD) as (keyof typeof TIMER_WORD)[]).map(type =>
    LONG_RUN.title(longRunTitleWord(type, TIMER_WORD[type])),
  ),
  LONG_RUN.title(longRunTitleWord('tummy', 'playtime')),
];
const words = (q: string): string[] => q.split(/\s+/).filter(Boolean);

/** Today's column and a sheet's body are both the window less `space.xxl` each side. */
const bodyOf = (phone: number): number => phone - 2 * space.xxl;
const PHONES: number[] = [];
for (let w = 308; w <= 430; w += 2) PHONES.push(w);
/** The phone's text size, from its default up past the largest either platform offers (3.1×). */
const SCALES = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2, 2.4, 2.8, 3.1];

const bold = shippedFaceHeights('hankenBold');
const regular = shippedFaceHeights('hankenRegular');
const extraBold = shippedFaceHeights('hankenExtraBold');
/** How much of a line a style takes at a scale: `bodyStrong` has no line height of its own. */
const questionLine = (s: number): number => bold.line * typeScale.bodyStrong.fontSize * s;
/** A small answer's height: its 34 pt, or its line (`bodySm`'s 19, scaled) if that is taller. */
const answerHeight = (s: number): number =>
  Math.max(LONG_RUN_STRIP.answer, typeScale.bodySm.lineHeight * s);

const lines = longRunLines;

/** How many rows the answers take across `room` in the stacked layout. */
function answerRows(room: number, fontScale: number): number {
  let rows = 1;
  let used = 0;
  for (const a of ANSWERS) {
    const w = longRunAnswersWidth([a], fontScale);
    if (used > 0 && used + LONG_RUN_STRIP.gap + w > room + 1e-9) {
      rows += 1;
      used = w;
    } else used += (used > 0 ? LONG_RUN_STRIP.gap : 0) + w;
  }
  return rows;
}

/** The strip as it is drawn: its edge, its padding, and the row or the stack inside. */
function stripHeight(width: number, question: string, fontScale: number): number {
  const s = longRunScale(fontScale);
  const edge = 2;
  const pad = 2 * LONG_RUN_STRIP.padY;
  if (!longRunStacks(width, question, ANSWERS, fontScale)) {
    const room = longRunQuestionRoom(width, ANSWERS, fontScale);
    return (
      edge + pad + Math.max(answerHeight(s), lines(question, room, fontScale) * questionLine(s))
    );
  }
  const inner = width - 2 * LONG_RUN_STRIP.padX;
  const questionRoom = inner - LONG_RUN_STRIP.icon - LONG_RUN_STRIP.gap;
  const rows = answerRows(inner, fontScale);
  return (
    edge +
    pad +
    lines(question, questionRoom, fontScale) * questionLine(s) +
    LONG_RUN_STRIP.gap +
    rows * answerHeight(s) +
    (rows - 1) * LONG_RUN_STRIP.gap
  );
}

/**
 * THE TIMER CARD, AT ITS SHORTEST (`TimerCard.tsx`): its padding, the title (`h2`, which grows with
 * the text uncapped), the clock (`display`, its line its size, capped at 1.6 as chrome) and the
 * started line (`meta`, capped too), with their gaps. A pump's card has nothing else; a feed's
 * card adds its sides' line, which only makes it taller.
 */
function timerCardHeight(fontScale: number): number {
  const chrome = Math.min(fontScale, 1.6);
  return (
    2 * space.lg +
    extraBold.line * typeScale.h2.fontSize * fontScale +
    space.xs +
    typeScale.display.fontSize * chrome +
    space.xs +
    regular.line * typeScale.meta.fontSize * chrome
  );
}

describe('the strip’s words are as wide as the face sets them', () => {
  it('holds both tables to the TTFs the app ships', () => {
    const b = shippedFace('hankenBold');
    const r = shippedFace('hankenRegular');
    for (const [word, em] of Object.entries(LONG_RUN_WORD_EM))
      expect(em, word).toBeCloseTo(b(word), 2);
    for (const [label, em] of Object.entries(LONG_RUN_ANSWER_EM))
      expect(em, label).toBeCloseTo(r(label), 2);
  });

  it('measures every word a question can print and both answers, and charges an unknown word more', () => {
    for (const q of QUESTIONS)
      for (const w of words(q)) expect(LONG_RUN_WORD_EM[w], `${q}: ${w}`).toBeDefined();
    for (const a of ANSWERS) expect(LONG_RUN_ANSWER_EM[a], a).toBeDefined();
    // a household's own name for tummy time, set in lower case: never charged less than the face
    // sets it, in either face, however wide its letters are
    const b = shippedFace('hankenBold');
    const r = shippedFace('hankenRegular');
    for (const w of ['floortime?', 'wiggles?', 'swimming?', 'mmmmmmmm?', 'wwwwwww?'])
      expect(Array.from(w).length * LONG_RUN_WORD_FALLBACK_EM, w).toBeGreaterThanOrEqual(
        Math.max(b(w), r(w)),
      );
    for (const c of 'abcdefghijklmnopqrstuvwxyz?')
      expect(LONG_RUN_WORD_FALLBACK_EM, c).toBeGreaterThanOrEqual(Math.max(b(c), r(c)));
    expect(LONG_RUN_SPACE_EM).toBeCloseTo(b(' '), 2);
  });
});

describe('one row, at the phone’s own text size', () => {
  it('keeps every question beside its answers on every phone from 360 pt', () => {
    for (const phone of PHONES.filter(p => p >= 360))
      for (const q of QUESTIONS)
        expect(longRunStacks(bodyOf(phone), q, ANSWERS, 1), `${phone} pt: ${q}`).toBe(false);
  });

  it('is no taller than 56 pt on a 390 pt phone, and 48 on one line', () => {
    const heights = QUESTIONS.map(q => stripHeight(bodyOf(390), q, 1));
    for (const [i, h] of heights.entries()) expect(h, QUESTIONS[i]).toBeLessThanOrEqual(56);
    // "Still pumping?", the owner's own, is one line: an answer tall and a little air
    expect(stripHeight(bodyOf(390), 'Still pumping?', 1)).toBeCloseTo(48, 0);
    // and on a 360 pt phone the longest word takes a second line, still under 56
    expect(lines('Still breastfeeding?', longRunQuestionRoom(bodyOf(360), ANSWERS, 1), 1)).toBe(2);
    expect(stripHeight(bodyOf(360), 'Still breastfeeding?', 1)).toBeLessThanOrEqual(56);
  });

  it('gives the question the room the clock and the answers leave, on the card’s own padding', () => {
    // 354 pt of a 390 pt phone: 150 pt for the question beside 154 pt of answers
    expect(longRunAnswersWidth(ANSWERS, 1)).toBeCloseTo(153.5, 0);
    expect(longRunQuestionRoom(bodyOf(390), ANSWERS, 1)).toBeCloseTo(150.5, 0);
    expect(LONG_RUN_STRIP.padX).toBe(space.lg);
    expect(LONG_RUN_STRIP.padY).toBe(space.sm);
    // each 34 pt answer reaches its 46 pt target through `space.sm` of slop: exactly the padding
    expect(LONG_RUN_STRIP.answer + 2 * LONG_RUN_STRIP.padY).toBeGreaterThanOrEqual(44);
    expect(LONG_RUN_STRIP.tuck).toBeLessThan(space.md);
  });
});

describe('at every text size', () => {
  it('never breaks a word: the answers go under the question first', () => {
    for (const phone of PHONES)
      for (const s of SCALES)
        for (const q of QUESTIONS) {
          const width = bodyOf(phone);
          const stacked = longRunStacks(width, q, ANSWERS, s);
          const room = stacked
            ? width - 2 * LONG_RUN_STRIP.padX - LONG_RUN_STRIP.icon - LONG_RUN_STRIP.gap
            : longRunQuestionRoom(width, ANSWERS, s);
          for (const w of words(q))
            expect(longRunWordWidth(w, s), `${phone} pt at ${s}×: ${w}`).toBeLessThanOrEqual(room);
        }
  });

  it('stacks only at a large text size on a 390 pt phone, and never past two lines on the row', () => {
    for (const q of QUESTIONS) {
      expect(longRunStacks(bodyOf(390), q, ANSWERS, 1.1), q).toBe(false);
      expect(longRunStacks(bodyOf(390), q, ANSWERS, 1.6), q).toBe(true);
    }
    for (const phone of PHONES)
      for (const s of SCALES)
        for (const q of QUESTIONS)
          if (!longRunStacks(bodyOf(phone), q, ANSWERS, s))
            expect(
              lines(q, longRunQuestionRoom(bodyOf(phone), ANSWERS, s), s),
              `${phone} pt at ${s}×: ${q}`,
            ).toBeLessThanOrEqual(LONG_RUN_ROW_LINES);
  });

  it('is never taller than the timer card it sits under', () => {
    for (const phone of PHONES)
      for (const s of SCALES)
        for (const q of QUESTIONS)
          expect(stripHeight(bodyOf(phone), q, s), `${phone} pt at ${s}×: ${q}`).toBeLessThan(
            timerCardHeight(s),
          );
  });

  it('stops growing at the chrome cap, as the card’s clock does', () => {
    expect(longRunScale(1)).toBe(1);
    expect(longRunScale(1.3)).toBe(1.3);
    expect(longRunScale(3.1)).toBe(1.6);
    expect(longRunScale(Number.NaN)).toBe(1);
    expect(stripHeight(bodyOf(390), 'Still pumping?', 3.1)).toBe(
      stripHeight(bodyOf(390), 'Still pumping?', 1.6),
    );
  });
});
