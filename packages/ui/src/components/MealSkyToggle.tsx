/**
 * MealSkyToggle — the solids sheet's meal as the sun's place in a small sky (the owner, 2026-09-25,
 * of the "that's cool" list: *"might not necessarily be useful, but it's cool … Let's try doing
 * everything. I will then review"*). It replaces a row of four pills with the picture they stood
 * for:
 *
 *   BREAKFAST  the sun just risen, low on the left, in a dawn going rose at the horizon
 *   LUNCH      the sun high at noon, in a clear cobalt sky
 *   SNACK      the sun lower, to the right, in an afternoon going gold
 *   DINNER     the sun setting at the right edge, half behind the land, in a dusk with stars
 *
 * and the chosen meal's word is written on the ground under its sun. Small marks on the sun's
 * dashed path show where the other three meals are, each inside its own meal's quarter of the
 * picture, so a tap where a sun could be chooses that sun's meal.
 *
 * THE MOVE (`mealSkyToggle.ts` holds the numbers and tests them). One value, the sun's place in
 * meals, runs on the native driver: the sun GLIDES along its arc — round the curve, not in a
 * straight line — and the sky cross-fades through the hours it passes, so breakfast to dinner is
 * the whole day in under a second: up through noon's blue and down into the dusk, the stars coming
 * out one after another as it sets. The light round the sun draws in while it travels and blooms
 * where it stops. The word is not part of the day: the old one sinks away and the new one rises
 * into place, and the meals between are never written on the way. A tap mid-glide turns
 * everything round from where it is. REDUCE MOTION, and the amber NIGHT theme, set the end state
 * and start nothing (`mealSkyStill`): the sun is simply at its meal and the word is written.
 *
 * THE SUN OPENS ROUGHLY WHERE THE REAL ONE IS. The sheet's meal starts from the clock
 * (`mealForTime` in core: breakfast from 5:00, lunch from 10:30, dinner from 17:00, a snack
 * otherwise) — so opening the sheet at 12:40 shows a noon sun over "Lunch", and moving the time row
 * back four hours glides it back to the morning. That is a starting pill read off a clock, never a
 * statement about when a baby should eat, and it is the parent's the moment they tap.
 *
 * ITS COLORS ARE A PICTURE'S (`theme/mealSky.ts`): four skies that are the same in light and dark,
 * and one warm near-black sky in amber Night built from the night palette alone, with no halo and
 * no stars. Only the rim is the theme's `line2`.
 *
 * TO EVERYTHING BUT THE EYE IT IS A RADIO GROUP, as the segmented control it replaces was: the
 * group's name, then four radios in the day's order, each a quarter of the picture — 60 pt tall and
 * at least 68 wide — named with its meal's word and saying whether it is checked, laid over a
 * drawing that sits in a `pointerEvents="none"` wrapper hidden from assistive technology. Nothing
 * is said by color alone: the sun's place and the word say which meal it is.
 *
 * AS SHORT AS IT READS (the owner, 2026-09-26, of the 90 pt it first was: *"yes always make things
 * shorter when you can"*): 60 pt, a sky of 35 over a ground just tall enough for the word at 1.3×
 * the phone's text size, the word at the bottle's and the bath's 13 pt (`MEAL_SKY_SIZE`,
 * `MEAL_WORD` — the arithmetic, and the tests that hold it).
 *
 * A TAP ON THE CHOSEN MEAL DOES NOTHING, as the segmented control's did: the sheet keeps a meal it
 * read off the clock as the clock's until the parent picks another, so the meal still follows the
 * time row — and a tap that re-picked the same meal would quietly stop it following.
 */
import type { Meal } from '@nibblecue/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMotionAwake } from './MotionGate';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
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
import { feelChoice } from '../feedback/choice';
import { mealSkyFor, type MealScene } from '../theme/mealSky';
import { useTheme } from '../theme/ThemeProvider';
import { SPARKLE_PATH, SUN_HIGHLIGHT, type Frame } from './dayNightSwitch';
import {
  MEAL_SKY_SIZE,
  MEAL_STOPS,
  MEAL_WORD,
  mealIndex,
  mealSkyFrames,
  mealSkyGeometry,
  mealSkyStill,
  mealWordLayout,
  planMealMove,
  type MealMotion,
  type MealSkyGeometry,
} from './mealSkyToggle';
import { AppText } from './Text';
import { SKY_EASE, spanWidth, type SkyEase } from './themeSkyToggle';

export interface MealSkyToggleProps {
  /** The chosen meal: the sun stands at its place and its word is written under it. */
  value: Meal;
  /** A tap on another meal. A tap on the chosen one is not reported (see the header). */
  onChange: (meal: Meal) => void;
  /** The group's name, for assistive technology: a radiogroup without one is four loose radios. */
  label: string;
  /** Each meal's word, from the caller: written on the ground and read as the radio's name. */
  labels: Readonly<Record<Meal, string>>;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;

/** One breath of the meal dots, in and out (see `breath`). */
const BREATH_MS = 2000;
const BREATH_SCALE = 1.12;
const BREATH_HALO = [0.12, 0.3] as const;

const EASE: Record<SkyEase, (t: number) => number> = {
  settle: Easing.bezier(...SKY_EASE.settle),
  land: Easing.bezier(...SKY_EASE.land),
};
/** The three skies drawn over breakfast's, in the order `mealSkyWeights` reads them. */
const LATER = ['LUNCH', 'SNACK', 'DINNER'] as const;
/** Not useId(): its output contains ':', which is not valid in an SVG fragment identifier. */
let instances = 0;

export function MealSkyToggle({
  value,
  onChange,
  label,
  labels,
  disabled = false,
  style,
  testID,
}: MealSkyToggleProps) {
  const t = useTheme();
  const sky = mealSkyFor(t.theme);
  const still = mealSkyStill(t.reduceMotion, t.theme);
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-mealsky-${(instances += 1)}`;
  const id = uid.current;

  // the room the sheet gives it, measured: nothing is drawn until it is known, and the four
  // radios are there from the first frame whatever the width
  const [room, setRoom] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== room) setRoom(w);
  };
  const g = useMemo(() => mealSkyGeometry(room), [room]);
  const words = useMemo(() => mealWordLayout(g, labels), [g, labels]);

  // constructed AT the resting value, so the first frame is already the right picture
  const pos = useRef(new Animated.Value(mealIndex(value))).current;
  const word = useRef(MEAL_STOPS.map(m => new Animated.Value(m === value ? 1 : 0))).current;
  // the meal the sun was last sent to, and the move that is taking it there
  const at = useRef<Meal>(value);
  const motion = useRef<MealMotion | null>(null);

  useEffect(() => {
    const now = Date.now();
    const m = motion.current;
    const resting = m === null || now >= m.startedAt + m.duration;
    // already there: the first render, or one that changed nothing about where the sun rests
    if (at.current === value && resting && !still) return;
    const plan = planMealMove(m, at.current, value, now, still);
    at.current = value;
    if (!plan.animate) {
      // set, even over a glide in flight: turning reduce motion on mid-glide stops the run first,
      // and without this the sun would freeze half way along its arc
      pos.setValue(plan.pos);
      MEAL_STOPS.forEach((meal, i) => word[i]?.setValue(plan.words[meal]));
      motion.current = null;
      return;
    }
    const timing = (v: Animated.Value, toValue: number, ease: SkyEase) =>
      Animated.timing(v, {
        toValue,
        duration: plan.duration,
        easing: EASE[ease],
        useNativeDriver: true,
      });
    const run = Animated.parallel([
      timing(pos, plan.pos, plan.ease),
      // a word never overshoots: an opacity past 1 means nothing
      ...MEAL_STOPS.flatMap((meal, i) => {
        const v = word[i];
        return v ? [timing(v, plan.words[meal], 'land')] : [];
      }),
    ]);
    motion.current = {
      from: plan.from,
      to: value,
      startedAt: now,
      duration: plan.duration,
      ease: plan.ease,
    };
    run.start();
    // a new meal, reduce motion, or the picture going away: stop where it is
    return () => run.stop();
  }, [pos, word, value, still]);

  /*
    THE DOTS BREATHE, GENTLY (the owner's solids option 3, 2026-10-06: "a subtle breathing effect only
    to the small existing tappable dots to suggest interaction"). One value runs 0 → 1 → 0 every two
    seconds, eased, on the native driver; each meal's dot that the sun is not on grows to 1.12 and
    its halo from 0.12 to 0.30 with it, anchored where it stands — no layout moves, nothing chases.
    Still under reduce motion and in the amber Night (`still`): the dots are simply there. It stops
    with the sheet, since the picture unmounts with it.
  */
  const breath = useRef(new Animated.Value(0)).current;
  // and not while nobody can see it: the app in the background, the page behind another
  const awake = useMotionAwake();
  useEffect(() => {
    if (still || !awake) {
      breath.setValue(0);
      return undefined;
    }
    const half = (toValue: number) =>
      Animated.timing(breath, {
        toValue,
        duration: BREATH_MS / 2,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([half(1), half(0)]));
    loop.start();
    return () => loop.stop();
  }, [breath, still, awake]);
  const dotScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, BREATH_SCALE] });
  const haloOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [...BREATH_HALO] });

  // built once per geometry: every layer is a view of the same values
  const anim = useMemo(() => {
    const f = mealSkyFrames(g);
    // copies, because `interpolate` is typed for mutable arrays and the frames are frozen data
    const num = (v: Animated.Value, fr: Frame) =>
      v.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: [...fr.outputRange],
        extrapolate: fr.extrapolate,
      });
    const sun: AnimatedStyle = {
      transform: [{ translateX: num(pos, f.sunX) }, { translateY: num(pos, f.sunY) }],
    };
    const halo: AnimatedStyle = {
      opacity: num(pos, f.halo),
      transform: [{ scale: num(pos, f.haloScale) }],
    };
    // the skies and the land cross over together, each through its own view of the value
    const layer = (): Record<(typeof LATER)[number], AnimatedStyle> => ({
      LUNCH: { opacity: num(pos, f.sky.LUNCH) },
      SNACK: { opacity: num(pos, f.sky.SNACK) },
      DINNER: { opacity: num(pos, f.sky.DINNER) },
    });
    const later = layer();
    const land = layer();
    const stars: AnimatedStyle[] = f.stars.map(s => ({
      opacity: num(pos, s.opacity),
      transform: [{ scale: num(pos, s.scale) }],
    }));
    const written: AnimatedStyle[] = word.map(v => ({
      opacity: num(v, f.word.opacity),
      transform: [{ translateY: num(v, f.word.rise) }],
    }));
    return { sun, halo, later, land, stars, written };
  }, [g, pos, word]);

  const choose = (meal: Meal) => {
    const current = meal === value;
    // felt as the pills it replaces were (`feedback/choice.ts`): a tap for a new meal, and nothing
    // for the chosen one — which is also not reported, because it is the clock's until another
    // meal is picked (see the header)
    feelChoice({ locked: false, current, kind: 'tap' });
    if (!current) onChange(meal);
  };

  const [haloInner, haloOuter] = g.halo;
  const r = g.sunR;

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={onLayout}
      style={[styles.root, { height: MEAL_SKY_SIZE.height }, style]}
      {...(testID ? { testID } : {})}
    >
      <View style={[styles.box, { width: room > 0 ? g.width : '100%', height: g.height }]}>
        {room > 0 ? (
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            // dimmed as ONE picture when disabled, not layer by layer through each other
            needsOffscreenAlphaCompositing={disabled}
            style={[StyleSheet.absoluteFill, { opacity: disabled ? 0.5 : 1 }]}
          >
            <View style={[styles.track, { borderRadius: t.radius.m }]}>
              {/* the skies: breakfast at the bottom and always whole, each later one over it */}
              <SkyLayer id={`${id}-sky-BREAKFAST`} scene={sky.scenes.BREAKFAST} g={g} />
              {sky.scenery
                ? LATER.map(meal => (
                    <Animated.View key={meal} style={[StyleSheet.absoluteFill, anim.later[meal]]}>
                      <SkyLayer id={`${id}-sky-${meal}`} scene={sky.scenes[meal]} g={g} />
                    </Animated.View>
                  ))
                : null}

              {sky.scenery
                ? g.stars.map((s, i) => (
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
                  ))
                : null}

              {/* the sun's path, and a mark where each meal's sun stands: the chosen one's is
                  under the sun, and shows again as the sun leaves it */}
              <Svg width={g.width} height={g.height} style={StyleSheet.absoluteFill}>
                <Path
                  d={g.path}
                  stroke={sky.path}
                  strokeWidth={1.2}
                  strokeDasharray="2 4"
                  strokeLinecap="round"
                  fill="none"
                />
                {MEAL_STOPS.map(meal => (
                  <Circle
                    key={meal}
                    cx={g.sun[meal].x}
                    cy={g.sun[meal].y}
                    r={g.stationR}
                    fill={sky.station}
                  />
                ))}
              </Svg>

              {/* each dot the sun is not on, breathing over its own drawing (see `breath`) */}
              {MEAL_STOPS.filter(meal => meal !== value).map(meal => {
                const d = g.stationR * 2;
                const halo = d * 2.6;
                return (
                  <View
                    key={meal}
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: g.sun[meal].x - halo / 2,
                      top: g.sun[meal].y - halo / 2,
                      width: halo,
                      height: halo,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Animated.View
                      style={[
                        StyleSheet.absoluteFill,
                        {
                          borderRadius: halo / 2,
                          backgroundColor: sky.station,
                          opacity: still ? BREATH_HALO[0] : haloOpacity,
                        },
                      ]}
                    />
                    <Animated.View
                      style={{
                        width: d,
                        height: d,
                        borderRadius: d / 2,
                        backgroundColor: sky.station,
                        transform: [{ scale: still ? 1 : dotScale }],
                      }}
                    />
                  </View>
                );
              })}

              {/* the sun, centered on its place: its box is the halo's, moved to the arc */}
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    left: -haloOuter / 2,
                    top: -haloOuter / 2,
                    width: haloOuter,
                    height: haloOuter,
                  },
                  anim.sun,
                ]}
              >
                {sky.scenery ? (
                  <Animated.View style={[StyleSheet.absoluteFill, anim.halo]}>
                    <Svg width={haloOuter} height={haloOuter}>
                      <Circle
                        cx={haloOuter / 2}
                        cy={haloOuter / 2}
                        r={haloOuter / 2}
                        fill={sky.halo}
                      />
                      <Circle
                        cx={haloOuter / 2}
                        cy={haloOuter / 2}
                        r={haloInner / 2}
                        fill={sky.halo}
                      />
                    </Svg>
                  </Animated.View>
                ) : null}
                <Svg
                  width={2 * r}
                  height={2 * r}
                  style={{ position: 'absolute', left: haloOuter / 2 - r, top: haloOuter / 2 - r }}
                >
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

              {/* the land, over the sun, so dinner's sun sets behind it; each time of day's
                  ground crosses over with its sky */}
              <GroundLayer scene={sky.scenes.BREAKFAST} g={g} />
              {sky.scenery
                ? LATER.map(meal => (
                    <Animated.View key={meal} style={[StyleSheet.absoluteFill, anim.land[meal]]}>
                      <GroundLayer scene={sky.scenes[meal]} g={g} />
                    </Animated.View>
                  ))
                : null}

              {MEAL_STOPS.map((meal, i) => {
                const box = words.box[meal];
                return (
                  <Animated.View
                    key={meal}
                    style={[
                      styles.word,
                      {
                        left: box.left,
                        width: spanWidth(box),
                        top: g.band.top,
                        height: g.band.bottom - g.band.top,
                      },
                      anim.written[i],
                    ]}
                  >
                    {/* ONE LINE, WHOLE: the strip is sized so the word fits at `cap` (the test
                        proves it at every width the sheet can have), and a word the bound did
                        not foresee is made smaller rather than cut off. Bold at the size the
                        strip is measured for — bodySm's, the bottle's and the bath's — with the
                        face's own line: no line height, because `MEAL_WORD.line` is that line */}
                    <AppText
                      variant="bodyStrong"
                      color={sky.scenes[meal].word}
                      align="center"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={MEAL_WORD.shrink}
                      maxFontSizeMultiplier={words.cap}
                      style={{ fontSize: MEAL_WORD.size }}
                    >
                      {labels[meal]}
                    </AppText>
                  </Animated.View>
                );
              })}
            </View>
            {/* the rim, drawn OVER the picture: on Android a border is part of the view's own
                background and the layers inside would paint straight over it */}
            <View
              style={[
                StyleSheet.absoluteFill,
                { borderRadius: t.radius.m, borderWidth: g.rim, borderColor: t.color.line2 },
              ]}
            />
          </View>
        ) : null}

        {/* the four meals: equal quarters of the picture, over the drawing, one radio each */}
        <View style={[StyleSheet.absoluteFill, styles.zones]}>
          {MEAL_STOPS.map(meal => (
            <Pressable
              key={meal}
              accessibilityRole="radio"
              accessibilityLabel={labels[meal]}
              accessibilityState={{ checked: meal === value, selected: meal === value, disabled }}
              disabled={disabled}
              onPress={() => choose(meal)}
              style={styles.zone}
              {...(testID ? { testID: `${testID}.${meal}` } : {})}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/** One time of day's sky: its gradient, top to horizon, over the whole picture. */
function SkyLayer({ id, scene, g }: { id: string; scene: MealScene; g: MealSkyGeometry }) {
  const last = Math.max(1, scene.sky.length - 1);
  return (
    <Svg width={g.width} height={g.height} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={0}
          y2={g.horizon}
        >
          {scene.sky.map((c, i) => (
            <Stop key={`${c}-${i}`} offset={String(i / last)} stopColor={c} />
          ))}
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={g.width} height={g.height} fill={`url(#${id})`} />
    </Svg>
  );
}

/** One time of day's land: the far hill, the near hill, and the strip the word is written on. */
function GroundLayer({ scene, g }: { scene: MealScene; g: MealSkyGeometry }) {
  return (
    <Svg width={g.width} height={g.height} style={StyleSheet.absoluteFill}>
      <Path d={g.hills.far} fill={scene.hill} />
      <Path d={g.hills.near} fill={scene.ground} />
      <Rect x={0} y={g.horizon} width={g.width} height={g.height - g.horizon} fill={scene.ground} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  // the room is measured on the root; the picture stops growing past `maxWidth` and is centered
  root: { alignSelf: 'stretch' },
  box: { alignSelf: 'center' },
  track: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  zones: { flexDirection: 'row' },
  zone: { flex: 1 },
  word: { position: 'absolute', justifyContent: 'center' },
});
