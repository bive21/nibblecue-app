/**
 * ChildChip (docs/DESIGN_SYSTEM.md §14, §16.4, docs/BRANDING.md §2b): the first thing in the top
 * bar, because the chrome belongs to the baby. A pill — it is a choice among a few children — on
 * the content material, holding a 31 circle avatar in the brand gradient, the name, the age, and
 * a chevron turned to point down, which is what says "this opens a list". It opens the child
 * switcher; for multiples the switcher offers "Both", and the chip then reads "Both".
 *
 * The avatar is drawn here rather than imported from the core group so the chrome has no
 * dependency on it; it is the same 31 circle and the same `onGradient` ink. The name is
 * `bodyStrong` at 14, one line, ellipsised at its tail: the chip is capped (`maxWidth`, from
 * topBarLayout) so nothing on the left can reach the mark, and a name that is too long loses
 * its end, never the avatar or the chevron. The name scales with the OS only up to the chrome
 * cap (docs/MOBILE.md §9) — `bodyStrong` is a body role and would otherwise grow uncapped beside
 * an age line that stops at 1.6, and a chip in the bar cannot grow the bar. The age is an
 * INTERACTIVE label — it sits inside a button — so it takes `text2`, never `text3` (§12 rule 5;
 * the prototype's `text3` at 11px was one of the audit's failures). The pill is 39 tall and
 * reaches the 44 target through hitSlop so the bar keeps its height. Night hands in its dim
 * gradient through the resolver.
 *
 * The Surface lays its children out in a column of its own, so the row — avatar, words, chevron
 * — is a View INSIDE it; row styles on the Surface itself would stack the three vertically.
 *
 * "BOTH" IS THE BABIES THEMSELVES (the owner, 2026-09-25, of the "that's cool" list — *"might not
 * necessarily be useful, but it's cool … Let's try doing everything"*; idea #8). Handed the babies'
 * `faces`, the chip draws Both as their own discs, a pair on the diagonal of the avatar's square,
 * and the change is a movement rather than a swap: the one avatar shrinks and fades into the
 * stacked discs, which slide apart into their pair; back to one baby, they slide together and that
 * baby's avatar grows back over them (`childPair.ts` holds the numbers and tests them). The pair
 * stays inside the avatar's own square, so the chip keeps its width and the words do not move — at
 * 126 points a second circle beside the first would have cut "Both" short. A split the switcher
 * asked for waits for its sheet to leave (`PAIR_AFTER_SHEET_MS`), so it is not played under the
 * scrim. Without `faces` — a host that has not got them — Both is the one avatar it always was.
 *
 * The chip's name, role and state do not change with any of it: the pair is drawing, inside the
 * one button, hidden from assistive technology and from touch. Under reduce motion and in the
 * amber night theme nothing moves; the chip simply shows the one avatar or the pair.
 *
 * ON A MONTH-DAY THE AVATAR WEARS A PARTY HAT (the owner, 2026-09-26; `partyHat.ts`). The app says
 * which avatar and how it arrives — `hat` for the one avatar, `faces[i].hat` for each baby of Both,
 * so on Both a baby wears one only on its own month-day — and says the fact in words (`monthDay`,
 * "3 months today"), which the chip's name carries (`childChipLabel`). The hat is drawn in the
 * avatar's square over the head it is worn on, and rides with it: the one avatar's shrinks and
 * fades with it as Both splits, and each disc's slides out with its disc. Like the pair, it is
 * drawing: hidden from assistive technology and from touch, and the chip keeps its width, its
 * target and its role.
 *
 * A PICTURE THAT WILL NOT LOAD IS NEVER A BLANK CIRCLE (2026-09-29; `photoTrouble.ts`): the one
 * avatar and each disc of Both fall back to the initial on the gradient for that picture, and the
 * failure goes to the app's boot log with where the picture lives and what the phone said.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Icon } from '../icons/Icon';
import { CHROME_FONT_SCALE_CAP, useTheme } from '../theme/ThemeProvider';
import {
  PAIR_AFTER_SHEET_MS,
  PAIR_EASE,
  PAIR_MAX,
  pairFrames,
  pairGeometry,
  pairMove,
  pairShown,
  type PairGeometry,
} from './childPair';
import { PHOTO_RING } from './Avatar';
import type { Frame } from './dayNightSwitch';
import { PartyHat } from './PartyHat';
import { childChipLabel, hatTilt, type HatEntrance } from './partyHat';
import { reportPhotoTrouble, shownPhoto } from './photoTrouble';
import { Surface } from './Surface';
import { AppText, Meta } from './Text';
import { TOP_BAR_AVATAR } from './topBarLayout';

/** One baby as the chip's pair draws them: the initial, and the picture if the household set one. */
export interface ChildFace {
  /** From `initialOf(name)`, as the chip's own initial is. */
  initial: string;
  /** Hidden in night, as the chip's own photo is: the initial stands in. */
  photoUri?: string;
  /** This baby's month-day party hat on its disc, and how it arrives; absent on any other day. */
  hat?: HatEntrance;
}

export interface ChildChipProps {
  name: string;
  /** "4 months", "2 children" — composed by the app from the date of birth, never here. */
  ageLabel: string;
  /** The avatar letter(s), from `initialOf` or the app's own choice for "Both". */
  initial: string;
  /** Multiples, viewing both: the chip reads "Both" instead of a name. */
  isBoth?: boolean;
  /**
   * THE BABIES BOTH IS MADE OF, in the household's order (2026-09-25): with two or more, Both is
   * drawn as their discs — up to `PAIR_MAX` of them — and the chip splits and merges as Both comes
   * and goes. Absent, Both is the one avatar with `initial`, as it was.
   */
  faces?: readonly ChildFace[];
  /**
   * THE BABY'S PICTURE, if the household set one (2026-09-20; docs/MEDIA.md). It fills the 31
   * circle in place of the gradient and the letter — the chrome belongs to the baby
   * (docs/BRANDING.md §2b), and this is the one place in the app where that is literal.
   *
   * NIGHT HIDES IT rather than dimming it, which is the rule `Avatar` already follows: at 3
   * a.m. nothing on the screen that is not information (docs/MOBILE.md §5). The initial stands
   * in, and the chip is the same size either way so nothing in the bar moves at the boundary.
   *
   * Ignored when `isBoth`: "Both" is not one baby, and showing the first one's face over a
   * chip that reads "Both" would name the wrong child. Each baby's own face is in `faces`.
   */
  photoUri?: string;
  /**
   * THE MONTH-DAY PARTY HAT on the one avatar (2026-09-26; `partyHat.ts`), and how it arrives:
   * `pop` pops once as it first appears, `still` is simply there. Absent on every other day. The
   * app decides both; on Both each baby's is on its own face (`ChildFace.hat`).
   */
  hat?: HatEntrance;
  /**
   * The month-day, in words the app composes — "3 months today", or on Both "Ada is 3 months
   * today" — read in the chip's name after its age (`childChipLabel`). A plain fact: never an
   * exclamation, never praise.
   */
  monthDay?: string;
  onPress: () => void;
  /** From `chipMaxWidth(width)` (topBarLayout.ts). */
  maxWidth: number;
  /** True while the child switcher is open. */
  expanded?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const AVATAR_LETTER = 13;
const NAME_SIZE = 14;

type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;
const EASE = Easing.bezier(...PAIR_EASE);

/** The one avatar's face: its letter, its picture when there is one to show, and its hat. */
interface SingleFace {
  /** Whose face it is — the name the chip shows — so one baby's hat is never the next one's. */
  who: string;
  initial: string;
  photo: string | undefined;
  hat: HatEntrance | undefined;
}

export function ChildChip({
  name,
  ageLabel,
  initial,
  isBoth = false,
  faces,
  photoUri,
  hat,
  monthDay,
  onPress,
  maxWidth,
  expanded,
  style,
  testID,
}: ChildChipProps) {
  const t = useTheme();
  const shown = isBoth ? 'Both' : name;
  // the pictures that would not load in this chip: each falls back to its initial, a new one is tried
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const fail = useCallback((where: string, uri: string, event: unknown) => {
    reportPhotoTrouble(where, uri, event);
    setFailed(prev => (prev.has(uri) ? prev : new Set(prev).add(uri)));
  }, []);
  const photo = isBoth ? undefined : shownPhoto(photoUri, t.isNight, failed);
  // 31 avatar + 4 above and below; the rest of the 44 comes from hitSlop
  const height = TOP_BAR_AVATAR + 2 * t.space.xs;
  const slop = Math.ceil((t.hit.min - height) / 2);
  const label = childChipLabel(shown, ageLabel, monthDay);

  /*
    WHAT EACH LAYER SHOWS WHILE IT IS LEAVING. At the render where Both arrives the props already
    describe the pair, but the split starts FROM the avatar that was on screen — so the one avatar
    keeps the face it last showed while it shrinks away; and at the render where Both leaves, the
    discs keep the babies they were while they slide together. Both are recorded after every
    commit, so each is always the previous screen's.
  */
  const paired = pairShown(isBoth, faces);
  // the one avatar's hat is the one baby's: Both wears its hats on its babies' own discs
  const oneHat = isBoth ? undefined : hat;
  const now: SingleFace = { who: shown, initial, photo, hat: oneHat };
  const lastSingle = useRef<SingleFace>(now);
  const lastFaces = useRef<readonly ChildFace[] | null>(paired ? (faces ?? null) : null);
  useEffect(() => {
    if (paired) lastFaces.current = faces ?? null;
    else lastSingle.current = now;
  });
  const single: SingleFace = paired ? lastSingle.current : now;
  // the leaving face was recorded before its picture could have failed: asked again here
  const singlePhoto =
    single.photo !== undefined && !failed.has(single.photo) ? single.photo : undefined;
  const pair = (paired ? faces : lastFaces.current)?.slice(0, PAIR_MAX) ?? null;
  const g = useMemo(() => pairGeometry(pair?.length ?? 2), [pair?.length]);

  // constructed AT the resting value, so the first frame is already the right picture
  const split = useRef(new Animated.Value(paired ? 1 : 0)).current;
  const target = useRef<0 | 1>(paired ? 1 : 0);
  // whether the switcher was open at the last commit: a split it asked for waits for it to go
  const wasOpen = useRef(expanded === true);

  useEffect(() => {
    const move = pairMove(paired, t.reduceMotion || t.isNight);
    if (!move.animate) {
      // set, even over a split in flight: turning reduce motion on mid-way runs the previous run's
      // cleanup (a stop) first, and without this the discs would freeze half apart
      split.setValue(move.to);
      target.current = move.to;
      return;
    }
    // already there: the first render, or one that changed nothing about which is shown
    if (target.current === move.to) return;
    target.current = move.to;
    const run = Animated.timing(split, {
      toValue: move.to,
      duration: move.duration,
      delay: wasOpen.current ? PAIR_AFTER_SHEET_MS : 0,
      easing: EASE,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [split, paired, t.reduceMotion, t.isNight]);
  // after the effect above, so it reads the switcher as it was when Both was chosen
  useEffect(() => {
    wasOpen.current = expanded === true;
  }, [expanded]);

  // built once per geometry: every layer is a view of the same value
  const anim = useMemo(() => {
    const f = pairFrames(g);
    // copies, because `interpolate` is typed for mutable arrays and the frames are frozen data
    const num = (fr: Frame) =>
      split.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: [...fr.outputRange],
        extrapolate: fr.extrapolate,
      });
    const one: AnimatedStyle = {
      opacity: num(f.single.opacity),
      transform: [{ scale: num(f.single.scale) }],
    };
    const discs: AnimatedStyle[] = f.discs.map(d => ({
      opacity: num(f.discOpacity),
      transform: [{ translateX: num(d.x) }, { translateY: num(d.y) }],
    }));
    const ring: AnimatedStyle = { opacity: num(f.ringOpacity) };
    return { one, discs, ring };
  }, [g, split]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={expanded !== undefined ? { expanded } : {}}
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop }}
      style={({ pressed }) => [styles.press, { maxWidth, opacity: pressed ? 0.85 : 1 }, style]}
      {...(testID ? { testID } : {})}
    >
      <Surface radius="pill" style={{ minHeight: height }}>
        <View
          style={[
            styles.row,
            {
              minHeight: height,
              paddingVertical: t.space.xs,
              paddingLeft: t.space.xs,
              paddingRight: t.space.lg,
              gap: t.space.md,
            },
          ]}
        >
          {/* the avatar's square: its place in the row never changes, whatever is drawn in it */}
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[styles.square, { width: TOP_BAR_AVATAR, height: TOP_BAR_AVATAR }]}
          >
            {pair !== null ? (
              <Pair g={g} faces={pair} anim={anim} failed={failed} onFail={fail} />
            ) : null}
            <Animated.View
              // faded as ONE picture, not letter and gradient separately through each other
              needsOffscreenAlphaCompositing={pair !== null}
              style={[
                StyleSheet.absoluteFill,
                styles.avatar,
                {
                  borderRadius: t.radius.pill,
                  // a picture on the light ground, as `Avatar` draws one (2026-09-30): the accent
                  // under it showed at the circle's edge as a dark, shaded fringe
                  backgroundColor:
                    singlePhoto === undefined ? t.color.accent : t.color.surfaceSolid,
                },
                pair !== null ? anim.one : null,
              ]}
            >
              {singlePhoto === undefined ? (
                <>
                  <LinearGradient
                    colors={[...t.gradient.brand]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: t.radius.pill }]}
                  />
                  <AppText
                    variant="bodyStrong"
                    color={t.onGradient}
                    // a11y-fixed-scale: one initial in the avatar's fixed disc; the chip's
                    // label names the baby
                    allowFontScaling={false}
                    style={{ fontSize: AVATAR_LETTER }}
                  >
                    {single.initial}
                  </AppText>
                </>
              ) : (
                <>
                  <Image
                    source={{ uri: singlePhoto }}
                    accessibilityIgnoresInvertColors
                    onError={e => fail('ChildChip', singlePhoto, e)}
                    style={[StyleSheet.absoluteFill, { borderRadius: t.radius.pill }]}
                  />
                  {/* and the bell's hairline over its edge, as the account's picture wears */}
                  <View
                    pointerEvents="none"
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        borderRadius: t.radius.pill,
                        borderWidth: PHOTO_RING,
                        borderColor: t.color.line,
                      },
                    ]}
                  />
                </>
              )}
            </Animated.View>
            {single.hat !== undefined ? (
              // over the avatar and not inside it (the avatar clips to its circle), in a layer the
              // avatar's own size that shrinks and fades with it as Both splits
              <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, pair !== null ? anim.one : null]}
              >
                <PartyHat
                  // one baby's hat is not the next one's: a switch to a twin whose month-day it
                  // also is draws that twin's hat as it first appears, popping if it has not yet
                  key={single.who}
                  cx={TOP_BAR_AVATAR / 2}
                  cy={TOP_BAR_AVATAR / 2}
                  r={TOP_BAR_AVATAR / 2}
                  tilt={hatTilt(1, 0)}
                  entrance={single.hat}
                />
              </Animated.View>
            ) : null}
          </View>
          <View style={styles.words}>
            <AppText
              variant="bodyStrong"
              numberOfLines={1}
              ellipsizeMode="tail"
              maxFontSizeMultiplier={CHROME_FONT_SCALE_CAP}
              style={{ fontSize: NAME_SIZE, lineHeight: NAME_SIZE * 1.15 }}
            >
              {shown}
            </AppText>
            {ageLabel ? (
              <Meta numberOfLines={1} ellipsizeMode="tail">
                {ageLabel}
              </Meta>
            ) : null}
          </View>
          <View style={styles.chev}>
            <Icon name="chev" size={14} color={t.color.text2} />
          </View>
        </View>
      </Surface>
    </Pressable>
  );
}

/**
 * THE PAIR: each baby's disc at its place on the diagonal, back to front, every disc after the
 * first ringed in the chip's own surface so two circles of one gradient read as two. Each is the
 * chip's avatar in small — the gradient and the initial in `onGradient`, or the baby's picture,
 * which night hides as it hides the chip's own.
 */
function Pair({
  g,
  faces,
  anim,
  failed,
  onFail,
}: {
  g: PairGeometry;
  faces: readonly ChildFace[];
  anim: { discs: AnimatedStyle[]; ring: AnimatedStyle };
  /** The pictures that would not load in this chip, and how a disc says one more did. */
  failed: ReadonlySet<string>;
  onFail: (where: string, uri: string, event: unknown) => void;
}) {
  const t = useTheme();
  return (
    <>
      {g.centers.map((c, i) => {
        const face = faces[i];
        const ring = i > 0 ? g.ring : 0;
        const outer = g.disc + 2 * ring;
        const photo = shownPhoto(face?.photoUri, t.isNight, failed);
        return (
          <Animated.View
            key={i}
            needsOffscreenAlphaCompositing
            style={[
              {
                position: 'absolute',
                left: c.x - outer / 2,
                top: c.y - outer / 2,
                width: outer,
                height: outer,
              },
              anim.discs[i],
            ]}
          >
            {ring > 0 ? (
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  { borderRadius: outer / 2, backgroundColor: t.color.surfaceSolid },
                  anim.ring,
                ]}
              />
            ) : null}
            <View
              style={[
                styles.avatar,
                {
                  position: 'absolute',
                  left: ring,
                  top: ring,
                  width: g.disc,
                  height: g.disc,
                  borderRadius: g.disc / 2,
                  backgroundColor: t.color.accent,
                },
              ]}
            >
              {photo === undefined ? (
                <>
                  <LinearGradient
                    colors={[...t.gradient.brand]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: g.disc / 2 }]}
                  />
                  <AppText
                    variant="bodyStrong"
                    color={t.onGradient}
                    // a11y-fixed-scale: one initial in the avatar's fixed disc; the chip's
                    // label names the baby
                    allowFontScaling={false}
                    style={{ fontSize: g.letter, lineHeight: g.letter * 1.2 }}
                  >
                    {face?.initial ?? ''}
                  </AppText>
                </>
              ) : (
                <Image
                  source={{ uri: photo }}
                  // presentation: the chip's own label names the baby (React Native's default for
                  // an image, said out loud so the accessibility scan can read it)
                  accessible={false}
                  accessibilityIgnoresInvertColors
                  onError={e => onFail('ChildChip.both', photo, e)}
                  style={[StyleSheet.absoluteFill, { borderRadius: g.disc / 2 }]}
                />
              )}
            </View>
            {face?.hat !== undefined ? (
              // this baby's own month-day, on its own disc, sliding out with it
              <PartyHat
                cx={outer / 2}
                cy={outer / 2}
                r={g.disc / 2}
                tilt={hatTilt(g.count, i)}
                entrance={face.hat}
              />
            ) : null}
          </Animated.View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  press: { alignSelf: 'flex-start', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  // no clip: the pair leans a point past the square into the chip's own padding (childPair.ts)
  square: { flexShrink: 0 },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  words: { flexShrink: 1, minWidth: 0 },
  // a static turn, not motion: the sprite's chevron points right, and this one opens a list
  chev: { flexShrink: 0, transform: [{ rotate: '90deg' }] },
});
