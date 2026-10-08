/**
 * "START YOUR OWN FAMILY" (the owner, 2026-10-08; migration 0154): somebody already in other
 * families as a caregiver or a viewer, a nanny or a grandparent, sets up a family for a baby of
 * their own. Setup itself is the one every first family walks (`screens/onboarding`), pushed over
 * Family while the account stays `ready`; this file is the part that is not a screen, so the
 * scenario suites play it against the in-app test backend.
 *
 * THE MODE IS THE PHASE. The onboarding route is registered in the `ready` branch too, under its
 * own `navigationKey` (`app/navigation.tsx`), and a setup drawn while the phase is `ready` can only
 * be this one: an account in no family is `onboarding` or `ended`. So nothing new is held in
 * `AuthContext` while the steps are answered, and the family on screen keeps running underneath:
 * its sync, its reminders, its seeder (which writes nothing for somebody who is not its owner).
 *
 *   1. OFFERED (core `ownFamilyVerdict`) only to somebody below `MAX_HOUSEHOLDS` with no parent's
 *      seat anywhere. Not offered, Family draws no row at all.
 *   2. THE STEPS keep their own draft (`own_family_draft:<uid>`, `draft-store.ts`), so neither a
 *      first setup kept on disk nor another account's ever resumes here. Back from the first page
 *      returns to Family with nothing made.
 *   3. FINISH is the first setup's (`sendFinish`); the server refuses a parent elsewhere
 *      (`admin_elsewhere`) or a sixth family (`household_limit`) and nothing is made.
 *   4. THE WELCOME'S BUTTON brings the new family on screen (`bringOwnFamilyOnScreen`, below): the
 *      account is read again, and the switch a second join makes (`switchHousehold`) sends what the
 *      family on screen still owes the server first, then shows the new one as its OWNER.
 */
import type { Role } from '@nibblecue/core';
import type { SwitchOutcome } from '../household/switchOutcome';

/** The account as the step reads it: every family, with this person's role in each. */
export interface FamiliesRead {
  memberships: readonly { household_id: string; household_name: string; role: Role }[];
}

/** `AuthContext`'s `SwitchOutcome`, as this step reads it. */
export type SwitchAnswer = SwitchOutcome;

/** What bringing the new family on screen came to. */
export type OwnFamilyOutcome =
  /** it is on screen: everything below the account remounts on it, on Today */
  | { kind: 'on_screen'; name: string }
  /** the family on screen still owes the server entries: nothing changed, the button asks again */
  | { kind: 'owed'; count: number; name: string }
  /**
   * the person is on for the family on screen (2026-10-08, `household/switchDuty.ts`): it stays on
   * screen, never switched away from silently; the switcher under Your families asks and hands back
   */
  | { kind: 'on_duty'; name: string; untilMs: number }
  /** the read did not list it yet (no connection), or the switch failed: it is made, and listed later */
  | { kind: 'not_yet' };

export interface OwnFamilyDeps {
  /** `refreshAccount`: the account read again, or null when it could not be. */
  read(): Promise<FamiliesRead | null>;
  /** `switchHousehold`. */
  switchTo(householdId: string): Promise<SwitchAnswer>;
}

/**
 * THE NEW FAMILY COMES ON SCREEN. `householdId` is what Finish answered; null when Finish was told
 * the account owns one already (an earlier Finish whose answer was lost), which is then the family
 * this person OWNS in the read.
 */
export async function bringOwnFamilyOnScreen(
  deps: OwnFamilyDeps,
  householdId: string | null,
): Promise<OwnFamilyOutcome> {
  const read = await deps.read().catch(() => null);
  const target = read?.memberships.find(m =>
    householdId === null ? m.role === 'OWNER' : m.household_id === householdId,
  );
  if (target === undefined) return { kind: 'not_yet' };
  const out = await deps
    .switchTo(target.household_id)
    .catch((): SwitchAnswer => ({ kind: 'failed' }));
  switch (out.kind) {
    case 'switched':
      return { kind: 'on_screen', name: out.name || target.household_name };
    case 'owed':
      return { kind: 'owed', count: out.count, name: out.name };
    case 'on_duty':
      return { kind: 'on_duty', name: out.name, untilMs: out.untilMs };
    case 'on_duty_offline':
    case 'failed':
      return { kind: 'not_yet' };
  }
}
