/**
 * The visit reminders (docs/VACCINES.md §9): for every visit a child still has a dose ahead
 * in (no record yet, or planned and not given), one row per recipient per offset — 14 and 2
 * days before the visit's window opens (or the date the parent planned), at 09:00 in the
 * household's zone — and never one per dose. A visit planned in full stays in the set.
 * The rows go to `apply_vaccine_reminders`, which keys them by `vax:<child>:<visit>:<offset>`
 * so a second row for the same visit and offset is impossible, moves a pending row when the
 * date moved, and cancels the rows of a visit that is no longer here as satisfied.
 *
 * Pure: the worker hands it the snapshot and the clock. The payload names no vaccine, no
 * provider and no child (SECURITY §5) — the deep link carries the child's id, nothing more.
 */
import { zonedToUtc } from '../today/day';
import { addDays, compareIsoDates, isoDateIn, parseIsoDate, type IsoDate } from './date';
import { openVisits, type DoseView } from './nextVisit';
import { isRepeating, type VaccineProfile } from './profile';
import { doseStatus, type VaccineRecordStatus } from './status';
import { doseWindow } from './window';

/** §9: "fired at 09:00 in `households.home_time_zone`", a product setting, not guidance. */
export const VISIT_REMINDER_LOCAL_TIME = '09:00';

/**
 * The `notification_preferences.channel` a recipient's veto is read from (§9; the RPC), and
 * the `reminders.kind` of every visit row. The vaccine module's settings row writes THIS
 * channel, not the module id, so the switch on the phone and the veto on the server agree.
 */
export const VACCINE_VISIT_CHANNEL = 'vaccine_visit';

export interface VisitReminderChild {
  id: string;
  birth_date: IsoDate;
}

export interface VisitReminderRecord {
  child_id: string;
  dose_id: string | null;
  status: VaccineRecordStatus;
  occurred_on: IsoDate | null;
}

export interface VisitReminderInput {
  profile: VaccineProfile;
  timeZone: string;
  nowMs: number;
  children: readonly VisitReminderChild[];
  /** The household's live records; parent-added rows (no `dose_id`) are ignored here. */
  records: readonly VisitReminderRecord[];
  /** The enabled `vaccine_tracking_settings` rows. */
  tracking: readonly { child_id: string; dose_id: string }[];
  /** OWNER and PARENT members; the RPC applies each one's channel veto and quiet hours. */
  recipients: readonly string[];
  deepLinkFor: (childId: string) => string;
  localTime?: string;
}

export interface VisitReminderRow {
  user_id: string;
  child_id: string;
  visit_key: string;
  visit_label: string;
  dose_count: number;
  offset_days: number;
  /** ISO instant. */
  fire_at: string;
  deep_link: string;
}

/** A child's dose views against today, the same derivation the screens use. */
function childViews(
  profile: VaccineProfile,
  child: VisitReminderChild,
  records: readonly VisitReminderRecord[],
  tracked: ReadonlySet<string>,
  today: IsoDate,
): DoseView[] {
  return profile.doses.map(dose => {
    const window = doseWindow(child.birth_date, dose);
    const row = isRepeating(dose)
      ? undefined
      : records.find(r => r.child_id === child.id && r.dose_id === dose.id);
    const record = row === undefined ? null : { status: row.status, occurred_on: row.occurred_on };
    const isTracked = dose.type === 'routine' || tracked.has(dose.id);
    return {
      dose,
      window,
      record,
      status: doseStatus({ dose, record, window, today, tracked: isTracked }),
    };
  });
}

export function planVisitReminders(input: VisitReminderInput): VisitReminderRow[] {
  const localTime = input.localTime ?? VISIT_REMINDER_LOCAL_TIME;
  const [hh, mm] = localTime.split(':').map(Number);
  const today = isoDateIn(input.timeZone, input.nowMs);
  const out: VisitReminderRow[] = [];
  for (const child of input.children) {
    const tracked = new Set(
      input.tracking.filter(t => t.child_id === child.id).map(t => t.dose_id),
    );
    const views = childViews(input.profile, child, input.records, tracked, today);
    for (const visit of openVisits(input.profile, views)) {
      // A date the parent planned moves the reminder with it (§9: rescheduled, not duplicated),
      // but only while that date is still ahead. A planned date reads as the next appointment;
      // once it has passed it is a record of what the parent decided and no appointment at all,
      // and anchoring on it quietly suppressed every offset of a visit that still has open doses
      // — both fire times land before `nowMs` and are skipped below, so the visit lost its 14-
      // and 2-day rows altogether. Falling back to the published window start is what §9
      // describes for a visit with no planned date, which is what this one now effectively is.
      const anchor =
        visit.plannedOn !== null && compareIsoDates(visit.plannedOn, today) >= 0
          ? visit.plannedOn
          : visit.from;
      for (const offset of input.profile.reminders.offsetsDays) {
        const day = parseIsoDate(addDays(anchor, -offset));
        const fireMs = zonedToUtc(input.timeZone, day.y, day.m, day.d, hh ?? 9, mm ?? 0);
        // a reminder whose moment has passed is not sent late: the visit is on the screen
        if (fireMs <= input.nowMs) continue;
        for (const userId of input.recipients) {
          out.push({
            user_id: userId,
            child_id: child.id,
            visit_key: visit.key,
            visit_label: visit.label,
            dose_count: visit.doses.length,
            offset_days: offset,
            fire_at: new Date(fireMs).toISOString(),
            deep_link: input.deepLinkFor(child.id),
          });
        }
      }
    }
  }
  return out;
}

/** The profile's own link template with its two holes filled: the scheme and the child. */
export function visitDeepLink(template: string, urlScheme: string, childId: string): string {
  return template.replace('{{URL_SCHEME}}', urlScheme).replace('{{childId}}', childId);
}
