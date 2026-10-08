/**
 * RoundStepper (docs/DESIGN_SYSTEM.md §15.2, §16.4): a stepper that is not a box — a pill body
 * with two circular −/+ and a 21 pt mono value — so two of them share a row (`TwoUp`) for paired
 * quantities: left/right output, left/right minutes. The large NumberStepper stays the single
 * primary number on a sheet; this one is for a pair or a secondary number that does not deserve
 * a full row. The circles are 38 pt and drop to 34 below 360 wide so the pair still fits, and
 * reach 44 through hitSlop either way. `RCap` is the small-caps caption above one with a color
 * dot to tell the pair apart — the WORD tells them apart, the dot only helps (§12 rule 7).
 * (`SumPill`, the pair's total as a pill, was drawn by no sheet and went on 2026-09-26.)
 *
 * The hold and the typed number are NumberStepper's, shared rather than copied (2026-09-25):
 * `useStepFire` steps from the number the stepper last set and feels each step as a soft tick
 * (the owner's "a soft tick per stepper step", the same day), `useStepRepeat` runs the hold on
 * `createStepRepeater`, and `typeable` turns the value into a button that opens `StepperEntry`'s
 * dialog — the left and right minutes of a feed typed as exactly as a sleep's length.
 *
 * AND EVERY ROUND NUMBER CAN BE TYPED (2026-09-26, the owner: *"users must be able to enter only
 * numerical value … when they click the number"*): `typeable` is on unless it is `false`, as it is
 * on NumberStepper (`typedEntryFor`), so a pump's left and right ounces are typed as 2.25 the way
 * a feed's minutes are. The pair stays a pair: a ruler needs the whole width, and two of them would
 * stand a pair of numbers one above the other.
 *
 * THE NUMBER HAS ITS ROOM, AND IS NEVER SHRUNK (2026-10-06). It used to fit itself to whatever room
 * was left (`adjustsFontSizeToFit`, 2026-09-26), and on Android that shrinking, re-run on every
 * change, blanked the number the moment − or + was tapped — a breastfeed side's minutes, the pump
 * page's bottle — while the totals beside it kept moving (the owner's report, 2026-10-06). The box
 * now reserves the widest number its range can show (`room`, below), so there is nothing to shrink.
 *
 * A TYPEABLE NUMBER STANDS IN THE TYPED BOX, and a length of an hour and more reads "1h 20m" (the
 * owner, 2026-09-26; `StepReadout`, which both steppers share): the dotted underline is gone, and a
 * breastfeed side of 80 minutes reads as an hour and twenty, still typed as 80. The box is the whole
 * room between the circles.
 *
 * ONE CONTROL OF THREE SHAPES OF ONE HEIGHT (the owner, 2026-09-30, over the pump's pair: *"Did the
 * grey highlight box look okay to you? And the icon plus and minus is not exactly on the aligned in
 * the middle of the border. This is very bad and need fixing."*). The row was a white pill with a
 * shadow round two circles and a small gray box of its own height: three shapes, three heights, and
 * a text "−" and "+" a point or two off their circles' centers. Now the circles' marks are drawn
 * (`StepGlyph`) and the box is a pill exactly as tall as the circles, on their axis, the number
 * centered in it (`stepperBoxShape`). The white pill round them is gone: its fill and its lift made
 * a second container round the first, and the three shapes are the control.
 */
import { Children, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useStepFire, useStepRepeat } from './NumberStepper';
import { StepGlyph } from './StepGlyph';
import { readoutRow, StepReadout, typedBoxStyle } from './StepReadout';
import {
  canStep,
  decimalsOfStep,
  LONG_PRESS_MS,
  readoutKind,
  spokenReadout,
  stepperBoxShape,
  stepReadout,
  typedA11yHint,
  typedBoxExtra,
  typedEntryFor,
  widestReadoutWidth,
} from './stepperMath';
import { useTypedEntry, type TypedEntry } from './StepperEntry';
import { AppText, Label } from './Text';

export interface RoundStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** The grid: a typed number lands on it, and it sets the places shown. */
  step: number;
  /**
   * How far one tap of − or + moves the number (and one swipe of a screen reader); `step` when
   * absent. A pump's pair taps by the half ounce while its number is typed to the quarter
   * (`volumeTapStep`, 2026-09-26).
   */
  tapStep?: number;
  min: number;
  max: number;
  unitLabel: string;
  /** Display precision; defaults to what the step needs (0.5 → 1). */
  decimals?: number;
  /** The caption above, drawn by the stepper so it and the control are one block. */
  caption?: string;
  /** The dot beside the caption; the caption's word carries the meaning, the dot repeats it. */
  dotColor?: string;
  accessibilityLabel: string;
  /** How the number is typed (NumberStepper's `typeable`): absent, on by default; `false`, off. */
  typeable?: TypedEntry | false;
  /**
   * THE PUMP'S SIZES (the owner's pumping redesign, 2026-10-05): the circles' diameter and the
   * number's size, for the one amount a form is about (`valueSize` 27) or a compact secondary
   * one (`circle` 30). Absent, the pair's own 38 / 21 as ever.
   */
  circle?: number;
  valueSize?: number;
  /**
   * The number without the typed box's fill round it: still a button that opens the dialog, on a
   * panel that is already the control's ground (the pump's amount panel).
   */
  bare?: boolean;
  /**
   * The typed box's own ground, for a stepper on a tinted strip where the box should read as the
   * one white field on it (Add stored milk's amount, 2026-10-05). Absent, the typed box's own fill.
   */
  boxColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Below this window width the circles drop from 38 to 34 (§15.2). */
export const ROUND_STEPPER_NARROW_PX = 360;
export const ROUND_STEPPER = { circle: 38, narrow: 34, value: 21 } as const;
const UNIT_SIZE = 11;
const DOT = 7;

export function RoundStepper({
  value,
  onChange,
  step,
  tapStep,
  min,
  max,
  unitLabel,
  decimals,
  caption,
  dotColor,
  accessibilityLabel,
  typeable,
  circle: circleSize,
  valueSize = ROUND_STEPPER.value,
  bare = false,
  boxColor,
  disabled = false,
  style,
  testID,
}: RoundStepperProps) {
  const t = useTheme();
  const win = useWindowDimensions();
  const circle =
    circleSize ??
    (win.width < ROUND_STEPPER_NARROW_PX ? ROUND_STEPPER.narrow : ROUND_STEPPER.circle);
  const places = decimals ?? decimalsOfStep(step);
  const tap = tapStep ?? step;
  const fire = useStepFire({ value, min, max, places, disabled, onChange });
  const repeat = useStepRepeat(fire);
  const typed = typedEntryFor({ typeable, caption, accessibilityLabel, unitLabel });
  const entry = useTypedEntry({
    entry: typed,
    value,
    min,
    max,
    decimals: places,
    unitLabel,
    disabled,
    onChange,
    step,
    ...(testID ? { testID } : {}),
  });
  const kind = readoutKind(typed, unitLabel);
  const readout = stepReadout(value, places, unitLabel, kind);
  const spoken = spokenReadout(readout, kind);
  // THE ROOM BETWEEN THE CIRCLES IS RESERVED, AND NOTHING IN IT SHRINKS (2026-10-06, the owner's
  // regression screenshots and the two rounds after them). The box was `flex: 1` — a basis of 0 —
  // and in the content-sized rows most callers put it in, Yoga gave it no width at all; then, with a
  // flex basis and a shrinking number, the number drew at rest and vanished on Android the moment −
  // or + changed it. It is now exactly what the compact `NumberStepper` is, the stepper whose number
  // has never vanished: a `minWidth` of the widest number the range can show, scaled with the text,
  // and a number that never shrinks.
  const room =
    Math.ceil(
      widestReadoutWidth(min, max, places, unitLabel, kind, valueSize) * t.fontScale.chrome,
    ) + (bare ? 0 : typedBoxExtra());
  // what a double tap does, when the number can be typed
  const typeHint = entry.open && typed ? typedA11yHint(typed.kind) : null;
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') fire(tap);
    else if (e.nativeEvent.actionName === 'decrement') fire(-tap);
    else if (e.nativeEvent.actionName === 'activate') entry.open?.();
  };
  const number = (
    <StepReadout
      readout={readout}
      size={valueSize}
      variant="statValue"
      unit={u => (
        <AppText
          variant="meta"
          ink="text2"
          style={{
            fontSize: valueSize > ROUND_STEPPER.value ? Math.round(valueSize * 0.6) : UNIT_SIZE,
          }}
        >
          {u}
        </AppText>
      )}
      {...(testID ? { testID: `${testID}-value` } : {})}
    />
  );
  return (
    <View style={style} {...(testID ? { testID } : {})}>
      {caption ? (
        <RCap {...(dotColor ? { dotColor } : {})} style={{ marginBottom: t.space.sm }}>
          {caption}
        </RCap>
      ) : null}
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: spoken }}
        accessibilityState={{ disabled }}
        accessibilityActions={[
          { name: 'increment' },
          { name: 'decrement' },
          ...(typeHint ? [{ name: 'activate', label: typeHint }] : []),
        ]}
        {...(typeHint ? { accessibilityHint: typeHint } : {})}
        onAccessibilityAction={onAction}
        // the circles, the box and the circles, `space.xs` apart and all on one axis
        style={[styles.row, { gap: t.space.xs, opacity: disabled ? 0.5 : 1 }]}
      >
        <RoundButton
          kind="minus"
          size={circle}
          accessibilityLabel={`Decrease ${accessibilityLabel}`}
          enabled={!disabled && canStep(value, -tap, min, max)}
          onPress={() => fire(-tap)}
          onHold={() => repeat.start(-tap)}
          onRelease={repeat.stop}
          {...(testID ? { testID: `${testID}-decrement` } : {})}
        />
        {entry.open && typeHint ? (
          /* the number, as a button of its own, and the button IS the typed box: the whole room
             between the circles, as tall as they are and a pill (`stepperBoxShape`). Its slop
             reaches up and down only, to the 44 target, never sideways over a − or a +, which keep
             their own */
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${accessibilityLabel}, ${spoken}`}
            accessibilityHint={typeHint}
            onPress={entry.open}
            hitSlop={{ top: t.space.md, bottom: t.space.md }}
            style={({ pressed }) => [
              { minWidth: room },
              bare
                ? [styles.center, { minHeight: circle }]
                : typedBoxStyle(t, stepperBoxShape(circle)),
              !bare && boxColor !== undefined ? { backgroundColor: boxColor } : null,
              { opacity: pressed ? 0.6 : 1 },
            ]}
            {...(testID ? { testID: `${testID}-type` } : {})}
          >
            <View style={readoutRow(t.space.xs)}>{number}</View>
          </Pressable>
        ) : (
          <View style={[styles.center, { minWidth: room, minHeight: circle }]}>
            <View style={readoutRow(t.space.xs)}>{number}</View>
          </View>
        )}
        <RoundButton
          kind="plus"
          size={circle}
          accessibilityLabel={`Increase ${accessibilityLabel}`}
          enabled={!disabled && canStep(value, tap, min, max)}
          onPress={() => fire(tap)}
          onHold={() => repeat.start(tap)}
          onRelease={repeat.stop}
          {...(testID ? { testID: `${testID}-increment` } : {})}
        />
      </View>
      {entry.element}
    </View>
  );
}

function RoundButton({
  kind,
  size,
  accessibilityLabel,
  enabled,
  onPress,
  onHold,
  onRelease,
  testID,
}: {
  kind: 'minus' | 'plus';
  size: number;
  accessibilityLabel: string;
  enabled: boolean;
  onPress: () => void;
  onHold: () => void;
  onRelease: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const slop = Math.ceil(Math.max(0, (t.hit.min - size) / 2));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      onLongPress={onHold}
      delayLongPress={LONG_PRESS_MS}
      onPressOut={onRelease}
      hitSlop={slop}
      style={({ pressed }) => [
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: t.color.accentSoft,
          opacity: !enabled ? 0.4 : pressed ? 0.75 : 1,
          // the prototype scales the circle to .93 while pressed; a transform is motion
          transform: [{ scale: pressed && enabled && !t.reduceMotion ? 0.93 : 1 }],
        },
      ]}
      {...(testID ? { testID } : {})}
    >
      {/* DRAWN, at the circle's center by arithmetic (`StepGlyph`): a text "−" sat where its font
          put it, a point or two off */}
      <StepGlyph kind={kind} box={size} color={t.color.accent2} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------------- */

export interface TwoUpProps {
  /** Exactly the pair: two RoundSteppers, flex 1 each. */
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Two round steppers side by side, each taking half (§15.2 `.twoup`). */
export function TwoUp({ children, style, testID }: TwoUpProps) {
  const t = useTheme();
  return (
    <View style={[styles.twoUp, { gap: t.space.md }, style]} {...(testID ? { testID } : {})}>
      {Children.map(children, child => (child ? <View style={styles.half}>{child}</View> : null))}
    </View>
  );
}

export interface RCapProps {
  children: string;
  /** Defaults to the milk hue — the pair this was drawn for is pumped output. */
  dotColor?: string;
  style?: StyleProp<ViewStyle>;
}

/** The small-caps caption above a round stepper, with a dot to tell a pair apart (§15.2 `.rcap`). */
export function RCap({ children, dotColor, style }: RCapProps) {
  const t = useTheme();
  return (
    <View style={[styles.cap, { gap: t.space.sm }, style]}>
      <View
        style={{
          width: DOT,
          height: DOT,
          borderRadius: DOT / 2,
          backgroundColor: dotColor ?? t.color.milk,
        }}
      />
      <Label>{children}</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  twoUp: { flexDirection: 'row', alignItems: 'flex-end' },
  half: { flex: 1, minWidth: 0 },
  cap: { flexDirection: 'row', alignItems: 'center' },
});
