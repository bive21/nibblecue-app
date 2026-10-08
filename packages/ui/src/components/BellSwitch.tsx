/**
 * BellSwitch — a switch whose knob is a small bell (the owner, 2026-09-25, of the "that's cool"
 * list, idea 5: *"might not necessarily be useful, but it's cool … Let's try doing everything. I
 * will then review"*). Turning a reminder ON wakes the bell and it RINGS — it stands up as the knob
 * slides across and swings three times, dying away, the clapper a beat behind so it strikes the
 * rim. Turning it OFF puts it to SLEEP — it tips over onto its side as the knob stops, rocks once,
 * and two "z"s drift up out of it and fade. Once each time; at rest it is still.
 *
 * AWAKE IS NOT ALWAYS ON. `bell` says which way this switch means it, with no default:
 * `awake-when-on` or `asleep-when-on`. Every switch in the app is `awake-when-on` since 2026-09-26,
 * quiet hours and Do not disturb included: drawn the other way round, their bell slept while the
 * switch was on, and on the owner's phone that read as a switch saying OFF — "the bell is sleeping
 * when on, when it should be the other way". A parent reads the bell before the track, so the bell
 * tells whether the setting is at work (`RemindersScreen`'s `switchRow` says it at length). The
 * inverse stays in the API for a switch whose ON really does silence the phone the moment it is
 * turned; there is none today. The switch is an ordinary switch either way — right and filled is on.
 *
 * IN EVERY OTHER RESPECT IT IS `Switch`. One Pressable is the switch: `role="switch"`, its checked
 * state, the caller's label (required: the picture says nothing to a screen reader), one press
 * handler, a 44 pt target round a 56 × 32 pill. The drawing sits in a `pointerEvents="none"`
 * wrapper hidden from assistive technology, `Switch.tsx`'s own arrangement, so a screen reader
 * meets one element and a tap is one toggle. Its colors are the platform switch's own pairs,
 * painted from the palette (`theme/bell.ts`), so nothing is said by color alone: the knob's
 * position, the track's fill and the bell's pose all say it. A flip is felt as `Switch`'s is — a
 * `tap`, "a switch flipped" (`feedback/haptics.ts`), once, after the flip is handed on.
 *
 * THE ANIMATION: four values on the native driver — the knob, how upright the bell is, and two
 * clocks, the ring's and the "z"s' — every layer an interpolation of them, opacity and transforms
 * only (`bellSwitch.ts` holds the frames and the plan and tests them). A tap mid-move turns
 * everything round from where it is. REDUCE MOTION and the AMBER NIGHT theme set the end state and
 * start nothing (docs/DESIGN_SYSTEM.md §7; night keeps a dark room still): the switch is simply on
 * or off, the bell simply up or down, and the "z"s are not drawn at all in night.
 *
 * INSIDE A ROW it is drawn display-only, exactly where the platform switch would be (`Row`'s
 * `switchBell`): the row is the switch there, and this is its picture. Its own press never runs
 * inside the row's untouchable wrapper, so a flip there is felt once, by the row's own handler.
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { haptic } from '../feedback/haptics';
import { bellColors } from '../theme/bell';
import { useTheme } from '../theme/ThemeProvider';
import {
  BELL_BODY,
  BELL_CLAPPER,
  BELL_CROWN,
  BELL_EASE,
  BELL_GRID,
  bellFrames,
  bellGeometry,
  bellPlan,
  bellRest,
  bellZs,
  Z_PATH,
  Z_STROKE,
  Z_VIEWBOX,
  type BellEase,
  type BellMapping,
  type BellRest,
  type BellStep,
} from './bellSwitch';
import type { Frame } from './dayNightSwitch';

/** Which way the bell means on, for a caller typing its prop; the rest stays in `bellSwitch.ts`. */
export type { BellMapping } from './bellSwitch';

export interface BellSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /**
   * WHICH WAY THE BELL MEANS ON — no default, so every caller says it. `awake-when-on` for every
   * switch the app has, quiet hours included (see the header); `asleep-when-on` only for a switch
   * whose ON silences the phone at once.
   */
  bell: BellMapping;
  /** Required: the picture says nothing to a screen reader, so the name has to. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;
/** A value, or one built from values: a product of two is an animated node too. */
type Driver = Animated.Value | Animated.AnimatedInterpolation<number>;

const G = bellGeometry();
const EASE: Record<BellEase, (t: number) => number> = {
  slide: Easing.bezier(...BELL_EASE.slide),
  right: Easing.bezier(...BELL_EASE.right),
  tip: Easing.bezier(...BELL_EASE.tip),
};

export function BellSwitch({
  value,
  onValueChange,
  bell,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  style,
  testID,
}: BellSwitchProps) {
  const t = useTheme();
  const c = bellColors(t.color);
  // nothing moves under reduce motion, and nothing moves or drifts in the amber night theme
  const still = t.reduceMotion || t.theme === 'night';

  // constructed AT rest for the first value, so the first frame is already the right picture
  const rest = bellRest(value, bell);
  const pos = useRef(new Animated.Value(rest.pos)).current;
  const awake = useRef(new Animated.Value(rest.awake)).current;
  // the two clocks rest run out: no swing, no "z"s
  const ring = useRef(new Animated.Value(1)).current;
  const z = useRef(new Animated.Value(1)).current;
  // where everything was last sent
  const target = useRef<BellRest>(rest);

  useEffect(() => {
    const plan = bellPlan(value, bell, still);
    if (!plan.animate) {
      // set, even over a move in flight: turning reduce motion on mid-ring runs the previous
      // run's cleanup (a stop) first, and without this the bell would freeze half way over
      pos.setValue(plan.to.pos);
      awake.setValue(plan.to.awake);
      ring.setValue(1);
      z.setValue(1);
      target.current = plan.to;
      return;
    }
    // already there — the first render, or a re-render that changed nothing about where it rests
    if (target.current.pos === plan.to.pos && target.current.awake === plan.to.awake) return;
    target.current = plan.to;
    const timing = (
      v: Animated.Value,
      toValue: number,
      step: BellStep,
      ease: (t: number) => number,
    ) =>
      Animated.timing(v, {
        toValue,
        duration: step.duration,
        delay: step.delay,
        easing: ease,
        useNativeDriver: true,
      });
    const runs = [
      timing(pos, plan.to.pos, plan.slide, EASE.slide),
      timing(awake, plan.to.awake, plan.awake, EASE[plan.awake.ease]),
    ];
    // each clock is reset where its layer is still and unseen: a swing at 0 is upright and is
    // multiplied by how awake the bell is, which is nothing yet; a "z" at 0 is not drawn
    if (plan.ring) {
      ring.setValue(0);
      runs.push(timing(ring, 1, plan.ring, Easing.linear));
    }
    if (plan.z) {
      z.setValue(0);
      runs.push(timing(z, 1, plan.z, Easing.linear));
    }
    const run = Animated.parallel(runs);
    run.start();
    // a new tap, reduce motion, night, or the switch going away: stop where it is
    return () => run.stop();
  }, [awake, bell, pos, ring, still, value, z]);

  // built once per mapping: every layer is a view of the same four values
  const anim = useMemo(() => {
    const f = bellFrames(G, bell);
    // copies, because `interpolate` is typed for mutable arrays and the frames are frozen data
    const num = (v: Driver, fr: Frame) =>
      v.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: [...fr.outputRange],
        extrapolate: fr.extrapolate,
      });
    // degrees as a number, turned into the string a rotation takes: a straight line, both ways
    const deg = (v: Driver) =>
      v.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });
    const awakeness = num(awake, f.awakeness);
    const sleepiness = num(awake, f.sleepiness);
    // about the crown: out to it, turn, back
    const aboutCrown = (turn: Driver) => [
      { translateY: G.hang.y },
      { rotate: deg(turn) },
      { translateY: -G.hang.y },
    ];
    const knob: AnimatedStyle = { transform: [{ translateX: num(pos, f.knobX) }] };
    const on: AnimatedStyle = { opacity: num(pos, f.on) };
    const tip: AnimatedStyle = { transform: [{ rotate: deg(num(awake, f.tip)) }] };
    const swing: AnimatedStyle = {
      transform: aboutCrown(Animated.multiply<number>(num(ring, f.swing), awakeness)),
    };
    const clapper: AnimatedStyle = {
      transform: aboutCrown(Animated.multiply<number>(num(ring, f.clapper), awakeness)),
    };
    const zs: AnimatedStyle[] = f.zs.map(zf => ({
      opacity: Animated.multiply<number>(num(z, zf.opacity), sleepiness),
      transform: [
        { translateX: num(z, zf.x) },
        { translateY: num(z, zf.y) },
        { scale: num(z, zf.scale) },
      ],
    }));
    return { knob, on, tip, swing, clapper, zs, placed: bellZs(G, bell) };
  }, [awake, bell, pos, ring, z]);

  const k = G.knob;
  const box = G.box;

  return (
    <Pressable
      accessible
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      // felt as `Switch` is: a tap, AFTER the flip is handed on (`Switch.tsx` says why)
      onPress={() => {
        onValueChange(!value);
        haptic('tap');
      }}
      style={[styles.target, { minHeight: t.hit.min, minWidth: t.hit.min }, style]}
      {...(testID ? { testID } : {})}
    >
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        // dimmed as ONE picture when disabled, not layer by layer through each other
        needsOffscreenAlphaCompositing={disabled}
        style={{ width: G.width, height: G.height, opacity: disabled ? 0.5 : 1 }}
      >
        <View
          style={[styles.track, { width: G.width, height: G.height, borderRadius: t.radius.pill }]}
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.trackOff }]} />
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: c.trackOn }, anim.on]}
          />
        </View>

        {/* the "z"s, over the ground above the pill; never in night, where nothing drifts */}
        {t.theme === 'night'
          ? null
          : anim.placed.map((zp, i) => (
              <Animated.View
                // the two share a path and differ in when they leave the bell
                key={zp.at}
                style={[
                  {
                    position: 'absolute',
                    left: zp.from.x - zp.size / 2,
                    top: zp.from.y - zp.size / 2,
                    width: zp.size,
                    height: zp.size,
                  },
                  anim.zs[i],
                ]}
              >
                <Svg width={zp.size} height={zp.size} viewBox={Z_VIEWBOX}>
                  <Path
                    d={Z_PATH}
                    fill="none"
                    stroke={c.z}
                    strokeWidth={Z_STROKE}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Animated.View>
            ))}

        <Animated.View
          style={[
            { position: 'absolute', left: G.inset, top: G.inset, width: k, height: k },
            anim.knob,
          ]}
        >
          <View
            style={[StyleSheet.absoluteFill, { borderRadius: k / 2, backgroundColor: c.knobOff }]}
          />
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: k / 2, backgroundColor: c.knobOn },
              anim.on,
            ]}
          />
          {/* the tip, about the middle of the knob; the swing, inside it, about the crown */}
          <Animated.View
            style={[
              { position: 'absolute', left: G.boxInset, top: G.boxInset, width: box, height: box },
              anim.tip,
            ]}
          >
            <Animated.View style={[StyleSheet.absoluteFill, anim.clapper]}>
              <Bell part="clapper" ink={c.bellOff} size={box} />
              <Animated.View style={[StyleSheet.absoluteFill, anim.on]}>
                <Bell part="clapper" ink={c.bellOn} size={box} />
              </Animated.View>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, anim.swing]}>
              <Bell part="body" ink={c.bellOff} size={box} />
              <Animated.View style={[StyleSheet.absoluteFill, anim.on]}>
                <Bell part="body" ink={c.bellOn} size={box} />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

/**
 * THE BELL, in two parts so they can swing apart: the body with its crown, and the clapper under
 * the rim. Drawn in one ink per knob color; the switch fades the "on" drawing over the "off" one.
 */
function Bell({ part, ink, size }: { part: 'body' | 'clapper'; ink: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BELL_GRID} ${BELL_GRID}`}>
      {part === 'body' ? (
        <>
          <Path d={BELL_BODY} fill={ink} />
          <Circle cx={BELL_CROWN.cx} cy={BELL_CROWN.cy} r={BELL_CROWN.r} fill={ink} />
        </>
      ) : (
        <Circle cx={BELL_CLAPPER.cx} cy={BELL_CLAPPER.cy} r={BELL_CLAPPER.r} fill={ink} />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  target: { alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  track: { overflow: 'hidden' },
});
