/**
 * GROWTH PROMPTS — the review ask, cross-promotion, and the upgrade nudge (docs/GROWTH_PROMPTS.md).
 *
 * Three things the business wants to say to a parent that are not about the baby. Each is a
 * legitimate thing to ask; each is also exactly the interruption `IN_APP_MESSAGES.md` exists to
 * forbid. So the rules live HERE, as one pure function, rather than as three screens that each
 * remember to check: a prompt that slipped through because its own component forgot a condition
 * is the failure mode this file exists to make impossible.
 *
 * > **The governing rule:** a parent who opens the app at 3 a.m. to log a bottle never has to
 * > dismiss anything first. A growth prompt that breaks that rule is a defect however well it
 * > converts.
 *
 * ONE BUDGET, SHARED. Three systems each firing "only once a fortnight" is one every five days,
 * which is how an app becomes something a person mutes. `decide` takes the whole history and
 * returns AT MOST ONE prompt, or none.
 *
 * EVERYTHING IS DECIDED FROM LOCAL STATE, so it works offline and needs no server round trip to
 * stay quiet. Only the impression and the outcome are written back.
 */

import { DAYTIME } from '../today/daytime';

export const GROWTH_KINDS = ['REVIEW', 'PROMO', 'UPGRADE'] as const;
export type GrowthKind = (typeof GROWTH_KINDS)[number];

export const GROWTH_EVENTS = [
  'IMPRESSION',
  'ACCEPT',
  'DISMISS',
  'PLATFORM_SHOWN',
  'PLATFORM_SKIPPED',
] as const;
export type GrowthEvent = (typeof GROWTH_EVENTS)[number];

/** A row of `growth_prompt_events`, as this device knows it. */
export interface GrowthRecord {
  kind: GrowthKind;
  event: GrowthEvent;
  atMs: number;
  /** PROMO only: which campaign it was. */
  campaignId?: string | null;
}

const DAY = 86_400_000;

/** The numbers §1 and §2.2 fix. Exported so a test asserts the document rather than a literal. */
export const GROWTH_RULES = {
  /** Nothing at all in the first three days: the first week is the parent learning the app. */
  quietDays: 3,
  /** One prompt of ANY kind per fortnight, per user — the shared budget. */
  budgetDays: 14,
  /** After an error the parent actually saw. Asking for a rating after a failure is rude. */
  afterErrorHours: 24,
  review: {
    /**
     * THREE WEEKS, a week past the fortnight of free Plus (2026-09-28). The preview's own sheets
     * and cards speak on days 7, 11 and 14: a rating asked inside that fortnight lands while the
     * parent is deciding whether to pay, and one asked the day Plus falls away asks them at the
     * least pleased they will be. By day 21 they have settled on a plan, either way.
     */
    minAccountDays: 21,
    minActivities: 20,
    /** Either a second caregiver, or this many distinct days logged. */
    minLoggedDays: 7,
    /** A third of a year between asks. */
    cooldownDays: 120,
    /**
     * APPLE'S OWN CAP, and no more (the owner, 2026-09-28: *"the occasional rate … until user
     * actually rates us"*). Neither store tells an app whether a rating was left, so "until they
     * rate" can only mean "occasionally, for as long as the platform agrees to show it": iOS shows
     * its prompt at most three times in 365 days, and Play keeps an unpublished quota of its own.
     */
    maxPerYear: 3,
    /**
     * Two "Not now" taps and it never asks again. Kept for the rows an older build wrote: since
     * 2026-09-28 there is no card of the app's own to say "Not now" on (`reviewMomentMayAsk`).
     */
    retireAfterDismissals: 2,
    /**
     * THE MOMENT ITSELF. The platform's prompt rises this long after the card that earned it
     * closed, and never later than `withinMs` (a parent who has moved on is on the way into the
     * next thing), and only in the daytime: the app's one pair of hours (`DAYTIME`, 8 a.m. to
     * 9 p.m.), which the trial sheets, the celebration card, the tips and Calm motion keep too.
     */
    moment: {
      afterMs: 1_500,
      withinMs: 30_000,
      fromHour: DAYTIME.fromHour,
      untilHour: DAYTIME.untilHour,
    },
  },
  promo: {
    minAccountDays: 30,
    minLoggedDays: 10,
  },
  upgrade: {
    minAccountDays: 14,
  },
} as const;

/**
 * What the app knows about this parent right now. Every field is readable from local state
 * except the flags, which arrive with the account and default to off.
 */
export interface GrowthContext {
  nowMs: number;
  /** When the account was created. */
  accountCreatedMs: number;
  /** Activities this user has logged, ever. */
  activitiesLogged: number;
  /** Distinct local days on which this user logged something. */
  loggedDays: number;
  /** A second caregiver is in the household. */
  hasSecondCaregiver: boolean;
  /** The parent is in the middle of something: a timer, a sheet, a flow. */
  busy: boolean;
  /** Night mode is on. Night mode is for one thing. */
  night: boolean;
  /** When the parent last SAW an error — a sync failure, a failed export, a crash. */
  lastErrorMs: number | null;
  /** Every growth event this device knows about, in any order. */
  history: readonly GrowthRecord[];
  /** The kill switches, from admin. All default to off: a prompt ships dark. */
  flags: { review: boolean; promo: boolean; upgrade: boolean };
  /**
   * A moment worth asking at, and only at: the weekly summary was read, a celebration card was
   * viewed, or a schedule day finished with every slot done (§2.2). Absent means no.
   */
  earnedMoment: boolean;
  /** The cross-promotion campaign, when admin has published one. Null and the card is inert. */
  campaignId: string | null;
  /** A paywall was dismissed this recently; the upgrade nudge waits 7 days after one. */
  lastPaywallDismissMs: number | null;
}

export type GrowthDecision = { show: GrowthKind } | { show: null; because: string };

const latest = (
  history: readonly GrowthRecord[],
  match: (r: GrowthRecord) => boolean,
): number | null => {
  const hits = history.filter(match).map(r => r.atMs);
  return hits.length === 0 ? null : Math.max(...hits);
};

const countIn = (
  history: readonly GrowthRecord[],
  match: (r: GrowthRecord) => boolean,
  sinceMs: number,
): number => history.filter(r => match(r) && r.atMs >= sinceMs).length;

/**
 * At most one prompt, or none with the reason why — and the reason is returned rather than
 * logged, because "why did nothing show" is the question every test in this module asks.
 *
 * The order is the order the rules are written in `GROWTH_PROMPTS.md` §1: the common rules
 * first, because a parent mid-flow is not eligible for anything, and only then the per-kind
 * ones. Kinds are considered review → promo → upgrade, which is the order of how much the ask
 * is earned: a rating is asked of someone who just had a good moment, a promo of someone who
 * has been here a month, and the nudge is the one the plan flow already has other chances at.
 */
export function decide(ctx: GrowthContext): GrowthDecision {
  const none = (because: string): GrowthDecision => ({ show: null, because });

  // ---- the common rules (§1). Nothing gets past these.
  if (ctx.busy) return none('busy');
  if (ctx.night) return none('night');
  const accountDays = (ctx.nowMs - ctx.accountCreatedMs) / DAY;
  if (accountDays < GROWTH_RULES.quietDays) return none('too new');
  if (
    ctx.lastErrorMs !== null &&
    ctx.nowMs - ctx.lastErrorMs < GROWTH_RULES.afterErrorHours * 3_600_000
  ) {
    return none('an error was seen');
  }
  const lastAny = latest(ctx.history, r => r.event === 'IMPRESSION');
  if (lastAny !== null && ctx.nowMs - lastAny < GROWTH_RULES.budgetDays * DAY) {
    return none('budget spent');
  }

  // ---- the review ask (§2.2)
  if (reviewEarned(ctx)) return { show: 'REVIEW' };
  // ---- cross-promotion (§3.2)
  if (promoEarned(ctx)) return { show: 'PROMO' };
  // ---- the extra upgrade nudge (§4)
  if (upgradeEarned(ctx)) return { show: 'UPGRADE' };
  return none('nothing earned');
}

/** Why the review ask is or is not available, on its own — the caller usually wants `decide`. */
export function reviewEarned(ctx: GrowthContext): boolean {
  const r = GROWTH_RULES.review;
  if (!ctx.flags.review) return false;
  if (!ctx.earnedMoment) return false;
  if ((ctx.nowMs - ctx.accountCreatedMs) / DAY < r.minAccountDays) return false;
  if (ctx.activitiesLogged < r.minActivities) return false;
  // the two signals that a parent is actually living in the app; either will do
  if (!ctx.hasSecondCaregiver && ctx.loggedDays < r.minLoggedDays) return false;
  // two "Not now" taps and it is retired for good
  if (
    countIn(ctx.history, x => x.kind === 'REVIEW' && x.event === 'DISMISS', 0) >=
    r.retireAfterDismissals
  ) {
    return false;
  }
  const lastAsk = latest(ctx.history, x => x.kind === 'REVIEW' && x.event === 'IMPRESSION');
  if (lastAsk !== null && ctx.nowMs - lastAsk < r.cooldownDays * DAY) return false;
  const thisYear = countIn(
    ctx.history,
    x => x.kind === 'REVIEW' && x.event === 'IMPRESSION',
    ctx.nowMs - 365 * DAY,
  );
  return thisYear < r.maxPerYear;
}

/** Cross-promotion: once per campaign, ever, and inert with no campaign at all (§3.2, §3.3). */
export function promoEarned(ctx: GrowthContext): boolean {
  const p = GROWTH_RULES.promo;
  if (!ctx.flags.promo) return false;
  // THE MECHANISM SHIPS, THE CAMPAIGN DOES NOT. With nothing published there is nothing to show,
  // and that is a state the code path has to handle rather than a case that cannot arise.
  if (ctx.campaignId === null) return false;
  if ((ctx.nowMs - ctx.accountCreatedMs) / DAY < p.minAccountDays) return false;
  if (ctx.loggedDays < p.minLoggedDays) return false;
  const seen = ctx.history.some(
    x => x.kind === 'PROMO' && x.event === 'IMPRESSION' && x.campaignId === ctx.campaignId,
  );
  return !seen;
}

/**
 * The EXTRA upgrade nudge only. The end-of-preview card and the gate-opened paywall are part of
 * the plan flow and are exempt from this budget entirely (§4) — they never come through here.
 */
export function upgradeEarned(ctx: GrowthContext): boolean {
  if (!ctx.flags.upgrade) return false;
  if (ctx.lastPaywallDismissMs !== null && ctx.nowMs - ctx.lastPaywallDismissMs < 7 * DAY) {
    return false;
  }
  return (ctx.nowMs - ctx.accountCreatedMs) / DAY >= GROWTH_RULES.upgrade.minAccountDays;
}

/** What the moment looks like when the review ask is due (§2.3). */
export interface ReviewMoment {
  /** Since the card that earned the ask was closed; null when none was, this session. */
  msSinceMoment: number | null;
  /** A timer running, a sheet or a popover up, the tour on, Today not in front. */
  busy: boolean;
  /** Night is on. */
  night: boolean;
  /** The phone's own local hour, 0 to 23. */
  hour: number;
}

/**
 * WHETHER THE PLATFORM'S RATING PROMPT MAY RISE NOW (§2.3). The app shows no card of its own
 * first: both stores forbid a question before their prompt ("Do you like the app?" is Google's own
 * example) and a button that calls it (Apple: the system may show nothing, so a tap would do
 * nothing). So the request is made once, straight after a good moment has closed, with nothing
 * else on the screen, in the daytime; and a moment that has passed waits for the next one.
 */
export function reviewMomentMayAsk(m: ReviewMoment): boolean {
  const t = GROWTH_RULES.review.moment;
  if (m.msSinceMoment === null || m.msSinceMoment < t.afterMs || m.msSinceMoment > t.withinMs) {
    return false;
  }
  if (m.busy || m.night) return false;
  return m.hour >= t.fromHour && m.hour < t.untilHour;
}
