/**
 * The eligibility engine, against `docs/GROWTH_PROMPTS.md` §6's acceptance criteria. Most of
 * these tests assert that NOTHING happens, which is the point: this module's job is to keep a
 * parent from being interrupted, and every rule in it is one more reason to stay quiet.
 */
import { describe, expect, it } from 'vitest';
import {
  decide,
  GROWTH_EVENTS,
  GROWTH_KINDS,
  GROWTH_RULES,
  promoEarned,
  reviewEarned,
  reviewMomentMayAsk,
  upgradeEarned,
  type GrowthContext,
  type GrowthRecord,
} from './index';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 17, 15, 0);

/** A parent who has earned the review ask by every measure, at a moment worth asking at. */
const earned = (over: Partial<GrowthContext> = {}): GrowthContext => ({
  nowMs: NOW,
  accountCreatedMs: NOW - 40 * DAY,
  activitiesLogged: 300,
  loggedDays: 30,
  hasSecondCaregiver: true,
  busy: false,
  night: false,
  lastErrorMs: null,
  history: [],
  flags: { review: true, promo: false, upgrade: false },
  earnedMoment: true,
  campaignId: null,
  lastPaywallDismissMs: null,
  ...over,
});

const record = (
  over: Partial<GrowthRecord> & Pick<GrowthRecord, 'kind' | 'event'>,
): GrowthRecord => ({
  atMs: NOW - DAY,
  ...over,
});

describe('the rules that keep a parent from being interrupted', () => {
  it('shows the review ask when every condition holds — so the rest of these mean something', () => {
    expect(decide(earned())).toEqual({ show: 'REVIEW' });
  });

  it('says nothing in the first three days, whatever else is true', () => {
    for (const days of [0, 1, 2.9]) {
      const d = decide(earned({ accountCreatedMs: NOW - days * DAY }));
      expect(d, `${days} days old`).toEqual({ show: null, because: 'too new' });
    }
    expect(GROWTH_RULES.quietDays).toBe(3);
  });

  it('says nothing while a timer runs, a sheet is open, or a flow is in progress', () => {
    expect(decide(earned({ busy: true }))).toEqual({ show: null, because: 'busy' });
  });

  it('says nothing in night mode', () => {
    expect(decide(earned({ night: true }))).toEqual({ show: null, because: 'night' });
  });

  it('says nothing for 24 hours after an error the parent actually saw', () => {
    const justAfter = earned({ lastErrorMs: NOW - 23 * 3_600_000 });
    expect(decide(justAfter)).toEqual({ show: null, because: 'an error was seen' });
    // and speaks again once the day is up
    expect(decide(earned({ lastErrorMs: NOW - 25 * 3_600_000 }))).toEqual({ show: 'REVIEW' });
  });

  it('spends one budget across all three kinds, not one each', () => {
    // a PROMO shown last week silences the review ask too: that is what "shared" means
    const spent = earned({
      history: [record({ kind: 'PROMO', event: 'IMPRESSION', atMs: NOW - 7 * DAY })],
    });
    expect(decide(spent)).toEqual({ show: null, because: 'budget spent' });
    const older = earned({
      history: [record({ kind: 'PROMO', event: 'IMPRESSION', atMs: NOW - 15 * DAY })],
    });
    expect(decide(older)).toEqual({ show: 'REVIEW' });
    expect(GROWTH_RULES.budgetDays).toBe(14);
  });

  it('never shows two at once: the answer is one kind, or none', () => {
    const both = earned({
      flags: { review: true, promo: true, upgrade: true },
      campaignId: 'c1',
      accountCreatedMs: NOW - 90 * DAY,
    });
    const d = decide(both);
    expect('show' in d && d.show).toBe('REVIEW');
  });
});

describe('the review ask', () => {
  /**
   * A WEEK PAST THE FORTNIGHT OF FREE PLUS: never while the parent is deciding whether to pay, and
   * never on the day Plus falls away.
   */
  it('waits for an account three weeks old and twenty entries in', () => {
    expect(reviewEarned(earned({ accountCreatedMs: NOW - 14 * DAY }))).toBe(false);
    expect(reviewEarned(earned({ accountCreatedMs: NOW - 20.9 * DAY }))).toBe(false);
    expect(reviewEarned(earned({ accountCreatedMs: NOW - 21 * DAY }))).toBe(true);
    expect(reviewEarned(earned({ activitiesLogged: 19 }))).toBe(false);
    expect(reviewEarned(earned({ activitiesLogged: 20 }))).toBe(true);
    expect(GROWTH_RULES.review.minAccountDays).toBe(21);
  });

  it('takes either signal that a parent lives in the app, and needs one of them', () => {
    // a second caregiver on its own is enough
    expect(reviewEarned(earned({ hasSecondCaregiver: true, loggedDays: 1 }))).toBe(true);
    // so is a week of distinct days on their own
    expect(reviewEarned(earned({ hasSecondCaregiver: false, loggedDays: 7 }))).toBe(true);
    // neither, and it waits
    expect(reviewEarned(earned({ hasSecondCaregiver: false, loggedDays: 6 }))).toBe(false);
  });

  it('only asks at a moment that was earned, never out of the blue', () => {
    expect(reviewEarned(earned({ earnedMoment: false }))).toBe(false);
  });

  it('is retired for good after two Not nows — not softened, stopped', () => {
    const once = earned({
      history: [record({ kind: 'REVIEW', event: 'DISMISS', atMs: NOW - 200 * DAY })],
    });
    expect(reviewEarned(once)).toBe(true);
    const twice = earned({
      history: [
        record({ kind: 'REVIEW', event: 'DISMISS', atMs: NOW - 400 * DAY }),
        record({ kind: 'REVIEW', event: 'DISMISS', atMs: NOW - 200 * DAY }),
      ],
    });
    expect(reviewEarned(twice)).toBe(false);
    // and a year later it is still retired: there is no clock on this one
    expect(reviewEarned({ ...twice, nowMs: NOW + 900 * DAY })).toBe(false);
  });

  /**
   * "UNTIL THEY RATE" IS THE PLATFORM'S TO KNOW (the owner, 2026-09-28). Neither store says whether
   * a rating was left, so the app asks occasionally for as long as the platform agrees to show its
   * prompt: a third of a year apart, and never more often than iOS's own three in 365 days.
   */
  it('waits 120 days between asks and never asks more than three times a year', () => {
    const recent = earned({
      history: [record({ kind: 'REVIEW', event: 'IMPRESSION', atMs: NOW - 100 * DAY })],
    });
    expect(reviewEarned(recent)).toBe(false);
    const twoThisYear = earned({
      history: [
        record({ kind: 'REVIEW', event: 'IMPRESSION', atMs: NOW - 300 * DAY }),
        record({ kind: 'REVIEW', event: 'IMPRESSION', atMs: NOW - 150 * DAY }),
      ],
    });
    expect(reviewEarned(twoThisYear)).toBe(true);
    const threeThisYear = earned({
      history: [
        record({ kind: 'REVIEW', event: 'IMPRESSION', atMs: NOW - 360 * DAY }),
        record({ kind: 'REVIEW', event: 'IMPRESSION', atMs: NOW - 240 * DAY }),
        record({ kind: 'REVIEW', event: 'IMPRESSION', atMs: NOW - 121 * DAY }),
      ],
    });
    expect(reviewEarned(threeThisYear)).toBe(false);
    // and the fourth waits until the oldest of the three is a year old
    expect(reviewEarned({ ...threeThisYear, nowMs: NOW + 6 * DAY })).toBe(true);
    expect(GROWTH_RULES.review.cooldownDays).toBe(120);
    expect(GROWTH_RULES.review.maxPerYear).toBe(3);
  });

  it('is off until the flag is on: it ships dark', () => {
    expect(reviewEarned(earned({ flags: { review: false, promo: true, upgrade: true } }))).toBe(
      false,
    );
  });
});

/**
 * THE MOMENT THE PLATFORM'S PROMPT RISES (§2.3). No card of the app's own comes first — both
 * stores forbid a question before their prompt and a button that calls it — so the only thing the
 * app decides is WHEN: shortly after a good moment closed, with nothing else going on, by day.
 */
describe('the moment the rating prompt may rise', () => {
  const calm = { msSinceMoment: 2_000, busy: false, night: false, hour: 11 };

  it('rises shortly after the card that earned it closed, and not before', () => {
    expect(reviewMomentMayAsk(calm)).toBe(true);
    expect(reviewMomentMayAsk({ ...calm, msSinceMoment: null })).toBe(false);
    expect(reviewMomentMayAsk({ ...calm, msSinceMoment: 1_499 })).toBe(false);
    expect(reviewMomentMayAsk({ ...calm, msSinceMoment: 1_500 })).toBe(true);
  });

  it('lets a moment that has passed go, rather than asking out of the blue later', () => {
    expect(reviewMomentMayAsk({ ...calm, msSinceMoment: 30_000 })).toBe(true);
    expect(reviewMomentMayAsk({ ...calm, msSinceMoment: 30_001 })).toBe(false);
  });

  it('never rises over something else, or in Night', () => {
    expect(reviewMomentMayAsk({ ...calm, busy: true })).toBe(false);
    expect(reviewMomentMayAsk({ ...calm, night: true })).toBe(false);
  });

  it('keeps the trial sheets’ daytime: from 8 a.m. to 9 p.m. on the phone’s own clock', () => {
    expect(reviewMomentMayAsk({ ...calm, hour: 3 })).toBe(false);
    expect(reviewMomentMayAsk({ ...calm, hour: 7 })).toBe(false);
    expect(reviewMomentMayAsk({ ...calm, hour: 8 })).toBe(true);
    expect(reviewMomentMayAsk({ ...calm, hour: 20 })).toBe(true);
    expect(reviewMomentMayAsk({ ...calm, hour: 21 })).toBe(false);
  });
});

describe('cross-promotion', () => {
  const promoReady = (over: Partial<GrowthContext> = {}): GrowthContext =>
    earned({
      flags: { review: false, promo: true, upgrade: false },
      campaignId: 'campaign-1',
      accountCreatedMs: NOW - 45 * DAY,
      loggedDays: 20,
      ...over,
    });

  it('cannot render without a campaign: the mechanism ships, the campaign does not', () => {
    expect(promoEarned(promoReady({ campaignId: null }))).toBe(false);
    expect(decide(promoReady({ campaignId: null }))).toEqual({
      show: null,
      because: 'nothing earned',
    });
  });

  it('waits for a month of account and ten days of use', () => {
    expect(promoEarned(promoReady({ accountCreatedMs: NOW - 29 * DAY }))).toBe(false);
    expect(promoEarned(promoReady({ loggedDays: 9 }))).toBe(false);
    expect(promoEarned(promoReady())).toBe(true);
  });

  it('shows once per campaign, ever — and a new campaign is a new ask', () => {
    const seen = promoReady({
      history: [
        record({
          kind: 'PROMO',
          event: 'IMPRESSION',
          atMs: NOW - 200 * DAY,
          campaignId: 'campaign-1',
        }),
      ],
    });
    expect(promoEarned(seen)).toBe(false);
    expect(promoEarned({ ...seen, campaignId: 'campaign-2' })).toBe(true);
  });
});

describe('the extra upgrade nudge', () => {
  const nudge = (over: Partial<GrowthContext> = {}): GrowthContext =>
    earned({ flags: { review: false, promo: false, upgrade: true }, ...over });

  it('never fires within a week of a dismissed paywall', () => {
    expect(upgradeEarned(nudge({ lastPaywallDismissMs: NOW - 3 * DAY }))).toBe(false);
    expect(upgradeEarned(nudge({ lastPaywallDismissMs: NOW - 8 * DAY }))).toBe(true);
  });

  it('is off by default, like the other two', () => {
    expect(upgradeEarned(earned())).toBe(false);
  });

  it('keeps its own fortnight, apart from the review ask’s three weeks', () => {
    expect(GROWTH_RULES.upgrade.minAccountDays).toBe(14);
    expect(upgradeEarned(nudge({ accountCreatedMs: NOW - 13 * DAY }))).toBe(false);
    expect(upgradeEarned(nudge({ accountCreatedMs: NOW - 14 * DAY }))).toBe(true);
  });
});

describe('the shapes the database and the admin console share', () => {
  it('names the three kinds and the five events the table checks', () => {
    expect([...GROWTH_KINDS]).toEqual(['REVIEW', 'PROMO', 'UPGRADE']);
    expect([...GROWTH_EVENTS]).toEqual([
      'IMPRESSION',
      'ACCEPT',
      'DISMISS',
      'PLATFORM_SHOWN',
      'PLATFORM_SKIPPED',
    ]);
  });
});
