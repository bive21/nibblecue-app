/**
 * The mark in the top bar (docs/BRANDING.md §2b, §4; docs/DESIGN_SYSTEM.md §16.4): the ONE brand
 * element allowed in the chrome. The owner delivered the mark on 2026-09-13 — the parent-and-baby
 * heart, transparent, carrying its own color on every scheme and on night's amber ground — and
 * BRANDING.md §4 says it replaces the CC monogram everywhere it appeared, the top bar first. So
 * the mark is an IMAGE when the app hands one in (`source`, resolved by the app from brand.json
 * `assets.mark`; this package resolves no asset paths), drawn to `size` with nothing behind it:
 * the artwork is its own shape, and a disc under it would be a second mark. The letters are the
 * fallback brand.json keeps "where an image cannot load" — a circle, the shape §16.4 reserves for
 * a mark, in the brand gradient, the two letters in `onGradient` at 800. The letters themselves
 * (`monogram`) come from brand.json through the app, like the accessible name (`label`): nothing
 * brand-shaped is typed here, and brand.test.ts scans for it.
 *
 * 30px at 430 and 28 below 380 (topBarLayout.ts); the letters scale with the circle (11px at 30)
 * and ignore the OS font scale, because a mark is an image, not text — a letter that outgrew its
 * disc would be a defect, not accessibility. Night hands in its own dim gradient through the
 * resolver, so nothing here checks the theme. It is not a button (§14 has exactly four controls,
 * and this is not one of them) — though since 2026-09-26 the top bar hides one door behind it:
 * three quick taps open the Night light (`markDoor.ts`), and `door` gives a screen reader the
 * same door as a custom action on the image.
 */
import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './Text';

/** Letter size at 30px, scaled with the circle. */
const LETTERS_EM = 11 / 30;

export interface MarkProps {
  size: number;
  /** The accessible name — the product's, passed by the app from brand.json, never typed here. */
  label: string;
  /** The text fallback (brand.json `monogram`), drawn only when there is no image to draw. */
  monogram: string;
  /** The delivered mark (brand.json `assets.mark`), resolved to an image source by the app. */
  source?: ImageSourcePropType;
  /**
   * A door behind the image, for a screen reader (the top bar's Night light, `markDoor.ts`): the
   * mark still reads as the image it is, and the door is a custom action on it.
   */
  door?: { label: string; onOpen: () => void };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The custom action a door adds to the image, and what runs it. */
const doorProps = (door: MarkProps['door']) =>
  door === undefined
    ? {}
    : {
        accessibilityActions: [{ name: 'door', label: door.label }],
        onAccessibilityAction: (e: AccessibilityActionEvent) => {
          if (e.nativeEvent.actionName === 'door') door.onOpen();
        },
      };

export function Mark({ size, label, monogram, source, door, style, testID }: MarkProps) {
  const t = useTheme();
  const letters = size * LETTERS_EM;
  if (source !== undefined) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        {...doorProps(door)}
        style={[styles.image, { width: size, height: size }, style]}
        {...(testID ? { testID } : {})}
      >
        <Image
          source={source}
          resizeMode="contain"
          // the artwork carries its own color; inverting it would make it someone else's mark
          accessibilityIgnoresInvertColors
          style={{ width: size, height: size }}
        />
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      {...doorProps(door)}
      style={[
        styles.disc,
        { width: size, height: size, borderRadius: t.radius.pill, backgroundColor: t.color.accent },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      <LinearGradient
        colors={[...t.gradient.brand]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: t.radius.pill }]}
      />
      <AppText
        variant="h2"
        color={t.onGradient}
        // a11y-fixed-scale: the monogram, a logo letter drawn to its disc; the mark's label names it
        allowFontScaling={false}
        style={{ fontSize: letters, lineHeight: letters * 1.2, letterSpacing: -letters * 0.02 }}
      >
        {monogram}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { alignItems: 'center', justifyContent: 'center' },
  disc: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
