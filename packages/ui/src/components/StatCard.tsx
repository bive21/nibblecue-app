/**
 * StatCard (docs/DESIGN_SYSTEM.md §5, docs/MOBILE.md §4): label / value / note on a tinted
 * cell. `tone` is a category role — the value takes the hue's ink on its soft tint, a pair the
 * palette tuned so a LARGE numeral clears 3:1 (§8) — or `neutral`, a plain surface with the
 * text ink. The unit and the note are small text, so they take `text2`, which clears 4.5:1 on
 * every tint (§12 rule 1); a category ink at meta size would not, and the hue is already on
 * the number. Read by a screen reader as one sentence, with the unit said in words.
 */
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { categoryColors, useTheme, type CategoryRole } from '../theme/ThemeProvider';
import { Surface } from './Surface';
import { Label, Meta, Numeric } from './Text';

export type StatTone = CategoryRole | 'neutral';

export interface StatCardProps {
  /** Already formatted for display ("4h 05m", "18.5"). */
  value: string;
  unit?: string;
  label: string;
  note?: string;
  tone?: StatTone;
  onPress?: () => void;
  /** Spoken instead of the visible parts (say units in words: "18.5 ounces"). */
  accessibilityLabel?: string;
  /** Tighter side padding for a 3-up row (SummaryRow): the numeral keeps its role and the cell gives up the room instead. */
  dense?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function StatCard({
  value,
  unit,
  label,
  note,
  tone = 'neutral',
  onPress,
  accessibilityLabel,
  dense = false,
  style,
  testID,
}: StatCardProps) {
  const t = useTheme();
  const cat = tone === 'neutral' ? null : categoryColors(t.color, tone);
  const spoken =
    accessibilityLabel ?? `${label}, ${value}${unit ? ` ${unit}` : ''}${note ? `, ${note}` : ''}`;
  const body = (
    <Surface
      radius="m"
      {...(cat ? { tint: cat.soft, hue: cat.fg } : {})}
      style={[
        { paddingVertical: t.space.lg, paddingHorizontal: dense ? t.space.lg : t.space.xl },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      <View
        style={{ gap: t.space.xs }}
        accessible={!onPress}
        {...(!onPress ? { accessibilityLabel: spoken } : {})}
      >
        <Label>{label}</Label>
        <View style={[styles.valueRow, { gap: t.space.xs }]}>
          <Numeric variant="statValue" {...(cat ? { color: cat.fg } : { ink: 'text' })}>
            {value}
          </Numeric>
          {unit ? (
            <Numeric variant="meta" ink="text2">
              {unit}
            </Numeric>
          ) : null}
        </View>
        {note ? <Meta>{note}</Meta> : null}
      </View>
    </Surface>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      style={({ pressed }) => [styles.press, { opacity: pressed ? 0.92 : 1 }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  valueRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  press: { alignSelf: 'stretch' },
});
