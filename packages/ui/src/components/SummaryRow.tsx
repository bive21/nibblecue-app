/**
 * SummaryRow (docs/DESIGN_SYSTEM.md §5): the Today totals as 3-up tinted cells — milk / sleep /
 * diapers, then pumped / sessions / feeds when pumping is on. Six cells wrap to two rows of
 * three. The numerals are `statValue` — the role §4 names for summary values; the prototype's
 * 19 is not a token — and the cells are dense (the prototype's 11 side padding) so three
 * "4h 05m" fit across a 360 screen; at a large font scale the row collapses to two columns
 * rather than clipping a number (docs/MOBILE.md §9).
 */
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { StatCard, type StatTone } from './StatCard';

export interface SummaryCell {
  value: string;
  unit?: string;
  label: string;
  tone?: StatTone;
  accessibilityLabel?: string;
  onPress?: () => void;
}

export interface SummaryRowProps {
  /** 3 or 6, wrapping to two rows of three. */
  cells: SummaryCell[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Above this chrome font scale a 3-up row cannot hold a duration; it becomes 2-up. */
export const SUMMARY_TWO_UP_SCALE = 1.35;

export function SummaryRow({ cells, style, testID }: SummaryRowProps) {
  const t = useTheme();
  const twoUp = t.fontScale.chrome >= SUMMARY_TWO_UP_SCALE;
  return (
    <View
      style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md }, style]}
      {...(testID ? { testID } : {})}
    >
      {cells.map((c, i) => (
        <StatCard
          key={`${c.label}-${i}`}
          value={c.value}
          label={c.label}
          tone={c.tone ?? 'neutral'}
          dense
          {...(c.unit !== undefined ? { unit: c.unit } : {})}
          {...(c.accessibilityLabel !== undefined
            ? { accessibilityLabel: c.accessibilityLabel }
            : {})}
          {...(c.onPress ? { onPress: c.onPress } : {})}
          // flexBasis + grow: three cells share a row and a fourth wraps; two at a large scale
          style={{ flexGrow: 1, flexBasis: twoUp ? '44%' : '28%' }}
        />
      ))}
    </View>
  );
}
