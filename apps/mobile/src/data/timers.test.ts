/**
 * Timers as timestamps (CLAUDE.md rule 12; `docs/MOBILE.md` §6).
 *
 * The two claims the plan names: an offline stop nets to ONE activity and NO timer row, in one
 * transaction; and six side switches during one feed coalesce into ONE queued operation rather
 * than six. Between them they cover the two ways a timer goes wrong offline — a stop that half
 * happens, and a queue that grows with every tap of a button a parent presses all night.
 */
import { elapsedMs } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { runningTimerFor, runningTimers } from '../db/queries/timers';
import { CHILD_A, HOUSEHOLD, USER, liveActivities, seedHousehold } from '../testing/fixtures';
import {
  correctStart,
  discardTimer,
  patchTimer,
  startTimer,
  stopTimer,
  switchSide,
} from './timers';

const STARTED = '2026-09-14T02:00:00.000Z';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

const ops = (db: Db) =>
  db.all<{ client_op_id: string; entity: string; op: string; seq: number; payload: string }>(
    'select client_op_id, entity, op, seq, payload from outbox order by seq',
    [],
  );

const ctx = {
  householdId: HOUSEHOLD,
  createdBy: USER,
  deviceId: null,
  source: 'timer' as const,
};

describe('timers (MOBILE §6)', () => {
  it('a start is one row and one op, and the row is the whole state', async () => {
    const { db, clock } = await fixture();
    const out = await startTimer(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'sleep',
      startedAt: STARTED,
    });
    const timer = await runningTimerFor(db, HOUSEHOLD, 'sleep', CHILD_A);
    expect(timer).toMatchObject({
      id: out.entityIds[0],
      started_at: STARTED,
      paused_ms: 0,
      left_seconds: 0,
    });
    // elapsed is arithmetic over the row, never an accumulating counter
    expect(
      elapsedMs({ started_at: STARTED, paused_ms: 0 }, Date.parse(STARTED) + 90 * 60 * 1000),
    ).toBe(90 * 60 * 1000);
    expect((await ops(db)).map(o => [o.entity, o.op])).toEqual([['timer', 'CREATE']]);
  });

  it('an offline stop nets to one activity and no timer, in one transaction', async () => {
    const { db, clock } = await fixture();
    const started = await startTimer(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'sleep',
      startedAt: STARTED,
    });
    const timerId = started.entityIds[0] ?? '';
    clock.advance(90 * 60 * 1000);

    const stopped = await stopTimer(db, clock, {
      ...ctx,
      timerId,
      childId: CHILD_A,
      type: 'sleep',
      startAt: STARTED,
      endAt: clock.iso(),
      detail: { kind: 'NAP' },
    });

    expect(await liveActivities(db)).toBe(1);
    expect(await runningTimers(db, HOUSEHOLD)).toEqual([]);
    const activity = await db.get<{ metadata: string; end_at: string }>(
      'select metadata, end_at from activities where id = ?',
      [stopped.entityIds[0] ?? ''],
    );
    // D26: the server arbitrates two offline stops on the timer's identity, so it must survive
    // …and `source`, which since 2026-09-22 rides on every entry's metadata rather than being
    // accepted by `commitWrite` and dropped (docs/NFC_TAGS.md §3.5). A stop says `timer`.
    expect(JSON.parse(activity?.metadata ?? '{}')).toEqual({
      source: 'timer',
      timer_id: timerId,
    });
    expect(activity?.end_at).toBe(clock.iso());

    const queued = await ops(db);
    expect(queued.map(o => [o.entity, o.op, o.seq])).toEqual([
      ['timer', 'CREATE', 1],
      ['activity', 'CREATE', 2],
      ['timer', 'DELETE', 3],
    ]);
    expect(JSON.parse(queued[2]?.payload ?? '{}')).toMatchObject({ timer_id: timerId });
    expect((await db.get<{ n: number }>('select count(*) as n from sleep_details', []))?.n).toBe(1);
  });

  it('six switches coalesce into the one queued operation', async () => {
    const { db, clock } = await fixture();
    const started = await startTimer(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'breastfeed',
      startedAt: STARTED,
      activeSide: 'LEFT',
    });
    const timerId = started.entityIds[0] ?? '';

    let left = 0;
    let right = 0;
    for (let i = 0; i < 6; i += 1) {
      clock.advance(4 * 60 * 1000);
      const to = i % 2 === 0 ? 'RIGHT' : 'LEFT';
      if (to === 'RIGHT') left += 240;
      else right += 240;
      const result = await switchSide(db, clock, {
        ...ctx,
        timerId,
        to,
        leftSeconds: left,
        rightSeconds: right,
        at: clock.iso(),
      });
      expect(result.coalesced).toBe(true);
      expect(result.opId).toBe(started.opIds[0]);
    }

    const queued = await ops(db);
    expect(queued).toHaveLength(1);
    // the queued payload carries the LATEST state, not the first
    expect(JSON.parse(queued[0]?.payload ?? '{}')).toMatchObject({
      active_side: 'LEFT',
      left_seconds: 720,
      right_seconds: 720,
    });
    const row = await runningTimerFor(db, HOUSEHOLD, 'breastfeed', CHILD_A);
    expect(row).toMatchObject({ active_side: 'LEFT', left_seconds: 720, right_seconds: 720 });
  });

  it('once the create has left PENDING a patch enqueues its own UPDATE', async () => {
    const { db, clock } = await fixture();
    const started = await startTimer(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'sleep',
      startedAt: STARTED,
    });
    await db.run(`update outbox set state = 'SENDING', sending_at = ?`, [clock.iso()]);

    const result = await patchTimer(db, clock, {
      ...ctx,
      timerId: started.entityIds[0] ?? '',
      patch: { paused_ms: 60_000 },
    });
    expect(result.coalesced).toBe(false);
    const queued = await ops(db);
    expect(queued.map(o => [o.entity, o.op])).toEqual([
      ['timer', 'CREATE'],
      ['timer', 'UPDATE'],
    ]);
    expect(JSON.parse(queued[1]?.payload ?? '{}')).toMatchObject({ paused_ms: 60_000 });
  });
});

describe('WP5.4: correcting the start and discarding (PRODUCT_SPEC §6.3, §6.5)', () => {
  it('correctStart re-anchors started_at on the row and in the queued op', async () => {
    const { db, clock } = await fixture();
    await startTimer(db, clock, { ...ctx, childId: CHILD_A, type: 'sleep', startedAt: STARTED });
    const timer = await runningTimerFor(db, HOUSEHOLD, 'sleep', CHILD_A);
    if (!timer) throw new Error('no timer');
    const EARLIER = '2026-09-14T01:40:00.000Z';
    await correctStart(db, clock, { ...ctx, timerId: timer.id, startedAt: EARLIER });
    const after = await runningTimerFor(db, HOUSEHOLD, 'sleep', CHILD_A);
    expect(after?.started_at).toBe(EARLIER);
    // the correction rode on the pending CREATE, so one op still carries the whole state
    const queued = await ops(db);
    expect(queued).toHaveLength(1);
    expect(JSON.parse(queued[0]!.payload)).toMatchObject({ started_at: EARLIER });
  });

  it('discardTimer removes the row, enqueues the DELETE and writes no activity', async () => {
    const { db, clock } = await fixture();
    await startTimer(db, clock, { ...ctx, childId: null, type: 'pump', startedAt: STARTED });
    const timer = await runningTimerFor(db, HOUSEHOLD, 'pump', null);
    if (!timer) throw new Error('no timer');
    const out = await discardTimer(db, clock, { ...ctx, timerId: timer.id });
    expect(out.committed).toBe(true);
    expect(await runningTimerFor(db, HOUSEHOLD, 'pump', null)).toBeUndefined();
    expect(await liveActivities(db)).toBe(0);
    const queued = await ops(db);
    expect(queued.map(o => `${o.entity} ${o.op}`)).toEqual(['timer CREATE', 'timer DELETE']);
  });
});

/**
 * THE ROW IS THE TRUTH, AT THE DATA LAYER TOO (the audit of 2026-09-24: care M1, timers 16 and
 * 17). A caller's list of running timers is a render behind the database, so a tap that lands
 * between a commit and the re-read used to write a second timer, or a second entry for one timer.
 */
describe('a double tap writes once', () => {
  it('a second start of the same kind for the same baby writes nothing', async () => {
    const { db, clock } = await fixture();
    const first = await startTimer(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'sleep',
      startedAt: STARTED,
    });
    clock.advance(400);
    const second = await startTimer(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'sleep',
      startedAt: clock.iso(),
    });
    expect(first.committed).toBe(true);
    expect(second.committed).toBe(false);
    expect(await db.all('select id from running_timers', [])).toHaveLength(1);
    expect((await ops(db)).map(o => `${o.entity} ${o.op}`)).toEqual(['timer CREATE']);
  });

  it('still starts another kind, another baby, and the household’s pump', async () => {
    const { db, clock } = await fixture();
    const starts = await Promise.all([
      startTimer(db, clock, { ...ctx, childId: CHILD_A, type: 'sleep', startedAt: STARTED }),
      startTimer(db, clock, { ...ctx, childId: CHILD_A, type: 'tummy', startedAt: STARTED }),
      startTimer(db, clock, { ...ctx, childId: null, type: 'pump', startedAt: STARTED }),
    ]);
    expect(starts.map(s => s.committed)).toEqual([true, true, true]);
  });

  it('a second stop of the same timer writes no second entry', async () => {
    const { db, clock } = await fixture();
    const started = await startTimer(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'sleep',
      startedAt: STARTED,
    });
    const timerId = started.entityIds[0] ?? '';
    clock.advance(30 * 60 * 1000);
    const stop = () =>
      stopTimer(db, clock, {
        ...ctx,
        timerId,
        childId: CHILD_A,
        type: 'sleep',
        startAt: STARTED,
        endAt: clock.iso(),
        detail: { kind: 'NAP' },
      });
    const first = await stop();
    clock.advance(300);
    const second = await stop();
    expect(first.committed).toBe(true);
    expect(second).toMatchObject({ committed: false, opIds: [] });
    expect(await liveActivities(db)).toBe(1);
    expect((await ops(db)).map(o => `${o.entity} ${o.op}`)).toEqual([
      'timer CREATE',
      'activity CREATE',
      'timer DELETE',
    ]);
  });
});

describe('correcting a breastfeed’s start moves its sides with it (feeding C10)', () => {
  it('writes the start and the sides in one patch, on the row and in the queued op', async () => {
    const { db, clock } = await fixture();
    await startTimer(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'breastfeed',
      startedAt: STARTED,
      activeSide: 'LEFT',
    });
    const timer = await runningTimerFor(db, HOUSEHOLD, 'breastfeed', CHILD_A);
    if (!timer) throw new Error('no timer');
    const EARLIER = '2026-09-14T01:55:00.000Z';
    await correctStart(db, clock, {
      ...ctx,
      timerId: timer.id,
      startedAt: EARLIER,
      sides: { leftSeconds: 300, rightSeconds: 0, sideStartedAt: STARTED },
    });
    const after = await runningTimerFor(db, HOUSEHOLD, 'breastfeed', CHILD_A);
    expect(after).toMatchObject({
      started_at: EARLIER,
      left_seconds: 300,
      right_seconds: 0,
      side_started_at: STARTED,
      active_side: 'LEFT',
    });
    const queued = await ops(db);
    expect(queued).toHaveLength(1);
    expect(JSON.parse(queued[0]!.payload)).toMatchObject({
      started_at: EARLIER,
      left_seconds: 300,
    });
  });
});
