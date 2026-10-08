/**
 * REMOVING SOMEBODY FROM THE FAMILY, from the X on their row in People (the owner, 2026-10-08:
 * *"as parent you can see the list of users tied to family and can easily turn off or delete
 * (clicking X then confirmation box) on the user row"*). What it promises is what the server does:
 * `removeMember` ends their access at once, every entry they logged stays, and nothing about a
 * store subscription changes.
 */

/** The family's own name, or '' when there is none to say. */
const named = (household: string): string => household.trim();

export const FAMILY_REMOVE = {
  /** The X's name for a screen reader. */
  label: (name: string): string => `Remove ${name}`,
  title: (name: string): string => `Remove ${name}?`,
  body: (household: string): string =>
    `${named(household) === '' ? 'Their access to your family ends now' : `Their access to ${named(household)} ends now`}. Everything they logged stays. You can invite them again any time.`,
  action: 'Remove',
  done: (name: string): string => `${name} was removed`,
} as const;
