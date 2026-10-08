/**
 * Which logged sessions a rule can be satisfied by (docs/NOTIFICATIONS.md §4–§5;
 * MULTIPLES.md §5; CARE_ITEMS.md §4): the same activity, in the rule's child scope, and the same
 * care item when the rule names one.
 *
 * A RUNNING TIMER COUNTS. It did not, until the anchor moved to the session's start
 * (`intervalAnchor` below): while the chain restarted at the END, a session still running had no
 * end to restart from, so counting it would have been guessing. It has a start, and the start is
 * now the whole answer — "pumping at 8:50" moves the next pump to 8:50 + the interval the moment
 * the timer is tapped, rather than when it is stopped (the owner, 2026-09-16: "when a pump log is
 * started — ongoing, not yet completed — the next interval and schedule can update, since the
 * time is based on when it starts"). It is also what the tile already says: the Log tile counts
 * the elapsed from a running timer's start too.
 */
import type { ActivityType } from '../domain/domain-types';
import type { Rule, Session } from './types';

/**
 * Bottle and breastfeed are one concept — a feed. The feeding nudge measured them together
 * (SCHEDULE_LOGIC §1b; the nudge is gone since 2026-09-18); since the owner asked for feeding on
 * the day plan (2026-09-15: "feeding is set every 3 hours … done 2:45 pm, then the next one
 * should be 5:45 pm"), a feeding INTERVAL rule is satisfied by either kind of feed as well. A FIXED
 * bottle at 10:00 stays a bottle: it names the thing, the interval names the rhythm.
 */
export const FEEDING: readonly ActivityType[] = ['bottle', 'breastfeed'];
/** Takes any id, because a screen asks about a module as readily as about an activity. */
export const isFeeding = (activity: string): boolean =>
  (FEEDING as readonly string[]).includes(activity);

/**
 * WHICH RULES EITHER KIND OF FEED CAN SATISFY — every feeding rule, not only the interval.
 *
 * Until 2026-09-18 a FIXED bottle at 10:00 could be satisfied only by a bottle, on the
 * reasoning that "it names the thing, the interval names the rhythm". The owner overturned it
 * from the phone: "breastfeeding the baby mean, feeding, just like bottle, so it needs to
 * update the bottle schedule too if breastfeeding is logged." They are right, and the old
 * reasoning had the purpose of the slot backwards. A 10:00 feeding slot exists so the baby is
 * fed at 10:00. A parent who breastfed at 10:00 did that. Leaving the slot open and aging it
 * to MISSED tells them they forgot something they had just done, which is the one thing a
 * schedule must never do.
 *
 * WHAT IT COSTS, recorded so the trade is visible: a household that keeps a fixed bottle in an
 * otherwise breastfed day — the evening bottle someone else gives — now has that slot closed by
 * a breastfeed at the same time. The entry still says which it was, so nothing is lost from the
 * log; what is lost is the slot's ability to nag about that distinction. Against a false MISSED
 * on every breastfed feed, that is the better failure.
 */
export const feedEitherKind = (rule: Pick<Rule, 'activity'>): boolean => isFeeding(rule.activity);

export function sessionsFor(rule: Rule, sessions: readonly Session[]): Session[] {
  const feeds = feedEitherKind(rule);
  return sessions
    .filter(s => (feeds ? isFeeding(s.type) : s.type === rule.activity))
    .filter(s => rule.childId === null || s.childId === null || s.childId === rule.childId)
    .filter(s => rule.careItemId === null || (s.careItemId ?? null) === rule.careItemId)
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
}

/**
 * WHERE AN INTERVAL RESTARTS: THE SESSION'S START, for every activity.
 *
 * This reverses §2's original "the anchor is the session's end" (the owner, 2026-09-16: "to show
 * the time pump or sleep or anything that has a start and an end time, use the start time for the
 * calculation … this applies to schedule timing too"). Two reasons it is the better reading:
 *
 *  1. IT IS HOW A HOUSEHOLD SAYS IT. "Every three hours" is start-to-start — the same sentence
 *     feeding already used, and the owner's own example (fed at 2:45, next at 5:45) is that
 *     reading. Anchoring on the end makes the gap depend on how long the session ran, so two
 *     pumps started three hours apart produce a next slot that has quietly moved.
 *  2. IT MATCHES WHAT THE TILE SAYS. A pump from 8:50 to 9:25 logged at 9:25 reads "35m" on the
 *     Log tile, because the elapsed is measured from the start too (`lastAtFor`). Anchoring the
 *     schedule on the end while the tile counted from the start would be two clocks on one screen.
 */
export const intervalAnchor = (_rule: Pick<Rule, 'activity' | 'ruleType'>, s: Session): number =>
  s.startMs;
