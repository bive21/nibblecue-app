/**
 * The published routine schedule as the app reads it (docs/VACCINES.md §2): the bundled
 * profile, typed structurally so a row the pull brings down can be read the same way, and
 * validated at the boundary. No duration, month number, visit label or vaccine name exists
 * anywhere in application code — every one comes from a profile.
 */
import { z } from 'zod';
import { VACCINE_GUIDANCE } from '../guidance';

const VaccineDoseSchema = z.object({
  id: z.string().min(1),
  vaccine: z.string().min(1),
  dose: z.number().int().nullable(),
  visit: z.string().min(1),
  fromMonths: z.number().nonnegative(),
  toMonths: z.number().positive().nullable(),
  type: z.enum(['routine', 'conditional', 'seasonal', 'optional']),
  note: z.string().optional(),
  repeats: z.enum(['annual', 'season']).optional(),
  defaultOn: z.boolean().optional(),
});
export type VaccineDose = z.infer<typeof VaccineDoseSchema>;

const VaccineVisitSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  anchorMonths: z.number().nonnegative(),
});
export type VaccineVisit = z.infer<typeof VaccineVisitSchema>;

const VaccineInfoSchema = z.object({
  name: z.string().min(1),
  short: z.string().min(1),
  note: z.string().optional(),
});
export type VaccineInfo = z.infer<typeof VaccineInfoSchema>;

/** The statuses a chip can show; `PLANNED` carries its date and has no label in the file. */
export type DoseDisplayStatus =
  | 'GIVEN'
  | 'PLANNED'
  | 'DUE'
  | 'UPCOMING'
  | 'PAST_WINDOW'
  | 'SKIPPED'
  | 'DECLINED'
  | 'NOT_APPLICABLE';

const VaccineProfileSchema = z.object({
  profile: z.string().min(1),
  version: z.string().min(1),
  source: z.string().min(1),
  sourceUrl: z.string(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coverage: z.string(),
  disclaimer: z.string().min(1),
  rules: z.array(z.string()),
  statusLabels: z.object({
    GIVEN: z.string(),
    DUE: z.string(),
    UPCOMING: z.string(),
    PAST_WINDOW: z.string(),
    SKIPPED: z.string(),
    DECLINED: z.string(),
    NOT_APPLICABLE: z.string(),
  }),
  visits: z.array(VaccineVisitSchema),
  vaccines: z.record(z.string(), VaccineInfoSchema),
  doses: z.array(VaccineDoseSchema),
  statusRules: z.record(z.string(), z.string()),
  reminders: z.object({
    grouping: z.string(),
    offsetsDays: z.array(z.number().int().nonnegative()),
    copyTemplate: z.string(),
    deepLink: z.string(),
  }),
});
export type VaccineProfile = z.infer<typeof VaccineProfileSchema>;

/** The bundled profile, parsed once: the file is the contract, and a bad file fails at import. */
export const VACCINE_PROFILE: VaccineProfile = VaccineProfileSchema.parse(
  VACCINE_GUIDANCE.CDC_CHILD_US['2026_01'],
);

/**
 * The household pins ONE guidance pair (`households.guidance_profile` / `guidance_version`,
 * DATABASE.md §9); the immunisation profile for the same region and version is resolved from
 * it by one stable mapping — `app.vaccine_profile(h)` in SQL (0004), this table on the device
 * and in the worker. `vaccine-guidance.test.ts` holds the two to each other.
 */
export const VACCINE_PROFILE_FOR: Readonly<Record<string, string>> = { CDC_US: 'CDC_CHILD_US' };

export const vaccineProfileIdFor = (guidanceProfile: string | null | undefined): string | null =>
  guidanceProfile == null ? null : (VACCINE_PROFILE_FOR[guidanceProfile] ?? null);

/**
 * A SHORT NAME FOR A SMALL SPACE, for the one line Today has room for.
 *
 * The published source is `CDC Child and Adolescent Immunization Schedule, United States` — the
 * schedule's real name, which is what the Vaccines screen has to show and does, in full, with
 * its URL and its date (CLAUDE.md §2 rule 5). On a Today card it clipped to "CDC Child and
 * Adolescen…", which names nothing and reads as a bug (the owner, 2026-09-16). So the short
 * form is a LABEL PER KNOWN PROFILE, written here beside the id rather than derived by cutting
 * the published string — a truncation is not a name — and an unknown profile falls back to
 * whatever the file says, clipped or not, because inventing one would be worse.
 */
const SHORT_SOURCE: Readonly<Record<string, string>> = {
  CDC_CHILD_US: 'CDC Immunization Schedule (US)',
};

export const shortSourceOf = (profile: { profile: string; source: string }): string =>
  SHORT_SOURCE[profile.profile] ?? profile.source;

/** A `vaccine_guidance_profiles` row as the pull mirrors it or a snapshot serialises it: the
 *  JSON columns either parsed already or still text. */
export interface VaccineProfileRow {
  profile: string;
  version: string;
  effective_date: string;
  source: string;
  source_url: string | null;
  disclaimer: string;
  coverage: string | null;
  vaccines: unknown;
  visits: unknown;
  doses: unknown;
}

const jsonOf = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

/**
 * A pulled row in the file's shape, validated at the boundary. The row carries the schedule
 * — visits, vaccines, doses — and the columns the file adds around it (the rules, the status
 * labels, the reminder template) come from the bundled profile, as the milk mirror does. A
 * row that does not parse is null: no window is ever computed from half a schedule.
 */
export function profileFromRow(
  row: VaccineProfileRow,
  fallback: VaccineProfile = VACCINE_PROFILE,
): VaccineProfile | null {
  const parsed = VaccineProfileSchema.safeParse({
    ...fallback,
    profile: row.profile,
    version: row.version,
    source: row.source,
    sourceUrl: row.source_url ?? '',
    effectiveDate: row.effective_date,
    coverage: row.coverage ?? '',
    disclaimer: row.disclaimer,
    vaccines: jsonOf(row.vaccines),
    visits: jsonOf(row.visits),
    doses: jsonOf(row.doses),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The profile a household reads: the bundled copy when its pin names a version this build
 * ships, else the mirrored row the pull brought down, else nothing — a pin this device has
 * never seen gets no windows rather than guessed ones (CLAUDE.md §2 rule 5).
 */
export function resolveVaccineProfile(
  pin: { guidance_profile: string | null; guidance_version: string | null },
  mirrored: () => VaccineProfileRow | undefined,
): VaccineProfile | null {
  const profile = vaccineProfileIdFor(pin.guidance_profile);
  const version = pin.guidance_version;
  if (profile === null || version === null) return null;
  const bundled = (VACCINE_GUIDANCE as Record<string, Record<string, unknown> | undefined>)[
    profile
  ]?.[version];
  if (bundled !== undefined) {
    const parsed = VaccineProfileSchema.safeParse(bundled);
    if (parsed.success) return parsed.data;
  }
  const row = mirrored();
  return row === undefined ? null : profileFromRow(row);
}

export const doseById = (profile: VaccineProfile, id: string): VaccineDose | undefined =>
  profile.doses.find(d => d.id === id);

export const vaccineOf = (profile: VaccineProfile, code: string): VaccineInfo =>
  profile.vaccines[code] ?? { name: code, short: code };

/** `HepB · dose 2`, `Flu` — the short name and the dose number when there is one. */
export function doseShortName(profile: VaccineProfile, dose: VaccineDose): string {
  const v = vaccineOf(profile, dose.vaccine);
  return dose.dose === null ? v.short : `${v.short} ${dose.dose}`;
}

/** `Hepatitis B · dose 2` */
export function doseLongName(profile: VaccineProfile, dose: VaccineDose): string {
  const v = vaccineOf(profile, dose.vaccine);
  return dose.dose === null ? v.name : `${v.name} · dose ${dose.dose}`;
}

/** A dose that repeats every season is never "one record per dose" (§6, §8). */
export const isRepeating = (dose: VaccineDose): boolean => dose.repeats !== undefined;

/** Seasonal, optional and conditional doses are OFF until the household turns them on (§4). */
export const needsOptIn = (dose: VaccineDose): boolean => dose.type !== 'routine';
