/**
 * HandoffBaton — who holds the baby's reminders, as a picture, and the moment they change hands
 * (the owner, 2026-09-25, of the "that's cool" list: *"might not necessarily be useful, but it's
 * cool … Let's try doing everything. I will then review"*; idea #12, the handoff baton).
 *
 * AT REST it is the Who's-on row's own 36 square: the holder's initials disc — `Avatar`, the disc
 * the app already draws for a person, their picture when they have one (0148) — with the row's
 * glyph on its shoulder as a badge, a moon for
 * a night and a bell for a stretch of the day. The glyph is the baton: it is the reminders, and it
 * sits with whoever has them.
 *
 * WHEN `from` IS GIVEN the square plays the pass once, on mount (`handoffBaton.ts` holds every
 * frame and tests it): the giver steps left to make room, the taker comes in on the right, the
 * baton is thrown in an arc from one shoulder to the other, turning once, and lands; the giver
 * fades, and the taker grows back into the square with the baton. Then it is still — the host
 * mounts a fresh one for the next pass (a `key`), which is what makes "once" structural rather
 * than a flag someone can forget to clear. The first frame of a pass is exactly the picture the
 * square showed before it (the giver holding the baton), so the hand-over from the old instance is
 * seamless, and the last frame is exactly the picture that stays.
 *
 * `onLanded` fires as the baton lands — the host feels it (`haptic('success')`) when the change was
 * the viewer's own. It runs off a timer set with the animation, because the native driver tells
 * JavaScript nothing mid-flight and a pass split in two to get a callback hitches at the catch.
 *
 * REDUCE MOTION AND THE AMBER NIGHT THEME start it at its end: the new holder with the baton, and
 * `onLanded` at once, so what the host marks with it still happens (docs/DESIGN_SYSTEM.md §7 —
 * "never hides content"; docs/MOBILE.md §5 — nothing moves or glows at 3 a.m.).
 *
 * DECORATION TO EVERYTHING BUT THE EYE: the square is `pointerEvents="none"` and hidden from
 * assistive technology, inside the row's own button, whose name already says who is on and until
 * when. Nothing is said by it alone — not the holder, not the night.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Avatar } from './Avatar';
import type { Frame } from './dayNightSwitch';
import {
  BATON_LAND_MS,
  BATON_MS,
  batonFrames,
  batonGeometry,
  batonPlan,
  type BatonLayerFrames,
} from './handoffBaton';

export interface HandoffBatonProps {
  /** Who holds the baton now — the person on. Their name; the disc shows its initial. */
  holder: string;
  /**
   * Who held it until now, when this square is to SHOW the change: the pass plays once, from
   * them. Null or absent, the square is at rest with `holder`.
   */
  from?: string | null;
  /**
   * THEIR PICTURES (2026-09-30; migration 0148): the holder's and the giver's own, as files the
   * phone holds, drawn by `Avatar` in place of the initial and falling back to it on their own.
   * Absent, the discs are the initials they always were.
   */
  holderPhotoUri?: string;
  fromPhotoUri?: string;
  /** The baton's face: a moon for a night, a bell for a stretch of the day (the row's glyph). */
  night: boolean;
  /** Wait this long before the pass — the sheet that made the handoff is still sliding away. */
  delayMs?: number;
  /** The baton landed, or — when nothing moves — the change was shown. Once per mount. */
  onLanded?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;

const G = batonGeometry();
/** Constant: the easing is in the frames, sampled from the pass's own curves (handoffBaton.ts). */
const LINEAR = Easing.linear;

export function HandoffBaton({
  holder,
  from = null,
  holderPhotoUri,
  fromPhotoUri,
  night,
  delayMs = 0,
  onLanded,
  style,
  testID,
}: HandoffBatonProps) {
  const t = useTheme();
  const pass = from !== null;
  // reduce motion and the amber night theme: nothing moves, the end state is drawn at once
  const still = t.reduceMotion || t.isNight;
  // decided ONCE, for the life of this square: a pass is one event, and a square that started
  // still stays still even if the theme changes under it
  const plan = useRef(batonPlan(pass, still)).current;
  // constructed AT the start, so the first frame is already the right picture
  const p = useRef(new Animated.Value(plan.start)).current;
  // the latest callback, read when the baton lands: the host's closure changes every render
  const landed = useRef(onLanded);
  landed.current = onLanded;
  const delay = useRef(Math.max(0, delayMs)).current;

  useEffect(() => {
    if (!pass) return;
    if (!plan.animate) {
      // shown without moving: what the landing marks still happens, once
      landed.current?.();
      return;
    }
    const run = Animated.timing(p, {
      toValue: 1,
      duration: BATON_MS,
      delay,
      easing: LINEAR,
      useNativeDriver: true,
    });
    run.start();
    const timer = setTimeout(() => landed.current?.(), delay + BATON_LAND_MS);
    // the square going away mid-pass: stop, and feel nothing for a landing nobody saw
    return () => {
      run.stop();
      clearTimeout(timer);
    };
  }, [p, pass, plan, delay]);

  // built once: every layer is a view of the same value
  const anim = useMemo(() => {
    const f = batonFrames(G);
    // copies, because `interpolate` is typed for mutable arrays and the frames are frozen data
    const num = (fr: Frame) =>
      p.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: [...fr.outputRange],
        extrapolate: fr.extrapolate,
      });
    const deg = (fr: Frame) =>
      p.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: fr.outputRange.map(d => `${d}deg`),
        extrapolate: fr.extrapolate,
      });
    const disc = (l: BatonLayerFrames): AnimatedStyle => ({
      opacity: num(l.opacity),
      transform: [{ translateX: num(l.x) }, { translateY: num(l.y) }, { scale: num(l.scale) }],
    });
    const baton: AnimatedStyle = {
      transform: [
        { translateX: num(f.baton.x) },
        { translateY: num(f.baton.y) },
        { rotate: deg(f.baton.rotate) },
        { scale: num(f.baton.scale) },
      ],
    };
    return { giver: disc(f.giver), taker: disc(f.taker), baton };
  }, [p]);

  // the row's own glyph colors (WhoIsOnCard.tsx `Glyph`), measured in handoffBaton.test.ts
  const fill = night ? t.color.sleepSoft : t.color.paper;
  const ink = night ? t.color.sleep : t.color.text;
  const inner = G.badge - 2 * G.ring;
  const discBox = { position: 'absolute', left: 0, top: 0, width: G.disc, height: G.disc } as const;

  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[{ width: G.slot, height: G.slot }, style]}
      {...(testID ? { testID } : {})}
    >
      {from !== null ? (
        <Animated.View style={[discBox, anim.giver]}>
          <Avatar name={from} size={31} {...(fromPhotoUri ? { photoUri: fromPhotoUri } : {})} />
        </Animated.View>
      ) : null}
      <Animated.View style={[discBox, anim.taker]}>
        <Avatar name={holder} size={31} {...(holderPhotoUri ? { photoUri: holderPhotoUri } : {})} />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: G.rest.badge.x - G.badge / 2,
            top: G.rest.badge.y - G.badge / 2,
            width: G.badge,
            height: G.badge,
          },
          anim.baton,
        ]}
      >
        {/* the ring is the card's own surface, so the badge reads as a thing set ON the disc,
            the way the bell's count sits on the top bar (TopBar.tsx) */}
        <View
          style={[
            styles.center,
            {
              width: G.badge,
              height: G.badge,
              borderRadius: G.badge / 2,
              backgroundColor: t.color.surfaceSolid,
            },
          ]}
        >
          <View
            style={[
              styles.center,
              { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: fill },
            ]}
          >
            <Icon name={night ? 'moon' : 'bell'} size={G.icon} color={ink} />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
