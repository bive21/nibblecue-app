/**
 * Chip (docs/DESIGN_SYSTEM.md §5, §15.3, §16.4): a pill, because a chip is a CHOICE AMONG A FEW —
 * time presets, diaper kinds, filters. Selected is the flat accent with `onAccent` ink (never the
 * gradient: §11 keeps `onAccent` for the flat accent) AND a check glyph AND the bold face, so the
 * state survives color blindness and bright sun (§12 rule 7). The resting label is `text2`, the
 * floor for anything a person taps (§12 rule 5). The resting pill is the prototype's `.pill`:
 * the SOLID surface with a `line2` edge under Soft and Paper (the translucent `surface` token is
 * a 5.5% wash in the dark theme, not a pill), and the skin's frosted material — the same
 * Surface a card is made of — where the skin frosts (§13: glass frosts every pill that is not
 * filled). The selected pill is a filled control and is never frosted (§13 rule 1). The pill
 * is 34pt (28 small) and reaches the 44pt target through vertical hitSlop, so a chip row keeps
 * its density (docs/MOBILE.md §8); across, it is never narrower than 44 — a chip row is
 * scrubbed along that axis, and horizontal slop would overlap the neighbor. `locked` shows the
 * gate before it is tapped (CLAUDE.md §4): the lock glyph and a hint; the press still fires so
 * the caller can open the paywall.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconProps } from '../icons/Icon';
import { AA_GRAPHIC, composite, contrastRatio } from '../theme/contrast';
import { useTheme } from '../theme/ThemeProvider';
import { useAccent } from '../theme/useAccent';
import { Surface } from './Surface';
import { AppText } from './Text';

export interface ChipProps {
  label: string;
  onPress: () => void;
  selected?: boolean;
  small?: boolean;
  /**
   * THE SMALL PILL WITH ITS SIDES TAKEN IN — for the time row, which must hold four chips and a
   * clock on ONE line at 360 dp (the owner, 2026-09-26: "the options should show in 1 row"). The
   * height, the 44pt reach and the 44pt minimum width are the small pill's; only the air beside the
   * words and between the check and the words is less. Implies `small`.
   */
  compact?: boolean;
  /**
   * A TIME PRESET (the owner's regression handoff, 2026-10-06): Now · −15m · −30m ·
   * Custom, and the families that share its look — a timer's −5m · −10m · Custom, a
   * pump's end, pumped milk's Today · Yesterday · Pick a date. One drawing for all of them so they
   * cannot drift apart again: a content-wide pill about 30 tall, 10 of air beside the words, the
   * words at 13. Resting, it is the scheme's own soft tint with a fine edge of the same hue and the
   * page's ink, so it never reads as a white pill vanishing into a white sheet, nor as a hole in a
   * module's tinted group; chosen, it is the accent filled with its check. Implies `compact`'s
   * reach: the 44 target is the slop above and below, never sideways into a neighbor.
   */
  preset?: boolean;
  /** A leading glyph; replaced by the check while selected. */
  icon?: IconProps['name'];
  /**
   * A DRAWING IN THE GLYPH'S PLACE, for a choice whose picture is artwork rather than a stroke
   * icon — the storage places the owner drew (2026-09-19). It replaces `icon` and takes no ink
   * of its own: an illustration carries its own palette, and a category tint over one would be
   * a tinted rectangle. The check still wins while the chip is selected.
   */
  iconNode?: ReactNode;
  /**
   * DRAW THE GLYPH ALONE, and keep `label` as the accessible name.
   *
   * For a chip in a row whose other chips are the CHOICE and this one is a door — the overnight
   * setting beside "every 2h, every 3h, every 4h" (the owner, 2026-09-19: "replace night with
   * just the moon logo (in theme color)"). A word there reads as a fifth interval; the glyph
   * reads as a setting, and the row fits on one line, which is the whole point of the change.
   *
   * It is never used for a chip that can be SELECTED: a selected chip swaps its glyph for the
   * check, which on an icon-only pill would leave a tick with nothing to say what was ticked.
   * The glyph takes the accent rather than the chip's ink, because a door in a row of choices is
   * the one thing on it that should not look like an unmade decision.
   */
  iconOnly?: boolean;
  /**
   * THE PILL'S HEIGHT, for a chip that ends a row of taller choices — `Choose…` after the bottle
   * sheet's stash picks (the owner, 2026-10-06: the row read unbalanced with a 28 pill beside 44
   * picks). It still reaches 44 through the slop above and below.
   */
  height?: number;
  /** The choice is behind Plus: a lock glyph and a hint, before the tap. */
  locked?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const HEIGHT = 34;
const HEIGHT_SMALL = 28;
const HEIGHT_PRESET = 30;
/** A preset's air beside its words (9–11 in the handoff; 9, so the timer-start row still fits one line at 390). */
const PRESET_PAD_X = 9;
/** The pill's edge, 1pt on every material it takes; its height includes the edge. */
const EDGE = 1;
/** A resting preset's fine edge: the accent a little stronger than its tint, the same hue. */
const PRESET_EDGE = 0.3;

export function Chip({
  label,
  onPress,
  selected = false,
  small: smallAsked = false,
  compact: compactAsked = false,
  preset = false,
  icon,
  iconNode,
  iconOnly = false,
  height: heightAsked,
  locked = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ChipProps) {
  const t = useTheme();
  const a = useAccent();
  const compact = compactAsked || preset;
  const small = smallAsked || compact;
  const height = heightAsked ?? (preset ? HEIGHT_PRESET : small ? HEIGHT_SMALL : HEIGHT);
  const slop = Math.max(0, Math.ceil((t.hit.min - height) / 2));
  const ink = selected
    ? preset
      ? a.onAccent
      : t.color.onAccent
    : preset
      ? t.color.text
      : t.color.text2;
  const glyph = small ? 12 : 14;
  const hint = accessibilityHint ?? (locked ? 'Included with Plus' : undefined);
  // the skin's material frosts the resting pill; the filled (selected) pill never frosts
  // a preset keeps its tint on every skin: frosted, it would be the white pill it replaced
  const frosted = !selected && !preset && t.skinTokens.surface.blur > 0;
  // an icon-only chip is square-ish rather than pill-wide, and its glyph carries the accent
  const bare = iconOnly && icon !== undefined && !selected;
  const inner: ReactNode = (
    <View
      style={[
        styles.inner,
        {
          minHeight: height - 2 * EDGE,
          minWidth: t.hit.min - 2 * EDGE,
          paddingHorizontal: bare
            ? t.space.md
            : preset
              ? PRESET_PAD_X - EDGE
              : compact
                ? t.space.sm
                : small
                  ? t.space.lg
                  : t.space.xl,
          gap: bare ? 0 : compact ? t.space.xs : t.space.sm,
        },
      ]}
    >
      {selected ? (
        <Icon name="check" size={glyph} color={ink} />
      ) : iconNode ? (
        iconNode
      ) : icon ? (
        <Icon name={icon} size={bare ? glyph + 3 : glyph} color={bare ? t.color.accent : ink} />
      ) : null}
      {bare ? null : (
        <AppText
          variant={selected ? 'bodyStrong' : 'bodySm'}
          color={ink}
          style={{ fontSize: t.type.bodySm.fontSize, lineHeight: t.type.bodySm.lineHeight }}
        >
          {label}
        </AppText>
      )}
      {locked && !selected ? <Icon name="lock" size={glyph} color={ink} /> : null}
    </View>
  );
  /*
    A PASTEL ACCENT GETS AN EDGE IN ITS INK (a log sheet's soft module colors, 2026-10-06): a chosen
    chip filled with a pale pastel would sit apart from its neighbors by tint alone, so it is
    outlined in `accent2`, the accent's own words. A strong accent outlines itself, as before.
  */
  const chosenEdge =
    contrastRatio(a.accent, t.color.surfaceSolid) < AA_GRAPHIC ? t.color.accent2 : a.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(hint ? { accessibilityHint: hint } : {})}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop }}
      style={({ pressed }) => [{ opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
      {...(testID ? { testID } : {})}
    >
      {frosted ? (
        <Surface radius="pill" style={styles.pill}>
          {inner}
        </Surface>
      ) : (
        <View
          style={[
            styles.pill,
            styles.solid,
            {
              borderRadius: t.radius.pill,
              backgroundColor: preset
                ? selected
                  ? a.accent
                  : a.tint
                : selected
                  ? t.color.accent
                  : t.color.surfaceSolid,
              borderColor: preset
                ? selected
                  ? chosenEdge
                  : composite(t.color.surfaceSolid, a.accent, PRESET_EDGE)
                : selected
                  ? chosenEdge
                  : t.color.line2,
            },
          ]}
        >
          {inner}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start' },
  solid: { borderWidth: EDGE },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
