/**
 * When a flush happens, and — more to the point — when one does NOT.
 *
 * The assertion that earns this file is the tick: an interval that keeps running behind a locked
 * phone either does nothing (because the OS suspended it) or keeps a JS context warm to re-check
 * a queue that the next `'foreground'` flush would check anyway. Both are invisible in a screen
 * recording and obvious in a battery graph a week later.
 */
import { TICK_MS, type FlushReason } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { createTriggers, registerBackgroundFlush, type Scheduler } from './triggers';

/** React Native's `AppState`, as much of it as `triggers.ts` uses. */
function fakeAppState(initial = 'active') {
  let state = initial;
  const listeners = new Set<(s: string) => void>();
  return {
    source: {
      current: () => state,
      addListener(listener: (s: string) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    go(next: string) {
      state = next;
      for (const listener of [...listeners]) listener(next);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

/** A scheduler with the clock in the test's hands. */
function fakeScheduler() {
  const timers = new Map<number, () => void>();
  let next = 1;
  const scheduler: Scheduler = {
    every(_ms, fn) {
      const handle = next++;
      timers.set(handle, fn);
      return handle;
    },
    cancel(handle) {
      timers.delete(handle as number);
    },
  };
  return {
    scheduler,
    get live() {
      return timers.size;
    },
    fire() {
      for (const fn of [...timers.values()]) fn();
    },
    lastMs: 0,
  };
}

function worker() {
  const reasons: FlushReason[] = [];
  return {
    reasons,
    flush(reason: FlushReason) {
      reasons.push(reason);
      return Promise.resolve();
    },
  };
}

describe('the trigger set', () => {
  it('flushes immediately when it starts on a screen the parent is looking at', () => {
    const w = worker();
    const app = fakeAppState('active');
    const s = fakeScheduler();
    const triggers = createTriggers({ worker: w, appState: app.source, scheduler: s.scheduler });
    triggers.start();
    expect(w.reasons).toEqual(['foreground']);
    expect(s.live).toBe(1);
  });

  it('does not start a tick when it starts in the background', () => {
    const w = worker();
    const app = fakeAppState('background');
    const s = fakeScheduler();
    createTriggers({ worker: w, appState: app.source, scheduler: s.scheduler }).start();
    expect(w.reasons).toEqual([]);
    expect(s.live).toBe(0);
  });

  it('runs the tick only while the app is active', () => {
    const w = worker();
    const app = fakeAppState('active');
    const s = fakeScheduler();
    const triggers = createTriggers({ worker: w, appState: app.source, scheduler: s.scheduler });
    triggers.start();
    s.fire();
    expect(w.reasons).toEqual(['foreground', 'tick']);

    app.go('background');
    expect(s.live).toBe(0);
    s.fire(); // nothing is scheduled, so nothing fires
    expect(w.reasons).toEqual(['foreground', 'tick']);

    app.go('active');
    expect(s.live).toBe(1);
    expect(w.reasons).toEqual(['foreground', 'tick', 'foreground']);
    s.fire();
    expect(w.reasons).toEqual(['foreground', 'tick', 'foreground', 'tick']);
  });

  it('does not stack a second interval when the app re-activates', () => {
    const w = worker();
    const app = fakeAppState('active');
    const s = fakeScheduler();
    createTriggers({ worker: w, appState: app.source, scheduler: s.scheduler }).start();
    app.go('active');
    app.go('active');
    expect(s.live).toBe(1);
  });

  it('defaults to TICK_MS and takes an override', () => {
    let seen = -1;
    const scheduler: Scheduler = {
      every(ms) {
        seen = ms;
        return 1;
      },
      cancel: () => undefined,
    };
    const app = fakeAppState('active');
    createTriggers({ worker: worker(), appState: app.source, scheduler }).start();
    expect(seen).toBe(TICK_MS);
    createTriggers({ worker: worker(), appState: app.source, scheduler, tickMs: 5_000 }).start();
    expect(seen).toBe(5_000);
  });

  it('a local write and the inspector button each name themselves', async () => {
    const w = worker();
    const app = fakeAppState('active');
    const triggers = createTriggers({
      worker: w,
      appState: app.source,
      scheduler: fakeScheduler().scheduler,
    });
    triggers.afterCommit();
    await triggers.manual();
    expect(w.reasons).toEqual(['write', 'manual']);
  });

  it('stop() leaves no listener and no timer behind', () => {
    const w = worker();
    const app = fakeAppState('active');
    const s = fakeScheduler();
    const triggers = createTriggers({ worker: w, appState: app.source, scheduler: s.scheduler });
    triggers.start();
    triggers.stop();
    expect(s.live).toBe(0);
    expect(app.listenerCount).toBe(0);
    app.go('active');
    expect(w.reasons).toEqual(['foreground']); // only the one from start()
  });

  it('start() twice is one set of bindings', () => {
    const w = worker();
    const app = fakeAppState('active');
    const s = fakeScheduler();
    const triggers = createTriggers({ worker: w, appState: app.source, scheduler: s.scheduler });
    triggers.start();
    triggers.start();
    expect(app.listenerCount).toBe(1);
    expect(w.reasons).toEqual(['foreground']);
  });
});

describe('the background seam', () => {
  it('is a documented no-op in WP4 (D20), and unregistering it is safe', () => {
    // "never lose a log" does not rest on a best-effort fifteen-minute wake: the kill case is
    // the unconditional reclaim in OutboxWorker.start(), which is testable in node.
    const off = registerBackgroundFlush();
    expect(() => off()).not.toThrow();
  });
});

/**
 * A FLUSH NOBODY AWAITS, MET BY A TEARDOWN (the owner's Expo Go log, 2026-10-01). A forced sign-out
 * at launch closed the database under the first foreground flush, and that flush, started with
 * `void`, said so as a red "Uncaught (in promise)". Every flush this file starts now ends quietly on
 * what a teardown does to it (`db/latch.ts` `isTeardownFallout`), and on nothing else.
 */
describe('a flush a teardown cut short', () => {
  const closed = new Error(
    "Call to function 'NativeDatabase.prepareAsync' has been rejected.\n→ Caused by: Access to closed resource",
  );

  it('leaves nothing rejected for nobody to hear, from any trigger', async () => {
    const heard: unknown[] = [];
    const listen = (reason: unknown) => heard.push(reason);
    process.on('unhandledRejection', listen);
    try {
      const reasons: FlushReason[] = [];
      const w = {
        reasons,
        flush(reason: FlushReason) {
          reasons.push(reason);
          return Promise.reject(closed);
        },
      };
      const app = fakeAppState('active');
      const s = fakeScheduler();
      const triggers = createTriggers({ worker: w, appState: app.source, scheduler: s.scheduler });
      triggers.start(); // the foreground flush on a screen in front
      s.fire(); // the tick
      triggers.afterCommit(); // a write
      app.go('background');
      app.go('active'); // a return to the foreground
      for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0));
      expect(reasons).toEqual(['foreground', 'tick', 'write', 'foreground']);
      expect(heard).toEqual([]);
    } finally {
      process.off('unhandledRejection', listen);
    }
  });
});
