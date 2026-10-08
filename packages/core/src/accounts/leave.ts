/**
 * LEAVING A HOUSEHOLD NOBODY ELSE IS IN (migration 0143; the owner, 2026-09-29: *"Should a household
 * with nobody else in it get a 'Leave' option?"* *"Yes."*).
 *
 * One account holds one household (0139), so a partner who set up a household of their own by
 * mistake could not join the one they meant to. Now the last person in a household may leave it:
 * it closes, it is kept with everything in it for `CLOSED_HOUSEHOLD_DAYS`, the person who closed it
 * can bring it back until then, and then it is deleted for good. The server decides every part of
 * it (`leave_household_alone`, `restore_household`); this file is only the number and the one
 * question the screens ask of a roster. Pure, RN-free, tested in node.
 */

/**
 * How long a closed household is kept before it is deleted, in days: the server's
 * `app.closed_household_days()` (0143), held equal by `packages/db/src/integration/leave-alone.test.ts`,
 * and the number the confirmation promises.
 */
export const CLOSED_HOUSEHOLD_DAYS = 30;

/** One row of the live roster (`household_roster`, 0101), as far as this question needs it. */
export interface RosterMember {
  is_self: boolean;
}

/**
 * NOBODY ELSE IS IN IT: the roster of who is here NOW (permanent members and seats that have not
 * lapsed) is exactly the person asking. An empty roster is not "alone": it is a roster not read yet,
 * or not readable, and nothing is offered on it. The server counts again when the person leaves
 * (`CC409 not_alone`), so a roster read a moment ago can only ever hide the control, never open a
 * household somebody else is in.
 */
export const aloneIn = (members: readonly RosterMember[]): boolean =>
  members.length === 1 && members[0]?.is_self === true;
