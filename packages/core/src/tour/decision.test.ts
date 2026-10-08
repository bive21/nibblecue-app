/**
 * Which tip a moment earns (`decision.ts`): the conjunction that keeps the tips from being the
 * interruption they replace. Every clause is a case here, and the one that matters most — a
 * household that never had a tour is never ambushed — is first.
 *
 * THREE TIPS SINCE 2026-09-28, when the owner decided every tip: your initial on the first
 * arrival on Today, the babies on a second baby, and the last real one after a finished tour (which
 * no event starts). The clauses are walked on the two that answer an event.
 */
import { describe, expect, it } from 'vitest';
import { MODULES } from '../modules/module-registry';
import {
  guidesForEvent,
  markSeen,
  parseSeen,
  TIP_QUIET_MS,
  tipFor,
  tipTourOf,
  type TipContext,
  type TourRead,
} from './decision';
import { tourArmed, type TourArmed } from './opening';
import { GUIDES, TIP_GUIDES, type TourGuide } from './steps';

const ALL = new Set(MODULES.map(m => m.id));
const quiet: TipContext = {
  // this account's tour has been read, and nothing about it is due: every clause below is judged
  // with the tour out of the way, and `the tour comes first` walks the moments it is not
  tour: 'clear',
  mainDone: true,
  busy: false,
  seen: [],
  enabled: ALL,
  nowMs: 1_000_000,
  quietUntilMs: 0,
  // the afternoon: every tip below is judged in the daytime unless it says otherwise
  hour: 14,
};

/**
 * EVERY EVENT A TIP USED TO ANSWER, until the owner decided every tip (2026-09-28): the tabs, the
 * two pages pushed over them, and the two facts about Today that went with their tips.
 */
const RETIRED_MOMENTS = [
  'tab:Schedule',
  'tab:Stash',
  'tab:Shopping',
  'tab:Reports',
  'page:Timeline',
  'page:Routine',
  'alert:tile',
  'log:more',
] as const;

describe('which tip a moment earns', () => {
  it('speaks only once the tour has ended — an update is never ambushed', () => {
    expect(tipFor('tab:Today', { ...quiet, mainDone: false })).toBeNull();
    expect(tipFor('tab:Today', quiet)).toBe('settings');
    expect(tipFor('children:many', { ...quiet, mainDone: false })).toBeNull();
    expect(tipFor('children:many', quiet)).toBe('babies');
  });

  it('never starts under a sheet, or while a guide is up', () => {
    expect(tipFor('tab:Today', { ...quiet, busy: true })).toBeNull();
    expect(tipFor('children:many', { ...quiet, busy: true })).toBeNull();
  });

  it('waits out the quiet after the last guide, so it never lands on the confetti', () => {
    const until = quiet.nowMs + TIP_QUIET_MS;
    expect(tipFor('tab:Today', { ...quiet, quietUntilMs: until })).toBeNull();
    expect(tipFor('tab:Today', { ...quiet, nowMs: until, quietUntilMs: until })).toBe('settings');
  });

  /**
   * THE DAYTIME ONLY, 8 a.m. TO 9 p.m. ON THE PHONE'S CLOCK (2026-09-28): the trial sheets' hours
   * (`PROMPT_TIMING`, through `isDaytimeHour`). A parent opening the app at 3 a.m. came to log a
   * bottle; the tip about your initial can wait for the morning, and it does, because a moment it
   * sat out is not a tip seen.
   */
  it('waits for the daytime, and a tip held at night is still there to earn in the morning', () => {
    for (const hour of [21, 23, 0, 3, 7]) {
      expect(tipFor('tab:Today', { ...quiet, hour }), `${hour}:00`).toBeNull();
      expect(tipFor('children:many', { ...quiet, hour }), `${hour}:00`).toBeNull();
    }
    for (const hour of [8, 12, 20]) {
      expect(tipFor('tab:Today', { ...quiet, hour }), `${hour}:00`).toBe('settings');
      expect(tipFor('children:many', { ...quiet, hour }), `${hour}:00`).toBe('babies');
    }
    // nothing is written by a held moment: the same seen list earns the tip at eight
    expect(tipFor('tab:Today', { ...quiet, hour: 3, seen: [] })).toBeNull();
    expect(tipFor('tab:Today', { ...quiet, hour: 8, seen: [] })).toBe('settings');
  });

  it('speaks once: a seen tip is never a tip again', () => {
    expect(tipFor('tab:Today', { ...quiet, seen: ['settings'] })).toBeNull();
    expect(tipFor('tab:Today', { ...quiet, seen: new Set(['settings']) })).toBeNull();
    expect(tipFor('children:many', { ...quiet, seen: ['babies'] })).toBeNull();
    expect(tipFor('tab:Today', quiet)).toBe('settings');
  });

  /**
   * ONE TIP ABOUT YOUR INITIAL, ON TODAY (the owner, 2026-09-27: *"i see tips twice that asks me to
   * click on my profile. this is unnecessary to do it twice"*). It was Family's tip on Today and the
   * account tip on More; the account tip is gone, so More's first visit says nothing, and the one
   * left speaks once — including to a household that saw the account tip before it went.
   */
  it('speaks one tip about your initial, on Today, and none on More', () => {
    expect(guidesForEvent('tab:Today').map(g => g.id)).toEqual(['settings']);
    expect(guidesForEvent('tab:More')).toEqual([]);
    for (const seen of [[], ['account'], ['settings'], ['account', 'settings']]) {
      expect(tipFor('tab:More', { ...quiet, seen }), seen.join()).toBeNull();
    }
    // a stored `account` from before is an id no guide answers to, and changes nothing
    expect(tipFor('tab:Today', { ...quiet, seen: ['account'] })).toBe('settings');
    expect(tipFor('tab:Today', { ...quiet, seen: ['account', 'settings'] })).toBeNull();
    // and like every tip, never before the tour has ended: day one is the tour on Today
    expect(tipFor('tab:Today', { ...quiet, mainDone: false })).toBeNull();
  });

  /**
   * EIGHT TIPS WENT WHEN THE OWNER DECIDED EVERY TIP (2026-09-28), each in their words: Schedule's,
   * the stash's, the list's and the Activity log's (*"this is already is onboard initial tour"*),
   * the day wheel's (*"unnecessary"*), Reports' (*"i dont think this is needed"*), the tiles' (*"i
   * dont like the random pop up … if users want to do this they can do it themselves"*) and amber
   * and red's (*"no need uesr can see when its due its gonna change color"*). No moment they spoke
   * on earns a tip any more, finished tour or skipped, at any hour, seen or not.
   */
  it('earns nothing on any moment a retired tip spoke on, however the tour ended', () => {
    expect([...TIP_GUIDES]).toEqual(['first', 'babies', 'settings']);
    for (const moment of RETIRED_MOMENTS) {
      expect(guidesForEvent(moment), moment).toEqual([]);
      for (const seen of [[], ['settings', 'babies']]) {
        for (const hour of [8, 14, 20]) {
          expect(tipFor(moment, { ...quiet, seen, hour }), `${moment} ${hour}:00`).toBeNull();
        }
      }
    }
    // only the three are left to speak, and the last real one answers no event at all: the
    // provider starts it itself when a tour is finished
    expect(GUIDES.map(g => g.id)).toEqual(['first', 'babies', 'settings']);
    expect(GUIDES.find(g => g.id === 'first')?.trigger).toEqual({ kind: 'after', guide: 'main' });
  });

  /**
   * A MOMENT THAT ANSWERS TWO TIPS GIVES ONE A VISIT (the guides audit, 2026-09-26): the first in
   * Help's order not yet seen, never both on one arrival. Arriving on More was that moment —
   * Family, then your account — until Family's tip went to Today and the account tip went
   * altogether (2026-09-27); no moment in the app answers two today, so the rule is walked on a pair
   * made for it, to be there for the next one that does.
   */
  it('gives a moment with two tips one per visit, the first not yet seen', () => {
    const onMore = (id: string): TourGuide => {
      const g = GUIDES.find(x => x.id === id);
      if (g === undefined) throw new Error(`no guide ${id}`);
      return { ...g, trigger: { kind: 'tab', tab: 'More' } };
    };
    const pair = [onMore('babies'), onMore('settings')];
    expect(guidesForEvent('tab:More', pair).map(g => g.id)).toEqual(['babies', 'settings']);
    expect(tipFor('tab:More', quiet, pair)).toBe('babies');
    expect(tipFor('tab:More', { ...quiet, seen: ['babies'] }, pair)).toBe('settings');
    // seen the other way round (a replay from Help), the one still unseen is the one that speaks
    expect(tipFor('tab:More', { ...quiet, seen: ['settings'] }, pair)).toBe('babies');
    expect(tipFor('tab:More', { ...quiet, seen: ['babies', 'settings'] }, pair)).toBeNull();
    // the pair is handed in, and the app's own list is untouched by it: More answers nothing
    expect(tipFor('tab:More', quiet)).toBeNull();
  });

  it('answers no page pushed over the tabs, the tour’s own among them', () => {
    // the two tips that stood on one, the Activity log's and the day wheel's, went on 2026-09-28
    for (const page of ['page:Timeline', 'page:Routine', 'page:Family', 'page:Supplies']) {
      expect(tipFor(page, quiet), page).toBeNull();
      expect(guidesForEvent(page), page).toEqual([]);
    }
  });

  it('answers each live fact about Today that is left with its own tip, and the rest with none', () => {
    // a running timer earns none since 2026-09-27 (the owner: "remove the tip "it keeps counting…"
    // … serves no purpose and just comes across as too much tips")
    expect(tipFor('timer:running', quiet)).toBeNull();
    expect(guidesForEvent('timer:running')).toEqual([]);
    // …and the care strip drawn none since 2026-09-28 (the owner: "tip: the small things count
    // too, just showed up out of nowhere, not sure why. remove this tip, user can see for their own
    // there is baby care")
    expect(tipFor('care:visible', quiet)).toBeNull();
    expect(guidesForEvent('care:visible')).toEqual([]);
    // …and a tile's edge turned, or a module held back from the tiles, none since later that day
    expect(tipFor('alert:tile', quiet)).toBeNull();
    expect(tipFor('log:more', quiet)).toBeNull();
    // a second baby is the one live fact that still earns its tip
    expect(tipFor('children:many', quiet)).toBe('babies');
  });

  it('has nothing to say to an event no guide answers to', () => {
    expect(tipFor('tab:Nowhere', quiet)).toBeNull();
    expect(tipFor('log', quiet)).toBeNull();
    expect(tipFor('open:quicklog', quiet)).toBeNull();
    expect(guidesForEvent('tab:Nowhere')).toEqual([]);
    expect(guidesForEvent('page:Nowhere')).toEqual([]);
    expect(guidesForEvent('slot')).toEqual([]);
    expect(guidesForEvent('tab:Today')[0]?.id).toBe('settings');
    expect(guidesForEvent('children:many')[0]?.id).toBe('babies');
  });

  /**
   * A HOUSEHOLD THAT SAW A TIP BEFORE IT WENT still has its id in `tips_seen`: `care` (Baby care,
   * 2026-09-28), and any of the eight the owner took out later that day. Each is an id no guide
   * answers to, and changes nothing: the tips that are left speak as they would have, and the list
   * reads back with the old ids in.
   */
  it('reads a seen list that still names retired tips as it is, and changes nothing for them', () => {
    const seen = parseSeen(
      '["care","stash","tiles","colors","entries","wheel","schedule","shopping","reports"]',
    );
    expect(seen).toEqual([
      'care',
      'stash',
      'tiles',
      'colors',
      'entries',
      'wheel',
      'schedule',
      'shopping',
      'reports',
    ]);
    expect(tipFor('care:visible', { ...quiet, seen })).toBeNull();
    for (const moment of RETIRED_MOMENTS) expect(tipFor(moment, { ...quiet, seen })).toBeNull();
    // the three that are left, as if none of those had ever been seen
    expect(tipFor('tab:Today', { ...quiet, seen })).toBe('settings');
    expect(tipFor('children:many', { ...quiet, seen })).toBe('babies');
    expect(markSeen(seen, 'settings')).toEqual([...seen, 'settings']);
  });
});

describe('what was seen, written down and read back', () => {
  it('adds without repeating, and keeps the order it saw things in', () => {
    expect(markSeen([], 'settings')).toEqual(['settings']);
    expect(markSeen(['settings'], 'settings', 'babies')).toEqual(['settings', 'babies']);
    expect(markSeen(['care'], 'babies')).toEqual(['care', 'babies']);
  });

  it('reads back a list, and reads anything else as nothing seen', () => {
    expect(parseSeen(null)).toEqual([]);
    expect(parseSeen('not json')).toEqual([]);
    expect(parseSeen('{"a":1}')).toEqual([]);
    expect(parseSeen('["stash", 3, "care"]')).toEqual(['stash', 'care']);
  });
});

/**
 * THE TOUR COMES FIRST (the owner, 2026-10-01, on a brand new account in Expo Go: *"right after
 * onboarding, the tip for my profile showed up before the show me the tour. tour takes precedent as
 * first thing to do"*).
 *
 * The moment the owner met, as the provider handed it in: Today's first arrival after setup, heard
 * the instant Today mounted, before the provider had read anything of the new account's tour, and
 * judged on the switch and the seen list it still held from the account signed in before on the
 * same opening of the app (its tour finished, its last real one seen, your initial not yet). The
 * rule had no way to hear that: it answered `settings`, the tip started 450 ms later with the ask
 * still being read, and a running tip held the ask off until it was closed.
 */
describe('the tour comes first', () => {
  const ADA_PARENT = 'uid-ada-parent';
  const BEN_PARENT = 'uid-ben-parent';
  /** What the provider held from the account before: the switch on, the last real one seen. */
  const lastAccount: TipContext = { ...quiet, mainDone: true, seen: ['first'] };
  const EVERY_ARM: readonly TourArmed[] = ['none', 'paused', 'offer', 'run', 'ask', 'wait'];

  it('says nothing before this account’s tour has been read, whatever the app still holds', () => {
    for (const held of [lastAccount, quiet, { ...quiet, seen: [] }]) {
      expect(tipFor('tab:Today', { ...held, tour: 'unread' })).toBeNull();
      expect(tipFor('children:many', { ...held, tour: 'unread' })).toBeNull();
      // at every hour: it is not the night holding it
      for (const hour of [8, 12, 14, 20]) {
        expect(tipFor('tab:Today', { ...held, tour: 'unread', hour }), `${hour}:00`).toBeNull();
      }
    }
  });

  it('says nothing while the tour is owed: the ask, the card that asks to continue, the tour Help asked for', () => {
    for (const held of [lastAccount, quiet]) {
      expect(tipFor('tab:Today', { ...held, tour: 'owed' })).toBeNull();
      expect(tipFor('children:many', { ...held, tour: 'owed' })).toBeNull();
    }
  });

  it('reads the tour for the account signed in now, and nobody else', () => {
    // nothing read yet: the app has just opened, or a household has just been set up
    expect(tipTourOf(null, BEN_PARENT)).toBe('unread');
    // read, but for the account signed in before: that says nothing about this one's tour
    for (const armed of EVERY_ARM) {
      expect(tipTourOf({ uid: ADA_PARENT, armed }, BEN_PARENT), armed).toBe('unread');
      // and nobody signed in reads as nothing read
      expect(tipTourOf({ uid: BEN_PARENT, armed }, null), armed).toBe('unread');
    }
    // read for this account: the three answers that put the tour up hold every tip
    const owed = EVERY_ARM.filter(
      armed => tipTourOf({ uid: BEN_PARENT, armed }, BEN_PARENT) === 'owed',
    );
    expect(owed).toEqual(['offer', 'run', 'ask']);
    // …and the three that leave it down, ended, closed with ×, or waiting in Help for the morning, do not
    const clear = EVERY_ARM.filter(
      armed => tipTourOf({ uid: BEN_PARENT, armed }, BEN_PARENT) === 'clear',
    );
    expect(clear).toEqual(['none', 'paused', 'wait']);
  });

  /**
   * THE OPENING AFTER SETUP, IN THE ORDER THE PROVIDER HEARS IT: Today mounts and reports its
   * arrival before the read is in, the read finds the tour owed and the ask goes up, and only once
   * the ask is answered and the tour read again does the tip about your initial get its turn, by
   * its own rules (the quiet after a guide, the daytime, seen once).
   */
  it('walks the opening after setup: the ask first, and your initial only once the tour is over', () => {
    const hour = 14;
    const nowMs = 1_000_000;
    // the provider's state, as it stands at each beat (`TourProvider.tsx`)
    let read: TourRead | null = null;
    let mainDone = true;
    let seen: readonly string[] = ['first'];
    let quietUntilMs = 0;
    const moment = (at: number): TipContext => ({
      ...quiet,
      tour: tipTourOf(read, BEN_PARENT),
      mainDone,
      seen,
      nowMs: at,
      quietUntilMs,
      hour,
    });

    // 1. Today mounts and reports its arrival: nothing of this account's tour read yet
    expect(tipFor('tab:Today', moment(nowMs))).toBeNull();
    // …and 450 ms later, as the tip would have started, still nothing read: asked again, still none
    expect(tipFor('tab:Today', moment(nowMs + 450))).toBeNull();

    // 2. the read: setup left the tour pending and not started, so it is offered
    const offered = tourArmed({
      pending: true,
      at: null,
      paused: false,
      cards: 6,
      asked: false,
      put: false,
      hour,
    });
    expect(offered).toBe('offer');
    read = { uid: BEN_PARENT, armed: offered };
    mainDone = false;
    seen = [];
    expect(tipFor('tab:Today', moment(nowMs + 600))).toBeNull();
    // the ask holds every tip by itself: it is not the new account's switch being off that does
    expect(tipFor('tab:Today', { ...moment(nowMs + 600), mainDone: true })).toBeNull();

    // 3. "Not now": the tour ends declined (`tour_done`), the guide goes down with its quiet, and the
    // tour is read again with nothing owed
    const ended = nowMs + 30_000;
    quietUntilMs = ended + TIP_QUIET_MS;
    const after = tourArmed({
      pending: false,
      at: null,
      paused: false,
      cards: 6,
      asked: false,
      put: false,
      hour,
    });
    expect(after).toBe('none');
    read = { uid: BEN_PARENT, armed: after };
    mainDone = true;
    // the arrival the ending made is inside the quiet; the next arrival on Today earns the tip
    expect(tipFor('tab:Today', moment(ended + 1_000))).toBeNull();
    expect(tipFor('tab:Today', moment(quietUntilMs))).toBe('settings');
    // once seen, never again
    seen = ['settings'];
    expect(tipFor('tab:Today', moment(quietUntilMs + 60_000))).toBeNull();
  });

  /**
   * NOTHING CHANGES FOR A HOUSEHOLD THE TOUR IS DONE WITH: a parent who said Not now or skipped it,
   * or an account that finished it long ago, reads `clear` and gets every tip it got before, by the
   * same rules, the moment its read is in.
   */
  it('keeps every tip for a household whose tour is over, by the rules it always had', () => {
    for (const armed of ['none', 'paused', 'wait'] as const) {
      const ctx: TipContext = { ...quiet, tour: tipTourOf({ uid: BEN_PARENT, armed }, BEN_PARENT) };
      expect(tipFor('tab:Today', ctx), armed).toBe('settings');
      expect(tipFor('children:many', ctx), armed).toBe('babies');
      expect(tipFor('tab:Today', { ...ctx, seen: ['settings'] }), armed).toBeNull();
      expect(tipFor('tab:Today', { ...ctx, hour: 3 }), armed).toBeNull();
      expect(tipFor('tab:Today', { ...ctx, mainDone: false }), armed).toBeNull();
    }
  });
});
