/**
 * PUTTING AN OPERATION ON THE QUEUE — the one outbox write the app's commit path and
 * `packages/db`'s round-trip test share (moved from `apps/mobile/src/data/outbox.ts`,
 * 2026-09-23). Everything else about the outbox — reading it, counting it, discarding from it,
 * sending it — stays in the app, which is the only thing that does those.
 */
import type { ChainOp, Clock } from '../types';
import { nextSeq } from './seq';
import type { SqlTx } from './sql';

/** The outbox's columns in insert order (`OUTBOX_COLUMNS` in `./schema.ts` pins the table). */
export const OUTBOX_INSERT_COLUMNS =
  'client_op_id, entity, op, entity_id, household_id, payload, depends_on, seq, created_at, state, attempts, next_attempt_at, sending_at, last_error';

/**
 * Append one op, allocating its `seq` in the caller's transaction.
 *
 * `insert or ignore`: `client_op_id` is the primary key and the idempotency key at once, so a
 * chain rebuilt from a stored row after a kill re-enqueues byte-identical ops and the second
 * attempt is a no-op rather than a constraint error that would roll back the whole write. A
 * `seq` is still consumed in that case, and that is harmless — the sequence only has to be
 * monotonic, never dense.
 *
 * `payload` is JSON text, written once here from the chain builder's object and parsed once when
 * the worker sends it, so no other layer has to think about the encoding.
 */
export async function enqueue(t: SqlTx, op: ChainOp, clock: Clock): Promise<number> {
  const seq = await nextSeq(t);
  await t.run(
    `insert or ignore into outbox (${OUTBOX_INSERT_COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, null, null, null)`,
    [
      op.client_op_id,
      op.entity,
      op.op,
      op.entity_id,
      op.household_id,
      JSON.stringify(op.payload),
      op.depends_on,
      seq,
      clock.iso(),
    ],
  );
  return seq;
}
