/**
 * NumberStepper (docs/DESIGN_SYSTEM.md §5, §15.2, §16.4; docs/MOBILE.md §4, §8): the single
 * primary number on a sheet — the amount in a bottle — and the biggest control on it. Two
 * 54 pt circles (`hit.primary`, `BIG_STEPPER`) with the − and + drawn in them, a 27 pt mono value
 * in the typed box between them, a pill exactly as tall as the circles, and the unit beside the
 * number in the `label` role: the round stepper's family, larger (2026-09-30, below). Long-press repeats at 120 ms and speeds up to
 * 60 ms after eight steps (`createStepRepeater` in stepperMath), so a range is crossed without a
 * hundred taps. The hold fires its FIRST step the moment the long-press is recognised: Pressable
 * suppresses `onPress` once `onLongPress` has fired, so a hold that waited for the first timer
 * tick would step zero times when released inside that window. Display precision defaults to
 * what the step needs (`decimalsOfStep`: 0.5 → one place) — the same rule as RoundStepper — so a
 * caller that passes the unit's step never gets a control that shows 4 and moves by 1.
 *
 * THE HOLD STEPS FROM THE LAST NUMBER IT SET, NOT THE LAST ONE IT WAS HANDED (2026-09-25). A step
 * reads the value from a ref that the repeat itself advances: a slow phone that has not yet
 * re-rendered the sheet between two 60 ms ticks would otherwise step from the same number twice
 * and the hold would stall in place — the "hold does nothing" that reads as no hold at all. Every
 * render still resets the ref to the prop, so a parent that clamps or rounds stays in charge.
 *
 * EVERY STEP IS FELT (the owner, 2026-09-25: "a soft tick per stepper step"): a `tick` from
 * `useStepFire`, for a step that moved and never closer than 40 ms to the last (`tickDue`). The
 * number on the screen changes with every one, so nothing is said by the tick alone.
 *
 * TAP THE NUMBER TO TYPE IT (`typeable`; the owner, 2026-09-25: "Make 35 min tappable so users
 * can enter an exact duration"). Off by default. On, the number is a button — "35 minutes, double
 * tap to type an exact length" — that opens `StepperEntry`'s dialog; the whole control also takes
 * VoiceOver's double tap for the same thing, because the adjustable element hides its children.
 *
 * `caption` draws the control's name above it, so the meaning is on screen and not only in the
 * screen reader's label ("Slept for" over "− 35 min +", the owner's own layout).
 *
 * Accessibility is the adjustable pattern: the whole control is one element with a value
 * ("4.5 oz") and increment/decrement actions, so VoiceOver swipes up and down through it
 * instead of hunting for two buttons; the buttons still carry "Increase amount" / "Decrease
 * amount" for TalkBack and for tests. At a bound the button is disabled visibly — opacity and
 * state — and the repeat stops on its own, so a held thumb does not keep firing at 12 oz.
 * The value is `<Numeric>`: mono, tabular, so "4" and "4.5" sit in the same column.
 *
 * `compact` IS THE SAME STEPPER ON ONE ROW, SMALLER (the owner, 2026-09-26, of the bottle sheet's
 * leftover: *"(-) x oz (+) all in one row, and smaller than current"*): the caption on the left in
 * `bodySm`, and on the right a round − and + (`COMPACT_STEPPER`: 32 pt circles, each drawn inside a
 * full 44 pt target) either side of an 18 pt value, in a box as wide as the widest number the range
 * can show (`compactValueWidth`) so the − never moves as the digits change. The hold, the tick, the
 * bounds, the grid and the typed number are this file's, unchanged; the whole row is the one
 * adjustable element, so the caption is not read twice, and it carries `testID` (its caption
 * `${testID}.caption`, its parts the usual `-decrement`, `-value`, `-increment`). For a second
 * number that answers the control above it; the big one stays the primary number on a sheet.
 *
 * `ruler` IS THE SAME STEPPER WITH ITS SCALE UNDER IT (the owner, 2026-09-26: *"the interface for when
 * user needs to enter oz, or minute, feel very repetitive"*): the number big on top — typed in place
 * with a tap — and under it a ruler the parent drags, its − and + at the two ends to correct by a
 * step (`NumberRuler`, which has the whole account). The hold, the tick, the bounds and the ids are
 * this file's, unchanged: the ruler is handed its − and + already built. For an amount or a length —
 * the primary number on a sheet — where a range a thumb can flick across beats one tap per step. A
 * range with more steps than a ruler draws keeps the box (`rulerFits`).
 *
 * EVERY NUMBER CAN BE TYPED (2026-09-26, the owner: *"users must be able to enter only numerical
 * value … when they click the number"*): `typeable` is on unless it is `false`, with the stepper's
 * own name and a kind read off its unit (`typedEntryFor`). The box, the compact row and the round
 * stepper type in `StepperEntry`'s dialog; the ruler, which has a row for its number, types in place.
 *
 * AND A NUMBER THAT CAN BE TYPED STANDS IN A BOX (the owner, 2026-09-26: *"why is the finish logging
 * time and oz have underline on the number?"*): a small field round it — the text field's fill, an
 * edge measured at 3:1 on every ground (`typedBoxStyle`) — where a dotted underline used to be,
 * which Android drew solid. In every layout; a number that cannot be typed has no box.
 *
 * A LENGTH OF AN HOUR AND MORE READS "1h 20m" (the owner, the same day: *"1h20m is easier to read"*;
 * `stepReadout`), on every layout, and is heard as "1 hour 20 minutes". It is still typed and held
 * in minutes: the field that opens says "min" beside it and "In minutes" under it.
 *
 * `detail` IS THE COMPACT ROW'S SECOND LINE, under its caption: what the row's number comes to
 * (the bottle's "Took 3 oz" under "Left in the bottle"), drawn where a `Row` draws its detail —
 * beside the number it follows from — and read with the value, since the row is one element.
 *
 * AND THE NAME AND ITS LINE ARE ONE SIZE (2026-09-30, docs/DESIGN_SYSTEM.md §4.1, the owner's
 * *"so many different formats"*): the caption is `bodySm` in the text's own ink and the line under
 * it `bodySm` in `text2`, as a `Row` draws its line, where the line was `meta` a point under the
 * caption and the caption the hint's own gray: a name and its line told apart by ink, not by size.
 *
 * ONE FAMILY WITH THE ROUND STEPPER (the owner, 2026-09-30, over the pump's LEFT, RIGHT and TOTAL:
 * *"Did the grey highlight box look okay to you? And the icon plus and minus is not exactly on the
 * aligned in the middle of the border."*). Every − and + is drawn (`StepGlyph`), centered by
 * arithmetic where a text glyph sat where its font put it; every typed box is a pill exactly as tall
 * as the circles beside it, on their axis, with the number centered in it (`stepperBoxShape`); and
 * the primary number lost the card round its row and its squares, so the three steppers are one
 * shape at three sizes: 54, 38 and 32.
 *
 * `say` IS HOW A COUNT IS HEARD (2026-09-30, "How many bottles", one to six; on the compact row since
 * 2026-10-01, where it was a ruler for a day): a
 * number whose word is its caption's, with no unit drawn beside it (`unitLabel` empty, `typeable`'s
 * kind `count`), said with the word that fits the number — "1 bottle", "3 bottles" — where a unit
 * would have been read as written.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { haptic } from '../feedback/haptics';
import { useTheme } from '../theme/ThemeProvider';
import { NumberRuler } from './NumberRuler';
import { rulerFits } from './rulerMath';
import { StepGlyph } from './StepGlyph';
import { readoutRow, StepReadout, typedBoxStyle } from './StepReadout';
import {
  BIG_STEPPER,
  canStep,
  COMPACT_STEPPER,
  compactValueWidth,
  createStepRepeater,
  decimalsOfStep,
  LONG_PRESS_MS,
  readoutKind,
  spokenReadout,
  stepperBoxShape,
  stepReadout,
  stepValue,
  tickDue,
  typedA11yHint,
  typedBoxExtra,
  typedEntryFor,
  unitCaseStyle,
} from './stepperMath';
import { useTypedEntry, type TypedEntry } from './StepperEntry';
import { BodySm, Label } from './Text';

export interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** Follows the unit: 0.5 oz, 10 ml, 1 min. */
  step: number;
  min: number;
  max: number;
  /** Display precision; defaults to what the step needs (0.5 → 1, 10 → 0). */
  decimals?: number;
  unitLabel: string;
  /** What the number is — "Amount", "Minutes" — for the adjustable control and both buttons. */
  accessibilityLabel: string;
  /** The name drawn above the control ("Slept for"): the meaning on screen, not only spoken. */
  caption?: string;
  /**
   * How a screen reader says the value, when the word changes with the number ("1 bottle", "3
   * bottles"; see the header). Absent, the number and its unit as written.
   */
  say?: (value: number) => string;
  /**
   * How the number is typed (see the header): its title and kind. Absent, the stepper's own name
   * and a kind read off its unit; `false`, the number is only a readout.
   */
  typeable?: TypedEntry | false;
  /**
   * One row, smaller: `caption` on the left, (−) value (+) on the right (see the header). For a
   * second number that answers the control above it, never the primary number on a sheet.
   */
  compact?: boolean;
  /**
   * The compact row's second line, under its caption: what its number comes to ("Took 3 oz"). Read
   * with the value by a screen reader; ignored on the other layouts.
   */
  detail?: string | null;
  /**
   * The number on top, and a ruler under it to drag (`NumberRuler`; see the header). For the one
   * primary amount or length on a sheet. Ignored with `compact`.
   */
  ruler?: boolean;
  /** The ruler's strip on the left and − number + on the right, one row (`NumberRuler` `beside`). */
  rulerBeside?: boolean;
  /** The ruler on the page's own white, its scale quieter (`NumberRuler` `soft`). */
  rulerSoft?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Long-press repeat for a stepper button — `createStepRepeater` on the platform's timers. `fire`
 * returns whether the value moved; the loop stops itself at a bound, on release (`stop`) and when
 * the stepper unmounts. The latest `fire` is read through a ref, so a tick never steps with a
 * stale closure.
 */
export function useStepRepeat(fire: (delta: number) => boolean): {
  start: (delta: number) => void;
  stop: () => void;
} {
  const fireRef = useRef(fire);
  fireRef.current = fire;
  const repeater = useMemo(
    () =>
      createStepRepeater({
        set: (fn, ms) => setTimeout(fn, ms),
        clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
      }),
    [],
  );
  useEffect(() => repeater.stop, [repeater]);
  const start = useCallback(
    (delta: number) => repeater.start(() => fireRef.current(delta)),
    [repeater],
  );
  return { start, stop: repeater.stop };
}

/**
 * One step of a stepper, from the number the stepper last SET (see the header): `latest` is the
 * prop on every render and the stepper's own result between renders.
 *
 * AND EVERY STEP IS FELT HERE, as a `tick` (the owner, 2026-09-25: "a soft tick per stepper
 * step"), because this is the one place every step passes through — a tap, each step of a hold
 * (`useStepRepeat` calls nothing else), a screen reader's increment — on both steppers, which
 * share it. Only a step that MOVED is felt: at a bound the step is refused and the button is
 * already dimmed, and a tick there would say the number had changed when it had not. A number
 * typed into the dialog is not a step and does not come through here. `tickDue` keeps the ticks
 * at least 40 ms apart, so a run faster than the hold never turns into a buzz.
 */
export function useStepFire(args: {
  value: number;
  min: number;
  max: number;
  places: number;
  disabled: boolean;
  onChange: (value: number) => void;
}): (delta: number) => boolean {
  const { value, min, max, places, disabled, onChange } = args;
  const latest = useRef(value);
  latest.current = value;
  // when the last step was felt: the floor under the ticks is measured from here (`tickDue`)
  const felt = useRef<number | null>(null);
  return useCallback(
    (delta: number): boolean => {
      const from = latest.current;
      if (disabled || !canStep(from, delta, min, max)) return false;
      const next = stepValue(from, delta, min, max, places);
      latest.current = next;
      const at = Date.now();
      if (tickDue(felt.current, at)) {
        felt.current = at;
        haptic('tick');
      }
      onChange(next);
      return true;
    },
    [disabled, min, max, places, onChange],
  );
}

export function NumberStepper({
  value,
  onChange,
  step,
  min,
  max,
  decimals,
  unitLabel,
  accessibilityLabel,
  caption,
  say,
  typeable,
  compact = false,
  detail = null,
  ruler = false,
  rulerBeside = false,
  rulerSoft = false,
  disabled = false,
  style,
  testID,
}: NumberStepperProps) {
  const t = useTheme();
  const places = decimals ?? decimalsOfStep(step);
  const fire = useStepFire({ value, min, max, places, disabled, onChange });
  const repeat = useStepRepeat(fire);
  // the ruler: never on the compact row, and a range too long to draw keeps the box
  const asRuler = ruler && !compact && rulerFits(min, max, step);
  const typed = typedEntryFor({ typeable, caption, accessibilityLabel, unitLabel });
  const entry = useTypedEntry({
    // the ruler types in place, not in the dialog
    entry: asRuler ? undefined : typed,
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
  const spoken = say ? say(value) : spokenReadout(readout, kind);
  // the compact row's detail is under its caption, and the row is one element: heard with the value
  const said = compact && detail ? `${spoken}. ${detail}` : spoken;
  // what a double tap does, when the number can be typed
  const typeHint = entry.open && typed ? typedA11yHint(typed.kind) : null;
  const canDown = !disabled && canStep(value, -step, min, max);
  const canUp = !disabled && canStep(value, step, min, max);
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') fire(step);
    else if (e.nativeEvent.actionName === 'decrement') fire(-step);
    else if (e.nativeEvent.actionName === 'activate') entry.open?.();
  };
  // ONE ELEMENT TO A SCREEN READER, in either layout: its name, its value, and up and down
  const adjustable: ViewProps = {
    accessible: true,
    accessibilityRole: 'adjustable',
    accessibilityLabel,
    accessibilityValue: { text: said },
    accessibilityState: { disabled },
    accessibilityActions: [
      { name: 'increment' },
      { name: 'decrement' },
      ...(typeHint ? [{ name: 'activate', label: typeHint }] : []),
    ],
    ...(typeHint ? { accessibilityHint: typeHint } : {}),
    onAccessibilityAction: onAction,
  };
  const size = compact ? COMPACT_STEPPER.value : BIG_STEPPER.value;
  /* the circles either side of the number: the compact row's (the ruler's ends are those too), or
     the primary number's */
  const circle = compact || asRuler ? COMPACT_STEPPER.circle : BIG_STEPPER.circle;
  const number = (
    <StepReadout
      readout={readout}
      size={size}
      variant={compact ? 'statValue' : 'display'}
      unit={u => <Label style={unitCaseStyle(u)}>{u}</Label>}
      {...(testID ? { testID: `${testID}-value` } : {})}
    />
  );
  // THE TYPED BOX (see the header) is as tall as the circles and a pill. On the primary stepper it
  // fills the room between them, so the whole middle is the target; the compact one's is as wide as
  // its widest number, so the − beside it never moves as the digits change.
  const boxed = typeHint !== null;
  const box: ViewStyle = compact
    ? {
        minWidth:
          compactValueWidth(min, max, places, unitLabel, kind) * t.fontScale.chrome +
          (boxed ? typedBoxExtra() : 0),
      }
    : styles.fill;
  // the number and its unit on one baseline, centered in the box
  const face = <View style={readoutRow(t.space.xs)}>{number}</View>;
  const shown =
    entry.open && typeHint ? (
      /* the number, as a button of its own: the typed box. On the compact row its slop reaches up
         and down only, to the 44 target, never sideways over a − or a +, which keep their own */
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}, ${spoken}`}
        accessibilityHint={typeHint}
        onPress={entry.open}
        hitSlop={compact ? { top: t.space.md, bottom: t.space.md } : t.space.md}
        style={({ pressed }) => [
          typedBoxStyle(t, stepperBoxShape(circle)),
          box,
          { opacity: pressed ? 0.6 : 1 },
        ]}
        {...(testID ? { testID: `${testID}-type` } : {})}
      >
        {face}
      </Pressable>
    ) : (
      <View style={[styles.center, { minHeight: circle }, box]}>{face}</View>
    );
  const minus = (
    <StepButton
      kind="minus"
      circle={circle}
      accessibilityLabel={`Decrease ${accessibilityLabel}`}
      enabled={canDown}
      onPress={() => fire(-step)}
      onHold={() => repeat.start(-step)}
      onRelease={repeat.stop}
      {...(testID ? { testID: `${testID}-decrement` } : {})}
    />
  );
  const plus = (
    <StepButton
      kind="plus"
      circle={circle}
      accessibilityLabel={`Increase ${accessibilityLabel}`}
      enabled={canUp}
      onPress={() => fire(step)}
      onHold={() => repeat.start(step)}
      onRelease={repeat.stop}
      {...(testID ? { testID: `${testID}-increment` } : {})}
    />
  );

  if (asRuler)
    return (
      <NumberRuler
        value={value}
        onChange={onChange}
        step={step}
        min={min}
        max={max}
        places={places}
        unitLabel={unitLabel}
        kind={kind}
        accessibilityLabel={accessibilityLabel}
        {...(caption ? { caption } : {})}
        say={say}
        typed={disabled ? undefined : typed}
        minus={minus}
        plus={plus}
        fire={fire}
        disabled={disabled}
        beside={rulerBeside}
        soft={rulerSoft}
        {...(style ? { style } : {})}
        {...(testID ? { testID } : {})}
      />
    );

  if (compact)
    return (
      <>
        {/* its name on the left, taking the room the control leaves and wrapping rather than
            pushing it off the edge, and the control on the right. Never less than a target tall,
            so no target reaches past the row into whatever is above or below it */}
        <View
          {...adjustable}
          style={[
            styles.row,
            styles.end,
            { minHeight: t.hit.min, gap: t.space.md, opacity: disabled ? 0.5 : 1 },
            style,
          ]}
          {...(testID ? { testID } : {})}
        >
          {caption || detail ? (
            <View style={styles.caption}>
              {caption ? (
                <BodySm ink="text" {...(testID ? { testID: `${testID}.caption` } : {})}>
                  {caption}
                </BodySm>
              ) : null}
              {detail ? (
                <BodySm {...(testID ? { testID: `${testID}.detail` } : {})}>{detail}</BodySm>
              ) : null}
            </View>
          ) : null}
          <View style={[styles.row, { gap: t.space.xs }]}>
            {minus}
            {shown}
            {plus}
          </View>
        </View>
        {entry.element}
      </>
    );

  return (
    <View style={[{ gap: t.space.sm }, style]}>
      {caption ? <Label>{caption}</Label> : null}
      {/* THE CIRCLES AND THE BOX, AND NOTHING ROUND THEM (2026-09-30): the card that framed this
          row was a second container round the first, as the round stepper's white pill was */}
      <View
        {...adjustable}
        style={[styles.row, { gap: t.space.xs, opacity: disabled ? 0.5 : 1 }]}
        {...(testID ? { testID } : {})}
      >
        {minus}
        {shown}
        {plus}
      </View>
      {entry.element}
    </View>
  );
}

function StepButton({
  kind,
  circle,
  accessibilityLabel,
  enabled,
  onPress,
  onHold,
  onRelease,
  testID,
}: {
  kind: 'minus' | 'plus';
  /** The circle's diameter: `COMPACT_STEPPER.circle` on the compact row and a ruler's ends, else 54. */
  circle: number;
  accessibilityLabel: string;
  enabled: boolean;
  onPress: () => void;
  onHold: () => void;
  onRelease: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const look = (pressed: boolean) => (!enabled ? 0.4 : pressed ? 0.75 : 1);
  // THE WHOLE TARGET IS THE BUTTON ITSELF, never less than a target, with the circle in its middle:
  // a compact circle in a 44 pt square, the primary number's 54 pt circle as its own target
  const target = Math.max(circle, t.hit.min);
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
      style={[styles.button, { width: target, height: target }]}
      {...(testID ? { testID } : {})}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.button,
            {
              width: circle,
              height: circle,
              borderRadius: circle / 2,
              backgroundColor: t.color.accentSoft,
              opacity: look(pressed),
              // the round stepper's press: the circle gives a little under the thumb
              transform: [{ scale: pressed && enabled && !t.reduceMotion ? 0.93 : 1 }],
            },
          ]}
        >
          {/* DRAWN, at the circle's center by arithmetic (`StepGlyph`) */}
          <StepGlyph kind={kind} box={circle} color={t.color.accent2} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  end: { justifyContent: 'flex-end' },
  caption: { flex: 1 },
  button: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1 },
});
