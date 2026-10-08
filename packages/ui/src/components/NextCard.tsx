/**
 * NextCard (docs/DESIGN_SYSTEM.md §5 "the NEXT card", §2 "Gradients"): what is coming up — a
 * 42pt icon chip, a title and a line under it, and the time on the right in mono with a small
 * word beneath ("in 18m", "due now"). `rich` puts the card on the brand gradient, which the
 * palette allows only for a due item, the FAB, the CTA and a running timer; the chip on a rich
 * card is the gradient's ink at 18% behind the glyph, drawn as a layer rather than an rgba
 * string so the token stays the token. The optional action is a small pill that stays solid
 * whatever the skin (§13 rule 1).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { composite } from '../theme/contrast';
import { categoryColors, useTheme, type CategoryRole } from '../theme/ThemeProvider';
import { Button } from './Button';
import { shadowFor, Surface } from './Surface';
import { BodySm, BodyStrong, Meta, Numeric } from './Text';

export const NEXT_CHIP = 42;

export interface NextCardProps {
  icon: IconName;
  /** The category hue of the chip; omitted = the quiet "nothing due" chip on surface2. */
  tint?: CategoryRole;
  title: string;
  subtitle?: string;
  /** The clock or countdown, mono ("8:30 PM"). */
  rightBig?: string;
  /** "in 18m" · "due now". */
  rightSmall?: string;
  /** The brand gradient: a due item, and only that. */
  rich?: boolean;
  onPress?: () => void;
  action?: { label: string; onPress: () => void };
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function NextCard({
  icon,
  tint,
  title,
  subtitle,
  rightBig,
  rightSmall,
  rich = false,
  onPress,
  action,
  accessibilityLabel,
  style,
  testID,
}: NextCardProps) {
  const t = useTheme();
  const cat = tint ? categoryColors(t.color, tint) : null;
  const ink = rich ? (t.isNight ? t.color.text : t.onGradient) : t.color.text;
  const ink2 = rich ? ink : t.color.text2;
  // icon holders are circles everywhere except the Cards shape, which keeps the soft square (§16.3)
  const chipRadius = NEXT_CHIP / 2;
  const spoken =
    accessibilityLabel ??
    [title, subtitle, [rightBig, rightSmall].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  const inner = (
    <View style={[styles.row, { gap: t.space.lg }]}>
      <View
        style={[
          styles.chip,
          {
            borderRadius: chipRadius,
            // on a rich card the chip is the ink at 18% over the brand gradient, composited to
            // an opaque color against the gradient's accent, so the token stays the token and
            // the chip is one plain view. (It throws no shadow, so an rgba fill would be sound
            // too: the polygon the geometry lab's bubble C drew was its PARENT's elevation
            // shadow showing through an rgba child, not the rgba — shadows.ts.)
            backgroundColor: rich
              ? composite(t.color.accent, ink, 0.18)
              : (cat?.soft ?? t.color.surface2),
          },
        ]}
      >
        <Icon name={icon} size={21} color={rich ? ink : (cat?.fg ?? t.color.text2)} />
      </View>
      <View
        style={styles.body}
        accessible={!onPress}
        {...(!onPress ? { accessibilityLabel: spoken } : {})}
      >
        <BodyStrong color={ink}>{title}</BodyStrong>
        {subtitle ? <BodySm color={ink2}>{subtitle}</BodySm> : null}
      </View>
      {rightBig || rightSmall ? (
        <View style={styles.right}>
          {rightBig ? (
            <Numeric variant="bodyStrong" color={ink} align="right">
              {rightBig}
            </Numeric>
          ) : null}
          {rightSmall ? (
            <Meta color={ink2} align="right">
              {rightSmall}
            </Meta>
          ) : null}
        </View>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          size="sm"
          variant={rich ? 'secondary' : 'primary'}
        />
      ) : null}
    </View>
  );

  const card = rich ? (
    <View
      style={[
        styles.rich,
        { borderRadius: t.radius.m, padding: t.space.xl },
        shadowFor(t.skinTokens.surface, t.color.accent, t.isNight),
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      <LinearGradient
        colors={[...t.gradient.brand]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: t.radius.m }]}
      />
      {inner}
    </View>
  ) : (
    <Surface
      radius="m"
      {...(cat ? { hue: cat.fg } : {})}
      style={[{ padding: t.space.xl }, style]}
      {...(testID ? { testID } : {})}
    >
      {inner}
    </Surface>
  );

  if (!onPress) return card;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      style={({ pressed }) => [styles.press, { opacity: pressed ? 0.92 : 1 }]}
    >
      {card}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  chip: {
    width: NEXT_CHIP,
    height: NEXT_CHIP,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  body: { flex: 1, minWidth: 0 },
  right: { alignItems: 'flex-end', flexShrink: 0 },
  rich: { overflow: 'visible' },
  press: { alignSelf: 'stretch' },
});
