import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  drainedCount,
  EMPTY_SNAPSHOT,
  FAILED_GRACE_MS,
  failureSettled,
  outboxTeardown,
  setSyncRuntime,
  stopSyncForTeardown,
  SYNC_MIN_SHOWN_MS,
  SYNC_SHOW_DELAY_MS,
  syncChipFrom,
  syncBannerFrom,
  syncChipShown,
  syncRuntime,
  queuedWhileOffline,
  syncStatus,
  SyncStatusStore,
  unsyncedCount,
  type SyncRuntime,
  type SyncSnapshot,
} from './status';

const snap = (over: Partial<SyncSnapshot> = {}): SyncSnapshot => ({ ...EMPTY_SNAPSHOT, ...over });

describe('the chip precedence (WP4 D33, docs/OFFLINE_SYNC.md §6)', () => {
  it('is ok only when connected, idle and owed nothing', () => {
    expect(syncChipFrom(EMPTY_SNAPSHOT)).toEqual({ state: 'ok' });
  });

  it('A NON-EMPTY QUEUE WHILE ONLINE AND NOT FLUSHING IS queued, NEVER ok', () => {
    expect(syncChipFrom(snap({ pending: 1 }))).toEqual({ state: 'queued', count: 1 });
    expect(syncChipFrom(snap({ sending: 1 }))).toEqual({ state: 'queued', count: 1 });
    expect(syncChipFrom(snap({ pending: 4, sending: 2 }))).toEqual({ state: 'queued', count: 6 });
  });

  it('counts pending + sending, because a row in flight is still owed', () => {
    // the failure this pins: a chip that dropped to "2 queued" the moment three rows left the
    // device would read as an entry vanishing
    expect(syncChipFrom(snap({ pending: 0, sending: 3 })).count).toBe(3);
    expect(syncChipFrom(snap({ pending: 2, sending: 3 })).count).toBe(5);
  });

  it('failed outranks everything, including offline and flushing', () => {
    expect(syncChipFrom(snap({ failed: 1 }))).toEqual({ state: 'error', count: 1 });
    expect(syncChipFrom(snap({ failed: 2, connected: false }))).toEqual({
      state: 'error',
      count: 2,
    });
    expect(syncChipFrom(snap({ failed: 1, flushing: true, pending: 9 }))).toEqual({
      state: 'error',
      count: 1,
    });
  });

  it('offline outranks flushing and queued, because a stalled queue is not a working one', () => {
    expect(syncChipFrom(snap({ connected: false }))).toEqual({ state: 'offline' });
    // THE ONE LINE THE OWNER IS BEING ASKED ABOUT (see status.ts). WP4.9's precedence puts
    // offline above queued; OFFLINE_SYNC §6's table and the package's Demo want `3 queued` for
    // an offline phone that owes entries. The precedence shipped; this assertion is the pin, so
    // flipping it is an edit to a test rather than a drift nobody notices.
    expect(syncChipFrom(snap({ connected: false, pending: 3 }))).toEqual({ state: 'offline' });
    expect(syncChipFrom(snap({ connected: false, flushing: true, pending: 3 }))).toEqual({
      state: 'offline',
    });
  });

  it('syncing outranks queued, and is what `queued` alone could not say', () => {
    expect(syncChipFrom(snap({ flushing: true }))).toEqual({ state: 'syncing' });
    expect(syncChipFrom(snap({ flushing: true, pending: 3 }))).toEqual({ state: 'syncing' });
  });

  it('maps every combination of the five inputs to exactly one state', () => {
    const states = new Set<string>();
    for (const connected of [true, false]) {
      for (const flushing of [true, false]) {
        for (const pending of [0, 1, 2]) {
          for (const sending of [0, 1]) {
            for (const failed of [0, 1]) {
              const out = syncChipFrom(snap({ connected, flushing, pending, sending, failed }));
              expect(['ok', 'syncing', 'offline', 'queued', 'error']).toContain(out.state);
              // a count is present exactly for the two states that carry a number
              expect(out.count !== undefined).toBe(out.state === 'queued' || out.state === 'error');
              if (out.count !== undefined) expect(out.count).toBeGreaterThan(0);
              states.add(out.state);
            }
          }
        }
      }
    }
    // non-vacuous: the sweep really does reach all five
    expect([...states].sort()).toEqual(['error', 'offline', 'ok', 'queued', 'syncing']);
  });

  it('never says "0 queued" or "0 needs attention"', () => {
    for (const s of [EMPTY_SNAPSHOT, snap({ flushing: true }), snap({ connected: false })]) {
      expect(syncChipFrom(s).count).toBeUndefined();
    }
  });

  it('counts everything unsent for the sign-out sheet, failures included', () => {
    expect(unsyncedCount(snap({ pending: 2, sending: 1, failed: 3 }))).toBe(6);
    expect(unsyncedCount(EMPTY_SNAPSHOT)).toBe(0);
  });
});

describe('the snapshot store', () => {
  it('notifies on a change and stays quiet on an identical snapshot', () => {
    let seen = 0;
    const off = syncStatus.subscribe(() => {
      seen += 1;
    });
    syncStatus.set(snap({ pending: 1 }));
    syncStatus.set(snap({ pending: 1 }));
    expect(seen).toBe(1);
    expect(syncStatus.get().pending).toBe(1);
    syncStatus.set(snap({ pending: 2 }));
    expect(seen).toBe(2);
    off();
    syncStatus.set(snap({ pending: 3 }));
    expect(seen).toBe(2);
    syncStatus.reset();
    expect(syncStatus.get()).toMatchObject(EMPTY_SNAPSHOT);
    // and no run of the last household's queue is held on the chip (`SYNC_SHOW_DELAY_MS`)
    expect(syncStatus.get()).toMatchObject({ busyShowAt: null, busyEndedAt: null });
    expect(syncChipShown(syncStatus.get())).toEqual({ state: 'ok' });
  });
});

/**
 * A YOUNG FAILURE IS NOT YET "NOT SYNCED" (the owner, 2026-09-24: *"after a few minutes the not
 * synced is removed by itself, but this can cause confusions to users"*). A FAILED op can still go
 * by itself — the tour's clean-up, a deleted entry's refused create, a merged row adopted — so it
 * is owed ("queued") for `FAILED_GRACE_MS`, and only then called what it is.
 */
describe('a failure’s grace before the chip says "Not synced"', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts a young failure as owed, and calls it "Not synced" once it has lasted', () => {
    const t0 = 1_000_000;
    const young = snap({ failed: 1, pending: 1, failedSince: t0 });
    expect(syncChipFrom(young, t0 + 1_000)).toEqual({ state: 'queued', count: 2 });
    expect(failureSettled(young, t0 + FAILED_GRACE_MS - 1)).toBe(false);
    expect(syncChipFrom(young, t0 + FAILED_GRACE_MS)).toEqual({ state: 'error', count: 1 });
    // offline still says offline while the failure is young, as it would with anything owed
    expect(syncChipFrom({ ...young, connected: false }, t0 + 1_000)).toEqual({ state: 'offline' });
  });

  it('tells a failure at once when there is no time on it — one the app opened with', () => {
    expect(syncChipFrom(snap({ failed: 2 }), 0)).toEqual({ state: 'error', count: 2 });
    expect(syncChipFrom(snap({ failed: 2, failedSince: null }), 0).state).toBe('error');
  });

  it('dates a failure when it appears, keeps the date while it lasts, and drops it after', () => {
    let now = 5_000;
    const store = new SyncStatusStore(() => now);
    // the session's first snapshot: whatever failed before the app opened is not new
    store.set(snap({ failed: 1 }));
    expect(store.get().failedSince).toBeNull();
    store.set(snap());
    expect(store.get().failedSince).toBeNull();
    // a failure this session saw happen
    now = 9_000;
    store.set(snap({ failed: 1 }));
    expect(store.get().failedSince).toBe(9_000);
    now = 20_000;
    store.set(snap({ failed: 2 }));
    expect(store.get().failedSince).toBe(9_000);
    store.set(snap({ failed: 0 }));
    expect(store.get().failedSince).toBeNull();
    // after a sign-out the next session's first snapshot is first again
    store.reset();
    store.set(snap({ failed: 1 }));
    expect(store.get().failedSince).toBeNull();
  });

  it('wakes the chip when the grace runs out, with nothing else changing', () => {
    vi.useFakeTimers();
    let now = 0;
    const store = new SyncStatusStore(() => now);
    store.set(snap());
    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });
    store.set(snap({ failed: 1 }));
    expect(heard).toBe(1);
    const before = store.get();
    expect(syncChipFrom(before, now).state).toBe('queued');

    now = FAILED_GRACE_MS;
    vi.advanceTimersByTime(FAILED_GRACE_MS);
    expect(heard).toBe(2);
    // a new object, so a reader keyed on identity renders again and asks the time again
    expect(store.get()).not.toBe(before);
    expect(syncChipFrom(store.get(), now)).toEqual({ state: 'error', count: 1 });
  });

  it('never wakes for a failure that went by itself inside its grace', () => {
    vi.useFakeTimers();
    const store = new SyncStatusStore(() => 0);
    store.set(snap());
    store.set(snap({ failed: 1 }));
    store.set(snap({ failed: 0 }));
    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });
    vi.advanceTimersByTime(FAILED_GRACE_MS * 2);
    expect(heard).toBe(0);
    expect(syncChipFrom(store.get(), FAILED_GRACE_MS * 2)).toEqual({ state: 'ok' });
  });
});

/**
 * NO "SYNCING" BLIP (the owner, 2026-09-26: *"sometimes the 'syncing' shows up only for a few
 * milliseconds when recording entry, if it's just a few milliseconds, just dont show this up.
 * unless if it's still trying to sync after seconds, then you can show it up"*).
 *
 * A queue on its way — syncing, or owed while connected — is shown only once it has been on its way
 * for `SYNC_SHOW_DELAY_MS`, and once shown stays at least `SYNC_MIN_SHOWN_MS`. The store keeps the
 * times; `syncChipShown` reads them. `now` is injected, so every case is a stated time.
 */
describe('the sync chip waits before it says "Syncing"', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A store at `t`, and the chip as the top bar would draw it at `t`. */
  const rig = () => {
    let t = 1_000_000;
    const store = new SyncStatusStore(() => t);
    store.set(snap());
    return {
      store,
      at: (ms: number) => {
        t = ms;
      },
      get now() {
        return t;
      },
      chip: () => syncChipShown(store.get(), t),
    };
  };

  it('the rule, as numbers: two seconds before it shows, 600 ms once it has', () => {
    expect(SYNC_SHOW_DELAY_MS).toBe(2_000);
    expect(SYNC_MIN_SHOWN_MS).toBe(600);
  });

  it('never shows a write that syncs within a moment — the owner’s blip', () => {
    const r = rig();
    const t0 = r.now;
    // the write lands, the nudge flushes it, the pull behind the push comes back: 350 ms in all
    r.store.set(snap({ pending: 1 }));
    expect(r.chip()).toEqual({ state: 'ok' });
    r.at(t0 + 40);
    r.store.set(snap({ flushing: true }));
    expect(r.chip()).toEqual({ state: 'ok' });
    r.at(t0 + 350);
    r.store.set(snap());
    expect(r.chip()).toEqual({ state: 'ok' });
    // and nothing is held over from it
    r.at(t0 + 2_500);
    expect(r.chip()).toEqual({ state: 'ok' });
  });

  it('shows "Syncing" once a sync has run for two seconds, and not a moment before', () => {
    const r = rig();
    const t0 = r.now;
    r.store.set(snap({ flushing: true, pending: 3 }));
    r.at(t0 + SYNC_SHOW_DELAY_MS - 1);
    expect(r.chip()).toEqual({ state: 'ok' });
    r.at(t0 + SYNC_SHOW_DELAY_MS);
    expect(r.chip()).toEqual({ state: 'syncing' });
  });

  it('keeps a shown "Syncing" for its minimum when the sync finishes just after it appeared', () => {
    const r = rig();
    const t0 = r.now;
    r.store.set(snap({ flushing: true }));
    // done 100 ms after the chip appeared
    r.at(t0 + SYNC_SHOW_DELAY_MS + 100);
    r.store.set(snap());
    expect(r.chip()).toEqual({ state: 'syncing' });
    r.at(t0 + SYNC_SHOW_DELAY_MS + SYNC_MIN_SHOWN_MS - 1);
    expect(r.chip()).toEqual({ state: 'syncing' });
    r.at(t0 + SYNC_SHOW_DELAY_MS + SYNC_MIN_SHOWN_MS);
    expect(r.chip()).toEqual({ state: 'ok' });
  });

  it('lets a long sync go as soon as it is done, once the minimum is behind it', () => {
    const r = rig();
    const t0 = r.now;
    r.store.set(snap({ flushing: true }));
    r.at(t0 + 5_000);
    expect(r.chip()).toEqual({ state: 'syncing' });
    r.store.set(snap());
    expect(r.chip()).toEqual({ state: 'ok' });
  });

  it('shows a queue that is stuck while connected once it has been stuck for the delay', () => {
    const r = rig();
    const t0 = r.now;
    // a flush that could not get through, and backs off with the entry still owed
    r.store.set(snap({ flushing: true, pending: 1 }));
    r.at(t0 + 300);
    r.store.set(snap({ pending: 1 }));
    expect(r.chip()).toEqual({ state: 'ok' });
    r.at(t0 + SYNC_SHOW_DELAY_MS);
    expect(r.chip()).toEqual({ state: 'queued', count: 1 });
  });

  it('changes the word at once when a chip already on screen starts syncing — never a gap', () => {
    const r = rig();
    // offline, two entries owed: said at once, as it always was
    r.store.set(snap({ connected: false, pending: 2 }));
    expect(r.chip()).toEqual({ state: 'offline' });
    // the network comes back and the queue goes: "Syncing" straight away, not two seconds of nothing
    r.at(r.now + 10);
    r.store.set(snap({ flushing: true, pending: 2 }));
    expect(r.chip()).toEqual({ state: 'syncing' });
  });

  it('never delays "Offline", and leaves "Not synced" to its own two minutes', () => {
    const r = rig();
    const t0 = r.now;
    r.store.set(snap({ connected: false }));
    expect(r.chip()).toEqual({ state: 'offline' });
    r.store.set(snap());
    // a failure this session saw happen: owed (and so held like any queue) until its grace is over
    r.at(t0 + 1_000);
    r.store.set(snap({ failed: 1 }));
    expect(r.chip()).toEqual({ state: 'ok' });
    r.at(t0 + 1_000 + SYNC_SHOW_DELAY_MS);
    expect(r.chip()).toEqual({ state: 'queued', count: 1 });
    r.at(t0 + 1_000 + FAILED_GRACE_MS);
    expect(r.chip()).toEqual({ state: 'error', count: 1 });
  });

  it('draws a snapshot with no times on it exactly as the precedence says', () => {
    for (const s of [snap({ flushing: true }), snap({ pending: 2 }), snap({ connected: false })]) {
      expect(syncChipShown(s, 0)).toEqual(syncChipFrom(s, 0));
    }
  });

  it('wakes the bar when the delay runs out, and again when the minimum does', () => {
    vi.useFakeTimers();
    let t = 0;
    const store = new SyncStatusStore(() => t);
    store.set(snap());
    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });
    store.set(snap({ flushing: true }));
    expect(heard).toBe(1);
    t = SYNC_SHOW_DELAY_MS;
    vi.advanceTimersByTime(SYNC_SHOW_DELAY_MS);
    // a new object with nothing else changed, so the bar asks again — and now it shows
    expect(heard).toBe(2);
    expect(syncChipShown(store.get(), t)).toEqual({ state: 'syncing' });
    t = SYNC_SHOW_DELAY_MS + 50;
    store.set(snap());
    expect(heard).toBe(3);
    expect(syncChipShown(store.get(), t)).toEqual({ state: 'syncing' });
    t = SYNC_SHOW_DELAY_MS + SYNC_MIN_SHOWN_MS;
    vi.advanceTimersByTime(SYNC_MIN_SHOWN_MS - 50);
    expect(heard).toBe(4);
    expect(syncChipShown(store.get(), t)).toEqual({ state: 'ok' });
  });

  it('a sign-out lets go of a sync being held on the chip', () => {
    const r = rig();
    const t0 = r.now;
    r.store.set(snap({ flushing: true }));
    r.at(t0 + SYNC_SHOW_DELAY_MS + 10);
    r.store.reset();
    expect(r.chip()).toEqual({ state: 'ok' });
  });
});

describe('the late-bound teardown binding (docs/ACCOUNTS.md §4 steps 1-3)', () => {
  const fake = (over: Partial<SyncRuntime> = {}): SyncRuntime => ({
    flush: async () => undefined,
    pullNow: async () => undefined,
    mock: null,
    pending: async () => [],
    refresh: async () => undefined,
    dueNow: async () => undefined,
    retry: async () => undefined,
    stopForTeardown: () => undefined,
    ...over,
  });

  it('resolves the runtime at CALL time, not when the binding was built', async () => {
    setSyncRuntime(null);
    const binding = outboxTeardown(); // built before any provider has mounted
    expect(await binding.pending()).toEqual([]);
    const rows = [{ client_op_id: 'a' }] as never;
    setSyncRuntime(fake({ pending: async () => rows }));
    // the SAME binding now sees the real worker: this is the WP2 defect it exists to fix
    expect(await binding.pending()).toBe(rows);
    setSyncRuntime(null);
  });

  it('flushes with the teardown reason and gives up at the budget rather than hanging', async () => {
    const reasons: string[] = [];
    setSyncRuntime(
      fake({
        flush: reason => {
          reasons.push(reason);
          return new Promise(() => undefined); // a request that never answers
        },
      }),
    );
    const started = Date.now();
    await outboxTeardown().flush(20);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(reasons).toEqual(['teardown']);
    setSyncRuntime(null);
  });

  it('a flush that throws never stops the teardown', async () => {
    setSyncRuntime(fake({ flush: () => Promise.reject(new Error('no network')) }));
    await expect(outboxTeardown().flush(50)).rejects.toThrow('no network');
    // step 2 is wrapped in teardown.ts's own try/catch, which is what makes this safe; the
    // binding deliberately does not swallow, so a failure is recorded as step 2 in `failed`
    setSyncRuntime(null);
  });

  it('stopForTeardown is a no-op with no runtime and reaches it when there is one', () => {
    setSyncRuntime(null);
    expect(() => stopSyncForTeardown()).not.toThrow();
    let stopped = 0;
    setSyncRuntime(
      fake({
        stopForTeardown: () => {
          stopped += 1;
        },
      }),
    );
    stopSyncForTeardown();
    expect(stopped).toBe(1);
    expect(syncRuntime()).not.toBeNull();
    setSyncRuntime(null);
    expect(syncRuntime()).toBeNull();
  });
});

describe('what one snapshot to the next says happened (docs/OFFLINE_SYNC.md §6 toasts)', () => {
  it('reports the queue draining, with the count the parent last saw', () => {
    expect(drainedCount(snap({ pending: 3 }), snap())).toBe(3);
    expect(drainedCount(snap({ pending: 1, sending: 2 }), snap())).toBe(3);
  });

  it('says nothing when there was nothing queued, or when some is still owed', () => {
    expect(drainedCount(EMPTY_SNAPSHOT, EMPTY_SNAPSHOT)).toBeNull();
    expect(drainedCount(snap({ pending: 3 }), snap({ pending: 1 }))).toBeNull();
    expect(drainedCount(snap({ pending: 3 }), snap({ sending: 3 }))).toBeNull();
  });

  it('NEVER CALLS A QUEUE THAT FAILED "synced" — the toast promises one server record each', () => {
    expect(drainedCount(snap({ pending: 2 }), snap({ failed: 2 }))).toBeNull();
    // one drained and one failed is still not a clean drain
    expect(drainedCount(snap({ pending: 2 }), snap({ failed: 1 }))).toBeNull();
  });

  it('spots a write queued while offline, and only while offline', () => {
    expect(
      queuedWhileOffline(snap({ connected: false }), snap({ connected: false, pending: 1 })),
    ).toBe(true);
    expect(queuedWhileOffline(snap(), snap({ pending: 1 }))).toBe(false);
    expect(
      queuedWhileOffline(
        snap({ connected: false, pending: 2 }),
        snap({ connected: false, pending: 2 }),
      ),
    ).toBe(false);
    // a row moving from pending to sending is not a new write
    expect(
      queuedWhileOffline(
        snap({ connected: false, pending: 2 }),
        snap({ connected: false, pending: 1, sending: 1 }),
      ),
    ).toBe(false);
  });
});

/**
 * THE BANNER, READ FROM THE QUEUE (the owner on staging, 2026-09-28). It used to be raised only by
 * a failure this session watched happen, so once the app restarted the chip said "Not synced" and
 * nothing offered Try again. It is now a reading of the snapshot the worker publishes — at launch
 * and whenever the queue is read — like the chip beside it, and its dismissal is the store's, for
 * the session.
 */
describe('the sync banner, read from the snapshot', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const T0 = 1_000_000;

  it('shows FAILED ops the app opened with at once, and what their refusal earns', () => {
    const store = new SyncStatusStore(() => T0);
    // the session's first snapshot: the failures were already there
    store.set(snap({ failed: 5, failedCode: 'SERVER' }));
    expect(syncBannerFrom(store.get(), T0)).toEqual({ kind: 'server', needsPerson: true });
  });

  it('waits out a young failure’s grace, as the chip does, and then says it', () => {
    let now = T0;
    const store = new SyncStatusStore(() => now);
    store.set(snap());
    store.set(snap({ failed: 1, failedCode: 'VALIDATION' }));
    expect(syncBannerFrom(store.get(), T0 + FAILED_GRACE_MS - 1)).toBeNull();
    now = T0 + FAILED_GRACE_MS;
    expect(syncBannerFrom(store.get(), now)).toEqual({ kind: 'validation', needsPerson: true });
  });

  it('gives each refusal its sentence, and a row with no code the server’s', () => {
    const at = (failedCode: NonNullable<SyncSnapshot['failedCode']> | null) =>
      syncBannerFrom(snap({ failed: 1, failedCode }), T0)?.kind;
    expect(at('FORBIDDEN')).toBe('permission');
    expect(at('VALIDATION')).toBe('validation');
    expect(at('CONFLICT')).toBe('validation');
    expect(at('SERVER')).toBe('server');
    expect(at(null)).toBe('server');
    // a snapshot that carries no code at all (one a test built, or the store's first)
    const bare: SyncSnapshot = { ...snap({ failed: 1 }) };
    delete bare.failedCode;
    expect(syncBannerFrom(bare, T0)?.kind).toBe('server');
  });

  it('says the server cannot be reached only for unanswered requests that lasted, online, with something owed', () => {
    const stalled = snap({ pending: 2, stalledSince: T0, stalledBy: 'network' });
    expect(syncBannerFrom(stalled, T0 + FAILED_GRACE_MS - 1)).toBeNull();
    expect(syncBannerFrom(stalled, T0 + FAILED_GRACE_MS)).toEqual({
      kind: 'unreachable',
      needsPerson: false,
    });
    // offline is the chip's own word, and a queue with nothing in it has nothing to wait for
    expect(syncBannerFrom({ ...stalled, connected: false }, T0 + FAILED_GRACE_MS)).toBeNull();
    expect(syncBannerFrom({ ...stalled, pending: 0 }, T0 + FAILED_GRACE_MS)).toBeNull();
    expect(syncBannerFrom({ ...stalled, pending: 0, sending: 1 }, T0 + FAILED_GRACE_MS)).toEqual({
      kind: 'unreachable',
      needsPerson: false,
    });
    // a whole call the server refused is the server's, never the network's
    expect(syncBannerFrom({ ...stalled, stalledBy: 'server' }, T0 + FAILED_GRACE_MS)).toEqual({
      kind: 'server',
      needsPerson: false,
    });
    expect(syncBannerFrom(snap({ pending: 2 }), T0 + FAILED_GRACE_MS)).toBeNull();
  });

  it('puts a FAILED op before a stalled run: that one needs a person', () => {
    const both = snap({
      pending: 1,
      failed: 1,
      failedCode: 'FORBIDDEN',
      stalledSince: T0,
      stalledBy: 'network',
    });
    expect(syncBannerFrom(both, T0 + FAILED_GRACE_MS)).toEqual({
      kind: 'permission',
      needsPerson: true,
    });
  });

  it('keeps a dismissal for the session: a failure after it stays quiet, a new session does not', () => {
    let now = T0;
    const store = new SyncStatusStore(() => now);
    store.set(snap({ failed: 1, failedCode: 'SERVER' }));
    expect(syncBannerFrom(store.get(), now)).not.toBeNull();
    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });
    store.dismissBanner();
    expect(heard).toBe(1);
    expect(syncBannerFrom(store.get(), now)).toBeNull();
    // a second dismiss is not news
    store.dismissBanner();
    expect(heard).toBe(1);
    // the queue clears, and fails again later in the same session: no second banner
    store.set(snap());
    store.set(snap({ failed: 2, failedCode: 'SERVER' }));
    now = T0 + FAILED_GRACE_MS * 3;
    expect(syncBannerFrom(store.get(), now)).toBeNull();
    // and neither does a stalled run
    store.set(snap({ pending: 1, stalledSince: T0, stalledBy: 'network' }));
    expect(syncBannerFrom(store.get(), now)).toBeNull();
    // a sign-out ends the session; the next one is told again
    store.reset();
    store.set(snap({ failed: 1, failedCode: 'SERVER' }));
    expect(syncBannerFrom(store.get(), now)).toEqual({ kind: 'server', needsPerson: true });
  });

  it('wakes the banner when a stalled run passes its grace, with nothing else changing', () => {
    vi.useFakeTimers();
    let now = 0;
    const store = new SyncStatusStore(() => now);
    store.set(snap());
    store.set(snap({ pending: 1, stalledSince: 0, stalledBy: 'network' }));
    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });
    const before = store.get();
    now = FAILED_GRACE_MS;
    vi.advanceTimersByTime(FAILED_GRACE_MS);
    expect(heard).toBeGreaterThanOrEqual(1);
    expect(store.get()).not.toBe(before);
    expect(syncBannerFrom(store.get(), now)?.kind).toBe('unreachable');
  });

  it('hands out a new snapshot when only what the banner reads changes', () => {
    const store = new SyncStatusStore(() => T0);
    store.set(snap({ failed: 1, failedCode: 'FORBIDDEN' }));
    const first = store.get();
    store.set(snap({ failed: 1, failedCode: 'SERVER' }));
    expect(store.get()).not.toBe(first);
    const second = store.get();
    store.set(snap({ failed: 1, failedCode: 'SERVER', stalledSince: T0, stalledBy: 'network' }));
    expect(store.get()).not.toBe(second);
    // and when only whose household the refusals are about changes (2026-09-29)
    store.set(snap({ failed: 1, failedCode: 'FORBIDDEN' }));
    const third = store.get();
    store.set(snap({ failed: 1, failedCode: 'FORBIDDEN', failedElsewhere: true }));
    expect(store.get()).not.toBe(third);
    expect(syncBannerFrom(store.get(), T0)?.kind).toBe('elsewhere');
  });

  /**
   * "YOUR ROLE CAN'T SAVE THIS", SAID TO A PARENT (the owner on staging, 2026-09-29). The refused
   * entries belonged to a household the account had left, and a sign-in had brought them back
   * (`sync/replay.ts`). A role refusal of rows that all name another household says so instead,
   * asks nothing (no Try again, `SyncProvider`), and is `warn`: nobody can act on it.
   */
  it('names a role refusal of another household’s entries for what it is', () => {
    const elsewhere = snap({ failed: 2, failedCode: 'FORBIDDEN', failedElsewhere: true });
    expect(syncBannerFrom(elsewhere, T0)).toEqual({ kind: 'elsewhere', needsPerson: false });
    // a refusal of this household's entries is still about the role here
    expect(
      syncBannerFrom(snap({ failed: 1, failedCode: 'FORBIDDEN', failedElsewhere: false }), T0),
    ).toEqual({ kind: 'permission', needsPerson: true });
    // only a ROLE refusal can be about another household: any other code keeps its own sentence
    expect(
      syncBannerFrom(snap({ failed: 1, failedCode: 'SERVER', failedElsewhere: true }), T0)?.kind,
    ).toBe('server');
    // it waits out a young failure's grace like any other, and a dismissal holds for it too
    let now = T0;
    const store = new SyncStatusStore(() => now);
    store.set(snap());
    store.set(elsewhere);
    expect(syncBannerFrom(store.get(), T0 + FAILED_GRACE_MS - 1)).toBeNull();
    now = T0 + FAILED_GRACE_MS;
    expect(syncBannerFrom(store.get(), now)?.kind).toBe('elsewhere');
    store.dismissBanner();
    expect(syncBannerFrom(store.get(), now)).toBeNull();
  });

  it('counts a parked op as not synced, never as queued, once its grace is over', () => {
    let now = T0;
    const store = new SyncStatusStore(() => now);
    store.set(snap());
    // an op parked this session: owed while it may yet go by itself...
    store.set(snap({ failed: 1, failedCode: 'SERVER' }));
    expect(syncChipFrom(store.get(), now)).toEqual({ state: 'queued', count: 1 });
    // ...and after that, what it is — for good, whatever else the queue does
    now = T0 + FAILED_GRACE_MS;
    expect(syncChipFrom(store.get(), now)).toEqual({ state: 'error', count: 1 });
    now += 60 * 60_000;
    expect(syncChipFrom(store.get(), now)).toEqual({ state: 'error', count: 1 });
  });
});
