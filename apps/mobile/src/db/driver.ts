/**
 * `Db` — the only way anything in the app talks to SQLite (docs/OFFLINE_SYNC.md §2).
 *
 * Four methods and one transaction primitive, small enough that expo-sqlite on the device and
 * `node:sqlite` in a test can both satisfy it exactly (`apps/mobile/src/testing/local-db.ts`).
 * That substitution is the whole point: the §9 acceptance matrix runs in CI with no device,
 * against the same code the phone runs.
 *
 * Two rules the implementations share and `driver.test.ts` pins:
 *
 *   * **`tx` is atomic and serialized.** A repository write mints ids, writes domain rows, the
 *     outbox op and the dedupe key together or not at all (D14), so a partly-applied
 *     transaction is the one failure mode that would lose or double a parent's log. Top-level
 *     transactions are queued rather than interleaved: SQLite has one writer, and two
 *     overlapping `BEGIN IMMEDIATE`s would make the second fail with SQLITE_BUSY rather than
 *     wait.
 *   * **Every `tx` is its own transaction, and waits its turn.** A `db.tx` called while another
 *     is open QUEUES behind it; it never joins it. (It used to join as a savepoint whenever a
 *     transaction was mid-flight, because React Native has no `AsyncLocalStorage` to tell a
 *     call from inside the running callback from one that merely arrived meanwhile — and the
 *     sync sweep of 2026-09-24 showed what that cost: a parent's Save landing while a pull was
 *     applying became part of the pull's transaction, rolled back with it if the pull threw,
 *     and two such savepoints shared a name, so one caller's `release` could end the other's.
 *     A write the parent was told was saved could vanish. "Never lose a log" wins over nesting.)
 *
 * So there is no nesting through `db`: code already inside a transaction passes its `Tx` down,
 * and the `Tx` type cannot open a transaction, so the compiler holds every helper to that. A
 * `db.tx` reached from INSIDE a running callback would wait for itself — which is why none may
 * exist (`driver.test.ts` scans every call site's callback for the root handle).
 *
 * The same routing sends every statement issued WHILE a transaction is open — a screen's read,
 * a single-statement write that did not ask for a transaction — to the transaction's own
 * connection, and that carries
 * one more rule the expo implementation enforces: **the transaction ends only when that
 * connection is idle.** expo-sqlite closes the connection as the transaction ends and
 * finalizes every statement on it first, on another thread, whether or not something is still
 * stepping it. That is a native crash, not an error anything above can catch (the owner's
 * phone, 2026-09-15: dead at the end of the first sync pass on every launch, with nothing in
 * the log after "applying"). So `createExpoDb` counts what it puts on the transaction's
 * connection and waits for it before handing the connection back.
 *
 * **"database is locked" is a wait, never an answer** (the owner's Expo Go log, 2026-09-30: an
 * unhandled *"NativeStatement.finalizeAsync … database is locked"* right after a pull committed).
 * expo-sqlite's transaction is a SECOND connection (`Transaction.createAsync`, `useNewConnection`),
 * and SQLite allows one writer across connections. Both connections started at SQLite's default
 * busy timeout of zero, so a write that met the other connection's lock failed on the spot, with
 * the statement's step and then its finalize rejecting. Two things close it:
 *
 *   * **Every connection waits for a lock** (`BUSY_PRAGMA`): the root one as it opens
 *     (`db/index.ts`), each transaction's before its first statement. A reader that meets a
 *     checkpoint or a WAL reset waits out the moment instead of throwing.
 *   * **A write outside any transaction takes its turn in the transaction queue.** Routed to the
 *     root connection, it could land while a transaction's connection held the write lock: in the
 *     moment between the task returning and COMMIT, or before a transaction's first write, which
 *     then met the root's lock or, worse, a snapshot the root had just moved (SQLITE_BUSY_SNAPSHOT,
 *     which no busy timeout waits out, and which would have failed a parent's Save). Queued, it
 *     runs when no transaction is open, so the two writers never meet. A write issued while a
 *     transaction IS open still joins that transaction's connection, as above.
 *
 * **…and a transaction takes the write lock before it reads anything** (the owner's Expo Go log
 * again, 2026-10-08, after the family switcher: *"sync: pull failed — NativeStatement.finalizeAsync
 * … database is locked"*, and the same text as an *"Uncaught (in promise)"*). The busy timeout
 * above never covered the pull. expo-sqlite opens a transaction with a plain `BEGIN`
 * (`withExclusiveTransactionAsync`, which is DEFERRED whatever its name says), and a pull reads
 * the rows it is about to replace before it writes one. SQLite consults the busy timeout only for
 * a connection that holds no read yet: a transaction that has read and then meets another
 * connection's write lock fails on the spot, and one whose snapshot another connection's commit
 * has moved fails on the spot too (SQLITE_BUSY_SNAPSHOT). Both say "database is locked", in 0 ms,
 * with five seconds of busy timeout set (`writeLockFirst.test.ts` runs both against real SQLite).
 * So each transaction's first statement is a write that changes nothing (`CLAIM_WRITE_LOCK`): the
 * write lock is taken while nothing has been read, which is exactly when SQLite waits for it, and
 * every read after it sees the newest data. It is `BEGIN IMMEDIATE`, said from inside the
 * `BEGIN` expo-sqlite has already sent.
 *
 * One `Db` never has two writers of its own: its queue sees to that. Two `Db`s over ONE file
 * each have their own queue, and since 0153 that can happen: a family's file closed by a switch
 * while its sync engine still had a pass in flight (that pass's transaction opens its own
 * connection, by path, and goes on writing), or a file opened again while its old handle was
 * still being closed (`db/index.ts` `selectLocalDbHousehold`). The claim makes those two wait
 * for each other instead of failing, and `close` (below) ends the old one's work first.
 *
 * Parameters are always positional (`?`): string, number or null, which is every type the
 * mirror's text/integer/real encoding produces. A boolean or a Date reaching here is a bug in
 * the caller's encoding, and the type keeps it out.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

export type SqlValue = string | number | null;

export interface Db {
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  tx<T>(fn: (t: Tx) => Promise<T>): Promise<T>;
}

/** Inside a transaction there is no nesting primitive of its own: `Db.tx` handles that. */
export type Tx = Pick<Db, 'run' | 'all' | 'get'>;

/**
 * HOW LONG A STATEMENT WAITS FOR ANOTHER CONNECTION'S LOCK before SQLite answers "database is
 * locked" (see the header). Five seconds is far longer than any transaction this app runs (a pull
 * of a full page is well under one), so a wait always ends in the lock being free; a hang still
 * ends in the error, just not at the first touch.
 */
export const BUSY_TIMEOUT_MS = 5000;
export const BUSY_PRAGMA = `pragma busy_timeout = ${String(BUSY_TIMEOUT_MS)}`;

/**
 * A WRITE THAT CHANGES NOTHING, to take the write lock at the start of a transaction (see the
 * header). Any table would do: a DELETE takes the lock before its WHERE is weighed, and `where 0`
 * matches no row, so no trigger fires and no page changes. `outbox` because it is the one table
 * every schema version of this app has had since its first.
 */
export const CLAIM_WRITE_LOCK = 'delete from outbox where 0';

/**
 * WHAT EVERY TRANSACTION'S CONNECTION RUNS FIRST, in this order: the wait, then the claim, so the
 * claim is the statement that waits.
 */
export const TX_PROLOGUE = `${BUSY_PRAGMA}; ${CLAIM_WRITE_LOCK}`;

/**
 * expo-sqlite's own words for a call on a closed database (`db/latch.ts` `isClosedHandle` reads
 * them), so a call on a `Db` that `close` has retired ends as quietly as one on a closed handle.
 */
const CLOSED = 'Access to closed resource: this database was closed';

/** The device's `Db`, which the code that opened it can also close (`db/index.ts`). */
export interface ExpoDb extends Db {
  /**
   * Refuse new work, let the transaction running and those queued behind it finish (for up to
   * `BUSY_TIMEOUT_MS`), then close the connection. Without the refusal a transaction asked of a
   * closed `Db` would still run, because expo-sqlite opens each transaction's connection by the
   * file's path: a switched-away family's pass would go on writing beside the next handle on the
   * same file, and after a teardown it would create the deleted file again.
   */
  close(): Promise<void>;
}

/**
 * Serializes top-level transactions onto one promise chain. Rejections are absorbed here so a
 * failed transaction never poisons the queue for the next caller — the rejection still reaches
 * the caller, through the promise `tx` returned.
 */
export function createTxQueue(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const next = tail.then(fn, fn);
    tail = next.catch(() => undefined);
    return next;
  };
}

/** expo-sqlite's `Db`. The device implementation; node tests use ../testing/local-db.ts. */
export function createExpoDb(db: SQLiteDatabase): ExpoDb {
  const queue = createTxQueue();
  // set by `close`: new work is refused, and what was already queued still runs
  let closed = false;
  // The handle statements run against: the database itself outside a transaction, and the
  // transaction's own handle inside one. expo-sqlite's exclusive transaction proxies a second
  // connection, so using `db` from inside would block on the lock it is already holding.
  let current: SQLiteDatabase | null = null;
  // What is still running on the transaction's connection: the statements in flight. `idle`
  // resolves when there are none — see `tx` for why it matters.
  let inflight = 0;
  let waiters: (() => void)[] = [];
  // the reads running on the root connection, which `close` lets finish before it closes it
  const rootReads = new Set<Promise<unknown>>();

  const handle = () => current ?? db;

  const wakeIfIdle = (): void => {
    if (inflight > 0) return;
    const w = waiters;
    waiters = [];
    for (const wake of w) wake();
  };
  const idle = (): Promise<void> => new Promise(resolve => waiters.push(resolve));

  /**
   * One statement on the current handle, counted for as long as it is on the transaction's. A
   * WRITE with no transaction open waits its turn in the queue (see the header): it then runs on
   * the root connection when no transaction's connection can be holding the lock.
   */
  async function on<T>(fn: (h: SQLiteDatabase) => Promise<T>, write = false): Promise<T> {
    const h = handle();
    if (h === db) {
      if (closed) throw new Error(CLOSED);
      if (write) return queue(() => fn(db));
      // a read on the root connection is not in the queue, so `close` waits for it by this set
      const read = fn(db);
      rootReads.add(read);
      try {
        return await read;
      } finally {
        rootReads.delete(read);
      }
    }
    inflight += 1;
    try {
      return await fn(h);
    } finally {
      inflight -= 1;
      wakeIfIdle();
    }
  }

  const surface: Tx = {
    run: async (sql, params = []) => {
      const r = await on(h => h.runAsync(sql, params), true);
      return { changes: r.changes };
    },
    all: <T>(sql: string, params: SqlValue[] = []) => on(h => h.getAllAsync<T>(sql, params)),
    get: async <T>(sql: string, params: SqlValue[] = []) =>
      (await on(h => h.getFirstAsync<T>(sql, params))) ?? undefined,
  };

  return {
    ...surface,
    // queued even when another transaction is open: see the header for why it never joins one
    tx: <T>(fn: (t: Tx) => Promise<T>): Promise<T> => {
      if (closed) return Promise.reject(new Error(CLOSED));
      return queue(async () => {
        let out!: T;
        // A throw inside the task rolls the transaction back and rejects this promise, which
        // is exactly the contract: `tx` rethrows and nothing was written.
        await db.withExclusiveTransactionAsync(async txn => {
          // a new connection every time, at SQLite's default of no wait at all: before anything
          // is routed to it, it waits for a lock like the root one does, and then takes the
          // write lock while it has read nothing, the one moment SQLite waits for it (the header)
          await txn.execAsync(TX_PROLOGUE);
          current = txn;
          try {
            out = await fn(surface);
          } finally {
            // IDLE FIRST, THEN CLOSED TO NEW CALLERS. Once this task returns, expo-sqlite
            // commits (or rolls back) and closes `txn`, finalizing every statement on it from
            // another thread. A screen's read that `handle()` routed here a moment ago may
            // still be stepping, and a statement stepped after its finalize is a native crash
            // that nothing in JavaScript sees. The loop re-checks after every wake because a
            // caller can issue a new statement between a wake and this continuation; the
            // check and the clearing of `current` share one synchronous step, so nothing can
            // reach `txn` after it.
            while (inflight > 0) await idle();
            current = null;
          }
        });
        return out;
      });
    },
    close: async () => {
      if (closed) return;
      closed = true;
      // the end of the queue as it stands — every transaction and queued write asked for before
      // now — and every read already running on the root connection: closed under them, they
      // would reject as "Access to closed resource" in a screen that asked for nothing unusual
      // (or, mid-step, crash natively; the header says why). Bounded, because a close must not
      // hang a switch or a sign-out on a stuck task.
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled([queue(() => Promise.resolve()), ...rootReads]),
        new Promise<void>(resolve => {
          timer = setTimeout(resolve, BUSY_TIMEOUT_MS);
        }),
      ]);
      clearTimeout(timer);
      await db.closeAsync();
    },
  };
}
