/**
 * PourSwitch: a switch whose track fills like a bottle (the owner, 2026-09-27, of setup's "Feeding
 * and milk": *"make animation on the toogle on the feeding: feeding and milk page. make it more
 * interesting think about what animation would fit for the toggle"*). Turned ON, the module's own
 * color pours in from the foot of the track to the brim while the knob slides across, a small wave
 * running along its surface the way the knob goes; the knob lands with a little squash, and once
 * the track is full a soft glow of the same color blooms round it and fades. Turned OFF, the milk
 * drains out and the wave runs back. Once each time, over in 600 ms; at rest it is still.
 * `pourSwitch.ts` holds every number and says why a pour, of the ideas weighed.
 *
 * IN EVERY OTHER RESPECT IT IS `Switch`, and `BellSwitch`'s twin. One Pressable is the switch:
 * `role="switch"`, its checked state, the caller's label (required: the picture says nothing to a
 * screen reader), one press handler, a 44 pt target round a 56 × 32 pill. The drawing sits in a
 * `pointerEvents="none"` wrapper hidden from assistive technology, so a screen reader meets one
 * element and a tap is one toggle. Nothing is said by color alone: the knob's position, the knob's
 * own color and the track's fill all change together. A flip is felt as `Switch`'s is, a `tap`,
 * once, after the flip is handed on.
 *
 * THE ANIMATION: five values on the native driver (the knob, the milk's level, the wave, and the
 * two clocks for the landing and the glow), every layer an interpolation of them, opacity and
 * transforms only. The milk is ONE path drawn once, a wave over a body, and it is moved, never
 * redrawn: up and down for the level, sideways (by the wave's fraction, `Animated.modulo`, which the
 * native driver carries) for the ripple. A tap mid-move turns it all round from where it is.
 * REDUCE MOTION and the AMBER NIGHT set the end state and start nothing (docs/DESIGN_SYSTEM.md §7);
 * Night never draws the glow at all, and neither does a design with no shadows (`theme/pour.ts`).
 *
 * INSIDE A ROW it is drawn display-only, exactly where the platform switch would be (`Row`'s
 * `switchPour`): the row is the switch there, and this is its picture. Its own press never runs
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
import Svg, { Path } from 'react-native-svg';
import { haptic } from '../feedback/haptics';
import { pourColors } from '../theme/pour';
import { useTheme } from '../theme/ThemeProvider';
import type { Frame } from './dayNightSwitch';
import {
  POUR_EASE,
  POUR_LAND_PIVOT,
  pourFrames,
  pourGeometry,
  pourPlan,
  pourRestFor,
  pourWavePath,
  type PourEase,
  type PourStep,
} from './pourSwitch';
import { motionStill } from './tickDraw';

export interface PourSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /**
   * The milk: the module's own ink (`categoryColors(...).fg`), so each way of feeding pours its own
   * color. The knob on it is the card's color, measured against every module's ink in `pour.test.ts`.
   */
  milk: string;
  /** Required: the picture says nothing to a screen reader, so the name has to. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;
/** A value, or one built from values: the wave's fraction is a modulo node, an interpolation too. */
type Driver = Animated.Value | Animated.AnimatedInterpolation<number>;

const G = pourGeometry();
/** Drawn once, for every pour switch there is: the wave and the body under it. */
const MILK_PATH = pourWavePath(G);
const EASE: Record<PourEase, (t: number) => number> = {
  slide: Easing.bezier(...POUR_EASE.slide),
  fill: Easing.bezier(...POUR_EASE.fill),
  drain: Easing.bezier(...POUR_EASE.drain),
};

// copies, because `interpolate` is typed for mutable arrays and the frames are frozen data
const num = (v: Driver, fr: Frame) =>
  v.interpolate({
    inputRange: [...fr.inputRange],
    outputRange: [...fr.outputRange],
    extrapolate: fr.extrapolate,
  });

export function PourSwitch({
  value,
  onValueChange,
  milk,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  style,
  testID,
}: PourSwitchProps) {
  const t = useTheme();
  // no glow in the amber Night, nor on a design that draws no shadows (Paper)
  const c = pourColors(t.color, milk, t.theme, t.skinTokens.surface.shadow !== 'none');
  const glows = c.glow !== null;
  // nothing moves under reduce motion, and nothing moves or glows in the amber Night
  const still = motionStill(t.reduceMotion, t.theme);

  // constructed AT rest for the first value, so the first frame is already the right picture
  const rest = pourRestFor(value);
  const pos = useRef(new Animated.Value(rest.pos)).current;
  const level = useRef(new Animated.Value(rest.level)).current;
  const wave = useRef(new Animated.Value(0)).current;
  // the two clocks rest run out: a round knob, no glow
  const land = useRef(new Animated.Value(1)).current;
  const bloom = useRef(new Animated.Value(1)).current;
  // where everything was last sent, the wave included (it only ever moves on)
  const target = useRef({ ...rest, wave: 0 });

  useEffect(() => {
    const plan = pourPlan(value, still, glows);
    const at = target.current;
    if (!plan.animate || (at.pos === plan.to.pos && at.level === plan.to.level)) {
      // SET, NOT MOVED: the first render, reduce motion or Night, or a re-run for a reason that is
      // not the value (the theme, the design) lands where it was going. Set even over a move in
      // flight: the run before was stopped by its cleanup, and would otherwise freeze half way.
      pos.setValue(plan.to.pos);
      level.setValue(plan.to.level);
      wave.setValue(at.wave);
      target.current = { ...plan.to, wave: at.wave };
      return;
    }
    const waveTo = at.wave + plan.wave.by;
    target.current = { ...plan.to, wave: waveTo };
    const timing = (
      v: Animated.Value,
      toValue: number,
      step: PourStep,
      ease: (x: number) => number,
    ) =>
      Animated.timing(v, {
        toValue,
        duration: step.duration,
        delay: step.delay,
        easing: ease,
        useNativeDriver: true,
      });
    const runs = [
      timing(pos, plan.to.pos, plan.slide, EASE[plan.slide.ease]),
      timing(level, plan.to.level, plan.level, EASE[plan.level.ease]),
      // the ripple travels at one speed: the level's curve is what makes it a pour
      timing(wave, waveTo, plan.wave, Easing.linear),
    ];
    // each clock is reset where its layer is at rest and unseen: a round knob, a glow of nothing
    if (plan.land) {
      land.setValue(0);
      runs.push(timing(land, 1, plan.land, Easing.linear));
    }
    if (plan.bloom) {
      bloom.setValue(0);
      runs.push(timing(bloom, 1, plan.bloom, Easing.linear));
    }
    const run = Animated.parallel(runs);
    run.start();
    return () => {
      // a new tap, reduce motion, Night, or the switch going away: the knob, the milk and the
      // wave stop where they are (the next move starts from there); the two decorations go back
      // to rest, never left half way
      run.stop();
      land.setValue(1);
      bloom.setValue(1);
    };
  }, [bloom, glows, land, level, pos, still, value, wave]);

  // built once: every layer is a view of the same five values
  const anim = useMemo(() => {
    const f = pourFrames(G);
    const knob: AnimatedStyle = { transform: [{ translateX: num(pos, f.knobX) }] };
    const on: AnimatedStyle = { opacity: num(pos, f.on) };
    const milkLayer: AnimatedStyle = {
      transform: [
        { translateX: num(Animated.modulo<number>(wave, 1), f.milkX) },
        { translateY: num(level, f.milkY) },
      ],
    };
    // about the edge it lands on: out to it, squash, back
    const px = G.knob * POUR_LAND_PIVOT.x;
    const squash: AnimatedStyle = {
      transform: [
        { translateX: px },
        { scaleX: num(land, f.squashX) },
        { scaleY: num(land, f.squashY) },
        { translateX: -px },
      ],
    };
    const glow: AnimatedStyle = {
      opacity: num(bloom, f.glow),
      transform: [{ scaleX: num(bloom, f.glowX) }, { scaleY: num(bloom, f.glowY) }],
    };
    return { knob, on, milk: milkLayer, squash, glow };
  }, [bloom, land, level, pos, wave]);

  const k = G.knob;

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
        {/* the glow, UNDER the track, so only the ring outside it is ever seen */}
        {c.glow === null ? null : (
          <Animated.View
            style={[
              styles.layer,
              {
                width: G.width,
                height: G.height,
                borderRadius: t.radius.pill,
                backgroundColor: c.glow,
              },
              anim.glow,
            ]}
          />
        )}
        {/* the track, which clips the milk to its own pill */}
        <View
          style={[styles.track, { width: G.width, height: G.height, borderRadius: t.radius.pill }]}
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.trackOff }]} />
          <Animated.View
            style={[styles.layer, { width: G.layer.width, height: G.layer.height }, anim.milk]}
          >
            <Svg width={G.layer.width} height={G.layer.height}>
              <Path d={MILK_PATH} fill={c.milk} />
            </Svg>
          </Animated.View>
        </View>
        <Animated.View
          style={[styles.layer, { left: G.inset, top: G.inset, width: k, height: k }, anim.knob]}
        >
          <Animated.View style={[StyleSheet.absoluteFill, anim.squash]}>
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
          </Animated.View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  track: { overflow: 'hidden' },
  layer: { position: 'absolute', left: 0, top: 0 },
});
