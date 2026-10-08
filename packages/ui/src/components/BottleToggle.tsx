/**
 * BottleToggle — "Finished it / Some left" as a bottle that drains (the owner, 2026-09-25, idea 3
 * of the "that's cool" list, for the bottle sheet's "The bottle"). A picture toggle in the sky
 * toggle's language (`PictureTrack`): the knob is a baby bottle standing in a pill of the feed
 * module's soft tint, both answers are written on it, and the bottle rests at the chosen one's end.
 *
 *   THE DRAINED STOP ("Finished it"): the bottle is empty — glass, graduations, collar and teat.
 *   THE OTHER ("Some left"): milk stands in it at a LINE — the leftover over the bottle when the
 *     sheet knows both (`fraction`, `leftFraction`), a nominal third when it does not — and the
 *     line follows the leftover stepper as the parent changes it, in one short ease.
 *
 * THE MOVE, frame by frame (`bottleToggle.ts` and `pictureToggle.ts` hold the numbers and test
 * them). The bottle slides to the other end on the theme toggle's landing curve, 600 ms. As the
 * base is pushed the top is left behind — it leans back seven degrees — then carries on over the
 * base as it slows, and rocks once, upright. Inside, the milk drains to nothing or rises to its
 * line as it goes, arriving with the bottle, and its surface does what milk does in a pushed
 * bottle: it lags the lean the other way, piling up at the back and then at the front, and lies
 * level again when the bottle stands still. The two words cross-fade as it passes — the old
 * answer to the quiet ink and regular weight, the new one to the full ink and bold — the outline
 * ghost at the far end fades out before the bottle arrives over it, and one fades in at the end it
 * left, drawn in that stop's state. A tap mid-move turns it round where it is.
 *
 * Under REDUCE MOTION, and in the amber NIGHT theme, nothing moves: the bottle is at its stop and
 * the milk at its line (`pictureStill`), in the night palette's roles in Night (`theme/bottle.ts`).
 *
 * WHAT IT IS NOT. It draws what the parent answered and nothing else: no amount on the bottle, no
 * mark or glow for a bottle finished, nothing about what the baby took (CLAUDE.md §2 rules 3 and
 * 6). The milk's tint follows the sheet's Type — breast milk, formula, water — and is never the only
 * signal of it: the Type control says it in words. The whole drawing is hidden from assistive
 * technology and from touch; to a screen reader this is the segmented control it replaces.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Line, Path, Rect } from 'react-native-svg';
import { bottlePictureFor, type BottleMilk, type BottlePicture } from '../theme/bottle';
import { useTheme } from '../theme/ThemeProvider';
import {
  BOTTLE,
  BOTTLE_END_PAD,
  BOTTLE_GHOST_SCALE,
  BOTTLE_KNOB_SCALE,
  BOTTLE_SLOT,
  bottleFrames,
  bottleLevel,
  MILK_SURFACE,
  milkLayer,
  planLevel,
} from './bottleToggle';
import {
  deg,
  num,
  PictureTrack,
  stopOf,
  usePictureKnob,
  type AnimatedStyle,
  type PictureOption,
} from './PictureToggle';
import { PICTURE_MS, pictureToggleGeometry } from './pictureToggle';

/** The one piece of the arithmetic a caller needs: the fraction it hands the picture as `fraction`. */
export { leftFraction } from './bottleToggle';

export interface BottleToggleProps<T extends string> {
  /** The two answers, in order: the first rests at the left end of the pill, the second at the right. */
  options: readonly [PictureOption<T>, PictureOption<T>];
  value: T;
  onChange: (value: T) => void;
  /** The group's name, for assistive technology. */
  label: string;
  /** Which option pictures the bottle drained ("Finished it"); the other shows milk at its line. */
  drained: T;
  /**
   * What was left over what was in the bottle (`leftFraction`), for the other option's line; null
   * when the sheet cannot say, and the line is drawn at a nominal third.
   */
  fraction: number | null;
  /** What is in the bottle — the milk's tint, never the only signal of it. */
  milk?: BottleMilk;
  /** The room the control has: the pill takes all of it, up to `PICTURE_TOGGLE_SIZE.maxWidth`. */
  width: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function BottleToggle<T extends string>({
  options,
  value,
  onChange,
  label,
  drained,
  fraction,
  milk = 'breast',
  width,
  disabled = false,
  style,
  testID,
}: BottleToggleProps<T>) {
  const t = useTheme();
  const pic = bottlePictureFor(t.theme);
  const g = useMemo(() => pictureToggleGeometry(width, BOTTLE_SLOT, BOTTLE_END_PAD), [width]);
  const knob = usePictureKnob(stopOf(options, value));

  // THE MILK, a value of its own: it follows the leftover stepper while the answer stands still
  const target = bottleLevel(value === drained, fraction);
  const level = useRef(new Animated.Value(target)).current;
  const seen = useRef({ value, level: target });
  const { still, plan } = knob;
  useEffect(() => {
    const toggled = seen.current.value !== value;
    const moved = Math.abs(seen.current.level - target) > 1e-6;
    seen.current = { value, level: target };
    if (!toggled && !moved && !still) return;
    // a change of answer arrives with the bottle, on its clock (`usePictureKnob` planned it in
    // this same commit, in an effect that runs before this one); a leftover alone follows quickly
    const p = planLevel(target, toggled, plan.current?.duration ?? PICTURE_MS, still);
    if (!p.animate) {
      level.setValue(p.to);
      return;
    }
    const run = Animated.timing(level, {
      toValue: p.to,
      duration: p.duration,
      easing: Easing.bezier(...p.ease),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [level, value, target, still, plan]);

  const anim = useMemo(() => {
    const f = bottleFrames();
    // about the middle of the bottle's base: a pushed bottle pivots on its foot
    const foot = BOTTLE.body.y + BOTTLE.body.height - g.knob / 2;
    const bottle: AnimatedStyle = {
      transform: [
        { scale: BOTTLE_KNOB_SCALE },
        { translateY: foot },
        { rotate: deg(knob.sway, f.lean) },
        { translateY: -foot },
      ],
    };
    // the milk's layer turns about its own middle, which is the surface
    const milkStyle: AnimatedStyle = {
      opacity: num(level, f.milk),
      transform: [{ translateY: num(level, f.milkY) }, { rotate: deg(knob.sway, f.slosh) }],
    };
    return { bottle, milk: milkStyle };
  }, [g.knob, knob.sway, level]);

  const layer = milkLayer();
  const body = BOTTLE.body;
  const ghostLevel = bottleLevel(false, fraction);
  const drainedStop = stopOf(options, drained);

  return (
    <PictureTrack
      options={options}
      value={value}
      onChange={onChange}
      label={label}
      g={g}
      knob={knob}
      ground={pic.ground}
      ink={{ word: pic.word, quiet: pic.quiet }}
      ghosts={[
        <Ghost key="a" pic={pic} height={g.knob} level={drainedStop === 0 ? 0 : ghostLevel} />,
        <Ghost key="b" pic={pic} height={g.knob} level={drainedStop === 1 ? 0 : ghostLevel} />,
      ]}
      disabled={disabled}
      {...(style ? { style } : {})}
      {...(testID ? { testID } : {})}
    >
      <Animated.View style={[StyleSheet.absoluteFill, anim.bottle]}>
        {/* the glass, and the milk in it: the body's box is the milk's clip, so a tilted surface
            never leaves the bottle */}
        <View
          style={[
            styles.body,
            {
              left: body.x,
              top: body.y,
              width: body.width,
              height: body.height,
              borderRadius: body.r,
              backgroundColor: pic.glass,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.layer,
              { left: layer.left, top: layer.top, width: layer.width, height: layer.height },
              anim.milk,
            ]}
          >
            <View
              style={[
                styles.fill,
                {
                  top: layer.milk.top,
                  height: layer.milk.height,
                  backgroundColor: pic.milk[milk],
                },
              ]}
            />
            {/* the line at the milk's top: its own top edge, so it tilts and moves with it */}
            <View
              style={[
                styles.fill,
                { top: layer.milk.top, height: MILK_SURFACE, backgroundColor: pic.surface[milk] },
              ]}
            />
          </Animated.View>
        </View>
        <Svg width={g.slot} height={g.knob} style={StyleSheet.absoluteFill}>
          {BOTTLE.ticks.map(at => {
            const y = body.y + body.height * (1 - at);
            return (
              <Line
                key={at}
                x1={body.x + BOTTLE.tick.from}
                y1={y}
                x2={body.x + BOTTLE.tick.to}
                y2={y}
                stroke={pic.tick}
                strokeWidth={BOTTLE.tick.width}
                strokeLinecap="round"
              />
            );
          })}
          {pic.shine ? (
            <Rect
              x={BOTTLE.shine.x}
              y={BOTTLE.shine.y}
              width={BOTTLE.shine.width}
              height={BOTTLE.shine.height}
              rx={BOTTLE.shine.r}
              fill={pic.shine}
            />
          ) : null}
          <Rect
            x={body.x}
            y={body.y}
            width={body.width}
            height={body.height}
            rx={body.r}
            fill="none"
            stroke={pic.outline}
            strokeWidth={BOTTLE.stroke}
          />
          <Rect
            x={BOTTLE.collar.x}
            y={BOTTLE.collar.y}
            width={BOTTLE.collar.width}
            height={BOTTLE.collar.height}
            rx={BOTTLE.collar.r}
            fill={pic.collar}
            stroke={pic.outline}
            strokeWidth={BOTTLE.stroke}
          />
          <Path
            d={BOTTLE.teat}
            fill={pic.teat}
            stroke={pic.outline}
            strokeWidth={BOTTLE.stroke}
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
    </PictureTrack>
  );
}

/**
 * THE GHOST: the bottle in outline at the stop the knob is not at, smaller, with a line where that
 * stop's milk would stand — none on the drained stop. One ink, the picture's quiet mark color.
 */
function Ghost({ pic, height, level }: { pic: BottlePicture; height: number; level: number }) {
  const body = BOTTLE.body;
  // smaller about the middle of the slot, so it stands where the bottle would
  const cx = BOTTLE_SLOT / 2;
  const cy = height / 2;
  const s = BOTTLE_GHOST_SCALE * BOTTLE_KNOB_SCALE;
  // a stroke a little heavier in the bottle's own units, so it is a point on the screen once scaled
  const stroke = BOTTLE.stroke / s;
  const y = body.y + body.height * (1 - level);
  return (
    <Svg width={BOTTLE_SLOT} height={height}>
      <G transform={`translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`}>
        <Rect
          x={body.x}
          y={body.y}
          width={body.width}
          height={body.height}
          rx={body.r}
          fill="none"
          stroke={pic.ghost}
          strokeWidth={stroke}
        />
        <Rect
          x={BOTTLE.collar.x}
          y={BOTTLE.collar.y}
          width={BOTTLE.collar.width}
          height={BOTTLE.collar.height}
          rx={BOTTLE.collar.r}
          fill="none"
          stroke={pic.ghost}
          strokeWidth={stroke}
        />
        <Path
          d={BOTTLE.teat}
          fill="none"
          stroke={pic.ghost}
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
        {level > 0 ? (
          <Line
            x1={body.x}
            y1={y}
            x2={body.x + body.width}
            y2={y}
            stroke={pic.ghost}
            strokeWidth={stroke}
          />
        ) : null}
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  body: { position: 'absolute', overflow: 'hidden' },
  layer: { position: 'absolute' },
  fill: { position: 'absolute', left: 0, right: 0 },
});

/**
 * THE BOTTLE AS A SMALL PICTURE, for breast milk on the bottle sheet's Type (the owner, 2026-10-06:
 * "the new breastmilk icon can be the same bottle that is on the 'Finished it' or 'Some left'"):
 * the same teat, collar and body, outlined in one ink, with milk standing two-thirds up the glass.
 */
export function BottleGlyph({ size = 16, color }: { size?: number; color: string }) {
  const body = BOTTLE.body;
  const level = 2 / 3;
  const milkTop = body.y + body.height * (1 - level);
  return (
    <Svg width={(size * BOTTLE_SLOT) / 48} height={size} viewBox={`0 0 ${BOTTLE_SLOT} 48`}>
      <Rect
        x={body.x}
        y={milkTop}
        width={body.width}
        height={body.y + body.height - milkTop}
        rx={body.r}
        fill={color}
        opacity={0.35}
      />
      <Rect
        x={body.x}
        y={body.y}
        width={body.width}
        height={body.height}
        rx={body.r}
        fill="none"
        stroke={color}
        strokeWidth={2.6}
      />
      <Rect
        x={BOTTLE.collar.x}
        y={BOTTLE.collar.y}
        width={BOTTLE.collar.width}
        height={BOTTLE.collar.height}
        rx={BOTTLE.collar.r}
        fill={color}
      />
      <Path d={BOTTLE.teat} fill={color} />
    </Svg>
  );
}
