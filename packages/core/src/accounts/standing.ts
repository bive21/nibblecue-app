/**
 * WHEN AN ACCOUNT IS IN NO HOUSEHOLD, and the two very different reasons that can be true.
 *
 * (a) It is BRAND NEW. Verified, nothing set up yet, and the right thing is the six setup
 *     questions — which is what the app has always done.
 *
 * (b) It USED to be in one and is not any more: a temporary caregiver whose evening ran out
 *     (`household_members.expires_at`, migration 0101), or anyone an owner removed.
 *
 * The app could not tell them apart, so (b) got (a)'s screen: a babysitter opened CuddleCue the
 * morning after and was asked for a baby's name and date of birth. Nothing was broken — they are
 * in no household, so the app offered to make them one — but it reads as though their account was
 * wiped, when in fact their evening simply finished (the owner, 2026-09-22: *"do both, it makes
 * sense to have that"*).
 *
 * WHAT TELLS THEM APART is the device's own memory: this app writes down the household it is
 * showing while it is showing one. Memberships empty + a remembered household = (b).
 *
 * WHY A MEMORY RATHER THAN A SERVER FIELD. The server cannot answer this without telling the
 * caller about a household they are no longer in, and the whole point of the expiry is that
 * `app.is_member` stops answering anything about it the moment it passes (SECURITY.md §1). The
 * device already knew; it just was not writing it down.
 *
 * A FRESH INSTALL OF A REMOVED ACCOUNT HAS NO MEMORY and gets (a). That is the honest fallback:
 * with no local record and a server that will not say, there is nothing to tell them, and setup
 * is the one thing they can still do.
 */

/** What the app should show an account that belongs to no household. */
export type NoHouseholdStanding = 'setup' | 'ended';

export interface LastHousehold {
  id: string;
  /** What it was called, for the sentence. Empty is fine — the copy has a version without it. */
  name: string;
  /**
   * THIS ACCOUNT LEFT IT, ITSELF (2026-10-08): Family's "Leave <family>" for a caregiver, a viewer or
   * a parent, written on the device the moment the server ended the seat. Only then is it true, so
   * only then is it set; a removal and a seat that ran out leave it unset, and the next household
   * the device shows writes its own memory without it.
   */
  left?: boolean;
}

export const standingWithNoHousehold = (last: LastHousehold | null): NoHouseholdStanding =>
  last === null ? 'setup' : 'ended';

/**
 * WHICH OF ENDED'S TWO READINGS TO SAY (2026-10-08). The app could not tell a removal from a seat
 * that ran out, so the ordinary words name both and blame nobody. A leave is different: the person
 * did it themselves, a moment ago, on this phone, and the device wrote that down (`left`). Telling
 * them "your time has ended" then reads as though somebody else ended it.
 */
export type EndedReading = 'left' | 'ended';

export const endedReading = (last: LastHousehold | null): EndedReading =>
  last?.left === true ? 'left' : 'ended';

/**
 * THE WORDS. Three facts and no blame, because the app does not know which of the two happened
 * and neither reading should read as a telling-off:
 *
 *   1. what changed, named — "your access to the Iversen family has ended";
 *   2. why it can happen, both ways, in one line;
 *   3. that nothing they logged was lost, which is the fear (CLAUDE.md rule 7 is about the
 *      household's rows; this is the sentence that says whose they are).
 *
 * And three ways on, in the order a person in this position wants them: a new code (a sitter
 * invited back for another evening), their own household, sign out.
 */
export const ENDED = {
  title: (household: string): string =>
    household === ''
      ? 'You are not in a household any more'
      : `Your time with ${household} has ended`,
  body:
    // leaving is named too (2026-10-08): a caregiver who leaves their only family lands here, and
    // the page must not tell them somebody else ended it
    'A temporary invite runs out on its own, a parent can remove someone, and anyone can leave. ' +
    'However it happened, it is done now.',
  keptTitle: 'Nothing you logged was deleted',
  keptBody:
    'Every entry you made stays with the household, under your name. It is their record, so it ' +
    'is no longer on this phone.',
  joinLabel: 'I have a new invite code',
  joinHint: 'Opens the invite code sheet',
  startLabel: 'Start my own household',
  startHint: 'Sets up CuddleCue for a baby of your own',
  signOutLabel: 'Sign out',
  /**
   * THEY LEFT IT THEMSELVES (2026-10-08; `endedReading`): a caregiver, a viewer or a parent who
   * used Family's "Leave <family>" on the only family they were in. The same three ways on.
   */
  left: {
    title: (household: string): string =>
      household.trim() === '' ? 'You left the family' : `You left ${household.trim()}`,
    body: 'You chose to leave, so it is no longer on this phone. A parent there can invite you again.',
    keptBody: (household: string): string =>
      household.trim() === ''
        ? 'Every entry you made stays with the family, under your name.'
        : `Every entry you made stays with ${household.trim()}, under your name.`,
  },
} as const;
