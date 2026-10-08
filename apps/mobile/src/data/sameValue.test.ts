/**
 * `sameValue`, which lets a read that came back unchanged keep the value it had (`useLocalQuery`):
 * equal data is the same, and anything that could have changed is not.
 */
import { describe, expect, it } from 'vitest';
import { landed, sameButWhenRead, sameValue } from './sameValue';

const row = (id: string, quantity: number | null = 120) => ({
  id,
  type: 'bottle',
  child_id: 'c1',
  start_at: '2026-09-28T14:02:00.000Z',
  end_at: null,
  quantity,
  is_private: 0,
});

describe('the same read, read twice', () => {
  it('is the same: rows as SQLite hands them back, fresh objects with equal fields', () => {
    expect(sameValue([row('a'), row('b')], [row('a'), row('b')])).toBe(true);
    // the shapes loaders wrap round them
    expect(
      sameValue(
        { rows: [row('a')], readFor: 'h|c1|2026-09-28' },
        { rows: [row('a')], readFor: 'h|c1|2026-09-28' },
      ),
    ).toBe(true);
    expect(
      sameValue(
        { items: [row('a')], activity: new Map([['a', { today: 1, byChild: [2] }]]) },
        { items: [row('a')], activity: new Map([['a', { today: 1, byChild: [2] }]]) },
      ),
    ).toBe(true);
    expect(sameValue(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true);
    expect(sameValue(new Date(5), new Date(5))).toBe(true);
    expect(sameValue(null, null)).toBe(true);
    expect(sameValue(3, 3)).toBe(true);
    expect(sameValue(Number.NaN, Number.NaN)).toBe(true);
    expect(sameValue(Object.create(null), {})).toBe(true);
  });
});

describe('a read that changed', () => {
  it('is not the same, wherever the change is', () => {
    // a new entry, an edited one, one taken away, the order changed
    expect(sameValue([row('a')], [row('a'), row('b')])).toBe(false);
    expect(sameValue([row('a'), row('b')], [row('a'), row('b', 90)])).toBe(false);
    expect(sameValue([row('a'), row('b')], [row('b'), row('a')])).toBe(false);
    // a field that became null, a key that is new, a key that went
    expect(sameValue(row('a'), row('a', null))).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValue({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
    // inside a Map, a Set, a Date
    expect(sameValue(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false);
    expect(sameValue(new Map([['a', 1]]), new Map([['b', 1]]))).toBe(false);
    expect(sameValue(new Set(['a']), new Set(['b']))).toBe(false);
    expect(sameValue(new Date(5), new Date(6))).toBe(false);
    // a shape that is not the same kind of thing
    expect(sameValue([], {})).toBe(false);
    expect(sameValue({}, [])).toBe(false);
    expect(sameValue(new Map(), {})).toBe(false);
    expect(sameValue(null, {})).toBe(false);
    expect(sameValue(0, -0)).toBe(false);
    expect(sameValue('1', 1)).toBe(false);
  });

  it('never calls two things the same that it cannot look inside', () => {
    class Box {
      constructor(readonly v: number) {}
    }
    expect(sameValue(new Box(1), new Box(1))).toBe(false);
    const f = () => 1;
    expect(sameValue(f, () => 1)).toBe(false);
    expect(sameValue(f, f)).toBe(true);
    // a Set of objects is compared by who is in it, not by what they hold
    expect(sameValue(new Set([{ a: 1 }]), new Set([{ a: 1 }]))).toBe(false);
  });

  it('gives up on a value deeper than any read, rather than chase a cycle', () => {
    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    a['self'] = a;
    b['self'] = b;
    expect(sameValue(a, b)).toBe(false);
  });
});

describe('a read stamped with the moment it ran (the schedule’s)', () => {
  const read = (atMs: number, sessions = [row('a')]) => ({
    rules: [],
    sessions,
    timers: [],
    skipped: [],
    loaded: true,
    atMs,
    createdAtMs: null,
  });

  it('is the same read when only the stamp moved', () => {
    expect(sameButWhenRead(read(1_000), read(61_000))).toBe(true);
  });

  it('is a new read when anything else did', () => {
    expect(sameButWhenRead(read(1_000), read(61_000, [row('a'), row('b')]))).toBe(false);
    expect(sameButWhenRead(read(1_000), { ...read(1_000), loaded: false })).toBe(false);
  });
});

describe('what a read lands as (`useLocalQuery`)', () => {
  // `useShopping` starts from an empty list it tells apart by identity: "not read yet"
  const NOT_READ: string[] = [];

  it('keeps the value it holds when the read says the same thing', () => {
    const held = ['milk'];
    expect(landed(held, ['milk'], NOT_READ, sameValue)).toBe(held);
  });

  it('takes the read when it says something new', () => {
    const next = ['milk', 'wipes'];
    expect(landed(['milk'], next, NOT_READ, sameValue)).toBe(next);
  });

  it('lands an empty list read back as the read it is, never as the empty stand-in', () => {
    const empty: string[] = [];
    // the first read of an empty list: it must stop saying "not read yet"
    expect(landed(NOT_READ, empty, NOT_READ, sameValue)).toBe(empty);
    // and a list that was read and is now the stand-in again takes the stand-in
    expect(landed(['milk'], NOT_READ, NOT_READ, sameValue)).toBe(NOT_READ);
    // while one empty read after another keeps the first
    expect(landed(empty, [], NOT_READ, sameValue)).toBe(empty);
  });

  it('asks the caller’s own measure when it has one', () => {
    const start = { atMs: 0, rows: [] as number[] };
    const held = { atMs: 1, rows: [1] };
    expect(landed(held, { atMs: 2, rows: [1] }, start, sameButWhenRead)).toBe(held);
  });
});
