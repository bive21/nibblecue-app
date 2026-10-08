/**
 * Every sentence the sync layer says to a parent (docs/OFFLINE_SYNC.md §6).
 *
 * ONE FILE, BECAUSE THE WORDS ARE THE FEATURE. A queue that works and explains itself badly is
 * a queue a parent does not trust, and the only way to review copy is to be able to read it all
 * at once. The worker, the pull engine and the repository therefore hand UP data — a count, a
 * container id, a caregiver's name — and never a sentence; `worker.ts`'s `SyncNotice` is that
 * split, and this is the other half of it.
 *
 * The rules these strings are written to, all of them from §6 and `docs/DESIGN_SYSTEM.md` §18:
 *
 *   * Never blame the parent, never ask them to log something again, never say a log was lost.
 *     `docs/OFFLINE_SYNC.md` §6 forbids "sync failed", "data lost", "unknown error", a bare
 *     error code and anything implying a re-entry — `copy.test.ts` scans this file, the banner
 *     and the inspector for all five and proves the scan is not vacuous.
 *   * Say where the entry IS, not what the network did. "It's still on your phone" is the
 *     sentence that answers the question a parent actually has.
 *   * Sentence case, US English, no clinical register, and a number is a number.
 *   * A duplicate is reported as a non-event ("no duplicate created"), because the app just
 *     protected them from something and the tone should match.
 */
import { BRAND } from '@nibblecue/brand';
import type { PushErrorCode } from '@nibblecue/core';

/* ---------------------------------------------------------------- toasts */

/**
 * The reconnect toast. "one server record each" is the promise R-2 makes about a queue that
 * drained: whatever the retries did, there is exactly one row per entry on the other side.
 */
export const backOnline = (n: number): string =>
  `Back online. ${n} queued ${n === 1 ? 'entry' : 'entries'} synced, one server record each.`;

/** The first write made while offline, once per offline period — never once per entry. */
export const firstOfflineWrite = 'Offline. Logging keeps working and queues for sync.';

export const duplicateBottle = 'Just logged that bottle. No duplicate created.';
export const duplicateChange = 'Just logged that change. No duplicate created.';
/** The widget's double tap, where the parent cannot see a sheet to know it worked. */
export const duplicateOneTap = 'Double tap ignored. One diaper, not two.';

/** Two phones started the same timer; the earlier start won (D19). `at` is already formatted. */
export const timerMerged = (at: string, by: string): string =>
  `Timer merged. Started ${at} by ${by}.`;

/**
 * The stash drew more than was there, so the draw was rewritten and the difference recorded as
 * an adjustment. It names the other caregiver because the number changing under a parent with
 * no explanation is the thing that makes a stash untrustworthy.
 */
export const stashAdjusted = (by: string, amount: string): string =>
  `Stash updated. This container was already used by ${by}. Adjusted to ${amount}.`;

/**
 * This phone's stop of a pump timer reached the server second, so the session was already saved
 * — and what this phone stored from it was not added (the owner's decision, 2026-09-24: "just
 * nullify the entry on the second phone"). A non-event about the session, and a plain fact about
 * the stash, because a bag that vanishes with no word is what makes a stash untrustworthy.
 * `amount` is already in the parent's unit.
 */
export const stashSaveNullified = (amount: string): string =>
  `Pump session already saved on another phone. No duplicate. The ${amount} stored here is not in the stash.`;

/* ---------------------------------------------------------------- the banner */

export const failedValidation =
  "This entry couldn't be saved to the household. It's still on your phone. Tap to review.";

export const failedPermission =
  "Your role can't save this. Nothing was lost; ask an owner or parent to change your access.";

/**
 * A REFUSAL THAT IS NOT ABOUT THE ROLE THIS PERSON HAS HERE (the owner on staging, 2026-09-29:
 * "your role can't save this. (I am parent)").
 *
 * A sign-in brings back what the last session could not send (`sync/replay.ts`), and some of it
 * can belong to a household this account has since left: removed, a seat that ended, a household
 * deleted. The server refuses those whatever the person is in the household the phone shows now,
 * so the sentence says where the entries belong and where they are, and asks nothing: there is no
 * role here to change, and no Try again that could help.
 */
export const failedElsewhere =
  "Some entries were made in a household you're no longer part of. They're safe on this phone.";

/**
 * THE SERVER'S OWN REFUSAL (the owner on staging, 2026-09-28). The server answered, and would not
 * take these ops: an error its own code has no name for, the `SERVER` label. It used to earn
 * `serverDown` below, so an online phone was told the server could not be reached and that its
 * entries would sync by themselves, about ops the server had refused ten times and was going to
 * refuse again. This says what is true: where the entries are, what did not happen, the one thing
 * to press, and who to tell. The address is the brand's, never typed here (CLAUDE.md §1).
 */
export const failedServer = `Some entries couldn't be saved to the server. They're safe on this phone. Try again, and if it keeps happening, tell us at ${BRAND.supportEmail}.`;

/**
 * REAL NETWORK TROUBLE: the phone says it is online and the requests get no answer at all. Only
 * then — the worker dates such a run (`stalledBy: 'network'`), and the banner waits out the same
 * grace a failure gets. True as it stands: nothing was refused, and the queue sends by itself.
 */
export const serverDown =
  "We can't reach the server. Your entries are safe on this phone and will sync automatically.";

/** Which of the three sentences a terminal rejection earns. */
export type SyncFailureClass = 'validation' | 'permission' | 'server';

/**
 * What the one banner can be about: a rejection's class, a server nothing reaches, or a role
 * refusal of entries from a household the account is no longer in (`failedElsewhere`).
 */
export type SyncBannerKind = SyncFailureClass | 'unreachable' | 'elsewhere';

/**
 * `FORBIDDEN` is the one code that means the person, not the entry: their role cannot write
 * this, so "tap to review" would send them to a screen where nothing they can do helps.
 * Everything else that reaches a FAILED row is about the entry itself.
 */
export const failureClassOf = (code: PushErrorCode): SyncFailureClass =>
  code === 'FORBIDDEN' ? 'permission' : code === 'SERVER' ? 'server' : 'validation';

export const failureBanner = (kind: SyncBannerKind): string =>
  kind === 'permission'
    ? failedPermission
    : kind === 'elsewhere'
      ? failedElsewhere
      : kind === 'server'
        ? failedServer
        : kind === 'unreachable'
          ? serverDown
          : failedValidation;

/* ---------------------------------------------------------------- bylines */

/** The capture sheet's byline while the phone has no connection (§6). */
export const captureBylineOffline = 'Saved on this phone, queued for sync';
export const captureBylineOnline = 'Saves immediately, syncs to the household';

/**
 * The Reports note while the backfill phase is still walking the household's history. It is the
 * same string as `phases.ts`'s `BACKFILL_NOTE`, which is where the phase is read; it is repeated
 * here because this is the file a copy review reads, and `copy.test.ts` pins the two together so
 * they cannot drift.
 */
export const backfillNote = 'Still loading older entries';
