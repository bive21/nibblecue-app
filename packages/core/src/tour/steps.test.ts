/**
 * The tour's cards and the tips, and the claims that make them honest rather than merely
 * present: the tour is six cards and every one but the last is DONE; every card names its
 * control in words; every anchor has a home; the count is what the parent is shown; nothing
 * describes the baby; and every tip has exactly one card, one trigger and one control
 * (docs/TOUR_SCRIPT.md).
 */
import { describe, expect, it } from 'vitest';
import { MODULES } from '../modules/module-registry';
import * as script from './steps';
import {
  actionKey,
  anchorHome,
  answersFirst,
  asMarked,
  asStopping,
  awaitsControl,
  backForUndo,
  backWhenTried,
  breathingMark,
  canSee,
  celebrates,
  deedReady,
  doorOpen,
  GUIDES,
  guideOf,
  guideSteps,
  guidesFor,
  hidesForControl,
  hintOf,
  homeOf,
  movesWithPage,
  offersSkip,
  offersUndo,
  opensFirst,
  placeOf,
  restsNow,
  resumeAt,
  satisfies,
  standsAside,
  startsStop,
  subjectMarked,
  TIP_GUIDES,
  TIP_STEPS,
  TOUR_ANCHOR,
  TOUR_ANCHOR_HOME,
  TOUR_ASK,
  TOUR_HOLD_MS,
  TOUR_LABELS,
  TOUR_LINES,
  TOUR_REST_LABELS,
  TOUR_REST_MS,
  TOUR_RESUME,
  TOUR_TAB_CELL,
  TOUR_FIRST_ENTRY,
  TOUR_TRIAL,
  TOUR_UNDONE,
  TOUR_STEPS,
  TOUR_WORDS,
  tourFor,
  tourScrolls,
  tourWords,
  restsWhenRead,
  trialLabelOn,
  tryReward,
  withDoors,
  type TourLive,
  type TourStep,
} from './steps';
import { TRIAL_ENTRY_NOTE } from './trialEntry';
import { TRIAL_LINES, TRIAL_SUPPLY } from './trialList';

const ids = (steps: readonly TourStep[]): string[] => steps.map(s => s.id);
const ALL = new Set(MODULES.map(m => m.id));
/**
 * A household with NO STASH — which since 2026-09-21 is not the same as one that does not pump:
 * donor and purchased milk keep a stash too (`setup.ts` `stored`). The tour's stash card and the
 * stash tip follow the STASH module, so this fixture drops that rather than the pump.
 */
const NO_STASH = new Set([...ALL].filter(m => m !== 'stash'));
/** The two tours a household can be shown, doors and all (`tourFor` reads them off the script). */
const WITH_STASH = tourFor(ALL);
const WITHOUT_STASH = tourFor(NO_STASH);
const TOURS = { 'with a stash': WITH_STASH, 'without a stash': WITHOUT_STASH } as const;
/** Every card either tour can show, and every tip — what a parent can actually meet. */
const EVERY_STEP: readonly TourStep[] = [...WITH_STASH, ...WITHOUT_STASH, ...TIP_STEPS];
const card = (steps: readonly TourStep[], id: string): TourStep => {
  const found = steps.find(s => s.id === id);
  if (found === undefined) throw new Error(`no card ${id}`);
  return found;
};

describe('the tour is six cards, and every one but the last is done rather than read', () => {
  /**
   * NO "WHAT'S COMING" (the owner, 2026-09-28: *"also i asked to remove step 3, this is not needed
   * "what's coming""*). Six cards for a household with a stash, five for one without.
   */
  it('is log · entry · schedule · stash · shopping · end, less the stash for a household without one', () => {
    expect(ids(TOUR_STEPS)).toEqual(['log', 'entry', 'schedule', 'stash', 'shopping', 'end']);
    expect(ids(WITH_STASH)).toEqual(['log', 'entry', 'schedule', 'stash', 'shopping', 'end']);
    // ONE Manage card for both households since 2026-09-25: its door is read off the card after it
    expect(ids(WITHOUT_STASH)).toEqual(['log', 'entry', 'schedule', 'shopping', 'end']);
    expect(ids(tourFor([]))).toEqual(ids(WITHOUT_STASH));
    // and nothing is left of it: no card, no anchor on Up next, no card on Today that points there
    for (const s of [...TOUR_STEPS, ...WITH_STASH, ...WITHOUT_STASH]) {
      expect(s.id, s.id).not.toBe('next');
      expect(`${s.title} ${s.body} ${s.hint ?? ''} ${s.first?.hint ?? ''}`, s.id).not.toMatch(
        /Up next|What’s coming|\brow\b/,
      );
    }
    expect(Object.keys(TOUR_ANCHOR)).not.toContain('upNext');
    expect(Object.values(TOUR_ANCHOR)).not.toContain('tour.next');
  });

  /**
   * THE BRIEF'S ONE HARD RULE: not a sequence of Next. Five of the six cards wait on the parent
   * doing the thing — an entry or a timer, a tab tapped three times over (the first once an entry
   * has been opened from Today's log and closed again), Share — and the one that does not is the
   * closing card.
   */
  it('asks the parent to do something on five of them, and the first is logging', () => {
    const acting = WITH_STASH.filter(s => s.action !== undefined).map(s => s.id);
    // `shopping` joined them on 2026-09-22: it asks for Share and now waits for it (the owner,
    // "i tried clicking the share button but that does not work still… change this so it ends
    // after clicking the share button")
    expect(acting).toEqual(['log', 'entry', 'schedule', 'stash', 'shopping']);
    expect(WITH_STASH[0]?.action).toEqual({ kind: 'log' });
    // card 2 since 2026-09-28: an entry opened from Today's log is its thing to try, and then it is
    // the door to Schedule that "What's coming" was
    expect(WITH_STASH[1]?.first?.event).toBe('close:entry');
    expect(WITH_STASH[1]?.action).toEqual({ kind: 'tab', tab: 'Schedule' });
    // each door leads to the next page in the bar's order; without a stash it skips the stash
    expect(card(WITH_STASH, 'schedule').action).toEqual({ kind: 'tab', tab: 'Stash' });
    expect(card(WITHOUT_STASH, 'schedule').action).toEqual({ kind: 'tab', tab: 'Shopping' });
    expect(card(WITH_STASH, 'stash').action).toEqual({ kind: 'tab', tab: 'Shopping' });
  });

  /**
   * THE DOORS ARE THE SCRIPT'S (the owner, 2026-09-25: *"step 4 is completed, but it still says
   * "go back to schedule when you are done", when im already in the schedule page … the text
   * guide needs to change to click stash when you are ready"*, and the same on 5 and 6).
   *
   * A card with no deed of its own whose next card is on another tab asks for exactly that tab —
   * the action, the dotted cell and the hand-off line all read off the NEXT card, in the list this
   * household walks. Nothing names Stash or Shopping by hand any more, so neither can be wrong for
   * the household that has no stash.
   */
  it('makes every card whose next card is on another tab a door to that tab, and no other card', () => {
    for (const [who, tour] of Object.entries(TOURS)) {
      tour.forEach((s, i) => {
        const next = tour[i + 1];
        const leaves = next !== undefined && next.tab !== s.tab;
        const where = `${who}: ${s.id}`;
        if (!leaves) {
          // a card whose next card is on the same tab is never a door: nothing to tap, it moves on
          expect(s.action?.kind === 'tab', where).toBe(false);
          return;
        }
        // …and one that leaves this tab is a door, never a deed the tour would move on from by
        // itself into a room the parent did not choose
        expect(s.action, where).toEqual({ kind: 'tab', tab: next.tab });
        expect(s.secondary, where).toBe(TOUR_TAB_CELL[next.tab]);
        expect(s.hint, where).toBe(TOUR_LINES.door(next.tab));
        // the hand-off never names the page the card is on
        expect(s.hint, where).not.toContain(s.tab);
      });
    }
    // the words, exactly: "click stash when you are ready", in the app's own voice
    expect(TOUR_LINES.door('Stash')).toBe('Tap Stash when you’re ready.');
    expect(card(WITH_STASH, 'schedule').hint).toBe('Tap Stash when you’re ready.');
    expect(card(WITHOUT_STASH, 'schedule').hint).toBe('Tap Shopping when you’re ready.');
    expect(card(WITH_STASH, 'stash').hint).toBe('Tap Shopping when you’re ready.');
    expect(card(WITH_STASH, 'entry').hint).toBe('Tap Schedule when you’re ready.');
    // and nothing in the script itself carries a door: it is all read off the order
    for (const s of TOUR_STEPS) {
      expect(s.action?.kind === 'tab', s.id).toBe(false);
      expect(s.secondary, s.id).toBeUndefined();
    }
  });

  it('opens no door onto the tab a card is already on', () => {
    const [stash, shopping] = [card(TOUR_STEPS, 'stash'), card(TOUR_STEPS, 'shopping')];
    // two cards on one tab: the first is read and moves on with ›, it does not ask for its own tab
    const sameTab = withDoors([stash, { ...stash, id: 'stash.again' }]);
    expect(sameTab[0]?.action).toBeUndefined();
    expect(sameTab[0]?.secondary).toBeUndefined();
    expect(sameTab[0]?.hint).toBeUndefined();
    // and a deed of its own is never overwritten by a door
    expect(withDoors([shopping, stash])[0]?.action).toEqual({ kind: 'share' });
  });

  /**
   * A TOUR CLOSED ON THE OLD NO-STASH COPY OF CARD 4 RESUMES ON CARD 4. `tour_at` outlives an
   * update, and "start again from card 1" is the tour a parent dismisses on reflex.
   */
  it('resumes a card id an earlier build wrote down on the card that replaced it', () => {
    expect(resumeAt(WITHOUT_STASH, 'schedule.shop')).toBe(2);
    expect(resumeAt(WITH_STASH, 'schedule.shop')).toBe(2);
    expect(WITHOUT_STASH[2]?.id).toBe('schedule');
    // the + card (2026-09-27): a tour closed on it resumes on the card 2 that replaced it
    for (const tour of Object.values(TOURS)) {
      expect(resumeAt(tour, 'plus')).toBe(1);
      expect(tour[1]?.id).toBe('entry');
    }
    // "What's coming" (2026-09-28): a tour closed on it resumes on the card that followed it, Manage,
    // not on card 1 and not one card further on than the parent had been
    for (const tour of Object.values(TOURS)) {
      expect(resumeAt(tour, 'next')).toBe(tour.indexOf(card(tour, 'schedule')));
      expect(placeOf(tour, resumeAt(tour, 'next')).step).toBe(3);
    }
  });

  /**
   * A PAGE IS SEEN BEFORE ANYTHING ON IT IS ASKED OF (the owner, 2026-09-21: "it asks me to
   * click on manage intervals right away, before users even have the chance to see what it is
   * about"). The card that arrives on Schedule keeps the whole page in the open by sitting at
   * the FOOT of it, and nothing on this card asks for a tap on Routine — it outlines the button
   * and says what is behind it, which is the part the owner found missing the same day ("step 4,
   * very useless. At least tell user if you want to change the routine, click the button, and
   * introduction some of the different options").
   */
  it('arrives on Schedule with the page in view, and says what Manage does', () => {
    for (const [who, tour] of Object.entries(TOURS)) {
      const schedule = card(tour, 'schedule');
      expect(schedule.anchor, who).toBe(TOUR_ANCHOR.scheduleRoutine);
      expect(schedule.place, who).toBe('foot');
      // the button by name, what it changes, and the night
      // the button reads Manage since 2026-09-24 (the route behind it is still `Routine`)
      expect(schedule.body, who).toBe('Manage changes your rhythms, day and night.');
      expect(schedule.body, who).toMatch(/Manage/);
      expect(schedule.body, who).toMatch(/rhythm/);
      expect(schedule.body, who).toMatch(/night/i);
      // and it still asks only for the next TAB: nothing here is a tap on Routine
      expect(schedule.action?.kind, who).toBe('tab');
    }
  });

  /**
   * ONE SHORT SENTENCE (the owner, 2026-09-27: *"tour: step 4, shorten the description "tap manage
   * to .."*). It was two sentences and 118 characters — every few hours, set times, off, the night
   * and the bell — above the kept line and the live line.
   */
  it('says what Manage changes in one short sentence', () => {
    const body = card(WITH_STASH, 'schedule').body;
    expect((body.match(/[.!?](\s|$)/g) ?? []).length).toBe(1);
    expect(body.length).toBeLessThanOrEqual(60);
    // under half of what it was
    expect(body.length * 2).toBeLessThan(
      'Tap Manage to change a rhythm — every few hours, at set times, or off, and a different one at night. The bell is reminders.'
        .length,
    );
  });

  /**
   * AND A WAY PAST MANAGE THAT IS REAL (the owner, the same message: *"also add , if you already did
   * this in onboarding you can skip this"*). The line names the tap by the word the control shows —
   * Next, which is live on this card until Manage has been opened (`passesTry`, walked in
   * `line.test.ts`) — and never says "Skip", the card's other control, which ends the whole tour.
   */
  it('offers the parent who set the rhythms in setup one tap past Manage, and names it', () => {
    for (const [who, tour] of Object.entries(TOURS)) {
      const schedule = card(tour, 'schedule');
      expect(schedule.first?.already, who).toBe('Set them in setup? Tap Next to skip this step.');
      expect(schedule.first?.already, who).toContain(`Tap ${TOUR_LABELS.next}`);
      expect(schedule.first?.already, who).not.toMatch(/\bSkip\b/);
      // Manage is still what the card asks for first, and still how it opens its door
      expect(schedule.first?.event, who).toBe('page:Routine');
      expect(schedule.first?.hint, who).toBe('Tap Manage, then come back here.');
      // …and the card's count is the same: a line, not a card (step 3 since 2026-09-28)
      expect(placeOf(tour, tour.indexOf(schedule)).step, who).toBe(3);
    }
    expect(placeOf(WITH_STASH, 2)).toEqual({ step: 3, steps: 6 });
    // no other card, and no tip, offers one: setup did none of their things
    expect(EVERY_STEP.filter(s => s.first?.already !== undefined).map(s => s.id)).toEqual([
      'schedule',
      'schedule',
    ]);
  });

  /**
   * ONE LINE WHERE THE BADGE WAS (the owner, 2026-09-27: *"move the "removed for you when thetour
   * ends" to be replacing the "Trial entry" so it says "entry removed when tour ends" but make it
   * fit in one row."*). The badge and the sentence under the words are one line, on every card that
   * can write or show an entry — and still not on the card whose changes are kept (the owner,
   * 2026-09-25: *"i dont think it makes sense for this setting to be trial entry … remove the trial
   * entry and the thxt "removed for you when the tour ends."*). The closing card says it in its own
   * body. That the line fits one row is `apps/mobile/src/tour/trialLabel.test.ts`, against the face.
   */
  it('says "Entry removed when tour ends" in one line, on every card that can write, never on Manage’s', () => {
    expect(TOUR_TRIAL).toBe('Entry removed when tour ends');
    // one line: no sentence of its own, no second line, nothing a badge could not hold
    expect(TOUR_TRIAL).not.toMatch(/[.\n]/);
    expect(TOUR_TRIAL.length).toBeLessThanOrEqual(30);
    // the badge's two words and the sentence under the words are gone as separate things
    expect('TOUR_TRIAL_NOTE' in script).toBe(false);
    expect('trialBadgeOn' in script).toBe(false);
    expect('trialNoteOn' in script).toBe(false);
    for (const [who, tour] of Object.entries(TOURS)) {
      expect(
        tour.filter(trialLabelOn).map(s => s.id),
        who,
      ).toEqual(ids(tour).filter(id => id !== 'schedule' && id !== 'end'));
      // the card about Today's log among them: the entry it shows is a trial entry
      expect(trialLabelOn(card(tour, 'entry')), who).toBe(true);
      // Manage's changes are kept, so the line would be false there
      expect(trialLabelOn(card(tour, 'schedule')), who).toBe(false);
      // …and the closing card says it in its own words, not twice
      expect(trialLabelOn(card(tour, 'end')), who).toBe(false);
      expect(card(tour, 'end').body).toContain('Trial entries are cleared when you tap Done.');
    }
    // a tip writes nothing and carries none
    for (const s of TIP_STEPS) expect(trialLabelOn(s), s.id).toBe(false);
  });

  /**
   * STEP 4 SAYS NOTHING ABOUT WHAT IS KEPT (the owner, 2026-09-27: *"step 4 of 7, remove the
   * "Changes you make in manage are kept.""*). What the line stood for is still true —
   * `tourWrites.test.ts` proves a rhythm changed in Manage survives the clean-up — and the card
   * still wears no trial line; the line itself, and the field that held it, are gone.
   */
  it('drops "Changes you make in Manage are kept." from step 4, and still wears no trial line there', () => {
    for (const [who, tour] of Object.entries(TOURS)) {
      const schedule = card(tour, 'schedule');
      expect('kept' in schedule, who).toBe(false);
      expect(schedule.keepsChanges, who).toBe(true);
      expect(trialLabelOn(schedule), who).toBe(false);
      // the owner's step 4, step 3 since "What's coming" went (2026-09-28)
      expect(placeOf(tour, tour.indexOf(schedule)).step, who).toBe(3);
      // no card says it any other way either
      for (const s of tour) {
        const said = [s.title, s.body, s.hint, s.first?.hint, s.first?.already, s.prefilled].join(
          ' ',
        );
        expect(said, `${who}: ${s.id}`).not.toMatch(/\bkept\b/i);
      }
      // …and it is the one card that keeps what is changed on it
      expect(tour.filter(s => s.keepsChanges === true).map(s => s.id)).toEqual(['schedule']);
    }
  });

  /**
   * ── STEP 2: THE ENTRY, IN TODAY'S LOG ─────────────────────────────────────────────────────────
   *
   * The owner, 2026-09-27: *"tour step 2, where it asks me for a quick log, i think we can remove
   * this. because the problem is that, i click breastfeeding module, it auto goes to step 3, when i
   * still have to pick start feeding or already feeding for modules with timer. either fix this, or
   * just remove this from tutorial … -> idea: better to replace this step with asking user to scroll
   * down and check it's entry, mention this is where you can fix each entry to enter if you need to
   * make changes to it."*
   */
  describe('step 2 brings the parent’s entry into view, says it is where an entry is fixed, then hands over to Schedule', () => {
    /**
     * TAP TO EDIT, SWIPE LEFT TO DELETE, IN THE CARD'S OWN LINE (the owner, 2026-09-30: *"what about
     * the part where i asked to have them check edit/delete activity log from the most bottom of the
     * screen?"*). Today's log rows swipe left to Delete since 2026-09-29, and the card said only
     * "Tap your entry to open it.".
     */
    it('points at Today’s log, and says a tap edits the entry and a swipe left deletes it', () => {
      for (const [who, tour] of Object.entries(TOURS)) {
        const entry = card(tour, 'entry');
        expect(tour.indexOf(entry), who).toBe(1);
        expect(placeOf(tour, 1), who).toEqual({ step: 2, steps: tour.length });
        expect(entry.tab, who).toBe('Today');
        expect(entry.anchor, who).toBe(TOUR_ANCHOR.todayLog);
        expect(anchorHome(entry), who).toBe('tab');
        expect(entry.title, who).toBe('Fix it any time');
        expect(entry.body, who).toBe('Everything you log lands in Today’s log.');
        expect(entry.first?.hint, who).toBe(
          'Tap your entry to edit it, or swipe it left to delete.',
        );
        // both ways, in so many words: a tap edits, a swipe left deletes
        expect(entry.first?.hint, who).toMatch(/\btap\b.*\bedit\b/i);
        expect(entry.first?.hint, who).toMatch(/\bswipe it left\b.*\bdelete\b/);
        // the tour does the scrolling now (2026-09-28): nothing on the card asks for one
        const said = `${entry.title} ${entry.body} ${entry.hint ?? ''} ${entry.first?.hint ?? ''}`;
        expect(said, who).not.toMatch(/scroll/i);
        // the + card and its grid are gone from the tour
        expect(said, who).not.toMatch(/\+|module/);
      }
      expect(placeOf(WITH_STASH, 1)).toEqual({ step: 2, steps: 6 });
      expect(placeOf(WITHOUT_STASH, 1)).toEqual({ step: 2, steps: 5 });
      expect(TOUR_STEPS.some(s => s.anchor === 'tour.fab')).toBe(false);
      expect(Object.values(TOUR_ANCHOR)).not.toContain('tour.fab');
    });

    /**
     * THE TOUR SCROLLS, NOT THE PARENT (the owner, 2026-09-28: *"when step 2 showed up the text box,
     * bring the screen to the most bottom where you can see it"*). Today's log is brought into the
     * open like every other card's control, the card is placed beside it rather than pinned to the
     * foot over it, and it stays up there until an entry has been opened: the bar a card shrinks to
     * is at the foot of the screen, which is where the last thing on Today ends up.
     */
    it('is brought into view by the tour, sits beside the log, and stays up until an entry is opened', () => {
      const entry = card(WITH_STASH, 'entry');
      expect('scroll' in entry).toBe(false);
      expect(entry.place).toBeUndefined();
      expect(movesWithPage(anchorHome(entry))).toBe(true);
      expect(tourScrolls(entry)).toBe(true);
      // a door, so it will be a bar one day — the room for that bar is kept clear of the log…
      expect(restsWhenRead(entry)).toBe(true);
      // …but not before an entry has been opened
      expect(entry.first?.stays).toBe(true);
      expect(restsNow(entry, false)).toBe(false);
      expect(restsNow(entry, true)).toBe(true);
      // every card whose control moves with its page is brought into view, and only card 2 stays
      for (const s of EVERY_STEP) {
        expect('scroll' in s, s.id).toBe(false);
        expect(tourScrolls(s), s.id).toBe(movesWithPage(anchorHome(s)));
        for (const tried of [false, true]) {
          if (s.id === 'entry') continue;
          expect(restsNow(s, tried), `${s.id} ${String(tried)}`).toBe(restsWhenRead(s));
        }
      }
      expect(EVERY_STEP.filter(s => s.first?.stays === true).map(s => s.id)).toEqual([
        'entry',
        'entry',
      ]);
    });

    /**
     * AN ENTRY OPENED AND ITS SHEET CLOSED IS ITS THING TO TRY — the shell's own `open:entry` while
     * the card is live and then `close:entry` (`opensFirst`) — and then it is the door to Schedule,
     * which "What's coming" used to be (the owner, 2026-09-28: *"also i asked to remove step 3, this
     * is not needed "what's coming""*). Never celebrated: an entry opened is not an entry made.
     */
    it('is tried by an entry’s sheet closing after it opened, then is the door to Schedule, and celebrates nothing', () => {
      for (const [who, tour] of Object.entries(TOURS)) {
        const entry = card(tour, 'entry');
        expect(entry.first?.event, who).toBe('close:entry');
        expect(opensFirst('close:entry')).toBe('open:entry');
        // the sheet closing counts only once it opened while the card was up (`answersFirst`)…
        const first = entry.first!;
        expect(answersFirst(first, 'close:entry', true), who).toBe(true);
        expect(answersFirst(first, 'close:entry', false), who).toBe(false);
        // …and a row swiped left and deleted counts too, with no sheet to open first (2026-09-30)
        expect(first.also, who).toBe('delete:entry');
        expect(answersFirst(first, 'delete:entry', false), who).toBe(true);
        for (const other of ['open:entry', 'log', 'close:quickentry', 'tab:Schedule']) {
          expect(answersFirst(first, other, true), `${who}: ${other}`).toBe(false);
        }
        // the door: the Schedule tab, its cell and the hand-off line, read off the card after it
        expect(entry.action, who).toEqual({ kind: 'tab', tab: 'Schedule' });
        expect(entry.secondary, who).toBe(TOUR_ANCHOR.tabSchedule);
        expect(entry.hint, who).toBe('Tap Schedule when you’re ready.');
        // the sheet closing is the try, not the deed, and nothing else is either
        for (const other of [
          'close:entry',
          'open:entry',
          'close:quicklog',
          'close:quickentry',
          'log',
        ]) {
          expect(satisfies(entry.action!, other), `${who}: ${other}`).toBe(false);
        }
        expect(satisfies(entry.action!, 'tab:Schedule'), who).toBe(true);
        // before: the log alone, outlined and breathing, and its own line
        expect(doorOpen(entry, false), who).toBe(false);
        expect(subjectMarked(entry, false), who).toBe(true);
        expect(breathingMark(entry, { waiting: true }), who).toBe('subject');
        expect(hintOf(entry, false), who).toBe(
          'Tap your entry to edit it, or swipe it left to delete.',
        );
        // after: the outline goes, the Schedule cell breathes, and the line names it
        expect(doorOpen(entry, true), who).toBe(true);
        expect(subjectMarked(entry, true), who).toBe(false);
        expect(breathingMark(entry, { waiting: true, tried: true }), who).toBe('secondary');
        expect(hintOf(entry, true), who).toBe('Tap Schedule when you’re ready.');
        // a door may be taken early; Skip is on it; nothing is celebrated, before or after
        expect(deedReady(entry, false), who).toBe(true);
        expect(offersSkip(entry, placeOf(tour, 1)), who).toBe(true);
        expect(celebrates(entry.action), who).toBe(false);
        expect(entry.reward, who).toBeUndefined();
        expect(tryReward(entry, { via: 'write', first: true }), who).toBeUndefined();
      }
      // a sheet closing is the only try that waits for an opening first
      expect(opensFirst('page:Routine')).toBeNull();
      expect(opensFirst('log')).toBeNull();
      expect(opensFirst('shop:add')).toBeNull();
      expect(opensFirst('open:entry')).toBeNull();
    });

    /**
     * A TIMER STARTED ON CARD 1 IS STOPPED ON CARD 1 (the owner, 2026-09-28: *"if user started
     * something for step 1, make sure tutorial tells user to stop it too by holding the button and
     * save entry."*; and 2026-10-01: *"the text box is already step 2 of 6, fix it any time, when
     * it's still asking me to stop the timer module first. fix this, where if the timer still runs,
     * the box won't go to step 2 yet, but rather ask to stop, then go step 2 fix it anytime"*).
     * A start answers nothing: card 1 stays, marked on the stop, in the timer's words, and the
     * entry the stop saves is what answers it; card 2 never asks for a stop.
     */
    it('keeps card 1 on its timer until it is stopped and saved, marked on its stop, and card 2 never asks', () => {
      for (const [who, tour] of Object.entries(TOURS)) {
        const log = card(tour, 'log');
        expect(log.stopFirst, who).toEqual({
          anchor: TOUR_ANCHOR.timerStop,
          hint: 'Stop your timer to carry on: hold its button.',
          thenSave: 'Stop your timer to carry on: hold its button, then save.',
          title: 'Timer running',
          body: 'It stays at the top of Today until you stop it.',
        });
        // a start is the stop's first half, not the card's answer; the stop's save is
        expect(startsStop(log, 'log:timer'), who).toBe(true);
        expect(startsStop(log, 'log'), who).toBe(false);
        expect(satisfies(log.action!, 'log'), who).toBe(true);
        // "then save" only where there is a save: a pump's stop opens its sheet, every other
        // timer is saved by the hold itself
        expect(hintOf(asStopping(log, true), false), who).toBe(log.stopFirst?.thenSave);
        expect(asStopping(log, true).anchor, who).toBe(TOUR_ANCHOR.timerStop);
        const stopping = asStopping(log);
        // the stop is the mark, on Today, where the running card is
        expect(stopping.anchor, who).toBe(TOUR_ANCHOR.timerStop);
        expect(anchorHome(stopping), who).toBe('tab');
        expect(canSee(stopping, { tab: 'Today', pushed: 0 }), who).toBe(true);
        expect(tourScrolls(stopping), who).toBe(true);
        // outlined and breathing, the one thing to touch, and its words are the live line
        expect(subjectMarked(stopping, false), who).toBe(true);
        expect(awaitsControl(stopping, false), who).toBe(true);
        expect(breathingMark(stopping, { waiting: true }), who).toBe('subject');
        expect(hintOf(stopping, false), who).toBe(log.stopFirst?.hint);
        // it is still card 1, Step 1: the same id, deed, rewards, trial line and place, in the
        // timer's words, the same words its reward for a start always had
        expect(stopping.id, who).toBe('log');
        expect(placeOf(tour, tour.indexOf(log)).step, who).toBe(1);
        expect([stopping.title, stopping.body], who).toEqual([
          log.rewardTimer?.title,
          log.rewardTimer?.body,
        ]);
        expect(stopping.action, who).toEqual(log.action);
        expect(stopping.reward, who).toEqual(log.reward);
        expect(trialLabelOn(stopping), who).toBe(true);
        expect(celebrates(stopping.action), who).toBe(true);
        expect(restsNow(stopping, false), who).toBe(false);
        // the timer stopped and its entry written, the provider hands out the card itself again
        expect(log.anchor, who).toBe(TOUR_ANCHOR.logTiles);
        expect(hintOf(log, false), who).toBe('Tap any tile and save, or start a timer.');
        // …and card 2 is only ever about Today's log: a start is never heard there as a stop
        const entry = card(tour, 'entry');
        expect(entry.stopFirst, who).toBeUndefined();
        expect(startsStop(entry, 'log:timer'), who).toBe(false);
        expect(asStopping(entry), who).toBe(entry);
      }
      // held, not tapped, and saved: the words the owner asked for, short, with no dash of any kind.
      // "save" only in the pump's line, whose stop opens its sheet: every other timer is saved by
      // the hold, and a save it asked for would be a button that is not there
      const stop = card(WITH_STASH, 'log').stopFirst;
      for (const line of [stop?.hint ?? '', stop?.thenSave ?? '']) {
        expect(line).toMatch(/\bstop\b/i);
        expect(line).toMatch(/\bhold\b/);
        expect(line.length).toBeLessThanOrEqual(60);
        expect(line).not.toMatch(/[-‐‑‒–—―]/);
      }
      expect(stop?.hint).not.toMatch(/\bsave\b/);
      expect(stop?.thenSave).toMatch(/\bthen save\b/);
      // card 1 is the only card that asks for it, and every other card is left as it is
      expect(EVERY_STEP.filter(s => s.stopFirst !== undefined).map(s => s.id)).toEqual([
        'log',
        'log',
      ]);
      for (const s of EVERY_STEP) {
        if (s.stopFirst === undefined) expect(asStopping(s), s.id).toBe(s);
        // the tip after the tour still closes on a start: it asks for the last real one, however
        // it is logged, and no stop is asked for on it
        if (s.stopFirst === undefined) expect(startsStop(s, 'log:timer'), s.id).toBe(false);
      }
    });

    /**
     * NO UNDO ON THE STOP'S OWN SAVE (the owner, 2026-10-01: *"dont show the option to undo during
     * this period, so user doesnt accidentally undo it, then have nothing in today's log."*). Only the
     * save that ends the very timer card 1 is waiting on loses its Undo; any other save keeps it.
     */
    it('offers no Undo on the save that stops card 1’s timer, and keeps it on every other save', () => {
      // card 1 waiting on timer t1: its stop's save ends t1, and has no Undo
      expect(offersUndo('t1', ['t1'])).toBe(false);
      // a bottle logged meanwhile ends no timer; another timer stopped is the parent's own
      expect(offersUndo('t1', [])).toBe(true);
      expect(offersUndo('t1', ['t2'])).toBe(true);
      // no card waiting on a stop: every save keeps its Undo, the same timer stopped another day too
      expect(offersUndo(null, ['t1'])).toBe(true);
      expect(offersUndo(null, [])).toBe(true);
    });

    /**
     * SOMETHING REAL TO OPEN, ALWAYS: card 1's entry, the entry its timer writes once stopped, or —
     * when there is neither, a timer gone with no entry, say — a sample the tour writes as the card
     * arrives, which the card says it added (`trialEntry.ts`, `tourWrites.test.ts`).
     */
    it('puts up a sample entry when there is nothing to open, and says so in one line', () => {
      const entry = card(WITH_STASH, 'entry');
      expect(entry.sample).toBe('entry');
      expect(entry.prefilled).toBe('We added a sample entry so you can try it.');
      expect(entry.prefilled?.toLowerCase()).toContain(TRIAL_ENTRY_NOTE.toLowerCase());
      // the shopping card's sample is a supply; no other card puts anything up
      expect(card(WITH_STASH, 'shopping').sample).toBe('supply');
      expect(EVERY_STEP.filter(s => s.sample !== undefined).map(s => [s.id, s.sample])).toEqual([
        ['entry', 'entry'],
        ['shopping', 'supply'],
        ['entry', 'entry'],
        ['shopping', 'supply'],
      ]);
      // a line that says what the tour put up, only where it puts something up
      for (const s of EVERY_STEP)
        expect(s.prefilled !== undefined, s.id).toBe(s.sample !== undefined);
    });

    /** CARD 1'S REWARD SAYS WHERE THE ENTRY WENT, and leaves fixing it to the card that asks. */
    it('lets card 1’s reward say where the entry went, and step 2 say how it is fixed', () => {
      const log = card(WITH_STASH, 'log');
      expect(log.reward).toEqual({ title: 'Logged', body: 'It’s in Today’s log, further down.' });
      expect(log.reward?.body).not.toMatch(/edit|change|delete/);
      expect(card(WITH_STASH, 'entry').first?.hint).toMatch(/edit.*delete/);
    });

    /**
     * AN ENTRY TAKEN BACK WITH UNDO SENDS THE TOUR BACK TO CARD 1 (the owner, 2026-09-30: *"i was on
     * onboarding tour step 1, logged bottle, then click undo, it then goes to step 2"*): while card 1
     * is still up with its "well done", and while card 2 has not shown the entry yet. Once card 2's
     * thing has been tried, or the tour is further on, an Undo is only an Undo.
     */
    it('goes back to card 1 when its entry is undone before card 2 has shown it, and not after', () => {
      for (const [who, tour] of Object.entries(TOURS)) {
        const log = tour.findIndex(s => s.id === 'log');
        const entry = tour.findIndex(s => s.id === 'entry');
        expect([log, entry], who).toEqual([0, 1]);
        // on card 1 itself, its reward showing: it asks again where it stands
        expect(backForUndo(tour, log, log, false), who).toBe(log);
        // on card 2, before its entry was opened or swiped: back to card 1
        expect(backForUndo(tour, entry, log, false), who).toBe(log);
        // on card 2 once the entry has been shown: the lesson is learned, and the tour stays
        expect(backForUndo(tour, entry, log, true), who).toBeNull();
        // on any card after card 2, and for any card that is not a log card: nothing
        for (let at = entry + 1; at < tour.length; at += 1) {
          expect(backForUndo(tour, at, log, false), `${who} at ${at}`).toBeNull();
        }
        for (let answered = 1; answered < tour.length; answered += 1) {
          expect(backForUndo(tour, answered, answered, false), `${who} ${answered}`).toBeNull();
        }
        expect(backForUndo(tour, 0, -1, false), who).toBeNull();
      }
      // one short line saying why, in the tour's voice: no dash, and nothing about the baby
      expect(TOUR_UNDONE).toBe('Entry undone. Log one to carry on.');
      expect(TOUR_UNDONE.length).toBeLessThanOrEqual(60);
      expect(TOUR_UNDONE).not.toMatch(/[-‐‑‒–—―]/);
    });
  });

  /**
   * A CARD OVER THE THING IT IS POINTING AT IS THE ONE FAILURE THE PLACEMENT MAY NOT HAVE (the
   * owner, 2026-09-21: "the last tutorial tip: the text box is blocking the quick log modules").
   * Every card whose subject is the whole Log grid sits at the foot instead of beside it.
   */
  it('keeps a card off a subject that is most of the screen', () => {
    for (const s of TIP_STEPS) {
      if (s.anchor !== TOUR_ANCHOR.logTiles) continue;
      expect(s.place, s.id).toBe('foot');
    }
    // and the first card of the tour is NOT one of them: it is placed beside the tiles, which is
    // where there is room on a fresh Today, and moving it would be a change nobody asked for
    expect(TOUR_STEPS[0]?.place).toBeUndefined();
  });

  /**
   * ── THE CARD STANDS DOWN ────────────────────────────────────────────────────────────────────
   *
   * A card that has said its piece and is waiting for the parent to change tabs is a card sitting
   * over the page it just told them to look at (the owner, 2026-09-21: "it asks me to look
   * around, but the text box is blocking it. Minimize it when it's done with that specific page
   * tutorial and ready to go next, and do the radial breathing on the next module they're
   * supposed to click on when they are ready to move on").
   */
  it('stands down on every card with nothing left to wait for, and on no others', () => {
    const rests = [...WITH_STASH, ...TIP_STEPS].filter(restsWhenRead).map(s => s.id);
    // `shopping` LEFT them again later the same day: it waits on the Share button now, so it is
    // an instruction rather than a card to be read and put down — which is the rule the loop
    // below states in general. `entry` is a door since 2026-09-28, and rests as one once an entry
    // has been opened (`restsNow`, above)
    expect(rests).toEqual(['entry', 'schedule', 'stash']);
    expect(WITHOUT_STASH.filter(restsWhenRead).map(s => s.id)).toEqual(['entry', 'schedule']);
    // nothing that waits on a DEED stands down: those cards are the instruction
    for (const s of EVERY_STEP) {
      if (s.action?.kind === 'log' || s.action?.kind === 'share') {
        expect(restsWhenRead(s), s.id).toBe(false);
      }
    }
    // THE CLOSING CARD NEVER SHRINKS: it points at nothing, it carries the confetti and Done,
    // and a finale that turns into a bar is not a finale
    const end = TOUR_STEPS.find(s => s.id === 'end') as TourStep;
    expect(end.anchor).toBeNull();
    expect(restsWhenRead(end)).toBe(false);
    // AND NEITHER DOES A TIP: one card, one button, and resting would put its only control
    // behind a tap to reopen
    for (const s of TIP_STEPS) expect(restsWhenRead(s), s.id).toBe(false);
    // long enough to read two short sentences, short enough not to be a wait
    expect(TOUR_REST_MS).toBeGreaterThanOrEqual(3000);
    expect(TOUR_REST_MS).toBeLessThanOrEqual(8000);
    // AND LONGER AFTER AN ARRIVAL (the owner, 2026-09-25: "after opening manage from step 4, the
    // text box closes / minimizes wayy too soon, make sure it stays unminimized for a few more
    // seconds"): a card that has come with the parent to Manage has something new to say there
    expect(TOUR_HOLD_MS).toBeGreaterThan(TOUR_REST_MS);
    expect(TOUR_HOLD_MS).toBeGreaterThanOrEqual(6000);
    expect(TOUR_HOLD_MS).toBeLessThanOrEqual(8000);
  });

  /**
   * AND EXACTLY ONE MARK MOVES. Two things pulsing on one screen is two things happening rather
   * than one thing being pointed at, so the breath is handed from the subject to the tab cell as
   * the card stands down, and the other mark is drawn holding still.
   */
  it('breathes on the subject while the card is read, and on the tab once it has stood down', () => {
    // the door to Schedule is card 2's since 2026-09-28, when "What's coming" went
    const entry = card(WITH_STASH, 'entry');
    // THE TAB CELL, FOR AS LONG AS THE CARD IS ASKING FOR IT (the owner, 2026-09-22: "after step
    // 3, when it asks tap schedule to follow along. Make the radial breathing on the schedule
    // button"). It used to wait for the card to rest first, so for the five seconds that matter
    // the breath was on the thing already being described rather than on the thing to touch.
    // Since 2026-09-24 the card asks for its thing first, and the tab from the moment it is tried
    expect(breathingMark(entry, { waiting: true, rested: false, tried: true })).toBe('secondary');
    expect(breathingMark(entry, { waiting: true, rested: true, tried: true })).toBe('secondary');
    // …and before that, the log is the thing to touch, whether the card has rested or not
    expect(breathingMark(entry, { waiting: true, rested: false })).toBe('subject');
    expect(breathingMark(entry, { waiting: true, rested: true })).toBe('subject');
    // a door with nothing to try first asks for its tab from the first frame, as before — no card
    // of the tour is one since the stash card asks for milk (2026-09-25), so it is built here
    const { first: _first, ...noTry } = card(TOUR_STEPS, 'stash');
    void _first;
    const [bare] = withDoors([noTry, card(TOUR_STEPS, 'shopping')]);
    expect(bare?.secondary).toBe(TOUR_ANCHOR.tabShopping);
    expect(breathingMark(bare as TourStep, { waiting: true })).toBe('secondary');
    // answered, so it points nowhere in particular any more
    expect(breathingMark(entry, { waiting: false, rested: false })).toBe('subject');
    // answered: there is nothing to tap next, so the subject keeps it
    expect(breathingMark(entry, { waiting: false, rested: true })).toBe('subject');
    // a card with no subject at all hands it straight over
    const end = TOUR_STEPS[TOUR_STEPS.length - 1] as TourStep;
    expect(breathingMark(end, { waiting: false, rested: false })).toBe('none');
    // a tip has neither an action nor a second mark: its own control, always
    const tip = TIP_STEPS.find(s => s.id === 'tip.settings') as TourStep;
    expect(breathingMark(tip, { waiting: false, rested: false })).toBe('subject');
  });

  /**
   * A TRIED DOOR WAITS FOR NOTHING ON ITS PAGE (the owner, 2026-09-28: *"tutorial tour, after step 2
   * completed (editing log), it auto opens the schedule page"*). A card waits for its control to be
   * measured before it is drawn, and passes on without it when it never comes; a door whose thing
   * has been tried marks the tab cell instead, so its control going away (an entry deleted from an
   * otherwise empty log) is no reason for the tour to move on, and open the next tab, by itself.
   */
  it('waits for a control only while it marks one, so a tried door never passes on by itself', () => {
    for (const [who, tour] of Object.entries(TOURS)) {
      for (const s of tour) {
        for (const tried of [false, true]) {
          expect(awaitsControl(s, tried), `${who}: ${s.id} ${String(tried)}`).toBe(
            s.anchor !== null && subjectMarked(s, tried),
          );
        }
      }
      // card 2: its log until an entry has been opened, then nothing
      const entry = card(tour, 'entry');
      expect(awaitsControl(entry, false), who).toBe(true);
      expect(awaitsControl(entry, true), who).toBe(false);
      // card 1's timer's stop, while that is its mark, the same way (2026-10-01; card 2's until then)
      expect(awaitsControl(asStopping(card(tour, 'log')), false), who).toBe(true);
      // Manage's card the same, back on Schedule from Manage
      expect(awaitsControl(card(tour, 'schedule'), true), who).toBe(false);
      // the shopping card marks Add supplies, then Share: it waits for each in turn
      expect(awaitsControl(card(tour, 'shopping'), false), who).toBe(true);
      expect(awaitsControl(card(tour, 'shopping'), true), who).toBe(true);
      // and the closing card points at nothing, so it never waits
      expect(awaitsControl(card(tour, 'end'), false), who).toBe(false);
    }
    expect(awaitsControl(card(WITH_STASH, 'stash'), true)).toBe(false);
    // a tip always marks its control
    for (const s of TIP_STEPS) expect(awaitsControl(s, false), s.id).toBe(true);
  });

  /**
   * AND A CARD ALREADY SEEN WITH ITS CONTROL IS NEVER HIDDEN FOR IT AGAIN (the owner, 2026-09-30:
   * *"it then brought me to step 3, schedule, where i decided to go back to today page to check, and
   * then went to schedule again, but the tour box is now gone"*). The wait, and the grace that passes
   * a card over, are for a card arriving: a control measured anew as its page comes back to the front
   * is not a control that never came, and the card stays on the screen while it is.
   */
  it('hides a card only while it first waits for its control, never once it has been seen with it', () => {
    for (const [who, tour] of Object.entries(TOURS)) {
      for (const s of [...tour, ...tour.map(t => asStopping(t))]) {
        for (const tried of [false, true]) {
          const where = `${who}: ${s.id}@${String(s.anchor)} ${String(tried)}`;
          expect(hidesForControl(s, { tried, seen: false }), where).toBe(awaitsControl(s, tried));
          expect(hidesForControl(s, { tried, seen: true }), where).toBe(false);
        }
      }
    }
    for (const s of TIP_STEPS) expect(hidesForControl(s, { tried: false, seen: true })).toBe(false);
  });

  it('carries a hint on every card that waits, so the instruction is words as well as a mark', () => {
    for (const s of EVERY_STEP) {
      if (s.action === undefined) continue;
      expect(s.hint, s.id).toBeTruthy();
    }
  });

  /**
   * SOMETHING TO TRY, THEN THE DOOR (the owner, 2026-09-24): "What's coming" asked for a row of Up
   * next to be logged or skipped, and "Your whole day" for Routine to be opened, before either
   * pointed at its tab: *"after step 3 is done, you need to radial highlight the schedule page"*,
   * and *"the look around, then tap stash needs to remove, until user clicks the highlighted
   * routine button"*. Card 2 asks for an entry to be opened in its place since 2026-09-28.
   */
  it('asks for an entry opened, for Manage, or for milk, before it points at the next tab', () => {
    const tries = WITH_STASH.filter(s => s.first !== undefined);
    expect(tries.map(s => [s.id, s.first?.event])).toEqual([
      ['entry', 'close:entry'],
      ['schedule', 'page:Routine'],
      // the stash card since 2026-09-25: the Add milk sheet's save is a committed write, which
      // the write funnel reports as `log` (`useWriteContext.announce`)
      ['stash', 'log'],
      // and the shopping card, the same day: a line on the list, then SHARE rather than a tab —
      // the one card whose second half is a deed; its own test is below
      ['shopping', 'shop:add'],
    ]);
    expect(
      WITHOUT_STASH.filter(s => s.first !== undefined).map(s => [s.id, s.first?.event]),
    ).toEqual([
      ['entry', 'close:entry'],
      ['schedule', 'page:Routine'],
      ['shopping', 'shop:add'],
    ]);
    const doors = [...tries, ...WITHOUT_STASH.filter(x => x.first !== undefined)].filter(
      s => s.action?.kind === 'tab',
    );
    expect([...new Set(doors.map(s => s.id))]).toEqual(['entry', 'schedule', 'stash']);
    for (const s of doors) {
      // only ever in front of a door: the thing to try is on this page, the tab is the way on
      expect(s.action?.kind, s.id).toBe('tab');
      const door = s.action?.kind === 'tab' ? s.action.tab : '';
      // until it is tried: the control alone, named, and no word of the tab
      expect(doorOpen(s, false), s.id).toBe(false);
      expect(subjectMarked(s, false), s.id).toBe(true);
      expect(breathingMark(s, { waiting: true }), s.id).toBe('subject');
      expect(hintOf(s, false), s.id).toBe(s.first?.hint);
      expect(hintOf(s, false), s.id).not.toContain(door);
      // once it is: the control's outline goes, the tab breathes, and the hint names the tab
      expect(doorOpen(s, true), s.id).toBe(true);
      expect(subjectMarked(s, true), s.id).toBe(false);
      expect(breathingMark(s, { waiting: true, tried: true }), s.id).toBe('secondary');
      expect(hintOf(s, true), s.id).toBe(s.hint);
      expect(hintOf(s, true), s.id).toContain(door);
    }
    expect(card(TOUR_STEPS, 'entry').first?.hint).toMatch(/entry/);
    expect(card(TOUR_STEPS, 'schedule').first?.hint).toMatch(/Manage/);
    expect(card(TOUR_STEPS, 'stash').first?.hint).toMatch(/Add milk/);
    // every other card is as it was: its door, if it has one, is open from the first frame
    for (const s of EVERY_STEP.filter(x => x.first === undefined)) {
      expect(doorOpen(s, false), s.id).toBe(true);
      expect(subjectMarked(s, false), s.id).toBe(true);
      expect(hintOf(s, false), s.id).toBe(s.hint);
    }
  });

  /**
   * STEP 5 IS FINISHED BY ADDING MILK (the owner, 2026-09-25: *"i added milk, but it is still
   * breathing on the "add milk +" button. Trial logging milk should 'complete' step 5, and go on
   * to step 6 when they are ready"*). Before the milk: Add milk alone, outlined and breathing, and
   * no word of Shopping. After it: the outline gone, the Shopping cell breathing, and the card
   * saying so — still Step 4 of 6 (the owner's step 5) until the parent taps Shopping.
   */
  it('stops breathing on Add milk once milk is saved, and hands over to Shopping', () => {
    const stash = card(WITH_STASH, 'stash');
    // the event is the one every committed sheet write reports, the Add milk sheet's included
    expect(stash.first?.event).toBe(actionKey({ kind: 'log' }));
    // before
    expect(subjectMarked(stash, false)).toBe(true);
    expect(breathingMark(stash, { waiting: true, tried: false })).toBe('subject');
    expect(hintOf(stash, false)).toBe('Tap Add milk and save some.');
    // after
    expect(subjectMarked(stash, true)).toBe(false);
    expect(breathingMark(stash, { waiting: true, tried: true })).toBe('secondary');
    expect(stash.secondary).toBe(TOUR_ANCHOR.tabShopping);
    expect(hintOf(stash, true)).toBe('Tap Shopping when you’re ready.');
    // the milk does not move the tour on by itself: the card waits for the tab, as every door does
    expect(stash.action).toEqual({ kind: 'tab', tab: 'Shopping' });
    expect(satisfies(stash.action!, 'log')).toBe(false);
    expect(satisfies(stash.action!, 'tab:Shopping')).toBe(true);
    // and the count stays honest: the stash card is step 4 of 6, Shopping 5 of 6 (one fewer each
    // since "What's coming" went, 2026-09-28)
    expect(placeOf(WITH_STASH, WITH_STASH.indexOf(stash))).toEqual({ step: 4, steps: 6 });
    expect(placeOf(WITH_STASH, WITH_STASH.indexOf(card(WITH_STASH, 'shopping')))).toEqual({
      step: 5,
      steps: 6,
    });
    expect(placeOf(WITHOUT_STASH, WITHOUT_STASH.indexOf(card(WITHOUT_STASH, 'shopping')))).toEqual({
      step: 4,
      steps: 5,
    });
  });

  /**
   * STEP 6: SOMETHING ON THE LIST, THEN SHARE (the owner, 2026-09-25: *"Step 6, before user shares,
   * they first need to add the supplies to the shopping cart"*). One card in two halves, whose
   * second half is a deed on the same page — so the thing to try has a control of its own, and the
   * deed waits for it.
   */
  it('asks for a line on the list before Share, marking Add supplies and then Share', () => {
    for (const [who, tour] of Object.entries(TOURS)) {
      const shopping = card(tour, 'shopping');
      expect(shopping.first, who).toEqual({
        event: 'shop:add',
        hint: 'Tap Add item and put one on the list.',
        anchor: TOUR_ANCHOR.shopAdd,
        page: 'Supplies',
      });
      expect(shopping.action, who).toEqual({ kind: 'share' });
      // no tab is marked in either half: the second half is on this page, not behind a door
      expect(shopping.secondary, who).toBeUndefined();

      // BEFORE: Add supplies is the mark — outlined, breathing — and the line names it
      const before = asMarked(shopping, false);
      expect(before.anchor, who).toBe(TOUR_ANCHOR.shopAdd);
      expect(anchorHome(before), who).toBe('tab');
      expect(canSee(before, { tab: 'Shopping', pushed: 0 }), who).toBe(true);
      expect(subjectMarked(before, false), who).toBe(true);
      expect(breathingMark(before, { waiting: true, tried: false }), who).toBe('subject');
      expect(hintOf(shopping, false), who).toBe('Tap Add item and put one on the list.');
      // …and Share does not answer it yet: sending an empty list is what the card was changed to stop
      expect(deedReady(shopping, false), who).toBe(false);
      // …unless the list has something on it to send, the tour's sample lines included (2026-09-28)
      expect(deedReady(shopping, false, true), who).toBe(true);

      // AFTER: Share is the mark, still outlined, the line says to tap it, and it answers the card
      const after = asMarked(shopping, true);
      expect(after, who).toBe(shopping);
      expect(after.anchor, who).toBe(TOUR_ANCHOR.shopShare);
      expect(subjectMarked(after, true), who).toBe(true);
      expect(breathingMark(after, { waiting: true, tried: true }), who).toBe('subject');
      expect(hintOf(shopping, true), who).toBe('Tap Share.');
      expect(deedReady(shopping, true), who).toBe(true);
      expect(satisfies(shopping.action!, 'share'), who).toBe(true);
      // …and the card comes back full size with that instruction if it had been put down
      expect(backWhenTried(shopping), who).toBe(true);
    }
    // still one card: Step 5 of 6, 4 of 5 without a stash (the test above), and the last before the end
    expect(ids(WITH_STASH).slice(-2)).toEqual(['shopping', 'end']);
    // a line on the list is heard from the list itself, never as a saved entry
    expect(card(TOUR_STEPS, 'shopping').first?.event).not.toBe(actionKey({ kind: 'log' }));
  });

  /**
   * SHARE IS OPTIONAL (the owner, 2026-09-28: *"Tour changes: Share becomes optional"*). The card
   * still asks for Share, and Share still answers it; beside it Next is live and a line says so
   * (`optional`; when it is shown is `passesDeed`, walked in `line.test.ts`). The line on the list
   * is still asked for first, and it is still the card's trial entry.
   */
  it('makes Share optional once a line is on the list, and keeps everything else about the card', () => {
    for (const [who, tour] of Object.entries(TOURS)) {
      const shopping = card(tour, 'shopping');
      expect(shopping.optional, who).toBe('Not sending it now? Tap Next to go on.');
      expect(shopping.optional, who).toContain(`Tap ${TOUR_LABELS.next}`);
      expect(shopping.optional, who).not.toMatch(/\bSkip\b/);
      // Share still answers the card, once a line is on the list, exactly as before
      expect(shopping.action, who).toEqual({ kind: 'share' });
      expect(deedReady(shopping, false), who).toBe(false);
      expect(deedReady(shopping, true), who).toBe(true);
      expect(shopping.hint, who).toBe('Tap Share.');
      // and the line on the list is still the trial entry the card says it is
      expect(trialLabelOn(shopping), who).toBe(true);
    }
    // no other card, and no tip, has an optional deed
    expect(EVERY_STEP.filter(s => s.optional !== undefined).map(s => s.id)).toEqual([
      'shopping',
      'shopping',
    ]);
  });

  /**
   * THE SAMPLES, SAID ONCE AND PLAINLY: a household with nothing in its catalog gets one sample to
   * put on the list (the owner: *"then we use trial entry (let them know)"*), and since 2026-09-28 a
   * list with nothing still to buy gets two sample lines on it (the owner: *"Make sure you have trial
   * items in case if user didnt fill it in, so they can share it if they want to."*). One line on the
   * card says it for both, by the word every one of them carries, and the trial line says they go
   * when the tour ends.
   */
  it('says in one line that it added samples, by the word the catalog and the list show them under', () => {
    const shopping = card(WITH_STASH, 'shopping');
    expect(shopping.prefilled).toBe('We added sample items so you can try it.');
    expect(shopping.prefilled?.toLowerCase()).toContain(TRIAL_SUPPLY.product?.toLowerCase());
    for (const line of TRIAL_LINES) expect(line, line).toMatch(/^Sample /);
    expect(trialLabelOn(shopping)).toBe(true);
    expect(TOUR_TRIAL).toMatch(/tour ends/);
    // …and Share may answer it with only the samples on the list; nothing else changes about it
    expect(deedReady(shopping, false, true)).toBe(true);
    expect(hintOf(shopping, false)).toBe('Tap Add item and put one on the list.');
    // a list with something on it is the shopping card's business alone: no other deed reads it
    for (const s of EVERY_STEP) {
      if (s.action?.kind === 'share') continue;
      expect(deedReady(s, false, true), s.id).toBe(deedReady(s, false));
    }
  });

  it('keeps every other card as it was: one mark, a door that may be taken early', () => {
    for (const s of EVERY_STEP) {
      if (s.id === 'shopping') continue;
      expect(asMarked(s, false), s.id).toBe(s);
      expect(asMarked(s, true), s.id).toBe(s);
      expect(backWhenTried(s), s.id).toBe(false);
      // a door answers before its thing is tried, and a card with nothing to try answers at once
      expect(deedReady(s, false), s.id).toBe(true);
    }
  });

  /**
   * THE CARD STANDS ASIDE ON THE PAGE ITS THING IS TRIED ON (the owner, 2026-09-25: *"in the add
   * supplies page, the tour text box does not minimize and it blocking most of the part"*) — the
   * Supplies page, until something is on the list. Manage is not such a page: there the card is
   * held open, because it has something new to say (`TOUR_HOLD_MS`).
   */
  it('stands aside on the Supplies page until something is on the list, and nowhere else', () => {
    const shopping = card(WITH_STASH, 'shopping');
    expect(standsAside(shopping, { tried: false, page: 'Supplies' })).toBe(true);
    expect(standsAside(shopping, { tried: true, page: 'Supplies' })).toBe(false);
    expect(standsAside(shopping, { tried: false, page: null })).toBe(false);
    expect(standsAside(shopping, { tried: false, page: 'Family' })).toBe(false);
    for (const s of EVERY_STEP) {
      if (s.id === 'shopping') continue;
      for (const page of ['Supplies', 'Routine', null]) {
        expect(standsAside(s, { tried: false, page }), `${s.id} on ${String(page)}`).toBe(false);
      }
    }
  });

  /**
   * NO SKIP ON THE LAST CARD (the owner, 2026-09-25: *"remove the option to skip tour after step 6,
   * as that is the final step."*). It ends with its own Done; every card before it keeps Skip.
   */
  it('offers Skip on every card of the tour but the last, and never on a tip', () => {
    for (const [who, tour] of Object.entries(TOURS)) {
      tour.forEach((s, i) => {
        expect(offersSkip(s, placeOf(tour, i)), `${who}: ${s.id}`).toBe(i < tour.length - 1);
      });
      expect(tour[tour.length - 1]?.id, who).toBe('end');
    }
    expect(offersSkip(card(WITH_STASH, 'shopping'), { step: 5, steps: 6 })).toBe(true);
    expect(offersSkip(card(WITH_STASH, 'end'), { step: 6, steps: 6 })).toBe(false);
    // a tip is seen with × or Got it, never skipped
    for (const s of TIP_STEPS) {
      expect(offersSkip(s, { step: 1, steps: 1 }), s.id).toBe(false);
      expect(offersSkip(s, { step: 1, steps: 2 }), s.id).toBe(false);
    }
  });

  /**
   * THE COUNT IS CARDS, and the ask card says the same number. "Five pages" to a household
   * that got four was the old tour's first sentence being wrong (docs/TOUR_SCRIPT.md §A).
   */
  it('numbers the cards 1 to 6 (1 to 5 without a stash), and the ask card promises no number', () => {
    expect(placeOf(tourFor(ALL), 0)).toEqual({ step: 1, steps: 6 });
    expect(placeOf(tourFor(ALL), 5)).toEqual({ step: 6, steps: 6 });
    expect(placeOf(tourFor(NO_STASH), 4)).toEqual({ step: 5, steps: 5 });
    expect(placeOf(tourFor(ALL), 99)).toEqual({ step: 6, steps: 6 });
    expect(placeOf([], 0)).toEqual({ step: 0, steps: 0 });
    // "five pages" to a household that got four was the old tour's first sentence being wrong
    expect(TOUR_ASK.body).toMatch(/^A few short cards/);
    expect(TOUR_ASK.body).not.toMatch(/\b(five|six|seven)\b/i);
  });

  /**
   * ABOUT 3 MINUTES (the owner, 2026-09-28: *"Tour changes: … it says 'about 3 minutes'"*). Six
   * cards, five of them done rather than read, take a new parent about three minutes; the ask said
   * "about a minute", and nothing the tour or Help says may promise that again.
   */
  it('says the tour takes about 3 minutes, and promises a minute nowhere', () => {
    expect(TOUR_ASK.body).toBe(
      'A few short cards, about 3 minutes. Anything you log is a trial entry, cleared when the tour ends.',
    );
    const said = [
      ...Object.values(TOUR_ASK),
      ...EVERY_STEP.flatMap(s => [s.title, s.body, s.hint ?? '', s.first?.hint ?? '']),
      ...GUIDES.flatMap(g => [g.title, g.detail]),
      TOUR_RESUME.title,
      TOUR_RESUME.body({ step: 3, steps: 6 }),
      TOUR_RESUME.later,
    ];
    for (const text of said) expect(text, text).not.toMatch(/\b(a|one) minute\b/i);
  });

  /**
   * THE CARD THAT ASKS BEFORE A TOUR PICKS UP AGAIN (the owner, 2026-09-28: *"it asks before
   * resuming"*): where it stopped, in the count the tour shows; what ending it does; that it can be
   * started again; and two answers. When it asks is `opening.ts`.
   */
  it('asks whether to continue from the step it stopped on, or end it and clear its trial entries', () => {
    expect(TOUR_RESUME.title).toBe('Continue the tour?');
    expect(TOUR_RESUME.body({ step: 3, steps: 6 })).toBe(
      'You stopped at step 3 of 6. Ending it clears its trial entries.',
    );
    // the same number the card's own count will show when it carries on ("Step 3 of 6")
    const place = placeOf(WITH_STASH, 2);
    expect(TOUR_RESUME.body(place)).toContain(
      TOUR_LABELS.stepOf(place.step, place.steps).toLowerCase(),
    );
    // the promise the ask made, kept in its words: trial entries, cleared
    expect(TOUR_RESUME.body(place)).toContain('trial entries');
    expect(TOUR_ASK.body).toContain('trial entry');
    // ended, it is not gone: Help starts it again
    expect(TOUR_RESUME.later).toContain('More → Help & tour');
    expect(TOUR_RESUME.resume).toBe('Continue');
    expect(TOUR_RESUME.end).toBe('End tour');
    // short, like the ask: a title, two sentences, one line under them
    expect(TOUR_RESUME.title.length).toBeLessThanOrEqual(30);
    expect(TOUR_RESUME.body({ step: 10, steps: 10 }).length).toBeLessThanOrEqual(125);
    expect(TOUR_RESUME.later.length).toBeLessThanOrEqual(60);
    // and it never says Skip, which is a card's control, not this card's
    for (const text of Object.values(TOUR_RESUME).filter(v => typeof v === 'string')) {
      expect(text, text).not.toMatch(/\bSkip\b/);
    }
    // every line of a card that asks ends in its own mark: a screen reader is read the three joined
    // as they stand (the overlay's label), so none may run into the next or need a stop added
    for (const line of [
      TOUR_ASK.title,
      TOUR_ASK.body,
      TOUR_ASK.later,
      TOUR_RESUME.title,
      TOUR_RESUME.body(place),
      TOUR_RESUME.later,
    ]) {
      expect(line, line).toMatch(/[.?!]$/);
    }
  });

  it('walks Today, Schedule, Stash and Shopping in the bar’s own order', () => {
    const tabs = tourFor(ALL)
      .map(s => s.tab)
      .filter((t, i, all) => all.indexOf(t) === i);
    expect(tabs).toEqual(['Today', 'Schedule', 'Stash', 'Shopping']);
    const noStash = tourFor(NO_STASH)
      .map(s => s.tab)
      .filter((t, i, all) => all.indexOf(t) === i);
    expect(noStash).toEqual(['Today', 'Schedule', 'Shopping']);
  });

  it('dots the cell of the tab each door leads to, and nothing else has a second mark', () => {
    const withSecond = WITH_STASH.filter(s => s.secondary !== undefined);
    // card 2 dots Schedule since 2026-09-28, the dot "What's coming" had
    expect(withSecond.map(s => [s.id, s.secondary])).toEqual([
      ['entry', TOUR_ANCHOR.tabSchedule],
      ['schedule', TOUR_ANCHOR.tabStash],
      ['stash', TOUR_ANCHOR.tabShopping],
    ]);
    // the same Manage card, read against a household with no stash, dots Shopping instead
    expect(
      WITHOUT_STASH.filter(s => s.secondary !== undefined).map(s => [s.id, s.secondary]),
    ).toEqual([
      ['entry', TOUR_ANCHOR.tabSchedule],
      ['schedule', TOUR_ANCHOR.tabShopping],
    ]);
    // the dot is on the cell the hint names
    for (const s of withSecond) {
      expect(s.action?.kind, s.id).toBe('tab');
      if (s.action?.kind === 'tab') expect(s.hint, s.id).toContain(s.action.tab);
    }
    // a second mark is always a tab cell: it is the dot, and the dot is the bar's
    for (const s of EVERY_STEP) if (s.secondary) expect(homeOf(s.secondary)).toBe('bar');
  });

  it('points at nothing only where a whole page is the subject: the closing card', () => {
    expect(TOUR_STEPS[TOUR_STEPS.length - 1]?.anchor).toBeNull();
    expect([...new Set(EVERY_STEP.filter(s => s.anchor === null).map(s => s.id))]).toEqual(['end']);
    expect(TOUR_STEPS[TOUR_STEPS.length - 1]?.body).toContain('cleared when you tap Done');
  });

  it('resumes where it was left, and starts over rather than crashing on an id it does not know', () => {
    expect(resumeAt(TOUR_STEPS, null)).toBe(0);
    expect(resumeAt(TOUR_STEPS, 'schedule')).toBe(2);
    expect(resumeAt(TOUR_STEPS, 'colors')).toBe(0);
  });

  /**
   * A LOG IS A LOG HOWEVER IT WAS MADE. The sleep, pump and breastfeed tiles start a timer
   * rather than saving a row, and the old tour sat forever for those households (the owner's
   * phone, 2026-09-18). The card hears either; a start is the first half of its entry since
   * 2026-10-01 (`startsStop`), and its reward for a start stays TRUE of a timer, for the one start
   * that still answers it: one whose stop never comes up on Today.
   */
  it('hears a saved entry or a started timer on the log card, with a reward that fits each', () => {
    const log = TOUR_STEPS[0] as TourStep;
    expect(satisfies(log.action!, 'log')).toBe(true);
    expect(satisfies(log.action!, 'log:timer')).toBe(true);
    expect(satisfies(log.action!, 'tab:Today')).toBe(false);
    // …and a start asks for its stop before anything is answered
    expect(startsStop(log, 'log:timer')).toBe(true);
    // where the entry went: Today's log, further down, which the next card brings into view
    expect(log.reward?.body).toContain('Today’s log');
    expect(log.rewardTimer?.body).toContain('top of Today');
    expect(celebrates(log.action)).toBe(true);
  });

  /**
   * NO CARD'S DEED IS A SHEET ANY MORE (2026-09-28). "Open your entry, then close it" was card 2's
   * deed, and the + grid's before it; it is card 2's thing to try now, before its door to Schedule,
   * and the rule that a sheet must OPEN while the card is live before its close counts came with it
   * (`opensFirst`, and the provider's wiring in `tour.test.ts`). A tab is never celebrated.
   */
  it('hears card 2’s entry on its sheet closing, as a thing to try, and celebrates neither that nor a tab', () => {
    const entry = TOUR_STEPS[1] as TourStep;
    expect(entry.first?.event).toBe('close:entry');
    expect(opensFirst(entry.first?.event ?? '')).toBe('open:entry');
    // no card's deed is a sheet: every deed is a log, a tab or Share
    for (const s of EVERY_STEP) {
      expect([undefined, 'log', 'tab', 'share'], s.id).toContain(s.action?.kind);
    }
    expect(celebrates({ kind: 'tab', tab: 'Schedule' })).toBe(false);
    expect(actionKey({ kind: 'tab', tab: 'Schedule' })).toBe('tab:Schedule');
    expect(actionKey({ kind: 'log' })).toBe('log');
    expect(actionKey({ kind: 'share' })).toBe('share');
  });

  /**
   * A THING TRIED WITH AN ENTRY CAN BE CELEBRATED BEFORE THE TAB CELL BREATHES (the owner,
   * 2026-09-26: *"after completing step two (schedule), there is no congratulations on your first
   * trial entry or anything, and just goes straight to flashing schedule on the bottom"*). It was
   * "What's coming"'s row of Up next; no card carries a reward for its try since that card went
   * (2026-09-28), so the rule is walked on one made for it, to be there for the next one that does.
   * The words are true whichever way the thing was answered: "first" only for the run's first
   * entry, a timer's own words for a started timer — and nothing at all for a card without one.
   */
  it('celebrates a thing tried with an entry before its door, in words that stay true, on a card that asks for it', () => {
    const stash = card(WITH_STASH, 'stash');
    const cheered: TourStep = {
      ...stash,
      first: {
        event: 'log',
        hint: 'Tap Add milk and save some.',
        reward: { title: 'Nice, that’s saved', body: 'The milk is in, and the stash says so.' },
        rewardTimer: {
          title: 'Timer running',
          body: 'It stays at the top of Today until you stop it.',
        },
      },
    };
    // the run's first entry says so, and any later one does not claim to be first
    expect(tryReward(cheered, { via: 'write', first: true })?.title).toBe(TOUR_FIRST_ENTRY);
    const later = tryReward(cheered, { via: 'write', first: false });
    expect(later?.title).not.toContain('first');
    expect(later?.body).toBe(cheered.first?.reward?.body);
    expect(tryReward(cheered, { via: 'write', first: true })?.body).toBe(later?.body);
    // a timer has logged nothing yet, and says what it has done
    const timer = tryReward(cheered, { via: 'timer', first: true });
    expect(timer?.title).not.toContain('entry');
    expect(timer?.body).toContain('top of Today');
    // …and the door it hands over to is its own, as ever
    expect(cheered.action).toEqual({ kind: 'tab', tab: 'Shopping' });
    // NO CARD OF THE TOUR PAUSES ON ITS TRY: every try opens its door at once
    expect(EVERY_STEP.filter(s => s.first?.reward !== undefined).map(s => s.id)).toEqual([]);
    for (const s of EVERY_STEP) {
      expect(tryReward(s, { via: 'write', first: true }), s.id).toBeUndefined();
    }
  });

  it('holds every mark still while a card celebrates, and hands the breath on once it is done', () => {
    const entry = card(WITH_STASH, 'entry');
    // a reward up: the door is not open yet and nothing breathes, tried or not
    expect(breathingMark(entry, { waiting: true, tried: false, cheering: true })).toBe('none');
    expect(breathingMark(entry, { waiting: true, tried: true, cheering: true })).toBe('none');
    // …then the Schedule cell, exactly as a card that was never celebrated
    expect(breathingMark(entry, { waiting: true, tried: true })).toBe('secondary');
    // and a deed's own "well done" holds the subject still too
    expect(breathingMark(TOUR_STEPS[0] as TourStep, { waiting: false, cheering: true })).toBe(
      'none',
    );
  });
});

describe('the tips: one card each, on the page it is about', () => {
  it('has one card per guide, and a guide per card', () => {
    // nine until the guides audit of 2026-09-26 added the Log's Edit, the Activity log's search,
    // the day wheel, the baby's name and the account behind your initial; twelve on 2026-09-27,
    // when the second tip about your initial and the running timer's went; eleven on 2026-09-28,
    // when Baby care's went; and three later that day, when the owner decided every tip
    expect(TIP_GUIDES).toHaveLength(3);
    expect([...TIP_GUIDES]).toEqual(['first', 'babies', 'settings']);
    for (const id of TIP_GUIDES) {
      expect(
        TIP_STEPS.filter(s => s.guide === id),
        id,
      ).toHaveLength(1);
      expect(
        GUIDES.filter(g => g.id === id),
        id,
      ).toHaveLength(1);
      expect(guideOf(id)?.id).toBe(id);
    }
    expect(TIP_STEPS).toHaveLength(3);
    expect(guideOf('main')).toBeNull();
    expect(guideOf('nonsense')).toBeNull();
  });

  /**
   * EIGHT TIPS WENT WHEN THE OWNER DECIDED EVERY TIP (2026-09-28), each for the reason given with it:
   * no guide, no card, no Help row, and nothing on the screen reported for them. Only the one-card
   * tips went: the tour's own cards, which share titles with two of them, are all still there.
   */
  it('has none of the eight tips the owner took out, and the tour’s own cards are untouched', () => {
    const gone: readonly [string, string, RegExp][] = [
      ['tiles', 'tip.tiles', /Your tiles/],
      ['entries', 'tip.entries', /Find or fix/],
      ['schedule', 'tip.schedule', /Every rhythm, one page/],
      ['wheel', 'tip.wheel', /wheel/i],
      ['stash', 'tip.stash', /Where stored milk lives/],
      ['shopping', 'tip.shopping', /The list you send/],
      ['reports', 'tip.reports', /added up/],
      ['colors', 'tip.colors', /Amber and red/],
    ];
    const on: TourLive = { manyChildren: true };
    for (const [guide, cardId, title] of gone) {
      expect(TIP_GUIDES as readonly string[], guide).not.toContain(guide);
      expect(guideOf(guide), guide).toBeNull();
      expect(guideSteps(guide as never, ALL), guide).toEqual([]);
      expect(TIP_STEPS.some(s => s.id === cardId || String(s.guide) === guide)).toBe(false);
      for (const s of TIP_STEPS) expect(s.title, `${guide} in ${s.id}`).not.toMatch(title);
      expect(
        guidesFor(ALL, on).some(g => String(g.id) === guide),
        guide,
      ).toBe(false);
    }
    // the marks only they used went with them, and so did the page home the two page tips stood on
    for (const key of ['reportsRange', 'logEdit', 'logSearch', 'routineWheel'])
      expect(Object.keys(TOUR_ANCHOR), key).not.toContain(key);
    for (const id of [
      'tour.reports.range',
      'tour.log.edit',
      'tour.log.search',
      'tour.routine.wheel',
    ])
      expect(Object.values(TOUR_ANCHOR) as string[], id).not.toContain(id);
    expect(Object.values(TOUR_ANCHOR_HOME) as string[]).not.toContain('page');
    expect('TOUR_ANCHOR_PAGE' in script).toBe(false);
    expect('cardPage' in script).toBe(false);
    // …and no tip is taught by the tour any more, so nothing marks one seen for it
    expect('TAUGHT_BY_TOUR' in script).toBe(false);
    // the tour keeps its six cards, their words and their marks
    expect(ids(WITH_STASH)).toEqual(['log', 'entry', 'schedule', 'stash', 'shopping', 'end']);
    expect(card(WITH_STASH, 'stash').title).toBe('The milk stash');
    expect(card(WITH_STASH, 'stash').anchor).toBe(TOUR_ANCHOR.stashAdd);
    expect(card(WITH_STASH, 'shopping').title).toBe('The list you send');
    expect(card(WITH_STASH, 'shopping').first?.anchor).toBe(TOUR_ANCHOR.shopAdd);
    expect(card(WITH_STASH, 'schedule').anchor).toBe(TOUR_ANCHOR.scheduleRoutine);
    expect(card(WITH_STASH, 'entry').anchor).toBe(TOUR_ANCHOR.todayLog);
  });

  it('stands each card on the tab its guide names, and reads nothing but Got it', () => {
    for (const g of GUIDES) {
      const [card] = guideSteps(g.id, ALL);
      expect(card, g.id).toBeDefined();
      expect(card?.tab, g.id).toBe(g.tab);
      expect(card?.action, g.id).toBeUndefined();
      expect(card?.anchor, g.id).not.toBeNull();
    }
    // all three on Today since 2026-09-28
    expect([...new Set(GUIDES.map(g => g.tab))]).toEqual(['Today']);
  });

  it('gives every tip to every household: none of the three needs a module', () => {
    for (const id of TIP_GUIDES) {
      expect(guideSteps(id, ALL), id).toHaveLength(1);
      expect(guideSteps(id, NO_STASH), id).toHaveLength(1);
      expect(guideSteps(id, []), id).toHaveLength(1);
    }
    expect(GUIDES.filter(g => g.needs !== undefined)).toEqual([]);
  });

  /**
   * HELP OFFERS WHAT IS TRUE RIGHT NOW. A "switch babies" guide for one baby would send the parent
   * to a card about nothing. (A "baby care" guide with no care strip was the other, until the Baby
   * care tip went on 2026-09-28.)
   */
  it('offers the babies guide in Help only while there is more than one baby', () => {
    const on: TourLive = { manyChildren: true };
    const off: TourLive = { manyChildren: false };
    const all = guidesFor(ALL, on).map(g => g.id);
    expect(all).toEqual([...TIP_GUIDES]);
    const quiet = guidesFor(ALL, off).map(g => g.id);
    expect(quiet).not.toContain('babies');
    // the other two guides' controls are always there: the tiles, your initial
    expect(quiet).toEqual(['first', 'settings']);
    expect(guidesFor(NO_STASH, on).map(g => g.id)).toEqual(all);
  });

  it('triggers your initial on Today, the babies on a second baby, and the last real one after the tour', () => {
    const byTab = Object.fromEntries(
      GUIDES.filter(g => g.trigger.kind === 'tab').map(g => [
        g.id,
        g.trigger.kind === 'tab' ? g.trigger.tab : '',
      ]),
    );
    // the one tip about your initial (2026-09-27), on Today; no other tab has a tip since 2026-09-28
    expect(byTab).toEqual({ settings: 'Today' });
    const byEvent = Object.fromEntries(
      GUIDES.filter(g => g.trigger.kind === 'event').map(g => [
        g.id,
        g.trigger.kind === 'event' ? g.trigger.event : '',
      ]),
    );
    expect(byEvent).toEqual({ babies: 'children:many' });
    expect(GUIDES.filter(g => g.trigger.kind === 'after').map(g => g.id)).toEqual(['first']);
    // no guide answers a page pushed over the tabs any more
    expect(GUIDES.map(g => g.trigger.kind).sort()).toEqual(['after', 'event', 'tab']);
  });

  /**
   * NO TIP ABOUT A RUNNING TIMER (the owner, 2026-09-27: *"remove the tip "it keeps counting, even
   * if you close the app. hold to stop it- here" serves no purpose and just comes across as too much
   * tips"*): no guide, no card, no Help row, no live fact reported for it, and no mark on the card.
   * (Card 2 of the tour marks a running timer's stop since 2026-09-28, while card 1's timer runs;
   * that is a card of the tour, and a tip still never does.)
   */
  it('has no tip about a running timer, and nothing left that was only for it', () => {
    expect(TIP_GUIDES as readonly string[]).not.toContain('timer');
    expect(guideOf('timer')).toBeNull();
    expect(TIP_STEPS.some(s => s.id === 'tip.timer')).toBe(false);
    expect(
      GUIDES.some(g => g.trigger.kind === 'event' && String(g.trigger.event) === 'timer:running'),
    ).toBe(false);
    for (const s of TIP_STEPS)
      expect(`${s.title} ${s.body}`, s.id).not.toMatch(/keeps counting|Hold to stop/i);
    expect(Object.values(TOUR_ANCHOR)).not.toContain('tour.timer');
    expect(Object.keys(TOUR_ANCHOR)).not.toContain('timerCard');
    for (const s of TIP_STEPS) expect(s.anchor, s.id).not.toBe(TOUR_ANCHOR.timerStop);
    // Help no longer asks whether a timer is running, nor whether the care strip is drawn
    const on: TourLive = { manyChildren: true };
    expect(Object.keys(on)).toEqual(['manyChildren']);
  });

  /**
   * NO BABY CARE TIP (the owner, 2026-09-28: *"tip: the small things count too, just showed up out of
   * nowhere, not sure why. remove this tip, user can see for their own there is baby care"*): no
   * guide, no card, no Help row, no live fact reported for it, and no mark on the care strip. A
   * `tips_seen` that still names `care` is read as it is (`decision.test.ts`).
   */
  it('has no tip about baby care, and nothing left that was only for it', () => {
    expect(TIP_GUIDES as readonly string[]).not.toContain('care');
    expect(guideOf('care')).toBeNull();
    expect(TIP_STEPS.some(s => s.id === 'tip.care' || String(s.guide) === 'care')).toBe(false);
    expect(
      GUIDES.some(g => g.trigger.kind === 'event' && String(g.trigger.event) === 'care:visible'),
    ).toBe(false);
    for (const s of [...EVERY_STEP, ...TIP_STEPS])
      expect(`${s.title} ${s.body}`, s.id).not.toMatch(/small things|Baby care/i);
    expect(Object.values(TOUR_ANCHOR)).not.toContain('tour.care');
    expect(Object.keys(TOUR_ANCHOR)).not.toContain('babyCare');
    // and Help lists no row for it, however the household is
    expect(guidesFor(ALL, { manyChildren: true }).some(g => String(g.id) === 'care')).toBe(false);
  });

  /**
   * EVERY CARD IN THE HOUSEHOLD'S OWN WORDS (the guides audit, 2026-09-26): a household that has
   * graduated tummy time to playtime would see a card naming it say playtime. The care tip and its
   * Help row were the two lines that did, and both went on 2026-09-28 (the owner: *"remove this
   * tip, user can see for their own there is baby care"*), so today every card and row is the same
   * object in either word — and the words still pass through for the next one that names it.
   */
  it('hands every card and Help row out in the household’s own word, which none of them needs today', () => {
    const playtime = tourWords({ tummy: 'playtime' });
    expect(playtime.tummy).toBe('playtime');
    expect(tourWords({}).tummy).toBe('tummy time');
    expect(TOUR_WORDS.tummy).toBe('tummy time');
    const on: TourLive = { manyChildren: true };
    // no card and no Help row names tummy time since the care tip went
    for (const s of EVERY_STEP) expect(`${s.title} ${s.body}`, s.id).not.toMatch(/tummy/i);
    for (const g of guidesFor(ALL, on))
      expect(`${g.title} ${g.detail}`, g.id).not.toMatch(/tummy/i);
    // so nothing changes, in either word
    for (const id of TIP_GUIDES) {
      expect(guideSteps(id, ALL, playtime), id).toEqual(guideSteps(id, ALL));
      expect(guideSteps(id, ALL, TOUR_WORDS)[0], id).toBe(TIP_STEPS.find(s => s.guide === id));
    }
    expect(guidesFor(ALL, on, playtime)).toEqual(guidesFor(ALL, on));
    expect(guidesFor(ALL, on, TOUR_WORDS)).toEqual(guidesFor(ALL, on));
  });

  /**
   * WHAT THE AUDIT FOUND WRONG, held (the guides audit, 2026-09-26): each of these said something
   * the app no longer does. (The colors, Schedule, list and Reports tips' own lines were here too,
   * until those tips went on 2026-09-28.)
   */
  it('says only what the app does today', () => {
    // the stash follows the stash module, which donor and purchased milk have without a pump
    expect(card(TOUR_STEPS, 'stash').body).toMatch(/^Stored milk/);
    // the settings left More for your initial, and the one Help row about it sends nobody to More
    // (Family followed them there on 2026-09-27 and came back on 2026-09-29: the test below)
    expect(guideOf('settings')?.title).toBe('Your account');
    expect(guideOf('settings')?.detail).not.toMatch(/\bMore\b/);
    // a timer's reward is about the timer, however the top of Today draws a second one
    expect(card(TOUR_STEPS, 'log').rewardTimer?.body).toBe(
      'It stays at the top of Today until you stop it.',
    );
  });

  /**
   * ONE TIP ABOUT YOUR INITIAL (the owner, 2026-09-27: *"i see tips twice that asks me to click on
   * my profile. this is unnecessary to do it twice, they can see for themselves whats in it , they
   * just need to know that it's clickable"*). Family's tip on Today and the account tip on More each
   * walked the parent into the menu in words. One is left, on Today, and it says only that the
   * initial can be tapped and roughly what is behind it, in a few words.
   *
   * AND FAMILY IS NOT BEHIND IT (2026-09-29): Family went back to More, the first row of its
   * Household group, so the card and its Help row name only what the menu holds.
   */
  it('keeps one tip about your initial, saying only that it taps and roughly what is behind it', () => {
    const onInitial = TIP_STEPS.filter(s => s.anchor === TOUR_ANCHOR.avatar);
    expect(onInitial.map(s => s.guide)).toEqual(['settings']);
    const [tip] = onInitial as [TourStep];
    expect(anchorHome(tip)).toBe('top');
    expect(tip.title).toBe('Your initial, top right');
    expect(tip.body).toBe('Tap it for Appearance, Plan and your account.');
    // a few words: one short sentence, and no walk through the menu ("then Family…")
    expect((tip.body.match(/[.!?](\s|$)/g) ?? []).length).toBe(1);
    expect(tip.body.split(/\s+/).length).toBeLessThanOrEqual(10);
    expect(tip.body).not.toMatch(/\bthen\b|joins|login|Download/);
    // that it can be tapped, and roughly what is behind it — the menu's own rows, and never Family,
    // which is More's since 2026-09-29
    expect(tip.body).toMatch(/^Tap it/);
    for (const row of ['Appearance', 'Plan']) expect(tip.body).toContain(row);
    expect(tip.body).not.toMatch(/Family/);
    expect(guideOf('settings')?.detail).not.toMatch(/Family/);
    // no other tip, card or Help row asks for the initial to be tapped
    for (const s of EVERY_STEP) {
      if (s === tip) continue;
      expect(`${s.title} ${s.body}`, s.id).not.toMatch(/\binitial\b/);
    }
    expect(guideOf('account')).toBeNull();
    // it stands and speaks on Today, the first arrival there once the tour is over
    expect(guideOf('settings')?.trigger).toEqual({ kind: 'tab', tab: 'Today' });
    expect(guideOf('settings')?.detail).toBe('Appearance and Plan, behind your initial');
    expect(tip.tab).toBe('Today');
    // More speaks no tip at all now
    expect(GUIDES.filter(g => g.trigger.kind === 'tab' && g.trigger.tab === 'More')).toEqual([]);
    // and More's Family row, back since 2026-09-29, carries no mark: no tip is about it
    expect(Object.values(TOUR_ANCHOR)).not.toContain('tour.more.family');
    expect(Object.keys(TOUR_ANCHOR)).not.toContain('rowFamily');
  });

  /**
   * THE CARD AFTER THE TOUR, WITH NO DASH OF ANY KIND (the owner, 2026-09-27: *"after tour ends, auto
   * bring to home page and show the now your last real one. remove the "-" ont he text, feels too
   * AI."*). Where it lands is the provider's and the overlay's (`tour.test.ts`); the words are here.
   */
  it('asks for the last real one on Today, in words with no dash of any kind', () => {
    const first = TIP_STEPS.find(s => s.guide === 'first') as TourStep;
    expect(first.tab).toBe('Today');
    expect(guideOf('first')?.tab).toBe('Today');
    expect(guideOf('first')?.trigger).toEqual({ kind: 'after', guide: 'main' });
    expect(first.title).toBe('Now, your last real one');
    expect(first.body).toBe(
      'Tap a tile for the last feed, nap or diaper. A rough time is fine. Your day runs from it.',
    );
    // not an em dash, not an en dash, and not a hyphen standing in for one either
    for (const text of [first.title, first.body]) expect(text).not.toMatch(/[-‐‑‒–—―]/);
  });

  /**
   * AND IT GOES AWAY ONCE THE PARENT HAS LOGGED (the owner, 2026-09-28: *"on the tip, now your last
   * real one, i logged diaper, but the tip does not go away, and the red border highlight keeps
   * showing. this needs fixing. it can go away automatically once user logged it once or clicking
   * Got it"*). A saved entry or a started timer closes it (`closesOn`, heard through `satisfies`),
   * and Got it still does. It is NOT the tip's action: an action of `log` is a deed the tour claims
   * as a trial entry, and this entry is the household's first real one — the provider's wiring,
   * which claims nothing for it, is `tour.test.ts`'s.
   */
  it('closes the last real one on a saved entry or a started timer, and never as a deed the tour would claim', () => {
    const first = TIP_STEPS.find(s => s.guide === 'first') as TourStep;
    expect(first.closesOn).toEqual({ kind: 'log' });
    const closesOn = first.closesOn!;
    expect(satisfies(closesOn, 'log')).toBe(true);
    expect(satisfies(closesOn, 'log:timer')).toBe(true);
    // opening a tile's sheet, or going somewhere, is not logging
    for (const other of [
      'open:quickentry',
      'close:quickentry',
      'tab:Today',
      'tab:Schedule',
      'slot',
    ]) {
      expect(satisfies(closesOn, other), other).toBe(false);
    }
    // no deed, no trial line, no window: a tip is read and closed, never claimed
    expect(first.action).toBeUndefined();
    expect(trialLabelOn(first)).toBe(false);
    expect(celebrates(first.action)).toBe(false);
    expect(first.reward).toBeUndefined();
    // the one card that closes on something the parent does, and never a card of the tour
    expect(TIP_STEPS.filter(s => s.closesOn !== undefined).map(s => s.id)).toEqual(['tip.first']);
    for (const s of [...TOUR_STEPS, ...WITH_STASH, ...WITHOUT_STASH]) {
      expect(s.closesOn, s.id).toBeUndefined();
    }
    // Got it is still there: a tip offers no Skip, and its one button reads Got it
    expect(offersSkip(first, { step: 1, steps: 1 })).toBe(false);
    expect(TOUR_LABELS.gotIt).toBe('Got it');
  });

  /**
   * NO OUTLINE HOLDS STILL BY CHOICE ANY MORE (2026-09-28): `outline: 'still'` was the amber and red
   * tip's, whose lesson was a color on the control, and it went with that tip (the owner: *"no need
   * uesr can see when its due its gonna change color"*). Every outline breathes by the one rule.
   */
  it('has no card that holds its outline still by choice', () => {
    for (const s of EVERY_STEP) expect('outline' in s, s.id).toBe(false);
  });
});

describe('what every card has to be', () => {
  it('has a unique id, a guide, a title and a body', () => {
    // unique in the script, and so in each tour a household can be shown
    for (const list of [[...TOUR_STEPS, ...TIP_STEPS], WITH_STASH, WITHOUT_STASH]) {
      const seen = new Set<string>();
      for (const s of list) {
        expect(seen.has(s.id), `duplicate id ${s.id}`).toBe(false);
        seen.add(s.id);
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.body.length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * SHORT (the owner, 2026-09-18: "too much words is very bad, less while still being clear is
   * better"). The ceiling is a test rather than a habit: a card that cannot say its one thing
   * inside it is a card trying to say two.
   */
  it('says one thing per card, in a sentence or two', () => {
    for (const s of EVERY_STEP) {
      expect(s.title.length, `${s.id} title`).toBeLessThanOrEqual(30);
      expect(s.body.length, `${s.id} body`).toBeLessThanOrEqual(125);
      expect((s.body.match(/[.!?](\s|$)/g) ?? []).length, `${s.id} sentences`).toBeLessThanOrEqual(
        3,
      );
      if (s.hint) expect(s.hint.length, `${s.id} hint`).toBeLessThanOrEqual(60);
      if (s.first) expect(s.first.hint.length, `${s.id} first`).toBeLessThanOrEqual(60);
      if (s.stopFirst) {
        expect(s.stopFirst.hint.length, `${s.id} stop`).toBeLessThanOrEqual(60);
        expect(s.stopFirst.thenSave.length, `${s.id} stop`).toBeLessThanOrEqual(60);
        // the card's words while it waits for the stop are a card's words, held the same way
        expect(s.stopFirst.title.length, `${s.id} stop title`).toBeLessThanOrEqual(30);
        expect(s.stopFirst.body.length, `${s.id} stop body`).toBeLessThanOrEqual(125);
      }
      if (s.first?.already) {
        expect(s.first.already.length, `${s.id} already`).toBeLessThanOrEqual(60);
      }
      if (s.optional) expect(s.optional.length, `${s.id} optional`).toBeLessThanOrEqual(60);
      if (s.prefilled) expect(s.prefilled.length, `${s.id} prefilled`).toBeLessThanOrEqual(70);
      // a reward is read in the second or two it is up: a title and one short line
      for (const r of [s.reward, s.rewardTimer, s.first?.reward, s.first?.rewardTimer]) {
        if (r === undefined) continue;
        expect(r.title.length, `${s.id} reward title`).toBeLessThanOrEqual(30);
        expect(r.body.length, `${s.id} reward body`).toBeLessThanOrEqual(80);
      }
    }
    expect(TOUR_FIRST_ENTRY.length).toBeLessThanOrEqual(30);
  });

  /**
   * EVERY CARD NAMES ITS CONTROL IN WORDS. A mark is a visual signal and nothing in this app is
   * conveyed by sight alone (CLAUDE.md §6) — so a card about the Log tiles says "tile", a card
   * about Today's log says "Today’s log", and so on.
   */
  it('names its control in words, never by the mark alone', () => {
    const word: Record<string, RegExp> = {
      [TOUR_ANCHOR.logTiles]: /tile/i,
      [TOUR_ANCHOR.todayLog]: /Today’s log/,
      [TOUR_ANCHOR.scheduleRoutine]: /Manage/,
      [TOUR_ANCHOR.stashAdd]: /Add milk/,
      [TOUR_ANCHOR.shopAdd]: /Add item/,
      [TOUR_ANCHOR.shopShare]: /Share/,
      // the running timer's stop, named with what to do with it: held, and the timer it ends
      [TOUR_ANCHOR.timerStop]: /timer.*hold|hold.*timer/,
      [TOUR_ANCHOR.childChip]: /name at the top/,
      // the avatar is a letter in a circle, and "Account, <name>" is what a screen reader says
      [TOUR_ANCHOR.avatar]: /initial/,
    };
    for (const s of EVERY_STEP) {
      if (s.anchor === null) continue;
      const re = word[s.anchor];
      expect(re, `no word rule for ${s.anchor}`).toBeDefined();
      expect(`${s.title} ${s.body} ${s.hint ?? ''}`, s.id).toMatch(re as RegExp);
      // …and a thing to try with a control of its own names that one in the line that asks for it
      if (s.first?.anchor !== undefined) {
        const first = word[s.first.anchor];
        expect(first, `no word rule for ${s.first.anchor}`).toBeDefined();
        expect(s.first.hint, s.id).toMatch(first as RegExp);
      }
      // …and so does a timer to stop first, in the line the card shows while it runs
      if (s.stopFirst !== undefined) {
        const stop = word[s.stopFirst.anchor];
        expect(stop, `no word rule for ${s.stopFirst.anchor}`).toBeDefined();
        expect(s.stopFirst.hint, s.id).toMatch(stop as RegExp);
      }
    }
    // and the door names the tab it leads to
    expect(card(WITH_STASH, 'entry').hint).toContain('Schedule');
    // a card with no anchor still names its page's controls in words
    expect(TOUR_STEPS.find(s => s.id === 'schedule')?.body).toMatch(/Manage/);
  });

  /**
   * IT DESCRIBES THE APP AND NEVER THE BABY (CLAUDE.md §2). No card tells a parent what to do
   * with a child, how much is enough, or what is normal — only where a thing is and what it does.
   */
  it('describes the app and never the baby (CLAUDE.md §2)', () => {
    const banned = [
      /\bshould\b/i,
      /\bnormal\b/i,
      /\bhealthy\b/i,
      /\benough\b/i,
      /too (much|little|long|often)/i,
      /\brecommend/i,
      /\bdose\b/i,
      /\bdiagnos/i,
      /\bovertired\b/i,
      /\bsupply\b/i,
    ];
    const strings = [
      ...EVERY_STEP.flatMap(s => [
        s.title,
        s.body,
        s.hint ?? '',
        s.first?.hint ?? '',
        s.stopFirst?.hint ?? '',
        s.stopFirst?.thenSave ?? '',
        s.stopFirst?.title ?? '',
        s.stopFirst?.body ?? '',
        s.first?.already ?? '',
        s.optional ?? '',
        s.prefilled ?? '',
        s.reward?.title ?? '',
        s.reward?.body ?? '',
        s.rewardTimer?.title ?? '',
        s.rewardTimer?.body ?? '',
        s.first?.reward?.title ?? '',
        s.first?.reward?.body ?? '',
        s.first?.rewardTimer?.title ?? '',
        s.first?.rewardTimer?.body ?? '',
      ]),
      ...Object.values(TOUR_ASK),
      TOUR_RESUME.title,
      TOUR_RESUME.body({ step: 3, steps: 6 }),
      TOUR_RESUME.later,
      TOUR_RESUME.resume,
      TOUR_RESUME.end,
      TOUR_TRIAL,
      TOUR_UNDONE,
      TRIAL_ENTRY_NOTE,
      TOUR_FIRST_ENTRY,
      // the sample lines the shopping card puts on an empty list (2026-09-28) are words the parent
      // may send to someone, so they are held to the same rule as every card
      ...TRIAL_LINES,
      ...Object.values(TOUR_LINES).map(line => line('Stash')),
      ...GUIDES.flatMap(g => [g.title, g.detail]),
    ];
    for (const text of strings) for (const re of banned) expect(text, text).not.toMatch(re);
  });

  /**
   * NO DASH IN ANYTHING THE TOUR OR A TIP SHOWS (the owner, 2026-09-27, of "Now, your last real one":
   * *"remove the "-" ont he text, feels too AI"*). An em dash or an en dash set off an aside in a
   * dozen of these lines; each is a comma, a full stop or a word now. Every string a card, its bar, a
   * reward, a tip, the ask or Help's rows can put on the screen is walked, in the household's words
   * too. A hyphen inside a word ("one-off") is a spelling, not a dash, and stays; the card after the
   * tour has none of either (the test above).
   */
  it('shows no em dash or en dash on any card, tip, reward, line or Help row', () => {
    const dash = /[–—―]/;
    const playtime = tourWords({ tummy: 'playtime' });
    const cards = [...EVERY_STEP, ...TIP_GUIDES.flatMap(id => guideSteps(id, ALL, playtime))];
    const shown = [
      ...cards.flatMap(s => [
        s.title,
        s.body,
        s.hint,
        s.first?.hint,
        s.stopFirst?.hint,
        s.stopFirst?.thenSave,
        s.stopFirst?.title,
        s.stopFirst?.body,
        s.first?.already,
        s.optional,
        s.prefilled,
        s.reward?.title,
        s.reward?.body,
        s.rewardTimer?.title,
        s.rewardTimer?.body,
        s.first?.reward?.title,
        s.first?.reward?.body,
        s.first?.rewardTimer?.title,
        s.first?.rewardTimer?.body,
        ...[true, false].map(first => tryReward(s, { via: 'write', first })?.title),
      ]),
      ...Object.values(TOUR_ASK),
      TOUR_RESUME.title,
      TOUR_RESUME.body({ step: 3, steps: 6 }),
      TOUR_RESUME.later,
      TOUR_RESUME.resume,
      TOUR_RESUME.end,
      TOUR_TRIAL,
      TOUR_UNDONE,
      TOUR_FIRST_ENTRY,
      ...TRIAL_LINES,
      ...Object.values(TOUR_REST_LABELS),
      ...Object.values(TOUR_LINES).flatMap(line => ['Schedule', 'Stash', 'Shopping'].map(line)),
      TOUR_LABELS.back,
      TOUR_LABELS.next,
      TOUR_LABELS.done,
      TOUR_LABELS.skip,
      TOUR_LABELS.close,
      TOUR_LABELS.gotIt,
      TOUR_LABELS.tip,
      TOUR_LABELS.backTo('Schedule'),
      TOUR_LABELS.stepOf(2, 7),
      ...guidesFor(ALL, { manyChildren: true }, playtime).flatMap(g => [g.title, g.detail]),
    ].filter((text): text is string => text !== undefined);
    expect(shown.length).toBeGreaterThan(80);
    for (const text of shown) expect(text, text).not.toMatch(dash);
  });

  it('uses US English and sentence case, the way every other string in the app does', () => {
    const rewards = (s: TourStep) =>
      [s.reward, s.rewardTimer, s.first?.reward, s.first?.rewardTimer].flatMap(r =>
        r === undefined ? [] : [r],
      );
    for (const s of EVERY_STEP) {
      expect(s.body).not.toMatch(/colour|favourite|centre|behaviour|programme/);
      // a title is a sentence, not a headline: only the first word and proper nouns capitalised —
      // the reward that takes its place for a moment included
      for (const title of [s.title, ...rewards(s).map(r => r.title), TOUR_FIRST_ENTRY]) {
        const words = title.split(' ').slice(1);
        const caps = words.filter(
          w =>
            /^[A-Z]/.test(w) &&
            !/^(Today|Schedule|Manage|Amber|Up|Add|Family|Reports|Report|Stash|Shopping)$/.test(w),
        );
        expect(caps, `${s.id}: ${title}`).toEqual([]);
      }
      for (const r of rewards(s)) {
        expect(r.body).not.toMatch(/colour|favourite|centre|behaviour|programme/);
      }
    }
    // …and the two cards that ask, their buttons included
    for (const title of [
      TOUR_ASK.title,
      TOUR_ASK.start,
      TOUR_ASK.decline,
      TOUR_RESUME.title,
      TOUR_RESUME.resume,
      TOUR_RESUME.end,
    ]) {
      expect(
        title
          .split(' ')
          .slice(1)
          .filter(w => /^[A-Z]/.test(w)),
        title,
      ).toEqual([]);
    }
  });

  it('asks before it starts, promises to clear up, and says where it lives afterwards', () => {
    expect(TOUR_ASK.body).toContain('trial entry');
    expect(TOUR_ASK.body).toContain('cleared when the tour ends');
    expect(TOUR_ASK.later).toContain('More → Help & tour');
    expect(TOUR_ASK.start).toBe('Show me');
    expect(TOUR_ASK.decline).toBe('Not now');
    // one line where the badge was, not a badge and a sentence under every card (2026-09-27)
    expect(TOUR_TRIAL).toBe('Entry removed when tour ends');
    expect(TOUR_LABELS.stepOf(2, 5)).toBe('Step 2 of 5');
    expect(TOUR_LABELS.skip).toBe('Skip');
    expect(TOUR_LABELS.close).toBe('Close');
    expect(TOUR_LABELS.gotIt).toBe('Got it');
  });
});

describe('where a card can be seen from', () => {
  it('gives every anchor in the catalog a home, so none has to be guessed at', () => {
    for (const [key, value] of Object.entries(TOUR_ANCHOR)) {
      expect(TOUR_ANCHOR_HOME[value], `${key} has no home`).toBeDefined();
    }
    // and the bar anchors are the things in the bar: the three doors' cells (the + button was one
    // until card 2 stopped pointing at it, 2026-09-27)
    const bar = Object.entries(TOUR_ANCHOR_HOME)
      .filter(([, h]) => h === 'bar')
      .map(([a]) => a)
      .sort();
    expect(bar).toEqual(
      [TOUR_ANCHOR.tabSchedule, TOUR_ANCHOR.tabStash, TOUR_ANCHOR.tabShopping].sort(),
    );
    // the top bar's are the two things in it a tip is about: the baby's name and your initial
    const top = Object.entries(TOUR_ANCHOR_HOME)
      .filter(([, h]) => h === 'top')
      .map(([a]) => a)
      .sort();
    expect(top).toEqual([TOUR_ANCHOR.avatar, TOUR_ANCHOR.childChip].sort());
    // no control on a page pushed over the tabs since the two tips that had one went (2026-09-28)
    expect([...new Set(Object.values(TOUR_ANCHOR_HOME))].sort()).toEqual(
      ['bar', 'float', 'tab', 'top'].sort(),
    );
    // the running timer's stop is on Today's page, and moves with it like the log below it
    expect(TOUR_ANCHOR_HOME[TOUR_ANCHOR.timerStop]).toBe('tab');
  });

  /**
   * THE TOUR BRINGS UP A CONTROL THAT MOVES WITH ITS PAGE — a tab's — and never scrolls for one that
   * stands still: the bars, and a floating action.
   */
  it('scrolls a page only for a control that moves with it', () => {
    expect(movesWithPage('tab')).toBe(true);
    for (const home of ['bar', 'top', 'float', null] as const)
      expect(movesWithPage(home)).toBe(false);
  });

  /**
   * THE TOP BAR IS ON EVERY TAB, and on no pushed page — which draws Back and a title where the
   * name and your initial were.
   */
  it('sees the top bar from any tab and no page', () => {
    const chip = TIP_STEPS.find(s => s.guide === 'babies') as TourStep;
    // the one tip about your initial (2026-09-27)
    const initial = TIP_STEPS.find(s => s.guide === 'settings') as TourStep;
    for (const s of [chip, initial]) {
      expect(anchorHome(s), s.id).toBe('top');
      for (const tab of ['Today', 'Stash', 'More', null]) {
        expect(canSee(s, { tab, pushed: 0 }), `${s.id} on ${String(tab)}`).toBe(true);
      }
      expect(canSee(s, { tab: 'More', pushed: 1 }), s.id).toBe(false);
    }
  });

  /**
   * A PAGE'S FLOATING ACTION IS SEEN LIKE A TAB CONTROL, BUT THE PAGE NEVER SCROLLS FOR IT. Add
   * milk and Add supplies stand still over their page, so moving the page under them reveals
   * nothing — the overlay scrolls only for `tab` (2026-09-25).
   */
  it('keeps the floating action apart from the controls a page scroll can move', () => {
    const floating = Object.entries(TOUR_ANCHOR_HOME)
      .filter(([, h]) => h === 'float')
      .map(([a]) => a)
      .sort();
    expect(floating).toEqual([TOUR_ANCHOR.stashAdd]);
    const stash = card(WITH_STASH, 'stash');
    expect(anchorHome(stash)).toBe('float');
    // seen exactly where a tab control would be: on its own tab, with nothing pushed over it
    expect(canSee(stash, { tab: 'Stash', pushed: 0 })).toBe(true);
    expect(canSee(stash, { tab: 'Today', pushed: 0 })).toBe(false);
    expect(canSee(stash, { tab: 'Stash', pushed: 1 })).toBe(false);
  });

  it('has no anchor in the catalog that no card uses, as its mark, its second mark or its stop', () => {
    const used = new Set(
      EVERY_STEP.flatMap(s => [
        s.anchor,
        s.secondary ?? null,
        s.first?.anchor ?? null,
        s.stopFirst?.anchor ?? null,
      ]),
    );
    for (const [key, value] of Object.entries(TOUR_ANCHOR)) {
      expect(used.has(value), `${key} is declared and never pointed at`).toBe(true);
    }
  });

  it('marks a control only where the parent could actually see it', () => {
    const log = TOUR_STEPS[0] as TourStep;
    const entry = TOUR_STEPS[1] as TourStep;
    const end = TOUR_STEPS[TOUR_STEPS.length - 1] as TourStep;
    // no card of the tour is on the bar since card 2 left the + (2026-09-27); a door's cell is
    // still a bar control, and the rule for one is walked on a card made for it
    const onBar: TourStep = { ...entry, id: 'bar', anchor: TOUR_ANCHOR.tabSchedule };
    expect(anchorHome(log)).toBe('tab');
    expect(anchorHome(entry)).toBe('tab');
    expect(anchorHome(onBar)).toBe('bar');
    expect(anchorHome(end)).toBeNull();
    // a page control: on its own tab, and only with nothing pushed over it — Today's log included,
    // and card 2's timer to stop
    for (const s of [log, entry, asStopping(entry)]) {
      expect(canSee(s, { tab: 'Today', pushed: 0 }), s.id).toBe(true);
      expect(canSee(s, { tab: 'Schedule', pushed: 0 }), s.id).toBe(false);
      expect(canSee(s, { tab: 'Today', pushed: 1 }), s.id).toBe(false);
    }
    // the bar: any tab, nothing pushed
    expect(canSee(onBar, { tab: 'Schedule', pushed: 0 })).toBe(true);
    expect(canSee(onBar, { tab: null, pushed: 0 })).toBe(true);
    expect(canSee(onBar, { tab: 'Today', pushed: 1 })).toBe(false);
    // and nothing to see for the closing card
    expect(canSee(end, { tab: 'Schedule', pushed: 0 })).toBe(false);
  });
});
