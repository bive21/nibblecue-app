/**
 * EmptyState (docs/DESIGN_SYSTEM.md §5, §9; docs/MOBILE.md §4): honest copy, one action, no
 * spinner over stale data. A plain Surface with a 28 px glyph, a bold title, a short body and
 * at most one secondary button — the caller writes what is true ("Nothing logged today"), and
 * this component never invents a cheerful line. The glyph is `text2`, not the `text3` the
 * earlier spec named: `text3` is for non-text only and a glyph that means something on an
 * otherwise empty card is the one thing on it a person reads (§12 rule 6).
 *
 * `art` is a picture in the glyph's place, for an empty state that has one of its own — the
 * shopping list's empty cart (`EmptyCart`, 2026-09-26). The glyph is the default; `icon` stays
 * required, so a caller that drops its picture still has a glyph to fall back on.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Surface } from './Surface';
import { BodySm, BodyStrong } from './Text';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  body: string;
  cta?: { label: string; onPress: () => void };
  /** A picture drawn where the glyph would be. */
  art?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const GLYPH = 28;

export function EmptyState({ icon, title, body, cta, art, style, testID }: EmptyStateProps) {
  const t = useTheme();
  return (
    <Surface radius="m" style={[{ padding: t.space.xxl }, style]} {...(testID ? { testID } : {})}>
      {/* The column is its own View: Surface wraps children in a content View, so `gap` and
          `alignItems` on the Surface would apply to that one wrapper and never reach the rows. */}
      <View style={[styles.column, { gap: t.space.md }]}>
        <View style={{ marginBottom: t.space.xs }}>
          {art ?? <Icon name={icon} size={GLYPH} color={t.color.text2} />}
        </View>
        <BodyStrong align="center">{title}</BodyStrong>
        <BodySm align="center" style={styles.body}>
          {body}
        </BodySm>
        {cta ? (
          <Button
            label={cta.label}
            onPress={cta.onPress}
            variant="secondary"
            style={{ marginTop: t.space.md }}
          />
        ) : null}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center' },
  body: { maxWidth: 300 },
});
