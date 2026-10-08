/**
 * WHAT THE DEV BUILD'S SYNC FAKE IS TOLD BEFORE ITS FIRST OP — the membership and the children a
 * real project already has. Apart from `index.ts` because that file reaches the Supabase client,
 * which drags React Native into any node test that imports it; these two are plain functions over
 * `MockSyncControls`, and `mockSeed.test.ts` drives them against the real fake.
 */
import type { MockMemberRole, MockSyncControls } from './types';

/** What the fake needs of a child: the row `children` holds on a real project. */
export interface MockChildSeed {
  id: string;
  household_id: string;
  name: string;
  /** Null while the baby is on the way (migration 0150). */
  birth_date: string | null;
  due_date: string | null;
}

/**
 * Idempotent, and in the ACCOUNT'S ROLE (the handoff audit's hand-over, 4): the phone reads a
 * member's role from the synced member list (M6), so an account that joined as a caregiver and
 * was seeded here as an owner would have been reminded, and allowed to change who's on, as a
 * parent. An existing row keeps its place and takes the account's role.
 */
export function ensureMockMembership(
  mock: MockSyncControls,
  householdId: string,
  userId: string,
  role: MockMemberRole = 'OWNER',
): void {
  if (mock.rowCount('household_members', { household_id: householdId, user_id: userId }) > 0) {
    mock.setMemberRole(householdId, userId, role);
    return;
  }
  mock.insertAsOtherDevice('household_members', {
    household_id: householdId,
    user_id: userId,
    role,
    removed_at: null,
  });
}

/**
 * THE FAKE KNOWS THE BABY (the owner, 2026-09-24, in Expo Go: "it says not sync … a lot").
 *
 * In a dev build the children live in the auth mock and the sync fake had none, so every op the
 * server checks a child for — every vaccine record, given, planned, skipped, declined or added by
 * hand — came back "child not in household", was marked FAILED at once, and turned the chip to
 * "Not synced"; every later edit of those records then retried for minutes as "N queued". A real
 * project never sees this: setup and "Add a child" write the row through the API before any op
 * can name it. So this is the fake catching up with the account, called when the providers are
 * built and again whenever the account's children change (SyncProvider).
 *
 * Idempotent, and it only ever ADDS: a child the fake already holds is left as it is, and one
 * from another household is ignored — the same boundary the real `children` policies draw.
 */
export function ensureMockChildren(
  mock: MockSyncControls,
  householdId: string,
  children: readonly MockChildSeed[],
): number {
  let added = 0;
  for (const c of children) {
    if (c.household_id !== householdId) continue;
    if (mock.rowCount('children', { id: c.id }) > 0) continue;
    mock.insertAsOtherDevice('children', {
      id: c.id,
      household_id: c.household_id,
      name: c.name,
      birth_date: c.birth_date,
      due_date: c.due_date,
      deleted_at: null,
    });
    added += 1;
  }
  return added;
}
