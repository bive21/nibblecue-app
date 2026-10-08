/**
 * THE FIRST RUN AFTER SETUP, AND THE TIPS THAT FOLLOW IT (docs/TOUR_SCRIPT.md; the owner,
 * 2026-09-17: "create an interactive tutorial that shows how to use the app… it must highlight
 * what's important, which button to click… should not be too long or too short").
 *
 * ── WHAT THE 2026-09-21 REDESIGN CHANGED, because the shape only makes sense against it ─────
 *
 * The tour before this one walked five pages in twenty-four cards. Four of them asked the parent
 * to do something; twenty were read and dismissed with ›. It taught the stash's storage windows
 * and the shopping list's Share button to a parent who had not yet logged a second feed, and it
 * had no way to stop half way and come back — Skip ended it for good. Two of its cards pointed
 * at controls a fresh household does not have (the stash total on an empty stash, the shopping
 * list before anything is on it), and its ask card promised "five pages" to a household that
 * gets four.
 *
 * ── THE SHAPE NOW ───────────────────────────────────────────────────────────────────────────
 *
 * **ONE SHORT TOUR, SIX CARDS (FIVE WITHOUT A STASH), ALL BUT THE LAST DONE RATHER THAN READ.**
 * Log something (the one thing the app is for), open it in Today's log, which the tour brings into
 * view (where any entry is fixed; the + button's card had this place until 2026-09-27), tap
 * Schedule (the day the app builds from setup), tap Stash, tap Shopping — each page introduced in a
 * line and left to be looked at — then a closing card. `Step 2 of 6`, and the number means cards.
 * The owner, 2026-09-21: "stash and shopping needs to be introduced as well, though stash can be as
 * simple as explore stash and this is the button to add milk".
 *
 * Up next's card, "What's coming", left on 2026-09-28 (the owner: *"also i asked to remove step 3,
 * this is not needed "what's coming""*), and its door to Schedule with it: the card about Today's
 * log is that door now, once an entry has been opened.
 *
 * **A PAGE IS SHOWN BEFORE ANYTHING ON IT IS POINTED AT.** The card that arrives on Schedule sits
 * at the foot of the screen and describes the page; nothing is outlined until the parent has had
 * the page to themselves (the owner, 2026-09-21: "it asks me to click on manage intervals right
 * away, before users even have the chance to see what it is about").
 *
 * **THREE TIPS ARE LEFT, EACH ONE CARD, SHOWN ONCE, ON TODAY.** The card after a finished tour
 * (the last real one), the baby's name at the top for a household with more than one, and what is
 * behind your initial: each is shown when the thing itself is in front of the parent, never in a
 * queue on day one. The owner decided every tip on 2026-09-28, and eight went that day: the Log's
 * Edit (*"i dont like the random pop up, ther was one to edit the tiles in home page, if users want
 * to do this they can do it themselves"*), the Activity log's search, Manage, the stash and the
 * list (*"this is already is onboard initial tour"*), the day wheel (*"unnecessary"*), Reports (*"i
 * dont think this is needed"*) and the amber and red edges (*"no need uesr can see when its due its
 * gonna change color"*). Of the three kept: the last real one *"can be kept, since this is done
 * right after tour ends"*, the babies *"we can keep for now"*, your initial *"keep for now"*. (The
 * running timer had one until 2026-09-27, when the owner took it out: *"serves no purpose and just
 * comes across as too much tips"*; Baby care had one until earlier on 2026-09-28: *"remove this
 * tip, user can see for their own there is baby care"*.)
 *
 * **BACK, SKIP AND CLOSE ARE THREE DIFFERENT THINGS.** ‹ goes back a card. Skip ends the tour and
 * it never returns on its own — offered on every card but the last, which ends the tour with Done
 * (`offersSkip`, 2026-09-25). × closes it and keeps its place, so More → Help & tour offers
 * "Resume the tour" at the card it was on. And a tour the APP closed under, killed or swiped away
 * mid-card, asks before it picks up again on the next opening (`TOUR_RESUME`, `opening.ts`; the
 * owner, 2026-09-28), where it used to come straight back.
 *
 * **IT KEEPS NO ENTRY** (the owner, 2026-09-18/19): everything logged while the tour runs is a
 * trial entry and is cleared when it ends — finished, skipped or closed — and so are the samples
 * the tour puts up itself: one supply in an empty catalog and two lines on an empty list for the
 * shopping card (`trialList.ts`), and one entry for the card about Today's log when nothing was
 * logged before it (`trialEntry.ts`; since 2026-09-28 a timer card 1 started is stopped and saved
 * first, on card 1 itself since 2026-10-01, `TourStop`, and that entry is a trial entry too). One
 * line on the cards says so (`TOUR_TRIAL`): a badge and a sentence under the
 * words until 2026-09-27, one row since (the owner: *"move the "removed for you when thetour ends"
 * to be replacing the "Trial entry" so it says "entry removed when tour ends" but make it fit in
 * one row"*). `apps/mobile/src/tour/tourWrites.ts` is the mechanism.
 *
 * **BUT A RHYTHM CHANGED IN MANAGE IS KEPT** (the owner, 2026-09-25: *"i dont think it makes sense
 * for this setting to be trial entry. i think whatever user did here should stay and make sure
 * they are warned"*). A setting is not an entry: nothing in `tourWrites.ts` could ever take one
 * back, and the card that sends the parent into Manage said "Trial entry" all the same. That card
 * wears no trial line (`keepsChanges`), and since 2026-09-27 no line saying its changes are kept
 * either (the owner: *"step 4 of 7, remove the "Changes you make in manage are kept.""*).
 *
 * **THE DOORS ARE THE SCRIPT'S, NOT THE CARDS'** (the same day). A card whose next card stands on
 * another tab asks for that tab — its action, the cell that breathes and the line that names it
 * are read off the next card in the household's own list (`withDoors`), never typed into the
 * card. Two copies of card 4 existed only because its door was typed; there is one now.
 *
 * Pure, and here rather than beside the overlay, for the usual reason: which cards a household
 * gets, which tip a moment earns and how they are numbered is arithmetic, and arithmetic is
 * testable in node. The overlay draws whatever this returns. It describes the app and never
 * the baby (CLAUDE.md §2); `steps.test.ts` scans every string for a verdict word.
 */
import type { ModuleId } from '../modules/module-registry';
import { moduleWordFor, type ModuleVariants } from '../modules/variants';

/** Which tab a card is on. The parent goes there; the tour never taps a tab for them. */
export type TourTab = 'Today' | 'Stash' | 'Shopping' | 'Schedule' | 'Reports' | 'More';

/**
 * THE GUIDES. `main` is the tour after setup; every other id is a one-card tip about one
 * feature, shown the first time that feature is in front of the parent, and replayable from
 * More → Help & tour. An id is what `tips_seen` stores, so none is ever renamed: `settings` is
 * the tip about your initial (Family's, until 2026-09-27), whatever Help calls it.
 */
export const TIP_GUIDES = ['first', 'babies', 'settings'] as const;
/*
  TWO TIPS LEFT ON 2026-09-27, and their ids with them: `account`, the second tip about your initial
  (the owner: *"i see tips twice that asks me to click on my profile. this is unnecessary to do it
  twice"* — `settings` is the one left), and `timer`, the running timer's (*"serves no purpose and
  just comes across as too much tips"*). AND A THIRD ON 2026-09-28: `care`, Baby care's, "The small
  things count too" (the owner: *"tip: the small things count too, just showed up out of nowhere,
  not sure why. remove this tip, user can see for their own there is baby care"*).

  AND EIGHT MORE LATER THAT DAY, when the owner decided every tip (2026-09-28), each in their words:

    `tiles`     "Your tiles, your order": *"i dont like the random pop up, ther was one to edit the
                tiles in home page, if users want to do this they can do it themselves"*
    `entries`   "Find or fix any entry": *"this is already is onboard initial tour"* (card 2)
    `schedule`  "Every rhythm, one page": *"this is already is onboard initial tour"* (card 3)
    `wheel`     "Your day as a wheel": *"unnecessary"*
    `stash`     "Where stored milk lives": *"this is already is onboard initial tour"* (card 4)
    `shopping`  "The list you send": *"this is already is onboard initial tour"* (card 5)
    `reports`   "Your entries, added up": *"i dont think this is needed"*
    `colors`    "Amber and red": *"no need uesr can see when its due its gonna change color"*

  Only the one-card tips went: the tour's own cards keep their words, "The milk stash" and "The list
  you send" among them. A `tips_seen` list that still names any retired id is read as it is; an id
  no guide answers to means nothing (`parseSeen`, `tipFor`).
*/
export type TipGuideId = (typeof TIP_GUIDES)[number];
export type TourGuideId = 'main' | TipGuideId;

/**
 * WHAT THE PARENT DOES TO LEAVE A CARD.
 *
 * A tour that drives itself is a slideshow, and nobody remembers a slideshow (the owner,
 * 2026-09-17: "make the user click to open the page, don't open the page automatically for
 * them, have them explore the app, make them try logging something").
 *
 * - `log` — they log something, anything: a committed entry, or a timer started from a tile.
 * - `tab` — they tap the tab themselves, in their own time.
 *
 * (`sheet` — a sheet opened and closed again — went on 2026-09-28. It was the + button's grid until
 * 2026-09-27, and then an entry's own sheet, opened from Today's log; card 2 opens that sheet as its
 * thing to try now, before the door to Schedule that "What's coming" used to be (`TourFirst`,
 * `opensFirst`), so no card has a sheet for its deed.)
 *
 * A card with no action is a thing to read, and › leaves it. A card WITH one has no › until the
 * thing is done, and then moves on by itself. Nobody is trapped — × is in the card's corner on
 * every step, and Skip beside it on every step but the last — but nothing beside the instruction
 * competes with it.
 */
export type TourAction =
  | { kind: 'log' }
  | { kind: 'tab'; tab: TourTab }
  /**
   * THE PARENT SENT THE LIST (the owner, 2026-09-22: *"i tried clicking the share button but
   * that does not work still. only by going next it is completed, not by them clicking the try
   * to share button. change this so it ends after clicking the share button, then finished"*).
   *
   * The shopping card told a parent to tap Share and then did not listen for it — the only way
   * on was the chevron, so doing the thing the card asked for looked like it had failed. It is
   * the same shape as every other waiting card: the step names an action, the screen reports it,
   * and the guide moves on by itself.
   *
   * AND SINCE 2026-09-28 IT IS NOT THE ONLY WAY ON (the owner: *"Share becomes optional"*): the
   * card's Next is live beside it and says so (`TourStep.optional`). Share still answers the card.
   */
  | { kind: 'share' };

/**
 * The string the app reports when the parent does something, and the one a waiting card is
 * compared against. One spelling, here, so the tab bar, the write funnel and the shell cannot
 * each invent their own.
 *
 *   `log`            a committed sheet write (`useWriteContext.announce`)
 *   `log:timer`      a timer started from a tile (the provider counts running timers)
 *   `open:<sheet>` / `close:<sheet>`   the shell, as an overlay comes and goes
 *   `tab:<Name>`     the tab bar, when a tab becomes the current route
 *   `page:<Name>`    the provider, when a page is pushed over the tabs (`page:Routine`)
 *   `shop:add`       the shopping list or the Supplies page, when a line goes on the list
 *   `delete:entry`   Today, when a row of Today's log is swiped left and its Delete confirmed
 *   `share`          the shopping list, as Share is tapped — before its sheet is asked for
 *   `share:settled`  the shopping list, once the platform's share call has returned
 *                    (`TOUR_SHARE_SETTLED`); it answers no card
 *   `children:many`  Today, when there is more than one baby (`TourLiveEvent`)
 *
 * (`slot`, a row of Up next answered, went with "What's coming", the one card that waited for it,
 * on 2026-09-28; `care:visible` with the Baby care tip the same day, and `alert:tile` and
 * `log:more` with the amber and red tip and the tiles tip later that day.)
 */
export function actionKey(action: TourAction): string {
  switch (action.kind) {
    case 'tab':
      return `tab:${action.tab}`;
    case 'share':
      return 'share';
    default:
      return 'log';
  }
}

/**
 * THE SHARE CALL HAS RETURNED (the owner, 2026-09-27: *"after clicking the share button … the
 * confetti already popped, and when i return back from share page, it's gone"*). The closing card
 * holds its confetti until the share sheet is gone, and this is one of the two things it listens
 * for — the app coming back to the foreground is the other (`apps/mobile/src/tour/finale.ts`, which
 * says why on Android it takes both). A report, not a deed: no card waits for it.
 */
export const TOUR_SHARE_SETTLED = 'share:settled';

/**
 * Does a reported event answer a waiting card, or close a tip that closes on it (`closesOn`)? A
 * `log` takes a written entry OR a started timer; everything else takes its own key.
 */
export function satisfies(action: TourAction, event: string): boolean {
  if (action.kind === 'log') return event === 'log' || event === 'log:timer';
  return actionKey(action) === event;
}

/**
 * THE EVENT THAT HAS TO COME FIRST, for a thing to try that is a sheet closing (`close:<sheet>`):
 * the same sheet opening, `open:<sheet>`, heard while the card is live, so a sheet the parent
 * already had open can never be the one the card asked for. Null for any other event. Card 2's
 * entry is the one such try (`close:entry`); the rule came with it from the `sheet` deed it was
 * until 2026-09-28.
 */
export function opensFirst(event: string): string | null {
  return event.startsWith('close:') ? `open:${event.slice('close:'.length)}` : null;
}

/**
 * WHETHER A REPORTED EVENT ANSWERS A CARD'S THING TO TRY: its own event, once the sheet it closes
 * has opened while the card was live (`opensFirst`), or the other event that answers it too
 * (`TourFirst.also`), which has no sheet to open first. `opened` is whether that sheet has.
 */
export function answersFirst(first: TourFirst, event: string, opened: boolean): boolean {
  if (first.also !== undefined && event === first.also) return true;
  return event === first.event && (opensFirst(first.event) === null || opened);
}

/**
 * WHICH ACTIONS ARE WORTH A "WELL DONE". Logging is the one thing a parent came to the app to
 * do; being congratulated for opening a sheet or tapping a tab would read as the app talking
 * down to them (the owner: "add transition like, well done, you just logged your first
 * activity. do this for all that makes sense"). An arrival moves straight on.
 */
export function celebrates(action: TourAction | undefined): boolean {
  return action?.kind === 'log';
}

/**
 * ── WHEN A CARD STANDS DOWN ──────────────────────────────────────────────────────────────────
 *
 * A card that asks the parent to go to another tab has said everything it is going to say. It
 * then sits over the page it just told them to look at, with a sentence ending "look around",
 * which is the contradiction the owner caught on a phone (2026-09-21: *"it asks me to look
 * around, but the text box is blocking it. Minimize it when it's done with that specific page
 * tutorial and ready to go next, and do the radial breathing on the next module they're supposed
 * to click on when they are ready to move on"*).
 *
 * So such a card is READ, then RESTS: after a few seconds it shrinks to a bar at the foot of the
 * screen, and the breath moves from the thing it was describing to the tab cell it is asking
 * for. Nothing is lost — the bar carries the instruction, its controls and a way to open the card
 * again — and nothing is hurried: the parent can look around for as long as they like, because
 * the card never advances itself.
 *
 * THIS DECIDES ONLY WHEN THE TOUR PUTS A CARD DOWN BY ITSELF. Since 2026-09-25 the parent can put
 * ANY card down by hand — a vertical swipe on it, or its accessibility action — and bring it back
 * the same way (the owner: *"in tour: wouldnt it make more send to always enable minimize on
 * swiping vertical, espsecially on step 4"*). `apps/mobile/src/tour/swipe.ts` has the gesture.
 */
export function restsWhenRead(step: TourStep): boolean {
  if (step.action?.kind === 'tab') return true;
  /*
    (A card that asked the parent to scroll the page, `scroll: 'parent'`, rested too: card 2, from
    2026-09-27 until the tour scrolled Today's log into view for it on 2026-09-28. It is a door
    now, and rests as one — once its entry has been opened, `restsNow`.)
  */
  /**
   * AND SO DOES A CARD THAT ASKS FOR NOTHING AT ALL but points at something (the owner,
   * 2026-09-22: *"step 6 does not minimize and blocking the view"*). Card 6 is the shopping
   * list: it has an outline on **Add supplies**, a body about what that button does, and no
   * deed to wait for — so it has said everything it is going to say while sitting on top of the
   * page a parent is being told to look at. The same contradiction as above, by a different
   * route, and it deserves the same answer.
   *
   * THE TWO CARDS THIS MUST NOT CATCH, and why each is excluded by a clause rather than by name:
   *
   *  - the CLOSING card has `anchor: null` — it points at nothing, it carries the confetti and
   *    the Done button, and a finale that shrinks to a bar is not a finale;
   *  - a TIP is one card with one button ("Got it"), so resting it would put its only control
   *    behind a tap to reopen. A tip is already short and already placed out of its subject's
   *    way; the tour's chapters are what run long.
   */
  return step.guide === 'main' && step.action === undefined && step.anchor !== null;
}

/**
 * WHETHER THE TOUR MAY PUT THE CARD DOWN BY ITSELF YET: a card that rests when read, unless it
 * stays up beside its control until its thing has been tried (`TourFirst.stays`, card 2).
 * `restsWhenRead` alone still answers whether the card will ever be a bar, which is what the room
 * kept clear of that bar is for.
 */
export function restsNow(step: TourStep, tried: boolean): boolean {
  return restsWhenRead(step) && (step.first?.stays !== true || tried);
}

/** How long a card that rests stays open first: long enough to read two short sentences. */
export const TOUR_REST_MS = 5000;

/**
 * HOW LONG A CARD STAYS OPEN AFTER IT HAS COME WITH THE PARENT TO A NEW PAGE before the timer puts
 * it down (the owner, 2026-09-25: *"after opening manage from step 4, the text box closes /
 * minimizes wayy too soon, make sure it stays unminimized for a few more seconds"*).
 *
 * The five seconds above were counted from the card's FIRST frame, on Schedule, so a parent who
 * read it for three and tapped Manage saw it shrink two seconds into a page it had just sent them
 * to. But arriving somewhere new is when the card has something new to say ("Go back to
 * Schedule…", then "Tap Stash when you're ready."), so every arrival opens it again and holds it
 * this long before the timer may put it down.
 *
 * A SCROLL IS HELD FOR IT ONLY BACK ON A TAB (the owner, 2026-09-26, on Manage: *"When user starts
 * scrolling inside this page, no need to wait for time to come down, but auto minimizes the
 * page"*). On the page the card sent the parent to, scrolling is them reading that page, and the
 * first scroll puts the card down to its bar — which still says the way back — with the hold left
 * as the timer for a parent who does not scroll. Back on Schedule the card has just come back to
 * say which tab is next, so a scroll there still waits for the hold.
 */
export const TOUR_HOLD_MS = 7000;

/**
 * WHICH MARK BREATHES — and the answer is always exactly one of them, because two things
 * pulsing on one screen is two things happening rather than one thing being pointed at.
 *
 * IT IS THE SECONDARY — the tab cell in the bar — FOR AS LONG AS THE CARD IS ASKING FOR A TAP.
 * The subject keeps its outline and holds still, so "what this is about" and "what to tap next"
 * are both on the screen and only one of them moves.
 *
 * It used to wait for the card to rest first, which put the breath on the thing already being
 * described for the five seconds that matter (the owner, 2026-09-21: *"the flashing breathing
 * border is still on the list of up next, not on the schedule page"*, and again on 2026-09-22:
 * *"after step 3, when it asks tap schedule to follow along. Make the radial breathing on the
 * schedule button"*). Asked twice is asked once too often: a card that says "Tap Schedule" and
 * pulses something else is pointing at the wrong thing, whatever it does five seconds later.
 *
 * Only while WAITING, and only where the card names a secondary — so a card the parent has
 * already answered stops pointing anywhere, and a card that asks for nothing never starts.
 */
export type TourBreath = 'subject' | 'secondary' | 'none';

export function breathingMark(
  step: TourStep,
  {
    waiting,
    tried = false,
    cheering = false,
  }: { waiting: boolean; rested?: boolean; tried?: boolean; cheering?: boolean },
): TourBreath {
  /*
    WHILE THE CARD CELEBRATES, NOTHING BREATHES (2026-09-26). The reward is the one thing happening
    on the screen — a check popping, a line saying what the parent just did — and the door it hands
    over to is not open yet: the Schedule cell starts to breathe only once the reward is done (the
    owner: "no congratulations on your first trial entry … just goes straight to flashing schedule
    on the bottom"). The subject keeps its outline, still.
  */
  if (cheering) return 'none';
  // a card with something to try first points at that thing until it has been tried
  if (!doorOpen(step, tried)) return 'subject';
  if (step.secondary !== undefined && waiting) return 'secondary';
  return step.anchor === null ? 'none' : 'subject';
}

/**
 * ── SOMETHING TO TRY BEFORE THE NEXT TAB ─────────────────────────────────────────────────────
 *
 * Two cards describe a control AND ask for the next tab: "What's coming" (Up next, then
 * Schedule, until it left the tour on 2026-09-28) and "Your whole day" (Routine, then Stash or
 * Shopping). Both used to ask for the tab from the first frame, with the control outlined beside
 * it, and the parent was left with two instructions at once. The owner, 2026-09-24, on each of
 * them:
 *
 *  - *"after step 3 is done, you need to radial highlight the schedule page, to move on to step
 *    4 … it keeps highlighting the up next list, even when i have already tried skipping a
 *    log"*;
 *  - *"the look around, then tap stash needs to remove, until user clicks the highlighted
 *    routine button, when user comes back to schedule page from routine, the highlight radial
 *    the stash page"*.
 *
 * So such a card runs in two halves. Until the parent has TRIED the control, the control alone
 * is marked and breathes, and the hint names it (`first.hint`). Once they have, the control's
 * outline goes, the tab cell breathes, and the hint names the tab (`hint`). Tapping the tab
 * early still answers the card: the order is a suggestion, and nobody is held on a card.
 *
 * THE STASH CARD RUNS THE SAME WAY since 2026-09-25 (the owner: *"i added milk, but it is still
 * breathing on the "add milk +" button. Trial logging milk should 'complete' step 5, and go on to
 * step 6 when they are ready"*). Adding milk is the thing to try; the entry it writes is a trial
 * like any other, and once it is saved the card has done its job and points at the next tab.
 *
 * AND THE SHOPPING CARD SINCE 2026-09-25, whose second half is a DEED rather than a door (the
 * owner: *"Step 6, before user shares, they first need to add the supplies to the shopping
 * cart"*). Putting a line on the list is the thing to try, and Share is the deed — so the thing to
 * try has a control of its own (`anchor`), marked until it has been tried, and the deed waits for
 * it (`deedReady`). A door can still be taken early; a Share of an empty list cannot.
 *
 * AND THE CARD ABOUT TODAY'S LOG SINCE 2026-09-28, when "What's coming" left the tour (the owner:
 * *"also i asked to remove step 3, this is not needed "what's coming""*) and its door to Schedule
 * came to the card before it. Opening an entry and closing its sheet is the thing to try — seeing
 * the sheet is the lesson, and nothing is written by looking — and then Schedule breathes.
 */
export interface TourFirst {
  /**
   * The reported event that says the control was tried (`actionKey`'s list: `page:…`, `log`,
   * `shop:add`, `close:entry`). A sheet closing counts only after the same sheet opened while the
   * card was live (`opensFirst`).
   */
  event: string;
  /**
   * ANOTHER EVENT THAT ANSWERS IT TOO, with no sheet to open first: card 2's `delete:entry`, a row of
   * Today's log swiped left and its Delete confirmed (the owner, 2026-09-30: *"what about the part
   * where i asked to have them check edit/delete activity log"*). The card says both ways, a tap to
   * edit and a swipe left to delete, so either is the lesson learned; and a swipe that deletes the
   * entry takes the card's control away with it, which must never leave the card waiting for a log
   * that is gone (`awaitsControl`).
   */
  also?: string;
  /** The live line until it has been. */
  hint: string;
  /**
   * THE CONTROL TO TRY, when it is not the card's own: the shopping card's Add supplies, before its
   * Share. Outlined and breathing until it has been tried, and then the card's own control is
   * (`asMarked`). Absent on a card whose thing to try is its own control (Today's log, Manage, Add
   * milk).
   */
  anchor?: string;
  /**
   * THE PAGE THE THING MAY BE TRIED ON, pushed over the card's tab: the card stands aside there —
   * shrunk to its bar the moment the page opens — until it has been (`standsAside`). The shopping
   * card's is the Supplies page, which is where Add supplies goes when the catalog is empty (the
   * owner, 2026-09-25: *"in the add supplies page, the tour text box does not minimize and it
   * blocking most of the part"*). The picker Add supplies opens otherwise is a sheet, drawn OVER the
   * card, so it has nothing to stand aside from.
   */
  page?: string;
  /**
   * THE CARD STAYS UP BESIDE ITS CONTROL UNTIL THE THING HAS BEEN TRIED: neither the timer nor a
   * scroll puts it down to its bar before then (`restsNow`). Card 2's (the owner, 2026-09-28: *"when
   * step 2 showed up the text box, bring the screen to the most bottom where you can see it"*): its
   * control is Today's log, the last thing on Today, which even the page's own end leaves low on the
   * screen, and the bar a card shrinks to stands at the foot of the screen, on the very entry the
   * card asks the parent to open. Tried, the card is a door like any other, and rests as one.
   */
  stays?: true;
  /**
   * WHAT THE CARD SAYS THE MOMENT ITS THING HAS BEEN TRIED WITH AN ENTRY, before it points at its
   * tab (the owner, 2026-09-26: *"after completing step two (schedule), there is no congratulations
   * on your first trial entry or anything, and just goes straight to flashing schedule on the
   * bottom"*). The card pauses on it — a check that pops, these words, a short buzz — and the door
   * opens once it is done (`tryReward`, and the provider's `CHEER_MS`).
   *
   * Only for an entry or a started timer: a thing tried without one (a skip, a sheet only looked at)
   * opens the door at once, because a "well done" for it would be the app talking down to the
   * parent (`celebrates` has the same rule for deeds). No card carries one since 2026-09-28, when
   * "What's coming", the one that did, left the tour; the rule stays for the next card whose thing
   * to try is an entry, and `steps.test.ts` walks one made for it.
   */
  reward?: TourReward;
  /** The same, when the thing was answered by starting a timer: nothing is logged yet. */
  rewardTimer?: TourReward;
  /**
   * THE WAY PAST IT, FOR A PARENT WHO HAS DONE IT ALREADY (the owner, 2026-09-27, on card 4:
   * *"shorten the description "tap manage to ..", also add , if you already did this in onboarding
   * you can skip this"*). One line under the card's live line while the thing is still untried —
   * and TRUE, because the card's Next is live for exactly that long, and says its name in words
   * rather than as a chevron so this line can name it (`passesTry` in `line.ts`). Next moves on to
   * the next card, the one thing it has always done, and that card opens its own page as it
   * arrives. Tried, the card is the door it always was: Next held, the next tab breathing.
   *
   * It never says "Skip": Skip is the card's other control, and it ends the whole tour.
   *
   * Only on the Manage card (card 3 since 2026-09-28). Setup asks how often everything happens (its
   * fourth step), so a parent who answered there may have nothing to change in Manage today; an
   * entry opened from Today's log, milk in the stash and a line on the list are things the tour
   * teaches by doing, and setup did none of them.
   */
  already?: string;
}

/**
 * ── A TIMER TO STOP FIRST ───────────────────────────────────────────────────────────────────────
 *
 * The owner, 2026-09-28: *"if user started a module for step 1, like started sleeping or started
 * pumping, and let it run or didnt stop it, the log will still be empty, what will it show on the
 * step 2 then? empty box? if user started something for step 1, make sure tutorial tells user to
 * stop it too by holding the button and save entry."*
 *
 * And 2026-10-01, on a phone: *"the text box is already step 2 of 6, fix it any time, when it's
 * still asking me to stop the timer module first. fix this, where if the timer still runs, the box
 * won't go to step 2 yet, but rather ask to stop, then go step 2 fix it anytime."*
 *
 * Card 1 asks for an entry, and the sleep, pump, breastfeed and tummy tiles start a timer, which is
 * not an entry until it is stopped. From 2026-09-28 a start answered card 1 and card 2 then asked
 * for the timer to be stopped, under "Step 2 of 6" and "Fix it any time": a card about fixing an
 * entry, asking for an entry that did not exist yet. So the stop is CARD 1'S since 2026-10-01. A
 * start on card 1 answers nothing (`startsStop`): the card stays, marked on that timer's stop, held
 * rather than tapped (`asStopping`), in the timer's words, and the entry the stop writes is what
 * answers it ("Logged"), as any entry does. Card 2 then has that entry to show.
 *
 * ONLY THE TIMER CARD 1 STARTED. A nap the parent already had running before the tour is theirs,
 * and the card never asks for it to be stopped; the provider knows the practice timer by the claim
 * card 1 made for it as it started. A timer that went without an entry (discarded, say) leaves card
 * 1 asking for an entry, as it did before anything was logged. The entry the stop writes is a trial
 * entry like every other: it was a practice timer's, and the clean-up takes the entry a practice
 * timer became (`tourWrites.ts` `timerEntries`).
 */
export interface TourStop {
  /** The running timer's stop, on its card at the top of Today (`TOUR_ANCHOR.timerStop`). */
  anchor: string;
  /**
   * The live line while it runs, for a timer the hold itself saves: a sleep, a breastfeed, tummy
   * time. Their stop writes the entry, so a line that went on to "then save" would send the parent
   * looking for a button that is not there.
   */
  hint: string;
  /** The same for a pump, whose stop opens its sheet, and the entry is saved there. */
  thenSave: string;
  /**
   * THE CARD'S WORDS WHILE IT RUNS: about the timer, not the tiles the card first pointed at. A card
   * that said "Tap a tile" above a line that says "Stop your timer" would be two cards at once.
   */
  title: string;
  body: string;
}

/**
 * THE CARD WHILE THE TIMER IT STARTED STILL RUNS: marked on that timer's stop, in the timer's
 * words, with the stop's own line as its live line. The provider hands this out in the card's
 * place until the timer has written its entry; everything that marks, measures, places and words a
 * card then reads the stop, as it reads the shopping card's Add supplies before its Share
 * (`asMarked`). A card with no `stopFirst` comes back as it is. `opensSheet` is true for a pump,
 * whose stop opens its sheet to be saved: its line says "then save", and no other does.
 */
export function asStopping(step: TourStep, opensSheet = false): TourStep {
  const stop = step.stopFirst;
  if (stop === undefined) return step;
  const hint = opensSheet ? stop.thenSave : stop.hint;
  const marked = { ...step, anchor: stop.anchor, title: stop.title, body: stop.body };
  // the live line is the thing to try's where the card has one still untried, and the card's own
  // where it has none (card 1, `hintOf`)
  return step.first === undefined
    ? { ...marked, hint }
    : { ...marked, first: { ...step.first, hint } };
}

/**
 * WHETHER A STARTED TIMER BEGINS THE CARD'S STOP RATHER THAN ANSWERING IT (2026-10-01): on a card
 * that asks for its timer to be stopped (`stopFirst`), a start is the first half of an entry, and
 * the save its stop makes is what answers the card. Everywhere else a start answers a `log` as it
 * always has (`satisfies`), the tip that follows the tour included.
 */
export function startsStop(step: TourStep, event: string): boolean {
  return step.stopFirst !== undefined && event === 'log:timer';
}

/** How a card's thing to try was answered, for the words that fit: an entry, or a started timer. */
export type TourTryVia = 'write' | 'timer';

/**
 * THE TITLE FOR THE FIRST ENTRY OF A RUN, and only for it. A thing to try is seldom the first
 * thing a parent logs on the tour — card 1 asks for one — so "first" is said only when it is true:
 * the provider knows whether an entry came before this one in the run.
 */
export const TOUR_FIRST_ENTRY = 'Your first entry is in';

/**
 * THE WORDS FOR A THING TRIED (`TourFirst.reward`): a timer's own words for a started timer, the
 * first-entry title for the first entry of a run, the card's own words for any other entry — or
 * `undefined` for a card whose try is not celebrated at all.
 */
export function tryReward(
  step: TourStep,
  how: { via: TourTryVia; first: boolean },
): TourReward | undefined {
  const reward = step.first?.reward;
  if (reward === undefined) return undefined;
  if (how.via === 'timer') return step.first?.rewardTimer ?? reward;
  return how.first ? { ...reward, title: TOUR_FIRST_ENTRY } : reward;
}

/**
 * ── AN ENTRY TAKEN BACK WITH UNDO ──────────────────────────────────────────────────────────────
 *
 * The owner, 2026-09-30: *"i was on onboarding tour step 1, logged bottle, then click undo, it then
 * goes to step 2, and what about the part where i asked to have them check edit/delete activity log
 * from the most bottom of the screen?"*
 *
 * The save that answers card 1 comes with a toast, and the toast's Undo takes the entry back. The
 * tour was never told: card 1 moved on as if it had been logged, and card 2 then pointed at an empty
 * log (no sample went up either, since an entry had been heard), so it waited out its grace and the
 * tour moved on to Schedule by itself, the lesson about fixing an entry gone with it.
 *
 * So an Undo of the entry that answered a `log` card sends the tour back to that card, which asks
 * for an entry again and says why (`TOUR_UNDONE`): while the card is still up (its "well done"
 * showing), and while the card after it has not yet shown the entry (its thing untried: opened, or
 * swiped away). Once the entry has been shown, the lesson is learned and an Undo is only an Undo.
 */
export const TOUR_UNDONE = 'Entry undone. Log one to carry on.';

/**
 * WHERE AN UNDO SENDS THE TOUR BACK TO: `answered` is the card whose `log` deed the undone write
 * answered, `at` the card up now, and `tried` whether that card's thing has been tried. The index to
 * go back to, or null when the undone entry has already done its job (or answered no such card).
 */
export function backForUndo(
  steps: readonly TourStep[],
  at: number,
  answered: number,
  tried: boolean,
): number | null {
  const card = steps[answered];
  if (card === undefined || card.action?.kind !== 'log') return null;
  if (at === answered) return answered;
  // the card after it, while it has not yet shown the entry: the one that points at Today's log
  const next = steps[at];
  if (at === answered + 1 && next?.anchor === TOUR_ANCHOR.todayLog && !tried) return answered;
  return null;
}

/**
 * NO UNDO ON THE SAVE THAT STOPS THE TIMER THE CARD ASKED TO BE STOPPED (the owner, 2026-10-01:
 * *"dont show the option to undo during this period, so user doesnt accidentally undo it, then have
 * nothing in today's log."*).
 *
 * Card 1 waits for its timer to be stopped (`stopFirst`), and the stop's save is the entry card 2
 * then shows. Its toast carried Undo like every save, and an Undo there took the one entry the next
 * card is about, a moment before that card asks the parent to open it. So that one save's toast says
 * what was saved and offers nothing to tap. Every other save keeps its Undo: a bottle or a diaper
 * logged on card 1 among them, whose Undo takes the tour back to card 1 (`backForUndo`), and the
 * same timer stopped any other day. `timerToStop` is the timer the live card is waiting on, or null;
 * `ended` the timers the save took off the phone as it wrote its entry.
 */
export function offersUndo(timerToStop: string | null, ended: readonly string[]): boolean {
  return timerToStop === null || !ended.includes(timerToStop);
}

/** Whether the card has moved on to its tab: always, for a card with nothing to try first. */
export function doorOpen(step: TourStep, tried: boolean): boolean {
  return step.first === undefined || tried;
}

/** The live line for where the card is: what to try, or which tab to tap. */
export function hintOf(step: TourStep, tried: boolean): string | undefined {
  return doorOpen(step, tried) ? step.hint : step.first?.hint;
}

/**
 * Whether the card's own control keeps its outline. It does, except on a card with something to
 * try first once that has been tried: the control has been used, and the mark moves to the tab.
 *
 * A card whose thing to try has a control of its OWN (`TourFirst.anchor`) keeps an outline
 * throughout — on that control until it has been tried, then on the card's own (`asMarked`) — since
 * its second half is a deed on the same page and there is no tab for the mark to move to.
 */
export function subjectMarked(step: TourStep, tried: boolean): boolean {
  return step.first === undefined || !tried || step.first.anchor !== undefined;
}

/**
 * WHETHER THE CARD WAITS FOR ITS CONTROL TO BE MEASURED BEFORE IT IS DRAWN (the app's `pending`),
 * and passes on without it when it never comes: only while it still marks that control.
 *
 * A DOOR WHOSE THING HAS BEEN TRIED MARKS NOTHING ON ITS PAGE (`subjectMarked`): the tab cell
 * breathes, the line names the tab, and the control has done its job. It used to wait for that
 * control all the same, and pass on to the next card when it went (the owner, 2026-09-28:
 * *"tutorial tour, after step 2 completed (editing log), it auto opens the schedule page"*). An
 * entry opened on card 2 and then deleted, or moved to another day, leaves Today's log empty, so
 * the card waited its grace for a log that was gone, moved on to Manage's card by itself, and that
 * card opened Schedule for the parent: the tour tapping a tab, which it never does. Tried, a door
 * is drawn whether its control is there or not, at the foot when it is not, and waits for the tab.
 */
export function awaitsControl(step: TourStep, tried: boolean): boolean {
  return step.anchor !== null && subjectMarked(step, tried);
}

/**
 * …AND ONLY UNTIL THE CARD HAS BEEN SEEN WITH ITS CONTROL (the owner, 2026-09-30: *"going to another
 * page shouldnt cancel everything"*). A card is hidden while it waits for its control to be
 * measured, and passed over when that never comes (the provider's grace): a card drawn beside
 * nothing is a flash, and a control that never registers is a card with nothing to teach. That is
 * right for a card arriving. It is wrong for a card the parent has already seen, whose control has
 * only gone out of view with them — a tab left and come back to, a page opened and closed — and is
 * being measured again: hidden, the card was gone, and passed over, it was the tour moving on by
 * itself. A card seen once stays on the screen, its mark back the moment its control is.
 */
export function hidesForControl(step: TourStep, s: { tried: boolean; seen: boolean }): boolean {
  return awaitsControl(step, s.tried) && !s.seen;
}

/**
 * THE CARD AS IT IS MARKED RIGHT NOW. A card whose thing to try has a control of its own points at
 * that control until it has been tried, and at its own after — the shopping card's Add supplies,
 * then its Share. Everything that follows `anchor` (the outline, the measuring, where the card
 * sits, the grace for a control that never arrives) is handed the live one, so none of it has to
 * know a card can mark two things in turn. Every other card comes back exactly as it is.
 */
export function asMarked(step: TourStep, tried: boolean): TourStep {
  const at = step.first?.anchor;
  return at === undefined || tried ? step : { ...step, anchor: at };
}

/**
 * WHETHER THE CARD'S OWN DEED MAY ANSWER IT YET. A DOOR may be taken early — tapping Schedule before
 * opening an entry still answers card 2, because the order is a suggestion and nobody is held on a
 * card. A DEED on the card's own page waits for the thing to try first: the shopping card's
 * Share counts once something has been put on the list (the owner, 2026-09-25: *"before user
 * shares, they first need to add the supplies to the shopping cart"*), because sending an empty
 * list to somebody is what that card was changed to stop. Nobody is held there either: the thing
 * to try is always one tap away, and Skip and × are on the card.
 *
 * AND A SHARE COUNTS WHENEVER THE LIST HAS SOMETHING ON IT TO SEND (`listed`; the owner,
 * 2026-09-28: *"Make sure you have trial items in case if user didnt fill it in, so they can share
 * it if they want to."*). The tour puts sample lines on a list with nothing still to buy as the
 * shopping card arrives, so there is always something to send, and a parent who puts nothing on it
 * can still try Share. The line is still what the card asks for first: its words, its outline on
 * Add supplies and its held Next are the thing to try's until a line goes on (`passesDeed` reads
 * `tried` alone), and only a Share tapped in the meantime is heard.
 */
export function deedReady(step: TourStep, tried: boolean, listed = false): boolean {
  return (
    step.action?.kind === 'tab' ||
    doorOpen(step, tried) ||
    (listed && step.action?.kind === 'share')
  );
}

/**
 * WHETHER THE CARD COMES BACK, FULL SIZE, THE MOMENT ITS THING HAS BEEN TRIED: a card whose next
 * instruction is a deed on its own page — the shopping card, whose Share is next (the owner,
 * 2026-09-25: the card comes back with the next instruction once the item is added). A door is
 * left as the parent put it: its next instruction is a tab, which its bar names and its cell
 * breathes for already.
 */
export function backWhenTried(step: TourStep): boolean {
  return step.first !== undefined && step.action !== undefined && step.action.kind !== 'tab';
}

/**
 * WHETHER THE CARD STANDS ASIDE WHERE THE PARENT IS: on the page its thing is tried on
 * (`TourFirst.page`), until it has been tried. `page` is the page pushed over the tabs, by route
 * name, or null on a tab.
 */
export function standsAside(
  step: TourStep,
  where: { tried: boolean; page: string | null },
): boolean {
  const on = step.first?.page;
  return on !== undefined && !where.tried && where.page === on;
}

/**
 * The words for bringing a card back from its bar and for putting it down: the bar's own label,
 * and the card's two accessibility actions — the way to do what the swipe does without a swipe
 * (CLAUDE.md §6).
 */
export const TOUR_REST_LABELS = {
  expand: 'Show the card again',
  collapse: 'Shrink this card',
} as const;

/** What the card says once a celebrated action has landed: the reward, and the next fact. */
export interface TourReward {
  title: string;
  body: string;
}

/**
 * THE CARD BEFORE THE FIRST STEP, and the first of the two that ask a question (the owner,
 * 2026-09-18: "make the walk me through the page tutorial guide, optional, ask if they want it? or
 * do it later in setting"). Two facts and no more: that it is optional, which is what the two
 * buttons are; and that nothing it writes is kept, which has to be read BEFORE the first entry
 * rather than confessed after it. `later` is why declining is not a dead end.
 *
 * ABOUT 3 MINUTES, NOT A MINUTE (the owner, 2026-09-28: *"Tour changes: … it says 'about 3
 * minutes'"*). Six cards, five of them done rather than read, take a new parent about three minutes
 * on a phone; "about a minute" was a promise the tour broke on its second card.
 */
export const TOUR_ASK = {
  title: 'Take the quick tour?',
  // no dash in anything the tour shows (the owner, 2026-09-27: *"remove the "-" … feels too AI"*)
  body: 'A few short cards, about 3 minutes. Anything you log is a trial entry, cleared when the tour ends.',
  later: 'Not now? It waits in More → Help & tour.',
  start: 'Show me',
  decline: 'Not now',
} as const;

/**
 * THE CARD THAT ASKS BEFORE A TOUR PICKS UP AGAIN (the owner, 2026-09-28: *"Tour changes: … it asks
 * before resuming"*).
 *
 * A tour the app was closed or killed under used to come back by itself on the next launch, on the
 * card it had got to: the question had been answered once, so it was not asked again. But the
 * parent who opens the app again may be opening it for something else entirely, and a card that
 * springs up asking them to tap Schedule is the tour taking the app back. So the app asks first, on
 * a card like the ask's, at the foot of the screen with the page live above it: carry on from the
 * card it stopped on, or end it here. Ending clears its trial entries exactly as finishing does
 * (`apps/mobile/src/tour/tourWrites.ts`), and Help still starts the tour again, from its first card.
 * When the question is asked, and when it waits for the daytime instead, is `opening.ts`.
 *
 * The step is the one the card shows as its count (`TOUR_LABELS.stepOf`), so the parent is told
 * the same number the tour will show when it carries on.
 */
export const TOUR_RESUME = {
  title: 'Continue the tour?',
  body: (place: TourPlace): string =>
    `You stopped at step ${place.step} of ${place.steps}. Ending it clears its trial entries.`,
  later: 'You can start it again from More → Help & tour.',
  resume: 'Continue',
  end: 'End tour',
} as const;

/**
 * THE SAME PROMISE, ON THE CARDS OF THE TOUR, IN ONE ROW (the owner, 2026-09-27: *"move the
 * "removed for you when thetour ends" to be replacing the "Trial entry" so it says "entry removed
 * when tour ends" but make it fit in one row."*).
 *
 * It was two things. A badge, **Trial entry** (2026-09-21: "it can be just 'Trial entry'"), and a
 * sentence under the card's words saying what the badge meant, **Removed for you when the tour
 * ends.** (2026-09-22: "'trial entry' needs to be a little more detailed … in the shortest way").
 * The badge named the thing and the sentence said what happens to it; this is both, in five words,
 * where the badge was, and the sentence is gone. `TOUR_ASK` still explains it in full once, before
 * the tour starts.
 *
 * ONE ROW AT EVERY WIDTH (`apps/mobile/src/tour/trialLabel.ts`): the badge's own type, on its own
 * row under the step count, and a little smaller rather than two lines where a narrow phone at the
 * largest type has less room than the words — measured against the face the app ships.
 */
export const TOUR_TRIAL = 'Entry removed when tour ends';

/**
 * WHETHER A CARD SAYS IT: wherever a tap of this card can write an entry or shows one — its deed,
 * or the thing it asks to be tried first — on every card of the tour but two:
 *
 *  - the card whose changes are KEPT (`keepsChanges`, Manage), where it would be the one false
 *    sentence on the screen (the owner, 2026-09-25: *"remove the trial entry and the thxt "removed
 *    for you when the tour ends."*);
 *  - the closing card, which asks for nothing and says it in its own words ("Trial entries are
 *    cleared when you tap Done."). It wore the badge alone until 2026-09-27; the badge and the
 *    sentence became one line, and a line saying "when tour ends" on the card that ends it, above
 *    that sentence, would be the same thing twice.
 *
 * A tip writes nothing and carries none.
 */
export function trialLabelOn(step: TourStep): boolean {
  return (
    step.guide === 'main' &&
    step.keepsChanges !== true &&
    (step.action !== undefined || step.first !== undefined)
  );
}

/**
 * THE LINES THAT SAY WHERE TO GO, in one place so the card, its bar and their tests agree. Which
 * one a card shows is `lineOf` (`line.ts`), from where the parent is standing.
 *
 * `door` is the hand-off (the owner, 2026-09-25: *"the text guide needs to change to click stash
 * when you are ready"*). It names the NEXT card's tab, which is never the page the parent is on:
 * the card is on another tab by construction (`withDoors`), and arriving on that one answers it.
 */
export const TOUR_LINES = {
  /** On a page pushed over the tabs: the way back to the card's own page. */
  back: (tab: string): string => `Go back to ${tab} when you’re done here.`,
  /** On another tab, with the card's own page still to be seen. */
  open: (tab: string): string => `Open ${tab} to follow along.`,
  /** The card has done its job; the next card stands on this tab. */
  door: (tab: string): string => `Tap ${tab} when you’re ready.`,
} as const;

/** The words on the card's own controls — one place, so the labels and their tests agree. */
export const TOUR_LABELS = {
  back: 'Back',
  next: 'Next',
  done: 'Done',
  skip: 'Skip',
  close: 'Close',
  /**
   * WHAT `›` SAYS ON A PAGE THE PARENT OPENED FROM THE CARD'S OWN TAB. The card told them to
   * tap Routine; they did; the next card is about the milk stash, on a tab they cannot see from
   * here. Advancing would explain the stash to somebody standing in Manage intervals (the owner,
   * 2026-09-22: *"it goes about explaining about milk stash, when im not on there yet… you need
   * to tell the user to click the go back button, then ask to go to stash"*).
   *
   * So on a pushed page `›` goes BACK to the card's own tab and the same card stands again, with
   * its hint and the next tab's cell breathing. The tour still never chooses the next room — it
   * only undoes the detour it sent the parent on.
   */
  backTo: (tab: string): string => `Back to ${tab}`,
  /** A tip's one button. */
  gotIt: 'Got it',
  /** A tip's eyebrow. */
  tip: 'Tip',
  stepOf: (step: number, steps: number): string => `Step ${step} of ${steps}`,
} as const;

export interface TourStep {
  /** Stable id: what gets written down so a killed app resumes here rather than at the start. */
  id: string;
  /** Which guide this card belongs to: the tour, or one of the tips. */
  guide: TourGuideId;
  tab: TourTab;
  /**
   * The anchor a screen registers with `<TourSpot id>` — where the mark goes — or **null for a
   * card whose subject is a whole page**, which draws no mark and sits at the foot of the screen
   * with the page in full view above it: the card that arrives on Schedule, and the closing card.
   */
  anchor: string | null;
  /**
   * A SECOND MARK, for a card that points at one thing and asks for another: "Fix it any time"
   * outlines Today's log and, once an entry has been opened, dots the Schedule cell the hint names,
   * so the parent is never left hunting for the tab a sentence mentions. Always a tab cell, and
   * never typed into a card: it is the cell of the next card's tab, filled in by `withDoors`.
   */
  secondary?: string;
  title: string;
  body: string;
  /**
   * THE CONTROL TO TRY BEFORE THE CARD POINTS AT ITS TAB (`TourFirst` has the owner's words).
   * Only on a card that is a door once `withDoors` has read the script.
   */
  first?: TourFirst;
  /**
   * A TIMER TO STOP BEFORE THE CARD IS ANSWERED, while the timer it started is still running
   * (`TourStop` has the owner's words). Card 1's since 2026-10-01: it asks for an entry, and a
   * started timer is not one until it has been stopped and saved. It was card 2's from 2026-09-28,
   * which asked for the stop under "Step 2 of 6".
   */
  stopFirst?: TourStop;
  /**
   * What the parent does to move on. Absent for a card that is only read — and absent in the
   * script for a DOOR, whose `{ kind: 'tab' }` is the next card's tab (`withDoors`).
   */
  action?: TourAction;
  /**
   * WHAT THE PARENT CHANGES ON THIS CARD IS A SETTING, AND IT IS KEPT: the card wears no trial line,
   * which would be false here (the owner, 2026-09-25: *"whatever user did here should stay and make
   * sure they are warned"*). Manage writes rules and settings, and `tourWrites.ts` only ever takes
   * back entries, timers, shopping lines and its own samples.
   *
   * It carried a line of its own saying so, "Changes you make in Manage are kept.", until the owner
   * asked for that to go too (2026-09-27: *"step 4 of 7, remove the "Changes you make in manage are
   * kept.""*). What is left is the one thing the line was never the only reason for: no trial line.
   */
  keepsChanges?: true;
  /**
   * THE DEED IS OPTIONAL, AND THIS IS THE LINE THAT SAYS SO (the owner, 2026-09-28: *"Tour changes:
   * Share becomes optional"*). The shopping card's: once a line is on the list the card asks for
   * Share, and a parent with nobody to send the list to, or nobody right now, goes on without
   * opening the share sheet.
   *
   * One line under the card's live line while the deed is being asked for, and TRUE, because the
   * card's Next is live for exactly that long and says its name in words rather than as a chevron
   * (`passesDeed` in `line.ts`, the overlay's `held`). Next moves on to the next card, the one thing
   * it has always done; the deed still answers the card as it always did, so a parent who shares
   * moves on exactly as before. Nothing is claimed or kept differently either way: the line put on
   * the list is the card's trial entry, claimed as it lands, and cleared when the tour ends.
   *
   * Like `TourFirst.already`, it never says "Skip": Skip is the card's other control, and it ends
   * the whole tour.
   */
  optional?: string;
  /*
    NO `scroll: 'parent'` ANY MORE (2026-09-28). Card 2 asked the parent to scroll down to Today's
    log themselves from 2026-09-27, and the tour never moved the page for it; the owner, the next
    day: *"when step 2 showed up the text box, bring the screen to the most bottom where you can see
    it"*. Every card brings its control into the open now (`planCard`, `tourScrolls`).
  */
  /**
   * WHAT THE TOUR PUTS UP ITSELF WHEN THE CARD WOULD HAVE NOTHING TO TRY, and `prefilled` says so:
   *
   *  - `supply` — the shopping card, for a household with nothing in its catalog: one sample supply
   *    to put on the list; and since 2026-09-28, for a list with nothing still to buy, two sample
   *    lines on it, so Share always has something to send (`trialList.ts` has the owner's words);
   *  - `entry` — the card about Today's log, when nothing was logged before it in the run (card 1
   *    has a timer it started stopped and saved before it is answered, `stopFirst`): one
   *    sample entry to open (`trialEntry.ts`). A real row, written the way any entry is, so the sheet
   *    it opens is the real editor — and taken back with every trial entry when the tour ends.
   */
  sample?: 'supply' | 'entry';
  /**
   * THE LINE THE CARD ADDS WHEN THE TOUR PUT ITS `sample` UP. It was the line about trial LINES put
   * straight on an empty shopping list until 2026-09-25, when the parent started putting the line
   * there themselves; and since 2026-09-28, when sample lines go on an empty list again beside the
   * catalog's sample supply, one line says it for both ("sample items").
   */
  prefilled?: string;
  /**
   * The live line under the body while the tour waits: what to tap, in words. A door's is
   * `TOUR_LINES.door` of the next card's tab, filled in by `withDoors`.
   */
  hint?: string;
  /** Shown once a celebrated action lands, instead of the title and body. */
  reward?: TourReward;
  /** The reward for a `log` answered by a timer START, which leaves no entry at the foot of Today. */
  rewardTimer?: TourReward;
  /**
   * WHAT ENDS A TIP, BESIDE GOT IT AND × — the parent doing the thing it asks for (the owner,
   * 2026-09-28, on "Now, your last real one": *"i logged diaper, but the tip does not go away, and
   * the red border highlight keeps showing. this needs fixing. it can go away automatically once
   * user logged it once or clicking Got it"*). The provider hears it through `satisfies`, as it
   * hears a deed, and puts the tip away as seen, its outline with it.
   *
   * NOT AN `action`, and that is the point. A card's action is a deed the tour waits on, and a `log`
   * deed is claimed as a trial entry, to be taken back when the tour ends. The entry this tip asks
   * for is the household's first REAL one, logged after the tour has cleared up after itself: the
   * provider takes no mark, opens no window and makes no claim for a tip (`writesSomething`,
   * `trialLabelOn`), and nothing here asks it to.
   */
  closesOn?: TourAction;
  /*
    NO `outline: 'still'` ANY MORE (2026-09-28). It held the outline still on the one card whose
    lesson was a color on the control, the amber and red tip, and that tip went when the owner
    decided every tip: *"no need uesr can see when its due its gonna change color"*.
  */
  /**
   * `foot`: MARK THE CONTROL, BUT KEEP THE CARD AT THE BOTTOM OF THE SCREEN.
   *
   * A card is normally placed beside what it points at, which is right for a button in the
   * middle of a page and wrong for a big grid: the card is then capped to whatever room is left
   * beside it, and when there is none it sits on an edge of the very thing it is describing.
   * The owner met that on the tip that follows the tour (2026-09-21: "the last tutorial tip: the
   * text box is blocking the quick log modules") — a card asking them to tap a tile, over the
   * tiles.
   *
   * At the foot it is a bar above the tab bar with the whole page in the open above it, and the
   * outline does the pointing. Worth it wherever the subject is most of the screen, or where the
   * lesson is "look at this page" rather than "look at this control".
   */
  place?: 'foot';
  /** The card only exists for a household with this module ON. */
  needs?: ModuleId;
  /** The card only exists for a household with this module OFF. */
  absent?: ModuleId;
}

/**
 * THE ANCHOR IDS, shared by the cards and the screens that register them. Here and not in the
 * app so the two halves cannot drift silently: a card naming an anchor no screen registers is a
 * card that points at nothing, and `tour.test.ts` in the app fails on exactly that.
 */
export const TOUR_ANCHOR = {
  /** The Log tiles on Today, one part per tile. */
  logTiles: 'tour.log',
  /*
    NO + BUTTON AND NO TIMER CARD (2026-09-27). The + was card 2's until that card became the one
    about Today's log, and the running timer's first card was the timer tip's until the owner took
    the tip out. Nothing stores an anchor id, so both simply went.
  */
  /**
   * Today's log, at the foot of Today: the entries logged today, each one opening its own sheet to
   * be changed or deleted. Card 2's since 2026-09-27.
   */
  todayLog: 'tour.today.log',
  /**
   * THE STOP OF THE TIMER CARD 1 STARTED, on its card at the top of Today (2026-09-28): card 1
   * points at it for as long as that timer runs, and asks for it to be held (`TourStep.stopFirst`;
   * card 2 did until 2026-10-01). Today registers it on that timer's stop alone, so a timer the
   * parent already had running is never the one the card points at.
   */
  timerStop: 'tour.timer.stop',
  /*
    NO UP NEXT AND NO BABY CARE (2026-09-28). Up next was "What's coming"'s, the card the owner took
    out (*"also i asked to remove step 3, this is not needed "what's coming""*), and the care strip
    the Baby care tip's (*"remove this tip, user can see for their own there is baby care"*). Nothing
    stores an anchor id, so both simply went.
  */
  tabSchedule: 'tour.tab.schedule',
  tabStash: 'tour.tab.stash',
  tabShopping: 'tour.tab.shopping',
  scheduleRoutine: 'tour.schedule.routine',
  /** The stash's floating "Add milk". */
  stashAdd: 'tour.stash.add',
  /** The shopping list's "Add item", at the foot of the list. */
  shopAdd: 'tour.shop.add',
  /** The shopping list's Share button, which is what the last shopping card asks for. */
  shopShare: 'tour.shop.share',
  /*
    NO FAMILY ROW (2026-09-27): `tour.more.family` marked More's Family row until the row went
    behind your initial, and the Family tip with it (`avatar`, below). Nothing stores an anchor id,
    so it simply went. The row came back to More on 2026-09-29 and the anchor did not: no tip is
    about Family since the owner decided every tip (2026-09-28), so there is nothing to mark it.

    NOR THE REPORTS RANGE, THE LOG'S EDIT, THE ACTIVITY LOG'S SEARCH OR THE DAY WHEEL (2026-09-28):
    each was the mark of one tip, and the four tips went when the owner decided every tip (Reports:
    *"i dont think this is needed"*; the tiles: *"i dont like the random pop up … if users want to do
    this they can do it themselves"*; the search: *"this is already is onboard initial tour"*; the
    wheel: *"unnecessary"*). The search and the wheel were the only controls a card ever marked on a
    page pushed over the tabs, so the `page` home went with them.
  */
  /** The baby's name at the top of every tab: switch babies, see them together. */
  childChip: 'tour.top.child',
  /**
   * Your initial at the top right of every tab: Appearance, Account & privacy, Plan (and Family, from
   * 2026-09-27 until it went back to More on 2026-09-29). The mark of ONE tip since 2026-09-27
   * (`settings`); it was two, Family's and the account's, until the owner met both: *"i see tips
   * twice that asks me to click on my profile. this is unnecessary to do it twice"*.
   */
  avatar: 'tour.top.avatar',
} as const;

export type TourAnchorId = (typeof TOUR_ANCHOR)[keyof typeof TOUR_ANCHOR];

/**
 * WHERE EACH ANCHOR'S CONTROL LIVES, which is the only way the tour can know whether it is on
 * screen. A control that has been MEASURED is not a control that can be SEEN: a tab screen the
 * parent has walked away from keeps answering `measureInWindow` with the rectangle it had when
 * it was in front (the owner, 2026-09-18: "step 11 marks the wrong square where it shows
 * nothing").
 *
 * - `bar` — the tab bar: a cell, or the + button. In front on every tab, behind any pushed page.
 * - `top` — the top bar a TAB page draws: the baby's name and your initial (2026-09-26). In front
 *   on every tab, like `bar`, and behind any pushed page, which draws Back and a title in its
 *   place. Every tab page draws its own copy of the bar, so its spots are told apart by `part`;
 *   and it is outlined in place like a page's control, never dotted, and never scrolled for — the
 *   bar does not move with the page under it.
 * - `tab` — a control on one tab's own page: in front only while the parent is on that tab, and
 *   only while nothing is pushed over it.
 * - `float` — a tab page's own floating action (the stash's Add milk):
 *   in front exactly when a `tab` control is, but it stands still while the page scrolls under
 *   it, so the tour never scrolls the page to reveal one. It used to be `tab`, and a card about
 *   Add milk scrolled the Stash page for nothing and was placed against where the pill was
 *   predicted to go rather than where it stays (2026-09-25).
 *
 * (`page`, a control on a page pushed over the tabs, went on 2026-09-28 with the only two cards that
 * had one: the Activity log's search and the day wheel on Manage, two tips the owner took out when
 * deciding every tip. A card that sends the parent to a pushed page, Manage's, still marks its
 * control on its tab and says the way back there.)
 */
export type TourAnchorHome = 'bar' | 'top' | 'tab' | 'float';

export const TOUR_ANCHOR_HOME: Readonly<Record<TourAnchorId, TourAnchorHome>> = {
  [TOUR_ANCHOR.logTiles]: 'tab',
  [TOUR_ANCHOR.todayLog]: 'tab',
  // on the running card at the top of Today, which scrolls with the page like the log below it
  [TOUR_ANCHOR.timerStop]: 'tab',
  [TOUR_ANCHOR.tabSchedule]: 'bar',
  [TOUR_ANCHOR.tabStash]: 'bar',
  [TOUR_ANCHOR.tabShopping]: 'bar',
  [TOUR_ANCHOR.scheduleRoutine]: 'tab',
  [TOUR_ANCHOR.stashAdd]: 'float',
  // in the page since 2026-10-05 (LIST → NOTE → ADD ITEM): a long list scrolls it into view
  [TOUR_ANCHOR.shopAdd]: 'tab',
  [TOUR_ANCHOR.shopShare]: 'tab',
  [TOUR_ANCHOR.childChip]: 'top',
  [TOUR_ANCHOR.avatar]: 'top',
};

/** Where this card's control lives, or null for a card whose subject is the whole app. */
export function anchorHome(step: TourStep): TourAnchorHome | null {
  if (step.anchor === null) return null;
  return TOUR_ANCHOR_HOME[step.anchor as TourAnchorId] ?? 'tab';
}

/** Where an anchor lives, by id — for the secondary mark, which is always a bar anchor. */
export function homeOf(anchor: string): TourAnchorHome {
  return TOUR_ANCHOR_HOME[anchor as TourAnchorId] ?? 'tab';
}

/**
 * WHETHER A CONTROL MOVES WHEN ITS PAGE SCROLLS, so the tour may bring it up into the open: a tab
 * page's control. The bars stand still, and so does a floating action.
 */
export function movesWithPage(home: TourAnchorHome | null): boolean {
  return home === 'tab';
}

/**
 * WHETHER THE TOUR MOVES THE PAGE FOR THIS CARD: whenever its control moves with its page, card 2's
 * Today's log included since 2026-09-28 (the owner: *"when step 2 showed up the text box, bring the
 * screen to the most bottom where you can see it"*). From 2026-09-27 that card asked the parent to
 * do the scrolling (`scroll: 'parent'`, gone), and a card asking for a scroll could not make one.
 */
export function tourScrolls(step: TourStep): boolean {
  return movesWithPage(anchorHome(step));
}

/**
 * CAN THIS CARD'S CONTROL BE SEEN FROM WHERE THE PARENT IS STANDING? `tab` is the tab the
 * parent is on, as the tab bar last reported it; `pushed` is how many pages the navigator has
 * over the tabs. A card whose answer is false draws no mark and says which tab to open.
 *
 * (A page's control was seen on that page alone, from 2026-09-26 until the two tips that had one
 * went on 2026-09-28, and `page` went from here with them: every control is on the tabs again.)
 */
export function canSee(step: TourStep, where: { tab: string | null; pushed: number }): boolean {
  const home = anchorHome(step);
  if (home === null) return false;
  if (where.pushed > 0) return false;
  return home === 'bar' || home === 'top' || where.tab === step.tab;
}

/**
 * THE TOUR: six cards (five without a stash), and every one but the closing card is DONE rather
 * than read.
 *
 * ONE CONTROL, ONE OR TWO SHORT SENTENCES. The card sits beside the thing it describes and must
 * not cover it, so anything that does not fit in about two lines is a card that has not been
 * thought through (the owner, 2026-09-18: "too much words is very bad, less while still being
 * clear is better"). Every card NAMES ITS CONTROL IN WORDS as well as marking it, because a
 * mark is a visual signal and nothing here may be conveyed by sight alone (CLAUDE.md §6).
 */
/*
  WHAT CARD 1 SAYS OF A TIMER IT STARTED, SAID OF THE TIMER AND NOT OF "ITS CARD" (the guides audit,
  2026-09-26): how the top of Today draws a second running timer is changing, and "it stays at the
  top of Today" is true however that lands. The card's words while it waits for that timer's stop
  (`stopFirst`), and its reward for a start whose stop never came up on Today (`rewardTimer`).
*/
const TIMER_RUNNING = {
  title: 'Timer running',
  body: 'It stays at the top of Today until you stop it.',
} as const;

export const TOUR_STEPS: readonly TourStep[] = [
  /**
   * THE FIRST USEFUL THING. A parent who has logged once at their own pace has learned more than
   * six cards could tell them. It takes an entry saved from any tile, or the one a timer writes as
   * it stops, because the sleep, pump, breastfeed and tummy tiles start a timer rather than saving
   * a row, and a tour that only heard a save sat forever for those households (the owner's phone,
   * 2026-09-18).
   *
   * A TIMER STARTED HERE IS STOPPED HERE (the owner, 2026-10-01: *"if the timer still runs, the
   * box won't go to step 2 yet, but rather ask to stop, then go step 2 fix it anytime"*). A start
   * answered this card from 2026-09-18, with "Timer running", and from 2026-09-28 the next card,
   * "Fix it any time", asked for the stop before it could show the entry. A start answers nothing
   * now (`startsStop`): the card stays at Step 1, marked on that timer's stop and in its words
   * (`stopFirst`, `asStopping`), until the stop's save answers it with "Logged", as any entry does.
   * That save's toast offers no Undo (`offersUndo`), so the entry the next card shows cannot be
   * taken back by a stray tap on the way there.
   */
  {
    id: 'log',
    guide: 'main',
    tab: 'Today',
    anchor: TOUR_ANCHOR.logTiles,
    title: 'Log it as it happens',
    body: 'Tap a tile for a feed, a diaper or a nap. Every entry starts here.',
    action: { kind: 'log' },
    hint: 'Tap any tile and save, or start a timer.',
    /*
      WHERE IT WENT, AND NO MORE (2026-09-27). It said "Tap it there to change or delete it." too,
      which is what the next card is now about, asked of the parent a second later: said once, there.
    */
    reward: {
      title: 'Logged',
      body: 'It’s in Today’s log, further down.',
    },
    rewardTimer: TIMER_RUNNING,
    // no dash: a colon between what to do and how. "then save" is the pump's alone, whose stop
    // opens its sheet; a sleep, a feed or tummy time is saved by the hold itself (`asStopping`)
    stopFirst: {
      anchor: TOUR_ANCHOR.timerStop,
      hint: 'Stop your timer to carry on: hold its button.',
      thenSave: 'Stop your timer to carry on: hold its button, then save.',
      ...TIMER_RUNNING,
    },
  },
  /**
   * WHERE AN ENTRY IS FIXED (the owner, 2026-09-27: *"tour step 2, where it asks me for a quick log,
   * i think we can remove this. because the problem is that, i click breastfeeding module, it auto
   * goes to step 3, when i still have to pick start feeding or already feeding for modules with
   * timer. either fix this, or just remove this from tutorial (which i think user can find out
   * about it themselves. -> idea: better to replace this step with asking user to scroll down and
   * check it's entry, mention this is where you can fix each entry to enter if you need to make
   * changes to it."*).
   *
   * THE + CARD IS GONE, AND SO IS ITS BUG. It asked for the + grid to be opened and closed, and a
   * module picked in the grid closes the grid: the card moved on while the module's own sheet still
   * asked "Start feeding or Already finished?". The + is found by looking; a correction is not.
   *
   * THE TOUR SCROLLS, NOT THE PARENT (the owner, 2026-09-28: *"when step 2 showed up the text box,
   * bring the screen to the most bottom where you can see it"*). From 2026-09-27 the card sat at the
   * foot of the screen and asked the parent to scroll down to the log themselves, which put it over
   * the very log it was asking for. Now it is like every other card: the page is brought down until
   * Today's log is in the open (`planCard`, `tourScrolls`), and the card is placed beside the log,
   * above it, not at the foot. And it STAYS up there until an entry has been opened (`stays`): the
   * log is the last thing on Today, so even the page's end leaves it low on the screen, where the
   * bar a card shrinks to would sit on it.
   *
   * AN ENTRY OPENED AND ITS SHEET GONE IS ITS THING TO TRY, AND THEN IT IS THE DOOR TO SCHEDULE (the
   * owner, same day: *"also i asked to remove step 3, this is not needed "what's coming""*). The
   * card after it was "What's coming", on Today too, and that card was the door; it is gone, so this
   * one is the door now (`withDoors`), in two halves like the Manage card after it (`TourFirst`).
   * Until an entry has been opened — the shell's `open:entry` while the card is live, then
   * `close:entry` (`opensFirst`) — the log alone is outlined and breathing; after, the outline goes,
   * the Schedule cell breathes and the line says to tap it. It was a `sheet` deed the tour moved on
   * from by itself until then, which a door may not be: the parent taps the next tab themselves.
   * Nothing is celebrated: an entry opened is not an entry made (`celebrates`).
   *
   * THE ENTRY IS CARD 1'S: the one it saved, or the one the timer it started wrote when card 1 had
   * it stopped. This card asked for that stop itself from 2026-09-28 (`stopFirst`, card 1's since
   * 2026-10-01; the owner: *"the text box is already step 2 of 6, fix it any time, when it's still
   * asking me to stop the timer module first"*). A run with nothing logged before this card (a
   * start whose stop never came up on Today, say) still gets a sample entry (`sample: 'entry'`,
   * `trialEntry.ts`), said so (`prefilled`), and taken back with the rest. Its id stays `entry` and
   * a `tour_at` of `plus`, written by an earlier build, resumes here.
   *
   * TAP TO EDIT, SWIPE LEFT TO DELETE, SAID IN SO MANY WORDS (the owner, 2026-09-30: *"what about the
   * part where i asked to have them check edit/delete activity log from the most bottom of the
   * screen?"*). Today's log rows swipe left to Delete, with a question first, since 2026-09-29, and
   * the card only said "Tap your entry to open it.". Its live line names both ways now, and either
   * one is the thing tried: the entry's sheet opened and closed, or the row swiped and deleted
   * (`also: 'delete:entry'`). The app marks the row of the entry itself, not the whole log, where it
   * knows which row that is (the provider's `entryIds`).
   *
   * AND AN ENTRY TAKEN BACK WITH UNDO IS NOT AN ENTRY TO SHOW (the same day: *"i was on onboarding
   * tour step 1, logged bottle, then click undo, it then goes to step 2"*). The tour goes back to
   * card 1 and asks again, and says why (`TOUR_UNDONE`, `backForUndo`).
   */
  {
    id: 'entry',
    guide: 'main',
    tab: 'Today',
    anchor: TOUR_ANCHOR.todayLog,
    title: 'Fix it any time',
    body: 'Everything you log lands in Today’s log.',
    first: {
      event: 'close:entry',
      also: 'delete:entry',
      hint: 'Tap your entry to edit it, or swipe it left to delete.',
      stays: true,
    },
    sample: 'entry',
    prefilled: 'We added a sample entry so you can try it.',
  },
  /*
    NO "WHAT'S COMING" (the owner, 2026-09-28: *"also i asked to remove step 3, this is not needed
    "what's coming""*). It outlined Up next, asked for a row to be logged or skipped, celebrated a
    row logged ("Your first entry is in"), and was the door to Schedule. The door is card 2's now
    (`withDoors` reads it off the order, as it read this one), and so is the Schedule cell's dot; the
    celebration went with the card, since opening an entry is not making one; and a `tour_at` of
    `next`, written by an earlier build, resumes on the card that followed it (`resumeAt`).
  */
  /**
   * SCHEDULE, AND THE ONE BUTTON THAT CHANGES IT. The card sits at the FOOT with the page in the
   * open above it (`place: 'foot'`), so the page is still shown before anything is asked of it —
   * the rule the owner set on 2026-09-21 ("it asks me to click on manage intervals right away,
   * before users even have the chance to see what it is about"). Nothing here asks for a tap on
   * Routine; the outline says which button it is and the body says what is behind it.
   *
   * AND IT SAYS WHAT IS BEHIND IT, which is the whole of the rewrite (the owner, same day:
   * "step 4, very useless. At least tell user if you want to change the routine, click the
   * button, and introduction some of the different options"). Naming the page was not worth a
   * card. It named the three ways a rhythm can run — every few hours, at set times, off — plus a
   * different one at night, until the owner found it too long (2026-09-27, below): it says what
   * Manage changes now, and Manage lays the ways out itself.
   *
   * ROUTINE FIRST, THEN THE NEXT TAB (the owner, 2026-09-24: *"the look around, then tap stash
   * needs to remove, until user clicks the highlighted routine button"*). Until Routine has been
   * opened, the button alone breathes and the hint names it; back on Schedule from it, the
   * outline goes and the next tab's cell breathes.
   *
   * ONE CARD, WHATEVER COMES NEXT (2026-09-25). It used to be two — `schedule` pointing at Stash
   * and `schedule.shop` at Shopping, one kept by `tourFor` — because the door was typed into the
   * card. The door is read off the script now (`withDoors`), so the stash card after it, or the
   * shopping card for a household without one, is what it points at. A `tour_at` written as
   * `schedule.shop` by an earlier build resumes here (`resumeAt`).
   *
   * WHAT IS CHANGED IN MANAGE STAYS (the owner, same day: *"i dont think it makes sense for this
   * setting to be trial entry. i think whatever user did here should stay and make sure they are
   * warned and remove the trial entry"*). No trial line on this card (`keepsChanges`). It said
   * "Changes you make in Manage are kept." in its place until 2026-09-27, when the owner asked for
   * that line to go as well (*"step 4 of 7, remove the "Changes you make in manage are kept.""*).
   *
   * ONE SHORT SENTENCE, AND A WAY PAST MANAGE (the owner, 2026-09-27: *"tour: step 4, shorten the
   * description "tap manage to ..", also add , if you already did this in onboarding you can skip
   * this"*). The body was two sentences and 118 characters — the three ways a rhythm can run, the
   * night, and the bell — over the kept line and the live line; it says what Manage changes now,
   * and Manage itself shows the ways a rhythm runs. A parent who set the rhythms in setup is told
   * the one tap that moves on without opening Manage (`TourFirst.already`, `passesTry`).
   */
  {
    id: 'schedule',
    guide: 'main',
    tab: 'Schedule',
    anchor: TOUR_ANCHOR.scheduleRoutine,
    place: 'foot',
    title: 'Your whole day',
    body: 'Manage changes your rhythms, day and night.',
    first: {
      event: 'page:Routine',
      hint: 'Tap Manage, then come back here.',
      // the control named by the word it shows (`TOUR_LABELS.next`), never by "Skip", which ends
      // the tour
      already: `Set them in setup? Tap ${TOUR_LABELS.next} to skip this step.`,
    },
    keepsChanges: true,
  },
  /**
   * THE STASH, AS SIMPLY AS IT CAN BE PUT (the owner, 2026-09-21: "explore stash and this is the
   * button to add milk, as it is super simple"). One outline, one line, and the door on.
   *
   * AND ADDING MILK IS WHAT FINISHES IT (the owner, 2026-09-25: *"after i add milk (trial entry),
   * it should say go to shopping page when youre done here … Trial logging milk should 'complete'
   * step 5, and go on to step 6 when they are ready"*). Add milk is the thing to try: it breathes
   * until a bag is saved (the sheet's save reports `log`), the entry is a trial like every other,
   * and then its outline goes and the next tab breathes. Tapping Shopping first still works.
   *
   * STORED MILK, NOT PUMPED (2026-09-26): the card follows the stash module, and a household on
   * donor or purchased milk has a stash without a pump — the tip's title and the sheet ("Add stored
   * milk") already said stored.
   */
  {
    id: 'stash',
    guide: 'main',
    tab: 'Stash',
    anchor: TOUR_ANCHOR.stashAdd,
    title: 'The milk stash',
    body: 'Stored milk lives here. Add milk puts some in; a finished pump asks where its milk goes.',
    first: { event: 'log', hint: 'Tap Add milk and save some.' },
    needs: 'stash',
  },
  /**
   * THE LIST: PUT SOMETHING ON IT, THEN SEND IT (the owner, 2026-09-25: *"Step 6, before user
   * shares, they first need to add the supplies to the shopping cart. If user does not have
   * anything filled, then we use trial entry (let them know)"*).
   *
   * Two halves, like cards 2 to 4, except that the second is a deed on this page rather than a
   * door. Add supplies is outlined and breathing, and the line says to use it, until a line goes
   * on the list (`shop:add`, from the list and from the Supplies page); then Share is, the card
   * comes back full size if it had been put down (`backWhenTried`), and the line is "Tap Share.".
   * Share answers the card only once something is on the list (`deedReady`). Still one card, so
   * the count is Step 5 of 6 (Step 6 of 7 until "What's coming" went, 2026-09-28).
   *
   * A HOUSEHOLD WITH NOTHING IN ITS CATALOG GETS ONE SAMPLE IN IT as the card arrives
   * (`trialList.ts`), taken back with every other trial entry when the tour ends, and `prefilled`
   * is the line that says so. It replaced the three trial LINES of 2026-09-24, which were put
   * straight on an empty list so that Share had something to send.
   *
   * AND A LIST WITH NOTHING ON IT GETS SAMPLE LINES AGAIN (the owner, 2026-09-28: *"same thing with
   * add supplies if there isnt anything listed. Make sure you have trial items in case if user didnt
   * fill it in, so they can share it if they want to."*). Two lines, named as samples, go on a list
   * with nothing still to buy as the card arrives (`TRIAL_LINES`), beside the sample supply the
   * catalog gets when it is empty: the line the parent puts on is still what the card asks for
   * first, and Add supplies still has something to put there, but a parent who puts nothing on it
   * can still try Share, because Share answers this card whenever the list has something on it (the
   * provider's reading of `deedReady`). All of it is taken back when the tour ends, and the one
   * `prefilled` line says it for the samples on the list and in the catalog alike.
   *
   * ON THE SUPPLIES PAGE THE CARD STANDS ASIDE (`first.page`; the owner, same message: *"in the add
   * supplies page, the tour text box does not minimize and it blocking most of the part"*). That
   * page is where Add supplies goes with an empty catalog, and where "Manage all supplies" in the
   * picker goes.
   *
   * WHAT IS KEPT FROM BEFORE. It listens for Share rather than for the chevron (2026-09-22: `{
   * kind: 'share' }` says why). And no line tells the parent to add supplies once they have (the
   * same day: *"it keeps telling to add supplies, even though supplies has been added to the
   * shopping list, it is still showing that"*): the instruction to add is the first half's line
   * alone, and it goes the moment a line is on the list. The body is true in both halves.
   *
   * SHARE IS OPTIONAL (the owner, 2026-09-28: *"Tour changes: Share becomes optional"*). Once a line
   * is on the list the card still asks for Share, and Share still moves the tour on, but Next is
   * live beside it and says so in words (`optional`, `passesDeed`): a parent with nobody to send the
   * list to goes on to the closing card without the share sheet ever opening. The line on the list
   * is asked for first, as before: it is the list being taught, where Share is only one use of it.
   */
  {
    id: 'shopping',
    guide: 'main',
    tab: 'Shopping',
    anchor: TOUR_ANCHOR.shopShare,
    title: 'The list you send',
    body: 'Put what you need on it, then Share sends it to whoever is out, as a message in any app.',
    first: {
      event: 'shop:add',
      hint: 'Tap Add item and put one on the list.',
      anchor: TOUR_ANCHOR.shopAdd,
      page: 'Supplies',
    },
    sample: 'supply',
    prefilled: 'We added sample items so you can try it.',
    action: { kind: 'share' },
    hint: 'Tap Share.',
    // the control named by the word it shows (`TOUR_LABELS.next`), never by "Skip"
    optional: `Not sending it now? Tap ${TOUR_LABELS.next} to go on.`,
  },
  /**
   * AND IT ENDS ON THE ONE HABIT (the owner, 2026-09-18: "pop a confetti animation, and say
   * marketing line"). The store's positioning line is read from brand.json by the overlay; this
   * body is the habit that makes it true, and the receipt for the trial entries.
   */
  {
    id: 'end',
    guide: 'main',
    tab: 'Shopping',
    anchor: null,
    title: 'You’re all set',
    body: 'Log it as it happens and the day writes itself. Trial entries are cleared when you tap Done.',
  },
];

/**
 * A LIVE FACT ABOUT THE SCREEN that can earn a tip, reported by Today as it renders. Each is a
 * thing that is now IN FRONT of the parent — never a guess about what they want.
 *
 *   `children:many`  more than one baby, so the name at the top switches between them
 *
 * `timer:running` went with the timer tip it was reported for (the owner, 2026-09-27: *"remove the
 * tip "it keeps counting, even if you close the app. hold to stop it- here" serves no purpose and
 * just comes across as too much tips"*): nothing else listened for it. `care:visible`, the care
 * strip drawn, went the same way with the Baby care tip (the owner, 2026-09-28: *"tip: the small
 * things count too, just showed up out of nowhere, not sure why. remove this tip, user can see for
 * their own there is baby care"*). And later the same day `alert:tile`, a tile's edge turned, with
 * the amber and red tip (*"no need uesr can see when its due its gonna change color"*), and
 * `log:more`, a module held back from the tiles, with the tiles tip (*"i dont like the random pop
 * up, ther was one to edit the tiles in home page, if users want to do this they can do it
 * themselves"*).
 */
export type TourLiveEvent = 'children:many';

export type TourTrigger =
  | { kind: 'tab'; tab: TourTab }
  | { kind: 'event'; event: TourLiveEvent }
  /** Once, right after the tour is FINISHED — never after Skip, Not now or ×, never on an event. */
  | { kind: 'after'; guide: 'main' };
/*
  (`page`, a page pushed over the tabs opened for the first time once the tour was over, went on
  2026-09-28 with the two tips it started: the Activity log's and the day wheel's.)
*/

export interface TourGuide {
  id: TipGuideId;
  /** The row title in More → Help & tour. */
  title: string;
  /** The row's detail line. */
  detail: string;
  /** The tab the guide's card stands on: where a replay takes the parent. */
  tab: TourTab;
  trigger: TourTrigger;
  /** The guide only exists for a household with this module ON. */
  needs?: ModuleId;
}

/**
 * THE TIPS, in the order Help lists them. Each is one card, shown once, when its trigger fires
 * after the tour has ended — and never before it, so day one is the tour and nothing else.
 *
 * THREE SINCE 2026-09-28, the day the owner decided every tip, and all three on Today: the last
 * real one (*"can be kept, since this is done right after tour ends"*), the babies (*"we can keep
 * for now"*) and your initial (*"keep for now"*). The eight that went are listed at `TIP_GUIDES`.
 */
export const GUIDES: readonly TourGuide[] = [
  /**
   * THE FIRST REAL ENTRY (the owner, 2026-09-21: "at the end of the tour asks user to try to
   * log your last activity, tell them approximate is okay"). The household's first day is laid
   * out from midnight, and the slots from before signup read "Before you started" until an entry
   * answers them (2026-09-25, SCHEDULE_LOGIC §3); the chain re-anchors on the first entry — so the
   * one useful thing to do after the tour is to log the last feed, nap or diaper, roughly when it
   * was, and let the day run from it. After a FINISHED tour only (2026-09-22: a parent who skipped
   * never watched a trial entry made and cleared, so "your last real one" names a difference they
   * were never shown). Help offers it to everyone.
   *
   * ON TODAY, AFTER EVERY FINISHED TOUR (the owner, 2026-09-27: *"after tour ends, auto bring to
   * home page and show the now your last real one"*). Done lands the parent on Today and this card
   * follows there once the trial entries are cleared, and so does × on the closing card, which is
   * the end of the tour as much as Done is. It is the tour's last word, not a tip that has been
   * seen: a tour replayed from Help and finished ends on it again.
   */
  {
    id: 'first',
    title: 'Log your last activity',
    detail: 'Where your day starts counting from',
    tab: 'Today',
    trigger: { kind: 'after', guide: 'main' },
  },
  /*
    NO TIP FOR THE ACTIVITY LOG, THE TILES, SCHEDULE, THE DAY WHEEL, THE STASH, THE LIST OR REPORTS
    (the owner, 2026-09-28, deciding every tip). The Activity log's, Schedule's, the stash's and the
    list's: *"this is already is onboard initial tour"*: cards 2 to 5 teach each of them by doing.
    The tiles': *"i dont like the random pop up, ther was one to edit the tiles in home page, if
    users want to do this they can do it themselves"*. The wheel's: *"unnecessary"*. Reports': *"i
    dont think this is needed"*. Help has no row for any of them.

    NOR A BABY CARE TIP (the owner, earlier on 2026-09-28: *"tip: the small things count too, just
    showed up out of nowhere, not sure why. remove this tip, user can see for their own there is
    baby care"*). It spoke the first time the care strip was drawn once the tour was over, which on
    a fresh Today is the first visit after it: a card about a strip the parent had not gone looking
    for. The strip is headed Baby care and says what it holds, so nothing replaces the tip.
  */
  /**
   * TWINS AND MORE (the guides audit, 2026-09-26): the baby's name at the top switches babies and
   * shows them together — the multiples promise in CLAUDE.md §4 — on a chip that reads like a label.
   * Only for a household with more than one baby (`children:many`, and Help's `manyChildren`). Kept
   * when the owner decided every tip (2026-09-28: *"we can keep for now"*).
   */
  {
    id: 'babies',
    title: 'Twins and more',
    detail: 'Switching babies, from the name at the top',
    tab: 'Today',
    trigger: { kind: 'event', event: 'children:many' },
  },
  /**
   * YOUR INITIAL, ONCE (the owner, 2026-09-27: *"i see tips twice that asks me to click on my
   * profile. this is unnecessary to do it twice, they can see for themselves whats in it , they
   * just need to know that it's clickable"*). Kept when the owner decided every tip (2026-09-28:
   * *"keep for now"*).
   *
   * Two tips marked the initial: this one, Family's (*Tap your initial, then Family…*), on Today,
   * and the account tip (*Tap your initial for Appearance, Family, Plan…*) on More. Each walked the
   * parent into the menu in words; the menu says what is in it once it is open. So one is left,
   * and it says two things only: the initial can be tapped, and roughly what is behind it.
   *
   * THIS ONE, ON TODAY, because it is the page every parent comes back to and the initial is in the
   * bar on every tab — the first arrival there once the tour is over (Family's since 2026-09-27,
   * when Family went behind the initial and the tip left More with it). The id stays `settings`,
   * because `tips_seen` stores it; a household that saw Family's tip has seen this one.
   *
   * FAMILY IS NOT BEHIND IT ANY MORE (2026-09-29): the row went back to More, the first of its
   * Household group (the owner: *"now that we have more emptier, im thinking family in more suit it
   * better"*), so this line and the card below stopped naming it. A tip that sends a parent looking
   * for a row that is not there is why the Family tip left More with the row on 2026-09-27.
   * No tip names Family now, and none is added for the row on More: the owner decided every tip on
   * 2026-09-28, and a new one is theirs to ask for.
   */
  {
    id: 'settings',
    title: 'Your account',
    detail: 'Appearance and Plan, behind your initial',
    tab: 'Today',
    trigger: { kind: 'tab', tab: 'Today' },
  },
  /*
    NO ACCOUNT TIP ON MORE, AND NO TIMER TIP (2026-09-27). The account tip was the second of the two
    about your initial (above). The timer's — "It keeps counting. Even if you close the app. Hold to
    stop it…" — the owner took out: *"remove the tip "it keeps counting, even if you close the app.
    hold to stop it- here" serves no purpose and just comes across as too much tips"*. The card
    itself says Hold to stop the moment its stop is tapped.

    AND NO AMBER AND RED (the owner, 2026-09-28: *"no need uesr can see when its due its gonna change
    color"*): every tile says its state in words as well as in its edge, which is the lesson the tip
    was, for a parent who cannot tell the two hues apart too (CLAUDE.md §6).
  */
];

/** One card per tip. Same shape as a tour card; the overlay draws them the same way. */
export const TIP_STEPS: readonly TourStep[] = [
  /**
   * AT THE FOOT, because this card asks for a tap on the very grid it points at and the grid is
   * most of the screen (the owner, 2026-09-21: "the last tutorial tip: the text box is blocking
   * the quick log modules"). The outline round the tiles says where to tap; the card stays out
   * of the way of it.
   */
  /*
    NO DASH OF ANY KIND (the owner, 2026-09-27: *"remove the "-" ont he text, feels too AI"*): the
    aside the dash set off is a sentence of its own now.

    AND IT GOES ONCE THE PARENT HAS DONE WHAT IT ASKS (the owner, 2026-09-28: *"i logged diaper, but
    the tip does not go away, and the red border highlight keeps showing … it can go away
    automatically once user logged it once or clicking Got it"*): a saved entry or a started timer
    puts it away as seen, outline and all (`closesOn`), and Got it still does. That entry is the
    household's first real one, and nothing claims it: this is a tip, not a card of the tour.
  */
  {
    id: 'tip.first',
    guide: 'first',
    tab: 'Today',
    anchor: TOUR_ANCHOR.logTiles,
    place: 'foot',
    title: 'Now, your last real one',
    body: 'Tap a tile for the last feed, nap or diaper. A rough time is fine. Your day runs from it.',
    closesOn: { kind: 'log' },
  },
  /*
    NO "FIND OR FIX ANY ENTRY", "YOUR TILES, YOUR ORDER", "EVERY RHYTHM, ONE PAGE", "YOUR DAY AS A
    WHEEL", "WHERE STORED MILK LIVES", "THE LIST YOU SEND" OR "YOUR ENTRIES, ADDED UP" (2026-09-28):
    the cards of the seven tips that went with their guides (above). The tour's own cards keep their
    titles, "The milk stash" and "The list you send" among them. Nor "The small things count too",
    the Baby care tip's, gone earlier the same day.
  */
  /**
   * THE BABY'S NAME AT THE TOP: the one card for a household with more than one baby. "See them
   * together" is the switcher's Both at once, or All 3 at once.
   */
  {
    id: 'tip.babies',
    guide: 'babies',
    tab: 'Today',
    anchor: TOUR_ANCHOR.childChip,
    title: 'Switch babies here',
    body: 'Tap the name at the top to switch babies or see them together.',
  },
  /**
   * THE ONE TIP ABOUT YOUR INITIAL (the owner, 2026-09-27: *"they can see for themselves whats in
   * it , they just need to know that it's clickable"*): that it can be tapped, and roughly what is
   * behind it, in a few words. The menu names its own rows once it is open, so the card walks
   * nobody through it: it said *Tap your initial, then Family. The rest of the household joins
   * there…* until then, and the account tip on More said the rest again.
   *
   * YOUR INITIAL, NOT "YOUR PICTURE": the avatar is a letter in a circle, and a card that says
   * picture sends a parent looking for a photo. Its spoken name is "Account, <name>". The mark is
   * on the initial, because the menu is an overlay and no tip starts while one is up (`tipFor`'s
   * `busy`). It stands on Today, where its guide speaks (above).
   *
   * It said *Tap it for Family, Appearance, Plan and your account.* until 2026-09-29, when Family
   * went back to More (its guide, above): the card names the menu's rows as they are.
   */
  {
    id: 'tip.settings',
    guide: 'settings',
    tab: 'Today',
    anchor: TOUR_ANCHOR.avatar,
    title: 'Your initial, top right',
    body: 'Tap it for Appearance, Plan and your account.',
  },
  /*
    NO "AMBER AND RED" (2026-09-28): the color key's card, gone with its guide (above). It was a
    tour card that painted two tiles for show until 2026-09-18, and a tip on a real edge after that;
    each tile says which in words, and that stays.
  */
];

const fits = (s: { needs?: ModuleId; absent?: ModuleId }, on: ReadonlySet<ModuleId>): boolean =>
  (s.needs === undefined || on.has(s.needs)) && (s.absent === undefined || !on.has(s.absent));

const asSet = (enabled: ReadonlySet<ModuleId> | readonly ModuleId[]): ReadonlySet<ModuleId> =>
  enabled instanceof Set ? enabled : new Set(enabled);

/**
 * THE CELL IN THE BAR FOR EACH TAB A DOOR CAN LEAD TO — the cells `navigation.tsx` offers up to
 * be measured (`TOUR_TAB_ANCHOR` there, keyed by the bar's own names).
 */
export const TOUR_TAB_CELL: Readonly<Partial<Record<TourTab, TourAnchorId>>> = {
  Schedule: TOUR_ANCHOR.tabSchedule,
  Stash: TOUR_ANCHOR.tabStash,
  Shopping: TOUR_ANCHOR.tabShopping,
};

/**
 * THE DOORS, READ OFF THE SCRIPT (the owner, 2026-09-25: *"step 4 is completed, but it still says
 * " go back to schedule whern you are done, when im alreayd in the schedule page … the text guide
 * needs to change to click stash when you are ready"*, and the same again on 5 and 6).
 *
 * A card with no deed of its own whose NEXT card stands on another tab is a door to that tab: it
 * waits for the tab (`action`), dots its cell (`secondary`), and says so in the hand-off line
 * (`hint`, `TOUR_LINES.door`). All three used to be typed into each card, which is why card 4 came
 * in two copies — one pointing at Stash, one at Shopping — and why a door could name a tab its
 * household never reaches. Derived here, from the list this household actually walks, a door
 * cannot point anywhere but at the card after it, and one that would lead to its own tab is not a
 * door at all.
 *
 * A card that asks for a deed (a log, Share) keeps it: the tour moves on by itself once that is
 * done, and `steps.test.ts` holds that no such card is followed by one on another tab. That is why
 * card 2 has a thing to try rather than a deed since 2026-09-28: the card after it is on Schedule.
 */
export function withDoors(steps: readonly TourStep[]): TourStep[] {
  return steps.map((s, i) => {
    const next = steps[i + 1];
    if (s.action !== undefined || next === undefined || next.tab === s.tab) return s;
    const cell = TOUR_TAB_CELL[next.tab];
    return {
      ...s,
      action: { kind: 'tab', tab: next.tab },
      hint: TOUR_LINES.door(next.tab),
      ...(cell === undefined ? {} : { secondary: cell }),
    };
  });
}

/**
 * The tour's cards for this household. FILTERED BEFORE THE FIRST FRAME, so the count is what
 * the parent will actually be shown: six for a household with a stash, five for one without
 * (the stash card goes, and the Schedule card's door therefore opens on Shopping) — and the doors
 * read off what is left (`withDoors`).
 */
export function tourFor(enabled: ReadonlySet<ModuleId> | readonly ModuleId[]): TourStep[] {
  const on = asSet(enabled);
  return withDoors(TOUR_STEPS.filter(s => fits(s, on)));
}

/**
 * ── IN THE HOUSEHOLD'S OWN WORDS ────────────────────────────────────────────────────────────────
 *
 * A card that names a module the household can rename says the household's word for it (the
 * guides audit, 2026-09-26): tummy time becomes "playtime" once a household graduates it
 * (`modules/variants.ts`). The cards are written in the registry's word; `guideSteps` and
 * `guidesFor` hand them out in this household's.
 *
 * NO CARD NAMES ONE SINCE 2026-09-28, when the Baby care tip went (the owner: *"remove this tip,
 * user can see for their own there is baby care"*): it and its Help row were the two lines that
 * said tummy time. Every card is still handed out through here, so the next one that names a
 * renamed module says the household's word without anything else changing.
 */
export interface TourWords {
  /** Tummy time inside a sentence: "tummy time", or "playtime" once it has graduated. */
  tummy: string;
}

/** The registry's words — what every card is written in, and says until a household renames. */
export const TOUR_WORDS: TourWords = { tummy: moduleWordFor({}, 'tummy') };

/** A household's words, from its module variants (the app's `useModuleLabels().variants`). */
export function tourWords(variants: ModuleVariants): TourWords {
  return { tummy: moduleWordFor(variants, 'tummy') };
}

/** A line in the household's words: the registry's word swapped for theirs, and nothing else. */
const said = (text: string, words: TourWords): string =>
  words.tummy === TOUR_WORDS.tummy ? text : text.split(TOUR_WORDS.tummy).join(words.tummy);

/** A card in the household's words — the same object when there is nothing to change. */
function inWords(step: TourStep, words: TourWords): TourStep {
  const title = said(step.title, words);
  const body = said(step.body, words);
  return title === step.title && body === step.body ? step : { ...step, title, body };
}

/**
 * A guide's cards: the tour's, or a tip's one card, in the household's words. Empty for a guide
 * this household lacks.
 */
export function guideSteps(
  guide: TourGuideId,
  enabled: ReadonlySet<ModuleId> | readonly ModuleId[],
  words: TourWords = TOUR_WORDS,
): TourStep[] {
  if (guide === 'main') return tourFor(enabled);
  const on = asSet(enabled);
  return TIP_STEPS.filter(s => s.guide === guide && fits(s, on)).map(s => inWords(s, words));
}

/** The guide behind a tip id, or null for the tour itself and for an id that is not one. */
export function guideOf(id: string): TourGuide | null {
  return GUIDES.find(g => g.id === id) ?? null;
}

/** What is true on the screen right now, for the guides that only mean anything while it is. */
export interface TourLive {
  /** More than one baby: the name at the top switches between them (the babies guide). */
  manyChildren: boolean;
}

/**
 * The tips Help offers this household, in its own words: the ones whose module is on, and — for
 * the one that only means anything while the thing is true — the ones that are true right now. A
 * "switch babies" guide for one baby would describe a switch there is no second baby for. (The
 * running timer's was another, until its tip went on 2026-09-27, and the care strip's the last,
 * until the Baby care tip went on 2026-09-28.)
 *
 * The other two guides' controls are always there to point at: the Log's tiles, and your initial
 * in the top bar.
 */
export function guidesFor(
  enabled: ReadonlySet<ModuleId> | readonly ModuleId[],
  live: TourLive,
  words: TourWords = TOUR_WORDS,
): TourGuide[] {
  const on = asSet(enabled);
  return GUIDES.filter(g => {
    if (!fits(g, on)) return false;
    if (g.trigger.kind !== 'event') return true;
    if (g.trigger.event === 'children:many') return live.manyChildren;
    return true;
  }).map(g => {
    const detail = said(g.detail, words);
    return detail === g.detail ? g : { ...g, detail };
  });
}

/** Where a card sits, as the eyebrow and the dots read it: `Step 2 of 5`. */
export interface TourPlace {
  step: number;
  steps: number;
}

/** The 1-based card number for one index. Clamped, so an out-of-range index never throws. */
export function placeOf(steps: readonly TourStep[], index: number): TourPlace {
  if (steps.length === 0) return { step: 0, steps: 0 };
  return { step: Math.min(Math.max(index, 0), steps.length - 1) + 1, steps: steps.length };
}

/**
 * WHETHER A CARD OFFERS SKIP: every card of the tour but the last (the owner, 2026-09-25: *"remove
 * the option to skip tour after step 6, as that is the final step."*).
 *
 * The last card IS the end of the tour: its Done finishes it and clears the trial entries. A Skip
 * beside it was a second way to do the same thing with a different ending — a skipped tour is not
 * followed by the "last real one" card — on the one card where there is nothing left to skip. × stays: it is Close, not Skip. A tip has no Skip at all; × and Got it both
 * mean seen.
 */
export function offersSkip(step: TourStep, place: TourPlace): boolean {
  return step.guide === 'main' && place.step < place.steps;
}

/**
 * CARD IDS AN EARLIER BUILD WROTE DOWN, and the card that took each one's place. `tour_at` outlives
 * an update, so a tour closed on the old no-stash copy of the Manage card resumes on it, not on
 * card 1 — one closed on the + card (`plus`, gone 2026-09-27) resumes on the card 2 that replaced
 * it — and one closed on "What's coming" (`next`, gone 2026-09-28: the owner, *"this is not needed
 * "what's coming""*) resumes on the card that followed it, Manage's.
 */
const RETIRED: ReadonlyMap<string, string> = new Map([
  ['schedule.shop', 'schedule'],
  ['plus', 'entry'],
  ['next', 'schedule'],
]);

/** Where to resume, given what was written down. `0` for an unknown id — the start, never a crash. */
export function resumeAt(steps: readonly TourStep[], stepId: string | null): number {
  if (stepId === null) return 0;
  const id = RETIRED.get(stepId) ?? stepId;
  const i = steps.findIndex(s => s.id === id);
  return i < 0 ? 0 : i;
}

/*
  NO TIPS THE TOUR HAS ALREADY TAUGHT (2026-09-28). `TAUGHT_BY_TOUR` was the Schedule's, the stash's
  and the list's tips, marked seen by a finished tour so a parent who had just walked through Manage,
  the stash and the list was not told about them again (the owner, 2026-09-27: *"Afte tour ends, i
  visit schedule, but there is a tip to go to maange, think is not needed, because ive gone through
  it from the tutorial already."*). The owner took all three tips out the next day, for the same
  reason in fewer words: *"this is already is onboard initial tour"*. With nothing left for the tour
  to have taught, nothing is marked, and a skipped tour and a finished one leave the same tips.
*/
