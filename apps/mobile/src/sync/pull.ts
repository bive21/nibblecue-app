/**
 * The pull itself: one request, one page loop, and the one transaction that makes a cursor safe
 * (`docs/OFFLINE_SYNC.md` §4, `docs/ARCHITECTURE.md` §3.2, WP4 D15-D18, D37).
 *
 * This file pulls a SET OF TABLES. Which set, and in what order, is `./phases.ts`; what a page
 * does to the mirror is `./apply.ts`; where the cursor lives is `./cursors.ts`. The split is not
 * ceremony - it is what lets `pull.test.ts` drive a crash, a tie and a 403 through a page loop
 * without standing up the three initial-sync phases first.
 *
 * ONE REQUEST PER ROUND, NOT ONE PER TABLE. `public.sync_pull` answers every table of a request
 * from one snapshot (`0010`), so a container and the ledger row that emptied it can never be
 * split across two views of the database. Tables that still have pages owed go round again, up
 * to `MAX_PAGES_PER_TABLE` rounds; whatever is still owed then resumes on the next pass, so a
 * household with six months of history never holds the UI.
 *
 * THE CURSOR RULE, the only rule here that data depends on. A round's rows, the `local_synced`
 * stamp and every cursor it advances are written in ONE `db.tx`. There is no window in which a
 * cursor claims rows the mirror does not hold: a process killed mid-apply re-reads the same
 * page on the next pass, and re-reading is free because every apply is an upsert.
 *
 * The store version bump is the one thing that happens just AFTER that transaction rather than
 * inside it. `docs/plans/WP4.md` lists it among the four, and the reason it is not is that it
 * is the only one of the four that cannot be rolled back: `Store.invalidate` is an in-memory
 * counter plus a synchronous callback, so bumping it inside the transaction would wake a
 * subscriber to re-read rows that a rollback then removes. Firing on commit is strictly
 * tighter, and it does not weaken the crash argument, which is about durability.
 *
 * WHAT A FAILED PULL NEVER DOES. It never advances a cursor, never throws into a caller that
 * cannot act on it, and never half-applies a round. `CC403` is the one failure that is handed
 * up: `0010` raises it when the caller is not a member, which is the only signal that says "you
 * may have been removed" rather than "nothing changed". D37 made it a forced sign-out on the
 * spot; since 2026-09-25 the accounts state machine reads the account first and decides from
 * that (`auth/mirror.ts`), because a dropped grant answers a member exactly the same way.
 *
 * A NOTE ON WHAT IS NOT HERE. Realtime is an accelerator, not a path (`docs/OFFLINE_SYNC.md`
 * §4): since 2026-09-30 a nudge (migration 0149) tells `SyncEngine` WHEN to run a pass, and the
 * pass is this file's, unchanged. Nothing below depends on a nudge arriving; completeness is the
 * cursor's job.
 */
import {
  MAX_PAGES_PER_TABLE,
  type Clock,
  type PullCursor,
  type PullRequest,
  type PullResponse,
  type PullStrategy,
  type PullTablePage,
  type SyncApi,
} from '@nibblecue/core';
import type { Analytics } from '../analytics';
import { crumb } from '../app/boot';
import type { Store } from '../data/store';
import type { Db, Tx } from '../db/driver';
import { applyAppend, applyDelta, applyFull, inApplyOrder, type ApplyContext } from './apply';
import { phaseMark, readCursors, sinceFor, writeCursor } from './cursors';
import { isSyncFailure } from './providers/types';
import { PULL_TABLES, pullTable, type PullPhase, type PullTable } from './tables';

/** Why a pass started. Recorded, never branched on except for the bootstrap budget. */
export type PullReason = 'bootstrap' | 'foreground' | 'refresh' | 'tick' | 'push' | 'manual';

export interface PullOutcome {
  /** Rows upserted or inserted, detail rows included. */
  applied: number;
  /** Rows a `full` replace removed because the server did not return them. */
  removed: number;
  /** Local edits overwritten with nothing queued to restore them. */
  conflicts: number;
  /** The tables this pass asked for, in request order. */
  tables: string[];
  /** The tables that still owe pages and will resume on the next pass. */
  incomplete: string[];
  stoppedBecause: 'done' | 'offline' | 'forbidden' | 'error' | 'budget';
  /** The message of the failure that ended the pass, or null. */
  error: string | null;
}

export const emptyOutcome = (): PullOutcome => ({
  applied: 0,
  removed: 0,
  conflicts: 0,
  tables: [],
  incomplete: [],
  stoppedBecause: 'done',
  error: null,
});

/** Fold two passes into one answer; the later `stoppedBecause` wins unless it is `'done'`. */
export function mergeOutcomes(a: PullOutcome, b: PullOutcome): PullOutcome {
  return {
    applied: a.applied + b.applied,
    removed: a.removed + b.removed,
    conflicts: a.conflicts + b.conflicts,
    tables: [...a.tables, ...b.tables],
    incomplete: [...a.incomplete, ...b.incomplete],
    stoppedBecause: b.stoppedBecause === 'done' ? a.stoppedBecause : b.stoppedBecause,
    error: b.error ?? a.error,
  };
}

export interface PullDeps {
  db: Db;
  api: SyncApi;
  clock: Clock;
  householdId: string;
  userId: string;
  /** Bumped after each round commits so a mounted screen re-reads. */
  store?: Store | undefined;
  analytics?: Analytics['emit'] | undefined;
  /**
   * D37. The household's own pull answered `CC403` (or `42501`): this caller may no longer be a
   * member, and the mirror may be a copy of a household they may not read. The engine stops the
   * pass and hands the decision up, because deleting a database is not a queue's decision to
   * make — and not a refusal's alone either: `SyncProvider` passes it to the accounts state
   * machine, which reads the account before anything goes (`auth/mirror.ts`).
   */
  onForbidden?: ((householdId: string) => void | Promise<void>) | undefined;
  /** Overridable so a test can prove the cap and the resumption without 10 real rounds. */
  maxPagesPerTable?: number | undefined;
}

/** What one table is asking the server for right now. */
interface Owed {
  table: PullTable;
  since: string | null;
  since_id: string | null;
  /**
   * The EXACT stored cursor this pass began from, before the lag rewind. It is what makes the
   * round cap a budget for NEW GROUND rather than for requests: see `run`.
   */
  start: PullCursor | null;
  /** Rounds spent past `start`. The cap applies to this, not to the round number. */
  spent: number;
}

/** Is `c` strictly past the `(since, since_id)` this round was asked from? */
function pastSince(c: PullCursor, since: string | null, sinceId: string | null): boolean {
  if (since === null) return true;
  const d = Date.parse(c.updated_at) - Date.parse(since);
  if (d !== 0) return d > 0;
  // A null `since_id` is the all-zero uuid server-side, which sorts below every real one.
  return (sinceId ?? '') < c.id;
}

/** Is `c` strictly past the cursor the pass started from? */
const pastStart = (c: PullCursor, start: PullCursor | null): boolean =>
  start === null || pastSince(c, start.updated_at, start.id);

export class PullEngine {
  constructor(readonly deps: PullDeps) {}

  /**
   * Pull one set of tables until each has drained or the round cap is reached.
   *
   * `phase` is only used to stamp `sync_state.phase`, which is how a resumed pass and the
   * Reports note both know where a table got to. `budgetMs` bounds how long a blocking phase
   * may hold the first paint: a request already in flight is awaited, because abandoning it
   * would waste the page and leave the cursor where it was, but no further round is started
   * once the budget is spent.
   */
  async run(
    tables: readonly PullTable[],
    phase: PullPhase | null,
    budgetMs?: number,
  ): Promise<PullOutcome> {
    const { db, api, clock, householdId } = this.deps;
    const outcome = emptyOutcome();
    outcome.tables = tables.map(t => t.name);
    if (tables.length === 0) return outcome;
    crumb(`sync: pull ${phase ?? 'after push'} — ${tables.length} table(s)`);

    const deadline = budgetMs === undefined ? null : clock.now() + budgetMs;
    const maxRounds = this.deps.maxPagesPerTable ?? MAX_PAGES_PER_TABLE;

    // Every table starts from its stored cursor, rewound by PULL_LAG_MS. The rewind applies to
    // the FIRST round only; every later round continues from the `next_cursor` the server just
    // gave us.
    let owed: Owed[] = [];
    // one read for every table's cursor, before any page is applied (each page writes its own)
    let states: Awaited<ReturnType<typeof readCursors>>;
    try {
      states = await readCursors(
        db,
        householdId,
        tables.map(t => t.name),
      );
    } catch (err) {
      /*
        REPORTED, NEVER THROWN, like every other failure of a pass (the owner's Expo Go log,
        2026-10-08: "Uncaught (in promise, id: 12): … database is locked" beside the pass's own
        "sync: pull failed"). This read was the one step of a pass outside the catch, and the
        passes nobody awaits end in `.catch(rethrowUnlessTeardown)` (`SyncEngine.start`), which
        throws on whatever is not a teardown's: so a phase after a failed one, whose first read
        met the same moment, became an unhandled rejection. Nothing was read, so nothing moved.
      */
      return this.failed(
        outcome,
        tables.map(t => t.name),
        err,
      );
    }
    for (const table of tables) {
      const state = states.get(table.name) ?? { cursor: null, lastFullSyncAt: null, phase: null };
      const since = sinceFor(state);
      owed.push({
        table,
        since: since.since,
        since_id: since.since_id,
        start: state.cursor,
        spent: 0,
      });
    }

    // THE CAP IS A BUDGET FOR NEW GROUND, NOT FOR REQUESTS. A round that only re-reads the lag
    // window - rows at or below the cursor this pass started from - does not count against
    // `MAX_PAGES_PER_TABLE`. Counting it would make the two safety devices cancel each other
    // out: with a household that writes more rows inside one `PULL_LAG_MS` window than the cap
    // allows pages for, every pass would spend its whole budget re-reading what it already had
    // and the cursor would never move again. The catch-up cannot itself run away, because the
    // server's cursor advances strictly on every round and a round that does not advance it
    // ends the table (see `applyResponse`).
    // Tables the cap stopped rather than drained. They are INCOMPLETE, not done: the next pass
    // resumes them from the cursor this one committed.
    const parked = new Set<string>();
    let round = 0;
    while (owed.length > 0) {
      if (deadline !== null && round > 0 && clock.now() >= deadline) {
        outcome.stoppedBecause = 'budget';
        break;
      }
      const request: PullRequest = {
        household_id: householdId,
        tables: owed.map(o => ({
          name: o.table.name,
          strategy: o.table.strategy,
          since: o.since,
          since_id: o.since_id,
          limit: o.table.page,
        })),
      };

      let response: PullResponse;
      try {
        response = await api.pull(request);
      } catch (err) {
        return this.failed(
          outcome,
          owed.map(o => o.table.name),
          err,
        );
      }

      let next;
      try {
        next = await this.applyResponse(response, owed, phase);
      } catch (err) {
        // The local write failed - a killed process, a full disk, a bug in an apply. The
        // transaction rolled back, so the page is not half-applied and no cursor moved; the
        // next pass re-reads it. It is reported rather than thrown because every caller of a
        // pull is fire-and-forget and an unhandled rejection would be the only trace.
        return this.failed(
          outcome,
          owed.map(o => o.table.name),
          err,
        );
      }
      outcome.applied += next.applied;
      outcome.removed += next.removed;
      outcome.conflicts += next.conflicts;
      for (const o of next.owed) {
        if (o.spent >= maxRounds) parked.add(o.table.name);
      }
      owed = next.owed.filter(o => o.spent < maxRounds);
      round += 1;
    }

    const unfinished = new Set([...owed.map(o => o.table.name), ...parked]);
    outcome.incomplete = tables.map(t => t.name).filter(name => unfinished.has(name));
    return outcome;
  }

  /**
   * The worker's `pullAfterPush` seam. It is handed the MIRROR table names a flush pass wrote
   * to, and folds back exactly those - the last-writer-wins winners of anything this device
   * just touched, so a field a caregiver lost is on screen before they look for it. A name this
   * build does not pull is ignored rather than guessed at.
   */
  pullTables(names: readonly string[]): Promise<PullOutcome> {
    const wanted = names
      .map(n => pullTable(n))
      .filter((t): t is PullTable => t !== undefined)
      .sort((a, b) => PULL_TABLES.indexOf(a) - PULL_TABLES.indexOf(b));
    if (wanted.length === 0) return Promise.resolve(emptyOutcome());
    return this.run(wanted, null);
  }

  /* ---------------------------------------------------------------- one round */

  /**
   * One response: every table of it applied in dependency order, with its cursor, inside one
   * transaction. The keys to invalidate come back out and are fired once the commit has landed.
   */
  private async applyResponse(
    response: PullResponse,
    owed: readonly Owed[],
    phase: PullPhase | null,
  ): Promise<{ applied: number; removed: number; conflicts: number; owed: Owed[] }> {
    const { db, store, analytics, householdId, userId } = this.deps;
    const byName = new Map<string, Owed>(owed.map(o => [o.table.name, o]));
    const order = inApplyOrder(Object.keys(response.tables));

    const ctx: ApplyContext = {
      householdId,
      userId,
      serverTime: response.server_time,
      onConflict: (table, strategy) => {
        analytics?.('sync_conflict_resolved', { table, strategy });
      },
    };

    let applied = 0;
    let removed = 0;
    let conflicts = 0;
    const stillOwed: Owed[] = [];

    // The boot log's witness for this round: which tables carry rows, before the transaction
    // that writes them opens. A death inside it leaves this as the last line.
    const carrying = order
      .map(name => ({ name, rows: response.tables[name]?.rows.length ?? 0 }))
      .filter(x => x.rows > 0);
    crumb(
      `sync: applying ${phase ?? 'after push'} — ${
        carrying.length === 0 ? 'nothing new' : carrying.map(x => `${x.name} ${x.rows}`).join(', ')
      }`,
    );

    const touched = await db.tx(async t => {
      const bumped: string[] = [];
      for (const name of order) {
        const page = response.tables[name];
        const entry = byName.get(name);
        // A table this round did not ask for cannot be applied: there is no strategy to apply
        // it with and no cursor to advance. Dropping it is the honest answer.
        if (page === undefined || entry === undefined) continue;
        const out = await this.applyOne(t, entry.table, page, ctx, phase, response.server_time);
        applied += out.applied;
        removed += out.removed;
        conflicts += out.conflicts;
        bumped.push(...out.keys);
        // A cursor that did not move past what this round asked from means the server has
        // nothing further to give under this predicate; asking again would be the same request
        // for ever. That check is what makes the un-capped catch-up above safe.
        if (out.next !== null && pastSince(out.next, entry.since, entry.since_id)) {
          stillOwed.push({
            table: entry.table,
            since: out.next.updated_at,
            since_id: out.next.id,
            start: entry.start,
            spent: entry.spent + (pastStart(out.next, entry.start) ? 1 : 0),
          });
        }
      }
      return bumped;
    });
    crumb(`sync: committed ${phase ?? 'after push'} — ${applied} row(s)`);

    if (store !== undefined && touched.length > 0) store.invalidate(...touched);
    return { applied, removed, conflicts, owed: stillOwed };
  }

  /** One table of one response: the rows, then the cursor, in the caller's transaction. */
  private async applyOne(
    t: Tx,
    table: PullTable,
    page: PullTablePage,
    ctx: ApplyContext,
    phase: PullPhase | null,
    serverTime: string,
  ): Promise<{
    applied: number;
    removed: number;
    conflicts: number;
    keys: string[];
    next: PullCursor | null;
  }> {
    const out = await applyPage(t, table, page.rows, ctx, table.strategy);
    const cursor = page.next_cursor ?? null;
    // `has_more` with no cursor to continue from would be a request for the same page for ever,
    // so the cursor is what actually decides: a table is drained when the server has given this
    // pass nothing more to ask with.
    const drained = page.has_more !== true || cursor === null;
    const mark = phase === null ? undefined : phaseMark(phase, drained);

    await writeCursor(t, this.deps.householdId, table.name, {
      // `full` and `user_window` have no cursor at all: the page IS the set, so there is
      // nothing to resume from and a stored cursor would be a claim the server never made.
      ...(cursor !== null ? { cursor } : {}),
      ...(mark !== undefined ? { phase: mark } : {}),
      ...(drained ? { lastFullSyncAt: serverTime } : {}),
    });

    return {
      applied: out.written,
      removed: out.removed,
      conflicts: out.conflicts,
      keys: out.keys,
      next: drained ? null : cursor,
    };
  }

  /** A whole-call failure: nothing was applied, so no cursor moved. */
  private async failed(
    outcome: PullOutcome,
    owed: readonly string[],
    err: unknown,
  ): Promise<PullOutcome> {
    outcome.incomplete = [...owed];
    outcome.error = err instanceof Error ? err.message : String(err);
    // Every caller of a pull is fire-and-forget, so this line is the one place the reason
    // is written down where a developer looks.
    crumb(`sync: pull failed — ${outcome.error}`);
    if (isSyncFailure(err)) {
      if (err.code === 'offline') {
        outcome.stoppedBecause = 'offline';
        return outcome;
      }
      if (err.pushCode === 'FORBIDDEN') {
        // D37. `CC403` from `public.sync_pull` means this caller is not a member of the
        // household this mirror belongs to. `42501` reaches here too and means the same thing
        // from the other direction - the policies refused the call - so both are handed up as
        // "this household may no longer be readable on this device"; the account read that
        // follows is what decides whether it is (`auth/mirror.ts`).
        outcome.stoppedBecause = 'forbidden';
        await this.deps.onForbidden?.(this.deps.householdId);
        return outcome;
      }
    }
    outcome.stoppedBecause = 'error';
    return outcome;
  }
}

/** The strategy switch, in one place, so `pull.ts` never repeats `apply.ts`'s decisions. */
function applyPage(
  t: Tx,
  table: PullTable,
  rows: readonly Record<string, unknown>[],
  ctx: ApplyContext,
  strategy: PullStrategy,
) {
  if (strategy === 'append') return applyAppend(t, table.name, rows, ctx);
  if (strategy === 'full' || strategy === 'user_window') {
    return applyFull(t, table.name, rows, ctx, table.scope, strategy);
  }
  return applyDelta(t, table.name, rows, ctx, strategy);
}
