/**
 * Reading the supply catalog from the local mirror (0017; `docs/SUPPLIES.md`).
 *
 * Household-scoped and small — a household buys a few dozen things — so it is one unpaged
 * query with no window and no cursor, like the two lists it feeds. Soft-deleted rows never
 * leave the database and never reach a screen.
 */
import type { Db, Tx } from '../driver';

export interface SupplyItemRow {
  id: string;
  household_id: string;
  category: string;
  brand: string | null;
  product: string | null;
  variant: string | null;
  pack: string | null;
  store: string | null;
  notes: string | null;
  url: string | null;
  last_bought_on: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const SELECT = `select id, household_id, category, brand, product, variant, pack, store,
            notes, url, last_bought_on, created_by, created_at, updated_at
       from supply_items`;

/**
 * The whole catalog, live rows only. The ORDER is by name rather than by when it was added:
 * `byCategory` in `packages/core` groups it, and a catalog that reshuffles between visits is
 * one nobody can find anything in.
 */
export async function supplyItems(t: Db | Tx, householdId: string): Promise<SupplyItemRow[]> {
  return t.all<SupplyItemRow>(
    `${SELECT} where household_id = ? and deleted_at is null
      order by coalesce(brand, '') , coalesce(product, ''), id`,
    [householdId],
  );
}
