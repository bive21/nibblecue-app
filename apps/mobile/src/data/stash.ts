/**
 * A bottle taken from the milk stash — the write `docs/UX_AUDIT.md` §4.62 was written about.
 *
 * THE FAILURE THIS FILE EXISTS TO PREVENT. The prototype drew the milk out of the stash first
 * and then asked the log path to write the entry, and that path refused a second identical
 * bottle inside a 3.5 s window. A parent who tapped Save twice got ONE feed, TWO deductions,
 * and the second draw's leftover stamped onto the *previous* feed's record — because the patch
 * step selected "the newest bottle entry" rather than the entry this save had created. The
 * stash then read lower than the milk actually in the fridge, which is the direction that
 * matters: a parent plans a night around a number that is wrong and nothing looks broken.
 *
 * The three rules of `docs/MILK_STASH.md` §7d, and how each is met here:
 *
 *   1. **Commit as one transaction.** The activity, its detail row, every ledger row and every
 *      container's new balance are one `commitWrite`. There is no window in which the milk has
 *      moved and the feed does not exist.
 *   2. **Never identify "the row I just wrote" by time.** The activity id is minted before the
 *      write and returned in the result. Nothing here ever selects by `start_at`.
 *   3. **The guard sits in front of BOTH steps.** The dedupe key is read inside the same
 *      transaction, before any row is written, so a suppressed second tap draws nothing.
 *
 * The snapshot-and-restore below is belt as well as braces: the transaction already rolls back,
 * but §7d asks for the client to snapshot what it changed and put it back if the entry was not
 * created, and a future writer that reaches for the containers outside the transaction would
 * be caught by the restore rather than by a parent.
 *
 * WHAT IS DEDUCTED. `offered_ml` leaves the container; `consumed_ml` goes on the activity
 * (§7a). Deducting what the baby drank is how a household that always pours a little extra
 * drifts high over a week.
 *
 * THE RANKING (WP6). With the household's guidance profile and a clock, `rankContainers` is
 * §6b — fresh, then thawed, then fridge, then frozen by best use, each container's reason on
 * the sheet — and a draw walks only what is SUGGESTED: nothing under 30 ml, nothing past its
 * own guidance limit, unless the parent chose that container themselves. Without a profile it
 * falls back to "already out first, then oldest", which is deterministic and safe.
 *
 * THE REST OF THE STASH'S WRITES live below the draw: milk added by hand, a pump session's
 * three destinations with a split, moving (the freeze date set once and never again), thawing
 * and the way back for an icy bag, splitting a stored container, correcting an amount, and
 * discarding — every one a chain of container rows and append-only ledger rows, committed as
 * one write, ids derived from the intent so a retry rebuilds the same rows.
 */
import {
  DEDUPE_WINDOW_MS,
  MILK_REMAINDER_FLOOR_ML,
  bottleFromStashChain,
  checkSplitParts,
  containerAddChain,
  containerThawChain,
  dedupeKey,
  deriveOpId,
  feedSplit,
  isFrozenKind,
  simpleActivityChain,
  splitPartTag,
  splitSession,
  type Chain,
  type ChainOp,
  type Clock,
  type ContainerType,
  type DiscardReason,
  type LocalRow,
  type MilkGuidanceProfile,
  type MilkStorageKind,
  type MilkTxnKind,
} from '@nibblecue/core';
import type { Db, Tx } from '../db/driver';
import {
  containerById,
  locationById,
  stashContainers,
  type LocationRow,
  type StashContainerRow as ContainerRow,
} from '../db/queries/stash';
import { newEntityId, newIntentId } from './ids';
import { privateByDefault } from './privacy';
import { commitWrite, type RepositoryDeps, type WriteOutcome } from './repository';
import { rankRows } from './stashRank';
import { activityKeys, keys, store as appStore } from './store';
import type { WriteContext } from './activities';

export { MILK_REMAINDER_FLOOR_ML };

/** A container as the local mirror holds it, in the columns a draw reads and writes. */
export interface StashContainerRow {
  id: string;
  amount_ml: number;
  status: string;
  used_at: string | null;
  pumped_at: string;
  first_frozen_at: string | null;
  location_id: string;
}

const CONTAINER_COLUMNS = 'id, amount_ml, status, used_at, pumped_at, first_frozen_at, location_id';

/**
 * THE ID OF THE PATCH THAT CLOSES A CONTAINER A BOTTLE EMPTIED — derived from the bottle's own
 * activity and the container, so the undo that takes the bottle back can find it from the USE row
 * alone (`returnToContainer` in undo.ts), and a replay of the same write rebuilds the same op.
 */
export const emptiedPatchId = (activityId: string, containerId: string): string =>
  deriveOpId(activityId, `used:${containerId}`);

/**
 * The id of a patch REOPENING a closed bag that milk is put back into — deleting the bottle that
 * emptied it (data/entries.ts). Derived from the bag and the instant of the ADJUST that puts the
 * milk back (its `occurred_at`), which is all an undo of that delete holds, so `returnToContainer`
 * can take the patch back out of the queue when the delete is undone before it was sent.
 */
export const reopenPatchId = (containerId: string, occurredAt: string): string =>
  deriveOpId(containerId, `reopen:${occurredAt}`);

/**
 * A container patch, queued AHEAD of the ledger rows of the same write (the sync sweep of
 * 2026-09-24, S4). A container is last-writer-wins as a WHOLE ROW, and every ledger row the server
 * applies re-stamps the container's `updated_at` with the server's clock: a patch that reaches the
 * server after a ledger row of its own write is older than the row it patches, and is dropped —
 * answered `applied`, with nothing changed. Ahead of them it is either in the same batch, where
 * containers are applied before the ledger (`sync_push` phases 5 and 6), or in an earlier one.
 */
function closingPatch(
  base: { householdId: string; clientEditedAt: string },
  id: string,
  containerId: string,
  usedAt: string,
  dependsOn: string | null,
): ChainOp {
  return {
    client_op_id: id,
    entity: 'container',
    op: 'UPDATE',
    entity_id: containerId,
    household_id: base.householdId,
    payload: { status: 'USED', used_at: usedAt, client_edited_at: base.clientEditedAt },
    depends_on: dependsOn,
  };
}

/** What the §6b ranking needs from the caller: the profile, the clock, and the zone. */
export interface RankOptions {
  profile: MilkGuidanceProfile | null;
  nowMs: number;
  timeZone: string;
  clock24?: boolean;
  /** A container the parent picked on the sheet: first, whatever the ranking says. */
  preferredContainerId?: string | null;
}

const toDrawRow = (r: ContainerRow): StashContainerRow => ({
  id: r.id,
  amount_ml: r.amount_ml,
  status: r.status,
  used_at: r.used_at,
  pumped_at: r.pumped_at,
  first_frozen_at: r.first_frozen_at,
  location_id: r.location_id,
});

/**
 * Every container a draw may walk, in the order it walks them. With `rank` it is §6b and only
 * the SUGGESTED containers (plus the one the parent chose, first); without it, the WP5 order.
 */
export async function rankContainers(
  t: Tx,
  householdId: string,
  rank?: RankOptions,
): Promise<StashContainerRow[]> {
  if (rank === undefined) {
    return t.all<StashContainerRow>(
      `select ${CONTAINER_COLUMNS} from milk_containers
        where household_id = ? and amount_ml > 0 and status in ('STORED', 'THAWING')
        order by case status when 'THAWING' then 0 else 1 end, pumped_at asc, id asc`,
      [householdId],
    );
  }
  const rows = (await stashContainers(t, householdId)).filter(r => r.amount_ml > 0);
  const ranked = rankRows(rows, rank.profile, rank.nowMs, {
    timeZone: rank.timeZone,
    clock24: rank.clock24 ?? false,
  });
  const byId = new Map(rows.map(r => [r.id, r]));
  const out: StashContainerRow[] = [];
  const preferred = rank.preferredContainerId ?? null;
  if (preferred !== null) {
    const chosen = byId.get(preferred);
    if (chosen !== undefined) out.push(toDrawRow(chosen));
  }
  for (const c of ranked) {
    if (!c.suggested || c.id === preferred) continue;
    const row = byId.get(c.id);
    if (row !== undefined) out.push(toDrawRow(row));
  }
  return out;
}

/** The stash total: what the summary card shows, and what the tests balance against. */
export async function stashTotalMl(t: Tx, householdId: string): Promise<number> {
  const row = await t.get<{ total: number | null }>(
    `select sum(amount_ml) as total from milk_containers
      where household_id = ? and status in ('STORED', 'THAWING')`,
    [householdId],
  );
  return row?.total ?? 0;
}

export interface StashDraw {
  containerId: string;
  ml: number;
}

/** What a walk decided, computed from a snapshot before anything is written. */
export interface DrawPlan {
  draws: StashDraw[];
  /** Milk the stash could not cover. The feed is saved anyway (§7b). */
  unaccountedMl: number;
  /** The last container's leftover, written off when it is under the floor. */
  remainder: { containerId: string; ml: number } | null;
}

/** Walk the ranked list until the bottle is full. Pure: no clock, no database, no ids. */
export function planDraw(containers: readonly StashContainerRow[], wantedMl: number): DrawPlan {
  if (!Number.isInteger(wantedMl) || wantedMl <= 0) {
    throw new RangeError(`a draw needs a positive whole number of ml, got ${wantedMl}`);
  }
  const draws: StashDraw[] = [];
  let left = wantedMl;
  for (const container of containers) {
    if (left <= 0) break;
    const take = Math.min(left, container.amount_ml);
    if (take <= 0) continue;
    draws.push({ containerId: container.id, ml: take });
    left -= take;
  }
  const last = draws[draws.length - 1];
  const lastContainer =
    last === undefined ? undefined : containers.find(c => c.id === last.containerId);
  const leftover =
    last === undefined || lastContainer === undefined ? 0 : lastContainer.amount_ml - last.ml;
  return {
    draws,
    unaccountedMl: left,
    remainder:
      last !== undefined && leftover > 0 && leftover < MILK_REMAINDER_FLOOR_ML
        ? { containerId: last.containerId, ml: leftover }
        : null,
  };
}

export interface BottleFromStashInput extends WriteContext {
  childId: string | null;
  /** The tap time, or a time the parent backdated to. `start_at` is exactly this. */
  startAt: string;
  /** What the baby took — the activity's quantity. */
  consumedMl: number;
  /** What was poured — what leaves the stash. Defaults to `consumedMl` (§7a). */
  offeredMl?: number;
  kind?: 'EBM' | 'FORMULA' | 'DONOR' | 'MIXED';
  notes?: string | null;
  intentId?: string;
  activityId?: string;
  dedupeWindowMs?: number;
  /** The §6b ranking, when the sheet has the profile; absent, the WP5 order. */
  rank?: RankOptions;
}

export interface BottleFromStashResult extends WriteOutcome {
  /** The id the write used. Selecting the entry by anything else is the §7d bug. */
  activityId: string;
  draws: StashDraw[];
  unaccountedMl: number;
}

/** The container fields §7d requires be put back if the entry is not created. */
interface ContainerSnapshot {
  rows: StashContainerRow[];
  ledgerRows: number;
}

async function snapshot(t: Tx, householdId: string): Promise<ContainerSnapshot> {
  const rows = await t.all<StashContainerRow>(
    `select ${CONTAINER_COLUMNS} from milk_containers where household_id = ? order by id`,
    [householdId],
  );
  const count = await t.get<{ n: number }>(
    'select count(*) as n from milk_inventory_transactions where household_id = ?',
    [householdId],
  );
  return { rows, ledgerRows: count?.n ?? 0 };
}

/**
 * Put every snapshotted field back and prove the ledger did not grow.
 *
 * Reached only when the write did not commit. It is a no-op in the ordinary case — the
 * transaction rolled back — and that is the point: if it is ever NOT a no-op, something
 * outside the transaction touched the stash, and the error names it here rather than letting
 * the number drift.
 */
async function restore(t: Tx, householdId: string, before: ContainerSnapshot): Promise<void> {
  for (const row of before.rows) {
    await t.run('update milk_containers set amount_ml = ?, status = ?, used_at = ? where id = ?', [
      row.amount_ml,
      row.status,
      row.used_at,
      row.id,
    ]);
  }
  const after = await t.get<{ n: number }>(
    'select count(*) as n from milk_inventory_transactions where household_id = ?',
    [householdId],
  );
  if ((after?.n ?? 0) !== before.ledgerRows) {
    throw new Error(
      `the stash draw was not committed but the ledger moved from ${before.ledgerRows} to ${after?.n ?? 0} rows`,
    );
  }
}

/** One ledger op and its local row, in the same shape `packages/core`'s chains produce. */
function ledgerEntry(
  base: {
    intentId: string;
    householdId: string;
    createdBy: string;
    clientEditedAt: string;
  },
  args: {
    tag: string;
    kind: MilkTxnKind;
    containerId: string;
    deltaMl: number;
    occurredAt: string;
    activityId: string | null;
    dependsOn: string | null;
    fromLocationId?: string | null;
    toLocationId?: string | null;
  },
): { row: LocalRow; op: ChainOp } {
  const id = deriveOpId(base.intentId, args.tag);
  const fields = {
    container_id: args.containerId,
    kind: args.kind,
    delta_ml: args.deltaMl,
    from_location_id: args.fromLocationId ?? null,
    to_location_id: args.toLocationId ?? null,
    activity_id: args.activityId,
    occurred_at: args.occurredAt,
    created_by: base.createdBy,
  };
  return {
    row: {
      table: 'milk_inventory_transactions',
      row: {
        id,
        client_op_id: id,
        household_id: base.householdId,
        ...fields,
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

/**
 * The tag each ledger op derives from (D7). The first draw is `'use'`, which makes a
 * single-container bottle byte-identical to `bottleFromStashChain`'s output; a walk that
 * crosses containers numbers the rest, and the write-off is `'rem'` exactly as §7c names it.
 * Every tag is a pure function of the intent and the walk, so a retry rebuilds the same ids.
 */
function useTag(index: number): string {
  return index === 0 ? 'use' : `use${index + 1}`;
}

export async function logBottleFromStash(
  db: Db,
  clock: Clock,
  input: BottleFromStashInput,
  deps: RepositoryDeps = {},
): Promise<BottleFromStashResult> {
  const intentId = input.intentId ?? newIntentId();
  const activityId = input.activityId ?? newEntityId();
  const offeredMl = input.offeredMl ?? input.consumedMl;
  const clientEditedAt = clock.iso();

  const before = await db.tx(t => snapshot(t, input.householdId));
  const plan = await db.tx(async t =>
    planDraw(await rankContainers(t, input.householdId, input.rank), offeredMl),
  );

  const base = {
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt,
  };
  const activity = {
    id: activityId,
    childId: input.childId,
    type: 'bottle' as const,
    startAt: input.startAt,
    quantity: input.consumedMl,
    canonicalUnit: 'ml' as const,
    notes: input.notes ?? null,
    detail: {
      table: 'bottle_details' as const,
      fields: {
        kind: input.kind ?? 'EBM',
        offered_ml: offeredMl,
        consumed_ml: input.consumedMl,
        from_stash: true,
        container_id: plan.draws[0]?.containerId ?? null,
      },
    },
  };

  // The first draw goes through the core chain builder so the common case cannot drift from
  // it; the rest of the walk is appended below in the same shapes. With nothing in the stash
  // there is no draw at all and the bottle is an ordinary activity — the feed is never blocked
  // by bookkeeping (§7b).
  const first = plan.draws[0];
  const chain: Chain =
    first === undefined
      ? simpleActivityChain(base, activity)
      : bottleFromStashChain({
          ...base,
          activity,
          containerId: first.containerId,
          consumedMl: first.ml,
          occurredAt: input.startAt,
        });

  for (let i = 1; i < plan.draws.length; i += 1) {
    const draw = plan.draws[i];
    if (draw === undefined) continue;
    const entry = ledgerEntry(base, {
      // `useTag` is the ledger tag for a draw, not a hook — the stash vocabulary collides
      // with React's naming convention (see eslint.config.mjs)
      // eslint-disable-next-line react-hooks/rules-of-hooks
      tag: useTag(i),
      kind: 'USE',
      containerId: draw.containerId,
      deltaMl: -draw.ml,
      occurredAt: input.startAt,
      activityId,
      dependsOn: intentId,
    });
    chain.rows.push(entry.row);
    chain.ops.push(entry.op);
  }

  if (plan.remainder !== null) {
    const entry = ledgerEntry(base, {
      tag: 'rem',
      kind: 'ADJUST',
      containerId: plan.remainder.containerId,
      deltaMl: -plan.remainder.ml,
      occurredAt: input.startAt,
      // TIED TO THE BOTTLE THAT CAUSED IT (the audit of 2026-09-24): a write-off with no activity
      // could not be found again, so deleting the bottle put back what was drawn but not the few
      // ml written off beside it — a 125 ml bag came back as 120 ml. With the link, the delete can
      // return every row this bottle took (data/entries.ts reads them by `activity_id`).
      activityId,
      dependsOn: intentId,
    });
    chain.rows.push(entry.row);
    chain.ops.push(entry.op);
  }

  // The optimistic balance. On the server `amount_ml` is the balance trigger's alone; locally
  // the mirror has to show the deduction at once or the stash card lies until the next pull.
  const closing: ChainOp[] = [];
  for (const draw of plan.draws) {
    const container = before.rows.find(c => c.id === draw.containerId);
    if (container === undefined) continue;
    const written =
      draw.ml + (plan.remainder?.containerId === draw.containerId ? plan.remainder.ml : 0);
    const left = container.amount_ml - written;
    chain.rows.push({
      table: 'milk_containers',
      row: {
        id: draw.containerId,
        amount_ml: left,
        ...(left <= 0 ? { status: 'USED', used_at: input.startAt } : {}),
        updated_at: clientEditedAt,
      },
    });
    /*
      A BAG THIS BOTTLE EMPTIED IS CLOSED ON THE SERVER TOO (the audit of 2026-09-24, feeding H3;
      the sync sweep, S2). It was marked USED on this phone only: the server's balance trigger
      sets the amount and never the status, so the next pull brought it back as a 0 oz bag in the
      stash list and its count — and a location holding it could not be deleted. The patch goes
      ahead of the ledger rows (`closingPatch`).
    */
    if (left <= 0) {
      closing.push(
        closingPatch(
          base,
          emptiedPatchId(activityId, draw.containerId),
          draw.containerId,
          input.startAt,
          intentId,
        ),
      );
    }
  }
  // right behind the activity it depends on, ahead of every ledger row of this write
  chain.ops.splice(1, 0, ...closing);

  const outcome = await commitWrite(
    db,
    clock,
    {
      intentId,
      chain,
      source: input.source,
      dedupe: {
        key: dedupeKey('bottle', input.childId, String(offeredMl)),
        windowMs: input.dedupeWindowMs ?? DEDUPE_WINDOW_MS,
      },
      invalidates: [
        ...activityKeys(input.householdId, input.childId, 'bottle'),
        keys.stash(input.householdId),
        ...plan.draws.map(d => keys.container(d.containerId)),
      ],
    },
    deps,
  );

  if (!outcome.committed) {
    await db.tx(t => restore(t, input.householdId, before));
    (deps.store ?? appStore).invalidate(keys.stash(input.householdId));
    return { ...outcome, activityId, draws: [], unaccountedMl: 0 };
  }
  /*
    THE CLOSING PATCHES ARE NOT THE PARENT'S TO UNDO, and they are left out of what the toast
    holds. Undo reverses a container op by removing the row it created or discarding it — right
    for a pump session's new bag, and ruinous for a patch to an existing one, which it would have
    DELETED from this phone. Taking the bottle back puts its milk back through the ledger rows it
    does hold, and `returnToContainer` (undo.ts) settles the patch there: cancelled while it has
    not been sent, reopened by a STORED patch once it has.
  */
  const closed = new Set(closing.map(op => op.client_op_id));
  const closedContainers = new Set(closing.map(op => op.entity_id));
  return {
    ...outcome,
    opIds: outcome.opIds.filter(id => !closed.has(id)),
    entityIds: outcome.entityIds.filter(id => !closedContainers.has(id)),
    activityId,
    draws: plan.draws,
    unaccountedMl: plan.unaccountedMl,
  };
}

/* ----------------------------------------------------------------- pump → stash */

export type PumpDestination = 'store' | 'some' | 'all';

/** One container of a split: what it holds and where it goes (MILK_STASH.md §2). */
export interface StoredPart {
  /** Whole ml, converted from the parent's unit once; the last container holds the rest. */
  ml: number;
  locationId: string;
}

/** A container this write created for the stored part, in the order the sheet listed them. */
export interface StoredSplitPart extends StoredPart {
  containerId: string;
}

/**
 * A SPLIT NAMED A PLACE THIS PHONE CANNOT STORE MILK IN: gone (deleted by the other parent while
 * the sheet was open), another household's, or the thawing place, which is a condition rather
 * than somewhere a session is put. Refused before anything is written, like a pumped time later
 * than now (`PumpedLaterThanNowError`): moving milk meant for the counter into the default fridge
 * would date it four days where the parent's milk has four hours, the one direction the stash may
 * never be wrong in. The sheet re-homes a vanished place itself, so this is the last line.
 */
export class StorePlaceGoneError extends RangeError {
  constructor(locationId: string) {
    super(`no storage place ${locationId} to put this milk in`);
    this.name = 'StorePlaceGoneError';
  }
}

export interface StorePumpSessionInput extends WriteContext {
  /** The session, as the pump sheet captured it. */
  startAt: string;
  endAt: string | null;
  leftMl: number | null;
  rightMl: number | null;
  /**
   * A pump that reports one number and no sides ("Total only" on the sheet): the total is
   * written with both sides null and `sides = 'BOTH'`, which is the honest row — both sides
   * were pumped, the split is unknown. Inventing a per-side split would be a claim the parent
   * never made. When set, `leftMl` and `rightMl` are ignored.
   */
  totalOnlyMl?: number | null;
  notes?: string | null;
  isPrivate?: boolean;
  /** The running timer this session ends, if it came from one: its row goes in the same write. */
  timerId?: string | null;
  /** `Choose where it goes` (true) or `Save session only` (false). */
  store: boolean;
  /**
   * Where the session goes (MILK_STASH.md §6d): all of it stored; some fed now and the rest
   * stored; or all of it into a bottle, with the feed logged. Default `'store'`.
   */
  destination?: PumpDestination;
  /** Where the stored part goes. Absent: the household's default location. */
  locationId?: string | null;
  containerType?: ContainerType;
  /**
   * The split in two, as it shipped first: the first part in ml, converted from the display once,
   * and the second the remainder, both in `locationId` (§2). Kept for the callers that say a split
   * in one number; the sheet says it with `parts`.
   */
  split?: { part1Ml: number } | null;
  /**
   * THE STORED PART IN SEVERAL CONTAINERS, EACH WITH ITS OWN AMOUNT AND PLACE (the owner,
   * 2026-09-29: *"split into 3 different bottles, with 2 left in counter (4hours), and 1 in the
   * fridge"*). In the order the sheet listed them, one to `MAX_SPLIT_PARTS`, adding up to the
   * stored part exactly (core `checkSplitParts`, which refuses anything else before a row is
   * written). Given, it decides where the stored part goes, and `split` and `locationId` are not
   * read. One part is a session kept as one, in that part's place.
   */
  parts?: readonly StoredPart[] | null;
  /** `Feed some`: what goes into a bottle now, in ml. */
  feedNowMl?: number;
  /**
   * The ROOM location a fed part is poured into (§6a: milk that is out is a real container with
   * a real window). The sheet resolves it — creating "Counter" when it may — before saving;
   * without one, a fed part is logged as a plain bottle and nothing is stored for it.
   */
  roomLocationId?: string | null;
  /** `Feed it all`: whose bottle. */
  childId?: string | null;
  intentId?: string;
  activityId?: string;
}

export interface StorePumpSessionResult extends WriteOutcome {
  activityId: string;
  /** The first stored container; null when nothing could be stored. */
  containerId: string | null;
  /** Every container this write created, stored parts first. */
  containerIds: string[];
  /**
   * The stored part as it was written: each container, what it holds and where, in order. What
   * the toast says and where the moment lands are read off this, never off what was asked for.
   */
  storedParts: StoredSplitPart[];
  /** The ROOM container a fed part went into, for the bottle sheet to point at. */
  feedContainerId: string | null;
  /** `Feed it all`: the bottle this write logged. */
  bottleActivityId: string | null;
}

/** The household's default storage location, or its first; null when none is set up yet. */
export async function defaultLocationId(t: Tx, householdId: string): Promise<string | null> {
  const row = await t.get<{ id: string }>(
    `select id from storage_locations
      where household_id = ? and deleted_at is null and kind <> 'THAWED'
      order by is_default desc, sort_order asc, id asc limit 1`,
    [householdId],
  );
  return row?.id ?? null;
}

/** The first freezer entry is the moment the milk lands in one (§5); a plain location has none. */
const firstFrozenFor = (kind: MilkStorageKind | null, at: string): string | null =>
  kind !== null && isFrozenKind(kind) ? at : null;

/**
 * `Choose where it goes` (PRODUCT_SPEC.md §6.3; MILK_STASH.md §6d): the pump activity and
 * whatever the destination asks for — one transaction, so inventory moves EXACTLY once per
 * session. `stored_to_stash` is written true on the detail row in the same write, which is the
 * flag the sheet reads to refuse a second store.
 *
 *   store   one container, or up to six for a split (§2: each but the last once from the display,
 *           the last the remainder), each in its own place (`parts`), `first_frozen_at` set on
 *           each that goes into a freezer
 *   some    the stored part as above, and a ROOM container for the fed part; the bottle sheet
 *           opens next pointed at it (the feed is the parent's to confirm or change)
 *   all     a ROOM container for the whole session, drawn to zero by the bottle this write
 *           logs — pumped → poured → fed, so the ledger reconciles and a feed never appears
 *           from nowhere. The bottle's detail carries `container_id: null`: the server applies
 *           activities before containers in one batch, and a detail naming a container that is
 *           not there yet fails its foreign key; the USE row is what ties the two.
 *
 * With a running timer the timer's DELETE rides in the same chain (the shape `timerStopChain`
 * gives it, with `metadata.timer_id` on the activity so two devices stopping the same session
 * offline collapse to one — D26).
 */
export async function storePumpSession(
  db: Db,
  clock: Clock,
  input: StorePumpSessionInput,
  deps: RepositoryDeps = {},
): Promise<StorePumpSessionResult> {
  const intentId = input.intentId ?? newIntentId();
  const activityId = input.activityId ?? newEntityId();
  const clientEditedAt = clock.iso();
  /*
    AN END IS NEVER BEFORE ITS START — the guard `stopTimer` has (data/timers.ts), on the one timer
    stop that does not go through it (2026-09-25). A session ending before it began was saved here
    and then refused by the server for good (`activity_time_sane`: end_at >= start_at): every retry
    refused again, so it never reached the household, and a running timer's DELETE rode in the same
    chain. Two ways in: a pump timer started on the other parent's phone, whose clock runs fast,
    finished here soon after; and a start corrected in the pump sheet to after its frozen stop —
    which `RunningPanel` now refuses with a word, as `LongRunCard` refuses an end before the start.
    What still arrives is clamped to a session of no length, as `stopTimer` clamps it, rather than
    written to be refused.
  */
  const endAt: string | null =
    typeof input.endAt === 'string' && Date.parse(input.endAt) < Date.parse(input.startAt)
      ? input.startAt
      : (input.endAt ?? null);
  const totalOnly = input.totalOnlyMl != null && input.totalOnlyMl > 0;
  const leftMl = totalOnly ? null : input.leftMl;
  const rightMl = totalOnly ? null : input.rightMl;
  const totalMl = totalOnly ? (input.totalOnlyMl ?? 0) : (leftMl ?? 0) + (rightMl ?? 0);
  const destination: PumpDestination = input.destination ?? 'store';
  const wantsStash = input.store && totalMl > 0;
  const asked = input.parts ?? [];
  const splitAsked = asked.length > 0;

  // where the parts go: the stored part to the chosen or default location, a fed part to ROOM
  const storeLocationId =
    wantsStash && !splitAsked
      ? (input.locationId ?? (await db.tx(t => defaultLocationId(t, input.householdId))))
      : null;
  const storeLocation =
    storeLocationId === null ? undefined : await locationById(db, storeLocationId);
  const roomLocationId = input.roomLocationId ?? null;
  const roomLocation = roomLocationId === null ? undefined : await locationById(db, roomLocationId);
  const canPour = roomLocation !== undefined && roomLocation.deleted_at === null;

  const { feedMl, storeMl } = !wantsStash
    ? { feedMl: 0, storeMl: 0 }
    : destination === 'all'
      ? feedSplit(totalMl, totalMl)
      : destination === 'some'
        ? feedSplit(totalMl, Math.min(totalMl, Math.max(0, input.feedNowMl ?? 0)))
        : feedSplit(totalMl, 0);

  /*
    EACH STORED CONTAINER AND ITS PLACE, decided before a row is written (the owner, 2026-09-29).
    A split the sheet sends is taken as sent or not at all: it has to add up to the stored part
    exactly (`checkSplitParts`), and every place it names has to be one this household can put milk
    in (`StorePlaceGoneError`). Either refusal throws here, with nothing written — the same as an
    overdraw would, and never a split rounded into shape or milk re-homed to a colder shelf.

    Without `parts` it is the shape every other caller has always used: the chosen or default
    place, the session kept as one or split in two there, and nothing stored when that place is
    gone, as before (the session itself is still saved).
  */
  const stored: { ml: number; location: LocationRow }[] = [];
  if (storeMl > 0 && splitAsked) {
    checkSplitParts(
      storeMl,
      asked.map(p => p.ml),
    );
    for (const part of asked) {
      const location = await locationById(db, part.locationId);
      if (
        location === undefined ||
        location.deleted_at !== null ||
        location.household_id !== input.householdId ||
        location.kind === 'THAWED'
      ) {
        throw new StorePlaceGoneError(part.locationId);
      }
      stored.push({ ml: part.ml, location });
    }
  } else if (storeMl > 0 && storeLocation !== undefined && storeLocation.deleted_at === null) {
    for (const ml of splitSession(storeMl, input.split?.part1Ml ?? null)) {
      stored.push({ ml, location: storeLocation });
    }
  }
  const stores = stored.length > 0;
  const pours = feedMl > 0 && canPour;

  const base = {
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt,
  };
  const isPrivateSession = await privateByDefault(db, input.householdId, input.createdBy, 'pump');
  // a session with no amount on either side is not a right-side session: `BOTH` is the column's
  // own default and claims no side (the audit of 2026-09-24, feeding C13 — "Save session only" at
  // 0, and a Schedule pump with no amount, were both written as RIGHT)
  const rightOrNeither = rightMl ? 'RIGHT' : 'BOTH';
  const timerMeta = input.timerId ? { timer_id: input.timerId } : {};
  const activity = {
    id: activityId,
    childId: null,
    type: 'pump' as const,
    startAt: input.startAt,
    endAt,
    quantity: totalMl,
    canonicalUnit: 'ml' as const,
    notes: input.notes ?? null,
    /* Mom privacy, on the path that does NOT go through `logActivity`: a pump that ends in the
       stash sheet builds its activity here, so the setting has to be read here too or a
       household with pumping private would leak exactly the sessions that produced milk
       (docs/SECURITY.md §4). The container the session creates is untouched — the session is
       private, the milk is shared. */
    isPrivate: input.isPrivate ?? isPrivateSession,
    metadata: timerMeta,
    detail: {
      table: 'pump_details' as const,
      fields: {
        sides: totalOnly || (leftMl && rightMl) ? 'BOTH' : leftMl ? 'LEFT' : rightOrNeither,
        left_ml: leftMl,
        right_ml: rightMl,
        total_ml: totalMl,
        stored_to_stash: stores || pours,
      },
    },
  };

  const containerIds: string[] = [];
  const storedParts: StoredSplitPart[] = [];
  const chain: Chain = simpleActivityChain(base, activity);
  const containerType = input.containerType ?? 'BAG';
  const invalidates = [...activityKeys(input.householdId, null, 'pump')];

  /*
    THE STORED PART: one container, or one per part of a split, lettered 'a' to 'f' in the order the
    sheet listed them (`splitPartTag`), each in its own place. One container CREATE and one ADD per
    container, every id derived from the intent — so a replay rebuilds the same rows and the outbox
    swallows them, and one Undo takes back every container the write made. A split in two writes
    exactly the ids it always has.
  */
  stored.forEach(({ ml, location }, i) => {
    const tag = stored.length === 1 ? undefined : splitPartTag(i);
    const id = deriveOpId(intentId, tag === undefined ? 'container-id' : `container-id:${tag}`);
    containerIds.push(id);
    storedParts.push({ containerId: id, ml, locationId: location.id });
    const added = containerAddChain({
      ...base,
      sourceActivityId: activityId,
      tag,
      dependsOn: intentId,
      container: {
        id,
        ownerId: input.createdBy,
        locationId: location.id,
        containerType,
        initialMl: ml,
        pumpedAt: input.startAt,
        // each container's own place: the one in the freezer is frozen now, the counter's is not
        firstFrozenAt: firstFrozenFor(location.kind, clientEditedAt),
      },
    });
    chain.rows.push(...added.rows, {
      table: 'milk_containers',
      row: { id, amount_ml: ml, updated_at: clientEditedAt },
    });
    chain.ops.push(...added.ops);
  });

  /**
   * THE FED PART: A ROOM CONTAINER, AND THE BOTTLE THAT EMPTIES IT — for `some` as well as for
   * `all` (the owner, 2026-09-20: "when pumping and selecting save and add to stash, then feed
   * some, after the pump is saved, the popup for bottle is then shown with the amount selected
   * during the entry before. why does this need to be manually recorded? just make it
   * automatically recorded in the bottle module as well").
   *
   * `Feed it all` already wrote the bottle; `Feed some` created the counter container and then
   * reopened the bottle sheet with the same number already typed into it, asking the parent to
   * confirm a fact they had just stated on the previous sheet. Two sheets for one pour, and the
   * second one could be dismissed — which left milk sitting on a counter in the ledger with no
   * feed against it. Nothing about the two answers made them different: `feedMl` is what was
   * poured either way, and what was poured is what the baby is being given.
   *
   * IT STAYS ONE TRANSACTION, which is the point: the pump, the stored part, the counter
   * container and the bottle commit together or not at all, and one Undo takes back all of it.
   * A parent whose baby did not finish it edits the entry from the log, where the bottle sheet's
   * own `Some left` control says it in one tap.
   */
  let feedContainerId: string | null = null;
  let bottleActivityId: string | null = null;
  const fedAt = endAt ?? input.startAt;
  if (pours && roomLocation !== undefined) {
    feedContainerId = deriveOpId(intentId, 'container-id:feed');
    const added = containerAddChain({
      ...base,
      sourceActivityId: activityId,
      tag: 'feed',
      dependsOn: intentId,
      container: {
        id: feedContainerId,
        ownerId: input.createdBy,
        locationId: roomLocation.id,
        containerType: 'BOTTLE',
        initialMl: feedMl,
        pumpedAt: input.startAt,
        firstFrozenAt: null,
      },
    });
    /*
      THE COUNTER BOTTLE IS CREATED CLOSED (the sync sweep of 2026-09-24, S2; feeding H3). It is
      poured and drunk in this same write, so it is USED from the moment it exists — and it has to
      be SAID in its CREATE: a patch after the CREATE cannot share its batch (one op per row in
      flight) and reaches the server after the ledger rows have re-stamped it, where
      last-writer-wins drops it. It used to come back from the server as a 0 oz bag on the counter.
    */
    for (const op of added.ops) {
      if (op.entity === 'container' && op.op === 'CREATE' && op.entity_id === feedContainerId) {
        op.payload = { ...op.payload, status: 'USED', used_at: fedAt };
      }
    }
    chain.rows.push(...added.rows);
    chain.ops.push(...added.ops);
    {
      bottleActivityId = deriveOpId(intentId, 'bottle-activity');
      const bottleIntent = deriveOpId(intentId, 'bottle');
      const bottleBase = { ...base, intentId: bottleIntent };
      const bottle = bottleFromStashChain({
        ...bottleBase,
        activity: {
          id: bottleActivityId,
          childId: input.childId ?? null,
          type: 'bottle',
          startAt: fedAt,
          quantity: feedMl,
          canonicalUnit: 'ml',
          notes: null,
          detail: {
            table: 'bottle_details',
            fields: {
              kind: 'EBM',
              offered_ml: feedMl,
              consumed_ml: feedMl,
              from_stash: true,
              container_id: null,
            },
          },
        },
        containerId: feedContainerId,
        consumedMl: feedMl,
        occurredAt: fedAt,
      });
      chain.rows.push(...bottle.rows, {
        table: 'milk_containers',
        row: {
          id: feedContainerId,
          amount_ml: 0,
          status: 'USED',
          used_at: fedAt,
          updated_at: clientEditedAt,
        },
      });
      chain.ops.push(...bottle.ops);
      invalidates.push(...activityKeys(input.householdId, input.childId ?? null, 'bottle'));
    }
  } else if (feedMl > 0 && wantsStash) {
    /*
      NO COUNTER TO POUR INTO, AND THE FEED IS STILL LOGGED (the audit of 2026-09-24, feeding C5).
      "Feed it all" and "Feed some" need a ROOM location to hold the poured milk, and a caregiver
      cannot add one; the fed part used to vanish — no bottle, no container — under a toast that
      said "logged as a bottle". It is now exactly that: a plain bottle for what was fed, in this
      same write, which is what the toast, the hint and this function's own contract promise.
    */
    bottleActivityId = deriveOpId(intentId, 'bottle-activity');
    const bottle = simpleActivityChain(
      { ...base, intentId: deriveOpId(intentId, 'bottle') },
      {
        id: bottleActivityId,
        childId: input.childId ?? null,
        type: 'bottle',
        startAt: fedAt,
        quantity: feedMl,
        canonicalUnit: 'ml',
        notes: null,
        detail: {
          table: 'bottle_details',
          fields: {
            kind: 'EBM',
            offered_ml: feedMl,
            consumed_ml: feedMl,
            from_stash: false,
            container_id: null,
          },
        },
      },
    );
    chain.rows.push(...bottle.rows);
    chain.ops.push(...bottle.ops);
    invalidates.push(...activityKeys(input.householdId, input.childId ?? null, 'bottle'));
  }

  if (input.timerId) {
    chain.ops.push({
      client_op_id: deriveOpId(intentId, 'stop'),
      entity: 'timer',
      op: 'DELETE',
      entity_id: input.timerId,
      household_id: input.householdId,
      payload: { timer_id: input.timerId, client_edited_at: clientEditedAt },
      depends_on: intentId,
    });
  }
  if (stores || pours) invalidates.push(keys.stash(input.householdId));
  if (input.timerId) invalidates.push(keys.timers(input.householdId));

  /*
    A DOUBLE TAP ON "SAVE SESSION" IS ONE SESSION (the stash sweep of 2026-09-24; OFFLINE_SYNC §9
    row 17b). Every other capture path carries the duplicate guard and a session typed in by hand
    had none: the pump sheet's Save closes the sheet only after its write, so a quick second tap
    wrote the session again and Today's "Pumped" and Reports read double. The key is what was
    entered — the MINUTE the session started and its amounts. The minute and not the instant,
    because a session's end is held at the sheet's clock when it would pass it (`pumpSession`), so
    two taps that straddle a tick of that clock start a moment apart. A session that ends a timer
    is left as `stopTimer` leaves every stop: its timer is its identity (D26), held in flight by
    `useTimerActions` and deduplicated by the server.
  */
  const guard = input.timerId
    ? {}
    : {
        dedupe: {
          key: dedupeKey(
            'pump',
            null,
            `${Math.floor(Date.parse(input.startAt) / 60_000)}:${leftMl ?? '-'}:${rightMl ?? '-'}:${totalMl}`,
          ),
          windowMs: DEDUPE_WINDOW_MS,
        },
      };
  const outcome = await commitWrite(
    db,
    clock,
    {
      intentId,
      chain,
      source: input.source,
      ...(input.timerId ? { localDeletes: [{ table: 'running_timers', id: input.timerId }] } : {}),
      ...guard,
      invalidates,
    },
    deps,
  );
  return {
    ...outcome,
    activityId,
    containerId: containerIds[0] ?? null,
    containerIds,
    storedParts,
    feedContainerId,
    bottleActivityId,
  };
}

/* ----------------------------------------------------------- milk added by hand */

export interface AddStoredMilkInput extends WriteContext {
  locationId: string;
  containerType?: ContainerType;
  amountMl: number;
  pumpedAt: string;
  /** For a freezer location: when it went in. The sheet asks; nothing here guesses (§5). */
  firstFrozenAt?: string | null;
  notes?: string | null;
  intentId?: string;
  containerId?: string;
}

export interface AddStoredMilkResult extends WriteOutcome {
  containerId: string;
}

/** A minute of slack for "now", as the time picks allow: a phone's seconds may run ahead. */
const PUMPED_SLACK_MS = 60_000;

/**
 * MILK IS NEVER ADDED AS PUMPED LATER THAN NOW (2026-09-25). Every date the stash shows for a
 * container — best use, the guidance limit — counts from `pumped_at` (MILK_STASH §5), so a pumped
 * time in the future moves them LATER than the published windows allow: the one direction the
 * stash must never be wrong in. `Add stored milk` saved exactly that for a Today time later than
 * now; the sheet now reads one as last night (`sheets/stash/pumpedAt.ts`, D13), and this refuses
 * one that reaches the write anyway — an older build, a caller that forgot — before anything is
 * written. The sheet shows its own sentence for it (`ADD_SHEET.pumpedLater`).
 */
export class PumpedLaterThanNowError extends RangeError {
  constructor() {
    super('milk cannot be added as pumped later than now');
    this.name = 'PumpedLaterThanNowError';
  }
}

/** `Add stored milk` (SHEETS.addstash): a container with no session behind it, and its ADD. */
export async function addStoredMilk(
  db: Db,
  clock: Clock,
  input: AddStoredMilkInput,
  deps: RepositoryDeps = {},
): Promise<AddStoredMilkResult> {
  if (Date.parse(input.pumpedAt) > clock.now() + PUMPED_SLACK_MS) {
    throw new PumpedLaterThanNowError();
  }
  const intentId = input.intentId ?? newIntentId();
  const containerId = input.containerId ?? deriveOpId(intentId, 'container-id');
  const clientEditedAt = clock.iso();
  const location = await locationById(db, input.locationId);
  if (location === undefined || location.deleted_at !== null) {
    throw new RangeError('milk cannot be added to a location that is not there');
  }
  const frozen = isFrozenKind(location.kind);
  const chain = containerAddChain({
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt,
    sourceActivityId: null,
    container: {
      id: containerId,
      ownerId: input.createdBy,
      locationId: location.id,
      containerType: input.containerType ?? 'BAG',
      initialMl: input.amountMl,
      pumpedAt: input.pumpedAt,
      firstFrozenAt: frozen ? (input.firstFrozenAt ?? input.pumpedAt) : null,
      notes: input.notes ?? null,
    },
  });
  chain.rows.push({
    table: 'milk_containers',
    row: { id: containerId, amount_ml: input.amountMl, updated_at: clientEditedAt },
  });
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: [keys.stash(input.householdId)] },
    deps,
  );
  return { ...outcome, containerId };
}

/* --------------------------------------------------------------- one container */

/** The rows and ops one container patch takes: the mirror's columns, and the op's payload. */
function containerPatch(
  base: { intentId: string; householdId: string; clientEditedAt: string },
  containerId: string,
  patch: Record<string, unknown>,
  tag?: string,
): { row: LocalRow; op: ChainOp } {
  return {
    row: {
      table: 'milk_containers',
      row: { id: containerId, ...patch, updated_at: base.clientEditedAt },
    },
    op: {
      client_op_id: tag === undefined ? base.intentId : deriveOpId(base.intentId, tag),
      entity: 'container',
      op: 'UPDATE',
      entity_id: containerId,
      household_id: base.householdId,
      payload: { ...patch, client_edited_at: base.clientEditedAt },
      depends_on: null,
    },
  };
}

async function requireContainer(db: Db, containerId: string): Promise<ContainerRow> {
  const c = await containerById(db, containerId);
  if (c === undefined) throw new RangeError(`no container ${containerId}`);
  if (c.status !== 'STORED' && c.status !== 'THAWING') {
    throw new RangeError(`container ${containerId} is ${c.status.toLowerCase()} and cannot change`);
  }
  return c;
}

export interface MoveContainerInput extends WriteContext {
  containerId: string;
  toLocationId: string;
  intentId?: string;
}

export interface MoveContainerResult extends WriteOutcome {
  toKind: MilkStorageKind;
  /** The freeze date was set by this move — the first time the milk entered a freezer. */
  froze: boolean;
  /** Freezer to freezer: the freeze date stayed exactly what it was (acceptance test 12). */
  keptFreezeDate: boolean;
  /** Into the thawing location: `thawed_at` set now and the status THAWING. */
  thawing: boolean;
  /**
   * Out of a freezer and into a place that is not one: `thawed_at` set now, so in a plain fridge
   * the bag is on the thawed clock from this move (core `milkCondition`).
   */
  startedThaw: boolean;
  /**
   * Thawed milk back into a freezer (§6f) — an icy bag from the thawing place, or a bag that
   * thawed in the fridge: STORED, the freeze date untouched.
   */
  refrozen: boolean;
}

/**
 * `Move to` (SHEETS.container): one MOVE row with `delta_ml = 0` and both location ids —
 * or a THAW row when the milk thaws. `first_frozen_at` is set when the milk enters a freezer
 * for the FIRST time and never touched again; a THAWING container moved to a fridge keeps
 * `thawed_at` (its dates stay anchored on it) and becomes STORED.
 *
 * OUT OF A FREEZER IS THAWING (the owner, 2026-09-25: "Milk stash from freezer, yes make the
 * change"). A frozen bag moved straight to the plain fridge, without *Mark thawing*, used to be a
 * plain MOVE and was dated as fridge milk from the day it was pumped — so a bag frozen in August
 * read "Past window" the moment it reached the fridge, and the published file's own condition for
 * that milk, "Thawed, in refrigerator", never applied. It began thawing when it left the freezer,
 * wherever it went, so that is when `thawed_at` is set and the ledger says THAW. On the counter
 * nothing else changes — the file has no condition for thawed milk at room temperature, and the
 * counter stays dated from the pump (`milkCondition`) — but a bag that goes on from the counter to
 * the fridge is dated from when it left the freezer, not from August. A later exit from a freezer
 * sets it again: a bag refrozen with ice still in it starts a new thaw when it next comes out.
 */
export async function moveContainer(
  db: Db,
  clock: Clock,
  input: MoveContainerInput,
  deps: RepositoryDeps = {},
): Promise<MoveContainerResult> {
  const intentId = input.intentId ?? newIntentId();
  const clientEditedAt = clock.iso();
  const c = await requireContainer(db, input.containerId);
  const to = await locationById(db, input.toLocationId);
  if (to === undefined || to.deleted_at !== null) {
    throw new RangeError('milk cannot be moved to a location that is not there');
  }
  if (to.id === c.location_id) throw new RangeError('the container is already there');
  const base = { intentId, householdId: input.householdId, clientEditedAt };
  const ledgerBase = {
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    clientEditedAt,
  };
  const invalidates = [keys.stash(input.householdId), keys.container(c.id)];

  if (to.kind === 'THAWED') {
    const chain = containerThawChain({
      ...ledgerBase,
      deviceId: input.deviceId,
      containerId: c.id,
      toLocationId: to.id,
      fromLocationId: c.location_id,
      thawedAt: clientEditedAt,
    });
    const outcome = await commitWrite(
      db,
      clock,
      { intentId, chain, source: input.source, invalidates },
      deps,
    );
    return {
      ...outcome,
      toKind: to.kind,
      froze: false,
      keptFreezeDate: false,
      thawing: true,
      startedThaw: false,
      refrozen: false,
    };
  }

  const fromFrozen = c.location_kind !== null && isFrozenKind(c.location_kind);
  const toFrozen = isFrozenKind(to.kind);
  const froze = toFrozen && c.first_frozen_at === null;
  const startedThaw = fromFrozen && !toFrozen;
  const refrozen = toFrozen && !fromFrozen && (c.status === 'THAWING' || c.thawed_at !== null);
  const patch: Record<string, unknown> = { location_id: to.id };
  if (froze) patch['first_frozen_at'] = clientEditedAt;
  if (startedThaw) patch['thawed_at'] = clientEditedAt;
  if (c.status === 'THAWING') patch['status'] = 'STORED';
  const moved = containerPatch(base, c.id, patch);
  const move = ledgerEntry(ledgerBase, {
    tag: startedThaw ? 'thaw' : 'move',
    kind: startedThaw ? 'THAW' : 'MOVE',
    containerId: c.id,
    deltaMl: 0,
    occurredAt: clientEditedAt,
    activityId: null,
    fromLocationId: c.location_id,
    toLocationId: to.id,
    dependsOn: intentId,
  });
  const chain: Chain = { rows: [moved.row, move.row], ops: [moved.op, move.op] };
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates },
    deps,
  );
  return {
    ...outcome,
    toKind: to.kind,
    froze,
    keptFreezeDate: fromFrozen && toFrozen && c.first_frozen_at !== null,
    thawing: false,
    startedThaw,
    refrozen,
  };
}

export interface SplitContainerInput extends WriteContext {
  containerId: string;
  /** What goes into the new container, in ml; the rest stays. */
  ml: number;
  intentId?: string;
  childId?: string;
}

export interface SplitContainerResult extends WriteOutcome {
  childContainerId: string;
}

/**
 * Splitting a STORED container (acceptance test 11.7): a child with the parent's
 * `pumped_at`, `first_frozen_at` and `thawed_at`, `SPLIT −n` on the parent and `SPLIT +n`
 * on the child. The household total does not move.
 */
export async function splitContainer(
  db: Db,
  clock: Clock,
  input: SplitContainerInput,
  deps: RepositoryDeps = {},
): Promise<SplitContainerResult> {
  const intentId = input.intentId ?? newIntentId();
  const clientEditedAt = clock.iso();
  const c = await requireContainer(db, input.containerId);
  if (!Number.isInteger(input.ml) || input.ml <= 0 || input.ml >= c.amount_ml) {
    throw new RangeError(`a split takes between 1 and ${c.amount_ml - 1} ml, got ${input.ml}`);
  }
  const childId = input.childId ?? deriveOpId(intentId, 'child-id');
  const ledgerBase = {
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    clientEditedAt,
  };
  const childOpId = deriveOpId(intentId, 'child');
  const childRow: LocalRow = {
    table: 'milk_containers',
    row: {
      id: childId,
      household_id: input.householdId,
      owner_id: c.owner_id,
      source_activity_id: c.source_activity_id,
      location_id: c.location_id,
      container_type: c.container_type,
      amount_ml: input.ml,
      initial_ml: input.ml,
      pumped_at: c.pumped_at,
      first_frozen_at: c.first_frozen_at,
      thawed_at: c.thawed_at,
      opened_at: null,
      used_at: null,
      discarded_at: null,
      discard_reason: null,
      status: c.status,
      label_code: null,
      notes: c.notes,
      created_by: input.createdBy,
      created_at: clientEditedAt,
      updated_at: clientEditedAt,
    },
  };
  const childOp: ChainOp = {
    client_op_id: childOpId,
    entity: 'container',
    op: 'CREATE',
    entity_id: childId,
    household_id: input.householdId,
    payload: {
      owner_id: c.owner_id,
      source_activity_id: c.source_activity_id,
      location_id: c.location_id,
      container_type: c.container_type,
      initial_ml: input.ml,
      pumped_at: c.pumped_at,
      first_frozen_at: c.first_frozen_at,
      // a thawing bag's half is thawing from the same moment (the sync sweep of 2026-09-24, S3)
      thawed_at: c.thawed_at,
      status: c.status,
      label_code: null,
      notes: c.notes,
      client_edited_at: clientEditedAt,
    },
    depends_on: null,
  };
  const out = ledgerEntry(ledgerBase, {
    tag: 'split:out',
    kind: 'SPLIT',
    containerId: c.id,
    deltaMl: -input.ml,
    occurredAt: clientEditedAt,
    activityId: null,
    dependsOn: childOpId,
  });
  const into = ledgerEntry(ledgerBase, {
    tag: 'split:in',
    kind: 'SPLIT',
    containerId: childId,
    deltaMl: input.ml,
    occurredAt: clientEditedAt,
    activityId: null,
    dependsOn: childOpId,
  });
  const rows: LocalRow[] = [
    childRow,
    out.row,
    into.row,
    {
      table: 'milk_containers',
      row: { id: c.id, amount_ml: c.amount_ml - input.ml, updated_at: clientEditedAt },
    },
  ];
  /*
    THE CHILD'S THAW TIME RIDES IN ITS CREATE, and nowhere else (the sync sweep of 2026-09-24, S3).
    It used to follow in a patch — and a patch to a container cannot share a batch with the
    container's own CREATE, so it reached the server after the CREATE and the SPLIT rows had
    stamped the row, and last-writer-wins dropped it: the half of a thawing bag came back with no
    thaw time, even online. (The server's CREATE has to read `thawed_at` for it to stay; that half
    is the server's, and is recorded in this change's report.)
  */
  const ops: ChainOp[] = [childOp, out.op, into.op];
  const outcome = await commitWrite(
    db,
    clock,
    {
      intentId,
      chain: { rows, ops },
      source: input.source,
      invalidates: [keys.stash(input.householdId), keys.container(c.id)],
    },
    deps,
  );
  return { ...outcome, childContainerId: childId };
}

export interface AdjustContainerInput extends WriteContext {
  containerId: string;
  /** What the container really holds, in ml. */
  amountMl: number;
  intentId?: string;
}

export interface AdjustContainerResult extends WriteOutcome {
  deltaMl: number;
}

/** Correcting a mistyped amount: one ADJUST by the difference, never a rewrite (§3 rule 3). */
export async function adjustContainer(
  db: Db,
  clock: Clock,
  input: AdjustContainerInput,
  deps: RepositoryDeps = {},
): Promise<AdjustContainerResult> {
  const intentId = input.intentId ?? newIntentId();
  const clientEditedAt = clock.iso();
  const c = await requireContainer(db, input.containerId);
  if (!Number.isInteger(input.amountMl) || input.amountMl < 0) {
    throw new RangeError(`an amount is a whole number of ml, got ${input.amountMl}`);
  }
  const deltaMl = input.amountMl - c.amount_ml;
  if (deltaMl === 0) throw new RangeError('the amount is already that');
  const adjust = ledgerEntry(
    { intentId, householdId: input.householdId, createdBy: input.createdBy, clientEditedAt },
    {
      tag: 'adjust',
      kind: 'ADJUST',
      containerId: c.id,
      deltaMl,
      occurredAt: clientEditedAt,
      activityId: null,
      dependsOn: null,
    },
  );
  const rows: LocalRow[] = [
    adjust.row,
    {
      table: 'milk_containers',
      row: {
        id: c.id,
        amount_ml: input.amountMl,
        ...(input.amountMl === 0 ? { status: 'USED', used_at: clientEditedAt } : {}),
        updated_at: clientEditedAt,
      },
    },
  ];
  const ops: ChainOp[] = [adjust.op];
  if (input.amountMl === 0) {
    const closed = containerPatch(
      { intentId, householdId: input.householdId, clientEditedAt },
      c.id,
      { status: 'USED', used_at: clientEditedAt },
      'used',
    );
    // AHEAD OF THE ADJUST, and depending on nothing (the sync sweep of 2026-09-24, S1): queued
    // after it, and waiting on it, the patch always reached the server after the ADJUST had
    // re-stamped the bag, and last-writer-wins dropped it — the bag stayed in the stash at 0 ml.
    ops.unshift(closed.op);
  }
  const outcome = await commitWrite(
    db,
    clock,
    {
      intentId,
      chain: { rows, ops },
      source: input.source,
      invalidates: [keys.stash(input.householdId), keys.container(c.id)],
    },
    deps,
  );
  return { ...outcome, deltaMl };
}

export interface DiscardContainerInput extends WriteContext {
  containerId: string;
  reason: DiscardReason | null;
  intentId?: string;
}

export interface DiscardContainerResult extends WriteOutcome {
  discardedMl: number;
}

/**
 * `Discard` (SHEETS.discard; §8): the status, the time, the neutral reason, and one DISCARD
 * row for what was left — so the milk stays in the weekly balance and the numbers add up.
 * Nothing here judges the milk, and the container is never deleted.
 */
export async function discardContainer(
  db: Db,
  clock: Clock,
  input: DiscardContainerInput,
  deps: RepositoryDeps = {},
): Promise<DiscardContainerResult> {
  const intentId = input.intentId ?? newIntentId();
  const clientEditedAt = clock.iso();
  const c = await requireContainer(db, input.containerId);
  const closed = containerPatch(
    { intentId, householdId: input.householdId, clientEditedAt },
    c.id,
    {
      status: 'DISCARDED',
      discarded_at: clientEditedAt,
      discard_reason: input.reason,
    },
  );
  const rows: LocalRow[] = [{ ...closed.row, row: { ...closed.row.row, amount_ml: 0 } }];
  const ops: ChainOp[] = [closed.op];
  if (c.amount_ml > 0) {
    const gone = ledgerEntry(
      { intentId, householdId: input.householdId, createdBy: input.createdBy, clientEditedAt },
      {
        tag: 'discard',
        kind: 'DISCARD',
        containerId: c.id,
        deltaMl: -c.amount_ml,
        occurredAt: clientEditedAt,
        activityId: null,
        dependsOn: intentId,
      },
    );
    rows.push(gone.row);
    ops.push(gone.op);
  }
  const outcome = await commitWrite(
    db,
    clock,
    {
      intentId,
      chain: { rows, ops },
      source: input.source,
      invalidates: [keys.stash(input.householdId), keys.container(c.id)],
    },
    deps,
  );
  return { ...outcome, discardedMl: c.amount_ml };
}
