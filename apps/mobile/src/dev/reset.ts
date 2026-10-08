/**
 * "Start fresh" — put this device back to the state it would be in a second after the app was
 * installed, for a developer testing the first run over and over (the owner, 2026-09-17: "how
 * do i reset my expo history i want to start fresh like i would just have downloaded the app").
 *
 * WHY SIGNING OUT IS NOT THIS. Sign-out is careful to keep two things a real person would be
 * furious to lose: the device-level preferences (theme, units, clock format —
 * `DEVICE_LEVEL_KEYS`) and, under the mock provider, the fake server's own state, which is
 * deliberately not a preference because signing out of an app does not delete your account.
 * Sign out and back in and you land in the same household with the same theme. That is correct
 * behavior, and the exact opposite of what a first-run test needs.
 *
 * SO THIS CLEARS EVERY OWNER, not a list of keys. `AsyncStorage.clear()` rather than the
 * `prefs:` and `mock:` prefixes, because an owner added next month is covered by the former and
 * silently missed by the latter — and this is a dev tool, so the blunt instrument is the safe
 * one. Under Expo Go, AsyncStorage is namespaced per project, so this does not touch anything
 * else on the phone.
 *
 * THE ORDER MATTERS in one place: the mock backend holds its world in memory and writes a
 * snapshot on every change, so it is reset FIRST (`MockBackend.reset` awaits its own in-flight
 * save) or the next write would put the old household straight back after the wipe.
 *
 * It is reachable only from the dev section of More, which is already gated on the mock
 * provider and a non-production stage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearKeystoreForReset } from '../auth/keychain';
import type { MockBackend } from '../auth/providers/mock';
import { closeAndDeleteEveryLocalDb } from '../db';

export interface ResetDeps {
  /** The fake server, when one is running. Reset before anything else can be written. */
  mock: Pick<MockBackend, 'reset'> | null;
  /** Scheduled reminders outlive the data they were made from; a fresh install has none. */
  cancelNotifications(): Promise<void>;
}

/** Every step, in order, each tolerating having already happened. */
export async function resetDevice(deps: ResetDeps): Promise<void> {
  await deps.mock?.reset();
  await deps.cancelNotifications();
  await closeAndDeleteEveryLocalDb();
  await AsyncStorage.clear();
  await clearKeystoreForReset();
}
