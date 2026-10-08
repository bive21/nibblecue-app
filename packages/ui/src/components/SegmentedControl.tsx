/**
 * SegmentedControl (docs/DESIGN_SYSTEM.md §5, §16.4; docs/MOBILE.md §4): pick one of a few. The
 * track is `surface2` in a pill; the chosen option is the solid surface with the text ink in the
 * bold face and a hairline around it, and the others are `text2` — never `text3`, which cannot
 * clear 4.5:1 at this size (§13 "Tab labels"). Fill, weight, outline and a11y state are four
 * signals, so the choice is never color alone. A locked option shows its lock before the tap and
 * still fires `onChange`, so the caller can open the paywall.
 *
 * EVERY OPTION IS ITS OWN PILL, SIZED TO ITS OWN LABEL, AND THE ROW WRAPS.
 *
 * It used to be one track divided into equal cells (`flex: 1`), which is the classic segmented
 * control and is wrong the moment the labels are words rather than one word. Four options on a
 * phone gave each a quarter of the screen, and "Something else" came out as `Somet / hing /
 * else` — three lines, mid-word, inside a pill built for one (the owner, 2026-09-16, with a
 * screenshot: "the purple box with selection needs rework. You make a circle for each selection
 * and prevent 'something else' to happen when it's too full and there is no space. This looks
 * very bad").
 *
 * The fix is two rules and no measurement:
 *  - `flexShrink: 0` on every option, so a pill is never squeezed below the width of its own
 *    label. There is no width at which a word can break.
 *  - `flexWrap: 'wrap'` always, so an option that does not fit the line takes the next one. The
 *    labels are still centered and still share a line evenly (`flexGrow: 1`) when they do fit,
 *    which is what keeps a two- or three-word control looking like a segmented control.
 *
 * `wrap` is therefore not a prop any more: wrapping is not a thing a caller should have to know
 * to ask for, and every caller that forgot to ask got the broken layout.
 *
 * NO SHADOW UNDER THE CHOSEN PILL. It used to take the card elevation, and on Android an
 * elevation is drawn OUTSIDE the box — a pale halo hanging past the track's own edge, which is
 * the second half of what the screenshot showed. A solid fill with a hairline says "chosen" on
 * every skin and casts nothing.
 *
 * A CHOICE IS FELT (the owner, 2026-09-25, of the "that's cool" list: "Let's try doing
 * everything"): a `tap` when a new pill is chosen, a `warning` for a locked one — which still
 * reports, so the caller can open the gate — and nothing for the pill already chosen, which
 * reports nothing either (`feedback/choice.ts`). Each is also on the screen: the fill and the
 * outline move, or the gate opens over a lock that was drawn before the tap.
 *
 * `stacked` PUTS EACH OPTION'S PICTURE OVER ITS WORD (the owner, 2026-09-26, of the thermometer's
 * method: *"add icons on axillary forehead ear rectal perhaps. because some user (me included) dont
 * know without googling what axillary is or rectal"*). Inline, a glyph is 14 pt beside its word —
 * right for a lock or a small mark, too small for a picture that has to SAY something ("an arm with
 * the armpit marked"). Stacked, it is `STACKED_ICON` over the word, the option a rounded tile rather
 * than a pill, and every other rule holds: sized to its word, never squeezed, the row wraps.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { feelChoice } from '../feedback/choice';
import { Icon, type IconProps } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useAccent } from '../theme/useAccent';
import { AppText } from './Text';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconProps['name'];
  /** A picture of the option's own in place of `icon` (the bottle's breast milk, 2026-10-06). */
  glyph?: ReactNode;
  /**
   * A site color for a stacked picture, and the soft wash behind it. It names which option this
   * is. It is not a reading: a temperature tile stays this color at every number.
   */
  tint?: string;
  tintSoft?: string;
  locked?: boolean;
  accessibilityLabel?: string;
}

/** A stacked option's picture, in points: big enough to be read as a picture, not a mark. */
export const STACKED_ICON = 22;

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  /** Each option's icon over its word (see the header), for a choice its pictures explain. */
  stacked?: boolean;
  value: T;
  onChange: (value: T) => void;
  /**
   * A tap on the option already chosen. Most switches ignore it; one whose options are also doors
   * (the pump's Store milk and Log feed, which open page 2) goes through it again (2026-10-06).
   */
  onReselect?: (value: T) => void;
  /** The group's name ("Diaper kind"): a radiogroup without one is a row of unlabeled radios. */
  label: string;
  /**
   * `accent` paints the chosen pill in the household's own accent with the on-accent ink, for a
   * switch that IS the form's question (the pump's Start timer / Log finished and its three
   * purposes, the owner's pumping redesign of 2026-10-05). Fill, weight and a11y state still say
   * which is chosen, so it is never color alone. Default `surface`: every other switch as it was.
   */
  tone?: 'surface' | 'accent';
  /** `compact` trims the track to the 34–36 pt of a secondary switch beside a heading. */
  compact?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SegmentedControl<T extends string>({
  options,
  stacked = false,
  value,
  onChange,
  onReselect,
  label,
  tone = 'surface',
  compact = false,
  disabled = false,
  style,
  testID,
}: SegmentedControlProps<T>) {
  const t = useTheme();
  // the accent tone takes the derived pair, whose ink drops to the text ink where white fails AA
  const a = useAccent();
  const accent = tone === 'accent';
  // stacked, the track and its options are rounded tiles, the options' corners concentric with it
  const trackRadius = stacked ? t.radius.l : t.radius.pill;
  const optionRadius = stacked ? Math.max(t.radius.l - t.space.xs, t.radius.s) : t.radius.pill;
  // 36 inside the 4pt track: the slop reaches the track edge, and half the gap to a neighbor
  // compact, the pill is 28: the slop takes it to the 44 target above and below
  const vSlop = compact ? 8 : t.space.xs;
  const slop = {
    top: vSlop,
    bottom: vSlop,
    left: t.space.xs / 2,
    right: t.space.xs / 2,
  };
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[
        styles.track,
        {
          borderRadius: trackRadius,
          // the accent tone's track is the accent's own wash: on a log sheet, the module's soft
          // color (the owner, 2026-10-06: "background color to also soft module color")
          backgroundColor: accent ? t.color.accentSoft : t.color.surface2,
          borderColor: t.color.line,
          padding: compact ? 2 : t.space.xs,
          gap: compact ? 2 : t.space.xs,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      {options.map(o => {
        const on = o.value === value;
        const ink = on ? (accent ? a.onAccent : t.color.text) : t.color.text2;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            {...(o.locked ? { accessibilityHint: 'Included with Plus' } : {})}
            accessibilityState={{ checked: on, selected: on, disabled }}
            disabled={disabled}
            onPress={() => {
              feelChoice({ locked: o.locked === true, current: on, kind: 'tap' });
              if (!on) onChange(o.value);
              else onReselect?.(o.value);
            }}
            hitSlop={slop}
            // one id per option, so a flow can tap "auth.mode.create" rather than a coordinate
            {...(testID ? { testID: `${testID}.${o.value}` } : {})}
            style={({ pressed }) => [
              styles.option,
              stacked ? styles.stacked : null,
              {
                minHeight: compact ? 28 : t.hit.min - 2 * t.space.xs,
                borderRadius: optionRadius,
                paddingHorizontal: t.space.md,
                ...(stacked ? { paddingVertical: t.space.sm } : {}),
                gap: stacked ? 2 : t.space.xs,
                backgroundColor: on ? (accent ? a.accent : t.color.surfaceSolid) : 'transparent',
                // the outline is the fourth signal, and the one that survives a palette where
                // the solid surface and the track sit close together
                borderColor: on ? (accent ? a.accent : t.color.line) : 'transparent',
                opacity: pressed && !on ? 0.7 : 1,
              },
            ]}
          >
            {o.glyph ??
              (o.icon ? (
                <View
                  style={
                    stacked && o.tintSoft
                      ? {
                          backgroundColor: o.tintSoft,
                          borderRadius: t.radius.pill,
                          padding: 4,
                        }
                      : undefined
                  }
                >
                  <Icon name={o.icon} size={stacked ? STACKED_ICON : 14} color={o.tint ?? ink} />
                </View>
              ) : null)}
            {/* ONE LINE, ALWAYS. The pill is sized to the label (`flexShrink: 0` below), so
                this can never truncate — it is here so that a font scale the pill cannot grow
                to absorb ends in a clipped line rather than a broken word. */}
            <AppText
              variant={on ? 'bodyStrong' : 'bodySm'}
              color={ink}
              align="center"
              numberOfLines={1}
              style={{ fontSize: t.type.bodySm.fontSize, lineHeight: t.type.bodySm.lineHeight }}
            >
              {o.label}
            </AppText>
            {o.locked ? <Icon name="lock" size={12} color={ink} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, flexWrap: 'wrap' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    // GROW TO SHARE A LINE, NEVER SHRINK BELOW THE LABEL. `flexShrink: 0` is the whole fix:
    // with it there is no width at which "Something else" can be squeezed into three broken
    // lines — the pill keeps its own width and the row wraps instead.
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
  },
  // the picture over the word; the lock, where there is one, under both
  stacked: { flexDirection: 'column' },
});
