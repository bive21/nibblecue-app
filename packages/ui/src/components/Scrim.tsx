/**
 * Scrim (docs/DESIGN_SYSTEM.md §5 "BottomSheet", §14; docs/MOBILE.md §4): the full-screen
 * press-to-close layer under a sheet or a popover. It is the `text` ink at 45% opacity — a
 * View with a token background and an opacity, never an rgba string (§12 rule 1: a color is a
 * color on a ground, and the palette's ink is the ground-aware dark of each theme; in night it
 * is amber, so the scrim never introduces blue). A popover dims less than a sheet (§14: a
 * switch, not a trip to another screen), so the opacity is a prop with the sheet's value as
 * the default. It is a button named "Close" so a screen reader can leave without hunting for
 * the glyph — the sheet marks itself modal, so the scrim is reached only when the sheet's own
 * close button is not.
 */
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export const SCRIM_OPACITY = 0.45;
/** The lighter dim under a popover (the prototype's `.popscrim`). */
export const POPOVER_SCRIM_OPACITY = 0.18;

export interface ScrimProps {
  onPress: () => void;
  opacity?: number;
  accessibilityLabel?: string;
  testID?: string;
}

export function Scrim({
  onPress,
  opacity = SCRIM_OPACITY,
  accessibilityLabel = 'Close',
  testID,
}: ScrimProps) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[StyleSheet.absoluteFill, { backgroundColor: t.color.text, opacity }]}
      {...(testID ? { testID } : {})}
    />
  );
}
