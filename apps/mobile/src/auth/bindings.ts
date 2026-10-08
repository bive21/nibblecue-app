/**
 * The real dependencies behind the pure auth logic: teardown steps bound to Expo modules, the
 * quarantine on disk, and — since WP4.9 — the app's actual outbox. Everything the tests inject
 * is constructed here, once, so a screen never touches a native module directly.
 *
 * THE OUTBOX BINDING IS THE ONE WORTH READING TWICE. Until WP4.9 it defaulted to
 * `{ flush: async () => undefined, pending: async () => [] }`, which meant teardown step 2
 * flushed nothing and step 3 quarantined nothing — a sign-out with three queued entries deleted
 * the database and lost all three, with no error, no failing test and nothing on screen. It is
 * now `outboxTeardown()` from `sync/status.ts`, which resolves the running worker at CALL time
 * rather than at binding time: this module is imported while the app is booting, long before a
 * `SyncProvider` exists, so an eagerly captured reference could only ever be the placeholder.
 * And when there is still no worker at call time — a teardown that starts at launch before the
 * engine is built — it reads the queue from the file (`queueOnDisk`) instead of calling it empty.
 * `auth/bindings.test.ts` asserts the wiring at both of `AuthContext.tsx`'s call sites.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import type { OutboxRow } from '@nibblecue/core';
import { Directory, Paths } from 'expo-file-system';
import type { Analytics } from '../analytics';
import { ownBinary } from '../app/runtime';
import { pending as outboxPending } from '../data/outbox';
import {
  closeAndDeleteEveryLocalDb,
  closeAndDeleteLocalDb,
  localDbFileExists,
  localDbStopped,
  openLocalDb,
} from '../db';
import { clearForHouseholdEnd, clearForSignOut } from '../prefs';
import { prefsStore } from '../prefs/async-storage';
import { outboxTeardown, stopSyncForTeardown } from '../sync/status';
import { cipher, clearSessionsFromKeychain, quarantineKeychain, teardownFlag } from './keychain';
import type { AuthProvider } from './providers/types';
import { Quarantine, type StoredQuarantineHeader } from './quarantine';
import type { TeardownDeps, TeardownUser } from './teardown';

const QUARANTINE_HEADER = 'quarantine:header';
const QUARANTINE_BODY = 'quarantine:body';

export const quarantine = new Quarantine({
  file: {
    async read() {
      const [h, b] = await Promise.all([
        AsyncStorage.getItem(QUARANTINE_HEADER),
        AsyncStorage.getItem(QUARANTINE_BODY),
      ]);
      if (!h || !b) return null;
      try {
        return { header: JSON.parse(h) as StoredQuarantineHeader, body: b };
      } catch {
        return null;
      }
    },
    async write(header, body) {
      await AsyncStorage.multiSet([
        [QUARANTINE_HEADER, JSON.stringify(header)],
        [QUARANTINE_BODY, body],
      ]);
    },
    async delete() {
      await AsyncStorage.multiRemove([QUARANTINE_HEADER, QUARANTINE_BODY]);
    },
  },
  keychain: quarantineKeychain,
  cipher,
  now: Date.now,
});

/**
 * TEARDOWN STEP 3 WITH NO SYNC ENGINE TO ASK (`sync/status.ts` `outboxTeardown`): the unsent rows,
 * straight from the file they stay in until step 8. Nothing is created to answer — a closed latch
 * (the file is already gone, or going) or no file at all is an empty queue, because it is one.
 */
export async function queueOnDisk(): Promise<OutboxRow[]> {
  if (localDbStopped() || !localDbFileExists()) return [];
  return outboxPending(await openLocalDb());
}

async function isOnline(): Promise<boolean> {
  try {
    const s = await NetInfo.fetch();
    return s.isConnected === true && s.isInternetReachable !== false;
  } catch {
    return true;
  }
}

/** Clears the app's tmp/cache directory (teardown step 11) without touching the OS's own files. */
async function clearTmp(): Promise<void> {
  try {
    const dir = new Directory(Paths.cache, 'cuddlecue');
    if (dir.exists) dir.delete();
  } catch {
    // nothing cached yet
  }
}

/**
 * expo-notifications is loaded when a teardown step needs it, never at import time: since
 * SDK 53 the module throws on load inside Expo Go on Android (remote push was removed from
 * Expo Go), which would take the whole app down before the first screen. In Expo Go nothing
 * was ever scheduled, so "no module" and "nothing to cancel" are the same outcome; a
 * development build loads it normally.
 */
/** The dev reset needs the same cancel the teardown does, without assembling a whole teardown. */
export async function cancelAllScheduledNotifications(): Promise<void> {
  const n = await loadNotifications();
  if (n) await n.cancelAllScheduledNotificationsAsync();
}

async function loadNotifications(): Promise<typeof import('expo-notifications') | null> {
  // the driver's rule (app/runtime.ts): the entry evaluates every native submodule at once
  if (!ownBinary()) return null;
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

export interface TeardownBindings {
  auth: AuthProvider;
  analytics: Analytics;
  currentUser: () => TeardownUser | null;
  freezeUi: () => void;
  closeSheets: () => void;
  resetToAuth: () => void;
  clearMemory: () => Promise<void>;
  /** Defaults to the running worker (`sync/status.ts`); injected only by a test. */
  outbox?: TeardownDeps['outbox'];
  widgets?: TeardownDeps['widgets'];
  push?: TeardownDeps['push'];
}

export function teardownDeps(b: TeardownBindings): TeardownDeps {
  return {
    flags: teardownFlag,
    session: { current: async () => b.currentUser() },
    ui: {
      // Step 1, in the order docs/ACCOUNTS.md §4 gives it: nothing may create an op while the
      // queue is being resolved, and nothing may REOPEN the database file step 8 deletes. The
      // latch closes and the automatic triggers stop here, before the UI freezes — the worker
      // itself stays awake, because step 2 is its last-chance flush.
      freeze: () => {
        stopSyncForTeardown();
        b.freezeUi();
      },
      closeSheets: b.closeSheets,
    },
    network: { online: isOnline },
    outbox: b.outbox ?? outboxTeardown(queueOnDisk),
    quarantine: { write: (user, ops) => quarantine.write(user, ops) },
    notifications: {
      cancelAllScheduled: async () => {
        const n = await loadNotifications();
        if (n) await n.cancelAllScheduledNotificationsAsync();
      },
      dismissAllDelivered: async () => {
        const n = await loadNotifications();
        if (n) await n.dismissAllNotificationsAsync();
      },
    },
    // WP9 passes the real widget seam (src/widgets/platform.ts `widgetsTeardown`);
    // the default is for a test, where an empty timeline nobody reads is a success
    widgets: b.widgets ?? {
      clearSnapshot: async () => undefined,
      reloadAll: async () => undefined,
    },
    // the app passes the real one (`notifications/pushSeat.ts` `pushTeardown`, migration 0121);
    // the default is for a test, where no phone was ever registered
    push: b.push ?? {
      markInvalidOnServer: async () => undefined,
      unregisterLocally: async () => undefined,
    },
    auth: { signOut: scope => b.auth.signOut(scope) },
    db: { closeAndDelete: closeAndDeleteLocalDb, closeAndDeleteEvery: closeAndDeleteEveryLocalDb },
    keychain: { clearSession: clearSessionsFromKeychain },
    prefs: {
      // what step 10 keeps is the runner's to say — and, for a run finished at launch, its mark's:
      // only the forced sign-out a refused pull falls back to keeps anything (`auth/mirror.ts`)
      clearForSignOut: async keep => {
        await clearForSignOut(prefsStore, keep);
      },
      // a household leaving the phone: its keys go, the signed-in person's own stay
      clearForHouseholdEnd: async user => {
        await clearForHouseholdEnd(prefsStore, user.id);
      },
    },
    caches: { clearMemory: b.clearMemory, clearTmp },
    nav: { resetToAuth: b.resetToAuth },
    analytics: { emit: (event, props) => void b.analytics.emit(event, props) },
  };
}
