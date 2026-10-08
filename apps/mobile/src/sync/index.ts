/**
 * `SyncEngine` - the one object WP4.9's provider constructs, holding the two halves of sync and
 * the cadence that drives them (`docs/OFFLINE_SYNC.md` §4 and §8).
 *
 * The halves are independent on purpose. The outbox worker sends what this device owes; the
 * pull engine folds in what the household holds. Neither waits on the other, because a phone
 * with a queue and no answers still has to show what its owner logged, and a phone with nothing
 * queued still has to see the other caregiver's entries. The one place they meet is
 * `pullAfterPush`: a flush pass ends by pulling back exactly the tables it wrote to, so a field
 * a caregiver lost to last-writer-wins is on screen before they look for it.
 *
 * WHAT THIS FILE OWNS AND WHAT IT DOES NOT. It owns wiring and cadence. It owns no rule: which
 * tables are pulled is `./tables.ts`, what a page does to the mirror is `./apply.ts`, when a
 * flush happens is `./triggers.ts`, and what a parent is told is WP4.9's `copy.ts`. It holds no
 * React and no `AppState` import - the app state arrives as the same two-method
 * `AppStateSource` the triggers take, so this module is collectable by the node suite that
 * tests everything under it.
 *
 * TWO TICKS, NOT ONE. `TICK_MS` (60 s) is the flush tick and lives in `./triggers.ts` with the
 * rest of the write-path cadence — a write also flushes at once, so the tick only retries.
 * `PULL_TICK_MS` (30 s since 2026-09-25; core's constants say why it is no longer 5 min) is the
 * read-path tick and lives here. Both stop when the app stops being active: there is no timer
 * behind a dark screen.
 *
 * THE NUDGE IS THE FAST PATH, THE TICK THE BACKSTOP (2026-09-30; the owner: "The handover to
 * another parent takes a while before it shows up on the other phone, about 2 minutes if not
 * more"). When a write commits on the server, migration 0149 broadcasts one message on the
 * household's private topic, saying only that something changed. While the app is active this
 * engine holds ONE subscription to it (`SyncApi.subscribe`), and half a second after the last
 * nudge of a burst (`NUDGE_DEBOUNCE_MS`) it runs a whole pass: the same `sync_pull`, from the same
 * cursors, so a nudge decides WHEN to pull and never WHAT. A handover, two hops of up to thirty
 * seconds each, is now two hops of a second or two. The tick stays as it was, for everything a
 * nudge cannot promise (core's constants list it).
 */
import {
  NUDGE_DEBOUNCE_MS,
  PULL_TICK_MS,
  type Clock,
  type FlushReason,
  type Net,
  type SyncApi,
} from '@nibblecue/core';
import type { Analytics } from '../analytics';
import type { Store } from '../data/store';
import { deviceId } from '../data/ids';
import { drainPhotoQueue, type EntryPhotoApi, type PhotoFiles } from '../data/entryPhotos';
import type { Db } from '../db/driver';
import { rethrowUnlessTeardown } from '../db/latch';
import { PullEngine, type PullOutcome, type PullReason } from './pull';
import { runAllPhases, runBackground, runInitialSync } from './phases';
import { prune, type PruneOptions, type PruneOutcome } from './prune';
import {
  createTriggers,
  type AppStateSource,
  type IntervalHandle,
  type Scheduler,
  type SyncTriggers,
} from './triggers';
import {
  OutboxWorker,
  type FlushOutcome,
  type SyncNotice,
  type SyncSnapshot,
  type WorkerHooks,
} from './worker';

/** The argument of `WorkerHooks.onFailure`, named so the engine's deps can restate it. */
export type WorkerFailure = Parameters<NonNullable<WorkerHooks['onFailure']>>[0];

export interface SyncEngineDeps {
  db: Db;
  api: SyncApi;
  net: Net;
  clock: Clock;
  householdId: string;
  userId: string;
  analytics: Analytics['emit'];
  appState: AppStateSource;
  /** The reactive read seam; a pull bumps the keys of everything it wrote. */
  store?: Store | undefined;
  /** The queue's numbers, for the chip, the banner and the sign-out sheet. */
  onState?: ((snapshot: SyncSnapshot) => void) | undefined;
  /** Conflicts a parent may need to be told about; WP4.9 turns them into sentences. */
  onNotice?: ((notice: SyncNotice) => void) | undefined;
  /** An op has gone terminal, with the code the banner needs to pick its sentence. */
  onFailure?: ((failure: WorkerFailure) => void) | undefined;
  /** D37: this household's pull was refused; the account read decides what that means. */
  onForbidden?: ((householdId: string) => void | Promise<void>) | undefined;
  scheduler?: Scheduler | undefined;
  /** Injected so a test can pin both ends of the backoff jitter window. */
  rng?: (() => number) | undefined;
  /** Defaults to `PULL_TICK_MS`. */
  pullTickMs?: number | undefined;
  /** Defaults to `NUDGE_DEBOUNCE_MS`. */
  nudgeDebounceMs?: number | undefined;
  /** The nudge's debounce, one shot; the platform's `setTimeout` unless a test states time itself. */
  timer?: Timer | undefined;
  /**
   * THE BUCKET, for queued entry photos — a SEPARATE api from `api` above, deliberately.
   *
   * `api` is core's `SyncApi`: `push` and `pull`, and nothing else. An entry photo is not an op,
   * it is a few hundred kilobytes in object storage, and putting a `setEntryPhoto` on the ops
   * contract would make every implementation of it — including core's own test doubles — carry
   * a method about a bucket they have no idea exists.
   *
   * Optional because a build without it simply does not drain: the queue rows wait, the entries
   * are untouched, and the feature is off rather than broken.
   */
  photoApi?: EntryPhotoApi | undefined;
  /**
   * The two staged-file operations, for the same reason `photoApi` is separate — and this one is
   * load-bearing for the TEST SUITE rather than for the design. `media/entryPhoto.ts` imports
   * `expo-file-system`, which imports React Native, which the node runner cannot parse; an
   * import of it anywhere in this module's graph takes `sync/phases.test.ts` down with it. So
   * the device effects come from the device layer (`SyncProvider.tsx`, a `.tsx` that already
   * imports React Native and is not in the node suite), and this file stays testable.
   *
   * Both are optional together: without either, the queue simply is not drained.
   */
  photoFiles?: PhotoFiles | undefined;
}

const systemScheduler: Scheduler = {
  every: (ms, fn) => setInterval(fn, ms),
  cancel: handle => clearInterval(handle as ReturnType<typeof setInterval>),
};

/** A one-shot timer: the nudge's debounce. A `Scheduler` repeats, which a debounce must not. */
export interface Timer {
  after(ms: number, fn: () => void): unknown;
  clear(handle: unknown): void;
}

const systemTimer: Timer = {
  after: (ms, fn) => setTimeout(fn, ms),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * What a pass reads: every table (`pullNow`, `bootstrap`, a nudge's), or only the few a push just
 * wrote (`pullTables`, the `pullAfterPush` seam).
 */
type PassKind = 'full' | 'narrow';

interface Pass {
  kind: PassKind;
  done: Promise<PullOutcome>;
}

/** The one full pass waiting for the running one to end (`SyncEngine.once`). */
interface Waiting {
  done: Promise<PullOutcome>;
  /** Called the moment the running pass ends, with that pass's own answer. */
  go(previous: Promise<PullOutcome>): void;
}

export class SyncEngine {
  readonly worker: OutboxWorker;
  readonly puller: PullEngine;
  private readonly triggers: SyncTriggers;
  private readonly scheduler: Scheduler;
  private readonly timer: Timer;
  private readonly pullTickMs: number;
  private readonly nudgeDebounceMs: number;
  private offAppState: (() => void) | null = null;
  private tick: IntervalHandle | null = null;
  private started = false;
  /** One pull at a time, for the same reason the worker allows one flush: two passes over one
   *  household would apply the same pages twice and cost two requests to do it. */
  private current: Pass | null = null;
  private waiting: Waiting | null = null;
  private lastReason: PullReason | null = null;
  /** The household's nudges, held only while the app is active (`listen`). */
  private offNudges: (() => void) | null = null;
  /** Which subscription a nudge must come from to count: the one held now, and no older one. */
  private listening: object | null = null;
  /** The debounce running since the last nudge, if one is. Boxed: a handle may be any value. */
  private nudgeDue: { handle: unknown } | null = null;

  constructor(private readonly deps: SyncEngineDeps) {
    this.scheduler = deps.scheduler ?? systemScheduler;
    this.timer = deps.timer ?? systemTimer;
    this.pullTickMs = deps.pullTickMs ?? PULL_TICK_MS;
    this.nudgeDebounceMs = deps.nudgeDebounceMs ?? NUDGE_DEBOUNCE_MS;
    this.puller = new PullEngine({
      db: deps.db,
      api: deps.api,
      clock: deps.clock,
      householdId: deps.householdId,
      userId: deps.userId,
      store: deps.store,
      analytics: deps.analytics,
      onForbidden: deps.onForbidden,
    });
    this.worker = new OutboxWorker(deps.db, deps.api, deps.net, deps.clock, {
      // a refusal of an op naming another household is not about the role here (`failedElsewhere`)
      householdId: deps.householdId,
      analytics: deps.analytics,
      onState: deps.onState ?? (() => undefined),
      rng: deps.rng,
      onNotice: deps.onNotice,
      onFailure: deps.onFailure,
      // The seam the worker was built around: fold server truth back in for the tables this
      // pass wrote to, and nothing else. A whole pass here would cost a first-sync-sized
      // request every time a parent logged a diaper.
      pullAfterPush: tables => this.pullTables(tables).then(() => undefined),
      /*
        AND THE PICTURES, after the ops (the worker's `drainPhotos` says why that way round).

        It is wired HERE rather than passed in because everything it needs is already a dep of
        this engine — the database, the api, the clock, the household and the user — and the one
        thing it does not have, the device id, is a row in that same database. A caller would
        have had to be handed three values it has no other use for.

        `source: 'sheet'` is the truthful answer to "where did this write come from": the stamp
        is the tail of the sheet interaction that attached the picture, minutes or hours ago.
        There is no `photo` source and adding one would say a picture is a way of logging, which
        it is not — it is a field on an entry that happened to arrive late.
      */
      ...(deps.photoApi && deps.photoFiles
        ? {
            drainPhotos: async () => {
              await drainPhotoQueue(
                deps.db,
                deps.clock,
                deps.photoApi as EntryPhotoApi,
                deps.photoFiles as PhotoFiles,
                {
                  createdBy: deps.userId,
                  deviceId: await deviceId(deps.db),
                  source: 'sheet',
                },
              );
            },
          }
        : {}),
    });
    this.triggers = createTriggers({
      worker: this.worker,
      appState: deps.appState,
      ...(deps.scheduler !== undefined ? { scheduler: deps.scheduler } : {}),
    });
  }

  /* ---------------------------------------------------------------- lifecycle */

  start(): void {
    if (this.started) return;
    this.started = true;
    this.worker.start();
    this.triggers.start();
    this.offAppState = this.deps.appState.addListener(state => {
      if (state === 'active') {
        this.startTick();
        // listening first: a nudge sent while the foreground pass runs is then heard, and gets a
        // pass of its own after it
        this.listen();
        void this.pullNow('foreground').catch(rethrowUnlessTeardown);
        return;
      }
      this.stopTick();
      this.deafen();
    });
    if (this.deps.appState.current() === 'active') {
      this.startTick();
      this.listen();
      /*
        NOBODY AWAITS THESE PULLS, so what a teardown does to one ends it quietly (the owner's Expo
        Go log, 2026-10-01: a forced sign-out at launch closed the database under the first pass,
        and the pass that nobody awaited said so as a red "Uncaught (in promise)"; `db/latch.ts`
        `isTeardownFallout`). Any other failure is thrown on, as loud as before.
      */
      void this.pullNow('foreground').catch(rethrowUnlessTeardown);
    }
  }

  /**
   * Teardown step 1: stop every AUTOMATIC trigger and leave the worker able to answer an
   * explicit flush.
   *
   * This is deliberately not `stop()`, and the difference is the whole of `docs/ACCOUNTS.md`
   * §4 step 2. `OutboxWorker.flush` opens with `if (this.running || !this.started) return ZERO`,
   * so a worker that has been stopped answers the sign-out's last-chance flush with nothing at
   * all — the ops would go straight to the quarantine, and the one flush that exists to avoid
   * that would be a no-op. So the ticks, the app-state listener and the reconnect trigger go
   * (nothing may start a pass of its own while the queue is being resolved) and the worker
   * itself stays awake until the provider tears it down for good.
   */
  pause(): void {
    if (!this.started) return;
    this.started = false;
    this.stopTick();
    // the nudges are an automatic trigger like the tick: they go, and a debounce running goes too
    this.deafen();
    this.offAppState?.();
    this.offAppState = null;
    this.triggers.stop();
  }

  stop(): void {
    this.pause();
    this.worker.stop();
  }

  /* ---------------------------------------------------------------- the two halves */

  /** Send what this device owes. The reason is recorded, never branched on. */
  flush(reason: FlushReason): Promise<FlushOutcome> {
    return this.worker.flush(reason);
  }

  /** The repository's `afterCommit`: nudge the queue, never await it (§1). */
  afterCommit(): void {
    this.triggers.afterCommit();
  }

  /** Every phase, in order. Pull-to-refresh and the foreground tick both land here. */
  pullNow(reason: PullReason = 'foreground'): Promise<PullOutcome> {
    this.lastReason = reason;
    return this.once('full', () => runAllPhases(this.puller));
  }

  /** What started the most recent pull. The Sync inspector's developer row reads it; nothing
   *  branches on it, because a pull's behavior must not depend on who asked for it. */
  get lastPullReason(): PullReason | null {
    return this.lastReason;
  }

  /**
   * The blocking phase, for a first launch: Today is usable when this resolves, and the two
   * background phases are left running behind it.
   */
  async bootstrap(): Promise<PullOutcome> {
    const outcome = await this.once('full', () => runInitialSync(this.puller));
    // Deliberately not awaited. `runBackground` is the rest of the household arriving, and the
    // screen that called `bootstrap` has what it needs to paint.
    void this.once('full', () => runBackground(this.puller)).catch(rethrowUnlessTeardown);
    return outcome;
  }

  /** Only the tables a flush pass wrote to (the `pullAfterPush` seam). */
  pullTables(tables: readonly string[]): Promise<PullOutcome> {
    return this.once('narrow', () => this.puller.pullTables(tables));
  }

  /** The two guarded local prunes of D30. Cheap enough to run on every launch. */
  prune(options: PruneOptions = {}): Promise<PruneOutcome> {
    return prune(this.deps.db, this.deps.householdId, this.deps.clock.now(), options);
  }

  /* ---------------------------------------------------------------- internals */

  /**
   * ONE PULL AT A TIME, and which caller waits for which.
   *
   *   * Nothing running: this caller's pass starts.
   *   * A NARROW caller (`pullTables`) joins whatever runs, as every caller used to.
   *   * A FULL caller joins a full pass that runs: its answer is the one this caller would have
   *     computed a moment later from the same cursors.
   *   * A FULL caller does NOT join a narrow pass (2026-09-30). That pass reads only the tables a
   *     push wrote, so a tick that joined one, which every push made likely, read nothing else
   *     for another thirty seconds: who's on among what it missed. It waits, and one full pass
   *     starts the moment the narrow one ends.
   *   * A nudge's caller (`fresh`) joins nothing that runs: see `pullForNudge`.
   *
   * Whatever waits, waits as ONE pass: a second caller joins the first one's. So there is never
   * more than the pass running and the one behind it. The pass behind is always every phase
   * (`runAllPhases`), which is what any full caller wants and more than a partial one needs.
   */
  private once(
    kind: PassKind,
    run: () => Promise<PullOutcome>,
    fresh = false,
  ): Promise<PullOutcome> {
    const current = this.current;
    if (current === null) return this.begin(kind, run);
    if (kind === 'narrow') return current.done;
    if (current.kind === 'full' && !fresh) return current.done;
    this.waiting ??= this.queue();
    return this.waiting.done;
  }

  /**
   * Start a pass. When it ends, in the very callback that clears it, the pass waiting behind it
   * starts, before anything awaiting the finished one runs: so nothing can slip a pass of its own
   * in between, and it is still one pull at a time.
   */
  private begin(kind: PassKind, run: () => Promise<PullOutcome>): Promise<PullOutcome> {
    const done: Promise<PullOutcome> = run().finally(() => {
      this.current = null;
      const next = this.waiting;
      if (next === null) return;
      this.waiting = null;
      next.go(done);
    });
    this.current = { kind, done };
    return done;
  }

  /**
   * The pass behind the one running. An engine paused meanwhile starts no pass of its own, so its
   * callers get the answer of the pass they waited for, exactly as if they had joined it.
   */
  private queue(): Waiting {
    let settle: (outcome: Promise<PullOutcome>) => void = () => undefined;
    const done = new Promise<PullOutcome>(resolve => {
      settle = resolve;
    });
    return {
      done,
      go: previous =>
        settle(this.started ? this.begin('full', () => runAllPhases(this.puller)) : previous),
    };
  }

  /**
   * THE PASS A NUDGE ASKS FOR must begin after the nudge. The write it announces committed just
   * before it was sent, so a pass already running may have read that table before the commit:
   * joining it could miss the very change the nudge is about, and leave it to the tick. So it
   * starts now, or right after the pass that runs.
   */
  private pullForNudge(): Promise<PullOutcome> {
    this.lastReason = 'push';
    return this.once('full', () => runAllPhases(this.puller), true);
  }

  /**
   * Hold the household's nudges: once, and only while the app is active, the tick's own rule. A
   * transport that cannot listen leaves this phone on the tick alone, as every phone was before.
   */
  private listen(): void {
    if (this.listening !== null) return;
    const token = {};
    this.listening = token;
    try {
      this.offNudges =
        this.deps.api.subscribe?.(this.deps.householdId, () => {
          if (this.listening === token) this.heard();
        }) ?? null;
    } catch {
      this.offNudges = null;
    }
  }

  /** Let the nudges go, and the debounce with them: the next `listen` starts clean. */
  private deafen(): void {
    this.listening = null;
    if (this.nudgeDue !== null) {
      this.timer.clear(this.nudgeDue.handle);
      this.nudgeDue = null;
    }
    const off = this.offNudges;
    this.offNudges = null;
    try {
      off?.();
    } catch {
      // the transport's own teardown: nothing here depends on it
    }
  }

  /**
   * A nudge: another phone's write, or this phone's own, has committed. A TRAILING debounce: every
   * nudge starts the wait again, so a burst (the batches of one long flush) is one pull.
   */
  private heard(): void {
    if (this.nudgeDue !== null) this.timer.clear(this.nudgeDue.handle);
    const due = {
      handle: this.timer.after(this.nudgeDebounceMs, () => {
        if (this.nudgeDue !== due) return;
        this.nudgeDue = null;
        // fire and forget, like the tick; a pull that failed has already said so in the boot log
        this.pullForNudge().catch(() => undefined);
      }),
    };
    this.nudgeDue = due;
  }

  private startTick(): void {
    if (this.tick !== null) return;
    this.tick = this.scheduler.every(
      this.pullTickMs,
      () => void this.pullNow('tick').catch(rethrowUnlessTeardown),
    );
  }

  private stopTick(): void {
    if (this.tick === null) return;
    this.scheduler.cancel(this.tick);
    this.tick = null;
  }
}

// This file is the engine, not a barrel. The re-exports that stood here (`./apply`, `./cursors`,
// `./phases`, `./pull`, `./prune`, `./tables`, `./triggers`, `./worker`) went on 2026-09-27:
// every caller imports those modules by their own path, and each re-export was a getter shipped
// for nobody.
