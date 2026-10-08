/**
 * ── NIBBLECUE'S WRITES ────────────────────────────────────────────────────────────────────────
 *
 * Every one goes through CuddleCue's one writer (`data/repository.ts` `commitWrite`): one SQLite
 * transaction holds the row and its outbox op, so it succeeds with no network, a retry or a double
 * tap collapses to one row, and the sync engine sends it when it can (bpnc-studio rule 3: never
 * lose an entry).
 *
 *   · A MEAL is CuddleCue's own solids entry (`logActivity`, type `solids`), its foods one line
 *     each with how it went (docs/SOLIDS.md in CuddleCue). NibbleCue adds `food_id`, `form` and
 *     `plan_item` on each line, which CuddleCue's server allows and CuddleCue ignores.
 *   · WHAT WAS NOTICED is CuddleCue's own Health note (type `wellbeing`) plus a NibbleCue
 *     `noticed` record with the foods and the onset (`core/nibble/health.ts`).
 *   · Everything else is a NibbleCue record (`core/nibble/records.ts`).
 */
import { itemsForSave, type Clock, type FoodResponse, type SolidsItem } from '@nibblecue/core';
import {
  recordDeleteChain,
  recordSaveChain,
  seenFor,
  type Food,
  type Form,
  type MealName,
  type RecordKind,
  type RecordWriteInput,
} from '@nibblecue/core/nibble';
import type { Db } from '../db/driver';
import { logActivity, type WriteContext } from '../data/activities';
import { newEntityId, newIntentId } from '../data/ids';
import { commitWrite, type RepositoryDeps, type WriteOutcome } from '../data/repository';
import { keys } from '../data/store';

/** The cache key every NibbleCue record read listens on. */
export const nibbleKey = (householdId: string): string => `nibble/${householdId}`;

/** CuddleCue's meal names, from NibbleCue's. */
const CUDDLE_MEAL: Readonly<Record<MealName, 'BREAKFAST' | 'LUNCH' | 'SNACK' | 'DINNER'>> = {
  breakfast: 'BREAKFAST',
  lunch: 'LUNCH',
  snack: 'SNACK',
  dinner: 'DINNER',
};

/* ── records ─────────────────────────────────────────────────────────────────────────────── */

export async function saveRecord<K extends RecordKind>(
  db: Db,
  clock: Clock,
  ctx: WriteContext,
  input: { recordId?: string; childId: string | null; kind: K; body: RecordWriteInput<K>['body'] },
  deps: RepositoryDeps = {},
): Promise<WriteOutcome & { recordId: string }> {
  const recordId = input.recordId ?? newEntityId();
  const intentId = newIntentId();
  const chain = recordSaveChain({
    op: input.recordId === undefined ? 'CREATE' : 'UPDATE',
    intentId,
    householdId: ctx.householdId,
    createdBy: ctx.createdBy,
    deviceId: ctx.deviceId,
    clientEditedAt: clock.iso(),
    recordId,
    childId: input.childId,
    kind: input.kind,
    body: input.body,
  });
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: ctx.source, invalidates: [nibbleKey(ctx.householdId)] },
    deps,
  );
  return { ...outcome, recordId };
}

export async function deleteRecord(
  db: Db,
  clock: Clock,
  ctx: WriteContext,
  input: { recordId: string; kind: RecordKind; childId: string | null },
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = newIntentId();
  const chain = recordDeleteChain({
    intentId,
    householdId: ctx.householdId,
    createdBy: ctx.createdBy,
    deviceId: ctx.deviceId,
    clientEditedAt: clock.iso(),
    recordId: input.recordId,
    kind: input.kind,
    childId: input.childId,
  });
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: ctx.source, invalidates: [nibbleKey(ctx.householdId)] },
    deps,
  );
}

/* ── a meal ──────────────────────────────────────────────────────────────────────────────── */

export interface ServedFood {
  food: Food;
  form: Form | null;
  response: FoodResponse | null;
  /** The plan item it came from ("2026-10-08:breakfast:egg"), when it came from the plan. */
  planItem: string | null;
}

/**
 * SERVED, IN ONE WRITE: the meal as CuddleCue's own solids entry, one line per food. The lines are
 * checked by CuddleCue's own rule first (`itemsForSave`, the shape the server holds), and NibbleCue's
 * keys are added back after it, because that rule keeps only the keys CuddleCue reads.
 */
export async function logServed(
  db: Db,
  clock: Clock,
  ctx: WriteContext,
  input: { childId: string; meal: MealName; atIso: string; foods: readonly ServedFood[] },
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const base: SolidsItem[] = input.foods.map(f => ({
    name: f.food.name,
    amount: null,
    unit: null,
    response: f.response,
  }));
  const checked = itemsForSave(base);
  const items = checked.map((item, i) => {
    const f = input.foods[i];
    return f === undefined
      ? item
      : { ...item, food_id: f.food.id, form: f.form, plan_item: f.planItem };
  });
  return logActivity(
    db,
    clock,
    {
      ...ctx,
      childId: input.childId,
      type: 'solids',
      startAt: input.atIso,
      detail: {
        meal: CUDDLE_MEAL[input.meal],
        food: checked.map(i => i.name).join(', '),
        items,
        observation: null,
      },
    },
    deps,
  );
}

/* ── something noticed ───────────────────────────────────────────────────────────────────── */

export interface NoticedInput {
  childId: string;
  atIso: string;
  /** Still going: the Health note has no end yet. */
  ongoing: boolean;
  signs: Parameters<typeof seenFor>[0];
  notes: string | null;
  foodIds: readonly string[];
  mealId: string | null;
  onsetMinutes: number | null;
}

/**
 * ONE ENTRY IN BOTH APPS: the Health note first (CuddleCue's `wellbeing`, the sign as its chips and
 * the parent's own words), then the NibbleCue record that names the foods, pointing at it. Two
 * writes, each its own transaction; if the second never happens the note still stands, which is
 * the half that matters, and the foods can be added to it later.
 */
export async function saveNoticed(
  db: Db,
  clock: Clock,
  ctx: WriteContext,
  input: NoticedInput,
  deps: RepositoryDeps = {},
): Promise<{ note: WriteOutcome; record: WriteOutcome | null; noteId: string }> {
  const noteId = newEntityId();
  const note = await logActivity(
    db,
    clock,
    {
      ...ctx,
      childId: input.childId,
      activityId: noteId,
      type: 'wellbeing',
      startAt: input.atIso,
      endAt: input.ongoing ? null : input.atIso,
      notes: input.notes,
      detail: { seen: seenFor(input.signs) },
    },
    deps,
  );
  if (!note.committed) return { note, record: null, noteId };
  const record = await saveRecord(
    db,
    clock,
    ctx,
    {
      childId: input.childId,
      kind: 'noticed',
      body: {
        at: input.atIso,
        activityId: input.mealId,
        noteId,
        foodIds: [...input.foodIds],
        signs: [...input.signs],
        onsetMinutes: input.onsetMinutes,
        notes: null,
      },
    },
    deps,
  );
  return { note, record, noteId };
}

/** The meal-list keys a served meal bumps, so Today and Foods re-read. */
export const mealKeys = (householdId: string, childId: string): string[] => [
  keys.timeline(childId, 'all'),
  keys.timeline(null, 'all'),
  keys.household(householdId),
];
