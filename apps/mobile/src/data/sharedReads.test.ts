/**
 * ONE READ FOR EVERY READER OF THE SAME THING (`sharedReads.ts`). The class is the whole of the
 * behavior, so it is held here against the app's real store and a counting loader; the hook that
 * binds it to React (`useSharedLocalQuery.ts`) is pinned by source at the end, as the save-cost
 * scans pin the rest of the wiring a node suite cannot render.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { SharedReads, sharedReadId, type SharedSpec } from './sharedReads';
import { createStore, type Store } from './store';

const db = {} as Db;
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** A loader that counts its reads and hands out what `next` says at the moment it runs. */
function counted<T>(next: () => T) {
  const spec = { calls: 0 };
  const load = async (): Promise<T> => {
    spec.calls += 1;
    await Promise.resolve();
    return next();
  };
  return { spec, load };
}

function setup(): { store: Store; reads: SharedReads; errors: string[] } {
  const store = createStore();
  const errors: string[] = [];
  const reads = new SharedReads({
    store,
    open: () => Promise.resolve(db),
    onError: id => errors.push(id),
  });
  return { store, reads, errors };
}

const INITIAL: { rows: number[] } = { rows: [] };

describe('one read, however many readers', () => {
  it('reads once for readers that arrive together, and hands each the same value', async () => {
    const { reads } = setup();
    const { spec, load } = counted(() => ({ rows: [1, 2] }));
    const s: SharedSpec<{ rows: number[] }> = { keys: ['timers/h1'], load, initial: INITIAL };
    const woke: string[] = [];
    reads.subscribe('t', s, () => woke.push('a'));
    reads.subscribe('t', s, () => woke.push('b'));
    reads.subscribe('t', s, () => woke.push('c'));
    expect(reads.value('t', INITIAL)).toBe(INITIAL);
    await tick();
    expect(spec.calls).toBe(1);
    expect(reads.value('t', INITIAL)).toEqual({ rows: [1, 2] });
    expect(woke).toEqual(['a', 'b', 'c']);
  });

  it('runs the read once for a write that names several of its keys, for every reader', async () => {
    const { store, reads } = setup();
    let n = 0;
    const { spec, load } = counted(() => ({ rows: [n] }));
    const s = { keys: ['a', 'b', 'c'], load, initial: INITIAL };
    for (let i = 0; i < 5; i++) reads.subscribe('x', s, () => undefined);
    await tick();
    expect(spec.calls).toBe(1);
    n = 1;
    store.invalidate('a', 'b', 'c');
    await tick();
    expect(spec.calls).toBe(2);
    expect(reads.value('x', INITIAL)).toEqual({ rows: [1] });
  });

  it('a reader that arrives later starts on the value already read, with one fresh read behind it', async () => {
    const { reads } = setup();
    let n = 7;
    const { spec, load } = counted(() => ({ rows: [n] }));
    const s = { keys: ['k'], load, initial: INITIAL };
    reads.subscribe('x', s, () => undefined);
    await tick();
    // its first frame: the value, not the stand-in
    expect(reads.value('x', INITIAL)).toEqual({ rows: [7] });
    n = 8;
    let late = 0;
    reads.subscribe('x', s, () => (late += 1));
    expect(reads.value('x', INITIAL)).toEqual({ rows: [7] });
    await tick();
    expect(spec.calls).toBe(2);
    expect(reads.value('x', INITIAL)).toEqual({ rows: [8] });
    expect(late).toBe(1);
  });

  it('a reader that arrives while a read is on its way waits for that one, and starts no other', async () => {
    const { reads } = setup();
    const { spec, load } = counted(() => ({ rows: [1] }));
    const s = { keys: ['k'], load, initial: INITIAL };
    reads.subscribe('x', s, () => undefined);
    reads.subscribe('x', s, () => undefined);
    await tick();
    expect(spec.calls).toBe(1);
  });
});

describe('what lands, lands as useLocalQuery lands it', () => {
  it('a read that came back with what was held wakes nobody, and keeps the object held', async () => {
    const { store, reads } = setup();
    const { load } = counted(() => ({ rows: [1, 2] }));
    let woke = 0;
    reads.subscribe('x', { keys: ['k'], load, initial: INITIAL }, () => (woke += 1));
    await tick();
    const held = reads.value('x', INITIAL);
    store.invalidate('k');
    await tick();
    expect(woke).toBe(1);
    expect(reads.value('x', INITIAL)).toBe(held);
  });

  it('a read measured by the caller’s own rule is the same by that rule', async () => {
    const { store, reads } = setup();
    let at = 1;
    const load = async () => ({ rows: [1], atMs: at });
    const same = (a: { rows: number[]; atMs: number }, b: { rows: number[]; atMs: number }) =>
      a.rows.join() === b.rows.join();
    const initial = { rows: [] as number[], atMs: 0 };
    reads.subscribe('x', { keys: ['k'], load, initial, same }, () => undefined);
    await tick();
    const held = reads.value('x', initial);
    at = 2;
    store.invalidate('k');
    await tick();
    expect(reads.value('x', initial)).toBe(held);
  });

  it('a read that throws lands the caller’s own stand-in, and is named', async () => {
    const { store, reads, errors } = setup();
    let fail = false;
    const load = async () => {
      if (fail) throw new Error('no such table');
      return { rows: [3] };
    };
    reads.subscribe('x', { keys: ['k'], load, initial: INITIAL }, () => undefined);
    await tick();
    expect(reads.value('x', INITIAL)).toEqual({ rows: [3] });
    fail = true;
    store.invalidate('k');
    await tick();
    expect(reads.value('x', INITIAL)).toBe(INITIAL);
    expect(errors).toEqual(['x']);
  });

  it('never has two reads in flight: a write during a read runs it once more, afterwards, and the newest answer stays', async () => {
    const { store, reads } = setup();
    const gates: (() => void)[] = [];
    let n = 0;
    let running = 0;
    let most = 0;
    const load = async () => {
      running += 1;
      most = Math.max(most, running);
      const mine = (n += 1);
      await new Promise<void>(resolve => gates.push(resolve));
      running -= 1;
      return { rows: [mine] };
    };
    reads.subscribe('x', { keys: ['k'], load, initial: INITIAL }, () => undefined);
    await tick();
    // two writes while the first read is still out: one more read, not two
    store.invalidate('k');
    store.invalidate('k');
    gates.shift()?.();
    await tick();
    await tick();
    expect(most).toBe(1);
    expect(n).toBe(2);
    gates.shift()?.();
    await tick();
    expect(reads.value('x', INITIAL)).toEqual({ rows: [2] });
  });
});

describe('the last reader lets it go', () => {
  it('drops the entry and its keys, and the next reader reads afresh', async () => {
    const { store, reads } = setup();
    let n = 1;
    const { spec, load } = counted(() => ({ rows: [n] }));
    const s = { keys: ['k'], load, initial: INITIAL };
    const offA = reads.subscribe('x', s, () => undefined);
    const offB = reads.subscribe('x', s, () => undefined);
    await tick();
    offA();
    expect(reads.readers('x')).toBe(1);
    offB();
    expect(reads.readers('x')).toBe(0);
    expect(reads.value('x', INITIAL)).toBe(INITIAL);
    // no longer listening: a write reads nothing
    store.invalidate('k');
    await tick();
    expect(spec.calls).toBe(1);
    n = 2;
    reads.subscribe('x', s, () => undefined);
    await tick();
    expect(spec.calls).toBe(2);
    expect(reads.value('x', INITIAL)).toEqual({ rows: [2] });
  });

  it('a read that lands after everybody has gone changes nothing', async () => {
    const { reads } = setup();
    let release = (): void => undefined;
    const load = () =>
      new Promise<{ rows: number[] }>(resolve => {
        release = () => resolve({ rows: [9] });
      });
    let woke = 0;
    const off = reads.subscribe('x', { keys: ['k'], load, initial: INITIAL }, () => (woke += 1));
    await tick();
    off();
    release();
    await tick();
    expect(woke).toBe(0);
    expect(reads.value('x', INITIAL)).toBe(INITIAL);
  });

  it('keeps two different reads apart: the id is what is read and what bumps it', () => {
    expect(sharedReadId('timers/h1', ['timers/h1'])).not.toBe(
      sharedReadId('timers/h2', ['timers/h2']),
    );
    expect(sharedReadId('day/h1/UTC', ['a', 'b'])).not.toBe(sharedReadId('day/h1/UTC', ['a']));
  });
});

describe('the hook binds the class to the app, and to nothing else', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const hook = readFileSync(join(here, 'useSharedLocalQuery.ts'), 'utf8').replace(/\s+/g, ' ');

  it('subscribes through React’s store hook, keyed on the id alone', () => {
    expect(hook).toContain('return useSyncExternalStore(subscribe, snapshot, snapshot);');
    expect(hook).toContain(
      '(onChange: () => void) => sharedReads.subscribe(id, spec.current, onChange), [id],',
    );
    expect(hook).toContain('const id = sharedReadId(share, keys);');
  });
});

/*
  WHO SHARES (2026-09-28): each read below is made by several mounted readers at once, and its
  share names everything its loader closes over — the household, and the zone or the switch where
  the loader reads one — so two readers under one id always mean the same read.
*/
describe('the reads many readers make at once are shared, each under what it reads', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '..');
  const flat = (...p: string[]): string =>
    readFileSync(join(src, ...p), 'utf8').replace(/\s+/g, ' ');
  // NibbleCue keeps the shared reads it still has; CuddleCue's goals, day window, duty, schedule
  // and nap outlook reads went with the Schedule and the duty card
  const SHARED: [readonly string[], string][] = [
    [['sheets', 'quick', 'useRunningTimers.ts'], "`timers/${householdId ?? ''}`"],
    [['sheets', 'quick', 'prefs.ts'], "`volume-unit/${householdId ?? ''}`"],
    [['household', 'MemberPictures.tsx'], "`member-pictures/${householdId ?? ''}`"],
  ];
  for (const [path, share] of SHARED) {
    it(`${path.join('/')}: ${share}`, () => {
      const text = flat(...path);
      expect(text).toContain('useSharedLocalQuery<');
      expect(text).toContain(`>( ${share}, `);
    });
  }
});
