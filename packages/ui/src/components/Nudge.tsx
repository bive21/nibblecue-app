/**
 * Nudge — a control that breathes once, the moment it becomes the thing to tap (the owner,
 * 2026-09-26, of setup's Continue; `nudge.ts` has the numbers and the rule). It wraps the control
 * the caller already draws and scales the box around it: a three-per-cent swell and a settle, about
 * its own middle, once per page and only for a cue that turned true after the page had arrived.
 *
 * A NEW PAGE STARTS IT AFRESH, AND NOTHING IS REMOUNTED. The caller says which page it is on
 * (`page`); when that changes, the nudge forgets the last page — the cue it opened with, whether it
 * was armed, whether it breathed — and arms again. It is NOT keyed per page on purpose: a key would
 * mount a new control under it on every page, and a screen reader's focus, which sits on Continue
 * as the parent moves through setup, would be thrown off it at every step.
 *
 * TO EVERYTHING BUT THE EYE IT IS NOT THERE: no element, no name, no touch of its own — the button
 * inside is still the button, pressed and read exactly as before, and it takes a tap at every frame
 * of the breath. Nothing is felt: the answer that made the page ready was already a tap, and it was
 * already felt.
 *
 * Under REDUCE MOTION and in the AMBER NIGHT nothing plays (`motionStill`). A breath cut short is
 * set straight back to its size. A transform on the native driver, and nothing else.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { NUDGE_ARM_MS, NUDGE_MS, nudgeFrames, nudges } from './nudge';
import { num, type AnimatedStyle } from './PictureToggle';
import { motionStill } from './tickDraw';

export interface NudgeProps {
  /** The control is ready: its page has what it needs. Breathes when this turns true. */
  cue: boolean;
  /** Which page the control is on; a new one starts the nudge afresh (see the header). */
  page?: string | number;
  children: ReactNode;
}

export function Nudge({ cue, page, children }: NudgeProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  // 1 at rest: the breath's frame starts and ends at the control's own size
  const breath = useRef(new Animated.Value(1)).current;
  const was = useRef(cue);
  const armed = useRef(false);
  const done = useRef(false);

  /* A NEW PAGE, AND THE FIRST ONE: forget what the last page opened with, disarm, and arm again
     once this one has arrived. Declared before the cue's effect, so on the commit a page changes
     in, the new page's own cue is what is remembered before any cue is answered. */
  useEffect(() => {
    was.current = cue;
    armed.current = false;
    done.current = false;
    breath.setValue(1);
    const id = setTimeout(() => {
      armed.current = true;
    }, NUDGE_ARM_MS);
    return () => clearTimeout(id);
    // the cue a page OPENS with is read once, when the page changes: a change of cue on the same
    // page is the next effect's to answer, and must not disarm it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, breath]);

  useEffect(() => {
    const play = nudges(was.current, cue, armed.current, done.current, still);
    was.current = cue;
    if (!play) return;
    done.current = true;
    breath.setValue(0);
    const run = Animated.timing(breath, {
      toValue: 1,
      duration: NUDGE_MS,
      // the frame carries the breath's own easing, turning point to turning point
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    // the page going away, reduce motion or Night: at its size, never half way
    return () => {
      run.stop();
      breath.setValue(1);
    };
  }, [cue, still, breath]);

  const style = useMemo<AnimatedStyle>(
    () => ({ transform: [{ scale: num(breath, nudgeFrames().scale) }] }),
    [breath],
  );
  return <Animated.View style={style}>{children}</Animated.View>;
}
