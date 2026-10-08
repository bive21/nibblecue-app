/**
 * MealWindow — a meal's own small sky at the start of its row in the solids rhythm (the owner,
 * 2026-09-28: *"make it interesting too, not just boring table"*): the solids sheet's scene for the
 * meal — a dawn, noon, the afternoon, a dusk (`theme/mealSky.ts`) — with the sun standing at the
 * height of the row's time in the household's day. Change the time and the sun glides along its arc
 * to the new height; switch the meal off and the sun sets behind the hill as the window dims; the
 * row a new snack takes pops in (`MealRowPop`). `mealWindow.ts` holds every number and why.
 *
 * DECORATION, AND HIDDEN AS SUCH: no touch, nothing read aloud. The row's switch is named for the
 * meal and says whether it is on; its time button says the time; nothing here is said by the picture
 * alone. No word is written on the sky.
 *
 * TRANSFORMS AND OPACITY ONLY, ON THE NATIVE DRIVER: the sun is one view moved along the arc by one
 * value, with the drop behind the hill a second view inside it moved by another, and the dimming a
 * veil in the table's own color over the picture (a veil rather than the window's own opacity, so
 * Android never has to composite the stacked layers to fade them as one). Reduce motion, Calm motion
 * and the amber Night set every value where its move would end (`mealWindowStill`).
 */
import type { DayWindow, Meal } from '@nibblecue/core';
import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { mealSkyFor } from '../theme/mealSky';
import { useTheme } from '../theme/ThemeProvider';
import { SUN_HIGHLIGHT } from './dayNightSwitch';
import {
  dayFraction,
  hillPath,
  MEAL_ROW_POP,
  MEAL_WINDOW,
  MEAL_WINDOW_SINK_MS,
  MEAL_WINDOW_STARS,
  mealWindowFrames,
  mealWindowStill,
  planSink,
  planSunGlide,
} from './mealWindow';
import { num } from './PictureToggle';
import { SKY_EASE } from './themeSkyToggle';

export interface MealWindowProps {
  /** Whose sky it is: the meal's own scene from the solids sheet. */
  meal: Meal;
  /** The row's time, in minutes since local midnight: where in the day the sun stands. */
  minutes: number;
  /** A meal that is off has its sun set behind the hill and its window dimmed. */
  on: boolean;
  /** The household's day, wake to bed: the sun rises at the one and sets at the other. */
  day: DayWindow;
  /** The ground the window sits on, which an off window dims toward. */
  veil: string;
  testID?: string;
}

const GLIDE = Easing.bezier(...SKY_EASE.settle);
const LAND = Easing.bezier(...SKY_EASE.land);
/** Not useId(): its output contains ':', which is not valid in an SVG fragment identifier. */
let instances = 0;

export const MealWindow = memo(function MealWindow({
  meal,
  minutes,
  on,
  day,
  veil,
  testID,
}: MealWindowProps) {
  const t = useTheme();
  const sky = mealSkyFor(t.theme);
  const scene = sky.scenes[meal];
  const still = mealWindowStill(t.reduceMotion, t.theme);
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-mealwin-${(instances += 1)}`;
  const id = uid.current;

  const target = dayFraction(minutes, day).u;
  // constructed AT the resting values, so the first frame is already the right picture
  const u = useRef(new Animated.Value(target)).current;
  const sink = useRef(new Animated.Value(on ? 0 : 1)).current;
  const at = useRef(target);

  useEffect(() => {
    const plan = planSunGlide(at.current, target, still);
    at.current = target;
    if (!plan.animate) {
      // set, even over a glide in flight: calm turned on mid-glide must not leave the sun half way
      u.setValue(target);
      return;
    }
    const run = Animated.timing(u, {
      toValue: target,
      duration: plan.duration,
      easing: GLIDE,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [u, target, still]);

  useEffect(() => {
    const plan = planSink(on, still);
    if (!plan.animate) {
      sink.setValue(plan.to);
      return;
    }
    const run = Animated.timing(sink, {
      toValue: plan.to,
      duration: MEAL_WINDOW_SINK_MS,
      easing: LAND,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [sink, on, still]);

  const anim = useMemo(() => {
    const f = mealWindowFrames();
    return {
      arc: { transform: [{ translateX: num(u, f.sunX) }, { translateY: num(u, f.sunY) }] },
      drop: { transform: [{ translateY: num(sink, f.sink) }] },
      veil: { opacity: num(sink, f.veil) },
    };
  }, [u, sink]);

  const { size, horizon, sun: r, rim } = MEAL_WINDOW;
  const last = Math.max(1, scene.sky.length - 1);

  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.window, { width: size, height: size, borderRadius: t.radius.s }]}
      {...(testID ? { testID } : {})}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient
            id={`${id}-sky`}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={0}
            y2={horizon}
          >
            {scene.sky.map((c, i) => (
              <Stop key={`${c}-${i}`} offset={String(i / last)} stopColor={c} />
            ))}
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#${id}-sky)`} />
        {sky.scenery && meal === 'DINNER'
          ? MEAL_WINDOW_STARS.map(s => (
              <Circle key={`${s.x}-${s.y}`} cx={s.x} cy={s.y} r={s.r} fill={sky.star} />
            ))
          : null}
      </Svg>

      {/* the sun: carried along its arc, and inside that dropped behind the hill when off */}
      <Animated.View
        style={[{ position: 'absolute', left: -r, top: -r, width: 2 * r, height: 2 * r }, anim.arc]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, anim.drop]}>
          <Svg width={2 * r} height={2 * r}>
            <Defs>
              <RadialGradient
                id={`${id}-sun`}
                gradientUnits="userSpaceOnUse"
                cx={2 * r * SUN_HIGHLIGHT.cx}
                cy={2 * r * SUN_HIGHLIGHT.cy}
                r={2 * r * SUN_HIGHLIGHT.r}
                fx={2 * r * SUN_HIGHLIGHT.cx}
                fy={2 * r * SUN_HIGHLIGHT.cy}
              >
                <Stop offset="0" stopColor={sky.sun[0]} />
                <Stop offset="1" stopColor={sky.sun[1]} />
              </RadialGradient>
            </Defs>
            <Circle cx={r} cy={r} r={r} fill={`url(#${id}-sun)`} />
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* the land over the sun, so a sun on the horizon is half behind it and a set one is gone */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Path d={hillPath()} fill={scene.hill} />
        <Rect x={0} y={horizon} width={size} height={size - horizon} fill={scene.ground} />
      </Svg>

      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: veil }, anim.veil]} />
      {/* the rim, drawn OVER the picture: on Android a border is part of the view's own background
          and the layers inside would paint straight over it */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: t.radius.s, borderWidth: rim, borderColor: t.color.line2 },
        ]}
      />
    </View>
  );
});

/**
 * MealRowPop — a row just added to the table pops in (`MEAL_ROW_POP`): from 86% through a hair past
 * full, settling, as it fades in. Played once, from its first frame, when `pop` is true; a row that
 * was already there, and every row under reduce motion, Calm motion or the amber Night, is simply
 * there. Transforms and opacity only: its room is there from the first frame.
 */
export function MealRowPop({ pop, children }: { pop: boolean; children: ReactNode }) {
  const t = useTheme();
  const still = mealWindowStill(t.reduceMotion, t.theme);
  const p = useRef(new Animated.Value(pop && !still ? 0 : 1)).current;
  useEffect(() => {
    if (!pop || still) {
      p.setValue(1);
      return;
    }
    const run = Animated.timing(p, {
      toValue: 1,
      duration: MEAL_ROW_POP.ms,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    // an interrupted pop ends where it would have: the row is never left small or faded
    return () => {
      run.stop();
      p.setValue(1);
    };
  }, [p, pop, still]);
  const style = useMemo(
    () => ({
      opacity: num(p, MEAL_ROW_POP.opacity),
      transform: [{ scale: num(p, MEAL_ROW_POP.scale) }],
    }),
    [p],
  );
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  window: { overflow: 'hidden' },
});
