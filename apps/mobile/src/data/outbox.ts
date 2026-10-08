/**
 * The outbox, as rows (docs/OFFLINE_SYNC.md §2). Everything that puts an operation on the
 * queue, takes it off, or shows it to a person goes through this file; the worker that sends
 * them is WP4.5 and lives in `../sync`, which this package never imports.
 *
 * The queue is the promise behind "never lose a log": a write commits locally with its ops
 * already appended, so the parent's entry exists whether or not there is a network, and the
 * only thing left is delivery. That is why `discard` drops the OP and keeps the ROW — a
 * caregiver abandoning a rejected operation is abandoning a sync, never their own record of
 * the feed.
 *
 * `payload` is JSON text. It is written once here from the chain builder's object and parsed
 * once when the worker sends it, so no other layer has to think about the encoding.
 */
import { OUTBOX_INSERT_COLUMNS, type OutboxRow, type OutboxState } from '@nibblecue/core';
import type { Tx } from '../db/driver';

/** Appending an op lives in core, beside the upsert it commits with (`sync/local/outbox.ts`). */
export { enqueue } from '@nibblecue/core';

const COLUMNS = OUTBOX_INSERT_COLUMNS;

/** Every row the server has not accepted yet, oldest first. Teardown step 3 quarantines these. */
export async function pending(t: Tx): Promise<OutboxRow[]> {
  return t.all<OutboxRow>(
    `select ${COLUMNS} from outbox where state != 'SYNCED' order by seq asc`,
    [],
  );
}

/** Every row, newest first — the Sync inspector's list, which shows what has been sent too. */
export async function recent(t: Tx, limit = 200): Promise<OutboxRow[]> {
  return t.all<OutboxRow>(`select ${COLUMNS} from outbox order by seq desc limit ?`, [limit]);
}

export async function rowsFor(t: Tx, clientOpIds: readonly string[]): Promise<OutboxRow[]> {
  if (clientOpIds.length === 0) return [];
  const holes = clientOpIds.map(() => '?').join(', ');
  return t.all<OutboxRow>(
    `select ${COLUMNS} from outbox where client_op_id in (${holes}) order by seq asc`,
    [...clientOpIds],
  );
}

export interface OutboxCounts {
  pending: number;
  sending: number;
  synced: number;
  failed: number;
  /** `pending + sending + failed` — what the sync chip counts. */
  unsent: number;
}

/** One pass over the table: what the chip and the inspector both read. */
export async function counts(t: Tx): Promise<OutboxCounts> {
  const rows = await t.all<{ state: string; n: number }>(
    'select state, count(*) as n from outbox group by state',
    [],
  );
  const of = (state: OutboxState) => rows.find(r => r.state === state)?.n ?? 0;
  const out = {
    pending: of('PENDING'),
    sending: of('SENDING'),
    synced: of('SYNCED'),
    failed: of('FAILED'),
  };
  return { ...out, unsent: out.pending + out.sending + out.failed };
}

/**
 * "Retry now" on a `FAILED` op: back to `PENDING` with the attempt count cleared (§2.1).
 * Clearing `attempts` is deliberate — a person asking again is new information, not the
 * eleventh try of the same schedule.
 */
export async function retry(t: Tx, clientOpId: string): Promise<boolean> {
  const { changes } = await t.run(
    `update outbox set state = 'PENDING', attempts = 0, next_attempt_at = null, sending_at = null where client_op_id = ?`,
    [clientOpId],
  );
  return changes > 0;
}

/**
 * "Discard" on a `FAILED` op: the operation is dropped and **the local row is kept**
 * (§2.1's "row kept, op dropped"). Nothing in this app deletes a parent's entry to tidy a
 * queue; the row simply stays unsynced until it is edited or deleted deliberately.
 */
export async function discard(t: Tx, clientOpId: string): Promise<boolean> {
  const { changes } = await t.run('delete from outbox where client_op_id = ?', [clientOpId]);
  return changes > 0;
}

/** Parse a stored payload back to the object the chain builder wrote. */
export function payloadOf(row: Pick<OutboxRow, 'payload'>): Record<string, unknown> {
  const parsed: unknown = JSON.parse(row.payload);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('an outbox payload must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}
