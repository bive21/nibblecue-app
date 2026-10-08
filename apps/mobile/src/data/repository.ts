/**
 * The repository: the ONE function that writes (docs/OFFLINE_SYNC.md §1; WP4 §5.4).
 *
 * Every capture in the product — a tap on Today, a Quick Log sheet, a favorite, a repeat, a
 * timer stop, a widget intent draining after the phone came back — ends here, and nothing else
 * in the app writes a domain row or an outbox row. That is not tidiness. §1's guarantee is
 * that one SQLite transaction writes the domain rows, appends the outbox ops and records the
 * dedupe key, so there is no state in which a bottle exists without its deduction, an entry
 * exists with no operation to deliver it, or a guard has been moved by a write that then
 * failed. A second writer anywhere is a second chance to break that.
 *
 * THE ONE-TRANSACTION RULE, in order:
 *
 *   1. read the dedupe keys. If the window is open, return `{ committed:false, suppressed:true }`
 *      having written NOTHING — no domain row, no outbox row, and no `client_op_id`, because
 *      D25 suppresses before minting;
 *   2. write the domain rows (upserted on their primary key, so a replay of a chain rebuilt
 *      after a kill converges rather than doubling);
 *   3. delete the local rows the write removes (a timer stop's `running_timers` row);
 *   4. append the outbox ops, each with a `seq` allocated in this same transaction (D32) and
 *      `state = 'PENDING'`;
 *   5. record the dedupe keys at `clock.now()`;
 *   6. run the caller's own in-transaction step — the widget drain's `consumed_at`, which
 *      §7 rule 4 requires to be set in the transaction that inserted the outbox row.
 *
 * Then, and only then, outside the transaction: bump the store versions and call `afterCommit`
 * (the nudge to the outbox worker). **Nothing awaits the network inside the transaction**, and
 * `data/` never imports `sync/` — the worker is injected, never imported (WP4 §5.1).
 *
 * UNITS ARE NEVER RE-CONVERTED HERE. `quantity` arrives canonical — millilitres, grams,
 * millimetres, hundredths of a degree, minutes (CLAUDE.md §6) — and the display unit is not an
 * input to this function. A parent switching between oz and ml changes what a screen renders
 * and enqueues nothing at all; `repository.test.ts` asserts both halves.
 */
import type { Chain, ChainOp, Clock, LocalRow } from '@nibblecue/core';
import { localKeyOf, qualifyLocal, upsertRow } from '@nibblecue/core';
import type { Db, Tx } from '../db/driver';
import { isSuppressed, recordAccepted, type DedupeGuard } from './dedupe';
import { enqueue } from './outbox';
import { keys, store as appStore, type Store } from './store';

/**
 * Where a write came from. Analytics' `source`, and nothing else reads it.
 *
 * `nfc` is a CueCoin (docs/NFC_TAGS.md). It is a value on the ORDINARY write rather than a
 * second write path, which is the owner's own instruction — `data/writeOrigin.ts` says how a
 * sheet that has no idea what opened it still records it.
 */
export type WriteSource =
  | 'today'
  | 'quicklog'
  | 'sheet'
  | 'favorite'
  | 'repeat'
  | 'widget'
  | 'timer'
  | 'nfc'
  // a reminder's own "Log it" button (`notifications/ReminderResponder.tsx`)
  | 'reminder'
  // a row brought in from another app's export (`data/import.ts`). It is on this list rather than
  // off it because an imported entry IS an ordinary entry, and the one thing worth being able to
  // say about it afterwards is where it came from
  | 'import'
  | 'dev';

export interface WriteIntent {
  /** The intent's id (D7). The activity op carries it unchanged; every other op derives. */
  intentId: string;
  /**
   * What to write and what to enqueue, from `packages/core`'s chain builders. This is core's
   * `Chain` — `{ rows: LocalRow[]; ops: ChainOp[] }` — not a bare `PushOp[]`: `depends_on`
   * never leaves the device but it has to reach the outbox, which is where ordering is
   * enforced (D14).
   */
  chain: Chain;
  /**
   * The duplicate guard's keys. One for an ordinary write; one PER CHILD for a fan-out, which
   * is the whole point of the child in the key (`docs/MULTIPLES.md` §2: the second baby's
   * entry is not a double tap on the first).
   *
   * The write is suppressed only when EVERY key is inside its window — i.e. when this exact
   * submission is a repeat. A partial overlap (Emma logged alone a second ago, now Both) is
   * written: a visible duplicate a parent can delete is the lesser failure, and silently
   * dropping the other twin's feed is losing a log, which rule 7 does not allow.
   */
  dedupe?: DedupeGuard | readonly DedupeGuard[];
  source: WriteSource;
  /** Local rows this write removes outright. A stop physically deletes its timer row. */
  localDeletes?: readonly LocalDelete[];
  /** Cache keys to bump after the commit (`docs/ARCHITECTURE.md` §4's matrix). */
  invalidates?: readonly string[];
  /** The caller's own step inside the write's transaction, after the rows and the ops. */
  inTransaction?: (t: Tx) => Promise<void>;
}

export interface LocalDelete {
  table: string;
  id: string;
}

/**
 * A row `localDeletes` took out, as it was — so Undo can put it back. A stop physically deletes
 * its running timer, and the only copy of what that timer was (its start, its sides, its nap or
 * night) is the row itself; the toast that offers Undo holds the outcome, so it holds this too.
 */
export interface RemovedRow {
  table: string;
  row: Record<string, unknown>;
}

export interface WriteOutcome {
  committed: boolean;
  suppressed: boolean;
  /** Every `client_op_id` this write enqueued, in chain order. Undo reads them back. */
  opIds: string[];
  /** Every row this write created, in chain order — the twins' two activities, the ledger. */
  entityIds: string[];
  intentId: string;
  /** What `localDeletes` removed, when it removed anything (`RemovedRow`). */
  removed?: readonly RemovedRow[];
}

export interface RepositoryDeps {
  store?: Store;
  /** The nudge to the outbox worker. Injected: `data/` must not import `sync/` (§5.1). */
  afterCommit?: (outcome: WriteOutcome) => void;
}

/**
 * The real clock. Every function in `data/` and `sync/` takes a `Clock` rather than calling
 * `Date.now()` itself, so a test states the passage of time instead of sleeping through it;
 * this is the one place the platform clock is read.
 */
export const systemClock: Clock = {
  now: () => Date.now(),
  iso: (at?: number) => new Date(at ?? Date.now()).toISOString(),
};

const SUPPRESSED = (intentId: string): WriteOutcome => ({
  committed: false,
  suppressed: true,
  opIds: [],
  entityIds: [],
  intentId,
});

/** The write. One transaction, one outcome, one Undo. */
/** A write carried an op id the outbox already holds for a different write (`commitWrite`). */
export class OpIdReusedError extends Error {
  constructor(opId: string, heldFor: string) {
    super(`op id ${opId} is already queued for ${heldFor}`);
  }
}

export async function commitWrite(
  db: Db,
  clock: Clock,
  intent: WriteIntent,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const guards = normalizeGuards(intent.dedupe);
  const now = clock.now();

  const outcome = await db.tx(async t => {
    if (guards.length > 0) {
      const open = await Promise.all(guards.map(g => isSuppressed(t, g, now)));
      if (open.every(Boolean)) return SUPPRESSED(intent.intentId);
    }

    /*
      AN OP ID ALREADY QUEUED FOR A DIFFERENT WRITE IS A BUG, AND IT FAILS HERE (the review of
      2026-09-23). `enqueue` ignores an op id it already holds — which is right for a chain rebuilt
      and re-enqueued byte for byte after a kill, and silently wrong for a DIFFERENT write that
      happens to carry the same id: its rows land on this phone and its op never leaves it. Two
      rule writes sharing one caller intent did exactly that (`writeIntent` in data/schedule.ts).
      The check runs before a row is touched, so a refused write leaves nothing behind.
    */
    for (const op of intent.chain.ops) {
      const held = await t.get<{ entity: string; op: string; entity_id: string }>(
        'select entity, op, entity_id from outbox where client_op_id = ?',
        [op.client_op_id],
      );
      if (
        held !== undefined &&
        (held.entity !== op.entity || held.op !== op.op || held.entity_id !== op.entity_id)
      ) {
        throw new OpIdReusedError(op.client_op_id, `${held.entity} ${held.op} ${held.entity_id}`);
      }
    }

    for (const row of intent.chain.rows) await upsertRow(t, row);
    const removed: RemovedRow[] = [];
    for (const del of intent.localDeletes ?? []) {
      const where = `${singleKey(del.table)} = ?`;
      const before = await t.get<Record<string, unknown>>(
        `select * from ${qualifyLocal(del.table)} where ${where}`,
        [del.id],
      );
      if (before !== undefined) removed.push({ table: del.table, row: { ...before } });
      await t.run(`delete from ${qualifyLocal(del.table)} where ${where}`, [del.id]);
    }
    for (const op of intent.chain.ops) await enqueue(t, op, clock);
    for (const guard of guards) await recordAccepted(t, guard.key, now);
    if (intent.inTransaction) await intent.inTransaction(t);

    return {
      committed: true,
      suppressed: false,
      opIds: intent.chain.ops.map(op => op.client_op_id),
      entityIds: entityIdsOf(intent.chain.ops),
      intentId: intent.intentId,
      ...(removed.length > 0 ? { removed } : {}),
    };
  });

  if (outcome.committed) {
    (deps.store ?? appStore).invalidate(...(intent.invalidates ?? []), keys.outbox());
    deps.afterCommit?.(outcome);
  }
  return outcome;
}

function normalizeGuards(d: WriteIntent['dedupe']): DedupeGuard[] {
  if (d === undefined) return [];
  return Array.isArray(d) ? [...(d as readonly DedupeGuard[])] : [d as DedupeGuard];
}

/** Distinct, in chain order: a chain may touch the same entity twice (an op and its detail). */
function entityIdsOf(ops: readonly ChainOp[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const op of ops) {
    if (seen.has(op.entity_id)) continue;
    seen.add(op.entity_id);
    out.push(op.entity_id);
  }
  return out;
}

/* ------------------------------------------------------------------ rows */

/*
  THE ROW WRITER LIVES IN CORE since 2026-09-23 (`packages/core/src/sync/local/mirror.ts`): the
  local primary keys, the D31 encoder and the update-first upsert. The pull's apply uses the same
  three, and `packages/db`'s round-trip test runs them against the real server, so there is one
  copy rather than one here and one in a test.
*/
export { LOCAL_PRIMARY_KEY, upsertRow } from '@nibblecue/core';

/** The single-column key of a table addressed by one id; a composite key is a caller bug. */
function singleKey(table: string): string {
  const pk = localKeyOf(table);
  const first = pk[0];
  if (pk.length !== 1 || first === undefined) {
    throw new TypeError(`table '${table}' has a composite key and cannot be addressed by one id`);
  }
  return first;
}

/** Set `deleted_at` on one row. Nothing in this app removes a parent's entry (§1). */
export async function softDelete(
  t: Tx,
  table: string,
  id: string,
  atIso: string,
): Promise<boolean> {
  const { changes } = await t.run(
    `update ${qualifyLocal(table)} set deleted_at = ? where ${singleKey(table)} = ? and deleted_at is null`,
    [atIso, id],
  );
  return changes > 0;
}

export type { LocalRow };
