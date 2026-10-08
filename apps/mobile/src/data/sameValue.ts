/**
 * WHETHER A READ CAME BACK WITH WHAT IT ALREADY HAD (2026-09-28) — `useLocalQuery` keeps the value
 * it holds when the new one is this equal to it, so a write that did not change a query does not
 * re-render the query's readers, or re-run every memo below them. The owner's "laggy after every
 * save" was partly this: a bottle re-read Today's rows, the newest of each type and the care list,
 * each landed as a fresh array equal to the last, and each fresh array re-ran the arithmetic
 * behind it — the schedule's included — for nothing.
 *
 * What a read returns is data: rows out of SQLite (plain objects of strings, numbers and nulls),
 * arrays of them, and the objects, Maps and Sets a loader puts round them. Those are compared by
 * content. Anything else — a class instance, a function — is equal only to itself, which is the
 * old behavior: never a false "same", at worst a render that was not needed.
 */

/** Deeper than any read's shape; past it a value counts as changed rather than risk a cycle. */
const MAX_DEPTH = 32;

function isPlain(v: object): boolean {
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function same(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (depth > MAX_DEPTH) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i], depth + 1)) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !same(v, b.get(k), depth + 1)) return false;
    return true;
  }
  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (a instanceof Date) return b instanceof Date && Object.is(a.getTime(), b.getTime());
  if (!isPlain(a) || !isPlain(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(rb, k) || !same(ra[k], rb[k], depth + 1))
      return false;
  }
  return true;
}

/** True when `a` and `b` hold the same data (see the header for what counts). */
export function sameValue(a: unknown, b: unknown): boolean {
  return same(a, b, 0);
}

/**
 * WHAT A READ LANDS AS: the value already held when the new one says the same thing, the new one
 * otherwise — and never by comparing with the value the caller started from. Callers tell that
 * one apart by identity ("not read yet": `useShopping`'s `NOT_READ`, the timers' `NONE`), and an
 * empty list read back is equal to an empty stand-in in every way but that one; kept, it would
 * say "not read yet" for as long as the list stayed empty.
 */
export function landed<T>(held: T, next: T, initial: T, same: (a: T, b: T) => boolean): T {
  if (held === initial || next === initial) return next;
  return same(held, next) ? held : next;
}

/**
 * Two reads that agree in everything but `atMs`, the moment each was taken — a read stamped with
 * its own time is otherwise never the same twice. The schedule's (`useScheduleDay`): its stamp
 * only has to be later than the writes of the rows it came with, and the held one already is.
 */
export const sameButWhenRead = <T extends { atMs: number }>(held: T, next: T): boolean =>
  sameValue({ ...held, atMs: 0 }, { ...next, atMs: 0 });
