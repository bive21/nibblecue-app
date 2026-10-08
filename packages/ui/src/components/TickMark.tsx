/**
 * TickMark — the check inside a checklist's circle, which DRAWS ITSELF when it is ticked (the owner,
 * 2026-09-25, of the "that's cool" list: *"Let's try doing everything. I will then review"*). It
 * stands exactly where `<Icon name="check">` stood, at the same size, in the same ink, as the same
 * glyph (`tickDraw.ts` holds the points to `paths.ts`'s), so a row that swaps one for the other
 * looks the same at rest and only differs in the moment the tick is made:
 *
 *   - TICKED: the circle fills as it always did, and the check's stroke runs from its start,
 *     through the corner, to its tip in 220 ms on a pen's curve.
 *   - UNTICKED: it clears. Nothing runs backwards — taking a tick off is not an event — unless the
 *     caller asks for `undraw` (the shopping list, 2026-09-26: *"un-ticking reverses it"*): then
 *     the pen lifts off from the tip back to the start in 140 ms, and the caller keeps the circle
 *     filled under it until it has.
 *   - TICKED WITH `burst` (the caller's word that this tick finishes its list): eight short rays
 *     pop out round the circle as the stroke lands and are gone inside half a second.
 *   - TICKED WITH `dots` (the shopping list's every other tick): five small dots in `dotColor` —
 *     the ink of the thing ticked — are thrown out of the circle and gone in 300 ms. Never with
 *     the rays: the tick that finishes the list keeps its own sparkle.
 *   - ALREADY TICKED when it arrives — a list opened with half of it done, a row scrolled into
 *     view — it is simply drawn. Only a change this component SEES is played, so opening a page
 *     never replays a morning's worth of ticks.
 *
 * REDUCE MOTION AND THE AMBER NIGHT draw the end state at once and play nothing (`motionStill`):
 * the tick is whole the moment it is ticked and gone the moment it is not, and no ray or dot is
 * ever mounted. Read from the theme, as `DayNightSwitch` reads it, so a change mid-draw lands on
 * the end state rather than freezing.
 *
 * DECORATION, TO EVERYTHING BUT THE EYE. The control is the caller's checkbox around this — its
 * role, its label, its checked state — and this is hidden from assistive technology and from
 * touch, as the icon it replaces was. The haptic is the caller's too: it knows whether the tick
 * was the parent's own tap or a change arriving from the other phone, and this does not.
 *
 * THE ONE JS-DRIVEN VALUE in the lists' motion is the draw, because a dash offset is a prop of the
 * SVG path and the native driver animates styles only (`tickDraw.ts`). One path, 220 ms (or 140
 * run back), and only while a tick is being made or taken off. The sparkles are opacity and
 * transforms on the native driver.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import type { Frame } from './dayNightSwitch';
import {
  BURST_DELAY_MS,
  BURST_MS,
  burstFrames,
  dotFrames,
  DOTS_DELAY_MS,
  DOTS_MS,
  motionStill,
  RAY_THICK,
  TICK_DRAW_MS,
  TICK_EASE,
  TICK_GRID,
  TICK_STROKE,
  TICK_UNDRAW_MS,
  tickDash,
  tickFrames,
  tickPath,
} from './tickDraw';

export interface TickMarkProps {
  /** Ticked: the mark is there. It draws itself when this turns true while it is on screen. */
  checked: boolean;
  /** The mark's box, as `Icon`'s `size`: the check it replaces was drawn at 15. */
  size: number;
  /** The mark's ink — the ink on the filled circle it sits in (`onAccent`). */
  color: string;
  /** The circle's radius: the rays start just outside it. */
  ring: number;
  /**
   * THIS TICK FINISHES ITS LIST: the sparkle plays with the next draw. Read at the moment the tick
   * is made, so a caller that sets it on the press and clears it afterwards stops nothing.
   */
  burst?: boolean;
  /** The rays' ink, on the ground round the circle: the accent, measured there at 3:1. */
  burstColor?: string;
  /**
   * THIS TICK THROWS DOTS: five small ones in `dotColor` play with the next draw, unless `burst`
   * does. Read at the moment the tick is made, as `burst` is.
   */
  dots?: boolean;
  /** The dots' ink, on the ground round the circle: measured there at 3:1 by the caller. */
  dotColor?: string;
  /**
   * Unticked, run the stroke back from its tip instead of clearing it at once. The caller keeps
   * something under it to be seen against — the shopping list keeps its circle filled while it runs.
   */
  undraw?: boolean;
}

type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;
/** Which sparkle is playing round the circle, if any. */
type Sparkle = 'rays' | 'dots';

// the check's own path, and a version of it that takes an animated dash offset
const D = tickPath();
const DASH = tickDash();
const DASH_ARRAY = [...DASH.dasharray];
const AnimatedPath = Animated.createAnimatedComponent(Path);
const EASE = Easing.bezier(...TICK_EASE);
/** The viewBox every glyph in the set is drawn in (`Icon.tsx`), so the stroke scales as its does. */
const VIEW_BOX = `0 0 ${TICK_GRID} ${TICK_GRID}`;

export function TickMark({
  checked,
  size,
  color,
  ring,
  burst = false,
  burstColor,
  dots = false,
  dotColor,
  undraw = false,
}: TickMarkProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  // constructed AT the resting value: a tick that arrives ticked is drawn on its first frame
  const draw = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  // what this mark last saw, so only a change it witnessed is played
  const was = useRef(checked);
  // the caller's words, read when the tick is made rather than as dependencies: a caller clearing
  // one once the tick has landed must not restart, or stop, the draw it asked for
  const wantsBurst = useRef(burst);
  const wantsDots = useRef(dots);
  const runsBack = useRef(undraw);
  const [bursting, setBursting] = useState<Sparkle | null>(null);
  // the stroke is being run back: it is still drawn until it has gone
  const [undrawing, setUndrawing] = useState(false);

  useLayoutEffect(() => {
    wantsBurst.current = burst;
    wantsDots.current = dots;
    runsBack.current = undraw;
  }, [burst, dots, undraw]);

  /*
    LAYOUT effects, not passive ones: each branch below SETS the value the next frame shows, and a
    passive effect would let one frame of the old value through first — a ticked mark whose parent
    turned reduce motion off mid-list would vanish for a frame before being set whole, and the
    caller's `burst` would be read a frame late.
  */
  useLayoutEffect(() => {
    const ticked = checked && !was.current;
    const unticked = !checked && was.current;
    was.current = checked;
    if (!checked) {
      setBursting(null);
      // unticking just clears it — unless the caller asked for the stroke run back, and it may move
      if (!unticked || !runsBack.current || still) {
        draw.setValue(0);
        setUndrawing(false);
        return;
      }
      setUndrawing(true);
      const back = pen(draw, 0);
      back.start(({ finished }) => {
        if (finished) setUndrawing(false);
      });
      return () => back.stop();
    }
    setUndrawing(false);
    if (!ticked || still) {
      // arrived ticked, or reduce motion / Night changed while ticked: the end state, at once
      draw.setValue(1);
      if (still) setBursting(null);
      return;
    }
    draw.setValue(0);
    const run = pen(draw, 1);
    run.start();
    if (wantsBurst.current) setBursting('rays');
    else if (wantsDots.current) setBursting('dots');
    // a new change, reduce motion, or the row going away: stop where it is, the branch above sets
    // what the next frame shows
    return () => run.stop();
  }, [checked, still, draw]);

  // the sparkle is mounted only while it plays, and this starts it once it is
  useEffect(() => {
    if (bursting === null) return;
    pop.setValue(0);
    const run = Animated.timing(pop, {
      toValue: 1,
      duration: bursting === 'rays' ? BURST_MS : DOTS_MS,
      delay: bursting === 'rays' ? BURST_DELAY_MS : DOTS_DELAY_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) setBursting(null);
    });
    return () => run.stop();
  }, [bursting, pop]);

  const offset = useMemo(() => num(draw, tickFrames(DASH).offset), [draw]);
  const rays = useMemo(
    () =>
      burstFrames(ring).map(f => {
        const motion: AnimatedStyle = {
          opacity: num(pop, f.opacity),
          // turned to its direction FIRST, so the move and the stretch both run along the ray
          transform: [
            { rotate: `${f.ray.angle}deg` },
            { translateX: num(pop, f.x) },
            { scaleX: num(pop, f.scale) },
          ],
        };
        return { ray: f.ray, motion };
      }),
    [ring, pop],
  );
  const specks = useMemo(
    () =>
      dotFrames(ring).map(f => {
        const motion: AnimatedStyle = {
          opacity: num(pop, f.opacity),
          // turned to its direction first, so the move runs out along it
          transform: [
            { rotate: `${f.dot.angle}deg` },
            { translateX: num(pop, f.x) },
            { scale: num(pop, f.scale) },
          ],
        };
        return { dot: f.dot, motion };
      }),
    [ring, pop],
  );

  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size }}
    >
      {bursting === 'rays' && !still && burstColor !== undefined
        ? rays.map(({ ray, motion }) => (
            <Animated.View
              key={ray.angle}
              style={[
                styles.ray,
                {
                  // centered on the mark, so `translateX` is the distance from the circle's center
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
          ))
        : null}
      {bursting === 'dots' && !still && dotColor !== undefined
        ? specks.map(({ dot, motion }) => (
            <Animated.View
              key={dot.angle}
              style={[
                styles.ray,
                {
                  left: size / 2 - dot.size / 2,
                  top: size / 2 - dot.size / 2,
                  width: dot.size,
                  height: dot.size,
                  borderRadius: dot.size / 2,
                  backgroundColor: dotColor,
                },
                motion,
              ]}
            />
          ))
        : null}
      {checked || undrawing ? (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
          {still ? (
            <Path
              d={D}
              stroke={color}
              strokeWidth={TICK_STROKE}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <AnimatedPath
              d={D}
              stroke={color}
              strokeWidth={TICK_STROKE}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={DASH_ARRAY}
              strokeDashoffset={offset}
            />
          )}
        </Svg>
      ) : null}
    </View>
  );
}

/** The pen, to the whole tick (1) or to none of it (0): the one JS-driven value. */
function pen(draw: Animated.Value, to: 0 | 1) {
  return Animated.timing(draw, {
    toValue: to,
    duration: to === 1 ? TICK_DRAW_MS : TICK_UNDRAW_MS,
    easing: EASE,
    // a dash offset is a prop of the path, not a style: the native driver cannot carry it
    useNativeDriver: false,
  });
}

/** One frame of one value, as `interpolate` takes it: a copy, because the frames are frozen data. */
function num(v: Animated.Value, fr: Frame) {
  return v.interpolate({
    inputRange: [...fr.inputRange],
    outputRange: [...fr.outputRange],
    extrapolate: fr.extrapolate,
  });
}

const styles = StyleSheet.create({
  ray: { position: 'absolute' },
});
