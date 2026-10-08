/**
 * A second child, after setup (docs/MULTIPLES.md §8; the owner, 2026-09-17: "Create the option
 * to add the second child now. Analyze the logic first and how it should be related to all the
 * module. Think about real life scenario").
 *
 * Setup takes one baby. Everything that could hold a second — the switcher's "Both", one rule
 * per child, per-child vaccines and reports, the tandem breastfeed — was built and waiting, and
 * nothing after setup could create the child those surfaces were waiting for.
 *
 * THE ONE JUDGMENT IN THIS FILE is whether the new child should start with the first child's
 * rhythms, and the answer depends on who the new child is:
 *
 *   - A twin added on day one, or a twin who came home from the NICU three weeks after the
 *     first: the same date of birth, give or take, and the same day. Copying every rhythm is
 *     what the parent would do by hand, eight times, otherwise.
 *   - A newborn sibling of a toddler still being tracked: months or years between the dates,
 *     and a four-hour bottle interval that is right for one and wrong for the other. Copying
 *     would seed a newborn's plan with a toddler's numbers.
 *
 * So the copy is OFFERED, never silently done, and its default follows the gap between the
 * dates of birth. The line is not a guess about babies — it is arithmetic about pregnancies:
 * children of one household born within the same two months are of the same pregnancy, and
 * children born further apart cannot be. Nothing here interprets, advises or predicts
 * (CLAUDE.md §2); it decides which of two toggles is pre-set, and the parent flips it.
 *
 * Pure, so `children.test.ts` runs in node.
 */
import { z } from 'zod';
import { expectedDueVerdict, UNNAMED_CHILD } from '../children/expecting';
import {
  birthDateVerdict,
  ChildNameSchema,
  dueDateWithinWindow,
  IsoDateSchema,
  pretermWeeks,
} from './onboarding';

/**
 * Children born this close together share a pregnancy. Twins share a date; a NICU discharge
 * gap is days; the shortest possible gap between two pregnancies is well over half a year.
 */
export const MULTIPLES_GAP_DAYS = 60;

const AddChildSchema = z
  .object({
    name: ChildNameSchema,
    birth_date: IsoDateSchema,
    due_date: IsoDateSchema.nullable(),
  })
  .refine(c => c.due_date === null || dueDateWithinWindow(c.birth_date, c.due_date), {
    message: 'due_date.window',
    path: ['due_date'],
  });

/**
 * What "Add a child" sends: a baby already born (its birth date, and a due date only when it came
 * early), or a baby on the way (no birth date, its due date; migration 0150), the twin of an
 * expecting setup and the second baby of a household already using the app.
 */
export type AddChildInput = { name: string; birth_date: string | null; due_date: string | null };

export type AddChildCheck =
  | { ok: true; value: AddChildInput }
  | { ok: false; field: 'name' | 'birth_date' | 'due_date'; reason: string };

/** The same checks setup applies, so a child added later is a child setup would have taken. */
export function checkNewChild(
  input: { name: string; birth_date: string | null; due_date: string | null; expecting?: boolean },
  todayIso: string,
): AddChildCheck {
  if (input.expecting === true) {
    // on the way: the name may wait for the birth, and the due date is held to setup's window
    const name = input.name.trim() === '' ? UNNAMED_CHILD : input.name;
    const named = ChildNameSchema.safeParse(name);
    if (!named.success)
      return { ok: false, field: 'name', reason: named.error.issues[0]?.message ?? 'invalid' };
    const due = expectedDueVerdict(input.due_date, todayIso);
    if (due !== 'ok') return { ok: false, field: 'due_date', reason: `due.${due}` };
    return { ok: true, value: { name: named.data, birth_date: null, due_date: input.due_date } };
  }
  if (input.birth_date === null) return { ok: false, field: 'birth_date', reason: 'required' };
  if (input.birth_date > todayIso) return { ok: false, field: 'birth_date', reason: 'future' };
  const parsed = AddChildSchema.safeParse({
    name: input.name,
    birth_date: input.birth_date,
    due_date: input.due_date,
  });
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  const field = (issue?.path[0] as AddChildCheck extends { field: infer F } ? F : never) ?? 'name';
  return {
    ok: false,
    field: field === 'name' || field === 'birth_date' || field === 'due_date' ? field : 'name',
    reason: issue?.message ?? 'invalid',
  };
}

const DAY_MS = 86_400_000;
const daysApart = (a: string, b: string): number =>
  Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / DAY_MS;

/**
 * Whether the "start with the same rhythms" toggle is pre-set ON.
 *
 * ON when the new child is of the same pregnancy as an existing one (a multiple), OFF for a
 * sibling. With no existing child there is nothing to copy and the question is not asked.
 */
export function suggestCopyRhythms(
  existingBirthDates: readonly string[],
  newBirthDate: string,
): boolean {
  return existingBirthDates.some(d => daysApart(d, newBirthDate) <= MULTIPLES_GAP_DAYS);
}

/**
 * A correction to a child who is already here: the name, and the date of birth when the one typed
 * at setup was wrong (the owner, 2026-10-03). The same bounds as setup. A date older than two
 * years is `confirm` there, which asks "just checking" on the first pass; here the parent is
 * correcting a date they can already see, so that date is accepted. A baby on the way is not this
 * function: the birth itself is `record_birth`, which is what starts the 14 days.
 */
export type ChildCorrection = {
  name: string;
  birth_date: string;
  /** Derived again from the due date the row already holds, never typed here. */
  preterm_weeks: number | null;
};

export function checkChildCorrection(
  input: { name: string; birth_date: string; due_date: string | null },
  todayIso: string,
):
  | { ok: true; value: ChildCorrection }
  | { ok: false; field: 'name' | 'birth_date'; reason: string } {
  const named = ChildNameSchema.safeParse(input.name);
  if (!named.success) {
    const code = named.error.issues[0]?.code;
    return { ok: false, field: 'name', reason: code === 'too_big' ? 'too_big' : 'too_small' };
  }
  const verdict = birthDateVerdict(input.birth_date, todayIso);
  if (verdict === 'future' || verdict === 'too_old' || verdict === 'invalid') {
    return { ok: false, field: 'birth_date', reason: verdict };
  }
  if (input.due_date !== null && !dueDateWithinWindow(input.birth_date, input.due_date)) {
    return { ok: false, field: 'birth_date', reason: 'due_date.window' };
  }
  return {
    ok: true,
    value: {
      name: named.data,
      birth_date: input.birth_date,
      preterm_weeks: pretermWeeks(input.birth_date, input.due_date),
    },
  };
}

/** Which existing child the rhythms are copied from: the one born closest to the new one. */
export function copySourceFor<T extends { id: string; birth_date: string }>(
  existing: readonly T[],
  newBirthDate: string,
): T | null {
  if (existing.length === 0) return null;
  return existing
    .slice()
    .sort(
      (a, b) => daysApart(a.birth_date, newBirthDate) - daysApart(b.birth_date, newBirthDate),
    )[0] as T;
}
