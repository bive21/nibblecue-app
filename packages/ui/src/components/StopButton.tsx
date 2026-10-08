/**
 * The stop button (docs/DESIGN_SYSTEM.md §20): the one control that ends a running record is
 * a circle with a mark in it and a caption — never a chip, never icon-only.
 *
 * ONE MARK, THE SAME ON EVERY TIMER (the owner, 2026-09-27: "in the pumping, tummy time, sleeping
 * timer, create a universal stop icon, instead of using whatever that is. make sure stop has same
 * icons"): the universal stop symbol, a filled square with soft corners (`STOP_MARK`, drawn in
 * `icons/paths.ts`), on sleep, pumping, tummy time and a feed's Finish alike. The mark used to show
 * what you GET — a baby face for sleep, a milk drop for pumping, a checkmark for a feed, a small
 * square for tummy time — which was four pictures to learn for one action, and the owner's
 * "whatever that is" says how well they taught it. The caption already says which stop it is
 * ("Woke up", "Stop", "Finish"), so the mark only has to say "this ends it", and one shape says
 * that anywhere. That is also why the button takes no timer type: with nothing to tell the timers
 * apart, it cannot be handed a mark of its own for one of them (`stopMark.test.ts` holds it).
 *
 * THREE LAYOUTS. On a RUNNING CARD it is a `pill`: the solid surface, the mark at 20 and the
 * caption beside it, bottom-right over the card's own artwork — what the owner drew (2026-09-16,
 * with the screenshot: "create the woke up button like this instead, and same with other
 * modules showing this pop up"). A pill has no pulse: the digits above it tick once a second,
 * which says "running" more plainly than a ring breathing behind a mark, and a beating circle
 * on a card that already glows was the loudest thing on a screen at 3 a.m.
 *
 * `card` keeps the ring beside its caption at 52 (46 below 380 wide) so the button never decides
 * the card's height; on a sheet there is room, so it is a 76 column.
 * On a gradient card the ring is the solid surface with the text ink as the mark — a pair the
 * token gate already checks in every theme (in dark that is a deep disc with a light mark,
 * still the most solid thing on the card); on a plain card it is the brand gradient with the
 * gradient's own ink. The quiet pulse says "this is running": under reduce-motion it becomes
 * a static ring at 35% rather than disappearing, and in night there is no ring at all — at
 * 3 a.m. nothing on the screen moves or glows.
 *
 * The card layout sets no `alignSelf`: the parent decides where the button sits, and the
 * TimerCard centers it in its row (the prototype's `.timercard .stopbtn{align-items:center}`
 * inside a centered flex row). A `flex-start` here would pin the ring to the card's top edge.
 *
 * HOLD TO STOP (the owner, 2026-09-26). Every layout is pressed and HELD: a ring runs round the
 * inside of the button, clockwise from the top, and closes in 600 ms, and the moment it closes the
 * caller's `onPress` runs — the same stop the tap used to make, felt the same way (the entry's own
 * thud; this button adds no haptic). Let go sooner and the ring runs back and "Hold to stop" sits
 * above the button (below it on the sticky bar, `hintAt`) for a second and a half. `stopHold.ts`
 * has the numbers, the ring's path and the whole behavior as one table (`holdStep`), and tests them.
 *
 *   - A SCREEN READER'S ACTIVATE STOPS AT ONCE, no hold: VoiceOver's double tap arrives here as
 *     `onAccessibilityTap`, TalkBack's as the `activate` action — each on its own platform only, so
 *     VoiceOver's actions rotor gets no stray "activate" — and a keyboard's or a switch's click,
 *     which is a press with no finger before it, does the same. The hint says so to the listener.
 *   - REDUCE MOTION AND THE AMBER NIGHT keep the hold, because it is a safeguard and not a flourish,
 *     and keep the ring, because it is the answer to "how much longer" — filling at an even speed,
 *     as it always does. What goes is the flourish: no swell as it closes, and a ring let go of
 *     clears rather than running back; the hint appears rather than fading. Night draws the ring in
 *     its own amber ink with nothing lit (`theme/timerMotion.ts`).
 *   - THE TARGET stays at least 44 pt: the pill is `hit.min` tall on a card, and a `space.xs` slop
 *     round it lifts the sticky bar's 36 pt pill to 44.
 *   - THE PRESS DIM IS GONE from the pill: under a finger the ring is the press, and a button that
 *     also faded to 88% dimmed the ring that answers it.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { PILL_OVER_ART_ALPHA } from '../theme/artInk';
import { withAlpha } from '../theme/contrast';
import { stopHoldColors } from '../theme/timerMotion';
import type { TintModule } from '../theme/moduleButton';
import { useTheme } from '../theme/ThemeProvider';
import {
  drainMs,
  fillMs,
  HINT_GAP,
  HOLD,
  HOLD_COPY,
  HOLD_RING,
  holdRing,
  holdRingFrames,
  holdStep,
  popFrame,
  type HoldEffect,
  type HoldEvent,
  type HoldHintAt,
  type HoldPhase,
} from './stopHold';
import { useMotionAwake } from './MotionGate';
import { AppText } from './Text';
import { motionStill } from './tickDraw';

/**
 * The four kinds of running timer. It lives here because the stop button was the first thing that
 * needed it; the card, its picture and its motion, Also running and the sticky bar import it from
 * here still, though the button itself no longer reads it (one mark for all four, above).
 */
export type TimerType = 'sleep' | 'breastfeed' | 'pump' | 'tummy';

/**
 * THE ONE MARK (§20; the owner, 2026-09-27): the stop square, in every layout, on every timer —
 * the running card's pill, the sticky bar's, and the card and sheet rings.
 */
export const STOP_MARK = 'stop' satisfies IconName;

export const STOP_RING = { card: 52, cardCompact: 46, sheet: 76 } as const;
/**
 * The mark's size on a running card's pill. With the pill's padding and its caption it sets how
 * wide the pill is, which is what bounds the card's words beside it (`theme/artWords.ts`).
 */
export const STOP_PILL_MARK = 20;
/** The caption's tracking, which narrows the pill by a little under a point. */
export const STOP_CAPTION_TRACKING = -0.1;

/** Below this width the card ring drops to 46 (§20). */
export const STOP_COMPACT_WIDTH = 380;
const PULSE_MS = 2600;

export interface StopButtonProps {
  /** Always present: "Woke up", "Finish", "Stop". Names the child in a multiples household. */
  caption: string;
  /** The stop: made when a finger's hold closes the ring, or at once by a screen reader. */
  onPress: () => void;
  layout?: 'card' | 'sheet' | 'pill';
  /**
   * The pill over the owner's ARTWORK rather than over a flat gradient (the owner, 2026-09-18:
   * "make it a little more transparent. Solid white just hides the baby picture behind it"). The
   * surface goes to `PILL_OVER_ART_ALPHA` of itself (`theme/artInk.ts`) so the drawing shows
   * through; the mark and the caption keep the text ink, which still clears AA on the lightest
   * and the darkest composite the timer pictures can produce under it — `contrast.test.ts`
   * holds both.
   */
  translucent?: boolean;
  /** True when the button sits on a gradient card (the ring inverts to the solid surface). */
  onGradient?: boolean;
  disabled?: boolean;
  /** Defaults to the caption; pass a fuller sentence when the caption is terse ("Finish"). */
  accessibilityLabel?: string;
  /**
   * Where "Hold to stop" appears after a press let go too soon: above the button on a card, whose
   * foot it sits on; below it on the sticky bar across the top of the screen.
   */
  hintAt?: HoldHintAt;
  /** The timer's module: the hold ring fills in its deep color (`stopHoldColors`). */
  module?: TintModule;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
/** The ring runs back quickly off the mark and softly into nothing. */
const DRAIN_EASE = Easing.out(Easing.quad);

/**
 * THE HOLD, carried out: `holdStep` decides, this does. The ring's fill is one JavaScript-driven
 * value (a dash offset is an SVG prop, which the native driver cannot carry); the swell and the
 * hint's fade are native. Every timer and every animation is let go when the button goes away —
 * which is usually the moment its own stop lands, because a stopped timer's card leaves Today.
 */
function useStopHold(onStop: () => void, disabled: boolean, still: boolean) {
  const progress = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const phase = useRef<HoldPhase>('rest');
  const run = useRef<Animated.CompositeAnimation | null>(null);
  /*
    A FINGER IS ON IT, or was a moment ago. Pressability hands a finger lifted ON the button an
    `onPress` as well as an `onPressOut` — BEFORE it, on a tap shorter than its 130 ms minimum,
    whose `onPressOut` it holds back, and just after it otherwise — and that press is the finger's,
    never a second way to stop: it only says the touch ended as a tap (`tapped`). A touch the page
    takes for a scroll, or a finger slid off, ends with no `onPress`, and is not told to hold. A
    press with no finger at all (a keyboard's Enter, a switch) arrives with `touched` false.
  */
  const touched = useRef(false);
  const tapped = useRef(false);
  // which touch this is, so a quick second one is never ended by the first one's lift
  const touch = useRef(0);
  // "Hold to stop", by number: 0 is hidden, and each showing is a new number
  const [hint, setHint] = useState(0);
  // read when an effect runs, not captured: the caller's stop and the still rule can change under
  // a finger, and a hold must make the stop that is current when it closes
  const latest = useRef({ onStop, disabled, still });
  useLayoutEffect(() => {
    latest.current = { onStop, disabled, still };
  }, [onStop, disabled, still]);

  const dispatch = useCallback(
    (event: HoldEvent) => {
      const step = holdStep(phase.current, event, latest.current.still);
      phase.current = step.phase;
      const perform = (effect: HoldEffect) => {
        switch (effect) {
          case 'fill':
            setHint(0);
            run.current?.stop();
            // on from wherever it stands: a finger back on a ring still running back picks it up
            progress.stopAnimation(p => {
              const fill = Animated.timing(progress, {
                toValue: 1,
                duration: fillMs(p),
                easing: Easing.linear,
                // a dash offset is a prop of the path, not a style (`stopHold.ts`)
                useNativeDriver: false,
              });
              run.current = fill;
              fill.start(({ finished }) => {
                if (finished) dispatch('filled');
              });
            });
            return;
          case 'drain':
            run.current?.stop();
            progress.stopAnimation(p => {
              const drain = Animated.timing(progress, {
                toValue: 0,
                duration: drainMs(p),
                easing: DRAIN_EASE,
                useNativeDriver: false,
              });
              run.current = drain;
              drain.start(({ finished }) => {
                if (finished) dispatch('drained');
              });
            });
            return;
          case 'clear':
            run.current?.stop();
            run.current = null;
            progress.setValue(0);
            return;
          case 'hint':
            setHint(h => h + 1);
            return;
          case 'stop':
            latest.current.onStop();
            return;
          case 'pop':
            pop.setValue(0);
            Animated.timing(pop, {
              toValue: 1,
              duration: HOLD.popMs,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }).start();
            return;
        }
      };
      for (const effect of step.effects) perform(effect);
    },
    [pop, progress],
  );

  // the hint: in, a second and a half, out — or simply there and gone where nothing may fade
  useEffect(() => {
    if (hint === 0) return;
    const shown = hint;
    // the words are drawn, not spoken: a screen reader hears them here, if one is listening
    AccessibilityInfo.announceForAccessibility(HOLD_COPY.hint);
    const fading = !latest.current.still;
    if (fading) {
      hintOpacity.setValue(0);
      Animated.timing(hintOpacity, {
        toValue: 1,
        duration: HOLD.hintInMs,
        useNativeDriver: true,
      }).start();
    } else hintOpacity.setValue(1);
    const timer = setTimeout(() => {
      if (!fading) {
        setHint(h => (h === shown ? 0 : h));
        return;
      }
      Animated.timing(hintOpacity, {
        toValue: 0,
        duration: HOLD.hintOutMs,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setHint(h => (h === shown ? 0 : h));
      });
    }, HOLD.hintMs);
    return () => clearTimeout(timer);
  }, [hint, hintOpacity]);

  // the button going away: nothing it started outlives it
  useEffect(
    () => () => {
      run.current?.stop();
      progress.stopAnimation();
      pop.stopAnimation();
      hintOpacity.stopAnimation();
    },
    [hintOpacity, pop, progress],
  );

  const handlers = useMemo(() => {
    const activate = () => {
      if (!latest.current.disabled) dispatch('activate');
    };
    return {
      onPressIn: () => {
        touch.current += 1;
        touched.current = true;
        tapped.current = false;
        dispatch('press');
      },
      onPressOut: () => {
        const mine = touch.current;
        // decided a turn later, once the finger's own onPress (if it comes) has come
        setTimeout(() => {
          if (touch.current !== mine) return;
          dispatch(tapped.current ? 'release' : 'cancel');
          touched.current = false;
          tapped.current = false;
        }, 0);
      },
      // a keyboard's or a switch's click is a press with no finger before it: it stops at once
      onPress: () => {
        if (touched.current) {
          tapped.current = true;
          return;
        }
        activate();
      },
      activate,
    };
  }, [dispatch]);

  return { progress, pop, hint, hintOpacity, handlers };
}

/**
 * THE SCREEN READER'S ACTIVATE, on each platform in the one form that platform sends it: iOS's
 * double tap calls `accessibilityActivate`, which React Native routes to `onAccessibilityTap`;
 * Android's is ACTION_CLICK, which it routes to the `activate` action when one is declared.
 */
const activateProps = (activate: () => void) =>
  Platform.OS === 'ios'
    ? { onAccessibilityTap: activate }
    : {
        accessibilityActions: [{ name: 'activate' as const }],
        onAccessibilityAction: (e: AccessibilityActionEvent) => {
          if (e.nativeEvent.actionName === 'activate') activate();
        },
      };

/*
  MEMOIZED ON ITS PROPS: a running card re-renders every second to tick its digits, and the button
  beside them — its ring, its hold, its caption — has nothing that changes with the second. Its own
  state (the hold, the hint) and the theme still reach it as ever; the tick no longer does.
*/
export const StopButton = memo(function StopButton({
  caption,
  onPress,
  layout = 'card',
  onGradient = false,
  translucent = false,
  disabled,
  accessibilityLabel,
  hintAt = 'above',
  module,
  style,
  testID,
}: StopButtonProps) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const ring =
    layout === 'sheet'
      ? STOP_RING.sheet
      : width < STOP_COMPACT_WIDTH
        ? STOP_RING.cardCompact
        : STOP_RING.card;
  const mark = ring >= STOP_RING.sheet ? 31 : ring >= STOP_RING.card ? 26 : 23;
  const still = motionStill(t.reduceMotion, t.theme);
  const hold = useStopHold(onPress, !!disabled, still);
  const holdInk = stopHoldColors(t.color, t.theme, module);

  // Night keeps the amber ink on every mark: white on a dim amber disc would be the one
  // bright thing in the room (§23.2 "the type stays amber").
  const markInk = onGradient || t.isNight ? t.color.text : t.onGradient;
  const captionInk = onGradient && !t.isNight ? t.onGradient : t.color.text;
  const pulseInk = onGradient ? t.onGradient : t.color.accent;

  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const animatePulse = !t.reduceMotion && !t.isNight && !disabled && layout !== 'pill';
  // the ring is drawn by `animatePulse`; its clock turns only while it can be seen — the app open,
  // its page in front (`useMotionAwake`, docs/DESIGN_SYSTEM.md §7.1)
  const awake = useMotionAwake();
  const pulsing = animatePulse && awake;
  useEffect(() => {
    if (!pulsing) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: PULSE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [pulsing, pulse]);
  const press = (to: number) => {
    if (disabled || t.reduceMotion) return;
    Animated.timing(scale, { toValue: to, duration: 140, useNativeDriver: true }).start();
  };

  // the pill's own size, for the ring round its inside; the ring layouts' disc is known
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  /*
    A BORDER MOVES WHAT IS DRAWN INSIDE IT. Yoga places an absolute child from its parent's border,
    not its outer edge (`surfacePadding.ts`), so the ring — measured on the outer edge — is pulled
    back out by the button's own border: Night's hairline, or the one the sticky bar asks for.
  */
  const flat = StyleSheet.flatten(style) ?? {};
  const pillBorder = typeof flat.borderWidth === 'number' ? flat.borderWidth : t.isNight ? 1 : 0;
  const discBorder = onGradient && t.isNight ? 1 : 0;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBox(prev =>
      prev && prev.width === w && prev.height === h ? prev : { width: w, height: h },
    );
  };

  // THE RING'S SHADOW. Never an Android `elevation` here: the ring scales under a native
  // animation and sits over a gradient card, and the owner photographed a SQUARE behind the
  // beating mark on the phone — an elevation shadow drawn from a rectangular outline. A
  // box-shadow is painted by React Native from the border box's own rounded path, outside it
  // only, so nothing but a soft circle can appear (shadows.ts has the account of the class).
  const ringShadow: ViewStyle =
    t.isNight || t.skinTokens.surface.shadow === 'none'
      ? {}
      : Platform.OS === 'android'
        ? {
            boxShadow: [
              {
                offsetX: 0,
                offsetY: 6,
                blurRadius: 10,
                spreadDistance: 0,
                color: withAlpha(t.color.text, 0.28),
              },
            ],
          }
        : {
            shadowColor: t.color.text,
            shadowOpacity: 0.28,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
          };

  const pulseStyle: Animated.WithAnimatedObject<ViewStyle> = animatePulse
    ? {
        opacity: pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.55, 0, 0] }),
        transform: [
          { scale: pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1.28, 1.28] }) },
        ],
      }
    : { opacity: 0.35 };

  const popStyle = useMemo<Animated.WithAnimatedObject<ViewStyle>>(() => {
    const f = popFrame();
    return {
      transform: [
        {
          scale: hold.pop.interpolate({
            inputRange: [...f.inputRange],
            outputRange: [...f.outputRange],
            extrapolate: f.extrapolate,
          }),
        },
      ],
    };
  }, [hold.pop]);

  const pressable = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: accessibilityLabel ?? caption,
    accessibilityHint: HOLD_COPY.a11yHint,
    accessibilityState: { disabled: !!disabled },
    ...activateProps(hold.handlers.activate),
    disabled,
    onPressIn: hold.handlers.onPressIn,
    onPressOut: hold.handlers.onPressOut,
    onPress: hold.handlers.onPress,
    ...(testID ? { testID } : {}),
  };

  const hintBubble =
    hold.hint > 0 ? (
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.hint,
          hintAt === 'above'
            ? { bottom: '100%', marginBottom: HINT_GAP }
            : { top: '100%', marginTop: HINT_GAP },
          {
            paddingHorizontal: t.space.md,
            paddingVertical: t.space.xs,
            borderRadius: t.radius.pill,
            backgroundColor: holdInk.hintGround,
            borderColor: holdInk.hintEdge,
            opacity: hold.hintOpacity,
          },
        ]}
      >
        <AppText variant="bodySm" color={holdInk.hintInk} numberOfLines={1} style={styles.hintText}>
          {HOLD_COPY.hint}
        </AppText>
      </Animated.View>
    ) : null;

  if (layout === 'pill') {
    return (
      <Animated.View style={still ? null : popStyle}>
        <Pressable
          {...pressable}
          hitSlop={t.space.xs}
          onLayout={onLayout}
          style={[
            styles.row,
            {
              gap: t.space.sm,
              minHeight: t.hit.min,
              paddingHorizontal: t.space.xl,
              borderRadius: t.radius.pill,
              backgroundColor: translucent
                ? withAlpha(t.color.surfaceSolid, PILL_OVER_ART_ALPHA)
                : t.color.surfaceSolid,
              // night's dim gradient and its solid surface are a shade apart: a hairline gives
              // the pill an edge without adding light to the room
              ...(t.isNight ? { borderWidth: 1, borderColor: t.color.line2 } : {}),
              opacity: disabled ? 0.5 : 1,
            },
            ringShadow,
            style,
          ]}
        >
          <Icon name={STOP_MARK} size={STOP_PILL_MARK} color={t.color.text} />
          <AppText variant="bodySm" color={t.color.text} style={styles.caption}>
            {caption}
          </AppText>
          {box ? (
            <HoldRingArt
              width={box.width}
              height={box.height}
              border={pillBorder}
              ink={holdInk.ring}
              track={holdInk.track}
              progress={hold.progress}
            />
          ) : null}
          {hintBubble}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Pressable
      {...pressable}
      onPressIn={() => {
        press(0.9);
        hold.handlers.onPressIn();
      }}
      onPressOut={() => {
        press(1);
        hold.handlers.onPressOut();
      }}
      hitSlop={t.space.xs}
      style={[
        layout === 'sheet' ? styles.column : styles.row,
        { gap: layout === 'sheet' ? t.space.sm : t.space.md, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      <View style={{ width: ring, height: ring }}>
        {t.isNight ? null : (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.pulse,
              { borderRadius: ring / 2, borderColor: pulseInk },
              pulseStyle,
            ]}
          />
        )}
        <Animated.View
          style={[
            styles.ring,
            {
              width: ring,
              height: ring,
              borderRadius: ring / 2,
              transform: [{ scale }],
            },
            onGradient
              ? {
                  backgroundColor: t.color.surfaceSolid,
                  // in night the solid surface and the dim gradient are a shade apart: a
                  // hairline gives the ring an edge without adding light
                  ...(t.isNight ? { borderWidth: 1, borderColor: t.color.line2 } : {}),
                }
              : // the brand gradient paints over an opaque disc of its own first stop, so the
                // ring is never a transparent box with a shadow under it
                { backgroundColor: t.gradient.brand[0] },
            ringShadow,
          ]}
        >
          {onGradient ? null : (
            <LinearGradient
              colors={[...t.gradient.brand]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: ring / 2 }]}
            />
          )}
          <Icon name={STOP_MARK} size={mark} color={markInk} />
          {/* the hold's ring runs round the inside of the disc, in the mark's own ink */}
          <HoldRingArt
            width={ring}
            height={ring}
            border={discBorder}
            ink={markInk}
            track={withAlpha(markInk, HOLD_RING.track)}
            progress={hold.progress}
          />
        </Animated.View>
        {hintBubble}
      </View>
      <AppText
        variant="bodySm"
        color={captionInk}
        align={layout === 'sheet' ? 'center' : 'left'}
        style={[
          styles.caption,
          layout === 'card' ? { maxWidth: ring >= STOP_RING.card ? 76 : 58 } : null,
        ]}
      >
        {caption}
      </AppText>
    </Pressable>
  );
});

/**
 * The ring and the track it runs over, round the inside of a button `width` × `height` with round
 * ends (`holdRing`). Drawn over the button and under nothing, taking no touches and hidden from
 * assistive technology: the button's own name and hint say what it does.
 */
function HoldRingArt({
  width,
  height,
  border,
  ink,
  track,
  progress,
}: {
  width: number;
  height: number;
  /** The button's border width: the ring is placed from its outer edge, not its border's inside. */
  border: number;
  ink: string;
  track: string;
  progress: Animated.Value;
}) {
  const ring = useMemo(() => holdRing(width, height), [width, height]);
  const anim = useMemo(() => {
    const f = holdRingFrames(ring);
    const at = (fr: typeof f.offset) =>
      progress.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: [...fr.outputRange],
        extrapolate: fr.extrapolate,
      });
    return { offset: at(f.offset), track: at(f.track) };
  }, [progress, ring]);
  const w = Math.max(width, height);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.ringArt, { left: -border, top: -border, width: w, height }]}
    >
      <Svg width={w} height={height}>
        <AnimatedPath
          d={ring.path}
          fill="none"
          stroke={track}
          strokeWidth={HOLD_RING.stroke}
          opacity={anim.track}
        />
        <AnimatedPath
          d={ring.path}
          fill="none"
          stroke={ink}
          strokeWidth={HOLD_RING.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[...ring.dasharray]}
          strokeDashoffset={anim.offset}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  column: { flexDirection: 'column', alignItems: 'center', alignSelf: 'center' },
  ring: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  pulse: { borderWidth: 2 },
  caption: { fontWeight: '700', letterSpacing: STOP_CAPTION_TRACKING },
  ringArt: { position: 'absolute' },
  hint: { position: 'absolute', right: 0, borderWidth: StyleSheet.hairlineWidth },
  hintText: { fontWeight: '600' },
});
