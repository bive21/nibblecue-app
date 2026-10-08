/**
 * WHICH LINE A CARD SHOWS, for every card, wherever the parent is and however far the card has
 * got — the table the owner walked on 2026-09-25 and found three wrong cells in:
 *
 *  - step 4, done, on Schedule: *"it still says "go back to schedule whern you are done", when im
 *    alreayd in the schedule page … the text guide needs to change to click stash when you are
 *    ready"*;
 *  - step 5, on Stash: *"it says "go back to stash when you're done here", does not make sense, i
 *    am in stash"*;
 *  - step 5, milk added: *"it should say go to shopping page when youre done here"*.
 */
import { describe, expect, it } from 'vitest';
import { MODULES } from '../modules/module-registry';
import {
  detourOf,
  downWhenAway,
  lineOf,
  passesDeed,
  passesTry,
  standingOf,
  wayBack,
  wayPast,
  type TourLineState,
  type TourStanding,
} from './line';
import {
  asStopping,
  guideSteps,
  hidesForControl,
  TOUR_LABELS,
  TOUR_LINES,
  tourFor,
  type TourStep,
} from './steps';

/** Card 2's live line since 2026-09-30: both ways to fix an entry, a tap and a swipe, in words. */
const ENTRY_HINT = 'Tap your entry to edit it, or swipe it left to delete.';

const ALL = new Set(MODULES.map(m => m.id));
const WITH_STASH = tourFor(ALL);
const WITHOUT_STASH = tourFor([...ALL].filter(m => m !== 'stash'));
const card = (steps: readonly TourStep[], id: string): TourStep => {
  const found = steps.find(s => s.id === id);
  if (found === undefined) throw new Error(`no card ${id}`);
  return found;
};
const at = (standing: TourStanding, over: Partial<TourLineState> = {}): TourLineState => ({
  standing,
  tried: false,
  acted: false,
  settled: false,
  ...over,
});

describe('the hand-off from card to card, as the owner walked it', () => {
  /**
   * STEP 2 (the owner, 2026-09-27: *"replace this step with asking user to scroll down and check it's
   * entry"*; and 2026-09-28, *"bring the screen to the most bottom where you can see it"*): the tap,
   * said on Today without naming it and with no scroll asked for — the tour brings the log into view
   * itself — and Next held until an entry has been opened. Then it is the door "What's coming" was
   * (*"also i asked to remove step 3, this is not needed "what's coming""*): tap Schedule.
   */
  it('step 2: tap your entry, then Schedule, and the way back from the Activity log', () => {
    for (const tour of [WITH_STASH, WITHOUT_STASH]) {
      const entry = card(tour, 'entry');
      expect(lineOf(entry, at('here'))).toBe(ENTRY_HINT);
      // an entry opened and its sheet closed: the hand-off, never a word about scrolling
      expect(lineOf(entry, at('here', { tried: true }))).toBe('Tap Schedule when you’re ready.');
      for (const tried of [false, true]) {
        expect(lineOf(entry, at('here', { tried })) ?? '').not.toMatch(/scroll/i);
      }
      // opened from the log's All, the Activity log is a page over Today: the way back
      expect(lineOf(entry, at('page'))).toBe('Go back to Today when you’re done here.');
      expect(lineOf(entry, at('tab'))).toBe('Open Today to follow along.');
      // on another tab once an entry has been opened, the door is in the bar right there
      expect(lineOf(entry, at('tab', { tried: true }))).toBe('Tap Schedule when you’re ready.');
      // answered: nothing more, it is on its way out
      expect(lineOf(entry, at('here', { acted: true }))).toBeUndefined();
      // and nothing lets Next past it: opening an entry is the step
      expect(passesTry(entry, at('here'))).toBe(false);
    }
  });

  /**
   * STEP 1 WITH ITS TIMER STILL RUNNING (the owner, 2026-09-28: *"if user started something for step
   * 1, make sure tutorial tells user to stop it too by holding the button and save entry"*; and
   * 2026-10-01: *"if the timer still runs, the box won't go to step 2 yet, but rather ask to stop,
   * then go step 2 fix it anytime"*): the stop, in words, on Today and still on card 1; the way back
   * to Today from anywhere else, as for every card; and once the timer has written its entry, the
   * card's reward and then card 2 with its own line. Card 2 never says it.
   */
  it('step 1, a timer still running: stop it, on card 1, and card 2 is about the entry alone', () => {
    for (const tour of [WITH_STASH, WITHOUT_STASH]) {
      const log = card(tour, 'log');
      const stopping = asStopping(log);
      expect(lineOf(stopping, at('here'))).toBe('Stop your timer to carry on: hold its button.');
      // a pump's stop opens its sheet, so its line goes on to the save there
      expect(lineOf(asStopping(log, true), at('here'))).toBe(
        'Stop your timer to carry on: hold its button, then save.',
      );
      // it names neither a tab nor the page it is on, and asks for no scroll
      expect(lineOf(stopping, at('here'))).not.toMatch(/Today|Schedule|scroll/i);
      // off Today, the way back, exactly as the card says it without a timer
      expect(lineOf(stopping, at('tab'))).toBe('Open Today to follow along.');
      expect(lineOf(stopping, at('page'))).toBe('Go back to Today when you’re done here.');
      expect(wayBack(stopping, at('tab'))).toBe('Today');
      // nothing lets Next past it either: the stop, and the entry it saves, is the step
      expect(passesTry(stopping, at('here'))).toBe(false);
      expect(wayPast(stopping, at('here'))).toBeUndefined();
      // saved: answered, it says nothing more and moves on, its reward up
      expect(lineOf(stopping, at('here', { acted: true }))).toBeUndefined();
      // the timer stopped and its entry written, card 2 is about that entry and nothing else
      const entry = card(tour, 'entry');
      expect(asStopping(entry)).toBe(entry);
      expect(lineOf(entry, at('here'))).toBe(ENTRY_HINT);
    }
  });

  it('step 3 (the owner’s step 4): Manage first, then back on Schedule it says to tap Stash — never to go back to Schedule', () => {
    const schedule = card(WITH_STASH, 'schedule');
    // on Schedule, before Manage has been opened
    expect(lineOf(schedule, at('here'))).toBe('Tap Manage, then come back here.');
    // on Manage, which the card sent them to: the one place "go back" is true
    expect(lineOf(schedule, at('page', { tried: true }))).toBe(
      'Go back to Schedule when you’re done here.',
    );
    // back on Schedule, Manage done: the hand-off, and nothing about going back
    expect(lineOf(schedule, at('here', { tried: true }))).toBe('Tap Stash when you’re ready.');
    // …and the same card, for a household without a stash, hands over to Shopping instead
    expect(lineOf(card(WITHOUT_STASH, 'schedule'), at('here', { tried: true }))).toBe(
      'Tap Shopping when you’re ready.',
    );
  });

  it('step 4 (the owner’s step 5): on Stash it never says to go back to Stash, and saved milk hands over to Shopping', () => {
    const stash = card(WITH_STASH, 'stash');
    expect(lineOf(stash, at('here'))).toBe('Tap Add milk and save some.');
    expect(lineOf(stash, at('here', { tried: true }))).toBe('Tap Shopping when you’re ready.');
    for (const tried of [false, true]) {
      expect(lineOf(stash, at('here', { tried }))).not.toMatch(/Stash/);
    }
  });

  /**
   * STEP 6 (the owner, 2026-09-25: *"before user shares, they first need to add the supplies to the
   * shopping cart"*): the list first, then Share — both said on Shopping without naming it, and the
   * way back from the Supplies page said there and nowhere else.
   */
  it('step 5 (the owner’s step 6): a line on the list first, then Share — and the way back from the Supplies page', () => {
    for (const tour of [WITH_STASH, WITHOUT_STASH]) {
      const shopping = card(tour, 'shopping');
      expect(lineOf(shopping, at('here'))).toBe('Tap Add item and put one on the list.');
      expect(lineOf(shopping, at('here', { tried: true }))).toBe('Tap Share.');
      // on the Supplies page, before and after: back to the list, where Share is
      for (const tried of [false, true]) {
        expect(lineOf(shopping, at('page', { tried }))).toBe(
          'Go back to Shopping when you’re done here.',
        );
        // it is no door, so another tab only ever points back at the list
        expect(lineOf(shopping, at('tab', { tried }))).toBe('Open Shopping to follow along.');
      }
    }
  });

  /**
   * A DONE CARD OFF ITS PAGE STILL POINTS FORWARD. The parent who added milk and wandered to Today
   * is told the next tab, which is in the bar right in front of them — not sent back to a page whose
   * job is finished.
   */
  it('points a card whose job is done at the next tab from any other tab, and one still to do back to its page', () => {
    const stash = card(WITH_STASH, 'stash');
    expect(lineOf(stash, at('tab', { tried: true }))).toBe('Tap Shopping when you’re ready.');
    expect(lineOf(stash, at('tab'))).toBe('Open Stash to follow along.');
    // a card revisited with ‹ is not asking for anything: it is only a way back to its page
    expect(lineOf(stash, at('tab', { tried: true, settled: true }))).toBe(
      'Open Stash to follow along.',
    );
  });

  it('says nothing more once the card is answered, so no line flashes in the pause before the next', () => {
    for (const s of [...WITH_STASH, ...WITHOUT_STASH]) {
      for (const standing of ['here', 'tab', 'page'] as const) {
        expect(lineOf(s, at(standing, { acted: true, tried: true })), s.id).toBeUndefined();
      }
    }
  });
});

describe('the rules, for every card of both tours', () => {
  const cases = [...WITH_STASH, ...WITHOUT_STASH].flatMap(step =>
    (['here', 'tab', 'page'] as const).flatMap(standing =>
      [false, true].flatMap(tried =>
        [false, true].map(settled => ({ step, s: at(standing, { tried, settled }) })),
      ),
    ),
  );

  it('never names the page the parent is on', () => {
    for (const { step, s } of cases) {
      const line = lineOf(step, s) ?? '';
      const where = `${step.id} ${JSON.stringify(s)}`;
      // on the card's page: its own tab is never the thing to go to
      if (s.standing === 'here') expect(line, where).not.toContain(step.tab);
      // on another tab: the card's tab or the NEXT card's, and a door is never onto its own tab
      if (s.standing === 'tab' && step.action?.kind === 'tab') {
        expect(step.action.tab, where).not.toBe(step.tab);
      }
    }
  });

  it('says "go back" only on a page pushed over the tabs, and always there', () => {
    for (const { step, s } of cases) {
      const line = lineOf(step, s) ?? '';
      const where = `${step.id} ${JSON.stringify(s)}`;
      if (s.standing === 'page') {
        expect(line, where).toBe(`Go back to ${step.tab} when you’re done here.`);
      } else {
        expect(line, where).not.toMatch(/^Go back/);
      }
    }
  });

  it('never leaves a waiting card with nothing to say on its own page', () => {
    for (const { step, s } of cases) {
      if (s.standing !== 'here' || s.settled || step.action === undefined) continue;
      expect(lineOf(step, s), `${step.id} ${JSON.stringify(s)}`).toBeTruthy();
    }
    // …and a card that asks for nothing (the closing card) has no line of its own
    expect(lineOf(card(WITH_STASH, 'end'), at('here'))).toBeUndefined();
  });
});

/**
 * THE WAY PAST MANAGE (the owner, 2026-09-27: *"step 4 … if you already did this in onboarding you
 * can skip this"*). Next is live on card 4 — and the line naming it is shown — on its own page, until
 * Manage has been opened; everywhere and at every other moment the card is exactly as it was.
 */
describe('the way past the thing to try', () => {
  it('lets Next pass Manage on card 4, on Schedule, until Manage has been opened', () => {
    for (const tour of [WITH_STASH, WITHOUT_STASH]) {
      const schedule = card(tour, 'schedule');
      expect(passesTry(schedule, at('here'))).toBe(true);
      // the live line is unchanged beside it: Manage is still the thing the card asks for
      expect(lineOf(schedule, at('here'))).toBe('Tap Manage, then come back here.');
      // opened, it is the door it always was: Next held, "Tap Stash when you're ready."
      expect(passesTry(schedule, at('here', { tried: true }))).toBe(false);
      // answered and on its way out, or looked at again with ‹, there is nothing left to pass
      expect(passesTry(schedule, at('here', { acted: true }))).toBe(false);
      expect(passesTry(schedule, at('here', { settled: true }))).toBe(false);
      // on Manage Next reads "Back to Schedule"; on another tab it is live already, under the way
      // to the card's page — neither is where the card's words are read
      for (const standing of ['page', 'tab'] as const) {
        for (const tried of [false, true]) {
          expect(passesTry(schedule, at(standing, { tried })), standing).toBe(false);
        }
      }
    }
  });

  it('never lets Next pass anything on any other card', () => {
    for (const s of [...WITH_STASH, ...WITHOUT_STASH, ...guideSteps('first', ALL)]) {
      if (s.id === 'schedule') continue;
      for (const standing of ['here', 'tab', 'page'] as const) {
        for (const tried of [false, true]) {
          expect(passesTry(s, at(standing, { tried })), `${s.id} ${standing}`).toBe(false);
        }
      }
    }
  });
});

/**
 * SHARE IS OPTIONAL (the owner, 2026-09-28: *"Tour changes: Share becomes optional"*). Once a line
 * is on the list the shopping card asks for Share, and Next is live beside it, named in words by the
 * line under the live line; before a line is on the list the card asks for one, as it always has.
 */
describe('the way past an optional deed', () => {
  it('lets Next pass Share on the shopping card, on Shopping, once a line is on the list', () => {
    for (const tour of [WITH_STASH, WITHOUT_STASH]) {
      const shopping = card(tour, 'shopping');
      // a line on the list, Share asked for: Next passes it, and the line says so
      expect(passesDeed(shopping, at('here', { tried: true }))).toBe(true);
      expect(wayPast(shopping, at('here', { tried: true }))).toBe(
        'Not sending it now? Tap Next to go on.',
      );
      // the live line beside it is unchanged: Share is still what the card asks for
      expect(lineOf(shopping, at('here', { tried: true }))).toBe('Tap Share.');
      // before a line is on the list, the list is what is asked for, and nothing passes it
      expect(passesDeed(shopping, at('here'))).toBe(false);
      expect(wayPast(shopping, at('here'))).toBeUndefined();
      // shared and on its way out, or looked at again with ‹, there is nothing left to pass
      expect(passesDeed(shopping, at('here', { tried: true, acted: true }))).toBe(false);
      expect(passesDeed(shopping, at('here', { tried: true, settled: true }))).toBe(false);
      // on the Supplies page Next reads "Back to Shopping"; on another tab it is live already
      for (const standing of ['page', 'tab'] as const) {
        for (const tried of [false, true]) {
          expect(passesDeed(shopping, at(standing, { tried })), standing).toBe(false);
        }
      }
    }
  });

  it('names Next by its word and never says Skip, which ends the whole tour', () => {
    const line = wayPast(card(WITH_STASH, 'shopping'), at('here', { tried: true })) ?? '';
    expect(line).toContain(`Tap ${TOUR_LABELS.next}`);
    expect(line).not.toMatch(/\bSkip\b/);
  });

  it('offers a way past on two cards only: Manage before it is opened, Share once it is asked for', () => {
    for (const tour of [WITH_STASH, WITHOUT_STASH]) {
      for (const s of [...tour, ...guideSteps('first', ALL)]) {
        for (const standing of ['here', 'tab', 'page'] as const) {
          for (const tried of [false, true]) {
            for (const settled of [false, true]) {
              const state = at(standing, { tried, settled });
              const line = wayPast(s, state);
              const where = `${s.id} ${JSON.stringify(state)}`;
              const expected =
                standing === 'here' && !settled
                  ? s.id === 'schedule' && !tried
                    ? s.first?.already
                    : s.id === 'shopping' && tried
                      ? s.optional
                      : undefined
                  : undefined;
              expect(line, where).toBe(expected);
              // the two agree with the rules they are made of
              expect(line !== undefined, where).toBe(passesTry(s, state) || passesDeed(s, state));
            }
          }
        }
      }
    }
  });
});

/**
 * A TIP ON A PUSHED PAGE WAS AT HOME THERE (the guides audit, 2026-09-26): the Activity log's search
 * and the day wheel on Manage, which never said "go back" on their own page. Both went on
 * 2026-09-28, when the owner decided every tip ("this is already is onboard initial tour",
 * "unnecessary"), so every card and tip left is on a tab, and every one of them says the way back.
 */
describe('the tips that are left, all on Today', () => {
  it('say the way back to Today from a page pushed over it', () => {
    // the tip about your initial (`settings`, Family's until 2026-09-27) stands on Today since then;
    // Family's row went back to More on 2026-09-29 with no tip of its own
    for (const guide of ['settings', 'babies', 'first'] as const) {
      const [tip] = guideSteps(guide, ALL);
      expect(tip, guide).toBeDefined();
      expect(lineOf(tip as TourStep, at('page')), guide).toBe(
        'Go back to Today when you’re done here.',
      );
    }
    expect(guideSteps('entries' as never, ALL)).toEqual([]);
    expect(guideSteps('wheel' as never, ALL)).toEqual([]);
  });
});

/**
 * ── LEAVING THE CARD'S PAGE, AND COMING BACK, ON EVERY PAGE THE TOUR WALKS ─────────────────────
 *
 * The owner, 2026-09-30: *"it then brought me to step 3, schedule, where i decided to go back to
 * today page to check, and then went to schedule again, but the tour box is now gone. i have to go
 * to settings and continue tour, but new users wont know this. the only way to remove the tour box
 * from the page is by clicking x or skip, going to another page shouldnt cancel everything."*
 *
 * Every card of both tours, walked over every tab and every page the tour or the parent can put
 * over one: where the parent stands, whether the card goes down to its bar at once, whether the bar
 * carries the way back, and what its line says. What must hold everywhere: a card that asks for
 * something is never left with no way back to its page; a card seen with its control is never
 * hidden for it again; and back on the card's page, the card is itself.
 */
describe('leaving a card’s page and coming back, on every page the tour walks', () => {
  /** Where the parent can be: every tab, and the pages pushed over one that the tour meets. */
  const PLACES = {
    Today: { tab: 'Today', pushed: 0, page: null },
    Schedule: { tab: 'Schedule', pushed: 0, page: null },
    Stash: { tab: 'Stash', pushed: 0, page: null },
    Shopping: { tab: 'Shopping', pushed: 0, page: null },
    More: { tab: 'More', pushed: 0, page: null },
    Reports: { tab: 'Reports', pushed: 0, page: null },
    // Manage, opened from Schedule: the Schedule card's own detour
    Manage: { tab: 'Schedule', pushed: 1, page: 'Routine' },
    // Supplies, opened from the list: the shopping card's own detour
    Supplies: { tab: 'Shopping', pushed: 1, page: 'Supplies' },
    // the Activity log, opened from Today's log with its All; Family, from More
    'Activity log': { tab: 'Today', pushed: 1, page: 'Timeline' },
    Family: { tab: 'More', pushed: 1, page: 'Family' },
  } as const;
  const TOURS = { 'with a stash': WITH_STASH, 'without a stash': WITHOUT_STASH } as const;
  /** A card that asks the parent for something: every card of the tour but the closing one. */
  const asks = (s: TourStep): boolean => s.action !== undefined || s.first !== undefined;

  it('is down at once away from its page, with a way back, and itself again on its page', () => {
    for (const [who, tour] of Object.entries(TOURS)) {
      for (const s of tour) {
        for (const [name, place] of Object.entries(PLACES)) {
          for (const tried of [false, true]) {
            const where = `${who}: ${s.id} on ${name}, tried ${String(tried)}`;
            const standing = standingOf(s, place);
            const state = at(standing, { tried });
            const down = downWhenAway(s, { standing, page: place.page });
            const back = wayBack(s, state);
            const line = lineOf(s, state);
            if (standing === 'here') {
              // on its own page it is itself: never down for being away, and no way back to offer
              expect(down, where).toBe(false);
              expect(back, where).toBeNull();
              continue;
            }
            if (!asks(s)) {
              // the closing card asks for nothing: its Done ends the tour from wherever it is
              expect([down, back], where).toEqual([false, null]);
              continue;
            }
            // away from its page: down at once, except on the page the card sent the parent to
            expect(down, where).toBe(!(place.page !== null && place.page === detourOf(s)));
            // never without a way back to its page: the button that goes there, or, with its own
            // thing done, the next tab named in its line and breathing in the bar right there
            const door = s.action?.kind === 'tab' ? s.action.tab : null;
            if (back === null) {
              expect(standing, where).toBe('tab');
              expect(door !== null && tried, where).toBe(true);
              expect(line, where).toBe(TOUR_LINES.door(door as string));
            } else {
              expect(back, where).toBe(s.tab);
              expect(line, where).toBe(
                standing === 'page' ? TOUR_LINES.back(s.tab) : TOUR_LINES.open(s.tab),
              );
            }
          }
          // and coming back to the card's own tab, with nothing pushed over it, is coming home
          const home = standingOf(s, { tab: s.tab, pushed: 0 });
          expect(home, `${who}: ${s.id} back on ${s.tab}`).toBe('here');
          expect(downWhenAway(s, { standing: home, page: null })).toBe(false);
          expect(wayBack(s, at(home))).toBeNull();
        }
        // seen with its control once, a card is never hidden for it again, wherever it went
        for (const tried of [false, true]) {
          expect(hidesForControl(s, { tried, seen: true }), s.id).toBe(false);
        }
      }
    }
  });

  /**
   * THE OWNER'S PATH, STEP BY STEP: step 3 on Schedule, over to Today, and back to Schedule — and
   * Manage in between, which is the card's own detour.
   */
  it('walks the owner’s step 3: Schedule, Today, Schedule again, and Manage', () => {
    for (const tour of Object.values(TOURS)) {
      const schedule = tour.find(s => s.id === 'schedule') as TourStep;
      // on Schedule: itself, nothing to go back to
      expect(standingOf(schedule, PLACES.Schedule)).toBe('here');
      // over to Today: down to its bar at once, saying where it is, with Back to Schedule on it
      const today = standingOf(schedule, PLACES.Today);
      expect(today).toBe('tab');
      expect(downWhenAway(schedule, { standing: today, page: null })).toBe(true);
      expect(wayBack(schedule, at(today))).toBe('Schedule');
      expect(TOUR_LABELS.backTo(wayBack(schedule, at(today)) as string)).toBe('Back to Schedule');
      expect(lineOf(schedule, at(today))).toBe('Open Schedule to follow along.');
      // back on Schedule: the card is itself again
      const again = standingOf(schedule, PLACES.Schedule);
      expect(again).toBe('here');
      expect(downWhenAway(schedule, { standing: again, page: null })).toBe(false);
      expect(lineOf(schedule, at(again))).toBe('Tap Manage, then come back here.');
      // Manage, its own detour: open as they arrive (not down at once), and the way back on it
      const manage = standingOf(schedule, PLACES.Manage);
      expect(manage).toBe('page');
      expect(detourOf(schedule)).toBe('Routine');
      expect(downWhenAway(schedule, { standing: manage, page: 'Routine' })).toBe(false);
      expect(wayBack(schedule, at(manage, { tried: true }))).toBe('Schedule');
      // Manage opened, and Today again: its door is open, so the next tab is its way on
      const door = schedule.action?.kind === 'tab' ? schedule.action.tab : '';
      expect(wayBack(schedule, at('tab', { tried: true }))).toBeNull();
      expect(lineOf(schedule, at('tab', { tried: true }))).toBe(TOUR_LINES.door(door));
    }
  });

  it('knows each card’s own detour, and no other page is one', () => {
    for (const tour of Object.values(TOURS)) {
      expect(tour.map(s => [s.id, detourOf(s)]).filter(([, d]) => d !== null)).toEqual([
        ['schedule', 'Routine'],
        ['shopping', 'Supplies'],
      ]);
    }
    // card 2's Activity log is a wander: its bar goes down there, with Back to Today on it
    const entry = WITH_STASH.find(s => s.id === 'entry') as TourStep;
    const log = standingOf(entry, PLACES['Activity log']);
    expect(log).toBe('page');
    expect(downWhenAway(entry, { standing: log, page: 'Timeline' })).toBe(true);
    expect(wayBack(entry, at(log))).toBe('Today');
    // …and card 1 while its timer still runs is marked on Today too, and walked the same way
    const stopping = asStopping(WITH_STASH.find(s => s.id === 'log') as TourStep);
    expect(standingOf(stopping, PLACES.Schedule)).toBe('tab');
    expect(downWhenAway(stopping, { standing: 'tab', page: null })).toBe(true);
    expect(wayBack(stopping, at('tab'))).toBe('Today');
  });

  it('keeps a tip as it was: one card, its Got it, and nothing to go back to', () => {
    for (const guide of ['settings', 'babies', 'first'] as const) {
      const [tip] = guideSteps(guide, ALL);
      for (const standing of ['here', 'tab', 'page'] as const) {
        expect(downWhenAway(tip as TourStep, { standing, page: null }), guide).toBe(false);
        expect(wayBack(tip as TourStep, at(standing)), guide).toBeNull();
      }
    }
  });
});
