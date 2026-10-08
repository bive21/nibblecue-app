/**
 * One scenario table, two backends.
 *
 * `docs/OFFLINE_SYNC.md` §9 says of its matrix: "Each row is an automated test, not a manual
 * check." This file is the literal form of that. Every scenario is written against two interfaces
 * and nothing else — `SyncApi` and `ServerProbe` — so the same assertions run against the
 * in-memory fake in `apps/mobile/src/sync/providers` AND against Postgres through
 * `packages/db/src/integration/probe.ts`. Drift between the fake and the real server becomes a
 * failing test instead of a discovery three packages later (D23).
 *
 * Constraints this file lives under, and why:
 *   - no SQLite, no Postgres, no `node:` import, no test framework. It is library code, consumed
 *     by two test suites that each wrap `run()` in their own `it()`.
 *   - assertions throw. A thrown `Error` fails the wrapping test on either side with the message
 *     this file wrote, which is the only failure text a reader will see.
 *   - client-only behavior is asserted where it lives, not here. The duplicate guard suppresses
 *     before minting, so by the time an op reaches a `SyncApi` the second tap is already gone;
 *     what a scenario can assert is the server-visible consequence (one row, or two). The
 *     suppression itself is `packages/core/src/sync/dedupe.test.ts` and
 *     `apps/mobile/src/data/doubleTap.test.ts`.
 */
import type { ActivityType } from '../domain/domain-types';
import {
  bottleFromStashChain,
  pumpToStashChain,
  simpleActivityChain,
  timerStopChain,
  type ChainBase,
} from './chains';
import { MAX_BATCH } from './constants';
import { toPushOp, type ChainOp, type DetailTable, type PushResult, type SyncApi } from './types';

/* ---------- the probe ---------- */

export interface ActivityWhere {
  type?: ActivityType | undefined;
  start_at?: string | undefined;
  child_id?: string | null | undefined;
  /** Default false: a scenario counts what a caregiver would see. */
  include_deleted?: boolean | undefined;
}

/** Everything a scenario is allowed to know about the server. Implemented over the fake and over
 *  `as()`/`attempt()` in the Postgres harness. */
export interface ServerProbe {
  countActivities(householdId: string, where: ActivityWhere): Promise<number>;
  activityRow(id: string): Promise<Record<string, unknown> | null>;
  detailRow(activityId: string, table: DetailTable): Promise<Record<string, unknown> | null>;
  ledgerRows(containerId: string): Promise<Record<string, unknown>[]>;
  containerAmount(containerId: string): Promise<number | null>;
  timerRows(householdId: string): Promise<Record<string, unknown>[]>;
}

/* ---------- the context ---------- */

export interface ScenarioCtx {
  householdId: string;
  /** Two children, so a fan-out and a per-child dedupe key are expressible. */
  childId: string;
  otherChildId: string;
  userId: string;
  otherUserId: string;
  /** A container that exists and holds `containerMl` before the scenario starts. */
  containerId: string;
  containerMl: number;
  /** The plain fridge that container sits in, for a scenario that stores milk of its own. */
  locationId: string;
  /** A second `SyncApi` bound to the other caregiver: a second device, a second identity. */
  otherDevice: SyncApi;
  /** Deterministic uuids, stable for a given scenario run. */
  uuid(tag: string): string;
  now(): number;
  iso(at?: number): string;
}

export const SCENARIO_TAGS = [
  '@AT-07',
  '@AT-07a',
  '@AT-07b',
  '@AT-16',
  '@AT-17',
  '@AT-17a',
  '@AT-17b',
  '@AT-17c',
  '@SYNC-DEPS',
  '@SYNC-TIMER-MERGE',
  '@SYNC-TIMER-STOP2',
  '@SYNC-TIMER-STOP2-STASH',
  '@SYNC-TIMER-COPY-STOPPED',
  '@SYNC-TIMER-GIVES-WAY',
  '@SYNC-OVERDRAW',
  '@SYNC-DELETE-EDIT',
  '@SYNC-UNITS',
  '@SYNC-1000',
] as const;
export type ScenarioTag = (typeof SCENARIO_TAGS)[number];

export interface SyncScenario {
  id: string;
  tag: ScenarioTag;
  title: string;
  run(api: SyncApi, probe: ServerProbe, ctx: ScenarioCtx): Promise<void>;
}

/* ---------- assertions ---------- */

export function assertOk(condition: boolean, what: string): asserts condition {
  if (!condition) throw new Error(`scenario assertion failed: ${what}`);
}

export function assertEq<T>(actual: T, expected: T, what: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `scenario assertion failed: ${what} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function resultFor(results: readonly PushResult[], clientOpId: string): PushResult {
  const hit = results.find(r => r.client_op_id === clientOpId);
  if (!hit) throw new Error(`no push result for ${clientOpId}`);
  return hit;
}

function assertSucceeded(results: readonly PushResult[], ops: readonly ChainOp[], what: string) {
  assertEq(results.length, ops.length, `${what}: one result per op`);
  for (const op of ops) {
    const r = resultFor(results, op.client_op_id);
    assertOk(
      r.status === 'applied' || r.status === 'duplicate',
      `${what}: ${op.entity} ${op.op} came back ${r.status} (${r.error?.message ?? ''})`,
    );
  }
}

async function push(api: SyncApi, ops: readonly ChainOp[]): Promise<PushResult[]> {
  const res = await api.push(ops.map(toPushOp));
  return res.results;
}

/* ---------- chain helpers ---------- */

function base(ctx: ScenarioCtx, intentId: string, at: string): ChainBase {
  return {
    intentId,
    householdId: ctx.householdId,
    createdBy: ctx.userId,
    deviceId: 'scenario-device',
    clientEditedAt: at,
  };
}

function diaperChain(ctx: ScenarioCtx, tag: string, at: string, childId = ctx.childId) {
  const intentId = ctx.uuid(`${tag}-intent`);
  return simpleActivityChain(base(ctx, intentId, at), {
    id: ctx.uuid(`${tag}-activity`),
    childId,
    type: 'diaper',
    startAt: at,
    detail: { table: 'diaper_details', fields: { kind: 'WET', rash: false } },
  });
}

/** A sleep timer's start, as `apps/mobile/src/data/timers.ts` queues it. */
function sleepTimerOp(ctx: ScenarioCtx, id: string, startedAt: string, by: string): ChainOp {
  return {
    client_op_id: ctx.uuid(`timer-op-${id}`),
    entity: 'timer',
    op: 'CREATE',
    entity_id: id,
    household_id: ctx.householdId,
    payload: {
      child_id: ctx.childId,
      type: 'sleep',
      started_at: startedAt,
      paused_ms: 0,
      active_side: null,
      side_started_at: null,
      left_seconds: 0,
      right_seconds: 0,
      started_by: by,
      client_edited_at: startedAt,
    },
    depends_on: null,
  };
}

/** "Woke up": the entry, then the timer's removal (`timerStopChain`). */
function sleepStop(
  ctx: ScenarioCtx,
  tag: string,
  timerId: string,
  startAt: string,
  endAt: string,
  by: string,
): [ChainOp, ChainOp] {
  const chain = timerStopChain({
    ...base(ctx, ctx.uuid(`${tag}-intent`), endAt),
    createdBy: by,
    timerId,
    activity: {
      id: ctx.uuid(`${tag}-activity`),
      childId: ctx.childId,
      type: 'sleep',
      startAt,
      endAt,
      detail: {
        table: 'sleep_details',
        fields: { kind: 'NIGHT', wake_count: null, location: null },
      },
    },
  });
  const [entry, stop] = chain.ops;
  if (entry === undefined || stop === undefined) throw new Error('timerStopChain lost an op');
  return [entry, stop];
}

/* ---------- the matrix ---------- */

export const SYNC_SCENARIOS: readonly SyncScenario[] = [
  {
    id: 'offline-bottle-one-record',
    tag: '@AT-07',
    title: 'an offline bottle from the stash reaches the server exactly once',
    async run(api, probe, ctx) {
      const at = ctx.iso();
      const intentId = ctx.uuid('at07-intent');
      const activityId = ctx.uuid('at07-activity');
      const chain = bottleFromStashChain({
        ...base(ctx, intentId, at),
        containerId: ctx.containerId,
        consumedMl: 120,
        activity: {
          id: activityId,
          childId: ctx.childId,
          type: 'bottle',
          startAt: at,
          quantity: 120,
          canonicalUnit: 'ml',
          detail: {
            table: 'bottle_details',
            fields: {
              kind: 'EBM',
              offered_ml: 120,
              consumed_ml: 120,
              from_stash: true,
              container_id: ctx.containerId,
            },
          },
        },
      });
      assertEq(chain.ops.length, 2, 'a stash bottle is two ops, not four');

      assertSucceeded(await push(api, chain.ops), chain.ops, 'AT-07');

      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'bottle', start_at: at }),
        1,
        'exactly one bottle activity',
      );
      const row = await probe.activityRow(activityId);
      assertOk(row !== null, 'the bottle activity exists');
      assertEq(
        Date.parse(String(row['start_at'])),
        Date.parse(at),
        'start_at is the tap time, not the flush time',
      );
      assertOk(
        (await probe.detailRow(activityId, 'bottle_details')) !== null,
        'the bottle carries its amount',
      );
      const ledger = await probe.ledgerRows(ctx.containerId);
      const uses = ledger.filter(r => r['kind'] === 'USE' && r['activity_id'] === activityId);
      assertEq(uses.length, 1, 'exactly one USE row for this feed');
    },
  },
  {
    id: 'lost-response-replay',
    tag: '@AT-07a',
    title: 'a replayed op after a lost response is a duplicate, not a second record',
    async run(api, probe, ctx) {
      const at = ctx.iso();
      const chain = diaperChain(ctx, 'at07a', at);
      assertSucceeded(await push(api, chain.ops), chain.ops, 'AT-07a first attempt');

      const replay = await push(api, chain.ops);
      for (const op of chain.ops) {
        assertEq(
          resultFor(replay, op.client_op_id).status,
          'duplicate',
          'a replay of the same client_op_id is a duplicate',
        );
      }
      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'diaper', start_at: at }),
        1,
        'the server still holds one row',
      );
    },
  },
  {
    id: 'flush-interrupted-mid-batch',
    tag: '@AT-07b',
    title: 'a batch cut in half and resent whole leaves one row per logical write',
    async run(api, probe, ctx) {
      const at = ctx.iso();
      const chains = [0, 1, 2, 3, 4].map(i =>
        diaperChain(ctx, `at07b-${i}`, ctx.iso(ctx.now() + i * 1000)),
      );
      const all = chains.flatMap(c => c.ops);
      // Three of five got through before the process died; the rest, plus the three again.
      assertSucceeded(await push(api, all.slice(0, 3)), all.slice(0, 3), 'AT-07b first half');
      const resend = await push(api, all);
      assertEq(resend.length, all.length, 'every reclaimed op comes back with a result');
      for (const op of all) {
        const r = resultFor(resend, op.client_op_id);
        assertOk(r.status !== 'rejected', 'a reclaimed op is never rejected');
      }
      for (const c of chains) {
        const id = String(c.ops[0]?.entity_id);
        assertOk((await probe.activityRow(id)) !== null, 'every logical write survives');
      }
      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'diaper', start_at: at }),
        1,
        'the first write exists exactly once',
      );
    },
  },
  {
    id: 'widget-single-tap',
    tag: '@AT-16',
    title: 'one widget tap is one diaper, and a re-drain writes nothing',
    async run(api, probe, ctx) {
      const at = ctx.iso();
      const chain = diaperChain(ctx, 'at16', at);
      assertEq(chain.ops.length, 1, 'a widget diaper is one op');
      assertSucceeded(await push(api, chain.ops), chain.ops, 'AT-16');

      const activityId = String(chain.ops[0]?.entity_id);
      const detail = await probe.detailRow(activityId, 'diaper_details');
      assertOk(detail !== null, 'the diaper carries its kind');
      assertEq(detail['kind'], 'WET', 'the widget wrote a wet diaper');
      const row = await probe.activityRow(activityId);
      assertEq(
        Date.parse(String(row?.['start_at'])),
        Date.parse(at),
        'start_at is the tap time, not the drain time',
      );

      await push(api, chain.ops); // the drain ran twice
      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'diaper', start_at: at }),
        1,
        'a re-drain writes nothing',
      );
    },
  },
  {
    id: 'fast-double-tap',
    tag: '@AT-17',
    title: 'a fast double tap reaches the server as one op and one row',
    async run(api, probe, ctx) {
      const at = ctx.iso();
      // The guard suppressed the second tap before it minted anything, so exactly one op exists.
      const chain = diaperChain(ctx, 'at17', at);
      assertSucceeded(await push(api, chain.ops), chain.ops, 'AT-17');
      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'diaper', start_at: at }),
        1,
        'one tap, one row',
      );
    },
  },
  {
    id: 'double-tap-outside-window',
    tag: '@AT-17a',
    title: 'two taps six seconds apart are two entries — deliberate repeat logging still works',
    async run(api, probe, ctx) {
      const first = ctx.iso();
      const second = ctx.iso(ctx.now() + 6000);
      const a = diaperChain(ctx, 'at17a-1', first);
      const b = diaperChain(ctx, 'at17a-2', second);
      assertSucceeded(await push(api, [...a.ops, ...b.ops]), [...a.ops, ...b.ops], 'AT-17a');
      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'diaper', start_at: first }),
        1,
        'first',
      );
      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'diaper', start_at: second }),
        1,
        'second',
      );
    },
  },
  {
    id: 'in-app-save-double-tap',
    tag: '@AT-17b',
    title: 'a double-tapped Save is one bottle',
    async run(api, probe, ctx) {
      const at = ctx.iso();
      const intentId = ctx.uuid('at17b-intent');
      const chain = simpleActivityChain(base(ctx, intentId, at), {
        id: ctx.uuid('at17b-activity'),
        childId: ctx.childId,
        type: 'bottle',
        startAt: at,
        quantity: 120,
        canonicalUnit: 'ml',
        detail: {
          table: 'bottle_details',
          fields: {
            kind: 'FORMULA',
            offered_ml: 120,
            consumed_ml: 120,
            from_stash: false,
            container_id: null,
          },
        },
      });
      assertSucceeded(await push(api, chain.ops), chain.ops, 'AT-17b');
      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'bottle', start_at: at }),
        1,
        'one bottle, not two',
      );
    },
  },
  {
    id: 'two-devices-same-intent',
    tag: '@AT-17c',
    title: 'two caregivers logging within a second are two entries, never silently merged',
    async run(api, probe, ctx) {
      const at = ctx.iso();
      const mine = diaperChain(ctx, 'at17c-mine', at);
      const theirs = diaperChain(ctx, 'at17c-theirs', ctx.iso(ctx.now() + 900));
      assertSucceeded(await push(api, mine.ops), mine.ops, 'AT-17c device A');
      assertSucceeded(await push(ctx.otherDevice, theirs.ops), theirs.ops, 'AT-17c device B');
      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'diaper' }),
        2,
        'different devices are different intents: both entries stand',
      );
    },
  },
  {
    id: 'dependency-ordering',
    tag: '@SYNC-DEPS',
    title: 'a ledger op whose activity has not landed is retryable, never a foreign-key crash',
    async run(api, probe, ctx) {
      const at = ctx.iso();
      const orphanIntent = ctx.uuid('deps-orphan');
      const orphan = bottleFromStashChain({
        ...base(ctx, orphanIntent, at),
        containerId: ctx.containerId,
        consumedMl: 10,
        activity: {
          id: ctx.uuid('deps-orphan-activity'),
          childId: ctx.childId,
          type: 'bottle',
          startAt: at,
          quantity: 10,
          canonicalUnit: 'ml',
          detail: {
            table: 'bottle_details',
            fields: {
              kind: 'EBM',
              offered_ml: 10,
              consumed_ml: 10,
              from_stash: true,
              container_id: ctx.containerId,
            },
          },
        },
      });
      const ledgerOnly = orphan.ops.filter(o => o.entity === 'milk_txn');
      assertEq(ledgerOnly.length, 1, 'the chain has one ledger op');
      const rejected = resultFor(await push(api, ledgerOnly), String(ledgerOnly[0]?.client_op_id));
      assertEq(rejected.status, 'rejected', 'a ledger op with no activity is rejected');
      assertEq(rejected.error?.code, 'CONFLICT', 'and it is retryable, not terminal');
      const before = await probe.ledgerRows(ctx.containerId);
      assertOk(
        !before.some(r => r['client_op_id'] === ledgerOnly[0]?.client_op_id),
        'nothing was written',
      );

      assertSucceeded(await push(api, orphan.ops), orphan.ops, 'SYNC-DEPS in order');
    },
  },
  {
    id: 'overlapping-timers',
    tag: '@SYNC-TIMER-MERGE',
    title: 'two devices starting one timer offline leave one row, started at the earlier time',
    async run(api, probe, ctx) {
      const earlier = ctx.iso(ctx.now() - 4 * 60_000);
      const later = ctx.iso();
      const mineId = ctx.uuid('timer-mine');
      const theirsId = ctx.uuid('timer-theirs');
      const timerOp = (id: string, startedAt: string, by: string): ChainOp => ({
        client_op_id: ctx.uuid(`timer-op-${id}`),
        entity: 'timer',
        op: 'CREATE',
        entity_id: id,
        household_id: ctx.householdId,
        payload: {
          child_id: ctx.childId,
          type: 'sleep',
          started_at: startedAt,
          paused_ms: 0,
          active_side: null,
          side_started_at: null,
          left_seconds: 0,
          right_seconds: 0,
          started_by: by,
          client_edited_at: startedAt,
        },
        depends_on: null,
      });
      const mine = timerOp(mineId, earlier, ctx.userId);
      const theirs = timerOp(theirsId, later, ctx.otherUserId);

      assertSucceeded(await push(api, [mine]), [mine], 'timer A');
      const second = resultFor(await push(ctx.otherDevice, [theirs]), theirs.client_op_id);
      assertOk(second.status !== 'rejected', 'the second start is resolved, never refused');

      const timers = (await probe.timerRows(ctx.householdId)).filter(
        t => t['type'] === 'sleep' && t['child_id'] === ctx.childId,
      );
      assertEq(timers.length, 1, 'one running sleep timer for this child');
      assertEq(
        Date.parse(String(timers[0]?.['started_at'])),
        Date.parse(earlier),
        "the earlier start wins: a parent's real start time is the truth",
      );
      assertEq(String(timers[0]?.['started_by']), ctx.userId, 'started_by follows the winner');
    },
  },
  {
    id: 'timer-stopped-twice',
    tag: '@SYNC-TIMER-STOP2',
    title: 'two devices stopping one timer produce one activity, and the loser adopts it',
    async run(api, probe, ctx) {
      const timerId = ctx.uuid('stop2-timer');
      const startedAt = ctx.iso(ctx.now() - 30 * 60_000);
      const stopOp = (tag: string, endAt: string, by: string): ChainOp => {
        const intentId = ctx.uuid(`${tag}-intent`);
        const chain = simpleActivityChain(
          { ...base(ctx, intentId, endAt), createdBy: by },
          {
            id: ctx.uuid(`${tag}-activity`),
            childId: ctx.childId,
            type: 'sleep',
            startAt: startedAt,
            endAt,
            metadata: { timer_id: timerId },
            detail: {
              table: 'sleep_details',
              fields: { kind: 'NAP', wake_count: null, location: null },
            },
          },
        );
        const op = chain.ops[0];
        if (!op) throw new Error('simpleActivityChain returned no op');
        return op;
      };
      const mine = stopOp('stop2-a', ctx.iso(ctx.now() - 60_000), ctx.userId);
      const theirs = stopOp('stop2-b', ctx.iso(), ctx.otherUserId);

      assertSucceeded(await push(api, [mine]), [mine], 'first stop');
      const second = resultFor(await push(ctx.otherDevice, [theirs]), theirs.client_op_id);
      assertEq(second.status, 'duplicate', 'the second stop of one timer is a duplicate');
      assertEq(second.entity_id, mine.entity_id, 'and it names the surviving activity');
      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'sleep', start_at: startedAt }),
        1,
        'one sleep activity for one timer',
      );
    },
  },
  {
    id: 'timer-stop2-stash',
    tag: '@SYNC-TIMER-STOP2-STASH',
    title: 'the second stop of one pump timer cannot put its own bag in the stash',
    async run(api, probe, ctx) {
      // The stash sweep of 2026-09-24, finding 8. Both phones stop one pump timer and both store
      // what was pumped. The second stop is merged into the first, so its bag names a session
      // the server never had: refused by the foreign key on both backends, which is what lets
      // the losing phone nullify its own copy (`OutboxWorker.nullifyStashSave`) rather than
      // retry it for ever. The in-memory fake took that bag until the same day.
      const timerId = ctx.uuid('stop2s-timer');
      const startedAt = ctx.iso(ctx.now() - 30 * 60_000);
      const ml = 133;
      const stored = (tag: string, endAt: string, by: string) =>
        pumpToStashChain({
          ...base(ctx, ctx.uuid(`${tag}-intent`), endAt),
          createdBy: by,
          activity: {
            id: ctx.uuid(`${tag}-activity`),
            childId: null,
            type: 'pump',
            startAt: startedAt,
            endAt,
            quantity: ml,
            canonicalUnit: 'ml',
            metadata: { timer_id: timerId },
            detail: {
              table: 'pump_details',
              fields: {
                sides: 'BOTH',
                left_ml: null,
                right_ml: null,
                total_ml: ml,
                stored_to_stash: true,
              },
            },
          },
          container: {
            id: ctx.uuid(`${tag}-bag`),
            ownerId: by,
            locationId: ctx.locationId,
            containerType: 'BAG',
            initialMl: ml,
            pumpedAt: endAt,
          },
        });
      const mine = stored('stop2s-a', ctx.iso(ctx.now() - 60_000), ctx.userId);
      const theirs = stored('stop2s-b', ctx.iso(), ctx.otherUserId);
      assertSucceeded(await push(api, mine.ops), mine.ops, 'the first stop and its bag');

      const results = await push(ctx.otherDevice, theirs.ops);
      const [session, bag, add] = theirs.ops;
      assertOk(session !== undefined && bag !== undefined && add !== undefined, 'three ops');
      const merged = resultFor(results, session.client_op_id);
      assertEq(merged.status, 'duplicate', 'the second stop of one timer is a duplicate');
      assertEq(merged.entity_id, mine.ops[0]?.entity_id, 'and it names the first session');
      for (const op of [bag, add]) {
        const r = resultFor(results, op.client_op_id);
        assertEq(
          r.status,
          'rejected',
          `the second stop's ${op.entity} names a session the server never had`,
        );
        assertEq(r.error?.code, 'CONFLICT', `and the ${op.entity} is refused as a foreign key`);
      }
      assertEq(
        await probe.containerAmount(bag.entity_id),
        null,
        'the second bag is not on the server',
      );
      assertEq(
        await probe.containerAmount(ctx.uuid('stop2s-a-bag')),
        ml,
        'the first bag holds what was pumped, once',
      );
    },
  },
  {
    id: 'timer-copy-stopped',
    tag: '@SYNC-TIMER-COPY-STOPPED',
    title:
      'a copy started and stopped offline, after the first start reached the server, ends that one timer',
    async run(api, probe, ctx) {
      // The sleep sweep of 2026-09-24, finding 1 (migration 0120). One phone's start is on the
      // server; the other phone, offline, started its own copy four minutes later and stopped it.
      // Its queue goes up as [start, entry] and then [stop]. The server once kept the first
      // timer running beside the copy's entry, and its stop the next morning wrote a second night.
      const t0 = ctx.now() - 3 * 60 * 60_000;
      const copyStart = t0 + 4 * 60_000;
      const end = t0 + 160 * 60_000;
      const first = sleepTimerOp(ctx, ctx.uuid('copy-first'), ctx.iso(t0), ctx.userId);
      assertSucceeded(await push(api, [first]), [first], 'the first start');

      const copyId = ctx.uuid('copy-second');
      const copy = sleepTimerOp(ctx, copyId, ctx.iso(copyStart), ctx.otherUserId);
      const [entry, stop] = sleepStop(
        ctx,
        'copy-stop',
        copyId,
        ctx.iso(copyStart),
        ctx.iso(end),
        ctx.otherUserId,
      );
      assertSucceeded(await push(ctx.otherDevice, [copy, entry]), [copy, entry], 'copy and entry');
      assertSucceeded(await push(ctx.otherDevice, [stop]), [stop], 'the copy stopped');

      assertEq(
        (await probe.timerRows(ctx.householdId)).filter(
          t => t['type'] === 'sleep' && t['child_id'] === ctx.childId,
        ).length,
        0,
        'no timer left running for either phone to stop again',
      );
      const row = await probe.activityRow(entry.entity_id);
      assertOk(row !== null, 'the entry is on the server');
      assertEq(Date.parse(String(row['start_at'])), t0, 'the stretch began at the first start');
      assertEq(Date.parse(String(row['end_at'])), end, 'and ended at the stop');
      assertEq(
        await probe.countActivities(ctx.householdId, {
          type: 'sleep',
          start_at: ctx.iso(copyStart),
        }),
        0,
        'with no second entry from the copy',
      );
    },
  },
  {
    id: 'timer-stopped-gives-way',
    tag: '@SYNC-TIMER-GIVES-WAY',
    title: 'a stretch stopped and the next one started offline: the next one is still running',
    async run(api, probe, ctx) {
      // Found with finding 1 (migration 0120). One phone stops a sleep and starts the next, both
      // offline; the stop rides in the batch after its start, so the server meets the new start
      // while the stopped timer is still there. It used to merge them, and the stop then removed
      // the stretch that was still going.
      const t1 = ctx.now() - 4 * 60 * 60_000;
      const end1 = t1 + 3 * 60 * 60_000;
      const t2 = end1 + 25 * 60_000;
      const firstId = ctx.uuid('gives-way-first');
      const secondId = ctx.uuid('gives-way-second');
      const start1 = sleepTimerOp(ctx, firstId, ctx.iso(t1), ctx.userId);
      const [entry1, stop1] = sleepStop(
        ctx,
        'gives-way-stop',
        firstId,
        ctx.iso(t1),
        ctx.iso(end1),
        ctx.userId,
      );
      const start2 = sleepTimerOp(ctx, secondId, ctx.iso(t2), ctx.userId);

      const batch = await push(api, [start1, entry1, start2]);
      assertSucceeded(batch, [start1, entry1, start2], 'the first batch');
      const second = resultFor(batch, start2.client_op_id);
      assertEq(second.entity_id, secondId, 'the running stretch keeps its own timer');
      assertOk(second.conflict?.kind !== 'timer_merged', 'and is never merged into a stopped one');
      assertSucceeded(await push(api, [stop1]), [stop1], 'the first stop');

      const timers = (await probe.timerRows(ctx.householdId)).filter(
        t => t['type'] === 'sleep' && t['child_id'] === ctx.childId,
      );
      assertEq(timers.length, 1, 'one timer running');
      assertEq(String(timers[0]?.['id']), secondId, 'the second stretch');
      assertEq(Date.parse(String(timers[0]?.['started_at'])), t2, 'from its own start');
      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'sleep', start_at: ctx.iso(t1) }),
        1,
        'and the first stretch is saved once',
      );
    },
  },
  {
    id: 'stash-overdraw',
    tag: '@SYNC-OVERDRAW',
    title: 'an overdrawn container never goes negative and never costs a feed',
    async run(api, probe, ctx) {
      const at = ctx.iso();
      const bottle = (tag: string, ml: number, who: string) =>
        bottleFromStashChain({
          ...base(ctx, ctx.uuid(`${tag}-intent`), at),
          createdBy: who,
          containerId: ctx.containerId,
          consumedMl: ml,
          activity: {
            id: ctx.uuid(`${tag}-activity`),
            childId: ctx.childId,
            type: 'bottle',
            startAt: at,
            quantity: ml,
            canonicalUnit: 'ml',
            detail: {
              table: 'bottle_details',
              fields: {
                kind: 'EBM',
                offered_ml: ml,
                consumed_ml: ml,
                from_stash: true,
                container_id: ctx.containerId,
              },
            },
          },
        });

      const whole = ctx.containerMl;
      const mine = bottle('over-a', whole, ctx.userId);
      const theirs = bottle('over-b', whole, ctx.otherUserId);
      assertSucceeded(await push(api, mine.ops), mine.ops, 'the first draw');

      const theirResults = await push(ctx.otherDevice, theirs.ops);
      const theirLedger = theirs.ops.filter(o => o.entity === 'milk_txn')[0];
      assertOk(theirLedger !== undefined, 'the second chain has a ledger op');
      const refused = resultFor(theirResults, theirLedger.client_op_id);
      assertEq(refused.status, 'rejected', 'the second draw cannot come out of an empty container');
      assertEq(refused.error?.code, 'CONFLICT', 'and it is retryable');
      assertEq(refused.conflict?.kind, 'ledger_overdraw', 'the rejection says what is left');

      // The feed is never lost to fix an inventory number: both activities stand.
      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'bottle', start_at: at }),
        2,
        'both babies drank; both records survive',
      );
      const amount = await probe.containerAmount(ctx.containerId);
      assertOk(amount !== null && amount >= 0, 'the balance never goes negative');
    },
  },
  {
    id: 'delete-plus-concurrent-edit',
    tag: '@SYNC-DELETE-EDIT',
    title: 'a soft delete and a concurrent edit both survive, in either arrival order',
    async run(api, probe, ctx) {
      for (const order of ['edit-first', 'delete-first'] as const) {
        const at = ctx.iso();
        const chain = diaperChain(ctx, `del-${order}`, at);
        assertSucceeded(await push(api, chain.ops), chain.ops, `${order}: create`);
        const id = String(chain.ops[0]?.entity_id);

        const edit: ChainOp = {
          client_op_id: ctx.uuid(`del-${order}-edit`),
          entity: 'activity',
          op: 'UPDATE',
          entity_id: id,
          household_id: ctx.householdId,
          payload: { notes: 'a note that must survive', client_edited_at: ctx.iso(ctx.now() + 1) },
          depends_on: null,
        };
        const remove: ChainOp = {
          client_op_id: ctx.uuid(`del-${order}-delete`),
          entity: 'activity',
          op: 'DELETE',
          entity_id: id,
          household_id: ctx.householdId,
          payload: { client_edited_at: ctx.iso(ctx.now() + 2) },
          depends_on: null,
        };
        const ops = order === 'edit-first' ? [edit, remove] : [remove, edit];
        for (const op of ops) assertSucceeded(await push(ctx.otherDevice, [op]), [op], order);

        const row = await probe.activityRow(id);
        assertOk(row !== null, `${order}: the row is never physically removed`);
        assertOk(row['deleted_at'] !== null, `${order}: the delete stands`);
        assertEq(row['notes'], 'a note that must survive', `${order}: the edit stands too`);
      }
    },
  },
  {
    id: 'unit-change-during-queued-write',
    tag: '@SYNC-UNITS',
    title: 'a display unit change never rewrites a stored quantity',
    async run(api, probe, ctx) {
      const at = ctx.iso();
      const intentId = ctx.uuid('units-intent');
      const activityId = ctx.uuid('units-activity');
      // 4 oz entered while the display was in ounces; storage is canonical millilitres.
      const chain = simpleActivityChain(base(ctx, intentId, at), {
        id: activityId,
        childId: ctx.childId,
        type: 'bottle',
        startAt: at,
        quantity: 118,
        canonicalUnit: 'ml',
        detail: {
          table: 'bottle_details',
          fields: {
            kind: 'FORMULA',
            offered_ml: 118,
            consumed_ml: 118,
            from_stash: false,
            container_id: null,
          },
        },
      });
      assertSucceeded(await push(api, chain.ops), chain.ops, 'SYNC-UNITS');
      const row = await probe.activityRow(activityId);
      assertEq(Number(row?.['quantity']), 118, 'the stored quantity is untouched');
      assertEq(row?.['canonical_unit'], 'ml', 'and it is still canonical');
    },
  },
  {
    id: 'thousand-queued-ops',
    tag: '@SYNC-1000',
    title: 'a thousand queued ops flush in batches of at most fifty, with no duplicates',
    async run(api, probe, ctx) {
      const total = 1000;
      const start = ctx.now();
      const chains = [];
      for (let i = 0; i < total; i++) {
        chains.push(diaperChain(ctx, `k-${i}`, ctx.iso(start + i * 1000)));
      }
      const ops = chains.flatMap(c => c.ops);
      let sent = 0;
      for (let i = 0; i < ops.length; i += MAX_BATCH) {
        const slice = ops.slice(i, i + MAX_BATCH);
        assertOk(slice.length <= MAX_BATCH, 'no batch exceeds MAX_BATCH');
        assertSucceeded(await push(api, slice), slice, `batch at ${i}`);
        sent += slice.length;
      }
      assertEq(sent, total, 'every op was sent exactly once');
      assertEq(
        await probe.countActivities(ctx.householdId, { type: 'diaper' }),
        total,
        'one server row per queued op, and no duplicates',
      );
    },
  },
];
