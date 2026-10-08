/**
 * Swatch (docs/DESIGN_SYSTEM.md §11 "Storage and application", §14, §17.4): one of the six color
 * schemes as a 31pt circle of its brand gradient. Its accessible name is "<Name> colors" and the
 * current one carries `selected`, so a screen reader hears the choice the eye sees. Selected is a
 * 2px ring in the text ink with a 2px inner ring in the solid surface — a mark that reads on every
 * gradient, never color alone (`choiceMarks`, the same marks the design tiles carry). `locked`
 * puts a lock glyph on a solid disc at the corner and says "Included with Plus" before the tap;
 * the press still fires so the caller can open the paywall. The circle sits centered in a 44pt
 * square, so neighbours in a row never share a hit area. Swatches preview in the active theme: the
 * caller passes the pair the resolver would paint (in night, its dim one).
 *
 * THE NAME IS INSIDE THE TARGET (`caption`; the owner, 2026-09-25: *"make it fit into a 1 row 4/5
 * options, remove the description text below the color name"*). The Appearance sheet's colors are
 * one row of disc-and-name cells now (`swatchRow.ts`), and the name under a disc belongs to the
 * same press as the disc: the whole cell — as wide as the row gives it, as tall as the disc and
 * its name — is one target and ONE focus stop. The name was a loose line of text under the button
 * before, which a screen reader read a second time after "Reef colors, button". The popover's row
 * of bare discs does not pass it and draws exactly what it drew.
 *
 * A STATUS WORD UNDER THE NAME (`badge`, 2026-09-28): the app's quiet "Plus" tag on the five sold
 * palettes during the 14-day preview, the design system's `Badge` under the caption, and part of the
 * swatch's spoken name ("Lilac colors, Plus"), as a `Row`'s badge is part of its. Never drawn on the
 * disc, where the lock goes: a swatch that works is not dressed as one that does not.
 *
 * A PRESS IS FELT (the owner, 2026-09-25, of the "that's cool" list: "Let's try doing
 * everything"): a `tap` for a new palette, a `warning` for a locked one — the lock is on the
 * disc before the tap, and the press still reports so the caller can open the gate — and nothing
 * for the palette already on, which moves nothing (`feedback/choice.ts`).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { feelChoice } from '../feedback/choice';
import { Icon } from '../icons/Icon';
import { choiceMarks } from '../theme/choiceMarks';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from './Badge';
import type { BadgeTone } from './badge-tone';
import { coverBorderBox } from './surfacePadding';
import { SWATCH_NAME } from './swatchRow';
import { AppText } from './Text';

/** The row's arithmetic, for a caller laying swatches out; it stays in `swatchRow.ts`. */
export { swatchRowLayout } from './swatchRow';

export interface SwatchProps {
  /** The scheme's brand gradient, light end first. */
  g1: string;
  g2: string;
  /** The scheme's display name ("Lilac"); the accessible name becomes "Lilac colors". */
  name: string;
  selected: boolean;
  onPress: () => void;
  locked?: boolean;
  disabled?: boolean;
  /**
   * Write `name` under the disc, inside the target. Off, the swatch is the bare 44pt square the
   * popover's row is built from.
   */
  caption?: boolean;
  /** The cell's width: the row's share (`swatchRowLayout`). Never below the 44pt target. */
  width?: number;
  /** A status word under the name, spoken after it (see the header). Only with `caption`. */
  badge?: { label: string; tone?: BadgeTone };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const SIZE = 31;
const RING = 2;
const LOCK_DISC = 18;

export function Swatch({
  g1,
  g2,
  name,
  selected,
  onPress,
  locked = false,
  disabled = false,
  caption = false,
  width,
  badge,
  style,
  testID,
}: SwatchProps) {
  const t = useTheme();
  const marks = choiceMarks(t.color);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={caption && badge ? `${name} colors, ${badge.label}` : `${name} colors`}
      {...(locked ? { accessibilityHint: 'Included with Plus' } : {})}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => {
        feelChoice({ locked, current: selected, kind: 'tap' });
        onPress();
      }}
      style={({ pressed }) => [
        styles.target,
        // a captioned swatch starts at the top of its cell: in a row where some carry a badge
        // under the name and some do not, every disc and every name stays level
        caption ? styles.captioned : null,
        {
          width: Math.max(t.hit.min, width ?? t.hit.min),
          minHeight: t.hit.min,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      <View style={[styles.box, { width: t.hit.min, height: t.hit.min }]}>
        <View
          style={[
            styles.disc,
            {
              width: SIZE,
              height: SIZE,
              borderRadius: SIZE / 2,
              borderWidth: RING,
              borderColor: selected ? marks.ring : 'transparent',
            },
          ]}
        >
          <LinearGradient
            colors={[g1, g2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            // absoluteFill is laid out against the padding box, inset by RING, so the gradient
            // would stop a ring short of the edge with a radius meant for the whole disc.
            // coverBorderBox covers the ring and grows the radius with the box: the gradient is
            // the whole disc and exactly a circle.
            style={[coverBorderBox(RING, SIZE / 2)]}
          />
          {selected ? (
            <View
              pointerEvents="none"
              style={[
                coverBorderBox(RING, SIZE / 2),
                { borderWidth: RING, borderColor: marks.ringGap },
              ]}
            />
          ) : null}
        </View>
        {locked ? (
          <View
            pointerEvents="none"
            style={[
              styles.lock,
              {
                width: LOCK_DISC,
                height: LOCK_DISC,
                borderRadius: LOCK_DISC / 2,
                backgroundColor: marks.lockDisc,
                borderColor: marks.lockEdge,
              },
            ]}
          >
            <Icon name="lock" size={12} color={marks.lock} />
          </View>
        ) : null}
      </View>
      {caption ? (
        <AppText
          variant="meta"
          ink="text"
          align="center"
          numberOfLines={1}
          // the row is sized so the name fits whole at the phone's text size (`swatchRowLayout`);
          // a face wider than the bound it was sized with is made smaller, never cut to "Oce…"
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{ paddingHorizontal: SWATCH_NAME.gap / 2 }}
        >
          {name}
        </AppText>
      ) : null}
      {caption && badge ? (
        <Badge
          label={badge.label}
          {...(badge.tone ? { tone: badge.tone } : {})}
          style={styles.badge}
          {...(testID ? { testID: `${testID}.badge` } : {})}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // centered: a bare swatch is its disc in the middle of its square, and a captioned one is the
  // square and its name stacked in the middle of the cell the row gave it
  target: { alignItems: 'center', justifyContent: 'center' },
  captioned: { justifyContent: 'flex-start' },
  box: { alignItems: 'center', justifyContent: 'center' },
  disc: { overflow: 'hidden' },
  badge: { alignSelf: 'center', marginTop: 2 },
  lock: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
