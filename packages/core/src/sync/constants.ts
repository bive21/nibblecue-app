/**
 * Every tunable of the offline sync layer, as a named export.
 *
 * `docs/OFFLINE_SYNC.md` §8 and `docs/ARCHITECTURE.md` §3/§7 state different numbers for the
 * same knobs. §8 wins (WP4 D13) because §9's matrix is written against it — "batches <= 50" is
 * an assertion with a test behind it, not a preference. Nothing here is read from a screen: the
 * worker, the pull engine and the repository import these names so a change lands in one place.
 *
 * `apps/mobile/src/auth/session.ts` deliberately keeps its own schedule. Its refresh backoff is
 * 1.0x-1.5x of base; the outbox is 0.5x-1.0x (see `backoff.ts`). Pointing auth at this file
 * would change shipped auth behavior for a cosmetic win.
 */

/** Ops in one `sync_push` call from one flush pass. */
export const MAX_BATCH = 50;
/** Per-op CONFLICT/SERVER rejections before an op is parked as FAILED (D12). */
export const MAX_ATTEMPTS = 10;
/** First backoff base, doubled per attempt. */
export const BASE_MS = 1_000;
/** Ceiling on the backoff base. */
export const CAP_MS = 300_000;
/** Batches attempted in one `flush()` before the pass yields. */
export const MAX_PASSES = 20;
/** Hard ceiling the server enforces on one `sync_push` payload. */
export const MAX_PUSH_OPS = 200;
/**
 * A row is only reclaimable once it has been in SENDING this long. The clock is `sending_at`,
 * written in the same statement that sets SENDING — never `created_at`, which is mint time and
 * would reclaim any minute-old op the instant it started sending, racing its own request.
 */
export const STUCK_SENDING_MS = 60_000;
/** Foreground flush tick. */
export const TICK_MS = 60_000;
/**
 * Foreground delta-pull tick: the BACKSTOP behind the realtime nudge (`NUDGE_DEBOUNCE_MS`).
 *
 * 30 s, not the 5 minutes WP4 planned (2026-09-25, before the first Play build). With realtime
 * unbuilt this tick WAS the path, and two parents with the app open saw each other's feed up to
 * five minutes late, which reads as "it did not sync". A pass is one `sync_pull` request per
 * round with every table in it; an unchanged delta table is an index probe, and the `full` tables
 * (settings, members, the two guidance profiles) are a few KB gzipped, so two a minute per open
 * phone costs the server nothing and the phone about a megabyte an hour of screen-on time.
 *
 * Since 2026-09-30 the fast path is the nudge (migration 0149; the owner: "The handover to another
 * parent takes a while before it shows up on the other phone, about 2 minutes if not more"): the
 * server broadcasts one message that says only "changed" on the household's private topic when a
 * write commits, and an open phone pulls within a second. This tick stays exactly as it was, for
 * what a nudge cannot promise: a message lost while the socket was down, a project whose Realtime
 * is off or refuses the channel, the tables that send none (the schedule's slots, the reminders),
 * and every phone on a server without 0149. It runs only while the app is active, as before.
 */
export const PULL_TICK_MS = 30_000;
/**
 * How long an open phone waits after a realtime nudge before it pulls (2026-09-30; migration 0149,
 * `apps/mobile/src/sync/index.ts`). A trailing debounce: every nudge inside the window starts it
 * again, so a burst (the batches of one long flush, each its own transaction and its own nudge) is
 * one pull, and a lone nudge costs half a second, well inside "not necessarily instant, but
 * faster".
 */
export const NUDGE_DEBOUNCE_MS = 500;
/**
 * Every delta pull rewinds its cursor by this much. `now()` is transaction-start time, so a
 * transaction that begins at T and commits at T+3s writes `updated_at = T` but becomes visible
 * after one that wrote T+1 and committed at T+2. Rewinding plus idempotent upserts is the only
 * way a keyset cursor cannot skip a slow-committing row.
 */
export const PULL_LAG_MS = 30_000;
/** A client edit clock further ahead than this is rejected VALIDATION, not clamped (D1). */
export const CLOCK_SKEW_CLAMP_MS = 300_000;
/** In-app duplicate-guard window. */
export const DEDUPE_WINDOW_MS = 3_500;
/** Widget one-tap duplicate-guard window — wider, because a widget tap has no visible form. */
export const WIDGET_DEDUPE_WINDOW_MS = 4_000;
/** How long a `dedupe_keys` row is worth keeping. */
export const DEDUPE_TTL_MS = 60_000;
/** SYNCED outbox rows are kept this long so the Sync inspector can still show them. */
export const SYNCED_PRUNE_DAYS = 7;
/** Local tombstones are kept this long; the server keeps its own forever. */
export const TOMBSTONE_PRUNE_DAYS = 90;
/** `activities.metadata.history` entries, oldest out. */
export const HISTORY_CAP = 20;
/** Pages of one table pulled in one pass before the pass moves on. */
export const MAX_PAGES_PER_TABLE = 10;

/** Rows requested per page, per table. Unlisted tables use `full` or `user_window` strategies. */
export const PAGE_SIZES = {
  activities: 500,
  milk_containers: 300,
  milk_inventory_transactions: 1000,
  schedule_phases: 500,
  schedule_rules: 500,
  schedule_instances: 500,
} as const;
