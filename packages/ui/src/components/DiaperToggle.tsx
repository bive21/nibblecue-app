/**
 * DiaperToggle — the diaper sheet's "What was in it" as a little diaper that hops to the answer
 * (the owner, 2026-09-26: *"we need more of this, like we can do something on diaper category too
 * (wet, dirt, both, and dry)"*). The pill is the diaper module's soft tint with the four answers
 * written along it — the caller's words, the owner's: Wet · Dirty · Both · Dry — and the knob is a
 * small diaper drawn after the owner's own illustrated one, standing in the slot beside the chosen
 * word. A faint outline diaper stands beside each of the others.
 *
 * THE PICTURE AT EACH STOP, AT REST (`diaperToggle.ts` holds every number and tests it): the stripe
 * a real diaper carries down its front, yellow while dry and blue once wet, and two whiff lines over
 * a dirty one —
 *
 *   WET   the stripe blue        DIRTY  the stripe yellow and the whiffs
 *   BOTH  blue and the whiffs    DRY    the stripe yellow, and nothing else
 *
 * THE MOVE, frame by frame. The diaper crouches, then hops from stop to stop on one beat — one hop
 * for a neighbor, three from Wet to Dry, touching down at each stop it passes — leaning into the
 * jump and back as it comes down, and squashes as it lands. The old word goes quiet and the new one
 * bold as it goes; the outline at a stop it crosses makes way for it and comes back behind it. Then
 * the answer's own picture, once:
 *
 *   to WET    two droplets fall in from over the pill's edge; as the first goes in at the
 *             waistband the stripe fills blue from the bottom;
 *   to DIRTY  the whiff lines rise out of the waistband into place, swaying, and a wisp carries on
 *             up between them and fades out of the top of the pill;
 *   to BOTH   the droplets and the stripe, then the whiffs and the wisp;
 *   to DRY    a small sparkle twinkles over it once, and a smaller one after it, and they are gone.
 *
 * Leaving, the stripe drains back to yellow and the whiffs go as it takes off. A tap mid-hop turns
 * it round in the air. NOTHING LOOPS, and nothing plays for an answer the parent did not give: the
 * sheet draws a pre-selection (the last diaper's kind) at rest, by remounting this at the new value.
 *
 * Under REDUCE MOTION, and in the amber NIGHT theme, nothing moves or twinkles (`pictureStill`): the
 * diaper is at its stop, the stripe blue or not and the whiffs there or not. In Night it is drawn in
 * the night palette's roles, and there is no sparkle to draw (`theme/diaper.ts`).
 *
 * TO EVERYTHING BUT THE EYE IT IS THE SEGMENTED CONTROL IT REPLACES: a radio group with the caller's
 * name and four radios in the caller's order, each a stop's own stretch of the pill — its slot, its
 * word and half the room either side, the pill's full height, a target over 44 both ways — named
 * with the caller's words (or a fuller name, when the word alone would not do: "Both, wet and
 * dirty") and saying whether it is checked, under the caller's ids (`${testID}` for the group,
 * `${testID}.${value}` for each). A tap is felt by the segmented control's own rule
 * (`feedback/choice.ts`), once, in the press handler. The drawing is hidden from touch and from
 * assistive technology. It draws what the parent answered and nothing else: no stool, no color that
 * means anything, no mark for any answer (CLAUDE.md §2).
 */
import type { DiaperKind } from '@nibblecue/core';
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { feelChoice } from '../feedback/choice';
import { Icon } from '../icons/Icon';
import { diaperPictureFor, type DiaperPicture } from '../theme/diaper';
import { useTheme } from '../theme/ThemeProvider';
import { SPARKLE_PATH } from './dayNightSwitch';
import {
  DIAPER,
  DIAPER_GHOST_SCALE,
  DIAPER_PICTURE_MS,
  DIAPER_SLOT,
  DIAPER_STOPS,
  DIAPER_WORD_EASE,
  DROP,
  DROP_PATH,
  DROPS,
  SPARKLES,
  WHIFF_BOX,
  WHIFF_STROKE,
  WHIFFS,
  WISP,
  WORD_QUIET,
  diaperBodyFrames,
  diaperEase,
  diaperLook,
  diaperMoveMs,
  diaperPictureFrames,
  diaperStopOf,
  diaperTileGeometry,
  diaperToggleGeometry,
  diaperTrackFrames,
  planDiaperMove,
  planDiaperPicture,
  whiffPath,
  type DiaperMotion,
  type DiaperPlan,
  type DiaperRun,
  type DiaperStop,
  type DiaperTileGeometry,
} from './diaperToggle';
import { deg, num, type AnimatedStyle } from './PictureToggle';
import { PICTURE_WORD, pictureStill } from './pictureToggle';
import { AppText } from './Text';
import { spanWidth } from './themeSkyToggle';

/** One answer: the kind it saves, the word written for it, and a fuller name where one is needed. */
export interface DiaperOption {
  value: DiaperKind;
  label: string;
  /** What a screen reader says for it, when the word alone would not do ("Both, wet and dirty"). */
  accessibilityLabel?: string;
}

export interface DiaperToggleProps {
  /** The four answers, left to right. */
  options: readonly [DiaperOption, DiaperOption, DiaperOption, DiaperOption];
  value: DiaperKind;
  /**
   * A tap on another answer. A tap on the chosen one is not reported, as the segmented control's
   * was not.
   */
  onChange: (kind: DiaperKind) => void;
  /** The group's name, for assistive technology ("What was in it"). */
  label: string;
  /** The room the control has: the pill takes all of it, up to `DIAPER_TOGGLE_SIZE.maxWidth`. */
  width: number;
  /**
   * `tiles` (the owner's Option 2, 2026-10-05): four white tiles, the diaper over each word, the
   * chosen tile edged in the accent with a check. The SAME hop, ghosts, droplets, whiffs and
   * sparkle, on the same frames and clocks — only where the stops stand changes
   * (`diaperTileGeometry`). Default `pill`: every other caller as it was.
   */
  layout?: 'pill' | 'tiles';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The knob's flight: held for the crouch, one speed across, held for the landing. */
const KNOB_EASE = diaperEase;
/** Under the app's Calm motion the hop and its picture run this much slower. */
export const CALM_PACE = 1.8;
const WORD_EASE = Easing.bezier(...DIAPER_WORD_EASE);
/** The stripe fills and drains quick off the mark and soft into place. */
const FILL_EASE = Easing.out(Easing.quad);

export function DiaperToggle({
  options,
  value,
  onChange,
  label,
  width,
  layout = 'pill',
  disabled = false,
  style,
  testID,
}: DiaperToggleProps) {
  const tiles = layout === 'tiles';
  const t = useTheme();
  const win = useWindowDimensions();
  const pic = diaperPictureFor(t.theme);
  /*
    THE HOP PLAYS UNDER CALM MOTION, SLOWER (the owner, 2026-10-06: "diaper hop should still be
    active even in calm motion, just make it slower"). It is still where the phone asks for reduced
    motion, and in the amber Night theme (the owner kept that still the same day); under the app's
    own Calm motion it runs at `CALM_PACE` of its speed — every clock, the hop's and the picture's.
  */
  const still = pictureStill(t.reduceMotion && !t.calmMotion, t.theme);
  const pace = t.calmMotion ? CALM_PACE : 1;
  const [w0, w1, w2, w3] = [options[0].label, options[1].label, options[2].label, options[3].label];
  const g = useMemo(
    () =>
      tiles
        ? diaperTileGeometry(width, win.fontScale)
        : diaperToggleGeometry(width, [w0, w1, w2, w3], win.fontScale),
    [tiles, width, w0, w1, w2, w3, win.fontScale],
  );
  // where the words' line stands: under the diaper in a tile, across the pill's middle otherwise
  const wordTop = 'wordTop' in g ? (g as DiaperTileGeometry).wordTop : 0;
  const wordHeight = 'wordHeight' in g ? (g as DiaperTileGeometry).wordHeight : g.height;
  const stop = diaperStopOf(options, value);

  // every value constructed AT REST for the answer it opens on: the first frame is already the
  // right picture, and the droplets', the wisp's and the sparkle's clocks sit at their end, where
  // they draw nothing — a sheet that opens on an answer plays none of it
  const look = diaperLook(value);
  const pos = useRef(new Animated.Value(stop)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const words = useRef(DIAPER_STOPS.map(s => new Animated.Value(s === stop ? 1 : 0))).current;
  const wet = useRef(new Animated.Value(look.wet ? 1 : 0)).current;
  const dirty = useRef(new Animated.Value(look.dirty ? 1 : 0)).current;
  const drops = useRef(new Animated.Value(1)).current;
  const wisp = useRef(new Animated.Value(1)).current;
  const twinkle = useRef(new Animated.Value(1)).current;

  // THE KNOB: where it was last sent, the move taking it there, and the plan this commit made —
  // set before the picture's effect below runs, so the picture reads the move's clock
  const at = useRef<DiaperStop>(stop);
  const motion = useRef<DiaperMotion | null>(null);
  const plan = useRef<DiaperPlan | null>(null);
  useEffect(() => {
    const now = Date.now();
    const m = motion.current;
    const resting = m === null || now >= m.startedAt + m.duration;
    // already there: the first render, or one that changed nothing about where it rests
    if (at.current === stop && resting && !still) return;
    const planned = planDiaperMove(m, at.current, stop, now, still);
    const p = { ...planned, duration: planned.duration * pace };
    at.current = stop;
    plan.current = planned;
    if (!p.animate) {
      // set, even over a move in flight: reduce motion turned on mid-hop stops the run first, and
      // without this the diaper would hang in the air
      pos.setValue(p.to);
      sway.setValue(0);
      words.forEach((v, s) => v.setValue(s === p.to ? 1 : 0));
      motion.current = null;
      return;
    }
    const timing = (v: Animated.Value, toValue: number, easing: (x: number) => number) =>
      Animated.timing(v, { toValue, duration: p.duration, easing, useNativeDriver: true });
    const run = Animated.parallel([
      timing(pos, p.to, KNOB_EASE),
      // straight through the move: its frames are placed in time, not in distance
      timing(sway, p.sway, Easing.linear),
      ...words.map((v, s) => timing(v, s === p.to ? 1 : 0, WORD_EASE)),
    ]);
    motion.current = { from: p.from, to: stop, startedAt: now, duration: p.duration };
    // landed: `sway` back to rest, which its frames draw exactly as they draw the end
    run.start(({ finished }) => {
      if (finished) sway.setValue(0);
    });
    // a new tap, reduce motion, the Night theme, or the toggle going away: stop where it is
    return () => run.stop();
  }, [pos, sway, words, stop, still, pace]);

  // THE PICTURE: the stripe and the whiffs follow the answer; the droplets, the wisp and the
  // sparkle are the answer's own moment, played once when the PARENT changes it
  const was = useRef<DiaperKind>(value);
  useEffect(() => {
    const changed = was.current !== value;
    const moveMs = plan.current?.duration ?? diaperMoveMs(1);
    const p = planDiaperPicture(value, changed, moveMs, still);
    was.current = value;
    if (!p.animate) {
      if (!still && !changed) return;
      // the end state, even over a picture in flight: every event's clock to its end, where it
      // draws nothing, so turning reduce motion on mid-drop leaves no droplet in the air
      wet.setValue(p.end.wet);
      dirty.setValue(p.end.dirty);
      drops.setValue(1);
      wisp.setValue(1);
      twinkle.setValue(1);
      return;
    }
    const runs: Animated.CompositeAnimation[] = [];
    const state = (v: Animated.Value, r: DiaperRun | null, easing: (x: number) => number) => {
      if (r !== null)
        runs.push(
          Animated.timing(v, {
            toValue: r.to,
            delay: r.delay * pace,
            duration: r.duration * pace,
            easing,
            useNativeDriver: true,
          }),
        );
    };
    // an event this answer does not play is gone at once; one it plays is wound back and run ONCE
    const once = (v: Animated.Value, delay: number | null, duration: number) => {
      v.setValue(delay === null ? 1 : 0);
      if (delay !== null)
        runs.push(
          Animated.timing(v, {
            toValue: 1,
            delay: delay * pace,
            duration: duration * pace,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        );
    };
    state(wet, p.wet, FILL_EASE);
    // the whiffs' frames carry their own easing: their value runs straight
    state(dirty, p.dirty, Easing.linear);
    once(drops, p.drops, DIAPER_PICTURE_MS.drops);
    once(wisp, p.wisp, DIAPER_PICTURE_MS.wisp);
    once(twinkle, p.twinkle, DIAPER_PICTURE_MS.twinkle);
    const run = Animated.parallel(runs);
    run.start();
    // a new tap, reduce motion or the toggle going away: stop where it is
    return () => run.stop();
  }, [value, still, pace, wet, dirty, drops, wisp, twinkle]);

  // built once per geometry: every layer is a view of the values above
  const anim = useMemo(() => {
    const tf = diaperTrackFrames(g);
    const bf = diaperBodyFrames();
    const pf = diaperPictureFrames();
    // the diaper crouches, leans and lands about its foot: its place below the knob box's middle
    const foot = DIAPER.foot.y - g.knob / 2;
    const knob: AnimatedStyle = {
      transform: [{ translateX: num(pos, tf.knobX) }, { translateY: num(pos, tf.hopY) }],
    };
    const body: AnimatedStyle = {
      transform: [
        { translateY: foot },
        { rotate: deg(sway, bf.lean) },
        { scaleX: num(sway, bf.squashX) },
        { scaleY: num(sway, bf.squashY) },
        { translateY: -foot },
      ],
    };
    const ghost = DIAPER_STOPS.map(s => ({ opacity: num(pos, tf.ghost[s]) }));
    const chosen = words.map(v => ({ opacity: v }));
    const quiet = words.map(v => ({ opacity: num(v, WORD_QUIET) }));
    const stripe: AnimatedStyle = { transform: [{ translateY: num(wet, pf.stripe) }] };
    const whiffs: AnimatedStyle[] = WHIFFS.map((w, i) => {
      const f = pf.whiffs[i] ?? pf.whiffs[0]!;
      // each leans about its own foot, which is half its height below its middle
      const half = (w.bottom - w.top) / 2;
      return {
        opacity: num(dirty, f.opacity),
        transform: [
          { translateX: num(dirty, f.x) },
          { translateY: num(dirty, f.y) },
          { translateY: half },
          { rotate: `${w.tilt}deg` },
          { translateY: -half },
        ],
      };
    });
    const wispStyle: AnimatedStyle = {
      opacity: num(wisp, pf.wisp.opacity),
      transform: [{ translateX: num(wisp, pf.wisp.x) }, { translateY: num(wisp, pf.wisp.y) }],
    };
    const drop: AnimatedStyle[] = pf.drops.map(f => ({
      opacity: num(drops, f.opacity),
      transform: [{ translateY: num(drops, f.y) }, { scale: num(drops, f.scale) }],
    }));
    const sparkle: AnimatedStyle[] = pf.sparkles.map(f => ({
      opacity: num(twinkle, f.opacity),
      transform: [{ scale: num(twinkle, f.scale) }, { rotate: deg(twinkle, f.rotate) }],
    }));
    return { knob, body, ghost, chosen, quiet, stripe, whiffs, wisp: wispStyle, drop, sparkle };
  }, [g, pos, sway, words, wet, dirty, drops, wisp, twinkle]);

  const slotBox = (left: number): ViewStyle => ({
    position: 'absolute',
    left,
    top: g.inset,
    width: g.slot,
    height: g.knob,
  });
  // one line, whole: each stop's word has the room its bound needs at the size it is drawn, and a
  // word the bound did not foresee is made smaller, never cut off
  const word = (text: string, bold: boolean) => (
    <AppText
      variant={bold ? 'bodyStrong' : 'bodySm'}
      color={bold ? pic.word : pic.quiet}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={PICTURE_WORD.shrink}
      maxFontSizeMultiplier={g.cap}
      // the segmented control's size in both weights, so the cross-fade swaps weight, not size
      style={{ fontSize: t.type.bodySm.fontSize, lineHeight: t.type.bodySm.lineHeight }}
    >
      {text}
    </AppText>
  );
  // the chosen tile's word carries the check, and fades in with it (never color alone)
  const chosenWord = (text: string) =>
    tiles ? (
      <View style={[styles.row, { gap: 4 }]}>
        <View
          style={[styles.check, { backgroundColor: t.color.accent, borderRadius: t.radius.pill }]}
        >
          <Icon name="check" size={10} color={t.color.onAccent} />
        </View>
        {word(text, true)}
      </View>
    ) : (
      word(text, true)
    );
  const { stripe: st } = DIAPER;
  // nothing twinkles where nothing may be lit (the amber Night has no sparkle color)
  const sparkleInk = pic.sparkle;

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
        {tiles
          ? /* THE TILES, BEHIND EVERYTHING and clipping nothing: their own layer, so the hop and
               the droplets draw over them and past their edges */
            DIAPER_STOPS.map(s => (
              <View
                key={`tile-${s}`}
                style={[
                  styles.tile,
                  {
                    left: g.word[s].left,
                    width: spanWidth(g.word[s]),
                    height: g.height,
                    borderRadius: t.radius.m,
                    backgroundColor: t.color.surfaceSolid,
                    borderColor: s === stop ? t.color.accent : t.color.surfaceSolid,
                    borderWidth: 1.5,
                  },
                ]}
              />
            ))
          : null}
        {/* NEVER FLATTENED (2026-10-06, the owner: "the hop animation did not work at all"). The
            pill's track was a real view — its ground, its clip — and the hop ran in it. The tiles'
            container has neither, and on Android's new architecture a view with nothing to draw
            is folded into its parent; the native-driven hop, the ghosts and the words then had no
            view to move. `collapsable={false}` here and on every animated layer keeps them real */}
        <View
          collapsable={false}
          style={[
            tiles ? styles.open : styles.track,
            tiles ? null : { borderRadius: t.radius.pill, backgroundColor: pic.ground },
          ]}
        >
          {DIAPER_STOPS.map(s => (
            <Animated.View
              collapsable={false}
              key={`ghost-${s}`}
              style={[slotBox(g.rest[s]), anim.ghost[s]]}
            >
              <GhostDiaper pic={pic} height={g.knob} />
            </Animated.View>
          ))}
          {DIAPER_STOPS.map(s => (
            <View
              key={`word-${s}`}
              style={[
                styles.word,
                {
                  left: g.word[s].left,
                  width: spanWidth(g.word[s]),
                  top: wordTop,
                  height: wordHeight,
                },
              ]}
            >
              <Animated.View
                collapsable={false}
                style={[StyleSheet.absoluteFill, styles.center, anim.quiet[s]]}
              >
                {word(options[s].label, false)}
              </Animated.View>
              <Animated.View
                collapsable={false}
                style={[StyleSheet.absoluteFill, styles.center, anim.chosen[s]]}
              >
                {chosenWord(options[s].label)}
              </Animated.View>
            </View>
          ))}

          {/* THE ANSWER'S MOMENT, at its own stop and behind the diaper, so the droplets go in at
              its waistband and the wisp comes up from behind it */}
          <View style={slotBox(g.rest[stop])}>
            <Animated.View
              collapsable={false}
              style={[
                styles.mark,
                {
                  left: WISP.x - WHIFF_BOX / 2,
                  top: WISP.top,
                  width: WHIFF_BOX,
                  height: WISP.bottom - WISP.top,
                },
                anim.wisp,
              ]}
            >
              <Whiff color={pic.whiff} height={WISP.bottom - WISP.top} />
            </Animated.View>
            {DROPS.map((d, i) => (
              <Animated.View
                collapsable={false}
                key={`drop-${d.x}`}
                style={[
                  styles.mark,
                  {
                    left: d.x - DROP.width / 2,
                    top: d.from,
                    width: DROP.width,
                    height: DROP.height,
                  },
                  anim.drop[i],
                ]}
              >
                <Svg width={DROP.width} height={DROP.height}>
                  <Path d={DROP_PATH} fill={pic.drop} />
                </Svg>
              </Animated.View>
            ))}
            {sparkleInk
              ? SPARKLES.map((sp, i) => (
                  <Animated.View
                    collapsable={false}
                    key={`sparkle-${sp.x}`}
                    style={[
                      styles.mark,
                      {
                        left: sp.x - sp.size / 2,
                        top: sp.y - sp.size / 2,
                        width: sp.size,
                        height: sp.size,
                      },
                      anim.sparkle[i],
                    ]}
                  >
                    <Svg width={sp.size} height={sp.size} viewBox="0 0 10 10">
                      <Path d={SPARKLE_PATH} fill={sparkleInk} />
                    </Svg>
                  </Animated.View>
                ))
              : null}
          </View>

          {/* THE KNOB: carried along and up by `pos`; the whiffs ride it, behind its body */}
          <Animated.View collapsable={false} style={[slotBox(g.rest[0]), anim.knob]}>
            {WHIFFS.map((w, i) => (
              <Animated.View
                collapsable={false}
                key={`whiff-${w.x}`}
                style={[
                  styles.mark,
                  {
                    left: w.x - WHIFF_BOX / 2,
                    top: w.top,
                    width: WHIFF_BOX,
                    height: w.bottom - w.top,
                  },
                  anim.whiffs[i],
                ]}
              >
                <Whiff color={pic.whiff} height={w.bottom - w.top} />
              </Animated.View>
            ))}
            <Animated.View collapsable={false} style={[StyleSheet.absoluteFill, anim.body]}>
              <Svg width={g.slot} height={g.knob}>
                <Path d={DIAPER.body} fill={pic.body} />
                {DIAPER.cuffs.map(d => (
                  <Path key={d} d={d} fill={pic.tab} />
                ))}
                {DIAPER.tabs.map(d => (
                  <Path
                    key={d}
                    d={d}
                    fill={pic.tab}
                    stroke={pic.line}
                    strokeWidth={DIAPER.detail}
                    strokeLinejoin="round"
                  />
                ))}
                {DIAPER.legs.map(d => (
                  <Path
                    key={d}
                    d={d}
                    fill="none"
                    stroke={pic.line}
                    strokeWidth={DIAPER.detail}
                    strokeLinecap="round"
                  />
                ))}
                <Path
                  d={DIAPER.body}
                  fill="none"
                  stroke={pic.line}
                  strokeWidth={DIAPER.stroke}
                  strokeLinejoin="round"
                />
              </Svg>
              {/* THE STRIPE: its box is the blue's clip, so the blue fills it from the bottom */}
              <View
                style={[
                  styles.stripe,
                  {
                    left: st.x,
                    top: st.y,
                    width: st.width,
                    height: st.height,
                    borderRadius: t.radius.pill,
                    backgroundColor: pic.dry,
                  },
                ]}
              >
                <Animated.View
                  collapsable={false}
                  style={[StyleSheet.absoluteFill, { backgroundColor: pic.wet }, anim.stripe]}
                />
              </View>
            </Animated.View>
          </Animated.View>
        </View>
        {/* the rim, OVER everything: on Android a border is part of a view's own background, and
            the layers inside would paint over it. Tiles have their own edges instead */}
        {tiles ? null : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: t.radius.pill, borderWidth: g.rim, borderColor: t.color.line2 },
            ]}
          />
        )}
      </View>

      {/* the four answers: each stop's own stretch of the pill, over the drawing, one radio each */}
      {DIAPER_STOPS.map(s => {
        const o = options[s];
        const on = s === stop;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            accessibilityState={{ checked: on, selected: on, disabled }}
            disabled={disabled}
            onPress={() => {
              feelChoice({ locked: false, current: on, kind: 'tap' });
              if (!on) onChange(o.value);
            }}
            style={[styles.zone, { left: g.zone[s].left, width: spanWidth(g.zone[s]) }]}
            {...(testID ? { testID: `${testID}.${o.value}` } : {})}
          />
        );
      })}
    </View>
  );
}

/** One whiff line, as a wave rising: the settled pair and the wisp are the same stroke. */
function Whiff({ color, height }: { color: string; height: number }) {
  return (
    <Svg width={WHIFF_BOX} height={height}>
      <Path
        d={whiffPath(height)}
        fill="none"
        stroke={color}
        strokeWidth={WHIFF_STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * THE GHOST: the diaper in outline at a stop it is not at, a little smaller, where it would stand —
 * its body, its tabs and its legs, so it reads as a diaper and not a bowl. One ink, the picture's
 * quiet mark color.
 */
function GhostDiaper({ pic, height }: { pic: DiaperPicture; height: number }) {
  const s = DIAPER_GHOST_SCALE;
  const { x, y } = DIAPER.center;
  // strokes a little heavier in the diaper's own units, so each is about a point once scaled
  const stroke = 1.2 / s;
  return (
    <Svg width={DIAPER_SLOT} height={height}>
      <G transform={`translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})`}>
        <Path
          d={DIAPER.body}
          fill="none"
          stroke={pic.ghost}
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
        {DIAPER.tabs.map(d => (
          <Path key={d} d={d} fill="none" stroke={pic.ghost} strokeWidth={stroke * 0.75} />
        ))}
        {DIAPER.legs.map(d => (
          <Path
            key={d}
            d={d}
            fill="none"
            stroke={pic.ghost}
            strokeWidth={stroke * 0.75}
            strokeLinecap="round"
          />
        ))}
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  // centered in whatever holds it: past `maxWidth` the pill stops growing and its room does not
  root: { alignSelf: 'center' },
  track: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  word: { position: 'absolute', top: 0 },
  center: { justifyContent: 'center', alignItems: 'center' },
  open: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  tile: { position: 'absolute', top: 0 },
  row: { flexDirection: 'row', alignItems: 'center' },
  check: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  mark: { position: 'absolute' },
  stripe: { position: 'absolute', overflow: 'hidden' },
  zone: { position: 'absolute', top: 0, bottom: 0 },
});
