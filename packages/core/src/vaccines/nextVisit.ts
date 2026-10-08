/**
 * The next visit (docs/VACCINES.md §5.1, the profile's `statusRules.nextVisit`): every tracked
 * dose that is not GIVEN, SKIPPED or DECLINED, grouped by visit. A visit whose doses are all
 * given, skipped or declined is dropped. The next is the one with the earliest window start.
 *
 * A PLANNED dose is an appointment, not a dose given (the owner, 2026-10-04). A visit planned
 * in full stays next, and the earliest planned date is carried on `plannedOn` for the card.
 * That date does not reorder visits: `from` stays the published window start, so the 6 month
 * visit planned for November stays ahead of the 12 month visit. The seasonal "visit" is never
 * next: its doses repeat and would hold the card for ever.
 */
import { compareIsoDates, type IsoDate } from './date';
import {
  isRepeating,
  type DoseDisplayStatus,
  type VaccineDose,
  type VaccineProfile,
} from './profile';
import { isOpen, type RecordLike } from './status';
import type { DoseWindow } from './window';

export interface DoseView {
  dose: VaccineDose;
  status: DoseDisplayStatus;
  window: DoseWindow;
  record: RecordLike | null;
}

export interface NextVisit {
  key: string;
  label: string;
  /** The earliest published window start among the doses that keep the visit next. A planned date does not move this. */
  from: IsoDate;
  /**
   * Doses still ahead, in the profile's order: the ones with no record, or the planned ones
   * when those are all that remain. The card names these.
   */
  doses: DoseView[];
  /** Every tracked dose of the visit in the published schedule — `5 doses`, whatever is recorded. */
  total: number;
  /** The earliest planned date among the visit's PLANNED doses, when a parent set one. */
  plannedOn: IsoDate | null;
  /** True when a dose of the visit is DUE or PAST_WINDOW today. */
  open: boolean;
}

/**
 * Every visit that is not finished, earliest window first. The reminder planner wants all
 * of them (a visit the parent has not logged must not hide the one after it); the screens
 * want the first. Finished means every tracked dose is GIVEN, SKIPPED or DECLINED.
 */
export function openVisits(profile: VaccineProfile, views: readonly DoseView[]): NextVisit[] {
  const byVisit = new Map<string, DoseView[]>();
  for (const v of views) {
    if (isRepeating(v.dose)) continue;
    const list = byVisit.get(v.dose.visit) ?? [];
    list.push(v);
    byVisit.set(v.dose.visit, list);
  }
  const out: NextVisit[] = [];
  for (const [key, list] of byVisit) {
    const open = list.filter(v => isOpen(v.status));
    const plannedDoses = list.filter(v => v.status === 'PLANNED');
    // A plan is not a dose given. Dropping a visit here, once every remaining dose was
    // PLANNED, is what skipped the 6 month visit and showed the 12 month one instead
    // (the owner, 2026-10-04). GIVEN, SKIPPED and DECLINED are what finish a visit.
    if (open.length === 0 && plannedDoses.length === 0) continue;
    // Names on the card are the doses with no record. When the only ones left are planned,
    // those are the names: an empty list would read as 0 doses on a visit that is still next.
    const shown = open.length > 0 ? open : plannedDoses;
    const from = shown.map(v => v.window.from).sort(compareIsoDates)[0] ?? '';
    const plannedOn = plannedDoses
      .filter(v => v.record?.occurred_on)
      .map(v => v.record?.occurred_on ?? '')
      .sort(compareIsoDates)[0];
    out.push({
      key,
      label: profile.visits.find(x => x.key === key)?.label ?? key,
      from,
      doses: shown,
      total: list.filter(v => v.status !== 'NOT_APPLICABLE').length,
      plannedOn: plannedOn ?? null,
      open: open.some(v => v.status === 'DUE' || v.status === 'PAST_WINDOW'),
    });
  }
  return out.sort((a, b) => compareIsoDates(a.from, b.from) || a.key.localeCompare(b.key));
}

export function nextVisit(profile: VaccineProfile, views: readonly DoseView[]): NextVisit | null {
  return openVisits(profile, views)[0] ?? null;
}

/** `6 of 9`: records among the child's routine doses — a count, never a percentage. */
export function recordedCount(views: readonly DoseView[]): { recorded: number; total: number } {
  const routine = views.filter(v => v.dose.type === 'routine');
  return {
    recorded: routine.filter(v => v.status === 'GIVEN').length,
    total: routine.length,
  };
}

/** Views grouped by visit in the profile's order, for the "By visit" list. */
export function byVisit(
  profile: VaccineProfile,
  views: readonly DoseView[],
): { key: string; label: string; doses: DoseView[] }[] {
  return profile.visits
    .map(v => ({ key: v.key, label: v.label, doses: views.filter(x => x.dose.visit === v.key) }))
    .filter(g => g.doses.length > 0);
}
