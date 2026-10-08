/**
 * ThemeSkyToggle — the Appearance sheet's Theme as a picture of the sky with three places to be
 * (the owner, 2026-09-25: *"from the theme animation to switch to dark in onboarding, create one
 * more with enough spacing to fit the text (Light, Night, or Dark) depending on which one being
 * selected on the theme page instead of the boring text selection it has now. Make 3 a 3 way
 * toggle: left day, middle night, right dark"*). It is setup's `DayNightSwitch` one stop wider:
 *
 *   LIGHT, on the left: setup's cobalt afternoon, a pale-gold sun for the knob, a cloud and a wisp.
 *   NIGHT, in the middle: the amber theme's own picture — a warm near-black sky and an amber
 *     crescent for the knob, drawn from the night palette and nothing else (`theme/sky.ts`).
 *   DARK, on the right: setup's indigo night, the cratered moon for the knob, the stars.
 *
 * THE CHOSEN STOP'S WORD IS WRITTEN ON THE SKY, in the room beside the knob — "Light" right of the
 * sun, "Night" right of the middle knob, "Dark" left of the moon — and each of the other two stops
 * shows a small glyph where its knob would rest (a sun, a crescent, a moon), so a parent can see
 * there are three places to go and what each is without the words for all three. A stop behind
 * the paywall carries a lock beside its glyph BEFORE it is tapped (CLAUDE.md §4: a control looks
 * gated before the tap), and its picture is still the thing being sold, so the lock does not
 * replace it. The words come from the caller; the design system types no copy.
 *
 * THE ANIMATION (`themeSkyToggle.ts` holds the numbers and tests them). Three values, each on the
 * native driver: `pos` for the knob, in stops, and one per picture layer, `night` and `dark`. The
 * layers are stacked day, dark, night, and the day is always whole, so the pill is never
 * see-through; a move animates each value from wherever it is to the plan's target, on setup's
 * curve, 560 ms a stop:
 *   - the KNOB rolls — half a turn a stop, once from end to end (`ROLL_PER_STRIDE`) — stretches
 *     a little between stops and changes face as it goes, the new face turning into place upright;
 *     it settles past the middle and comes back, and lands at either end without overshooting,
 *     because the rim is three points away there;
 *   - the PICTURES cross-fade from the old stop straight to the new one, the word and the glyphs
 *     with them. On a jump from Light to Dark the knob rolls THROUGH the middle but the Night layer
 *     is never touched, so the amber picture does not flash up on the way across;
 *   - the CLOUDS part and drift off as the day is covered, the STARS slide in and twinkle on as
 *     the dark arrives, and the HALO draws in while the knob rolls and blooms at the stop, fainter
 *     round the moon and not at all at Night.
 * A tap mid-roll turns everything round from where it is. REDUCE MOTION sets the end state and
 * starts nothing (docs/DESIGN_SYSTEM.md §7), read from the theme as `DayNightSwitch` reads it.
 *
 * ITS COLORS ARE A PICTURE'S (`theme/sky.ts`), for the switch's reason: this is what flips the
 * theme, so a sky drawn from the palette would change palette half way through its own roll. And
 * because tapping Night repaints the app amber in the same frame, a roll to Night keeps drawing
 * the pictures it started in until it arrives (`skyHold`) — then changes set on Night, where
 * nothing that changes can be seen. Only the rim is the theme's `line2`.
 *
 * TO EVERYTHING BUT THE EYE IT IS A RADIO GROUP: the group's name, then three radios in order —
 * each a third of the pill, a 44 pt target at the narrowest sheet, named with its word and saying
 * whether it is checked, a locked one saying what unlocks it, and every one saying why while the
 * whole control is disabled (`disabledHint`, 2026-09-29) — laid over a drawing that sits in a
 * `pointerEvents="none"` wrapper hidden from assistive technology. There is no drag: it lives in
 * a sheet that scrolls vertically, where a sideways drag fights the scroll, and three taps are
 * three targets. Nothing is said by color alone: the word, the knob's face and where it rests all
 * say which stop is chosen.
 *
 * EVERY TAP IS REPORTED, the chosen stop and a locked one included, and the knob follows `value`
 * and nothing else. A locked tap changes no value, so nothing moves and the caller opens the gate;
 * and a stop can be checked without having been chosen — the sheet shows the phone's own light
 * or dark as checked while "Match phone" is on — so a tap on it is the parent choosing it, and
 * the caller, not this control, decides what that changes.
 *
 * AND EVERY TAP IS FELT BEFORE IT IS REPORTED (the owner, 2026-09-25: "a click at each
 * theme-switch stop"): a `tick` when it sends the knob to a new stop, a `warning` on a locked one,
 * nothing on the stop the knob already rests on (`feedback/choice.ts`). ONCE PER CHOICE, at the
 * tap — not again as the knob lands 560 ms later, which reduce motion does not wait for, and not
 * at the middle stop a Light-to-Dark roll passes through, which was never chosen.
 *
 * THE OTHER STOPS LOOK LIKE PLACES TO GO (the owner, 2026-09-26: *"the moon icons (for night and
 * dark) need tto be highlighted more, in case if user wont understand how to change it"*): each
 * unchosen glyph is 18 pt, brighter, and sits on a soft halo edged by a fine ring (`MARKER_HALO`;
 * in the amber pictures the ring alone), a locked stop's lock inside the same halo — quieter than
 * the chosen word and the knob, and plainly something to press.
 *
 * AND IT CAN OFFER TWO STOPS (`stops`; the owner, the same day: *"in theme selection if automatic
 * night mode is on, the dim to should be a toggle like previously but only bettwen dark or
 * night"*). "Dim to" is this toggle with `DIM_STOPS` — Night on the left, Dark on the right, the
 * Theme toggle's own two, each word on the side of its knob it has there — in two equal halves, a
 * radio group of two. Without the day the picture stack starts at Dark, drawn whole, with Night
 * over it; the move, the hold through a repaint, the locks and the taps are the same.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { feelChoice } from '../feedback/choice';
import { Icon } from '../icons/Icon';
import { composite } from '../theme/contrast';
import { themeSkyFor, type SkyScene, type ThemeSky } from '../theme/sky';
import type { ThemeName } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import {
  CLOUD_BASE,
  CLOUD_BUMPS,
  CLOUD_VIEWBOX,
  CRATERS,
  SPARKLE_PATH,
  SUN_HIGHLIGHT,
  type CloudBox,
  type Frame,
} from './dayNightSwitch';
import { AppText } from './Text';
import {
  crescentPath,
  MARKER,
  MARKER_CRESCENT,
  MARKER_HALO,
  MARKER_LOCK,
  MARKER_LOCK_GAP,
  MARKER_PAD,
  MARKER_RING,
  MOON_GLYPH_CRATERS,
  MOON_GLYPH_R,
  planSkyMove,
  SKY_EASE,
  skyHold,
  skyStops,
  spanWidth,
  stopIndex,
  SUN_GLYPH_R,
  SUN_RAY_STROKE,
  SUN_RAYS,
  themeSkyFrames,
  themeSkyGeometry,
  WORD_TYPE,
  wordScaleCap,
  type SkyEase,
  type SkyMotion,
  type SkyStop,
  type ThemeSkyGeometry,
} from './themeSkyToggle';

/** The three stops, for a caller typing its handler; the arithmetic stays in `themeSkyToggle.ts`. */
export type { SkyStop } from './themeSkyToggle';
export { DIM_STOPS } from './themeSkyToggle';

export interface ThemeSkyToggleProps<S extends SkyStop = SkyStop> {
  /** The chosen stop: the knob rests there and its word is written beside it. */
  value: S;
  /** Every tap on a stop — the chosen one and a locked one included (see the header). */
  onChange: (stop: S) => void;
  /**
   * The stops offered, left to right: all three (the Theme toggle, the default) or two of them in
   * that order — `DIM_STOPS` for "Dim to". A caller that narrows `S` passes the stops it narrowed to.
   */
  stops?: readonly S[];
  /** The group's name, for assistive technology: a radiogroup without one is loose radios. */
  label: string;
  /** Each offered stop's word, from the caller: written on the sky and read as the radio's name. */
  labels: Readonly<Record<S, string>>;
  /** Stops behind a gate: drawn with a lock, and still tappable so the caller can open it. */
  locked?: Readonly<Partial<Record<S, boolean>>>;
  /** Read after a locked stop's name ("Included with …"), in the caller's words. */
  lockedHint?: string;
  /**
   * A status word spoken after a stop's name ("Night, Plus"): the app's quiet "Plus" tag during the
   * 14-day preview (2026-09-28), which the caller draws under the pill for the eye. Nothing in the
   * drawing changes, so the geometry the stops are measured in is the same with it or without.
   */
  badges?: Readonly<Partial<Record<S, string>>>;
  /** The room the control has. The pill takes all of it, up to `THEME_SKY_SIZE.maxWidth`. */
  width: number;
  /** Dimmed as one picture, and no stop takes a tap: the knob still rests on `value`. */
  disabled?: boolean;
  /**
   * WHY IT IS DISABLED, read after every stop's name while it is, in the caller's words: the
   * Appearance sheet's Theme while automatic night mode decides the look (2026-09-29). A disabled
   * radio with no reason is heard as "dimmed" and nothing else, which to a screen reader is the
   * same broken control the owner saw. It replaces a locked stop's hint meanwhile: no stop can be
   * tapped, so what a tap would unlock is not the news.
   */
  disabledHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;
/** A value, or one built from values (`Animated.add` is an interpolation too). */
type Driver = Animated.Value | Animated.AnimatedInterpolation<number>;

const EASE: Record<SkyEase, (t: number) => number> = {
  settle: Easing.bezier(...SKY_EASE.settle),
  land: Easing.bezier(...SKY_EASE.land),
};
/** The shadow's disc sits a point inside the faces, so its anti-aliased edge is under them. */
const BASE_INSET = 1;
/** Not useId(): its output contains ':', which is not valid in an SVG fragment identifier. */
let instances = 0;

/** What the toggle last drew, and which theme's pictures it is holding through a roll to Night. */
interface Latch {
  value: SkyStop;
  held: ThemeName | null;
  shown: ThemeName;
}

export function ThemeSkyToggle<S extends SkyStop = SkyStop>(props: ThemeSkyToggleProps<S>) {
  // one body for every narrowing of the stops: inside, a stop is a stop (`S` only types the caller)
  const {
    value,
    onChange,
    stops,
    label,
    labels,
    locked,
    lockedHint,
    badges,
    width,
    disabled = false,
    disabledHint,
    style,
    testID,
  } = props as unknown as ThemeSkyToggleProps<SkyStop>;
  const offered = skyStops(stops);
  const t = useTheme();
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-themesky-${(instances += 1)}`;
  const id = uid.current;

  /*
    WHICH PICTURES TO DRAW (`skyHold`): the painted theme's — except through a roll to Night that
    the tap itself repainted amber, which keeps the set it started in until it arrives. Held as
    state derived during render (React's "storing information from previous renders"), so the
    first frame of the roll is already right: an effect would draw one frame of the wrong set.
  */
  const [latch, setLatch] = useState<Latch>(() => ({ value, held: null, shown: t.theme }));
  const next: Latch =
    latch.value === value
      ? latch
      : { value, held: skyHold(latch.shown, value, t.theme, t.reduceMotion), shown: latch.shown };
  const drawn = next.held ?? t.theme;
  if (next !== latch || next.shown !== drawn) setLatch({ ...next, shown: drawn });
  const sky = themeSkyFor(drawn);

  const lockedLight = !!locked?.light;
  const lockedNight = !!locked?.night;
  const lockedDark = !!locked?.dark;
  // the stops as one key, so the memo sees a caller's new array of the same stops as the same
  const stopsKey = offered.join(',');
  const g = useMemo(
    () =>
      themeSkyGeometry(
        width,
        { light: lockedLight, night: lockedNight, dark: lockedDark },
        stopsKey.split(',') as SkyStop[],
      ),
    [width, lockedLight, lockedNight, lockedDark, stopsKey],
  );
  const cap = wordScaleCap(g, labels);
  const hasDay = g.stops.includes('light');
  const hasDark = g.stops.includes('dark');
  const hasNight = g.stops.includes('night');

  // constructed AT the resting value, so the first frame is already the right picture
  const pos = useRef(new Animated.Value(stopIndex(value, offered))).current;
  const night = useRef(new Animated.Value(value === 'night' ? 1 : 0)).current;
  const dark = useRef(new Animated.Value(value === 'dark' ? 1 : 0)).current;
  // where the knob was last sent, and the move that is taking it there
  const at = useRef<SkyStop>(value);
  const motion = useRef<SkyMotion | null>(null);

  useEffect(() => {
    const now = Date.now();
    const m = motion.current;
    const resting = m === null || now >= m.startedAt + m.duration;
    // already there: the first render, or one that changed nothing about where it rests
    if (at.current === value && resting && !t.reduceMotion) return;
    // the previous run was stopped by its cleanup before this ran, which is what HOLDS a layer
    // this plan sends nowhere: it stays exactly where the stop left it
    const plan = planSkyMove(m, at.current, value, now, t.reduceMotion, g.stops);
    at.current = value;
    if (plan.snapDark !== undefined) dark.setValue(plan.snapDark);
    if (!plan.animate) {
      // set, even over a move in flight: turning reduce motion on mid-roll stops the run first,
      // and without this the knob would freeze half way across
      pos.setValue(plan.pos);
      night.setValue(plan.night);
      if (plan.dark !== undefined) dark.setValue(plan.dark);
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
      // the pictures never overshoot: an opacity past 1 means nothing
      timing(night, plan.night, 'land'),
      ...(plan.dark === undefined ? [] : [timing(dark, plan.dark, 'land')]),
    ]);
    motion.current = {
      from: plan.from,
      to: value,
      startedAt: now,
      duration: plan.duration,
      ease: plan.ease,
    };
    // arrived: the roll to Night may stop holding the set it started in (`skyHold`)
    run.start(({ finished }) => {
      if (finished) setLatch(l => (l.held === null ? l : { ...l, held: null }));
    });
    // a new tap, reduce motion, or the toggle going away: stop where it is
    return () => run.stop();
  }, [dark, night, pos, value, t.reduceMotion, g.stops]);

  // built once per geometry: every layer is a view of the same three values
  const anim = useMemo(() => {
    const f = themeSkyFrames(g);
    // how much of the day is covered, by either layer: the clouds leave as it goes
    const cover = Animated.add(night, dark);
    // copies, because `interpolate` is typed for mutable arrays and the frames are frozen data
    const num = (v: Driver, fr: Frame) =>
      v.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: [...fr.outputRange],
        extrapolate: fr.extrapolate,
      });
    const deg = (v: Driver, fr: Frame) =>
      v.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: fr.outputRange.map(d => `${d}deg`),
        extrapolate: fr.extrapolate,
      });
    const knob: AnimatedStyle = {
      transform: [{ translateX: num(pos, f.knobX) }, { scaleX: num(pos, f.knobStretch) }],
    };
    // the sun is whole until a face above it is; the moon until the crescent is (`covered`)
    const sunFace: AnimatedStyle = {
      opacity: Animated.multiply(num(dark, f.covered), num(night, f.covered)),
      transform: [{ rotate: deg(pos, f.turn.light) }],
    };
    const moonFace: AnimatedStyle = {
      opacity: Animated.multiply(num(dark, f.moonFace), num(night, f.covered)),
      transform: [{ rotate: deg(pos, f.turn.dark) }],
    };
    const crescentFace: AnimatedStyle = {
      opacity: num(night, f.crescentFace),
      transform: [{ rotate: deg(pos, f.turn.night) }],
    };
    const halo: AnimatedStyle = {
      opacity: num(pos, f.haloOpacity),
      transform: [{ scale: num(pos, f.haloScale) }],
    };
    const shadow: AnimatedStyle = { opacity: num(night, f.shadow) };
    const darkSky: AnimatedStyle = { opacity: num(dark, f.darkSky) };
    const nightSky: AnimatedStyle = { opacity: num(night, f.nightSky) };
    const cloud: AnimatedStyle = {
      opacity: num(cover, f.cloudOpacity),
      transform: [{ translateX: num(cover, f.cloudX) }],
    };
    const wisp: AnimatedStyle = {
      opacity: num(cover, f.wispOpacity),
      transform: [{ translateX: num(cover, f.wispX) }],
    };
    const starField: AnimatedStyle = { transform: [{ translateX: num(dark, f.starsX) }] };
    const stars: AnimatedStyle[] = f.stars.map(s => ({
      opacity: num(dark, s.opacity),
      transform: [{ scale: num(dark, s.scale) }],
    }));
    return {
      knob,
      sunFace,
      moonFace,
      crescentFace,
      halo,
      shadow,
      darkSky,
      nightSky,
      cloud,
      wisp,
      starField,
      stars,
    };
  }, [g, pos, night, dark]);

  // THE KNOB'S SHADOW, as setup's switch casts it: never an Android `elevation` on something that
  // moves and scales under a native animation (StopButton.tsx records the square it drew)
  const shadowStyle: ViewStyle =
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

  const k = g.knob;
  const [haloInner, haloOuter] = g.halo;
  const base = k - 2 * BASE_INSET;
  const picture = (stop: SkyStop) => (
    <Picture
      stop={stop}
      sky={sky}
      g={g}
      id={id}
      word={labels[stop] ?? ''}
      cap={cap}
      locked={{ light: lockedLight, night: lockedNight, dark: lockedDark }}
      anim={anim}
    />
  );

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.root, { width: g.width, height: g.height }, style]}
      {...(testID ? { testID } : {})}
    >
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        // dimmed as ONE picture when disabled, not layer by layer through each other
        needsOffscreenAlphaCompositing={disabled}
        style={[StyleSheet.absoluteFill, { opacity: disabled ? 0.5 : 1 }]}
      >
        <View style={[styles.track, { borderRadius: t.radius.pill }]}>
          {/* day at the bottom, always whole; dark over it; night on top (`skyWeights`). Without
              the day ("Dim to"), dark is the bottom, whole: the pill is never see-through */}
          {hasDay ? <View style={StyleSheet.absoluteFill}>{picture('light')}</View> : null}
          {hasDark && hasDay ? (
            <Animated.View
              needsOffscreenAlphaCompositing
              style={[StyleSheet.absoluteFill, anim.darkSky]}
            >
              {picture('dark')}
            </Animated.View>
          ) : hasDark ? (
            <View style={StyleSheet.absoluteFill}>{picture('dark')}</View>
          ) : null}
          {hasNight ? (
            <Animated.View
              needsOffscreenAlphaCompositing
              style={[StyleSheet.absoluteFill, anim.nightSky]}
            >
              {picture('night')}
            </Animated.View>
          ) : null}

          <Animated.View
            style={[
              { position: 'absolute', left: g.inset, top: g.inset, width: k, height: k },
              anim.knob,
            ]}
          >
            {sky.scenery ? (
              <>
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
                {/* what the shadow is cast from, under the faces; it goes as Night comes, so no
                    indigo shade falls on the amber sky. The bottom face's own color: the sun's, or
                    the moon's where there is no day */}
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      left: BASE_INSET,
                      top: BASE_INSET,
                      width: base,
                      height: base,
                      borderRadius: base / 2,
                      backgroundColor: hasDay ? sky.light.sun[1] : sky.dark.moon,
                    },
                    shadowStyle,
                    anim.shadow,
                  ]}
                />
              </>
            ) : null}
            {hasDay ? (
              <Animated.View style={[StyleSheet.absoluteFill, anim.sunFace]}>
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
                      <Stop offset="0" stopColor={sky.light.sun[0]} />
                      <Stop offset="1" stopColor={sky.light.sun[1]} />
                    </RadialGradient>
                  </Defs>
                  <Circle cx={k / 2} cy={k / 2} r={k / 2} fill={`url(#${id}-sun)`} />
                </Svg>
              </Animated.View>
            ) : null}
            {hasDark ? (
              <Animated.View style={[StyleSheet.absoluteFill, anim.moonFace]}>
                <Svg width={k} height={k}>
                  <Circle cx={k / 2} cy={k / 2} r={k / 2} fill={sky.dark.moon} />
                  {CRATERS.map(c => (
                    <Circle
                      key={`${c.cx}-${c.cy}`}
                      cx={k * c.cx}
                      cy={k * c.cy}
                      r={k * c.r}
                      fill={sky.dark.crater}
                    />
                  ))}
                </Svg>
              </Animated.View>
            ) : null}
            {hasNight ? (
              <Animated.View style={[StyleSheet.absoluteFill, anim.crescentFace]}>
                <Svg width={k} height={k}>
                  <Circle cx={k / 2} cy={k / 2} r={k / 2} fill={sky.night.unlit} />
                  <Path d={crescentPath(k)} fill={sky.night.crescent} />
                </Svg>
              </Animated.View>
            ) : null}
          </Animated.View>
        </View>
        {/* the rim, drawn OVER the sky: on Android a border is part of the view's own background
            and the sky layers inside would paint straight over it */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: t.radius.pill, borderWidth: g.rim, borderColor: t.color.line2 },
          ]}
        />
      </View>

      {/* the stops: equal thirds of the pill (halves on "Dim to"), over the drawing, a radio each */}
      <View style={[StyleSheet.absoluteFill, styles.zones]}>
        {g.stops.map(stop => (
          <Pressable
            key={stop}
            accessibilityRole="radio"
            accessibilityLabel={
              badges?.[stop] ? `${labels[stop] ?? ''}, ${badges[stop]}` : (labels[stop] ?? '')
            }
            {...(disabled && disabledHint
              ? { accessibilityHint: disabledHint }
              : locked?.[stop] && lockedHint
                ? { accessibilityHint: lockedHint }
                : {})}
            accessibilityState={{ checked: stop === value, selected: stop === value, disabled }}
            disabled={disabled}
            onPress={() => {
              feelChoice({
                locked: locked?.[stop] === true,
                current: stop === value,
                kind: 'tick',
              });
              onChange(stop);
            }}
            style={styles.zone}
            {...(testID ? { testID: `${testID}.${stop}` } : {})}
          />
        ))}
      </View>
    </View>
  );
}

interface PictureProps {
  stop: SkyStop;
  sky: ThemeSky;
  g: ThemeSkyGeometry;
  id: string;
  word: string;
  cap: number;
  locked: Readonly<Record<SkyStop, boolean>>;
  anim: {
    cloud: AnimatedStyle;
    wisp: AnimatedStyle;
    starField: AnimatedStyle;
    stars: AnimatedStyle[];
  };
}

/**
 * ONE STOP'S PICTURE: its sky, its scenery, a glyph at each of the other stops, and its word.
 * Everything in it fades together, so the word leaves with its stop and arrives with the next.
 */
function Picture({ stop, sky, g, id, word, cap, locked, anim }: PictureProps) {
  const scene: SkyScene = sky[stop];
  const span = g.word[stop];
  return (
    <>
      <Svg width={g.width} height={g.height} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient
            id={`${id}-${stop}`}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={0}
            y2={g.height}
          >
            <Stop offset="0" stopColor={scene.sky[0]} />
            <Stop offset="1" stopColor={scene.sky[1]} />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={g.width} height={g.height} fill={`url(#${id}-${stop})`} />
      </Svg>

      {sky.scenery && stop === 'light' ? (
        <>
          <Cloud box={g.wisp} fill={sky.cloud} style={anim.wisp} />
          <Cloud box={g.cloud} fill={sky.cloud} style={anim.cloud} />
        </>
      ) : null}
      {sky.scenery && stop === 'dark' ? (
        <Animated.View style={[StyleSheet.absoluteFill, anim.starField]}>
          {g.stars.map((s, i) => (
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
      ) : null}

      {g.stops
        .filter(other => other !== stop)
        .map(other => (
          <Marker
            key={other}
            stop={other}
            left={g.markerLeft[other]}
            top={(g.height - MARKER_HALO) / 2}
            width={g.marker[other]}
            scene={scene}
            locked={locked[other]}
          />
        ))}

      <View style={[styles.word, { left: span.left, width: spanWidth(span), height: g.height }]}>
        {/* ONE LINE, WHOLE: the pill is sized so the word fits at `cap` (the placement test proves
            it at every width the sheet can have), and a word the bound did not foresee is made
            smaller rather than cut off */}
        <AppText
          variant="bodyStrong"
          color={scene.word}
          align="center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={WORD_TYPE.shrink}
          maxFontSizeMultiplier={cap}
        >
          {word}
        </AppText>
      </View>
    </>
  );
}

/**
 * AN UNCHOSEN STOP'S GLYPH: a sun with rays, a crescent, or a full moon with two craters — three
 * shapes, so they are told apart without their colors — on its halo, a soft disc of its ink edged
 * by a fine ring of it (the owner, 2026-09-26: "need tto be highlighted more"); and, when the stop
 * is behind a gate, the design system's own lock beside it, inside the same halo — one thing to tap.
 */
function Marker({
  stop,
  left,
  top,
  width,
  scene,
  locked,
}: {
  stop: SkyStop;
  left: number;
  top: number;
  /** The halo's width: a disc, or a capsule round the glyph and its lock (`markerWidth`). */
  width: number;
  scene: SkyScene;
  locked: boolean;
}) {
  const ink = scene.marker;
  // the craters are the ground under the moon showing faintly through: the halo, over the sky
  const ground = composite(scene.sky[1], scene.markerHalo);
  const c = MARKER / 2;
  const inset = (MARKER - MARKER_CRESCENT) / 2;
  return (
    <View
      style={[
        styles.marker,
        {
          left,
          top,
          width,
          height: MARKER_HALO,
          borderRadius: MARKER_HALO / 2,
          backgroundColor: scene.markerHalo,
          borderColor: scene.markerRing,
          borderWidth: MARKER_RING,
          // the glyph MARKER_PAD in from the halo's outer edge, the ring inside that
          paddingHorizontal: MARKER_PAD - MARKER_RING,
          gap: MARKER_LOCK_GAP,
        },
      ]}
    >
      <Svg width={MARKER} height={MARKER}>
        {stop === 'light' ? (
          <>
            <Circle cx={c} cy={c} r={SUN_GLYPH_R} fill={ink} />
            {SUN_RAYS.map(([x1, y1, x2, y2]) => (
              <Line
                key={`${x1}-${y1}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={ink}
                strokeWidth={SUN_RAY_STROKE}
                strokeLinecap="round"
              />
            ))}
          </>
        ) : stop === 'night' ? (
          <Path
            d={crescentPath(MARKER_CRESCENT)}
            transform={`translate(${inset} ${inset})`}
            fill={ink}
          />
        ) : (
          <>
            <Circle cx={c} cy={c} r={MOON_GLYPH_R} fill={ink} />
            {/* the craters are the sky showing faintly through: a shade, never a second color */}
            {MOON_GLYPH_CRATERS.map(cr => (
              <Circle
                key={`${cr.cx}-${cr.cy}`}
                cx={cr.cx}
                cy={cr.cy}
                r={cr.r}
                fill={ground}
                opacity={0.45}
              />
            ))}
          </>
        )}
      </Svg>
      {locked ? <Icon name="lock" size={MARKER_LOCK} color={ink} strokeWidth={2.4} /> : null}
    </View>
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
  // centered in whatever holds it: past `maxWidth` the pill stops growing and its room does not
  root: { alignSelf: 'center' },
  track: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  zones: { flexDirection: 'row' },
  zone: { flex: 1 },
  word: { position: 'absolute', top: 0, justifyContent: 'center' },
  marker: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
});
