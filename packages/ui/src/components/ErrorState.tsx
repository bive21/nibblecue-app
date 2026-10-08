/**
 * ErrorState (docs/DESIGN_SYSTEM.md §5, §9; docs/MOBILE.md §4): says what happened and what
 * the app is doing about it — "We couldn't sync this yet. Your entry is saved on this phone and
 * we'll try again." — with one retry. The edge and the flag glyph are `crit`, which is a TEXT
 * role (§12 rule 3) and reads correctly as a hairline; nothing here puts white on it. The
 * flag and the word both carry the state, so it is never color alone. `detailForSupport` is a
 * short reference a parent can read out to support — an error code, a request id — set in
 * `meta`; a stack trace is never the body of anything.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Surface } from './Surface';
import { BodySm, BodyStrong, Meta } from './Text';

export interface ErrorStateProps {
  title: string;
  body: string;
  onRetry: () => void;
  /** A reference for support, never a stack trace. */
  detailForSupport?: string;
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const GLYPH = 22;

export function ErrorState({
  title,
  body,
  onRetry,
  detailForSupport,
  retryLabel = 'Try again',
  style,
  testID,
}: ErrorStateProps) {
  const t = useTheme();
  return (
    <Surface
      radius="m"
      hue={t.color.crit}
      style={[{ padding: t.space.xl, borderColor: t.color.crit }, style]}
      {...(testID ? { testID } : {})}
    >
      {/* The column is its own View: Surface wraps children in a content View, so a `gap` on
          the Surface would space that one wrapper and never the rows. */}
      <View style={[styles.column, { gap: t.space.md }]}>
        <View accessibilityLiveRegion="polite" style={[styles.head, { gap: t.space.md }]}>
          <Icon name="flag" size={GLYPH} color={t.color.crit} />
          <BodyStrong style={styles.grow}>{title}</BodyStrong>
        </View>
        <BodySm>{body}</BodySm>
        {detailForSupport ? (
          <Meta selectable accessibilityLabel={`Reference for support: ${detailForSupport}`}>
            {detailForSupport}
          </Meta>
        ) : null}
        <Button
          label={retryLabel}
          onPress={onRetry}
          variant="secondary"
          style={{ marginTop: t.space.xs }}
        />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
});
