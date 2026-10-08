/**
 * The app's ONE sync engine, and the only place it is constructed (`docs/OFFLINE_SYNC.md` §8;
 * `docs/MOBILE.md` §13).
 *
 * WHY ONE, AND WHY HERE. The outbox has exactly one writer. Two `OutboxWorker`s over one
 * `outbox` table would both claim rows into `SENDING`, both back them off on their own
 * schedules, and produce a queue whose behavior cannot be reasoned about from the rows — the
 * bug class that is invisible in a simulator and obvious on a parent's phone at 3 a.m. So the
 * engine is built once, keyed on the household and the user, and every other surface reads it
 * through `./status.ts` rather than making one of its own.
 *
 * WHAT IT WIRES, IN THE ORDER IT MATTERS:
 *
 *   1. The snapshot store, so the chip, the banner and the sign-out sheet all read one number.
 *   2. The two §6 toasts, from snapshot TRANSITIONS rather than from inside the worker: a
 *      reconnect toast when a non-empty queue drains, and the first-offline-write toast once
 *      per offline period. Both decisions are pure and tested (`status.test.ts`).
 *   3. The banner, read from the snapshot like the chip (`status.ts` `syncBannerFrom`): FAILED ops,
 *      whose sentence is chosen by the CODE of their refusal kept on their own rows — not by
 *      `last_error`, which is the server's prose — or a run of requests that did not land. Read
 *      from the outbox at launch and whenever the queue is read, so it comes back after a restart
 *      with its Try again (2026-09-28); dismissed, it stays away for the session.
 *   4. D37: a pull that answers FORBIDDEN is handed to the accounts state machine
 *      (`actions.pullRefused`), which reads the account BEFORE anything is deleted and decides
 *      from that read (`auth/refusedPull.ts`, `auth/mirror.ts`): the household leaves the phone
 *      with the session kept, or nothing happens because the account still lists it — and a read
 *      that cannot see the person asks the session before anybody is signed out, and decides
 *      nothing when the session cannot be reached. Nothing is deleted here, and the latch is not
 *      closed here either: a refusal the account contradicts must leave the database working.
 *   5. The teardown runtime (`setSyncRuntime`), which is how `auth/AuthContext.tsx` — mounted
 *      ABOVE this provider and therefore unable to receive it as a prop — reaches the real
 *      outbox at sign-out instead of WP2's `async () => []` placeholder.
 *
 * It renders its children and nothing else. The banner it decides is published through a
 * context that `Screen.tsx` reads, because the thing that can open a sheet is the screen, not
 * this provider: the shell is mounted below it.
 */
import { countBucket, msBucket } from '../analytics';
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { crumb } from '../app/boot';
import { useAuth } from '../auth/AuthContext';
import { forgetStagedEntryPhoto, readStagedEntryPhoto } from '../media/entryPhoto';
import { ENTRY_PHOTOS_ENABLED } from '../media/entryPhotoSwitch';
import { systemClock } from '../data/repository';
import { keys, store } from '../data/store';
import { allowReopen, openLocalDb, stopLocalDb } from '../db';
import type { Db } from '../db/driver';
import { useUnits } from '../sheets/quick/prefs';
import { volumeLabel } from '../sheets/quick/volume';
import { useToast } from '../ui/toast';
import * as copy from './copy';
import { SyncEngine, type WorkerFailure } from './index';
import { createNet } from './net';
import { mockStateStore } from '../prefs/async-storage';
import { createSyncProviders, ensureMockChildren, type MockChildSeed } from './providers';
import type { MockMemberRole, MockSyncControls } from './providers/types';
import {
  drainedCount,
  EMPTY_SNAPSHOT,
  queuedWhileOffline,
  setSyncRuntime,
  syncRuntime,
  syncStatus,
  useSyncBannerCall,
  type SyncSnapshot,
} from './status';

/** What the banner says, if anything. `Screen.tsx` supplies the tap target. */
export interface SyncBannerState {
  message: string;
  tone: 'warn' | 'crit';
  dismiss(): void;
  /** Put the failed rows back on the queue and send. Absent when there is nothing to retry. */
  retry?: (() => void) | undefined;
}

const SyncBannerContext = createContext<SyncBannerState | null>(null);

/** The banner for the screen under the top bar, or null when there is nothing to say. */
export function useSyncBanner(): SyncBannerState | null {
  return useContext(SyncBannerContext);
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { env, session, account, analytics, actions, api, mock } = useAuth();
  const toast = useToast();
  /**
   * The banner, which waits out the chip's own grace (`FAILED_GRACE_MS`) and is read from the same
   * snapshot (`syncBannerFrom`), dismissal included — as its ANSWER (`useSyncBannerCall`), so this
   * provider re-renders when the banner changes, not at every step of every flush.
   */
  const call = useSyncBannerCall();

  const householdId = account?.memberships[0]?.household_id ?? null;
  const userId = session?.user.id ?? null;
  /**
   * The account's children, for the dev build's sync fake only (`ensureMockChildren`): read
   * through a ref by the engine effect, so a new child does not rebuild the engine, and watched by
   * its own effect below, so a child added after launch reaches the fake before its first op.
   */
  const accountChildren = useRef<readonly MockChildSeed[]>([]);
  accountChildren.current = account?.children ?? [];
  const mockServer = useRef<MockSyncControls | null>(null);
  const childKey = (account?.children ?? []).map(c => c.id).join(',');
  /** The account's role, for the dev build's fake (`ensureMockMembership`); a ref like the children. */
  const accountRole = useRef<MockMemberRole | null>(null);
  accountRole.current = account?.memberships[0]?.role ?? null;
  const role = accountRole.current;

  /** The last snapshot, for the transitions in §6. A ref: a toast is not a render. */
  const previous = useRef<SyncSnapshot>(EMPTY_SNAPSHOT);
  /** The offline period's one toast. Cleared when a connection comes back. */
  const toldAboutOffline = useRef(false);
  /** Stable across renders so the effect below does not rebuild the engine to get a toast. */
  const say = useRef(toast.show);
  say.current = toast.show;
  /** The parent's volume unit, for a notice that names an amount; a ref for the same reason. */
  const units = useUnits();
  const volumeUnit = useRef(units.volume);
  volumeUnit.current = units.volume;
  /** D37's answer, read through a ref so the engine is not rebuilt for a new callback. */
  const pullRefused = useRef(actions.pullRefused);
  pullRefused.current = actions.pullRefused;
  /** The test backend's accounts, for the fake's one membership predicate (null on a project). */
  const accountBackend = useRef(mock);
  accountBackend.current = mock;

  useEffect(() => {
    if (householdId === null || userId === null) {
      syncStatus.reset();
      return;
    }
    let engine: SyncEngine | null = null;
    let offWrites: (() => void) | null = null;
    let cancelled = false;

    const onState = (snapshot: SyncSnapshot): void => {
      const prev = previous.current;
      previous.current = snapshot;
      // the banner is read from this snapshot (`syncBannerFrom`): nothing FAILED any more —
      // retried, discarded or resolved by a pull — and it goes with it, on this very line
      syncStatus.set(snapshot);
      if (snapshot.connected) toldAboutOffline.current = false;
      const drained = drainedCount(prev, snapshot);
      if (drained !== null && snapshot.connected) say.current(copy.backOnline(drained));
      if (queuedWhileOffline(prev, snapshot) && !toldAboutOffline.current) {
        toldAboutOffline.current = true;
        say.current(copy.firstOfflineWrite);
      }
    };

    const onFailure = (f: WorkerFailure): void => {
      /*
        EVERY FAILED OP NAMES ITSELF IN THE BOOT LOG (the investigation of 2026-09-24). The owner
        saw "Not synced" for minutes in Expo Go and it cleared before anything could be read off
        the phone; the chip says only that something failed. The next one says which op and why.
      */
      crumb(`sync: ${f.entity} ${f.op} parked FAILED (${f.code}) — ${f.message}`);
      // the banner needs nothing from here: the code is on the op's row, and the snapshot the
      // worker publishes next carries it (`failedCode`)
    };

    void (async () => {
      let db: Db;
      try {
        // A sign-in has happened, so whatever latch a previous teardown closed is lifted before
        // the first open. `allowReopen` is idempotent and this is the only caller that knows a
        // session exists (auth/AuthContext.tsx lifts it too, for the quarantine replay).
        allowReopen();
        db = await openLocalDb();
      } catch {
        // The database could not be opened at all. Nothing sync can do about it, and the app
        // still renders: `useSyncStatus` keeps reporting the empty snapshot.
        return;
      }
      if (cancelled) return;
      crumb('sync: database open; building the providers');
      const backend = accountBackend.current;
      const providers = await createSyncProviders(env, {
        householdId,
        userId,
        store: mockStateStore,
        children: accountChildren.current,
        ...(accountRole.current === null ? {} : { role: accountRole.current }),
        // the dev build's fake refuses a pull the moment the test backend's account is out of the
        // household — removed, or an evening that ran out — as a real project does
        ...(backend === null
          ? {}
          : { isMember: (h: string, u: string) => backend.membership(h, u) !== undefined }),
      });
      if (cancelled) return;
      mockServer.current = providers.mock;
      const e = new SyncEngine({
        db,
        api: providers.api,
        net: createNet(),
        clock: systemClock,
        householdId,
        userId,
        analytics: analytics.emit,
        // A PULL WAKES THE SCREENS THAT SHOW WHAT IT BROUGHT (the launch sweep, 2026-09-27): the
        // pull bumps the keys of every row it wrote (`apply.ts` `invalidationKeys`), and without
        // the store here the other parent's entries sat in this phone's database while Today,
        // the Log and Reports kept their old numbers until the next write on this phone. An idle
        // pass writes nothing and bumps nothing (`writePage`), so this costs a quiet phone nothing.
        store,
        appState: {
          current: () => AppState.currentState,
          addListener: listener => {
            const sub = AppState.addEventListener('change', state => listener(state));
            return () => sub.remove();
          },
        },
        onState,
        onNotice: notice => {
          if (notice.kind === 'timer_merged') {
            say.current(copy.timerMerged(notice.startedAt, notice.startedBy));
            return;
          }
          if (notice.kind === 'stash_save_nullified') {
            say.current(copy.stashSaveNullified(volumeLabel(notice.storedMl, volumeUnit.current)));
            return;
          }
          // The caregiver's NAME is not in the notice and is not looked up here: the conflict
          // carries a container id, and resolving an id to a person is a read of the household
          // that WP5's capture surfaces own. Until then the sentence names the household.
          // in the household's unit, as every other amount on the phone — it said "ml" whatever
          // the household read until 2026-09-26
          say.current(
            copy.stashAdjusted(
              'another caregiver',
              volumeLabel(notice.availableMl, volumeUnit.current),
            ),
          );
        },
        onFailure,
        // the bucket and the staged files, which `api` above deliberately does not carry and
        // which the engine may not import (`SyncEngineDeps.photoFiles` says why) — and neither
        // while entry photos are off (`media/entryPhotoSwitch.ts`): an engine without them never
        // drains the queue, so nothing uploads a picture
        ...(ENTRY_PHOTOS_ENABLED
          ? {
              photoApi: api,
              photoFiles: { read: readStagedEntryPhoto, forget: forgetStagedEntryPhoto },
            }
          : {}),
        /*
          D37, SETTLED BY THE ACCOUNT (`auth/mirror.ts`). Nothing is deleted and nothing is closed
          here: the account is read first, and a refusal it contradicts must leave this engine and
          its database exactly as they were. Whatever does go — the household with the session
          kept, or a forced sign-out — is the accounts state machine's teardown, whose step 1
          closes the latch itself.

          STARTED, NOT AWAITED. The pull awaits this, and a pull that waited on a teardown would
          hold the engine's one pull slot through it — while step 2's flush, pulling back what it
          pushed, queued behind that very slot until its budget ran out.
        */
        onForbidden: refusedHousehold => {
          void pullRefused.current(refusedHousehold);
        },
      });
      engine = e;
      setSyncRuntime({
        flush: reason => e.flush(reason),
        pullNow: () => e.pullNow('manual'),
        mock: providers.mock,
        pending: () => e.worker.pending(),
        // the whole reading, the banner's refusal and any run of unanswered requests included
        refresh: () => e.worker.refreshState(),
        // a pull on Today: what waits out a backoff goes with it (`OutboxWorker.dueNow`)
        dueNow: () => e.worker.dueNow(),
        // attempts back to zero and straight into a flush: a person pressing the button is new
        // information about the world, exactly as a reconnect is (`OutboxWorker.retry`)
        retry: async () => {
          await e.worker.retry();
          await e.flush('manual');
        },
        // Step 1, before the UI freezes: the latch closes so nothing recreates the file step 8
        // deletes, and every automatic trigger stops. The worker stays awake for step 2.
        stopForTeardown: () => {
          stopLocalDb();
          e.pause();
          // the write nudge is an automatic trigger too
          offWrites?.();
          offWrites = null;
        },
      });
      // EXPO_PUBLIC_OFF=sync: the engine exists and the local database is open, so every
      // screen still reads and writes; nothing talks to the server and no timer runs
      crumb(
        `sync: engine built${env.off.has('sync') ? ' (held by EXPO_PUBLIC_OFF)' : '; starting'}`,
      );
      if (!env.off.has('sync')) {
        e.start();
        /*
          EVERY LOCAL WRITE NUDGES THE QUEUE (the owner, 2026-09-24, in Expo Go: "it says not
          sync or sync pending a lot. is this normal?"). It was not: `SyncEngine.afterCommit` has
          been the documented write trigger since WP4 (`triggers.ts`), and nothing ever handed it
          to a write — every sheet calls `logActivity(db, clock, …)` with no deps — so an entry
          sat "1 queued" until the next 60-second tick, a return to the foreground, or a
          reconnect. Every write path (the repository, a timer, an undo) bumps `keys.outbox()`
          after its commit and nothing else does — not the worker, not the pull — so listening
          to that one key is every write and cannot feed back into itself.
        */
        offWrites = store.subscribe(keys.outbox(), () => e.afterCommit());
      }

      // The first pass of the session, in the order a parent experiences it: Today first
      // (`bootstrap` resolves when the blocking phase is done and leaves the rest running),
      // then the two guarded local prunes, which are cheap enough for every launch (D30).
      try {
        if (env.off.has('sync')) {
          crumb('sync: bootstrap skipped (held by EXPO_PUBLIC_OFF)');
        } else {
          const outcome = await e.bootstrap();
          // `error` is how a pull reports a failed apply (pull.ts's `failed`): it resolves, it
          // does not throw, so the boot log has to read it out here or it is never seen
          crumb(
            `sync: bootstrap done — ${outcome.applied} row(s)${
              outcome.error === null ? '' : ` — ${outcome.error}`
            }`,
          );
        }
      } catch (err) {
        // an unreachable server on launch is a normal offline start, not an error to report
        // to the parent; the boot log still names it
        crumb(`sync: bootstrap failed — ${err instanceof Error ? err.message : String(err)}`);
      }
      if (!env.off.has('sync')) void e.prune().catch(() => undefined);
      crumb('sync: settled');

      // `sync_health` is the queue as it stands once the session has settled: how deep, how old
      // and how many need a person, all in bands. `sync_flush` is emitted by the worker itself,
      // per pass, because only the worker knows what a pass did.
      const snapshot = previous.current;
      analytics.emit('sync_health', {
        queue_depth_bucket: countBucket(snapshot.pending + snapshot.sending),
        oldest_pending_bucket: msBucket(
          snapshot.oldestPendingAt === null
            ? 0
            : Math.max(0, Date.now() - Date.parse(snapshot.oldestPendingAt)),
        ),
        failed_bucket: countBucket(snapshot.failed),
      });
    })();

    return () => {
      cancelled = true;
      offWrites?.();
      offWrites = null;
      mockServer.current = null;
      setSyncRuntime(null);
      engine?.stop();
      syncStatus.reset();
      previous.current = EMPTY_SNAPSHOT;
    };
    // One engine per household and user. `analytics` and `env` are stable for the app's life,
    // and `api` is a method bag rebuilt on every render of the auth context — listing it would
    // stop and rebuild the outbox worker on each one, which is the opposite of one engine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, userId, env, analytics]);

  /*
    A CHILD ADDED AFTER LAUNCH ("Add a child", a second twin) reaches the dev build's fake before
    anything is logged for them — otherwise their first vaccine record is refused exactly as every
    record was before the fake knew the first child. A no-op on a real project, where there is no
    fake (`mockServer` stays null), and for a child the fake already holds.
  */
  useEffect(() => {
    const mock = mockServer.current;
    if (mock === null || householdId === null) return;
    if (ensureMockChildren(mock, householdId, accountChildren.current) > 0) {
      crumb('sync: the test backend learned a new child');
    }
  }, [childKey, householdId]);

  /*
    A ROLE CHANGED AFTER LAUNCH (the Family page made this account a parent) reaches the dev
    build's fake too: the phone reads its role from the synced member list (M6), and the fake's
    list is the one it syncs. A no-op on a real project, where the server wrote the change.
  */
  useEffect(() => {
    const mock = mockServer.current;
    if (mock === null || householdId === null || userId === null || role === null) return;
    if (mock.setMemberRole(householdId, userId, role)) {
      crumb('sync: the test backend took this account’s role');
    }
  }, [role, householdId, userId]);

  /*
    ONE BANNER, READ FROM THE SNAPSHOT (`status.ts` `syncBannerFrom`, 2026-09-28): FAILED ops past
    their grace — told at once when the app opened with them — or a run of requests that did not
    land. It is read against `Date.now()` inside `useSyncBannerCall`, because the store hands out a
    new snapshot at every moment the answer can change with nothing else changing
    (`nextChipChange`).
  */
  const kind = call?.kind ?? null;
  const needsPerson = call?.needsPerson ?? false;
  const banner = useMemo<SyncBannerState | null>(() => {
    if (kind === null) return null;
    return {
      message: copy.failureBanner(kind),
      // `crit` when a person has to act — parked ops do not go by themselves — and `warn` for a
      // queue that goes on trying on its own (`SyncBanner`'s two tones)
      tone: needsPerson ? 'crit' : 'warn',
      // for the session: the store keeps it, and a sign-out ends it
      dismiss: () => syncStatus.dismissBanner(),
      /*
        THE WAY OUT, which there was not one of outside the developer inspector. A `permission`
        failure is the one this cannot help with — the rejection is about the PERSON, whose role
        cannot write that row (`copy.ts` `failureClassOf`), so retrying it just fails again — and
        neither is `elsewhere`, rows of a household this account is no longer in (2026-09-29), so
        it is offered for everything else.
        Retrying an op the server has in fact applied answers `duplicate`, which the worker
        counts as a success, so the button is safe to press twice (`replay.ts` records why).
        It is not a dismissal: the ops go back on the queue, which is what takes the banner away,
        and if they are refused again the banner that comes back is the answer to the question.
      */
      ...(kind === 'permission' || kind === 'elsewhere'
        ? {}
        : {
            retry: () => {
              void syncRuntime()?.retry();
            },
          }),
    };
  }, [kind, needsPerson]);

  return <SyncBannerContext.Provider value={banner}>{children}</SyncBannerContext.Provider>;
}
