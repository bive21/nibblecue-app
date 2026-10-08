/**
 * Every sentence the vaccine surfaces may say (docs/VACCINES.md §1.1), and the list they
 * may never say (§1.2). The app displays a published window and records what the parent
 * entered; it never tells a parent their child is behind, at risk, protected or due for a
 * catch-up, never names a dose amount, a product or a brand, and every mention of a
 * pediatrician defers to them. `copy.test.ts` holds every string here — and every string the
 * screens add — to this list.
 */
import type { IsoDate } from './date';
import type { DoseDisplayStatus, VaccineDose, VaccineProfile } from './profile';
import { isSoon, type SoonSubject } from './soon';
import { monthsRange, type DoseWindow } from './window';

export const VACCINE_COPY = {
  header: 'Vaccines',
  subtitle: (profile: string, version: string): string =>
    `Published routine schedule · ${profile} ${version}`,
  parentAdded: 'Added by you, not in the published schedule',
  empty: 'Nothing recorded yet. Add what your pediatrician gave at each visit.',
  readOnly: 'Only a parent or owner can edit vaccine records.',
  /**
   * HOW THE APP GROUPS ITS VISIT REMINDERS, as the prototype says it (2026-09-30). The page foot
   * drew the profile's `reminders.grouping` verbatim, and that field is a note for whoever builds
   * the reminders ("one reminder per visit, listing the doses it covers — never one per dose"):
   * lowercase, with a dash, and about the app rather than the published schedule. The app says
   * what it does in its own words; the guidance file is left as published.
   */
  grouping:
    'Visit reminders are grouped: one reminder per visit listing its doses, never one per dose.',
  optionalHint: 'Optional and seasonal vaccines stay off until you turn them on.',
  pastWindowHint:
    'Shown so nothing is lost track of. A date outside the published window is a conversation for your pediatrician, not something the app judges.',
  /**
   * NO SCREEN IS PROMISED HERE. This used to end "…is shown on growth screens only", which was
   * a pointer at a screen that does not exist: growth is a logging sheet and nothing in it reads
   * the due date. A preterm parent following that sentence found nothing (found 2026-09-17).
   * The line now says the number itself, which is all it was ever for — the parent asked, in
   * effect, "is this schedule wrong for a baby who came early?", and the answer is the two
   * ages, side by side, with no advice attached.
   */
  correctedAge: (label: string): string =>
    `This schedule uses age from birth, as published. Counting from the due date you gave, your baby is ${label}.`,
  countsLine: (recorded: number, total: number): string => `${recorded} of ${total} recorded`,
  nextVisitLine: (label: string, n: number): string =>
    `${label} · ${n} dose${n === 1 ? '' : 's'} in the published schedule`,
  windowOpens: (date: string): string => `window opens ${date}`,
  plannedChip: (date: string): string => `Planned ${date}`,
  /**
   * WHEN, IN THE RED WEEK (`soon.ts`; the owner, 2026-09-26): `Today`, `Tomorrow`, `In 5 days` —
   * the distance to a date that has not come yet, and nothing else. There is no word here for a
   * date that has passed, because the red never outlives its date.
   */
  soonChip: (days: number): string =>
    days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`,
  /** The toasts (§6), each with UNDO where the row can be put back. */
  toastRecorded: (name: string, date: string): string => `Recorded: ${name} given ${date}`,
  toastPlanned: (date: string): string => `Planned for ${date}`,
  toastSkipped: 'Marked skipped',
  toastDeclined: 'Recorded as declined',
  toastRemoved: 'Record removed',
  toastAdded: 'Added to the record',
  toastTracked: (name: string): string => `${name} is now tracked`,
  toastUntracked: (name: string): string => `${name} is no longer tracked`,
  /** A repeating dose's record is a parent-added row named by its season (§6, §8):
   *  `Influenza, 2026 season`. The app writes it and reads it back by this shape
   *  (`isSeasonRecord`, which knows the older one too). */
  seasonRecord: (vaccineName: string, year: number): string => `${vaccineName}, ${year} season`,
  footer: (p: Pick<VaccineProfile, 'profile' | 'version' | 'effectiveDate' | 'source'>): string =>
    `Published routine schedule ${p.profile} ${p.version}, effective ${p.effectiveDate}. ${p.source}. Records as entered by the household.`,
} as const;

/**
 * WHAT FOLLOWS A VACCINE'S NAME IN ITS SEASON ROW'S, IN EITHER SHAPE IT HAS BEEN WRITTEN IN. The
 * app named these rows `Influenza — 2025 season` until 2026-09-30, when the dash went from every
 * sentence a parent reads (the owner, 2026-09-27: "remove the "-" on the text, feels too AI"), and
 * it names them `Influenza, 2025 season` now. A row already written keeps its name, because a
 * stored row is the household's record and is never rewritten, so the reader takes both: a season
 * recorded last week is still that dose's season, and not a vaccine the parent added. The year and
 * the word are part of the match, so a name a parent typed that merely starts the same way is not
 * taken for one.
 */
const SEASON_TAIL = /^(?:,| —) \d{4} season$/;

/** Whether a parent-added row's name is `vaccineName`'s season row (`seasonRecord`). */
export const isSeasonRecord = (customName: string, vaccineName: string): boolean =>
  vaccineName !== '' &&
  customName.startsWith(vaccineName) &&
  SEASON_TAIL.test(customName.slice(vaccineName.length));

/** `Published window 2–3 months · Mar 4 – Apr 3`, or `Published window from 6 months`. */
export function windowLine(
  dose: Pick<VaccineDose, 'fromMonths' | 'toMonths'>,
  window: DoseWindow,
  fmtDate: (d: IsoDate) => string,
): string {
  if (window.to === null) return `Published window ${monthsRange(dose)}`;
  return `Published window ${monthsRange(dose)} · ${fmtDate(window.from)} – ${fmtDate(window.to)}`;
}

/**
 * The profile's own reminder sentence, with its two holes filled, and its dash said as a colon: the
 * app writes no dashes (the owner's rule, 2026-09-27), and the 2026_01 template's one dash joins two
 * halves a colon joins as well (`2 month visit is coming up: 5 doses in the published schedule.`).
 * Every word is the published file's; the guidance file itself is left as published.
 */
export function reminderBody(template: string, visitLabel: string, doseCount: number): string {
  return template
    .replace('{{visitLabel}}', visitLabel)
    .replace('{{n}}', String(doseCount))
    .replace(/\s+[—–]\s+/g, ': ');
}

/**
 * The badge tones a vaccine chip can take. `info` is the calm blue — the design system's fixed
 * cool status hue, which no color scheme moves, so a household on the rose scheme does not get a
 * pink "calm" that reads like the red one. `crit` is the red, and only `chipTone` hands it out.
 */
export type DoseTone = 'good' | 'info' | 'crit' | 'neutral';

/**
 * The chip tone per status OUTSIDE the red week (§4, as amended by the owner on 2026-09-26: "the
 * rest … should remain a calm color like blue"). An open window, a plan and a window still ahead
 * are all the calm blue; a given dose keeps the good green; `PAST_WINDOW` is the neutral muted
 * token — never warn, never crit, never red, never an exclamation icon — and a record the parent
 * closed is neutral too. No status maps to warn or crit by itself. `copy.test.ts` pins all of it.
 */
export const STATUS_TONE: Readonly<Record<DoseDisplayStatus, 'good' | 'info' | 'neutral'>> = {
  GIVEN: 'good',
  PLANNED: 'info',
  DUE: 'info',
  UPCOMING: 'info',
  PAST_WINDOW: 'neutral',
  SKIPPED: 'neutral',
  DECLINED: 'neutral',
  NOT_APPLICABLE: 'neutral',
};

/** The statuses that are headed for a date — the only ones the red week can reach. */
const AHEAD: ReadonlySet<DoseDisplayStatus> = new Set(['PLANNED', 'DUE', 'UPCOMING']);

/**
 * The one place red is handed out: `crit` while the dose is SOON (`soon.ts`), the status's calm
 * tone otherwise. A closed window (`PAST_WINDOW`) and a record the parent closed stay in their
 * own tone even if a caller passes `soon` by mistake — that is not left to the caller (§1).
 */
export function chipTone(status: DoseDisplayStatus, soon: boolean): DoseTone {
  return soon && AHEAD.has(status) ? 'crit' : STATUS_TONE[status];
}

/** `chipTone` for a dose (or a parent-added record) on a given day. */
export const doseTone = (s: SoonSubject, today: IsoDate): DoseTone =>
  chipTone(s.status, isSoon(s, today));

/** The chip's word, from the profile; a planned dose shows its date instead (§1.1). */
export function statusLabel(
  profile: Pick<VaccineProfile, 'statusLabels'>,
  status: DoseDisplayStatus,
  plannedOn: string | null,
  fmtDate: (d: IsoDate) => string,
): string {
  if (status === 'PLANNED')
    return plannedOn === null ? 'Planned' : VACCINE_COPY.plannedChip(fmtDate(plannedOn));
  return profile.statusLabels[status];
}

/**
 * §1.2, verbatim. Whole-word for the short entries, so "late" never matches "later" or
 * "relate", and "safe" never matches "unsafe" twice; substring for the phrases.
 */
export const VACCINE_BANNED: readonly string[] = [
  'behind',
  'overdue',
  'late',
  'too late',
  'missed',
  'missed dose',
  'catch-up',
  'catch up',
  'at risk',
  'unprotected',
  'not protected',
  'protected',
  'immunity',
  'fully vaccinated',
  'up to date',
  'up-to-date',
  'incomplete',
  'non-compliant',
  'delayed',
  'should have',
  'you should',
  'you need to',
  'we recommend',
  'recommended for',
  'suggested dose',
  'next dose should',
  'correct dose',
  'dose of',
  'ml per',
  'brand',
  'manufacturer',
  'which product',
  'ask us',
  'our advice',
  'safe',
  'unsafe',
];

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The banned entries a sentence contains. Case-insensitive; `mL` after a number counts too. */
export function bannedHits(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = VACCINE_BANNED.filter(w => new RegExp(`\\b${escapeRe(w)}\\b`, 'i').test(lower));
  if (/\d\s*ml\b/i.test(text)) hits.push('mL');
  return hits;
}

/** §1.2's second rule: the word appears only in a sentence that defers to them. */
export function defersToPediatrician(text: string): boolean {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.every(s => {
    if (!/pediatrician/i.test(s)) return true;
    return /(pediatrician['’]s plan|takes priority|check the plan with your pediatrician|conversation for your pediatrician|your pediatrician gave|your pediatrician set|what your pediatrician gave)/i.test(
      s,
    );
  });
}
