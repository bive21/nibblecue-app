/**
 * The two shared lists — the writes (WP6b, WP6c; migration 0016).
 *
 * Every one is the same four lines: build the chain in `packages/core`, commit it, invalidate
 * the key, hand back an undo. There is no dedupe guard on any of them, and that is deliberate:
 * a parent who taps Add twice with the same word in the field means two of the thing, and a
 * shopping list is the one surface where a suppressed second write would be wrong.
 *
 * REMOVING IS `deleted_at`, NEVER A DELETE, and every removal comes back with an undo — one
 * for a line, one for the whole basket. "Cleared 6 bought" that cannot be taken back is the
 * shape of losing a list (rule 7 is about logs, and the same instinct applies here: a list a
 * household keeps is work, and work is not thrown away by one mis-tap).
 */
import {
  boughtOn,
  shoppingCreateChain,
  shoppingUpdateChain,
  supplyUpdateChain,
  taskCreateChain,
  taskUpdateChain,
  tripFinished,
  type Chain,
  type ChainOp,
  type Clock,
  type LocalRow,
  type TaskRepeat,
} from '@nibblecue/core';
import type { Db } from '../db/driver';
import { shoppingItems } from '../db/queries/lists';
import type { WriteContext } from './activities';
import { newEntityId, newIntentId } from './ids';
import { commitWrite, type RepositoryDeps, type WriteOutcome } from './repository';
import { keys } from './store';

/* --------------------------------- the shopping list --------------------------------- */

export interface AddShoppingInput extends WriteContext {
  title: string;
  qty?: number;
  note?: string | null;
  store?: string | null;
  /** The catalog item this line came from, when it came from one. */
  supplyId?: string | null;
}

export async function addShoppingItem(
  db: Db,
  clock: Clock,
  input: AddShoppingInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome & { itemId: string }> {
  const itemId = newEntityId();
  const intentId = newIntentId();
  const chain = shoppingCreateChain({
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: clock.iso(),
    itemId,
    item: {
      title: input.title,
      qty: input.qty ?? 1,
      note: input.note ?? null,
      store: input.store ?? null,
      supplyId: input.supplyId ?? null,
    },
  });
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: [keys.shopping(input.householdId)] },
    deps,
  );
  return { ...outcome, itemId };
}

export interface PatchShoppingInput extends WriteContext {
  itemId: string;
  title?: string;
  qty?: number;
  note?: string | null;
  store?: string | null;
}

export async function patchShoppingItem(
  db: Db,
  clock: Clock,
  input: PatchShoppingInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = newIntentId();
  const chain = shoppingUpdateChain({
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: clock.iso(),
    itemId: input.itemId,
    patch: {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.qty === undefined ? {} : { qty: input.qty }),
      ...(input.note === undefined ? {} : { note: input.note }),
      ...(input.store === undefined ? {} : { store: input.store }),
    },
  });
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: [keys.shopping(input.householdId)] },
    deps,
  );
}

/** Into the basket, or back out of it. The instant is the tick (chains.ts says why). */
export async function tickShoppingItem(
  db: Db,
  clock: Clock,
  input: WriteContext & { itemId: string; checked: boolean },
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = newIntentId();
  const at = clock.iso();
  const chain = shoppingUpdateChain({
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: at,
    itemId: input.itemId,
    patch: { checked_at: input.checked ? at : null },
  });
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: [keys.shopping(input.householdId)] },
    deps,
  );
}

export async function removeShoppingItem(
  db: Db,
  clock: Clock,
  input: WriteContext & { itemId: string },
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  return softSetShopping(db, clock, input.householdId, [input.itemId], clock.iso(), input, deps);
}

export async function restoreShoppingItems(
  db: Db,
  clock: Clock,
  input: WriteContext & { itemIds: readonly string[] },
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  return softSetShopping(db, clock, input.householdId, input.itemIds, null, input, deps);
}

/* ------------------------------------------------------------------ finishing the trip */

/** What a finished trip took, which is exactly what its Undo puts back. */
export interface FinishedTrip {
  /** The bought lines that left the list. */
  lineIds: string[];
  /** Each bought supply's `last_bought_on` before the trip wrote it — restored, never cleared. */
  was: (readonly [string, string | null])[];
  /** Lines still to buy, which stay on the list for next time. */
  left: number;
}

export interface FinishTripInput extends WriteContext {
  /**
   * The household's own day for an instant — `YYYY-MM-DD` in its zone. A supply records the day
   * its line went into the basket (`boughtOn` in core says why), and the zone lives at the edge.
   */
  dayOf: (ms: number) => string;
  /** The household's day now: the fallback for a tick that will not parse. */
  today: string;
}

const NOTHING_FINISHED: WriteOutcome = {
  committed: false,
  suppressed: false,
  intentId: '',
  opIds: [],
  entityIds: [],
};

/**
 * FINISH THE TRIP — Clear on the basket's heading, and the start of a new list after an "All done"
 * (`putOnList`). ONE intent: every line in the basket leaves the list, a one-off with the rest, and
 * each bought supply records the day it was bought, so the one Undo puts back both halves.
 *
 * WHAT IS IN THE BASKET IS READ HERE, from the mirror, at the moment of the finish — not from the
 * render a tap was made on. A tick that arrived from the other phone a moment ago is in the basket
 * the parent is looking at; a line still to buy is never touched, whoever added it and whenever.
 *
 * It used to be two writes in the screen — the dates, then a removal per line — so the trip was
 * several intents and the Undo two. The one-off was always among the lines taken (a one-off in
 * the basket did leave on Clear); what did not take it was starting a new list without Clear,
 * which `putOnList` is for.
 */
export async function finishTrip(
  db: Db,
  clock: Clock,
  input: FinishTripInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome & { trip: FinishedTrip }> {
  const rows = await shoppingItems(db, input.householdId);
  const basket = rows.filter(r => r.checked_at !== null);
  const left = rows.length - basket.length;
  if (basket.length === 0) {
    return { ...NOTHING_FINISHED, trip: { lineIds: [], was: [], left } };
  }
  const supplyIds = [...new Set(basket.map(r => r.supply_id).filter((id): id is string => !!id))];
  const held = await boughtDates(db, supplyIds);
  const days = boughtOn(
    basket.map(r => ({ supplyId: r.supply_id, checkedAt: r.checked_at })),
    input.dayOf,
    input.today,
    held,
  );
  // a date the item already holds is not written again: there is nothing for an Undo to restore
  const dates = [...days].filter(([id, day]) => held.get(id) !== day);
  const trip: FinishedTrip = {
    lineIds: basket.map(r => r.id),
    was: dates.map(([id]) => [id, held.get(id) ?? null] as const),
    left,
  };
  const outcome = await writeTrip(db, clock, input, trip.lineIds, clock.iso(), dates, deps);
  return { ...outcome, trip };
}

/** The Undo of `finishTrip`: the lines back in the basket, and each item's previous date. */
export async function putBackTrip(
  db: Db,
  clock: Clock,
  input: WriteContext & { trip: FinishedTrip },
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  if (input.trip.lineIds.length === 0) return NOTHING_FINISHED;
  return writeTrip(db, clock, input, input.trip.lineIds, null, input.trip.was, deps);
}

/**
 * PUT A LINE ON THE LIST — every add goes through here: the one-off row, the picker, the supply
 * sheet's switch, "running low", the Supplies page and the restock coin's page.
 *
 * WHEN THE TRIP BEFORE IT IS OVER — everything on the list is in the basket, the list the screen
 * says "All done" over — this line starts a new list, and the trip that ended is finished first,
 * exactly as Clear finishes it (`tripFinished` in core says why only then). That is the owner's
 * report of 2026-09-26: *"i added a one off in the basket, checklisted all and started a new
 * shopping list, but the one off was not removed from it."* The bought supplies had seemed to
 * leave — each + on the way to the new list took a bought line out of the basket, recording nothing
 * (`toggleOnList` in core) — and the one-off, which has no + anywhere, stayed in the new list.
 *
 * A list with anything still to buy is a trip still going, and nothing is finished: an unbought
 * line is never taken by this, on this phone or — since only the ids this phone sees in the basket
 * are retired — on the other one.
 */
export async function putOnList(
  db: Db,
  clock: Clock,
  input: AddShoppingInput & { dayOf: (ms: number) => string; today: string },
  deps: RepositoryDeps = {},
): Promise<WriteOutcome & { itemId: string; finished: FinishedTrip | null }> {
  const finished = await finishTripIfOver(db, clock, input, deps);
  const added = await addShoppingItem(db, clock, input, deps);
  return { ...added, finished };
}

/**
 * The first half of `putOnList`, for a caller that puts several lines on at once (the restock
 * coin's page): the finished trip, finished — or null with a trip still going, or no list at all.
 */
export async function finishTripIfOver(
  db: Db,
  clock: Clock,
  input: FinishTripInput,
  deps: RepositoryDeps = {},
): Promise<FinishedTrip | null> {
  const rows = await shoppingItems(db, input.householdId);
  if (!tripFinished(rows.map(r => ({ checkedAt: r.checked_at })))) return null;
  const f = await finishTrip(db, clock, input, deps);
  return f.committed ? f.trip : null;
}

/** Each item's `last_bought_on` as it stands, deleted items included: a line may outlive its item. */
async function boughtDates(
  db: Db,
  supplyIds: readonly string[],
): Promise<Map<string, string | null>> {
  if (supplyIds.length === 0) return new Map();
  const rows = await db.all<{ id: string; last_bought_on: string | null }>(
    `select id, last_bought_on from supply_items where id in (${supplyIds.map(() => '?').join(', ')})`,
    [...supplyIds],
  );
  return new Map(rows.map(r => [r.id, r.last_bought_on]));
}

/**
 * The trip as ONE intent: the lines' `deleted_at` and the items' `last_bought_on`, each op id
 * derived from the intent and its own tag so none can be deduped away (`line:` and `bought-`, the
 * tags the two writes this replaced already used).
 */
async function writeTrip(
  db: Db,
  clock: Clock,
  ctx: WriteContext,
  lineIds: readonly string[],
  deletedAt: string | null,
  dates: readonly (readonly [string, string | null])[],
  deps: RepositoryDeps,
): Promise<WriteOutcome> {
  const intentId = newIntentId();
  const at = clock.iso();
  const base = {
    intentId,
    householdId: ctx.householdId,
    createdBy: ctx.createdBy,
    deviceId: ctx.deviceId,
    clientEditedAt: at,
  };
  const chains: Chain[] = [
    ...lineIds.map((itemId, i) =>
      shoppingUpdateChain({ ...base, itemId, patch: { deleted_at: deletedAt }, tag: `line:${i}` }),
    ),
    ...dates.map(([supplyId, on], i) =>
      supplyUpdateChain({ ...base, supplyId, patch: { last_bought_on: on }, tag: `bought-${i}` }),
    ),
  ];
  const chain: Chain = { rows: chains.flatMap(c => c.rows), ops: chains.flatMap(c => c.ops) };
  return commitWrite(
    db,
    clock,
    {
      intentId,
      chain,
      source: ctx.source,
      invalidates: [keys.shopping(ctx.householdId), keys.supplies(ctx.householdId)],
    },
    deps,
  );
}

async function softSetShopping(
  db: Db,
  clock: Clock,
  householdId: string,
  ids: readonly string[],
  deletedAt: string | null,
  ctx: WriteContext,
  deps: RepositoryDeps,
): Promise<WriteOutcome> {
  const intentId = newIntentId();
  const at = clock.iso();
  const rows: LocalRow[] = [];
  const ops: ChainOp[] = [];
  ids.forEach((itemId, i) => {
    const chain = shoppingUpdateChain({
      intentId,
      householdId,
      createdBy: ctx.createdBy,
      deviceId: ctx.deviceId,
      clientEditedAt: at,
      itemId,
      patch: { deleted_at: deletedAt },
      // one intent, one op per line: the ids have to differ or the outbox dedupes them away
      ...(ids.length > 1 || deletedAt === null ? { tag: `line:${i}` } : {}),
    });
    rows.push(...chain.rows);
    ops.push(...chain.ops);
  });
  const chain: Chain = { rows, ops };
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: ctx.source, invalidates: [keys.shopping(householdId)] },
    deps,
  );
}

/* --------------------------------- the checklist --------------------------------- */

export interface SaveTaskInput extends WriteContext {
  /** Absent for a new chore; its id for an edit. */
  taskId?: string;
  title: string;
  atLocalTime: string | null;
  repeat: TaskRepeat;
  assignedTo: string | null;
}

export async function saveTask(
  db: Db,
  clock: Clock,
  input: SaveTaskInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome & { taskId: string }> {
  const intentId = newIntentId();
  const at = clock.iso();
  const base = {
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: at,
  };
  const taskId = input.taskId ?? newEntityId();
  const chain =
    input.taskId === undefined
      ? taskCreateChain({
          ...base,
          taskId,
          task: {
            title: input.title,
            atLocalTime: input.atLocalTime,
            repeat: input.repeat,
            assignedTo: input.assignedTo,
          },
        })
      : taskUpdateChain({
          ...base,
          taskId,
          patch: {
            title: input.title,
            at_local_time: input.atLocalTime,
            repeat: input.repeat,
            assigned_to: input.assignedTo,
          },
        });
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: [keys.tasks(input.householdId)] },
    deps,
  );
  return { ...outcome, taskId };
}

/**
 * Ticked, or unticked. `today` is the household's local day, computed by the caller — this
 * layer never asks a device clock what day it is, because the household's zone is the one the
 * chore belongs to and a caregiver in another one must not tick tomorrow's box.
 */
export async function tickTask(
  db: Db,
  clock: Clock,
  input: WriteContext & { taskId: string; today: string | null },
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = newIntentId();
  const chain = taskUpdateChain({
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: clock.iso(),
    taskId: input.taskId,
    patch: { last_done_on: input.today },
  });
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: [keys.tasks(input.householdId)] },
    deps,
  );
}

export async function setTaskDeleted(
  db: Db,
  clock: Clock,
  input: WriteContext & { taskId: string; deleted: boolean },
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = newIntentId();
  const chain = taskUpdateChain({
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: clock.iso(),
    taskId: input.taskId,
    patch: { deleted_at: input.deleted ? clock.iso() : null },
  });
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: [keys.tasks(input.householdId)] },
    deps,
  );
}
