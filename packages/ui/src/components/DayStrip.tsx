/**
 * DayStrip — a day as a line from midnight to midnight, with what happened in it drawn where it
 * happened: a dot for each feed, a block for each sleep, the drop and the pile for each change
 * (Reports' lead cards, 2026-09-26; `dayStrip.ts` has the arithmetic and why it is a strip).
 *
 * IT IS A PICTURE, NOT A CHART. There is no axis on it and no number in it: the sentence beside it
 * says how many and how long, and the strip says when. The caller draws the hour words once under a
 * card's strips (`DayAxis`), so three strips read against one clock.
 *
 * NIGHT DRAWS NO FILLS, as `DayBars` does not: a 1 pt edge in the hue, on the amber screen that
 * exists to keep a dark room dark. A sleep still being timed is drawn open — its soft tint inside a
 * hued edge — and the sentence beside it says "asleep now", so the difference is never the color
 * alone.
 *
 * ONE ACCESSIBLE IMAGE, named by the caller in words ("7 feeds today, from 12:40 a.m. to 8:15
 * a.m."), and nothing inside it is read out: a screen reader hears the day, not forty rectangles.
 */
import { useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { categoryColors, useTheme, type CategoryRole } from '../theme/ThemeProvider';
import {
  axisLabelsShown,
  DAY_AXIS_HOURS,
  DAY_AXIS_LABELS,
  DAY_STRIP,
  marksHeight,
  placeMarks,
  stripBlock,
  stripX,
  type StripDay,
} from './dayStrip';
import { Meta } from './Text';

export * from './dayStrip';

export interface DayStripSpan {
  fromMs: number;
  toMs: number;
  /** Still being timed: drawn open, and said so in the caller's words. */
  running?: boolean;
}

export interface DayStripMark {
  atMs: number;
  /** The glyphs this mark is drawn as, side by side; a plain dot without. */
  glyphs?: readonly IconName[];
}

export interface DayStripProps {
  day: StripDay;
  /** Today's strip marks where now is; a past day has no now. */
  nowMs?: number | undefined;
  spans?: readonly DayStripSpan[];
  marks?: readonly DayStripMark[];
  role: CategoryRole;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function DayStrip({
  day,
  nowMs,
  spans = [],
  marks = [],
  role,
  accessibilityLabel,
  style,
  testID,
}: DayStripProps) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };
  const { fg, soft } = categoryColors(t.color, role);
  const glyphed = marks.some(m => (m.glyphs?.length ?? 0) > 0);
  const size = glyphed ? DAY_STRIP.glyph : DAY_STRIP.dot;
  const widthOf = (m: DayStripMark): number => {
    const n = m.glyphs?.length ?? 0;
    return n === 0 ? DAY_STRIP.dot : n * DAY_STRIP.glyph + (n - 1) * DAY_STRIP.gap;
  };
  const placed = placeMarks(
    marks.map(m => stripX(m.atMs, day, width)),
    marks.map(widthOf),
    width,
  );
  const lanes = marks.length === 0 ? 1 : Math.max(1, ...placed.map(p => p.lane + 1));
  const height = marks.length > 0 ? marksHeight(size, lanes) : DAY_STRIP.block + 2 * DAY_STRIP.tick;
  // the hairline runs through the middle of the bottom lane, or of the blocks
  const lineY = marks.length > 0 ? height - size / 2 : height / 2;
  const nowX =
    nowMs !== undefined && nowMs > day.startMs && nowMs < day.endMs
      ? stripX(nowMs, day, width)
      : null;
  const edge = t.isNight ? { borderWidth: 1, borderColor: fg } : null;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
      style={[{ height }, style]}
      {...(testID ? { testID } : {})}
    >
      {width > 0 ? (
        <View
          style={StyleSheet.absoluteFill}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {/* the day: one hairline, and a small tick at six, noon and six */}
          <View style={[styles.line, { top: lineY - 0.5, backgroundColor: t.color.line }]} />
          {DAY_AXIS_HOURS.slice(1).map(h => (
            <View
              key={h}
              style={[
                styles.tick,
                {
                  left: (h / 24) * width - 0.5,
                  top: lineY - DAY_STRIP.tick / 2,
                  height: DAY_STRIP.tick,
                  backgroundColor: t.color.line2,
                },
              ]}
            />
          ))}
          {spans.map((s, i) => {
            const block = stripBlock(s.fromMs, s.toMs, day, width);
            if (block === null) return null;
            return (
              <View
                key={`s${String(i)}`}
                style={[
                  styles.block,
                  {
                    left: block.x,
                    width: block.w,
                    top: lineY - DAY_STRIP.block / 2,
                    height: DAY_STRIP.block,
                    borderRadius: DAY_STRIP.block / 2,
                    backgroundColor: t.isNight ? 'transparent' : s.running ? soft : fg,
                  },
                  s.running ? { borderWidth: 1, borderColor: fg } : edge,
                ]}
              />
            );
          })}
          {marks.map((m, i) => {
            const at = placed[i];
            if (at === undefined) return null;
            const top = height - size - at.lane * (size + DAY_STRIP.laneGap);
            const glyphs = m.glyphs ?? [];
            return glyphs.length === 0 ? (
              <View
                key={`m${String(i)}`}
                style={[
                  styles.dot,
                  {
                    left: at.x,
                    // a plain dot among glyphs (a change saved without a kind) sits on the line too
                    top: top + (size - DAY_STRIP.dot) / 2,
                    width: DAY_STRIP.dot,
                    height: DAY_STRIP.dot,
                    borderRadius: DAY_STRIP.dot / 2,
                    backgroundColor: t.isNight ? 'transparent' : fg,
                  },
                  edge,
                ]}
              />
            ) : (
              <View
                key={`m${String(i)}`}
                style={[styles.glyphs, { left: at.x, top, gap: DAY_STRIP.gap }]}
              >
                {glyphs.map((g, n) => (
                  <Icon key={`${g}${String(n)}`} name={g} size={DAY_STRIP.glyph} color={fg} />
                ))}
              </View>
            );
          })}
          {nowX === null ? null : (
            <View
              style={[
                styles.now,
                { left: Math.min(width - 1, nowX), height, backgroundColor: t.color.text3 },
              ]}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

/**
 * THE HOUR WORDS UNDER A CARD'S STRIPS — midnight, six, noon, six — drawn once for all of them, and
 * only as many as fit without touching at this width and text size (`axisLabelsShown`).
 */
export function DayAxis({ style, testID }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };
  const shown = axisLabelsShown(width, t.fontScale.chrome);
  return (
    <View
      onLayout={onLayout}
      style={[styles.axis, style]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      {...(testID ? { testID } : {})}
    >
      {width > 0
        ? DAY_AXIS_LABELS.map((label, i) =>
            shown[i] ? (
              <Meta
                key={label}
                ink="text2"
                numberOfLines={1}
                style={[
                  styles.axisLabel,
                  i === 0
                    ? { left: 0 }
                    : {
                        // centered on its hour, in a box half the strip wide so a word is never
                        // cut by its own box; `axisLabelsShown` has already kept the words apart
                        left: ((DAY_AXIS_HOURS[i] ?? 0) / 24) * width - width / 4,
                        width: width / 2,
                        textAlign: 'center',
                      },
                ]}
              >
                {label}
              </Meta>
            ) : null,
          )
        : null}
      {/* holds the row's height for one line of words, whatever is shown */}
      <Meta style={styles.axisSpacer}> </Meta>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { position: 'absolute', left: 0, right: 0, height: 1 },
  tick: { position: 'absolute', width: 1 },
  block: { position: 'absolute' },
  dot: { position: 'absolute' },
  glyphs: { position: 'absolute', flexDirection: 'row' },
  now: { position: 'absolute', top: 0, width: 1 },
  axis: { position: 'relative' },
  axisLabel: { position: 'absolute', top: 0 },
  axisSpacer: { opacity: 0 },
});
