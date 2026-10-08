/**
 * Chain builders: one user intent becomes the local rows to write and the ops to enqueue.
 *
 * WHAT A CHAIN IS. Every capture in the product is local-first: one SQLite transaction writes the
 * domain rows, appends the outbox rows and records the dedupe key, then the UI renders
 * optimistically. These functions are the pure half of that — they compute what to write; the
 * repository (`apps/mobile/src/data`) is the only thing that writes it.
 *
 * THE DETAIL ROW TRAVELS WITH ITS ACTIVITY (D5). `docs/OFFLINE_SYNC.md` §2.3 draws the stash
 * bottle as three ops, activity then `bottle_details` then `milk_txn`. It is two. The detail
 * tables have no `household_id` of their own, so their RLS resolves through the parent and a
 * detail op can only ever be applied after its activity; and a detail op that reached `FAILED`
 * while its activity was `SYNCED` would leave a bottle on the timeline with no amount. So the
 * detail is embedded in the activity op's `payload.detail` and upserted in the same branch.
 * `OutboxOp.entity` has no detail member, which is the shape of the same decision.
 *
 * IDS. One `intent_id` per intent. The activity op uses it unchanged, so the activity's own
 * `client_op_id` is the intent; every other op derives its key from it with `deriveOpId`, so a
 * process killed between the write and the flush rebuilds the identical ops from the row it
 * already stored. Nothing here reads a clock or a random source: given the same input these
 * functions return the same output forever, which is what makes a retry safe.
 *
 * WHAT `rows` MEANS. Domain shape, not storage shape: booleans are booleans and jsonb is an
 * object — `apps/mobile/src/db` maps to SQLite's integer/text columns. A CREATE chain's rows are
 * complete; an UPDATE chain's rows carry only the columns it writes, and the repository merges
 * them into the mirror. A chain never expresses a physical delete as a row: a `timer DELETE` op
 * is itself the instruction, because `running_timers` has no `deleted_at` and a stop is a real
 * delete.
 */
import type { ModuleVariant } from '../modules/variants';
import type { VaccineRecordStatus } from '../vaccines/status';
import type { ActivityType, VolumeUnit } from '../domain/domain-types';
import { deriveOpId, uuidv5 } from './ids';
import {
  DETAIL_TABLE_BY_ACTIVITY,
  type CanonicalUnit,
  type Chain,
  type ChainOp,
  type DetailTable,
  type LocalRow,
} from './types';

/** What every chain shares: who, where, and the client's own edit clock. */
export interface ChainBase {
  intentId: string;
  householdId: string;
  createdBy: string;
  deviceId: string | null;
  /** Travels as `payload.client_edited_at` and stamps the provisional local timestamps. The
   *  server clamps it and never lets the client write `updated_at` itself (D1). */
  clientEditedAt: string;
}

export interface DetailInput {
  table: DetailTable;
  fields: Record<string, unknown>;
}

export interface ActivityInput {
  id: string;
  childId: string | null;
  type: ActivityType;
  startAt: string;
  endAt?: string | null | undefined;
  quantity?: number | null | undefined;
  canonicalUnit?: CanonicalUnit | null | undefined;
  notes?: string | null | undefined;
  isPrivate?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
  detail?: DetailInput | null | undefined;
}

export interface ContainerInput {
  id: string;
  ownerId: string;
  locationId: string;
  containerType: 'BAG' | 'BOTTLE' | 'CONTAINER' | 'CUSTOM';
  initialMl: number;
  pumpedAt: string;
  firstFrozenAt?: string | null | undefined;
  labelCode?: string | null | undefined;
  notes?: string | null | undefined;
}

/* ---------- shared pieces ---------- */

/**
 * Five of the fourteen activity types have no detail table, and nine have exactly one. Getting
 * that wrong is a foreign-key error at flush time, hours after the parent tapped Save, so it is
 * refused here where the message can still name the intent.
 */
function requireDetailShape(activity: ActivityInput): void {
  const expected = DETAIL_TABLE_BY_ACTIVITY[activity.type];
  const given = activity.detail?.table ?? null;
  if (expected !== given) {
    throw new TypeError(
      `activity type '${activity.type}' needs detail table ${expected ?? 'none'}, got ${given ?? 'none'}`,
    );
  }
}

function activityPayload(base: ChainBase, a: ActivityInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    child_id: a.childId,
    type: a.type,
    start_at: a.startAt,
    end_at: a.endAt ?? null,
    quantity: a.quantity ?? null,
    canonical_unit: a.canonicalUnit ?? null,
    notes: a.notes ?? null,
    is_private: a.isPrivate ?? false,
    metadata: a.metadata ?? {},
    device_id: base.deviceId,
    client_edited_at: base.clientEditedAt,
  };
  if (a.detail) payload['detail'] = { table: a.detail.table, ...a.detail.fields };
  return payload;
}

function activityRows(base: ChainBase, a: ActivityInput): LocalRow[] {
  const rows: LocalRow[] = [
    {
      table: 'activities',
      row: {
        id: a.id,
        client_op_id: base.intentId,
        household_id: base.householdId,
        child_id: a.childId,
        type: a.type,
        start_at: a.startAt,
        end_at: a.endAt ?? null,
        quantity: a.quantity ?? null,
        canonical_unit: a.canonicalUnit ?? null,
        notes: a.notes ?? null,
        is_private: a.isPrivate ?? false,
        metadata: a.metadata ?? {},
        created_by: base.createdBy,
        updated_by: null,
        device_id: base.deviceId,
        created_at: base.clientEditedAt,
        updated_at: base.clientEditedAt,
        deleted_at: null,
      },
    },
  ];
  if (a.detail) {
    rows.push({ table: a.detail.table, row: { activity_id: a.id, ...a.detail.fields } });
  }
  return rows;
}

function activityOp(base: ChainBase, a: ActivityInput): ChainOp {
  return {
    client_op_id: base.intentId,
    entity: 'activity',
    op: 'CREATE',
    entity_id: a.id,
    household_id: base.householdId,
    payload: activityPayload(base, a),
    depends_on: null,
  };
}

function ledgerOp(
  base: ChainBase,
  args: {
    tag: string;
    kind: 'ADD' | 'MOVE' | 'SPLIT' | 'THAW' | 'USE' | 'DISCARD' | 'ADJUST';
    containerId: string;
    deltaMl: number;
    occurredAt: string;
    activityId?: string | null | undefined;
    fromLocationId?: string | null | undefined;
    toLocationId?: string | null | undefined;
    dependsOn: string | null;
  },
): { row: LocalRow; op: ChainOp } {
  const id = deriveOpId(base.intentId, args.tag);
  const fields = {
    container_id: args.containerId,
    kind: args.kind,
    delta_ml: args.deltaMl,
    from_location_id: args.fromLocationId ?? null,
    to_location_id: args.toLocationId ?? null,
    activity_id: args.activityId ?? null,
    occurred_at: args.occurredAt,
    created_by: base.createdBy,
  };
  return {
    // The ledger row's id IS its derived op id. Both are uuids and both are unique per intent, so
    // one derivation covers the primary key and the idempotency key, and a replay from a process
    // that stored nothing reconstructs the same row rather than a second one.
    row: {
      table: 'milk_inventory_transactions',
      row: {
        id,
        client_op_id: id,
        household_id: base.householdId,
        ...fields,
        // The server defaults `created_at`; the local mirror declares it `not null` with no
        // default, because a row written offline has to carry its own time. A CREATE chain's
        // rows are complete (see the header), and without this one they are not.
        created_at: base.clientEditedAt,
      },
    },
    op: {
      client_op_id: id,
      entity: 'milk_txn',
      op: 'CREATE',
      entity_id: id,
      household_id: base.householdId,
      payload: { ...fields, client_edited_at: base.clientEditedAt },
      depends_on: args.dependsOn,
    },
  };
}

/* ---------- the chains ---------- */

/** A diaper, a sleep, a note: one row, one detail row where the type has one, one op. */
export function simpleActivityChain(base: ChainBase, activity: ActivityInput): Chain {
  requireDetailShape(activity);
  return { rows: activityRows(base, activity), ops: [activityOp(base, activity)] };
}

export interface BottleFromStashInput extends ChainBase {
  activity: ActivityInput;
  containerId: string;
  /** Millilitres POURED from the container, positive. `docs/MILK_STASH.md` §7a: the stash is
   *  deducted by what left the bag, not by what the baby finished. */
  consumedMl: number;
  occurredAt?: string | undefined;
}

/**
 * A bottle taken from the stash: TWO ops, one intent, one undo.
 *
 * The activity and its deduction are one unit or neither happens (`docs/MILK_STASH.md` §7d). The
 * local transaction is what guarantees that here; server-side the `USE` row and the activity share
 * one `sync_push` transaction. The prototype drew the milk first and then asked the log path to
 * write the entry — which refused the duplicate — and produced one feed with two deductions.
 */
export function bottleFromStashChain(input: BottleFromStashInput): Chain {
  requireDetailShape(input.activity);
  if (input.activity.type !== 'bottle') {
    throw new TypeError(`a stash bottle is a 'bottle' activity, got '${input.activity.type}'`);
  }
  if (!Number.isInteger(input.consumedMl) || input.consumedMl <= 0) {
    throw new RangeError(`consumedMl must be a positive integer, got ${input.consumedMl}`);
  }
  const use = ledgerOp(input, {
    tag: 'use',
    kind: 'USE',
    containerId: input.containerId,
    deltaMl: -input.consumedMl,
    occurredAt: input.occurredAt ?? input.activity.startAt,
    activityId: input.activity.id,
    dependsOn: input.intentId,
  });
  return {
    rows: [...activityRows(input, input.activity), use.row],
    ops: [activityOp(input, input.activity), use.op],
  };
}

export interface ContainerAddInput extends ChainBase {
  container: ContainerInput;
  /** The pump session the milk came from; null for milk added by hand (MILK_STASH.md §3). */
  sourceActivityId: string | null;
  /** The ledger row's `activity_id`: the pump session, or null for a manual add. */
  activityId?: string | null | undefined;
  /**
   * Distinguishes several containers under one intent — the containers of a split are `'a'`,
   * `'b'` … `'f'` (`splitPartTag`; §3: `uuidv5(op,'a')`, `uuidv5(op,'b')`), so a replay writes
   * none of them twice. Absent: the plain `'container'` / `'add'` tags a single container has
   * always had.
   */
  tag?: string | undefined;
  /** What the container op waits for (the pump activity's op, when there is one). */
  dependsOn?: string | null | undefined;
}

/**
 * One container entering the stash: its row with `amount_ml = 0` — the balance trigger is the
 * only writer of that column — and the `ADD` that gives it its milk. Both ids derive from the
 * intent, so a retry rebuilds the same rows (§3 rule 4).
 */
export function containerAddChain(input: ContainerAddInput): Chain {
  const c = input.container;
  if (!Number.isInteger(c.initialMl) || c.initialMl <= 0) {
    throw new RangeError(`initialMl must be a positive integer, got ${c.initialMl}`);
  }
  const suffix = input.tag === undefined ? '' : `:${input.tag}`;
  const containerOpId = deriveOpId(input.intentId, `container${suffix}`);
  const containerRow: LocalRow = {
    table: 'milk_containers',
    row: {
      id: c.id,
      household_id: input.householdId,
      owner_id: c.ownerId,
      source_activity_id: input.sourceActivityId,
      location_id: c.locationId,
      container_type: c.containerType,
      amount_ml: 0,
      initial_ml: c.initialMl,
      pumped_at: c.pumpedAt,
      first_frozen_at: c.firstFrozenAt ?? null,
      thawed_at: null,
      opened_at: null,
      used_at: null,
      discarded_at: null,
      discard_reason: null,
      status: 'STORED',
      label_code: c.labelCode ?? null,
      notes: c.notes ?? null,
      created_by: input.createdBy,
      created_at: input.clientEditedAt,
      updated_at: input.clientEditedAt,
    },
  };
  const containerOp: ChainOp = {
    client_op_id: containerOpId,
    entity: 'container',
    op: 'CREATE',
    entity_id: c.id,
    household_id: input.householdId,
    payload: {
      owner_id: c.ownerId,
      source_activity_id: input.sourceActivityId,
      location_id: c.locationId,
      container_type: c.containerType,
      initial_ml: c.initialMl,
      pumped_at: c.pumpedAt,
      first_frozen_at: c.firstFrozenAt ?? null,
      status: 'STORED',
      label_code: c.labelCode ?? null,
      notes: c.notes ?? null,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: input.dependsOn ?? null,
  };
  const add = ledgerOp(input, {
    tag: `add${suffix}`,
    kind: 'ADD',
    containerId: c.id,
    deltaMl: c.initialMl,
    occurredAt: c.pumpedAt,
    activityId: input.activityId ?? input.sourceActivityId,
    toLocationId: c.locationId,
    dependsOn: containerOpId,
  });
  return { rows: [containerRow, add.row], ops: [containerOp, add.op] };
}

export interface PumpToStashInput extends ChainBase {
  activity: ActivityInput;
  container: ContainerInput;
}

/**
 * Saving a pump session to the stash: the activity, a new container in the chosen location, and
 * the ledger ADD that gives it its milk — one intent, so inventory moves EXACTLY once per session
 * (PRODUCT_SPEC.md §6.3). The container waits for the activity, the ADD for the container.
 */
export function pumpToStashChain(input: PumpToStashInput): Chain {
  requireDetailShape(input.activity);
  if (input.activity.type !== 'pump') {
    throw new TypeError(`a pump session is a 'pump' activity, got '${input.activity.type}'`);
  }
  const added = containerAddChain({
    ...input,
    sourceActivityId: input.activity.id,
    dependsOn: input.intentId,
  });
  return {
    rows: [...activityRows(input, input.activity), ...added.rows],
    ops: [activityOp(input, input.activity), ...added.ops],
  };
}

export interface TimerStopInput extends ChainBase {
  activity: ActivityInput;
  timerId: string;
}

/**
 * Stopping a timer: the activity it produced, then the timer row's deletion.
 *
 * `metadata.timer_id` is the load-bearing part. `running_timers` is hard-deleted, so two devices
 * stopping the same timer offline both produce an activity CREATE with different `client_op_id`s
 * and both would insert. The server arbitrates on the timer's identity instead — a unique index
 * on `(household_id, metadata->>'timer_id')` — and returns the second one as `duplicate` with the
 * survivor's id. Collapsing the CREATE and DELETE locally is allowed, but the activity's
 * `client_op_id` and `metadata.timer_id` must survive it (`docs/OFFLINE_SYNC.md` §5.3).
 */
export function timerStopChain(input: TimerStopInput): Chain {
  requireDetailShape(input.activity);
  const metadata = { ...(input.activity.metadata ?? {}), timer_id: input.timerId };
  const activity: ActivityInput = { ...input.activity, metadata };
  const stop: ChainOp = {
    client_op_id: deriveOpId(input.intentId, 'stop'),
    entity: 'timer',
    op: 'DELETE',
    entity_id: input.timerId,
    household_id: input.householdId,
    payload: { timer_id: input.timerId, client_edited_at: input.clientEditedAt },
    depends_on: input.intentId,
  };
  return { rows: activityRows(input, activity), ops: [activityOp(input, activity), stop] };
}

export interface ContainerThawInput extends ChainBase {
  containerId: string;
  toLocationId: string;
  fromLocationId: string | null;
  thawedAt: string;
}

/** Marking a container thawing: the status change, then a zero-delta THAW row so the ledger still
 *  holds the whole history of where the milk has been. */
export function containerThawChain(input: ContainerThawInput): Chain {
  const containerRow: LocalRow = {
    table: 'milk_containers',
    row: {
      id: input.containerId,
      location_id: input.toLocationId,
      thawed_at: input.thawedAt,
      status: 'THAWING',
      updated_at: input.clientEditedAt,
    },
  };
  const containerOp: ChainOp = {
    client_op_id: input.intentId,
    entity: 'container',
    op: 'UPDATE',
    entity_id: input.containerId,
    household_id: input.householdId,
    payload: {
      location_id: input.toLocationId,
      thawed_at: input.thawedAt,
      status: 'THAWING',
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  const thaw = ledgerOp(input, {
    tag: 'thaw',
    kind: 'THAW',
    containerId: input.containerId,
    deltaMl: 0,
    occurredAt: input.thawedAt,
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    dependsOn: input.intentId,
  });
  return { rows: [containerRow, thaw.row], ops: [containerOp, thaw.op] };
}

/* ---------- storage locations (WP6; docs/SCHEDULE_AND_LOCATIONS.md §3) ---------- */

export interface LocationFields {
  name: string;
  shortName: string | null;
  kind: 'ROOM' | 'FRIDGE' | 'FREEZER' | 'DEEP_FREEZER' | 'THAWED';
  sortOrder: number;
  isDefault: boolean;
}

export interface LocationCreateInput extends ChainBase {
  locationId: string;
  location: LocationFields;
}

/** A new storage location: one row, one `location CREATE` op keyed by the intent. */
export function locationCreateChain(input: LocationCreateInput): Chain {
  const l = input.location;
  const name = l.name.trim();
  if (name.length === 0) throw new RangeError('a location needs a name');
  const row: LocalRow = {
    table: 'storage_locations',
    row: {
      id: input.locationId,
      household_id: input.householdId,
      name,
      short_name: l.shortName,
      kind: l.kind,
      sort_order: l.sortOrder,
      is_default: l.isDefault,
      deleted_at: null,
    },
  };
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'location',
    op: 'CREATE',
    entity_id: input.locationId,
    household_id: input.householdId,
    payload: {
      name,
      short_name: l.shortName,
      kind: l.kind,
      sort_order: l.sortOrder,
      is_default: l.isDefault,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

/** The columns a location UPDATE may carry: a rename, a condition, an order, the default, or
 *  its retirement (`deleted_at` set) and its return (`deleted_at` null). */
export interface LocationPatch {
  name?: string;
  short_name?: string | null;
  kind?: LocationFields['kind'];
  sort_order?: number;
  is_default?: boolean;
  deleted_at?: string | null;
}

export interface LocationUpdateInput extends ChainBase {
  locationId: string;
  patch: LocationPatch;
  /** Derives the op id from the intent when one intent updates several locations (a delete
   *  that moves the default). Absent: the op IS the intent. */
  tag?: string | undefined;
  dependsOn?: string | null | undefined;
}

/**
 * A location patch: the columns it names, and nothing else. A location is never DELETEd on
 * the wire — its ledger rows point at it for ever, so a retirement is `deleted_at`, the same
 * shape a care item's archive takes.
 */
export function locationUpdateChain(input: LocationUpdateInput): Chain {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) if (v !== undefined) patch[k] = v;
  if (typeof patch['name'] === 'string') {
    const name = (patch['name'] as string).trim();
    if (name.length === 0) throw new RangeError('a location needs a name');
    patch['name'] = name;
  }
  if (Object.keys(patch).length === 0) throw new RangeError('a location patch names no column');
  const opId = input.tag === undefined ? input.intentId : deriveOpId(input.intentId, input.tag);
  const row: LocalRow = { table: 'storage_locations', row: { id: input.locationId, ...patch } };
  const op: ChainOp = {
    client_op_id: opId,
    entity: 'location',
    op: 'UPDATE',
    entity_id: input.locationId,
    household_id: input.householdId,
    payload: { ...patch, client_edited_at: input.clientEditedAt },
    depends_on: input.dependsOn ?? null,
  };
  return { rows: [row], ops: [op] };
}

export interface FanOutEntry {
  childId: string;
  activity: ActivityInput;
}

export interface FanOutInput {
  /** One id for the whole Save. Every child's intent is derived from it. */
  submissionId: string;
  householdId: string;
  createdBy: string;
  deviceId: string | null;
  clientEditedAt: string;
  entries: FanOutEntry[];
}

/**
 * Both babies, one Save: one entry per child, never one merged row.
 *
 * Two babies who drank from one bottle-making session are still two feeds, each attributable,
 * editable and deletable on its own — a "twin entry" as a single row would corrupt every per-child
 * figure in the product (`docs/MULTIPLES.md` §1).
 *
 * Each child's `client_op_id` is `deriveOpId(submission_id, child_id)`, so a retry cannot duplicate
 * one twin's feed while creating the other's — the replay bug MULTIPLES §2 names. The duplicate
 * guard is per child for the same reason: the second baby's entry is not a double tap on the first.
 */
export function fanOutChain(input: FanOutInput): Chain {
  if (input.entries.length === 0) throw new TypeError('a fan-out needs at least one child');
  const seen = new Set<string>();
  const rows: LocalRow[] = [];
  const ops: ChainOp[] = [];
  for (const entry of input.entries) {
    if (seen.has(entry.childId)) throw new TypeError(`child ${entry.childId} appears twice`);
    seen.add(entry.childId);
    if (entry.activity.childId !== entry.childId) {
      throw new TypeError(
        `entry for ${entry.childId} carries activity.childId ${String(entry.activity.childId)}`,
      );
    }
    const base: ChainBase = {
      intentId: deriveOpId(input.submissionId, entry.childId),
      householdId: input.householdId,
      createdBy: input.createdBy,
      deviceId: input.deviceId,
      clientEditedAt: input.clientEditedAt,
    };
    const chain = simpleActivityChain(base, entry.activity);
    rows.push(...chain.rows);
    ops.push(...chain.ops);
  }
  return { rows, ops };
}

/* ---------- schedule phases, rules, instances and settings (WP7) ---------- */

/** A routine phase as the sheet creates it (docs/SCHEDULE_AND_LOCATIONS.md §1.1). */
export interface PhaseFields {
  name: string;
  childId: string | null;
  /** `yyyy-mm-dd` in the household's home zone. */
  effectiveFrom: string;
  /** Activate on creation — the §1.3 transaction runs on the server in the same op. */
  isCurrent: boolean;
}

export interface PhaseCreateInput extends ChainBase {
  phaseId: string;
  phase: PhaseFields;
  tag?: string | undefined;
}

export function phaseCreateChain(input: PhaseCreateInput): Chain {
  const name = input.phase.name.trim();
  if (name.length < 2 || name.length > 40)
    throw new RangeError('a routine needs a name of 2 to 40 characters');
  const opId = input.tag === undefined ? input.intentId : deriveOpId(input.intentId, input.tag);
  const row: LocalRow = {
    table: 'schedule_phases',
    row: {
      id: input.phaseId,
      household_id: input.householdId,
      child_id: input.phase.childId,
      name,
      effective_from: input.phase.effectiveFrom,
      effective_to: null,
      is_current: input.phase.isCurrent,
      // the mirror's NOT NULL stamps; the server's own replace them on the next pull
      created_at: input.clientEditedAt,
      updated_at: input.clientEditedAt,
      deleted_at: null,
    },
  };
  const op: ChainOp = {
    client_op_id: opId,
    entity: 'schedule_phase',
    op: 'CREATE',
    entity_id: input.phaseId,
    household_id: input.householdId,
    payload: {
      name,
      child_id: input.phase.childId,
      effective_from: input.phase.effectiveFrom,
      is_current: input.phase.isCurrent,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

/** What a phase UPDATE may say: a rename, an activation, a retirement or its undo. */
export interface PhasePatch {
  name?: string;
  activate?: boolean;
  /** `yyyy-mm-dd`; today in the home zone when absent. */
  activation_date?: string;
  deleted_at?: string | null;
  /** On an undo: exactly the rules the delete touched, so nothing else comes back. */
  rule_ids?: readonly string[];
}

export interface PhaseUpdateInput extends ChainBase {
  phaseId: string;
  patch: PhasePatch;
  /** The local rows the write already computed (the outgoing phase closed, rules retired):
   *  the server derives the same from the op, the mirror is told outright. */
  rows?: readonly LocalRow[] | undefined;
  tag?: string | undefined;
  dependsOn?: string | null | undefined;
}

export function phaseUpdateChain(input: PhaseUpdateInput): Chain {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) if (v !== undefined) patch[k] = v;
  if (typeof patch['name'] === 'string') {
    const name = (patch['name'] as string).trim();
    if (name.length < 2 || name.length > 40)
      throw new RangeError('a routine needs a name of 2 to 40 characters');
    patch['name'] = name;
  }
  if (Object.keys(patch).length === 0) throw new RangeError('a phase patch says nothing');
  const opId = input.tag === undefined ? input.intentId : deriveOpId(input.intentId, input.tag);
  const local: Record<string, unknown> = { id: input.phaseId };
  if ('name' in patch) local['name'] = patch['name'];
  if ('deleted_at' in patch) local['deleted_at'] = patch['deleted_at'];
  const op: ChainOp = {
    client_op_id: opId,
    entity: 'schedule_phase',
    op: 'UPDATE',
    entity_id: input.phaseId,
    household_id: input.householdId,
    payload: { ...patch, client_edited_at: input.clientEditedAt },
    depends_on: input.dependsOn ?? null,
  };
  return { rows: [{ table: 'schedule_phases', row: local }, ...(input.rows ?? [])], ops: [op] };
}

/** Every column of a rule the sheet may write, as the row carries it (snake_case). */
export interface RuleFields {
  phase_id: string;
  child_id: string | null;
  activity: ActivityType;
  care_item_id: string | null;
  effective_from: string;
  rule_type: 'FIXED' | 'INTERVAL' | 'RELATIVE' | 'CADENCE';
  at_local_time: string | null;
  every_minutes: number | null;
  relative_to: 'WAKE' | 'LAST_FEED' | 'BEDTIME' | null;
  offset_minutes: number | null;
  every_days: number | null;
  target_quantity: number | null;
  repeat: 'DAILY' | 'WEEKDAYS' | 'WEEKENDS' | 'CUSTOM';
  repeat_days: readonly number[] | null;
  reminder_enabled: boolean;
  remind_user_ids: readonly string[];
  match_window_minutes: number;
  match_scope: 'MINUTES' | 'DAY';
  miss_after_minutes: number;
  late_window_minutes: number;
  night_mode: 'NONE' | 'LONGER' | 'ONE' | 'PAUSE';
  night_from: string | null;
  night_to: string | null;
  night_every_minutes: number | null;
  night_at: string | null;
  target_per_day: number | null;
  name: string | null;
  is_active: boolean;
}

export interface RuleCreateInput extends ChainBase {
  ruleId: string;
  rule: RuleFields;
  /** Several rules from one intent (a SERIES, or "Both" writing one per child). */
  tag?: string | undefined;
}

export function ruleCreateChain(input: RuleCreateInput): Chain {
  const opId = input.tag === undefined ? input.intentId : deriveOpId(input.intentId, input.tag);
  const row: LocalRow = {
    table: 'schedule_rules',
    row: {
      id: input.ruleId,
      household_id: input.householdId,
      ...input.rule,
      created_at: input.clientEditedAt,
      updated_at: input.clientEditedAt,
      deleted_at: null,
    },
  };
  const op: ChainOp = {
    client_op_id: opId,
    entity: 'schedule_rule',
    op: 'CREATE',
    entity_id: input.ruleId,
    household_id: input.householdId,
    payload: { ...input.rule, client_edited_at: input.clientEditedAt },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

export type RulePatch = Partial<Omit<RuleFields, 'activity' | 'care_item_id'>> & {
  deleted_at?: string | null;
};

export interface RuleUpdateInput extends ChainBase {
  ruleId: string;
  patch: RulePatch;
  /**
   * The `updated_at` the sheet loaded (§2.5): the server applies the patch only if the row is
   * still at it, and answers with the current row otherwise. Null skips the check (an undo).
   */
  expectedUpdatedAt: string | null;
  tag?: string | undefined;
  dependsOn?: string | null | undefined;
}

export function ruleUpdateChain(input: RuleUpdateInput): Chain {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) if (v !== undefined) patch[k] = v;
  if (Object.keys(patch).length === 0) throw new RangeError('a rule patch names no column');
  const opId = input.tag === undefined ? input.intentId : deriveOpId(input.intentId, input.tag);
  const row: LocalRow = { table: 'schedule_rules', row: { id: input.ruleId, ...patch } };
  const op: ChainOp = {
    client_op_id: opId,
    entity: 'schedule_rule',
    op: 'UPDATE',
    entity_id: input.ruleId,
    household_id: input.householdId,
    payload: {
      ...patch,
      expected_updated_at: input.expectedUpdatedAt,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: input.dependsOn ?? null,
  };
  return { rows: [row], ops: [op] };
}

export interface RuleDeleteInput extends ChainBase {
  ruleId: string;
  tag?: string | undefined;
}

/** Soft on both sides: `deleted_at` locally, a DELETE op the server answers by setting it. */
export function ruleDeleteChain(input: RuleDeleteInput): Chain {
  const opId = input.tag === undefined ? input.intentId : deriveOpId(input.intentId, input.tag);
  const row: LocalRow = {
    table: 'schedule_rules',
    row: { id: input.ruleId, deleted_at: input.clientEditedAt, is_active: false },
  };
  const op: ChainOp = {
    client_op_id: opId,
    entity: 'schedule_rule',
    op: 'DELETE',
    entity_id: input.ruleId,
    household_id: input.householdId,
    payload: { client_edited_at: input.clientEditedAt },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

export interface InstanceSkipInput extends ChainBase {
  instanceId: string;
  reason: string | null;
}

/** The one thing a client writes on an instance: a caregiver's skip (SCHEDULE_LOGIC §3). */
export function instanceSkipChain(input: InstanceSkipInput): Chain {
  const row: LocalRow = {
    table: 'schedule_instances',
    row: { id: input.instanceId, status: 'SKIPPED', skipped_reason: input.reason },
  };
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'schedule_instance',
    op: 'UPDATE',
    entity_id: input.instanceId,
    household_id: input.householdId,
    payload: {
      status: 'SKIPPED',
      skipped_reason: input.reason,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

/** Settings rows have composite keys; the op's entity id is derived from what it names. */
const SETTINGS_NAMESPACE = '7d1e5c3a-2b4f-4a6e-8c9d-0e1f2a3b4c5d';

export function settingsEntityId(
  householdId: string,
  table:
    | 'module_settings'
    | 'notification_preferences'
    | 'privacy_preferences'
    | 'vaccine_tracking_settings'
    | 'household_settings'
    | 'household_duty',
  key: string,
): string {
  return uuidv5(SETTINGS_NAMESPACE, `${householdId.toLowerCase()}:${table}:${key}`);
}

/**
 * THE KEY OF THE HOUSEHOLD'S ONE SETTINGS ROW. `household_settings` has one row per household, so
 * the key its ops derive their entity id from is a constant, named for the first thing the row held
 * (the waking window, 0095) and kept: every op on the row carries the SAME id — the window's and
 * the milk unit's (0128) — because that id is how a pull knows the phone still owes the server this
 * row (`settingsOwnerId` in `local/apply.ts`). An op under another id would let a pull that landed
 * between the write and its push put the server's older unit back on the screen.
 */
export const HOUSEHOLD_SETTINGS_KEY = 'day_window';

export interface DayWindowInput extends ChainBase {
  /** `HH:MM`, the household's own wall clock. */
  wake: string;
  bed: string;
}

/**
 * The household's waking window (migration 0095): the wake and bed times that decide whether a
 * logged sleep is written down as a nap or as night sleep.
 *
 * ONE ROW PER HOUSEHOLD, so the key the entity id is derived from is a constant rather than
 * anything about the row — there is nothing to distinguish. That makes the id stable, which is
 * what makes two phones editing the window in the same minute resolve to one upsert instead of
 * two rows. It also means an offline edit on each phone is last-write-wins on the server, which
 * is right for a setting: the later parent's bedtime is the household's bedtime.
 */
export function dayWindowChain(input: DayWindowInput): Chain {
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'settings',
    op: 'UPDATE',
    entity_id: settingsEntityId(input.householdId, 'household_settings', HOUSEHOLD_SETTINGS_KEY),
    household_id: input.householdId,
    payload: {
      table: 'household_settings',
      wake_time: input.wake,
      bed_time: input.bed,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  const row: LocalRow = {
    table: 'household_settings',
    row: { household_id: input.householdId, wake_time: input.wake, bed_time: input.bed },
  };
  return { rows: [row], ops: [op] };
}

export interface VolumeUnitInput extends ChainBase {
  /** The unit every milk amount in the household is read and entered in. */
  unit: VolumeUnit;
}

/**
 * THE HOUSEHOLD'S MILK UNIT (migration 0128; the owner, 2026-09-26: *"make the oz/mL setting
 * household-wide, not per person"*): ounces or milliliters, for every bottle, pump and stash amount
 * on every phone in the household. A column of the same one-row `household_settings` as the waking
 * window, written by the same kind of op under the same id (`HOUSEHOLD_SETTINGS_KEY`), naming only
 * its own column — the server's upsert leaves the window alone, and the window's op leaves the unit.
 *
 * Offline, last write wins on the server, which is right for a setting: the later parent's choice
 * is the household's. Nothing stored changes with it — every amount stays in ml, and the unit is
 * only how it is read (`volumeText`) and typed.
 */
export function volumeUnitChain(input: VolumeUnitInput): Chain {
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'settings',
    op: 'UPDATE',
    entity_id: settingsEntityId(input.householdId, 'household_settings', HOUSEHOLD_SETTINGS_KEY),
    household_id: input.householdId,
    payload: {
      table: 'household_settings',
      volume_unit: input.unit,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  const row: LocalRow = {
    table: 'household_settings',
    row: {
      household_id: input.householdId,
      volume_unit: input.unit,
      updated_by: input.createdBy,
      updated_at: input.clientEditedAt,
    },
  };
  return { rows: [row], ops: [op] };
}

// `dutyChain` (who's on, migration 0113, as three shift fields) went on 2026-09-26: the app's
// `data/duty.ts` has built the whole list with its record (0115) itself since that record arrived.

export interface ModuleSettingPatch {
  enabled?: boolean;
  quick_enabled?: boolean;
  quick_position?: number | null;
  /**
   * The household's "nudge me if nothing is logged for" threshold, in minutes; null = off. Unread
   * since the nudge module went (2026-09-18) and never written by the app; kept and synced so a
   * value a household set is not destroyed (`db/queries/schedule.ts` in the app says why).
   */
  nudge_after_minutes?: number | null;
  /**
   * The household's daily goal for the module, in minutes; null = none (migration 0097). Tummy
   * time is the module that carries one (`today/goal.ts`). One row per household, so twins share
   * it — a goal is "how much we aim for a day", and the same setting was per child before only
   * because the count it replaced was stored as per-child reminder rules.
   */
  goal_minutes?: number | null;
  /**
   * The module's second life, or null for its own word (migration 0098): `playtime` on tummy
   * time once the baby has outgrown it (`modules/variants.ts`). A household setting a parent
   * flips under What you track; the app never proposes it.
   */
  variant?: ModuleVariant | null;
  /**
   * While a variant is on, the goal the module had under its own word (migration 0127): tummy
   * time's, kept while the household calls it Playtime. Written with the variant and the goal in
   * the one op of the switch (`graduationSettings`), so the phone's mirror has it at once, offline
   * included. The SERVER does not read it from the payload — its trigger keeps the column from the
   * row's own history — and the next pull replaces the phone's prediction with that.
   */
  base_goal_minutes?: number | null;
}

export interface ModuleSettingInput extends ChainBase {
  moduleId: string;
  patch: ModuleSettingPatch;
}

export function moduleSettingChain(input: ModuleSettingInput): Chain {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) if (v !== undefined) patch[k] = v;
  if (Object.keys(patch).length === 0)
    throw new RangeError('a module setting patch names no column');
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'settings',
    op: 'UPDATE',
    entity_id: settingsEntityId(input.householdId, 'module_settings', input.moduleId),
    household_id: input.householdId,
    payload: {
      table: 'module_settings',
      module_id: input.moduleId,
      ...patch,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  const row: LocalRow = {
    table: 'module_settings',
    row: { household_id: input.householdId, module_id: input.moduleId, ...patch },
  };
  return { rows: [row], ops: [op] };
}

export interface NotificationPreferencePatch {
  enabled?: boolean;
  sound?: boolean;
  vibrate?: boolean;
  quiet_from?: string | null;
  quiet_to?: string | null;
}

export interface NotificationPreferenceInput extends ChainBase {
  userId: string;
  channel: string;
  patch: NotificationPreferencePatch;
}

/** The viewer's own row per channel (NOTIFICATIONS §6): an upsert on the server. */
export function notificationPreferenceChain(input: NotificationPreferenceInput): Chain {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) if (v !== undefined) patch[k] = v;
  if (Object.keys(patch).length === 0) throw new RangeError('a preference patch names no column');
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'settings',
    op: 'UPDATE',
    entity_id: settingsEntityId(
      input.householdId,
      'notification_preferences',
      `${input.userId}:${input.channel}`,
    ),
    household_id: input.householdId,
    payload: {
      table: 'notification_preferences',
      channel: input.channel,
      ...patch,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  const row: LocalRow = {
    table: 'notification_preferences',
    row: {
      household_id: input.householdId,
      user_id: input.userId,
      channel: input.channel,
      ...patch,
    },
  };
  return { rows: [row], ops: [op] };
}

export interface PrivacyPreferenceInput extends ChainBase {
  userId: string;
  /** A privacy-capable module (`module-registry.ts`: pump, hydration, selfcare). */
  moduleId: string;
  /** false ⇒ this caregiver's new sessions in that module are written `is_private = true`. */
  shared: boolean;
}

/**
 * MOM PRIVACY (docs/SECURITY.md §4): whether one caregiver's own sessions in one
 * privacy-capable module are shared with the household. The viewer's own row, an upsert on the
 * server, keyed the same way a notification preference is.
 *
 * `userId` is here for the LOCAL row only — the server takes the caller's own `auth.uid()` and
 * ignores anything the payload says about whose preference it is, which is the whole reason one
 * member can never decide what another shares.
 *
 * It carries only the SETTING. Flipping the rows this caregiver has already logged is a
 * separate chain per row (`activityUpdate`, from `data/privacy.ts`), because those are activity
 * edits with activity field clocks and they must merge per field like any other correction.
 */
export function privacyPreferenceChain(input: PrivacyPreferenceInput): Chain {
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'settings',
    op: 'UPDATE',
    entity_id: settingsEntityId(
      input.householdId,
      'privacy_preferences',
      `${input.userId}:${input.moduleId}`,
    ),
    household_id: input.householdId,
    payload: {
      table: 'privacy_preferences',
      module_id: input.moduleId,
      shared: input.shared,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  const row: LocalRow = {
    table: 'privacy_preferences',
    row: {
      household_id: input.householdId,
      user_id: input.userId,
      module_id: input.moduleId,
      shared: input.shared,
    },
  };
  return { rows: [row], ops: [op] };
}

export interface MessageDismissalInput extends ChainBase {
  messageId: string;
  action: 'DISMISSED' | 'ACTED' | 'LATER';
}

/**
 * A parent's answer to one in-app card (docs/IN_APP_MESSAGES.md §3).
 *
 * CREATE and only ever CREATE: the first answer is the true one, the server upserts with
 * `on conflict do nothing`, and both halves revoke update and delete. A parent who dismissed a
 * card has dismissed it; there is nothing to correct afterwards.
 *
 * `entity_id` is the MESSAGE's id, not a minted one, which is what makes a replay land on the
 * row it already wrote and what lets the server find the message to check it exists.
 *
 * The local row carries `app_version` and the wire does not: §3 lets an update notice come back
 * "after 7 days or on the next version", and which build a parent was running when they said
 * Later is a fact about this phone that no other device needs.
 */
export function messageDismissalChain(input: MessageDismissalInput): Chain {
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'message_dismissal',
    op: 'CREATE',
    entity_id: input.messageId,
    household_id: input.householdId,
    payload: { action: input.action, client_edited_at: input.clientEditedAt },
    depends_on: null,
  };
  const row: LocalRow = {
    table: 'app_message_dismissals',
    row: {
      message_id: input.messageId,
      user_id: input.createdBy,
      action: input.action,
      at: input.clientEditedAt,
    },
  };
  return { rows: [row], ops: [op] };
}

/* ---------------------------------------------------------------- immunisations (WP8) */

/** Every column of a `vaccine_records` row the sheets write (docs/VACCINES.md §6). */
export interface VaccineRecordFields {
  child_id: string;
  /** Stamped at write time so a record remembers the schedule it was entered against; null
   *  for a parent-added vaccine, together with `dose_id`. */
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
  /** Free text, stored verbatim — never parsed, classified or suggested. */
  decline_reason: string | null;
  notes: string | null;
}

export interface VaccineRecordCreateInput extends ChainBase {
  recordId: string;
  record: VaccineRecordFields;
  tag?: string | undefined;
}

/**
 * A record for a scheduled dose is an UPSERT on `(child_id, dose_id)` on the server (§8):
 * two devices recording the same dose produce one row, the later write winning per field,
 * and the loser hears `duplicate`. The client writes the id it made; the server may answer
 * with the id that already held the slot, which the worker adopts.
 */
export function vaccineRecordCreateChain(input: VaccineRecordCreateInput): Chain {
  const r = input.record;
  if (r.dose_id === null && (r.custom_name === null || r.custom_name.trim() === ''))
    throw new RangeError('a vaccine record names a dose or a vaccine');
  if (r.status === 'GIVEN' && r.occurred_on === null)
    throw new RangeError('a given dose has a date');
  const opId = input.tag === undefined ? input.intentId : deriveOpId(input.intentId, input.tag);
  const row: LocalRow = {
    table: 'vaccine_records',
    row: {
      id: input.recordId,
      client_op_id: opId,
      household_id: input.householdId,
      ...r,
      created_by: input.createdBy,
      updated_by: null,
      created_at: input.clientEditedAt,
      updated_at: input.clientEditedAt,
      deleted_at: null,
    },
  };
  const op: ChainOp = {
    client_op_id: opId,
    entity: 'vaccine_record',
    op: 'CREATE',
    entity_id: input.recordId,
    household_id: input.householdId,
    payload: { ...r, client_edited_at: input.clientEditedAt },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

export type VaccineRecordPatch = Partial<
  Pick<
    VaccineRecordFields,
    | 'status'
    | 'occurred_on'
    | 'provider'
    | 'site'
    | 'lot'
    | 'decline_reason'
    | 'notes'
    | 'custom_name'
  >
> & { deleted_at?: string | null };

export interface VaccineRecordUpdateInput extends ChainBase {
  recordId: string;
  patch: VaccineRecordPatch;
  tag?: string | undefined;
}

/** Whole-row last-writer-wins by `client_edited_at` on the server, like a container (D2). */
export function vaccineRecordUpdateChain(input: VaccineRecordUpdateInput): Chain {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) if (v !== undefined) patch[k] = v;
  if (Object.keys(patch).length === 0)
    throw new RangeError('a vaccine record patch names no column');
  const opId = input.tag === undefined ? input.intentId : deriveOpId(input.intentId, input.tag);
  const row: LocalRow = {
    table: 'vaccine_records',
    row: {
      id: input.recordId,
      ...patch,
      updated_by: input.createdBy,
      updated_at: input.clientEditedAt,
    },
  };
  const op: ChainOp = {
    client_op_id: opId,
    entity: 'vaccine_record',
    op: 'UPDATE',
    entity_id: input.recordId,
    household_id: input.householdId,
    payload: { ...patch, client_edited_at: input.clientEditedAt },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

export interface VaccineRecordDeleteInput extends ChainBase {
  recordId: string;
  tag?: string | undefined;
}

/** "Remove this record": `deleted_at` on both sides, never a hard delete (§6, §7). */
export function vaccineRecordDeleteChain(input: VaccineRecordDeleteInput): Chain {
  const opId = input.tag === undefined ? input.intentId : deriveOpId(input.intentId, input.tag);
  const row: LocalRow = {
    table: 'vaccine_records',
    row: { id: input.recordId, deleted_at: input.clientEditedAt, updated_at: input.clientEditedAt },
  };
  const op: ChainOp = {
    client_op_id: opId,
    entity: 'vaccine_record',
    op: 'DELETE',
    entity_id: input.recordId,
    household_id: input.householdId,
    payload: { client_edited_at: input.clientEditedAt },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

export interface VaccineTrackingInput extends ChainBase {
  childId: string;
  doseId: string;
  enabled: boolean;
}

/** An optional or seasonal series turned on or off for one child (§6): a settings upsert. */
export function vaccineTrackingChain(input: VaccineTrackingInput): Chain {
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'settings',
    op: 'UPDATE',
    entity_id: settingsEntityId(
      input.householdId,
      'vaccine_tracking_settings',
      `${input.childId}:${input.doseId}`,
    ),
    household_id: input.householdId,
    payload: {
      table: 'vaccine_tracking_settings',
      child_id: input.childId,
      dose_id: input.doseId,
      enabled: input.enabled,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  const row: LocalRow = {
    table: 'vaccine_tracking_settings',
    row: {
      household_id: input.householdId,
      child_id: input.childId,
      dose_id: input.doseId,
      enabled: input.enabled,
      updated_by: input.createdBy,
      updated_at: input.clientEditedAt,
    },
  };
  return { rows: [row], ops: [op] };
}

/* ---------- the two shared lists (WP6b, WP6c; the prototype's `VIEWS.shoplist` and
                `VIEWS.tasks`) ---------- */

/**
 * WHY THESE TWO ARE ONE SECTION. A shopping list and a chore list are the same object: a row
 * per line, household-scoped rather than per-child, that either of two adults ticks off and
 * both see at once. They differ in what a line carries — a quantity and a shop, or a time and
 * a person — and in nothing else, so they share their chains, their sync shape and their tests.
 *
 * NEITHER IS PART OF THE BABY'S RECORD. Nothing here writes an `activity`, nothing reaches
 * Reports and nothing appears in an export of the child's history: a bought pack of diapers is
 * not a thing that happened to a baby. The prototype says the same in one line — "this is a
 * chore list; it never appears in reports or in your baby's history" — and the app says it on
 * the screen.
 */

export interface ShoppingItemFields {
  title: string;
  qty: number;
  note: string | null;
  /** Where it is bought. Groups the list, and the household's own word for the place. */
  store: string | null;
  /**
   * The catalog item this line came from (`supply_items`), or null for a one-off.
   *
   * The TITLE is still written, even for a catalog line, and that is deliberate: the list has
   * to read correctly on a phone whose catalog page has not arrived yet, and a line whose item
   * was later removed is still a thing somebody wanted. The link is what carries the size, the
   * pack and the last-bought date; the title is what carries the name.
   */
  supplyId?: string | null;
}

export interface ShoppingCreateInput extends ChainBase {
  itemId: string;
  item: ShoppingItemFields;
}

/** Quantities a line can hold: one of something, up to a pallet nobody will ever type. */
export const SHOPPING_QTY_MAX = 99;

/**
 * The bound, exported so the stepper on the list and the write that follows it cannot disagree:
 * a − that stays live at 1, or a + that keeps counting past the max and is silently clamped on
 * save, is a control lying about what it did.
 */
export const clampShoppingQty = (n: number): number =>
  Math.min(SHOPPING_QTY_MAX, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));

const cleanQty = clampShoppingQty;

const cleanText = (s: string | null): string | null => {
  const t = (s ?? '').trim();
  return t.length === 0 ? null : t;
};

/** A line on the list: one row, one `shopping_item CREATE` keyed by the intent. */
export function shoppingCreateChain(input: ShoppingCreateInput): Chain {
  const title = input.item.title.trim();
  if (title.length === 0) throw new RangeError('a shopping line needs a name');
  const qty = cleanQty(input.item.qty);
  const note = cleanText(input.item.note);
  const store = cleanText(input.item.store);
  const supplyId = input.item.supplyId ?? null;
  const row: LocalRow = {
    table: 'shopping_items',
    row: {
      id: input.itemId,
      household_id: input.householdId,
      title,
      qty,
      note,
      store,
      supply_id: supplyId,
      checked_at: null,
      checked_by: null,
      created_by: input.createdBy,
      created_at: input.clientEditedAt,
      updated_at: input.clientEditedAt,
      deleted_at: null,
    },
  };
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'shopping_item',
    op: 'CREATE',
    entity_id: input.itemId,
    household_id: input.householdId,
    payload: {
      title,
      qty,
      note,
      store,
      supply_id: supplyId,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

/**
 * What an update may carry. `checked_at` is the tick: an instant rather than a boolean, so
 * two phones ticking the same line agree on WHEN without a second column, and last-writer-wins
 * on `updated_at` resolves an untick against a tick the way it resolves everything else.
 */
export interface ShoppingPatch {
  title?: string;
  qty?: number;
  note?: string | null;
  store?: string | null;
  checked_at?: string | null;
  deleted_at?: string | null;
}

export interface ShoppingUpdateInput extends ChainBase {
  itemId: string;
  patch: ShoppingPatch;
  /** One intent touching several lines (clearing the basket) derives an op id per line. */
  tag?: string | undefined;
}

export function shoppingUpdateChain(input: ShoppingUpdateInput): Chain {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) if (v !== undefined) patch[k] = v;
  if (typeof patch['title'] === 'string') {
    const title = (patch['title'] as string).trim();
    if (title.length === 0) throw new RangeError('a shopping line needs a name');
    patch['title'] = title;
  }
  if (typeof patch['qty'] === 'number') patch['qty'] = cleanQty(patch['qty'] as number);
  for (const k of ['note', 'store'] as const) {
    if (k in patch) patch[k] = cleanText(patch[k] as string | null);
  }
  // who put it in the basket travels with when: the row says both or neither
  const checked = 'checked_at' in patch;
  const rowPatch: Record<string, unknown> = {
    ...patch,
    updated_at: input.clientEditedAt,
    ...(checked ? { checked_by: patch['checked_at'] === null ? null : input.createdBy } : {}),
  };
  const row: LocalRow = { table: 'shopping_items', row: { id: input.itemId, ...rowPatch } };
  const op: ChainOp = {
    client_op_id: input.tag === undefined ? input.intentId : deriveOpId(input.intentId, input.tag),
    entity: 'shopping_item',
    op: 'UPDATE',
    entity_id: input.itemId,
    household_id: input.householdId,
    payload: { ...patch, client_edited_at: input.clientEditedAt },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

/* ----------------------------------- the supply catalog ----------------------------------- */

/**
 * A catalog item (`docs/SUPPLIES.md`; the prototype's §17): what this household buys, in
 * enough detail that the other parent brings the right box home. It is not a list line and
 * does not come and go with a trip — finishing a trip writes `last_bought_on` on the ITEM,
 * which is how "bought 9 days ago" is true without a purchase history.
 */
export interface SupplyFields {
  category: string;
  brand: string | null;
  product: string | null;
  variant: string | null;
  pack: string | null;
  store: string | null;
  notes: string | null;
  url: string | null;
}

export interface SupplyCreateInput extends ChainBase {
  supplyId: string;
  item: SupplyFields;
}

const supplyRow = (f: SupplyFields): Record<string, unknown> => ({
  category: f.category,
  brand: cleanText(f.brand),
  product: cleanText(f.product),
  variant: cleanText(f.variant),
  pack: cleanText(f.pack),
  store: cleanText(f.store),
  notes: cleanText(f.notes),
  url: cleanText(f.url),
});

/** An item needs SOMETHING to call it: a brand, or a product line, or both. */
function supplyNamed(f: Pick<SupplyFields, 'brand' | 'product'>): void {
  if (cleanText(f.brand) === null && cleanText(f.product) === null) {
    throw new RangeError('a supply needs a brand or a product name');
  }
}

export function supplyCreateChain(input: SupplyCreateInput): Chain {
  supplyNamed(input.item);
  const fields = supplyRow(input.item);
  const row: LocalRow = {
    table: 'supply_items',
    row: {
      id: input.supplyId,
      household_id: input.householdId,
      ...fields,
      last_bought_on: null,
      created_by: input.createdBy,
      created_at: input.clientEditedAt,
      updated_at: input.clientEditedAt,
      deleted_at: null,
    },
  };
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'supply_item',
    op: 'CREATE',
    entity_id: input.supplyId,
    household_id: input.householdId,
    payload: { ...fields, client_edited_at: input.clientEditedAt },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

export interface SupplyPatch {
  category?: string;
  brand?: string | null;
  product?: string | null;
  variant?: string | null;
  pack?: string | null;
  store?: string | null;
  notes?: string | null;
  url?: string | null;
  /** `YYYY-MM-DD` in the household's zone: the day a trip recorded buying it. */
  last_bought_on?: string | null;
  deleted_at?: string | null;
}

export interface SupplyUpdateInput extends ChainBase {
  supplyId: string;
  patch: SupplyPatch;
  /** One trip touching several items derives an op id per item. */
  tag?: string | undefined;
}

export function supplyUpdateChain(input: SupplyUpdateInput): Chain {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) if (v !== undefined) patch[k] = v;
  for (const k of ['brand', 'product', 'variant', 'pack', 'store', 'notes', 'url'] as const) {
    if (k in patch) patch[k] = cleanText(patch[k] as string | null);
  }
  if ('brand' in patch || 'product' in patch) {
    // a rename may not leave the item nameless, and only the fields the op names are known
    const brand = 'brand' in patch ? (patch['brand'] as string | null) : 'kept';
    const product = 'product' in patch ? (patch['product'] as string | null) : 'kept';
    supplyNamed({ brand, product });
  }
  const row: LocalRow = {
    table: 'supply_items',
    row: { id: input.supplyId, ...patch, updated_at: input.clientEditedAt },
  };
  const op: ChainOp = {
    client_op_id: input.tag === undefined ? input.intentId : deriveOpId(input.intentId, input.tag),
    entity: 'supply_item',
    op: 'UPDATE',
    entity_id: input.supplyId,
    household_id: input.householdId,
    payload: { ...patch, client_edited_at: input.clientEditedAt },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

/** How often a chore comes round. Days of the week, never "every N days": a household says
 *  "weekdays", and a chore that drifts by a day is a chore nobody trusts. */
export type TaskRepeat = 'DAILY' | 'WEEKDAYS' | 'WEEKENDS' | 'ONCE';

export const TASK_REPEATS: readonly TaskRepeat[] = ['DAILY', 'WEEKDAYS', 'WEEKENDS', 'ONCE'];

export interface TaskFields {
  title: string;
  /** `HH:MM` in the household's clock, or null for "any time" — which gets no reminder. */
  atLocalTime: string | null;
  repeat: TaskRepeat;
  /** Whose it is; null is anyone's. */
  assignedTo: string | null;
}

export interface TaskCreateInput extends ChainBase {
  taskId: string;
  task: TaskFields;
}

export function taskCreateChain(input: TaskCreateInput): Chain {
  const title = input.task.title.trim();
  if (title.length === 0) throw new RangeError('a task needs a name');
  const row: LocalRow = {
    table: 'household_tasks',
    row: {
      id: input.taskId,
      household_id: input.householdId,
      title,
      at_local_time: input.task.atLocalTime,
      repeat: input.task.repeat,
      assigned_to: input.task.assignedTo,
      last_done_on: null,
      last_done_by: null,
      last_done_at: null,
      created_by: input.createdBy,
      created_at: input.clientEditedAt,
      updated_at: input.clientEditedAt,
      deleted_at: null,
    },
  };
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'task',
    op: 'CREATE',
    entity_id: input.taskId,
    household_id: input.householdId,
    payload: {
      title,
      at_local_time: input.task.atLocalTime,
      repeat: input.task.repeat,
      assigned_to: input.task.assignedTo,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

/**
 * A task patch. `last_done_on` is the whole completion model: the LOCAL DAY it was last ticked,
 * and "done" is that day being today.
 *
 * It is one column rather than a completions table because the product never shows a chore's
 * history — the prototype keeps a map of every day and reads exactly one key from it, and
 * CARE is where a record belongs, not here. Adding the history later is a new table beside
 * this one, not a change to it.
 */
export interface TaskPatch {
  title?: string;
  at_local_time?: string | null;
  repeat?: TaskRepeat;
  assigned_to?: string | null;
  /** `YYYY-MM-DD` in the household's zone, or null to untick. */
  last_done_on?: string | null;
  deleted_at?: string | null;
}

export interface TaskUpdateInput extends ChainBase {
  taskId: string;
  patch: TaskPatch;
  tag?: string | undefined;
}

export function taskUpdateChain(input: TaskUpdateInput): Chain {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.patch)) if (v !== undefined) patch[k] = v;
  if (typeof patch['title'] === 'string') {
    const title = (patch['title'] as string).trim();
    if (title.length === 0) throw new RangeError('a task needs a name');
    patch['title'] = title;
  }
  const done = 'last_done_on' in patch;
  const rowPatch: Record<string, unknown> = {
    ...patch,
    updated_at: input.clientEditedAt,
    ...(done
      ? patch['last_done_on'] === null
        ? { last_done_by: null, last_done_at: null }
        : { last_done_by: input.createdBy, last_done_at: input.clientEditedAt }
      : {}),
  };
  const row: LocalRow = { table: 'household_tasks', row: { id: input.taskId, ...rowPatch } };
  const op: ChainOp = {
    client_op_id: input.tag === undefined ? input.intentId : deriveOpId(input.intentId, input.tag),
    entity: 'task',
    op: 'UPDATE',
    entity_id: input.taskId,
    household_id: input.householdId,
    payload: { ...patch, client_edited_at: input.clientEditedAt },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}
