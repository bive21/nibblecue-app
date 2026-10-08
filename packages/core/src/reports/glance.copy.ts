/**
 * WHAT A COMPARISON ON REPORTS SAYS (`glance.ts` has the arithmetic; the owner, 2026-09-26:
 * *"make it simple, easy to understand"*).
 *
 * ONE SHAPE, EVERY TIME: how much, which way, than what. "2 more than yesterday", "40m less than
 * yesterday", "about 1 more a day than the week before", "about the same as the two weeks
 * before". A count is "more" or "fewer", an amount "more" or "less"; the words are the same
 * whichever way the number went, so a smaller number reads as a fact and never as a fault — and
 * nothing here names the baby, because a figure is about the log.
 *
 * "ABOUT" MEANS A ROUNDING, and it is there exactly when one was made: a range compares averages,
 * so every range sentence is "about"; a day compares totals, so "2 more than yesterday" is exact and
 * only "about the same" (inside `GLANCE_SAME`'s step) is approximate.
 *
 * Held by `glance.test.ts` to `glanceVerdictHits` (`glance.banned.ts`) — every sentence at every
 * amount, both ways, for every span.
 */
import type { Comparison, GlanceFigure } from './glance';

/**
 * THE STRETCH BEFORE, NAMED THE WAY A PERSON WOULD. "Yesterday" for a day; "the week before" and
 * "the two weeks before" for the two ranges a parent says in weeks; the days themselves past that.
 * Not "last week": the range is the seven days ending today, and "last week" is a calendar week to
 * most people — a different seven days.
 */
export function compareSpan(days: number): string {
  if (days <= 1) return 'yesterday';
  if (days === 7) return 'the week before';
  if (days === 14) return 'the two weeks before';
  return `the ${days} days before`;
}

/** The end of every comparison line — what a locked line keeps when its words are withheld. */
export const comparedWith = (days: number): string => `than ${compareSpan(days)}`;

/** Canonical → the household's words: ml to its unit, minutes to `1h 35m`. */
export interface GlanceFormat {
  volume: (ml: number) => string;
  duration: (minutes: number) => string;
}

const COUNTED: ReadonlySet<GlanceFigure> = new Set(['feeds', 'diapers']);

/** A count is the number itself; sleep is a length; pumping is a volume. */
function amountOf(figure: GlanceFigure, c: Comparison, fmt: GlanceFormat): string {
  if (COUNTED.has(figure)) return String(c.amount);
  return figure === 'sleep' ? fmt.duration(c.amount) : fmt.volume(c.amount);
}

/**
 * More takes a plus and less a minus, glued to the amount, so the short line is a number and not
 * a dash standing in a sentence (`+5h 8m`, `−2`).
 */
function signed(direction: 'more' | 'less', amount: string): string {
  return `${direction === 'more' ? '+' : '\u2212'}${amount}`;
}

/**
 * One figure's comparison as a line. A day's is a total and exact; a range's is a figure a day and
 * says "about" and "a day".
 */
export function comparisonLine(
  figure: GlanceFigure,
  c: Comparison,
  days: number,
  fmt: GlanceFormat,
): string {
  const span = compareSpan(days);
  const counted = COUNTED.has(figure);
  if (c.direction === 'same') {
    // an exact count that did not move is the same; anything rounded is about the same
    return days === 1 && counted ? `same as ${span}` : `about the same as ${span}`;
  }
  const word = c.direction === 'more' ? 'more' : counted ? 'fewer' : 'less';
  const amount = amountOf(figure, c, fmt);
  return days === 1
    ? `${amount} ${word} than ${span}`
    : `about ${amount} ${word} a day than ${span}`;
}

/**
 * THE SAME COMPARISON, SHORTER, for the right of the figure when the full line does not fit
 * (the owner, 2026-10-03: beside the number, and "if it does not fit replace the more to +5h 8m
 * than yesterday"). "5h 8m more than yesterday" becomes "+5h 8m than yesterday". "About the same"
 * drops the "about", which the full line and the screen reader keep.
 */
export function comparisonShort(
  figure: GlanceFigure,
  c: Comparison,
  days: number,
  fmt: GlanceFormat,
): string {
  const span = compareSpan(days);
  if (c.direction === 'same') return `same as ${span}`;
  const amount = signed(c.direction, amountOf(figure, c, fmt));
  return days === 1 ? `${amount} than ${span}` : `${amount} a day than ${span}`;
}

/**
 * THE AMOUNT ALONE, when even the short line does not fit beside a long figure on a narrow phone.
 * "+5h 8m" still says which way. The card's own note names what it is compared with.
 */
export function comparisonTight(
  figure: GlanceFigure,
  c: Comparison,
  days: number,
  fmt: GlanceFormat,
): string {
  if (c.direction === 'same') return 'same';
  return signed(c.direction, amountOf(figure, c, fmt));
}

/**
 * The line under a card that says what its comparisons are measured against. The stretch before is
 * cut at the time of day it is now (`previousWindow`), and a comparison that did not say so would
 * read "5 fewer than yesterday" as a claim about all of yesterday.
 */
export const comparedNote = (days: number): string =>
  days <= 1
    ? 'Compared with yesterday, up to this time of day.'
    : `Compared with ${compareSpan(days)}, up to this time of day.`;
