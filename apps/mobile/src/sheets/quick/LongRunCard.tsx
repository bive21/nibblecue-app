/**
 * THE LONG-RUN ASK, as a strip under the timer it is about (the owner, 2026-09-20: *"add the
 * prompt when activities are still ongoing and ask to adjust. For example, pumping for more
 * than 2 hours continuously is not correct… send the warning ask if it's ended and the option
 * to adjust the correct end time"*).
 *
 * ONE ROW SINCE 2026-09-30 (the owner: *"It is taking to much space… The reminder is taller than
 * the timer card itself"*): the clock, the question, and the two answers, small, in a strip tucked
 * under its timer card rather than a card of its own. The elapsed is heard with the question and
 * not shown, since the card above counts it, and what "It ended" is for is said by the picker it
 * opens. `longRunFit.ts` has the strip's arithmetic: when the answers go under the question (a
 * large text size, never a broken word), and why it is never taller than its card.
 *
 * `packages/core/schedule/longRun.ts` decides WHETHER to ask and what the limits are, and says
 * why an app may ask about its own stopwatch without saying anything about a baby. This file is
 * the two answers.
 *
 *   * **Still going** — the snooze, shared by every surface (`longRun.ts`). It is first and it
 *     is the plain one, because a session that really is running is the case the app must not
 *     make a parent argue with.
 *   * **It ended** — the time picker, then the ordinary stop at the instant they chose. Nothing
 *     new writes the entry: for a pump this is the same frozen stop the card's own button
 *     performs (`stopped.ts`), which opens the output form with the end already fixed, and for
 *     everything else it is `actions.stop` with a past instant instead of `Date.now()`. The rule
 *     is `timerEnd.ts`'s, shared with the running sheet's End time (2026-09-29), so the two can
 *     never disagree about when a timer could have ended.
 *
 * WHY THE PICKER OPENS AT `suggestedEndMs` and not at now: the parent is here because the timer
 * ran past the point where it is likelier to have been left on than to still be going, so every
 * correction from there moves BACKWARD. Opening at the current time would start them at the one
 * value they have already told the app is wrong. It is a starting point for a wheel, not a time
 * the app ever writes by itself — nothing is saved until they pick one.
 *
 * AND A TIME BEFORE THE START IS REFUSED, not clamped. `applyCustom` already rolls a time later
 * than now back to yesterday, which is right for a start and would be silently wrong here: it
 * would turn "I meant 10:30 this morning" into a session that ran for twenty-three hours. The
 * toast says so and nothing is written (`endTimerAt`, which also refuses a feed's end its sides
 * were still counting at).
 */
import { longRunNextChangeMs, longRunning, type LongRunInput } from '@nibblecue/core';
import {
  announceElapsed,
  applyCustom,
  BodyStrong,
  Button,
  composite,
  Icon,
  TINT_EDGE,
  useMotionAwake,
  useTheme,
  wallClockOf,
} from '@nibblecue/ui';
import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import type { TimerNow } from '../../db/queries/today';
import { LONG_RUN, longRunTitleWord, TIMER_WORD } from './copy';
import { snoozeLongRun, useLongRunSnoozes } from './longRun';
import { LONG_RUN_STRIP, longRunStacks } from './longRunFit';
import { useStoppedAt } from './stopped';
import { useTimePicker } from './timePicker';
import { useEndTimer } from './useEndTimer';

/** The two answers, in the order the strip draws them: "still going" first (the header says why). */
const ANSWERS = [LONG_RUN.stillGoing, LONG_RUN.ended] as const;

export interface LongRunCardProps {
  timer: TimerNow;
  clock24: boolean;
  timeZone: string;
  /** The household's own word for the module, where it has one ("Playtime"). */
  word?: string;
  /** The parent ended it: the sheet that owns this card can close itself. */
  onEnded?: () => void;
  /**
   * Drawn inside the timer's own sheet (`RunningPanel`), rather than under Today's card. For a
   * pump that changes what "It ended" does: the output form is already on the screen, so the stop
   * is marked and nothing is opened or closed (feeding C8 / timers 1).
   */
  inSheet?: boolean;
  /** Required: both surfaces that draw this card are in the e2e id inventory. */
  testID: string;
}

/**
 * THE CLOCK THE ASK IS READ ON — read at the instant its answer can change
 * (`longRunNextChangeMs`) and at no other; afresh whenever the timer or its snooze changes; and
 * when the page comes back in front, if a change came due while it was away (`useMotionAwake`,
 * docs/DESIGN_SYSTEM.md §7.1).
 *
 * It was the timer card's own one-second tick (`useTimerNow`): this whole card rendered every
 * second — its hooks, its time picker, the timer actions — beside the card's own tick, for every
 * running timer, for as long as it ran, to answer a question that turns at an hour at the
 * soonest. Between two changes the answer is the same at every instant (core's test holds that),
 * so a clock that stopped anywhere in between still draws the right card.
 */
function useLongRunNow(run: Omit<LongRunInput, 'nowMs'>): number {
  const awake = useMotionAwake();
  const [now, setNow] = useState(() => Date.now());
  // a new timer, a pause banked, a "still going": read afresh in the same render, as the tick did
  const key = `${run.type}|${run.startedAtMs}|${run.pausedMs ?? 0}|${run.snoozedAtMs ?? ''}`;
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setNow(Date.now());
  }
  const wakeAt = longRunNextChangeMs({ ...run, nowMs: now });
  useEffect(() => {
    if (!awake) return;
    const wait = wakeAt - Date.now();
    if (wait <= 0) {
      setNow(Date.now());
      return;
    }
    // an hour at most: a start far in the future (a clock that moved) is looked at again then,
    // rather than handed to a timer that cannot hold a wait that long — which is why `now` is a
    // dependency: a look that finds nothing due yet has to plan the next one
    const id = setTimeout(() => setNow(Date.now()), Math.min(wait, LOOK_AGAIN_MS));
    return () => clearTimeout(id);
  }, [awake, wakeAt, now]);
  return now;
}

/** The longest the card waits for its next change without looking at the clock again. */
const LOOK_AGAIN_MS = 60 * 60_000;

export function LongRunCard({
  timer,
  clock24,
  timeZone,
  word,
  onEnded,
  inSheet = false,
  testID,
}: LongRunCardProps) {
  const t = useTheme();
  // a pump the parent has already stopped is not "still pumping": its output form is the answer
  const stoppedAtMs = useStoppedAt(timer.id);
  const snoozes = useLongRunSnoozes();
  const picker = useTimePicker(clock24);
  // the strip's own width, for whether its answers keep to the row (`longRunStacks`)
  const [width, setWidth] = useState(0);
  /*
    INSIDE THE PUMP SHEET THE FORM IS ALREADY HERE (feeding C8 / timers 1): "It ended" only marks
    the stop there. It used to open the pump sheet over itself and then close it (`onEnded` is the
    sheet's own close), and the close let the stop go — the sheet came back running, "Still
    pumping?" asked again, and the session was saved ending at the save, hours after the time the
    parent had just picked. From Today, the output form still has to be opened (`useEndTimer`).
  */
  const endAt = useEndTimer({ inSheet, onEnded });

  const run = {
    type: timer.type,
    startedAtMs: timer.startedAtMs,
    pausedMs: timer.pausedMs,
    snoozedAtMs: snoozes[timer.id] ?? null,
  };
  const now = useLongRunNow(run);
  const ask = longRunning({ ...run, nowMs: now });
  /*
    NOT OVER A STOPPED PUMP (timers 19). Once the parent has stopped it — on the card, or with this
    card's own "It ended" — the session has an end, and asking "Still pumping?" over the form that
    is asking for its output invites the parent to end it a second time, at a different instant.
  */
  if (ask === null || stoppedAtMs !== null) return null;

  /* the household's word for the module, and the verb for the question ("Still pumping?") */
  const spoken = (word ?? TIMER_WORD[timer.type]).toLowerCase();
  const question = LONG_RUN.title(longRunTitleWord(timer.type, spoken));
  // what a screen reader hears: the question, and the elapsed the card above shows the eye
  const heard = `${question} ${LONG_RUN.running(announceElapsed(ask.elapsedMin * 60_000))}`;
  const stacked = longRunStacks(width, question, ANSWERS, t.fontScale.body);
  // the ask's own warm tint, as the card had it, edged in its hue the way a tinted panel is
  const tint = composite(t.color.surfaceSolid, t.color.warn, 0.12);
  const S = LONG_RUN_STRIP;

  return (
    /*
      ONE STRIP, NOT A CARD (the owner, 2026-09-30). Flat, with no lift of its own: a shadow is what
      makes a panel a card, and this belongs to the timer card above it, which the caller sets it
      under by `LONG_RUN_STRIP.tuck`. Its padding across is the card's, so the clock lines up with
      the card's words; up and down it is the answers' own slop, so the strip is one answer tall
      and a little air: 46 pt on one line at the phone's own text size.
    */
    <View
      onLayout={e => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w !== width) setWidth(w);
      }}
      style={[
        stacked ? styles.stacked : styles.row,
        {
          gap: S.gap,
          paddingHorizontal: S.padX,
          paddingVertical: S.padY,
          borderRadius: t.radius.m,
          borderWidth: 1,
          borderColor: composite(tint, t.color.warn, TINT_EDGE),
          backgroundColor: tint,
        },
      ]}
      testID={testID}
    >
      <View style={[styles.head, stacked ? null : styles.grow, { gap: S.gap }]}>
        <Icon name="clock" size={S.icon} color={t.color.warn} />
        <BodyStrong
          style={styles.grow}
          maxFontSizeMultiplier={S.fontCap}
          accessibilityLabel={heard}
          testID={`${testID}.question`}
        >
          {question}
        </BodyStrong>
      </View>
      <View style={[styles.actions, { gap: S.gap }]}>
        <Button
          label={LONG_RUN.stillGoing}
          variant="secondary"
          size="xs"
          maxFontSizeMultiplier={S.fontCap}
          onPress={() => snoozeLongRun(timer.id, Date.now())}
          testID={`${testID}.still`}
        />
        <Button
          label={LONG_RUN.ended}
          size="xs"
          maxFontSizeMultiplier={S.fontCap}
          onPress={() =>
            void picker
              .pick(wallClockOf(ask.suggestedEndMs, timeZone), {
                title: LONG_RUN.pickTitle,
                set: LONG_RUN.pickSet,
              })
              .then(picked => {
                if (!picked) return;
                void endAt(timer, applyCustom(picked, Date.now(), timeZone));
              })
          }
          testID={`${testID}.ended`}
        />
      </View>
      {picker.element}
    </View>
  );
}

const styles = StyleSheet.create({
  // the clock, the question and the answers on one line, each centered on it
  row: { flexDirection: 'row', alignItems: 'center' },
  // a large text size: the answers under the question, at the right
  stacked: { flexDirection: 'column' },
  head: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
});
