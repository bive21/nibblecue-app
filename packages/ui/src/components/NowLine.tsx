/**
 * NowLine — where now is in a day's list (`scheduleMotion.ts` has the numbers and says why each is
 * what it is): a thin line across the list with a small dot at its start, laid over the rows at the
 * place the caller measured, and moved there by one value on the native driver.
 *
 * FRAME BY FRAME. The list comes into view (`arrival` is new, or the line first appears): the line
 * stands at the top of the list and glides down to its place — 300 ms for a place near the top,
 * 700 for one far down, easing out onto it, a beat after the page. Then it stays. When the clock
 * passes a slot (`at`, the caller's word for which slot is next, changes) it glides on to its new
 * place in 360 ms. When only the page's layout moved it — a fold opened above, a row grown — it is
 * simply where the rows put it, with no glide to lag behind them.
 *
 * REDUCE MOTION AND THE AMBER NIGHT (`motionStill`): the line is simply at now. Night draws it in
 * the night palette's own amber (`nowInk`), nothing lit.
 *
 * NO TIMESTAMP ON THE LINE (2026-10-05). A "Now · clock" label sat on the stroke and read as
 * struck-through text. The divider is only the thin line and dot between rows; the phone's clock
 * and the next slot's caption already say the time.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/contrast';
import { NOW_GLIDE, NOW_LINE, NOW_STEP, nowGlideMs, nowInk } from './scheduleMotion';
import { motionStill } from './tickDraw';

export interface NowLineProps {
  /** Where the line's middle goes, from the top of the list, already kept inside it (`nowLineY`). */
  y: number;
  /** Which slot is next, or anything that stands for "none": a change is the clock moving on. */
  at: string;
  /** A new value is the list coming into view again: the line glides down from the top. */
  arrival: number;
  /** The dot's middle, from the list's left edge: the rows' gutter. */
  dotX: number;
  testID?: string;
}

const EASE_OUT = Easing.bezier(...NOW_GLIDE.ease);
const EASE_STEP = Easing.bezier(...NOW_STEP.ease);

export function NowLine({ y, at, arrival, dotX, testID }: NowLineProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const ink = nowInk(t.color, t.theme);
  const half = NOW_LINE.dot / 2;

  // the line's TOP, so its middle is at `y`; constructed at the top of the list, or at now when still
  const [top] = useState(() => new Animated.Value(still ? y - half : -half));
  const latest = useRef(y);
  latest.current = y;
  const gliding = useRef(false);
  const lastAt = useRef(at);

  // THE ARRIVAL: from the top of the list down to now, once each time the list comes into view
  useEffect(() => {
    if (still) {
      top.setValue(latest.current - half);
      return undefined;
    }
    top.setValue(-half);
    gliding.current = true;
    const run = Animated.timing(top, {
      toValue: latest.current - half,
      duration: nowGlideMs(latest.current),
      delay: NOW_GLIDE.delayMs,
      easing: EASE_OUT,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (!finished) return;
      gliding.current = false;
      // the place, or wherever now moved to while the line was on its way
      top.setValue(latest.current - half);
    });
    return () => {
      gliding.current = false;
      run.stop();
    };
    // the glide plays per arrival; a change of place later is the effect below's
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrival, by design
  }, [arrival, still]);

  // AFTER IT: a slot passed glides on; anything else is simply the new place
  useEffect(() => {
    const stepped = lastAt.current !== at;
    lastAt.current = at;
    // mid-arrival the glide lands on the latest place itself
    if (gliding.current) return undefined;
    if (!stepped || still) {
      top.setValue(y - half);
      return undefined;
    }
    const run = Animated.timing(top, {
      toValue: y - half,
      duration: NOW_STEP.ms,
      easing: EASE_STEP,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [y, at, still, top, half]);

  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.band, { height: NOW_LINE.dot, transform: [{ translateY: top }] }]}
      {...(testID ? { testID } : {})}
    >
      <View
        style={[
          styles.line,
          {
            left: dotX,
            top: half - NOW_LINE.stroke / 2,
            height: NOW_LINE.stroke,
            backgroundColor: withAlpha(ink, NOW_LINE.alpha),
          },
        ]}
      />
      <View
        style={[
          styles.dot,
          {
            left: dotX - half,
            width: NOW_LINE.dot,
            height: NOW_LINE.dot,
            borderRadius: half,
            backgroundColor: ink,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', top: 0, left: 0, right: 0 },
  line: { position: 'absolute', right: 0 },
  dot: { position: 'absolute', top: 0 },
});
