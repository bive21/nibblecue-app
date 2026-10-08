/**
 * One bar, one segment per thing, proportional to its share (docs/DESIGN_SYSTEM.md §23.5) — the
 * stash's "where is it all" line, and the shape any other whole-and-its-parts number can take.
 *
 * WHY THE GAPS ARE DRAWN AND NOT SPACED. A row of views with a `gap` splits the bar's width
 * between the segments and the gaps, so a segment carrying 1% of the milk becomes a sliver
 * narrower than the gap beside it and reads as nothing. Here every segment keeps its own rounded
 * ends and the gap is the ground showing through, so the smallest segment is still a shape: a
 * floor of `MIN_SHARE` guarantees it is at least a stub a finger could point at, taken from the
 * largest segment so the bar still adds to one.
 *
 * A bar is never the only way a number is given (CLAUDE.md §6: nothing by color alone). Every
 * caller draws a legend under it with the name and the amount in words, and the bar itself is
 * one accessible node reading the whole breakdown rather than n unlabelled rectangles.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { barShares, type BarSegment } from './stackedBar';

export * from './stackedBar';

export interface StackedBarProps {
  segments: readonly BarSegment[];
  /** What a screen reader hears instead of the rectangles: "Fridge 9 oz, Freezer 26 oz…". */
  accessibilityLabel: string;
  /** 14 by default — the height the stash's total card draws (§23.5). */
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function StackedBar({
  segments,
  accessibilityLabel,
  height,
  style,
  testID,
}: StackedBarProps) {
  const t = useTheme();
  const shown = segments.filter(s => Number.isFinite(s.value) && s.value > 0);
  const shares = barShares(shown.map(s => s.value));
  const h = height ?? t.space.xl;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.bar,
        { height: h, gap: t.space.xs - 1, borderRadius: h / 2 },
        // an empty stash still draws its track, so the card keeps its shape rather than jumping
        shown.length === 0 ? { backgroundColor: t.color.surface2 } : null,
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      {shown.map((s, i) => (
        <View
          key={s.key}
          style={{
            flexGrow: shares[i] ?? 0,
            flexBasis: 0,
            backgroundColor: s.color,
            borderRadius: h / 2,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', overflow: 'hidden' },
});
