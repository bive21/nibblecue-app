/**
 * SideSlider — which side a thing starts on, chosen by sliding to it (the owner, 2026-09-26, of the
 * breastfeed sheet's `Start left` / `Start right`: *"what about user has to swipe to left or right
 * from a button in the middle that needs to be dragged"*). `sideSlider.ts` holds every number and
 * tests it; this file hands a finger's travel to those numbers and draws what they return.
 *
 * WHAT IT DRAWS, bottom to top, inside a `pointerEvents="none"` wrapper hidden from assistive
 * technology:
 *
 *   the pill, in the module's soft tint;
 *   behind each word, the glow it lights with — never in the amber Night;
 *   each word twice, quiet (`text2`, regular) and lit (`text`, bold), cross-faded by `lit`, which
 *     moves only when a side arms, is chosen or is let go — so a word lights with the tick;
 *   the chevrons ‹ › beside the knob at rest, gone as soon as it moves;
 *   the KNOB, a disc of the module's ink carrying the caller's glyph, carried by `x`;
 *   the rim, the theme's `line2`, over everything, as the toggles draw theirs.
 *
 * WHAT A FINGER DOES (`PanResponder` and `Animated` — no gesture library, for ListRow.tsx's reason):
 * it never takes a touch where it lands, so the words and the knob keep their taps; it takes one
 * only once the finger has gone sideways past `claim` and mostly sideways (`claimsSlide`), so a
 * touch the sheet's vertical scroll wanted is never taken, and it hands one back that has turned
 * into a scroll while nothing is armed (`yieldsToScroll`). The knob follows the finger, clamped to
 * its travel; a side arms with ONE `tick` and its word lights (`armAfter`); the lift chooses
 * (`sideOnRelease`) — the knob slides the rest of the way and the caller hears the choice as it
 * lands — or the knob springs home.
 *
 * WHAT A TAP DOES: each word is a real button that chooses its side, with the same slide and the
 * same light, so no parent is ever made to drag. A tap on the knob nudges it out and back to show
 * that it moves; it chooses nothing.
 *
 * FELT ONCE, AND NOT FOR THE CHOICE ITSELF. The one haptic here is the arming `tick`. The choice is
 * felt by what it does: on the breastfeed sheet the timer's start is the `double`, fired by the
 * write that made it (`useTimerActions`: "a start that was WRITTEN is a double"), and a start the
 * app refuses is that write's `warning`. A double from the slider as well would be two for one
 * start — and one fired before a refusal would say the feed had started when it had not.
 *
 * HEARD ONCE. A chosen slider is spent: it takes no drag, tap or action until the caller hands the
 * choice back, by resolving `onChoose`'s promise to false (a start that was refused). Then the knob
 * springs home and the slider is live again.
 *
 * TO ASSISTIVE TECHNOLOGY it is three elements, in the order they are drawn: the left word, a
 * `button` named for what it does ("Start left", the caller's words); the slider, a `button` with
 * the caller's name and hint and two actions, `left` and `right`, named the same way — VoiceOver
 * offers them on a swipe up or down, TalkBack in its actions menu; and the right word. A `button`
 * rather than `adjustable`: an adjustable's swipe up or down is its increment, which here would
 * start a feed on a gesture a screen-reader user makes to explore, and would bury the two actions
 * in the rotor. The design system types no copy: every word is the caller's.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { haptic } from '../feedback/haptics';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { moduleColor } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import type { Frame } from './dayNightSwitch';
import {
  armAfter,
  claimsSlide,
  GLOW_STOPS,
  knobOffset,
  planKnob,
  SIDE_CHEVRON,
  SIDE_MOTION,
  SIDE_SLIDER,
  SIDE_WORD,
  sideOnRelease,
  sideSign,
  sideSliderColors,
  sideSliderFrames,
  sideSliderGeometry,
  sideSliderStill,
  sideWordCap,
  SLIDER_SIDES,
  yieldsToScroll,
  type SideSliderGeometry,
  type SliderSide,
} from './sideSlider';
import { AppText } from './Text';
import { spanWidth, type Span } from './themeSkyToggle';

/** The two sides, for a caller typing its handler; the arithmetic stays in `sideSlider.ts`. */
export type { SliderSide } from './sideSlider';

export interface SideSliderProps {
  /** The word written at each end ("Left", "Right"). */
  words: Readonly<Record<SliderSide, string>>;
  /** What choosing each side does, as a name: its word's button, and the slider's action for it. */
  actionLabels: Readonly<Record<SliderSide, string>>;
  /** The slider's own name, for assistive technology. */
  label: string;
  /** How it is used, for assistive technology ("Swipe left or right to choose the first side"). */
  hint: string;
  /**
   * A side was chosen — by a drag, a flick, a tap on its word or an accessibility action — heard
   * once, as the knob lands. Resolve false to hand the choice back when it could not be made: the
   * knob goes home and the slider can be used again.
   */
  onChoose: (side: SliderSide) => void | Promise<boolean>;
  /** Whose colors it wears: the module's ink and its soft tint, as the sheet's own card does. */
  moduleId: keyof typeof moduleColor;
  /** The knob's glyph, drawn in one ink at `SIDE_SLIDER.glyph`. */
  icon?: IconName;
  /** The room it has: the sheet's body. The pill takes all of it, up to `SIDE_SLIDER.maxWidth`. */
  width: number;
  /** Drawn dimmed, and nothing on it answers. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** `${testID}.slider` on the whole, `.left` and `.right` on the words, `.knob` on the knob. */
  testID?: string;
}

type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;

/** A frame, as `interpolate` takes it — copies, because the frames are frozen data. */
const num = (v: Animated.Value, fr: Frame) =>
  v.interpolate({
    inputRange: [...fr.inputRange],
    outputRange: [...fr.outputRange],
    extrapolate: fr.extrapolate,
  });

const SLIDE_EASE = Easing.bezier(...SIDE_MOTION.ease);

/** Not useId(): its output contains ':', which is not valid in an SVG fragment identifier. */
let instances = 0;

/** What the responder, made once, reads of the latest render. */
interface Latest {
  g: SideSliderGeometry;
  still: boolean;
  disabled: boolean;
  onChoose: SideSliderProps['onChoose'];
}

export function SideSlider({
  words,
  actionLabels,
  label,
  hint,
  onChoose,
  moduleId,
  icon,
  width,
  disabled = false,
  style,
  testID,
}: SideSliderProps) {
  const t = useTheme();
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-sideslider-${(instances += 1)}`;
  const id = uid.current;

  const { left: leftWord, right: rightWord } = words;
  const g = useMemo(
    () => sideSliderGeometry(width, { left: leftWord, right: rightWord }),
    [width, leftWord, rightWord],
  );
  const cap = sideWordCap(g, words);
  const colors = sideSliderColors(t.color, moduleColor[moduleId], t.theme);
  // null in the amber Night: nothing there may light up
  const glow = colors.glow;
  const still = sideSliderStill(t.reduceMotion);

  // the knob's offset from the middle, in points; and which word is lit, −1 left to +1 right
  const x = useRef(new Animated.Value(0)).current;
  const lit = useRef(new Animated.Value(0)).current;

  const latest = useRef<Latest>({ g, still, disabled, onChoose });
  useEffect(() => {
    latest.current = { g, still, disabled, onChoose };
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /*
    ONE RESPONDER FOR THE SLIDER'S LIFE, and the moves it makes, reading the latest render through
    `latest`: a responder rebuilt on a render could drop a drag half way. What a drag has armed,
    what has been chosen and where the finger last put the knob live here, beside it.
  */
  const [control] = useState(() => {
    let armed: SliderSide | null = null;
    let chosen: SliderSide | null = null;
    let shown = 0;
    const live = () => chosen === null && !latest.current.disabled;

    const light = (side: SliderSide | null) => {
      const to = side === null ? 0 : sideSign(side);
      if (latest.current.still) {
        lit.setValue(to);
        return;
      }
      Animated.timing(lit, {
        toValue: to,
        duration: SIDE_MOTION.litMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    };

    /** Jumped under reduce motion, slid to a chosen end, or sprung home (`planKnob`). */
    const moveKnob = (side: SliderSide | null, from: number, landed?: () => void) => {
      const plan = planKnob(from, side, latest.current.g, latest.current.still);
      if (plan.how === 'jump') {
        x.setValue(plan.to);
        landed?.();
        return;
      }
      const run =
        plan.how === 'spring'
          ? Animated.spring(x, { toValue: plan.to, ...SIDE_MOTION.spring, useNativeDriver: true })
          : Animated.timing(x, {
              toValue: plan.to,
              duration: plan.duration,
              easing: SLIDE_EASE,
              useNativeDriver: true,
            });
      // interrupted or not: a slide cut short by a turned phone still chose its side
      run.start(() => landed?.());
    };

    const home = () => {
      armed = null;
      light(null);
      moveKnob(null, shown);
      shown = 0;
    };

    /** The caller could not make the choice: the knob comes home, and the slider is live again. */
    const handBack = () => {
      if (!mounted.current || chosen === null) return;
      chosen = null;
      home();
    };

    const choose = (side: SliderSide, from: number) => {
      if (!live()) return;
      chosen = side;
      armed = null;
      light(side);
      shown = sideSign(side) * latest.current.g.half;
      moveKnob(side, from, () => {
        // heard as it lands, so the parent sees where the knob went before the sheet moves on —
        // and not at all if the slider went away first, a parent who closed the sheet mid-slide
        if (!mounted.current || chosen !== side) return;
        const out = latest.current.onChoose(side);
        if (out instanceof Promise) {
          void out.then(took => {
            if (!took) handBack();
          }, handBack);
        }
      });
    };

    const nudge = () => {
      if (!live() || latest.current.still) return;
      const { distance, ms } = SIDE_MOTION.nudge;
      Animated.sequence([
        Animated.timing(x, { toValue: distance, duration: ms[0], useNativeDriver: true }),
        Animated.timing(x, { toValue: -distance, duration: ms[1], useNativeDriver: true }),
        Animated.timing(x, { toValue: 0, duration: ms[2], useNativeDriver: true }),
      ]).start();
    };

    const pan = PanResponder.create({
      // NEVER ON CONTACT: a tap on a word or on the knob stays theirs
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) => live() && claimsSlide(gs),
      onPanResponderGrant: () => {
        // a spring or a nudge still running stops where it is: the finger has the knob now
        x.stopAnimation();
        armed = null;
      },
      onPanResponderMove: (_e, gs) => {
        const { g: now } = latest.current;
        shown = knobOffset(gs.dx, now);
        x.setValue(shown);
        const next = armAfter(armed, shown, now);
        if (next === armed) return;
        // ONE tick as a side arms: never as it lets go, never again while it stays armed
        if (next !== null) haptic('tick');
        armed = next;
        light(next);
      },
      // an armed side is kept; a drag that has turned into a scroll, with nothing armed, is the sheet's
      onPanResponderTerminationRequest: (_e, gs) => yieldsToScroll(gs, armed),
      onPanResponderRelease: (_e, gs) => {
        const side = sideOnRelease({ x: shown, vx: gs.vx, armed });
        if (side === null || !live()) {
          home();
          return;
        }
        choose(side, shown);
      },
      // the system took the touch (a call, the notification shade) or the scroll did: nothing chosen
      onPanResponderTerminate: () => home(),
    });

    return { pan, choose, nudge, chosen: () => chosen };
  });

  // a width that changes under the knob (a turned phone) keeps it where it belongs
  useEffect(() => {
    const side = control.chosen();
    x.setValue(side === null ? 0 : sideSign(side) * g.half);
  }, [control, g.half, x]);

  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'left' || name === 'right') control.choose(name, 0);
  };

  // built once: every layer is a view of the knob's place or of which word is lit
  const anim = useMemo(() => {
    const f = sideSliderFrames();
    const bySide = (fr: Record<SliderSide, Frame>): Record<SliderSide, AnimatedStyle> => ({
      left: { opacity: num(lit, fr.left) },
      right: { opacity: num(lit, fr.right) },
    });
    const knob: AnimatedStyle = { transform: [{ translateX: x }] };
    const chevron: AnimatedStyle = { opacity: num(x, f.chevron) };
    return { knob, chevron, lit: bySide(f.lit), quiet: bySide(f.quiet) };
  }, [x, lit]);

  // THE KNOB'S SHADOW: never an Android `elevation` on something that moves under a native
  // animation (StopButton.tsx records the square it drew) — a box-shadow is painted from the round
  // border box itself. None in the amber Night, and none where the skin draws none (Paper).
  const shadowStyle: ViewStyle =
    colors.shadow === null || t.skinTokens.surface.shadow === 'none'
      ? {}
      : Platform.OS === 'android'
        ? {
            boxShadow: [
              { offsetX: 0, offsetY: 2, blurRadius: 5, spreadDistance: 0, color: colors.shadow },
            ],
          }
        : {
            shadowColor: colors.shadow,
            shadowOpacity: 1,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
          };

  // one line, whole: each end is sized so its word fits at `cap` (the test walks every width), and
  // a word the bound did not foresee is made smaller, never cut off
  const word = (side: SliderSide, on: boolean) => (
    <AppText
      variant={on ? 'bodyStrong' : 'body'}
      color={on ? colors.word : colors.quiet}
      align="center"
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={SIDE_WORD.shrink}
      maxFontSizeMultiplier={cap}
      // one size and one line in both weights, so lighting swaps the weight and not the size
      style={{ fontSize: SIDE_WORD.size, lineHeight: SIDE_WORD.lineHeight }}
    >
      {words[side]}
    </AppText>
  );

  // a word's target: its end of the pill, the whole height — a real button that chooses its side.
  // Its id is written where it is called, beside the word `testID`, so the flow linter
  // (tools/e2e-testids.mjs) reads `${testID}.left` and `.right` as this component's own shapes.
  const end = (side: SliderSide, ids: { testID?: string }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={actionLabels[side]}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => control.choose(side, 0)}
      style={[styles.zone, { left: side === 'left' ? 0 : g.width - g.end, width: g.end }]}
      {...(ids.testID ? { testID: ids.testID } : {})}
    />
  );

  return (
    <View
      style={[styles.root, { width: g.width, height: g.height }, style]}
      {...control.pan.panHandlers}
      {...(testID ? { testID: `${testID}.slider` } : {})}
    >
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        // dimmed as ONE picture when disabled, not layer by layer through each other
        needsOffscreenAlphaCompositing={disabled}
        style={[StyleSheet.absoluteFill, { opacity: disabled ? 0.5 : 1 }]}
      >
        <View
          style={[styles.track, { borderRadius: t.radius.pill, backgroundColor: colors.ground }]}
        >
          {glow === null
            ? null
            : SLIDER_SIDES.map(side => (
                <Glow
                  key={side}
                  id={`${id}-glow-${side}`}
                  color={glow}
                  box={g.glow[side]}
                  top={g.inset}
                  height={g.knob}
                  style={anim.lit[side]}
                />
              ))}
          {SLIDER_SIDES.map(side => (
            <View
              key={side}
              style={[
                styles.word,
                { left: g.word[side].left, width: spanWidth(g.word[side]), height: g.height },
              ]}
            >
              <Animated.View style={[StyleSheet.absoluteFill, styles.center, anim.quiet[side]]}>
                {word(side, false)}
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.center, anim.lit[side]]}>
                {word(side, true)}
              </Animated.View>
            </View>
          ))}
          {SLIDER_SIDES.map(side => (
            <Animated.View
              key={side}
              style={[
                styles.mark,
                {
                  left: g.chevron[side] - SIDE_CHEVRON.size / 2,
                  top: (g.height - SIDE_CHEVRON.size) / 2,
                  width: SIDE_CHEVRON.size,
                  height: SIDE_CHEVRON.size,
                },
                anim.chevron,
              ]}
            >
              <Icon
                name={side === 'left' ? 'back' : 'chev'}
                size={SIDE_CHEVRON.size}
                color={colors.chevron}
                strokeWidth={2.4}
              />
            </Animated.View>
          ))}
          <Animated.View
            style={[
              styles.mark,
              styles.center,
              {
                left: g.rest,
                top: g.inset,
                width: g.knob,
                height: g.knob,
                borderRadius: g.knob / 2,
                backgroundColor: colors.knob,
              },
              shadowStyle,
              anim.knob,
            ]}
          >
            {icon ? <Icon name={icon} size={SIDE_SLIDER.glyph} color={colors.glyph} /> : null}
          </Animated.View>
        </View>
        {/* the rim, drawn OVER the pill: on Android a border is part of the view's own background
            and the layers inside would paint straight over it */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: t.radius.pill, borderWidth: g.rim, borderColor: t.color.line2 },
          ]}
        />
      </View>

      {/* three targets over the drawing, in the order they are read: a word, the knob, a word */}
      {end('left', testID ? { testID: `${testID}.left` } : {})}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityActions={[
          { name: 'left', label: actionLabels.left },
          { name: 'right', label: actionLabels.right },
        ]}
        onAccessibilityAction={onAction}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={control.nudge}
        style={[styles.zone, { left: g.middle.left, width: spanWidth(g.middle) }]}
        {...(testID ? { testID: `${testID}.knob` } : {})}
      />
      {end('right', testID ? { testID: `${testID}.right` } : {})}
    </View>
  );
}

/**
 * THE LIGHT BEHIND A LIT WORD: the module's ink, strongest at the word and gone at the edge of its
 * box (`GLOW_STOPS`), in a box that never reaches the knob.
 */
function Glow({
  id,
  color,
  box,
  top,
  height,
  style,
}: {
  id: string;
  color: string;
  box: Span;
  top: number;
  height: number;
  style: AnimatedStyle;
}) {
  const w = spanWidth(box);
  return (
    <Animated.View style={[styles.mark, { left: box.left, top, width: w, height }, style]}>
      <Svg width={w} height={height}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            {GLOW_STOPS.map(s => (
              <Stop key={s.offset} offset={s.offset} stopColor={color} stopOpacity={s.opacity} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={height} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // centered in whatever holds it: past `maxWidth` the pill stops growing and its room does not
  root: { alignSelf: 'center' },
  track: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  word: { position: 'absolute', top: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  mark: { position: 'absolute' },
  zone: { position: 'absolute', top: 0, bottom: 0 },
});
