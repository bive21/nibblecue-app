/**
 * Draining widget taps into the outbox (`docs/OFFLINE_SYNC.md` §7; WP4 D24).
 *
 * A widget tap never opens the network and never opens the app. The extension mints the ids
 * itself, writes an **intent record** into a store both processes can see, and updates its own
 * snapshot so the widget changes instantly. The app's job is only to move those records into
 * the real outbox on the next launch, foreground or background pass — preserving the ids and
 * **the original tap time**: `start_at` is when the parent tapped, not when the phone next
 * managed to run the app. A diaper logged at 03:12 and drained at 07:40 belongs at 03:12.
 *
 * WHY THIS IS TYPESCRIPT AND NOT SWIFT YET. The native stores are WP9 — a file in the App
 * Group container on iOS, `WorkManager` input data plus a shared table on Android — and the App
 * Group identifier is owner-held and is not read anywhere in WP4. What WP4 fixes now is the
 * INTERFACE and the key shape, because those are what become expensive to change after they
 * exist in two native languages. In particular the dedupe key gains the child (D25): without
 * it, the second twin's diaper looks like a double tap on the first, and `docs/WIDGETS.md` §5's
 * key shape has to be corrected before WP9 writes it down in Swift and Kotlin.
 *
 * IDEMPOTENCE HAS TWO LOCKS. §7 rule 4: the intent is marked consumed **in the same
 * transaction** that inserts the outbox row, and `client_op_id` is the outbox's primary key.
 * The first covers a crash between the write and the mark; the second covers a store that
 * cannot join the transaction at all, which is every native one. `LocalWidgetIntentSource`
 * implements both because it is the same SQLite file.
 */
import {
  DETAIL_TABLE_BY_ACTIVITY,
  WIDGET_DEDUPE_WINDOW_MS,
  simpleActivityChain,
  type ActivityType,
  type ChainBase,
  type Clock,
  type DetailInput,
} from '@nibblecue/core';
import type { Db, Tx } from '../db/driver';
import { commitWrite, type RepositoryDeps } from './repository';
import { activityKeys } from './store';

/**
 * One tap, as the extension recorded it. Everything the app needs is here: a cross-process
 * queue cannot ask the app for context it may not have yet.
 */
export interface WidgetIntent {
  /** Minted by the extension; the outbox's primary key and the server's idempotency key. */
  client_op_id: string;
  /** The row's own id, also minted by the extension. */
  entity_id: string;
  /** Which module was tapped. Every widget-loggable module is an activity type. */
  module: ActivityType;
  op: 'CREATE';
  /** The activity's fields and, under `detail`, its detail row's — plus `created_by`. */
  payload: Record<string, unknown>;
  child_id: string | null;
  household_id: string;
  /** The tap time. `start_at` is exactly this (§7 rule 3). */
  at: string;
  dedupe_key: string;
  dedupe_window_ms: number;
  /** Which widget it came from — `widget_tap`'s only prop besides the action. */
  widget: string;
}

export interface IntentSource {
  pending(): Promise<WidgetIntent[]>;
  markConsumed(clientOpIds: readonly string[]): Promise<void>;
  /**
   * Mark consumed inside the write's own transaction, where the store can join it. Optional:
   * a native store cannot, and there the outbox's primary key is the guard instead.
   */
  markConsumedIn?(t: Tx, clientOpIds: readonly string[]): Promise<void>;
}

const INTENT_COLUMNS =
  'client_op_id, entity_id, module, op, payload, child_id, household_id, at, dedupe_key, dedupe_window_ms, widget, consumed_at';

interface IntentRow {
  client_op_id: string;
  entity_id: string;
  module: string;
  op: string;
  payload: string;
  child_id: string | null;
  household_id: string;
  at: string;
  dedupe_key: string;
  dedupe_window_ms: number;
  widget: string;
}

/** The WP4 store: a local table. WP9 adds the App Group and `WorkManager` implementations. */
export class LocalWidgetIntentSource implements IntentSource {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async pending(): Promise<WidgetIntent[]> {
    const rows = await this.db.all<IntentRow>(
      `select ${INTENT_COLUMNS} from widget_intents where consumed_at is null order by at asc, client_op_id asc`,
      [],
    );
    return rows.map(decodeIntent);
  }

  markConsumed(clientOpIds: readonly string[]): Promise<void> {
    return this.db.tx(t => this.markConsumedIn(t, clientOpIds));
  }

  async markConsumedIn(t: Tx, clientOpIds: readonly string[]): Promise<void> {
    if (clientOpIds.length === 0) return;
    await t.run(
      `update widget_intents set consumed_at = ? where client_op_id in (${clientOpIds.map(() => '?').join(', ')})`,
      [this.clock.iso(), ...clientOpIds],
    );
  }

  /** Write an intent as the extension would. WP9's native side replaces this caller. */
  async record(intent: WidgetIntent): Promise<void> {
    await this.db.run(
      `insert or ignore into widget_intents (${INTENT_COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null)`,
      [
        intent.client_op_id,
        intent.entity_id,
        intent.module,
        intent.op,
        JSON.stringify(intent.payload),
        intent.child_id,
        intent.household_id,
        intent.at,
        intent.dedupe_key,
        intent.dedupe_window_ms,
        intent.widget,
      ],
    );
  }
}

function decodeIntent(row: IntentRow): WidgetIntent {
  const parsed: unknown = JSON.parse(row.payload);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError(`widget intent ${row.client_op_id} has a payload that is not an object`);
  }
  if (row.op !== 'CREATE') {
    throw new TypeError(`widget intent ${row.client_op_id} is a '${row.op}'; only CREATE drains`);
  }
  return {
    client_op_id: row.client_op_id,
    entity_id: row.entity_id,
    module: row.module as ActivityType,
    op: 'CREATE',
    payload: parsed as Record<string, unknown>,
    child_id: row.child_id,
    household_id: row.household_id,
    at: row.at,
    dedupe_key: row.dedupe_key,
    dedupe_window_ms: row.dedupe_window_ms,
    widget: row.widget,
  };
}

function stringOf(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`a widget intent must carry '${key}'`);
  }
  return value;
}

function detailOf(type: ActivityType, payload: Record<string, unknown>): DetailInput | null {
  const table = DETAIL_TABLE_BY_ACTIVITY[type];
  if (table === null) return null;
  const given = payload['detail'];
  const fields =
    given !== null && typeof given === 'object' && !Array.isArray(given)
      ? (given as Record<string, unknown>)
      : {};
  return { table, fields };
}

/**
 * Drain every pending intent. Returns how many became writes.
 *
 * Each intent is its own transaction rather than one for the batch: two taps that arrived
 * hours apart are two unrelated logs, and a malformed one must not take a good one down with
 * it. An intent whose dedupe window is still open is suppressed exactly as an in-app tap would
 * be — and is still marked consumed, because the record has been dealt with either way.
 */
export async function drainWidgetIntents(
  db: Db,
  source: IntentSource,
  clock: Clock,
  deps: RepositoryDeps = {},
): Promise<number> {
  const pending = await source.pending();
  const joinable = source.markConsumedIn?.bind(source);
  let written = 0;
  for (const intent of pending) {
    const base: ChainBase = {
      intentId: intent.client_op_id,
      householdId: intent.household_id,
      createdBy: stringOf(intent.payload, 'created_by'),
      deviceId:
        typeof intent.payload['device_id'] === 'string' ? intent.payload['device_id'] : null,
      clientEditedAt: clock.iso(),
    };
    const quantity = intent.payload['quantity'];
    const chain = simpleActivityChain(base, {
      id: intent.entity_id,
      childId: intent.child_id,
      type: intent.module,
      // the tap time, never the drain time (§7 rule 3)
      startAt: intent.at,
      quantity: typeof quantity === 'number' ? quantity : null,
      detail: detailOf(intent.module, intent.payload),
    });
    const outcome = await commitWrite(
      db,
      clock,
      {
        intentId: intent.client_op_id,
        chain,
        source: 'widget',
        dedupe: {
          key: intent.dedupe_key,
          windowMs: intent.dedupe_window_ms || WIDGET_DEDUPE_WINDOW_MS,
        },
        invalidates: activityKeys(intent.household_id, intent.child_id, intent.module),
        // `exactOptionalPropertyTypes`: an absent hook is an absent key, never an explicit
        // `undefined`, so the spread is conditional rather than the value.
        ...(joinable === undefined
          ? {}
          : { inTransaction: (t: Tx) => joinable(t, [intent.client_op_id]) }),
      },
      deps,
    );
    if (outcome.committed) written += 1;
    // A suppressed intent never entered the transaction, and a store that cannot join one
    // never had its mark written there: either way the record is dealt with and is marked now.
    if (joinable === undefined || !outcome.committed) {
      await source.markConsumed([intent.client_op_id]);
    }
  }
  return written;
}
