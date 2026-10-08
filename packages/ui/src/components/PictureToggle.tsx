/**
 * PictureTrack — the pill that `BottleToggle` and `BathToggle` are drawn in (the owner, 2026-09-25,
 * of the "that's cool" list, after the sky toggle: *"might not necessarily be useful, but it's
 * cool … Let's try doing everything"*). A two-stop control in the theme toggle's language: the pill
 * is the picture's own ground, a small object is the knob, and it rests at the chosen stop's end.
 * `pictureToggle.ts` holds every number and tests it; this file only hands them to views.
 *
 * WHAT IT DRAWS, bottom to top, inside a `pointerEvents="none"` wrapper hidden from assistive
 * technology:
 *
 *   the picture's ground, and whatever the picture lays on it (`backdrop` — the bath's water);
 *   each stop's GHOST in its slot: the knob in outline, in that stop's state, faded out before the
 *     knob arrives over it and back only once the knob has gone;
 *   each stop's WORD in its half, twice — bold in the full ink, regular in the quiet one — and the
 *     two cross-fade with the knob, so the chosen word changes as the knob travels;
 *   the KNOB, the picture's own drawing (`children`), carried across on `pos`;
 *   whatever the picture draws over the knob (`front` — the bath's surface, foam and bubbles);
 *   the rim, the theme's `line2`, OVER everything — on Android a border is part of a view's own
 *     background and the layers inside would paint over it.
 *
 * TO EVERYTHING BUT THE EYE IT IS THE SEGMENTED CONTROL IT REPLACES: a radio group with the
 * caller's name, and two radios in order, each half of the pill — a target far over 44 pt — named
 * with its word and saying whether it is checked, with the caller's test ids (`${testID}` for the
 * group, `${testID}.${value}` for each option) so every flow and every tripwire that found the
 * segmented control finds this. A tap is FELT by the segmented control's own rule, in its own words
 * (`feedback/choice.ts`): a `tap` on the other option, which is then reported, and nothing on the
 * chosen one, which reports nothing, as it did there — once per tap, in the press handler, never
 * again as the knob lands. The knob follows `value` and nothing else. There is no drag: it lives in
 * a sheet that scrolls, and two taps are two targets.
 *
 * WHAT MOVES, AND WHEN NOTHING DOES (`usePictureKnob`). Two values on the native driver: `pos`,
 * the knob's place, on the theme toggle's landing curve, and `sway`, the move's body language, run
 * straight through the move and set back to 0 at its end, where every frame of it draws rest. A
 * tap mid-move turns the knob round from where it is. Under REDUCE MOTION, and in the amber NIGHT
 * theme, nothing animates at all (`pictureStill`): the values are set to the end state, so the
 * picture simply IS the answer.
 */
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { feelChoice } from '../feedback/choice';
import { useTheme } from '../theme/ThemeProvider';
import type { Frame } from './dayNightSwitch';
import {
  PICTURE_EASE,
  PICTURE_STOPS,
  PICTURE_WORD,
  pictureStill,
  pictureTrackFrames,
  pictureWordCap,
  planPictureMove,
  type PictureMotion,
  type PicturePlan,
  type PictureStop,
  type PictureToggleGeometry,
} from './pictureToggle';
import { AppText } from './Text';
import { spanWidth } from './themeSkyToggle';

/** One option of a picture toggle: the segmented control's own shape, value and word. */
export interface PictureOption<T extends string> {
  value: T;
  label: string;
}

export type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;
/** A value, or one built from values (`Animated.multiply` is an interpolation too). */
type Driver = Animated.Value | Animated.AnimatedInterpolation<number>;

/** A frame, as `interpolate` takes it — copies, because the frames are frozen data. */
export const num = (v: Driver, fr: Frame) =>
  v.interpolate({
    inputRange: [...fr.inputRange],
    outputRange: [...fr.outputRange],
    extrapolate: fr.extrapolate,
  });
/** A frame of degrees, as a rotation. */
export const deg = (v: Driver, fr: Frame) =>
  v.interpolate({
    inputRange: [...fr.inputRange],
    outputRange: fr.outputRange.map(d => `${d}deg`),
    extrapolate: fr.extrapolate,
  });

const EASE = Easing.bezier(...PICTURE_EASE);

/** Which stop an option's value is at: the second option is the right-hand end. */
export const stopOf = <T extends string>(
  options: readonly [PictureOption<T>, PictureOption<T>],
  value: T,
): PictureStop => (value === options[1].value ? 1 : 0);

/** The knob's two values, whether the picture may move, and the move this commit started. */
export interface PictureKnob {
  pos: Animated.Value;
  sway: Animated.Value;
  still: boolean;
  /**
   * The move the last change of stop planned, set in this hook's effect — which runs before the
   * picture's own, so a value that must arrive WITH the knob (the milk, the foam) reads its clock.
   */
  plan: MutableRefObject<PicturePlan | null>;
}

export function usePictureKnob(stop: PictureStop): PictureKnob {
  const t = useTheme();
  const still = pictureStill(t.reduceMotion, t.theme);
  // constructed AT the resting stop, so the first frame is already the right picture
  const pos = useRef(new Animated.Value(stop)).current;
  const sway = useRef(new Animated.Value(0)).current;
  // where the knob was last sent, and the move that is taking it there
  const at = useRef<PictureStop>(stop);
  const motion = useRef<PictureMotion | null>(null);
  const plan = useRef<PicturePlan | null>(null);

  useEffect(() => {
    const now = Date.now();
    const m = motion.current;
    const resting = m === null || now >= m.startedAt + m.duration;
    // already there: the first render, or one that changed nothing about where it rests
    if (at.current === stop && resting && !still) return;
    const p = planPictureMove(m, at.current, stop, now, still);
    at.current = stop;
    plan.current = p;
    if (!p.animate) {
      // set, even over a move in flight: turning reduce motion on mid-move stops the run first,
      // and without this the knob would freeze part of the way across
      pos.setValue(p.to);
      sway.setValue(0);
      motion.current = null;
      return;
    }
    const run = Animated.parallel([
      Animated.timing(pos, {
        toValue: p.to,
        duration: p.duration,
        easing: EASE,
        useNativeDriver: true,
      }),
      // straight through the move: its frames are placed in time, not in distance
      Animated.timing(sway, {
        toValue: p.sway,
        duration: p.duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]);
    motion.current = { from: p.from, to: stop, startedAt: now, duration: p.duration };
    // arrived: `sway` back to rest, which its frames draw exactly as they draw the end
    run.start(({ finished }) => {
      if (finished) sway.setValue(0);
    });
    // a new tap, reduce motion, the Night theme, or the toggle going away: stop where it is
    return () => run.stop();
  }, [pos, sway, stop, still]);

  return { pos, sway, still, plan };
}

export interface PictureTrackProps<T extends string> {
  options: readonly [PictureOption<T>, PictureOption<T>];
  value: T;
  onChange: (value: T) => void;
  /** The group's name, for assistive technology ("The bottle", "Hair"). */
  label: string;
  g: PictureToggleGeometry;
  knob: PictureKnob;
  /** The pill's ground, and the two inks its words are written in — measured in `theme/`. */
  ground: string;
  ink: { word: string; quiet: string };
  /** Where the words are written, top to bottom: the whole pill unless the picture says otherwise. */
  words?: { top: number; height: number };
  /** Laid on the ground under everything that moves. */
  backdrop?: ReactNode;
  /** Each stop's ghost, drawn in that stop's slot box. */
  ghosts: readonly [ReactNode, ReactNode];
  /** The knob: drawn in its slot box, carried between the stops. */
  children: ReactNode;
  /** Drawn over the knob, in the pill's own coordinates. */
  front?: ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PictureTrack<T extends string>({
  options,
  value,
  onChange,
  label,
  g,
  knob,
  ground,
  ink,
  words,
  backdrop,
  ghosts,
  children,
  front,
  disabled = false,
  style,
  testID,
}: PictureTrackProps<T>) {
  const t = useTheme();
  const labels = [options[0].label, options[1].label] as const;
  const cap = pictureWordCap(g, labels);
  const chosen = stopOf(options, value);
  const box = words ?? { top: 0, height: g.height };

  // built once per geometry: every layer is a view of the knob's one place
  const anim = useMemo(() => {
    const f = pictureTrackFrames(g);
    const knobStyle: AnimatedStyle = { transform: [{ translateX: num(knob.pos, f.knobX) }] };
    const of = (frames: readonly [Frame, Frame]): readonly [AnimatedStyle, AnimatedStyle] => [
      { opacity: num(knob.pos, frames[0]) },
      { opacity: num(knob.pos, frames[1]) },
    ];
    return { knob: knobStyle, chosen: of(f.chosen), quiet: of(f.quiet), ghost: of(f.ghost) };
  }, [g, knob.pos]);

  const slotBox = (left: number): ViewStyle => ({
    position: 'absolute',
    left,
    top: g.inset,
    width: g.slot,
    height: g.knob,
  });
  // one line, whole: the halves are sized so both words fit at `cap` (the placement test proves it
  // at every width a phone gives), and a word the bound did not foresee is made smaller, not cut
  const word = (text: string, bold: boolean) => (
    <AppText
      variant={bold ? 'bodyStrong' : 'bodySm'}
      color={bold ? ink.word : ink.quiet}
      align="center"
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={PICTURE_WORD.shrink}
      maxFontSizeMultiplier={cap}
      // the segmented control's size in both weights, so the cross-fade swaps weight, not size
      style={{ fontSize: t.type.bodySm.fontSize, lineHeight: t.type.bodySm.lineHeight }}
    >
      {text}
    </AppText>
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
        <View style={[styles.track, { borderRadius: t.radius.pill, backgroundColor: ground }]}>
          {backdrop}
          {PICTURE_STOPS.map(s => (
            <Animated.View key={`ghost-${s}`} style={[slotBox(g.rest[s]), anim.ghost[s]]}>
              {ghosts[s]}
            </Animated.View>
          ))}
          {PICTURE_STOPS.map(s => (
            <View
              key={`word-${s}`}
              style={[
                styles.word,
                {
                  left: g.word[s].left,
                  width: spanWidth(g.word[s]),
                  top: box.top,
                  height: box.height,
                },
              ]}
            >
              <Animated.View style={[StyleSheet.absoluteFill, styles.center, anim.quiet[s]]}>
                {word(labels[s], false)}
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.center, anim.chosen[s]]}>
                {word(labels[s], true)}
              </Animated.View>
            </View>
          ))}
          <Animated.View style={[slotBox(g.rest[0]), anim.knob]}>{children}</Animated.View>
          {front}
        </View>
        <View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: t.radius.pill, borderWidth: g.rim, borderColor: t.color.line2 },
          ]}
        />
      </View>

      {/* the two options: halves of the pill, over the drawing, one radio each */}
      <View style={[StyleSheet.absoluteFill, styles.zones]}>
        {PICTURE_STOPS.map(s => {
          const o = options[s];
          const on = s === chosen;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: on, selected: on, disabled }}
              disabled={disabled}
              onPress={() => {
                feelChoice({ locked: false, current: on, kind: 'tap' });
                if (!on) onChange(o.value);
              }}
              style={styles.zone}
              {...(testID ? { testID: `${testID}.${o.value}` } : {})}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // centered in whatever holds it: past `maxWidth` the pill stops growing and its room does not
  root: { alignSelf: 'center' },
  track: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  word: { position: 'absolute' },
  center: { justifyContent: 'center' },
  zones: { flexDirection: 'row' },
  zone: { flex: 1 },
});
