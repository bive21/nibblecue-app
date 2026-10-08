/**
 * `seq` — the outbox's total order (docs/OFFLINE_SYNC.md §2, WP4 D32). Moved here from
 * `apps/mobile/src/data/seq.ts` (2026-09-23) with `enqueue`, so the round-trip test in
 * `packages/db` queues an op with the app's own code.
 *
 * "`seq` comes from a local counter, not from `created_at`, so two ops minted in the same
 * millisecond still have a total order." Three implementations were available and two of them
 * are wrong:
 *
 *   * `max(seq) + 1` breaks the first time a `SYNCED` row is pruned (D30 prunes them after
 *     seven days): the counter walks backwards and a fresh op sorts ahead of one that is
 *     already queued, which is how an UPDATE gets sent before its CREATE.
 *   * An in-memory counter resets on every process start and collides with the `PENDING` rows
 *     the previous process left behind — the same reordering, reached by a shorter route.
 *
 * So the counter is durable: one row in `ui_prefs` under `outbox_seq`, read and incremented
 * **inside the same write transaction as the insert**. SQLite serializes write transactions,
 * so two writes cannot read the same value; nothing else is needed and no `BEGIN EXCLUSIVE`
 * of its own is taken. `ui_prefs` is not wiped by a sync, a prune or a pull, and it goes only
 * when the database file does.
 *
 * It is ONE GLOBAL counter, not one per household. D36 keeps one active household per
 * database file, and a global monotonic sequence is a valid total order within each of them.
 *
 * Note the name collision: the *index* `outbox_seq (seq)` on the outbox table is a different
 * thing that happens to share the string.
 */
import type { SqlTx as Tx } from './sql';

export const OUTBOX_SEQ_KEY = 'outbox_seq';

/**
 * The next sequence number, allocated and persisted in the caller's transaction.
 *
 * No row exists until the first write: the key is not seeded, so "no row yet" is 0 and the
 * first op is 1. A row whose text is not a number is treated as absent rather than as `NaN` —
 * a corrupted pref must not be able to write `NaN` into `seq` and make every later comparison
 * false.
 */
export async function nextSeq(t: Tx): Promise<number> {
  const row = await t.get<{ value: string }>('select value from ui_prefs where key = ?', [
    OUTBOX_SEQ_KEY,
  ]);
  const parsed = row === undefined ? Number.NaN : Number.parseInt(row.value, 10);
  const current = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  const next = current + 1;
  await t.run(
    'insert into ui_prefs (key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
    [OUTBOX_SEQ_KEY, String(next)],
  );
  return next;
}

/** What the counter stands at without allocating — the Sync inspector's read. */
export async function currentSeq(t: Tx): Promise<number> {
  const row = await t.get<{ value: string }>('select value from ui_prefs where key = ?', [
    OUTBOX_SEQ_KEY,
  ]);
  const parsed = row === undefined ? Number.NaN : Number.parseInt(row.value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
