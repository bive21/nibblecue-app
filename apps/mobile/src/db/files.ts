/**
 * WHICH FILE HOLDS WHICH FAMILY (the switcher, 0153). Pure, so the rule is tested in node.
 *
 * Every family on the phone has its own SQLite file: a family's rows are never in the file another
 * family's screens read, and a family leaving is one file delete (docs/ACCOUNTS.md §4 step 8),
 * exactly as before. THE EXISTING FILE IS NEVER RENAMED: `cuddlecue.db` is adopted by the first
 * family the phone opens after this build, so a phone in one family keeps the very file it had
 * and sees nothing change. Every other family's file is `cuddlecue-<household id>.db`.
 */
import { LOCAL_DB_NAME } from './schema';

/** The file of a family that did not adopt the original one. */
export const householdDbName = (householdId: string): string => `cuddlecue-${householdId}.db`;

/** Whether a file name is one of this app's databases: what a sign-out deletes. */
export const isLocalDbName = (name: string): boolean =>
  name === LOCAL_DB_NAME || /^cuddlecue-[0-9a-zA-Z-]+\.db$/.test(name);

/**
 * The file for `householdId`, given which family (if any) adopted the original file. Null is the
 * phone before any family was opened (the boot, signed out): the original file, adopted by nobody.
 */
export function dbFileFor(
  householdId: string | null,
  legacyOwner: string | null,
): { name: string; adopts: boolean } {
  if (householdId === null) return { name: LOCAL_DB_NAME, adopts: false };
  if (legacyOwner === householdId) return { name: LOCAL_DB_NAME, adopts: false };
  if (legacyOwner === null) return { name: LOCAL_DB_NAME, adopts: true };
  return { name: householdDbName(householdId), adopts: false };
}
