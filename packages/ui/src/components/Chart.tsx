/**
 * Chart (docs/DESIGN_SYSTEM.md §5 "Chart", docs/MOBILE.md §4): bars or a line in the module's
 * hue, past periods at 52% and the current one full, grid lines in the line token, and a
 * dashed gridline at the REAL maximum with its value labeled. The labels are React Native
 * text placed over the SVG rather than SVG text, so they use the mono face and the font scale
 * like every other number on the screen; the SVG's viewBox is the measured width, so its
 * units are points and the overlays line up. Night draws no fills — a 1px stroke in the hue.
 *
 * A chart is one image to a screen reader: the caller supplies the sentence
 * (`accessibilitySummary`, required), and the numbers inside are hidden from it.
 */
import { useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Rect } from 'react-native-svg';
import { categoryColors, useTheme, type CategoryRole } from '../theme/ThemeProvider';
import {
  areaPoints,
  CHART_DEFAULTS,
  chartLayout,
  polylinePoints,
  type ChartPoint,
} from './chartLayout';
import { Label, Numeric } from './Text';

export type { ChartPoint } from './chartLayout';

export interface ChartProps {
  series: ChartPoint[];
  kind: 'bar' | 'line';
  tint: CategoryRole;
  /** Shown once, top right ("oz", "min"). */
  unit: string;
  formatValue: (v: number) => string;
  /** The whole chart in one sentence: "Milk per day, 7 days, 18 to 26 ounces, today 22." */
  accessibilitySummary: string;
  height?: number;
  /** Defaults to the last period. */
  currentIndex?: number;
  /** X labels; omitted = no ticks. */
  formatTick?: (t: number, index: number) => string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const PAST_OPACITY = 0.52;
const LABEL_HEIGHT = 14;

export function Chart({
  series,
  kind,
  tint,
  unit,
  formatValue,
  accessibilitySummary,
  height = CHART_DEFAULTS.height,
  currentIndex,
  formatTick,
  style,
  testID,
}: ChartProps) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const cat = categoryColors(t.color, tint);
  const g = chartLayout(series, {
    width: width || 300,
    height,
    ...(currentIndex !== undefined ? { currentIndex } : {}),
  });
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };
  const current = g.bars[g.currentIndex];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilitySummary}
      onLayout={onLayout}
      style={[{ height, width: '100%' }, style]}
      {...(testID ? { testID } : {})}
    >
      {width > 0 ? (
        <View
          style={StyleSheet.absoluteFill}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <Line
              x1={0}
              y1={g.baselineY}
              x2={width}
              y2={g.baselineY}
              stroke={t.color.line}
              strokeWidth={1}
            />
            {series.length > 0 ? (
              <Line
                x1={0}
                y1={g.maxY}
                x2={width}
                y2={g.maxY}
                stroke={t.color.line2}
                strokeWidth={1}
                strokeDasharray={[2, 4]}
              />
            ) : null}
            {kind === 'bar'
              ? g.bars.map(b =>
                  b.h > 0 ? (
                    <Rect
                      key={b.index}
                      x={b.x}
                      y={b.y}
                      width={b.w}
                      height={b.h}
                      rx={t.isNight ? 2 : 4}
                      fill={t.isNight ? 'none' : cat.fg}
                      stroke={t.isNight ? cat.fg : 'none'}
                      strokeWidth={t.isNight ? 1 : 0}
                      opacity={b.current ? 1 : PAST_OPACITY}
                    />
                  ) : null,
                )
              : null}
            {kind === 'line' && g.points.length > 0 ? (
              <>
                {t.isNight ? null : (
                  <Polygon
                    points={areaPoints(g.points, g.baselineY)}
                    fill={cat.soft}
                    opacity={PAST_OPACITY}
                  />
                )}
                <Polyline
                  points={polylinePoints(g.points)}
                  fill="none"
                  stroke={cat.fg}
                  strokeWidth={t.isNight ? 1 : 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={PAST_OPACITY}
                />
                {g.points.map((p, i) => (
                  <Circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={i === g.currentIndex ? 4 : 2.5}
                    fill={t.isNight ? t.color.page : cat.fg}
                    stroke={cat.fg}
                    strokeWidth={t.isNight ? 1 : i === g.currentIndex ? 0 : 1}
                    opacity={i === g.currentIndex ? 1 : PAST_OPACITY}
                  />
                ))}
              </>
            ) : null}
          </Svg>
          {series.length > 0 ? (
            <Numeric
              variant="meta"
              ink="text2"
              style={[styles.overlay, { left: 0, top: Math.max(0, g.maxY - LABEL_HEIGHT - 2) }]}
            >
              {formatValue(g.max)}
            </Numeric>
          ) : null}
          {g.labelCurrent && current ? (
            <Numeric
              variant="meta"
              ink="text2"
              align="center"
              style={[
                styles.overlay,
                {
                  left: current.index * g.slot,
                  width: g.slot,
                  top: Math.max(0, current.y - LABEL_HEIGHT - 2),
                },
              ]}
            >
              {formatValue(series[current.index]?.v ?? 0)}
            </Numeric>
          ) : null}
          {formatTick
            ? g.tickIndexes.map(i => {
                const p = series[i];
                if (!p) return null;
                return (
                  <Numeric
                    key={i}
                    variant="meta"
                    ink="text2"
                    align="center"
                    style={[
                      styles.overlay,
                      { left: i * g.slot, width: g.slot, top: height - LABEL_HEIGHT - 2 },
                    ]}
                  >
                    {formatTick(p.t, i)}
                  </Numeric>
                );
              })
            : null}
          <Label style={[styles.overlay, styles.unit]}>{unit}</Label>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute' },
  unit: { right: 0, top: 0 },
});
