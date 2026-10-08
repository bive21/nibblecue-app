/**
 * SETUP'S ANSWERS ARE KEPT THE MOMENT THE PARENT SENDS THEM, not when the server answers (the owner,
 * on staging, 2026-09-27: *"setup went through, but why do i have no schedule on the main page? i
 * also didnt remember seeing the screen asking about tour … same thing with supplies … nothing
 * except name, etc, brought over from onboarding question"*, and *"picked an avatar for my baby, it
 * also didnt show up"*).
 *
 * Everything the owner listed was written by ONE branch of `finish`: the one that runs when the
 * server's answer to Finish arrives and says "created". The rhythms, the medicines, the brands and
 * the bedtime (`pending-setup.ts`), the picture (`pending-photo.ts`) and the welcome window whose
 * button is what offered the tour. Every other way setup can end skipped all of them:
 *
 *   - the answer was lost on the way back (the household exists; the phone heard nothing), and the
 *     re-send that settles it (`leftover.ts`) could only ask for ~12 seconds after Today opened,
 *     which on a server still being deployed is not long enough;
 *   - the answer was a 409 — the account already owns a household, made by an earlier Finish
 *     whose draft is gone — and the answers of the Finish just tapped were dropped;
 *   - the app was killed while the welcome was up, so the tour was never armed.
 *
 * Only the name, the baby and the modules reached the app in all three, because those ride the
 * request itself. So the rest now goes to disk BEFORE the request is sent: whatever the server
 * says, or fails to say, the answers the parent sent are on this phone, and `SetupSeeder` writes
 * them into the household the moment it is on the phone (`drainSetup.ts`). A Finish that fails and
 * is tapped again writes them again, answers edited in between included; a draft that was never
 * sent writes nothing, so a setup abandoned on one phone is never merged into a household finished
 * on another.
 *
 * THE TOUR IS OWED THE SAME WAY. `SETUP_WELCOME_OWED` is set with the answers and taken back by the
 * welcome's own button, which arms the tour as it always has (`tourFromWelcome`). When the welcome
 * never showed, the seeder pays it (`payOwedTour`): the tour offers itself once, on Today, to the
 * owner of the household setup just made, and never to somebody who joined one.
 *
 * Keyed by USER, like the draft, so signing out clears all three (`prefs/index.ts`).
 */
import { setupSeedFrom, type OnboardingDraft } from '@nibblecue/core';
import type { KeyValueStore } from '../prefs';
import { clearPendingChildPhoto, savePendingChildPhoto } from './pending-photo';
import { clearPendingSetup, savePendingSetup, seedIsEmpty } from './pending-setup';

/** Setup was sent from this phone and its welcome has not been seen: the tour is owed. */
export const SETUP_WELCOME_OWED = (userId: string): string => `setup_welcome_owed:${userId}`;

/**
 * What the parent is sending, written down first. The seed and the picture replace whatever an
 * earlier tap kept, and an answer taken back since (every rhythm cleared, the picture removed)
 * takes the older record with it rather than leaving it to be seeded.
 */
export async function keepSetupAnswers(
  store: KeyValueStore,
  userId: string,
  draft: OnboardingDraft,
): Promise<void> {
  const seed = setupSeedFrom(draft);
  if (seedIsEmpty(seed)) await clearPendingSetup(store, userId);
  else await savePendingSetup(store, userId, seed);
  if (draft.child_photo_uri === null) await clearPendingChildPhoto(store, userId);
  else await savePendingChildPhoto(store, userId, draft.child_photo_uri);
  await store.set(SETUP_WELCOME_OWED(userId), '1');
}

/**
 * A FINISH THE SERVER SAID NO TO FOR GOOD, with nothing made: what was kept for it goes again
 * (0154's `admin_elsewhere` and `household_limit`). Kept, it would wait for the next household this
 * person comes to own, and a family handed to them later (a transfer) would be seeded with a routine
 * meant for a baby of their own. The draft still holds every answer, and the next Finish keeps them
 * again. Only the records: the picture's file stays, since the draft still points at it.
 */
export async function takeBackSetupAnswers(store: KeyValueStore, userId: string): Promise<void> {
  await clearPendingSetup(store, userId);
  await clearPendingChildPhoto(store, userId);
  await store.remove(SETUP_WELCOME_OWED(userId));
}

/** The tour's own two keys (`tour/TourProvider.tsx`), handed in so this file stays node-only. */
export interface TourKeys {
  pending: string;
  done: string;
}

/**
 * THE WELCOME'S BUTTON: the debt is taken back before the tour is armed, so the seeder can never
 * arm it a second time behind a parent who has already answered the tour's ask.
 */
export async function tourFromWelcome(
  store: KeyValueStore,
  userId: string,
  tour: TourKeys,
): Promise<void> {
  await store.remove(SETUP_WELCOME_OWED(userId));
  await store.set(tour.pending, '1');
}

/**
 * THE SEEDER'S HALF, for the owner of the household the phone shows: a welcome that never showed
 * arms the tour it would have. Once — the debt is removed before anything else — and never over a
 * tour that has already ended on this phone. True when the tour was armed.
 */
export async function payOwedTour(
  store: KeyValueStore,
  userId: string,
  tour: TourKeys,
): Promise<boolean> {
  if ((await store.get(SETUP_WELCOME_OWED(userId))) === null) return false;
  await store.remove(SETUP_WELCOME_OWED(userId));
  if ((await store.get(tour.done)) !== null) return false;
  await store.set(tour.pending, '1');
  return true;
}
