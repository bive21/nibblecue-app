/**
 * IconButton (docs/DESIGN_SYSTEM.md §5): a 34pt circle on the surface with a hairline, reaching
 * 44 through hitSlop. The label is REQUIRED — an icon-only control without one is invisible to
 * everyone who cannot see it. `tone` paints the glyph from the accent or the danger ink.
 */
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconProps } from '../icons/Icon';

export interface IconButtonProps {
  icon: IconProps['name'];
  accessibilityLabel: string;
  onPress: () => void;
  tone?: 'default' | 'accent' | 'danger';
  /** 34 (chrome) by default; 44 for a stand-alone control. */
  size?: 34 | 44;
  /** Marks the button as the open state of what it toggles (a popover). */
  expanded?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  tone = 'default',
  size = 34,
  expanded,
  disabled,
  style,
  testID,
}: IconButtonProps) {
  const t = useTheme();
  const ink = tone === 'accent' ? t.color.accent : tone === 'danger' ? t.color.crit : t.color.text2;
  const slop = Math.max(0, (t.hit.min - size) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, ...(expanded !== undefined ? { expanded } : {}) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={slop}
      style={({ pressed }) => [{ opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}
      {...(testID ? { testID } : {})}
    >
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: t.color.surface,
            borderColor: t.color.line,
          },
        ]}
      >
        <Icon name={icon} size={size === 44 ? 20 : 17} color={ink} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
