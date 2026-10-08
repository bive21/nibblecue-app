/**
 * RollingCount — a Quick tile's `3×`, which rolls like an odometer when it rises (the owner,
 * 2026-09-26, "agreed"). `countRoll.ts` holds every number and every rule, tested in node; this file
 * only hands them to two values:
 *
 *   - `useCountRoll` keeps what the chip SHOWS (the old number while a rise is held under a sheet),
 *     decides as it renders whether a change is a roll (`countStep`: a rise of the same scope, with
 *     nothing covering the tile, and motion allowed), and runs the roll and the tile's pulse;
 *   - `RollingCount` draws the chip's words: exactly the static `3×` it always drew while at rest,
 *     and while a roll plays the same glyphs split into wheels, each changed digit sliding up in a
 *     clip one line tall — the old one out of the top, the new one in from below.
 *
 * BOTH VALUES RIDE THE NATIVE DRIVER: the wheels are a translate and the pulse is a scale.
 *
 * NOTHING NEW TO A SCREEN READER. The tile is one button whose name already says "3 times today"
 * from the real count, so the wheels are glyphs inside it and nothing here is focusable.
 *
 * REDUCE MOTION AND THE AMBER NIGHT: the count simply changes, and the tile does not pulse — and a
 * caller that passes no options (the Quick Log grid, the appearance preview) is treated the same,
 * because a count there has no "before" worth playing.
 */
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import {
  columnTurns,
  COUNT_MARK,
  COUNT_PULSE_MS,
  COUNT_ROLL_EASE,
  COUNT_ROLL_MS,
  countAppearFrames,
  countColumns,
  countPulseFrames,
  countRollFrames,
  countSettled,
  countStart,
  countStep,
  type CountMove,
} from './countRoll';
import { Numeric } from './Text';
import { motionStill } from './tickDraw';

export interface CountRollOptions {
  /**
   * What the count is a count OF — the baby, the day, the rows it was read from. A change of scope
   * is never a roll: a child switch, a new day and a load landing simply show their number.
   */
  scope: string;
}

/**
 * SOMETHING COVERS THE TILES — a sheet, a popover: a rise waits, the chip still showing the old
 * number, until it lifts (`countStep`'s `hold`). A context rather than a prop so the app can say it
 * from a small wrapper round the row: a sheet opening re-renders the tiles that listen, and not the
 * whole page that holds them. Nothing covers them unless someone says so.
 */
export const CountHoldContext = createContext(false);

export interface CountRollState {
  /** The number the chip draws — the old one while a rise is held. */
  shown: number;
  /** The roll playing, or null at rest. */
  move: CountMove | null;
  /** The wheels' value, 0 → 1, for `RollingCount`. */
  wheels: Animated.Value;
  /** The tile's scale factor: 1 at rest, swelling to 1.04 and back with a roll. */
  pulse: Animated.AnimatedInterpolation<number>;
  /**
   * The chip's opacity while the day's FIRST entry rolls in (0 → 1): a tile with no count has no
   * chip, so the chip arrives with its wheel rather than sitting as a bare `×` through the roll's
   * delay. Null for every other roll, and at rest.
   */
  appear: Animated.AnimatedInterpolation<number> | null;
}

const ROLL_EASE = Easing.bezier(...COUNT_ROLL_EASE);
const PULSE = countPulseFrames();

export function useCountRoll(value: number, options?: CountRollOptions): CountRollState {
  const t = useTheme();
  const covered = useContext(CountHoldContext);
  const still = options === undefined || motionStill(t.reduceMotion, t.theme);
  const input = { value, scope: options?.scope ?? '', hold: covered, still };
  const [state, setState] = useState(() => countStart(input));
  // decided AS IT RENDERS (React's pattern for state that follows a prop): the frame that shows a
  // new number is already the roll's first, never a frame of the number sitting still first
  const next = countStep(state, input);
  if (next !== state) setState(next);

  const wheels = useRef(new Animated.Value(0)).current;
  const swell = useRef(new Animated.Value(0)).current;
  const move = next.move;
  /*
    A LAYOUT EFFECT: the values are set back to the start before the roll's first frame is drawn,
    or a second roll would open on the last one's end — the new digit already in place — for a
    frame. A new roll (a new `move`), reduce motion, or the tile going away stops the one in flight,
    and the pulse is put back at rest so no tile is left a little larger than its neighbors.
  */
  useLayoutEffect(() => {
    if (move === null) return undefined;
    wheels.setValue(0);
    swell.setValue(0);
    const run = Animated.parallel([
      Animated.timing(wheels, {
        toValue: 1,
        duration: COUNT_ROLL_MS,
        delay: move.delay,
        easing: ROLL_EASE,
        useNativeDriver: true,
      }),
      Animated.timing(swell, {
        toValue: 1,
        duration: COUNT_PULSE_MS,
        delay: move.delay,
        // the frames are the half sine; the clock under them runs straight
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]);
    run.start(({ finished }) => {
      if (finished) setState(s => countSettled(s, move.seq));
    });
    return () => {
      run.stop();
      swell.setValue(0);
    };
  }, [move, wheels, swell]);

  const pulse = useMemo(
    () =>
      swell.interpolate({
        inputRange: [...PULSE.scale.inputRange],
        outputRange: [...PULSE.scale.outputRange],
        extrapolate: 'clamp',
      }),
    [swell],
  );
  const first = move !== null && move.from <= 0;
  const appear = useMemo(() => {
    if (!first) return null;
    const f = countAppearFrames().opacity;
    return wheels.interpolate({
      inputRange: [...f.inputRange],
      outputRange: [...f.outputRange],
      extrapolate: 'clamp',
    });
  }, [first, wheels]);
  return { shown: next.shown, move, wheels, pulse, appear };
}

export interface RollingCountProps {
  /** The words at rest — `3×`, as the tile writes them. */
  text: string;
  /** The roll playing, or null: at rest the words are drawn exactly as they always were. */
  move: CountMove | null;
  wheels: Animated.Value;
  /** The chip's own text style (size, weight, line height): every glyph is drawn in it. */
  textStyle: StyleProp<TextStyle>;
  /** The chip's line height at the reader's type scale (`countLine`): the clip each wheel turns in. */
  line: number;
}

export function RollingCount({ text, move, wheels, textStyle, line }: RollingCountProps) {
  const slide = useMemo(() => {
    const f = countRollFrames(line).stack;
    return wheels.interpolate({
      inputRange: [...f.inputRange],
      outputRange: [...f.outputRange],
      extrapolate: 'clamp',
    });
  }, [wheels, line]);

  if (move === null) {
    return (
      <Numeric variant="meta" ink="text" style={textStyle}>
        {text}
      </Numeric>
    );
  }
  // one glyph in a box one line tall, so every glyph in the row — turning or not — sits on the
  // same line the static words did
  const glyph = (g: string) => (
    <View style={[styles.slot, { height: line }]}>
      <Numeric variant="meta" ink="text" style={textStyle}>
        {g}
      </Numeric>
    </View>
  );
  return (
    <View style={styles.row}>
      {countColumns(move.from, move.to).map((c, i) =>
        columnTurns(c) ? (
          <View key={i} style={[styles.wheel, { height: line }]}>
            <Animated.View style={{ transform: [{ translateY: slide }] }}>
              {glyph(c.from)}
              {glyph(c.to)}
            </Animated.View>
          </View>
        ) : (
          <View key={i}>{glyph(c.to)}</View>
        ),
      )}
      {glyph(COUNT_MARK)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // a wheel is clipped to one line: the digit leaving goes out of the top, the one arriving is
  // hidden below until it comes up
  wheel: { overflow: 'hidden' },
  slot: { justifyContent: 'center' },
});
