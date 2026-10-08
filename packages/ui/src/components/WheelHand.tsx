/**
 * WheelHand — the day wheel's clock hand (`wheelHand.ts` has the numbers and says why each is
 * what it is). One SVG, a line and a dot, turned about the wheel's center by one animated value on
 * the native driver.
 *
 * FRAME BY FRAME. The ring appears; the hand stands on the wake mark and sweeps clockwise to now —
 * 320 ms for a hand just past wake, 900 ms for one most of the way round, easing out onto the
 * minute. Then it stays: each new minute (the caller's tick) sets it where the minute is, with no
 * animation. A minute that ticks during the sweep is taken when the sweep lands.
 *
 * REDUCE MOTION AND THE AMBER NIGHT (`motionStill`): the hand is simply drawn at now. Night draws
 * it in the night palette's own amber (`handInk`), nothing lit.
 *
 * IT IS NOT READ OUT. The ring is one spoken sentence already (`ScheduleWheel`'s label) and its
 * picture is hidden from assistive technology; the time of day is the phone's own to announce.
 * It takes no touches, so a stop under it is still tapped as the stop.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { motionStill } from './tickDraw';
import { HAND_SWEEP, handInk, handReach, handSweep, WHEEL_HAND } from './wheelHand';

export interface WheelHandProps {
  /** The wheel's box, its center, the ring's radius and the hub's: `ScheduleWheel`'s own numbers. */
  size: number;
  c: number;
  r: number;
  hub: number;
  /** The wake mark's bearing, where the sweep sets off from. */
  wakeDeg: number;
  /** Now's bearing (`nowBearing`). */
  deg: number;
  testID?: string;
}

const EASE_OUT = Easing.bezier(...HAND_SWEEP.ease);

export function WheelHand({ size, c, r, hub, wakeDeg, deg, testID }: WheelHandProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const ink = handInk(t.color, t.theme);
  const reach = handReach(r, hub);

  // constructed where the first frame belongs: on the wake mark, or already at now when nothing moves
  const [angle] = useState(() => new Animated.Value(still ? deg : wakeDeg));
  const latest = useRef(deg);
  latest.current = deg;
  const sweeping = useRef(false);

  // THE ENTRANCE, once per appearance of the ring: clockwise from the wake mark to now
  useEffect(() => {
    if (still) {
      angle.setValue(latest.current);
      return undefined;
    }
    const s = handSweep(wakeDeg, latest.current);
    sweeping.current = true;
    const run = Animated.timing(angle, {
      toValue: s.to,
      duration: s.durationMs,
      easing: EASE_OUT,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      // a sweep stopped by the ring going away (or by a remount) leaves the value to its successor
      if (!finished) return;
      sweeping.current = false;
      // the same bearing, wrapped — or the minute that ticked while the hand was on its way
      angle.setValue(latest.current);
    });
    return () => {
      sweeping.current = false;
      run.stop();
    };
    // the sweep plays once, from the wake mark the ring had when it appeared; a later change of
    // wake or bed time moves the hand through the minute effect below, never by a second sweep
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per appearance, by design
  }, []);

  // EACH MINUTE, SET — never animated; and at once when motion is switched off mid-sweep
  useEffect(() => {
    if (still) {
      sweeping.current = false;
      angle.stopAnimation();
      angle.setValue(deg);
      return;
    }
    if (!sweeping.current) angle.setValue(deg);
  }, [deg, still, angle]);

  // one interpolation for the hand's life: a new one each render would re-attach it mid-sweep
  const rotate = useMemo(
    () =>
      angle.interpolate({
        inputRange: [0, 360],
        outputRange: ['0deg', '360deg'],
        extrapolate: 'extend',
      }),
    [angle],
  );

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.hand,
        // one layer at the hand's share, so the dot and the line meet without a darker overlap
        { width: size, height: size, opacity: WHEEL_HAND.alpha, transform: [{ rotate }] },
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      {/* drawn pointing at twelve o'clock and turned to the bearing: a bearing IS a clockwise turn */}
      <Svg width={size} height={size}>
        <Line
          x1={c}
          y1={c - reach.inner}
          x2={c}
          y2={c - reach.outer}
          stroke={ink}
          strokeWidth={WHEEL_HAND.stroke}
          strokeLinecap="round"
        />
        <Circle cx={c} cy={c - reach.outer} r={WHEEL_HAND.tip} fill={ink} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hand: { position: 'absolute', left: 0, top: 0 },
});
