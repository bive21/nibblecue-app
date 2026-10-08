/**
 * THE LONG-RUN ASK AS ONE STRIP (the owner, 2026-09-30, over a pump that had run 4h 20m: *"Redesign
 * the still xxx timer reminder. It is taking to much space. The info how long is running is
 * duplicate because it shows exactly that on top of it. The reminder is taller than the timer card
 * itself, that didn't make sense. You understand the importance of spacing efficiency for me."* The
 * second time: on 2026-09-21 it was *"the 'still pumping?' button is wayyy too tall"*).
 *
 * It was a card of its own with three rows: the question with the elapsed beside it, a sentence on
 * what the card was for, and the two answers at the right, over 100 pt under a timer card of about
 * 80. It is one row now, a strip tucked under the card it asks about: the clock, the question, and
 * the two answers, small. The elapsed is heard and not shown (the card above counts it), and the
 * sentence became the title of the picker "It ended" opens ("When did it end?").
 *
 * This file is the strip's arithmetic, pure so each claim is a node test (`longRunFit.test.ts`):
 *
 *   ONE ROW, the question wrapping between its words. On a 390 pt phone "Still on tummy time?"
 *   keeps to one line beside the answers; on a 360 pt one "Still breastfeeding?" takes two.
 *
 *   STACKED only when a WORD of the question would not fit beside the answers, which is a large
 *   text size: the answers go under the question, at the right. A word is never broken.
 *
 *   NEVER TALLER THAN ITS CARD. The strip's words stop growing at the chrome cap (1.6,
 *   `CHROME_FONT_CAP`), as the card's clock and its started line do. Past it the card still grows
 *   with its title, and the strip does not.
 */
import { space, type as typeScale } from '@nibblecue/ui/theme';

/** The strip's measures, in points at a text scale of 1. */
export const LONG_RUN_STRIP = {
  /** Across: the timer card's own padding, so the clock lines up with the card's words above it. */
  padX: space.lg,
  /**
   * Up and down: the answers' own slop (`Button` `xs` takes `space.sm`), so each 34 pt answer's
   * 46 pt target reaches exactly the strip's edges and never past them into the card.
   */
  padY: space.sm,
  gap: space.sm,
  /** The clock. */
  icon: 16,
  /** A small answer (`Button` `xs`): 34 tall, `space.lg` of padding either side of its words. */
  answer: 34,
  answerPad: space.lg,
  /** How far its words grow with the phone's text size: the chrome cap (`Text.tsx`). */
  fontCap: 1.6,
  /** Under the timer card it belongs to: closer than the column's gap between two cards. */
  tuck: space.xs,
} as const;

/**
 * THE WORDS, AS WIDE AS THE FACE SETS THEM: Hanken Grotesk advances in em, read out of the TTFs the
 * app ships, without kerning, which is the safe side. The answers are `Button`'s `bodySm` (Regular),
 * the question `bodyStrong` (Bold); every word a question can print is here, "playtime" included
 * (the household's other word for tummy time). `longRunFit.test.ts` re-reads the TTFs and holds
 * both tables to them.
 */
export const LONG_RUN_ANSWER_EM: Readonly<Record<string, number>> = {
  'Still going': 4.304,
  'It ended': 3.653,
};
export const LONG_RUN_WORD_EM: Readonly<Record<string, number>> = {
  Still: 1.743,
  'pumping?': 4.401,
  'sleeping?': 4.252,
  'breastfeeding?': 6.776,
  on: 1.136,
  tummy: 3.152,
  'time?': 2.511,
  'playtime?': 4.444,
};
/**
 * A word nobody measured, a household's own name for tummy time, is charged this much a letter in
 * either face: the widest lower-case letter there is ("m", 0.843 em in Bold), and the household's
 * word is always set in lower case in the question. So a word the strip does not know is never
 * charged less than it is drawn: the answers go under it sooner, and it is never broken.
 */
export const LONG_RUN_WORD_FALLBACK_EM = 0.85;
/** The space between two words, in em, in either face. */
export const LONG_RUN_SPACE_EM = 0.26;

/** The text scale the strip's words are drawn at: the phone's, up to the cap. */
export const longRunScale = (fontScale: number): number =>
  Number.isFinite(fontScale) && fontScale > 0 ? Math.min(fontScale, LONG_RUN_STRIP.fontCap) : 1;

const emOf = (table: Readonly<Record<string, number>>, text: string): number =>
  table[text] ?? Array.from(text).length * LONG_RUN_WORD_FALLBACK_EM;

/** One answer's width: its words at `bodySm` and the button's padding either side. */
export const longRunAnswerWidth = (label: string, fontScale: number): number =>
  emOf(LONG_RUN_ANSWER_EM, label) * typeScale.bodySm.fontSize * longRunScale(fontScale) +
  2 * LONG_RUN_STRIP.answerPad;

/** Both answers side by side, with the strip's gap between them. */
export const longRunAnswersWidth = (labels: readonly string[], fontScale: number): number =>
  labels.reduce((sum, l) => sum + longRunAnswerWidth(l, fontScale), 0) +
  Math.max(0, labels.length - 1) * LONG_RUN_STRIP.gap;

/** A word of the question at `bodyStrong`. */
export const longRunWordWidth = (word: string, fontScale: number): number =>
  emOf(LONG_RUN_WORD_EM, word) * typeScale.bodyStrong.fontSize * longRunScale(fontScale);

/** The room the question has on the one row: the strip less its padding, the clock and the answers. */
export const longRunQuestionRoom = (
  width: number,
  labels: readonly string[],
  fontScale: number,
): number =>
  width -
  2 * LONG_RUN_STRIP.padX -
  LONG_RUN_STRIP.icon -
  2 * LONG_RUN_STRIP.gap -
  longRunAnswersWidth(labels, fontScale);

/**
 * How many lines the question takes in `room`: its words set greedily, a line break only between
 * two words. A word wider than the room is a line of its own (and `longRunStacks` never lets one be).
 */
export function longRunLines(question: string, room: number, fontScale: number): number {
  const gap = LONG_RUN_SPACE_EM * typeScale.bodyStrong.fontSize * longRunScale(fontScale);
  let used = 0;
  let lines = 1;
  for (const word of question.split(/\s+/).filter(Boolean)) {
    const w = longRunWordWidth(word, fontScale);
    if (used > 0 && used + gap + w > room + 1e-9) {
      lines += 1;
      used = w;
    } else used += (used > 0 ? gap : 0) + w;
  }
  return lines;
}

/** The most lines the question takes beside the answers before they go under it instead. */
export const LONG_RUN_ROW_LINES = 2;

/**
 * WHETHER THE ANSWERS GO UNDER THE QUESTION: when one of its words would not fit the room the row
 * leaves it, or the question would take more than two lines there, where the answers under one line
 * of question make the shorter strip. Both happen only at a large text size or on the narrowest
 * phones. `width` 0 is a strip not yet measured, drawn as the row every phone gets at its own size.
 */
export function longRunStacks(
  width: number,
  question: string,
  labels: readonly string[],
  fontScale: number,
): boolean {
  if (!(width > 0)) return false;
  const room = longRunQuestionRoom(width, labels, fontScale);
  const tooWide = question
    .split(/\s+/)
    .filter(Boolean)
    .some(word => longRunWordWidth(word, fontScale) > room + 1e-9);
  return tooWide || longRunLines(question, room, fontScale) > LONG_RUN_ROW_LINES;
}
