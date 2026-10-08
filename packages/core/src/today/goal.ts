/**
 * A DAILY GOAL IN MINUTES, and the arithmetic Today does against it.
 *
 * Tummy time is the shape this exists for. It was a count per day — "three goes before bedtime",
 * stored as three DAY-scoped reminder rules — and the owner replaced it with a goal (2026-09-19:
 * *"redesign tummy time to goal time instead of how many times per day, track the progress like
 * in the screenshot (with progress bar)"*). A goal is a better instrument for it: what a
 * household actually does is a few short goes that add up, and the sum is the fact worth
 * showing, not whether the third go happened at 4:30.
 *
 * WHAT A GOAL IS NOT. It is the household's own target, chosen from a row of chips, and the bar
 * under it is the day's minutes over that number — arithmetic over their own log and nothing
 * else (CLAUDE.md §2 rule 6). Nothing here says "behind", "not enough" or "should": a day at
 * four of fifteen minutes is drawn as four fifteenths of a bar in the module's own color, and
 * that is the whole of the statement. No reminder is produced by a goal, no slot can be missed,
 * and nothing about it varies with the baby's age — the line rule 3 draws.
 */
import type { ModuleVariant } from '../modules/variants';

/**
 * The goals a row of chips offers, in minutes. Round numbers a person would say — nobody sets a
 * goal of twelve minutes — and a range wide enough that the same row serves a first week (a few
 * minutes) and a six-month-old (most of an hour) without a hidden second list.
 */
/**
 * THREE ROUND NUMBERS, NOT SEVEN (the owner, 2026-09-19: "tummy time also the range is too close
 * and too much, just do 15m a day, 30 min, 1hour , or custom").
 *
 * Seven chips from five minutes to an hour is a row and a half of near-neighbours — the
 * difference between 15 and 20 is not a decision anybody makes, and a row of it is a row to read
 * before the one tap that matters. Three that are obviously different, and Custom for every
 * minute between and beyond.
 *
 * NONE OF THEM IS A RECOMMENDATION. They are round numbers a caregiver picks from, unselected
 * until tapped, and nothing about them varies by the baby's age — the line CLAUDE.md §2 draws.
 *
 * FIVE CAME BACK (the owner, 2026-09-21: *"6 minute is very odd, make it 5/15/30/1hr"*). The
 * published starting point for a newborn is six minutes a day (guidance/rhythm.ts), which sat
 * on no chip and so looked unset on the Routine page; with five on the ladder the seed lands on
 * a chip a parent can see and tap (`tummyGoalSuggestion`), and the ladder still reads as four
 * plainly different answers.
 */
export const GOAL_MINUTE_CHOICES: readonly number[] = [5, 15, 30, 60];

/**
 * PLAYTIME'S OWN LADDER — 1h · 2h · 3h, and Custom up to `GOAL_MINUTES_MAX` wherever a Custom is
 * offered (the owner, 2026-09-26, once playtime's goal became three hours: *"goals need to be
 * increased if anything to 3 hours a day (user still can change)"*). Tummy time's chips stop at an
 * hour, which is the first rung here: a baby past tummy time is counted in hours of play, and a
 * row of 5 · 15 · 30 · 1h beside a 3h goal would offer a parent four ways to shrink it and no way
 * to see it. Round numbers, unselected until tapped, none of them a recommendation — the same line
 * CLAUDE.md §2 draws for the tummy-time row.
 *
 * A GOAL IS THE DAY'S TOTAL, NOT ONE SESSION, and that is why it may be larger than any one entry
 * (the owner, 2026-09-27: *"Playtime limit of 3 hrs shouldn't be all at the same time, keep
 * this."*): three hours is reached across the day's sessions, one *Already finished* entry stops at
 * two hours (`TummySheet`), and a running session asks *still going?* after one (`longRun.ts`).
 */
export const PLAYTIME_GOAL_CHOICES: readonly number[] = [60, 120, 180];

/**
 * The chips for the word the household uses today: Playtime's once tummy time has graduated
 * (`modules/variants.ts`), tummy time's otherwise. Every screen that draws the goal's chips asks
 * here — the tummy sheet, the Routine page's rule sheet — so the two can never disagree.
 */
export const goalChoicesFor = (variant: ModuleVariant | null | undefined): readonly number[] =>
  variant === 'playtime' ? PLAYTIME_GOAL_CHOICES : GOAL_MINUTE_CHOICES;

/** The widest goal the setting accepts, in minutes — the same bound the database column checks. */
export const GOAL_MINUTES_MAX = 240;

/**
 * THE MODULE'S SETTINGS THE GRADUATION TOUCHES, as one row holds them (`module_settings`): the word,
 * the goal, and — while the second word is on — the goal the first word had (`base_goal_minutes`,
 * migration 0127).
 */
export interface GoalSettings {
  variant: ModuleVariant | null;
  goalMinutes: number | null;
  baseGoalMinutes: number | null;
}

/**
 * WHAT THE PLAYTIME SWITCH WRITES (the owner, 2026-09-26). Switching ON sets the goal to
 * `playtimeGoal` (the published three hours, `playtimeGoalMinutes`) and KEEPS the tummy-time goal it
 * replaces; switching OFF puts that goal back — or no goal, when there was none — and forgets it.
 * A switch to the state the row is already in writes nothing (null), so a second tap on another
 * phone's decision can never throw a kept goal away.
 *
 * Undo is the setting as it was before, written back whole — the word, the goal and the kept goal
 * together — which is why the switch reads all three before it writes. The server keeps
 * `base_goal_minutes` by the same rule from its own row (0127's trigger), so a phone that raced
 * another is corrected by its next pull rather than trusted.
 */
export function graduationSettings(
  current: GoalSettings,
  on: boolean,
  playtimeGoal: number,
): GoalSettings | null {
  if (on) {
    if (current.variant === 'playtime') return null;
    return { variant: 'playtime', goalMinutes: playtimeGoal, baseGoalMinutes: current.goalMinutes };
  }
  if (current.variant === null) return null;
  return { variant: null, goalMinutes: current.baseGoalMinutes, baseGoalMinutes: null };
}

/** A stored value is a goal only when it is a positive whole number of minutes inside the bound. */
export const isGoalMinutes = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= GOAL_MINUTES_MAX;

/**
 * How full the bar is, 0..1, clamped at both ends. A day past its goal is a FULL bar, not an
 * overflowing one — the card's words still say "22m today · 15m goal", which is the record.
 */
export function goalProgress(minutesToday: number, goalMinutes: number): number {
  if (!(goalMinutes > 0) || !(minutesToday > 0)) return 0;
  return Math.min(1, minutesToday / goalMinutes);
}

/** `12m` / `1h 05m` — the compact duration a card line carries. Whole minutes in, never seconds. */
export function goalMinutesLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${String(rest).padStart(2, '0')}m`;
}

/** The card's first line: what today holds so far. `0m today` is a true sentence, so it is one. */
export const goalTodayLine = (minutesToday: number): string =>
  `${goalMinutesLabel(minutesToday)} today`;

/** The card's last line: the household's own number, named as theirs. */
export const goalLine = (goalMinutes: number): string => `${goalMinutesLabel(goalMinutes)} goal`;

/**
 * THE DAY AGAINST THE GOAL ON ONE LINE — `5m / 1h goal` (the owner, 2026-09-21: "the first and
 * third row can be combined together… 1 row can be deleted and it will not be as tall anymore").
 * Two numbers and a slash, no verdict on the gap between them: the bar under it is the ratio.
 */
export const goalPairLine = (minutesToday: number, goalMinutes: number): string =>
  `${goalMinutesLabel(minutesToday)} / ${goalLine(goalMinutes)}`;

/**
 * The card's last line when no goal is set yet: an invitation to the sheet that sets one, in
 * the place the goal will sit. Never a number the app chose — the chips are in the sheet.
 */
export const GOAL_UNSET_LINE = 'Set a daily goal';

/** A chip's word, and the Schedule row's: `15m a day`. */
export const goalADayLabel = (goalMinutes: number): string =>
  `${goalMinutesLabel(goalMinutes)} a day`;

/**
 * What a screen reader hears for the whole card: the words, never the bar (it is decoration —
 * `ProgressLine` says why), and never a judgement.
 */
export const goalSpoken = (label: string, minutesToday: number, goalMinutes: number): string =>
  `${label}, ${goalTodayLine(minutesToday)}, ${goalLine(goalMinutes)}`;

/**
 * `3 medicines` — what a care card says instead of naming them, once there are too many names to
 * fit the third of a phone it is drawn in (the owner, 2026-09-19: "for medicine, you can list
 * the medicine as long as it fits").
 *
 * The number rather than a truncated list: a name cut off mid-word tells a parent less than a
 * count does, and the sheet behind the tap has every one of them. It is the household's own
 * items counted, not a dose and not a plan (CLAUDE.md §2 rule 4).
 */
export const careItemCount = (n: number): string => `${n} medicines`;
