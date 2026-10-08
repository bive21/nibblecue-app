/**
 * DayNightSwitch — a switch that is a small picture of the sky (the owner, 2026-09-25, of setup's
 * dark-mode preview: *"make this an interesting animation toggle like this below, dont make it
 * exactly the same, but similar"*, with a sun-and-moon day/night switcher as the reference).
 * Off is day: a cobalt sky, a sun for the knob, a cloud. On is night: an indigo sky, a moon with
 * craters for the knob, stars. It is an ordinary switch in every other respect — one target, one
 * toggle, `role="switch"` with its checked state — so it can stand anywhere the design system's
 * `Switch` could, and it is here rather than in the app for that reason.
 *
 * THE ANIMATION. One value, `progress`, runs 0 (day) → 1 (night) over 560 ms on a curve that
 * starts slow and overshoots a hair at the far end, and every layer is an interpolation of it
 * (`dayNightSwitch.ts` holds the frames and tests them):
 *   - the KNOB rolls across the pill, turning as far as a wheel of its size would over that
 *     distance and stretching a little mid-way, and changes face as it goes: the sun fades out,
 *     and the moon turns into place, craters upright, as it fades in;
 *   - the SKY cross-fades from day to night;
 *   - the CLOUD drifts out to the right, and a smaller wisp above it leaves faster, so they part;
 *   - the STARS slide in from the left and twinkle on one after another — each grows past its
 *     size, dips and settles — as the moon arrives;
 *   - the HALO round the knob draws in while it rolls and blooms again, fainter round the moon.
 * Back to day is the same frames in reverse, and a tap mid-roll just turns it round. Opacity and
 * transforms only, so every frame runs on the native driver, off the JS thread.
 *
 * REDUCE MOTION sets the end state and starts nothing: the switch is simply day or night
 * (docs/DESIGN_SYSTEM.md §7). `t.reduceMotion` IS the OS's answer — `AppearanceProvider` reads
 * `AccessibilityInfo.isReduceMotionEnabled` and follows `reduceMotionChanged` — and this component,
 * like everything below that provider, reads it through the theme instead of asking again.
 *
 * ITS COLORS ARE A PICTURE'S (`theme/sky.ts`): the switch is what flips the theme, so a sky drawn
 * from the palette would change palette half way through its own roll. Only the rim is the
 * theme's `line2`, because the rim is what parts the pill from the page. In the amber night theme
 * the sky comes from the night palette and the scenery is not drawn at all. The CAPTION is not part
 * of the picture, so it is the theme's: words in a capsule of the badge's accent pair (2026-09-25).
 *
 * THE PICTURE IS SCENERY TO EVERYTHING BUT THE EYE. The Pressable is the switch — its label, its
 * checked state, its one press handler — and the drawing inside it sits in a `pointerEvents="none"`
 * wrapper hidden from assistive technology, `Switch.tsx`'s own arrangement, so a screen reader
 * meets one element and a tap is one toggle.
 *
 * A FLIP IS FELT AS A `tick` (the owner, 2026-09-25: "a click at each theme-switch stop") — the
 * theme toggle's stop, not the plain switch's `tap`, because this is the same sky one stop
 * narrower. Once, at the tap: not again when the knob lands 560 ms later, which reduce motion does
 * not wait for. There is no locked stop here to warn about; either way the knob and the sky move.
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { haptic } from '../feedback/haptics';
import { dayNightSkyFor } from '../theme/sky';
import { useTheme } from '../theme/ThemeProvider';
import {
  CLOUD,
  CLOUD_BASE,
  CLOUD_BUMPS,
  CLOUD_VIEWBOX,
  CRATERS,
  DAY_NIGHT_EASE,
  dayNightFrames,
  dayNightGeometry,
  dayNightMove,
  progressFor,
  SPARKLE_PATH,
  STARS,
  SUN_HIGHLIGHT,
  WISP,
  type CloudBox,
  type Frame,
} from './dayNightSwitch';
import { badgeColors } from './badge-tone';
import { AppText } from './Text';

export interface DayNightSwitchProps {
  /** On is night: the moon is the knob and the sky is dark. */
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Required: the picture says nothing to a screen reader, so the name has to. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /**
   * Words beside the pill, inside the same target, so tapping them flips it too — drawn in a
   * capsule of their own (see the render), because words beside a picture are an invitation.
   */
  caption?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;

const G = dayNightGeometry();
const EASE = Easing.bezier(...DAY_NIGHT_EASE);
/** The knob's base sits a point inside its faces, so their anti-aliased edge is over sky, not gold. */
const BASE_INSET = 1;
/** Not useId(): its output contains ':', which is not valid in an SVG fragment identifier. */
let instances = 0;

export function DayNightSwitch({
  value,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
  caption,
  disabled = false,
  style,
  testID,
}: DayNightSwitchProps) {
  const t = useTheme();
  const sky = dayNightSkyFor(t.theme);
  // the caption's capsule: the badge's own accent pair, measured (see the render)
  const capsule = badgeColors(t.color, 'accent');
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-daynight-${(instances += 1)}`;
  const id = uid.current;

  // constructed AT the resting value, so the first frame is already the right picture
  const progress = useRef(new Animated.Value(progressFor(value))).current;
  const target = useRef<0 | 1>(progressFor(value));

  useEffect(() => {
    const move = dayNightMove(value, t.reduceMotion);
    if (!move.animate) {
      // set, even when a flip is in flight: turning reduce motion on mid-roll runs the previous
      // run's cleanup (a stop) first, and without this the knob would freeze half way across
      progress.setValue(move.to);
      target.current = move.to;
      return;
    }
    // already there — the first render, or a re-render that changed nothing about the answer
    if (target.current === move.to) return;
    target.current = move.to;
    const run = Animated.timing(progress, {
      toValue: move.to,
      duration: move.duration,
      easing: EASE,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [progress, value, t.reduceMotion]);

  // built once: every layer is a view of the same value, and none of them depends on the theme
  const anim = useMemo(() => {
    const f = dayNightFrames(G);
    // copies, because `interpolate` is typed for mutable arrays and the frames are frozen data
    const num = (fr: Frame) =>
      progress.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: [...fr.outputRange],
        extrapolate: fr.extrapolate,
      });
    const deg = (fr: Frame) =>
      progress.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: fr.outputRange.map(d => `${d}deg`),
        extrapolate: fr.extrapolate,
      });
    const knob: AnimatedStyle = {
      transform: [{ translateX: num(f.knobX) }, { scaleX: num(f.knobStretch) }],
    };
    const sun: AnimatedStyle = {
      opacity: num(f.sunOpacity),
      transform: [{ rotate: deg(f.sunTurn) }],
    };
    const moon: AnimatedStyle = {
      opacity: num(f.moonOpacity),
      transform: [{ rotate: deg(f.moonTurn) }],
    };
    const halo: AnimatedStyle = {
      opacity: num(f.haloOpacity),
      transform: [{ scale: num(f.haloScale) }],
    };
    const night: AnimatedStyle = { opacity: num(f.nightSky) };
    const cloud: AnimatedStyle = {
      opacity: num(f.cloudOpacity),
      transform: [{ translateX: num(f.cloudX) }],
    };
    const wisp: AnimatedStyle = {
      opacity: num(f.wispOpacity),
      transform: [{ translateX: num(f.wispX) }],
    };
    const starField: AnimatedStyle = { transform: [{ translateX: num(f.starsX) }] };
    const stars: AnimatedStyle[] = f.stars.map(s => ({
      opacity: num(s.opacity),
      transform: [{ scale: num(s.scale) }],
    }));
    return { knob, sun, moon, halo, night, cloud, wisp, starField, stars };
  }, [progress]);

  // THE KNOB'S SHADOW, on the sky under it. Never an Android `elevation` on something that moves
  // and scales under a native animation (StopButton.tsx records the square it drew): a box-shadow
  // is painted from the rounded border box itself, outside it only.
  const shadow: ViewStyle =
    !sky.scenery || t.skinTokens.surface.shadow === 'none'
      ? {}
      : Platform.OS === 'android'
        ? {
            boxShadow: [
              { offsetX: 0, offsetY: 2, blurRadius: 4, spreadDistance: 0, color: sky.shade },
            ],
          }
        : {
            shadowColor: sky.shade,
            shadowOpacity: 1,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 2 },
          };

  const k = G.knob;
  const [haloInner, haloOuter] = G.halo;
  const base = k - 2 * BASE_INSET;

  return (
    <Pressable
      accessible
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => {
        haptic('tick');
        onValueChange(!value);
      }}
      style={[styles.row, { minHeight: t.hit.min, minWidth: t.hit.min, gap: t.space.md }, style]}
      {...(testID ? { testID } : {})}
    >
      {caption ? (
        /*
          THE WORDS IN A CAPSULE (the owner, 2026-09-25: *"Highlight the text 'try me' like in a
          cpasule shape"*). A filled pill, the design system's shape for a choice among a few, in
          the pair a Badge's accent tone uses: `accentSoft` under `accent2`, which the token gate
          holds at 4.5:1 in all six schemes in light, dark and night, and which `badgeColors`
          measures again here and would swap for the text ink if a palette ever let it slip. The
          fill is the opaque token whatever the skin — a filled control is never frosted — so the
          ratio does not move with the material under it.

          Still words inside the switch's one target: tapping them flips it, and a screen reader
          hears the switch's own label, which starts with them, rather than the words twice.

          `space.md` either side, not `lg`: setup draws this in a box, beside "Automatic night
          mode", and at `lg` that row wanted 289 pt of the 286 a 360 dp phone gives it. At `md`
          the text still clears the pill's curve by more than the badge's own `sm` does.
        */
        <View
          style={[
            styles.caption,
            {
              backgroundColor: capsule.fill,
              borderRadius: t.radius.pill,
              paddingHorizontal: t.space.md,
              paddingVertical: t.space.xs,
            },
          ]}
        >
          <AppText variant="bodySm" color={capsule.ink}>
            {caption}
          </AppText>
        </View>
      ) : null}
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
          <Svg width={G.width} height={G.height} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgLinearGradient
                id={`${id}-day`}
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={0}
                x2={0}
                y2={G.height}
              >
                <Stop offset="0" stopColor={sky.daySky[0]} />
                <Stop offset="1" stopColor={sky.daySky[1]} />
              </SvgLinearGradient>
            </Defs>
            <Rect x={0} y={0} width={G.width} height={G.height} fill={`url(#${id}-day)`} />
          </Svg>
          <Animated.View style={[StyleSheet.absoluteFill, anim.night]}>
            <Svg width={G.width} height={G.height}>
              <Defs>
                <SvgLinearGradient
                  id={`${id}-night`}
                  gradientUnits="userSpaceOnUse"
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={G.height}
                >
                  <Stop offset="0" stopColor={sky.nightSky[0]} />
                  <Stop offset="1" stopColor={sky.nightSky[1]} />
                </SvgLinearGradient>
              </Defs>
              <Rect x={0} y={0} width={G.width} height={G.height} fill={`url(#${id}-night)`} />
            </Svg>
          </Animated.View>

          {sky.scenery ? (
            <>
              <Animated.View style={[StyleSheet.absoluteFill, anim.starField]}>
                {STARS.map((s, i) => (
                  <Animated.View
                    key={`${s.x}-${s.y}`}
                    style={[
                      {
                        position: 'absolute',
                        left: s.x - s.size / 2,
                        top: s.y - s.size / 2,
                        width: s.size,
                        height: s.size,
                      },
                      anim.stars[i],
                    ]}
                  >
                    {s.kind === 'sparkle' ? (
                      <Svg width={s.size} height={s.size} viewBox="0 0 10 10">
                        <Path d={SPARKLE_PATH} fill={sky.star} />
                      </Svg>
                    ) : (
                      <View
                        style={{
                          width: s.size,
                          height: s.size,
                          borderRadius: s.size / 2,
                          backgroundColor: sky.star,
                        }}
                      />
                    )}
                  </Animated.View>
                ))}
              </Animated.View>
              <Cloud box={WISP} fill={sky.cloud} style={anim.wisp} />
              <Cloud box={CLOUD} fill={sky.cloud} style={anim.cloud} />
            </>
          ) : null}

          <Animated.View
            style={[
              { position: 'absolute', left: G.inset, top: G.inset, width: k, height: k },
              anim.knob,
            ]}
          >
            {sky.scenery ? (
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    left: (k - haloOuter) / 2,
                    top: (k - haloOuter) / 2,
                    width: haloOuter,
                    height: haloOuter,
                  },
                  anim.halo,
                ]}
              >
                <Svg width={haloOuter} height={haloOuter}>
                  <Circle cx={haloOuter / 2} cy={haloOuter / 2} r={haloOuter / 2} fill={sky.halo} />
                  <Circle cx={haloOuter / 2} cy={haloOuter / 2} r={haloInner / 2} fill={sky.halo} />
                </Svg>
              </Animated.View>
            ) : null}
            {/* the knob's body, under both faces: it keeps the knob solid while one face fades
                into the other, and it is what the shadow is cast from */}
            <View
              style={[
                {
                  position: 'absolute',
                  left: BASE_INSET,
                  top: BASE_INSET,
                  width: base,
                  height: base,
                  borderRadius: base / 2,
                  backgroundColor: sky.sun[1],
                },
                shadow,
              ]}
            />
            <Animated.View style={[StyleSheet.absoluteFill, anim.sun]}>
              <Svg width={k} height={k}>
                <Defs>
                  <RadialGradient
                    id={`${id}-sun`}
                    gradientUnits="userSpaceOnUse"
                    cx={k * SUN_HIGHLIGHT.cx}
                    cy={k * SUN_HIGHLIGHT.cy}
                    r={k * SUN_HIGHLIGHT.r}
                    fx={k * SUN_HIGHLIGHT.cx}
                    fy={k * SUN_HIGHLIGHT.cy}
                  >
                    <Stop offset="0" stopColor={sky.sun[0]} />
                    <Stop offset="1" stopColor={sky.sun[1]} />
                  </RadialGradient>
                </Defs>
                <Circle cx={k / 2} cy={k / 2} r={k / 2} fill={`url(#${id}-sun)`} />
              </Svg>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, anim.moon]}>
              <Svg width={k} height={k}>
                <Circle cx={k / 2} cy={k / 2} r={k / 2} fill={sky.moon} />
                {CRATERS.map(c => (
                  <Circle
                    key={`${c.cx}-${c.cy}`}
                    cx={k * c.cx}
                    cy={k * c.cy}
                    r={k * c.r}
                    fill={sky.crater}
                  />
                ))}
              </Svg>
            </Animated.View>
          </Animated.View>
        </View>
        {/* the rim, drawn OVER the sky: on Android a border is part of the view's own background
            and the sky layers inside would paint straight over it */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: t.radius.pill, borderWidth: G.rim, borderColor: t.color.line2 },
          ]}
        />
      </View>
    </Pressable>
  );
}

/** A cloud: one shape of one fill, so it fades as one thing rather than as overlapping discs. */
function Cloud({ box, fill, style }: { box: CloudBox; fill: string; style: AnimatedStyle }) {
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height },
        style,
      ]}
    >
      <Svg width={box.width} height={box.height} viewBox={CLOUD_VIEWBOX}>
        <Rect
          x={CLOUD_BASE.x}
          y={CLOUD_BASE.y}
          width={CLOUD_BASE.width}
          height={CLOUD_BASE.height}
          rx={CLOUD_BASE.r}
          fill={fill}
        />
        {CLOUD_BUMPS.map(b => (
          <Circle key={b.cx} cx={b.cx} cy={b.cy} r={b.r} fill={fill} />
        ))}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  track: { overflow: 'hidden' },
  caption: { alignItems: 'center', justifyContent: 'center' },
});
