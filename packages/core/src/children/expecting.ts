/**
 * A BABY ON THE WAY (the owner, 2026-10-01: "of course this should be an option. even parents start
 * collecting collostrum before labor ... not all modules will be available but at least parents can
 * start learning what the app does"; migration 0150).
 *
 * Setup can be finished before the birth. The child is then a due date with no birth date, and
 * everything the app counts from a birth waits for one: the age on the chip, the month-days, the
 * visit dates, the baby's routine and its reminders, the 14 days of Plus. What does not need the
 * baby works from the first day: pumping, the milk stash, shopping and supplies, the to-do list,
 * the family, the look of the app. "The baby is here" (`record_birth`) turns the due date into a
 * birthday, and from then on the child is like any other.
 *
 * Only dates the parent typed, and arithmetic on them. Nothing here counts weeks of pregnancy or
 * says anything about one (CLAUDE.md §2 rules 1 and 3): a due date is a date on a calendar.
 *
 * Pure, so `expecting.test.ts` runs in node.
 */
import { MODULE_BY_ID, type ModuleId } from '../modules/module-registry';

/** Born: the child has a birth date. A baby on the way has only its due date. */
export const isBorn = <T extends { birth_date: string | null }>(
  child: T,
): child is T & { birth_date: string } => child.birth_date !== null;

/** The children something can be logged for, counted from or reminded about, in their order. */
export const bornChildren = <T extends { birth_date: string | null }>(
  children: readonly T[],
): (T & { birth_date: string })[] => children.filter(isBorn);

/** The children still on the way. */
export const expectedChildren = <T extends { birth_date: string | null }>(
  children: readonly T[],
): T[] => children.filter(c => c.birth_date === null);

/**
 * Whether the household is waiting for its first baby: it has a child, and none is born yet. A
 * household with a toddler and a baby on the way is not: the toddler is logged for as before, and
 * the baby on the way waits on its own (`expectedChildren`).
 */
export const householdExpecting = (children: readonly { birth_date: string | null }[]): boolean =>
  children.length > 0 && children.every(c => c.birth_date === null);

/**
 * The name a baby on the way is given when the parent has not chosen one yet. Setup asks for a
 * name, and an expecting parent may not have one: the server needs a name on every child, so this
 * stands in, and "The baby is here" asks again. Never shown as a name where a sentence can say
 * "your baby" instead (`isUnnamed`).
 */
export const UNNAMED_CHILD = 'Baby';

export const isUnnamed = (name: string): boolean => name.trim() === UNNAMED_CHILD;

/**
 * THE MODULES A HOUSEHOLD ON THE WAY USES: the ones that belong to a person rather than a baby
 * (`householdScoped` in the registry: pumping and the milk stash). Everything else is about a
 * baby, so it waits. The household's own switches are untouched: what the parent turned on in
 * setup is on the day the baby arrives.
 */
export const usableBeforeBirth = (id: ModuleId): boolean =>
  MODULE_BY_ID[id]?.householdScoped === true;

/** The enabled set a household works with today: all of it once a baby is born. */
export function modulesInUse<T extends ModuleId>(enabled: readonly T[], expecting: boolean): T[] {
  return expecting ? enabled.filter(usableBeforeBirth) : [...enabled];
}

const DAY_MS = 86_400_000;

/** Whole days from `todayIso` to the due date: 0 on the day, negative after it. */
export const daysToDue = (dueIso: string, todayIso: string): number =>
  Math.round((Date.parse(`${dueIso}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) / DAY_MS);

/**
 * HOW FAR FROM TODAY A DUE DATE MAY BE, in setup and in "Add a child": six weeks past it, for a
 * baby who is late and a parent who sets up then, and 300 days ahead, which is as early as anyone
 * knows a date. Migration 0150 holds the server to the same window.
 */
export const DUE_PAST_DAYS = 42;
export const DUE_AHEAD_DAYS = 300;

export type DueVerdict = 'ok' | 'invalid' | 'past' | 'far';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (s: string): boolean => {
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};

/** Whether a due date for a baby on the way is one setup takes. */
export function expectedDueVerdict(iso: string | null | undefined, todayIso: string): DueVerdict {
  if (!iso || !ISO.test(iso) || !realDate(iso)) return 'invalid';
  const days = daysToDue(iso, todayIso);
  if (days < -DUE_PAST_DAYS) return 'past';
  if (days > DUE_AHEAD_DAYS) return 'far';
  return 'ok';
}

/**
 * Whether a birth date may be recorded for a baby on the way: today or earlier, and within a year
 * of its due date (setup's rule for a baby who came early). `record_birth` holds the same.
 */
export function birthOnRecordable(
  birthIso: string | null | undefined,
  dueIso: string | null,
  todayIso: string,
): boolean {
  if (!birthIso || !ISO.test(birthIso) || !realDate(birthIso)) return false;
  if (birthIso > todayIso) return false;
  return dueIso === null || Math.abs(daysToDue(dueIso, birthIso)) <= 365;
}
