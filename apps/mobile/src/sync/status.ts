/**
 * What the queue looks like from outside it (docs/OFFLINE_SYNC.md §6; docs/UX_AUDIT.md §4.33,
 * R-4). Three things live here, and they are together because they are all one question —
 * *what is the app's single sync runtime doing right now?* — asked by three readers:
 *
 *   1. `syncChipFrom`, the pure precedence that turns a snapshot into a chip. It is the file's
 *      reason to exist: the chip's MEANING is a rule, not a rendering, so it is tested
 *      exhaustively in node and `Screen.tsx` only calls it.
 *   2. `syncStatus`, a one-value store the provider pushes snapshots into and React reads
 *      through `useSyncStatus()`. `useSyncExternalStore` rather than context because the
 *      producer is an object with a lifetime of its own, not a rendered tree.
 *   3. `setSyncRuntime` / `syncRuntime`, the handle the pieces ABOVE the provider need. The
 *      accounts state machine (`auth/AuthContext.tsx`) mounts the whole app, so the sync engine
 *      is necessarily *below* it and cannot be passed up as a prop — and `teardownDeps` is
 *      built at two call sites inside it, before a `SyncProvider` has ever rendered. So the
 *      binding is LATE-BOUND: `outboxTeardown()` returns an object that resolves the runtime at
 *      CALL time. A teardown that runs before the provider has built its engine finds no runtime
 *      and reads the queue straight from the file it is still in (`onDisk`); one that runs
 *      afterwards finds the real worker. Binding eagerly would capture the no-op default for
 *      ever, which is WP2's defect (`auth/bindings.ts:92-104`) rather than its fix.
 *
 * NO REACT NATIVE AND NO EXPO. This module is imported by `status.test.ts`, `bindings.test.ts`
 * and `teardown-race.test.ts`, all of which run in node; `react` itself loads there without a
 * renderer, and `@nibblecue/ui` is imported for TYPES ONLY so the component tree never follows.
 */
import type { FlushReason, OutboxRow } from '@nibblecue/core';
import type { SyncState } from '@nibblecue/ui';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { TeardownDeps } from '../auth/teardown';
import { failureClassOf, type SyncBannerKind } from './copy';
import type { MockSyncControls } from './providers/types';
import type { SyncSnapshot } from './worker';

export type { SyncSnapshot };

/** Before the first snapshot arrives: connected, empty, quiet. The chip reads `ok` from it. */
export const EMPTY_SNAPSHOT: SyncSnapshot = {
  connected: true,
  flushing: false,
  pending: 0,
  sending: 0,
  failed: 0,
  oldestPendingAt: null,
  failedSince: null,
  failedCode: null,
  failedElsewhere: false,
  stalledSince: null,
  stalledBy: null,
  bannerDismissed: false,
};

/**
 * HOW LONG A FAILURE IS HELD BACK BEFORE THE CHIP SAYS "NOT SYNCED" (the owner, 2026-09-24:
 * *"after a few minutes the not synced is removed by itself, but this can cause confusions to
 * users"*).
 *
 * A FAILED op is not always final. It goes on its own when the tour's clean-up takes back the
 * trial entry it belonged to, when the parent deletes the entry whose create was refused
 * (`dropMootDeletes`), or when the server's copy of a merged row is adopted — and each of those
 * turned "Not synced" on and off again, which reads as the app being unsure of itself. So a
 * failure is counted as owed ("1 queued") until it is this old, and only then called what it
 * is. Nothing is hidden for long, and nothing is lost meanwhile: the entry is on the phone
 * either way. A failure that was already there when the app opened is told at once.
 */
export const FAILED_GRACE_MS = 2 * 60_000;

/** Whether the chip says "Not synced" now: failures exist, and they are past their grace. */
export function failureSettled(s: SyncSnapshot, nowMs: number): boolean {
  if (s.failed === 0) return false;
  const since = s.failedSince ?? null;
  return since === null || nowMs - since >= FAILED_GRACE_MS;
}

/**
 * D33's precedence, in order, and the order is the argument:
 *
 *   failed  — something needs a person. It outranks everything, including being offline,
 *             because a parent who is told "offline" will wait for a network that will not fix
 *             it — once it is past its grace (`FAILED_GRACE_MS`); a younger failure is counted
 *             as owed, because it may still go by itself.
 *   offline — the queue is not moving and nothing is wrong with it. Said before `flushing`
 *             because a flush that found no connection has already returned.
 *
 *             ONE OPEN QUESTION SITS EXACTLY HERE, and it is flagged rather than decided.
 *             WP4.9's contract puts `!connected` ABOVE `queued`, which is what this function
 *             does. `docs/OFFLINE_SYNC.md` §6's table and the package's own Demo say the
 *             opposite for the case where both are true: "offline with queue → `3 QUEUED`",
 *             and "airplane mode, log two things: the chip reads 2 queued". So an offline
 *             phone with two entries owed says `Offline` here and `2 queued` there. The
 *             precedence is what shipped because it is the numbered decision (D33) and a chip's
 *             meaning is not a thing to change on an inference; the whole difference is one
 *             line — `if (!s.connected && owed === 0)` — and the change report asks the owner
 *             which they want. Whichever way it goes, `status.test.ts` pins it.
 *   syncing — the queue is moving. Distinguishable from `queued` on purpose: "waiting" and
 *             "working" are different answers to "is my log safe?".
 *   queued  — entries are owed to the server. `sending` is counted WITH `pending`: a row that
 *             left the device but has not been acknowledged is still owed, and a count that
 *             dropped while the request was in flight would read as an entry disappearing.
 *   ok      — nothing to report, and the chip is not drawn at all (§4.33).
 */
export function syncChipFrom(
  s: SyncSnapshot,
  nowMs: number = Date.now(),
): { state: SyncState; count?: number } {
  if (failureSettled(s, nowMs)) return { state: 'error', count: s.failed };
  if (!s.connected) return { state: 'offline' };
  if (s.flushing) return { state: 'syncing' };
  // a failure still inside its grace is owed like anything queued (`FAILED_GRACE_MS`)
  const owed = s.pending + s.sending + s.failed;
  if (owed > 0) return { state: 'queued', count: owed };
  return { state: 'ok' };
}

/** Everything the server has not accepted: what the sign-out sheet counts and quarantines. */
export const unsyncedCount = (s: SyncSnapshot): number => s.pending + s.sending + s.failed;

/* ---------------------------------------------------------------- the banner */

/** What the one banner is about, and whether a person has to act (its tone). */
export interface SyncBannerCall {
  kind: SyncBannerKind;
  /** FAILED ops wait for a person; a run of requests that did not land goes on by itself. */
  needsPerson: boolean;
}

/**
 * THE BANNER, READ FROM THE SNAPSHOT (the owner on staging, 2026-09-28). It used to be raised only
 * by a failure this process watched happen, so after a restart the chip said "Not synced" and
 * nothing offered Try again. Now it is a reading of what the worker publishes — at launch and
 * whenever the queue is read — exactly like the chip beside it, and in the same order:
 *
 *   1. FAILED ops, once past their grace (`failureSettled`, which tells at once the ones the app
 *      opened with): the sentence their refusal earns, from the code on their own rows
 *      (`failedCode`; a row with none reads as the server's, so it is always offered Try again).
 *      A role refusal of rows that all name another household is not about the role here
 *      (`failedElsewhere`, 2026-09-29): it says where they belong, asks nothing, and is `warn` —
 *      nobody can act on it, and it is not a problem with anything logged here.
 *   2. A run of requests that did not land, once it has lasted as long as a failure's grace, while
 *      the phone says it is online and something is owed: "We can't reach the server" when they got
 *      no answer at all, and the server's own sentence when the server refused the whole call.
 *
 * One banner, never two: the first that applies. And once dismissed, none for the session
 * (`SyncStatusStore.dismissBanner`) — a new failure later in the same session does not bring it
 * back; the next launch, or the next household, does.
 */
export function syncBannerFrom(s: SyncSnapshot, nowMs: number = Date.now()): SyncBannerCall | null {
  if (s.bannerDismissed === true) return null;
  if (failureSettled(s, nowMs)) {
    if (s.failedCode === 'FORBIDDEN' && s.failedElsewhere === true) {
      return { kind: 'elsewhere', needsPerson: false };
    }
    return { kind: failureClassOf(s.failedCode ?? 'SERVER'), needsPerson: true };
  }
  const since = s.stalledSince ?? null;
  if (
    since !== null &&
    s.connected &&
    s.pending + s.sending > 0 &&
    nowMs - since >= FAILED_GRACE_MS
  ) {
    return { kind: s.stalledBy === 'server' ? 'server' : 'unreachable', needsPerson: false };
  }
  return null;
}

/* ---------------------------------------------------------------- when the chip says so */

type Chip = { state: SyncState; count?: number };

/**
 * "SYNCING" ONLY FOR A SYNC THAT TAKES A WHILE (the owner, 2026-09-26: *"sometimes the 'syncing'
 * shows up only for a few milliseconds when recording entry, if it's just a few milliseconds, just
 * dont show this up. unless if it's still trying to sync after seconds, then you can show it up,
 * otherwise its just gonna feel like a glitch or blip every time logging something"*).
 *
 * Every write nudges the queue (`SyncProvider`), so every entry logged on a good connection runs a
 * flush — a push and the pull behind it, a few hundred milliseconds — and the chip said `Syncing`
 * for exactly that long, then vanished. It told a parent nothing they needed, and it looked like a
 * fault. So a queue ON ITS WAY — `syncing`, or `queued` while connected, which is the moment between
 * a write and its flush — only shows once it has been on its way for `SYNC_SHOW_DELAY_MS`, and once
 * shown it stays for at least `SYNC_MIN_SHOWN_MS`, so a sync that finishes just after the chip
 * appears does not blink it off again.
 *
 * The delay is a SHOW delay: it holds back a chip that would appear from nothing. A chip that is
 * already saying something — Offline, "3 queued", Not synced — changes its word at once when the
 * queue starts moving, rather than vanishing for two seconds and coming back. Offline and Not synced
 * are never delayed here: Offline is a fact about the phone, and Not synced keeps its own, longer
 * rule (`FAILED_GRACE_MS`). Nothing is hidden that is not on its way, and nothing is lost meanwhile:
 * the entry is on the phone either way (CLAUDE.md rule 7).
 */
export const SYNC_SHOW_DELAY_MS = 2_000;
export const SYNC_MIN_SHOWN_MS = 600;

/** The queue is on its way: being sent, or owed while connected (a flush is coming). */
const isBusy = (c: Chip): boolean => c.state === 'syncing' || c.state === 'queued';

const OK: Chip = { state: 'ok' };

/**
 * THE CHIP AS DRAWN — `syncChipFrom`'s precedence, with the show delay and the minimum above laid
 * over it from the times the store keeps (`busyShowAt`, `busyEndedAt`). A snapshot with no times on
 * it (one a test built, or the store's first) is drawn as it stands.
 */
export function syncChipShown(s: SyncSnapshot, nowMs: number = Date.now()): Chip {
  const raw = syncChipFrom(s, nowMs);
  const showAt = s.busyShowAt ?? null;
  if (showAt === null) return raw;
  const endedAt = s.busyEndedAt ?? null;
  // on its way, and not yet for long enough to say so
  if (isBusy(raw)) return endedAt === null && nowMs < showAt ? OK : raw;
  // it arrived: a chip that was shown keeps "Syncing" until it has had its minimum
  if (raw.state === 'ok' && endedAt !== null && endedAt > showAt) {
    if (nowMs < showAt + SYNC_MIN_SHOWN_MS) return { state: 'syncing' };
  }
  return raw;
}

/** The next moment the drawn chip — or the banner — changes with nothing else changing, or null. */
export function nextChipChange(s: SyncSnapshot, nowMs: number): number | null {
  const times: number[] = [];
  const since = s.failedSince ?? null;
  if (s.failed > 0 && since !== null) times.push(since + FAILED_GRACE_MS);
  // a run of requests that did not land becomes the banner's once it has lasted as long
  const stalled = s.stalledSince ?? null;
  if (stalled !== null) times.push(stalled + FAILED_GRACE_MS);
  const showAt = s.busyShowAt ?? null;
  const endedAt = s.busyEndedAt ?? null;
  if (showAt !== null && endedAt === null) times.push(showAt);
  if (showAt !== null && endedAt !== null && endedAt > showAt) {
    times.push(showAt + SYNC_MIN_SHOWN_MS);
  }
  const ahead = times.filter(t => t > nowMs);
  return ahead.length === 0 ? null : Math.min(...ahead);
}

/* ---------------------------------------------------------------- what just happened */

/**
 * How many entries a flush has just drained, or `null` when nothing drained.
 *
 * Two snapshots, no events. The worker reports state, not history, and that is the right shape:
 * a toast raised from inside the send loop would fire once per pass on a queue that takes three
 * passes, while a transition between two snapshots can only be crossed once. The count is what
 * was owed BEFORE, because that is the number the parent last saw on the chip.
 */
export function drainedCount(prev: SyncSnapshot, next: SyncSnapshot): number | null {
  const was = prev.pending + prev.sending;
  const now = next.pending + next.sending;
  if (was === 0 || now > 0) return null;
  // a queue that emptied because the entries FAILED did not sync, and saying so would be a lie
  if (next.failed > prev.failed) return null;
  return was;
}

/** A write was queued while the phone had no connection: §6's first-offline-write toast. */
export function queuedWhileOffline(prev: SyncSnapshot, next: SyncSnapshot): boolean {
  return !next.connected && next.pending + next.sending > prev.pending + prev.sending;
}

/* ---------------------------------------------------------------- the store */

type Listener = () => void;

export class SyncStatusStore {
  private snapshot: SyncSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<Listener>();
  /** No snapshot has come from the worker yet in this session: its failures are not new. */
  private first = true;
  /** The wake-up at the end of a failure's grace, so the chip changes when nothing else does. */
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  get = (): SyncSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Identity is the change signal, so an equal snapshot is dropped rather than re-rendered.
   *
   * `failedSince` is decided here, from one snapshot to the next: it starts when the failures go
   * from none to some, holds while there are any, and clears with them. Failures already there in
   * the session's first snapshot were not just made, so they have no grace (`FAILED_GRACE_MS`).
   *
   * So are `busyShowAt` and `busyEndedAt` (`SYNC_SHOW_DELAY_MS`): a run of the queue being on its
   * way starts when the chip's precedence first says `syncing` or `queued`, and ends when it says
   * anything else. A run that starts while the chip says NOTHING may show two seconds later; one
   * that starts while it says something shows at once. Whatever a snapshot arrives carrying, these
   * are the store's own — the worker cannot know what the chip was showing.
   */
  set = (incoming: SyncSnapshot): void => {
    this.take(incoming, false);
  };

  /**
   * Sign-out: the next household starts from an empty queue, not the last one's numbers — and
   * with no run of the last one's still being held on the chip, and its banner not dismissed.
   */
  reset = (): void => {
    this.take(EMPTY_SNAPSHOT, true);
    this.first = true;
  };

  /**
   * THE PARENT DISMISSED THE BANNER: none for the rest of the session (`syncBannerFrom`). A new
   * failure later in the same session does not bring it back — the chip still says "Not synced",
   * and the next launch or the next household asks again. Try again is not a dismissal: it puts
   * the ops back on the queue, which is what takes the banner away, and a failure after it is the
   * answer to the parent's own question.
   */
  dismissBanner = (): void => {
    if (this.snapshot.bannerDismissed === true) return;
    this.snapshot = { ...this.snapshot, bannerDismissed: true };
    this.notify();
  };

  private take(incoming: SyncSnapshot, fresh: boolean): void {
    const cur = this.snapshot;
    const now = this.now();
    const failedSince =
      incoming.failed === 0
        ? null
        : cur.failed > 0
          ? (cur.failedSince ?? null)
          : this.first
            ? null
            : now;
    this.first = false;
    const withFailure: SyncSnapshot = { ...incoming, failedSince };
    let busyShowAt = fresh ? null : (cur.busyShowAt ?? null);
    let busyEndedAt = fresh ? null : (cur.busyEndedAt ?? null);
    const wasBusy = busyShowAt !== null && busyEndedAt === null;
    const busy = !fresh && isBusy(syncChipFrom(withFailure, now));
    if (busy && !wasBusy) {
      // a run begins: held back only if the chip is saying nothing at this moment
      busyShowAt = syncChipShown(cur, now).state === 'ok' ? now + SYNC_SHOW_DELAY_MS : now;
      busyEndedAt = null;
    } else if (!busy && wasBusy) {
      busyEndedAt = now;
    }
    // the store's own, like the times above: the worker cannot know what the parent dismissed
    const bannerDismissed = fresh ? false : cur.bannerDismissed === true;
    const next: SyncSnapshot = { ...withFailure, busyShowAt, busyEndedAt, bannerDismissed };
    if (
      cur.connected === next.connected &&
      cur.flushing === next.flushing &&
      cur.pending === next.pending &&
      cur.sending === next.sending &&
      cur.failed === next.failed &&
      cur.oldestPendingAt === next.oldestPendingAt &&
      (cur.failedSince ?? null) === failedSince &&
      (cur.busyShowAt ?? null) === busyShowAt &&
      (cur.busyEndedAt ?? null) === busyEndedAt &&
      (cur.failedCode ?? null) === (next.failedCode ?? null) &&
      (cur.failedElsewhere === true) === (next.failedElsewhere === true) &&
      (cur.stalledSince ?? null) === (next.stalledSince ?? null) &&
      (cur.stalledBy ?? null) === (next.stalledBy ?? null) &&
      (cur.bannerDismissed === true) === bannerDismissed
    ) {
      return;
    }
    this.snapshot = next;
    this.wakeAtNextChange(next);
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /**
   * THE CHIP HAS TO CHANGE WITH NOTHING ELSE CHANGING at three moments — the end of a failure's
   * grace, the end of a sync's show delay, the end of a shown sync's minimum — so the store wakes
   * itself at the next of them and hands out a new snapshot object: `useSyncExternalStore`
   * re-renders on identity, and the reader asks `syncChipShown` again with the new time. Then it
   * looks for the next one.
   */
  private wakeAtNextChange(s: SyncSnapshot): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const now = this.now();
    const at = nextChipChange(s, now);
    if (at === null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.snapshot = { ...this.snapshot };
      this.notify();
      this.wakeAtNextChange(this.snapshot);
    }, at - now);
  }
}

export const syncStatus = new SyncStatusStore();

/** The whole snapshot: the sign-out sheet's and the inspector's read. */
export function useSyncStatus(): SyncSnapshot {
  return useSyncExternalStore(syncStatus.subscribe, syncStatus.get, syncStatus.get);
}

/*
  THE ANSWER, NOT THE QUEUE (2026-09-28; the owner: "app needs to run as smooth as fast and as light
  as possible"). The store hands out a new snapshot at every step of every flush — a save on a good
  connection is two or three (sent, pulled back, done) — and every reader of the whole snapshot
  re-rendered at each: the top bar of every page a parent has opened (each tab stays mounted, and a
  pushed page keeps the one under it), the provider that decides the banner, and the widget
  publisher, all while the sheet that saved was still leaving. What they draw is one word and a
  count, a banner's kind, a number — and for a sync that takes a moment, not even that
  (`syncChipShown`). So each reads its answer through `useSyncExternalStore`, which compares what
  it hands back: a primitive, so equal answers are equal and nothing re-renders for a step that
  changed nothing on the screen. The store still wakes at every moment an answer can change with
  nothing else changing (`nextChipChange`), so every answer moves exactly when it did.
*/

/** What `syncChipShown` draws, as one comparable string: `queued:3`, `offline:`, `ok:`. */
export const chipKey = (c: Chip): string => `${c.state}:${c.count ?? ''}`;

/** The chip back from its key. */
export function chipOfKey(key: string): Chip {
  const at = key.indexOf(':');
  const state = key.slice(0, at) as SyncState;
  const count = key.slice(at + 1);
  return count === '' ? { state } : { state, count: Number(count) };
}

/**
 * THE CHIP A TOP BAR DRAWS, and the snapshot it is drawn from: `online` is the SESSION's
 * reachability, so the chip says offline when either the session or the phone is (`Screen.tsx`).
 */
export function chipFor(s: SyncSnapshot, online: boolean, nowMs: number = Date.now()): Chip {
  return syncChipShown(online ? s : { ...s, connected: false }, nowMs);
}

/** The top bar's read: re-renders only when the chip it draws changes. */
export function useSyncChip(online: boolean): Chip {
  const read = useCallback(() => chipKey(chipFor(syncStatus.get(), online)), [online]);
  const key = useSyncExternalStore(syncStatus.subscribe, read, read);
  return useMemo(() => chipOfKey(key), [key]);
}

/** The banner's kind and tone as one string, or '' for none (`syncBannerFrom`). */
export const bannerKey = (call: SyncBannerCall | null): string =>
  call === null ? '' : `${call.kind}:${call.needsPerson ? 'person' : 'self'}`;

/** The banner back from its key. */
export function bannerOfKey(key: string): SyncBannerCall | null {
  if (key === '') return null;
  const at = key.indexOf(':');
  return { kind: key.slice(0, at) as SyncBannerKind, needsPerson: key.slice(at + 1) === 'person' };
}

/** The banner provider's read: re-renders only when the banner changes (`SyncProvider`). */
export function useSyncBannerCall(): SyncBannerCall | null {
  const read = () => bannerKey(syncBannerFrom(syncStatus.get(), Date.now()));
  const key = useSyncExternalStore(syncStatus.subscribe, read, read);
  return useMemo(() => bannerOfKey(key), [key]);
}

/** How many entries the server has not accepted, and nothing else (the widgets' queued dot). */
export function useSyncQueued(): number {
  const read = () => unsyncedCount(syncStatus.get());
  return useSyncExternalStore(syncStatus.subscribe, read, read);
}

/* ---------------------------------------------------------------- the runtime handle */

/**
 * The slice of `SyncEngine` the app's edges need. Narrower than the engine on purpose: nothing
 * outside `SyncProvider.tsx` may start a pull, change a cursor or construct a worker.
 */
export interface SyncRuntime {
  flush(reason: FlushReason): Promise<unknown>;
  /** Every pull phase, in order. The inspector's "Sync now" is a flush and then this. */
  pullNow(): Promise<unknown>;
  /** The fake server, on the mock arm only — what the inspector's misbehave rows drive. */
  mock: MockSyncControls | null;
  /** Every row not `SYNCED` — `PENDING`, `SENDING` and `FAILED` alike (teardown step 3). */
  pending(): Promise<OutboxRow[]>;
  /** Re-read the queue and push a fresh snapshot, for a surface that has just opened. */
  refresh(): Promise<void>;
  /**
   * Send what is waiting out a backoff at the next flush, as a reconnect would: a pull on Today is a
   * person asking for a sync (`OutboxWorker.dueNow`). FAILED rows are the banner's Try again.
   */
  dueNow(): Promise<void>;
  /**
   * PUT EVERY FAILED ROW BACK ON THE QUEUE, and send.
   *
   * `OutboxWorker.retry` has existed since WP4 and nothing outside a test could reach it: the
   * runtime handed out `flush`, `pullNow`, `pending` and `refresh`, and `Screen.tsx` said so in
   * as many words — "the only queue surface that exists today is the developer inspector". So a
   * row that used up its ten attempts was FAILED for ever, the chip said SYNC ERROR for ever,
   * and the only cure a parent had was signing out, which quarantines the queue and replays it.
   *
   * That is a bad shape for a queue whose failures can be TRANSIENT-turned-terminal: ten
   * attempts against a bug that is later fixed leaves rows nothing will ever retry. The banner
   * offers this now, so the answer to "it keeps saying sync error" is a button rather than a
   * sign-out (the owner, 2026-09-19).
   */
  retry(): Promise<void>;
  /**
   * Teardown step 1, before the UI freezes: close the database latch and stop every automatic
   * trigger. It deliberately does NOT stop the worker — step 2 is the last-chance flush, and a
   * stopped worker answers it with zero (`OutboxWorker.flush`: `if (… !this.started) return`).
   */
  stopForTeardown(): void;
}

let runtime: SyncRuntime | null = null;

/** `SyncProvider` registers on mount and clears on unmount. Exactly one, ever. */
export function setSyncRuntime(next: SyncRuntime | null): void {
  runtime = next;
}

export function syncRuntime(): SyncRuntime | null {
  return runtime;
}

const timeout = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/**
 * The teardown binding for BOTH `teardownDeps` call sites (docs/ACCOUNTS.md §4 steps 2 and 3).
 *
 * `flush` races the real flush against the budget rather than awaiting it, because step 2 is a
 * COURTESY — "last chance to not lose a log" — and step 3 keeps whatever it did not manage. A
 * sign-out that hung for as long as a bad network took would be a sign-out a parent force-quits,
 * and a force-quit mid-teardown is the one path that leaves a half-torn-down account.
 *
 * `pending` returns every row the server has not accepted, because step 3 quarantines exactly
 * what it returns: a `SENDING` row abandoned by a sign-out is a row whose request will never be
 * answered on this install, and dropping it would break rule 7 for the entry that was closest
 * to being safe.
 *
 * `onDisk` IS FOR THE MOMENT THERE IS NO ENGINE AND THE FILE IS STILL THERE (2026-09-25). A
 * teardown can start before `SyncProvider` has registered one: at launch, the account read that
 * finds the household gone — or the refresh the server refuses — can come back before the engine
 * has finished opening the database it is built over. With nothing to ask, step 3 used to report
 * an empty queue, and step 8 deleted the rows it was there to keep. The queue lives in the file
 * until step 8, so it is read from the file; `auth/bindings.ts` supplies the reader, because this
 * module may not import the database (node runs its tests).
 */
export function outboxTeardown(onDisk?: () => Promise<OutboxRow[]>): TeardownDeps['outbox'] {
  return {
    flush: async (budgetMs: number) => {
      const r = runtime;
      if (r === null) return;
      await Promise.race([r.flush('teardown').then(() => undefined), timeout(budgetMs)]);
    },
    pending: async () => {
      const r = runtime;
      if (r !== null) return await r.pending();
      return onDisk === undefined ? [] : await onDisk();
    },
  };
}

/** Teardown step 1's other half, called before the UI freezes. A no-op with no runtime. */
export function stopSyncForTeardown(): void {
  runtime?.stopForTeardown();
}
