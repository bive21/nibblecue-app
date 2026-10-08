/**
 * Badge (docs/DESIGN_SYSTEM.md §5, §8, §12 rules 6 and 7): a status word in the mono uppercase
 * `badge` role on the tone's soft companion. It ALWAYS carries text — "queued", "due", "past
 * best use" — because status is never color alone, and its ink is measured on its fill
 * (badge-tone.ts) because a badge is the smallest text in the system. Pill geometry: a badge is
 * a value, not a surface (§16.4). A filled control is never frosted (§13 rule 1), so the fill is
 * the opaque token whatever the skin. Enum values never reach `label` raw (§21): the caller
 * passes the rewritten word.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconProps } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { badgeColors, type BadgeTone } from './badge-tone';
import { AppText } from './Text';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** A small leading glyph (a clock on "queued", a lock on "plus"). The word stays. */
  icon?: IconProps['name'];
  /** When the word alone is not the whole story for a screen reader ("Queued, waiting for sync"). */
  accessibilityLabel?: string;
  /**
   * THE ACCENT AS THE FILL, the `onAccent` ink on it — for the one status that is the thing to
   * tap right now (Up next's "Due now", the Today polish brief of 2026-09-20). Every other tone
   * is a soft companion with a measured ink; this is the token pair the gate verifies for a
   * control, used once, on the row that is a control's whole point.
   */
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Badge({
  label,
  tone = 'neutral',
  icon,
  accessibilityLabel,
  filled = false,
  style,
  testID,
}: BadgeProps) {
  const t = useTheme();
  const pair = badgeColors(t.color, tone);
  const fill = filled ? t.color.accent : pair.fill;
  const ink = filled ? t.color.onAccent : pair.ink;
  return (
    <View
      {...(accessibilityLabel ? { accessible: true, accessibilityLabel } : {})}
      style={[
        styles.box,
        {
          backgroundColor: fill,
          borderRadius: t.radius.pill,
          paddingHorizontal: t.space.sm,
          paddingVertical: t.space.xs,
          gap: t.space.xs,
        },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      {icon ? <Icon name={icon} size={10} color={ink} /> : null}
      <AppText variant="badge" color={ink}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
});
