/**
 * WHO'S ON, WRITTEN (migrations 0113 and 0115; the rules are `packages/core/src/schedule/duty.ts`).
 *
 * The household's shifts are one row, replaced whole: starting a shift, splitting a night,
 * handing over and ending are each a new list. Local first, like every write: the phone that
 * made the change follows it the moment it commits — its own reminders move before anything
 * reaches the server — and the other phones follow when they next sync.
 *
 * THE LIST IS CHECKED HERE BEFORE IT IS WRITTEN, with the rules the server checks it against
 * (`dutyProblem`), so a list the server would refuse never sits in this phone's mirror deciding
 * its reminders while the op waits to be rejected.
 *
 * EVERY LIST CARRIES ITS RECORD (0115): a fresh `rev`, the `base` it replaces as this phone last
 * saw it, who set it and when, the shifts it replaced, and whose phones have it. The server keeps
 * a list only if its `base` is still the household's list (two parents tapping at once: the one
 * written knowing the other wins, M1), and a confirmation (`confirmDuty`) merges into the list it
 * names rather than replacing anything. The list travels whole on the `settings` entity, built
 * here: core's `dutyChain` carried the three shift fields and nothing else, and went on
 * 2026-09-26 with nothing calling it.
 */
import {
  dutyListToWire,
  dutyProblem,
  newDutyList,
  withSeen,
  type Chain,
  type ChainOp,
  type Clock,
  type DutyList,
  type DutyShift,
} from '@nibblecue/core';
import type { Db } from '../db/driver';
import { dutyEntityId } from '../db/queries/duty';
import type { WriteContext } from './activities';
import { newIntentId } from './ids';
import { commitWrite, type RepositoryDeps, type WriteOutcome } from './repository';
import { keys } from './store';

export interface SaveDutyInput extends WriteContext {
  /** The whole list, in order. Empty ends every shift. */
  shifts: readonly DutyShift[];
  /** The people who can be on right now — a shift for anyone else is refused. */
  eligible: ReadonlySet<string>;
  /** When each temporary member's seat ends: no shift may run past it (`pastAccess`). */
  seatEnds?: ReadonlyMap<string, number>;
  /**
   * The list this one replaces, as this phone holds it — its `rev` is the `base` the server
   * checks, and its shifts still to run ride along so their phones are covered while they catch
   * up. Null (or absent) when this phone holds none.
   */
  replacing?: DutyList | null;
  /**
   * WHETHER THIS PHONE CAN SHOW A NOTIFICATION RIGHT NOW. False when the writer puts themselves on
   * from a phone that cannot ring: their phone is then not counted as having the list, so no other
   * phone goes quiet for a night that rings nowhere, and it confirms once it can
   * (`newDutyList`'s `writerCanRing`). Absent: it can.
   */
  canRing?: boolean;
  intentId?: string;
}

export class DutyRefusedError extends Error {
  constructor(readonly problem: string) {
    super(`shifts refused: ${problem}`);
  }
}

/** The op and the mirror row for one list — the only shape the household's duty row is written in. */
function dutyListChain(input: {
  intentId: string;
  householdId: string;
  writtenBy: string;
  at: string;
  list: DutyList;
}): Chain {
  const shifts = dutyListToWire(input.list);
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'settings',
    op: 'UPDATE',
    entity_id: dutyEntityId(input.householdId),
    household_id: input.householdId,
    payload: { table: 'household_duty', shifts, client_edited_at: input.at },
    depends_on: null,
  };
  return {
    rows: [
      {
        table: 'household_duty',
        row: {
          household_id: input.householdId,
          shifts,
          updated_by: input.list.meta.by ?? input.writtenBy,
          updated_at: input.at,
        },
      },
    ],
    ops: [op],
  };
}

export async function saveDuty(
  db: Db,
  clock: Clock,
  input: SaveDutyInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const problem = dutyProblem(input.shifts, clock.now(), input.eligible, input.seatEnds);
  if (problem !== null) throw new DutyRefusedError(problem);
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const list = newDutyList(input.shifts, {
    // the arrangement's own id: fresh for every change, never the op's (a retry keeps the op id)
    rev: newIntentId(),
    by: input.createdBy,
    atMs: Date.parse(at),
    replacing: input.replacing ?? null,
    ...(input.canRing === undefined ? {} : { writerCanRing: input.canRing }),
  });
  return commitWrite(
    db,
    clock,
    {
      intentId,
      chain: dutyListChain({
        intentId,
        householdId: input.householdId,
        writtenBy: input.createdBy,
        at,
        list,
      }),
      source: input.source,
      invalidates: [keys.duty(input.householdId)],
    },
    deps,
  );
}

export interface ConfirmDutyInput extends WriteContext {
  /** The list as this phone holds it; its `rev` is what the server merges the confirmation into. */
  list: DutyList;
  intentId?: string;
}

/**
 * THIS PHONE HAS THE LIST (0115): the same list with this person's phone added to `seen`. The
 * server merges it into the stored list when that is still the same arrangement and drops it when
 * it is not — so a late confirmation never puts back a list somebody has since changed. Written
 * only for a list with a record; one from before 0115 cannot be confirmed.
 */
export async function confirmDuty(
  db: Db,
  clock: Clock,
  input: ConfirmDutyInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome | null> {
  if (input.list.meta.rev === null) return null;
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const list = withSeen(input.list, input.createdBy, Date.parse(at));
  return commitWrite(
    db,
    clock,
    {
      intentId,
      chain: dutyListChain({
        intentId,
        householdId: input.householdId,
        writtenBy: input.createdBy,
        at,
        list,
      }),
      source: input.source,
      invalidates: [keys.duty(input.householdId)],
    },
    deps,
  );
}
