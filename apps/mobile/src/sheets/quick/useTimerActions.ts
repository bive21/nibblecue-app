/**
 * Everything a timer can be asked to do, through the real repository (data/timers.ts,
 * data/stash.ts), with the sentences the spec gives each (copy.ts).
 *
 *   start    one timer per (type, child): a second start is refused with
 *            `A sleep timer is already running for Emma` — the row that is already there is
 *            the truth, and it is checked here before anything is written (WP5.4). And one
 *            baby is never asleep and on tummy time at once (2026-09-27): a start over the
 *            other is asked about first (`endRivals`), from every surface that starts one
 *   endRivals  the same question for a session typed in as already finished
 *   stop     the activity the timer produced and the row's removal, one transaction
 *   pause / resume / switch   bank seconds through the coalescing patch
 *   correct  re-anchor `started_at`; every elapsed display recomputes
 *   discard  the row goes, no activity is written (`Session discarded`)
 *
 * A start is not undoable through the toast — the card's own stop is the undo — and neither
 * is a discard, which wrote nothing. A stop is: it created the entry.
 *
 *   confirmStart  the start's time, said after the fact, with one action — Change — for a start
 *            whose time was not on the screen before the tap: a Start tile that starts on its
 *            tap (pumping, tummy time) and a CueCoin (the owner, 2026-09-29; `startWhen.ts`).
 *            A start made from the start row needs none: its Start said the time before the tap.
 *
 * EVERY WRITE HERE HOLDS ITS TIMER (`inFlight.ts`): a second request for a timer that is already
 * being stopped, finished or discarded — a double tap, the sticky bar and the card, a coin read
 * twice — is dropped rather than run, and a second start of the same kind for the same baby
 * likewise. The data layer refuses the ones that do not overlap (`data/timers.ts`).
 *
 * AND A TIMER IS FELT (the owner, 2026-09-25, of the "that's cool" list: "a double tap when a
 * timer starts"). A start that was WRITTEN is a `double` — something began and will keep going —
 * from every surface that starts one (the four sheets, a coin), because they all start here; the
 * running card appearing on Today is the screen's half of it. A start that was refused is a
 * `warning`, with the "already running" sentence that says why. A stop is felt as the `success` of
 * the entry it wrote, through `announce` (useWriteContext.ts), like any other save — so a stop
 * that wrote nothing, a double tap or a timer already gone, is felt as nothing.
 */
import type { TimerType } from '@nibblecue/core';
import { durationLabel } from '@nibblecue/core';
import { formatClock, type Confirm } from '@nibblecue/ui';
import { haptic } from '@nibblecue/ui/haptics';
import { useCallback } from 'react';
import { useShell } from '../../app/shell';
import { useModuleLabels } from '../../modules/useModuleLabels';
import type { ActivityFields } from '../../data/activities';
import { systemClock } from '../../data/repository';
import { storePumpSession } from '../../data/stash';
import {
  correctStart as correctStartWrite,
  discardTimer,
  patchTimer,
  startTimer,
  stopTimer,
  switchSide as switchSideWrite,
} from '../../data/timers';
import { dayWindowRow } from '../../db/queries/schedule';
import type { TimerNow } from '../../db/queries/today';
import { useChild } from '../../household/ChildContext';
import { currentTimeZone } from '../../time/useZone';
import {
  alreadyRunning,
  pumpSaved,
  savedBreastfeedSides,
  savedDuration,
  SESSION_DISCARDED,
  SLEEP_KIND_LABEL,
  startWordsFor,
  TIMER_START,
} from './copy';
import { endKey, startKey, timerWrites } from './inFlight';
import {
  bankedSides,
  elapsedMs,
  firstSide,
  minutesOf,
  startCorrection,
  switchTarget,
  timerSleepKind,
  windowOfRow,
} from './timerMath';
import { endIsNow, rivalEndMs, rivalFor, sleepPlayQuestion } from './sleepPlay';
import { askSleepPlay } from './sleepPlayAsk';
import { useWriteContext } from './useWriteContext';
import { volumeLabel } from './volume';
import type { VolumeUnit } from '@nibblecue/core';

export interface StartArgs {
  type: TimerType;
  childId: string | null;
  startedAtMs: number;
  activeSide?: 'LEFT' | 'RIGHT';
  meta?: Record<string, unknown>;
  /** The child's name for the toast; null for a household timer (pump). */
  childName: string | null;
  clock24: boolean;
  timeZone: string;
}

export interface PumpOutput {
  leftMl: number | null;
  rightMl: number | null;
  /**
   * A pump that reports one number: written with no per-side split (data/stash.ts).
   *
   * REQUIRED, and null when the sides carry the amount (2026-09-24). It was optional, and the
   * running pump's "Save session only" never passed it — so a parent who typed 4 oz into the
   * Total and saved had both sides null and no total, and the log said 0 (the owner: "filled in
   * 4 oz, but in the log it shows as 0"). The stash path passed it; this one had simply been
   * allowed to forget. Now no caller can.
   */
  totalOnlyMl: number | null;
  toStash: boolean;
  unit: VolumeUnit;
}

/**
 * WHERE THE SLEEP-OR-PLAY QUESTION IS DRAWN (`ask`; 2026-09-29, when it stopped being the phone's
 * own dialog). The confirmation has to be mounted where it is asked from, or iOS cannot present it
 * (`ui/confirm.tsx`): a sheet whose Start or Save can meet the question — sleep and tummy time,
 * the two `RIVAL` types — hands in its own `useConfirm`, mounted inside the capture sheet, so the
 * question comes up over the sheet and the sheet stays. Without one, the question is the shell's
 * (`useShell().confirm`): a CueCoin's start (`LinkRouter`), which has no sheet of its own, and
 * every surface that only stops, pauses or corrects a timer, which never asks at all.
 */
export function useTimerActions(ask?: Confirm) {
  const shell = useShell();
  const question = ask ?? shell.confirm;
  const { context, announce, say } = useWriteContext();
  // the household's word for the module in every sentence here: "playtime" once tummy time
  // has graduated (`modules/useModuleLabels`); the registry's word for the other three
  const { word: wordOf, label: labelOf } = useModuleLabels();
  const { children } = useChild();
  const nameOf = useCallback(
    (childId: string | null) => children.find(c => c.id === childId)?.name ?? null,
    [children],
  );

  /** Sleep, tummy time and breastfeed: stop now and write the entry. Pump has its own path. */
  const stop = useCallback(
    (timer: TimerNow, nowMs: number) =>
      timerWrites.run(endKey(timer.id), async () => {
        const ctx = await context();
        if (ctx === null) return null;
        const { db, ...write } = ctx;
        const startAt = new Date(timer.startedAtMs).toISOString();
        const endAt = new Date(nowMs).toISOString();
        const elapsed = elapsedMs(timer, nowMs);
        let fields: ActivityFields;
        let sentence: string;
        if (timer.type === 'sleep') {
          // NAP OR NIGHT FROM THE START THE ENTRY IS SAVED WITH (care C2, C3): a coin-started sleep
          // has no `meta.kind`, and a corrected start leaves the old one behind. The household's
          // window is read here, at the stop, from the same row every other label reads.
          const window = windowOfRow(await dayWindowRow(db, write.householdId));
          const kind = timerSleepKind(timer, currentTimeZone(), window, nowMs);
          fields = {
            type: 'sleep',
            startAt,
            endAt,
            detail: { kind, wake_count: null, location: null },
          };
          sentence = savedDuration(SLEEP_KIND_LABEL[kind].toLowerCase(), durationLabel(elapsed));
        } else if (timer.type === 'breastfeed') {
          const sides = bankedSides(timer, nowMs);
          const totalMin = minutesOf((sides.left + sides.right) * 1000);
          fields = {
            type: 'breastfeed',
            startAt,
            endAt,
            quantity: totalMin,
            canonicalUnit: 'min',
            detail: {
              first_side: firstSide(timer),
              left_seconds: sides.left,
              right_seconds: sides.right,
            },
          };
          // the sides add up to the total the toast shows (`sideMinutes`)
          sentence = savedBreastfeedSides(sides.left, sides.right);
        } else {
          fields = {
            type: 'tummy',
            startAt,
            endAt,
            quantity: minutesOf(elapsed),
            canonicalUnit: 'min',
          };
          sentence = savedDuration(wordOf('tummy'), durationLabel(elapsed));
        }
        const outcome = await stopTimer(db, systemClock, {
          ...write,
          ...fields,
          timerId: timer.id,
          childId: timer.childId,
        });
        announce(outcome, sentence);
        return outcome;
      }),
    [wordOf, announce, context],
  );

  /**
   * ASLEEP OR PLAYING, NEVER BOTH (the owner, 2026-09-27: *"if baby sleeping, then they cannot be
   * playing … ask if you would like us to end sleeping log?"*; `sleepPlay.ts` has the rule). Before
   * tummy time is started or saved for a baby whose sleep is running — or a sleep started while
   * their tummy time runs — the parent is asked (`askSleepPlay`), and on "End sleep" that running
   * timer is ended by `stop` above: the card's own write, with its entry, its toast and its Undo,
   * at the instant the new one begins (`rivalEndMs`).
   *
   * EVERY ANSWER FIRST, THEN THE ENDS. With Both, each baby it would end is asked in turn, and a
   * Cancel for any of them writes nothing at all — no sleep ended, nothing saved. True when the way
   * is clear: nothing stood in it, or everything that did has been ended (or was already gone —
   * stopped on the other phone while the question was up). False writes nothing more.
   *
   * `via` is where the question is drawn when it is not this hook's own: the tummy sheet's "+ Liam"
   * asks from a toast, after its sheet has closed, so it asks through the shell.
   */
  const endRivals = useCallback(
    async (
      adding: { type: TimerType; startMs: number; endMs?: number },
      childIds: readonly (string | null)[],
      running: readonly TimerNow[],
      clock: { clock24: boolean; timeZone: string },
      via: Confirm = question,
    ): Promise<boolean> => {
      const nowMs = Date.now();
      const rivals = childIds.flatMap(childId => {
        const rival = rivalFor(running, { ...adding, childId }, nowMs);
        return rival === null ? [] : [rival];
      });
      for (const rival of rivals) {
        const endMs = rivalEndMs(adding, rival, nowMs);
        const yes = await askSleepPlay(
          sleepPlayQuestion({
            rival: rival.type,
            name: nameOf(rival.childId),
            playWord: wordOf('tummy'),
            finished: adding.endMs !== undefined,
            endClock: endIsNow(endMs, nowMs)
              ? null
              : formatClock(endMs, clock.clock24, clock.timeZone),
          }),
          via,
        );
        if (!yes) return false;
      }
      for (const rival of rivals) {
        const ended = await stop(rival, rivalEndMs(adding, rival, nowMs));
        // committed: ended here; suppressed: already gone. Anything else, and nothing goes on
        if (ended === null || !(ended.committed || ended.suppressed)) return false;
      }
      return true;
    },
    [nameOf, wordOf, stop, question],
  );

  const start = useCallback(
    async (args: StartArgs, running: readonly TimerNow[]) => {
      const clash = running.find(t => t.type === args.type && t.childId === args.childId);
      if (clash) {
        haptic('warning');
        say(alreadyRunning(wordOf(args.type), args.childName));
        return null;
      }
      // a second tap while the first start is still being written is the same start — and while
      // its question below is on the screen
      return timerWrites.run(startKey(args.type, args.childId), async () => {
        // ASLEEP OR PLAYING, NEVER BOTH: this baby's running rival is asked about, and ended where
        // this timer begins, BEFORE anything is written; a Cancel starts nothing (`endRivals`)
        const clear = await endRivals(
          { type: args.type, startMs: args.startedAtMs },
          [args.childId],
          running,
          args,
        );
        if (!clear) return null;
        const ctx = await context();
        if (ctx === null) return null;
        const { db, ...write } = ctx;
        const outcome = await startTimer(db, systemClock, {
          ...write,
          childId: args.childId,
          type: args.type,
          startedAt: new Date(args.startedAtMs).toISOString(),
          ...(args.activeSide ? { activeSide: args.activeSide } : {}),
          ...(args.meta ? { meta: args.meta } : {}),
        });
        // a start that was written is the double tap (see the header). One the database refused —
        // it already had one the list above had not re-read yet (`startTimer` refuses a second) —
        // gets the same sentence as the clash, because it is the same fact, and the same feel
        if (outcome.committed) {
          haptic('double');
        } else {
          haptic('warning');
          say(alreadyRunning(wordOf(args.type), args.childName));
        }
        // NO TOAST FROM THE START ITSELF. The owner took the start's toast off every start on
        // 2026-09-16 ("when clicking start pumping, there is an empty white small box that shows
        // up … don't let this shown for an activity started (not ended)"); the box turned out, the
        // next day, to be the toast host collapsing every toast, a save's too (`ui/toast.tsx`).
        // A start made from the start row said its time on its Start before the tap, and the
        // running card on Today is the rest of the confirmation. A start that could not say it —
        // a one-tap Start tile, a CueCoin — is confirmed by its caller through `confirmStart`,
        // below, with its time and a way to change it (the owner, 2026-09-29).
        // The STOP path still announces, because that one writes an entry and offers Undo.
        return outcome;
      });
    },
    [wordOf, context, say, endRivals],
  );

  /**
   * THE START'S TIME, SAID AFTER THE FACT, WITH UNDO (since 2026-10-06; it was Change) (the owner, 2026-09-29: *"we had starting
   * time confirmation … the feedback says that this is helpful. especially since there were
   * distractions"*): `Pumping started at 9:41 PM` · **Change**, for a start whose time was not on
   * the screen before the tap — a Start tile that starts on its tap, a CueCoin. Change opens the
   * timer's own sheet, where a timer this young offers the same chips as the start row
   * (`RunningPanel`, `isYoungTimer`). No Undo: the running card's stop and Discard are the way
   * back from a start, and a start wrote no entry to take back. Nothing is felt here — the write
   * was felt as the start's own `double` — and the babies are named only when there are several.
   */
  const confirmStart = useCallback(
    (c: {
      type: TimerType;
      startedAtMs: number;
      childIds: readonly (string | null)[];
      clock24: boolean;
      timeZone: string;
      /** The timers this start wrote, which Undo takes back (`WriteOutcome.intentId`). */
      timerIds: readonly string[];
    }) => {
      const words = startWordsFor(c.type, { label: labelOf('tummy'), word: wordOf('tummy') });
      const names =
        children.length > 1
          ? c.childIds.flatMap(id => {
              const name = nameOf(id);
              return name === null ? [] : [name];
            })
          : [];
      // UNDO TAKES THE START BACK: each timer it wrote is discarded, which writes no entry
      const undo = async () => {
        const ctx = await context();
        if (ctx === null) return;
        const { db, ...write } = ctx;
        let any = false;
        for (const timerId of c.timerIds) {
          const outcome = await timerWrites.run(endKey(timerId), () =>
            discardTimer(db, systemClock, { ...write, timerId }),
          );
          if (outcome?.committed) any = true;
        }
        if (any) say(TIMER_START.undone(words.noun));
      };
      say(
        TIMER_START.started(words.noun, formatClock(c.startedAtMs, c.clock24, c.timeZone), names),
        // QUEUED, never over another toast: tummy time started over a running sleep has just
        // saved that sleep, and its "Saved: nap 45m" carries the Undo a start must not hide
        { secondary: { label: TIMER_START.undo, onPress: () => void undo() }, queue: true },
      );
    },
    [children.length, context, labelOf, nameOf, say, wordOf],
  );

  /** `Stop and enter output`: the pump session, and the stash when asked (§6.3). */
  const finishPump = useCallback(
    async (timer: TimerNow | null, startedAtMs: number, nowMs: number, out: PumpOutput) => {
      const write = async () => {
        const ctx = await context();
        if (ctx === null) return null;
        const { db, ...rest } = ctx;
        const total = out.totalOnlyMl ?? (out.leftMl ?? 0) + (out.rightMl ?? 0);
        const result = await storePumpSession(db, systemClock, {
          ...rest,
          startAt: new Date(startedAtMs).toISOString(),
          endAt: new Date(nowMs).toISOString(),
          leftMl: out.leftMl,
          rightMl: out.rightMl,
          totalOnlyMl: out.totalOnlyMl ?? null,
          timerId: timer?.id ?? null,
          store: out.toStash,
        });
        const length = nowMs - startedAtMs;
        announce(
          result,
          pumpSaved(volumeLabel(total, out.unit), length >= 60_000 ? durationLabel(length) : null),
        );
        return result;
      };
      // a running pump's finish holds its timer like a stop does; a session typed in by hand
      // has no timer to hold
      return timer === null ? write() : timerWrites.run(endKey(timer.id), write);
    },
    [announce, context],
  );

  const pause = useCallback(
    async (timer: TimerNow, nowMs: number) => {
      const ctx = await context();
      if (ctx === null) return;
      const { db, ...write } = ctx;
      const sides = bankedSides(timer, nowMs);
      // banking the open side and closing its run IS the pause for a breastfeed (§6.2): the
      // seconds are the state, and no side TIMING is what "paused" means. `active_side` is left
      // as it is — it is how Resume knows which side to open again (`resumeSide`; feeding C9)
      await patchTimer(db, systemClock, {
        ...write,
        timerId: timer.id,
        patch: {
          side_started_at: null,
          left_seconds: sides.left,
          right_seconds: sides.right,
        },
      });
    },
    [context],
  );

  const resume = useCallback(
    async (timer: TimerNow, side: 'LEFT' | 'RIGHT', nowMs: number) => {
      const ctx = await context();
      if (ctx === null) return;
      const { db, ...write } = ctx;
      await switchSideWrite(db, systemClock, {
        ...write,
        timerId: timer.id,
        to: side,
        leftSeconds: timer.leftSeconds,
        rightSeconds: timer.rightSeconds,
        at: new Date(nowMs).toISOString(),
      });
    },
    [context],
  );

  const switchSide = useCallback(
    async (timer: TimerNow, nowMs: number) => {
      const ctx = await context();
      if (ctx === null) return;
      const { db, ...write } = ctx;
      const sides = bankedSides(timer, nowMs);
      await switchSideWrite(db, systemClock, {
        ...write,
        timerId: timer.id,
        // the side the button names: the other one, or — paused — the left (`switchTarget`)
        to: switchTarget(timer),
        leftSeconds: sides.left,
        rightSeconds: sides.right,
        at: new Date(nowMs).toISOString(),
      });
    },
    [context],
  );

  const correctStart = useCallback(
    async (timer: TimerNow, startedAtMs: number) => {
      const ctx = await context();
      if (ctx === null) return;
      const { db, ...write } = ctx;
      // a breastfeed's minutes are its sides, so the correction moves them too (feeding C10)
      const c = startCorrection(timer, startedAtMs, Date.now());
      await correctStartWrite(db, systemClock, {
        ...write,
        timerId: timer.id,
        startedAt: new Date(c.startedAtMs).toISOString(),
        ...(c.sides
          ? {
              sides: {
                leftSeconds: c.sides.leftSeconds,
                rightSeconds: c.sides.rightSeconds,
                sideStartedAt:
                  c.sides.sideStartedAtMs === null
                    ? null
                    : new Date(c.sides.sideStartedAtMs).toISOString(),
              },
            }
          : {}),
      });
    },
    [context],
  );

  const discard = useCallback(
    (timer: TimerNow) =>
      timerWrites.run(endKey(timer.id), async () => {
        const ctx = await context();
        if (ctx === null) return;
        const { db, ...write } = ctx;
        const outcome = await discardTimer(db, systemClock, { ...write, timerId: timer.id });
        if (outcome.committed) say(SESSION_DISCARDED);
      }),
    [context, say],
  );

  return {
    start,
    confirmStart,
    stop,
    endRivals,
    finishPump,
    pause,
    resume,
    switchSide,
    correctStart,
    discard,
    nameOf,
  };
}
