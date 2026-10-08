/**
 * Immunisation records — the writes (docs/VACCINES.md §6, §8; migration 0015).
 *
 * The app RECORDS what a parent enters against a published schedule; it never computes a
 * dose, names a product or judges a date. Every write here is a plain row and a plain op:
 *
 *   * `recordDose` — mark given / plan a date / skip / decline ONE scheduled dose. It is an
 *     UPSERT on `(child_id, dose_id)` (§8): the live row for the dose is patched when there
 *     is one, else a row is minted, stamped with the profile and version it was entered
 *     against. A repeating dose (`flu_annual`, `covid_season`) is written as a parent-added
 *     row named by its season, because the unique index would otherwise allow one flu
 *     record per child for ever (§6).
 *   * `addCustomRecord` — a vaccine the schedule does not list: `dose_id` null, the name the
 *     parent typed, no profile stamp (the `vaccine_identity` check).
 *   * `removeRecord` — `deleted_at`; a hard delete is revoked on the server (§7). The dose
 *     falls back to its published status.
 *   * `setDoseTracking` — an optional or seasonal series turned on or off for one child; a
 *     settings upsert, never a deleted record (§6).
 *   * `undoVaccineWrite` — the toast's UNDO for each of the above, as an explicit inverse
 *     write (a removal, the previous fields put back, an undelete, the previous toggle) so
 *     a merge on the server is explained rather than hidden.
 *
 * Who may write is the sheet's decision to render (OWNER/PARENT, `useCanAdmin`) and the
 * server's to enforce (`app.can_admin`); this module writes what it is asked to.
 */
import {
  doseById,
  isRepeating,
  needsOptIn,
  VACCINE_COPY,
  vaccineOf,
  vaccineRecordCreateChain,
  vaccineRecordDeleteChain,
  vaccineRecordUpdateChain,
  vaccineTrackingChain,
  type Clock,
  type IsoDate,
  type VaccineRecordPatch,
  type VaccineRecordStatus,
} from '@nibblecue/core';
import type { Db } from '../db/driver';
import {
  liveRecordForDose,
  vaccineRecordById,
  type VaccineRecordRow,
} from '../db/queries/vaccines';
import type { WriteContext } from './activities';
import { newEntityId, newIntentId } from './ids';
import { commitWrite, type RepositoryDeps, type WriteOutcome } from './repository';
import { keys } from './store';
import { vaccineProfileFor } from './vaccineGuidance';

export const CUSTOM_NAME_MAX = 80;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class VaccineRecordError extends Error {}

/** What the toast's UNDO does, as data the toast holds. */
export type VaccineUndo =
  | { kind: 'remove'; recordId: string }
  | { kind: 'restore'; recordId: string; patch: VaccineRecordPatch }
  | { kind: 'undelete'; recordId: string }
  | { kind: 'tracking'; childId: string; doseId: string; enabled: boolean };

export interface VaccineWriteResult extends WriteOutcome {
  recordId: string;
  undo: VaccineUndo;
  /** True when a live row already held the dose and was patched rather than minted. */
  merged: boolean;
}

/** The fields every record sheet may set; text is stored verbatim and trimmed, empty is null. */
export interface RecordDetails {
  provider?: string | null;
  site?: string | null;
  lot?: string | null;
  /** Free text, never parsed, classified, scored or suggested (§6). */
  declineReason?: string | null;
  notes?: string | null;
}

export interface RecordDoseInput extends WriteContext, RecordDetails {
  childId: string;
  doseId: string;
  status: VaccineRecordStatus;
  /** The date given or planned; ignored (stored null) for a skip or a decline. */
  occurredOn: IsoDate | null;
  intentId?: string;
}

const text = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t.length === 0 ? null : t;
};

const invalidatesFor = (householdId: string): string[] => [
  keys.vaccines(householdId),
  keys.nextEvent(null),
  keys.household(householdId),
];

/** What one sheet writes for a dose: the status and the columns it carries. */
export interface RecordFields {
  status: VaccineRecordStatus;
  occurred_on: IsoDate | null;
  provider: string | null;
  site: string | null;
  lot: string | null;
  decline_reason: string | null;
  notes: string | null;
}

/** The columns a status carries (§6): a skip or a decline has no date, a given dose no reason. */
export function fieldsFor(
  status: VaccineRecordStatus,
  occurredOn: IsoDate | null,
  details: RecordDetails,
): RecordFields {
  const dated = status === 'GIVEN' || status === 'PLANNED';
  if (dated && (occurredOn === null || !ISO_DATE.test(occurredOn))) {
    throw new VaccineRecordError(
      status === 'GIVEN' ? 'A given dose has a date.' : 'A planned dose has a date.',
    );
  }
  return {
    status,
    occurred_on: dated ? occurredOn : null,
    provider: text(details.provider),
    site: text(details.site),
    lot: text(details.lot),
    decline_reason: status === 'DECLINED' ? text(details.declineReason) : null,
    notes: text(details.notes),
  };
}

const previousOf = (row: VaccineRecordRow): VaccineRecordPatch => ({
  status: row.status,
  occurred_on: row.occurred_on,
  provider: row.provider,
  site: row.site,
  lot: row.lot,
  decline_reason: row.decline_reason,
  notes: row.notes,
});

const baseOf = (intentId: string, input: WriteContext, at: string) => ({
  intentId,
  householdId: input.householdId,
  createdBy: input.createdBy,
  deviceId: input.deviceId,
  clientEditedAt: at,
});

export async function recordDose(
  db: Db,
  clock: Clock,
  input: RecordDoseInput,
  deps: RepositoryDeps = {},
): Promise<VaccineWriteResult> {
  const profile = await vaccineProfileFor(db, input.householdId);
  if (profile === null) {
    throw new VaccineRecordError('No published schedule is on this device yet.');
  }
  const dose = doseById(profile, input.doseId);
  if (dose === undefined) {
    throw new VaccineRecordError(
      `No dose ${input.doseId} in ${profile.profile} ${profile.version}.`,
    );
  }
  const fields = fieldsFor(input.status, input.occurredOn, input);
  const at = clock.iso();
  const intentId = input.intentId ?? newIntentId();
  const base = baseOf(intentId, input, at);

  if (isRepeating(dose)) {
    // §6, §8: one row per season, as a parent-added record the unique index does not cover
    const season = Number((fields.occurred_on ?? at).slice(0, 4));
    const recordId = newEntityId();
    const chain = vaccineRecordCreateChain({
      ...base,
      recordId,
      record: {
        child_id: input.childId,
        guidance_profile: null,
        guidance_version: null,
        dose_id: null,
        custom_name: VACCINE_COPY.seasonRecord(vaccineOf(profile, dose.vaccine).name, season),
        ...fields,
      },
    });
    const outcome = await commitWrite(
      db,
      clock,
      { intentId, chain, source: input.source, invalidates: invalidatesFor(input.householdId) },
      deps,
    );
    return { ...outcome, recordId, undo: { kind: 'remove', recordId }, merged: false };
  }

  const existing = await liveRecordForDose(db, input.childId, input.doseId);
  if (existing !== undefined) {
    const chain = vaccineRecordUpdateChain({ ...base, recordId: existing.id, patch: fields });
    const outcome = await commitWrite(
      db,
      clock,
      { intentId, chain, source: input.source, invalidates: invalidatesFor(input.householdId) },
      deps,
    );
    return {
      ...outcome,
      recordId: existing.id,
      undo: { kind: 'restore', recordId: existing.id, patch: previousOf(existing) },
      merged: true,
    };
  }

  const recordId = newEntityId();
  const chain = vaccineRecordCreateChain({
    ...base,
    recordId,
    record: {
      child_id: input.childId,
      guidance_profile: profile.profile,
      guidance_version: profile.version,
      dose_id: dose.id,
      custom_name: null,
      ...fields,
    },
  });
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: invalidatesFor(input.householdId) },
    deps,
  );
  return { ...outcome, recordId, undo: { kind: 'remove', recordId }, merged: false };
}

export interface AddCustomRecordInput extends WriteContext, RecordDetails {
  childId: string;
  customName: string;
  status: VaccineRecordStatus;
  occurredOn: IsoDate | null;
  intentId?: string;
}

/** A vaccine the published schedule does not list — the parent's name for it, verbatim (§6). */
export async function addCustomRecord(
  db: Db,
  clock: Clock,
  input: AddCustomRecordInput,
  deps: RepositoryDeps = {},
): Promise<VaccineWriteResult> {
  const name = (input.customName ?? '').trim().replace(/\s+/g, ' ');
  if (name.length === 0 || name.length > CUSTOM_NAME_MAX) {
    throw new VaccineRecordError(
      name.length === 0
        ? 'Give the vaccine a name.'
        : `A name is at most ${CUSTOM_NAME_MAX} characters.`,
    );
  }
  const fields = fieldsFor(input.status, input.occurredOn, input);
  const at = clock.iso();
  const intentId = input.intentId ?? newIntentId();
  const recordId = newEntityId();
  const chain = vaccineRecordCreateChain({
    ...baseOf(intentId, input, at),
    recordId,
    record: {
      child_id: input.childId,
      guidance_profile: null,
      guidance_version: null,
      dose_id: null,
      custom_name: name,
      ...fields,
    },
  });
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: invalidatesFor(input.householdId) },
    deps,
  );
  return { ...outcome, recordId, undo: { kind: 'remove', recordId }, merged: false };
}

export interface EditRecordInput extends WriteContext, RecordDetails {
  recordId: string;
  status: VaccineRecordStatus;
  occurredOn: IsoDate | null;
  /** A parent-added vaccine's name; ignored for a scheduled dose. */
  customName?: string;
  intentId?: string;
}

/** An existing row — a parent-added vaccine, usually — with new fields; Undo puts the old ones back. */
export async function editRecord(
  db: Db,
  clock: Clock,
  input: EditRecordInput,
  deps: RepositoryDeps = {},
): Promise<VaccineWriteResult> {
  const row = await vaccineRecordById(db, input.recordId);
  if (row === undefined || row.deleted_at !== null) {
    throw new VaccineRecordError('This record is no longer here.');
  }
  const fields = fieldsFor(input.status, input.occurredOn, input);
  const patch: VaccineRecordPatch = { ...fields };
  if (row.dose_id === null && input.customName !== undefined) {
    const name = input.customName.trim().replace(/\s+/g, ' ');
    if (name.length === 0 || name.length > CUSTOM_NAME_MAX) {
      throw new VaccineRecordError(
        name.length === 0
          ? 'Give the vaccine a name.'
          : `A name is at most ${CUSTOM_NAME_MAX} characters.`,
      );
    }
    patch.custom_name = name;
  }
  const at = clock.iso();
  const intentId = input.intentId ?? newIntentId();
  const chain = vaccineRecordUpdateChain({
    ...baseOf(intentId, input, at),
    recordId: row.id,
    patch,
  });
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: invalidatesFor(input.householdId) },
    deps,
  );
  return {
    ...outcome,
    recordId: row.id,
    undo: {
      kind: 'restore',
      recordId: row.id,
      patch: {
        ...previousOf(row),
        ...(row.dose_id === null ? { custom_name: row.custom_name } : {}),
      },
    },
    merged: true,
  };
}

export interface RemoveRecordInput extends WriteContext {
  recordId: string;
  intentId?: string;
}

/** "Remove this record": `deleted_at`, never a deleted row; the slot is free again (§6, §8). */
export async function removeRecord(
  db: Db,
  clock: Clock,
  input: RemoveRecordInput,
  deps: RepositoryDeps = {},
): Promise<VaccineWriteResult> {
  const row = await vaccineRecordById(db, input.recordId);
  if (row === undefined || row.deleted_at !== null) {
    throw new VaccineRecordError('This record is no longer here.');
  }
  const at = clock.iso();
  const intentId = input.intentId ?? newIntentId();
  const chain = vaccineRecordDeleteChain({ ...baseOf(intentId, input, at), recordId: row.id });
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: invalidatesFor(input.householdId) },
    deps,
  );
  return {
    ...outcome,
    recordId: row.id,
    undo: { kind: 'undelete', recordId: row.id },
    merged: false,
  };
}

export interface SetTrackingInput extends WriteContext {
  childId: string;
  doseId: string;
  enabled: boolean;
  intentId?: string;
}

export interface TrackingWriteResult extends WriteOutcome {
  undo: VaccineUndo;
}

/** A seasonal, optional or conditional series on or off for one child (§6). */
export async function setDoseTracking(
  db: Db,
  clock: Clock,
  input: SetTrackingInput,
  deps: RepositoryDeps = {},
): Promise<TrackingWriteResult> {
  const profile = await vaccineProfileFor(db, input.householdId);
  const dose = profile === null ? undefined : doseById(profile, input.doseId);
  if (dose === undefined) throw new VaccineRecordError(`No dose ${input.doseId} to track.`);
  if (!needsOptIn(dose)) {
    throw new VaccineRecordError('A routine dose is always in the schedule.');
  }
  const previous = await db.get<{ enabled: number }>(
    'select enabled from vaccine_tracking_settings where household_id = ? and child_id = ? and dose_id = ?',
    [input.householdId, input.childId, input.doseId],
  );
  const at = clock.iso();
  const intentId = input.intentId ?? newIntentId();
  const chain = vaccineTrackingChain({
    ...baseOf(intentId, input, at),
    childId: input.childId,
    doseId: input.doseId,
    enabled: input.enabled,
  });
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: invalidatesFor(input.householdId) },
    deps,
  );
  return {
    ...outcome,
    undo: {
      kind: 'tracking',
      childId: input.childId,
      doseId: input.doseId,
      enabled: previous?.enabled === 1,
    },
  };
}

/** The toast's UNDO: the explicit inverse of one write above. */
export async function undoVaccineWrite(
  db: Db,
  clock: Clock,
  ctx: WriteContext,
  undo: VaccineUndo,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const at = clock.iso();
  const intentId = newIntentId();
  const base = baseOf(intentId, ctx, at);
  const chain =
    undo.kind === 'remove'
      ? vaccineRecordDeleteChain({ ...base, recordId: undo.recordId })
      : undo.kind === 'restore'
        ? vaccineRecordUpdateChain({ ...base, recordId: undo.recordId, patch: undo.patch })
        : undo.kind === 'undelete'
          ? vaccineRecordUpdateChain({
              ...base,
              recordId: undo.recordId,
              patch: { deleted_at: null },
            })
          : vaccineTrackingChain({
              ...base,
              childId: undo.childId,
              doseId: undo.doseId,
              enabled: undo.enabled,
            });
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: ctx.source, invalidates: invalidatesFor(ctx.householdId) },
    deps,
  );
}
