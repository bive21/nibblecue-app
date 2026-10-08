/**
 * NameTag — WHOSE A ROW IS, AS A SMALL LABEL BESIDE WHAT IT IS ABOUT (the owner, 2026-09-30, of
 * Today's log on Both: *"The baby name should be a label next to the module name (diaper, bottle).
 * Makes it easier to see and save the row space"*; and of Up next and the Schedule on Both: *"it
 * still should say for who even for both?"*).
 *
 * A pill in the neutral tone, the name as written in the `meta` face, its ink measured on its fill
 * (`badgeColors`), so it reads in every look the badges do. Never the badge's capitals: a name is
 * not a status, and "CHICHI" beside "DUE NOW" would read as one more state. One component, so the
 * Log's rows, Up next's rows and the Schedule's slots all say whose it is the same way.
 *
 * Presentation only: every caller already says whose in the row's own spoken sentence, so the tag
 * is hidden from assistive technology rather than read twice.
 */
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { badgeColors } from './badge-tone';
import { Meta } from './Text';

export interface NameTagProps {
  /** The baby's name, or the Both chip's own word for a slot that is everyone's. */
  name: string;
  testID?: string;
}

export function NameTag({ name, testID }: NameTagProps) {
  const t = useTheme();
  const tag = badgeColors(t.color, 'neutral');
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.tag,
        {
          backgroundColor: tag.fill,
          borderRadius: t.radius.pill,
          paddingHorizontal: t.space.sm,
        },
      ]}
      {...(testID ? { testID } : {})}
    >
      <Meta color={tag.ink} numberOfLines={1}>
        {name}
      </Meta>
    </View>
  );
}

const styles = StyleSheet.create({
  // one point above and below the name: the pill stays inside the line height of the title beside it
  tag: { paddingVertical: 1, flexShrink: 0, maxWidth: '100%', alignSelf: 'center' },
});
