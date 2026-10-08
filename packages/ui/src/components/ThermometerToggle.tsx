/**
 * ThermometerToggle — the temperature sheet's °F / °C, drawn as a real dual-scale thermometer
 * (the owner, 2026-09-26: *"i dont think the thermostat animation works, it does not make sense
 * what's showing and not like a real thermometer"*). It replaces a thermometer whose column was the
 * switch's knob — the same length for every reading, the reading riding its tip — which drew a
 * thermometer that did not measure anything.
 *
 * WHAT A PARENT SEES. A glass thermometer lying across the pill: the bulb at the left, the bore
 * running right, °F printed along the top edge of the bore (96 98 100 102 104 106) and °C along
 * the bottom (35 36 … 41), each mark where that temperature is. A silver column rises from the
 * bulb to the reading the stepper above shows — 98.6 °F and 37.0 °C are the same point, on both
 * scales at once — and a small tag at its tip writes the number. Beside the glass, a pair: °F | °C.
 *
 *   °F chosen: the top row and its symbol in the full ink and the bold face, the bottom row quiet;
 *     the tag reads 98.6.
 *   tap °C: the column does not move — the temperature did not change. The bottom row takes the
 *     ink and the top row goes quiet, the pair's chip slides across, and the tag's digits roll like
 *     an odometer to 37.0 (the tens 9-8-7-6-5-4-3, the tenths 6 down to 0), clicking into place
 *     left to right.
 *   a step of the stepper: the column glides along the bore to the new reading and the tag rides
 *     its tip, its digits set at once — the stepper's own number has already changed.
 *
 * THE TAG IS THE COLUMN'S END, AND IT WRITES ITS NUMBER (the owner, 2026-09-26, with a screenshot:
 * *"i think it's still has visual bug for the end temperature … or was it just unfinished?"*). On
 * their phone the tag was a hollow white capsule after the column with a dotted line inside it: its
 * digits were set in boxes exactly one digit wide, a digit came out a hair wider on the device, and
 * a one-line text that does not fit is drawn as "…" — every digit and the point an ellipsis
 * (`GLYPH_ROOM` in `thermometerToggle.ts`). It was neither an end cap nor a highlight; it was the
 * reading, unreadable. Each character now has a box a character wider either side, clipped rather
 * than ellipsized, and the tag is outlined in the column's own color (`tagEdge`) so it reads as the
 * reading's end carrying its number rather than a thing of its own after the column.
 *
 * WHY IT IS NOT AN INTERPRETATION (CLAUDE.md §2 rules 1 and 3). It is the parent's number drawn on
 * a scale, as a ruler draws a length. Nothing round the column says what the number means: the
 * column is one neutral silver at every reading and never red (`theme/thermometer.ts`); no mark on
 * the glass stands for a particular temperature (no arrow at 98.6 °F / 37 °C, which a real
 * clinical thermometer prints and this one deliberately does not); no band, no zone, no color that
 * changes with the number, no word. The printed run's ends are the ends of the glass, not limits:
 * a reading past either end pins the column there, and the tag and the stepper still write it in
 * full. The conversion is the sheet's (`tempToDisplay`: stored as °C×100, converted at the edge);
 * the tag writes the number it is handed, and every mark on the glass is placed by core's own
 * `displayToTemp` (`thermometerToggle.ts`), so this control stores nothing and converts nothing.
 *
 * THE RADIOS ARE THE PAIR, NOT THE GLASS (`THERMOMETER_SIZE` says why at length): two stacked
 * halves of a pill this short are 30 pt at most, under the 44 pt floor, so the scales are the
 * picture only and the choice is a pair of 44 pt radios at the right-hand end — drawn as the
 * segmented control the method row under it is, from the theme's own colors.
 *
 * A SCALE THAT ARRIVES WITHOUT A TAP — the parent's saved scale, read a moment after the sheet
 * opens — is set where it lands: a sheet never plays a flip nobody asked for (`planThermometer`).
 * REDUCE MOTION, and the amber NIGHT theme, set every end state and start nothing
 * (`thermometerStill`): the column stands at the reading and the tag is written; nothing glides,
 * nothing rolls, and in Night nothing glows (no highlight on the bulb).
 *
 * TO EVERYTHING BUT THE EYE IT IS A RADIO GROUP, as the segmented control it replaced was: the
 * group's name, then two radios named with the scale's symbol and saying whether each is checked,
 * keeping that control's ids (`<testID>.f`, `<testID>.c`), felt by `feelChoice`. The drawing is
 * hidden from touch and from assistive technology: the reading is the stepper's, which a screen
 * reader already hears as the stepper's value. Nothing is said by color alone: the chosen scale is
 * also the bold face, the chip under its radio, and the radio's checked state.
 */
import type { TempUnit } from '@nibblecue/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { feelChoice } from '../feedback/choice';
import { thermometerFor } from '../theme/thermometer';
import { useTheme } from '../theme/ThemeProvider';
import { SUN_HIGHLIGHT, type Frame } from './dayNightSwitch';
import { AppText, CHROME_FONT_CAP } from './Text';
import { SKY_EASE } from './themeSkyToggle';
import {
  digitAt,
  GLASS,
  GLIDE,
  glyphBox,
  levelOf,
  ODOMETER,
  planThermometer,
  readingDigits,
  restCell,
  SCALE_STOPS,
  scaleIndex,
  tagShift,
  TAP_WINDOW_MS,
  THERMOMETER_SIZE,
  thermometerFrames,
  thermometerGeometry,
  thermometerStill,
  WHEEL_CELLS,
  WHEEL_CLICK,
  type FlipMotion,
  type Printed,
  type ScaleStop,
} from './thermometerToggle';

export interface ThermometerToggleProps {
  /** The chosen scale: the one the glass is read on, and the checked radio. */
  value: TempUnit;
  /** A tap on the other scale. A tap on the chosen one is not reported, as the pills' was not. */
  onChange: (scale: TempUnit) => void;
  /** The reading the sheet shows, already in `value`'s scale: drawn and written, never converted here. */
  reading: number;
  /** The group's name, for assistive technology: a radiogroup without one is two loose radios. */
  label: string;
  /** Each scale's symbol, from the caller: printed on the glass, written on the pair, read as the radio's name. */
  labels: Readonly<Record<TempUnit, string>>;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;

/**
 * Two curves. A flip lands on the theme toggle's `land`, which arrives without carrying past (the
 * wheels' carry is the fixed click, `WHEEL_CLICK`); a glide is `GLIDE.ease`, which sets off at
 * speed, so a held stepper's stream of readings is followed rather than pulsed after.
 */
const EASE = {
  land: Easing.bezier(...SKY_EASE.land),
  glide: Easing.bezier(...GLIDE.ease),
} as const;
/** The digits a wheel carries, top to bottom: 0–9, three times (`WHEEL_CELLS`). */
const DIGIT_CELLS = Array.from({ length: WHEEL_CELLS }, (_, i) => String(i % 10));
/** Not useId(): its output contains ':', which is not valid in an SVG fragment identifier. */
let instances = 0;

export function ThermometerToggle({
  value,
  onChange,
  reading,
  label,
  labels,
  disabled = false,
  style,
  testID,
}: ThermometerToggleProps) {
  const t = useTheme();
  const pic = thermometerFor(t.theme);
  const still = thermometerStill(t.reduceMotion, t.theme);
  const { fontScale } = useWindowDimensions();
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-thermo-${(instances += 1)}`;
  const id = uid.current;

  // the room the sheet gives it, measured: the glass is drawn once it is known, and the two radios
  // are there from the first frame whatever the width
  const [room, setRoom] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== room) setRoom(w);
  };
  // laid out at the phone's text size, as far as the glass has room for it
  const g = useMemo(() => thermometerGeometry(room, labels, fontScale), [room, labels, fontScale]);
  const travel = g.run.to - g.run.from;

  // constructed AT the resting values, so the first frame is already the right picture
  const [first] = useState(() => readingDigits(reading));
  const level = useRef(new Animated.Value(levelOf(reading, value))).current;
  const side = useRef(new Animated.Value(scaleIndex(value))).current;
  const shift = useRef(new Animated.Value(tagShift(first))).current;
  const wheels = useRef(first.digits.map(d => new Animated.Value(restCell(d)))).current;
  const lit = useRef(first.lit.map(l => new Animated.Value(l ? 1 : 0))).current;
  // what was last shown, where the column and each wheel were last sent, the flip under way, the
  // last tap, and the three runs — the column's glide, the scale's turn and the tag's roll are
  // separate, so a step can glide the column while a flip finishes turning
  const shown = useRef({ stop: value, reading, still });
  const sent = useRef<{ level: number; cells: readonly number[] }>({
    level: levelOf(reading, value),
    cells: first.digits.map(restCell),
  });
  const flip = useRef<FlipMotion | null>(null);
  const armed = useRef<{ stop: TempUnit; at: number } | null>(null);
  const glide = useRef<Animated.CompositeAnimation | null>(null);
  const turn = useRef<Animated.CompositeAnimation | null>(null);
  const roll = useRef<Animated.CompositeAnimation | null>(null);
  const rollId = useRef(0);

  useEffect(() => {
    const was = shown.current;
    if (was.stop === value && was.reading === reading && was.still === still) return;
    shown.current = { stop: value, reading, still };
    const now = Date.now();
    const tap = armed.current;
    const tapped = tap !== null && tap.stop === value && now - tap.at <= TAP_WINDOW_MS;
    if (was.stop !== value) armed.current = null;
    const plan = planThermometer({
      was: { stop: was.stop, reading: was.reading },
      now: { stop: value, reading },
      tapped,
      still,
      level: sent.current.level,
      cells: sent.current.cells,
      flip: flip.current,
      travel,
      at: now,
    });
    const timing = (v: Animated.Value, toValue: number, duration: number, easing = EASE.land) =>
      Animated.timing(v, { toValue, duration, easing, useNativeDriver: true });

    // the column: glided to a new reading, set when still — and left alone by a flip
    if (plan.level !== null) {
      glide.current?.stop();
      glide.current = null;
      sent.current.level = plan.level.to;
      if (plan.level.animate) {
        glide.current = timing(level, plan.level.to, plan.level.duration, EASE.glide);
        glide.current.start();
      } else level.setValue(plan.level.to);
    }

    // the scale read: the rows' ink and the pair's chip
    if (plan.side !== null) {
      turn.current?.stop();
      turn.current = null;
      if (plan.side.animate) {
        flip.current = {
          from: plan.side.from,
          to: value,
          startedAt: now,
          duration: plan.side.duration,
        };
        turn.current = timing(side, plan.side.to, plan.side.duration);
        turn.current.start();
      } else {
        flip.current = null;
        side.setValue(plan.side.to);
      }
    }

    // the tag's digits: rolled for the parent's own flip, set for everything else
    rollId.current += 1;
    roll.current?.stop();
    roll.current = null;
    sent.current.cells = plan.wheels;
    if (!plan.roll) {
      wheels.forEach((w, i) => w.setValue(plan.wheels[i] ?? restCell(0)));
      lit.forEach((l, i) => l.setValue(plan.lit[i] ?? 1));
      shift.setValue(plan.shift);
      return;
    }
    // a wheel runs a little past its place and clicks back (`WHEEL_CLICK`); one that stays, stays
    const click = (v: Animated.Value, toValue: number, past: number, duration: number) =>
      past === 0
        ? timing(v, toValue, duration)
        : Animated.sequence([
            timing(v, toValue + past, Math.max(0, duration - WHEEL_CLICK.ms)),
            timing(v, toValue, WHEEL_CLICK.ms),
          ]);
    const mine = rollId.current;
    roll.current = Animated.parallel([
      timing(shift, plan.shift, plan.duration),
      ...wheels.map((w, i) =>
        click(
          w,
          plan.wheels[i] ?? restCell(0),
          plan.clicks[i] ?? 0,
          plan.wheelMs[i] ?? plan.duration,
        ),
      ),
      ...lit.map((l, i) => timing(l, plan.lit[i] ?? 1, plan.wheelMs[i] ?? plan.duration)),
    ]);
    roll.current.start(({ finished }) => {
      if (!finished || rollId.current !== mine) return;
      // back to the middle copy of each wheel: the same digit, so not a pixel moves, and the next
      // roll has a whole copy of room either way
      const rest = plan.wheels.map(c => restCell(digitAt(c)));
      wheels.forEach((w, i) => w.setValue(rest[i] ?? restCell(0)));
      sent.current.cells = rest;
    });
  }, [level, side, shift, wheels, lit, value, reading, still, travel]);

  // the picture going away stops whatever is still running
  useEffect(
    () => () => {
      glide.current?.stop();
      turn.current?.stop();
      roll.current?.stop();
    },
    [],
  );

  // built once per geometry: every layer is a view of the same few values
  const anim = useMemo(() => {
    const f = thermometerFrames(g);
    // copies, because `interpolate` is typed for mutable arrays and the frames are frozen data
    const num = (v: Animated.Value, fr: Frame) =>
      v.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: [...fr.outputRange],
        extrapolate: fr.extrapolate,
      });
    const fade = (fr: Frame): AnimatedStyle => ({ opacity: num(side, fr) });
    const column: AnimatedStyle = { transform: [{ translateX: num(level, f.columnX) }] };
    const tag: AnimatedStyle = { transform: [{ translateX: num(level, f.tagX) }] };
    const digits: AnimatedStyle = {
      transform: [{ translateX: Animated.multiply(shift, g.tag.slot) }],
    };
    const chip: AnimatedStyle = { transform: [{ translateX: num(side, f.chipX) }] };
    const turnTo = (v: Animated.Value): AnimatedStyle => ({
      transform: [{ translateY: Animated.multiply(v, -g.tag.cell) }],
    });
    const drawn: AnimatedStyle[] = lit.map(l => ({ opacity: l }));
    return {
      column,
      tag,
      digits,
      chip,
      bold: { f: fade(f.bold.f), c: fade(f.bold.c) },
      quiet: { f: fade(f.quiet.f), c: fade(f.quiet.c) },
      digit: wheels.map(turnTo),
      drawn,
    };
  }, [g, level, side, shift, wheels, lit]);

  const choose = (scale: TempUnit) => {
    const current = scale === value;
    // felt as the pills it replaces were (`feedback/choice.ts`): a tap for the other scale, and
    // nothing — and no report — for the one already chosen
    feelChoice({ locked: false, current, kind: 'tap' });
    if (current) return;
    // this scale arriving back as `value` is the parent's own flip, and rolls (`TAP_WINDOW_MS`)
    armed.current = { stop: scale, at: Date.now() };
    onChange(scale);
  };

  const { bulb, bore, tag, type } = g;
  // a number or a symbol in the mono face: the scale that is read in the full ink and the bold
  // face, the other quiet and regular. CLIPPED, never ellipsized: a character a hair wider than its
  // box must lose a sliver of side bearing, not turn into "…" (`GLYPH_ROOM` has the story)
  const print = (text: string, read: boolean, size: number, line: number, color: string) => (
    <AppText
      variant={read ? 'statValue' : 'body'}
      numeric
      color={color}
      align="center"
      numberOfLines={1}
      ellipsizeMode="clip"
      allowFontScaling={false}
      style={{ fontSize: size, lineHeight: line, letterSpacing: 0 }}
    >
      {text}
    </AppText>
  );
  // one row, in one of its two inks; each box a character wider either side than its text, so no
  // face that draws a digit a hair wider than the app's can cut it short
  const row = (scale: ScaleStop, read: boolean) => (
    <Animated.View
      key={`${scale}.${read ? 'read' : 'quiet'}`}
      style={[StyleSheet.absoluteFill, read ? anim.bold[scale] : anim.quiet[scale]]}
    >
      {[g.symbol[scale], ...g.labels[scale]].map((p: Printed, i) => (
        <View
          key={i}
          style={[
            styles.cell,
            {
              position: 'absolute',
              left: p.left - type.slot,
              width: p.width + 2 * type.slot,
              top: g.row[scale].top,
              height: type.line,
            },
          ]}
        >
          {print(p.text, read, type.size, type.line, read ? pic.ink : pic.quiet)}
        </View>
      ))}
    </Animated.View>
  );
  // one of the tag's characters: its cell a mono advance wide, and its text in a box a character
  // wider either side of it (`glyphBox`), so no digit is ever cut to an ellipsis — the dotted line
  // the owner saw in the tag was every digit drawn as "…" in a box exactly as wide as the digit
  const box = glyphBox(tag.slot);
  const tagGlyph = (text: string, key?: number) => (
    <View key={key} style={{ width: tag.slot, height: tag.cell }}>
      <View
        style={[styles.cell, styles.glyph, { left: box.left, width: box.width, height: tag.cell }]}
      >
        {print(text, true, tag.size, tag.cell, pic.ink)}
      </View>
    </View>
  );
  const wheel = (i: number) => (
    <Animated.View
      key={i}
      style={[{ width: tag.slot, height: tag.cell }, styles.window, anim.drawn[i]]}
    >
      <Animated.View style={anim.digit[i]}>
        {DIGIT_CELLS.map((d, k) => tagGlyph(d, k))}
      </Animated.View>
    </Animated.View>
  );
  // the pair's words: the segmented control's own type and inks, capped as chrome is
  const word = (scale: ScaleStop, read: boolean) => (
    <AppText
      variant={read ? 'bodyStrong' : 'bodySm'}
      color={read ? t.color.text : t.color.text2}
      align="center"
      numberOfLines={1}
      maxFontSizeMultiplier={CHROME_FONT_CAP}
      style={{ fontSize: t.type.bodySm.fontSize, lineHeight: t.type.bodySm.lineHeight }}
    >
      {labels[scale]}
    </AppText>
  );
  const { track, chip } = g.pair;

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={onLayout}
      style={[styles.root, { height: THERMOMETER_SIZE.height }, style]}
      {...(testID ? { testID } : {})}
    >
      <View style={[styles.box, { width: room > 0 ? g.width : '100%', height: g.height }]}>
        <View style={styles.glass}>
          {room > 0 ? (
            <View
              pointerEvents="none"
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              // dimmed as ONE picture when disabled, not layer by layer through each other
              needsOffscreenAlphaCompositing={disabled}
              style={[StyleSheet.absoluteFill, { opacity: disabled ? 0.5 : 1 }]}
            >
              <View style={[styles.track, { borderRadius: t.radius.pill }]}>
                {/* the glass, both scales' graduations, and the empty bore */}
                <Svg width={g.glass} height={g.height} style={StyleSheet.absoluteFill}>
                  <Defs>
                    <SvgLinearGradient
                      id={`${id}-glass`}
                      gradientUnits="userSpaceOnUse"
                      x1={0}
                      y1={0}
                      x2={0}
                      y2={g.height}
                    >
                      <Stop offset="0" stopColor={pic.glass[0]} />
                      <Stop offset="1" stopColor={pic.glass[1]} />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect x={0} y={0} width={g.glass} height={g.height} fill={`url(#${id}-glass)`} />
                  {/* °F grows up from the bore's top edge, °C down from its bottom edge */}
                  {g.ticks.f.map(tick => (
                    <Line
                      key={`f${tick.value}`}
                      x1={tick.x}
                      x2={tick.x}
                      y1={bore.top - GLASS.tickGap - tick.length}
                      y2={bore.top - GLASS.tickGap}
                      stroke={pic.tick}
                      strokeWidth={1}
                    />
                  ))}
                  {g.ticks.c.map(tick => (
                    <Line
                      key={`c${tick.value}`}
                      x1={tick.x}
                      x2={tick.x}
                      y1={bore.top + bore.height + GLASS.tickGap}
                      y2={bore.top + bore.height + GLASS.tickGap + tick.length}
                      stroke={pic.tick}
                      strokeWidth={1}
                    />
                  ))}
                  <Rect
                    x={bore.left}
                    y={bore.top}
                    width={bore.right - bore.left}
                    height={bore.height}
                    rx={bore.height / 2}
                    fill={pic.bore}
                  />
                </Svg>

                {/* the column, drawn reaching the end of the printed run and slid back under the
                    bulb: a transform, so a glide runs on the native driver */}
                <View
                  style={[
                    styles.clip,
                    {
                      left: bore.left,
                      top: bore.top,
                      width: bore.right - bore.left,
                      height: bore.height,
                    },
                  ]}
                >
                  <Animated.View
                    style={[
                      {
                        width: g.run.to - bore.left,
                        height: bore.height,
                        backgroundColor: pic.mercury[1],
                        borderTopRightRadius: bore.height / 2,
                        borderBottomRightRadius: bore.height / 2,
                      },
                      anim.column,
                    ]}
                  />
                </View>
                {/* the bulb, over the column's hidden end */}
                <Svg
                  width={2 * bulb.r}
                  height={2 * bulb.r}
                  style={{ position: 'absolute', left: bulb.cx - bulb.r, top: bulb.cy - bulb.r }}
                >
                  {pic.highlight ? (
                    <Defs>
                      <RadialGradient
                        id={`${id}-bulb`}
                        gradientUnits="userSpaceOnUse"
                        cx={2 * bulb.r * SUN_HIGHLIGHT.cx}
                        cy={2 * bulb.r * SUN_HIGHLIGHT.cy}
                        r={2 * bulb.r * SUN_HIGHLIGHT.r}
                        fx={2 * bulb.r * SUN_HIGHLIGHT.cx}
                        fy={2 * bulb.r * SUN_HIGHLIGHT.cy}
                      >
                        <Stop offset="0" stopColor={pic.mercury[0]} />
                        <Stop offset="1" stopColor={pic.mercury[1]} />
                      </RadialGradient>
                    </Defs>
                  ) : null}
                  <Circle
                    cx={bulb.r}
                    cy={bulb.r}
                    r={bulb.r}
                    fill={pic.highlight ? `url(#${id}-bulb)` : pic.mercury[1]}
                  />
                </Svg>

                {/* the two scales' numbers and symbols, each row in both of its inks, the scale
                    that is read shown in one and the other in the other */}
                {SCALE_STOPS.flatMap(scale => [row(scale, false), row(scale, true)])}

                {/* the tag, riding the column's tip: whole-number wheels, the point, the tenths */}
                <Animated.View
                  style={[
                    styles.tag,
                    {
                      top: tag.top,
                      width: tag.width,
                      height: tag.height,
                      borderRadius: tag.height / 2,
                      backgroundColor: pic.tag,
                      // the column's own color: the tag is the reading's end, not a capsule after it
                      borderColor: pic.tagEdge,
                    },
                    anim.tag,
                  ]}
                >
                  <Animated.View
                    style={[styles.digits, { left: tag.digits, height: tag.cell }, anim.digits]}
                  >
                    {Array.from({ length: ODOMETER.ints }, (_, i) => wheel(i))}
                    {tagGlyph('.')}
                    {Array.from({ length: ODOMETER.fracs }, (_, i) => wheel(ODOMETER.ints + i))}
                  </Animated.View>
                </Animated.View>
              </View>
              {/* the rim, drawn OVER the glass: on Android a border is part of the view's own
                  background and the layers inside would paint straight over it */}
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { borderRadius: t.radius.pill, borderWidth: g.rim, borderColor: t.color.line2 },
                ]}
              />
            </View>
          ) : null}
        </View>

        {/* the pair: the segmented control's track and chip, and one radio per scale over them */}
        <View style={[styles.pair, { width: 2 * THERMOMETER_SIZE.cell, height: g.height }]}>
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            needsOffscreenAlphaCompositing={disabled}
            style={[StyleSheet.absoluteFill, { opacity: disabled ? 0.5 : 1 }]}
          >
            <View
              style={[
                styles.pairTrack,
                {
                  top: track.top,
                  width: track.width,
                  height: track.height,
                  borderRadius: t.radius.pill,
                  backgroundColor: t.color.surface2,
                  borderColor: t.color.line,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.chip,
                {
                  left: chip.left,
                  top: track.top + chip.top,
                  width: chip.width,
                  height: chip.height,
                  borderRadius: t.radius.pill,
                  backgroundColor: t.color.surfaceSolid,
                  borderColor: t.color.line,
                },
                anim.chip,
              ]}
            />
            {SCALE_STOPS.map(scale => (
              <View
                key={scale}
                style={{
                  position: 'absolute',
                  left: chip.left + scaleIndex(scale) * chip.travel,
                  top: track.top + chip.top,
                  width: chip.width,
                  height: chip.height,
                }}
              >
                <Animated.View style={[StyleSheet.absoluteFill, styles.cell, anim.quiet[scale]]}>
                  {word(scale, false)}
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, styles.cell, anim.bold[scale]]}>
                  {word(scale, true)}
                </Animated.View>
              </View>
            ))}
          </View>
          <View style={[StyleSheet.absoluteFill, styles.zones]}>
            {SCALE_STOPS.map(scale => (
              <Pressable
                key={scale}
                accessibilityRole="radio"
                accessibilityLabel={labels[scale]}
                accessibilityState={{
                  checked: scale === value,
                  selected: scale === value,
                  disabled,
                }}
                disabled={disabled}
                onPress={() => choose(scale)}
                style={styles.zone}
                {...(testID ? { testID: `${testID}.${scale}` } : {})}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // the room is measured on the root; the row stops growing past `maxWidth` and is centered
  root: { alignSelf: 'stretch' },
  box: { alignSelf: 'center', flexDirection: 'row' },
  glass: { flex: 1 },
  track: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  clip: { position: 'absolute', overflow: 'hidden' },
  window: { overflow: 'hidden' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  glyph: { position: 'absolute', top: 0 },
  tag: { position: 'absolute', left: 0, borderWidth: 1 },
  digits: { position: 'absolute', top: 0, flexDirection: 'row' },
  pair: { marginLeft: THERMOMETER_SIZE.gap },
  pairTrack: { position: 'absolute', left: 0, borderWidth: 1 },
  chip: { position: 'absolute', borderWidth: 1 },
  zones: { flexDirection: 'row' },
  zone: { flex: 1 },
});
