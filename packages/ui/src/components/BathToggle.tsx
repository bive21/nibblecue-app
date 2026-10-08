/**
 * BathToggle — "Washed / Not washed" as a little bath (the owner, 2026-09-25, idea 6 of the
 * "that's cool" list, for the bath sheet's "Hair"): "yes" sends a few bubbles rising, once; "no"
 * leaves the water still. A picture toggle in the sky toggle's language (`PictureTrack`): the pill
 * is a bath seen from the side — the bath module's soft tint for the wall, a band of water along its
 * foot — a rubber duck floating on the water is the knob, and both answers are written on the wall.
 *
 *   THE BUBBLES STOP ("Washed"): the duck floats at its end with a little foam on the water round
 *     it — four bubbles, two behind it and two before.
 *   THE OTHER ("Not washed"): the duck floats at the other end on still water, nothing on it.
 *
 * THE MOVE, frame by frame (`bathToggle.ts` and `pictureToggle.ts` hold the numbers and test them).
 * The duck floats to the other end on the theme toggle's landing curve, 600 ms, rocking five degrees
 * about its waterline — back as it is pushed off, forward as it stops, one small rock after — dipping
 * as it sets off and again as it stops, and bobbing once; a ripple shows either side of it while it
 * moves and is gone when it stops. The words cross-fade as it passes and the outline ghost at the far
 * end makes way for it, as the bottle's does.
 *   ARRIVING AT THE BUBBLES STOP, the foam puffs up round it one bubble after another, each swelling a
 *     little past its size and settling; then, most of the way into the move, four bubbles come up
 *     out of the foam and rise — one after another, wobbling side to side, slow off the water and
 *     quicker as they go, growing a little — and leave through the top of the pill, fading as they
 *     go, 1.4 s from the first to the last. They rise ONCE. Nothing moves after that.
 *   LEAVING IT, the foam swells and pops, the last one up the first one gone, and takes any bubble
 *     still on its way up with it. The water the duck arrives on is still.
 * A sheet that OPENS on "Washed" blows no bubbles: the foam is simply there. Only a change TO it
 * does. A tap mid-move turns the duck round where it is.
 *
 * Under REDUCE MOTION, and in the amber NIGHT theme, nothing moves: the duck is at its stop and the
 * foam is on the water or not (`pictureStill`). In Night it is drawn in the night palette's roles,
 * the foam as rims with nothing lit (`theme/bath.ts`).
 *
 * The whole drawing is hidden from assistive technology and from touch; to a screen reader this is
 * the segmented control it replaces. Nothing in it is tied to a number, and nothing congratulates
 * anybody (CLAUDE.md §2 rules 3 and 6): foam on the water is the answer "washed", and that is all.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { bathPictureFor, type BathPicture } from '../theme/bath';
import { useTheme } from '../theme/ThemeProvider';
import {
  BATH_SLOT,
  bathFrames,
  bathScene,
  bubbleAt,
  DUCK,
  DUCK_GHOST_SCALE,
  FOAM,
  GHOST_BUBBLES,
  planBath,
  RIPPLES,
  RISE_MS,
  riserFrom,
  RISERS,
  WATER,
} from './bathToggle';
import {
  deg,
  num,
  PictureTrack,
  stopOf,
  usePictureKnob,
  type AnimatedStyle,
  type PictureOption,
} from './PictureToggle';
import { PICTURE_MS, pictureToggleGeometry, type PictureStop } from './pictureToggle';

export interface BathToggleProps<T extends string> {
  /** The two answers, in order: the first rests at the left end of the pill, the second at the right. */
  options: readonly [PictureOption<T>, PictureOption<T>];
  value: T;
  onChange: (value: T) => void;
  /** The group's name, for assistive technology. */
  label: string;
  /** Which option sends the bubbles up ("Washed"); the other leaves the water still. */
  bubbles: T;
  /** The room the control has: the pill takes all of it, up to `PICTURE_TOGGLE_SIZE.maxWidth`. */
  width: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A bubble's rim: thin, so a small bubble is still mostly bubble. */
const RIM = 0.9;

export function BathToggle<T extends string>({
  options,
  value,
  onChange,
  label,
  bubbles,
  width,
  disabled = false,
  style,
  testID,
}: BathToggleProps<T>) {
  const t = useTheme();
  const pic = bathPictureFor(t.theme);
  const g = useMemo(() => pictureToggleGeometry(width, BATH_SLOT), [width]);
  const scene = useMemo(() => bathScene(g), [g]);
  const knob = usePictureKnob(stopOf(options, value));
  const foamStop = stopOf(options, bubbles);

  // THE FOAM AND THE RISE, values of their own: `rise` sits at 1 — every bubble already gone — so
  // the first frame blows none, whatever the sheet opens on
  const on = value === bubbles;
  const suds = useRef(new Animated.Value(on ? 1 : 0)).current;
  const rise = useRef(new Animated.Value(1)).current;
  const was = useRef(on);
  const { still, plan } = knob;
  useEffect(() => {
    const p = planBath(was.current, on, plan.current?.duration ?? PICTURE_MS, still);
    was.current = on;
    if (!p.animate) {
      // the end state, even over a rise in flight: reduce motion turned on mid-rise stops it first
      suds.setValue(p.suds);
      rise.setValue(1);
      return;
    }
    const runs = [
      // straight through the move: the foam's frames are placed in time, as the duck arrives
      Animated.timing(suds, {
        toValue: p.suds,
        duration: p.duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ];
    if (p.rise) {
      rise.setValue(0);
      runs.push(
        Animated.timing(rise, {
          toValue: 1,
          duration: RISE_MS,
          delay: p.riseDelay,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
    }
    const run = Animated.parallel(runs);
    run.start();
    // leaving mid-rise stops it where it is; the foam going takes those bubbles with it (`gate`)
    return () => run.stop();
  }, [on, still, plan, suds, rise]);

  const anim = useMemo(() => {
    const f = bathFrames(scene, foamStop);
    // about the middle of its waterline: a floating thing rocks where it meets the water
    const keel = DUCK.pivot.y - g.knob / 2;
    const duck: AnimatedStyle = {
      transform: [
        { translateY: num(knob.sway, f.bob) },
        { translateY: keel },
        { rotate: deg(knob.sway, f.rock) },
        { translateY: -keel },
      ],
    };
    const ripple: AnimatedStyle = { opacity: num(knob.sway, f.ripple) };
    const foam: AnimatedStyle[] = f.foam.map(b => ({
      opacity: num(suds, b.opacity),
      transform: [{ scale: num(suds, b.scale) }],
    }));
    const gate = num(suds, f.gate);
    const risers: AnimatedStyle[] = f.risers.map(b => ({
      opacity: Animated.multiply(num(rise, b.opacity), gate),
      transform: [
        { translateX: num(rise, b.x) },
        { translateY: num(rise, b.y) },
        { scale: num(rise, b.scale) },
      ],
    }));
    return { duck, ripple, foam, risers };
  }, [g.knob, scene, foamStop, knob.sway, suds, rise]);

  const ghost = (s: PictureStop) => (
    <GhostDuck pic={pic} height={g.knob} waterline={scene.waterline} foam={s === foamStop} />
  );

  return (
    <PictureTrack
      options={options}
      value={value}
      onChange={onChange}
      label={label}
      g={g}
      knob={knob}
      ground={pic.wall}
      ink={{ word: pic.word, quiet: pic.quiet }}
      words={scene.words}
      backdrop={
        <View
          style={[
            styles.water,
            { top: scene.surface, height: g.height - scene.surface, backgroundColor: pic.water },
          ]}
        />
      }
      ghosts={[ghost(0), ghost(1)]}
      front={
        <>
          {/* the water over the duck's keel, and the surface line over that: it floats IN it */}
          <View
            style={[
              styles.water,
              { top: scene.surface, height: g.height - scene.surface, backgroundColor: pic.lip },
            ]}
          />
          <View
            style={[
              styles.water,
              { top: scene.surface, height: WATER.line, backgroundColor: pic.line },
            ]}
          />
          {FOAM.map((b, i) => (
            <BubbleView
              key={`foam-${b.dx}`}
              pic={pic}
              at={bubbleAt(g, scene, foamStop, b)}
              style={anim.foam[i]}
            />
          ))}
          {RISERS.map((b, i) => (
            <BubbleView
              key={`riser-${b.dx}`}
              pic={pic}
              at={riserFrom(g, scene, foamStop, i)}
              style={anim.risers[i]}
            />
          ))}
        </>
      }
      disabled={disabled}
      {...(style ? { style } : {})}
      {...(testID ? { testID } : {})}
    >
      <Animated.View style={[StyleSheet.absoluteFill, anim.duck]}>
        <Svg width={g.slot} height={g.knob}>
          <Path d={DUCK.body} fill={pic.duck} stroke={pic.duckEdge} strokeWidth={DUCK.stroke} />
          <Path d={DUCK.wing} fill={pic.wing} />
          <Circle
            cx={DUCK.head.cx}
            cy={DUCK.head.cy}
            r={DUCK.head.r}
            fill={pic.duck}
            stroke={pic.duckEdge}
            strokeWidth={DUCK.stroke}
          />
          <Path d={DUCK.beak} fill={pic.beak} stroke={pic.duckEdge} strokeWidth={DUCK.stroke} />
          <Circle cx={DUCK.eye.cx} cy={DUCK.eye.cy} r={DUCK.eye.r} fill={pic.eye} />
          {pic.shine ? (
            <Circle cx={DUCK.shine.cx} cy={DUCK.shine.cy} r={DUCK.shine.r} fill={pic.shine} />
          ) : null}
        </Svg>
      </Animated.View>
      {/* the ripples do not rock with the duck: they are on the water */}
      <Animated.View style={[StyleSheet.absoluteFill, anim.ripple]}>
        <Svg width={g.slot} height={g.knob}>
          {RIPPLES.map(d => (
            <Path
              key={d}
              d={d}
              fill="none"
              stroke={pic.ripple}
              strokeWidth={WATER.line}
              strokeLinecap="round"
            />
          ))}
        </Svg>
      </Animated.View>
    </PictureTrack>
  );
}

/** One bubble — foam or rising — as a circle with a rim and, where things may be lit, a glint. */
function BubbleView({
  pic,
  at,
  style,
}: {
  pic: BathPicture;
  at: { x: number; y: number; r: number };
  style: AnimatedStyle | undefined;
}) {
  const size = 2 * at.r + RIM;
  const c = size / 2;
  return (
    <Animated.View
      style={[styles.bubble, { left: at.x - c, top: at.y - c, width: size, height: size }, style]}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={c}
          cy={c}
          r={at.r}
          fill={pic.bubble}
          stroke={pic.bubbleEdge}
          strokeWidth={RIM}
        />
        {pic.shine ? (
          <Circle cx={c - at.r * 0.35} cy={c - at.r * 0.35} r={at.r * 0.28} fill={pic.shine} />
        ) : null}
      </Svg>
    </Animated.View>
  );
}

/**
 * THE GHOST: the duck in outline at the stop it is not at, smaller, floating at the same
 * waterline — with a few outline bubbles over it at the bubbles stop, so the empty end says
 * "bubbles" before the duck is there. One ink, the picture's quiet mark color.
 */
function GhostDuck({
  pic,
  height,
  waterline,
  foam,
}: {
  pic: BathPicture;
  height: number;
  waterline: number;
  foam: boolean;
}) {
  const s = DUCK_GHOST_SCALE;
  const { x, y } = DUCK.pivot;
  // a stroke a little heavier in the duck's own units, so it is a point on the screen once scaled
  const stroke = DUCK.stroke / s + 0.2;
  return (
    <Svg width={BATH_SLOT} height={height}>
      <G transform={`translate(${x} ${waterline}) scale(${s}) translate(${-x} ${-y})`}>
        <Path d={DUCK.body} fill="none" stroke={pic.ghost} strokeWidth={stroke} />
        <Circle
          cx={DUCK.head.cx}
          cy={DUCK.head.cy}
          r={DUCK.head.r}
          fill="none"
          stroke={pic.ghost}
          strokeWidth={stroke}
        />
        <Path d={DUCK.beak} fill="none" stroke={pic.ghost} strokeWidth={stroke} />
      </G>
      {foam
        ? GHOST_BUBBLES.map(b => (
            <Circle
              key={`${b.dx}-${b.dy}`}
              cx={BATH_SLOT / 2 + b.dx}
              cy={waterline + b.dy}
              r={b.r}
              fill="none"
              stroke={pic.ghost}
              strokeWidth={RIM + 0.3}
            />
          ))
        : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  water: { position: 'absolute', left: 0, right: 0 },
  bubble: { position: 'absolute' },
});
