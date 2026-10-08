/**
 * ONE CARD'S ENTRANCE AS ONE ANIMATED VALUE, 0 → 1 (`reportReveal.ts` has the timings and why).
 * Every bar in a chart reads its own window of it, so a chart of thirty columns is one animation
 * on the native driver, not thirty.
 *
 * IT ONLY EVER PLAYS FROM HOLD TO PLAY. Constructed at rest (1) for a card that is not waiting, at
 * zero for one that is; it runs once, the first time the card says `play`, and after that nothing
 * the card says can start it again — a refreshed chart, a switched child or range, or the card's
 * own play window closing all find it already begun. Reduce motion and the amber Night set it to
 * the end at once, even part way through.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { Reveal } from './reportReveal';
import { motionStill } from './tickDraw';

export function useRevealProgress(reveal: Reveal, durationMs: number): Animated.Value {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const [progress] = useState(() => new Animated.Value(reveal === 'rest' || still ? 1 : 0));
  // whether the value has left its starting place, one way or the other: it never goes back
  const begun = useRef(reveal === 'rest' || still);
  const running = useRef(false);

  useEffect(() => {
    if (still) {
      begun.current = true;
      running.current = false;
      progress.stopAnimation();
      progress.setValue(1);
      return;
    }
    if (begun.current || reveal === 'hold') return;
    begun.current = true;
    if (reveal === 'rest' || durationMs <= 0) {
      progress.setValue(1);
      return;
    }
    // linear: each bar's own ease-out is in its frame (`growFrame`), so the value is plain time
    running.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) running.current = false;
    });
  }, [reveal, still, durationMs, progress]);

  // the card going away stops whatever is still running; an entrance cut short may run again if
  // the same card mounts again (React's development double-mount), from wherever it stopped
  useEffect(
    () => () => {
      progress.stopAnimation();
      if (running.current) begun.current = false;
      running.current = false;
    },
    [progress],
  );

  return progress;
}
