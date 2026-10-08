/**
 * THE WORDS FOR A BABY ON THE WAY (the owner, 2026-10-01; migration 0150): the chip's line, the
 * Today card, the "The baby is here" sheet. Pure, so `copy.test.ts` reads every sentence.
 *
 * Only the dates the parent typed. Nothing counts weeks of pregnancy, and nothing says how the
 * pregnancy is going (CLAUDE.md §2 rules 1 and 3): a due date is a date, and a day after it is a
 * date too. Plain words, no dashes, US English.
 */
import { daysToDue, isUnnamed } from '@nibblecue/core';

/** "Oct 12" in the phone's own format, from a `yyyy-mm-dd` read as a local date (`bornOn` says why). */
export function monthDay(iso: string, locale?: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** The chip's line under the name: "Due Oct 12". */
export const dueChip = (dueIso: string, locale?: string): string =>
  `Due ${monthDay(dueIso, locale)}`;

/** Today's card line: the due date, and the days to it while it is ahead. */
export function dueLine(dueIso: string, todayIso: string, locale?: string): string {
  const days = daysToDue(dueIso, todayIso);
  if (days > 1) return `Due ${monthDay(dueIso, locale)}, in ${days} days`;
  if (days === 1) return 'Due tomorrow';
  if (days === 0) return 'Due today';
  return `Due date was ${monthDay(dueIso, locale)}`;
}

/** "Ada is on the way", "Your baby is on the way", and the same for twins. */
export function onTheWayTitle(names: readonly string[]): string {
  const named = names.filter(n => !isUnnamed(n));
  if (names.length <= 1) return named[0] ? `${named[0]} is on the way` : 'Your baby is on the way';
  return named.length === names.length
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are on the way`
    : 'Your babies are on the way';
}

export const EXPECTING = {
  /** What works now and what waits. */
  learn:
    'Pumping, the milk stash, shopping and your to-dos work now. The rest starts with your baby.',
  /** The household's 14 days of Plus, when they are owed (`welcome_waits_for_birth`). */
  plus: (count: number) =>
    count > 1
      ? 'Your 14 days of Plus start the day your babies arrive.'
      : 'Your 14 days of Plus start the day your baby arrives.',
  here: (count: number) => (count > 1 ? 'The babies are here' : 'The baby is here'),
  /** Someone who cannot record the birth (a caregiver) sees the card without the button. */
  askParent: 'A parent can record the birth here.',
  /** What you track, while every baby is on the way. */
  track:
    'Until your baby arrives, only pumping and the milk stash are in use. Everything else you turn on here starts with your baby.',
  /** The Plan page, while the household's 14 days of Plus wait for the birth. */
  planWaits: 'Your 14 days of Plus start the day your baby arrives. Nothing to cancel.',
} as const;

/** The "The baby is here" sheet. */
export const BIRTH_SHEET = {
  title: (count: number) => (count > 1 ? 'The babies are here' : 'The baby is here'),
  lede: 'Congratulations! Add the date of birth, and the name if it has changed.',
  name: 'Name',
  namePlaceholder: 'Name',
  date: 'Date of birth',
  save: 'Save',
  saving: 'Saving…',
  future: 'A date of birth cannot be in the future.',
  window: 'A date of birth is within a year of the due date.',
  nameNeeded: 'Give the baby a name, or leave it as it was.',
  forbidden: 'Only a parent or owner can record the birth.',
  offline: 'Could not reach the server. Try again when you are online.',
  failed: 'Could not save the birth. Please check the details.',
  /** The toast once it is saved. */
  welcome: (names: readonly string[], plusStarted: boolean) => {
    const named = names.filter(n => !isUnnamed(n));
    const hello =
      named.length === 0
        ? 'Welcome, little one!'
        : `Welcome, ${named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`}!`;
    return plusStarted ? `${hello} Your 14 days of Plus start today.` : hello;
  },
} as const;
