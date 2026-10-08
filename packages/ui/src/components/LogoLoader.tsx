/**
 * LogoLoader — the mark travelling a small ∞ for as long as something is waited for (the owner,
 * 2026-09-26: *"our loading icon shuold be our logo spinning non stop in an infinity shape"*).
 * `logoLoader.ts` has every number and the tests that hold them; this file hands them to one image,
 * one SVG path and three interpolations of one clock.
 *
 * THE MARK IS THE APP'S, NOT THIS PACKAGE'S: it is read from `loaderMark()`, which the app fills
 * once at boot (`loaderMark.ts`). Until it does — in node, in a test, in anything that renders a
 * button without the app around it — this draws the platform's own spinner in the same ink, which
 * is what a waiting button drew before, so a loader is never an empty box.
 *
 * `tint` draws the mark as a one-color silhouette (`Image`'s `tintColor`): a button hands in its
 * own ink, so the heart reads on a filled button the way its words did. With no tint the mark is
 * the owner's artwork in its own colors, except in the amber night (`loaderInks` says why).
 *
 * REDUCE MOTION AND THE AMBER NIGHT (`loaderMotion`): the mark does not travel. It rests at the
 * ∞'s crossing, upright, and breathes — its strength falling to a third and back, slowly — so it
 * still says "working" without anything moving across the screen.
 *
 * ONE ELEMENT TO ASSISTIVE TECHNOLOGY: a `progressbar`, busy, named "Loading" unless the caller
 * names it. A caller that already says it is busy — a button — hides it (`Button.tsx`).
 *
 * Transforms and opacity only, on the native driver: one clock for the journey, one for the
 * breath, and neither is ever driven from JavaScript, so no view here can be moved to the native
 * driver and then asked for a JavaScript animation (`TourMark.tsx` tells the crash that taught it).
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { loaderMark } from './loaderMark';
import { useMotionAwake } from './MotionGate';
import {
  LOADER_BREATH,
  LOADER_BREATH_MS,
  LOADER_LABEL,
  LOADER_LOOP_MS,
  LOADER_SIZE,
  loaderFrames,
  loaderInks,
  loaderMotion,
  loaderTrack,
  type LoaderInks,
  type LoaderVariant,
} from './logoLoader';
import { deg, num, type AnimatedStyle } from './PictureToggle';

export interface LogoLoaderProps {
  /** `small` for a button, `large` for a screen that is waiting (`LOADER_SIZE`). */
  variant: LoaderVariant;
  /** One ink for the whole mark, drawn as a silhouette; none draws the artwork's own colors. */
  tint?: string;
  /** What a screen reader calls it: "Loading" unless the caller says what is being waited for. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function LogoLoader({
  variant,
  tint,
  accessibilityLabel = LOADER_LABEL,
  style,
  testID,
}: LogoLoaderProps) {
  const t = useTheme();
  const mark = loaderMark();
  const inks = loaderInks(t.color, t.theme, tint);
  const { box } = LOADER_SIZE[variant];
  const frame: StyleProp<ViewStyle> = [{ width: box.width, height: box.height }, style];
  const a11y = {
    accessible: true,
    accessibilityRole: 'progressbar' as const,
    accessibilityLabel,
    accessibilityState: { busy: true },
    ...(testID ? { testID } : {}),
  };
  if (mark === null) {
    // no mark installed: the platform's spinner, in the ink the mark would have been drawn in
    return (
      <View {...a11y} pointerEvents="none" style={[styles.center, frame]}>
        <ActivityIndicator color={inks.spinner} size={variant === 'large' ? 'large' : 'small'} />
      </View>
    );
  }
  return (
    <View {...a11y} pointerEvents="none" style={frame}>
      <Journey
        variant={variant}
        mark={mark}
        inks={inks}
        still={loaderMotion(t.reduceMotion, t.theme) === 'breathe'}
      />
    </View>
  );
}

/** The ∞ and the mark on it: travelling, or resting at the crossing and breathing. */
function Journey({
  variant,
  mark,
  inks,
  still,
}: {
  variant: LoaderVariant;
  mark: ImageSourcePropType;
  inks: LoaderInks;
  still: boolean;
}) {
  const size = LOADER_SIZE[variant];
  const { width, height } = size.box;
  // 0 → 1 once per ∞, linear: the frames are even steps of distance, so an even clock is an even pace
  const travel = useRef(new Animated.Value(0)).current;
  // 0 is full strength, 1 the floor; it starts at the floor, so the first breath is IN
  const breath = useRef(new Animated.Value(1)).current;
  /*
    IT TURNS ONLY WHILE IT CAN BE SEEN (`useMotionAwake`, docs/DESIGN_SYSTEM.md §7.1): its page in
    front and the app open. Not `useMotionActive` — a loader is the one loop that keeps going under
    reduce motion and in Night, as a breath instead of a journey, because it is the promise that
    something is happening, not decoration.
  */
  const awake = useMotionAwake();

  useEffect(() => {
    if (!awake) {
      // back to where each way of waiting begins while nobody is looking, so the page coming back
      // into view picks up from the start rather than jumping there (see the note below)
      travel.setValue(0);
      breath.setValue(1);
      return undefined;
    }
    /* EACH LOOP FROM ITS OWN BEGINNING. A native loop goes round from wherever its value stood
       when it started, every time — so a journey resumed at 0.4 after the phone left reduce
       motion would run 0.4 → 1 forever, a third of the ∞ missing and a jump at every lap. The
       value is put back first; nothing is drawn from it between the two lines. */
    if (still) breath.setValue(1);
    else travel.setValue(0);
    const loop = still
      ? Animated.loop(
          Animated.sequence([
            Animated.timing(breath, {
              toValue: 0,
              duration: LOADER_BREATH_MS,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(breath, {
              toValue: 1,
              duration: LOADER_BREATH_MS,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        )
      : Animated.loop(
          Animated.timing(travel, {
            toValue: 1,
            duration: LOADER_LOOP_MS,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        );
    loop.start();
    return () => loop.stop();
  }, [still, travel, breath, awake]);

  const moving = useMemo<AnimatedStyle>(() => {
    const f = loaderFrames(variant);
    /* TRANSLATE, THEN TURN: `rotate` turns a view about its own center, and listed after the
       translates it turns the mark where it has arrived — listed first, it would turn the path
       the mark takes instead of the mark. */
    return {
      transform: [
        { translateX: num(travel, f.x) },
        { translateY: num(travel, f.y) },
        { rotate: deg(travel, f.lean) },
      ],
    };
  }, [travel, variant]);
  const resting = useMemo<AnimatedStyle>(() => ({ opacity: num(breath, LOADER_BREATH) }), [breath]);

  return (
    <>
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={StyleSheet.absoluteFill}
      >
        <Path
          d={loaderTrack(variant)}
          fill="none"
          stroke={inks.track}
          strokeWidth={size.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      {/* At rest the mark's box sits on the ∞'s center, which is the middle of the loader's box.
          A NEW VIEW FOR EACH WAY OF WAITING (`key`): the native driver writes a transform or an
          opacity straight onto the view, and a style that merely stops naming one is not
          guaranteed to take it back — so a phone that turns reduce motion on mid-wait gets a
          fresh, upright mark rather than one frozen at its last lean. */}
      <Animated.View
        key={still ? 'resting' : 'moving'}
        style={[
          styles.mark,
          {
            left: (width - size.mark) / 2,
            top: (height - size.mark) / 2,
            width: size.mark,
            height: size.mark,
          },
          still ? resting : moving,
        ]}
      >
        <Image
          source={mark}
          // the loader is one progress bar to a screen reader, named above; the mark is its picture
          accessible={false}
          resizeMode="contain"
          /* The artwork carries its own color, and inverting it would make it someone else's
             mark — but a silhouette is a glyph in its caller's ink, and must invert with the
             words beside it or it is white on a background Smart Invert has made light. */
          accessibilityIgnoresInvertColors={inks.mark === null}
          style={[
            { width: size.mark, height: size.mark },
            inks.mark === null ? null : { tintColor: inks.mark },
          ]}
        />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  mark: { position: 'absolute' },
});
