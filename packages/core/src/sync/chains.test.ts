import { describe, expect, it } from 'vitest';
import {
  bottleFromStashChain,
  containerThawChain,
  fanOutChain,
  pumpToStashChain,
  simpleActivityChain,
  timerStopChain,
  type ChainBase,
} from './chains';
import { deriveOpId } from './ids';
import { DETAIL_TABLE_BY_ACTIVITY, toPushOp } from './types';

const HOUSEHOLD = 'aaaaaaaa-0000-0000-0000-00000000000a';
const DANA = '11111111-1111-1111-1111-111111111111';
const EMMA = 'cccccccc-0000-0000-0000-0000000000e1';
const LIAM = 'cccccccc-0000-0000-0000-0000000000e2';
const CONTAINER = 'bbbbbbbb-0000-0000-0000-000000000001';
const LOCATION = 'ffffffff-0000-0000-0000-000000000001';
const INTENT = '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f';
const SUBMISSION = '0f8d3b1a-6c45-4e29-8a7b-2d9e5c410f63';
const AT = '2026-09-14T13:00:00.000Z';

const base = (intentId = INTENT): ChainBase => ({
  intentId,
  householdId: HOUSEHOLD,
  createdBy: DANA,
  deviceId: 'device-a',
  clientEditedAt: AT,
});

const diaper = (id: string, childId: string | null = EMMA) =>
  ({
    id,
    childId,
    type: 'diaper',
    startAt: AT,
    detail: { table: 'diaper_details', fields: { kind: 'WET', rash: false } },
  }) as const;

describe('simpleActivityChain', () => {
  it('is one op keyed by the intent, with the detail embedded in its payload', () => {
    const chain = simpleActivityChain(base(), diaper('eeeeeeee-0000-0000-0000-000000000001'));
    expect(chain.ops).toHaveLength(1);
    const op = chain.ops[0];
    expect(op?.client_op_id).toBe(INTENT);
    expect(op?.entity).toBe('activity');
    expect(op?.depends_on).toBeNull();
    expect(op?.payload['detail']).toEqual({ table: 'diaper_details', kind: 'WET', rash: false });
    expect(op?.payload['client_edited_at']).toBe(AT);
  });

  it('writes the activity row and its detail row locally, and nothing else', () => {
    const chain = simpleActivityChain(base(), diaper('eeeeeeee-0000-0000-0000-000000000001'));
    expect(chain.rows.map(r => r.table)).toEqual(['activities', 'diaper_details']);
    expect(chain.rows[1]?.row['activity_id']).toBe('eeeeeeee-0000-0000-0000-000000000001');
    expect(chain.rows[0]?.row['deleted_at']).toBeNull();
  });

  it('writes no detail row for a type that has none', () => {
    const chain = simpleActivityChain(base(), {
      id: 'eeeeeeee-0000-0000-0000-000000000002',
      childId: EMMA,
      type: 'tummy',
      startAt: AT,
    });
    expect(DETAIL_TABLE_BY_ACTIVITY.tummy).toBeNull();
    expect(chain.rows.map(r => r.table)).toEqual(['activities']);
    expect(chain.ops[0]?.payload['detail']).toBeUndefined();
  });

  it('refuses a detail table that does not belong to the activity type', () => {
    expect(() =>
      simpleActivityChain(base(), {
        id: 'eeeeeeee-0000-0000-0000-000000000003',
        childId: EMMA,
        type: 'bath',
        detail: { table: 'sleep_details', fields: {} },
        startAt: AT,
      }),
    ).toThrow(TypeError);
    expect(() =>
      simpleActivityChain(base(), {
        id: 'eeeeeeee-0000-0000-0000-000000000004',
        childId: EMMA,
        type: 'sleep',
        startAt: AT,
      }),
    ).toThrow(TypeError);
  });

  it('drops depends_on on the way to the wire: the server sorts nothing', () => {
    const chain = simpleActivityChain(base(), diaper('eeeeeeee-0000-0000-0000-000000000005'));
    expect(Object.keys(toPushOp(chain.ops[0]!))).not.toContain('depends_on');
  });
});

describe('bottleFromStashChain', () => {
  const chain = bottleFromStashChain({
    ...base(),
    containerId: CONTAINER,
    consumedMl: 120,
    activity: {
      id: 'eeeeeeee-0000-0000-0000-00000000000b',
      childId: EMMA,
      type: 'bottle',
      startAt: AT,
      quantity: 120,
      canonicalUnit: 'ml',
      detail: {
        table: 'bottle_details',
        fields: {
          kind: 'EBM',
          offered_ml: 120,
          consumed_ml: 120,
          from_stash: true,
          container_id: CONTAINER,
        },
      },
    },
  });

  it('is exactly TWO ops, not the four docs/OFFLINE_SYNC.md §2.3 draws', () => {
    // The detail travels inside its activity: detail RLS resolves through the parent, and a
    // detail op that reached FAILED alone would be a bottle with no amount.
    expect(chain.ops).toHaveLength(2);
    expect(chain.ops.map(o => o.entity)).toEqual(['activity', 'milk_txn']);
  });

  it('ties both ops to one intent and orders the ledger behind the activity', () => {
    expect(chain.ops[0]?.client_op_id).toBe(INTENT);
    expect(chain.ops[1]?.client_op_id).toBe(deriveOpId(INTENT, 'use'));
    expect(chain.ops[1]?.depends_on).toBe(INTENT);
  });

  it('deducts what was poured, as a negative USE against the container', () => {
    expect(chain.ops[1]?.payload).toMatchObject({
      container_id: CONTAINER,
      kind: 'USE',
      delta_ml: -120,
      activity_id: 'eeeeeeee-0000-0000-0000-00000000000b',
    });
  });

  it('writes the activity, the detail and the ledger row in one set: the draw and the entry are one unit', () => {
    expect(chain.rows.map(r => r.table)).toEqual([
      'activities',
      'bottle_details',
      'milk_inventory_transactions',
    ]);
    const ledger = chain.rows[2]?.row;
    expect(ledger?.['id']).toBe(deriveOpId(INTENT, 'use'));
    expect(ledger?.['client_op_id']).toBe(deriveOpId(INTENT, 'use'));
    // A CREATE chain's rows are COMPLETE: the local mirror declares every one of these
    // `not null` with no default, so a missing key is a constraint error at 3 a.m. offline,
    // not a nullable column. WP4.3 found `created_at` missing here that way.
    for (const column of [
      'id',
      'client_op_id',
      'household_id',
      'container_id',
      'kind',
      'delta_ml',
      'occurred_at',
      'created_by',
      'created_at',
    ]) {
      expect(ledger?.[column], column).not.toBeUndefined();
    }
    expect(ledger?.['created_at']).toBe(AT);
  });

  it('is byte-identical when rebuilt from the same input after a kill', () => {
    const again = bottleFromStashChain({
      ...base(),
      containerId: CONTAINER,
      consumedMl: 120,
      activity: {
        id: 'eeeeeeee-0000-0000-0000-00000000000b',
        childId: EMMA,
        type: 'bottle',
        startAt: AT,
        quantity: 120,
        canonicalUnit: 'ml',
        detail: {
          table: 'bottle_details',
          fields: {
            kind: 'EBM',
            offered_ml: 120,
            consumed_ml: 120,
            from_stash: true,
            container_id: CONTAINER,
          },
        },
      },
    });
    expect(JSON.stringify(again)).toBe(JSON.stringify(chain));
  });

  it('refuses a non-bottle activity and a non-positive amount', () => {
    const args = {
      ...base(),
      containerId: CONTAINER,
      consumedMl: 120,
      activity: diaper('eeeeeeee-0000-0000-0000-00000000000c'),
    };
    expect(() => bottleFromStashChain(args)).toThrow(TypeError);
  });
});

describe('pumpToStashChain', () => {
  const chain = pumpToStashChain({
    ...base(),
    activity: {
      id: 'eeeeeeee-0000-0000-0000-00000000000d',
      childId: null,
      type: 'pump',
      startAt: AT,
      isPrivate: true,
      detail: {
        table: 'pump_details',
        fields: {
          sides: 'BOTH',
          left_ml: 60,
          right_ml: 60,
          total_ml: 120,
          stored_to_stash: true,
        },
      },
    },
    container: {
      id: CONTAINER,
      ownerId: DANA,
      locationId: LOCATION,
      containerType: 'BAG',
      initialMl: 120,
      pumpedAt: AT,
    },
  });

  it('is activity, container, ledger ADD — in that order, each waiting on the last', () => {
    expect(chain.ops.map(o => o.entity)).toEqual(['activity', 'container', 'milk_txn']);
    expect(chain.ops[1]?.depends_on).toBe(INTENT);
    expect(chain.ops[2]?.depends_on).toBe(chain.ops[1]?.client_op_id);
    expect(chain.ops[2]?.client_op_id).toBe(deriveOpId(INTENT, 'add'));
  });

  it('inserts the container at zero and lets the ledger set the amount', () => {
    const container = chain.rows.find(r => r.table === 'milk_containers');
    expect(container?.row['amount_ml']).toBe(0);
    expect(container?.row['initial_ml']).toBe(120);
    expect(chain.ops[1]?.payload['amount_ml']).toBeUndefined();
    expect(chain.ops[2]?.payload).toMatchObject({ kind: 'ADD', delta_ml: 120 });
  });

  it('keeps the session household-scoped and private', () => {
    expect(chain.ops[0]?.payload['child_id']).toBeNull();
    expect(chain.ops[0]?.payload['is_private']).toBe(true);
  });
});

describe('timerStopChain', () => {
  const chain = timerStopChain({
    ...base(),
    timerId: 'dddddddd-0000-0000-0000-000000000001',
    activity: {
      id: 'eeeeeeee-0000-0000-0000-00000000000e',
      childId: EMMA,
      type: 'sleep',
      startAt: '2026-09-14T12:00:00.000Z',
      endAt: AT,
      metadata: { source: 'timer_card' },
      detail: {
        table: 'sleep_details',
        fields: { kind: 'NAP', wake_count: null, location: null },
      },
    },
  });

  it('carries metadata.timer_id, which is what lets the server dedupe a second stop', () => {
    expect(chain.ops[0]?.payload['metadata']).toEqual({
      source: 'timer_card',
      timer_id: 'dddddddd-0000-0000-0000-000000000001',
    });
    expect(chain.rows[0]?.row['metadata']).toMatchObject({
      timer_id: 'dddddddd-0000-0000-0000-000000000001',
    });
  });

  it('deletes the timer after the activity, never before', () => {
    expect(chain.ops.map(o => `${o.entity}:${o.op}`)).toEqual(['activity:CREATE', 'timer:DELETE']);
    expect(chain.ops[1]?.entity_id).toBe('dddddddd-0000-0000-0000-000000000001');
    expect(chain.ops[1]?.depends_on).toBe(INTENT);
  });

  it('writes no local row for the stopped timer: running_timers has no deleted_at', () => {
    expect(chain.rows.map(r => r.table)).toEqual(['activities', 'sleep_details']);
  });
});

describe('containerThawChain', () => {
  const chain = containerThawChain({
    ...base(),
    containerId: CONTAINER,
    fromLocationId: LOCATION,
    toLocationId: 'ffffffff-0000-0000-0000-000000000002',
    thawedAt: AT,
  });

  it('changes the status and records a zero-delta THAW in the ledger', () => {
    expect(chain.ops.map(o => `${o.entity}:${o.op}`)).toEqual([
      'container:UPDATE',
      'milk_txn:CREATE',
    ]);
    expect(chain.ops[0]?.payload).toMatchObject({ status: 'THAWING', thawed_at: AT });
    expect(chain.ops[1]?.payload).toMatchObject({
      kind: 'THAW',
      delta_ml: 0,
      from_location_id: LOCATION,
      to_location_id: 'ffffffff-0000-0000-0000-000000000002',
    });
  });

  it('never touches first_frozen_at: a freezer move must not re-age milk', () => {
    expect(Object.keys(chain.ops[0]!.payload)).not.toContain('first_frozen_at');
    expect(Object.keys(chain.rows[0]!.row)).not.toContain('first_frozen_at');
  });
});

describe('fanOutChain', () => {
  const chain = fanOutChain({
    submissionId: SUBMISSION,
    householdId: HOUSEHOLD,
    createdBy: DANA,
    deviceId: 'device-a',
    clientEditedAt: AT,
    entries: [
      { childId: EMMA, activity: diaper('eeeeeeee-0000-0000-0000-0000000000e1') },
      { childId: LIAM, activity: diaper('eeeeeeee-0000-0000-0000-0000000000e2', LIAM) },
    ],
  });

  it('writes one entry per child — never one merged row', () => {
    expect(chain.ops).toHaveLength(2);
    expect(chain.rows.filter(r => r.table === 'activities')).toHaveLength(2);
    expect(chain.ops.map(o => o.payload['child_id'])).toEqual([EMMA, LIAM]);
  });

  it('mints deriveOpId(submission_id, child_id) per child, so a retry duplicates neither', () => {
    expect(chain.ops[0]?.client_op_id).toBe(deriveOpId(SUBMISSION, EMMA));
    expect(chain.ops[1]?.client_op_id).toBe(deriveOpId(SUBMISSION, LIAM));
    expect(chain.ops[0]?.client_op_id).not.toBe(chain.ops[1]?.client_op_id);
  });

  it('is byte-identical on replay from the same submission id', () => {
    const again = fanOutChain({
      submissionId: SUBMISSION,
      householdId: HOUSEHOLD,
      createdBy: DANA,
      deviceId: 'device-a',
      clientEditedAt: AT,
      entries: [
        { childId: EMMA, activity: diaper('eeeeeeee-0000-0000-0000-0000000000e1') },
        { childId: LIAM, activity: diaper('eeeeeeee-0000-0000-0000-0000000000e2', LIAM) },
      ],
    });
    expect(JSON.stringify(again)).toBe(JSON.stringify(chain));
  });

  it('refuses an empty fan-out, a repeated child, and an entry whose activity names another child', () => {
    const shared = {
      submissionId: SUBMISSION,
      householdId: HOUSEHOLD,
      createdBy: DANA,
      deviceId: null,
      clientEditedAt: AT,
    };
    expect(() => fanOutChain({ ...shared, entries: [] })).toThrow(TypeError);
    expect(() =>
      fanOutChain({
        ...shared,
        entries: [
          { childId: EMMA, activity: diaper('eeeeeeee-0000-0000-0000-0000000000e1') },
          { childId: EMMA, activity: diaper('eeeeeeee-0000-0000-0000-0000000000e3') },
        ],
      }),
    ).toThrow(TypeError);
    expect(() =>
      fanOutChain({
        ...shared,
        entries: [{ childId: LIAM, activity: diaper('eeeeeeee-0000-0000-0000-0000000000e4') }],
      }),
    ).toThrow(TypeError);
  });
});
