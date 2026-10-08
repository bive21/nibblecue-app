/**
 * `SupabaseSyncApi` against a stubbed `rpc`. No network, no project, no credential.
 *
 * WHAT THIS CAN AND CANNOT PROVE, stated plainly because the report says the same thing: it
 * proves the envelope — the order of the ops, the split of a long body, the parse of the answer,
 * and the classification of every error class the migration can raise — and, since 2026-09-30,
 * the nudge's channel: its name, that it is private, the token before the join, and the leave. It
 * cannot prove that
 * `public.sync_push` behaves as `packages/db/src/integration/sync-push.test.ts` says it does;
 * that suite runs against real Postgres, and the two together are the coverage. Exercising THIS
 * arm end to end needs owner-held credentials and is an owner verification item.
 */
import { MAX_PUSH_OPS, type PushOp } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import {
  SupabaseSyncApi,
  type RpcAnswer,
  type SyncRealtimeChannel,
  type SyncRealtimeClient,
  type SyncRpcClient,
} from './supabase';
import type { PostgrestLikeError } from '../sqlstate';

const HH = 'aaaaaaaa-0000-4000-8000-000000000001';
const id = (n: number): string => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;

const op = (n: number): PushOp => ({
  client_op_id: id(n),
  entity: 'activity',
  op: 'CREATE',
  entity_id: id(1000 + n),
  household_id: HH,
  payload: { type: 'diaper', start_at: '2026-03-02T10:00:00.000Z' },
});

interface Call {
  fn: string;
  args: Record<string, unknown>;
}

/** A client that records what it was asked and answers with whatever the test supplies. */
function stub(answer: (call: Call) => RpcAnswer | Promise<RpcAnswer>) {
  const calls: Call[] = [];
  const client: SyncRpcClient = {
    rpc(fn, args) {
      const call = { fn, args };
      calls.push(call);
      return Promise.resolve(answer(call));
    },
  };
  return { client, calls, api: new SupabaseSyncApi(client) };
}

const ok = (ops: PushOp[]): RpcAnswer => ({
  data: {
    results: ops.map(o => ({
      client_op_id: o.client_op_id,
      status: 'applied',
      entity_id: o.entity_id,
    })),
    server_time: '2026-09-14T08:00:00.000Z',
  },
  error: null,
});

describe('push', () => {
  it('sends one call and keeps the order it was given', async () => {
    const s = stub(call => ok((call.args['ops'] as PushOp[]) ?? []));
    const ops = [op(3), op(1), op(2)];
    const res = await s.api.push(ops);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.fn).toBe('sync_push');
    expect((s.calls[0]?.args['ops'] as PushOp[]).map(o => o.client_op_id)).toEqual(
      ops.map(o => o.client_op_id),
    );
    expect(res.results.map(r => r.client_op_id)).toEqual(ops.map(o => o.client_op_id));
  });

  it('splits a body over MAX_PUSH_OPS into successive calls, in order', async () => {
    // The server refuses more than 200 with CC422 and the refusal costs the whole batch, so a
    // long array becomes calls of 200 — split by index, never re-ordered, so a chain is not cut
    // with its dependency in a later call than the op that needs it.
    const s = stub(call => ok((call.args['ops'] as PushOp[]) ?? []));
    const ops = Array.from({ length: MAX_PUSH_OPS + 1 }, (_, i) => op(i + 1));
    const res = await s.api.push(ops);
    expect(s.calls).toHaveLength(2);
    expect((s.calls[0]?.args['ops'] as PushOp[]).length).toBe(MAX_PUSH_OPS);
    expect((s.calls[1]?.args['ops'] as PushOp[]).length).toBe(1);
    expect(res.results).toHaveLength(MAX_PUSH_OPS + 1);
    expect(res.results.map(r => r.client_op_id)).toEqual(ops.map(o => o.client_op_id));
  });

  it('sends nothing at all for an empty batch', async () => {
    const s = stub(() => ({ data: null, error: null }));
    expect((await s.api.push([])).results).toEqual([]);
    expect(s.calls).toEqual([]);
  });

  it('refuses a body the device could not read, rather than passing it on', async () => {
    // sync_push returns jsonb and jsonb has no type checker. A shape that is not a PushResponse
    // has to fail here, where the outbox row is still PENDING.
    const s = stub(() => ({ data: { results: 'not an array' }, error: null }));
    await expect(s.api.push([op(1)])).rejects.toThrow();
  });
});

describe('pull', () => {
  // NibbleCue's provider asks nothing of the server for an empty request, so each case names a
  // table; `nibble_records` goes to NibbleCue's own function and never through `sync_pull`
  const ACTIVITIES = {
    name: 'activities',
    strategy: 'delta' as const,
    since: null,
    since_id: null,
    limit: 500,
  };
  const NIBBLE = {
    name: 'nibble_records',
    strategy: 'delta' as const,
    since: null,
    since_id: null,
    limit: 500,
  };

  it('calls sync_pull with the request under `req`', async () => {
    const s = stub(() => ({
      data: { tables: {}, server_time: '2026-09-14T08:00:00.000Z' },
      error: null,
    }));
    await s.api.pull({ household_id: HH, tables: [ACTIVITIES] });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.fn).toBe('sync_pull');
    expect(s.calls[0]?.args['req']).toEqual({ household_id: HH, tables: [ACTIVITIES] });
  });

  it('asks nibble_sync_pull for nibble_records, and sync_pull for the rest only', async () => {
    const s = stub(call =>
      call.fn === 'nibble_sync_pull'
        ? {
            data: {
              rows: [],
              next_cursor: null,
              has_more: false,
              server_time: '2026-09-14T08:00:00.000Z',
            },
            error: null,
          }
        : { data: { tables: {}, server_time: '2026-09-14T08:00:01.000Z' }, error: null },
    );
    const res = await s.api.pull({ household_id: HH, tables: [ACTIVITIES, NIBBLE] });
    expect(s.calls.map(c => c.fn)).toEqual(['sync_pull', 'nibble_sync_pull']);
    expect(s.calls[0]?.args['req']).toEqual({ household_id: HH, tables: [ACTIVITIES] });
    expect(s.calls[1]?.args['req']).toEqual({
      household_id: HH,
      since: null,
      since_id: null,
      limit: 500,
    });
    expect(res.tables['nibble_records']).toEqual({ rows: [], next_cursor: null, has_more: false });
    // the earlier of the two clocks, so no cursor moves past what either answer saw
    expect(res.server_time).toBe('2026-09-14T08:00:00.000Z');
  });

  it('asks nothing of the server for an empty request', async () => {
    const s = stub(() => ({ data: null, error: null }));
    expect((await s.api.pull({ household_id: HH, tables: [] })).tables).toEqual({});
    expect(s.calls).toEqual([]);
  });
});

describe('every error class maps through the shared table', () => {
  const cases: readonly [PostgrestLikeError, string][] = [
    [{ code: 'CC403', message: 'forbidden' }, 'FORBIDDEN'],
    [{ code: '42501', message: 'permission denied' }, 'FORBIDDEN'],
    [{ code: 'CC422', message: 'validation_error' }, 'VALIDATION'],
    [{ code: '23514', message: 'check constraint' }, 'VALIDATION'],
    [{ code: '23503', message: 'foreign key' }, 'CONFLICT'],
    [{ code: 'CC404', message: 'not found' }, 'CONFLICT'],
    [{ code: 'P0001', message: 'ledger would go negative (-90)' }, 'CONFLICT'],
    [{ code: 'P0001', message: 'first_frozen_at is immutable' }, 'VALIDATION'],
    [{ code: '40P01', message: 'deadlock detected' }, 'SERVER'],
    [{ code: 'CC429', message: 'rate_limited' }, 'SERVER'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'SERVER'],
  ];

  for (const [error, expected] of cases) {
    it(`${String(error.code)} becomes ${expected}`, async () => {
      const s = stub(() => ({ data: null, error }));
      await expect(s.api.push([op(1)])).rejects.toMatchObject({
        code: 'server',
        pushCode: expected,
        message: error.message,
      });
    });
  }

  /**
   * NO ANSWER, AS SUPABASE-JS REPORTS IT (2026-09-28). postgrest-js does not throw when the fetch
   * fails: it resolves `{ error: { message: 'TypeError: …', code: '' }, status: 0 }`, so every
   * network failure on a real project reached the worker as the server's refusal. The queue treats
   * both alike, but the banner may not: "We can't reach the server" is for exactly this. A gateway
   * that answered for a server it could not reach (502, 503, 504, a paused project) is the same.
   */
  it('an answer with no response behind it, or a gateway’s, is a transport failure', async () => {
    const noResponse = stub(() => ({
      data: null,
      error: { message: 'TypeError: Network request failed', code: '' },
      status: 0,
    }));
    await expect(noResponse.api.push([op(1)])).rejects.toMatchObject({
      code: 'transport',
      pushCode: null,
      message: 'TypeError: Network request failed',
    });
    for (const status of [502, 503, 504, 540]) {
      const gateway = stub(() => ({
        data: null,
        error: { message: 'upstream connect error', code: '' },
        status,
      }));
      await expect(gateway.api.push([op(1)]), String(status)).rejects.toMatchObject({
        code: 'transport',
        pushCode: null,
      });
    }
    // the server's own answer is still the server's, status and all: the worker reads a 401 as
    // the session refused rather than the ops (`refusedByServer`), so the status has to arrive
    const refused = stub(() => ({
      data: null,
      error: { code: '42501', message: 'permission denied for function sync_push' },
      status: 401,
    }));
    await expect(refused.api.push([op(1)])).rejects.toMatchObject({
      code: 'server',
      pushCode: 'FORBIDDEN',
      status: 401,
    });
    const broken = stub(() => ({
      data: null,
      error: { code: 'XX000', message: 'internal error' },
      status: 500,
    }));
    await expect(
      broken.api.pull({
        household_id: HH,
        tables: [
          {
            name: 'activities',
            strategy: 'delta' as const,
            since: null,
            since_id: null,
            limit: 500,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'server',
      pushCode: 'SERVER',
      status: 500,
    });
    // a payload Postgres cannot hold is refused before any op is applied (22P05), with a 400
    const unreadable = stub(() => ({
      data: null,
      error: { code: '22P05', message: 'unsupported Unicode escape sequence' },
      status: 400,
    }));
    await expect(unreadable.api.push([op(1)])).rejects.toMatchObject({
      code: 'server',
      pushCode: 'SERVER',
      status: 400,
    });
  });

  it('a thrown fetch is a transport failure with no classification', async () => {
    // No answer came back, so the ops may or may not have been applied — which is what the
    // idempotency keys are for, and why the worker retries it without consuming an attempt.
    const client: SyncRpcClient = {
      rpc() {
        throw new TypeError('Network request failed');
      },
    };
    const api = new SupabaseSyncApi(client);
    await expect(api.push([op(1)])).rejects.toMatchObject({
      code: 'transport',
      pushCode: null,
      message: 'Network request failed',
    });
  });
});

/**
 * THE NUDGE'S CHANNEL (migration 0149, 2026-09-30), against a stub of supabase-js's Realtime that
 * writes down every call in order. What the stub cannot say is whether a hosted project delivers:
 * that is the owner's staging check (0149's header).
 */
function realtimeStub() {
  const calls: string[] = [];
  let onBroadcast: (() => void) | null = null;
  let onStatus: ((status: string) => void) | null = null;
  let authorize: () => void = () => undefined;
  let holdAuth = false;
  let finishLeave: () => void = () => undefined;
  let holdLeave = false;
  const channel: SyncRealtimeChannel = {
    on(type, filter, callback) {
      calls.push(`on ${type} ${filter.event}`);
      onBroadcast = callback;
      return channel;
    },
    subscribe(callback) {
      calls.push('subscribe');
      onStatus = callback ?? null;
      return channel;
    },
  };
  const client: SyncRealtimeClient = {
    channel(name, opts) {
      calls.push(`channel ${name} private=${String(opts.config.private)}`);
      return channel;
    },
    removeChannel(removed) {
      calls.push(removed === channel ? 'removeChannel' : 'removeChannel (another)');
      if (!holdLeave) return Promise.resolve('ok');
      return new Promise<unknown>(resolve => {
        finishLeave = () => resolve('ok');
      });
    },
    realtime: {
      setAuth() {
        calls.push('setAuth');
        if (!holdAuth) return Promise.resolve();
        return new Promise<void>(resolve => {
          authorize = resolve;
        });
      },
    },
  };
  return {
    client,
    calls,
    /** The server's `changed` broadcast arriving. */
    broadcast: () => onBroadcast?.(),
    /** The join's status, as supabase-js reports it. */
    status: (status: string) => onStatus?.(status),
    /** Hold `setAuth` open until `authorize()`. */
    hold() {
      holdAuth = true;
    },
    authorize: () => authorize(),
    /** Hold a leave open until `finishLeave()`, as a server that has not answered it yet. */
    holdLeave() {
      holdLeave = true;
    },
    finishLeave: () => finishLeave(),
  };
}

const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

describe('subscribe: the household’s nudges', () => {
  it('joins the private channel household:<id>, listens for `changed`, and sets the token first', async () => {
    const rt = realtimeStub();
    const api = new SupabaseSyncApi(stub(() => ({ data: null, error: null })).client, rt.client);
    api.subscribe(HH, () => undefined);
    await settle();
    expect(rt.calls).toEqual([
      `channel household:${HH} private=true`,
      'on broadcast changed',
      'setAuth',
      'subscribe',
    ]);
  });

  it('passes each broadcast on, and a rejoin after the first join as one too', async () => {
    const rt = realtimeStub();
    const api = new SupabaseSyncApi(stub(() => ({ data: null, error: null })).client, rt.client);
    const heard: string[] = [];
    api.subscribe(HH, table => heard.push(table));
    await settle();
    rt.status('SUBSCRIBED'); // the first join: the engine pulls when it starts listening anyway
    expect(heard).toEqual([]);
    rt.broadcast();
    rt.broadcast();
    expect(heard).toEqual(['*', '*']);
    // the socket dropped and came back: what was sent meanwhile is gone, so the join is a nudge
    rt.status('CHANNEL_ERROR');
    rt.status('SUBSCRIBED');
    expect(heard).toEqual(['*', '*', '*']);
  });

  it('leaves the channel when asked, and passes nothing on after', async () => {
    const rt = realtimeStub();
    const api = new SupabaseSyncApi(stub(() => ({ data: null, error: null })).client, rt.client);
    const heard: string[] = [];
    const off = api.subscribe(HH, table => heard.push(table));
    await settle();
    off();
    off(); // twice is once
    await settle();
    expect(rt.calls.filter(c => c.startsWith('removeChannel'))).toEqual(['removeChannel']);
    rt.broadcast();
    rt.status('SUBSCRIBED');
    rt.status('SUBSCRIBED');
    expect(heard).toEqual([]);
  });

  it('never joins a channel it was told to leave while the token was being read', async () => {
    const rt = realtimeStub();
    rt.hold();
    const api = new SupabaseSyncApi(stub(() => ({ data: null, error: null })).client, rt.client);
    const off = api.subscribe(HH, () => undefined);
    await settle();
    off();
    rt.authorize();
    await settle();
    expect(rt.calls).not.toContain('subscribe');
    expect(rt.calls).toContain('removeChannel');
  });

  it('waits for the last channel to leave before joining again, whichever transport joins', async () => {
    const rt = realtimeStub();
    const rpc = stub(() => ({ data: null, error: null })).client;
    const off = new SupabaseSyncApi(rpc, rt.client).subscribe(HH, () => undefined);
    await settle();
    rt.holdLeave();
    off();
    // an engine rebuilt for the same household: a new transport over the same client
    new SupabaseSyncApi(rpc, rt.client).subscribe(HH, () => undefined);
    await settle();
    // supabase-js hands back the channel it holds for a topic: nothing joins while it is leaving
    expect(rt.calls.slice(4)).toEqual(['removeChannel']);

    rt.finishLeave();
    await settle();
    expect(rt.calls.slice(4)).toEqual([
      'removeChannel',
      `channel household:${HH} private=true`,
      'on broadcast changed',
      'setAuth',
      'subscribe',
    ]);
  });

  it('never throws, and listens to nothing without a Realtime client or with a broken one', async () => {
    const plain = stub(() => ({ data: null, error: null })).api;
    const off = plain.subscribe(HH, () => undefined);
    expect(() => off()).not.toThrow();

    const broken: SyncRealtimeClient = {
      channel() {
        throw new Error('WebSocket not available');
      },
      removeChannel: () => Promise.reject(new Error('gone')),
      realtime: { setAuth: () => Promise.reject(new Error('no session')) },
    };
    const api = new SupabaseSyncApi(stub(() => ({ data: null, error: null })).client, broken);
    let offBroken: () => void = () => undefined;
    expect(() => {
      offBroken = api.subscribe(HH, () => undefined);
    }).not.toThrow();
    await settle();
    expect(() => offBroken()).not.toThrow();
  });
});
