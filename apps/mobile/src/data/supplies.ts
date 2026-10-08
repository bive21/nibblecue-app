/**
 * The supply catalog — the writes (0017; `docs/SUPPLIES.md`).
 *
 * The catalog is the household's standing knowledge and the list is one trip, so the writes
 * here are deliberately few: save an item, retire it. What a trip does to the catalog — each
 * bought item's `last_bought_on` — the trip writes itself, in the same intent as the lines it
 * retires (`data/lists.ts` `finishTrip` and its Undo, `putBackTrip`), which is why "bought 9 days
 * ago" is true without a purchase-history table. (`markBought` and `restoreBought`, which wrote
 * the dates apart from the lines for the "Bought it today" button, went on 2026-09-26: the button
 * went on 2026-09-18.)
 *
 * REMOVING IS `deleted_at`, NEVER A DELETE, and it comes back with an undo — a household that
 * spent a year getting the diaper note right does not lose it to one mis-tap. A line already
 * on the shopping list keeps standing when its item is retired: the line has its own title
 * (chains.ts says why), so it still reads correctly in a shop.
 */
import {
  supplyCreateChain,
  supplyUpdateChain,
  type Clock,
  type SupplyFields,
} from '@nibblecue/core';
import type { Db } from '../db/driver';
import type { WriteContext } from './activities';
import { newEntityId, newIntentId } from './ids';
import { commitWrite, type RepositoryDeps, type WriteOutcome } from './repository';
import { keys } from './store';

export interface SaveSupplyInput extends WriteContext, SupplyFields {
  /** Absent for a new item; its id for an edit. */
  supplyId?: string;
}

/** Both keys: a catalog edit changes what every line pointing at the item reads. */
const touched = (householdId: string): string[] => [
  keys.supplies(householdId),
  keys.shopping(householdId),
];

export async function saveSupply(
  db: Db,
  clock: Clock,
  input: SaveSupplyInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome & { supplyId: string }> {
  const intentId = newIntentId();
  const at = clock.iso();
  const supplyId = input.supplyId ?? newEntityId();
  const fields: SupplyFields = {
    category: input.category,
    brand: input.brand,
    product: input.product,
    variant: input.variant,
    pack: input.pack,
    store: input.store,
    notes: input.notes,
    url: input.url,
  };
  const base = {
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: at,
  };
  const chain =
    input.supplyId === undefined
      ? supplyCreateChain({ ...base, supplyId, item: fields })
      : supplyUpdateChain({ ...base, supplyId, patch: { ...fields } });
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: touched(input.householdId) },
    deps,
  );
  return { ...outcome, supplyId };
}

export async function setSupplyDeleted(
  db: Db,
  clock: Clock,
  input: WriteContext & { supplyId: string; deleted: boolean },
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = newIntentId();
  const chain = supplyUpdateChain({
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: clock.iso(),
    supplyId: input.supplyId,
    patch: { deleted_at: input.deleted ? clock.iso() : null },
  });
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: touched(input.householdId) },
    deps,
  );
}
