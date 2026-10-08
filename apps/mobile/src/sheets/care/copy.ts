/**
 * Every string the care-items feature puts on a screen (docs/CARE_ITEMS.md; docs/plans/WP5.md
 * D8). One file, scanned by `care-copy.test.ts` against two lists that are exported from here
 * so the rule and its enforcement cannot drift apart:
 *
 *   * `CARE_BANNED` — words that would make the app advise, evaluate or compute: a dose, a
 *     schedule it invented, a score. CARE_ITEMS §6 and the brief's rule 4.
 *   * `SUPPLIED_NAME_BANNED` — product and drug names, and example amounts. Everything on the
 *     household's list was typed by the household (D8): no starter list, no suggested name,
 *     not even as a placeholder in a field.
 *
 * The one string that names a dose is the promise that the app never calculates one, and it
 * lives in ../quick/copy.ts as HINTS.med, where the medicine sheet reads it.
 */

export const CARE_KIND_LABEL = {
  MEDICINE: 'Medicine',
  VITAMIN: 'Vitamin',
  CREAM: 'Cream or ointment',
  OTHER: 'Other',
} as const;
export type CareKindKey = keyof typeof CARE_KIND_LABEL;
export const CARE_KINDS: readonly CareKindKey[] = ['MEDICINE', 'VITAMIN', 'CREAM', 'OTHER'];

/**
 * How it is given — Oral · With milk/food · On skin (the owner, 2026-09-19) — is the one set of
 * words here that is read from core rather than written here: the pediatrician summary says
 * them too and lives in pure TypeScript. `packages/core/src/today/careRoute.ts` carries the
 * decision, the order, and the stored value no control offers. Re-exported so the scan below
 * still covers them.
 */
export { CARE_ROUTE_LABEL, CARE_ROUTES } from '@nibblecue/core';
import { JUST_NOW } from '@nibblecue/core';

/** The kind-first add flow (D8a): naming a CATEGORY is not naming a product. */
export const CARE_COPY = {
  screenTitle: 'Medicines & creams',
  listEmptyTitle: 'Nothing on the list yet',
  listEmptyBody: 'Add what you give regularly, in your own words. Logging it later is one tap.',
  addFirst: 'Add the first one',
  add: 'Add',
  addRow: 'Add a medicine, vitamin or cream',
  /**
   * THE MEDICINE SHEET'S WAY TO THE LIST, and since 2026-09-26 its only way to add (the owner:
   * "move the icon medicine to 'medicine & creams' rename it to 'Manage medicine & creams' then
   * remove the add a medicine, citamin or cream button. user can add it in manage if they want
   * to"). `MedSheet` says why the row is there at all; its line under the title says adding is
   * what it holds now.
   */
  manage: 'Manage medicine & creams',
  manageRow: 'Add new ones, usual amounts and reminders',
  newItem: 'New item',
  editItem: 'Edit item',
  whatIsIt: 'What is it?',
  name: 'Name',
  namePlaceholder: 'In your own words',
  usual: 'How much you usually give',
  usualPlaceholder: 'As you were told to give it',
  /**
   * ONE SENTENCE (the owner, 2026-09-26: "shorten the text … just summarize in a sentence"). It was
   * two: filled in every time so it is never typed twice, and the app repeats what the parent was
   * told and never changes it. "Exactly as you write it" keeps both halves: the app carries the
   * parent's own words and calculates nothing (CLAUDE.md §2 rule 4).
   */
  usualHint: 'Filled in every time, exactly as you write it.',
  how: 'How you give it',
  note: 'Note',
  notePlaceholder: 'Optional. Where on the body, which pharmacy, anything',
  timesADay: 'How many times a day',
  at: 'At',
  /** What a screen reader hears after a reminder time's own name (`reminderTimeLabel`). */
  atHint: 'Changes the time',
  save: 'Add to my list',
  saveChanges: 'Save changes',
  archive: 'Remove from the list',
  archived: 'Removed from the list. Everything logged stays.',
  nameTaken: 'That name is already on the list',
  /** The medicine sheet. */
  sheetQuestion: 'What did you give or apply?',
  /** Nothing on the list yet: the Manage row under this line is where the first one is added. */
  sheetEmpty: 'Nothing on the list yet. Add the first one in Manage below.',
  differentAmount: 'Different amount just this time',
  keepUsual: 'Keep the usual amounts',
  amountAsGiven: 'Amount as given',
} as const;

/** A reminder time as a screen reader hears it: `Reminder 2 of 3, 2:30 PM`. */
export const reminderTimeLabel = (index: number, count: number, clock: string): string =>
  count > 1 ? `Reminder ${index + 1} of ${count}, ${clock}` : `Reminder, ${clock}`;

export const TIMES_A_DAY_LABEL = { 1: 'Once', 2: 'Twice', 3: '3 times', 4: '4 times' } as const;

/** `Log 2 items` / `Log Barrier cream`. */
export const logLabel = (names: readonly string[]): string =>
  names.length === 1 ? `Log ${names[0]}` : `Log ${names.length} items`;

/** `Saved: Barrier cream at 8:04 AM`, `Saved: 2 items at 8:04 AM`. */
export const savedCare = (names: readonly string[], clock: string): string =>
  `Saved: ${names.length === 1 ? names[0] : `${names.length} items`} at ${clock}`;

/**
 * `1 of 3 today` / `1 today` / `last 3h 10m ago by Sam` — the row's second line, joined by ` · `.
 *
 * WHO IS THE PART THAT MATTERS AT 3 A.M. (the owner, 2026-09-23). "Last 3h 10m ago" answers
 * "when"; in a household of two phones the next question is "which of us?", and the row now
 * says it: "by you", or the name the log shows. A name that has not arrived yet is left out
 * rather than said as "someone". And "last Now ago" — what a template made of this line said
 * in the first minute — is "last just now".
 */
export function careRowDetail(input: {
  usual: string | null;
  today: number;
  reminders: number;
  lastAgo: string | null;
  lastBy?: string | null;
  /**
   * With more than one baby in view, each one's own count: `Ada 1 of 2 · Liam 0 of 2 today`.
   * The reminders are one baby's plan, so the babies are never added together against it —
   * that read "2 of 1" (the audit of 2026-09-24, solids H5).
   */
  perChild?: readonly { name: string; today: number }[];
  /** Which baby the last one was for, with more than one in view: `last 5m ago for Ada`. */
  lastFor?: string | null;
}): string {
  const parts: string[] = [];
  // "Usual 5 ml", never a bare "5 ml": beside "last … by Sam" a bare amount read as what Sam gave
  // (the handoff audit's U13). It is the parent's own usual amount, as typed — never calculated.
  if (input.usual) parts.push(`Usual ${input.usual}`);
  const babies = input.perChild !== undefined && input.perChild.length > 1 ? input.perChild : null;
  if (babies !== null) {
    if (input.reminders > 0 || babies.some(b => b.today > 0)) {
      const each = babies.map(b =>
        input.reminders > 0 ? `${b.name} ${b.today} of ${input.reminders}` : `${b.name} ${b.today}`,
      );
      parts.push(`${each.join(' · ')} today`);
    }
  } else if (input.reminders > 0) parts.push(`${input.today} of ${input.reminders} today`);
  else if (input.today > 0) parts.push(`${input.today} today`);
  if (input.lastAgo) {
    const when = input.lastAgo === JUST_NOW ? 'last just now' : `last ${input.lastAgo} ago`;
    const forWhom = babies !== null && input.lastFor ? `${when} for ${input.lastFor}` : when;
    parts.push(input.lastBy ? `${forWhom} by ${input.lastBy}` : forWhom);
  }
  return parts.join(' · ');
}

/**
 * Words no string in this feature may contain (CARE_ITEMS §6, §7; brief rule 4). Advice,
 * evaluation and arithmetic about what is given — and the report-card language §5 forbids.
 */
export const CARE_BANNED = [
  'dose',
  'dosage',
  'recommend',
  'suggest',
  'should give',
  'should take',
  'usually given',
  'typical',
  'per kg',
  'mg/kg',
  'by weight',
  'double',
  'interaction',
  'contraindicat',
  'adherence',
  'streak',
  'you missed',
  'on track',
  'overdue',
  'works',
  'working',
] as const;

/**
 * Names and amounts the app must never supply (D8). Products, drug names, and the example
 * amounts a placeholder would be tempted to show.
 */
export const SUPPLIED_NAME_BANNED = [
  'vitamin d',
  'acetaminophen',
  'paracetamol',
  'tylenol',
  'ibuprofen',
  'motrin',
  'advil',
  'aquaphor',
  'vaseline',
  'petroleum',
  'hydrocortisone',
  'moisturi',
  'desitin',
  'zinc',
  'simethicone',
  'gripe',
  'saline',
  'probiotic',
  '1 drop',
  'thin layer',
  'pea-sized',
  '2.5 ml',
  '2.5ml',
] as const;
