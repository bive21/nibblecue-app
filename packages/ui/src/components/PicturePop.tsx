/**
 * PicturePop — a picture that pops into its frame, with a small sparkle, when it is chosen (the
 * owner, 2026-09-26, of setup's first page; `picturePop.ts` has every number and rule). It wraps
 * the picture the caller already draws — setup's 44 pt plate, the baby's photo or a drawn baby —
 * and moves the box around it: a dip, a swell, a settle, and the checklist's eight rays round it.
 *
 * ONCE PER PICTURE CHOSEN, and only one this component SAW change (`pops`): a plate that opens with
 * a picture in it is simply drawn, and clearing one plays nothing.
 *
 * IT NEVER STOPS HALF WAY. A second picture before the first pop is over, reduce motion turned on,
 * or the plate going away stops the run and sets the picture back to its size in the same breath.
 * Under REDUCE MOTION and in the AMBER NIGHT nothing plays and no ray is ever mounted
 * (`motionStill`): the new picture is simply there.
 *
 * TO EVERYTHING BUT THE EYE IT IS NOT THERE: the rays take no touch and are hidden from assistive
 * technology, and the wrapper adds no name — the control is the caller's (setup's plate is a
 * button named "Choose a picture"), and the picture inside keeps whatever it said before. The
 * haptic is the caller's too: it knows the picture was the parent's own pick.
 *
 * Transforms and opacity only, on the native driver.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { num, type AnimatedStyle } from './PictureToggle';
import { POP_BURST_DELAY_MS, POP_MS, popFrames, popRing, pops, SHEET_MS } from './picturePop';
import { BURST_MS, burstFrames, motionStill, RAY_THICK } from './tickDraw';

export interface PicturePopProps {
  /** What is in the frame — a uri, or null for none. A new one, after the first render, pops. */
  picture: string | null;
  /** The frame's box, in points: the picture's own size. */
  size: number;
  /** The rays' ink, on the ground round the frame (the accent, measured there at 3:1). */
  burstColor: string;
  children: ReactNode;
}

export function PicturePop({ picture, size, burstColor, children }: PicturePopProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  // 1 at rest: the pop's frames start and end at the picture's own size
  const grow = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  // what the frame last held: its first picture, so opening with one pops nothing
  const was = useRef(picture);
  const [bursting, setBursting] = useState(false);

  useEffect(() => {
    const play = pops(was.current, picture, still);
    was.current = picture;
    if (!play) {
      if (still) setBursting(false);
      return;
    }
    grow.setValue(0);
    burst.setValue(0);
    setBursting(true);
    const run = Animated.parallel([
      Animated.timing(grow, {
        toValue: 1,
        duration: POP_MS,
        delay: SHEET_MS,
        // the frames carry the pop's own easing, turning point to turning point (`keyframes.ts`)
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(burst, {
        toValue: 1,
        duration: BURST_MS,
        delay: SHEET_MS + POP_BURST_DELAY_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]);
    run.start(({ finished }) => {
      if (finished) setBursting(false);
    });
    // a second picture, reduce motion, Night, or the plate going away: at its size, never half way
    return () => {
      run.stop();
      grow.setValue(1);
      burst.setValue(0);
    };
  }, [picture, still, grow, burst]);

  const scale = useMemo<AnimatedStyle>(
    () => ({ transform: [{ scale: num(grow, popFrames().scale) }] }),
    [grow],
  );
  const rays = useMemo(
    () =>
      burstFrames(popRing(size)).map(f => {
        const motion: AnimatedStyle = {
          opacity: num(burst, f.opacity),
          // turned to its direction FIRST, so the move and the stretch both run along the ray
          transform: [
            { rotate: `${f.ray.angle}deg` },
            { translateX: num(burst, f.x) },
            { scaleX: num(burst, f.scale) },
          ],
        };
        return { ray: f.ray, motion };
      }),
    [size, burst],
  );

  return (
    <View style={{ width: size, height: size }}>
      {bursting && !still ? (
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={StyleSheet.absoluteFill}
        >
          {rays.map(({ ray, motion }) => (
            <Animated.View
              key={ray.angle}
              style={[
                styles.ray,
                {
                  // centered on the frame, so `translateX` is the distance from its center
                  left: size / 2 - ray.length / 2,
                  top: size / 2 - RAY_THICK / 2,
                  width: ray.length,
                  height: RAY_THICK,
                  borderRadius: RAY_THICK / 2,
                  backgroundColor: burstColor,
                },
                motion,
              ]}
            />
          ))}
        </View>
      ) : null}
      {/* THE FRAME'S OWN SIZE, NOT ITS CONTENT'S (2026-09-29): on iOS a view whose size changes
          while a native-driven transform runs is handed back the transform React last rendered
          (react-native 0.86, `RCTViewComponentView updateLayoutMetrics`), so the box that scales
          never takes its size from the picture being swapped inside it */}
      <Animated.View style={[styles.fill, { width: size, height: size }, scale]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ray: { position: 'absolute' },
  fill: { alignItems: 'center', justifyContent: 'center' },
});
