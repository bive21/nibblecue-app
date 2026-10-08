/**
 * The published rhythms, read from a versioned guidance file (CLAUDE.md §2 rule 5).
 *
 * WHY THIS EXISTS. Onboarding's "How often?" step opened with every chip empty, so a parent
 * setting up at 3 a.m. had to decide five rhythms from nothing before the app would plan anything
 * (the owner, 2026-09-17: "this feature is a must have due fasten the onboarding process… we are
 * not deciding it for them for good, they will review preselect this and then they will change if
 * it doesnt match their schedule"). They are right, and the route they named is the one this
 * repository already uses twice: the milk-storage windows and the immunisation schedule are both
 * published tables in versioned files, shown with their source and date.
 *
 * WHAT MAKES A PRESELECTED NUMBER A QUOTE RATHER THAN AN OPINION. Four things, and all four have
 * to hold:
 *
 *  1. IT IS QUOTED, NEVER WRITTEN. Every rhythm carries the publisher's sentence, in the file, so
 *     a reviewer checks the value against the page without leaving the repository. Nothing here
 *     was averaged across sources, rounded from memory, or inferred.
 *  2. THE SOURCE IS ON THE SCREEN — the right one. Three publishers are involved (CDC for
 *     feeding, pumping and vitamin D; AAP for bathing, tummy time and diapers; since 2026-09-26
 *     the WHO for playtime's daily goal), so the source is per rhythm and the screen names the
 *     one the value actually came from.
 *  3. IT IS A STARTING POSITION. One tap changes it, one tap clears it, it is applied once, and
 *     the app never re-applies it.
 *  4. WHERE THE SOURCE IS SILENT, SO IS THE APP. Past the last feeding band there is no feeding
 *     suggestion and therefore no pumping one either; with no date of birth there is neither.
 *
 * THE UNIT IS THE SOURCE'S OWN. Feeding, pumping and diapers are published as intervals; bathing
 * is published per week and lands on the app's day cadence; tummy time is published as a count
 * per day, which is exactly how this app models it. Nothing is converted into a unit its source
 * did not use.
 */
import { z } from 'zod';
import rhythmUs2026_09 from './rhythm-guidance.us.2026_09.json';

/**
 * A publication. `retrievedOn` is its own when it was read on another day than the file's — the
 * WHO's was added on 2026-09-26, nine days after the rest (`guidanceSourceLine` dates each one).
 */
const Source = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  retrievedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const Band = z.object({
  id: z.string(),
  fromDays: z.number().int().min(0),
  toDays: z.number().int().min(0),
  label: z.string(),
  perDayLow: z.number().int().positive(),
  perDayHigh: z.number().int().positive(),
  everyHoursLow: z.number().positive(),
  everyHoursHigh: z.number().positive(),
  suggestEveryMinutes: z.number().int().positive(),
  quote: z.string().min(20),
});

/**
 * "400 IU", "10 mcg", "2.5 ml" — any number followed by a dose unit. The guard on `note`, so a
 * later edit to the guidance file cannot quietly put an amount back onto a screen.
 */
const noAmountIn = (s: string): boolean => !/\d+\s?(iu|mg|mcg|ml|g)\b/i.test(s);

/**
 * A published supplement, and the one place in this file where the source's own sentence is NOT
 * what a screen shows.
 *
 * `quote` is the record: the publisher's sentence verbatim, so a reviewer can check the file
 * against the source. It carries an amount ("400 IU"), because the CDC's sentence does.
 *
 * `note` is what the app is allowed to render: the same recommendation with the CADENCE only,
 * which is the one thing the app fills in. A dose figure beside an Add button reads as an
 * instruction however it is attributed, and CLAUDE.md §2 rule 4 is absolute — "not ever, not
 * with a disclaimer". So the number stays in the file, out of the app, and the parent writes
 * what they were told to give on the item in their own words. `noAmountIn` enforces it.
 */
const Supplement = z.object({
  id: z.string(),
  name: z.string().min(1),
  kind: z.enum(['MEDICINE', 'VITAMIN', 'CREAM', 'OTHER']),
  timesADay: z.number().int().min(1).max(4),
  appliesWhenFeeding: z.array(z.string()).min(1),
  sourceId: z.string(),
  /** The publisher's sentence, verbatim. Never rendered — see `note`. */
  quote: z.string().min(20),
  /** The cadence, with no amount in it. THIS is what a screen may show. */
  note: z.string().min(1).refine(noAmountIn, {
    message: 'a supplement note may not carry an amount (CLAUDE.md §2 rule 4)',
  }),
});

/** The shape the file has to keep. A malformed guidance file fails the build, never the phone. */
export const RhythmGuidance = z.object({
  profile: z.string(),
  version: z.string(),
  retrievedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  disclaimer: z.string().min(1),
  sources: z.record(z.string(), Source),
  feeding: z.object({
    modules: z.array(z.string()).min(1),
    sourceId: z.string(),
    bands: z.array(Band).min(1),
    beyondDays: z.number().int().positive(),
  }),
  pump: z.object({
    modules: z.array(z.string()).min(1),
    sourceId: z.string(),
    followsFeeding: z.literal(true),
    quote: z.string().min(20),
  }),
  diaper: z.object({
    modules: z.array(z.string()).min(1),
    sourceId: z.string(),
    suggestEveryMinutes: z.number().int().positive(),
    everyHoursLow: z.number().positive(),
    everyHoursHigh: z.number().positive(),
    quote: z.string().min(20),
  }),
  bath: z.object({
    modules: z.array(z.string()).min(1),
    sourceId: z.string(),
    suggestEveryDays: z.number().int().positive(),
    perWeek: z.number().positive(),
    quote: z.string().min(20),
  }),
  tummy: z.object({
    modules: z.array(z.string()).min(1),
    sourceId: z.string(),
    suggestTimesADay: z.number().int().min(1).max(4),
    timesLow: z.number().int().positive(),
    timesHigh: z.number().int().positive(),
    quote: z.string().min(20),
    /**
     * THE DAILY GOAL, derived rather than quoted — and held to that. The source publishes a
     * count of goes and minutes per go; the app's unit is a daily total, so the file records
     * the product of the two low ends and says so in its own note. The guard below is the
     * arithmetic re-done: a goal that is not `timesLow × minutesLowPerGo` is a number somebody
     * typed, and the file refuses it.
     */
    goal: z.object({
      suggestMinutes: z.number().int().positive(),
      minutesLowPerGo: z.number().int().positive(),
      minutesHighPerGo: z.number().int().positive(),
    }),
  }),
  /**
   * PLAYTIME'S DAILY GOAL (the owner, 2026-09-26: *"goals need to be increased if anything to 3
   * hours a day (user still can change) based on the WHO report"*). Tummy time's second life
   * (`modules/variants.ts`) keeps a goal in the same unit, and the source publishes a daily
   * minimum and no maximum ("more is better"), so the goal is that minimum. The guard is the
   * arithmetic re-done, as the tummy goal's is: a goal that is not the published minimum is a
   * number somebody typed, and the file refuses it.
   */
  playtime: z
    .object({
      modules: z.array(z.string()).min(1),
      variant: z.literal('playtime'),
      sourceId: z.string(),
      quote: z.string().min(20),
      goal: z.object({
        suggestMinutes: z.number().int().positive(),
        minutesLow: z.number().int().positive(),
      }),
    })
    .refine(p => p.goal.suggestMinutes === p.goal.minutesLow, {
      message: 'the playtime goal is the published daily minimum, never a number of its own',
    }),
  supplements: z.object({ items: z.array(Supplement) }),
});

export type RhythmGuidanceProfile = z.infer<typeof RhythmGuidance>;
export type FeedingBand = z.infer<typeof Band>;
export type GuidanceSupplement = z.infer<typeof Supplement>;

export const RHYTHM_GUIDANCE: RhythmGuidanceProfile = RhythmGuidance.parse(rhythmUs2026_09);

/** Whole days between two instants, floored — the unit the bands are expressed in. */
export const ageInDays = (birthMs: number, nowMs: number): number =>
  Math.max(0, Math.floor((nowMs - birthMs) / 86_400_000));

/**
 * The feeding band a baby of this age falls in, or null past the last one.
 *
 * Null is a real answer, and the caller draws nothing rather than reaching for the nearest band:
 * a two-year-old is not "the 6-to-12-month rhythm, stretched".
 */
export function bandFor(
  days: number,
  g: RhythmGuidanceProfile = RHYTHM_GUIDANCE,
): FeedingBand | null {
  if (days > g.feeding.beyondDays) return null;
  return g.feeding.bands.find(b => days >= b.fromDays && days <= b.toDays) ?? null;
}

/**
 * The chip nearest a published interval WITHOUT GOING OVER IT.
 *
 * Clamped, never rounded up: the app never opens a control at an interval LONGER than the source
 * published, and it never invents a chip to fit a number. `choices` comes from the caller because
 * which chips exist is a UI fact.
 */
function nearestAtOrBelow(wanted: number, choices: readonly number[]): number | null {
  if (choices.length === 0) return null;
  if (choices.includes(wanted)) return wanted;
  const below = choices.filter(c => c <= wanted);
  return below.length > 0 ? Math.max(...below) : Math.min(...choices);
}

/** What the FEEDING row opens on, or null where the source is silent. */
export function feedingSuggestion(
  days: number,
  choices: readonly number[],
  g: RhythmGuidanceProfile = RHYTHM_GUIDANCE,
): number | null {
  const band = bandFor(days, g);
  return band === null ? null : nearestAtOrBelow(band.suggestEveryMinutes, choices);
}

/**
 * What the PUMPING row opens on: whatever feeding opens on.
 *
 * The CDC does not publish a pumping interval — it publishes a RULE, that pumping matches the
 * feeding rhythm. Copying the rule is quoting it; picking a number of our own would not be. So a
 * household with no feeding suggestion has no pumping one either.
 */
export const pumpSuggestion = (
  days: number,
  choices: readonly number[],
  g: RhythmGuidanceProfile = RHYTHM_GUIDANCE,
): number | null => feedingSuggestion(days, choices, g);

/** What the DIAPER row opens on. One published interval for the whole period, not banded. */
export const diaperSuggestion = (
  choices: readonly number[],
  g: RhythmGuidanceProfile = RHYTHM_GUIDANCE,
): number | null => nearestAtOrBelow(g.diaper.suggestEveryMinutes, choices);

/** What the BATH row opens on, in whole days, clamped to the cadence chips the app offers. */
export const bathSuggestion = (
  choices: readonly number[],
  g: RhythmGuidanceProfile = RHYTHM_GUIDANCE,
): number | null => nearestAtOrBelow(g.bath.suggestEveryDays, choices);

/**
 * What the TUMMY TIME row opens on now that it is a DAILY GOAL in minutes (the owner,
 * 2026-09-19): the smallest daily total the quoted sentence supports — its low count of goes
 * times its low minutes per go — landed on the chip at or below it. The source does not
 * publish a daily total, and this file does not pretend it does; `rhythm.test.ts` re-does the
 * multiplication so the number in the file cannot drift from the sentence beside it.
 */
export const tummyGoalSuggestion = (
  choices: readonly number[],
  g: RhythmGuidanceProfile = RHYTHM_GUIDANCE,
): number | null => nearestAtOrBelow(g.tummy.goal.suggestMinutes, choices);

/**
 * THE SOURCE'S OWN NUMBER, UNSNAPPED — what setup actually seeds.
 *
 * `tummyGoalSuggestion` lands the sentence on the nearest chip at or below it, which was right
 * while the chips ran from five minutes up. They start at fifteen now (the owner, 2026-09-19:
 * "just do 15m a day, 30 min, 1hour , or custom"), and a newborn's five-minute sentence landing
 * on fifteen would be the app proposing THREE TIMES what the guidance supports — the exact thing
 * CLAUDE.md §2 forbids, arrived at by a rounding rule nobody re-read when the chips changed.
 *
 * So the seed is the published number and the chips are a parent's picker, which is what each of
 * them always was. Any positive whole minute is a valid goal (`isGoalMinutes`), the row's Custom
 * chip shows a value that is not one of the three, and `rhythm.test.ts` still re-does the
 * multiplication so the file cannot drift from the sentence beside it.
 */
export const tummyGoalMinutes = (g: RhythmGuidanceProfile = RHYTHM_GUIDANCE): number =>
  g.tummy.goal.suggestMinutes;

/**
 * WHAT PLAYTIME'S GOAL BECOMES ON THE DAY A HOUSEHOLD SWITCHES TO IT — the published daily
 * minimum, 180 minutes, unsnapped, for `tummyGoalMinutes`' reason (the owner, 2026-09-26). It is
 * written once, by the switch under What you track (`graduationSettings` in `today/goal.ts`),
 * which also keeps the tummy-time goal it replaces so switching back puts that one back. Nothing
 * reads the baby's age for it, nothing re-applies it, and the Playtime chips change it in a tap.
 */
export const playtimeGoalMinutes = (g: RhythmGuidanceProfile = RHYTHM_GUIDANCE): number =>
  g.playtime.goal.suggestMinutes;

/**
 * The supplements this household's own feeding answer is published guidance for.
 *
 * BREAST MILK HAS TO BE NAMED. The CDC sentence is about babies fed breast milk, exclusively or
 * alongside formula, so a household that did not say they nurse or pump is offered nothing —
 * including one that answered nothing at all. Silence is not consent to a supplement offer, and
 * an empty list is the correct answer to a question nobody asked.
 *
 * `feeding` carries the step-3 card ids (`FEEDING_CARDS`: breast, pumping, bottles, solids).
 */
export function supplementsFor(
  feeding: readonly string[],
  g: RhythmGuidanceProfile = RHYTHM_GUIDANCE,
): GuidanceSupplement[] {
  return g.supplements.items.filter(s => s.appliesWhenFeeding.some(w => feeding.includes(w)));
}

/** The publication a rhythm's value came from, for the line that has to sit beside it. */
export const sourceOf = (
  sourceId: string,
  g: RhythmGuidanceProfile = RHYTHM_GUIDANCE,
): { name: string; url: string; retrievedOn?: string | undefined } | null =>
  g.sources[sourceId] ?? null;

/**
 * `CDC — …, AAP HealthyChildren — … · retrieved 2026-09-17`, for a screen showing values from
 * more than one publisher at once. Names every source actually used, never the file, and the day
 * each was read: one date for the lot when they share it, each its own when they do not.
 */
export function guidanceSourceLine(
  sourceIds: readonly string[],
  g: RhythmGuidanceProfile = RHYTHM_GUIDANCE,
): string {
  const used = [...new Set(sourceIds)]
    .map(id => sourceOf(id, g))
    .filter((s): s is NonNullable<typeof s> => s !== null);
  const dates = [...new Set(used.map(s => s.retrievedOn ?? g.retrievedOn))];
  if (used.length === 0) return '';
  if (dates.length === 1) return `${used.map(s => s.name).join('; ')} · retrieved ${dates[0]}`;
  return used.map(s => `${s.name} · retrieved ${s.retrievedOn ?? g.retrievedOn}`).join('; ');
}
