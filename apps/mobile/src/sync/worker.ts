/**
 * The outbox worker: the thing that actually delivers a parent's log (docs/OFFLINE_SYNC.md §8).
 *
 * THE REVIEW RULE FOR THIS FILE. Any worker field that is not derivable from the `outbox` table
 * is a defect. Every piece of state that matters — `state`, `attempts`, `sending_at`,
 * `next_attempt_at`, `seq` — lives in SQLite, which is what makes "kill the app mid-flush and
 * relaunch" a test that runs in node rather than a thing someone tries by hand on a phone once.
 * There are exactly four fields below and three of them are lifecycle (`started`, `running`, the
 * reconnect unsubscribe); the fourth, `transportFailures`, is the one deliberate exception and is
 * allowed to be lost on a restart, by design (D12: a restart is new information, and the first
 * attempt after one should be immediate). `stalledSince` and `stalledBy` are the same kind of
 * exception: they date the current run of requests that did not land, for the banner's words
 * only, and a new process has sent nothing yet. What the banner says about a PARKED op is not
 * memory at all: it is the op's own `last_error_code`, read from the table (2026-09-28).
 *
 * THE THREE CORRECTIONS TO §8's SKETCH, each of which is a bug in the sketch:
 *
 *   1. **Reclaim on `sending_at`, never `created_at`** (D11). `:399-403` reclaims any row minted
 *      more than a minute ago the instant it enters SENDING — racing its own in-flight request
 *      and making §2.3's "two ops on one entity are never in flight simultaneously" false. The
 *      clock that matters is when the row started sending, which is why `sending_at` exists.
 *   2. **A transport failure does not consume an attempt** (D12). `:431` routes a thrown request
 *      through the same counter as a server rejection, so ten flaky minutes in a tunnel park a
 *      perfectly valid log as FAILED while the UI promises it will sync by itself. `attempts`
 *      counts only the server's refusals — per-op CONFLICT and SERVER rejections, and since
 *      2026-09-29 a whole call the server ANSWERED with a refusal (`refused`), which is not a
 *      transport failure and used to be retried for ever; transport failures are counted in
 *      memory and reset on reconnect, on foreground and on start.
 *   3. **A blocked op blocks its own entity, not the pass** (D14, `selectBatch`). Stopping the
 *      whole batch at the first op whose dependency is unmet lets one stuck chain hold up every
 *      unrelated diaper behind it.
 *
 * WHAT IT NEVER DOES. It never deletes a domain row, never edits one except to adopt the
 * server's `updated_at` and set `local_synced`, and never marks an op FAILED for a reason that
 * could clear itself. A FAILED op keeps its local row: the parent's entry is theirs, and a queue
 * that tidies itself by dropping entries is the failure rule 7 forbids.
 */
import {
  DETAIL_TABLE_BY_ACTIVITY,
  MAX_ATTEMPTS,
  MAX_BATCH,
  MAX_PASSES,
  STUCK_SENDING_MS,
  backoffDelayMs,
  isFinalAttempt,
  isTerminal,
  rewriteOverdraw,
  selectBatch,
  type ActivityType,
  type ChainOp,
  type Clock,
  type FlushReason,
  type Net,
  type OutboxEntity,
  type OutboxRow,
  type PushErrorCode,
  type PushOp,
  type PushResponse,
  type PushResult,
  type SyncApi,
} from '@nibblecue/core';
import { countBucket, msBucket, type Analytics } from '../analytics';
import {
  counts as outboxCounts,
  enqueue,
  payloadOf,
  pending as outboxPending,
  retry as outboxRetry,
  discard as outboxDiscard,
} from '../data/outbox';
import { upsertRow } from '../data/repository';
import { emptiedPatchId } from '../data/stash';
import type { Db, Tx } from '../db/driver';
import { isSyncFailure } from './providers/types';
import { rethrowUnlessTeardown } from '../db/latch';
import { heldAbove } from './pushHold';

/**
 * What the chip, the banner and the sign-out sheet all read. WP4.9 owns the presentation
 * (`status.ts`, `syncChipFrom`) and re-exports this type; the worker owns the numbers, because
 * the worker is the only thing that knows both the queue and the connection.
 */
export interface SyncSnapshot {
  connected: boolean;
  flushing: boolean;
  pending: number;
  sending: number;
  failed: number;
  /** `created_at` of the oldest op still owed to the server, so "queued since" is expressible. */
  oldestPendingAt: string | null;
  /**
   * When this phone first saw the current failures, in epoch ms — or null when there are none,
   * or when they were already there as the app opened. Set by the status store
   * (`sync/status.ts`), never by the worker: it is what lets the chip hold "Not synced" back for
   * a failure that is still young (`FAILED_GRACE_MS`).
   */
  failedSince?: number | null;
  /**
   * When the chip may first say the queue is on its way (`Syncing`, `2 queued`) in the current run
   * of it, or the last — two seconds after the run began from a chip that said nothing, at once
   * after one that already said something. Null before any run. Set by the status store, like
   * `failedSince`: it is what keeps a sync that takes a moment from blinking the chip
   * (`SYNC_SHOW_DELAY_MS`).
   */
  busyShowAt?: number | null;
  /** When the last such run ended; null while one runs, or before any (`SYNC_MIN_SHOWN_MS`). */
  busyEndedAt?: number | null;
  /**
   * The refusal the banner speaks for, read off the FAILED rows' own `last_error_code`
   * (`bannerCodeOf`); null when nothing is FAILED. Read from the outbox with every snapshot, the
   * first of a launch included, so the banner and its Try again do not depend on this process
   * having watched the failure happen (2026-09-28).
   */
  failedCode?: PushErrorCode | null;
  /**
   * THE REFUSALS ARE NOT ABOUT THIS HOUSEHOLD (the owner on staging, 2026-09-29: "your role can't
   * save this", from a parent). True when the banner's code is `FORBIDDEN` and every FAILED row
   * names a household other than the one this phone shows (`WorkerHooks.householdId`): ops a
   * sign-in brought back from a household the account has since left (`sync/replay.ts`), which the
   * server refuses whatever the person's role here. Read off the rows, like `failedCode`.
   */
  failedElsewhere?: boolean;
  /**
   * When the current unbroken run of push requests that did not land began, in epoch ms, and why
   * the latest one did not: `network` when it got no answer at all, `server` when the server
   * refused the whole call. Null when the latest request was answered, the phone is offline, or
   * nothing has been sent this session. What the banner reads to say "We can't reach the server"
   * for real network trouble, and only for that.
   */
  stalledSince?: number | null;
  stalledBy?: StallCause | null;
  /** The parent dismissed the banner this session. Set by the status store, never by the worker. */
  bannerDismissed?: boolean;
}

/** Why a request did not land: no answer came back, or the server refused the whole call. */
export type StallCause = 'network' | 'server';

/**
 * WHICH REFUSAL THE ONE BANNER SPEAKS FOR, of the codes the FAILED rows hold — the one a Try again
 * can do most about first: `SERVER` (the server's own fault, which a later attempt may clear), then
 * the entry (`VALIDATION`, `CONFLICT`), then the role (`FORBIDDEN`, whose banner offers no retry,
 * because nothing the parent can press changes their role). A row with no code — parked by a build
 * before the column, or by something this build does not name — reads as `SERVER`, so it is
 * always offered a Try again. Null when there are no FAILED rows.
 */
export function bannerCodeOf(codes: readonly (string | null)[]): PushErrorCode | null {
  if (codes.length === 0) return null;
  const known = (c: string | null): c is PushErrorCode =>
    c === 'VALIDATION' || c === 'FORBIDDEN' || c === 'CONFLICT' || c === 'SERVER';
  if (codes.some(c => !known(c) || c === 'SERVER')) return 'SERVER';
  if (codes.includes('VALIDATION')) return 'VALIDATION';
  if (codes.includes('CONFLICT')) return 'CONFLICT';
  return 'FORBIDDEN';
}

/**
 * Something a parent may need to be told about, as data rather than as a sentence.
 *
 * The words live in `sync/copy.ts` and arrive with WP4.9 — the same split `SyncInspectorSheet.tsx`
 * already documents, and the reason is that the worker cannot write them: `stashAdjusted(by, …)`
 * needs the NAME of the caregiver who used the container first, and the server's conflict payload
 * carries a container id and a number of millilitres. Resolving an id to a person is a read of the
 * household, which is a screen's job, not a queue's.
 */
export type SyncNotice =
  | {
      kind: 'stash_adjusted';
      containerId: string;
      /** What was really left, and therefore what the rewritten USE draws. */
      availableMl: number;
      /** What the parent poured that was not there: the compensating ADJUST's magnitude. */
      shortfallMl: number;
    }
  | { kind: 'timer_merged'; timerId: string; startedAt: string; startedBy: string }
  /**
   * This phone's stop of a pump timer was the second one, and what it stored from that stop was
   * nullified with it (`nullifyStashSave`): `storedMl` is what its bags had held.
   */
  | { kind: 'stash_save_nullified'; storedMl: number };

export interface WorkerHooks {
  analytics: Analytics['emit'];
  onState(snapshot: SyncSnapshot): void;
  /** Injected so a test can pin both ends of the jitter window. */
  rng?: (() => number) | undefined;
  /**
   * The household this phone shows — the one `SyncEngine` pulls. The worker still sends an op
   * naming any other household (the account may still be in it, and the server is the one that
   * knows), but a refusal of one is not about the person's role HERE, and the snapshot says so
   * (`SyncSnapshot.failedElsewhere`). Absent, every refusal is read as this household's.
   */
  householdId?: string | undefined;
  /**
   * WP4.8's pull engine, as a seam. §8 ends a pass with "fold server truth (LWW winners) back
   * in", and the tables to fold are exactly the ones this pass pushed to. It is optional because
   * the engine lands in the next package and a worker that imported a module that does not exist
   * yet could not be tested at all; the worker never pulls by itself.
   */
  pullAfterPush?: ((tables: readonly string[]) => Promise<void>) | undefined;
  /** Notices for WP4.9's copy layer. */
  onNotice?: ((notice: SyncNotice) => void) | undefined;
  /**
   * An op has become terminal: it is FAILED and a person has to look at it.
   *
   * It carries the CODE, not the message, and that is the whole point. WP4.9's banner has to
   * choose between "your role can't save this" and "this entry couldn't be saved" — two
   * different sentences with two different people in them — and `last_error` holds the server's
   * prose, which cannot be branched on. The code can: `FORBIDDEN` is about the caregiver,
   * everything else is about the entry (`sync/copy.ts`'s `failureClassOf`).
   */
  onFailure?:
    | ((failure: {
        code: PushErrorCode;
        entity: OutboxEntity;
        op: string;
        message: string;
      }) => void)
    | undefined;
  /**
   * CARRY QUEUED ENTRY PHOTOS OVER, as a seam, for the same reason `pullAfterPush` is one: the
   * worker is about the OUTBOX, and a photo is a few hundred kilobytes in a bucket rather than
   * an op in a queue. `data/entryPhotos.ts` owns the whole of it; this is where the network is
   * known to be up and something is already awake.
   *
   * IT RUNS AFTER THE PUSH PASSES, NOT BEFORE, and that ordering is the rule this feature
   * exists under read at sync time: a photo may never cost a parent a log. An upload can take a
   * minute on hospital wifi, and a drain in front of the push would leave a night of feeds
   * sitting in the outbox — saved on this phone, invisible on the other parent's — behind a
   * picture. The stamp the drain writes is an ordinary activity op, so it simply goes out on the
   * next flush; nothing is lost by being a tick late, and a great deal is lost by being early.
   *
   * It never throws into the flush: the drain reports counts rather than raising, because there
   * is no screen to show an error on and a failed photo must not mark a successful sync failed.
   */
  drainPhotos?: (() => Promise<void>) | undefined;
}

export type FlushOutcome = {
  sent: number;
  synced: number;
  failed: number;
  /**
   * `refused`: the server answered a whole call with a refusal and took none of it, even op by op
   * (`OutboxWorker.refused`) — reached, unlike `transport`, and nothing to send until the backoff.
   */
  stoppedBecause: 'empty' | 'offline' | 'transport' | 'refused' | 'passes' | 'stopped';
};

/** What one `send` came to: why the pass should stop, if it should, and what it did. */
interface SendOutcome {
  stop: 'transport' | 'refused' | null;
  synced: number;
  failed: number;
  touched: string[];
}

/**
 * WHETHER A THROWN PUSH WAS THE SERVER REFUSING THESE OPS — an answer, not the lack of one (the
 * owner on staging, 2026-09-29: "keeps showing 1 queued, in the beginning it asks to try again").
 *
 *   * `offline`, `transport`: nothing was answered (D12). Nothing was refused, and the next try may
 *     simply land, so it costs no attempt.
 *   * `server` with a 401: the SESSION was refused, not the ops. An expired access token has the
 *     client send the publishable key, which may run nothing (`auth/mirror.ts` says when), and the
 *     session's own machinery settles that. A 408 or 429 is a gateway asking for patience. Free.
 *   * any other `server` failure, and an answer this phone could not read at all (`PushResponse`
 *     refusing its shape): the server was reached and said no to the call. Said again, every time,
 *     when one op in it is the reason — a payload Postgres cannot hold fails the call before any op
 *     is applied (packages/db `sync-joiner.test.ts`) — so it is a refusal, and costs attempts.
 */
export function refusedByServer(err: unknown): boolean {
  if (!isSyncFailure(err)) return true;
  if (err.code !== 'server') return false;
  return err.status !== 401 && err.status !== 408 && err.status !== 429;
}

/** The `last_error` of an op parked because the op it waits on is parked (`parkStranded`). */
export const WAITS_ON_PARKED = 'waits on an operation the server would not take';

/**
 * TEXT THE SERVER CAN HOLD. A NUL cannot be stored in Postgres text at all, and half of a
 * surrogate pair — an emoji cut by a length limit — is not text jsonb will read: either one in ANY
 * op fails the whole `sync_push` before a row is written (22P05, 22P02). JavaScript keeps both
 * without complaint, so a note, a name or an imported line carrying one reached the wire intact and
 * took its whole batch with it. On the wire a NUL is dropped and a lone surrogate becomes U+FFFD,
 * the replacement character; nothing else in any string changes, and the next pull brings the
 * server's copy back to this phone's mirror. A loop, not a regex: lookbehind is not something the
 * phone's JavaScript engine is certain to have.
 */
export function wireText(s: string): string {
  let out = '';
  let changed = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) {
      changed = true;
      continue;
    }
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s.slice(i, i + 2);
        i += 1;
        continue;
      }
      out += '\ufffd';
      changed = true;
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      out += '\ufffd';
      changed = true;
      continue;
    }
    out += s[i];
  }
  return changed ? out : s;
}

/** Every string in a payload, as `wireText` leaves it; numbers, booleans and nulls untouched. */
export function wireSafe(value: unknown): unknown {
  if (typeof value === 'string') return wireText(value);
  if (Array.isArray(value)) return value.map(wireSafe);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = wireSafe(v);
    return out;
  }
  return value;
}

/** Which mirrored table an entity's rows live in locally. `null` means WP4 does not mirror it
 *  yet — the op still flushes, there is simply no local row to stamp.
 *
 *  `settings` is not in the map and cannot be: it is the one entity that stands for FOUR
 *  tables, and `tableOf` below reads which from the op. */
export const TABLE_BY_ENTITY: Readonly<Record<Exclude<OutboxEntity, 'settings'>, string | null>> = {
  activity: 'activities',
  timer: 'running_timers',
  container: 'milk_containers',
  milk_txn: 'milk_inventory_transactions',
  care_item: 'care_items',
  location: 'storage_locations',
  schedule_phase: 'schedule_phases',
  schedule_rule: 'schedule_rules',
  schedule_instance: 'schedule_instances',
  vaccine_record: 'vaccine_records',
  shopping_item: 'shopping_items',
  task: 'household_tasks',
  supply_item: 'supply_items',
  favorite: 'favorites',
  /*
    A dismissal's `entity_id` IS a row key — the message's id — but the local row's key is
    (message_id, user_id), so there is no `id` column to stamp. `null` is the same answer
    `community_post` gives for a different reason: there is nothing here for the worker to write
    back, and the pull carries the server's view of the answer on the message row itself
    (migration 0104).
  */
  message_dismissal: null,
  community_post: null,
  // NibbleCue's records (docs/SERVER.md): `nibble_sync_push` answers with the row's server time
  nibble_record: 'nibble_records',
};

/**
 * A `settings` OP IS NOT A TABLE, AND ITS `entity_id` IS NOT A ROW KEY.
 *
 * Four chains queue under the one `settings` entity — `moduleSettingChain`, `dayWindowChain`,
 * `notificationPreferenceChain` and `vaccineTrackingChain` (core's `chains.ts`) — and each names
 * its real table in the payload. The op's `entity_id` is a uuid v5 DERIVED from the household,
 * that table and the row's own key (`settingsEntityId`): an idempotency key that two phones
 * editing the same setting agree on, and a value that appears in no column on either side.
 *
 * None of the four tables has an `id` at all; each is keyed by the household plus what
 * distinguishes the row (`data/repository.ts` `LOCAL_PRIMARY_KEY`). So there is no row here
 * addressable by one id, which is why `markRowSynced` stamps none of them.
 */
export const SETTINGS_TABLES: ReadonlySet<string> = new Set([
  'household_duty',
  'household_settings',
  'module_settings',
  'notification_preferences',
  'privacy_preferences',
  'vaccine_tracking_settings',
]);

/**
 * The mirror table an op wrote — from the payload for a `settings` op, from the entity for
 * everything else. `null` where there is no local row to stamp or to pull back.
 */
function tableOf(row: OutboxRow): string | null {
  if (row.entity !== 'settings') return TABLE_BY_ENTITY[row.entity];
  const table = payloadOf(row)['table'];
  return typeof table === 'string' && SETTINGS_TABLES.has(table) ? table : null;
}

const holes = (n: number): string => new Array(n).fill('?').join(', ');

/**
 * Whether this phone queued, after the op at `afterSeq`, a ledger row that puts milk back into
 * the container — a deleted bottle's ADJUST, an Undo's — in any state: one already sent in the
 * same batch counts as much as one still waiting. Payloads are parsed here rather than in SQL so
 * the rule does not depend on the device's SQLite having JSON functions.
 */
async function refillQueuedAfter(t: Tx, containerId: string, afterSeq: number): Promise<boolean> {
  const later = await t.all<Pick<OutboxRow, 'payload'>>(
    `select payload from outbox where entity = 'milk_txn' and seq > ?`,
    [afterSeq],
  );
  return later.some(r => {
    const p = payloadOf(r);
    return p['container_id'] === containerId && Number(p['delta_ml']) > 0;
  });
}

/** What `nullifyStashSave` removed: the ml the losing stop had stored, and the ops it dropped. */
interface NullifiedSave {
  storedMl: number;
  ops: string[];
}

/** An outbox row on the wire. `depends_on` and `seq` never leave the device, and every string
 *  goes as text the server can hold (`wireSafe`). */
function wireOp(row: OutboxRow): PushOp {
  return {
    client_op_id: row.client_op_id,
    entity: row.entity,
    op: row.op,
    entity_id: row.entity_id,
    household_id: row.household_id,
    payload: wireSafe(payloadOf(row)) as Record<string, unknown>,
  };
}

const ZERO: FlushOutcome = { sent: 0, synced: 0, failed: 0, stoppedBecause: 'stopped' };

export class OutboxWorker {
  /** Whether `start()` has run and `stop()` has not. */
  private started = false;
  /** One pass at a time. `flush` is called from six places and is idempotent by this flag. */
  private running = false;
  /**
   * A FLUSH ASKED FOR WHILE ONE WAS RUNNING, run once that one ends (2026-09-24: the owner, in
   * Expo Go, "it says not sync or sync pending a lot").
   *
   * A second call used to return and be forgotten. A pass takes its batches until the queue is
   * empty, then pulls back what it touched and drains the photos — and a write that committed
   * during that tail found the pass still running, so its `afterCommit` flush returned nothing
   * and the entry sat "1 queued" until the next 60-second tick. Logging a diaper and then a
   * bottle is exactly that tail. The call still returns straight away (the caller is never made
   * to wait on a pass it did not start); the worker simply owes one more pass, and runs it.
   */
  private again: FlushReason | null = null;
  /**
   * Consecutive thrown requests. THE ONE FIELD NOT IN SQLITE, and deliberately so: it decides
   * how long to wait before the next attempt, not whether the op is still owed. Losing it on a
   * restart means the first attempt after a relaunch is immediate, which is what a parent who
   * has just reopened the app wants.
   */
  private transportFailures = 0;
  /**
   * WHEN THE CURRENT RUN OF REQUESTS THAT DID NOT LAND BEGAN, and why the latest did not (the
   * snapshot's `stalledSince` and `stalledBy`). Memory only, like `transportFailures` above, and
   * for the words only: whether an op is owed is still the table's. Set by the first thrown push of
   * a run and kept while every push after it throws; cleared by the first push that is answered,
   * by a pass that finds the phone offline (Offline is the chip's own word), and by start and
   * stop. It is what lets "We can't reach the server" mean the network and nothing else.
   */
  private stalledSince: number | null = null;
  private stalledBy: StallCause | null = null;
  /**
   * The ops a `stash_save_nullified` adoption removed while the batch that carried them was
   * still being read (`nullifyStashSave`). Their rows are gone, and whatever the server said
   * about them — a foreign-key refusal, for a bag naming a session it never had — is not news.
   * Cleared by every `send`: a removed op can never be in a later batch.
   */
  private readonly nullified = new Set<string>();
  private offReconnect: (() => void) | null = null;
  /** The unconditional reclaim `start()` kicks off; `flush` waits for it so a pass can never
   *  race the recovery of rows a killed process left in SENDING. */
  private ready: Promise<void> = Promise.resolve();

  constructor(
    private readonly db: Db,
    private readonly api: SyncApi,
    private readonly net: Net,
    private readonly clock: Clock,
    private readonly hooks: WorkerHooks,
  ) {}

  /* ---------------------------------------------------------------- lifecycle */

  /**
   * Reclaim whatever the last process left behind, and listen for the network coming back.
   *
   * The unconditional reclaim is the whole answer to "the app was killed mid-flush" (D20): every
   * SENDING row goes back to PENDING regardless of age, because this process cannot possibly
   * have a request in flight. Re-sending is safe — `client_op_id` is the idempotency key, and
   * the server answers `duplicate`, which is a success.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.transportFailures = 0;
    this.stalledSince = null;
    this.stalledBy = null;
    this.offReconnect = this.net.onReconnect(() => {
      this.transportFailures = 0;
      void this.flush('reconnect').catch(rethrowUnlessTeardown);
    });
    this.ready = this.db
      .run(`update outbox set state = 'PENDING', sending_at = null where state = 'SENDING'`)
      .then(() => this.emitState())
      .catch(() => undefined);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.again = null;
    this.stalledSince = null;
    this.stalledBy = null;
    this.offReconnect?.();
    this.offReconnect = null;
  }

  /* ---------------------------------------------------------------- the pass */

  /**
   * One flush pass. Safe to call from anywhere and at any time; only one runs.
   *
   * `stoppedBecause` is the honest reason the pass ended, and it is the value the Sync inspector
   * shows: `'stopped'` covers both a re-entrant call and a worker that is not started, because
   * from the caller's point of view they are the same answer — this worker is not taking work.
   */
  async flush(reason: FlushReason): Promise<FlushOutcome> {
    if (!this.started) return ZERO;
    if (this.running) {
      this.again = reason;
      return ZERO;
    }
    this.running = true;
    const startedAt = this.clock.now();
    let sent = 0;
    let synced = 0;
    let failed = 0;
    let stoppedBecause: FlushOutcome['stoppedBecause'] = 'passes';
    try {
      await this.ready;
      if (!(await this.net.isConnected())) {
        // offline is the chip's own word; a run of unanswered requests ends with it
        this.stalledSince = null;
        this.stalledBy = null;
        await this.emitState(false);
        return this.report({ sent: 0, synced: 0, failed: 0, stoppedBecause: 'offline' }, startedAt);
      }
      // A reconnect or a return to the foreground is new information about the network, so the
      // consecutive-failure count that was only ever a delay schedule starts again (D12).
      if (reason === 'reconnect' || reason === 'foreground') this.transportFailures = 0;

      await this.reclaimStuckSending();
      const touched = new Set<string>();
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const batch = await this.takeBatch(reason);
        if (batch.length === 0) {
          stoppedBecause = 'empty';
          break;
        }
        sent += batch.length;
        const outcome = await this.send(batch);
        synced += outcome.synced;
        failed += outcome.failed;
        for (const table of outcome.touched) touched.add(table);
        await this.emitState(true);
        if (outcome.stop !== null) {
          stoppedBecause = outcome.stop;
          break;
        }
      }
      // Fold server truth back in: the LWW winners of anything this push touched, so a field a
      // caregiver lost is on screen before they look for it.
      if (this.hooks.pullAfterPush && touched.size > 0) {
        /*
          A LEDGER ROW MOVES ITS CONTAINER ON THE SERVER — the balance trigger writes the amount
          — so a drained push of ledger rows pulls the containers back too, the way a pushed
          medicine pulls its rules (the stash sweep of 2026-09-24). Two parents pouring from one
          bag before either phone has seen the other's pour is an ordinary night with twins: the
          phone that sent last kept showing the milk it believed was left until the five-minute
          pull, and that pull then brought the bag back as a 0 oz bag in both stashes, for good.
          Only once the queue is drained, so a pull never lands over a draw still waiting to go.
        */
        if (stoppedBecause === 'empty' && touched.has('milk_inventory_transactions')) {
          touched.add('milk_containers');
        }
        await this.hooks.pullAfterPush([...touched]);
        // …and a bag those draws left at nothing is closed, here and — at once — on the server
        if (touched.has('milk_containers') && (await this.closeEmptiedBags()) > 0) {
          const batch = await this.takeBatch(reason);
          if (batch.length > 0) {
            sent += batch.length;
            const outcome = await this.send(batch);
            synced += outcome.synced;
            failed += outcome.failed;
            if (outcome.stop !== null) stoppedBecause = outcome.stop;
            await this.hooks.pullAfterPush(outcome.touched);
          }
        }
      }
      // …and only then the pictures (see `drainPhotos`). Swallowed deliberately: a photo that
      // could not be carried is not a flush that failed, and the queue's own row remembers.
      if (this.hooks.drainPhotos && stoppedBecause !== 'transport') {
        try {
          await this.hooks.drainPhotos();
        } catch {
          /* the queue row stays PENDING with its backoff; nothing here is a sync failure */
        }
      }
      return this.report({ sent, synced, failed, stoppedBecause }, startedAt);
    } finally {
      this.running = false;
      await this.emitState();
      // one follow-up pass for whatever arrived during this one — never more than one, and only
      // while started: a pass that found nothing eligible ends at once, so this cannot spin
      const next = this.again;
      this.again = null;
      // nobody awaits it, so what a teardown does to it ends it quietly (`db/latch.ts`)
      if (next !== null && this.started) void this.flush(next).catch(rethrowUnlessTeardown);
    }
  }

  /**
   * `sync_flush` (docs/MOBILE.md §12), emitted once per pass that did something.
   *
   * Every number is a band: `ops_bucket` rather than the op count, because a queue depth with a
   * timestamp beside it is a household's night. `error_class` is the pass's own `stoppedBecause`
   * — five words this file owns — and never a server message, which could carry anything. A pass
   * that found an empty queue is not reported at all: the 60-second tick would otherwise emit a
   * steady drip of "nothing happened" from every installed phone.
   */
  private report(outcome: FlushOutcome, startedAt: number): FlushOutcome {
    if (outcome.sent === 0 && outcome.stoppedBecause === 'empty') return outcome;
    this.hooks.analytics('sync_flush', {
      ops_bucket: countBucket(outcome.sent),
      duration_ms_bucket: msBucket(this.clock.now() - startedAt),
      result: outcome.failed > 0 ? (outcome.synced > 0 ? 'partial' : 'failed') : 'ok',
      error_class: outcome.stoppedBecause,
    });
    return outcome;
  }

  /**
   * A row is only reclaimable once it has been in SENDING for `STUCK_SENDING_MS` (D11). `sending_at`
   * is written in the same statement that set SENDING, before the request left, so a row that has
   * been sending for two seconds is left alone however old the op itself is.
   */
  private reclaimStuckSending(): Promise<unknown> {
    return this.db.run(
      `update outbox set state = 'PENDING', sending_at = null
        where state = 'SENDING' and (sending_at is null or sending_at < ?)`,
      [this.clock.iso(this.clock.now() - STUCK_SENDING_MS)],
    );
  }

  /**
   * The ops that go out together, marked SENDING **before the request leaves** so a crash
   * mid-request is recoverable rather than invisible.
   *
   * The selection itself is `packages/core`'s `selectBatch`, which is where the ordering rules
   * live and are tested; this reads the candidates, resolves the dependencies it needs and
   * writes the mark, all in one transaction so two callers cannot claim the same row.
   *
   * NOTHING WRITTEN WHILE THE TOUR HOLDS THE QUEUE (`pushHold.ts`): ops above its mark wait, so
   * the tour's trial entries are still unsent when it takes them back and leave no row anywhere.
   * The cut is by `seq` alone — everything the tour's run wrote, whatever it is — because an op
   * always depends on an earlier one, so a cut in the total order never strands a dependency;
   * holding by kind of entity would have sent a bottle's closing patch without the bottle. The
   * sign-out's last flush ignores the hold: nothing may be left for the teardown to quarantine.
   */
  private async takeBatch(reason: FlushReason): Promise<OutboxRow[]> {
    const nowIso = this.clock.iso();
    return this.db.tx(async t => {
      await dropMootDeletes(t);
      const above = reason === 'teardown' ? null : await heldAbove(t, this.clock.now());
      await parkStranded(t, above);
      const candidates = await t.all<OutboxRow>(
        `select * from outbox
          where state = 'PENDING' and (next_attempt_at is null or next_attempt_at <= ?)
            and (? is null or seq <= ?)
          order by seq asc limit ?`,
        [nowIso, above, above, MAX_BATCH * 4],
      );
      if (candidates.length === 0) return [];

      const deps = [
        ...new Set(candidates.map(c => c.depends_on).filter((d): d is string => d !== null)),
      ];
      const states = new Map<string, string>();
      if (deps.length > 0) {
        const rows = await t.all<{ client_op_id: string; state: string }>(
          `select client_op_id, state from outbox where client_op_id in (${holes(deps.length)})`,
          deps,
        );
        for (const row of rows) states.set(row.client_op_id, row.state);
      }
      const isSynced = (clientOpId: string): boolean => {
        const state = states.get(clientOpId);
        // A dependency with NO outbox row at all has already been delivered and pruned (SYNCED
        // rows are kept SYNCED_PRUNE_DAYS for the inspector, then go) or was discarded by hand.
        // Reading "absent" as "not synced" would strand every op behind it for the life of the
        // install, which is losing a log by inaction.
        return state === undefined || state === 'SYNCED';
      };

      const { batch } = selectBatch(candidates, isSynced);
      if (batch.length === 0) return [];
      await t.run(
        `update outbox set state = 'SENDING', sending_at = ?
          where client_op_id in (${holes(batch.length)})`,
        [nowIso, ...batch.map(row => row.client_op_id)],
      );
      return batch.map(row => ({ ...row, state: 'SENDING' as const, sending_at: nowIso }));
    });
  }

  /** One `sync_push` call and everything its answer implies. */
  private async send(batch: readonly OutboxRow[]): Promise<SendOutcome> {
    let response: PushResponse;
    try {
      response = await this.api.push(batch.map(wireOp));
    } catch (err) {
      // The run of requests that did not land is dated, with WHY: a whole call the server
      // answered with an error (`SyncFailure` 'server', or an answer the phone could not read) is
      // the server's, and anything else — no answer at all — is the network's. Only the second
      // may be called "We can't reach the server".
      if (this.stalledSince === null) this.stalledSince = this.clock.now();
      this.stalledBy = isSyncFailure(err) && err.code !== 'server' ? 'network' : 'server';
      // The server said no to the call as a whole: the ops pay for it, one at a time (`refused`).
      if (refusedByServer(err)) return this.refused(batch, err);
      // No answer came back, so the ops may or may not have been applied — which is exactly what
      // the idempotency keys are for. Back to PENDING with `attempts` untouched (D12).
      await this.backoffAll(batch, err);
      return { stop: 'transport', synced: 0, failed: 0, touched: [] };
    }
    // an answer: whatever it says about each op, the server can be reached
    this.stalledSince = null;
    this.stalledBy = null;

    const byOp = new Map(response.results.map(r => [r.client_op_id, r]));
    let synced = 0;
    let failed = 0;
    const touched = new Set<string>();
    this.nullified.clear();

    for (const row of batch) {
      if (this.nullified.has(row.client_op_id)) {
        // nullified by the adoption of an earlier op in this very batch: neither synced nor
        // failed. Its table is still pulled back, so a bag the winning phone stored arrives now
        const table = tableOf(row);
        if (table !== null) touched.add(table);
        continue;
      }
      const result = byOp.get(row.client_op_id);
      if (result === undefined) {
        // A result the client cannot match to an outbox row is the one answer an outbox must
        // never be given, because "nothing happened" looks exactly like success. Treat it as a
        // transport failure for that row: back to PENDING, no attempt consumed.
        await this.returnToPending(row, 'the server returned no result for this operation');
        continue;
      }
      // `tableOf`, not the entity's table: a settings op names one of four, and pulling
      // `module_settings` back after a day-window push would fold in the wrong row.
      const table = tableOf(row);
      if (table !== null) touched.add(table);
      // a medicine's reminders are rules the server builds from the care item's op, stamped with
      // its own clock: pulled back with it, the phone holds the server's version of each rule
      if (row.entity === 'care_item') touched.add('schedule_rules');

      if (result.status === 'applied' || result.status === 'duplicate') {
        await this.succeed(row, result);
        synced += 1;
        continue;
      }
      const code: PushErrorCode = result.error?.code ?? 'SERVER';
      const message = result.error?.message ?? 'rejected';
      const conflict = result.conflict;

      if (row.entity === 'message_dismissal' && /message not found/i.test(message)) {
        // A CARD THE SERVER NO LONGER HAS — retired, or no longer meant for this person — cannot
        // be dismissed there and needs no dismissing: the next pull takes the card away, and the
        // answer stays on this phone. It used to retry nine times and settle as "Not synced" on a
        // card nobody could see any more (the sync sweep of 2026-09-24).
        await this.succeed(row, { client_op_id: row.client_op_id, status: 'applied' });
        synced += 1;
        continue;
      }
      if (row.entity === 'schedule_instance' && /scheduled item not found/i.test(message)) {
        // A SKIP OF A SLOT THE SERVER NO LONGER HAS, answered the same way. A rule edit discards
        // the open instances (`app.discard_rule_future`) and a pull cannot carry a delete, so this
        // phone can still hold the row it skipped. There is nothing left to skip there, and the
        // skip stays on this phone, where the engine reads it by the slot's rule and time; retried,
        // it settled as "Not synced" thirteen minutes later (the pre-release sweep, 2026-09-24 —
        // reachable since a skip finds the server's row at all, `db/queries/schedule.ts`).
        await this.succeed(row, { client_op_id: row.client_op_id, status: 'applied' });
        synced += 1;
        continue;
      }
      if (conflict?.kind === 'ledger_overdraw' && row.entity === 'milk_txn') {
        // NOT a retry: the deduction as queued can never succeed, because the milk is gone. The
        // draw is rewritten instead, and the feed is untouched (packages/core/overdraw.ts).
        await this.rewriteOverdrawnDraw(row, conflict.available_ml, message);
        continue;
      }
      if (isTerminal(code)) {
        await this.fail(row, message, code);
        failed += 1;
        continue;
      }
      if (await this.conflictIsTerminal(row)) {
        // D28's client half: a CONFLICT on an UPDATE or DELETE whose own CREATE is already
        // SYNCED and which waits on nothing is not a race — the row is not coming, and ten
        // retries over thirteen minutes would read as data loss to the parent watching the chip.
        await this.fail(row, message, code);
        failed += 1;
        continue;
      }
      if (await this.backoffOne(row, message, code)) failed += 1;
    }

    return { stop: null, synced, failed, touched: [...touched] };
  }

  /**
   * THE SERVER REFUSED THE CALL AS A WHOLE, and took none of it (the owner on staging, 2026-09-29:
   * "keeps showing 1 queued, in the beginning it asks to try again server error thing").
   *
   * Every such refusal used to go back to PENDING with its attempts untouched, as if nothing had
   * been answered — so an op the server will never take, or one whose payload fails the call
   * before anything is applied, was sent and refused for the rest of the install: "1 queued" on the
   * chip, "couldn't be saved to the server" on the banner, and a Try again that sent it to be
   * refused once more. And it took every op sent beside it down with it.
   *
   *   * ONE OP: it pays an attempt, exactly as a per-op SERVER rejection does (`backoffOne`), and
   *     is parked FAILED with the code the refusal carried once it has spent `MAX_ATTEMPTS` — the
   *     banner's Try again then starts its count again. Never parked at once, whatever the code: a
   *     refusal of the call is not certainly about the op, so it gets the same patience a SERVER
   *     rejection does.
   *   * SEVERAL: the server named none of them, so each goes again on its own, in order, and the one
   *     it cannot take is found while the rest go through. An op whose dependency rode in this batch
   *     and has not gone through waits, unpaid, as `selectBatch` would have made it wait. A call
   *     that gets no answer at all ends the run the way a transport failure ends a pass.
   *
   * A refusal the whole server gives every call — a function missing on a project, a grant gone —
   * costs each op one attempt per pass this way and parks them in the end, under a banner that
   * offers Try again. That is the honest place for them: the server is answering, and saying no.
   */
  private async refused(batch: readonly OutboxRow[], err: unknown): Promise<SendOutcome> {
    const code: PushErrorCode = isSyncFailure(err) ? (err.pushCode ?? 'SERVER') : 'SERVER';
    const message = err instanceof Error ? err.message : String(err);
    const [only] = batch;
    if (batch.length === 1 && only !== undefined) {
      const parked = await this.backoffOne(only, message, code);
      return { stop: 'refused', synced: 0, failed: parked ? 1 : 0, touched: [] };
    }
    const inBatch = new Set(batch.map(row => row.client_op_id));
    const took = new Set<string>();
    const touched = new Set<string>();
    let synced = 0;
    let failed = 0;
    let answered = false;
    for (let i = 0; i < batch.length; i++) {
      const row = batch[i] as OutboxRow;
      const now = await this.db.get<{ state: string }>(
        'select state from outbox where client_op_id = ?',
        [row.client_op_id],
      );
      // gone meanwhile (an adoption nullified it, `nullifyStashSave`), or settled already
      if (now?.state !== 'SENDING') continue;
      if (row.depends_on !== null && inBatch.has(row.depends_on) && !took.has(row.depends_on)) {
        await this.releaseUnsent([row], null);
        continue;
      }
      const one = await this.send([row]);
      synced += one.synced;
      failed += one.failed;
      for (const table of one.touched) touched.add(table);
      if (one.stop === 'transport') {
        // no answer at all: what is left of the batch waits as long as this op now does
        const wait = await this.db.get<{ at: string | null }>(
          'select next_attempt_at as at from outbox where client_op_id = ?',
          [row.client_op_id],
        );
        await this.releaseUnsent(batch.slice(i + 1), wait?.at ?? null);
        return { stop: 'transport', synced, failed, touched: [...touched] };
      }
      if (one.stop !== 'refused') answered = true;
      const after = await this.db.get<{ state: string }>(
        'select state from outbox where client_op_id = ?',
        [row.client_op_id],
      );
      if (after === undefined || after.state === 'SYNCED') took.add(row.client_op_id);
    }
    return { stop: answered ? null : 'refused', synced, failed, touched: [...touched] };
  }

  /**
   * Rows of a batch that were never sent on their own, back to PENDING exactly as they were: no
   * attempt spent, no refusal recorded — only told when to go next, when there is a wait to keep.
   */
  private async releaseUnsent(rows: readonly OutboxRow[], nextAt: string | null): Promise<void> {
    if (rows.length === 0) return;
    await this.db.run(
      `update outbox set state = 'PENDING', sending_at = null,
              next_attempt_at = coalesce(?, next_attempt_at)
        where state = 'SENDING' and client_op_id in (${holes(rows.length)})`,
      [nextAt, ...rows.map(row => row.client_op_id)],
    );
  }

  /* ---------------------------------------------------------------- outcomes */

  /**
   * `applied` and `duplicate` are BOTH success: `duplicate` means the server already holds
   * exactly one record for this operation, which is the guarantee, not a failure of it.
   */
  private async succeed(row: OutboxRow, result: PushResult): Promise<void> {
    const adopted = result.entity_id !== undefined && result.entity_id !== row.entity_id;
    const dropped = await this.db.tx(async t => {
      await t.run(
        `update outbox set state = 'SYNCED', last_error = null, last_error_code = null,
                sending_at = null
          where client_op_id = ?`,
        [row.client_op_id],
      );
      await this.markRowSynced(t, row, result.server_updated_at);
      return adopted ? this.adoptServerRow(t, row, result.entity_id ?? row.entity_id) : null;
    });
    if (dropped !== null) {
      for (const op of dropped.ops) this.nullified.add(op);
      this.hooks.onNotice?.({ kind: 'stash_save_nullified', storedMl: dropped.storedMl });
    }
    if (result.status === 'duplicate') {
      this.hooks.analytics('duplicate_suppressed', {
        module: row.entity,
        layer: 'server_idempotency',
        source: 'sync',
      });
    }
    if (result.conflict?.kind === 'timer_merged') {
      this.hooks.onNotice?.({
        kind: 'timer_merged',
        timerId: result.conflict.timer_id,
        startedAt: result.conflict.started_at,
        startedBy: result.conflict.started_by,
      });
    }
  }

  /** The local row adopts the server's `updated_at` and stops being queued. The pull owns the
   *  rest of the row; this is the one write the push path makes to the mirror. */
  private async markRowSynced(t: Tx, row: OutboxRow, serverUpdatedAt?: string): Promise<void> {
    const table = tableOf(row);
    if (table === null) return;
    if (table === 'activities') {
      await t.run(
        `update activities set local_synced = 1, updated_at = coalesce(?, updated_at) where id = ?`,
        [serverUpdatedAt ?? null, row.entity_id],
      );
      return;
    }
    // The ledger has no `updated_at` at all (append-only), and neither has a storage location
    // (pulled `full`, D17): nothing to stamp on either.
    //
    // A SETTINGS ROW HAS NO `id` TO STAMP BY (`SETTINGS_TABLES` above says why at length), and
    // the op's `entity_id` is a derived key rather than a column value, so `where id = ?` was
    // both the wrong column and the wrong value. It cost nothing to stop: a pulled row adopts
    // the server's `updated_at` unconditionally (`apply.ts`), and `pullAfterPush` now asks for
    // the table this op actually wrote — so the stamp arrives from the pull a moment later,
    // which is how the ledger and a storage location have always got theirs.
    if (
      SETTINGS_TABLES.has(table) ||
      table === 'milk_inventory_transactions' ||
      table === 'storage_locations' ||
      serverUpdatedAt === undefined
    )
      return;
    await t.run(`update ${table} set updated_at = ? where id = ?`, [
      serverUpdatedAt,
      row.entity_id,
    ]);
  }

  /**
   * D26: the server kept a different row, and THIS DEVICE DOES NOT RE-KEY.
   *
   * Re-keying would rewrite an id that detail rows, ledger rows and queued payloads all point at,
   * for no gain: one sleep activity exists either way. So the loser tombstones its own copy and
   * adopts the winner from the next pull. Everything happens in the caller's transaction so a
   * kill between the two halves cannot leave two visible activities for one timer stop.
   *
   * The activity is soft-deleted, because a parent's entry is never physically removed. Its
   * detail row and any local ledger row pointing at it ARE removed, because neither table has a
   * `deleted_at` column to soft-delete into (`apps/mobile/src/db/schema.ts`; the server's
   * `<t>_details` and `milk_inventory_transactions` have none either) — and neither can be
   * reached once its activity is a tombstone, so nothing a person could see is lost. A ledger row
   * here can only ever be one the server refused: a ledger op naming an activity the server never
   * created fails its foreign key, so no accepted server row can point at the losing id.
   *
   * The winner's id is not needed and is deliberately not stored: the next pull brings the whole
   * row, and writing a foreign id into a local column would be a second source of truth for it.
   */
  private async adoptServerRow(
    t: Tx,
    row: OutboxRow,
    winnerId: string,
  ): Promise<NullifiedSave | null> {
    if (row.entity === 'timer') {
      // running_timers is hard-deleted everywhere: a stop is physical, and the merged winner
      // arrives with the next pull carrying the earlier start time.
      await t.run(`delete from running_timers where id = ?`, [row.entity_id]);
      return null;
    }
    if (row.entity === 'vaccine_record') {
      await this.adoptMergedRecord(t, row, winnerId);
      return null;
    }
    if (row.entity !== 'activity') return null;
    // before the ledger rows below go: the bags stored from this stop are found by them
    const dropped = await this.nullifyStashSave(t, row.entity_id);
    const activity = await t.get<{ type: string }>(`select type from activities where id = ?`, [
      row.entity_id,
    ]);
    await t.run(
      `update activities set deleted_at = coalesce(deleted_at, ?), local_synced = 1 where id = ?`,
      [this.clock.iso(), row.entity_id],
    );
    const detail =
      activity === undefined
        ? null
        : (DETAIL_TABLE_BY_ACTIVITY[activity.type as ActivityType] ?? null);
    if (detail !== null)
      await t.run(`delete from ${detail} where activity_id = ?`, [row.entity_id]);
    await t.run(`delete from milk_inventory_transactions where activity_id = ?`, [row.entity_id]);
    // The ops still queued for the row that lost would now be writing to an id the server does
    // not have. They are dropped, not failed: there is nothing wrong with them and nothing for a
    // parent to review — the winner already carries the same intent.
    await t.run(
      `delete from outbox where entity_id = ? and state in ('PENDING', 'FAILED') and client_op_id != ?`,
      [row.entity_id, row.client_op_id],
    );
    return dropped;
  }

  /**
   * THE LOSING STOP'S STASH SAVE GOES WITH IT (the stash sweep of 2026-09-24, finding 8; the
   * owner, the same day: "just nullify the entry on the second phone (once confirmed this is
   * duplicate action), and keep it as is").
   *
   * The server's `duplicate` naming another session is the confirmation that this phone's stop
   * of the timer was the second one. A bag stored from that stop can never reach the server: it
   * names a session the server never had (`source_activity_id`, and its ADD's `activity_id`),
   * which Postgres refuses as a foreign key. It used to sit here at "0 oz" — the adoption below
   * deletes the ADD — with its ADD queued for ever, "1 queued" and then "Not synced".
   *
   * So every bag stored from the losing session goes: its ledger rows, the bag, and every op
   * still owed for either, including ops in the batch whose answers are still being read (`send`
   * skips those through `nullified`). The winning phone's save is never touched — what it stored,
   * or did not, is what the household keeps — and nothing here re-points or merges. A bottle
   * already poured from the losing bag keeps its feed; only the draw from a bag that never
   * existed for the household goes with the bag.
   */
  private async nullifyStashSave(t: Tx, activityId: string): Promise<NullifiedSave | null> {
    const bags = (
      await t.all<{ id: string }>(`select id from milk_containers where source_activity_id = ?`, [
        activityId,
      ])
    ).map(b => b.id);
    if (bags.length === 0) return null;
    const ledger = await t.all<{ id: string; kind: string; delta_ml: number }>(
      `select id, kind, delta_ml from milk_inventory_transactions
        where container_id in (${holes(bags.length)})`,
      bags,
    );
    const storedMl = ledger.filter(r => r.kind === 'ADD').reduce((sum, r) => sum + r.delta_ml, 0);
    const entities = [...bags, ...ledger.map(r => r.id)];
    // by the rows' own ids, and by the bag a queued ledger op names, in case its row is gone
    const ops = (
      await t.all<{ client_op_id: string }>(
        `select client_op_id from outbox
          where state != 'SYNCED'
            and (entity_id in (${holes(entities.length)})
                 or (entity = 'milk_txn'
                     and json_extract(payload, '$.container_id') in (${holes(bags.length)})))`,
        [...entities, ...bags],
      )
    ).map(o => o.client_op_id);
    if (ops.length > 0) {
      await t.run(`delete from outbox where client_op_id in (${holes(ops.length)})`, ops);
    }
    await t.run(
      `delete from milk_inventory_transactions where container_id in (${holes(bags.length)})`,
      bags,
    );
    await t.run(`delete from milk_containers where id in (${holes(bags.length)})`, bags);
    return { storedMl, ops };
  }

  /**
   * ONE DOSE, ONE RECORD — ON THIS PHONE AS WELL AS ON THE SERVER (docs/VACCINES.md §8; the
   * household sweep of 2026-09-24).
   *
   * Two parents who both record the same scheduled dose — side by side at the visit, or one of
   * them offline — are merged by the server into the record that already held the slot, and the
   * second phone hears `duplicate` with THAT record's id (0015, 0116). This phone used to keep its
   * own row beside the one the pull then brought: two live records of one dose here and nowhere
   * else, a second copy of it in this phone's download, and every later correction aimed at the
   * row the server never had — refused as "vaccine record not found", parked as Not synced, and
   * never seen by the other parent.
   *
   * So the losing row is soft-deleted, as a losing activity is, and what this phone still has
   * queued for it — a correction or an Undo written before the merge was known — is RE-AIMED at
   * the record the server kept rather than dropped: unlike a second timer stop, it is the
   * parent's own later edit of the same dose, and the server's edit clock still decides whether
   * it is the newer one. Nothing here is a vaccine decision; it is which row an edit belongs to.
   */
  private async adoptMergedRecord(t: Tx, row: OutboxRow, winnerId: string): Promise<void> {
    await t.run(`update vaccine_records set deleted_at = coalesce(deleted_at, ?) where id = ?`, [
      this.clock.iso(),
      row.entity_id,
    ]);
    if (winnerId === row.entity_id) return;
    await t.run(
      `update outbox set entity_id = ?
        where entity = 'vaccine_record' and entity_id = ? and state in ('PENDING', 'FAILED')
          and client_op_id != ?`,
      [winnerId, row.entity_id, row.client_op_id],
    );
  }

  /**
   * Terminal: the op is parked and shown, and the local row is left exactly as it is. The CODE is
   * kept on the row beside the words (`last_error_code`), so the banner that offers Try again reads
   * it from the outbox — after a restart as much as in the session that saw it (2026-09-28).
   */
  private async fail(row: OutboxRow, message: string, code: PushErrorCode): Promise<void> {
    await this.db.run(
      `update outbox set state = 'FAILED', last_error = ?, last_error_code = ?, sending_at = null
        where client_op_id = ?`,
      [message, code, row.client_op_id],
    );
    this.hooks.onFailure?.({ code, entity: row.entity, op: row.op, message });
  }

  /** @returns true when this rejection was the last one and the op is now FAILED. */
  private async backoffOne(row: OutboxRow, message: string, code: PushErrorCode): Promise<boolean> {
    if (isFinalAttempt(row.attempts)) {
      await this.fail(row, message, code);
      return true;
    }
    const delay = backoffDelayMs(row.attempts, this.hooks.rng);
    await this.db.run(
      `update outbox set state = 'PENDING', attempts = ?, last_error = ?, last_error_code = ?,
              next_attempt_at = ?, sending_at = null
        where client_op_id = ?`,
      [row.attempts + 1, message, code, this.clock.iso(this.clock.now() + delay), row.client_op_id],
    );
    return false;
  }

  /**
   * A thrown request: every op in the batch goes back to PENDING with `attempts` UNCHANGED, and
   * the wait comes from the consecutive-transport-failure counter instead (D12). Ten flaky
   * minutes of tunnel must never mark a valid log FAILED while the chip promises it will sync.
   */
  private async backoffAll(batch: readonly OutboxRow[], err: unknown): Promise<void> {
    this.transportFailures += 1;
    const message = err instanceof Error ? err.message : String(err);
    const delay = backoffDelayMs(
      Math.min(this.transportFailures - 1, MAX_ATTEMPTS - 1),
      this.hooks.rng,
    );
    const nextAt = this.clock.iso(this.clock.now() + delay);
    await this.db.tx(async t => {
      for (const row of batch) {
        // no answer, so no refusal and no code: `last_error_code` is the server's word only
        await t.run(
          `update outbox set state = 'PENDING', last_error = ?, last_error_code = null,
                  next_attempt_at = ?, sending_at = null
            where client_op_id = ?`,
          [message, nextAt, row.client_op_id],
        );
      }
    });
  }

  /** One row back to PENDING, immediately, with no attempt consumed. */
  private returnToPending(row: OutboxRow, message: string): Promise<unknown> {
    return this.db.run(
      `update outbox set state = 'PENDING', last_error = ?, last_error_code = null,
              sending_at = null
        where client_op_id = ?`,
      [message, row.client_op_id],
    );
  }

  /**
   * D28's client refinement, which can only live here: a zero-row UPDATE or DELETE is
   * indistinguishable from a missing row under RLS, and `PushOp` does not carry outbox state, so
   * the server cannot tell a race from a row that is never coming. The client can: if this op's
   * own entity already has a SYNCED CREATE and this op waits on nothing, the row IS on the
   * server and a CONFLICT means it will not accept this change. Retrying is then dishonest.
   */
  private async conflictIsTerminal(row: OutboxRow): Promise<boolean> {
    if (row.op === 'CREATE' || row.depends_on !== null) return false;
    const created = await this.db.get<{ one: number }>(
      `select 1 as one from outbox
        where entity_id = ? and op = 'CREATE' and state = 'SYNCED' limit 1`,
      [row.entity_id],
    );
    return created !== undefined;
  }

  /* ---------------------------------------------------------------- emptied bags */

  /**
   * Close every bag the server now holds at nothing that THIS phone drew from, once nothing it
   * still owes the server touches that bag (the stash sweep of 2026-09-24).
   *
   * A bottle that empties a bag closes it in its own write (`closingPatch` in data/stash.ts) —
   * but only when THIS phone could see that it emptied it. Two phones each pouring part of a bag
   * before either has pulled the other's pour empty it together, and neither closes it: the
   * server's balance trigger writes the amount and never the status, so the bag stayed STORED at
   * 0 ml, in both stashes and their counts, and a location holding it could not be deleted. It
   * runs after the containers have been pulled back, so "nothing" is the server's own amount.
   * The patch is the one the bottle's write would have queued (`emptiedPatchId`), so an Undo or a
   * delete of that bottle reopens the bag the way it reopens any other.
   *
   * @returns how many bags it closed; their patches are queued, for the caller to send.
   */
  private async closeEmptiedBags(): Promise<number> {
    return this.db.tx(async t => {
      const empty = await t.all<{ id: string; household_id: string }>(
        `select id, household_id from milk_containers
          where amount_ml <= 0 and status in ('STORED', 'THAWING')`,
      );
      if (empty.length === 0) return 0;
      const ids = new Set(empty.map(b => b.id));
      // newest first: the first SYNCED draw found for a bag is its latest
      const ledger = await t.all<Pick<OutboxRow, 'payload' | 'state'>>(
        `select payload, state from outbox where entity = 'milk_txn' order by seq desc`,
      );
      const owed = new Set<string>();
      const lastDraw = new Map<string, { activityId: string; usedAt: string }>();
      for (const row of ledger) {
        const p = payloadOf(row);
        const bag = p['container_id'];
        if (typeof bag !== 'string' || !ids.has(bag)) continue;
        if (row.state !== 'SYNCED') owed.add(bag);
        else if (
          !lastDraw.has(bag) &&
          p['kind'] === 'USE' &&
          Number(p['delta_ml']) < 0 &&
          typeof p['activity_id'] === 'string'
        ) {
          lastDraw.set(bag, {
            activityId: p['activity_id'],
            usedAt: typeof p['occurred_at'] === 'string' ? p['occurred_at'] : this.clock.iso(),
          });
        }
      }
      let closed = 0;
      for (const bag of empty) {
        const draw = lastDraw.get(bag.id);
        if (draw === undefined || owed.has(bag.id)) continue;
        let patchId: string;
        try {
          patchId = emptiedPatchId(draw.activityId, bag.id);
        } catch {
          continue; // not an id this app minted
        }
        // already queued once for this bottle — its own close, or an earlier pass's
        if (await t.get('select 1 as one from outbox where client_op_id = ?', [patchId])) continue;
        await enqueue(
          t,
          {
            client_op_id: patchId,
            entity: 'container',
            op: 'UPDATE',
            entity_id: bag.id,
            household_id: bag.household_id,
            payload: { status: 'USED', used_at: draw.usedAt, client_edited_at: this.clock.iso() },
            depends_on: null,
          },
          this.clock,
        );
        await t.run(
          `update milk_containers set status = 'USED', used_at = coalesce(used_at, ?) where id = ?`,
          [draw.usedAt, bag.id],
        );
        closed += 1;
      }
      return closed;
    });
  }

  /* ---------------------------------------------------------------- overdraw */

  /**
   * The other caregiver got there first, and the bag is emptier than this device believed.
   *
   * THE FEED IS NEVER LOST TO FIX AN INVENTORY NUMBER. The bottle activity is not touched. Only
   * the ledger half is rewritten, into a USE of what was really there plus a compensating ADJUST
   * for the shortfall, the pair summing to what the parent actually poured
   * (`packages/core/src/sync/overdraw.ts`, `docs/MILK_STASH.md` §5.2). Both ids derive from the
   * intent, so a device killed between the rejection and the retry rewrites to byte-identical ops
   * and the server's `milk_txn_client_op_uniq` swallows the replay.
   */
  private async rewriteOverdrawnDraw(
    row: OutboxRow,
    availableMl: number,
    message: string,
  ): Promise<void> {
    const op = wireOp(row);
    // The chain's ledger op derives its key from the intent, and its `depends_on` IS the intent
    // (the activity op carries the intent id unchanged). A ledger op queued with no dependency
    // is its own intent, which is the only other shape this can take.
    const intentId = row.depends_on ?? row.client_op_id;
    const wanted = -Number(op.payload['delta_ml']);
    let pair: [ChainOp, ChainOp];
    try {
      pair = rewriteOverdraw(op, availableMl, intentId);
    } catch {
      // The server says overdrawn and the payload does not describe a draw, or says more is
      // available than was wanted. Neither can be rewritten; park it where a person can see it
      // rather than retry a deduction that will be refused for ever.
      await this.fail(row, message, 'CONFLICT');
      return;
    }
    const [use, adjust] = pair;
    const useDelta = Number(use.payload['delta_ml']);
    const adjustDelta = Number(adjust.payload['delta_ml']);
    const containerId = String(op.payload['container_id']);
    const activityId = op.payload['activity_id'];
    const usedAt =
      typeof op.payload['occurred_at'] === 'string' ? op.payload['occurred_at'] : this.clock.iso();
    let closeId: string | null = null;
    try {
      if (typeof activityId === 'string') closeId = emptiedPatchId(activityId, containerId);
    } catch {
      closeId = null; // not an id this app minted: there is no bottle of ours to tie a close to
    }

    await this.db.tx(async t => {
      /*
        THE REWRITE EMPTIES THE BAG, SO IT CLOSES IT — here and on the server (the stash sweep of
        2026-09-24: two phones feeding the twins from one bag offline). The rewritten USE draws
        everything the server said was left, so the bag holds nothing; but it was closed nowhere.
        The phone that found out kept showing the milk it had believed was there ("1.1 oz", and
        "use soon" on Today) until a later pull, and that pull then brought the bag back to both
        phones as a 0 oz bag in the stash and its count — the ghost `closingPatch` in
        data/stash.ts exists to prevent, and a location holding it could not be deleted. The patch
        is the one the bottle's own write would have queued had it emptied the bag
        (`emptiedPatchId`), so an Undo or a delete of this bottle finds it and reopens the bag
        exactly as it does for any other (`returnToContainer` in data/undo.ts), and it goes AHEAD
        of the rewritten ledger rows, as every container patch of a draw does.

        Only for a bottle's draw, and only when nothing this phone still owes puts milk BACK into
        the bag (a delete or an Undo queued after the draw): that milk is really there, and a bag
        closed over it would vanish from every list that offers one.
      */
      const bag = await t.get<{ status: string }>(
        'select status from milk_containers where id = ?',
        [containerId],
      );
      const closes =
        op.payload['kind'] === 'USE' &&
        closeId !== null &&
        bag !== undefined &&
        bag.status !== 'DISCARDED' &&
        !(await refillQueuedAfter(t, containerId, row.seq));
      // The rejected op IS the USE — same key — so it is replaced rather than joined by a second
      // one. Deleting and re-enqueuing gives it the new payload, a fresh `seq` and
      // `attempts = 0`, which is right: this is a different operation, not an eleventh try.
      await t.run(`delete from outbox where client_op_id = ?`, [row.client_op_id]);
      if (closes && closeId !== null) {
        await enqueue(
          t,
          {
            client_op_id: closeId,
            entity: 'container',
            op: 'UPDATE',
            entity_id: containerId,
            household_id: row.household_id,
            payload: { status: 'USED', used_at: usedAt, client_edited_at: this.clock.iso() },
            depends_on: row.depends_on,
          },
          this.clock,
        );
        await t.run(
          `update milk_containers
              set amount_ml = 0,
                  status = case when status in ('STORED', 'THAWING') then 'USED' else status end,
                  used_at = coalesce(used_at, ?), updated_at = ?
            where id = ?`,
          [usedAt, this.clock.iso(), containerId],
        );
      }
      await enqueue(t, use, this.clock);
      await enqueue(t, adjust, this.clock);
      // The mirror follows the ledger, so the stash total a parent reads is the ledger's own
      // arithmetic and nothing else.
      await t.run(`update milk_inventory_transactions set delta_ml = ? where id = ?`, [
        useDelta,
        use.entity_id,
      ]);
      await upsertRow(t, {
        table: 'milk_inventory_transactions',
        row: {
          id: adjust.entity_id,
          client_op_id: adjust.client_op_id,
          household_id: adjust.household_id,
          container_id: adjust.payload['container_id'],
          kind: 'ADJUST',
          delta_ml: adjustDelta,
          from_location_id: adjust.payload['from_location_id'] ?? null,
          to_location_id: adjust.payload['to_location_id'] ?? null,
          activity_id: adjust.payload['activity_id'] ?? null,
          occurred_at: adjust.payload['occurred_at'] ?? this.clock.iso(),
          created_by: adjust.payload['created_by'],
          created_at: this.clock.iso(),
        },
      });
    });

    this.hooks.onNotice?.({
      kind: 'stash_adjusted',
      containerId: String(op.payload['container_id']),
      availableMl,
      shortfallMl: wanted - availableMl,
    });
  }

  /* ---------------------------------------------------------------- readers */

  /** Every row the server has not accepted: PENDING, SENDING and FAILED alike. Sign-out's
   *  step 3 quarantines exactly this, and a SENDING row abandoned by a sign-out must not be
   *  lost (docs/ACCOUNTS.md §4). */
  pending(): Promise<OutboxRow[]> {
    return outboxPending(this.db);
  }

  async counts(): Promise<{ pending: number; sending: number; failed: number }> {
    const all = await outboxCounts(this.db);
    return {
      pending: Math.max(0, all.pending - (await this.heldCount())),
      sending: all.sending,
      failed: all.failed,
    };
  }

  /**
   * THE OPS THE TOUR IS HOLDING ARE NOT "QUEUED" ON THE CHIP. They are not waiting for a network;
   * they are the tour's practice, about to be taken back, and "2 queued" beside a trial entry the
   * card calls a trial would be a sentence about nothing. What else the parent wrote during the
   * tour waits with them and goes the moment it ends (or `PUSH_HOLD_MS` after it began). `pending()`
   * — what a sign-out quarantines — still counts every one of them.
   */
  private async heldCount(): Promise<number> {
    const above = await heldAbove(this.db, this.clock.now());
    if (above === null) return 0;
    const row = await this.db.get<{ n: number }>(
      `select count(*) as n from outbox where state = 'PENDING' and seq > ?`,
      [above],
    );
    return row?.n ?? 0;
  }

  /**
   * "Retry now". `attempts` goes back to zero because a person asking again is new information,
   * not the eleventh try of the same schedule (§2.1). With no id, every FAILED op is retried.
   *
   * AND, WITH NO ID, EVERYTHING WAITING OUT A BACKOFF GOES NOW (2026-09-28). It is the banner's Try
   * again, and a banner about a server that cannot be reached is about ops that are PENDING, not
   * FAILED: they wait out the transport schedule, which a pass never shortens, so the button sent
   * nothing and changed nothing. Their `attempts` are left as they are — only a FAILED op starts
   * its count again — and the transport count starts again, as on a reconnect (D12).
   */
  async retry(clientOpId?: string): Promise<void> {
    await this.db.tx(async t => {
      if (clientOpId !== undefined) {
        await outboxRetry(t, clientOpId);
        return;
      }
      await t.run(
        `update outbox set state = 'PENDING', attempts = 0, next_attempt_at = null,
                sending_at = null
          where state = 'FAILED'`,
      );
      await t.run(
        `update outbox set next_attempt_at = null
          where state = 'PENDING' and next_attempt_at is not null`,
      );
    });
    if (clientOpId === undefined) this.transportFailures = 0;
    await this.emitState();
  }

  /**
   * EVERYTHING WAITING OUT A BACKOFF GOES NOW, and nothing else changes (2026-09-28). A pull on Today
   * is a person asking for a sync, which is new information about the world just as a reconnect is
   * (D12): a pull that sent only what was already due left the owner's entries "7 queued" for up to
   * five minutes more while its spinner said it had synced. Each op keeps its `attempts` (only Try
   * again starts a FAILED op's count again), so a refusal still ends in the banner; the transport
   * count starts again, as on a reconnect.
   */
  async dueNow(): Promise<void> {
    await this.db.tx(t =>
      t.run(
        `update outbox set next_attempt_at = null
          where state = 'PENDING' and next_attempt_at is not null`,
      ),
    );
    this.transportFailures = 0;
    await this.emitState();
  }

  /**
   * Read the queue and publish what it says — counts, the banner's refusal, the run of requests
   * that did not land — for a surface that has just opened (`SyncRuntime.refresh`).
   */
  refreshState(): Promise<void> {
    return this.emitState();
  }

  /** "Discard": the OPERATION is dropped and the ROW is kept. Nothing in this app deletes a
   *  parent's entry to tidy a queue. */
  async discard(clientOpId: string): Promise<void> {
    await this.db.tx(t => outboxDiscard(t, clientOpId));
    await this.emitState();
  }

  /* ---------------------------------------------------------------- state */

  private async emitState(connected?: boolean): Promise<void> {
    try {
      const counts = await outboxCounts(this.db);
      const above = await heldAbove(this.db, this.clock.now());
      const oldest = await this.db.get<{ at: string | null }>(
        `select min(created_at) as at from outbox
          where state in ('PENDING', 'SENDING') and (? is null or seq <= ?)`,
        [above, above],
      );
      // what the parked ops were refused for, off their own rows: one read, and only when there
      // are any, so a quiet queue costs nothing more than it did
      const parked =
        counts.failed === 0
          ? []
          : await this.db.all<{ code: string | null; household_id: string }>(
              `select distinct last_error_code as code, household_id from outbox
                where state = 'FAILED'`,
            );
      const failedCode = counts.failed === 0 ? null : bannerCodeOf(parked.map(r => r.code));
      // a role refusal is this household's only when some refused row names it (`failedElsewhere`)
      const here = this.hooks.householdId ?? null;
      const failedElsewhere =
        failedCode === 'FORBIDDEN' && here !== null && parked.every(r => r.household_id !== here);
      this.hooks.onState({
        connected: connected ?? (await this.net.isConnected()),
        flushing: this.running,
        pending: Math.max(0, counts.pending - (await this.heldCount())),
        sending: counts.sending,
        failed: counts.failed,
        oldestPendingAt: oldest?.at ?? null,
        failedCode,
        failedElsewhere,
        stalledSince: this.stalledSince,
        stalledBy: this.stalledBy,
      });
    } catch {
      // A snapshot is a courtesy to the chip; failing to take one must never fail a flush.
    }
  }
}

/**
 * AN OP THAT WAITS ON A PARKED ONE IS PARKED WITH IT, AND GOES BACK WHEN IT DOES (the owner on
 * staging, 2026-09-29: "keeps showing 1 queued").
 *
 * `selectBatch` never sends an op before the op it depends on has reached the server, and a FAILED
 * op never reaches it by itself. So whatever waited on a refused op — a stash row behind a refused
 * feed, the change an Undo queued behind it — sat PENDING for the life of the install: counted
 * "queued" on the chip and in the sign-out sheet, sent never, and invisible to Try again, which
 * only ever looks at FAILED rows. Now it is FAILED beside the op it waits on, carrying that op's
 * code (the banner speaks for what really happened) and `WAITS_ON_PARKED` as its reason; Try again
 * puts both back together, and `selectBatch` sends them in order.
 *
 * AND THE OTHER WAY: a parked op whose dependency is no longer FAILED — retried, sent, discarded or
 * gone — is PENDING again at once, attempts untouched (it was never sent), so nothing stays parked
 * for a reason that has cleared. Both run until nothing moves, so a chain moves as one. Ops the
 * tour is holding (`pushHold.ts`) are left to it: its clean-up takes them back whole.
 */
export async function parkStranded(t: Tx, above: number | null = null): Promise<number> {
  const blocked = `select client_op_id from outbox where state = 'FAILED'`;
  for (;;) {
    const { changes } = await t.run(
      `update outbox set state = 'PENDING', last_error = null, last_error_code = null
        where state = 'FAILED' and last_error = ?
          and (depends_on is null or depends_on not in (${blocked}))`,
      [WAITS_ON_PARKED],
    );
    if (changes === 0) break;
  }
  let parked = 0;
  for (;;) {
    const { changes } = await t.run(
      `update outbox
          set state = 'FAILED', last_error = ?, sending_at = null,
              last_error_code = (select d.last_error_code from outbox d
                                  where d.client_op_id = outbox.depends_on)
        where state = 'PENDING' and depends_on in (${blocked})
          and (? is null or seq <= ?)`,
      [WAITS_ON_PARKED, above, above],
    );
    if (changes === 0) return parked;
    parked += changes;
  }
}

/**
 * A DELETE OF A ROW THE SERVER NEVER ACCEPTED IS MOOT (the sync sweep of 2026-09-24, P7).
 *
 * When a CREATE is refused (FAILED — the server did not apply it) and the parent then deletes the
 * entry, the server has nothing to delete: sending the DELETE earned "not found", ten retries
 * over several minutes as "N queued", and a second FAILED op beside the first ("Not synced") for
 * an entry that no longer exists anywhere a parent can see it. So both go: every unsent op for
 * that row, and — transitively — every unsent op that waits on one of them (a stash ledger row
 * behind the refused feed, the milk put back behind the delete), which could otherwise only be
 * sent against a row that was never there or wait forever. The row stays deleted on the phone,
 * which is where the parent left it. A row whose CREATE did reach the server is never touched.
 */
export async function dropMootDeletes(t: Tx): Promise<number> {
  const moot = await t.all<{ entity: string; entity_id: string }>(
    `select distinct d.entity, d.entity_id from outbox d
      where d.state = 'PENDING' and d.op = 'DELETE'
        and exists (select 1 from outbox c
                     where c.entity = d.entity and c.entity_id = d.entity_id
                       and c.op = 'CREATE' and c.state = 'FAILED')
        and not exists (select 1 from outbox s
                     where s.entity = d.entity and s.entity_id = d.entity_id
                       and s.op = 'CREATE' and s.state in ('SENDING', 'SYNCED'))`,
    [],
  );
  if (moot.length === 0) return 0;
  const gone = new Set<string>();
  for (const m of moot) {
    const rows = await t.all<{ client_op_id: string }>(
      `select client_op_id from outbox
        where entity = ? and entity_id = ? and state in ('PENDING', 'FAILED')`,
      [m.entity, m.entity_id],
    );
    for (const r of rows) gone.add(r.client_op_id);
  }
  // and whatever waits on them, however far down the chain
  for (let frontier = [...gone]; frontier.length > 0;) {
    const next = await t.all<{ client_op_id: string }>(
      `select client_op_id from outbox
        where state in ('PENDING', 'FAILED')
          and depends_on in (${frontier.map(() => '?').join(', ')})`,
      frontier,
    );
    frontier = next.map(r => r.client_op_id).filter(id => !gone.has(id));
    for (const id of frontier) gone.add(id);
  }
  const ids = [...gone];
  await t.run(`delete from outbox where client_op_id in (${ids.map(() => '?').join(', ')})`, ids);
  return moot.length;
}
