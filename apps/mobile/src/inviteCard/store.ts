/**
 * THE ANSWER TO LOG TOGETHER, KEPT ON THIS PHONE (docs/SHARED_CARE.md §6).
 *
 * ONE KEY PER PERSON, in the preferences, the way the plan cards keep whether they were seen
 * (`plan/PlanProvider.tsx`). Not synced: *Not now* and *Just me* are said by the person holding the
 * phone, and an invite made here is known here. It is not a device-level key, so a sign-out sweeps
 * it, and so does a household leaving the phone (`prefs/index.ts`): a new household is a new
 * question. What stands in for the answer on a new phone is the card's own patience: never in the
 * first session, never on the first day.
 *
 * AN ANSWER WRITTEN ANYWHERE IS HEARD AT ONCE. Family writes one when an invite is made there, and
 * the card on Today is mounted underneath all the while; so each write says so through the app's
 * change store (`data/store.ts`, the way a seeder re-arms the tour: `keys.tour`), and the card
 * reads its answer again before the parent is back.
 *
 * Pure over the two stores it is handed, so a node test runs it against `memoryStore`.
 */
import { keepInviteAnswer, readInviteCardRecord, type InviteCardRecord } from '@nibblecue/core';
import type { Store } from '../data/store';
import type { KeyValueStore } from '../prefs';

/** The preference: this person's answer, as JSON (`{ answer, atMs }`). */
export const inviteCardKey = (userId: string): string => `invite_card:${userId}`;

/** The change-store key a write bumps, so the card reads its answer again. */
export const inviteCardSignal = (userId: string): string => `invite_card/${userId}`;

export async function loadInviteCardRecord(
  prefs: KeyValueStore,
  userId: string,
): Promise<InviteCardRecord | null> {
  return readInviteCardRecord(await prefs.get(inviteCardKey(userId)));
}

/**
 * Keep a new answer, never over one that ended the card (`keepInviteAnswer`), and say so. Returns
 * the answer as kept.
 */
export async function saveInviteCardAnswer(
  prefs: KeyValueStore,
  signals: Pick<Store, 'invalidate'>,
  userId: string,
  next: InviteCardRecord,
): Promise<InviteCardRecord> {
  const kept = keepInviteAnswer(await loadInviteCardRecord(prefs, userId), next);
  await prefs.set(inviteCardKey(userId), JSON.stringify(kept));
  signals.invalidate(inviteCardSignal(userId));
  return kept;
}
