/**
 * The words the schedule shows (docs/SCHEDULE_LOGIC.md §9; PRODUCT_SPEC §7). Presets are labeled
 * by duration only; missed slots are arithmetic, not a verdict; nothing here scores anyone.
 * `labels.test.ts` holds every string in this folder to a banned list.
 */
import { feedEitherKind } from './sessions';
import type { Rule } from './types';

/** The one rule that stands for both kinds of feed reads as the thing it is. */
export const FEEDING_LABEL = 'Feeding';

/**
 * What a rule is called on a row, a card and a notification: its own name when it has one (a
 * medicine item's, "Bedtime", "Nap"), "Feeding" for any feeding rule, else the module's label
 * the caller looked up (the registry is the caller's, so the engine stays free of it).
 *
 * "FEEDING" FOR EVERY FEEDING RULE, not only the interval, since 2026-09-19. Until then a FIXED
 * bottle at 10:00 read "Bottle" on the reasoning that it names the thing and the interval names
 * the rhythm — but the owner overturned the half of that which mattered on 2026-09-18
 * (`feedEitherKind`: a breastfeed answers a bottle's slot, "breastfeeding the baby mean,
 * feeding, just like bottle"), and a slot either kind of feed closes is a feeding slot, whatever
 * side of the registry it was written on. The Intervals page's set-times card for feeding
 * writes its times on the bottle side exactly as the interval is, and titles them "Feeding";
 * the day list, Up next and the reminder now say the same word.
 */
export function ruleLabel(
  rule: Pick<Rule, 'activity' | 'ruleType' | 'name'>,
  moduleLabel: string,
): string {
  if (rule.name !== null && rule.name.trim() !== '') return rule.name;
  return feedEitherKind(rule) ? FEEDING_LABEL : moduleLabel;
}

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** `90 → 1.5h`, `180 → 3h`, `45 → 45m` */
export function intervalLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : Number(h.toFixed(2))}h`;
}

/*
  `nightLine` (an interval's overnight line), `cadenceLabel` ("Every other day at 6:30 PM"),
  `ruleDetailLine` (a row's shape line), `SLOT_BADGE` (a slot row's badge) and `slotNote` (the
  note under one) went on 2026-09-26. They were the words of the Schedule screens from before the
  2026-09-19 redesigns; the app's `screens/schedule/rows.ts` was their last reader, and its row
  words went the same day. The day list says its own now (`present.ts`), and the prototype still
  draws the old ones for comparison.
*/

export const dayName = (dow: number): string => DOW[dow] ?? '';

/** The "How missed slots work" card, verbatim from the reviewed prototype. */
/**
 * HOW MISSED SLOTS WORK — five paragraphs cut to three lines (the owner, 2026-09-18: "How missed
 * slots work can be shorter, leaving too much margin on top and buttom").
 *
 * It was 730 characters inside a collapsed disclosure: two worked arithmetic examples with times
 * in them, a sentence about long gaps collapsing, and a sentence about overnight. Every one was
 * true and every one was answering a question the parent had not asked yet. What a parent opens
 * this for is a single worry — "is the app going to nag me about the feed I missed at four this
 * morning" — and the answer is the second line.
 *
 * The three that stayed are the three FACTS: where the next slot comes from, what happens when
 * one is missed, and that late still counts. The long-gap rule and the overnight rule are
 * properties of things the parent sets elsewhere (the night card says its own piece), and a
 * screen that explains everything it can is the reason this page needed shortening.
 */
export const HOW_IT_WORKS = (missAfterMinutes: number): readonly string[] => [
  'An interval counts from your last session, not from the slot it was meant to fill.',
  `Nothing logged within ${missAfterMinutes} minutes and the slot is recorded as missed. The next one today is due now. A missed slot is not reminded about again.`,
  'Logged late still counts, and the next slot moves with it.',
];

export const SCHEDULE_HINTS = {
  arithmetic: 'Missed slots are arithmetic, not a verdict. Nothing here scores you.',
  /*
    `cadence` was here, and it was the paragraph under every activity row: "A bath counts for the
    whole day…". The owner removed it (2026-09-19: "in activities interval page, 'a bath counts
    for ..' just remove this"), and they are right that it was explaining a rule nobody was
    confused by — a bath every two days behaves the way anybody would expect, and the row above
    it already says "Every 2 days · last bath yesterday". The behaviour is unchanged; only the
    lecture is gone.

    `matching`, `extras`, `target`, `series` and `phases` went on 2026-09-27: nothing had read
    them since the schedule's redesigns of 2026-09-19 on.
  */
} as const;
