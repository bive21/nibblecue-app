/**
 * When a flush happens (docs/OFFLINE_SYNC.md §2.2 and §8's trigger list).
 *
 * The worker itself binds the one trigger it can reason about alone — the network coming back,
 * through the `Net` it already holds. Everything else is a platform event or a call site, and
 * they live here so the worker stays a thing that can be driven entirely from node.
 *
 * | Trigger | Reason | Bound by |
 * |---|---|---|
 * | the network returns | `'reconnect'` | `OutboxWorker.start()` (it holds the `Net`) |
 * | the app becomes active | `'foreground'` | this file |
 * | every `TICK_MS` **while active** | `'tick'` | this file |
 * | a local write commits | `'write'` | this file's `afterCommit`, handed to the repository |
 * | the inspector's button | `'manual'` | this file's `manual()` |
 * | sign-out | `'teardown'` | `auth/bindings.ts`, wired in WP4.9 |
 * | a background task | `'bgtask'` | nothing — see `registerBackgroundFlush` |
 *
 * THE TICK ONLY RUNS WHILE THE APP IS ACTIVE. An interval that survives backgrounding is either
 * suspended by the OS (so it does nothing and is a lie) or, on Android, keeps a JS context warm
 * to re-check a queue that a `'foreground'` flush will check anyway. The interval is created on
 * entering `'active'` and cleared on leaving it, so there is no timer behind a locked phone.
 *
 * NOTHING HERE IMPORTS REACT NATIVE. `AppState` is injected as a two-method interface, which is
 * what lets `triggers.test.ts` run in the same node suite as the worker — `apps/mobile`'s vitest
 * config collects `src/**\/*.test.ts` in a node environment, and a module that reached for
 * `react-native` at import time could not be collected at all. WP4.9's `SyncProvider.tsx` supplies
 * the real `AppState`, in a `.tsx` file where RN belongs.
 */
import { TICK_MS, type FlushReason } from '@nibblecue/core';
import { rethrowUnlessTeardown } from '../db/latch';

/** The slice of React Native's `AppState` this file uses. */
export interface AppStateSource {
  /** `'active' | 'background' | 'inactive' | 'unknown' | 'extension'` — RN's own union, as text. */
  current(): string;
  /** Subscribe to changes; the returned function unsubscribes. */
  addListener(listener: (state: string) => void): () => void;
}

/** Anything that can be flushed. Narrower than `OutboxWorker` so a test can pass a counter. */
export interface FlushTarget {
  flush(reason: FlushReason): Promise<unknown>;
}

export type IntervalHandle = unknown;

/** Injected so a test states the passage of time instead of sleeping through it. */
export interface Scheduler {
  every(ms: number, fn: () => void): IntervalHandle;
  cancel(handle: IntervalHandle): void;
}

const systemScheduler: Scheduler = {
  every: (ms, fn) => setInterval(fn, ms),
  cancel: handle => clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface TriggerOptions {
  worker: FlushTarget;
  appState: AppStateSource;
  /** Defaults to `TICK_MS` (60 s), the foreground flush tick. */
  tickMs?: number;
  scheduler?: Scheduler;
}

export interface SyncTriggers {
  start(): void;
  stop(): void;
  /**
   * The repository's `afterCommit`. Deliberately fire-and-forget and deliberately not awaited:
   * §1's guarantee is that the UI never waits on the network for a log, so a write nudges the
   * queue and returns. A rejection here can only mean the flush failed, which the queue itself
   * already records.
   */
  afterCommit(): void;
  /** The Sync inspector's "Sync now". Awaited, because a person pressed it and is watching. */
  manual(): Promise<unknown>;
}

export function createTriggers(options: TriggerOptions): SyncTriggers {
  const { worker, appState } = options;
  const tickMs = options.tickMs ?? TICK_MS;
  const scheduler = options.scheduler ?? systemScheduler;

  let offAppState: (() => void) | null = null;
  let tick: IntervalHandle | null = null;
  let running = false;

  const startTick = () => {
    if (tick !== null) return;
    tick = scheduler.every(tickMs, () => void worker.flush('tick').catch(rethrowUnlessTeardown));
  };
  const stopTick = () => {
    if (tick === null) return;
    scheduler.cancel(tick);
    tick = null;
  };

  return {
    start() {
      if (running) return;
      running = true;
      offAppState = appState.addListener(state => {
        if (state === 'active') {
          startTick();
          void worker.flush('foreground').catch(rethrowUnlessTeardown);
          return;
        }
        // Backgrounded, locked, or showing the app switcher: no timer behind a dark screen.
        stopTick();
      });
      // Starting while already foreground is the ordinary case — the provider mounts on a screen
      // the parent is looking at — and the queue should not wait a minute for its first pass.
      if (appState.current() === 'active') {
        startTick();
        void worker.flush('foreground').catch(rethrowUnlessTeardown);
      }
    },

    stop() {
      if (!running) return;
      running = false;
      stopTick();
      offAppState?.();
      offAppState = null;
    },

    afterCommit() {
      void worker.flush('write').catch(rethrowUnlessTeardown);
    },

    manual() {
      return worker.flush('manual');
    },
  };
}

/**
 * The `'bgtask'` seam, and why it is empty in WP4 (D20).
 *
 * A real background drain needs `expo-background-task`/`expo-task-manager`, a plugin entry in
 * `app.config.ts` and a native rebuild that Expo Go cannot run — so registering one here would
 * mean WP4 could not be exercised at all in the environment it is built in. More to the point,
 * "never lose a log" must not rest on a best-effort fifteen-minute wake that iOS may never grant:
 * the case it would cover — the app killed with ops still queued — is covered instead by the
 * unconditional reclaim in `OutboxWorker.start()`, which runs on the next launch and IS testable
 * in node.
 *
 * `'bgtask'` stays in `FlushReason` so the binding is a one-line change in WP9 rather than a new
 * enum value across three files.
 */
export function registerBackgroundFlush(): () => void {
  return () => undefined;
}
