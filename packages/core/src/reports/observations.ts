/**
 * The objective observations (PRODUCT_SPEC.md §8) — and the lint that keeps them objective.
 *
 * FOUR SENTENCES ARE PERMITTED, and they are the four §8 names: the average bottle, the average
 * gap between feeds, the average pump output, and the longest sleep stretch logged. Each one is
 * a quotient of the household's own entries, stated as a fact with its own sample size, and the
 * verbatim hint underneath says so in the app's own words.
 *
 * WHAT MAKES THIS SAFE IS THE ABSENCE, NOT THE WORDING. There is no sentence here that could be
 * rewritten into advice, because there is no comparison to anything: not to a guideline, not to
 * another household, not to this household last week. "Your baby took 4 oz on average" is
 * arithmetic; "your baby took less than last week" is a trend a parent reads as a verdict, and
 * a trend is what §8's own rule excludes. That is also why `REPORT_BANNED` contains the
 * comparative words rather than only the clinical ones — `low`, `normal`, `enough`, `improved`
 * are the ones a well-meaning edit reaches for.
 *
 * `reportBannedHits` is the same instrument as `vaccines/copy.ts`'s `bannedHits`, deliberately:
 * a second shape for the same job is a second thing to keep in step. The test runs it over every
 * sentence this file can produce, at several sample sizes, so a copy change cannot slip a
 * judgment in.
 *
 * Units are formatted by the CALLER. Core stores ml and minutes and knows nothing about ounces
 * (CLAUDE.md §6 "canonical in storage, converted at the edge only").
 */
import type { ReportStats } from './stats';

/** §8, verbatim. It rides under the observations wherever they appear. */
export const OBSERVATION_HINT =
  'Arithmetic on your entries only. No judgment of amounts, supply, sleep or growth.';

export const OBSERVATIONS_HEADER = 'What the numbers say';

/**
 * Words that would turn a fact into a verdict. Three families, and the third is the one that
 * catches a careless edit: clinical language, advice language, and COMPARISON language.
 */
export const REPORT_BANNED = [
  // a verdict on an amount
  'low',
  'high',
  'enough',
  'too much',
  'too little',
  'plenty',
  'short of',
  'normal',
  'abnormal',
  'healthy',
  'unhealthy',
  'concern',
  'concerning',
  'worrying',
  'poor',
  'good',
  'bad',
  'better',
  'worse',
  'ideal',
  'optimal',
  'target',
  'goal',
  'on track',
  'behind',
  'ahead',
  // advice
  'should',
  'you need',
  'we recommend',
  'recommend',
  'suggest',
  'try to',
  'consider',
  'aim for',
  'make sure',
  // the clinical frame
  'supply',
  'growth spurt',
  'regression',
  'colic',
  'reflux',
  'dehydrat',
  'weight gain',
  'percentile',
  'diagnos',
  'symptom',
] as const;

/**
 * THE TWO ENTRIES THAT ARE STEMS, NOT WORDS — and until 2026-09-17 neither of them ever fired.
 *
 * Everything else in the list above is matched between word boundaries, which is right: `low`
 * must not catch `lowering` in a sentence about a bottle. But `\bdehydrat\b` cannot match
 * "dehydration" — there is no boundary between the `t` and the `i` — so the two words in the
 * list that exist only as prefixes were dead the day they were written. "A diagnosis of reflux"
 * was caught by `reflux` alone, and "signs of dehydration" was caught by nothing at all.
 *
 * A safety lint that silently does not fire is worse than no lint, because it is trusted. These
 * two match as prefixes; every other entry keeps whole-word matching, so nothing widens.
 */
export const REPORT_BANNED_STEMS: readonly string[] = ['dehydrat', 'diagnos'];

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive, whole words — except the stems above, which match a word that starts with them. */
const hits = (text: string, list: readonly string[], stems: readonly string[]): string[] =>
  list.filter(w =>
    new RegExp(stems.includes(w) ? `\\b${escapeRe(w)}` : `\\b${escapeRe(w)}\\b`, 'i').test(text),
  );

/** The banned entries a sentence contains. */
export function reportBannedHits(text: string): string[] {
  return hits(text, REPORT_BANNED, REPORT_BANNED_STEMS);
}

/** Shared with `celebrations`, which bans praise on top of this list. */
export const bannedHitsIn = hits;

export interface ObservationFormat {
  /** ml → the household's own unit, e.g. `4 oz`. */
  volume: (ml: number) => string;
  /** minutes → `1h 35m`. */
  duration: (minutes: number) => string;
}

const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/**
 * One §8 fact, split so a screen can draw the figure large and still speak the whole sentence.
 * `sentence` is what `observations` returns; the lint runs over every field.
 */
export interface ObservationFact {
  id: 'bottle' | 'gap' | 'pump' | 'sleep';
  /** The figure, already in the household's unit. */
  value: string;
  /** The words over the figure. */
  label: string;
  /** The sample, or the measure, under it. Null when the sentence has nothing further. */
  note: string | null;
  /** The full sentence, for a screen reader and for the lint. */
  sentence: string;
}

/**
 * The facts, in §8's order, omitting any the household has no entries for.
 *
 * Every sentence carries its own N, except the gap, which is one average and says how it was
 * measured. An average over two bottles and an average over two hundred are different kinds of
 * number, and a reader who cannot see which one this is has been told something misleading by
 * omission — which is the same defect as saying it outright.
 */
export function observationFacts(
  stats: ReportStats,
  fmt: ObservationFormat,
  feedGapMinutes: number | null,
): ObservationFact[] {
  const out: ObservationFact[] = [];
  if (stats.milk.count > 0) {
    const value = fmt.volume(Math.round(stats.milk.averageMl));
    const note = `over ${stats.milk.count} ${plural(stats.milk.count, 'bottle')}`;
    out.push({
      id: 'bottle',
      value,
      label: 'A bottle, on average',
      note,
      sentence: `A bottle was ${value} on average, ${note}.`,
    });
  }
  if (feedGapMinutes !== null) {
    const value = fmt.duration(feedGapMinutes);
    out.push({
      id: 'gap',
      value,
      label: 'Between feeds',
      note: 'Start to start',
      sentence: `Feeds were ${value} apart on average, start to start.`,
    });
  }
  if (stats.pump.count > 0) {
    const value = fmt.volume(Math.round(stats.pump.averageMl));
    const note = `over ${stats.pump.count} ${plural(stats.pump.count, 'session')}`;
    out.push({
      id: 'pump',
      value,
      label: 'A pumping session',
      note,
      sentence: `A pumping session gave ${value} on average, ${note}.`,
    });
  }
  if (stats.sleep.longestMinutes > 0) {
    const value = fmt.duration(stats.sleep.longestMinutes);
    out.push({
      id: 'sleep',
      value,
      label: 'Longest sleep logged',
      note: null,
      sentence: `The longest sleep logged was ${value}.`,
    });
  }
  return out;
}

/** The sentences, in §8's order. The same facts `observationFacts` draws as figures. */
export function observations(
  stats: ReportStats,
  fmt: ObservationFormat,
  feedGapMinutes: number | null,
): string[] {
  return observationFacts(stats, fmt, feedGapMinutes).map(f => f.sentence);
}

/** What the section says when the range holds nothing to do arithmetic on. */
export const OBSERVATIONS_EMPTY = 'Nothing logged in this range yet.';
