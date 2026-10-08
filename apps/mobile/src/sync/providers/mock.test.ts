/**
 * The in-memory server's invariants, one at a time.
 *
 * `../mock-scenarios.test.ts` proves the fake can carry the whole §9 matrix; this file proves each
 * rule the fake claims to implement, in isolation, so a failure names the rule rather than the
 * story that happened to depend on it. Every one of them is a rule `0009_add_sync_push.sql` or
 * `0002_rls.sql` implements, and the comment on each says which — a fake that quietly stopped
 * refusing something would otherwise turn thirteen scenarios into a test of a fiction (D21).
 */
import { MAX_PUSH_OPS, type PushOp } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { MockSyncApi, MockSyncServer } from './mock';
import { SyncFailure } from './types';

const HH = 'aaaaaaaa-0000-4000-8000-000000000001';
const OWNER = 'bbbbbbbb-0000-4000-8000-000000000001';
const CAREGIVER = 'bbbbbbbb-0000-4000-8000-000000000002';
const STRANGER = 'bbbbbbbb-0000-4000-8000-000000000003';
const VIEWER = 'bbbbbbbb-0000-4000-8000-000000000004';
const CHILD = 'cccccccc-0000-4000-8000-0000000000e1';
const LOCATION = 'dddddddd-0000-4000-8000-000000000001';
const CONTAINER = 'dddddddd-0000-4000-8000-0000000000c1';
const AT = '2026-03-02T10:00:00.000Z';

const id = (n: number): string => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fixture() {
  let ticks = Date.parse('2026-09-14T08:00:00.000Z');
  const server = new MockSyncServer({
    now: () => {
      ticks += 1;
      return ticks;
    },
  });
  server.addMember({ household_id: HH, user_id: OWNER, role: 'OWNER' });
  server.addMember({ household_id: HH, user_id: CAREGIVER, role: 'CAREGIVER' });
  server.addMember({ household_id: HH, user_id: VIEWER, role: 'VIEW_ONLY' });
  server.addLocation({ id: LOCATION, household_id: HH, name: 'Fridge', kind: 'FRIDGE' });
  server.addContainer({
    id: CONTAINER,
    householdId: HH,
    ownerId: OWNER,
    locationId: LOCATION,
    ml: 150,
  });
  return {
    server,
    owner: new MockSyncApi(server, OWNER),
    caregiver: new MockSyncApi(server, CAREGIVER),
    stranger: new MockSyncApi(server, STRANGER),
    viewer: new MockSyncApi(server, VIEWER),
  };
}

const diaper = (opId: number, entity: number, at = AT): PushOp => ({
  client_op_id: id(opId),
  entity: 'activity',
  op: 'CREATE',
  entity_id: id(entity),
  household_id: HH,
  payload: {
    child_id: CHILD,
    type: 'diaper',
    start_at: at,
    client_edited_at: at,
    detail: { table: 'diaper_details', kind: 'WET' },
  },
});

const ledger = (opId: number, entity: number, deltaMl: number, kind = 'USE'): PushOp => ({
  client_op_id: id(opId),
  entity: 'milk_txn',
  op: 'CREATE',
  entity_id: id(entity),
  household_id: HH,
  payload: {
    container_id: CONTAINER,
    kind,
    delta_ml: deltaMl,
    occurred_at: AT,
    created_by: OWNER,
    client_edited_at: AT,
  },
});

const timer = (opId: number, entity: number, startedAt: string): PushOp => ({
  client_op_id: id(opId),
  entity: 'timer',
  op: 'CREATE',
  entity_id: id(entity),
  household_id: HH,
  payload: { child_id: CHILD, type: 'sleep', started_at: startedAt, client_edited_at: startedAt },
});

describe('the batch envelope', () => {
  it('rejects a body over MAX_PUSH_OPS with VALIDATION, before applying anything', async () => {
    // `public.sync_push:782` refuses the whole call with CC422. The worker never sends more than
    // MAX_BATCH, so only a caller bypassing it can get here — and it must not half-apply.
    const f = fixture();
    const ops = Array.from({ length: MAX_PUSH_OPS + 1 }, (_, i) => diaper(i + 1, i + 1001));
    await expect(f.owner.push(ops)).rejects.toBeInstanceOf(SyncFailure);
    await expect(f.owner.push(ops)).rejects.toMatchObject({
      code: 'server',
      pushCode: 'VALIDATION',
    });
    expect(f.server.rowCount('activities')).toBe(0);
  });

  it('accepts exactly MAX_PUSH_OPS', async () => {
    const f = fixture();
    const ops = Array.from({ length: MAX_PUSH_OPS }, (_, i) => diaper(i + 1, i + 1001));
    const res = await f.owner.push(ops);
    expect(res.results).toHaveLength(MAX_PUSH_OPS);
    expect(f.server.rowCount('activities')).toBe(MAX_PUSH_OPS);
  });

  it('returns one result per op, in the order they were sent, and never reorders', async () => {
    const f = fixture();
    const ops = [diaper(1, 101), ledger(2, 102, -10), diaper(3, 103)];
    const res = await f.owner.push(ops);
    expect(res.results.map(r => r.client_op_id)).toEqual(ops.map(o => o.client_op_id));
  });

  it('a malformed op costs that op alone, never the other 49 writes in the batch', async () => {
    const f = fixture();
    const broken: PushOp = { ...diaper(2, 102), entity_id: 'not-a-uuid' };
    const res = await f.owner.push([diaper(1, 101), broken, diaper(3, 103)]);
    expect(res.results.map(r => r.status)).toEqual(['applied', 'rejected', 'applied']);
    expect(res.results[1]?.error?.code).toBe('VALIDATION');
  });

  it('a missing client_op_id fails the whole call, because a result cannot be matched back', async () => {
    const f = fixture();
    const nameless = { ...diaper(1, 101), client_op_id: '' } as PushOp;
    await expect(f.owner.push([nameless])).rejects.toMatchObject({ pushCode: 'VALIDATION' });
  });

  it('an entity from a later release is terminal and says so (D29)', async () => {
    const f = fixture();
    const future = { ...diaper(1, 101), entity: 'sleep_plan' } as unknown as PushOp;
    const res = await f.owner.push([future]);
    expect(res.results[0]?.error?.code).toBe('VALIDATION');
  });
});

describe('authorisation, out of household_members', () => {
  it('a non-member is FORBIDDEN, not silently ignored', async () => {
    // `app.can_write` returns NULL for a non-member, which is why 0009 coalesces it to false:
    // "nothing happened" is the one answer an outbox must never be given.
    const f = fixture();
    const res = await f.stranger.push([diaper(1, 101)]);
    expect(res.results[0]).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } });
    expect(f.server.rowCount('activities')).toBe(0);
  });

  it('a VIEW_ONLY member is FORBIDDEN', async () => {
    const f = fixture();
    const res = await f.viewer.push([diaper(1, 101)]);
    expect(res.results[0]?.error?.code).toBe('FORBIDDEN');
  });

  it('a seat whose end has passed has no role at all, as 0101 makes `app.role_in` answer', async () => {
    let now = Date.parse('2026-09-14T08:00:00.000Z');
    const server = new MockSyncServer({ now: () => now });
    server.addMember({
      household_id: HH,
      user_id: CAREGIVER,
      role: 'CAREGIVER',
      expires_at: new Date(now + 6 * 3_600_000).toISOString(),
    });
    const sitter = new MockSyncApi(server, CAREGIVER);
    const req = { household_id: HH, tables: [] };
    await expect(sitter.pull(req)).resolves.toMatchObject({ tables: {} });
    now += 7 * 3_600_000;
    // the pull is refused outright (D37's CC403), never answered with pages that look empty…
    await expect(sitter.pull(req)).rejects.toMatchObject({ pushCode: 'FORBIDDEN' });
    // …and a write is refused terminally
    expect((await sitter.push([diaper(1, 101)])).results[0]?.error?.code).toBe('FORBIDDEN');
  });

  it('asks the account backend too, when it is given one: one predicate for both halves', async () => {
    // a dev build: the accounts live in the auth mock, which is where a removal happens
    let member = true;
    const server = new MockSyncServer({ isMember: () => member });
    server.addMember({ household_id: HH, user_id: CAREGIVER, role: 'CAREGIVER' });
    const sitter = new MockSyncApi(server, CAREGIVER);
    const req = { household_id: HH, tables: [] };
    await expect(sitter.pull(req)).resolves.toMatchObject({ tables: {} });
    member = false;
    const refused = await sitter.pull(req).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(SyncFailure);
    expect(refused).toMatchObject({ code: 'server', pushCode: 'FORBIDDEN' });
    expect((await sitter.push([diaper(1, 101)])).results[0]?.error?.code).toBe('FORBIDDEN');
  });

  it('a caregiver may not correct a parent entry, and the refusal is terminal', async () => {
    // activities_update (0002_rls.sql:126-130) filters instead of raising, so the zero-row
    // update has to be reported as FORBIDDEN rather than as a missing row (D28).
    const f = fixture();
    await f.owner.push([diaper(1, 101)]);
    const edit: PushOp = {
      client_op_id: id(2),
      entity: 'activity',
      op: 'UPDATE',
      entity_id: id(101),
      household_id: HH,
      payload: { notes: 'not mine to change', client_edited_at: AT },
    };
    const res = await f.caregiver.push([edit]);
    expect(res.results[0]?.error?.code).toBe('FORBIDDEN');
  });

  it('an UPDATE with restore: true lifts the tombstone, as 0012 does (WP5.8)', async () => {
    const f = fixture();
    await f.owner.push([diaper(1, 101)]);
    const del: PushOp = {
      client_op_id: id(2),
      entity: 'activity',
      op: 'DELETE',
      entity_id: id(101),
      household_id: HH,
      payload: { client_edited_at: '2026-03-02T10:00:01.000Z' },
    };
    await f.owner.push([del]);
    expect(f.server.activities[0]?.['deleted_at']).not.toBeNull();
    const restore: PushOp = {
      client_op_id: id(3),
      entity: 'activity',
      op: 'UPDATE',
      entity_id: id(101),
      household_id: HH,
      payload: { restore: true, client_edited_at: '2026-03-02T10:00:02.000Z' },
    };
    const res = await f.owner.push([restore]);
    expect(res.results[0]?.status).toBe('applied');
    expect(f.server.activities[0]?.['deleted_at']).toBeNull();
  });

  it('a caregiver may correct their own entry', async () => {
    const f = fixture();
    await f.caregiver.push([diaper(1, 101)]);
    const edit: PushOp = {
      client_op_id: id(2),
      entity: 'activity',
      op: 'UPDATE',
      entity_id: id(101),
      household_id: HH,
      payload: { notes: 'mine', client_edited_at: '2026-03-02T10:00:01.000Z' },
    };
    const res = await f.caregiver.push([edit]);
    expect(res.results[0]?.status).toBe('applied');
    expect(f.server.activities[0]?.['notes']).toBe('mine');
  });
});

describe('idempotency and the two unique indexes', () => {
  it('a replayed client_op_id is a duplicate, never a second feed', async () => {
    const f = fixture();
    await f.owner.push([diaper(1, 101)]);
    const again = await f.owner.push([diaper(1, 101)]);
    expect(again.results[0]?.status).toBe('duplicate');
    expect(again.results[0]?.entity_id).toBe(id(101));
    expect(f.server.rowCount('activities')).toBe(1);
  });

  it('a replay re-upserts the detail, because the state it finds may be half-applied', async () => {
    const f = fixture();
    await f.owner.push([diaper(1, 101)]);
    f.server.details.diaper_details.length = 0;
    await f.owner.push([diaper(1, 101)]);
    expect(f.server.detailRow(id(101), 'diaper_details')).not.toBeNull();
  });

  it('a second device stopping the same timer is one stop, and the later end wins', async () => {
    // activities_timer_uniq (0009:96-100). Two different client_op_ids, one real stop.
    const f = fixture();
    const stop = (opId: number, entityId: number, endAt: string, api: MockSyncApi) =>
      api.push([
        {
          client_op_id: id(opId),
          entity: 'activity',
          op: 'CREATE',
          entity_id: id(entityId),
          household_id: HH,
          payload: {
            child_id: CHILD,
            type: 'sleep',
            start_at: AT,
            end_at: endAt,
            metadata: { timer_id: id(900) },
            client_edited_at: endAt,
            detail: { table: 'sleep_details', kind: 'NAP' },
          },
        },
      ]);
    await stop(1, 101, '2026-03-02T10:30:00.000Z', f.owner);
    const second = await stop(2, 102, '2026-03-02T10:45:00.000Z', f.caregiver);
    expect(second.results[0]?.status).toBe('duplicate');
    expect(second.results[0]?.entity_id).toBe(id(101));
    expect(f.server.rowCount('activities')).toBe(1);
    expect(f.server.activities[0]?.['end_at']).toBe('2026-03-02T10:45:00.000Z');
  });

  it('an earlier second stop does not drag the end time backwards', async () => {
    const f = fixture();
    const stop = (opId: number, entityId: number, endAt: string) => ({
      client_op_id: id(opId),
      entity: 'activity' as const,
      op: 'CREATE' as const,
      entity_id: id(entityId),
      household_id: HH,
      payload: {
        child_id: CHILD,
        type: 'sleep',
        start_at: AT,
        end_at: endAt,
        metadata: { timer_id: id(900) },
        client_edited_at: endAt,
      },
    });
    await f.owner.push([stop(1, 101, '2026-03-02T10:45:00.000Z')]);
    await f.owner.push([stop(2, 102, '2026-03-02T10:30:00.000Z')]);
    expect(f.server.activities[0]?.['end_at']).toBe('2026-03-02T10:45:00.000Z');
  });

  it('two devices starting one timer merge on the earlier start', async () => {
    // running_timers_uniq. Not rejected: a parent's real start time is the truth (§5.1).
    const f = fixture();
    await f.owner.push([timer(1, 101, '2026-03-02T10:04:00.000Z')]);
    const second = await f.caregiver.push([timer(2, 102, '2026-03-02T10:00:00.000Z')]);
    expect(second.results[0]?.status).toBe('applied');
    expect(second.results[0]?.conflict).toMatchObject({
      kind: 'timer_merged',
      timer_id: id(101),
      started_at: '2026-03-02T10:00:00.000Z',
      started_by: CAREGIVER,
    });
    expect(f.server.rowCount('running_timers')).toBe(1);
  });

  it('a timer DELETE with no row is a success, because that IS the second stop (D28)', async () => {
    const f = fixture();
    const del: PushOp = {
      client_op_id: id(1),
      entity: 'timer',
      op: 'DELETE',
      entity_id: id(900),
      household_id: HH,
      payload: { client_edited_at: AT },
    };
    expect((await f.owner.push([del])).results[0]?.status).toBe('duplicate');
  });

  it('a timer UPDATE that raced the other parent stop is settled, not failed', async () => {
    const f = fixture();
    const patch: PushOp = {
      client_op_id: id(1),
      entity: 'timer',
      op: 'UPDATE',
      entity_id: id(900),
      household_id: HH,
      payload: { paused_ms: 1000, client_edited_at: AT },
    };
    expect((await f.owner.push([patch])).results[0]?.status).toBe('duplicate');
  });
});

describe('the ledger', () => {
  it('is append-only: an UPDATE is terminal and says what to do instead', async () => {
    const f = fixture();
    const edit: PushOp = { ...ledger(1, 101, -10), op: 'UPDATE' };
    const res = await f.owner.push([edit]);
    expect(res.results[0]?.error?.code).toBe('VALIDATION');
    expect(res.results[0]?.error?.message).toMatch(/ADJUST/);
  });

  it('a draw whose activity has not landed is retryable, never a crash', async () => {
    const f = fixture();
    const orphan: PushOp = {
      ...ledger(1, 101, -10),
      payload: { ...ledger(1, 101, -10).payload, activity_id: id(999) },
    };
    const res = await f.owner.push([orphan]);
    expect(res.results[0]).toMatchObject({ status: 'rejected', error: { code: 'CONFLICT' } });
    expect(f.server.rowCount('milk_inventory_transactions')).toBe(1); // the seed ADD only
  });

  it('an overdraw comes back CONFLICT with what is really left', async () => {
    const f = fixture();
    expect((await f.owner.push([ledger(1, 101, -120)])).results[0]?.status).toBe('applied');
    const refused = await f.owner.push([ledger(2, 102, -120)]);
    expect(refused.results[0]?.error?.code).toBe('CONFLICT');
    expect(refused.results[0]?.conflict).toEqual({
      kind: 'ledger_overdraw',
      container_id: CONTAINER,
      available_ml: 30,
    });
    expect(f.server.milk_containers[0]?.['amount_ml']).toBe(30);
  });

  it('a downward ADJUST may record a deficit, and the amount floors at zero', async () => {
    // 0009's one exception: a negative ADJUST is a correction to the books, not a withdrawal —
    // the milk it names was never in the bag. The deficit is kept where it can be reconciled.
    const f = fixture();
    await f.owner.push([ledger(1, 101, -120)]);
    const adjust = await f.owner.push([ledger(2, 102, -90, 'ADJUST')]);
    expect(adjust.results[0]?.status).toBe('applied');
    expect(f.server.milk_containers[0]?.['amount_ml']).toBe(0);
    // and recording a shortfall does not create milk: the next withdrawal still sees the deficit
    const after = await f.owner.push([ledger(3, 103, -10)]);
    expect(after.results[0]?.error?.code).toBe('CONFLICT');
  });

  it('a replayed ledger op is a duplicate', async () => {
    const f = fixture();
    await f.owner.push([ledger(1, 101, -10)]);
    const again = await f.owner.push([ledger(1, 101, -10)]);
    expect(again.results[0]?.status).toBe('duplicate');
    expect(f.server.milk_containers[0]?.['amount_ml']).toBe(140);
  });
});

describe('containers', () => {
  const create = (opId: number, entityId: number, extra: Record<string, unknown> = {}): PushOp => ({
    client_op_id: id(opId),
    entity: 'container',
    op: 'CREATE',
    entity_id: id(entityId),
    household_id: HH,
    payload: {
      owner_id: OWNER,
      location_id: LOCATION,
      initial_ml: 120,
      pumped_at: AT,
      client_edited_at: AT,
      ...extra,
    },
  });

  it('is created empty: the ledger is the only writer of an amount', async () => {
    const f = fixture();
    expect((await f.owner.push([create(1, 201)])).results[0]?.status).toBe('applied');
    const made = f.server.milk_containers.find(c => c['id'] === id(201));
    expect(made?.['amount_ml']).toBe(0);
    expect(made?.['initial_ml']).toBe(120);
  });

  it('is discarded, never deleted', async () => {
    const f = fixture();
    await f.owner.push([create(1, 201)]);
    const del: PushOp = { ...create(2, 201), op: 'DELETE' };
    const res = await f.owner.push([del]);
    expect(res.results[0]?.error?.code).toBe('VALIDATION');
    expect(res.results[0]?.error?.message).toMatch(/discarded, never deleted/);
  });

  it('first_frozen_at is write-once, and a stale client cannot fail a good patch', async () => {
    const f = fixture();
    await f.owner.push([create(1, 201, { first_frozen_at: '2026-03-01T00:00:00.000Z' })]);
    const move: PushOp = {
      client_op_id: id(2),
      entity: 'container',
      op: 'UPDATE',
      entity_id: id(201),
      household_id: HH,
      payload: {
        first_frozen_at: '2026-03-02T00:00:00.000Z',
        location_id: LOCATION,
        // after the row's own updated_at (the fake's clock sits at 08:00) and inside the
        // five-minute skew window, so the patch is clamped to now() rather than refused
        client_edited_at: '2026-09-14T08:01:00.000Z',
      },
    };
    expect((await f.owner.push([move])).results[0]?.status).toBe('applied');
    const row = f.server.milk_containers.find(c => c['id'] === id(201));
    expect(row?.['first_frozen_at']).toBe('2026-03-01T00:00:00.000Z');
  });

  it('a patch older than the row is dropped whole, and the server row comes back (D2)', async () => {
    const f = fixture();
    await f.owner.push([create(1, 201)]);
    const stale: PushOp = {
      client_op_id: id(2),
      entity: 'container',
      op: 'UPDATE',
      entity_id: id(201),
      household_id: HH,
      payload: { status: 'DISCARDED', client_edited_at: '2026-03-02T09:00:00.000Z' },
    };
    expect((await f.owner.push([stale])).results[0]?.status).toBe('applied');
    expect(f.server.milk_containers.find(c => c['id'] === id(201))?.['status']).toBe('STORED');
  });

  it('is created knowing what the phone knows: a split thawing bag, a counter bag used (0116)', async () => {
    const f = fixture();
    const thawedAt = '2026-03-02T09:00:00.000Z';
    const res = await f.owner.push([
      create(1, 201, {
        status: 'THAWING',
        first_frozen_at: '2026-03-01T00:00:00.000Z',
        thawed_at: thawedAt,
      }),
      create(2, 202, { status: 'USED', used_at: AT }),
    ]);
    expect(res.results.map(r => r.status)).toEqual(['applied', 'applied']);
    expect(f.server.milk_containers.find(c => c['id'] === id(201))).toMatchObject({
      status: 'THAWING',
      thawed_at: thawedAt,
      client_edited_at: AT,
    });
    expect(f.server.milk_containers.find(c => c['id'] === id(202))).toMatchObject({
      status: 'USED',
      used_at: AT,
    });
  });

  it('an edit is compared with the last EDIT, never with the stamp a feed’s ledger row left (0116)', async () => {
    const f = fixture();
    // the fixture's bag was stocked, not edited; a feed draws from it on the server's clock
    // (September), long after the phone clock of the move below (March)
    expect((await f.owner.push([ledger(1, 301, -30)])).results[0]?.status).toBe('applied');
    const patch = (opId: number, fields: Record<string, unknown>, at: string): PushOp => ({
      client_op_id: id(opId),
      entity: 'container',
      op: 'UPDATE',
      entity_id: CONTAINER,
      household_id: HH,
      payload: { ...fields, client_edited_at: at },
    });
    const move = patch(2, { notes: 'moved' }, '2026-03-02T10:01:00.000Z');
    expect((await f.owner.push([move])).results[0]?.status).toBe('applied');
    // and a patch made BEFORE the move, arriving after it, is still dropped whole
    const stale = patch(3, { notes: 'stale' }, '2026-03-02T10:00:30.000Z');
    expect((await f.owner.push([stale])).results[0]?.status).toBe('applied');
    const row = f.server.milk_containers.find(c => c['id'] === CONTAINER);
    expect(row).toMatchObject({
      notes: 'moved',
      amount_ml: 120,
      client_edited_at: '2026-03-02T10:01:00.000Z',
    });
  });
});

describe('the edit clock', () => {
  it('rejects a device more than five minutes ahead rather than clamping it', async () => {
    // Clamping a wildly wrong clock silently lets it win every field for ever (D1).
    const f = fixture();
    const ahead = '2026-09-14T09:00:00.000Z'; // the fake server's clock sits at 08:00
    const op: PushOp = {
      ...diaper(1, 101),
      payload: { ...diaper(1, 101).payload, client_edited_at: ahead },
    };
    const res = await f.owner.push([op]);
    expect(res.results[0]?.error?.code).toBe('VALIDATION');
    expect(res.results[0]?.error?.message).toMatch(/five minutes|5 minutes/);
  });
});

describe('the controls §9 asks for', () => {
  it('offline throws without touching a row', async () => {
    const f = fixture();
    f.server.online = false;
    await expect(f.owner.push([diaper(1, 101)])).rejects.toMatchObject({ code: 'offline' });
    expect(f.server.rowCount('activities')).toBe(0);
  });

  it('dropNextResponse applies the ops and then loses the answer', async () => {
    // §9 row 7a. This is the case the idempotency keys exist for, and a fake that simply failed
    // the call would never produce it.
    const f = fixture();
    f.server.dropNextResponse();
    await expect(f.owner.push([diaper(1, 101)])).rejects.toMatchObject({ code: 'transport' });
    expect(f.server.rowCount('activities')).toBe(1);
    expect((await f.owner.push([diaper(1, 101)])).results[0]?.status).toBe('duplicate');
  });

  it('abortAfterOps applies exactly that many and then drops the connection', async () => {
    const f = fixture();
    f.server.abortAfterOps = 3;
    const ops = [1, 2, 3, 4, 5].map(i => diaper(i, 100 + i));
    await expect(f.owner.push(ops)).rejects.toMatchObject({ code: 'transport' });
    expect(f.server.rowCount('activities')).toBe(3);
  });

  it('rejectNextWith injects exactly one rejection', async () => {
    const f = fixture();
    f.server.rejectNextWith('SERVER', 'the server fell over');
    const res = await f.owner.push([diaper(1, 101), diaper(2, 102)]);
    expect(res.results[0]).toMatchObject({ status: 'rejected', error: { code: 'SERVER' } });
    expect(res.results[1]?.status).toBe('applied');
  });

  it('counts rows and takes another caregiver writes', () => {
    const f = fixture();
    f.server.insertAsOtherDevice('activities', {
      id: id(500),
      household_id: HH,
      child_id: CHILD,
      type: 'diaper',
      start_at: AT,
      created_by: CAREGIVER,
      deleted_at: null,
      metadata: {},
    });
    expect(f.server.rowCount('activities')).toBe(1);
    expect(f.server.rowCount('activities', { type: 'bottle' })).toBe(0);
    expect(f.server.rowCount('activities', { created_by: CAREGIVER })).toBe(1);
  });
});
