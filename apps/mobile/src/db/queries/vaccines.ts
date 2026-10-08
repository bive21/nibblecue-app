/**
 * The reads behind the Immunisations screen and its sheets (docs/VACCINES.md §5–§6): the
 * household's live records, the one live row a scheduled dose has, the tracking toggles and
 * the providers a parent typed before. Nothing here derives a status — the model does that
 * against the published profile — and nothing here interprets a date.
 */
import type { VaccineRecordStatus } from '@nibblecue/core';
import type { Db, Tx } from '../driver';

export interface VaccineRecordRow {
  id: string;
  child_id: string;
  guidance_profile: string | null;
  guidance_version: string | null;
  dose_id: string | null;
  custom_name: string | null;
  status: VaccineRecordStatus;
  /** `yyyy-mm-dd`: the date given, or the planned date; null for a skip or a decline. */
  occurred_on: string | null;
  provider: string | null;
  site: string | null;
  lot: string | null;
  decline_reason: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const COLUMNS = `id, child_id, guidance_profile, guidance_version, dose_id, custom_name, status,
  occurred_on, provider, site, lot, decline_reason, notes, created_by, created_at, updated_at,
  deleted_at`;

/** Every live record of the household, newest date first. */
export async function vaccineRecords(
  db: Db | Tx,
  householdId: string,
): Promise<VaccineRecordRow[]> {
  return db.all<VaccineRecordRow>(
    `select ${COLUMNS} from vaccine_records
      where household_id = ? and deleted_at is null
      order by occurred_on desc, created_at desc, id asc`,
    [householdId],
  );
}

/** One row by id, deleted or not — Undo needs to find what it put away. */
export async function vaccineRecordById(
  db: Db | Tx,
  recordId: string,
): Promise<VaccineRecordRow | undefined> {
  return db.get<VaccineRecordRow>(`select ${COLUMNS} from vaccine_records where id = ?`, [
    recordId,
  ]);
}

/**
 * The live row holding a scheduled dose's slot (§8: one per `(child_id, dose_id)`). A write
 * for the dose patches this row rather than minting a second one the server would merge.
 */
export async function liveRecordForDose(
  db: Db | Tx,
  childId: string,
  doseId: string,
): Promise<VaccineRecordRow | undefined> {
  return db.get<VaccineRecordRow>(
    `select ${COLUMNS} from vaccine_records
      where child_id = ? and dose_id = ? and deleted_at is null
      order by updated_at desc limit 1`,
    [childId, doseId],
  );
}

export interface TrackingRow {
  child_id: string;
  dose_id: string;
  enabled: number;
}

/** The household's tracking toggles; a missing row is off (§6: default OFF). */
export async function trackingRows(db: Db | Tx, householdId: string): Promise<TrackingRow[]> {
  return db.all<TrackingRow>(
    'select child_id, dose_id, enabled from vaccine_tracking_settings where household_id = ?',
    [householdId],
  );
}

/** The providers this household typed before, most recent first — remembered, never suggested from elsewhere (§6). */
export async function recentProviders(
  db: Db | Tx,
  householdId: string,
  limit = 6,
): Promise<string[]> {
  const rows = await db.all<{ provider: string }>(
    `select provider, max(updated_at) as last from vaccine_records
      where household_id = ? and deleted_at is null and provider is not null and trim(provider) <> ''
      group by provider order by last desc limit ?`,
    [householdId, limit],
  );
  return rows.map(r => r.provider);
}
