/**
 * Storage locations — the writes (docs/SCHEDULE_AND_LOCATIONS.md §3; docs/MILK_STASH.md §4;
 * migration 0013).
 *
 *   * `saveLocation` — create or edit. A rename is cosmetic by construction: every date is a
 *     function of `kind` and the container's own timestamps, so nothing is recomputed and no
 *     ledger row is written. A CONDITION change is the deliberate one (§3.4): the guards first
 *     (one THAWED per household; a THAWED location with milk in it keeps its condition), then
 *     one write that changes `kind`, gives every never-frozen container in a location that is
 *     now a freezer its `first_frozen_at = now` (the truth — that is when it started freezing;
 *     an existing freeze date is never touched), and one `ADJUST` with `delta_ml = 0` per held
 *     container so the append-only ledger records that the condition changed, by whom and
 *     when, without moving any volume. Dates recompute by themselves: nothing stores one.
 *   * `deleteLocation` — soft (`deleted_at`), refused while the location holds STORED or
 *     THAWING containers with the sentence the sheet shows, refused for the last plain
 *     location, and moving `is_default` to the next plain location in the same write.
 *     `restoreLocation` is its Undo.
 *   * `ensureLocationOfKind` — the ROOM ("Counter") and THAWED ("Thawing") locations the pump
 *     and container sheets need, created on demand. Only a parent or owner may (locations are
 *     `app.can_admin` writes); a caregiver gets what exists.
 *
 * Every refusal here is also a trigger or an index on the server, so a forged write meets the
 * same wall — the client refuses first because a queued op that the server would reject is a
 * FAILED row in the outbox and a location that quietly comes back on the next pull.
 */
import {
  DEFAULT_STORAGE_LOCATIONS,
  deriveOpId,
  locationCreateChain,
  locationUpdateChain,
  seededLocationId,
  type Chain,
  type ChainOp,
  type Clock,
  type LocalRow,
  type MilkStorageKind,
} from '@nibblecue/core';
import type { Db } from '../db/driver';
import { heldAt, locationById, locations } from '../db/queries/stash';
import type { WriteContext } from './activities';
import { newEntityId, newIntentId } from './ids';
import { commitWrite, type RepositoryDeps, type WriteOutcome } from './repository';
import { keys } from './store';

export const LOCATION_NAME_MIN = 2;
export const LOCATION_NAME_MAX = 40;
export const SHORT_NAME_MAX = 12;

/** The sentence §3.5 names, one form per count; 0013's trigger raises the same words. */
export const heldRefusal = (held: number): string =>
  held === 1
    ? 'This location still holds 1 container. Move it somewhere else first.'
    : `This location still holds ${held} containers. Move them somewhere else first.`;

export class LocationNameError extends Error {}
export class ThawedExistsError extends Error {
  constructor() {
    super('You already have a thawing location.');
  }
}
export class LocationHeldError extends Error {
  constructor(public readonly held: number) {
    super(heldRefusal(held));
  }
}
export class LastLocationError extends Error {
  constructor() {
    super('A household keeps at least one storage location besides thawing.');
  }
}
export class ThawedHeldError extends Error {
  constructor() {
    super(
      'This thawing location still holds milk. Move the containers before changing its condition.',
    );
  }
}

/** The list's default short name: the first word, cut to the column (§3.1). */
export const shortNameOf = (name: string): string =>
  (name.trim().split(/\s+/)[0] ?? '').slice(0, SHORT_NAME_MAX);

/** 2–40 characters, unique per household, case-insensitive (§3.1). */
export function validateName(name: string, others: readonly { name: string }[]): string {
  const trimmed = name.trim();
  if (trimmed.length < LOCATION_NAME_MIN || trimmed.length > LOCATION_NAME_MAX) {
    throw new LocationNameError(
      trimmed.length === 0
        ? 'Give the location a name.'
        : `A name is ${LOCATION_NAME_MIN} to ${LOCATION_NAME_MAX} characters.`,
    );
  }
  if (others.some(o => o.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new LocationNameError('A location with this name already exists.');
  }
  return trimmed;
}

export interface SaveLocationInput extends WriteContext {
  /** Absent for a new location; the id for an edit. */
  locationId?: string;
  /**
   * A NEW location's id, when it must be a particular one — the seeded defaults, whose ids every
   * writer derives from the household (`seededLocationId`), so the phone's copy and the server's
   * are one row. Absent: a fresh id, as for any location a parent names.
   */
  newLocationId?: string;
  name: string;
  /** Absent or empty: the first word of the name. */
  shortName?: string | null;
  kind: MilkStorageKind;
  isDefault?: boolean;
  intentId?: string;
}

export interface SaveLocationResult extends WriteOutcome {
  locationId: string;
  kindChanged: boolean;
  /** Containers whose dates now follow the new condition (§3.4's toast counts them). */
  recalculated: number;
  /** Of those, the never-frozen ones that got today's freeze date. */
  frozeNow: number;
}

const FROZEN: readonly MilkStorageKind[] = ['FREEZER', 'DEEP_FREEZER'];

interface HeldRow {
  id: string;
  first_frozen_at: string | null;
}

export async function saveLocation(
  db: Db,
  clock: Clock,
  input: SaveLocationInput,
  deps: RepositoryDeps = {},
): Promise<SaveLocationResult> {
  const intentId = input.intentId ?? newIntentId();
  const clientEditedAt = clock.iso();
  const base = {
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt,
  };
  const live = await locations(db, input.householdId);
  const existing =
    input.locationId === undefined ? undefined : await locationById(db, input.locationId);
  if (input.locationId !== undefined && (existing === undefined || existing.deleted_at !== null)) {
    throw new RangeError(`no location ${input.locationId}`);
  }
  const name = validateName(
    input.name,
    live.filter(l => l.id !== existing?.id),
  );
  const shortName = (input.shortName ?? '').trim().slice(0, SHORT_NAME_MAX) || shortNameOf(name);
  const anotherThawed = live.some(l => l.kind === 'THAWED' && l.id !== existing?.id);
  if (input.kind === 'THAWED' && anotherThawed) throw new ThawedExistsError();
  const invalidates = [keys.locations(input.householdId), keys.stash(input.householdId)];
  const rows: LocalRow[] = [];
  const ops: ChainOp[] = [];
  const previousDefault = live.find(l => l.is_default && l.id !== existing?.id) ?? null;

  if (existing === undefined) {
    const locationId = input.newLocationId ?? newEntityId();
    const isDefault = input.isDefault ?? (input.kind !== 'THAWED' && previousDefault === null);
    const created = locationCreateChain({
      ...base,
      locationId,
      location: {
        name,
        shortName,
        kind: input.kind,
        sortOrder: live.reduce((max, l) => Math.max(max, l.sort_order + 1), 0),
        isDefault,
      },
    });
    rows.push(...created.rows);
    ops.push(...created.ops);
    if (isDefault && previousDefault !== null) {
      const undefault = locationUpdateChain({
        ...base,
        locationId: previousDefault.id,
        patch: { is_default: false },
        tag: 'undefault',
      });
      rows.push(...undefault.rows);
      ops.push(...undefault.ops);
    }
    const outcome = await commitWrite(
      db,
      clock,
      { intentId, chain: { rows, ops }, source: input.source, invalidates },
      deps,
    );
    return { ...outcome, locationId, kindChanged: false, recalculated: 0, frozeNow: 0 };
  }

  // an edit
  const kindChanged = existing.kind !== input.kind;
  const held = kindChanged
    ? await db.all<HeldRow>(
        `select id, first_frozen_at from milk_containers
          where location_id = ? and status in ('STORED', 'THAWING') order by id`,
        [existing.id],
      )
    : [];
  if (kindChanged && existing.kind === 'THAWED' && held.length > 0) throw new ThawedHeldError();
  const patch: Record<string, unknown> = {};
  if (name !== existing.name) patch['name'] = name;
  if (shortName !== (existing.short_name ?? '')) patch['short_name'] = shortName;
  if (kindChanged) patch['kind'] = input.kind;
  const wantsDefault = input.isDefault === true && !existing.is_default;
  if (wantsDefault) patch['is_default'] = true;
  if (Object.keys(patch).length === 0) {
    return {
      committed: true,
      suppressed: false,
      intentId,
      locationId: existing.id,
      kindChanged: false,
      recalculated: 0,
      frozeNow: 0,
    } as SaveLocationResult;
  }
  const edited = locationUpdateChain({ ...base, locationId: existing.id, patch });
  rows.push(...edited.rows);
  ops.push(...edited.ops);
  if (wantsDefault && previousDefault !== null) {
    const undefault = locationUpdateChain({
      ...base,
      locationId: previousDefault.id,
      patch: { is_default: false },
      tag: 'undefault',
    });
    rows.push(...undefault.rows);
    ops.push(...undefault.ops);
  }
  let frozeNow = 0;
  if (kindChanged) {
    const nowFrozen = FROZEN.includes(input.kind);
    for (const c of held) {
      if (nowFrozen && c.first_frozen_at === null) {
        frozeNow += 1;
        rows.push({
          table: 'milk_containers',
          row: { id: c.id, first_frozen_at: clientEditedAt, updated_at: clientEditedAt },
        });
        ops.push({
          client_op_id: deriveOpId(intentId, `freeze:${c.id}`),
          entity: 'container',
          op: 'UPDATE',
          entity_id: c.id,
          household_id: input.householdId,
          payload: { first_frozen_at: clientEditedAt, client_edited_at: clientEditedAt },
          depends_on: intentId,
        });
      }
      // the audit row: the condition changed here, for this container, by this person
      const id = deriveOpId(intentId, `audit:${c.id}`);
      const fields = {
        container_id: c.id,
        kind: 'ADJUST',
        delta_ml: 0,
        from_location_id: existing.id,
        to_location_id: existing.id,
        activity_id: null,
        occurred_at: clientEditedAt,
        created_by: input.createdBy,
      };
      rows.push({
        table: 'milk_inventory_transactions',
        row: {
          id,
          client_op_id: id,
          household_id: input.householdId,
          ...fields,
          created_at: clientEditedAt,
        },
      });
      ops.push({
        client_op_id: id,
        entity: 'milk_txn',
        op: 'CREATE',
        entity_id: id,
        household_id: input.householdId,
        payload: { ...fields, client_edited_at: clientEditedAt },
        depends_on: intentId,
      });
      invalidates.push(keys.container(c.id));
    }
  }
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain: { rows, ops }, source: input.source, invalidates },
    deps,
  );
  return {
    ...outcome,
    locationId: existing.id,
    kindChanged,
    recalculated: kindChanged ? held.length : 0,
    frozeNow,
  };
}

export interface DeleteLocationInput extends WriteContext {
  locationId: string;
  intentId?: string;
}

export interface DeleteLocationResult extends WriteOutcome {
  /** The plain location that became the default because this one was, or null. */
  defaultMovedTo: string | null;
}

export async function deleteLocation(
  db: Db,
  clock: Clock,
  input: DeleteLocationInput,
  deps: RepositoryDeps = {},
): Promise<DeleteLocationResult> {
  const intentId = input.intentId ?? newIntentId();
  const clientEditedAt = clock.iso();
  const target = await locationById(db, input.locationId);
  if (target === undefined || target.deleted_at !== null) {
    throw new RangeError(`no location ${input.locationId}`);
  }
  const held = await heldAt(db, target.id);
  if (held > 0) throw new LocationHeldError(held);
  const live = await locations(db, input.householdId);
  const others = live.filter(l => l.id !== target.id && l.kind !== 'THAWED');
  if (target.kind !== 'THAWED' && others.length === 0) throw new LastLocationError();
  const base = {
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt,
  };
  const chain: Chain = locationUpdateChain({
    ...base,
    locationId: target.id,
    patch: { deleted_at: clientEditedAt, ...(target.is_default ? { is_default: false } : {}) },
  });
  let defaultMovedTo: string | null = null;
  if (target.is_default && others[0] !== undefined) {
    defaultMovedTo = others[0].id;
    const next = locationUpdateChain({
      ...base,
      locationId: defaultMovedTo,
      patch: { is_default: true },
      tag: 'default',
      dependsOn: intentId,
    });
    chain.rows.push(...next.rows);
    chain.ops.push(...next.ops);
  }
  const outcome = await commitWrite(
    db,
    clock,
    {
      intentId,
      chain,
      source: input.source,
      invalidates: [keys.locations(input.householdId), keys.stash(input.householdId)],
    },
    deps,
  );
  return { ...outcome, defaultMovedTo };
}

export interface RestoreLocationInput extends WriteContext {
  locationId: string;
  /** What `deleteLocation` reported, so the default goes back too. */
  defaultMovedTo: string | null;
  intentId?: string;
}

/** The Undo of `deleteLocation`: `deleted_at` cleared, the default put back (§3.5). */
export async function restoreLocation(
  db: Db,
  clock: Clock,
  input: RestoreLocationInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = input.intentId ?? newIntentId();
  const clientEditedAt = clock.iso();
  const base = {
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt,
  };
  const chain: Chain = locationUpdateChain({
    ...base,
    locationId: input.locationId,
    patch: { deleted_at: null, ...(input.defaultMovedTo !== null ? { is_default: true } : {}) },
  });
  if (input.defaultMovedTo !== null) {
    const back = locationUpdateChain({
      ...base,
      locationId: input.defaultMovedTo,
      patch: { is_default: false },
      tag: 'undefault',
      dependsOn: intentId,
    });
    chain.rows.push(...back.rows);
    chain.ops.push(...back.ops);
  }
  return commitWrite(
    db,
    clock,
    {
      intentId,
      chain,
      source: input.source,
      invalidates: [keys.locations(input.householdId), keys.stash(input.householdId)],
    },
    deps,
  );
}

export interface EnsureLocationInput extends WriteContext {
  kind: 'ROOM' | 'THAWED';
  /** Whether the viewer may create one (OWNER or PARENT). */
  canAdmin: boolean;
}

/**
 * THE FOUR PLACES A HOUSEHOLD ALREADY HAS, created with the household so the stash is usable
 * the first time it is opened (the owner, 2026-09-17: "the milk stash should have a preset
 * location options: Kitchen Freezer, Refrigerator, Counter (room temperature), and deep freeze.
 * they can always edit these, but they need to be available for selection by default").
 *
 * THEY ARE ORDINARY LOCATIONS, not a fixed list. Every one can be renamed, re-kinded or removed
 * exactly like one a parent typed — the only thing "default" buys is that they exist before
 * anybody has to think about it. An empty picker on the first pump is a dead end, and asking
 * someone to name their own fridge before they can record four ounces is a question with one
 * answer.
 *
 * The list is core's (`DEFAULT_STORAGE_LOCATIONS`), the one the server and the in-app server
 * write too, and the ids are core's `seededLocationId` — the same four ROWS on every writer, so
 * this phone writing them before its first pull is a "duplicate" to the server, never a second
 * fridge (the sync sweep of 2026-09-24: a household set up before its first pull had eight
 * locations, two of them the default). The fridge is the one marked `isDefault`: it is where
 * milk goes when nothing else is said.
 */
export const DEFAULT_LOCATIONS: readonly {
  kind: MilkStorageKind;
  name: string;
  short: string;
  isDefault: boolean;
}[] = DEFAULT_STORAGE_LOCATIONS.map(l => ({
  kind: l.kind,
  name: l.name,
  short: l.short_name,
  isDefault: l.is_default,
}));

/**
 * Create whichever of the four are missing. Idempotent by KIND, so a household that renamed its
 * freezer to "garage chest" does not get a second one — and a household that deliberately
 * deleted one does not get it back on the next call, because a deleted location is still a
 * location this returns early for only while it is live. (It is called once at setup and once
 * more if the stash is opened with nothing in it at all, which is the "started pumping later"
 * case; a household with any live location is left entirely alone.)
 */
export async function ensureDefaultLocations(
  db: Db,
  clock: Clock,
  input: WriteContext,
  deps: RepositoryDeps = {},
): Promise<number> {
  const live = await locations(db, input.householdId);
  if (live.length > 0) return 0;
  let made = 0;
  for (const spec of DEFAULT_LOCATIONS) {
    const saved = await saveLocation(
      db,
      clock,
      {
        householdId: input.householdId,
        createdBy: input.createdBy,
        deviceId: input.deviceId,
        source: input.source,
        newLocationId: seededLocationId(input.householdId, spec.kind),
        name: spec.name,
        shortName: spec.short,
        kind: spec.kind,
        isDefault: spec.isDefault,
      },
      deps,
    );
    if (saved.committed) made += 1;
  }
  return made;
}

/** The names the on-demand locations take (MILK_STASH.md §4, §6a). */
export const ON_DEMAND_NAME: Readonly<Record<'ROOM' | 'THAWED', { name: string; short: string }>> =
  {
    ROOM: { name: 'Counter', short: 'Counter' },
    THAWED: { name: 'Thawing (fridge)', short: 'Thawing' },
  };

/**
 * The live location of a kind, or a new one when the viewer may create it; null when neither.
 * A caregiver pouring a session cannot create the counter — that is a parent's write — and
 * the sheet then logs the fed part as a plain bottle and says so.
 */
export async function ensureLocationOfKind(
  db: Db,
  clock: Clock,
  input: EnsureLocationInput,
  deps: RepositoryDeps = {},
): Promise<string | null> {
  const live = await locations(db, input.householdId);
  const found = live.find(l => l.kind === input.kind);
  if (found !== undefined) return found.id;
  if (!input.canAdmin) return null;
  const named = ON_DEMAND_NAME[input.kind];
  const saved = await saveLocation(
    db,
    clock,
    {
      householdId: input.householdId,
      createdBy: input.createdBy,
      deviceId: input.deviceId,
      source: input.source,
      name: named.name,
      shortName: named.short,
      kind: input.kind,
      isDefault: false,
    },
    deps,
  );
  return saved.committed ? saved.locationId : null;
}
