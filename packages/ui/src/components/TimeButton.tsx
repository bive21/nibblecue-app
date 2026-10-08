/**
 * TimeButton — a time you tap to change (2026-09-26, the medicine form's reminder times; the owner:
 * *"let user know that 'at' is clickable"*). The time in the typed box's soft well — the one every
 * number a parent can tap already stands in — with a clock in the accent before it, so it reads as a
 * thing to press and says what pressing it changes. `timeButton.ts` holds the numbers and the paint
 * and says why there is no underline and no edge.
 *
 * ONE TARGET, AT LEAST 44 PT TALL — the whole box, never only the digits — named by the caller
 * ("Reminder 1 of 3, 9:30 AM") with a hint that says a tap changes it. A press dims it, unless the
 * reader has asked for less motion; there is no haptic, because the picker it opens is the answer.
 *
 * A BOX AS WIDE AS ITS ROW SHRINKS ITS TIME BEFORE IT CUTS IT (`fit`; 2026-09-29, the running
 * timer's Start time and End time, half a phone each). A box that sizes itself to its time never
 * needs it; one whose width the row decides would end "12:5…" at the largest text sizes, and a
 * clock is never broken or cut (`keepClockWhole`). The time takes the room the clock leaves it and
 * fits itself to that, as the round stepper's number once did.
 */
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Numeric } from './Text';
import { TIME_BUTTON, timeButtonPaint } from './timeButton';

export interface TimeButtonProps {
  /** The time as the household reads it ("9:30 AM", "21:30"). */
  time: string;
  onPress: () => void;
  /** What a screen reader hears; the time alone when omitted. */
  accessibilityLabel?: string;
  /** What a tap does, for a screen reader ("Changes the time"). */
  accessibilityHint?: string;
  disabled?: boolean;
  /** Shrink the time to fit a box its row sizes, never below this share of its size. */
  fit?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TimeButton({
  time,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  fit,
  style,
  testID,
}: TimeButtonProps) {
  const t = useTheme();
  const paint = timeButtonPaint(t.color);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? time}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.box,
        {
          minHeight: t.hit.min,
          paddingHorizontal: TIME_BUTTON.padX,
          gap: TIME_BUTTON.gap,
          borderRadius: t.radius.m,
          backgroundColor: paint.fill,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      <Icon name="clock" size={TIME_BUTTON.glyph} color={paint.glyph} />
      {/* the page's own text ink (`paint.text`), in the numeric face; one line, never cut */}
      <Numeric
        variant="body"
        ink="text"
        numberOfLines={1}
        {...(fit === undefined
          ? {}
          : { adjustsFontSizeToFit: true, minimumFontScale: fit, style: styles.fit })}
      >
        {time}
      </Numeric>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  // a text in a row keeps its own width unless it may shrink: the room it fits itself to
  fit: { flexShrink: 1 },
});
