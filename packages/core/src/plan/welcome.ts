/**
 * The 14-day Plus preview (docs/AUTH_AND_TRIAL.md §3–4) as the app sees it. One rule above
 * all: the device never decides entitlement. A cached plan stays what the server last said
 * until the server says otherwise — a clock moved forward does not end it, a day offline does
 * not end it, and only a successful refresh moves WELCOME to FREE.
 */
import {
  can,
  limitFor,
  tierFor,
  type FeatureKey,
  type PlanStatus,
  type Tier,
} from './entitlements';
import { planStatusFrom, type PlanRowInput } from './plan-status';
import { WELCOME_PREVIEW_DAYS } from './pricing.generated';

/**
 * welcome_preview.days in pricing.config.json — the server's app.welcome_days() is the same 14.
 * Read through `pricing.generated.ts`, so the rest of the config is not bundled (`packages.ts`).
 */
export const WELCOME_DAYS: number = WELCOME_PREVIEW_DAYS;
/** The first warning card appears with this many days left (day 11 of 14). */
export const WELCOME_WARNING_DAYS_LEFT = 3;

const dayMs = 86_400_000;

/** Whole days from `now` to `iso`, rounded up, never negative. */
export function daysLeft(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / dayMs));
}

export interface PlanSnapshot {
  status: PlanStatus;
  tier: Tier;
  daysLeft: number | null;
  expiresAt: string | null;
  /** Server time when this was computed — the anchor every later display uses. */
  computedAt: number;
}

/** Derive the plan from the entitlement row, at server time. */
export function planSnapshot(row: PlanRowInput | null, serverNow: number): PlanSnapshot {
  const status = planStatusFrom(row, serverNow);
  const expiresAt = row?.current_period_end ?? null;
  const counting =
    status === 'WELCOME' || status === 'TRIAL' || status === 'CANCELLED_AT_PERIOD_END';
  return {
    status,
    tier: tierFor(status),
    daysLeft: counting ? daysLeft(expiresAt, serverNow) : null,
    expiresAt,
    computedAt: serverNow,
  };
}

/**
 * The plan to show right now from the last snapshot. The status is the server's word and is
 * not re-derived from the device clock; only the day count moves, and it moves at most as
 * fast as real time since the snapshot as the device measured it.
 */
export function cachedPlan(
  snapshot: PlanSnapshot,
  deviceNow: number,
  deviceNowAtSnapshot: number,
): PlanSnapshot {
  if (snapshot.daysLeft === null || !snapshot.expiresAt) return snapshot;
  const elapsed = Math.max(0, deviceNow - deviceNowAtSnapshot);
  return { ...snapshot, daysLeft: daysLeft(snapshot.expiresAt, snapshot.computedAt + elapsed) };
}

/**
 * ON NOW ONLY BECAUSE OF THE PREVIEW (the owner, 2026-09-28: *"From marketing point of view, how can
 * I sell the system more?"*). Every household spends its first 14 days on Plus, and nothing used to
 * say which parts of the app were Plus while they were unlocked, so a parent reached the end of the
 * preview without knowing what it had been. This is the question the quiet "Plus" tag asks
 * (`apps/mobile/src/plan/PlusTag.tsx`): the free plan would not have `key`, and the household's
 * plan is the preview.
 *
 * NEVER ON A PAID PLAN, whose parent chose Plus and has no need to be told it again, and NEVER ON
 * FREE, where the lock on the control already says so. A bill-of-rights row and a free row are
 * never tagged, whatever the plan, because `can(key, 'FREE')` is true for both. The status name is
 * read here and in `PlanProvider`, never by a screen (CLAUDE.md §4).
 */
export function previewOnly(key: FeatureKey, plan: Pick<PlanSnapshot, 'status'>): boolean {
  return plan.status === 'WELCOME' && !can(key, 'FREE');
}

/**
 * THE CAP THE FREE PLAN WOULD HOLD `key` TO, while the preview is what lifts it: the history
 * window's 7 days, which is where the Activity log draws its "Older than 7 days" line during the
 * preview. Null on every other plan, and for a feature that is not counted. The number is the
 * matrix's (`limitFor`), never typed.
 */
export function previewLimit(key: FeatureKey, plan: Pick<PlanSnapshot, 'status'>): number | null {
  return previewOnly(key, plan) ? limitFor(key, 'FREE') : null;
}

/**
 * THE TWO MOMENTS THE PREVIEW ASKS, ONCE EACH (the owner, 2026-09-27: *"think about the 7days
 * before trial ends pop up if they would like to subscribe, then h-3 trial ends"*). With seven
 * days left, and with three: "H-3" is three days before the day it ends, the same day the Today
 * card has always spoken on.
 *
 * Each is a sheet, not the Today card. The card stays the quiet fallback for a parent the sheet
 * never finds a moment for (`promptMayShow`), and the three-day sheet and the three-day card are
 * one message: whichever a parent answers first ends both (`apps/mobile/src/plan/PlanProvider`).
 */
export type WelcomePrompt = 'seven_days_left' | 'three_days_left';

/** The day counts each prompt opens on. The three-day one is the Today card's own. */
export const WELCOME_PROMPT_DAYS_LEFT: Readonly<Record<WelcomePrompt, number>> = {
  seven_days_left: 7,
  three_days_left: WELCOME_WARNING_DAYS_LEFT,
};

/**
 * Which prompt is due, if any. Only a preview that is still running asks, only a parent who could
 * decide asks (a caregiver or a view-only seat is never sold to), and each prompt asks once: the
 * seven-day one gives way to the three-day one as soon as that is due, answered or not, so a
 * parent the first never found a moment for is not handed two in a row.
 */
export function welcomePrompt(
  plan: PlanSnapshot,
  welcome: { granted: boolean; decides: boolean },
  seen: { sevenDaysLeft: boolean; threeDaysLeft: boolean },
): WelcomePrompt | null {
  if (!welcome.granted || !welcome.decides) return null;
  if (plan.status !== 'WELCOME' || plan.daysLeft === null || plan.daysLeft <= 0) return null;
  if (plan.daysLeft <= WELCOME_PROMPT_DAYS_LEFT.three_days_left) {
    return seen.threeDaysLeft ? null : 'three_days_left';
  }
  if (plan.daysLeft <= WELCOME_PROMPT_DAYS_LEFT.seven_days_left) {
    return seen.sevenDaysLeft ? null : 'seven_days_left';
  }
  return null;
}

/**
 * WHEN A PROMPT MAY RISE (docs/IN_APP_MESSAGES.md: "a parent who opens the app at 3 a.m. to log a
 * bottle must never have to dismiss something first"). A sheet is a modal, so every rule here is
 * about never meeting a parent on the way INTO a task:
 *
 *   · AFTER A SAVE, never on opening the app. The parent came to do something and has done it.
 *   · AFTER THE SAVE'S UNDO HAS HAD ITS TIME. The toast carries Undo, and a sheet over it would
 *     take that away; `afterSaveMs` is longer than the toast's life.
 *   · NOT WHILE ANYTHING ELSE IS GOING ON: a running timer, another sheet, the tour.
 *   · IN THE DAYTIME ONLY, on the phone's own clock, and never in Night. The baby's night is when
 *     the app is opened with one hand, and it is not the moment to be sold to.
 */
export const PROMPT_TIMING = {
  /**
   * From a save to the prompt: past the save toast and its Undo. The longest toast, Undo beside a
   * twin's "+ Liam", stays 7 seconds (`@nibblecue/ui` toastQueue); the app's test holds this past it.
   */
  afterSaveMs: 8_000,
  /**
   * And no later than this after it. A parent who comes back to Today a while after a save may be
   * on the way into the next task, which is exactly when nothing may rise; the next save is the
   * next chance.
   */
  withinMs: 60_000,
  /** The phone's local hours the prompt may appear in: from 8 a.m. to 9 p.m. */
  fromHour: 8,
  untilHour: 21,
} as const;

export interface PromptMoment {
  /** How long ago this parent last saved something on this phone, or null for not this session. */
  msSinceSave: number | null;
  /** A timer running, a sheet open, the tour: anything in progress vetoes. */
  busy: boolean;
  /** The phone's local hour, 0 to 23. */
  hour: number;
  /** Night (the amber theme) is on. */
  night: boolean;
}

export function promptMayShow(m: PromptMoment): boolean {
  if (m.msSinceSave === null || m.msSinceSave < PROMPT_TIMING.afterSaveMs) return false;
  if (m.msSinceSave > PROMPT_TIMING.withinMs) return false;
  if (m.busy || m.night) return false;
  return m.hour >= PROMPT_TIMING.fromHour && m.hour < PROMPT_TIMING.untilHour;
}

export type WelcomeCard = 'three_days_left' | 'ended' | null;

/**
 * Which of the two dismissible cards Today shows (AUTH_AND_TRIAL.md §3): never a push, never a modal.
 *
 * ONLY TO THE PEOPLE WHO DECIDE, AND ONLY TO THOSE WHO WERE THERE (2026-09-27; the owner left it to
 * this side: *"Your call on day 11"*). The day-11 card and the *preview ended* card are about paying,
 * so they go to the owner and the parents (`decides`), as the trial-end sheets already did; a
 * caregiver on a timed seat is never sold to. And *the preview has ended* is news only to someone who
 * had it: a partner who joins on day 20 is not told on their first day that something ended
 * (`joinedDuring`, from `joinedDuringPreview`).
 */
export function welcomeCard(
  plan: PlanSnapshot,
  welcome: { granted: boolean; summarySeen: boolean; decides: boolean; joinedDuring: boolean },
  dismissed: { threeDaysLeft: boolean },
): WelcomeCard {
  if (!welcome.granted || !welcome.decides) return null;
  if (plan.status === 'WELCOME') {
    return plan.daysLeft !== null &&
      plan.daysLeft <= WELCOME_WARNING_DAYS_LEFT &&
      !dismissed.threeDaysLeft
      ? 'three_days_left'
      : null;
  }
  if (plan.status === 'FREE' && !welcome.summarySeen && welcome.joinedDuring) return 'ended';
  return null;
}

/**
 * WHETHER THIS MEMBER JOINED WHILE THE PREVIEW WAS ON: `joined_at` before the household's
 * `welcome_expires_at`. Either one unknown (an account read by a build before `joined_at` was
 * carried, for the moment until the next read) counts as yes, which is how every member was treated
 * before the rule existed.
 */
export function joinedDuringPreview(
  joinedAt: string | null,
  welcomeExpiresAt: string | null,
): boolean {
  if (joinedAt === null || welcomeExpiresAt === null) return true;
  const joined = Date.parse(joinedAt);
  const ended = Date.parse(welcomeExpiresAt);
  if (!Number.isFinite(joined) || !Number.isFinite(ended)) return true;
  return joined < ended;
}
