/**
 * Which immunisation schedule a household reads (docs/VACCINES.md §2.2; CLAUDE.md §2 rule 5).
 *
 * The household pins ONE guidance pair (`households.guidance_profile` / `guidance_version`);
 * the immunisation profile for that region and version is resolved through the same mapping
 * `app.vaccine_profile(h)` applies in SQL. The schedule comes from that file and nowhere else:
 * the bundled copy in `packages/core` when the pinned version ships with this build, else the
 * mirrored `vaccine_guidance_profiles` row the pull brought down, else NOTHING — a pin this
 * device has never seen gets no windows rather than guessed ones. `data/guidance.ts` does the
 * same for milk.
 */
import {
  profileFromRow,
  resolveVaccineProfile,
  vaccineProfileIdFor,
  type VaccineProfile,
  type VaccineProfileRow,
} from '@nibblecue/core';
import type { Db, Tx } from '../db/driver';
import { DEFAULT_GUIDANCE } from './guidance';

export interface GuidancePin {
  guidance_profile: string;
  guidance_version: string;
}

/** The household's pin, or the server's own defaults for a row pulled before the pin was. */
export async function guidancePin(db: Db | Tx, householdId: string): Promise<GuidancePin> {
  const pin = await db.get<{ guidance_profile: string | null; guidance_version: string | null }>(
    'select guidance_profile, guidance_version from households where id = ?',
    [householdId],
  );
  return {
    guidance_profile: pin?.guidance_profile ?? DEFAULT_GUIDANCE.profile,
    guidance_version: pin?.guidance_version ?? DEFAULT_GUIDANCE.version,
  };
}

export async function vaccineProfileFor(
  db: Db | Tx,
  householdId: string,
): Promise<VaccineProfile | null> {
  const pin = await guidancePin(db, householdId);
  const bundled = resolveVaccineProfile(pin, () => undefined);
  if (bundled !== null) return bundled;
  const profile = vaccineProfileIdFor(pin.guidance_profile);
  if (profile === null) return null;
  const row = await db.get<VaccineProfileRow>(
    `select profile, version, effective_date, source, source_url, disclaimer, coverage, vaccines, visits, doses
       from vaccine_guidance_profiles where profile = ? and version = ?`,
    [profile, pin.guidance_version],
  );
  return row === undefined ? null : profileFromRow(row);
}
