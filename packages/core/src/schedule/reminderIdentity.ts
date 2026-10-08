/**
 * WHAT MAKES A REMINDER THE SAME REMINDER on the phone and from the server (2026-09-24).
 *
 * The phone plans its own reminders (`apps/mobile/src/notifications/plan.ts`) and the server
 * pushes the ones no phone will ring (`supabase/functions/_shared/push.ts`). When both exist for
 * one slot they must be ONE notification to the parent: the push carries the id the phone would
 * have given it, so it takes the local one's place in the shade instead of stacking beside it, and
 * the phone's reconcile keeps it while the slot is open and takes it down once it is answered. The
 * id, the button category and the channel names are therefore a contract between two programs, and
 * this file is where the contract lives.
 */
import type { DeliveryLevel } from './duty';

/** Every id this app puts on a phone starts with it; anything else is never touched. */
export const REMINDER_ID_PREFIX = 'cc:';

/** The category a schedule reminder is posted in — its "Log it" and "Snooze" buttons. */
export const REMINDER_CATEGORY = 'reminder';

/**
 * HOW FAR AHEAD OF ITS SLOT A SCHEDULE REMINDER RINGS: five minutes (the owner, 2026-09-28: *"when
 * up next is coming (5 minutes before)"*). The phone rings its own copy this far ahead
 * (`apps/mobile/src/notifications/plan.ts`), and the server's batch takes an unclaimed one this far
 * ahead too (migration 0138, `app.reminder_rings_at`, which spells the same five minutes in SQL and
 * whose test holds the two to each other).
 *
 * IT IS NOT PART OF THE ID. The id below names the moment the reminder is FOR — the slot, or where
 * quiet hours or a snooze moved it — and the server's `fire_at` is that same moment, so the two
 * copies stay one notification. When it RINGS is a delivery detail on top: five minutes early, at
 * the slot's own time when the slot was less than five minutes away by the time the phone heard of
 * it, and never inside quiet hours. An id that carried the ringing moment would change the minute
 * the lead passed, and the reconcile would take down a reminder that had just rung and ring it again.
 */
export const COMING_UP_LEAD_MS = 5 * 60_000;

/**
 * A slot's reminder id: the rule and the slot's own time, then the moment it is for and on which
 * channel — how it is delivered is part of what it is (plan.ts's header has the story).
 */
export const slotReminderId = (
  ruleId: string,
  atMs: number,
  firesMs: number,
  channel: string,
): string => `${REMINDER_ID_PREFIX}slot:${ruleId}:${atMs}:${firesMs}:${channel}`;

/** The Android channel for a kind at a level; importance is fixed per channel, so a level is a channel. */
export const channelOfLevel = (activity: string, level: DeliveryLevel): string =>
  level === 'sound'
    ? `${activity}_alerts`
    : level === 'vibrate'
      ? `${activity}_quiet`
      : `${activity}_silent`;
