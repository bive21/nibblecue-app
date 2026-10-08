/**
 * The child switcher's words (docs/DESIGN_SYSTEM.md §14; the prototype's SHEETS.children): the
 * "at once" row for multiples and each child's detail line. Pure, so the sentences are tested
 * without React Native.
 *
 * The birth date is a `yyyy-mm-dd` string and is turned into a LOCAL date from its parts:
 * `new Date('2026-05-01')` is UTC midnight, which in every western time zone is the evening
 * of April 30 — a child "born" the day before her real birthday. `toLocaleDateString` then
 * writes it in the phone's own format.
 */
import { ageLabel, allChildrenLabel } from '@nibblecue/core';

/** "Both at once" / "All 3 at once". */
export function atOnceLabel(count: number): string {
  return `${allChildrenLabel(count)} at once`;
}

/** The birth date in the phone's format, or the raw string when it is not a date. */
export function bornOn(birthDate: string, locale?: string): string {
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) return birthDate;
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "4 months · born May 1, 2026". */
export function childDetail(birthDate: string, now: number, locale?: string): string {
  return `${ageLabel(birthDate, now)} · born ${bornOn(birthDate, locale)}`;
}

/**
 * Any child's line: a born one's age and birthday, a baby on the way's due date (migration 0150),
 * "Due Oct 12, 2026", in the phone's format like the birthday.
 */
export function childLine(
  child: { birth_date: string | null; due_date: string | null },
  now: number,
  locale?: string,
): string {
  if (child.birth_date !== null) return childDetail(child.birth_date, now, locale);
  return child.due_date === null ? 'On the way' : `Due ${bornOn(child.due_date, locale)}`;
}
