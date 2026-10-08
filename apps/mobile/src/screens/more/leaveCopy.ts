/**
 * EVERY WORD OF LEAVING A HOUSEHOLD NOBODY ELSE IS IN, AND OF BRINGING IT BACK, in one table
 * (migration 0143; the owner, 2026-09-29: *"Should a household with nobody else in it get a 'Leave'
 * option?"* *"Yes."*).
 *
 * One table so Family's control and its confirmation, the Ended page after it, and the prototype's
 * block 132 say one thing one way: prototype/audit/logic-suite.js evaluates this file, as it does
 * `screens/auth/joinCopy.ts`, and holds the prototype to these very strings. The voice is the app's:
 * short sentences, US English, no dashes, nothing a parent at 3 a.m. has to read twice. The words
 * the join sheet and the unused invite page say about it (`Leave … first`) live in `JOIN`.
 *
 * WHAT IT PROMISES IS WHAT THE SERVER DOES: a household nobody else is in closes when its last
 * person leaves; it is kept, with every entry in it, for 30 days (core's `CLOSED_HOUSEHOLD_DAYS`,
 * held to this by `leave.test.ts`); the person who closed it can bring it back until then; and
 * after that it is deleted for good. A store subscription is not touched: leaving changes nothing
 * about it, and its Plus follows the person to the household they join (0143's header says how).
 */

/** The household's own name, or '' when there is none to say. */
const named = (household: string): string => (household.trim() === '' ? '' : household.trim());

export const LEAVE = {
  /* ---------------------------------------------------------------- Family's control */
  /** Near the foot of Family, and only while nobody else is in the household. */
  row: 'Leave this household',
  rowDetail: 'Nobody else is in it',
  rowHint: 'Asks first. Nothing changes until you confirm.',

  /* ---------------------------------------------------------------- the confirmation */
  title: (household: string): string =>
    named(household) === '' ? 'Leave this household?' : `Leave ${named(household)}?`,
  body: 'Nobody else is in it, so it closes when you leave.',
  kept: 'Its entries are kept for 30 days, and you can bring it back until then. After that it is deleted for good.',
  /** The free full download, one tap away and never gated (CLAUDE.md §4, the bill of rights). */
  download: 'Download everything first',
  downloadHint: 'Opens the free download of every entry, on every plan',
  /** Only when this person pays for Plus through a store (`storeSubscription`). */
  store:
    'Leaving does not change your Plus subscription. It goes with you to the next household you join.',
  confirm: 'Leave household',
  confirmHint: (household: string): string =>
    named(household) === ''
      ? 'Closes the household. You can bring it back for 30 days.'
      : `Closes ${named(household)}. You can bring it back for 30 days.`,
  cancel: 'Cancel',

  /* ---------------------------------------------------------------- what can stop it */
  notAlone: 'Someone else is in this household now, so it stays open.',
  unsynced: (count: number): string =>
    count === 1
      ? 'One entry has not synced yet. Connect to the internet, let it sync, then try again.'
      : `${count} entries have not synced yet. Connect to the internet, let them sync, then try again.`,
  offline: 'No connection. Check your network and try again.',
  failed: 'Something went wrong. Please try again.',

  /* ---------------------------------------------------------------- a caregiver's or a viewer's seat */
  /**
   * LEAVING A FAMILY OTHERS ARE STILL IN, for a caregiver or a viewer (the verification sweep of
   * 2026-10-08; `auth/leave.ts` `leaveSeat`). Nothing closes: the family goes on as it was, with
   * every entry this person made in its log, and the next family they are in comes on screen.
   */
  seat: {
    row: (family: string): string =>
      named(family) === '' ? 'Leave this family' : `Leave ${named(family)}`,
    rowDetail: 'Your entries stay in its log',
    rowHint: 'Asks first. Nothing changes until you confirm.',
    title: (family: string): string =>
      named(family) === '' ? 'Leave this family?' : `Leave ${named(family)}?`,
    body: (family: string): string =>
      named(family) === ''
        ? 'You will no longer see this family or get its reminders.'
        : `You will no longer see ${named(family)} or get its reminders.`,
    kept: 'Everything you logged stays in the family’s log. A parent can invite you again.',
    confirm: 'Leave family',
    confirmHint: (family: string): string =>
      named(family) === ''
        ? 'Ends your place in this family.'
        : `Ends your place in ${named(family)}.`,
    cancel: 'Cancel',
    /**
     * Only for a parent who pays for Plus through a store (`storeSubscription`): the store owns it
     * and leaving never touches it (CLAUDE.md rule 14).
     */
    store:
      'Leaving does not change your Plus subscription. It stays yours, and you can manage it in your store account.',
    /** A seat the app does not let go of here: the owner's, after a role changed meanwhile. */
    notAllowed:
      'The owner cannot leave while others are in the family. Make someone else the owner first.',
    /**
     * ON FOR THE FAMILY (who's on) WHEN THEY LEAVE (2026-10-08; `leave.ts` `leaveSeat`): asked
     * first, as a switch asks (`household/switchCopy.ts` `SWITCH.onDuty`), and a yes hands the shift
     * back before the seat ends.
     */
    onDuty: {
      ask: 'Leave anyway?',
      body: (family: string): string =>
        named(family) === ''
          ? 'Reminders for this family will go back to the other phones.'
          : `Reminders for ${named(family)} will go back to the other phones.`,
      confirm: 'Leave anyway',
    },
  },

  /* ---------------------------------------------------------------- the owner, with others in it */
  /**
   * THE OWNER OF A FAMILY OTHERS ARE IN (2026-10-08; `leave.ts` `mustHandOnFirst`). The row is never
   * a dead control: it opens the one way on, Family's own "Make owner", for each person who can take
   * it (a lasting seat; a seat that ends is never the owner's, 0109).
   */
  owner: {
    row: 'Make someone else the owner first',
    rowDetail: (family: string): string =>
      named(family) === '' ? 'Then you can leave' : `Then you can leave ${named(family)}`,
    rowHint: 'Shows who can be the owner. Nothing changes until you confirm.',
    title: 'Every family needs an owner',
    body: (family: string): string =>
      named(family) === ''
        ? 'Make someone else the owner of this family, and then you can leave it as a parent.'
        : `Make someone else the owner of ${named(family)}, and then you can leave it as a parent.`,
    pick: (person: string): string =>
      person.trim() === '' ? 'Make them the owner' : `Make ${person.trim()} the owner`,
    pickHint: 'Asks first. You become a parent in this family.',
    /** Nobody here has a lasting seat: only caregivers whose access ends, or nobody at all. */
    nobody: 'Nobody here can be the owner yet. Invite another parent first.',
    cancel: 'Cancel',
    /** The confirmation the pick asks with (`ui/confirm.tsx`). */
    confirmTitle: (person: string): string =>
      person.trim() === '' ? 'Make them the owner?' : `Make ${person.trim()} the owner?`,
    confirmBody: 'You stay in the family as a parent, and can leave it after.',
    confirmAction: 'Make owner',
  },

  /* ---------------------------------------------------------------- Ended, after leaving */
  ended: {
    title: (household: string): string =>
      named(household) === '' ? 'You left your household' : `You left ${named(household)}`,
    body: 'Nobody else was in it, so it is closed.',
    keptTitle: 'Nothing you logged was deleted',
    kept: (date: string): string =>
      `Everything in it is kept until ${date}, and you can bring it back until then.`,
    restore: (household: string): string =>
      named(household) === '' ? 'Bring back your household' : `Bring back ${named(household)}`,
    restoreHint: 'Opens it again, with everything in it',
    restored: (household: string): string =>
      named(household) === '' ? 'Your household is back.' : `${named(household)} is back.`,
    gone: 'That household can no longer be brought back.',
    inHousehold: 'You are in another household now. Leave it first to bring this one back.',
    offline: 'No connection. Check your network and try again.',
    failed: 'Something went wrong. Please try again.',
  },
} as const;
