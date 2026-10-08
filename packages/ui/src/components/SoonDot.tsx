/**
 * SoonDot — the small dot beside a slot that is fifteen minutes off or less, breathing
 * (`scheduleMotion.ts` has the numbers): it swells a little and a soft ring of its own ink opens
 * round it and gathers back, once every 2.4 s, on one looped clock on the native driver.
 *
 * THE LOOP RUNS ONLY WHILE IT IS SEEN. `running` is the caller's word that the page is in front,
 * the app is open and the dot's row is on the screen; the moment any of those stops, the loop is
 * stopped and the dot stands at rest — whole, with no ring — until it is seen again. Nothing here
 * keeps a clock turning for a page nobody is looking at (the owner asked whether all of this makes
 * the app heavier: an idle loop is exactly how it would).
 *
 * REDUCE MOTION: a still dot, no ring. THE AMBER NIGHT: no dot at all — at 3 a.m. in a dark room
 * nothing on the screen glows or beckons (`soonDotShown`).
 *
 * DECORATION, TO EVERYTHING BUT THE EYE: no touches, hidden from assistive technology. The row's
 * own caption says how soon the slot is, in words.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { num } from './PictureToggle';
import { SOON_DOT, soonBreath, soonDotShown } from './scheduleMotion';
import { motionStill } from './tickDraw';

export interface SoonDotProps {
  /** The dot's ink: the household's accent, measured at 3:1 on the row it sits on. */
  color: string;
  /** Seen: the page in front, the app open, the row on screen. Only then does it breathe. */
  running: boolean;
  testID?: string;
}

export function SoonDot({ color, running, testID }: SoonDotProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const shown = soonDotShown(t.theme);
  const breathes = shown && !still && running;
  const clock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!breathes) {
      // at rest between breaths: the whole dot and no ring
      clock.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration: SOON_DOT.cycleMs,
        // a clock never eases; its frames do
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    // out of sight, out of the tab, the app put away, the slot no longer soon, or still: stop
    return () => {
      loop.stop();
      clock.setValue(0);
    };
  }, [breathes, clock]);

  const motion = useMemo(() => {
    const f = soonBreath();
    return {
      core: { transform: [{ scale: num(clock, f.core) }] },
      halo: { opacity: num(clock, f.haloOpacity), transform: [{ scale: num(clock, f.halo) }] },
    };
  }, [clock]);

  if (!shown) return null;
  const size = SOON_DOT.size;
  const round = { width: size, height: size, borderRadius: size / 2, backgroundColor: color };
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size }}
      {...(testID ? { testID } : {})}
    >
      {breathes ? <Animated.View style={[styles.layer, round, motion.halo]} /> : null}
      <Animated.View style={[styles.layer, round, breathes ? motion.core : null]} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0 },
});
