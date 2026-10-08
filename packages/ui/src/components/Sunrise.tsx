/**
 * Sunrise — the welcome's picture: a small sun coming up over a horizon line, its rays opening
 * out, once (the owner, 2026-09-26, of setup; `sunrise.ts` has every number and why). Drawn for
 * `StepHeader`'s `art`, where it stands in for the eyebrow's sun glyph over "Welcome".
 *
 * ONCE, ON ITS FIRST FRAME: it rises when it is mounted and never again — a re-render, a theme
 * change or reduce motion switched on part way leaves it risen. Under REDUCE MOTION and in the
 * AMBER NIGHT (`motionStill`) it is simply drawn risen, in the theme's own `accent2`.
 *
 * DECORATION, TO EVERYTHING BUT THE EYE: no touch, no name, hidden from assistive technology — the
 * heading under it says what the page is. Transforms and opacity of one clock on the native
 * driver; the ring is one SVG circle that never changes, moved with the view it is drawn in.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { num, type AnimatedStyle } from './PictureToggle';
import { HORIZON, RAY, SKY_FLOOR, SUN, SUNRISE_BOX, SUNRISE_MS, sunriseFrames } from './sunrise';
import { motionStill } from './tickDraw';

export interface SunriseProps {
  testID?: string;
}

const { width: W, height: H } = SUNRISE_BOX;

export function Sunrise({ testID }: SunriseProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const ink = t.color.accent2;
  // 0 is before the sun is up; 1 is risen, which is also the end state when nothing may move
  const clock = useRef(new Animated.Value(still ? 1 : 0)).current;
  const played = useRef(false);

  useEffect(() => {
    if (played.current || still) {
      played.current = true;
      clock.setValue(1);
      return;
    }
    played.current = true;
    const run = Animated.timing(clock, {
      toValue: 1,
      duration: SUNRISE_MS,
      // every part carries its own easing, in its own window of this clock (`sunrise.ts`)
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    // reduce motion, Night, or the page going away part way: risen, never half up
    return () => {
      run.stop();
      clock.setValue(1);
    };
  }, [still, clock]);

  const motion = useMemo(() => {
    const f = sunriseFrames();
    const horizon: AnimatedStyle = { transform: [{ scaleX: num(clock, f.horizon) }] };
    const sun: AnimatedStyle = { transform: [{ translateY: num(clock, f.rise) }] };
    const rays = f.rays.map(r => {
      const style: AnimatedStyle = {
        opacity: num(clock, r.opacity),
        // turned to its direction FIRST, so the move and the stretch both run along the ray
        transform: [
          { rotate: `${r.angle}deg` },
          { translateX: num(clock, r.x) },
          { scaleX: num(clock, r.scale) },
        ],
      };
      return { angle: r.angle, style };
    });
    return { horizon, sun, rays };
  }, [clock]);

  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: W, height: H }}
      {...(testID ? { testID } : {})}
    >
      {/* THE SKY: nothing of it is drawn below the horizon's top, so the sun comes up from behind
          the line rather than sliding over it */}
      <View style={[styles.sky, { width: W, height: SKY_FLOOR }]}>
        <Animated.View style={[styles.sun, { width: W, height: H }, motion.sun]}>
          <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
            <Circle
              cx={SUN.cx}
              cy={SUN.cy}
              r={SUN.r}
              stroke={ink}
              strokeWidth={SUN.stroke}
              fill="none"
            />
          </Svg>
          {motion.rays.map(({ angle, style }) => (
            <Animated.View
              key={angle}
              style={[
                styles.ray,
                {
                  // centered on the sun, so `translateX` is the distance from its center
                  left: SUN.cx - RAY.length / 2,
                  top: SUN.cy - RAY.thick / 2,
                  width: RAY.length,
                  height: RAY.thick,
                  borderRadius: RAY.thick / 2,
                  backgroundColor: ink,
                },
                style,
              ]}
            />
          ))}
        </Animated.View>
      </View>
      <Animated.View
        style={[
          styles.horizon,
          {
            left: HORIZON.inset,
            top: HORIZON.y - HORIZON.thick / 2,
            width: W - 2 * HORIZON.inset,
            height: HORIZON.thick,
            borderRadius: t.radius.pill,
            backgroundColor: ink,
          },
          motion.horizon,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sky: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  sun: { position: 'absolute', left: 0, top: 0 },
  ray: { position: 'absolute' },
  horizon: { position: 'absolute' },
});
