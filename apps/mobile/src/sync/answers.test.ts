/**
 * THE QUEUE'S READERS READ THEIR ANSWER, NOT THE QUEUE (`status.ts`, 2026-09-28).
 *
 * Every page's top bar, the banner's provider and the widget publisher used to read the whole
 * snapshot, so each re-rendered at every step of every flush — two or three for a save on a good
 * connection — for a chip that, for a sync that takes a moment, never shows at all. They read a
 * comparable answer now, and React re-renders a reader when its answer changes. What that buys is
 * counted here: a save's whole flush, played through the real store, and the number of distinct
 * answers each reader saw.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bannerKey,
  bannerOfKey,
  chipFor,
  chipKey,
  chipOfKey,
  EMPTY_SNAPSHOT,
  FAILED_GRACE_MS,
  SYNC_SHOW_DELAY_MS,
  syncBannerFrom,
  syncChipShown,
  SyncStatusStore,
  unsyncedCount,
  type SyncSnapshot,
} from './status';

const snap = (over: Partial<SyncSnapshot> = {}): SyncSnapshot => ({ ...EMPTY_SNAPSHOT, ...over });

afterEach(() => {
  vi.useRealTimers();
});

describe('the answers are the chip and the banner, exactly', () => {
  it('a chip survives its key, whatever it says', () => {
    for (const chip of [
      { state: 'ok' as const },
      { state: 'offline' as const },
      { state: 'syncing' as const },
      { state: 'queued' as const, count: 3 },
      { state: 'error' as const, count: 1 },
    ]) {
      expect(chipOfKey(chipKey(chip))).toEqual(chip);
    }
  });

  it('is the chip the bar drew before: the session offline makes it offline', () => {
    const cases = [snap(), snap({ pending: 2 }), snap({ flushing: true }), snap({ failed: 1 })];
    for (const s of cases) {
      expect(chipFor(s, true, 5_000)).toEqual(syncChipShown(s, 5_000));
      expect(chipFor(s, false, 5_000)).toEqual(syncChipShown({ ...s, connected: false }, 5_000));
    }
  });

  it('a banner survives its key, and none is the empty key', () => {
    for (const call of [
      { kind: 'server' as const, needsPerson: true },
      { kind: 'unreachable' as const, needsPerson: false },
      { kind: 'permission' as const, needsPerson: true },
      { kind: 'elsewhere' as const, needsPerson: false },
    ]) {
      expect(bannerOfKey(bannerKey(call))).toEqual(call);
    }
    expect(bannerKey(null)).toBe('');
    expect(bannerOfKey('')).toBeNull();
  });
});

describe('a save’s flush, played through the store: what each reader sees change', () => {
  it('the bar, the banner and the widget see nothing change for a sync that takes a moment', () => {
    vi.useFakeTimers();
    let now = 10_000;
    const store = new SyncStatusStore(() => now);
    store.set(snap());
    const seen = { snapshots: 0, chip: new Set<string>(), banner: new Set<string>(), queued: 0 };
    let lastQueued = unsyncedCount(store.get());
    store.subscribe(() => {
      seen.snapshots += 1;
      const s = store.get();
      seen.chip.add(chipKey(chipFor(s, true, now)));
      seen.banner.add(bannerKey(syncBannerFrom(s, now)));
      const q = unsyncedCount(s);
      if (q !== lastQueued) seen.queued += 1;
      lastQueued = q;
    });
    // the write, then its flush: sent, pulled back, done — well inside the chip's show delay
    now += 5;
    store.set(snap({ pending: 1 }));
    now += 5;
    store.set(snap({ flushing: true, sending: 1 }));
    now += 300;
    store.set(snap({ flushing: true }));
    now += 200;
    store.set(snap());
    vi.advanceTimersByTime(SYNC_SHOW_DELAY_MS + FAILED_GRACE_MS);
    // the whole snapshot moved at every step, and the old readers re-rendered at each
    expect(seen.snapshots).toBeGreaterThanOrEqual(4);
    // the bar's answer never left "nothing to say"; the banner never appeared
    expect([...seen.chip]).toEqual(['ok:']);
    expect([...seen.banner]).toEqual(['']);
    // the widget's count moved twice: owed, then sent
    expect(seen.queued).toBe(2);
  });

  it('a sync that goes on past the delay is said, exactly when it was before', () => {
    vi.useFakeTimers();
    let now = 10_000;
    const store = new SyncStatusStore(() => now);
    store.set(snap());
    const keys: string[] = [];
    store.subscribe(() => {
      const key = chipKey(chipFor(store.get(), true, now));
      if (keys.at(-1) !== key) keys.push(key);
    });
    store.set(snap({ flushing: true, sending: 1 }));
    now += SYNC_SHOW_DELAY_MS;
    vi.advanceTimersByTime(SYNC_SHOW_DELAY_MS);
    expect(keys).toEqual(['ok:', 'syncing:']);
  });
});
