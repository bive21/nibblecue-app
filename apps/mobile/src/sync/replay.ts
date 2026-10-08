/**
 * Replaying a quarantined outbox (docs/ACCOUNTS.md §6.3, WP4 D32).
 *
 * A forced sign-out deletes the database, so teardown step 3 moves whatever the server had not
 * accepted into an encrypted file keyed by the signing-out `user_id` (`auth/quarantine.ts`).
 * When the SAME person signs in again the file comes back as an array of blobs, and this is
 * where those blobs become queue rows again. It is the last mile of rule 7: without it the
 * quarantine is a file nobody ever reads, which is a slower way of losing a log.
 *
 * WHAT IS KEPT AND WHAT IS MINTED AGAIN.
 *
 *   * `client_op_id` is KEPT. It is the idempotency key the server de-duplicates on
 *     (`activities_client_op_uniq`), and it is the whole reason a replay is safe: if the op DID
 *     reach the server before the sign-out, the replay answers `duplicate`, which the worker
 *     counts as a success. A fresh id would create a second row for one feed — R-2's "never a
 *     silent double", reached by the one path a parent could never explain.
 *   * `entity_id`, `household_id`, `payload`, `depends_on` and `created_at` are KEPT, because
 *     they are the operation. `created_at` in particular is the entry's own age, and rewriting
 *     it to now would make "queued since" a lie on the first screen after signing back in.
 *   * `seq` is MINTED AGAIN, from the counter in the fresh database (D32). The old numbers
 *     belong to a file that no longer exists, and the counter in the new one starts at zero, so
 *     re-using them would put replayed ops at the same seq as the first ops the parent writes
 *     after signing in — and `seq` is the total order the worker sends in, so a chain's UPDATE
 *     could be sent before its own CREATE. Allocating in order gives the replayed ops the
 *     LOWEST numbers, which is also the truth: they were queued first.
 *   * `state` is `PENDING` and `attempts` is `0`, with `last_error`, `next_attempt_at` and
 *     `sending_at` cleared. The attempts belong to the retry schedule of a session that has
 *     ended, and a person signing back in is new information — exactly as `OutboxWorker.retry`
 *     treats a person pressing the button. A row abandoned in `SENDING` therefore comes back
 *     ready to send rather than as something to reclaim.
 *
 * AN UNPARSEABLE BLOB IS COUNTED AND SKIPPED, NEVER THROWN. The file is decrypted bytes from an
 * older build, and one row this build cannot read must not cost the parent the other nine — nor
 * block a sign-in, which is what an exception here would do.
 */
import { OutboxRow } from '@nibblecue/core';
import type { Db } from '../db/driver';
import { nextSeq } from '../data/seq';

export interface ReplayOutcome {
  /** Rows put back on the queue. */
  replayed: number;
  /** Blobs this build could not read, or that were already on the queue. */
  skipped: number;
}

const COLUMNS =
  'client_op_id, entity, op, entity_id, household_id, payload, depends_on, seq, created_at, state, attempts, next_attempt_at, sending_at, last_error';

/**
 * @param ops whatever `Quarantine.takeFor(userId)` returned — unknown blobs, by construction.
 *
 * The whole array is parsed first and each element on its own only if that fails, so the common
 * case is one validation and the damaged case still reports which rows survived.
 */
export async function replayQuarantined(db: Db, ops: readonly unknown[]): Promise<ReplayOutcome> {
  if (ops.length === 0) return { replayed: 0, skipped: 0 };

  const whole = OutboxRow.array().safeParse(ops);
  const rows: OutboxRow[] = [];
  let skipped = 0;
  if (whole.success) {
    rows.push(...whole.data);
  } else {
    for (const blob of ops) {
      const one = OutboxRow.safeParse(blob);
      if (one.success) rows.push(one.data);
      else skipped += 1;
    }
  }
  if (rows.length === 0) return { replayed: 0, skipped };

  // Oldest first, by the order they were queued on the device that quarantined them. The new
  // `seq` values are allocated in this order, so the chain order survives the round trip.
  rows.sort((a, b) => a.seq - b.seq);

  let replayed = 0;
  await db.tx(async t => {
    for (const row of rows) {
      const seq = await nextSeq(t);
      // `insert or ignore`: a replay that runs twice (a resumed teardown, a second sign-in on
      // the same fresh file) must not raise on the primary key and must not queue a second copy.
      const { changes } = await t.run(
        `insert or ignore into outbox (${COLUMNS})
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, null, null, null)`,
        [
          row.client_op_id,
          row.entity,
          row.op,
          row.entity_id,
          row.household_id,
          row.payload,
          row.depends_on,
          seq,
          row.created_at,
        ],
      );
      if (changes > 0) replayed += 1;
      else skipped += 1;
    }
  });

  return { replayed, skipped };
}
