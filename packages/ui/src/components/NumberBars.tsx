/**
 * NumberBars — a row of small bars, each with its number written on its cap and its day under it
 * (Reports' range card, 2026-09-26; `numberBars.ts` has the arithmetic and why the number is on
 * the bar).
 *
 * A DAY NOBODY LOGGED IS NOT A ZERO. A column whose value is `null` draws no bar and a dash where
 * its number would be, so a week with a quiet Tuesday reads as a week with a gap in the log rather
 * than a day the baby did not eat — the honesty `daysWithEntries` was written for.
 *
 * THE BARS RISE THE FIRST TIME THEIR CARD IS SEEN (`reveal`, as `DayBars`' columns do): each bar in
 * its own box clipped at the baseline, sliding up into place on the card's one value. At rest
 * otherwise; reduce motion and the amber Night are at rest. The numbers do not move — they are the
 * point, and a number in flight is a number misread.
 *
 * NIGHT DRAWS NO FILLS: a 1 pt edge in the hue, as every chart in the night theme.
 *
 * ONE ACCESSIBLE IMAGE, named by the caller as a sentence ("Feeds a day: Monday 8, Tuesday 7 …"),
 * because every number on it is also in that sentence and a screen reader should not have to walk
 * fourteen rectangles to hear seven numbers.
 */
import { useMemo, useState } from 'react';
import {
  Animated,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { categoryColors, useTheme, type CategoryRole } from '../theme/ThemeProvider';
import { BAR_RADIUS } from './dayBarsLayout';
import { barHeight, NUMBER_BARS, numberBarsFit } from './numberBars';
import { growFrame, growTimeline, type Reveal } from './reportReveal';
import { STAT_FIT_INSURANCE } from './statTable';
import { AppText, Numeric } from './Text';
import { useRevealProgress } from './useRevealProgress';

export * from './numberBars';

/** What a column with no entries at all carries in its number's place. */
export const NO_ENTRIES = '—';

export interface NumberBarsProps {
  /** One per column, oldest first. `null` is a column with nothing logged in it — not a zero. */
  values: readonly (number | null)[];
  /** Each column's number, in the figure's own words: `8`, `13h 20m`. */
  labels: readonly string[];
  /** The same numbers short, where a figure has a short form (`13h`); used only when the full ones do not fit. */
  short?: readonly string[] | undefined;
  /** The word under each column: `Mon`, `Sep 14`. */
  ticks: readonly string[];
  role: CategoryRole;
  /** The column still going — today, this week: its word is in the text ink. */
  current?: number | undefined;
  /** The whole chart as a sentence, for a screen reader. */
  accessibilityLabel: string;
  reveal?: Reveal | undefined;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function NumberBars({
  values,
  labels,
  short,
  ticks,
  role,
  current,
  accessibilityLabel,
  reveal = 'rest',
  style,
  testID,
}: NumberBarsProps) {
  const t = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  // the first frame guesses from the window — a card's content inside the Screen's gutter — and
  // every frame after it fits to what the chart measured (QuickAction's lesson, §23.2.1)
  const width =
    measured > 0 ? measured : Math.max(0, windowWidth - 2 * t.space.xxl - 2 * t.space.xl);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - measured) >= 0.5) setMeasured(w);
  };
  const fit = numberBarsFit({ width, labels, short, ticks, scale: t.fontScale.chrome });
  const words = fit.short && short ? short : labels;
  const max = Math.max(0, ...values.map(v => v ?? 0));
  const heights = values.map(v => barHeight(v, max));
  const n = values.length;
  const progress = useRevealProgress(reveal, growTimeline(n).totalMs);
  const heightKey = heights.map(h => h.toFixed(2)).join(',');
  const sinks = useMemo(
    () =>
      heightKey.split(',').map((h, i) => {
        const f = growFrame(i, n, Number(h) + 1);
        return progress.interpolate({
          inputRange: [...f.inputRange],
          outputRange: [...f.outputRange],
          extrapolate: f.extrapolate,
        });
      }),
    [heightKey, n, progress],
  );
  const { fg } = categoryColors(t.color, role);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
      style={style}
      {...(testID ? { testID } : {})}
    >
      <View
        style={styles.row}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {values.map((v, i) => {
          const h = heights[i] ?? 0;
          return (
            <View key={i} style={styles.column}>
              <Numeric
                variant="meta"
                ink={v === null ? 'text2' : 'text'}
                align="center"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={STAT_FIT_INSURANCE}
                style={{ fontSize: NUMBER_BARS.size * fit.number }}
              >
                {v === null ? NO_ENTRIES : (words[i] ?? '')}
              </Numeric>
              {/* the plot: every column the same height, its bar standing on the baseline — the
                  plot's own bottom edge, so the columns' edges join into one line */}
              <View
                style={[
                  styles.plot,
                  { height: NUMBER_BARS.plot + 1, borderBottomColor: t.color.line },
                ]}
              >
                {h > 0 ? (
                  <Animated.View
                    style={{
                      width: fit.bar,
                      height: h,
                      borderTopLeftRadius: Math.min(BAR_RADIUS, h / 2),
                      borderTopRightRadius: Math.min(BAR_RADIUS, h / 2),
                      backgroundColor: t.isNight ? 'transparent' : fg,
                      ...(t.isNight ? { borderWidth: 1, borderColor: fg } : null),
                      transform: [{ translateY: sinks[i] ?? 0 }],
                    }}
                  />
                ) : null}
              </View>
              <AppText
                variant="meta"
                ink={current === i ? 'text' : 'text2'}
                align="center"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={STAT_FIT_INSURANCE}
                style={{ fontSize: NUMBER_BARS.size * fit.tick }}
              >
                {ticks[i] ?? ''}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, alignItems: 'center', gap: 2 },
  // the foot of the plot is the clip: a bar below it is a bar not yet risen
  plot: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderBottomWidth: 1,
  },
});
