/**
 * A day-by-day column chart that a parent can TOUCH (docs/DESIGN_SYSTEM.md §5; the owner,
 * 2026-09-16: "reports need to be interactive").
 *
 * On a phone there is no hover, so the hover layer every chart owes its reader becomes a TAP:
 * the whole column is the hit target — far bigger than the bar inside it — and tapping one puts
 * that day's numbers into the key above the plot. Tapping it again lets go. That single row is
 * the chart's legend when nothing is selected and its tooltip when something is, which is why
 * the numbers never crowd the bars: a value on every column is chaos and goes unread.
 *
 * THE MARK SPECS, and they are fixed rather than tuned per chart:
 *   · a column is at most 24px thick and the band's leftover is air;
 *   · the data end is rounded 4px and the baseline end is square, so the bar grows from a line
 *     rather than floating (a `Path`, because an `rx` on a `Rect` rounds all four corners);
 *   · touching marks are separated by a 2px gap IN THE SURFACE COLOR — between the segments of a
 *     stack and between neighbouring columns alike — never by a stroke, which would add ink that
 *     is not data;
 *   · the baseline and the one max gridline are hairline, solid and recessive. Not dashed:
 *     dashing is noise pretending to be subtlety.
 *
 * TEXT NEVER WEARS THE SERIES COLOR. The swatch beside a label carries identity; the label, the
 * value and the axis stay in the text tokens, because a light category hue is illegible as type
 * on the surface and the contrast sweep would fail it.
 *
 * NIGHT draws no fills — a 1px stroke in the hue, like every other surface in the night theme.
 *
 * THE COLUMNS RISE OUT OF THE BASELINE the first time the chart's card is seen (`reveal`, the
 * owner's delight list, 2026-09-26; `reportReveal.ts`): each column is drawn in its own box clipped
 * at the baseline and slides up into place — 420 ms on an ease-out, the next column a beat behind —
 * so a bar's rounded top is its shape from the first frame it shows, never a squashed one. One
 * animated value drives the chart on the native driver. At rest (the default, and every chart that
 * is not on Reports) the boxes simply stand where the bars are; reduce motion and Night are at rest.
 */
import { useMemo, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { categoryColors, useTheme, type CategoryRole } from '../theme/ThemeProvider';
import {
  BAR_GAP,
  BAR_MAX_WIDTH,
  BAR_RADIUS,
  columnMax,
  DAY_BARS_HEIGHT,
  TICK_MIN_BAND,
  topRoundedPath,
} from './dayBarsLayout';
import { growFrame, growTimeline, type Reveal } from './reportReveal';
import { Meta, Numeric } from './Text';
import { useRevealProgress } from './useRevealProgress';

/** Room either side of a column's box for night's 1 pt stroke, which straddles the bar's edge. */
const COLUMN_BLEED = 1;

export * from './dayBarsLayout';

/** A series is a category hue, or the one neutral for a thing that is not a category. */
export type BarRole = CategoryRole | 'muted';

export interface DayBarsSeries {
  key: string;
  label: string;
  role: BarRole;
}

export interface DayBarsProps {
  /** One entry per column, oldest first: the tick under it and the name a reader hears. */
  days: { label: string; longLabel: string }[];
  series: DayBarsSeries[];
  /** `values[series][day]`. Every row is the same length as `days`. */
  values: number[][];
  mode: 'stacked' | 'grouped';
  format: (v: number) => string;
  /** The whole chart in one sentence, for a screen reader. */
  accessibilitySummary: string;
  height?: number;
  /**
   * Where the chart's card is in its entrance (`reportReveal.ts`): holding, the columns wait under
   * the baseline; playing, they rise once. Absent — every chart outside Reports — it is at rest.
   */
  reveal?: Reveal | undefined;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function DayBars({
  days,
  series,
  values,
  mode,
  format,
  accessibilitySummary,
  height = DAY_BARS_HEIGHT,
  reveal = 'rest',
  style,
  testID,
}: DayBarsProps) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const n = days.length;
  const progress = useRevealProgress(reveal, growTimeline(n).totalMs);
  const max = columnMax(values, mode);
  const band = n > 0 ? width / n : 0;
  const barW = Math.max(3, Math.min(BAR_MAX_WIDTH, band - BAR_GAP));
  const plotH = Math.max(0, height - 1);
  const scale = (v: number) => (max > 0 ? (v / max) * plotH : 0);
  const inkOf = (role: BarRole) =>
    role === 'muted' ? t.color.line2 : categoryColors(t.color, role).fg;

  /** The key: the legend when nothing is chosen, that day's numbers when something is. */
  const shown = selected === null ? null : days[selected];
  const totalOf = (i: number) =>
    selected === null ? (values[i] ?? []).reduce((a, b) => a + b, 0) : (values[i]?.[selected] ?? 0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  /** A column's left edge in the plot. */
  const columnX = (dayIndex: number) => dayIndex * band + (band - barW) / 2;

  const column = (dayIndex: number) => {
    const x0 = columnX(dayIndex);
    if (mode === 'grouped') {
      const each = Math.max(2, (barW - BAR_GAP * (series.length - 1)) / series.length);
      return series.map((s, i) => {
        const v = values[i]?.[dayIndex] ?? 0;
        const h = scale(v);
        if (h <= 0) return null;
        return {
          key: `${s.key}:${dayIndex}`,
          d: topRoundedPath(x0 + i * (each + BAR_GAP), plotH - h, each, h, BAR_RADIUS),
          ink: inkOf(s.role),
          top: plotH - h,
        };
      });
    }
    let cursor = plotH;
    return series.map((s, i) => {
      const v = values[i]?.[dayIndex] ?? 0;
      const h = scale(v);
      if (h <= 0) return null;
      // the gap is taken out of the segment below the top one, so the stack's total height
      // still reads as the value and only the SEPARATION is surface
      const isTop = series.slice(i + 1).every((_, j) => (values[i + 1 + j]?.[dayIndex] ?? 0) <= 0);
      const drawn = Math.max(1, h - (isTop ? 0 : BAR_GAP));
      const y = cursor - h;
      cursor -= h;
      return {
        key: `${s.key}:${dayIndex}`,
        d: topRoundedPath(x0, y + (h - drawn), barW, drawn, isTop ? BAR_RADIUS : 0),
        ink: inkOf(s.role),
        top: y + (h - drawn),
      };
    });
  };

  /**
   * EVERY COLUMN'S BOX: its bars, where the box stands (a stroke's bleed either side of the
   * column), and how far it rises — the whole column, and night's stroke above it, from under the
   * baseline.
   */
  const columns = days.map((_, d) => {
    const bars = column(d).filter((bar): bar is NonNullable<typeof bar> => bar !== null);
    if (bars.length === 0) return null;
    return {
      bars,
      left: columnX(d) - COLUMN_BLEED,
      boxW: barW + 2 * COLUMN_BLEED,
      rise: plotH - Math.min(...bars.map(bar => bar.top)) + COLUMN_BLEED,
    };
  });
  // one interpolation per column, kept while the geometry holds: a new one on every render would
  // re-attach every column's node on the native side for nothing
  const riseKey = columns.map(c => (c === null ? '' : c.rise.toFixed(2))).join(',');
  const sinks = useMemo(
    () =>
      riseKey.split(',').map((rise, d) => {
        if (rise === '') return null;
        const f = growFrame(d, n, Number(rise));
        return progress.interpolate({
          inputRange: [...f.inputRange],
          outputRange: [...f.outputRange],
          extrapolate: f.extrapolate,
        });
      }),
    [riseKey, n, progress],
  );

  return (
    <View style={[{ gap: t.space.sm }, style]} {...(testID ? { testID } : {})}>
      {/* THE KEY. Always present — it is the legend for two or more series and the readout for
          a chosen day, which is why a value never has to be printed on a bar. */}
      <View style={[styles.key, { gap: t.space.md }]} testID={testID ? `${testID}.key` : undefined}>
        {series.map((s, i) => (
          <View key={s.key} style={[styles.keyItem, { gap: t.space.sm }]}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: inkOf(s.role),
              }}
            />
            <Meta>{s.label}</Meta>
            <Numeric variant="meta" ink="text">
              {format(totalOf(i))}
            </Numeric>
          </View>
        ))}
        <Meta ink="text2" style={styles.grow}>
          {shown === undefined || shown === null ? '' : shown.longLabel}
        </Meta>
      </View>

      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilitySummary}
        onLayout={onLayout}
        style={{ height }}
      >
        {width > 0 && n > 0 ? (
          <>
            <View
              style={StyleSheet.absoluteFill}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                {/* the one gridline, at the real maximum, solid and recessive */}
                {max > 0 ? (
                  <Line
                    x1={0}
                    y1={0.5}
                    x2={width}
                    y2={0.5}
                    stroke={t.color.line2}
                    strokeWidth={1}
                  />
                ) : null}
                <Line
                  x1={0}
                  y1={plotH + 0.5}
                  x2={width}
                  y2={plotH + 0.5}
                  stroke={t.color.line}
                  strokeWidth={1}
                />
              </Svg>
              {/* ONE BOX PER COLUMN, clipped at the baseline: the column's own drawing, in the
                  chart's coordinates (the viewBox is the box's slice of the plot), moved up into
                  place on the chart's one value — or standing there already, at rest. */}
              {columns.map((col, d) => {
                const sink = sinks[d];
                if (col === null || sink === null || sink === undefined) return null;
                const { bars, left, boxW } = col;
                return (
                  <View
                    key={d}
                    style={[
                      styles.column,
                      {
                        left,
                        width: boxW,
                        height: plotH,
                        opacity: selected === null || selected === d ? 1 : 0.4,
                      },
                    ]}
                  >
                    <Animated.View style={{ transform: [{ translateY: sink }] }}>
                      <Svg width={boxW} height={plotH} viewBox={`${left} 0 ${boxW} ${plotH}`}>
                        {bars.map(bar => (
                          <Path
                            key={bar.key}
                            d={bar.d}
                            fill={t.isNight ? 'none' : bar.ink}
                            stroke={t.isNight ? bar.ink : 'none'}
                            strokeWidth={t.isNight ? 1 : 0}
                          />
                        ))}
                      </Svg>
                    </Animated.View>
                  </View>
                );
              })}
            </View>

            {/* the hit targets: a whole column each, so a 6px bar is still a 44pt tap */}
            <View style={StyleSheet.absoluteFill}>
              <View style={styles.hits}>
                {days.map((day, d) => (
                  <Pressable
                    key={day.label + String(d)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selected === d }}
                    accessibilityLabel={`${day.longLabel}: ${series
                      .map(s => `${s.label} ${format(values[series.indexOf(s)]?.[d] ?? 0)}`)
                      .join(', ')}`}
                    onPress={() => setSelected(cur => (cur === d ? null : d))}
                    style={styles.hit}
                    testID={testID ? `${testID}.day.${d}` : undefined}
                  />
                ))}
              </View>
            </View>
          </>
        ) : null}
      </View>

      {band >= TICK_MIN_BAND ? (
        <View style={styles.ticks}>
          {days.map((day, d) => (
            <Numeric
              key={day.label + String(d)}
              variant="meta"
              ink={selected === d ? 'text' : 'text2'}
              align="center"
              style={styles.tick}
            >
              {day.label}
            </Numeric>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // the clip is the baseline: a column below it is a column not yet grown
  column: { position: 'absolute', top: 0, overflow: 'hidden' },
  key: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  keyItem: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1, textAlign: 'right' },
  hits: { flexDirection: 'row', flex: 1 },
  hit: { flex: 1 },
  ticks: { flexDirection: 'row' },
  tick: { flex: 1 },
});
