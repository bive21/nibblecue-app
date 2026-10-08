/**
 * ProgressLine (the prototype's `.progressline`, §19): a 6pt rounded track with a brand-gradient
 * fill — how far through a shopping trip the household is.
 *
 * IT IS DECORATION, and it is declared as such. The card above it already says "3 of 11 in the
 * basket" and prints the percent in the mono face, so the bar repeats a fact rather than
 * carrying one; a screen reader that stopped on it would hear the same number twice. Nothing
 * here is conveyed by color alone for exactly that reason (DESIGN_SYSTEM.md §8).
 *
 * `StepTrack` is the other progress indicator and they are not interchangeable: that one is for
 * a flow of N discrete steps and names the step you are on, this one is a continuous fraction of
 * a set whose size the household decides.
 */
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';

export const PROGRESS_LINE_HEIGHT = 6;

export interface ProgressLineProps {
  /** 0..1; anything outside is clamped, so a caller never has to guard a divide. */
  value: number;
  /**
   * A solid fill in place of the brand gradient — a card that belongs to one module fills its
   * bar in that module's own color (the tummy-time goal on Baby care), because a purple bar on
   * a green card is a second thing to explain. Omitted, the brand gradient stays.
   */
  color?: string;
  testID?: string;
}

export function ProgressLine({ value, color, testID }: ProgressLineProps) {
  const t = useTheme();
  const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 100);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: PROGRESS_LINE_HEIGHT,
        borderRadius: t.radius.pill,
        backgroundColor: t.color.surface3,
        overflow: 'hidden',
      }}
      {...(testID ? { testID } : {})}
    >
      {pct > 0 && color !== undefined ? (
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
      ) : pct > 0 ? (
        <LinearGradient
          colors={[...t.gradient.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: `${pct}%`, height: '100%' }}
        />
      ) : null}
    </View>
  );
}
