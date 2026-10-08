/**
 * GrowthRuler and GrowthScale — the growth sheet's length on a tape and its weight on a dial
 * (`growthGauge.ts` has the numbers, the colors and the reasons; the owner's delight list,
 * 2026-09-26). Each draws the parent's number and nothing else: graduations from zero, a few
 * numbers, the unit the sheet shows, and a marker or a needle in the page's own ink.
 *
 * FRAME BY FRAME.
 *   Ruler — it appears with the length's switch: the marker slides from zero to the length on an
 *   ease-out, 280 ms for a short one up to 700 ms for the whole tape; each step of the stepper
 *   glides it on from wherever it is (160–420 ms).
 *   Scale — it appears with the weight's switch: the needle swings up from zero, passes the weight
 *   by about a sixth of the swing and settles on it inside half a second; each step swings it again
 *   from where it stands. A weight past the end pins the needle at the stop.
 *
 * DECORATION, ATTACHED TO THE VALUE. They read the number the sheet holds, never the stepper that
 * sets it, so whatever control writes the number drives the picture. Hidden from assistive
 * technology and from touch: the stepper is the control and already says its number. Reduce motion
 * and the amber Night draw the reading where it is and move nothing. Transforms only, on the
 * native driver; the marks are drawn once per width.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import {
  DIAL,
  dialBearing,
  dialFacePath,
  dialMarks,
  dialNumbers,
  dialPoint,
  GAUGE_MOTION,
  gaugeColors,
  gaugeStill,
  markerArriveMs,
  markerCapPath,
  markerGlideMs,
  NEEDLE_SPRING,
  TAPE,
  RULER_SCALE,
  tapeMarks,
  rulerNumbers,
  rulerX,
  type DialUnit,
  type RulerUnit,
} from './growthGauge';
import { AppText } from './Text';

const EASE = Easing.bezier(...GAUGE_MOTION.ease);

/** What both pictures are to everything but the eye: nothing — the stepper is the control. */
const hidden = {
  pointerEvents: 'none',
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/* ------------------------------------------------------------------------------ the ruler */

export interface GrowthRulerProps {
  /** The length, in `unit`: the sheet's own number. */
  value: number;
  unit: RulerUnit;
  /** The unit as the sheet writes it ("cm", "in"). */
  unitLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function GrowthRuler({ value, unit, unitLabel, style, testID }: GrowthRulerProps) {
  const t = useTheme();
  const still = gaugeStill(t.reduceMotion, t.theme);
  const c = gaugeColors(t.color, t.theme);
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  // the marker's place, in points; it waits at zero until the tape is measured, then slides in
  const [x] = useState(() => new Animated.Value(TAPE.inset));
  const arrived = useRef(false);
  const run = useRef<Animated.CompositeAnimation | null>(null);
  const to = width > 0 ? rulerX(value, unit, width) : TAPE.inset;
  const at = useRef<number>(TAPE.inset);

  useEffect(() => {
    if (width === 0) return;
    run.current?.stop();
    run.current = null;
    const from = at.current;
    at.current = to;
    if (still) {
      x.setValue(to);
      arrived.current = true;
      return;
    }
    const duration = arrived.current
      ? markerGlideMs(to - from)
      : markerArriveMs(value / RULER_SCALE[unit].max);
    arrived.current = true;
    run.current = Animated.timing(x, {
      toValue: to,
      duration,
      easing: EASE,
      useNativeDriver: true,
    });
    run.current.start();
  }, [to, width, still, value, unit, x]);

  useEffect(() => () => run.current?.stop(), []);

  const marks = useMemo(() => (width > 0 ? tapeMarks(unit, width) : []), [unit, width]);
  const numbers = useMemo(() => (width > 0 ? rulerNumbers(unit, width) : []), [unit, width]);
  const tapeBottom = TAPE.tapeTop + TAPE.tapeHeight;

  return (
    <View
      {...hidden}
      onLayout={onLayout}
      style={[{ height: TAPE.height }, style]}
      {...(testID === undefined ? {} : { testID })}
    >
      {width > 0 ? (
        <>
          <Svg width={width} height={TAPE.height} style={StyleSheet.absoluteFill}>
            <Rect
              x={TAPE.edge}
              y={TAPE.tapeTop}
              width={width - 2 * TAPE.edge}
              height={TAPE.tapeHeight}
              rx={t.radius.s / 2}
              fill={c.fill}
              stroke={c.rim}
              strokeWidth={TAPE.rim}
            />
            {marks.map(m => (
              <Line
                key={m.value}
                x1={m.x}
                y1={TAPE.tapeTop}
                x2={m.x}
                y2={TAPE.tapeTop + (m.long ? TAPE.majorTick : TAPE.minorTick)}
                stroke={c.tick}
                strokeWidth={1}
              />
            ))}
          </Svg>
          {numbers.map(m => (
            <AppText
              key={m.value}
              variant="meta"
              numeric
              color={c.number}
              align="center"
              maxFontSizeMultiplier={TAPE.numberGrow}
              style={[
                styles.number,
                {
                  left: m.x - TAPE.numberBox / 2,
                  top: TAPE.numberTop,
                  width: TAPE.numberBox,
                  fontSize: TAPE.numberSize,
                  lineHeight: TAPE.numberHeight,
                },
              ]}
            >
              {String(m.value)}
            </AppText>
          ))}
          {/* the unit, written once, beside the zero — where a tape prints it */}
          <AppText
            variant="meta"
            color={c.number}
            maxFontSizeMultiplier={TAPE.numberGrow}
            style={[
              styles.number,
              {
                left: rulerX(0, unit, width) + 7,
                top: TAPE.numberTop,
                fontSize: TAPE.numberSize,
                lineHeight: TAPE.numberHeight,
              },
            ]}
          >
            {unitLabel}
          </AppText>
          {/* THE MARKER: a cap above the tape and a line across it, at the length */}
          <Animated.View
            style={[styles.marker, { height: tapeBottom, transform: [{ translateX: x }] }]}
          >
            <Svg width={TAPE.cap * 2} height={tapeBottom} style={styles.markerArt}>
              <Path d={markerCapPath()} fill={c.pointer} />
              <Line
                x1={TAPE.cap}
                y1={TAPE.tapeTop}
                x2={TAPE.cap}
                y2={tapeBottom - 1}
                stroke={c.pointer}
                strokeWidth={TAPE.marker}
              />
            </Svg>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------------------ the scale */

export interface GrowthScaleProps {
  /** The weight, in `unit` — pounds and ounces as pounds (7 lb 4 oz is 7.25). */
  value: number;
  unit: DialUnit;
  /** The unit as the sheet writes it ("kg", "lb"). */
  unitLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function GrowthScale({ value, unit, unitLabel, style, testID }: GrowthScaleProps) {
  const t = useTheme();
  const still = gaugeStill(t.reduceMotion, t.theme);
  const c = gaugeColors(t.color, t.theme);
  const bearing = dialBearing(value, unit);

  // at zero, where a scale's needle rests, until it swings to the weight; at the weight when still
  const [angle] = useState(() => new Animated.Value(still ? bearing : -DIAL.half));
  const run = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    run.current?.stop();
    run.current = null;
    if (still) {
      angle.setValue(bearing);
      return;
    }
    run.current = Animated.spring(angle, {
      toValue: bearing,
      ...NEEDLE_SPRING,
      restDisplacementThreshold: 0.05,
      restSpeedThreshold: 0.05,
      useNativeDriver: true,
    });
    run.current.start();
  }, [bearing, still, angle]);

  useEffect(() => () => run.current?.stop(), []);

  // the stops: a swing past either end meets the end, as a needle meets its pin
  const rotate = useMemo(
    () =>
      angle.interpolate({
        inputRange: [-DIAL.half, DIAL.half],
        outputRange: [`${-DIAL.half}deg`, `${DIAL.half}deg`],
        extrapolate: 'clamp',
      }),
    [angle],
  );

  const marks = useMemo(() => dialMarks(unit), [unit]);
  const numbers = useMemo(() => dialNumbers(unit), [unit]);
  const box = DIAL.needle * 2;

  return (
    <View
      {...hidden}
      style={[styles.dialWrap, style]}
      {...(testID === undefined ? {} : { testID })}
    >
      <View style={{ width: DIAL.width, height: DIAL.height }}>
        <Svg width={DIAL.width} height={DIAL.height} style={StyleSheet.absoluteFill}>
          <Path d={dialFacePath()} fill={c.fill} stroke={c.rim} strokeWidth={DIAL.rim} />
          {marks.map(m => {
            const a = dialPoint(m.bearing, DIAL.r);
            const b = dialPoint(m.bearing, DIAL.r - (m.long ? DIAL.majorTick : DIAL.minorTick));
            return (
              <Line
                key={m.value}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={c.tick}
                strokeWidth={m.long ? 1.5 : 1}
              />
            );
          })}
        </Svg>
        {numbers.map(m => {
          const p = dialPoint(m.bearing, DIAL.numberR);
          return (
            <AppText
              key={m.value}
              variant="meta"
              numeric
              color={c.number}
              align="center"
              maxFontSizeMultiplier={DIAL.numberGrow}
              style={[
                styles.number,
                {
                  left: p.x - DIAL.numberBox / 2,
                  top: p.y - DIAL.numberHeight / 2,
                  width: DIAL.numberBox,
                  fontSize: DIAL.numberSize,
                  lineHeight: DIAL.numberHeight,
                },
              ]}
            >
              {String(m.value)}
            </AppText>
          );
        })}
        {/* the unit, where a scale prints it: in the middle of the face, above the pivot */}
        <AppText
          variant="meta"
          color={c.number}
          align="center"
          maxFontSizeMultiplier={DIAL.numberGrow}
          style={[
            styles.number,
            {
              left: DIAL.px - DIAL.numberBox / 2,
              top: DIAL.py - 26,
              width: DIAL.numberBox,
              fontSize: DIAL.numberSize,
              lineHeight: DIAL.numberHeight,
            },
          ]}
        >
          {unitLabel}
        </AppText>
        {/* THE NEEDLE: drawn pointing straight up in a box centered on the pivot, and turned */}
        <Animated.View
          style={[
            styles.needle,
            {
              left: DIAL.px - DIAL.needle,
              top: DIAL.py - DIAL.needle,
              width: box,
              height: box,
              transform: [{ rotate }],
            },
          ]}
        >
          <Svg width={box} height={box}>
            <Line
              x1={DIAL.needle}
              y1={DIAL.needle}
              x2={DIAL.needle}
              y2={0}
              stroke={c.pointer}
              strokeWidth={DIAL.stroke}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
        <Svg width={DIAL.width} height={DIAL.height} style={StyleSheet.absoluteFill}>
          <Circle cx={DIAL.px} cy={DIAL.py} r={DIAL.hub} fill={c.pointer} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  number: { position: 'absolute' },
  marker: { position: 'absolute', left: -TAPE.cap, top: 0, width: TAPE.cap * 2 },
  markerArt: { position: 'absolute', left: 0, top: 0 },
  dialWrap: { alignItems: 'center' },
  needle: { position: 'absolute' },
});
