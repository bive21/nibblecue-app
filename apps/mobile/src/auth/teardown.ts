/**
 * Sign-out teardown — the exact order of docs/ACCOUNTS.md §4, one function for every exit:
 * manual sign-out, global sign-out, forced sign-out, account switch, deletion — and, since
 * 2026-09-25, the one exit that is not a sign-out at all: a HOUSEHOLD leaving this phone while
 * the account stays signed in (`household`, below). Pure: every side effect is an injected
 * dependency, so the order, the crash-safety and the "step 6 may fail but the database still
 * goes" rule are unit-tested (ACCOUNTS.md §9).
 *
 * Idempotent and crash-safe: `teardown_in_progress` is set in the device keystore first and
 * cleared last, so an interrupted run resumes before the next sign-in reads anything; every
 * step tolerates having already happened (deleting a missing file is a success). What it holds
 * is a MARK (`TeardownMark`): who was being signed out, and what step 10 was to keep.
 */

export type SignOutScope = 'local' | 'global' | 'forced' | 'switch' | 'deletion';

/**
 * Every exit this runner knows: the five sign-outs, and `household`.
 *
 * `household` IS THE MIRROR LEAVING, NOT THE PERSON (docs/ACCOUNTS.md §7.3; `mirror.ts` decides
 * when). The account is no longer in the household this phone holds — an evening that ran out, a
 * removal — and the person is still signed in, on the Ended screen, with a new code or a household
 * of their own a tap away. So it runs the steps that take the HOUSEHOLD off the phone and none of
 * the ones that take the PERSON off it:
 *
 *   runs   1 (without the flag), 2, 3, 4, 5, 8, 10 (the household's preferences only), 11 (tmp)
 *   skips  6  the push token is the person's phone, not the household's (ACCOUNTS.md §7:
 *             "their push token is untouched"). The server stops making that household's
 *             reminders for a seat the moment it lapses or is removed (0113's `sync_reminders`
 *             reads the same predicate `sync_pull` refuses on), so nothing of it can arrive by
 *             push; and deleting the token here would leave `usePushRegistration` holding a dead
 *             one it has no reason to ask for again — its token is keyed on the session, which
 *             stays — so the next household's reminders would go to a token nobody can receive.
 *             The registration follows the phone into the next household on its own: the install
 *             id is a row in the database step 8 deletes, so a new one registers afresh.
 *          7, 9  the session is the whole point of this scope
 *          12 there is no AUTH to reset to: the caller writes the fresh account read AFTER this
 *             returns, and that is what turns the app to `ended` and unmounts every household
 *             surface — never before, because the sync engine is what step 3 reads the queue
 *             through, and an account with no household unmounts it. No `signed_out` is emitted:
 *             nobody signed out.
 *
 * AND IT SETS NO `teardown_in_progress`. That flag hands an interrupted run to
 * `resumeInterruptedTeardown` at the next launch, which finishes a FULL forced sign-out — it would
 * sign the person out and sweep the household memory Ended is decided from, for a person nobody
 * asked to sign out. An interrupted household teardown needs none of that: the session is still there, and the
 * account cache still lists the household (it is written after this returns), so the next launch
 * opens on that household, its next pull or account read finds it gone again, and this runs again
 * from the top with the engine mounted. Every step before the interruption tolerates running twice
 * — the quarantine is added to, not replaced (`quarantine.ts`) — so nothing is lost either way.
 */
export type TeardownScope = SignOutScope | 'household';

export interface TeardownUser {
  id: string;
  email: string | null;
}

/**
 * WHAT `teardown_in_progress` HOLDS: who was being signed out, and what step 10 was to keep
 * (the adversarial review, 2026-09-25).
 *
 * It used to hold `1`. A sign-out killed between steps 1 and 8 was finished at the next launch by
 * `resumeInterruptedTeardown` with nobody signed in — the session was not read yet, and may
 * already have been gone — so step 3 found the queue (read from the file, `queueOnDisk`) and had
 * no one to keep it under: step 8 deleted it. The mark names the person, so the resumed step 3
 * keeps their entries under their id exactly as the uninterrupted run would have, and AUTH says
 * who to sign in as to finish them. It carries `keepPrefs` for the same reason: the one sign-out
 * that keeps a key through step 10 — `last_household:<uid>`, so the next sign-in opens on Ended
 * (`mirror.ts`) — keeps it when it is finished at launch too.
 *
 * It lives in the device keystore beside the session it outlives, and is cleared at step 12.
 */
export interface TeardownMark {
  /** Who was being signed out; null only for a mark that names nobody (`parseTeardownMark`). */
  user: TeardownUser | null;
  /** The preference keys step 10 leaves where they are. */
  keepPrefs: readonly string[];
}

export const serializeTeardownMark = (mark: TeardownMark): string =>
  JSON.stringify({ v: 1, user: mark.user, keepPrefs: mark.keepPrefs });

/**
 * The stored mark, or null when no teardown was interrupted. A value this build cannot read is
 * STILL a teardown to finish — only without anyone to keep the queue under, which is exactly what
 * every interrupted run did before the mark named somebody. Finishing it matters more than who.
 */
export function parseTeardownMark(raw: string | null): TeardownMark | null {
  if (raw === null || raw === '') return null;
  const nobody: TeardownMark = { user: null, keepPrefs: [] };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return nobody;
  }
  if (typeof v !== 'object' || v === null) return nobody;
  const { user, keepPrefs } = v as { user?: unknown; keepPrefs?: unknown };
  const u = user as { id?: unknown; email?: unknown } | null | undefined;
  const named: TeardownUser | null =
    typeof u === 'object' && u !== null && typeof u.id === 'string' && u.id !== ''
      ? { id: u.id, email: typeof u.email === 'string' ? u.email : null }
      : null;
  const kept = Array.isArray(keepPrefs)
    ? keepPrefs.filter((k): k is string => typeof k === 'string')
    : [];
  return { user: named, keepPrefs: kept };
}

export interface TeardownDeps {
  /** `teardown_in_progress`: the mark of a sign-out under way, or null for none. */
  flags: { get(): Promise<TeardownMark | null>; set(mark: TeardownMark | null): Promise<void> };
  session: { current(): Promise<TeardownUser | null> };
  ui: { freeze(): void; closeSheets(): void };
  network: { online(): Promise<boolean> };
  outbox: { flush(budgetMs: number): Promise<void>; pending(): Promise<unknown[]> };
  quarantine: { write(user: TeardownUser, ops: readonly unknown[]): Promise<boolean> };
  notifications: { cancelAllScheduled(): Promise<void>; dismissAllDelivered(): Promise<void> };
  widgets: { clearSnapshot(): Promise<void>; reloadAll(): Promise<void> };
  push: { markInvalidOnServer(): Promise<void>; unregisterLocally(): Promise<void> };
  auth: { signOut(scope: 'local' | 'global'): Promise<void> };
  db: {
    /** The family on screen's file (scope `household`). */
    closeAndDelete(): Promise<void>;
    /** Every family's file (a sign-out or a deletion); absent, the one file above. */
    closeAndDeleteEvery?(): Promise<void>;
  };
  keychain: { clearSession(): Promise<void> };
  prefs: {
    /** Step 10 of a sign-out: everything but the device's keys, and `keep`. */
    clearForSignOut(keep: readonly string[]): Promise<void>;
    /** Step 10 of a `household` teardown: the household's keys go, the account's stay. */
    clearForHouseholdEnd(user: TeardownUser): Promise<void>;
  };
  caches: { clearMemory(): Promise<void>; clearTmp(): Promise<void> };
  nav: { resetToAuth(): void };
  analytics: {
    emit(
      event: 'signed_out',
      props: { scope: 'local' | 'global' | 'forced'; queued_ops_bucket: string },
    ): void;
  };
}

export interface TeardownResult {
  ran: boolean;
  /** Step numbers that threw; the run continues past every one of them. */
  failed: number[];
  quarantined: number;
}

export const OUTBOX_FLUSH_BUDGET_MS = 5000;

const bucket = (n: number): string => (n === 0 ? '0' : n <= 3 ? '1-3' : n <= 10 ? '4-10' : '>10');

/** The analytics scope: a switch or a deletion signs out locally; forced is its own word. */
const analyticsScope = (scope: SignOutScope): 'local' | 'global' | 'forced' =>
  scope === 'global' ? 'global' : scope === 'forced' ? 'forced' : 'local';

export async function runTeardown(
  scope: TeardownScope,
  deps: TeardownDeps,
  /** `keepPrefs`: what step 10 of a sign-out leaves; absent, what an interrupted run's mark says. */
  opts: { keepPrefs?: readonly string[] } = {},
): Promise<TeardownResult> {
  if (scope === 'household') return runHouseholdTeardown(deps);
  const interrupted = await deps.flags.get();
  // the person being signed out: the live session — or, finishing a run a killed app left, the
  // person its mark names, because at launch nobody is signed in yet to ask (`TeardownMark`)
  const user = (await deps.session.current()) ?? interrupted?.user ?? null;
  if (!interrupted && !user) return { ran: false, failed: [], quarantined: 0 };
  const keepPrefs = opts.keepPrefs ?? interrupted?.keepPrefs ?? [];

  const failed: number[] = [];
  let quarantined = 0;
  const step = async (n: number, fn: () => Promise<void> | void): Promise<void> => {
    try {
      await fn();
    } catch {
      failed.push(n);
    }
  };

  // 1. no op may be created while the queue is being resolved — and the mark says whose it is
  await step(1, async () => {
    await deps.flags.set({ user, keepPrefs });
    deps.ui.closeSheets();
    deps.ui.freeze();
  });
  // 2. last chance to not lose a log
  await step(2, async () => {
    if (await deps.network.online()) await deps.outbox.flush(OUTBOX_FLUSH_BUDGET_MS);
  });
  // 3. the only step that may keep bytes, and only under the signed-out user's id
  let remaining: unknown[] = [];
  await step(3, async () => {
    remaining = await deps.outbox.pending();
    if (remaining.length > 0 && user) {
      if (await deps.quarantine.write(user, remaining)) quarantined = remaining.length;
    }
  });
  // 4. a reminder firing after sign-out would leak a child's schedule to the next user
  await step(4, async () => {
    await deps.notifications.cancelAllScheduled();
    await deps.notifications.dismissAllDelivered();
  });
  // 5. before the DB goes: the writer reads the DB to rebuild a snapshot
  await step(5, async () => {
    await deps.widgets.clearSnapshot();
    await deps.widgets.reloadAll();
  });
  // 6. best-effort, online only; a failure here never stops 7–12
  await step(6, async () => {
    if (await deps.network.online()) await deps.push.markInvalidOnServer();
    await deps.push.unregisterLocally();
  });
  // 7. after the authenticated calls in 3 and 6, before the store is destroyed
  await step(7, () =>
    deps.auth.signOut(scope === 'global' || scope === 'deletion' ? 'global' : 'local'),
  );
  // 8. one file delete removes every table and every remaining outbox row
  await step(8, () => (deps.db.closeAndDeleteEvery ?? deps.db.closeAndDelete)());
  // 9.
  await step(9, () => deps.keychain.clearSession());
  // 10. the next user must not inherit a child id or a remembered 5 oz
  await step(10, () => deps.prefs.clearForSignOut(keepPrefs));
  // 11. a generated PDF in tmp is C1 data
  await step(11, async () => {
    await deps.caches.clearMemory();
    await deps.caches.clearTmp();
  });
  // 12.
  await step(12, async () => {
    deps.nav.resetToAuth();
    await deps.flags.set(null);
    deps.analytics.emit('signed_out', {
      scope: analyticsScope(scope),
      queued_ops_bucket: bucket(remaining.length),
    });
  });
  return { ran: true, failed, quarantined };
}

/**
 * THE HOUSEHOLD LEAVES, THE PERSON STAYS — the steps of §4 that take a household off this phone,
 * numbered as they are there so a failure names the same step. `TeardownScope` says which steps
 * are skipped and why, and why no flag is set.
 */
async function runHouseholdTeardown(deps: TeardownDeps): Promise<TeardownResult> {
  // the session is kept, and the queue is kept under it: with nobody signed in there is nothing
  // to keep it for, and nothing to do that a sign-out's teardown would not do better
  const user = await deps.session.current();
  if (!user) return { ran: false, failed: [], quarantined: 0 };

  const failed: number[] = [];
  let quarantined = 0;
  const step = async (n: number, fn: () => Promise<void> | void): Promise<void> => {
    try {
      await fn();
    } catch {
      failed.push(n);
    }
  };

  // 1. the latch closes and the engine's automatic triggers stop (`bindings.ts` `freeze`); the
  //    worker itself stays awake for step 2. No flag: see `TeardownScope`.
  await step(1, () => {
    deps.ui.closeSheets();
    deps.ui.freeze();
  });
  // 2. the last chance for what the server will still take — rows written before the seat ended
  //    are refused now, and FAILED rows are what step 3 keeps
  await step(2, async () => {
    if (await deps.network.online()) await deps.outbox.flush(OUTBOX_FLUSH_BUDGET_MS);
  });
  // 3. every unsent row, under this person's id, exactly as a sign-out keeps them (rule 7)
  await step(3, async () => {
    const remaining = await deps.outbox.pending();
    if (remaining.length > 0 && (await deps.quarantine.write(user, remaining)))
      quarantined = remaining.length;
  });
  // 4. a household this phone has left is the one whose reminders must never ring on it
  await step(4, async () => {
    await deps.notifications.cancelAllScheduled();
    await deps.notifications.dismissAllDelivered();
  });
  // 5. before the database goes, for the reason the sign-out gives
  await step(5, async () => {
    await deps.widgets.clearSnapshot();
    await deps.widgets.reloadAll();
  });
  // 8. the household's rows, its details, its ledger and every outbox row, in one file delete —
  //    and the latch stays closed until a household is shown again (the account read that shows
  //    one lifts it first: `AuthContext` `adopt`, `mirror.ts` `latchLifts`)
  await step(8, () => deps.db.closeAndDelete());
  // 10. what named the household goes; the account's own keys stay (`prefs/index.ts`)
  await step(10, () => deps.prefs.clearForHouseholdEnd(user));
  // 11. an export of that household's log in tmp is its record, not this person's
  await step(11, () => deps.caches.clearTmp());
  return { ran: true, failed, quarantined };
}

/**
 * At launch, before anything reads: finish a teardown the last run did not — as the person its
 * mark names, keeping what it was to keep (`TeardownMark`), so their unsynced entries are kept
 * under their id and the sign-in screen says whose they are. Only a sign-out sets the flag this
 * reads, so an interrupted `household` teardown is never finished here as a sign-out —
 * `TeardownScope` says how that one finishes instead.
 */
export async function resumeInterruptedTeardown(deps: TeardownDeps): Promise<TeardownResult> {
  if ((await deps.flags.get()) === null) return { ran: false, failed: [], quarantined: 0 };
  return runTeardown('forced', deps);
}
