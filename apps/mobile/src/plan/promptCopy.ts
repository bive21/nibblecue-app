/**
 * WHAT THE TRIAL-END SHEETS SAY (the owner, 2026-09-27: *"think about the 7days before trial ends
 * pop up if they would like to subscribe, then h-3 trial ends. Think about this and how we can
 * entice customers to start subscribing"*). Pure, so every sentence is tested without a screen.
 *
 * WHAT MAKES A PARENT KEEP PLUS, said honestly, in the order a tired reader meets it:
 *
 *   1. THE REAL DATE, not a countdown. "Your preview runs until Sunday, Oct 4" is a fact a
 *      parent can plan around; a ticking clock is the manufactured urgency AUTH_AND_TRIAL.md §3
 *      forbids. The heading's day count is the same number the Plan page and the Today card show.
 *   2. WHAT THEY HAVE BUILT. A count of the entries the household has logged is theirs to see, and
 *      it is the whole reason the history window matters. It is a plain count, never a judgment of
 *      it (CLAUDE.md §2 rule 6), and it is left out below `LOGGED_FLOOR`, where it would read as a
 *      reproach rather than a record.
 *   3. WHAT THEY HAVE USED (2026-09-28, `previewRecap`): the Plus surfaces this phone counted them
 *      using during the preview, "the nap outlook on 6 days, Night on 4 nights", the three used
 *      most. A parent weighing the price is weighing those, and until then the sheet named none of
 *      them. Plain counts, never "you will lose", and nothing when nothing was used.
 *   4. WHAT CHANGES, and WHAT DOES NOT, drawn by `PlanLists` from the plan matrix, so the sheet can
 *      never promise what the Plan page does not.
 *   5. THE OFFER ITSELF, with the store's own prices and the annual saving (`SubscribePanel`), and
 *      over its choices the line that one subscription covers the whole household (migration 0101;
 *      `BILLING.household`). It was this sheet's own line until 2026-09-28; the panel says it now
 *      wherever Plus is sold, so the sheet no longer says it twice.
 *
 * NEVER: a price typed here, "offer ends", a countdown, "don't lose", or anything about the baby
 * (CLAUDE.md rules 1 to 3, 13, 14). No dashes either: the owner reads one as "too AI".
 */
import type { WelcomePrompt } from '@nibblecue/core';
import { SKINS } from '@nibblecue/ui/skins';
import { plusUsageCounts, USE_UNIT, type PlusUsage, type PlusUse } from './plusUsage';

/** Below this many entries the count is not said: "3 entries so far" reads as a reproach. */
export const LOGGED_FLOOR = 5;

export interface PromptCopyInput {
  prompt: WelcomePrompt;
  /** Whole days left, as the Plan page shows it. */
  daysLeft: number;
  /** The preview's last day as the phone says it, e.g. "Sunday, Oct 4" (`endsOnLabel`). */
  endsOn: string;
  /** Entries the household has logged so far, or null while the count is loading. */
  logged: number | null;
  /** The free plan's history window in days (the matrix's `history` limit). */
  freeHistoryDays: number;
  /** What this phone counted the household using of Plus so far (`plusUsage.ts`), or null while it loads. */
  usage: PlusUsage | null;
}

export interface PromptCopy {
  /** The heading's leading number, drawn through <Numeric>. */
  headingDays: number;
  /**
   * The words after it: " days left". The tier's name is the sheet's own title, right above, so
   * the heading does not say it again (it read "7 days of CuddleCue Plus left" under "CuddleCue
   * Plus" until 2026-09-29; the owner: "this is repetitive").
   */
  heading: string;
  /** One or two sentences under the heading. */
  lead: string;
  /** "Your family has logged 86 entries so far." Null under the floor or while counting. */
  logged: string | null;
  /** "In your preview: the nap outlook on 6 days, …" (`previewRecap`). Null when nothing was used. */
  used: string | null;
}

const dayWord = (n: number): string => (n === 1 ? 'day' : 'days');

/**
 * WHAT THE RECAP CALLS EACH SURFACE: the name a parent knows it by on the screen where it wears the
 * tag. Lower case where it is a thing ("the nap outlook"), the screen's or the look's own name where
 * it is one ("Reports", "Night", the skin table's name for Glass, read from there so a rename there
 * is a rename here).
 */
export const RECAP_WORDS: Readonly<Record<PlusUse, string>> = {
  napOutlook: 'the nap outlook',
  reports: 'Reports',
  history: 'your whole history',
  stashOrder: 'the stash’s Use first list',
  fromLog: 'the schedule from your log',
  dayPlans: 'saved day plans',
  night: 'Night',
  colors: 'your colors',
  glass: SKINS.glass.label,
};

/** The recap names at most this many surfaces: the ones used most, never a list to scroll. */
export const RECAP_MAX = 3;

/**
 * THE RECAP LINE (2026-09-28): "In your preview: the nap outlook on 6 days, Night on 4 nights,
 * Reports on 3 days." The three surfaces used most, highest first, each with its own count and its
 * own unit, so a line read aloud needs nothing from the one before it; only a surface used at least
 * once, and null when there is none, rather than a sentence about nothing. A count, never a verdict
 * on it, never urgency and never a price: what was used is said, and what it costs is the store's
 * to say, one card down.
 */
export function previewRecap(usage: PlusUsage | null): string | null {
  if (usage === null) return null;
  const items = plusUsageCounts(usage).slice(0, RECAP_MAX);
  if (items.length === 0) return null;
  const parts = items.map(
    ({ use, count }) => `${RECAP_WORDS[use]} on ${count} ${USE_UNIT[use]}${count === 1 ? '' : 's'}`,
  );
  return `In your preview: ${parts.join(', ')}.`;
}

export function promptCopy(input: PromptCopyInput): PromptCopy {
  const { prompt, daysLeft, endsOn, logged, freeHistoryDays, usage } = input;
  const heading = ` ${dayWord(daysLeft)} left`;
  const lead =
    prompt === 'seven_days_left'
      ? `Your preview runs until ${endsOn}. Keep Plus and nothing changes.`
      : `On ${endsOn} your household moves to the free plan. Reports and the Log will then show ` +
        `the last ${freeHistoryDays} days, and nothing is deleted.`;
  return {
    headingDays: daysLeft,
    heading,
    lead,
    logged:
      logged !== null && logged >= LOGGED_FLOOR
        ? `Your family has logged ${logged.toLocaleString('en-US')} entries so far.`
        : null,
    used: previewRecap(usage),
  };
}

/**
 * THE DAY THE PREVIEW ENDS, on the phone's own calendar: "Sunday, Oct 4". The preview ends at the
 * time of day the household was created, fourteen days on, so it runs until that day and the free
 * plan starts on it; both sentences name the same day.
 */
export function endsOnLabel(expiresAtIso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(Date.parse(expiresAtIso)));
}
