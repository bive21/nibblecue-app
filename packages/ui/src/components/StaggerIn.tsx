/**
 * StaggerIn — one row of a list seen for the first time, coming in after the ones above it (the
 * owner, 2026-09-26, of the Schedule's moves: *"try everything, if i dont like it, i will ask you to
 * remove"*). `rowMotion.ts` holds the numbers (`lookFrames`, `lookStagger`); this only hands them
 * to one value on the native driver.
 *
 * IT IS NOT AN ARRIVAL. `RowMotion` opens a row's room, and the rows under it slide down to make
 * it; a list seen for the first time is already laid out, and every row is where it belongs from
 * the first frame. So nothing here is layout: the row rises a few points into its own place and
 * fades in, a transform and an opacity, and the page round it never moves.
 *
 * `delay` IS READ ON THE FIRST FRAME ONLY. A row mounted with a delay plays once, that late; a row
 * mounted with none — the same list later, a fold opened, a row that arrived with the next minute —
 * is simply there. A caller that changes it afterwards restarts nothing.
 *
 * AT REST THERE IS NOTHING HERE: no transform, no opacity, only the view that reports the row's
 * layout to a caller that asked (`onLayout`), which a transform never changes.
 *
 * REDUCE MOTION AND THE AMBER NIGHT (`motionStill`): the row is simply there.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { num } from './PictureToggle';
import { LOOK_MS, lookFrames } from './rowMotion';
import { motionStill } from './tickDraw';

export interface StaggerInProps {
  /** Come in this many ms after the list's first frame; null to simply be there. First frame only. */
  delay: number | null;
  /** The row's own layout, for a caller that places something by it. */
  onLayout?: (e: LayoutChangeEvent) => void;
  children: ReactNode;
}

export function StaggerIn({ delay, onLayout, children }: StaggerInProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  // decided on the first frame, so that frame is already the move's own and not the row at rest
  const [plays, setPlays] = useState(() => delay !== null && !still);
  const lateBy = useRef(delay ?? 0);
  const v = useRef(new Animated.Value(0)).current;

  // a LAYOUT effect, so the first frame drawn already has the value at the start of the move
  useLayoutEffect(() => {
    if (!plays) return undefined;
    if (still) {
      // reduce motion or Night arrived mid-move: the row is simply there
      setPlays(false);
      return undefined;
    }
    const run = Animated.timing(v, {
      toValue: 1,
      duration: LOOK_MS,
      delay: Math.max(0, lateBy.current),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) setPlays(false);
    });
    // the row going away, or a change of reduce motion or Night
    return () => run.stop();
  }, [plays, still, v]);

  const style = useMemo(() => {
    const f = lookFrames();
    return { opacity: num(v, f.opacity), transform: [{ translateY: num(v, f.y) }] };
  }, [v]);

  return (
    <Animated.View {...(onLayout ? { onLayout } : {})} style={plays ? style : null}>
      {children}
    </Animated.View>
  );
}
