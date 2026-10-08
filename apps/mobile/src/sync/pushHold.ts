/**
 * THE TOUR'S OWN WRITES STAY ON THIS PHONE UNTIL THE TOUR HAS TAKEN THEM BACK (the owner,
 * 2026-09-27: a trial entry from the first-run tour *"shows here as pumped, and then corrected.
 * why does this need to show up here when user knows this is only for entry"*).
 *
 * WHY THIS EXISTS. The tour clears its trial entries through the app's own Undo (`tour/
 * tourWrites.ts`), and an Undo can only erase what never left the phone. Everything that had left
 * it — and the write nudge sends an entry within the second — it can only reverse: a soft delete
 * for the entry, a discard for its bag and, because the milk ledger is append-only on the server, a
 * second ledger row the same amount the other way. Each of those is a row the household then keeps
 * on every phone and in its download, for milk that was never there. So while a tour runs, the
 * outbox sends nothing written after the tour's own mark, and when it ends the Undo finds every
 * trial write still unsent and erases it outright (`undoWrite`'s cancelled path: the rows simply
 * never existed). Only then is the hold released and whatever the parent wrote meanwhile that the
 * tour keeps — a rhythm changed in Manage — goes on its way.
 *
 * IT IS A ROW IN SQLITE, NOT A FLAG IN MEMORY, because the worker's review rule is that every piece
 * of state that matters lives in the database (`worker.ts`), and because a tour killed at card 5 and
 * resumed on the next launch must still be holding when the first flush of that launch runs.
 *
 * WHAT IT MAY NEVER DO IS KEEP A PARENT'S WRITE OFF THE SERVER FOR GOOD (CLAUDE.md rule 7), so it
 * has three ways out, each of which fails towards sending:
 *
 *   * the tour releases it when its clean-up is done, and only its own (`releasePush(…, above)`),
 *     so a clean-up finishing late cannot release the next run's hold;
 *   * it lapses by itself `PUSH_HOLD_MS` after it was taken, however the tour ended or did not;
 *   * the sign-out's last flush ignores it (`reason: 'teardown'`), because nothing may be left in
 *     the queue that the teardown is about to quarantine.
 *
 * And a hold that cannot be read is no hold: a corrupt row sends everything, which is the old
 * behavior, never a stuck queue.
 */
import type { Db, Tx } from '../db/driver';

/** The one `ui_prefs` row. */
export const PUSH_HOLD_KEY = 'push_hold';

/**
 * HOW LONG A HOLD LASTS AT MOST. The tour takes about three minutes ("A few short cards, about 3
 * minutes", core's `TOUR_ASK`; it said a minute until 2026-09-28), and a parent who leaves it open
 * while they do something else is still inside it for a while; half an hour covers both many times
 * over, and past it the queue goes on as if there were no tour — the old path, whose rows core's
 * `withoutUndone` still keeps out of every sum. A tour picked up again after the app closed under it
 * holds the queue afresh from its own mark (`TourProvider`'s `holdAgain`), so this is counted from
 * the moment it carried on, not from the "Show me" of an earlier opening.
 */
export const PUSH_HOLD_MS = 30 * 60_000;

interface Stored {
  above: number;
  until: number;
}

const parse = (raw: string | undefined): Stored | null => {
  if (raw === undefined) return null;
  try {
    const v = JSON.parse(raw) as Partial<Stored>;
    return typeof v.above === 'number' &&
      Number.isInteger(v.above) &&
      typeof v.until === 'number' &&
      Number.isFinite(v.until)
      ? { above: v.above, until: v.until }
      : null;
  } catch {
    return null;
  }
};

/** Hold every op written after `aboveSeq` (the tour's mark), until released or `PUSH_HOLD_MS` on. */
export async function holdPush(db: Db, aboveSeq: number, nowMs: number): Promise<void> {
  const value: Stored = { above: aboveSeq, until: nowMs + PUSH_HOLD_MS };
  await db.run(
    `insert into ui_prefs (key, value) values (?, ?)
       on conflict(key) do update set value = excluded.value`,
    [PUSH_HOLD_KEY, JSON.stringify(value)],
  );
}

/**
 * Let the queue go. With `aboveSeq`, only the hold taken at that mark — the run that took it is
 * the only one that may end it; without, any hold at all (a launch that finds no tour under way).
 */
export async function releasePush(db: Db, aboveSeq?: number): Promise<void> {
  if (aboveSeq === undefined) {
    await db.run('delete from ui_prefs where key = ?', [PUSH_HOLD_KEY]);
    return;
  }
  await db.tx(async t => {
    const held = parse(
      (await t.get<{ value: string }>('select value from ui_prefs where key = ?', [PUSH_HOLD_KEY]))
        ?.value,
    );
    if (held === null || held.above === aboveSeq) {
      await t.run('delete from ui_prefs where key = ?', [PUSH_HOLD_KEY]);
    }
  });
}

/**
 * The seq above which nothing may be sent right now, or null when nothing is held — no row, a row
 * that has lapsed, or one that cannot be read.
 */
export async function heldAbove(t: Db | Tx, nowMs: number): Promise<number | null> {
  const held = parse(
    (await t.get<{ value: string }>('select value from ui_prefs where key = ?', [PUSH_HOLD_KEY]))
      ?.value,
  );
  if (held === null || nowMs >= held.until) return null;
  return held.above;
}
