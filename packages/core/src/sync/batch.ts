/**
 * Which queued ops go out together.
 *
 * `docs/OFFLINE_SYNC.md` §2.3 reads as a contradiction: rule 4 says a batch "stops at the first
 * op whose dependency is not yet SYNCED", rule 5 says independent entities "may be reordered
 * freely". Stopping the whole pass at the first blocked op means one stuck chain holds up every
 * unrelated diaper behind it. The intent is narrower and is what this implements (D14):
 *
 *   never reorder within an entity or a chain; independent chains may interleave.
 *
 * So a blocked op does not stop the walk — it blocks its own `entity_id`, and every later op on
 * that entity is left for the next pass. Without the `blocked` set, an op skipped for its
 * dependency would let a later UPDATE on the same row overtake the CREATE it depends on.
 */
import { MAX_BATCH } from './constants';
import type { OutboxRow } from './types';

export interface SelectBatchOptions {
  /** Ceiling on the batch. Defaults to `MAX_BATCH`. */
  maxBatch?: number;
}

export interface SelectBatchResult {
  /** The ops to send, in `seq` order. */
  batch: OutboxRow[];
  /** Entity ids held back this pass, in the order they were blocked. Exposed so the blocking
   *  rule can be asserted directly rather than inferred from an absence. */
  blocked: string[];
}

/**
 * @param candidates ready `PENDING` rows; order does not matter, they are walked by `seq`.
 * @param isSynced   whether a `client_op_id` has already reached `SYNCED` on the server. The
 *                   caller resolves this from the outbox before calling, so this stays pure.
 */
export function selectBatch(
  candidates: readonly OutboxRow[],
  isSynced: (clientOpId: string) => boolean,
  opts: SelectBatchOptions = {},
): SelectBatchResult {
  const maxBatch = opts.maxBatch ?? MAX_BATCH;
  const ordered = [...candidates].sort((a, b) => a.seq - b.seq);

  const batch: OutboxRow[] = [];
  const inBatchEntities = new Set<string>();
  const inBatchOps = new Set<string>();
  const blocked = new Set<string>();

  for (const row of ordered) {
    if (batch.length >= maxBatch) break;
    if (blocked.has(row.entity_id)) continue;
    // Two ops on one row are never in flight at once: the CREATE must land before its UPDATE.
    if (inBatchEntities.has(row.entity_id)) continue;
    if (row.depends_on !== null && !inBatchOps.has(row.depends_on) && !isSynced(row.depends_on)) {
      blocked.add(row.entity_id);
      continue;
    }
    batch.push(row);
    inBatchEntities.add(row.entity_id);
    inBatchOps.add(row.client_op_id);
  }

  return { batch, blocked: [...blocked] };
}
