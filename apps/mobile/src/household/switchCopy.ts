/**
 * THE SWITCHER'S WORDS (0153). "Family" to people, `household` in the code (SWITCHER.md, Words).
 * Sentence case, plain, for a parent at 3 a.m.
 */
export const SWITCH = {
  /** The account menu's and Family's heading over the list. */
  heading: 'Your families',
  /** Beside the family on screen. */
  onScreen: 'Showing now',
  /** The row's spoken name. */
  rowLabel: (name: string, onScreen: boolean): string =>
    onScreen ? `${name}, showing now` : `Switch to ${name}`,
  /** The toast once the other family is on screen. */
  now: (name: string): string => `Now showing ${name || 'the other family'}.`,
  /** A switch that waits on the queue. */
  owed: (count: number, name: string): string =>
    `${count} ${count === 1 ? 'entry' : 'entries'} for ${name || 'this family'} ${
      count === 1 ? 'is' : 'are'
    } still on the way to the server. Switch once ${count === 1 ? 'it has' : 'they have'} sent.`,
  failed: 'That did not switch. Try again in a moment.',
  /**
   * SWITCHING AWAY WHILE ON (2026-10-08; `switchDuty.ts`). This phone rings only for the family on
   * screen, so the switcher asks first, and a yes hands the shift back: nobody is on, and each
   * parent's own phone rings for that family again once it has the change.
   */
  onDuty: {
    title: (family: string, from: string, until: string, started: boolean): string =>
      started
        ? `You’re on for ${family || 'this family'} until ${until}.`
        : `You’re on for ${family || 'this family'} from ${from} until ${until}.`,
    ask: 'Switch anyway?',
    body: (family: string): string =>
      `Reminders for ${family || 'this family'} will go back to the parents’ phones.`,
    confirm: 'Switch anyway',
    cancel: 'Cancel',
    /** No connection: the shift cannot be handed back, so nothing changed. */
    offline: (family: string): string =>
      `No connection. You’re still on for ${family || 'this family'}. Connect to the internet, then switch.`,
  },
  /**
   * A SECOND FAMILY JOINED, BUT NOT ON SCREEN YET (2026-10-08; `switchOutcome.ts`). The join
   * happened; what kept the family on screen is said instead of "You joined", which would open
   * over the family being left.
   */
  joined: {
    owed: (joined: string, count: number, leaving: string): string =>
      `You joined ${joined || 'the family'}. ${count} ${count === 1 ? 'entry' : 'entries'} for ${
        leaving || 'this family'
      } ${count === 1 ? 'is' : 'are'} still on the way to the server. Switch once ${
        count === 1 ? 'it has' : 'they have'
      } sent.`,
    onDuty: (joined: string, leaving: string, until: string): string =>
      `You joined ${joined || 'the family'}. You’re on for ${
        leaving || 'this family'
      } until ${until}, so it stays on screen. Switch from Your families when you’re ready.`,
    failed: (joined: string): string =>
      `You joined ${joined || 'the family'}. Switch to it from Your families.`,
  },
  switching: 'Switching…',
  /** The role, as the list says it. */
  role: (role: string): string =>
    role === 'OWNER' || role === 'PARENT'
      ? 'Parent'
      : role === 'CAREGIVER'
        ? 'Caregiver'
        : 'View only',
} as const;
