/**
 * WHETHER THIS PERSON MAY CHANGE OR DELETE THIS ENTRY, as the phone decides what to OFFER (PRODUCT_SPEC
 * §11): an owner or a parent any entry, a caregiver only their own. It is the server's rule
 * (`activities_update` in 0002_rls.sql), asked before a Save or a Delete is offered rather than after
 * the server refuses one, and a role not loaded yet is not a refusal: then the write decides, as it
 * always did (`mayChangeEntry` in data/entries.ts asks the member list the phone mirrors, and
 * refuses before anything is written).
 *
 * ONE RULE FOR EVERY PLACE A DELETE IS OFFERED (2026-09-29): the entry sheet's Save and Delete, and
 * the Delete behind a swiped row of Today's log and of the Activity log. It was written inline in the
 * sheet; the swipe had to offer Delete exactly where the sheet does, so it is shared rather than
 * written twice. A private entry follows the same rule: it is only ever in a list for the person who
 * logged it (`visibleTo`), and a delete is its creator's own.
 */
import type { Role } from '@nibblecue/core';

export function canChangeEntry(
  role: Role | undefined,
  createdBy: string | null,
  viewerId: string | null,
): boolean {
  return (
    role === undefined ||
    role === 'OWNER' ||
    role === 'PARENT' ||
    (createdBy !== null && createdBy === viewerId)
  );
}
