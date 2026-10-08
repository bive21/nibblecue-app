/**
 * Rewriting a ledger draw the server refused because the container was already used.
 *
 * Two caregivers can both pour 120 ml from a 150 ml bag while offline. The balance trigger
 * (`app.assert_container_balance`, locked in id order since `0005_ledger_concurrency.sql`) lets
 * one win and refuses the other, so the second device gets `CONFLICT` with the amount that is
 * actually left. THE FEED IS NEVER LOST TO FIX AN INVENTORY NUMBER: the bottle activity stays
 * exactly as it was, and only the ledger half is rewritten — a USE of what was really there, plus
 * a compensating ADJUST for the shortfall, the pair summing to the original `delta_ml` so the
 * record of what the parent poured survives in the ledger's own arithmetic.
 *
 * The ledger is append-only (`docs/MILK_STASH.md` §5.2): a correction is always a new row, never
 * an edit of an old one, because a mutable total cannot be audited or replayed from a queue.
 *
 * Both ids are derived from the intent, so a device that is killed between the rejection and the
 * retry rewrites to byte-identical ops and the server's `milk_txn_client_op_uniq` swallows the
 * replay. That is the whole reason `deriveOpId` exists.
 *
 * OPEN AGAINST THE SERVER, for WP4.4/WP4.5: `app.assert_container_balance` raises on ANY negative
 * balance regardless of transaction kind (`0001_init.sql:1092-1102`), so a negative ADJUST posted
 * to the same container that the USE has just taken to zero is itself refused. Which container
 * carries the shortfall — or whether the ADJUST is a household-level row — is not settled by
 * `docs/MILK_STASH.md` or by the plan, and is recorded in the WP4.1 report rather than guessed at
 * here. This function's contract (the pair sums to the original; a second rewrite is identical)
 * holds either way.
 */
import { deriveOpId } from './ids';
import type { ChainOp, PushOp } from './types';

/**
 * @param op          the rejected `milk_txn` op, exactly as it was sent.
 * @param availableMl what the server says is left in the container; `0 <= availableMl < wanted`.
 * @param intentId    the intent that minted the op, so both halves stay derivable.
 */
export function rewriteOverdraw(
  op: PushOp,
  availableMl: number,
  intentId: string,
): [ChainOp, ChainOp] {
  const delta = op.payload['delta_ml'];
  if (typeof delta !== 'number' || !Number.isInteger(delta) || delta >= 0) {
    throw new TypeError(`overdraw rewrite needs a negative integer delta_ml, got ${String(delta)}`);
  }
  if (!Number.isInteger(availableMl) || availableMl < 0) {
    throw new RangeError(`availableMl must be a non-negative integer, got ${availableMl}`);
  }
  const wanted = -delta;
  if (availableMl >= wanted) {
    throw new RangeError(`not an overdraw: ${availableMl} ml available, ${wanted} ml wanted`);
  }

  /*
    THE USE KEEPS THE REJECTED OP'S OWN KEY — not one derived from the intent (the stash sweep of
    2026-09-24). A bottle bigger than one bag walks several (`data/stash.ts` `useTag`: 'use',
    'use2', 'use3' …), one ledger op per bag. When the bag the other caregiver emptied was the
    SECOND one, a USE keyed `deriveOpId(intent, 'use')` was the FIRST bag's draw, already applied:
    the server answered "duplicate", nothing came out of the second bag, and it went on holding
    milk that was in a bottle — the stash read high on every phone after the next pull. The first
    draw's key IS `deriveOpId(intent, 'use')`, so a one-bag bottle rewrites to the ids it always
    did; every other draw derives its ADJUST from its own key, so two rewrites in one bottle can
    never share one either.
  */
  const useId = op.client_op_id;
  const adjustId =
    useId === deriveOpId(intentId, 'use') ? deriveOpId(intentId, 'adj') : deriveOpId(useId, 'adj');

  /* The USE keeps the original op's key even when `availableMl` is 0 and its delta is therefore
     0. Sending it is what claims `(household_id, client_op_id)` on the server, so the original
     120 ml draw can never be applied later by a replay from a process that never saw this
     rejection. A zero row that closes an idempotency key is cheaper than a lost guarantee. */
  const use: ChainOp = {
    client_op_id: useId,
    entity: 'milk_txn',
    op: 'CREATE',
    entity_id: op.entity_id,
    household_id: op.household_id,
    payload: { ...op.payload, kind: 'USE', delta_ml: availableMl === 0 ? 0 : -availableMl },
    depends_on: opDependsOn(op),
  };

  const adjust: ChainOp = {
    client_op_id: adjustId,
    entity: 'milk_txn',
    op: 'CREATE',
    entity_id: adjustId,
    household_id: op.household_id,
    payload: { ...op.payload, kind: 'ADJUST', delta_ml: -(wanted - availableMl) },
    depends_on: useId,
  };

  return [use, adjust];
}

/** A `ChainOp` keeps its dependency; a bare `PushOp` never had one. */
function opDependsOn(op: PushOp): string | null {
  const dep = (op as Partial<ChainOp>).depends_on;
  return typeof dep === 'string' ? dep : null;
}
