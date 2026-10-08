/**
 * THE CARD'S LIVE LINE: the one sentence under its words that says what to do next — try the
 * control, tap the next tab, come back, or open the right page — chosen from where the parent is
 * standing and how far the card has got. Pure, so every (card, place, progress) combination is
 * answered in node rather than found on a phone.
 *
 * It lived in the overlay as a chain of ternaries, and the owner walked into two of its gaps on
 * one run (2026-09-25):
 *
 *  - *"step 4 is completed, but it still says "go back to schedule whern you are done", when im
 *    alreayd in the schedule page … i'm still stuck here, until i manualy open the stash"*;
 *  - *"start of step 5 of 7, and it says "go back to stash when you're done here", does not make
 *    sense, i am in stash"*.
 *
 * The line itself was right for what it was told; what it was told was wrong. "Back to Schedule"
 * PUSHED a second tab navigator over Manage instead of popping it (`goHome.ts` has the React
 * Navigation 7 change behind that), so the tour counted a page over the tabs on every tab that
 * followed. Both halves are fixed at their own root — the navigation pops, and `pagesOver` counts
 * from the top-most tabs — and this function is the other half: the one rule for which line a
 * card shows, stated once, with the hand-off (`TOUR_LINES.door`) named after the NEXT card's tab.
 *
 * THE RULES, in the order they win:
 *
 *   1. A card that has been answered says nothing more: it is on its way out, and a line in the
 *      pause before the next card is about a card that is leaving (tapping Stash used to flash
 *      "Open Schedule to follow along." for that half second).
 *   2. On a page pushed over the tabs: "Go back to <card's tab> when you're done here." This is the
 *      only place that line may appear — the parent really has left the card's page.
 *   3. On another tab: the hand-off, "Tap <next tab> when you're ready.", when the card's own
 *      thing has been done (its door is in the bar on every tab); otherwise "Open <card's tab> to
 *      follow along." — which the owner asked about on 2026-09-22 (*"open schedule to follow
 *      along? find out if it's really needed"*): it is, for a card resumed from Help on the wrong
 *      tab, and never on a page pushed from the card's own tab, which is rule 2's.
 *   4. On the card's own page: its instruction — the thing to try first, then the hand-off (or,
 *      on the shopping card, its deed: "Tap Add supplies…", then "Tap Share.") — for as long as it
 *      waits; nothing once it is settled or if it asks for nothing.
 *
 * Neither line names the page the parent is on: a door leads to another tab by construction
 * (`withDoors`), "Open" is only said away from the card's tab, and "Go back" only off the tabs.
 *
 * (A card whose control was ON a pushed page was at home there, and rule 2 skipped it: the Activity
 * log's search and the day wheel on Manage, two tips of 2026-09-26. Both went on 2026-09-28, when
 * the owner decided every tip, so every card is on a tab and rule 2 holds for all of them.)
 */
import { canSee, deedReady, hintOf, TOUR_LINES, type TourStep, type TourTab } from './steps';

/**
 * Where the parent is, relative to the card: on its page (`here`), on another tab with the bar in
 * view (`tab`), or on a page pushed over the tabs (`page`). The provider decides it from the
 * navigator's state; this file only reads it.
 */
export type TourStanding = 'here' | 'tab' | 'page';

export interface TourLineState {
  standing: TourStanding;
  /** The card's control has been tried (`TourFirst`): its own job is done. */
  tried: boolean;
  /** The card has just been answered, and the tour is moving on. */
  acted: boolean;
  /** The card was answered earlier and is being looked at again with ‹: nothing waits. */
  settled: boolean;
}

/** The line for this card, here and now — or `undefined` for none. */
export function lineOf(step: TourStep, s: TourLineState): string | undefined {
  if (s.acted) return undefined;
  const standing = s.standing;
  if (standing === 'page') return TOUR_LINES.back(step.tab);
  const door = step.action?.kind === 'tab' ? step.action.tab : null;
  if (standing === 'tab') {
    // the thing on the card's page is done, and its door is in the bar on this tab too
    if (door !== null && step.first !== undefined && s.tried && !s.settled) {
      return TOUR_LINES.door(door);
    }
    return TOUR_LINES.open(step.tab);
  }
  if (s.settled || step.action === undefined) return undefined;
  return hintOf(step, s.tried);
}

/**
 * ── THE WAY PAST THE THING TO TRY ─────────────────────────────────────────────────────────────
 *
 * WHETHER NEXT PASSES THE CARD'S THING TO TRY, UNTRIED — and so whether the line that says so
 * (`TourFirst.already`) is under the live line (the owner, 2026-09-27, on card 4: *"if you already
 * did this in onboarding you can skip this"*).
 *
 * A card's Next is held while its deed can be done from where the parent stands: the way on is the
 * thing the live line names. Card 4's thing to try is Manage, and a parent who set the rhythms in
 * setup has nothing to change there, so until Manage has been opened Next is live on that card and
 * the line names it. It is the card's own control, doing the one thing it always does — the next
 * card, which opens its own page — so nothing new can go wrong behind it.
 *
 * ONLY ON THE CARD'S OWN PAGE, UNTRIED, AND ASKING. Tried, the card is the door it always was: Next
 * held, the next tab breathing, "Tap Stash when you're ready." Answered, it is leaving. Revisited
 * with ‹, it asks for nothing and Next is live anyway. On a page pushed over the tabs Next reads
 * "Back to <tab>", and on another tab it is live already, under "Open <tab> to follow along." —
 * neither is where a parent reads a card's words and decides.
 */
export function passesTry(step: TourStep, s: TourLineState): boolean {
  return (
    step.first?.already !== undefined && s.standing === 'here' && !s.tried && !s.acted && !s.settled
  );
}

/**
 * ── THE WAY PAST AN OPTIONAL DEED ─────────────────────────────────────────────────────────────
 *
 * WHETHER NEXT PASSES THE CARD'S DEED, UNDONE — and so whether the line that says so
 * (`TourStep.optional`) is under the live line (the owner, 2026-09-28: *"Tour changes: Share becomes
 * optional"*).
 *
 * The shopping card asks for Share once a line is on the list, and Share still answers it. For as
 * long as it asks, Next is live beside it and says its name in words, and one line names it: *Not
 * sending it now? Tap Next to go on.* Next does the one thing it always does, the next card, so a
 * parent who would rather not send the list goes on to the closing card with no share sheet opened.
 *
 * ONLY ON THE CARD'S OWN PAGE, ONCE THE DEED MAY ANSWER IT, AND ASKING. Before a line is on the list
 * the card still asks for one (`deedReady`): Share is what is optional, not the list. Answered, it
 * is leaving; revisited with ‹, it asks for nothing and Next is live anyway. On the Supplies page
 * Next reads "Back to Shopping", and on another tab it is live already, under "Open Shopping to
 * follow along."
 */
export function passesDeed(step: TourStep, s: TourLineState): boolean {
  return (
    step.optional !== undefined &&
    s.standing === 'here' &&
    deedReady(step, s.tried) &&
    !s.acted &&
    !s.settled
  );
}

/**
 * THE LINE UNDER THE LIVE LINE THAT NAMES THE WAY PAST, where the card offers one right now: the
 * Manage card's, for a parent who set the rhythms in setup (`passesTry`), or the shopping card's,
 * for one who is not sending the list (`passesDeed`). Undefined everywhere else. Whenever this is a
 * line, the card's Next is live and shows its name in words, because that is what the line names.
 */
export function wayPast(step: TourStep, s: TourLineState): string | undefined {
  if (passesTry(step, s)) return step.first?.already;
  if (passesDeed(step, s)) return step.optional;
  return undefined;
}

/**
 * ── LEAVING THE CARD'S PAGE, AND COMING BACK TO IT ─────────────────────────────────────────────
 *
 * The owner, 2026-09-30: *"it then brought me to step 3, schedule, where i decided to go back to
 * today page to check, and then went to schedule again, but the tour box is now gone. i have to go
 * to settings and continue tour, but new users wont know this. the only way to remove the tour box
 * from the page is by clicking x or skip, going to another page shouldnt cancel everything."*
 *
 * THE RULE: only the card's × or its Skip ends or hides the tour. Wherever the parent goes, the tour
 * is on the screen, as its card or as its bar, with a way back to the card's page on it.
 *
 *  - On the card's own page (`here`) the card is itself, and coming back to that page opens it
 *    again (the provider's arrival, since 2026-09-25).
 *  - On the page the card sends the parent to on purpose (`detourOf`: Manage for the Schedule card,
 *    Supplies for the shopping card) it is what it has been: open as they arrive, down on their first
 *    scroll, with "Back to Schedule" as its Next.
 *  - Anywhere else, another tab or a page they opened themselves, it goes down to its bar at once,
 *    out of the way of what they went there to look at (`downWhenAway`), and the bar carries the way
 *    back (`wayBack`), "Back to Schedule". A tap on the bar still opens the whole card.
 */

/**
 * WHERE THE PARENT IS, NEXT TO THE CARD: on a page pushed over the tabs (`page`); on another tab,
 * from where the card's control cannot be seen (`tab`); or where the card is about (`here`). A card
 * about a whole page, with no control, is away on any other tab. The provider reads `tab` and
 * `pushed` off the navigator; every rule here reads where that leaves the parent from this.
 */
export function standingOf(
  step: TourStep,
  where: { tab: string | null; pushed: number },
): TourStanding {
  if (where.pushed > 0) return 'page';
  if (step.anchor === null) return where.tab !== null && where.tab !== step.tab ? 'tab' : 'here';
  return !canSee(step, where) && where.tab !== step.tab ? 'tab' : 'here';
}

/** The page pushed over the tabs that a card sends the parent to on purpose, by route name. */
export function detourOf(step: TourStep): string | null {
  const first = step.first;
  if (first === undefined) return null;
  if (first.page !== undefined) return first.page;
  return first.event.startsWith('page:') ? first.event.slice('page:'.length) : null;
}

/**
 * A card of the tour that asks the parent for something: a deed, or a thing to try. The closing card
 * asks for nothing (its Done ends the tour from anywhere), and a tip is one card with its Got it.
 */
const asks = (step: TourStep): boolean =>
  step.guide === 'main' && (step.action !== undefined || step.first !== undefined);

/**
 * WHETHER THE CARD GOES DOWN TO ITS BAR THE MOMENT THE PARENT IS SOMEWHERE ELSE: away from its page,
 * and not on the page it sent them to. `page` is the page pushed over the tabs, by route name, or
 * null on a tab.
 */
export function downWhenAway(
  step: TourStep,
  where: { standing: TourStanding; page: string | null },
): boolean {
  if (!asks(step) || where.standing === 'here') return false;
  return !(where.standing === 'page' && where.page !== null && where.page === detourOf(step));
}

/**
 * THE WAY BACK TO THE CARD'S PAGE, from where the parent is standing, or null where there is none to
 * offer: on the card's own page; on a card answered and on its way out; on a card that asks for
 * nothing; and on another tab once a door's own thing is done, whose next tab is breathing in the
 * bar right there ("Tap Stash when you’re ready."). On a page pushed over the tabs it is always the
 * card's tab: the bar, and every tab cell in it, is under the page.
 */
export function wayBack(step: TourStep, s: TourLineState): TourTab | null {
  if (!asks(step) || s.acted || s.standing === 'here') return null;
  if (s.standing === 'page') return step.tab;
  const doorDone = step.action?.kind === 'tab' && step.first !== undefined && s.tried && !s.settled;
  return doorDone ? null : step.tab;
}
