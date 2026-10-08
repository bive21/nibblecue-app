/**
 * Timers, written the way `docs/MOBILE.md` §6 and CLAUDE.md rule 12 require: **a timer is a
 * row of timestamps**, never a counter in a component. `started_at`, `paused_ms`,
 * `side_started_at`, `left_seconds` and `right_seconds` are the whole state, so a timer
 * survives app kill, lock, reboot and a handover to the other parent with nothing to resume.
 *
 * THE STOP IS ONE TRANSACTION. `stopTimer` writes the activity and its detail row, deletes the
 * local `running_timers` row and enqueues `timer DELETE` together (§6 rule 2). `running_timers`
 * is hard-deleted on the server (`timers_write` is `for all`), so the delete is real and the
 * row can never arrive back as a tombstone — which is also why the activity carries
 * `metadata.timer_id`: two devices stopping the same timer offline both mint an activity, and
 * the server arbitrates on the timer's identity, returning the second as `duplicate` (D26).
 *
 * PAUSE AND SWITCH COALESCE. Six side switches during one feed are six states of one timer,
 * not six operations. Each rewrites the payload of the timer's existing `PENDING` op instead
 * of appending another, so a long tandem session offline still flushes as one write. Once the
 * op has left `PENDING` there is nothing to rewrite and a new `UPDATE` op is enqueued — the
 * ordering guarantee (§2.3 rule 2: never two ops on one entity in flight) is what makes that
 * the only safe branch.
 */
import {
  type ChainOp,
  type Clock,
  type RunningTimer,
  type TimerType,
  timerStopChain,
} from '@nibblecue/core';
import type { Db, Tx } from '../db/driver';
import { runningTimerFor } from '../db/queries/timers';
import { newEntityId, newIntentId } from './ids';
import { enqueue, payloadOf } from './outbox';
import { commitWrite, upsertRow, type RepositoryDeps, type WriteOutcome } from './repository';
import { activityKeys, keys, store as appStore } from './store';
import type { ActivityFields, WriteContext } from './activities';
import { toActivityInput } from './activities';

export interface StartTimerInput extends WriteContext {
  childId: string | null;
  type: TimerType;
  startedAt: string;
  activeSide?: 'LEFT' | 'RIGHT' | null;
  timerId?: string;
  meta?: Record<string, unknown>;
}

/** The local row a running timer is, in the mirror's own column names. */
function timerRow(input: {
  id: string;
  householdId: string;
  childId: string | null;
  type: TimerType;
  startedAt: string;
  activeSide: 'LEFT' | 'RIGHT' | null;
  startedBy: string;
  meta: Record<string, unknown>;
  at: string;
}) {
  return {
    table: 'running_timers',
    row: {
      id: input.id,
      household_id: input.householdId,
      child_id: input.childId,
      type: input.type,
      started_at: input.startedAt,
      paused_ms: 0,
      active_side: input.activeSide,
      side_started_at: input.activeSide === null ? null : input.startedAt,
      left_seconds: 0,
      right_seconds: 0,
      started_by: input.startedBy,
      meta: input.meta,
      created_at: input.at,
      updated_at: input.at,
    },
  };
}

/**
 * NOTHING WAS WRITTEN, on purpose: the outcome a start or a stop returns when the row it would act
 * on says it has already happened. Uncommitted, so no caller toasts it and no Undo is offered.
 */
const REFUSED = (intentId: string): WriteOutcome => ({
  committed: false,
  suppressed: true,
  opIds: [],
  entityIds: [],
  intentId,
});

/**
 * Start a timer — unless one of this type is already running for this child.
 *
 * ONE TIMER PER (TYPE, CHILD) IS CHECKED HERE, against the mirror, not only in the caller's list
 * (the audit of 2026-09-24, timers 16). The caller's clash check reads a React list, which is a
 * render behind the database: a second tap on Start after the first had committed but before the
 * list re-read wrote a second row for the same baby, and stopping the visible one brought the
 * other back as "running" — offline, both stops became entries. The row that is already here is
 * the truth (WP5.4), so a start that finds one writes nothing.
 */
export async function startTimer(
  db: Db,
  clock: Clock,
  input: StartTimerInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = input.timerId ?? newIntentId();
  const running = await runningTimerFor(db, input.householdId, input.type, input.childId);
  if (running !== undefined) return REFUSED(intentId);
  const at = clock.iso();
  const side = input.activeSide ?? null;
  const row = timerRow({
    id: intentId,
    householdId: input.householdId,
    childId: input.childId,
    type: input.type,
    startedAt: input.startedAt,
    activeSide: side,
    startedBy: input.createdBy,
    meta: input.meta ?? {},
    at,
  });
  const op: ChainOp = {
    client_op_id: intentId,
    entity: 'timer',
    op: 'CREATE',
    entity_id: intentId,
    household_id: input.householdId,
    payload: {
      child_id: input.childId,
      type: input.type,
      started_at: input.startedAt,
      paused_ms: 0,
      active_side: side,
      side_started_at: side === null ? null : input.startedAt,
      left_seconds: 0,
      right_seconds: 0,
      meta: input.meta ?? {},
      client_edited_at: at,
    },
    depends_on: null,
  };
  return commitWrite(
    db,
    clock,
    {
      intentId,
      chain: { rows: [row], ops: [op] },
      source: input.source,
      invalidates: [keys.timers(input.householdId)],
    },
    deps,
  );
}

export interface StopTimerInput extends WriteContext, ActivityFields {
  timerId: string;
  childId: string | null;
  intentId?: string;
  activityId?: string;
}

/**
 * Stop: the activity the timer produced, then the timer row's removal — one transaction.
 *
 * The activity's `metadata.timer_id` is load-bearing (D26) and `timerStopChain` puts it there;
 * the local `running_timers` row goes through `localDeletes` because a chain cannot express a
 * physical delete, and this one is physical.
 *
 * A TIMER THAT IS NOT HERE IS NOT RUNNING (`db/queries/timers.ts`), and stopping it writes nothing
 * (the audit of 2026-09-24, care M1 / timers 17). A second tap on "Woke up", a widget Stop that
 * lands after the card's, a coin read twice: each wrote a second sleep entry for the same timer,
 * which only the server's D26 check folded back into one — and offline, never. The row is removed
 * in the first stop's own transaction, so its absence is exactly "this has already been stopped".
 */
export async function stopTimer(
  db: Db,
  clock: Clock,
  input: StopTimerInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = input.intentId ?? newIntentId();
  const held = await db.get<{ id: string }>('select id from running_timers where id = ?', [
    input.timerId,
  ]);
  if (held === undefined) return REFUSED(intentId);
  /*
    AN END IS NEVER BEFORE ITS START (docs/MOBILE.md §6 rule 7: a clock that disagrees clamps
    elapsed at 0, never negative). A timer started on the OTHER parent's phone carries that phone's
    clock, and one running a few minutes fast stamps a start that this phone's "now" has not reached
    yet — so a "Woke up" tapped soon after wrote an entry ending before it began. The card and the
    toast already clamped it to 0m; the row did not, and the server refuses such a row for good
    (`activity_time_sane`) while it accepts the timer's removal — so the household was left with
    neither the timer nor the sleep, and this phone with "Not synced" (the pre-release sweep of
    2026-09-24). A time the parent CHOSE never reaches this: "It ended" refuses an end before the
    start with a word before it calls the stop (`LongRunCard`), so only "now" is ever clamped.
  */
  const endAt: string | null =
    typeof input.endAt === 'string' && Date.parse(input.endAt) < Date.parse(input.startAt)
      ? input.startAt
      : (input.endAt ?? null);
  const activityId = input.activityId ?? newEntityId();
  const chain = timerStopChain({
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: clock.iso(),
    timerId: input.timerId,
    activity: toActivityInput({ ...input, endAt }, input.childId, activityId, input.source),
  });
  return commitWrite(
    db,
    clock,
    {
      intentId,
      chain,
      source: input.source,
      localDeletes: [{ table: 'running_timers', id: input.timerId }],
      invalidates: [
        keys.timers(input.householdId),
        ...activityKeys(input.householdId, input.childId, input.type),
      ],
    },
    deps,
  );
}

/**
 * What a pause, a resume, a side switch or a start-time correction changes on the row and in
 * the op's payload. `started_at` is here for "Correct the start time" (PRODUCT_SPEC.md §6.5):
 * re-anchoring the row is the whole correction, because every elapsed display is arithmetic
 * on it — the card, the widget, the Live Activity all recompute (`0009`'s timer UPDATE accepts
 * `started_at` for exactly this).
 */
export type TimerPatch = Partial<
  Pick<
    RunningTimer,
    | 'started_at'
    | 'paused_ms'
    | 'active_side'
    | 'side_started_at'
    | 'left_seconds'
    | 'right_seconds'
  >
>;

export interface TimerUpdateResult {
  /** The op this change rode on — an existing `PENDING` one, or a new `UPDATE`. */
  opId: string;
  /** True when the change was folded into an operation that was already queued. */
  coalesced: boolean;
}

/**
 * Apply a patch to a running timer, coalescing into its pending operation where there is one.
 *
 * The merge is a plain overwrite of the patched fields, not `mergeTimers`: both sides are this
 * device's own successive states of the same row, so the later one is simply the truth.
 * `mergeTimers` arbitrates between two DEVICES, and that happens on the server.
 */
export async function patchTimer(
  db: Db,
  clock: Clock,
  input: WriteContext & { timerId: string; patch: TimerPatch },
  deps: RepositoryDeps = {},
): Promise<TimerUpdateResult> {
  const at = clock.iso();
  const result = await db.tx(async t => {
    await upsertRow(t, {
      table: 'running_timers',
      row: { id: input.timerId, ...input.patch, updated_at: at },
    });
    const queued = await pendingTimerOp(t, input.timerId);
    if (queued !== undefined) {
      const payload = { ...payloadOf(queued), ...input.patch, client_edited_at: at };
      await t.run('update outbox set payload = ? where client_op_id = ?', [
        JSON.stringify(payload),
        queued.client_op_id,
      ]);
      return { opId: queued.client_op_id, coalesced: true };
    }
    const op: ChainOp = {
      client_op_id: newIntentId(),
      entity: 'timer',
      op: 'UPDATE',
      entity_id: input.timerId,
      household_id: input.householdId,
      payload: { ...input.patch, client_edited_at: at },
      depends_on: null,
    };
    await enqueue(t, op, clock);
    return { opId: op.client_op_id, coalesced: false };
  });
  (deps.store ?? appStore).invalidate(keys.timers(input.householdId), keys.outbox());
  deps.afterCommit?.({
    committed: true,
    suppressed: false,
    opIds: [result.opId],
    entityIds: [input.timerId],
    intentId: result.opId,
  });
  return result;
}

async function pendingTimerOp(t: Tx, timerId: string) {
  return t.get<{ client_op_id: string; payload: string }>(
    `select client_op_id, payload from outbox
      where entity = 'timer' and entity_id = ? and state = 'PENDING'
      order by seq desc limit 1`,
    [timerId],
  );
}

/** Switch sides in a breastfeed: the closing side's seconds are banked, the new one opens. */
export function switchSide(
  db: Db,
  clock: Clock,
  input: WriteContext & {
    timerId: string;
    to: 'LEFT' | 'RIGHT';
    leftSeconds: number;
    rightSeconds: number;
    at: string;
  },
  deps: RepositoryDeps = {},
): Promise<TimerUpdateResult> {
  return patchTimer(
    db,
    clock,
    {
      ...input,
      patch: {
        active_side: input.to,
        side_started_at: input.at,
        left_seconds: input.leftSeconds,
        right_seconds: input.rightSeconds,
      },
    },
    deps,
  );
}

/**
 * Correct the start time: re-anchor the row; everything that shows elapsed recomputes.
 *
 * A BREASTFEED ALSO CARRIES ITS SIDES (the audit of 2026-09-24, feeding C10): its elapsed, its
 * minutes and its L/R split are the banked seconds and the open side's start, not `started_at`,
 * so a correction that moved only the start changed nothing a parent could see. The caller works
 * the sides out (`startCorrection` in sheets/quick/timerMath.ts) and they ride in the same patch —
 * one write, one coalesced op, so no device ever holds the new start with the old sides.
 */
export function correctStart(
  db: Db,
  clock: Clock,
  input: WriteContext & {
    timerId: string;
    startedAt: string;
    sides?: { leftSeconds: number; rightSeconds: number; sideStartedAt: string | null };
  },
  deps: RepositoryDeps = {},
): Promise<TimerUpdateResult> {
  const patch: TimerPatch = { started_at: input.startedAt };
  if (input.sides !== undefined) {
    patch.left_seconds = input.sides.leftSeconds;
    patch.right_seconds = input.sides.rightSeconds;
    patch.side_started_at = input.sides.sideStartedAt;
  }
  return patchTimer(db, clock, { ...input, patch }, deps);
}

export interface DiscardTimerInput extends WriteContext {
  timerId: string;
}

/**
 * Discard: the timer row goes and NO activity is written (§6.3 "Discard session"). The op is
 * the same `timer DELETE` a stop enqueues, without the activity it would have depended on.
 */
export async function discardTimer(
  db: Db,
  clock: Clock,
  input: DiscardTimerInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = newIntentId();
  const op: ChainOp = {
    client_op_id: intentId,
    entity: 'timer',
    op: 'DELETE',
    entity_id: input.timerId,
    household_id: input.householdId,
    payload: { timer_id: input.timerId, client_edited_at: clock.iso() },
    depends_on: null,
  };
  return commitWrite(
    db,
    clock,
    {
      intentId,
      chain: { rows: [], ops: [op] },
      source: input.source,
      localDeletes: [{ table: 'running_timers', id: input.timerId }],
      invalidates: [keys.timers(input.householdId)],
    },
    deps,
  );
}
