/**
 * `SupabaseSyncApi` — the same `SyncApi` the fake implements, over the two RPCs of migrations
 * 0009 and 0010. A drop-in for `MockSyncApi` behind one interface, the way WP2's auth pair works.
 *
 * WHAT THIS FILE IS AND IS NOT. It is a transport: it serialises, calls, classifies and hands
 * back. Every rule about what a push MEANS lives in the migration (it runs under the caller's own
 * RLS, `security invoker`) and every rule about what to DO with a result lives in the worker. The
 * one judgement here is which failures are retryable, and that judgement is not made here either:
 * it is `../sqlstate.ts`, the same table the fake uses.
 *
 * SPLITTING A BODY. `public.sync_push` refuses more than `MAX_PUSH_OPS` ops with CC422 before it
 * applies anything, and the refusal costs the whole batch. The worker never sends more than
 * `MAX_BATCH` (50), but this method is the interface and a future caller (a teardown drain, an
 * import) could hand it more, so a long array becomes successive calls of `MAX_PUSH_OPS` **in
 * order**, with the results concatenated in that same order. Each call is its own transaction —
 * which is exactly why the split is by index and never re-ordered: a chain must not be cut so
 * that its dependency lands in a later call than the op that needs it. The worker's `selectBatch`
 * keeps a chain inside one batch; this preserves that.
 *
 * NO CREDENTIAL IS READ OR INVENTED HERE. The client arrives already built from
 * `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`../../supabase/client.ts`),
 * and the JWT it carries is what makes `auth.uid()` real on the server.
 *
 * THE NUDGE (2026-09-30, migration 0149). `subscribe` joins the household's private Realtime
 * channel and hands the engine one call per broadcast: the server's word that a write committed,
 * and nothing else. It is the one method here that is not an RPC, and the one that may fail
 * without anybody hearing about it: a phone that cannot listen pulls on its tick, as every phone
 * did before.
 *
 * COVERAGE, honestly stated: this arm cannot be exercised against a real project without the
 * owner's credentials. WP4 proves it by typecheck plus `supabase.test.ts`, which stubs `rpc` and
 * asserts order, splitting and every error class, and stubs the channel for `subscribe`. The mock
 * arm is what runs the scenarios.
 */
import {
  MAX_PUSH_OPS,
  PushResponse,
  PullResponse,
  type PullRequest,
  type PushOp,
  type SyncApi,
} from '@nibblecue/core';
import { crumb } from '../../app/boot';
import { classifyPushError, type PostgrestLikeError } from '../sqlstate';
import { z } from 'zod';
import { SyncFailure } from './types';

/** `nibble_sync_pull`'s answer: one keyset page of the household's records (docs/SERVER.md). */
const NibblePage = z.object({
  rows: z.array(z.record(z.unknown())),
  next_cursor: z.object({ updated_at: z.string(), id: z.string() }).nullable(),
  has_more: z.boolean(),
  server_time: z.string(),
});

/**
 * What one RPC answers: PostgREST's `{ data, error }`, with the data still unparsed — and the HTTP
 * `status`, which supabase-js always sets and which is the only way to tell a server's refusal from
 * no answer at all (`noServerAnswered`). Optional so a stub may leave it out.
 */
export interface RpcAnswer {
  data: unknown;
  error: PostgrestLikeError | null;
  status?: number | undefined;
}

/**
 * WHETHER AN ERROR ANSWER CAME FROM NO SERVER AT ALL (2026-09-28).
 *
 * postgrest-js does not throw when the fetch fails: it resolves with `status: 0` and an error
 * whose message is the fetch's own ("TypeError: Network request failed") and whose code is empty.
 * And a gateway that answers for a server it could not reach says so with a 5xx of its own — 502,
 * 503, 504, or the platform's own for a paused project. Neither is the server refusing anything;
 * both are the network's, and the banner says "We can't reach the server" for exactly those. A 500
 * is not among them: that is PostgREST passing on the database's own error.
 */
function noServerAnswered(answer: RpcAnswer): boolean {
  const status = answer.status;
  return status === 0 || (status !== undefined && status >= 502 && status <= 599);
}

/**
 * The slice of supabase-js this file uses, as ONE method with loose argument types.
 *
 * It is deliberately not `SupabaseClient<Database>` itself. The generated `rpc` is generic over
 * the function name and its `Args`, so a test stub would have to reproduce that signature to be
 * assignable — and a suite that has to fake a generic builder to check an error map is a suite
 * that tests the fake. `providers/index.ts` adapts the real client into this shape in three
 * lines, which is also the only place a `PushOp[]` has to be claimed to be JSON.
 */
/**
 * CuddleCue's two functions, and NibbleCue's own two beside them (docs/SERVER.md): NibbleCue's
 * records never go through `sync_push` or `sync_pull`, so a mistake in them cannot touch a
 * CuddleCue write, and CuddleCue's functions stay exactly as CuddleCue ships them.
 */
export type SyncRpc = 'sync_push' | 'sync_pull' | 'nibble_sync_push' | 'nibble_sync_pull';

export interface SyncRpcClient {
  rpc(fn: SyncRpc, args: Record<string, unknown>): PromiseLike<RpcAnswer>;
}

/** The one table and the one entity NibbleCue keeps on the shared server. */
export const NIBBLE_TABLE = 'nibble_records';
export const NIBBLE_ENTITY = 'nibble_record';

/** The slice of a supabase-js `RealtimeChannel` the nudge uses: one broadcast event, and the join. */
export interface SyncRealtimeChannel {
  on(type: 'broadcast', filter: { event: string }, callback: () => void): SyncRealtimeChannel;
  subscribe(callback?: (status: string, err?: Error) => void): unknown;
}

/**
 * The slice of supabase-js's Realtime the nudge uses, in supabase-js's own shape, so the app's
 * client IS one (`providers/index.ts` hands it in as it is) and a test stub is five methods. Like
 * `SyncRpcClient`, it is not `SupabaseClient` itself: that type's overloads would make every stub
 * a copy of the library.
 */
export interface SyncRealtimeClient {
  channel(name: string, opts: { config: { private: boolean } }): SyncRealtimeChannel;
  removeChannel(channel: SyncRealtimeChannel): Promise<unknown>;
  realtime: { setAuth(token?: string | null): Promise<void> };
}

/** The household's topic: the name 0149's `app.nudge_household` sends on and its policy reads. */
export const householdTopic = (householdId: string): string => `household:${householdId}`;

/**
 * Each client's last channel leaving, which its next join waits for. supabase-js hands back the
 * channel it already holds for a topic, so a join begun while the previous one was still leaving
 * (the app out and back in a second) would get the leaving channel, which then closes under it.
 * Kept per CLIENT, not per transport: an engine rebuilt for the same household builds a new
 * transport over the same client.
 */
const leavingOf = new WeakMap<SyncRealtimeClient, Promise<unknown>>();

export class SupabaseSyncApi implements SyncApi {
  /**
   * `realtime` is optional, and absent is the phone of every build before 2026-09-30: it listens
   * to nothing and pulls on its tick.
   */
  constructor(
    private readonly client: SyncRpcClient,
    private readonly realtime: SyncRealtimeClient | null = null,
  ) {}

  async push(ops: PushOp[]): Promise<PushResponse> {
    if (ops.length === 0) return { results: [], server_time: new Date().toISOString() };
    // NibbleCue's records to their own function, everything else to CuddleCue's, each in the
    // order the batch holds them; the answers come back in the batch's order, keyed by op id
    const nibble = ops.filter(o => o.entity === NIBBLE_ENTITY);
    const shared = ops.filter(o => o.entity !== NIBBLE_ENTITY);
    const byId = new Map<string, PushResponse['results'][number]>();
    let serverTime = '';
    for (const [fn, list] of [
      ['sync_push', shared],
      ['nibble_sync_push', nibble],
    ] as const) {
      if (list.length === 0) continue;
      const answer = await this.pushTo(fn, list);
      for (const r of answer.results) byId.set(r.client_op_id, r);
      serverTime = answer.server_time;
    }
    const results = ops
      .map(o => byId.get(o.client_op_id))
      .filter((r): r is PushResponse['results'][number] => r !== undefined);
    return { results, server_time: serverTime };
  }

  private async pushTo(fn: 'sync_push' | 'nibble_sync_push', ops: PushOp[]): Promise<PushResponse> {
    const results: PushResponse['results'] = [];
    let serverTime = '';
    for (let i = 0; i < ops.length; i += MAX_PUSH_OPS) {
      const slice = ops.slice(i, i + MAX_PUSH_OPS);
      const body = await this.call(fn, { ops: slice });
      // Parsed, not cast: `sync_push` returns jsonb, and jsonb has no type checker. A shape the
      // device could not read has to fail here, where the outbox row is still PENDING and the
      // error names the call, rather than three layers later as an undefined property.
      const parsed = PushResponse.parse(body);
      results.push(...parsed.results);
      serverTime = parsed.server_time;
    }
    return { results, server_time: serverTime };
  }

  async pull(req: PullRequest): Promise<PullResponse> {
    const nibble = req.tables.find(t => t.name === NIBBLE_TABLE);
    const shared = req.tables.filter(t => t.name !== NIBBLE_TABLE);
    const out: PullResponse = { tables: {}, server_time: '' };
    if (shared.length > 0) {
      const answer = PullResponse.parse(
        await this.call('sync_pull', { req: { ...req, tables: shared } }),
      );
      Object.assign(out.tables, answer.tables);
      out.server_time = answer.server_time;
    }
    if (nibble !== undefined) {
      const page = NibblePage.parse(
        await this.call('nibble_sync_pull', {
          req: {
            household_id: req.household_id,
            since: nibble.since,
            since_id: nibble.since_id,
            limit: nibble.limit,
          },
        }),
      );
      out.tables[NIBBLE_TABLE] = {
        rows: page.rows,
        next_cursor: page.next_cursor,
        has_more: page.has_more,
      };
      // the earlier of the two clocks: a cursor is never moved past what either answer saw
      if (out.server_time === '' || page.server_time < out.server_time) {
        out.server_time = page.server_time;
      }
    }
    if (out.server_time === '') out.server_time = new Date().toISOString();
    return out;
  }

  /**
   * THE HOUSEHOLD'S NUDGES (migration 0149): the private channel `household:<id>`, whose join
   * Realtime authorizes against the policy 0149 writes on `realtime.messages` (a live member of an
   * open household, and nobody else), and one call to `onChange` per `changed` broadcast. The
   * broadcast carries no row and no table, so the table named is `'*'`: the engine pulls
   * everything, through `sync_pull`, whatever a nudge says.
   *
   * THE SESSION'S TOKEN, FIRST. `setAuth()` asks the client for its current token before the join:
   * a private channel joined with the project's key alone is refused, and supabase-js only hands
   * the socket a token when the session tells it something, which a phone opened with a valid
   * session may not have done yet.
   *
   * A JOIN AFTER THE FIRST IS A NUDGE TOO. supabase-js joins the channel again by itself when its
   * socket comes back (a lift, a tunnel, Wi-Fi to cellular), and whatever was broadcast while it
   * was down is gone: nothing replays it. So every successful join after the first is heard as
   * one. The first is not: the engine pulls when it starts listening anyway.
   *
   * NEVER THROWS, and answers a no-op when there is nothing to listen with. The returned function
   * leaves the channel; a nudge that arrives after it is not passed on.
   */
  subscribe(householdId: string, onChange: (table: string) => void): () => void {
    const realtime = this.realtime;
    if (realtime === null) return () => undefined;
    let left = false;
    let channel: SyncRealtimeChannel | null = null;
    let joins = 0;
    const heard = (): void => {
      if (!left) onChange('*');
    };
    const join = async (): Promise<void> => {
      await leavingOf.get(realtime);
      if (left) return;
      const joining = realtime
        .channel(householdTopic(householdId), { config: { private: true } })
        .on('broadcast', { event: 'changed' }, heard);
      channel = joining;
      await realtime.realtime.setAuth();
      if (left) return;
      joining.subscribe(status => {
        if (left) return;
        crumb(`sync: realtime ${status}`);
        if (status !== 'SUBSCRIBED') return;
        joins += 1;
        if (joins > 1) heard();
      });
    };
    join().catch(err => {
      // no channel means no nudges, and the tick is behind every one of them
      crumb(`sync: realtime not joined — ${err instanceof Error ? err.message : String(err)}`);
    });
    return () => {
      if (left) return;
      left = true;
      const leavingChannel = channel;
      if (leavingChannel === null) return;
      const before = leavingOf.get(realtime);
      leavingOf.set(
        realtime,
        Promise.all([
          before,
          Promise.resolve()
            .then(() => realtime.removeChannel(leavingChannel))
            .catch(() => undefined),
        ]),
      );
    };
  }

  private async call(fn: SyncRpc, args: Record<string, unknown>) {
    let answer: RpcAnswer;
    try {
      answer = await this.client.rpc(fn, args);
    } catch (err) {
      // fetch threw: no answer came back, so the ops may or may not have been applied. That is
      // what the idempotency keys are for, and why this is retryable with `attempts` unchanged.
      throw new SyncFailure('transport', err instanceof Error ? err.message : String(err));
    }
    if (answer.error !== null && answer.error !== undefined) {
      if (noServerAnswered(answer)) {
        // retried exactly as before — every thrown failure is, with `attempts` unchanged (D12) —
        // and now named for what it is, so the banner can tell it from a refusal
        throw new SyncFailure('transport', answer.error.message ?? 'no answer from the server');
      }
      const classified = classifyPushError(answer.error);
      // the status rides along: a 401 is the session refused, not the ops (`SyncFailure`)
      throw new SyncFailure('server', classified.message, classified.code, answer.status ?? null);
    }
    return answer.data;
  }
}
