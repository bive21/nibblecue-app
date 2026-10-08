/**
 * The immunisation section of an export (docs/VACCINES.md §10): one row per record — the
 * vaccine, the dose, the date given, the provider, the site, the lot, the status, the
 * published window — and the footer naming the profile. No summary line, no count of anything
 * missing, no percentage, no color, no interpretation: numbers and dates as entered.
 */
import type { IsoDate } from './date';
import { VACCINE_COPY, statusLabel, windowLine } from './copy';
import type { DoseView } from './nextVisit';
import { doseLongName, type VaccineProfile } from './profile';

export interface VaccineExportRow {
  vaccine: string;
  dose: string;
  dateGiven: string;
  provider: string;
  site: string;
  lot: string;
  status: string;
  window: string;
}

export interface CustomRecordLike {
  custom_name: string;
  status: 'GIVEN' | 'PLANNED' | 'SKIPPED' | 'DECLINED';
  occurred_on: IsoDate | null;
  provider: string | null;
  site: string | null;
  lot: string | null;
}

export interface ScheduledRecordLike {
  provider: string | null;
  site: string | null;
  lot: string | null;
}

export function exportRows(
  profile: VaccineProfile,
  views: readonly (DoseView & { fields: ScheduledRecordLike | null })[],
  custom: readonly CustomRecordLike[],
  fmtDate: (d: IsoDate) => string,
): { scheduled: VaccineExportRow[]; parentAdded: VaccineExportRow[] } {
  const scheduled = views
    .filter(v => v.status !== 'NOT_APPLICABLE')
    .map(v => ({
      vaccine: doseLongName(profile, v.dose).split(' · ')[0] ?? v.dose.vaccine,
      dose: v.dose.dose === null ? '' : String(v.dose.dose),
      dateGiven: v.status === 'GIVEN' && v.record?.occurred_on ? fmtDate(v.record.occurred_on) : '',
      provider: v.fields?.provider ?? '',
      site: v.fields?.site ?? '',
      lot: v.fields?.lot ?? '',
      status: statusLabel(profile, v.status, v.record?.occurred_on ?? null, fmtDate),
      window: windowLine(v.dose, v.window, fmtDate),
    }));
  const parentAdded = custom.map(c => ({
    vaccine: c.custom_name,
    dose: '',
    dateGiven: c.status === 'GIVEN' && c.occurred_on ? fmtDate(c.occurred_on) : '',
    provider: c.provider ?? '',
    site: c.site ?? '',
    lot: c.lot ?? '',
    status:
      c.status === 'PLANNED' && c.occurred_on
        ? VACCINE_COPY.plannedChip(fmtDate(c.occurred_on))
        : profile.statusLabels[c.status === 'PLANNED' ? 'UPCOMING' : c.status],
    window: VACCINE_COPY.parentAdded,
  }));
  return { scheduled, parentAdded };
}

export const exportFooter = (profile: VaccineProfile): string => VACCINE_COPY.footer(profile);
