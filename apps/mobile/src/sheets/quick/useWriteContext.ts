/**
 * The four values every capture path takes (`WriteContext`), from the signed-in session, plus
 * the toast every committed write ends in. Split out of useQuickWrite so the timer actions
 * share exactly the same context and the same Undo rather than a second opinion about either.
 *
 * UNDO NEVER GIVES UP ITS PLACE (MULTIPLES §3). A toast may carry a softer action to Undo's
 * left — the twin shortcut, "Undo both" — but Undo is in the same corner after every entry,
 * with or without it. The Toast component enforces the order; this hook only ever fills the
 * two slots.
 */
import { canLog as roleCanLog } from '@nibblecue/core';
import type { ToastSecondaryAction } from '@nibblecue/ui';
import { haptic } from '@nibblecue/ui/haptics';
import { useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { deviceId } from '../../data/ids';
import { systemClock, type WriteOutcome, type WriteSource } from '../../data/repository';
import { writeOrigin } from '../../data/writeOrigin';
import { undoWrite } from '../../data/undo';
import { isTeardownRefusal, openLocalDb } from '../../db';
import type { Db } from '../../db/driver';
import { useToast, type ToastOptions } from '../../ui/toast';
import { useTour } from '../../tour/TourProvider';
import { writeGate } from './writeGate';

export interface SheetWriteContext {
  db: Db;
  householdId: string;
  createdBy: string;
  deviceId: string | null;
  /**
   * `sheet`, unless a CueCoin opened this flow — then `nfc` (data/writeOrigin.ts). It is read
   * here, at call time, rather than passed in: the sheet bodies do not know what opened them,
   * and giving them a flag to carry would be the parallel path the coin spec forbids.
   */
  source: WriteSource;
}

export interface AnnounceOptions {
  /** False for a write the card's own control reverses (a timer start). */
  undoable?: boolean;
  /** The softer action to Undo's left. */
  secondary?: ToastSecondaryAction;
  /** Runs after a successful Undo, before the "Undone" toast. */
  onUndone?: () => void;
  /**
   * A CORRECTION OF AN ENTRY ALREADY IN THE LOG (a capture sheet opened to edit one,
   * `sheets/quick/edit`). It is felt like every save — the parent pressed Save and it landed — but
   * it answers no tour card: a card that asks the parent to log something is waiting for a NEW
   * entry, and its clean-up takes back the rows a tour wrote, which an edit never is.
   */
  correction?: boolean;
}

export function useWriteContext(): {
  householdId: string | null;
  userId: string | null;
  /** False for a view only member of the family on screen (`canLog`): `context()` refuses. */
  canLog: boolean;
  /**
   * THE WRITE PATH: what every new entry, timer, slot answer, stash move and list line is written
   * with. Null when there is nobody to write for, AND for a view only member, who is told so once
   * (`VIEW_ONLY_NO_LOG`) and has nothing written: the server refuses every op of theirs
   * (`app.can_write`), and a write made here first would live on this phone alone, behind a
   * failed outbox row (the 2026-10-08 scenario finding).
   */
  context(): Promise<SheetWriteContext | null>;
  /**
   * THE SAME VALUES FOR A READ, for anybody in the family (Account & privacy's sharing switches,
   * the import's "already there" count). Never write with it: that is what `context()` is for.
   */
  readContext(): Promise<SheetWriteContext | null>;
  /** Show the toast for a COMMITTED outcome, with Undo; a suppressed write shows nothing. */
  announce(outcome: WriteOutcome, sentence: string, options?: AnnounceOptions | boolean): void;
  /** Undo one or more outcomes, in order, then say so. */
  undoAll(outcomes: readonly WriteOutcome[]): Promise<void>;
  /**
   * A sentence with nothing to undo: a refusal, a setting changed — or a timer's start confirmed
   * with its time, whose one action opens the timer to change it (`useTimerActions.confirmStart`).
   */
  say(sentence: string, options?: ToastOptions): void;
} {
  const { account, session } = useAuth();
  const toast = useToast();
  const tour = useTour();
  const householdId = account?.memberships[0]?.household_id ?? null;
  const userId = session?.user.id ?? null;
  const canLog = roleCanLog(account?.memberships[0]?.role);

  const readContext = useCallback(async () => {
    if (householdId === null || userId === null) return null;
    let db: Db;
    try {
      db = await openLocalDb();
    } catch (err) {
      /*
        A TEARDOWN UNDER WAY IS NOBODY TO WRITE FOR, exactly as no household is (the owner's Expo
        Go log, 2026-09-29). The latch closes at a sign-out's or a household teardown's first step,
        the file goes at its eighth, and nothing reopens it until an account shows a household
        again — so a write asked for meanwhile has no database to land in. It was a rejection most
        callers never handled — taps, links and effects started with `void` — and the sharing
        switches on Account & privacy, which read through here, turned a sign-out from that page
        into a red "Uncaught (in promise)". Every caller already treats null as "nothing to do
        here" and returns, so this is the one place that answers for all of them; any other
        failure is thrown on as before (`db/latch.ts` `isTeardownRefusal`).
      */
      if (isTeardownRefusal(err)) return null;
      throw err;
    }
    return {
      db,
      householdId,
      createdBy: userId,
      deviceId: await deviceId(db),
      source: writeOrigin(),
    };
  }, [householdId, userId]);

  /*
    ONE GUARD ON THE WRITE PATH (the 2026-10-08 scenario finding). The controls that log are hidden
    for a view only member, but a write can be asked for from places no control decides: a widget
    or coin link, a reminder's action, a sheet already open as the role changed. Every one of them
    takes its context here, so this is where the refusal is, once, felt as a refused write is.
  */
  const context = useCallback(
    () =>
      writeGate(
        canLog,
        sentence => {
          // felt as a refused write is, with its sentence
          haptic('warning');
          toast.show(sentence);
        },
        readContext,
      ),
    [canLog, readContext, toast],
  );

  const undoAll = useCallback(
    async (outcomes: readonly WriteOutcome[]) => {
      try {
        const db = await openLocalDb();
        const taken: string[] = [];
        for (const o of outcomes) {
          if (!o.committed) continue;
          await undoWrite(db, systemClock, o);
          taken.push(...o.opIds);
        }
        /*
          AND THE TOUR IS TOLD WHAT CAME BACK, once it has (the owner, 2026-09-30: "i was on
          onboarding tour step 1, logged bottle, then click undo, it then goes to step 2"). The save
          that answered its first card was heard here; its Undo was not, so the tour moved on over an
          entry that was gone. `undone` goes back to that card while the next has not shown the entry,
          and ignores every other Undo, as `did` ignores what no card waits on.
        */
        if (taken.length > 0) tour?.undone(taken);
        toast.show('Undone');
      } catch (err) {
        // an Undo that could not be made is a refused write, felt as one with its sentence
        haptic('warning');
        toast.show(err instanceof Error ? err.message : 'That could not be undone');
      }
    },
    [toast, tour],
  );

  const announce = useCallback(
    (outcome: WriteOutcome, sentence: string, options: AnnounceOptions | boolean = {}) => {
      if (!outcome.committed) return;
      /**
       * ONE SOFT "DONE" ON SAVE (UX_AUDIT R-8, "haptic confirmation on every log-completing save —
       * the 3 a.m. user often is not looking at the screen"). It was the firm `thud` the owner
       * asked for on 2026-09-25; since the Save's words give way to a check that draws itself (the
       * owner, 2026-09-26, "agreed": "a soft haptic('success')"), it is `success`, which is what
       * the check says — still ONE haptic per save, here and nowhere else: the check itself is
       * felt as nothing (`Button`'s `done`). Here for the reason the tour listens here: every
       * committed write from a sheet comes through this line — a Quick Entry save, a medicine, a
       * timer's stop and the pump's session, the stash's own saves, a reminder's "Log it" — and
       * ONLY a committed one does. So it lands with the toast that says what was written, a
       * suppressed second tap is felt as nothing just as it shows nothing, and no sheet has to
       * remember to call it.
       */
      haptic('success');
      const opts = typeof options === 'boolean' ? { undoable: options } : options;
      /*
        NO UNDO ON THE SAVE THAT STOPS THE TIMER THE TOUR'S CARD 1 IS WAITING ON (the owner,
        2026-10-01: "dont show the option to undo during this period, so user doesnt accidentally
        undo it, then have nothing in today's log"; core's `offersUndo`). That save is the entry the
        next card shows. Asked before the tour hears the save, while the card still names its timer;
        every other save, and every save with no tour up, keeps its Undo.
      */
      const undoable = (opts.undoable ?? true) && tour?.undoOffered(outcome) !== false;
      /**
       * THE ONE FUNNEL every sheet's save already goes through, which is why the first-run
       * tour listens here rather than in each of a dozen sheets: a stop that asks the parent
       * to log something is answered by ANY committed write from a sheet — except a correction
       * (`correction`). `did` ignores anything no stop is waiting on, so this costs nothing the
       * rest of the time.
       *
       * WITH THE WRITE ITSELF (2026-09-30): its ops, so an Undo of this very entry is known for it
       * (`undoAll`, above), and its rows, the entry the tour's card 2 rings in Today's log.
       */
      if (opts.correction !== true) tour?.did('log', outcome);
      if (!undoable && !opts.secondary) {
        toast.show(sentence);
        return;
      }
      toast.show(sentence, {
        ...(undoable
          ? {
              undo: () => {
                opts.onUndone?.();
                void undoAll([outcome]);
              },
            }
          : {}),
        ...(opts.secondary ? { secondary: opts.secondary } : {}),
      });
    },
    [toast, undoAll, tour],
  );

  const say = useCallback(
    (sentence: string, options?: ToastOptions) => toast.show(sentence, options),
    [toast],
  );

  return { householdId, userId, canLog, context, readContext, announce, undoAll, say };
}
