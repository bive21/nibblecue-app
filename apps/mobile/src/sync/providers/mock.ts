/**
 * `MockSyncServer` — an in-memory server that follows the same rules as migration 0009, and
 * `MockSyncApi`, one device talking to it (WP4 D21, the pattern of `auth/providers/mock.ts`).
 *
 * WHY IT IS A REAL FAKE. `docs/OFFLINE_SYNC.md` §9 is written against "a fake `SyncApi` that can
 * drop responses, delay, and count server rows", and thirteen of its fifteen rows are about what
 * happens when the server says NO — a duplicate key, a merged timer, a second stop of one timer,
 * an overdrawn container, a caregiver who may not write. A fake that answered `applied` to
 * everything would turn the whole node suite into a test of a fiction. So this file implements
 * what the migration implements:
 *
 *   * `(household_id, client_op_id)` idempotency on activities and on the ledger;
 *   * `activities_timer_uniq` — a second device stopping the same timer is one stop;
 *   * `running_timers_uniq` — two devices starting one timer MERGE, through `packages/core`'s
 *     own `mergeTimers`, not a second copy of the rule;
 *   * the ledger balance rule of `0009`'s `app.assert_container_balance`, including the one
 *     exception that lets a downward ADJUST record a deficit;
 *   * `first_frozen_at` write-once;
 *   * role authorisation out of `household_members`, with `can_write`/`can_admin` as 0001
 *     defines them;
 *   * per-field last-writer-wins through `packages/core`'s `mergeFields`;
 *   * every failure classified by the SHARED `../sqlstate.ts`, so the fake cannot disagree with
 *     Postgres about whether an error is terminal.
 *
 * The same `SYNC_SCENARIOS` table runs against this file (`../mock-scenarios.test.ts`) and
 * against Postgres (`packages/db/src/integration/sync-scenarios.test.ts`), so a drift between
 * the two is a failing test rather than a discovery three packages later.
 *
 * ONE DELIBERATE DIFFERENCE FROM 0009, recorded here because it is the kind of thing that rots
 * quietly: `public.sync_push` buckets a batch into four phases — activity, timer, container,
 * ledger — and keeps the array order WITHIN a phase (`0009:830-838`). This fake applies in plain
 * array order, which is what `docs/plans/WP4.md` WP4.7 specifies for it. For every chain
 * `packages/core/src/sync/chains.ts` builds the two orders are identical (the activity is always
 * queued before the container that is always queued before the ledger row), so no scenario can
 * tell them apart today. A future chain that queued a ledger op ahead of its own activity in one
 * batch would diverge — the fake would answer CONFLICT where Postgres answers `applied` — and
 * the fix then is to bucket here too, never to loosen the scenario.
 *
 * Nothing in this file is bundled into a build that has a Supabase URL: `env.ts` picks the arm.
 */
import {
  DETAIL_TABLES,
  WellbeingSeen,
  DETAIL_TABLE_BY_ACTIVITY,
  MAX_PUSH_OPS,
  PAGE_SIZES,
  clampEditClock,
  deriveOpId,
  mergeFields,
  mergeTimers,
  DEFAULT_STORAGE_LOCATIONS,
  seededLocationId,
  type DetailTable,
  type FieldClocks,
  type HistoryEntry,
  type PushConflict,
  type PushErrorCode,
  type PushOp,
  type PushResponse,
  type PushResult,
  type PullRequest,
  type PullResponse,
  type PullStrategy,
  type PullTablePage,
  type SyncApi,
  type TimerState,
  VACCINE_PROFILE,
  canBeOn,
  dutyListFromWire,
  dutyListToWire,
  dutyProblem,
} from '@nibblecue/core';
// The strategy registry is the CLIENT's map, read rather than copied. `app.sync_pull_strategy`
// (`0010`) is the third copy, and `packages/db/src/integration/sync-pull.test.ts` pins it against
// this same map name for name — so a fake that kept its own would be the one copy nothing checks.
import { PULL_STRATEGY } from '../../db/schema';
import { SQLSTATE, pushErrorCode } from '../sqlstate';
import { SyncFailure, type MockSyncControls } from './types';
import type { KeyValueStore } from '../../prefs';

export type Row = Record<string, unknown>;

/** A membership, which is where every authorisation answer in this file comes from. */
export interface MockMembership {
  household_id: string;
  user_id: string;
  role: 'OWNER' | 'PARENT' | 'CAREGIVER' | 'VIEW_ONLY';
  removed_at: string | null;
  /** A temporary caregiver's seat end (0101), or null/absent for a permanent member. */
  expires_at?: string | null;
}

/** What a failing statement raises, carrying the SQLSTATE Postgres would have raised. */
class ServerError extends Error {
  constructor(
    readonly state: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The columns of `activities` a client edit may move — `0009`'s `v_fields`, verbatim. */
const ACTIVITY_FIELDS = [
  'child_id',
  'type',
  'start_at',
  'end_at',
  'quantity',
  'canonical_unit',
  'notes',
  'is_private',
] as const;

const ACTIVITY_TYPES: readonly string[] = [
  'bottle',
  'breastfeed',
  'pump',
  'diaper',
  'sleep',
  'solids',
  'med',
  'growth',
  'temp',
  'water',
  'tummy',
  'bath',
  'milestone',
  'note',
  // the Health note (0159)
  'wellbeing',
];

const TIMER_TYPES: readonly string[] = ['sleep', 'breastfeed', 'pump', 'tummy'];

const LEDGER_KINDS: readonly string[] = [
  'ADD',
  'MOVE',
  'SPLIT',
  'THAW',
  'USE',
  'DISCARD',
  'ADJUST',
];

/** `nullif(x, '')` with the wire's types: anything that is not a non-empty string is null. */
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

const asObject = (v: unknown): Row =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Row) } : {};

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

const int = (v: unknown, fallback = 0): number =>
  typeof v === 'number' ? Math.trunc(v) : fallback;

/** The only table of times this file keeps: everything is an ISO string, as on the wire. */
const ms = (iso: unknown): number => Date.parse(String(iso));

/**
 * The clock of a row's last EDIT (0116) as a number, where a row that has taken none — created
 * before the column, or restored from a snapshot saved before it — is older than any edit.
 */
const editedMs = (iso: unknown): number => {
  const n = typeof iso === 'string' ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(n) ? Number.NEGATIVE_INFINITY : n;
};

/** The key the dev build keeps its fake under; one per household (providers/index.ts). */
export const MOCK_SYNC_STATE_KEY = 'mock_sync_state';

/** Every table `rowsOf` knows that is not a detail table — the snapshot's shape. */
const PERSISTED_TABLES = [
  'household_members',
  'children',
  'storage_locations',
  'shopping_items',
  'household_tasks',
  'supply_items',
  'activities',
  'running_timers',
  'milk_containers',
  'milk_inventory_transactions',
  'profiles',
  'households',
  'module_settings',
  'household_settings',
  'household_duty',
  'subscription_entitlements',
  'favorites',
  'notification_preferences',
  'privacy_preferences',
  'app_messages',
  // each reader's answer to a card: a reload that forgot them served every answered card as
  // unanswered (the phone's own copy still wins, but a server that forgets is not the server)
  'app_message_dismissals',
  'milk_guidance_profiles',
  'schedule_phases',
  'schedule_rules',
  'schedule_instances',
  'care_items',
  'reminders',
  'vaccine_guidance_profiles',
  'vaccine_tracking_settings',
  'vaccine_records',
  // the ids timer merges retired (0120): a reload that forgot them would let a late stop of a
  // merged-away copy write its night a second time
  'sync_retired_timers',
  // NibbleCue's own records and the op ids already applied to them (docs/SERVER.md)
  'nibble_records',
  'nibble_applied_ops',
] as const;

export interface MockSyncServerOptions {
  /** Injected so a suite can state the passage of time. Defaults to the platform clock. */
  now?: () => number;
  /**
   * Persist every table here so a killed dev build resumes with its "server" intact — the
   * promise the auth mock already makes. Without it the fake is memory alone (every test),
   * and on a phone that meant a fresh, empty server on every launch: the next `full` pull
   * then swept the storage locations this device had already synced, and every container
   * the old server had known was unknown to the new one.
   */
  store?: KeyValueStore;
  /** The key under `store`; defaults to MOCK_SYNC_STATE_KEY. */
  storeKey?: string;
  /**
   * WHO IS A MEMBER, AS THE ACCOUNT BACKEND SAYS IT — the dev build only (`providers/index.ts`).
   *
   * On a real project one predicate answers for both halves: `app.is_member` is what `sync_pull`
   * refuses on and what the account read's `members_read` filters by (migration 0101), so a seat
   * that lapses or a member who is removed loses both at the same statement. The test backend's
   * accounts live in the AUTH mock and this fake only ever learned a membership once, when the
   * engine was built — so a removal or an evening running out never reached a pull, and Expo Go
   * could not run the path a phone takes when its household goes (docs/ACCOUNTS.md §7.3). Given
   * this, the fake asks the account backend as well: a member there is a member here, and one who
   * is not is refused here exactly as a lapsed seat is.
   */
  isMember?: (householdId: string, userId: string) => boolean;
}

export class MockSyncServer implements MockSyncControls {
  online = true;
  delayMs = 0;
  abortAfterOps: number | null = null;

  private dropNext = false;
  private rejectNext: { code: PushErrorCode; message: string } | null = null;
  private readonly withheld = new Set<string>();
  private readonly nowMs: () => number;
  private readonly store: KeyValueStore | undefined;
  private readonly storeKey: string;
  private readonly isMember: ((householdId: string, userId: string) => boolean) | undefined;
  private saving: Promise<void> = Promise.resolve();
  /**
   * Who is listening for this server's nudges (migration 0149's broadcast, in memory): an engine
   * per open app, by household. Not part of the snapshot: a listener is a running app, not state.
   */
  private readonly listeners: { householdId: string; onChange: () => void }[] = [];

  readonly members: MockMembership[] = [];
  readonly children: Row[] = [];
  readonly storage_locations: Row[] = [];
  /** The two shared lists (WP6b, WP6c). Household-scoped, and never part of a child's record. */
  readonly shopping_items: Row[] = [];
  readonly household_tasks: Row[] = [];
  /** The catalog the shopping list points at: what this household actually buys. */
  readonly supply_items: Row[] = [];
  readonly activities: Row[] = [];
  readonly details: Record<DetailTable, Row[]>;
  readonly running_timers: Row[] = [];
  readonly milk_containers: Row[] = [];
  readonly milk_inventory_transactions: Row[] = [];
  // The read-only half of the household. Nothing in this file WRITES these — `sync_push` has no
  // op for a profile, a module setting or a reminder — but `sync_pull` serves all eighteen
  // tables of `PULL_STRATEGY`, and a fake that threw CC422 for eleven of them could not answer
  // a single bootstrap. A test seeds them through `insertAsOtherDevice`, which is what they are
  // from this device's point of view: rows somebody else's client or the worker put there.
  readonly profiles: Row[] = [];
  readonly households: Row[] = [];
  readonly module_settings: Row[] = [];
  readonly household_settings: Row[] = [];
  /** Who's on (migration 0113): one row per household, `shifts` replaced whole. */
  readonly household_duty: Row[] = [];
  readonly subscription_entitlements: Row[] = [];
  readonly favorites: Row[] = [];
  readonly notification_preferences: Row[] = [];
  readonly privacy_preferences: Row[] = [];
  readonly app_messages: Row[] = [];
  readonly app_message_dismissals: Row[] = [];
  readonly milk_guidance_profiles: Row[] = [];
  readonly schedule_phases: Row[] = [];
  readonly schedule_rules: Row[] = [];
  readonly schedule_instances: Row[] = [];
  readonly care_items: Row[] = [];
  readonly reminders: Row[] = [];
  readonly vaccine_guidance_profiles: Row[] = [];
  readonly vaccine_tracking_settings: Row[] = [];
  readonly vaccine_records: Row[] = [];
  /**
   * Migration 0120: `{retired_id, household_id, survivor_id}` for every timer a merge folded
   * into another. An entry or a stop naming a retired id is the survivor's (`survivorOf`).
   */
  readonly sync_retired_timers: Row[] = [];
  /** NibbleCue's own records (`nibble_records`), as `nibble_sync_push` keeps them. */
  readonly nibble_records: Row[] = [];
  /** `nibble_applied_ops`: a retried op is answered `duplicate`, never applied twice. */
  readonly nibble_applied_ops: Row[] = [];

  constructor(options: MockSyncServerOptions = {}) {
    this.nowMs = options.now ?? (() => Date.now());
    this.store = options.store;
    this.storeKey = options.storeKey ?? MOCK_SYNC_STATE_KEY;
    this.isMember = options.isMember;
    this.details = Object.fromEntries(DETAIL_TABLES.map(t => [t, [] as Row[]])) as Record<
      DetailTable,
      Row[]
    >;
  }

  /* ---------------------------------------------------------------- persistence */

  private tables(): readonly string[] {
    return [...PERSISTED_TABLES, ...DETAIL_TABLES];
  }

  /** Rebuild every table from the store. The arrays keep their identity: `splice`, not `=`. */
  async load(): Promise<void> {
    if (!this.store) return;
    let raw: string | null | undefined;
    try {
      raw = await this.store.get(this.storeKey);
    } catch {
      // a snapshot the phone cannot read back (Android refuses a stored value over ~2 MB) is an
      // empty server, exactly as an unparseable one is — never a sync engine that fails to start
      return;
    }
    if (!raw) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return; // an unreadable snapshot is an empty server, never a crash at launch
    }
    for (const table of this.tables()) {
      const rows = parsed[table];
      if (!Array.isArray(rows)) continue;
      const target = this.rowsOf(table);
      target.splice(0, target.length, ...(rows as Row[]));
    }
  }

  /**
   * Serialised writes, like the auth mock's: the last snapshot wins, none interleave. A write
   * that failed never stops the next one — the chain carries on past it (it used to stay
   * rejected, and every later snapshot was silently skipped).
   */
  save(): Promise<void> {
    if (!this.store) return Promise.resolve();
    const snapshot = JSON.stringify(
      Object.fromEntries(this.tables().map(table => [table, this.rowsOf(table)])),
    );
    this.saving = this.saving
      .catch(() => undefined)
      .then(() => this.store?.set(this.storeKey, snapshot));
    return this.saving;
  }

  /**
   * What `bootstrap_household` does on the real server (0008 step 6; ACCOUNTS.md §5 step 9):
   * a household starts with the four default locations, so the first pump session has
   * somewhere to go. The ids are derived from the household, so calling this on every launch
   * — which the dev build does — rebuilds nothing and invents nothing. A household that
   * already has any location, even a retired one, is left exactly as it is.
   */
  seedDefaultLocations(householdId: string): void {
    if (this.rowCount('storage_locations', { household_id: householdId }) > 0) return;
    for (const l of DEFAULT_STORAGE_LOCATIONS) {
      this.insertAsOtherDevice('storage_locations', {
        id: seededLocationId(householdId, l.kind),
        household_id: householdId,
        name: l.name,
        short_name: l.short_name,
        kind: l.kind,
        sort_order: l.sort_order,
        is_default: l.is_default,
        deleted_at: null,
      });
    }
  }

  /* ---------------------------------------------------------------- controls */

  dropNextResponse(): void {
    this.dropNext = true;
  }

  rejectNextWith(code: PushErrorCode, message = 'rejected by the sync inspector'): void {
    this.rejectNext = { code, message };
  }

  withholdUntilCursorPast(rowId: string): void {
    this.withheld.add(rowId);
  }

  rowCount(table: string, where: Record<string, unknown> = {}): number {
    return this.rowsOf(table).filter(row => Object.entries(where).every(([k, v]) => row[k] === v))
      .length;
  }

  insertAsOtherDevice(table: string, row: Row): void {
    const at = this.iso();
    this.rowsOf(table).push({ created_at: at, updated_at: at, ...row });
    void this.save();
  }

  setMemberRole(householdId: string, userId: string, role: MockMembership['role']): boolean {
    const m = this.members.find(
      x => x.household_id === householdId && x.user_id === userId && x.removed_at === null,
    );
    if (m === undefined || m.role === role) return false;
    m.role = role;
    // the pull reads members by `updated_at`: the corrected row has to be news to every phone
    (m as unknown as Row)['updated_at'] = this.iso();
    void this.save();
    return true;
  }

  /* ---------------------------------------------------------------- seeding */

  addMember(m: Omit<MockMembership, 'removed_at'> & { removed_at?: string | null }): void {
    this.members.push({ removed_at: null, ...m });
  }

  addChild(child: Row): void {
    this.children.push({ ...child });
  }

  addLocation(location: Row): void {
    this.storage_locations.push({ ...location });
  }

  /**
   * Put milk in the stash the only way a container is ever built: an empty row plus an ADD
   * ledger row, with the balance rule writing `amount_ml` (`docs/MILK_STASH.md` §3).
   */
  addContainer(args: {
    id: string;
    householdId: string;
    ownerId: string;
    locationId: string;
    ml: number;
    pumpedAt?: string;
  }): void {
    const at = args.pumpedAt ?? this.iso();
    this.milk_containers.push({
      id: args.id,
      household_id: args.householdId,
      owner_id: args.ownerId,
      source_activity_id: null,
      location_id: args.locationId,
      container_type: 'BAG',
      amount_ml: 0,
      initial_ml: args.ml,
      pumped_at: at,
      first_frozen_at: null,
      thawed_at: null,
      opened_at: null,
      used_at: null,
      discarded_at: null,
      discard_reason: null,
      status: 'STORED',
      label_code: null,
      notes: null,
      created_by: args.ownerId,
      created_at: at,
      updated_at: at,
      // stocked here, not edited by a phone: the first edit that arrives takes it (0116)
      client_edited_at: null,
    });
    const seedOp = deriveOpId(args.id, 'seed');
    this.milk_inventory_transactions.push({
      id: seedOp,
      client_op_id: seedOp,
      household_id: args.householdId,
      container_id: args.id,
      kind: 'ADD',
      delta_ml: args.ml,
      from_location_id: null,
      to_location_id: args.locationId,
      activity_id: null,
      occurred_at: at,
      created_by: args.ownerId,
      created_at: at,
    });
    this.rebalance(args.id);
  }

  /* ---------------------------------------------------------------- the API */

  /** One `sync_push` call, as the given user. Throws only for whole-call failures. */
  async push(userId: string, ops: readonly PushOp[]): Promise<PushResponse> {
    await this.wire();
    // `public.sync_push` refuses a body over MAX_PUSH_OPS with CC422 before applying anything;
    // the worker never sends more than MAX_BATCH, so only a caller bypassing it gets here.
    if (ops.length > MAX_PUSH_OPS) {
      throw this.serverFailure(SQLSTATE.CC422, 'validation_error');
    }
    for (const op of ops) {
      // client_op_id is the only field whose absence cannot be reported per op: a PushResult is
      // keyed by it, and a result the client cannot match to an outbox row is worse than a
      // rejected batch (0009:791-795).
      if (!UUID.test(String(op.client_op_id))) {
        throw this.serverFailure(SQLSTATE.CC422, 'validation_error');
      }
    }

    const abortAt = this.abortAfterOps;
    const results: PushResult[] = [];
    for (const op of ops) {
      if (abortAt !== null && results.length >= abortAt) {
        this.abortAfterOps = null;
        throw new SyncFailure('transport', 'the connection dropped mid-batch');
      }
      results.push(this.applyOne(userId, op));
    }
    // the ops ARE applied whatever happens to the answer below, so the snapshot is too — and it
    // is WRITTEN before the answer goes back, as a real server commits before it answers (the
    // sync sweep of 2026-09-24, M2). An app killed between the two used to hold SYNCED ops for
    // rows the fake never kept, and the next full pull swept them off the phone. A snapshot
    // that cannot be written is not the phone's failure: the ops stand in this session.
    try {
      await this.save();
    } catch {
      /* the fake's own disk; see `load` */
    }
    // THE NUDGE (0149): what was applied is news to every phone listening on its household. Once
    // per push, as the real server sends one per transaction; after the commit (the snapshot
    // above), and before the answer, which may yet be lost: the phones that did not send it still
    // have to hear. A push the fake gave up on halfway through (`abortAfterOps`) threw before this
    // and sends nothing, like a transaction that never committed.
    this.nudge(ops, results);
    if (this.dropNext) {
      // §9 row 7a: the ops ARE applied and the answer never arrives. The client retries with the
      // same client_op_id and must come back `duplicate`, not a second feed.
      this.dropNext = false;
      throw new SyncFailure('transport', 'the response was lost');
    }
    return { results, server_time: this.iso() };
  }

  /**
   * `sync_pull`, as `0010_add_sync_pull.sql` implements it (WP4.8).
   *
   *   * membership is checked EXPLICITLY, before any page: RLS would answer a removed member
   *     with empty pages for ever, and a client that treats a `full` page as "absence means
   *     removal" would quietly erase the household's mirror. `CC403` is the difference between
   *     "you were removed" and "nothing changed" (D37);
   *   * the strategy is a property of the schema, not of the request — a table asked for with
   *     the wrong one gets `CC422`, never a page that looks empty;
   *   * a pull has NO partial-success contract. `PullResponse` has no per-table error field, so
   *     one unserviceable table fails the WHOLE call rather than returning a page a client would
   *     mistake for "nothing changed" and then commit a cursor over;
   *   * the limit is CLAMPED, never rejected, so an older or a newer client is always answered;
   *   * an activity carries its one detail row embedded, and a row the caller may not see brings
   *     nothing with it — `activities_read` hides another caregiver's private entry
   *     (`0002_rls.sql:117-120`), and the detail policies resolve through the parent.
   */
  async pull(userId: string, req: PullRequest): Promise<PullResponse> {
    await this.wire();
    if (this.roleOf(req.household_id, userId) === null) {
      throw this.serverFailure(SQLSTATE.CC403, 'forbidden');
    }
    const tables: Record<string, PullTablePage> = {};
    try {
      for (const t of req.tables) {
        tables[t.name] = this.page(req.household_id, userId, t);
      }
    } catch (err) {
      if (err instanceof ServerError) throw this.serverFailure(err.state, err.message);
      throw err;
    }
    return { tables, server_time: this.iso() };
  }

  /**
   * Listen for a household's nudges: `onChange` is called once for every push that applies at
   * least one of its ops, whoever sent it (the sender hears its own, as on a real project). The
   * function it returns stops listening, and is safe to call twice.
   */
  subscribe(householdId: string, onChange: () => void): () => void {
    const listener = { householdId, onChange };
    this.listeners.push(listener);
    return () => {
      const at = this.listeners.indexOf(listener);
      if (at >= 0) this.listeners.splice(at, 1);
    };
  }

  /* ---------------------------------------------------------------- internals */

  /** One nudge per household with an applied op in this push (`subscribe`). */
  private nudge(ops: readonly PushOp[], results: readonly PushResult[]): void {
    const households = new Set<string>();
    results.forEach((r, i) => {
      const op = ops[i];
      if (r.status === 'applied' && op !== undefined) households.add(op.household_id);
    });
    for (const householdId of households) {
      for (const listener of [...this.listeners]) {
        if (listener.householdId !== householdId) continue;
        try {
          listener.onChange();
        } catch {
          // a listener's failure is its own, never the push's
        }
      }
    }
  }

  iso(at?: number): string {
    return new Date(at ?? this.nowMs()).toISOString();
  }

  rowsOf(table: string): Row[] {
    if (table === 'activities') return this.activities;
    if (table === 'running_timers') return this.running_timers;
    if (table === 'milk_containers') return this.milk_containers;
    if (table === 'milk_inventory_transactions') return this.milk_inventory_transactions;
    if (table === 'children') return this.children;
    if (table === 'storage_locations') return this.storage_locations;
    if (table === 'shopping_items') return this.shopping_items;
    if (table === 'household_tasks') return this.household_tasks;
    if (table === 'supply_items') return this.supply_items;
    if (table === 'profiles') return this.profiles;
    if (table === 'households') return this.households;
    if (table === 'module_settings') return this.module_settings;
    if (table === 'household_settings') return this.household_settings;
    if (table === 'household_duty') return this.household_duty;
    if (table === 'subscription_entitlements') return this.subscription_entitlements;
    if (table === 'favorites') return this.favorites;
    if (table === 'notification_preferences') return this.notification_preferences;
    if (table === 'privacy_preferences') return this.privacy_preferences;
    if (table === 'app_messages') return this.app_messages;
    if (table === 'app_message_dismissals') return this.app_message_dismissals;
    if (table === 'milk_guidance_profiles') return this.milk_guidance_profiles;
    if (table === 'schedule_phases') return this.schedule_phases;
    if (table === 'schedule_rules') return this.schedule_rules;
    if (table === 'schedule_instances') return this.schedule_instances;
    if (table === 'care_items') return this.care_items;
    if (table === 'reminders') return this.reminders;
    if (table === 'vaccine_guidance_profiles') return this.vaccine_guidance_profiles;
    if (table === 'vaccine_tracking_settings') return this.vaccine_tracking_settings;
    if (table === 'vaccine_records') return this.vaccine_records;
    if (table === 'sync_retired_timers') return this.sync_retired_timers;
    if (table === 'nibble_records') return this.nibble_records;
    if (table === 'nibble_applied_ops') return this.nibble_applied_ops;
    // `household_members` is the one table whose rows are typed: every authorisation answer in
    // this file reads it, so it is an array of `MockMembership` and the pull sees it as rows.
    if (table === 'household_members') return this.members as unknown as Row[];
    const detail = DETAIL_TABLES.find(d => d === table);
    if (detail !== undefined) return this.details[detail];
    throw new ServerError(SQLSTATE.CC422, `no such table: ${table}`);
  }

  detailRow(activityId: string, table: DetailTable): Row | null {
    return this.details[table].find(r => r['activity_id'] === activityId) ?? null;
  }

  private async wire(): Promise<void> {
    if (!this.online) throw new SyncFailure('offline', 'the phone has no connection');
    if (this.delayMs > 0) await new Promise(resolve => setTimeout(resolve, this.delayMs));
  }

  private serverFailure(state: string, message: string): SyncFailure {
    return new SyncFailure('server', message, pushErrorCode(state, message));
  }

  /**
   * `app.role_in`, with 0101's clause: a seat whose `expires_at` has passed has no role at all, so
   * it is refused everything — a pull with `CC403`, every write with FORBIDDEN — from that moment.
   * And, in a dev build, a membership the account backend no longer has (`isMember`).
   */
  private roleOf(householdId: string, userId: string): MockMembership['role'] | null {
    const m = this.members.find(
      x => x.household_id === householdId && x.user_id === userId && x.removed_at === null,
    );
    if (m === undefined) return null;
    // the clock is read only for a seat that has an end: a suite that ticks its clock on every
    // read must not see a permanent member's op stamped a millisecond later than it did before
    if (m.expires_at != null && Date.parse(m.expires_at) <= this.nowMs()) return null;
    if (this.isMember !== undefined && !this.isMember(householdId, userId)) return null;
    return m.role;
  }

  /** `app.can_write`: OWNER, PARENT or CAREGIVER. A non-member is `null` server-side and the
   *  callers `coalesce(..., false)` it; here that is simply `false`. */
  private canWrite(householdId: string, userId: string): boolean {
    const role = this.roleOf(householdId, userId);
    return role === 'OWNER' || role === 'PARENT' || role === 'CAREGIVER';
  }

  /** `app.can_admin`: OWNER or PARENT. */
  private canAdmin(householdId: string, userId: string): boolean {
    const role = this.roleOf(householdId, userId);
    return role === 'OWNER' || role === 'PARENT';
  }

  /* ---------------------------------------------------------------- one op */

  private applyOne(userId: string, op: PushOp): PushResult {
    const injected = this.rejectNext;
    if (injected !== null) {
      this.rejectNext = null;
      return {
        client_op_id: op.client_op_id,
        status: 'rejected',
        error: { code: injected.code, message: injected.message },
      };
    }

    if (
      !UUID.test(String(op.entity_id)) ||
      !UUID.test(String(op.household_id)) ||
      typeof op.entity !== 'string' ||
      !['CREATE', 'UPDATE', 'DELETE'].includes(String(op.op))
    ) {
      return rejected(op, 'VALIDATION', 'validation_error');
    }

    try {
      if (!this.canWrite(op.household_id, userId)) {
        return rejected(op, 'FORBIDDEN', 'forbidden');
      }
      const clock = clampEditClock(
        typeof op.payload['client_edited_at'] === 'string'
          ? op.payload['client_edited_at']
          : this.iso(),
        this.nowMs(),
      );
      if (!clock.ok) throw new ServerError(SQLSTATE.CC422, clock.message);

      if (op.entity === 'activity') return this.applyActivity(userId, op, clock.at);
      if (op.entity === 'timer') return this.applyTimer(userId, op);
      if (op.entity === 'container') return this.applyContainer(userId, op, clock.at);
      if (op.entity === 'milk_txn') return this.applyLedger(userId, op);
      if (op.entity === 'care_item') return this.applyCareItem(userId, op);
      if (op.entity === 'location') return this.applyLocation(userId, op);
      if (op.entity === 'shopping_item' || op.entity === 'task') {
        return this.applyList(userId, op, op.entity);
      }
      if (op.entity === 'supply_item') return this.applySupply(userId, op);
      if (op.entity === 'schedule_phase') return this.applyPhase(userId, op);
      if (op.entity === 'schedule_rule') return this.applyRule(userId, op);
      if (op.entity === 'schedule_instance') return this.applyInstance(userId, op);
      if (op.entity === 'settings') return this.applySettings(userId, op);
      if (op.entity === 'vaccine_record') return this.applyVaccineRecord(userId, op, clock.at);
      if (op.entity === 'message_dismissal') return this.applyDismissal(userId, op, clock.at);
      if (op.entity === 'nibble_record') return this.applyNibbleRecord(userId, op, clock.at);
      // D29: a client from a later release talking to this one. Terminal, and named.
      throw new ServerError(SQLSTATE.CC422, 'entity not yet supported by this server version');
    } catch (err) {
      if (err instanceof SyncFailure) throw err;
      const state = err instanceof ServerError ? err.state : '';
      const message = err instanceof Error ? err.message : String(err);
      const code = pushErrorCode(state, message);
      const conflict = this.overdrawConflict(op, state, message);
      return {
        client_op_id: op.client_op_id,
        status: 'rejected',
        error: { code, message },
        ...(conflict !== null ? { conflict } : {}),
      };
    }
  }

  /**
   * A parent's answer to one in-app card (docs/IN_APP_MESSAGES.md §3), as the server takes it:
   * CREATE only, the caller's own row, and the FIRST answer wins on a replay.
   */
  private applyDismissal(userId: string, op: PushOp, at: string): PushResult {
    if (op.op !== 'CREATE') {
      throw new ServerError(SQLSTATE.CC422, 'a dismissal is only ever created');
    }
    const action = str(op.payload['action']);
    if (action === null) throw new ServerError(SQLSTATE.CC422, 'a dismissal names its action');
    if (!this.app_messages.some(m => m['id'] === op.entity_id)) {
      return rejected(op, 'CONFLICT', 'message not found');
    }
    const already = this.app_message_dismissals.some(
      d => d['message_id'] === op.entity_id && d['user_id'] === userId,
    );
    if (!already) {
      this.app_message_dismissals.push({
        message_id: op.entity_id,
        user_id: userId,
        action,
        at,
      });
    }
    return applied(op, 'applied', op.entity_id, at);
  }

  /** The one rejection that carries a payload: what is really left in the container, so the
   *  device can rewrite the draw rather than retry a deduction that can never succeed. */
  private overdrawConflict(op: PushOp, state: string, message: string): PushConflict | null {
    if (op.entity !== 'milk_txn') return null;
    if (state !== SQLSTATE.RAISE_EXCEPTION || !message.includes('would go negative')) return null;
    const containerId = String(op.payload['container_id']);
    const container = this.milk_containers.find(c => c['id'] === containerId);
    return {
      kind: 'ledger_overdraw',
      container_id: containerId,
      available_ml: Math.max(0, int(container?.['amount_ml'], 0)),
    };
  }

  /* ---------------------------------------------------------------- activity */

  private applyActivity(userId: string, op: PushOp, editedAt: string): PushResult {
    const p = op.payload;
    if (op.op === 'CREATE') {
      const type = String(p['type']);
      if (!ACTIVITY_TYPES.includes(type)) {
        throw new ServerError(
          SQLSTATE.INVALID_TEXT_REPRESENTATION,
          `invalid activity type: ${type}`,
        );
      }
      const startAt = str(p['start_at']);
      if (startAt === null || Number.isNaN(ms(startAt))) {
        throw new ServerError(SQLSTATE.INVALID_DATETIME_FORMAT, 'start_at is not a timestamp');
      }
      const endAt = str(p['end_at']);
      if (endAt !== null && ms(endAt) < ms(startAt)) {
        throw new ServerError(
          SQLSTATE.CHECK_VIOLATION,
          'new row violates check constraint "activity_time_sane"',
        );
      }

      const metadata = asObject(p['metadata']);
      const named = str(metadata['timer_id']) ?? str(p['timer_id']);
      // 0120: an entry naming a timer a merge retired is the SURVIVOR's stop — and while the
      // survivor still runs, it started when the survivor did (D19: the earlier start wins)
      const timerId = named === null ? null : this.survivorOf(op.household_id, named);
      if (timerId !== null) metadata['timer_id'] = timerId;
      const running =
        timerId === null || timerId === named
          ? undefined
          : this.running_timers.find(
              t => t['id'] === timerId && t['household_id'] === op.household_id,
            );
      const start =
        running !== undefined && ms(String(running['started_at'])) < ms(startAt)
          ? String(running['started_at'])
          : startAt;
      const clocks: FieldClocks = {};
      for (const field of ACTIVITY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(p, field)) clocks[field] = editedAt;
      }
      metadata['field_clocks'] = clocks;

      const byId = this.activities.find(a => a['id'] === op.entity_id);
      const byOp = this.activities.find(
        a => a['household_id'] === op.household_id && a['client_op_id'] === op.client_op_id,
      );
      const byTimer =
        timerId === null
          ? undefined
          : this.activities.find(
              a =>
                a['household_id'] === op.household_id &&
                asObject(a['metadata'])['timer_id'] === timerId,
            );

      if (byId !== undefined || byOp !== undefined || byTimer !== undefined) {
        // A replay of this very operation: the same key, the same row. The detail is re-upserted
        // because the only state a replay can find is a half-applied one, and an activity with
        // no detail row is a bottle with no amount (0009:320-330).
        if (byOp !== undefined) {
          this.applyDetail(userId, String(byOp['id']), op.household_id, p['detail']);
          return applied(op, 'duplicate', String(byOp['id']), String(byOp['updated_at']));
        }
        if (byTimer !== undefined) {
          // The second device stopping the SAME timer: one real stop. The longer of the two end
          // times wins; the detail row belongs to the activity that already exists and is left
          // alone (docs/OFFLINE_SYNC.md §5.1.4, D26).
          const current = str(byTimer['end_at']);
          if (endAt !== null && (current === null || ms(current) < ms(endAt))) {
            byTimer['end_at'] = endAt;
            const meta = asObject(byTimer['metadata']);
            const fc = asObject(meta['field_clocks']);
            fc['end_at'] = editedAt;
            meta['field_clocks'] = fc;
            byTimer['metadata'] = meta;
            byTimer['updated_by'] = userId;
            byTimer['updated_at'] = this.iso();
          }
          return applied(op, 'duplicate', String(byTimer['id']), String(byTimer['updated_at']));
        }
        return rejected(op, 'CONFLICT', 'an activity with this id already exists');
      }

      const at = this.iso();
      const row: Row = {
        id: op.entity_id,
        client_op_id: op.client_op_id,
        household_id: op.household_id,
        child_id: str(p['child_id']),
        type,
        start_at: start,
        end_at: endAt,
        quantity: num(p['quantity']),
        canonical_unit: str(p['canonical_unit']),
        notes: str(p['notes']),
        is_private: p['is_private'] === true,
        metadata,
        created_by: userId,
        updated_by: null,
        device_id: str(p['device_id']),
        created_at: at,
        updated_at: at,
        deleted_at: null,
      };
      this.activities.push(row);
      this.applyDetail(userId, op.entity_id, op.household_id, p['detail']);
      return applied(op, 'applied', op.entity_id, String(row['updated_at']));
    }

    const row = this.activities.find(
      a => a['id'] === op.entity_id && a['household_id'] === op.household_id,
    );

    if (op.op === 'UPDATE') {
      if (row === undefined) return rejected(op, 'CONFLICT', 'activity not found');
      // activities_update (0002_rls.sql:126-130): parents and owners may correct anything, a
      // caregiver only their own entries. The policy FILTERS rather than raising, so a refusal
      // is zero rows — which is why D28 makes it an explicit FORBIDDEN rather than silence.
      if (!this.canAdmin(op.household_id, userId) && row['created_by'] !== userId) {
        return rejected(op, 'FORBIDDEN', 'forbidden');
      }
      const meta = asObject(row['metadata']);
      const patch: Row = {};
      for (const field of ACTIVITY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(p, field)) patch[field] = p[field];
      }
      const merged = mergeFields({
        current: Object.fromEntries(ACTIVITY_FIELDS.map(f => [f, row[f]])),
        patch,
        clocks: asObject(meta['field_clocks']) as FieldClocks,
        history: Array.isArray(meta['history']) ? (meta['history'] as HistoryEntry[]) : [],
        clientEditedAt: editedAt,
        by: userId,
      });
      for (const [k, v] of Object.entries(merged.applied)) row[k] = v;
      // 0012: `restore: true` lifts the tombstone — the one way deleted_at goes backwards
      if (p['restore'] === true) row['deleted_at'] = null;
      row['metadata'] = {
        ...meta,
        ...asObject(p['metadata']),
        field_clocks: merged.clocks,
        history: merged.history,
      };
      row['updated_by'] = userId;
      row['updated_at'] = this.iso();
      this.applyDetail(userId, op.entity_id, op.household_id, p['detail']);
      return applied(op, 'applied', op.entity_id, String(row['updated_at']));
    }

    // DELETE is a soft delete, idempotent by construction. `revoke delete on activities`.
    if (row === undefined) return rejected(op, 'CONFLICT', 'activity not found');
    if (!this.canAdmin(op.household_id, userId) && row['created_by'] !== userId) {
      return rejected(op, 'FORBIDDEN', 'forbidden');
    }
    row['deleted_at'] = str(row['deleted_at']) ?? this.iso();
    row['updated_by'] = userId;
    row['updated_at'] = this.iso();
    return applied(op, 'applied', op.entity_id, String(row['updated_at']));
  }

  /**
   * The embedded detail row (D5, D6). The gate is explicit because `<t>_write` in
   * `0002_rls.sql:146-151` is `can_admin or created_by = auth.uid()` with NO `can_write` test:
   * a member demoted to VIEW_ONLY would otherwise have their activity UPDATE refused and their
   * detail upsert succeed — half an edit under a role that may not write at all.
   */
  private applyDetail(userId: string, activityId: string, householdId: string, detail: unknown) {
    if (detail === undefined || detail === null) return;
    const d = asObject(detail);
    const table = DETAIL_TABLES.find(t => t === d['table']);
    if (table === undefined) {
      throw new ServerError(SQLSTATE.CC422, `unknown detail table: ${String(d['table'])}`);
    }
    const activity = this.activities.find(
      a => a['id'] === activityId && a['household_id'] === householdId,
    );
    if (activity === undefined) throw new ServerError(SQLSTATE.CC404, 'activity not found');
    const owner = activity['created_by'];
    if (!(
      this.canAdmin(householdId, userId) ||
      (this.canWrite(householdId, userId) && owner === userId)
    )) {
      throw new ServerError(SQLSTATE.CC403, 'forbidden');
    }
    const fields = { ...d };
    delete fields['table'];
    // 0160's `wellbeing_details_seen_ok`: the chips the app knows, each at most once
    if (table === 'wellbeing_details' && 'seen' in fields) {
      const seen = fields['seen'];
      const known = WellbeingSeen.options as readonly unknown[];
      if (
        !Array.isArray(seen) ||
        seen.some(s => !known.includes(s)) ||
        new Set(seen).size !== seen.length
      ) {
        throw new ServerError(
          SQLSTATE.CHECK_VIOLATION,
          'new row for relation "wellbeing_details" violates check constraint "wellbeing_details_seen_ok"',
        );
      }
    }
    const existing = this.details[table].find(r => r['activity_id'] === activityId);
    if (existing !== undefined) {
      Object.assign(existing, fields);
      return;
    }
    this.details[table].push({ activity_id: activityId, ...fields });
  }

  /* ---------------------------------------------------------------- timer */

  private applyTimer(userId: string, op: PushOp): PushResult {
    const p = op.payload;
    const key = (row: Row) =>
      `${String(row['type'])}:${str(row['child_id']) ?? '00000000-0000-0000-0000-000000000000'}`;

    if (op.op === 'CREATE') {
      const type = String(p['type']);
      if (!TIMER_TYPES.includes(type)) {
        throw new ServerError(SQLSTATE.INVALID_TEXT_REPRESENTATION, `invalid timer type: ${type}`);
      }
      const incoming: Row = {
        id: op.entity_id,
        household_id: op.household_id,
        child_id: str(p['child_id']),
        type,
        started_at: String(p['started_at']),
        paused_ms: int(p['paused_ms'], 0),
        active_side: str(p['active_side']),
        side_started_at: str(p['side_started_at']),
        left_seconds: int(p['left_seconds'], 0),
        right_seconds: int(p['right_seconds'], 0),
        started_by: userId,
        meta: asObject(p['meta']),
        created_at: this.iso(),
        updated_at: this.iso(),
      };

      const byId = this.running_timers.find(
        t => t['id'] === op.entity_id && t['household_id'] === op.household_id,
      );
      if (byId !== undefined)
        return applied(op, 'duplicate', String(byId['id']), String(byId['updated_at']));

      const survivor = this.running_timers.find(
        t => t['household_id'] === op.household_id && key(t) === key(incoming),
      );
      // 0120 (1): a timer whose entry is already here was stopped before this start arrived, so
      // it is over. If it was a second copy of a stretch another phone is still timing, its stop
      // ends that stretch: the entry becomes the survivor's, from the survivor's start. Otherwise
      // there is nothing to start.
      const own = this.timerEntry(op.household_id, op.entity_id);
      if (own !== undefined) {
        const ownEnd = str(own['end_at']);
        if (
          survivor !== undefined &&
          this.timerEntry(op.household_id, String(survivor['id'])) === undefined &&
          ownEnd !== null &&
          ms(ownEnd) > ms(String(survivor['started_at']))
        ) {
          const started = String(survivor['started_at']);
          if (ms(started) < ms(String(own['start_at']))) own['start_at'] = started;
          own['metadata'] = { ...asObject(own['metadata']), timer_id: String(survivor['id']) };
          own['updated_by'] = userId;
          own['updated_at'] = this.iso();
          this.running_timers.splice(this.running_timers.indexOf(survivor), 1);
          this.retireTimer(op.household_id, op.entity_id, String(survivor['id']));
          return {
            client_op_id: op.client_op_id,
            status: 'duplicate',
            entity_id: String(survivor['id']),
          };
        }
        return { client_op_id: op.client_op_id, status: 'duplicate', entity_id: op.entity_id };
      }
      if (survivor === undefined) {
        this.running_timers.push(incoming);
        return applied(op, 'applied', op.entity_id, String(incoming['updated_at']));
      }
      // 0120 (2): a survivor whose entry is already here was stopped; only its stop is still on
      // the way (`selectBatch` sends a stop in the batch after its start). It is not a stretch to
      // merge into — merging a new stretch into it lost the new one when that stop landed — so
      // it gives way to the timer that is really running.
      if (this.timerEntry(op.household_id, String(survivor['id'])) !== undefined) {
        this.running_timers.splice(this.running_timers.indexOf(survivor), 1);
        this.running_timers.push(incoming);
        return applied(op, 'applied', op.entity_id, String(incoming['updated_at']));
      }

      // running_timers_uniq: another device already has this timer running. It is not rejected —
      // a parent's real start time is the truth (§5.1) — so the two rows merge through the SAME
      // `mergeTimers` the server mirrors, and the surviving row's id comes back to be adopted.
      const winner = mergeTimers(timerState(survivor), timerState(incoming));
      survivor['started_at'] = winner.started_at;
      survivor['started_by'] = winner.started_by;
      survivor['active_side'] = winner.active_side;
      survivor['side_started_at'] = winner.side_started_at;
      survivor['paused_ms'] = winner.paused_ms;
      survivor['left_seconds'] = winner.left_seconds;
      survivor['right_seconds'] = winner.right_seconds;
      survivor['updated_at'] = this.iso();
      // 0120 (3): the incoming id is retired into the survivor, for an entry or a stop to come
      this.retireTimer(op.household_id, op.entity_id, String(survivor['id']));
      return {
        client_op_id: op.client_op_id,
        status: 'applied',
        entity_id: String(survivor['id']),
        server_updated_at: String(survivor['updated_at']),
        conflict: {
          kind: 'timer_merged',
          timer_id: String(survivor['id']),
          started_at: String(survivor['started_at']),
          started_by: String(survivor['started_by']),
        },
      };
    }

    const index = this.running_timers.findIndex(
      t => t['id'] === op.entity_id && t['household_id'] === op.household_id,
    );
    const row = index === -1 ? undefined : this.running_timers[index];

    if (op.op === 'UPDATE') {
      // A pause that raced the other parent's stop: the timer is gone and the patch is moot.
      // Parking it as FAILED would show a parent an error for something that already happened
      // the way they wanted, so it is reported as settled (D28).
      if (row === undefined)
        return { client_op_id: op.client_op_id, status: 'duplicate', entity_id: op.entity_id };
      for (const field of [
        'paused_ms',
        'active_side',
        'side_started_at',
        'left_seconds',
        'right_seconds',
        'started_at',
      ]) {
        if (Object.prototype.hasOwnProperty.call(p, field)) row[field] = p[field];
      }
      row['updated_at'] = this.iso();
      return applied(op, 'applied', op.entity_id, String(row['updated_at']));
    }

    // DELETE: a real delete — running_timers has no deleted_at and a stop is physical. Zero rows
    // is the NORMAL second-stop case, so it is a success (D28's exception). 0120: a stop naming a
    // timer a merge retired stops the survivor it went into.
    const target =
      index !== -1
        ? index
        : this.running_timers.findIndex(
            t =>
              t['id'] === this.survivorOf(op.household_id, op.entity_id) &&
              t['household_id'] === op.household_id,
          );
    if (target === -1)
      return { client_op_id: op.client_op_id, status: 'duplicate', entity_id: op.entity_id };
    this.running_timers.splice(target, 1);
    return { client_op_id: op.client_op_id, status: 'applied', entity_id: op.entity_id };
  }

  /** The entry a timer's stop wrote, if it is here: the activity carrying its `timer_id`. */
  private timerEntry(householdId: string, timerId: string): Row | undefined {
    return this.activities.find(
      a => a['household_id'] === householdId && asObject(a['metadata'])['timer_id'] === timerId,
    );
  }

  /** 0120: remember that `retired` now stands for `survivor`; the first record stands. */
  private retireTimer(householdId: string, retired: string, survivor: string): void {
    if (this.sync_retired_timers.some(r => r['retired_id'] === retired)) return;
    this.sync_retired_timers.push({
      retired_id: retired,
      household_id: householdId,
      survivor_id: survivor,
      retired_at: this.iso(),
    });
  }

  /** The timer `id` stands for: itself, or the survivor a merge retired it into (0120). */
  private survivorOf(householdId: string, id: string): string {
    const retired = this.sync_retired_timers.find(
      r => r['retired_id'] === id && r['household_id'] === householdId,
    );
    return retired === undefined ? id : String(retired['survivor_id']);
  }

  /* ---------------------------------------------------------------- care_item */

  /**
   * The mirror of 0011's care_item branch (docs/CARE_ITEMS.md §3): the item is upserted and
   * its reminders are REBUILT from the payload's list — every rule of the item not in the list
   * is soft-deleted, every listed time is a FIXED daily 'med' rule with the client's id.
   * Archiving removes them all. The phase the rules hang from is created when it is named and
   * absent, exactly as the server does for a household that has no schedule yet.
   */
  private applyCareItem(userId: string, op: PushOp): PushResult {
    const p = op.payload;
    if (op.op === 'DELETE') {
      throw new ServerError(
        SQLSTATE.CC422,
        'a care item is archived, never deleted: its entries stay',
      );
    }
    const at = this.iso();
    const name = typeof p['name'] === 'string' ? p['name'].trim() : '';
    const archivedAt = str(p['archived_at']);
    if (
      name !== '' &&
      archivedAt === null &&
      this.care_items.some(
        c =>
          c['household_id'] === op.household_id &&
          c['id'] !== op.entity_id &&
          c['archived_at'] === null &&
          String(c['name']).trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      return rejected(op, 'VALIDATION', 'an item with this name is already on the list');
    }
    const phaseId = str(p['phase_id']);
    if (phaseId !== null && !this.schedule_phases.some(ph => ph['id'] === phaseId)) {
      this.schedule_phases.push({
        id: phaseId,
        household_id: op.household_id,
        child_id: null,
        name: 'Routine',
        effective_from: at.slice(0, 10),
        effective_to: null,
        is_current: !this.schedule_phases.some(
          ph =>
            ph['household_id'] === op.household_id &&
            ph['deleted_at'] == null &&
            ph['is_current'] === true,
        ),
        created_at: at,
        updated_at: at,
        deleted_at: null,
      });
    }

    let row = this.care_items.find(
      c => c['id'] === op.entity_id && c['household_id'] === op.household_id,
    );
    let duplicate = false;
    if (op.op === 'CREATE') {
      if (row === undefined) {
        if (name === '') throw new ServerError(SQLSTATE.CC422, 'a care item needs a name');
        if (this.care_items.some(c => c['id'] === op.entity_id)) {
          return rejected(op, 'CONFLICT', 'a care item with this id exists elsewhere');
        }
        row = {
          id: op.entity_id,
          household_id: op.household_id,
          name,
          kind: str(p['kind']) ?? 'OTHER',
          usual_amount: str(p['usual_amount']),
          route: str(p['route']) ?? 'OTHER',
          note: str(p['note']),
          archived_at: archivedAt,
          created_by: userId,
          created_at: at,
          updated_at: at,
          updated_by: userId,
        };
        this.care_items.push(row);
      } else {
        duplicate = true;
      }
    } else {
      if (row === undefined) return rejected(op, 'CONFLICT', 'care item not found');
      if (name !== '') row['name'] = name;
      if (str(p['kind']) !== null) row['kind'] = str(p['kind']);
      if (str(p['route']) !== null) row['route'] = str(p['route']);
      if (Object.prototype.hasOwnProperty.call(p, 'usual_amount'))
        row['usual_amount'] = str(p['usual_amount']);
      if (Object.prototype.hasOwnProperty.call(p, 'note')) row['note'] = str(p['note']);
      if (Object.prototype.hasOwnProperty.call(p, 'archived_at')) row['archived_at'] = archivedAt;
      row['updated_by'] = userId;
      row['updated_at'] = at;
    }

    const nowArchived = str(row['archived_at']);
    if (nowArchived !== null || Object.prototype.hasOwnProperty.call(p, 'reminders')) {
      const list = (Array.isArray(p['reminders']) ? p['reminders'] : []) as Row[];
      const keep = new Set(list.map(r => String(r['id'])));
      for (const rule of this.schedule_rules) {
        if (
          rule['care_item_id'] === op.entity_id &&
          rule['deleted_at'] == null &&
          (nowArchived !== null || !keep.has(String(rule['id'])))
        ) {
          rule['deleted_at'] = at;
          rule['is_active'] = false;
          rule['updated_at'] = at;
        }
      }
      if (nowArchived === null && phaseId !== null) {
        for (const r of list) {
          const existing = this.schedule_rules.find(x => x['id'] === String(r['id']));
          if (existing !== undefined) {
            existing['at_local_time'] = String(r['at_local_time']);
            existing['phase_id'] = phaseId;
            existing['child_id'] = str(r['child_id']);
            existing['name'] = row['name'];
            existing['deleted_at'] = null;
            existing['is_active'] = true;
            existing['updated_at'] = at;
            continue;
          }
          this.schedule_rules.push({
            id: String(r['id']),
            household_id: op.household_id,
            phase_id: phaseId,
            child_id: str(r['child_id']),
            activity: 'med',
            care_item_id: op.entity_id,
            effective_from: at,
            rule_type: 'FIXED',
            at_local_time: String(r['at_local_time']),
            every_minutes: null,
            relative_to: null,
            offset_minutes: null,
            every_days: null,
            target_quantity: null,
            repeat: 'DAILY',
            repeat_days: null,
            reminder_enabled: true,
            remind_user_ids: [userId],
            match_window_minutes: 25,
            match_scope: 'MINUTES',
            miss_after_minutes: 60,
            late_window_minutes: 90,
            night_mode: 'NONE',
            night_from: null,
            night_to: null,
            night_every_minutes: null,
            night_at: null,
            target_per_day: null,
            name: row['name'],
            is_active: true,
            created_at: at,
            updated_at: at,
            deleted_at: null,
          });
        }
      }
    }
    return applied(
      op,
      duplicate ? 'duplicate' : 'applied',
      op.entity_id,
      String(row['updated_at']),
    );
  }

  /* ---------------------------------------------------------------- storage location */

  /** The exact refusal SCHEDULE_AND_LOCATIONS.md §3.5 names; 0013's trigger raises the same. */
  static heldRefusal(held: number): string {
    return held === 1
      ? 'This location still holds 1 container. Move it somewhere else first.'
      : `This location still holds ${held} containers. Move them somewhere else first.`;
  }

  private held(locationId: string): number {
    return this.milk_containers.filter(
      c =>
        c['location_id'] === locationId && (c['status'] === 'STORED' || c['status'] === 'THAWING'),
    ).length;
  }

  /**
   * `sync_apply_op`'s location branch (0013; docs/SCHEDULE_AND_LOCATIONS.md §3–§4): a
   * parent-or-owner write, a retirement through `deleted_at` never a DELETE, and the three
   * guards the server holds as a partial unique index and a trigger — one THAWED location, a
   * non-empty location cannot be retired, a household keeps one plain location.
   */
  /* ---------------------------------------------------------------- the two lists */

  /**
   * A shopping line or a chore (0016). ONE BRANCH FOR BOTH, because they are one shape: a
   * household-scoped row, created whole, patched by the columns an UPDATE names, and retired
   * with `deleted_at` rather than a physical delete — an undo has to be able to bring it back.
   *
   * ANY MEMBER MAY WRITE, caregivers included: a list nobody but the owner can add to is a
   * list the other parent cannot use at the shop, which is the entire point of it. Nothing
   * about a baby is recorded here, so the admin boundary the medical entities carry would buy
   * nothing (0016's policies say the same in SQL).
   */
  private applyList(userId: string, op: PushOp, entity: 'shopping_item' | 'task'): PushResult {
    const p = op.payload;
    const table = entity === 'shopping_item' ? 'shopping_items' : 'household_tasks';
    const rows = this.rowsOf(table);
    const titleOf = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    if (op.op === 'DELETE') {
      throw new ServerError(
        SQLSTATE.CC422,
        'a list line is removed with deleted_at, never deleted: an undo has to restore it',
      );
    }
    if (op.op === 'CREATE') {
      const existing = rows.find(r => r['id'] === op.entity_id);
      if (existing !== undefined) {
        if (existing['household_id'] !== op.household_id) {
          return rejected(op, 'CONFLICT', 'a line with this id exists elsewhere');
        }
        return applied(op, 'duplicate', op.entity_id, this.iso());
      }
      const title = titleOf(p['title']);
      if (title === '') throw new ServerError(SQLSTATE.CC422, 'a line needs a name');
      const at = this.iso();
      const base: Row = {
        id: op.entity_id,
        household_id: op.household_id,
        title,
        created_by: userId,
        created_at: at,
        updated_at: at,
        deleted_at: null,
      };
      rows.push(
        entity === 'shopping_item'
          ? {
              ...base,
              qty: Math.min(99, Math.max(1, int(p['qty'], 1))),
              note: str(p['note']),
              store: str(p['store']),
              supply_id: str(p['supply_id']),
              checked_at: null,
              checked_by: null,
            }
          : {
              ...base,
              at_local_time: str(p['at_local_time']),
              repeat: str(p['repeat']) ?? 'DAILY',
              assigned_to: str(p['assigned_to']),
              last_done_on: null,
              last_done_by: null,
              last_done_at: null,
            },
      );
      return applied(op, 'applied', op.entity_id, at);
    }
    const row = rows.find(r => r['id'] === op.entity_id && r['household_id'] === op.household_id);
    if (row === undefined) return rejected(op, 'CONFLICT', 'no such line');
    const at = this.iso();
    // only the columns the op names, and the two that travel with a tick
    for (const key of [
      'title',
      'qty',
      'note',
      'store',
      'supply_id',
      'checked_at',
      'at_local_time',
      'repeat',
      'assigned_to',
      'last_done_on',
      'deleted_at',
    ]) {
      if (!(key in p)) continue;
      if (key === 'title') {
        const title = titleOf(p[key]);
        if (title === '') throw new ServerError(SQLSTATE.CC422, 'a line needs a name');
        row[key] = title;
        continue;
      }
      if (key === 'qty') {
        row[key] = Math.min(99, Math.max(1, int(p[key], 1)));
        continue;
      }
      row[key] = p[key] ?? null;
    }
    // who ticked travels with when, on the server rather than from the client
    if ('checked_at' in p) row['checked_by'] = p['checked_at'] == null ? null : userId;
    if ('last_done_on' in p) {
      row['last_done_by'] = p['last_done_on'] == null ? null : userId;
      row['last_done_at'] = p['last_done_on'] == null ? null : at;
    }
    row['updated_at'] = at;
    return applied(op, 'applied', op.entity_id, at);
  }

  /* ---------------------------------------------------------------- NibbleCue's records */

  /**
   * `nibble_sync_push`, as docs/SERVER.md describes it and the CuddleCue migration implements it:
   * the profile, a custom food and a plan pin are a parent's (OWNER or PARENT: a caregiver feeds
   * and logs but never changes the allergen plan, spec §4); something noticed is anyone's who can
   * write. The child must be the household's. The later edit wins the whole row; a delete is a
   * tombstone a later edit does not undo unless it says `restore`; a retried op is `duplicate`.
   */
  private applyNibbleRecord(userId: string, op: PushOp, editedAt: string): PushResult {
    const p = op.payload;
    const seen = this.nibble_applied_ops.find(
      r => r['household_id'] === op.household_id && r['client_op_id'] === op.client_op_id,
    );
    if (seen !== undefined) return applied(op, 'duplicate', op.entity_id, this.iso());
    const named = str(p['kind']);
    if (op.op !== 'DELETE' || named !== null) {
      if (named === null || !['profile', 'custom_food', 'noticed', 'plan_mark'].includes(named)) {
        throw new ServerError(SQLSTATE.CC422, 'kind');
      }
    }
    // a member who may write at all (`app.can_write`): a view-only seat writes nothing
    if (!this.canWrite(op.household_id, userId)) return rejected(op, 'FORBIDDEN', 'forbidden');
    const at = this.iso();
    const rows = this.nibble_records;
    const existing = rows.find(r => r['id'] === op.entity_id);
    if (existing !== undefined && existing['household_id'] !== op.household_id) {
      return rejected(op, 'CONFLICT', 'a record with this id exists elsewhere');
    }
    // kind and child never change after the first write, so a role check cannot be dodged by
    // renaming a row; the STORED kind is what the role is checked against (0161)
    if (existing !== undefined) {
      if (named !== null && named !== existing['kind'])
        throw new ServerError(SQLSTATE.CC422, 'kind');
      if ('child_id' in p && str(p['child_id']) !== (existing['child_id'] ?? null)) {
        throw new ServerError(SQLSTATE.CC422, 'child_id');
      }
    }
    const kind = (existing?.['kind'] as string | undefined) ?? named ?? 'noticed';
    if (kind !== 'noticed' && !this.canAdmin(op.household_id, userId)) {
      return rejected(op, 'FORBIDDEN', 'forbidden');
    }
    const childId =
      existing !== undefined
        ? ((existing['child_id'] as string | null) ?? null)
        : str(p['child_id']);
    if (
      childId !== null &&
      !this.children.some(c => c['id'] === childId && c['household_id'] === op.household_id)
    ) {
      throw new ServerError(SQLSTATE.CC422, 'child_id');
    }
    const remember = (): void => {
      this.nibble_applied_ops.push({
        household_id: op.household_id,
        client_op_id: op.client_op_id,
        applied_at: at,
      });
    };
    if (op.op === 'DELETE') {
      if (existing === undefined) return rejected(op, 'CONFLICT', 'no such record');
      if (existing['deleted_at'] == null) existing['deleted_at'] = at;
      existing['updated_at'] = at;
      existing['updated_by'] = userId;
      remember();
      return applied(op, 'applied', op.entity_id, at);
    }
    const body = p['body'];
    if (op.op === 'CREATE' || body !== undefined) {
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new ServerError(SQLSTATE.CC422, 'body');
      }
      if (JSON.stringify(body).length > 16_384) throw new ServerError(SQLSTATE.CC422, 'body');
    }
    if (existing === undefined) {
      if (op.op === 'UPDATE' && body === undefined)
        return rejected(op, 'CONFLICT', 'no such record');
      rows.push({
        id: op.entity_id,
        household_id: op.household_id,
        child_id: childId,
        kind,
        body,
        client_edited_at: editedAt,
        created_by: userId,
        updated_by: userId,
        created_at: at,
        updated_at: at,
        deleted_at: null,
      });
      remember();
      return applied(op, 'applied', op.entity_id, at);
    }
    // an older edit than the row holds changes nothing, and is still answered applied: the
    // phone's outbox is done with it, and the newer edit is already what every phone will pull
    const restore = p['restore'] === true;
    const stale = editedMs(editedAt) < editedMs(existing['client_edited_at']);
    if (!stale) {
      if (body !== undefined) existing['body'] = body;
      existing['client_edited_at'] = editedAt;
    }
    if (restore) existing['deleted_at'] = null;
    existing['updated_at'] = at;
    existing['updated_by'] = userId;
    remember();
    return applied(op, 'applied', op.entity_id, at);
  }

  /* ---------------------------------------------------------------- the supply catalog */

  /**
   * A catalog item (0017). Same boundary as the list it feeds — `can_write`, so a caregiver
   * can correct the size on the diapers from the shop — and the same soft-delete rule, because
   * removing an item has to be undoable and a line already on the list still points at it.
   *
   * `last_bought_on` is an ordinary patched column here rather than a server-owned one: the
   * day belongs to the household's own zone, which only the device knows.
   */
  private applySupply(userId: string, op: PushOp): PushResult {
    const p = op.payload;
    const rows = this.supply_items;
    const named = (row: Row): void => {
      if (str(row['brand']) === null && str(row['product']) === null) {
        throw new ServerError(SQLSTATE.CC422, 'a supply needs a brand or a product name');
      }
    };
    if (op.op === 'DELETE') {
      throw new ServerError(
        SQLSTATE.CC422,
        'a supply is removed with deleted_at, never deleted: a line may still point at it',
      );
    }
    if (op.op === 'CREATE') {
      const existing = rows.find(r => r['id'] === op.entity_id);
      if (existing !== undefined) {
        if (existing['household_id'] !== op.household_id) {
          return rejected(op, 'CONFLICT', 'a supply with this id exists elsewhere');
        }
        return applied(op, 'duplicate', op.entity_id, this.iso());
      }
      const at = this.iso();
      const row: Row = {
        id: op.entity_id,
        household_id: op.household_id,
        category: str(p['category']) ?? 'OTHER',
        brand: str(p['brand']),
        product: str(p['product']),
        variant: str(p['variant']),
        pack: str(p['pack']),
        store: str(p['store']),
        notes: str(p['notes']),
        url: str(p['url']),
        last_bought_on: null,
        created_by: userId,
        created_at: at,
        updated_at: at,
        deleted_at: null,
      };
      named(row);
      rows.push(row);
      return applied(op, 'applied', op.entity_id, at);
    }
    const row = rows.find(r => r['id'] === op.entity_id && r['household_id'] === op.household_id);
    if (row === undefined) return rejected(op, 'CONFLICT', 'no such supply');
    const next: Row = { ...row };
    for (const key of [
      'category',
      'brand',
      'product',
      'variant',
      'pack',
      'store',
      'notes',
      'url',
      'last_bought_on',
      'deleted_at',
    ]) {
      if (key in p) next[key] = p[key] ?? null;
    }
    named(next);
    Object.assign(row, next, { updated_at: this.iso() });
    return applied(op, 'applied', op.entity_id, row['updated_at'] as string);
  }

  private applyLocation(userId: string, op: PushOp): PushResult {
    const p = op.payload;
    if (!this.canAdmin(op.household_id, userId)) return rejected(op, 'FORBIDDEN', 'forbidden');
    if (op.op === 'DELETE') {
      throw new ServerError(
        SQLSTATE.CC422,
        'a location is retired with deleted_at, never deleted: its ledger rows point at it',
      );
    }
    const name = typeof p['name'] === 'string' ? p['name'].trim() : '';
    const live = (l: Row) => l['household_id'] === op.household_id && l['deleted_at'] == null;
    const anotherThawed = (id: string) =>
      this.storage_locations.some(l => live(l) && l['kind'] === 'THAWED' && l['id'] !== id);
    if (op.op === 'CREATE') {
      const existing = this.storage_locations.find(l => l['id'] === op.entity_id);
      if (existing !== undefined) {
        if (existing['household_id'] !== op.household_id) {
          return rejected(op, 'CONFLICT', 'a location with this id exists elsewhere');
        }
        return applied(op, 'duplicate', op.entity_id, this.iso());
      }
      if (name === '') throw new ServerError(SQLSTATE.CC422, 'a location needs a name');
      // answered as VALIDATION, as 0013 does, rather than as the index's 23505 — a CONFLICT the
      // outbox would retry for ever
      if (p['kind'] === 'THAWED' && anotherThawed(op.entity_id)) {
        return rejected(op, 'VALIDATION', 'You already have a thawing location.');
      }
      this.storage_locations.push({
        id: op.entity_id,
        household_id: op.household_id,
        name,
        short_name: str(p['short_name']),
        kind: str(p['kind']) ?? 'FRIDGE',
        sort_order: int(p['sort_order'], 0),
        is_default: p['is_default'] === true,
        deleted_at: str(p['deleted_at']),
      });
      return applied(op, 'applied', op.entity_id, this.iso());
    }
    const row = this.storage_locations.find(
      l => l['id'] === op.entity_id && l['household_id'] === op.household_id,
    );
    if (row === undefined) return rejected(op, 'CONFLICT', 'location not found');
    const retiring =
      Object.prototype.hasOwnProperty.call(p, 'deleted_at') &&
      str(p['deleted_at']) !== null &&
      row['deleted_at'] == null;
    const nextKind = typeof p['kind'] === 'string' ? p['kind'] : String(row['kind']);
    // the guards, as the trigger and the index hold them
    if (retiring) {
      const held = this.held(op.entity_id);
      if (held > 0) throw new ServerError(SQLSTATE.CC422, MockSyncServer.heldRefusal(held));
      if (
        row['kind'] !== 'THAWED' &&
        !this.storage_locations.some(
          l => live(l) && l['id'] !== op.entity_id && l['kind'] !== 'THAWED',
        )
      ) {
        throw new ServerError(
          SQLSTATE.CC422,
          'A household keeps at least one storage location besides thawing.',
        );
      }
    }
    if (nextKind === 'THAWED' && row['kind'] !== 'THAWED' && anotherThawed(op.entity_id)) {
      return rejected(op, 'VALIDATION', 'You already have a thawing location.');
    }
    if (row['kind'] === 'THAWED' && nextKind !== 'THAWED' && this.held(op.entity_id) > 0) {
      throw new ServerError(
        SQLSTATE.CC422,
        'This thawing location still holds milk. Move the containers before changing its condition.',
      );
    }
    if (name !== '') row['name'] = name;
    for (const field of ['short_name', 'kind', 'sort_order', 'is_default', 'deleted_at']) {
      if (Object.prototype.hasOwnProperty.call(p, field)) row[field] = p[field];
    }
    return applied(op, 'applied', op.entity_id, this.iso());
  }

  /* ---------------------------------------------------------------- schedule (WP7) */

  /**
   * Phases, rules, a skip and the settings, as 0014 applies them — the guards, the §1.3
   * activation, the §2.5 stale check, the closed set of cancel reasons. What the fake does NOT
   * do is materialise: instances and reminders are the materialise function's rows, and a
   * device computes today's slots from rules and activities itself (packages/core/src/schedule).
   */
  private applyPhase(userId: string, op: PushOp): PushResult {
    const p = op.payload;
    if (!this.canAdmin(op.household_id, userId)) return rejected(op, 'FORBIDDEN', 'forbidden');
    if (op.op === 'DELETE') {
      throw new ServerError(
        SQLSTATE.CC422,
        'a routine is retired with deleted_at, never deleted: its history reads it',
      );
    }
    const at = this.iso();
    const name = typeof p['name'] === 'string' ? p['name'].trim() : '';
    const live = (ph: Row) => ph['household_id'] === op.household_id && ph['deleted_at'] == null;
    const sameChild = (a: Row, childId: unknown) => (a['child_id'] ?? null) === (childId ?? null);
    const activate = (phase: Row, date: string) => {
      if (phase['is_current'] === true) return;
      for (const other of this.schedule_phases) {
        if (other === phase || !live(other) || other['is_current'] !== true) continue;
        if (!sameChild(other, phase['child_id'])) continue;
        if (date < String(other['effective_from'])) {
          throw new ServerError(
            SQLSTATE.CC422,
            'The new routine cannot start before the current one did.',
          );
        }
        other['is_current'] = false;
        other['effective_to'] = date;
        other['updated_at'] = at;
      }
      phase['is_current'] = true;
      phase['effective_from'] = date;
      phase['effective_to'] = null;
      phase['updated_at'] = at;
    };
    if (op.op === 'CREATE') {
      const existing = this.schedule_phases.find(ph => ph['id'] === op.entity_id);
      if (existing !== undefined) {
        if (existing['household_id'] !== op.household_id) {
          return rejected(op, 'CONFLICT', 'a routine with this id exists elsewhere');
        }
        return applied(op, 'duplicate', op.entity_id, at);
      }
      if (name === '') throw new ServerError(SQLSTATE.CC422, 'a routine needs a name');
      const row: Row = {
        id: op.entity_id,
        household_id: op.household_id,
        child_id: str(p['child_id']),
        name,
        effective_from: str(p['effective_from']) ?? at.slice(0, 10),
        effective_to: null,
        is_current: false,
        created_at: at,
        updated_at: at,
        deleted_at: null,
      };
      this.schedule_phases.push(row);
      if (p['is_current'] === true) activate(row, String(row['effective_from']));
      return applied(op, 'applied', op.entity_id, at);
    }
    const row = this.schedule_phases.find(
      ph => ph['id'] === op.entity_id && ph['household_id'] === op.household_id,
    );
    if (row === undefined) return rejected(op, 'CONFLICT', 'routine not found');
    const hasDeleted = Object.prototype.hasOwnProperty.call(p, 'deleted_at');
    if (hasDeleted && str(p['deleted_at']) !== null) {
      if (row['deleted_at'] != null) return applied(op, 'duplicate', op.entity_id, at);
      if (row['is_current'] === true) {
        throw new ServerError(
          SQLSTATE.CC422,
          'Activate another routine first, then delete this one.',
        );
      }
      if (
        !this.schedule_phases.some(ph => ph !== row && live(ph) && sameChild(ph, row['child_id']))
      ) {
        throw new ServerError(
          SQLSTATE.CC422,
          'Keep at least one routine. Create the next one first, then delete this.',
        );
      }
      row['deleted_at'] = at;
      row['updated_at'] = at;
      for (const rule of this.schedule_rules) {
        if (rule['phase_id'] === op.entity_id && rule['deleted_at'] == null) {
          rule['deleted_at'] = at;
          rule['is_active'] = false;
          rule['updated_at'] = at;
        }
      }
      return applied(op, 'applied', op.entity_id, at);
    }
    if (hasDeleted && str(p['deleted_at']) === null && row['deleted_at'] != null) {
      row['deleted_at'] = null;
      row['updated_at'] = at;
      const ids = new Set((Array.isArray(p['rule_ids']) ? p['rule_ids'] : []).map(String));
      for (const rule of this.schedule_rules) {
        if (rule['phase_id'] === op.entity_id && ids.has(String(rule['id']))) {
          rule['deleted_at'] = null;
          rule['is_active'] = true;
          rule['updated_at'] = at;
        }
      }
      return applied(op, 'applied', op.entity_id, at);
    }
    if (name !== '') {
      row['name'] = name;
      row['updated_at'] = at;
    }
    if (p['activate'] === true) activate(row, str(p['activation_date']) ?? at.slice(0, 10));
    return applied(op, 'applied', op.entity_id, at);
  }

  private applyRule(userId: string, op: PushOp): PushResult {
    const p = op.payload;
    if (!this.canAdmin(op.household_id, userId)) return rejected(op, 'FORBIDDEN', 'forbidden');
    const at = this.iso();
    const row = this.schedule_rules.find(r => r['id'] === op.entity_id);
    if (op.op === 'DELETE') {
      if (row === undefined || row['household_id'] !== op.household_id) {
        return rejected(op, 'CONFLICT', 'scheduled item not found');
      }
      row['deleted_at'] = str(row['deleted_at']) ?? at;
      row['is_active'] = false;
      row['updated_at'] = at;
      return applied(op, 'applied', op.entity_id, at);
    }
    if (op.op === 'CREATE') {
      if (row !== undefined) {
        if (row['household_id'] !== op.household_id) {
          return rejected(op, 'CONFLICT', 'a scheduled item with this id exists elsewhere');
        }
        return applied(op, 'duplicate', op.entity_id, at);
      }
      const { client_edited_at: _edited, ...fields } = p;
      void _edited;
      this.schedule_rules.push({
        ...fields,
        id: op.entity_id,
        household_id: op.household_id,
        effective_from: str(p['effective_from']) ?? at,
        remind_user_ids: this.liveAudience(op.household_id, p['remind_user_ids']),
        created_at: at,
        updated_at: at,
        deleted_at: null,
      });
      return applied(op, 'applied', op.entity_id, at);
    }
    if (row === undefined || row['household_id'] !== op.household_id) {
      return rejected(op, 'CONFLICT', 'scheduled item not found');
    }
    // §2.5: the sheet says which version it edited; a stale edit gets the current row back
    const expected = str(p['expected_updated_at']);
    if (expected !== null && Date.parse(expected) !== Date.parse(String(row['updated_at']))) {
      const stale: PushResult = {
        client_op_id: op.client_op_id,
        status: 'rejected',
        error: { code: 'VALIDATION', message: 'this item was changed elsewhere' },
        conflict: { kind: 'rule_stale', current: { ...row } },
      };
      return stale;
    }
    for (const [k, v] of Object.entries(p)) {
      if (
        k === 'client_edited_at' ||
        k === 'expected_updated_at' ||
        k === 'activity' ||
        k === 'care_item_id'
      )
        continue;
      row[k] = k === 'remind_user_ids' ? this.liveAudience(op.household_id, v) : v;
    }
    row['updated_at'] = at;
    return applied(op, 'applied', op.entity_id, at);
  }

  private liveAudience(householdId: string, ids: unknown): string[] {
    const wanted = new Set((Array.isArray(ids) ? ids : []).map(String));
    return this.members
      .filter(
        m =>
          m.household_id === householdId &&
          wanted.has(m.user_id) &&
          !m.removed_at &&
          m.role !== 'VIEW_ONLY',
      )
      .map(m => m.user_id)
      .sort();
  }

  private applyInstance(userId: string, op: PushOp): PushResult {
    const p = op.payload;
    if (!this.canWrite(op.household_id, userId)) return rejected(op, 'FORBIDDEN', 'forbidden');
    if (op.op !== 'UPDATE' || p['status'] !== 'SKIPPED') {
      throw new ServerError(
        SQLSTATE.CC422,
        'an instance is materialised by the server; a client only skips it',
      );
    }
    const at = this.iso();
    const row = this.schedule_instances.find(
      i => i['id'] === op.entity_id && i['household_id'] === op.household_id,
    );
    if (row === undefined) return rejected(op, 'CONFLICT', 'scheduled item not found');
    if (!['UPCOMING', 'DUE', 'LATE', 'MISSED'].includes(String(row['status']))) {
      return applied(op, 'duplicate', op.entity_id, at);
    }
    row['status'] = 'SKIPPED';
    row['skipped_reason'] = str(p['skipped_reason']);
    row['updated_at'] = at;
    for (const r of this.reminders) {
      if (r['instance_id'] === op.entity_id && r['sent_at'] == null && r['cancelled_at'] == null) {
        r['cancelled_at'] = at;
        r['cancel_reason'] = 'skipped';
      }
    }
    return applied(op, 'applied', op.entity_id, at);
  }

  /**
   * An immunisation record (docs/VACCINES.md §6–§8; 0015): OWNER/PARENT only; a CREATE for a
   * scheduled dose is an upsert on (child, dose) — a second device's record merges into the
   * first, the later write winning per field, and the loser hears `duplicate` with the id that
   * holds the slot; an UPDATE is whole-row last-writer-wins by `client_edited_at`; a DELETE is
   * `deleted_at`, never a removed row.
   *
   * The clock an edit is compared with is the row's own `client_edited_at` — the phone clock of
   * the last edit it took — never `updated_at`, which this server stamps (0116): a record given
   * offline and corrected before it was sent lost the correction to its own CREATE's stamp.
   */
  private applyVaccineRecord(userId: string, op: PushOp, clock: string): PushResult {
    const p = op.payload;
    if (!this.canAdmin(op.household_id, userId)) return rejected(op, 'FORBIDDEN', 'forbidden');
    const at = this.iso();
    const FIELDS = [
      'status',
      'occurred_on',
      'custom_name',
      'provider',
      'site',
      'lot',
      'decline_reason',
      'notes',
    ] as const;
    const patchInto = (row: Row) => {
      for (const k of FIELDS) if (Object.prototype.hasOwnProperty.call(p, k)) row[k] = p[k] ?? null;
      row['client_edited_at'] = clock;
      row['updated_at'] = at;
      row['updated_by'] = userId;
    };
    const byId = this.vaccine_records.find(
      r => r['id'] === op.entity_id && r['household_id'] === op.household_id,
    );
    if (op.op === 'CREATE') {
      if (byId !== undefined)
        return applied(op, 'duplicate', op.entity_id, String(byId['updated_at']));
      const childId = str(p['child_id']);
      if (childId === null)
        throw new ServerError(SQLSTATE.CC422, 'a vaccine record names its child');
      if (!this.children.some(c => c['id'] === childId && c['household_id'] === op.household_id))
        throw new ServerError(SQLSTATE.CC422, 'child not in household');
      const doseId = str(p['dose_id']);
      const custom = (str(p['custom_name']) ?? '').trim();
      if (doseId === null && custom === '')
        throw new ServerError(SQLSTATE.CC422, 'a vaccine record names a dose or a vaccine');
      if (p['status'] === 'GIVEN' && str(p['occurred_on']) === null)
        throw new ServerError(SQLSTATE.CC422, 'a given dose has a date');
      const holder =
        doseId === null
          ? undefined
          : this.vaccine_records.find(
              r => r['child_id'] === childId && r['dose_id'] === doseId && r['deleted_at'] === null,
            );
      if (holder !== undefined) {
        if (ms(clock) >= editedMs(holder['client_edited_at'])) patchInto(holder);
        return applied(op, 'duplicate', String(holder['id']), String(holder['updated_at']));
      }
      this.vaccine_records.push({
        id: op.entity_id,
        client_op_id: op.client_op_id,
        household_id: op.household_id,
        child_id: childId,
        guidance_profile: str(p['guidance_profile']),
        guidance_version: str(p['guidance_version']),
        dose_id: doseId,
        custom_name: custom === '' ? null : custom,
        status: str(p['status']) ?? 'PLANNED',
        occurred_on: str(p['occurred_on']),
        provider: str(p['provider']),
        site: str(p['site']),
        lot: str(p['lot']),
        decline_reason: str(p['decline_reason']),
        notes: str(p['notes']),
        created_by: userId,
        updated_by: null,
        created_at: at,
        updated_at: at,
        deleted_at: null,
        client_edited_at: clock,
      });
      return applied(op, 'applied', op.entity_id, at);
    }
    if (op.op === 'UPDATE') {
      if (byId === undefined) return rejected(op, 'CONFLICT', 'vaccine record not found');
      if (ms(clock) >= editedMs(byId['client_edited_at'])) {
        patchInto(byId);
        if (Object.prototype.hasOwnProperty.call(p, 'deleted_at'))
          byId['deleted_at'] = p['deleted_at'] ?? null;
      }
      return applied(op, 'applied', op.entity_id, String(byId['updated_at']));
    }
    if (op.op === 'DELETE') {
      if (byId === undefined || byId['deleted_at'] !== null)
        return applied(op, 'duplicate', op.entity_id, at);
      byId['deleted_at'] = at;
      byId['updated_at'] = at;
      byId['updated_by'] = userId;
      // an Undo made before this delete and arriving after it must not bring the record back
      if (ms(clock) > editedMs(byId['client_edited_at'])) byId['client_edited_at'] = clock;
      return applied(op, 'applied', op.entity_id, at);
    }
    throw new ServerError(
      SQLSTATE.CC422,
      `unsupported operation for entity vaccine_record: ${op.op}`,
    );
  }

  /** The published immunisation schedule, as `0004` seeds it: idempotent, so `load()` can run first. */
  seedVaccineProfile(): void {
    const g = VACCINE_PROFILE;
    if (
      this.vaccine_guidance_profiles.some(
        r => r['profile'] === g.profile && r['version'] === g.version,
      )
    )
      return;
    this.vaccine_guidance_profiles.push({
      profile: g.profile,
      version: g.version,
      effective_date: g.effectiveDate,
      source: g.source,
      source_url: g.sourceUrl,
      disclaimer: g.disclaimer,
      coverage: g.coverage,
      vaccines: g.vaccines,
      visits: g.visits,
      doses: g.doses,
      created_at: this.iso(),
    });
  }

  private applySettings(userId: string, op: PushOp): PushResult {
    const p = op.payload;
    if (op.op !== 'UPDATE') throw new ServerError(SQLSTATE.CC422, 'a setting is only ever updated');
    const at = this.iso();
    const table = str(p['table']) ?? 'module_settings';
    if (table === 'module_settings') {
      if (!this.canAdmin(op.household_id, userId)) return rejected(op, 'FORBIDDEN', 'forbidden');
      const moduleId = str(p['module_id']);
      if (moduleId === null)
        throw new ServerError(SQLSTATE.CC422, 'a module setting names its module');
      let row = this.module_settings.find(
        m => m['household_id'] === op.household_id && m['module_id'] === moduleId,
      );
      // The real server has one row per registry entry from bootstrap_household and answers
      // CONFLICT for an unknown module. The fake's household has none until something writes
      // one, so here the row is made on first write — the only place the two deliberately differ.
      if (row === undefined) {
        row = {
          household_id: op.household_id,
          module_id: moduleId,
          enabled: true,
          quick_enabled: false,
          quick_position: null,
          nudge_after_minutes: null,
          goal_minutes: null,
          variant: null,
          base_goal_minutes: null,
          created_at: at,
        };
        this.module_settings.push(row);
      }
      const old = { variant: row['variant'] ?? null, goal: row['goal_minutes'] ?? null };
      // the columns the real branch names; `base_goal_minutes` is not one of them (0127)
      for (const k of [
        'enabled',
        'quick_enabled',
        'quick_position',
        'nudge_after_minutes',
        'goal_minutes',
        'variant',
      ]) {
        if (Object.prototype.hasOwnProperty.call(p, k)) row[k] = p[k];
      }
      // THE KEPT GOAL, AS 0127's TRIGGER KEEPS IT: from the row's own history, never the payload.
      // A variant switched on keeps the goal the row had; switched off, it is forgotten.
      const now = row['variant'] ?? null;
      if (now !== null && old.variant === null) row['base_goal_minutes'] = old.goal;
      else if (now === null && old.variant !== null) row['base_goal_minutes'] = null;
      row['updated_at'] = at;
      row['updated_by'] = userId;
      return applied(op, 'applied', op.entity_id, at);
    }
    if (table === 'notification_preferences') {
      const channel = str(p['channel']);
      if (channel === null) throw new ServerError(SQLSTATE.CC422, 'a preference names its channel');
      let row = this.notification_preferences.find(
        n =>
          n['household_id'] === op.household_id &&
          n['user_id'] === userId &&
          n['channel'] === channel,
      );
      if (row === undefined) {
        row = {
          household_id: op.household_id,
          user_id: userId,
          channel,
          enabled: true,
          sound: true,
          vibrate: true,
          quiet_from: null,
          quiet_to: null,
          schedule_dow: null,
          schedule_hour: null,
          created_at: at,
        };
        this.notification_preferences.push(row);
      }
      for (const k of ['enabled', 'sound', 'vibrate', 'quiet_from', 'quiet_to']) {
        if (Object.prototype.hasOwnProperty.call(p, k)) row[k] = p[k];
      }
      row['updated_at'] = at;
      return applied(op, 'applied', op.entity_id, at);
    }
    if (table === 'privacy_preferences') {
      // MOM PRIVACY (docs/SECURITY.md §4): the caller's own row per privacy-capable module.
      // `userId`, never a user_id out of the payload — the server decides whose preference this
      // is, exactly as it does for a notification preference, so one member can never change
      // what another shares. No role check either: it is the author's own call about her own
      // rows, and can_admin here would hand it to the household's owner.
      const moduleId = str(p['module_id']);
      if (moduleId === null) {
        throw new ServerError(SQLSTATE.CC422, 'a privacy preference names its module');
      }
      let row = this.privacy_preferences.find(
        n =>
          n['household_id'] === op.household_id &&
          n['user_id'] === userId &&
          n['module_id'] === moduleId,
      );
      if (row === undefined) {
        row = {
          household_id: op.household_id,
          user_id: userId,
          module_id: moduleId,
          shared: true,
          created_at: at,
        };
        this.privacy_preferences.push(row);
      }
      if (Object.prototype.hasOwnProperty.call(p, 'shared')) row['shared'] = p['shared'];
      row['updated_at'] = at;
      return applied(op, 'applied', op.entity_id, at);
    }
    if (table === 'vaccine_tracking_settings') {
      // an optional or seasonal series turned on or off for one child (docs/VACCINES.md §6):
      // OWNER/PARENT only, an upsert on (household, child, dose)
      if (!this.canAdmin(op.household_id, userId)) return rejected(op, 'FORBIDDEN', 'forbidden');
      const childId = str(p['child_id']);
      const doseId = str(p['dose_id']);
      if (childId === null || doseId === null)
        throw new ServerError(SQLSTATE.CC422, 'a tracking setting names its child and its dose');
      let row = this.vaccine_tracking_settings.find(
        t =>
          t['household_id'] === op.household_id &&
          t['child_id'] === childId &&
          t['dose_id'] === doseId,
      );
      if (row === undefined) {
        row = { household_id: op.household_id, child_id: childId, dose_id: doseId, enabled: false };
        this.vaccine_tracking_settings.push(row);
      }
      row['enabled'] = p['enabled'] === true;
      row['updated_at'] = at;
      row['updated_by'] = userId;
      return applied(op, 'applied', op.entity_id, at);
    }
    if (table === 'household_settings') {
      // the household's waking window (migration 0095): one row, admin-only, an upsert. The
      // real server defaults a missing column from the row it already has; the fake does the
      // same by only writing the keys the payload names.
      if (!this.canAdmin(op.household_id, userId)) return rejected(op, 'FORBIDDEN', 'forbidden');
      // the household's milk unit (0128) is on the same row, and refused by name when it is not
      // one of the two — the real server's `app.fail('CC422', …)` before its column check
      if (
        Object.prototype.hasOwnProperty.call(p, 'volume_unit') &&
        p['volume_unit'] !== 'oz' &&
        p['volume_unit'] !== 'ml'
      )
        return rejected(op, 'VALIDATION', 'a milk unit is oz or ml');
      let row = this.household_settings.find(h => h['household_id'] === op.household_id);
      if (row === undefined) {
        row = {
          household_id: op.household_id,
          wake_time: '07:00',
          bed_time: '19:30',
          volume_unit: 'oz',
        };
        this.household_settings.push(row);
      }
      for (const k of ['wake_time', 'bed_time', 'volume_unit']) {
        if (Object.prototype.hasOwnProperty.call(p, k)) row[k] = p[k];
      }
      row['updated_at'] = at;
      row['updated_by'] = userId;
      return applied(op, 'applied', op.entity_id, at);
    }
    if (table === 'household_duty') {
      // WHO'S ON (migrations 0113 and 0115): the household's shifts, replaced whole. Anyone who
      // logs may write it — the `can_write` gate every op already passed — and the list is held
      // to the phone's own rules, as the real server holds it to `app.duty_problem` and the
      // `household_duty_guard` trigger:
      //   * the list's record (`{ meta }`, 0115) is one element, never a shift; anything else the
      //     parser would drop is refused rather than stored
      //   * a CONFIRMATION of the list the household holds merges the confirming phone into it and
      //     changes nothing else
      //   * shifts already over are dropped, not refused (the sync sweep's D1: a shift saved
      //     offline and sent after it ended was refused and sat in the queue as "Not synced")
      //   * a list written without knowing the one it would replace is answered and NOT stored:
      //     the change already there stands, and the phone that lost says who made it (M1)
      //   * nobody is on past the end of their seat (`pastAccess`, H4)
      const raw = Array.isArray(p['shifts']) ? (p['shifts'] as unknown[]) : [];
      const isMeta = (e: unknown) =>
        e !== null && typeof e === 'object' && !Array.isArray(e) && 'meta' in e;
      const incoming = dutyListFromWire(raw);
      const records = raw.filter(isMeta).length;
      if (records > 1 || incoming.shifts.length !== raw.length - records)
        throw new ServerError(SQLSTATE.CC422, 'shifts refused: malformed');
      const nowMs = this.nowMs();
      let row = this.household_duty.find(h => h['household_id'] === op.household_id);
      const stored = row === undefined ? null : dutyListFromWire(row['shifts']);
      const rev = incoming.meta.rev;
      if (row !== undefined && stored !== null && rev !== null && stored.meta.rev === rev) {
        // only the caller's own phone: a member cannot confirm for somebody else
        const mine = incoming.meta.seen[userId];
        const seen = { ...(mine === undefined ? {} : { [userId]: mine }), ...stored.meta.seen };
        row['shifts'] = dutyListToWire({ shifts: stored.shifts, meta: { ...stored.meta, seen } });
        row['updated_at'] = at;
        return applied(op, 'applied', op.entity_id, at);
      }
      if (incoming.shifts.length > 2)
        throw new ServerError(SQLSTATE.CC422, 'shifts refused: tooMany');
      const seats = this.members.filter(
        m => m.household_id === op.household_id && m.removed_at === null,
      );
      const seatEndOf = (m: MockMembership) =>
        m.expires_at === null || m.expires_at === undefined ? null : Date.parse(m.expires_at);
      const eligible = new Set(
        seats
          .filter(m => canBeOn(m.role) && (seatEndOf(m) === null || (seatEndOf(m) ?? 0) > nowMs))
          .map(m => m.user_id),
      );
      const seatEnds = new Map<string, number>();
      for (const m of seats) {
        const end = seatEndOf(m);
        if (end !== null) seatEnds.set(m.user_id, end);
      }
      const live = incoming.shifts.filter(s => s.untilMs > nowMs);
      const problem = dutyProblem(live, nowMs, eligible, seatEnds);
      if (problem !== null) throw new ServerError(SQLSTATE.CC422, `shifts refused: ${problem}`);
      if (
        row !== undefined &&
        rev !== null &&
        (incoming.meta.base ?? '') !== (stored?.meta.rev ?? '')
      )
        return applied(op, 'applied', op.entity_id, at);
      if (row === undefined) {
        row = { household_id: op.household_id };
        this.household_duty.push(row);
      }
      row['shifts'] = raw.filter(e => {
        if (isMeta(e)) return true;
        const until = (e as { until?: unknown }).until;
        return typeof until === 'string' && Date.parse(until) > nowMs;
      });
      row['updated_at'] = at;
      row['updated_by'] = userId;
      return applied(op, 'applied', op.entity_id, at);
    }
    throw new ServerError(SQLSTATE.CC422, `unknown settings table: ${table}`);
  }

  /* ---------------------------------------------------------------- container */

  private applyContainer(userId: string, op: PushOp, editedAt: string): PushResult {
    const p = op.payload;
    if (op.op === 'CREATE') {
      const existing = this.milk_containers.find(c => c['id'] === op.entity_id);
      if (existing !== undefined) {
        if (existing['household_id'] !== op.household_id) {
          return rejected(op, 'CONFLICT', 'a container with this id already exists');
        }
        return applied(op, 'duplicate', op.entity_id, String(existing['updated_at']));
      }
      const initial = int(p['initial_ml'], 0);
      if (initial <= 0) {
        throw new ServerError(
          SQLSTATE.CHECK_VIOLATION,
          'new row violates check constraint "milk_containers_initial_ml_check"',
        );
      }
      // `source_activity_id` references activities (0001), and Postgres refuses a bag naming a
      // session it does not have. This fake took one, so a pump session merged away by a second
      // stop of its timer left an empty bag here that the real server would never have held
      // (the stash sweep of 2026-09-24, finding 8).
      const source = str(p['source_activity_id']);
      if (source !== null && !this.activities.some(a => a['id'] === source)) {
        throw new ServerError(
          SQLSTATE.FOREIGN_KEY_VIOLATION,
          'insert or update on table "milk_containers" violates foreign key constraint "milk_containers_source_activity_id_fkey"',
        );
      }
      const at = this.iso();
      // amount_ml is 0 on purpose: the balance rule is the only writer of a container's
      // remaining amount (docs/MILK_STASH.md §3).
      this.milk_containers.push({
        id: op.entity_id,
        household_id: op.household_id,
        owner_id: str(p['owner_id']) ?? userId,
        source_activity_id: str(p['source_activity_id']),
        location_id: str(p['location_id']),
        container_type: str(p['container_type']) ?? 'BAG',
        amount_ml: 0,
        initial_ml: initial,
        pumped_at: String(p['pumped_at']),
        first_frozen_at: str(p['first_frozen_at']),
        // 0116: a bag is created knowing what the phone knows of it — a split thawing bag is
        // THAWING since its parent's thaw, and the counter bag a pump feed empties is USED
        thawed_at: str(p['thawed_at']),
        opened_at: str(p['opened_at']),
        used_at: str(p['used_at']),
        discarded_at: null,
        discard_reason: null,
        status: str(p['status']) ?? 'STORED',
        label_code: str(p['label_code']),
        notes: str(p['notes']),
        created_by: userId,
        created_at: at,
        updated_at: at,
        client_edited_at: editedAt,
      });
      return applied(op, 'applied', op.entity_id, at);
    }

    if (op.op !== 'UPDATE') {
      // Removal is status='DISCARDED' plus a DISCARD ledger row, never a delete: a container
      // that vanishes takes its half of the ledger's arithmetic with it.
      throw new ServerError(SQLSTATE.CC422, 'a container is discarded, never deleted');
    }

    const row = this.milk_containers.find(
      c => c['id'] === op.entity_id && c['household_id'] === op.household_id,
    );
    if (row === undefined) return rejected(op, 'CONFLICT', 'container not found');
    // Whole-row last-writer-wins (D2): milk_containers has no metadata column to hang per-field
    // clocks from. A patch older than the row's last EDIT is dropped and the server's row comes
    // back — compared with `client_edited_at`, never `updated_at`, which every ledger row
    // re-stamps: a bag moved just after a feed drew from it lost the move to the feed (0116).
    if (ms(editedAt) < editedMs(row['client_edited_at'])) {
      return applied(op, 'applied', op.entity_id, String(row['updated_at']));
    }
    row['client_edited_at'] = editedAt;
    for (const field of [
      'location_id',
      'container_type',
      'status',
      'thawed_at',
      'opened_at',
      'used_at',
      'discarded_at',
      'discard_reason',
      'label_code',
      'notes',
    ]) {
      if (Object.prototype.hasOwnProperty.call(p, field)) row[field] = p[field];
    }
    // Write-once, for ever: a freezer-to-freezer move must never re-age milk. Refusing to write
    // it is kinder than raising, and means a stale client cannot fail an otherwise good patch.
    if (
      row['first_frozen_at'] === null &&
      Object.prototype.hasOwnProperty.call(p, 'first_frozen_at')
    ) {
      row['first_frozen_at'] = str(p['first_frozen_at']);
    }
    row['updated_at'] = this.iso();
    return applied(op, 'applied', op.entity_id, String(row['updated_at']));
  }

  /* ---------------------------------------------------------------- ledger */

  private applyLedger(userId: string, op: PushOp): PushResult {
    if (op.op !== 'CREATE') {
      throw new ServerError(
        SQLSTATE.CC422,
        'the milk ledger is append-only: correct it with an ADJUST row',
      );
    }
    const p = op.payload;
    const existing = this.milk_inventory_transactions.find(
      r => r['household_id'] === op.household_id && r['client_op_id'] === op.client_op_id,
    );
    if (existing !== undefined) {
      return {
        client_op_id: op.client_op_id,
        status: 'duplicate',
        entity_id: String(existing['id']),
      };
    }
    const kind = String(p['kind']);
    if (!LEDGER_KINDS.includes(kind)) {
      throw new ServerError(SQLSTATE.INVALID_TEXT_REPRESENTATION, `invalid ledger kind: ${kind}`);
    }
    const containerId = str(p['container_id']);
    const container =
      containerId === null ? undefined : this.milk_containers.find(c => c['id'] === containerId);
    if (container === undefined) {
      throw new ServerError(
        SQLSTATE.FOREIGN_KEY_VIOLATION,
        'insert or update on table "milk_inventory_transactions" violates foreign key constraint "milk_inventory_transactions_container_id_fkey"',
      );
    }
    const activityId = str(p['activity_id']);
    if (activityId !== null && !this.activities.some(a => a['id'] === activityId)) {
      // The bottle has not landed yet. Retryable, never a foreign-key crash: the chain's
      // `depends_on` is what stops it happening twice.
      throw new ServerError(
        SQLSTATE.FOREIGN_KEY_VIOLATION,
        'insert or update on table "milk_inventory_transactions" violates foreign key constraint "milk_inventory_transactions_activity_id_fkey"',
      );
    }
    const delta = int(p['delta_ml'], 0);
    const row: Row = {
      id: op.entity_id,
      client_op_id: op.client_op_id,
      household_id: op.household_id,
      container_id: containerId,
      kind,
      delta_ml: delta,
      from_location_id: str(p['from_location_id']),
      to_location_id: str(p['to_location_id']),
      activity_id: activityId,
      occurred_at: str(p['occurred_at']) ?? this.iso(),
      created_by: userId,
      created_at: this.iso(),
    };
    this.milk_inventory_transactions.push(row);

    // 0009's `app.assert_container_balance`: a statement that MOVES milk may never leave the
    // balance negative, but a statement whose every row is a downward ADJUST may record a
    // deficit — a negative ADJUST is a correction to the books, not a withdrawal, and the milk
    // it names was never in the bag. `amount_ml` floors at zero either way, so the number a
    // parent trusts can never read HIGH.
    const balance = this.balanceOf(String(containerId));
    const adjustOnly = kind === 'ADJUST' && delta < 0;
    if (balance < 0 && !adjustOnly) {
      this.milk_inventory_transactions.pop();
      throw new ServerError(
        SQLSTATE.RAISE_EXCEPTION,
        `milk ledger for container ${String(containerId)} would go negative (${balance})`,
      );
    }
    this.rebalance(String(containerId));
    return { client_op_id: op.client_op_id, status: 'applied', entity_id: op.entity_id };
  }

  private balanceOf(containerId: string): number {
    return this.milk_inventory_transactions
      .filter(r => r['container_id'] === containerId)
      .reduce((sum, r) => sum + int(r['delta_ml'], 0), 0);
  }

  private rebalance(containerId: string): void {
    const container = this.milk_containers.find(c => c['id'] === containerId);
    if (container === undefined) return;
    container['amount_ml'] = Math.max(this.balanceOf(containerId), 0);
    container['updated_at'] = this.iso();
  }

  /* ---------------------------------------------------------------- pull */

  private page(
    householdId: string,
    userId: string,
    t: PullRequest['tables'][number],
  ): PullTablePage {
    const expected = PULL_STRATEGY[t.name as keyof typeof PULL_STRATEGY] as
      PullStrategy | undefined;
    if (expected === undefined) {
      throw new ServerError(SQLSTATE.CC422, `table not pulled by this server version: ${t.name}`);
    }
    if (t.strategy !== expected) {
      throw new ServerError(SQLSTATE.CC422, `wrong pull strategy for this table: ${t.name}`);
    }

    if (expected === 'full') return this.fullPage(householdId, userId, t.name);
    if (expected === 'user_window') return this.userWindowPage(householdId, userId);

    // `append` pages on `created_at`, because `occurred_at` can be backdated: a row inserted
    // today for yesterday would land BEHIND a cursor that had already passed it and never be
    // pulled again. The cursor FIELD is still called `updated_at` — `PullCursor` has one shape
    // and the client stores one pair per table (D15).
    const column = expected === 'append' ? 'created_at' : 'updated_at';
    const visible = this.rowsOf(t.name)
      .filter(r => r['household_id'] === householdId)
      .filter(r => t.name !== 'activities' || this.visibleToCaller(r, userId));
    const ordered = [...visible].sort((a, b) => {
      const d = ms(a[column]) - ms(b[column]);
      return d !== 0 ? d : String(a['id']).localeCompare(String(b['id']));
    });
    const after = ordered.filter(r => {
      // The commit-lag control (§9, D16): this row behaves as though its transaction had not
      // committed yet, and only becomes visible once the client's cursor has moved past it.
      if (this.withheld.has(String(r['id'])) && (t.since === null || ms(t.since) < ms(r[column]))) {
        return false;
      }
      if (t.since === null) return true;
      // The row comparison `(updated_at, id) > ($ts, $id)`, which is what keeps the order total
      // when two rows share a timestamp across a page boundary.
      const d = ms(r[column]) - ms(t.since);
      if (d !== 0) return d > 0;
      return t.since_id === null || String(r['id']) > t.since_id;
    });
    const limit = this.limitFor(t.name, t.limit);
    const rows = after.slice(0, limit);
    const last = rows[rows.length - 1];
    return {
      rows: rows.map(r => this.onWire(t.name, r)),
      next_cursor:
        last === undefined ? null : { updated_at: String(last[column]), id: String(last['id']) },
      // A full page is assumed to have a successor, exactly as `0010` computes it (`v_n = v_lim`)
      // rather than from the remainder this fake happens to know. The worst case is one extra
      // empty page, and a fake that were kinder than Postgres here would hide the page the
      // client has to handle.
      has_more: rows.length === limit,
    };
  }

  /** `app.sync_pull_limit`: the client's page size, clamped to the table's cap, never rejected. */
  private limitFor(table: string, requested: number): number {
    const cap = table in PAGE_SIZES ? PAGE_SIZES[table as keyof typeof PAGE_SIZES] : 500;
    return Math.max(1, Math.min(requested, cap));
  }

  /** `activities_read`: any member, except an entry its author marked private (mom privacy). */
  private visibleToCaller(row: Row, userId: string): boolean {
    const priv = row['is_private'];
    const isPrivate = priv === true || priv === 1;
    return !isPrivate || row['created_by'] === userId;
  }

  /**
   * An activity on the wire carries its ONE detail row under `details`, the mirror image of the
   * way a push carries `payload.detail` (D5). Five of the fourteen types have no detail row at
   * all and come back with `details: null`, and a client must tolerate that.
   */
  private onWire(table: string, row: Row): Row {
    if (table !== 'activities') return { ...row };
    const detail = DETAIL_TABLE_BY_ACTIVITY[row['type'] as keyof typeof DETAIL_TABLE_BY_ACTIVITY];
    if (detail === null || detail === undefined) return { ...row, details: null };
    const found = this.detailRow(String(row['id']), detail);
    return { ...row, details: found === null ? null : { table: detail, ...found } };
  }

  /**
   * `full`: the whole current set in one snapshot, so absence means removal. Every branch is
   * scoped exactly as `0010`'s is — a page wider than the policy would hand a device rows it
   * must then be careful not to delete, and a page narrower would make it delete real ones.
   */
  private fullPage(householdId: string, userId: string, table: string): PullTablePage {
    const all = this.rowsOf(table);
    let rows: Row[];
    switch (table) {
      case 'household_members':
        // Removed members are RETURNED, carrying `removed_at`. Dropping them would make the row
        // vanish from a `full` page and the client would delete the name attached to every entry
        // that person ever logged.
        rows = all.filter(r => r['household_id'] === householdId);
        break;
      case 'favorites':
        rows = all.filter(
          r =>
            r['household_id'] === householdId &&
            (r['user_id'] === null || r['user_id'] === undefined || r['user_id'] === userId),
        );
        break;
      // `privacy_preferences` is scoped exactly as the notification preferences are, and by RLS
      // the caller could not read another member's row anyway: the flag itself says there is
      // something the household cannot see.
      case 'notification_preferences':
      case 'privacy_preferences':
        rows = all.filter(r => r['household_id'] === householdId && r['user_id'] === userId);
        break;
      case 'app_messages': {
        // published, in window, and this reader's own answer carried on the row — the fake does
        // exactly what migration 0104's page does, minus the audience, which needs rows the mock
        // has no equivalent of. A mock that filtered a different way would test the mock.
        const nowMs = Date.now();
        rows = all
          .filter(r => {
            if (r['published_at'] == null) return false;
            if (Date.parse(String(r['starts_at'])) > nowMs) return false;
            const ends = r['ends_at'];
            return ends == null || Date.parse(String(ends)) > nowMs - 30 * 86_400_000;
          })
          .map(r => {
            const mine = this.app_message_dismissals.find(
              d => d['message_id'] === r['id'] && d['user_id'] === userId,
            );
            return { ...r, my_action: mine?.['action'] ?? null, my_at: mine?.['at'] ?? null };
          });
        break;
      }
      case 'subscription_entitlements':
        // The caller's own entitlement, NOT filtered by household: the row may carry a null
        // household_id, and an entitlement that disappeared from a pull would read on the
        // device as a plan that ended.
        rows = all.filter(r => r['user_id'] === userId);
        break;
      case 'milk_guidance_profiles':
      case 'vaccine_guidance_profiles':
        // Published guidance, readable by any signed-in user; the household's own
        // profile/version pair is chosen on the device, so every version it might name is here.
        rows = [...all];
        break;
      default:
        rows = all.filter(r => r['household_id'] === householdId);
    }
    return { rows: rows.map(r => ({ ...r })), next_cursor: null, has_more: false, full: true };
  }

  /**
   * `user_window`: the caller's own open reminders inside the window the device schedules local
   * notifications for. THE LIMIT IS DELIBERATELY NOT APPLIED — the page is marked `full`, and a
   * truncated page marked `full` would make the client delete real rows. The window is the bound.
   */
  private userWindowPage(householdId: string, userId: string): PullTablePage {
    const now = this.nowMs();
    const rows = this.reminders.filter(
      r =>
        r['household_id'] === householdId &&
        r['user_id'] === userId &&
        (r['sent_at'] ?? null) === null &&
        (r['cancelled_at'] ?? null) === null &&
        ms(r['fire_at']) >= now - 24 * 60 * 60 * 1000 &&
        ms(r['fire_at']) < now + 7 * 24 * 60 * 60 * 1000,
    );
    return { rows: rows.map(r => ({ ...r })), next_cursor: null, has_more: false, full: true };
  }
}

/* ---------------------------------------------------------------- helpers */

function rejected(op: PushOp, code: PushErrorCode, message: string): PushResult {
  return { client_op_id: op.client_op_id, status: 'rejected', error: { code, message } };
}

function applied(
  op: PushOp,
  status: 'applied' | 'duplicate',
  entityId: string,
  updatedAt?: string | undefined,
): PushResult {
  return {
    client_op_id: op.client_op_id,
    status,
    entity_id: entityId,
    ...(updatedAt !== undefined ? { server_updated_at: updatedAt } : {}),
  };
}

function timerState(row: Row): TimerState {
  return {
    id: String(row['id']),
    household_id: String(row['household_id']),
    child_id: str(row['child_id']),
    type: String(row['type']) as TimerState['type'],
    started_at: String(row['started_at']),
    paused_ms: int(row['paused_ms'], 0),
    active_side: (str(row['active_side']) as TimerState['active_side']) ?? null,
    side_started_at: str(row['side_started_at']),
    left_seconds: int(row['left_seconds'], 0),
    right_seconds: int(row['right_seconds'], 0),
    started_by: String(row['started_by']),
  };
}

/**
 * One device. Two `MockSyncApi`s over one `MockSyncServer` are two caregivers with two phones,
 * which is what every multi-device scenario in `SYNC_SCENARIOS` needs.
 */
export class MockSyncApi implements SyncApi {
  constructor(
    readonly server: MockSyncServer,
    readonly userId: string,
  ) {}

  push(ops: PushOp[]): Promise<PushResponse> {
    return this.server.push(this.userId, ops);
  }

  pull(req: PullRequest): Promise<PullResponse> {
    return this.server.pull(this.userId, req);
  }

  /**
   * This device's household nudges, from its server (`MockSyncServer.subscribe`). In the dev build
   * each phone has its own in-app server, so the only nudge a phone hears there is its own, one
   * pull after each push: the path runs, with nobody else on it.
   */
  subscribe(householdId: string, onChange: (table: string) => void): () => void {
    return this.server.subscribe(householdId, () => onChange('*'));
  }
}
