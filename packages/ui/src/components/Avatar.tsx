/**
 * Avatar (docs/DESIGN_SYSTEM.md §2 "Gradients", §12 rule 6, §14): a circle — a MARK, so the
 * shape is the circle §16.4 reserves for it — filled with the brand gradient and the initial in
 * `onGradient` (always white: every g1 is tuned so white clears 4.5:1 on it, §11). `tone` paints
 * it from a category instead (the second child in a multiples household takes the sleep hue);
 * an initial is a letter, so its ink is measured on the tint and falls back to the text ink
 * where the hue cannot carry a word (§12 rule 6, ink.ts). Night hands in its own dim gradient
 * through the resolver; the one thing checked here is the photo, which night hides rather than
 * dims (docs/MOBILE.md §5: at 3 a.m. nothing on the screen that is not information) — the
 * initial stands in. The accessible name is the person's name — the letter is presentation.
 *
 * A PHOTO THAT WILL NOT LOAD IS NEVER A BLANK CIRCLE (2026-09-29; `photoTrouble.ts`): the initial
 * on the gradient stands in for that picture, exactly as with none, and the failure goes to the
 * app's boot log with where the picture lives and what the phone said.
 *
 * A PICTURE SITS ON THE LIGHT GROUND, INSIDE A HAIRLINE (the owner, 2026-09-30, of the top bar:
 * *"The round border for top right looks shaded"*). A circle is drawn with its edge pixels half
 * picture and half whatever is under it, and under the picture was the accent, the brand's dark
 * blue: every picture wore a dark, broken fringe. Under a picture the ground is now the solid
 * surface, which is the page's own lightness in every theme, and the edge is the same 1 pt `line`
 * the bell beside it wears (`IconButton`), drawn over the picture so it covers the fringe. The
 * initial keeps the accent and its gradient, which are its whole face.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { readableInk } from './ink';
import { initialOf } from './initials';
import { reportPhotoTrouble, shownPhoto } from './photoTrouble';
import { AppText } from './Text';

/**
 * 16 beside a byline, where the words are the subject and the face is who said them (2026-09-30) ·
 * 24 in a dense list · 31 in the top bar's chip and in a `Row` · 44 where a person is the
 * subject of a card · 112 where the picture ITSELF is what the screen is about — the photo
 * sheet, which is a preview and a picker in one (docs/MEDIA.md).
 */
export type AvatarSize = 16 | 24 | 31 | 44 | 112;

export interface AvatarProps {
  name: string;
  size?: AvatarSize;
  /** A category tint instead of the brand gradient: `soft` fills, `fg` inks the initial. */
  tone?: { fg: string; soft: string };
  /** A photo replaces the initial; the name stays the accessible label. */
  photoUri?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const FONT_SIZE: Record<AvatarSize, number> = { 16: 8, 24: 11, 31: 13, 44: 18, 112: 44 };

/** The hairline round a picture: the bell's own edge (`IconButton`), so the two read as a pair. */
export const PHOTO_RING = 1;

export function Avatar({
  name,
  size = 31,
  tone,
  photoUri,
  accessibilityLabel,
  style,
  testID,
}: AvatarProps) {
  const t = useTheme();
  const r = size / 2;
  const ink = tone ? readableInk(tone.fg, tone.soft, t.color.text) : t.onGradient;
  // the pictures that would not load here: each falls back to the initial, and a new one is tried
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const photo = shownPhoto(photoUri, t.isNight, failed);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? name}
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: tone
            ? tone.soft
            : photo !== undefined
              ? t.color.surfaceSolid
              : t.color.accent,
        },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      {!tone && photo === undefined ? (
        <LinearGradient
          colors={[...t.gradient.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: r }]}
        />
      ) : null}
      {photo !== undefined ? (
        <Image
          source={{ uri: photo }}
          accessibilityIgnoresInvertColors
          onError={e => {
            reportPhotoTrouble('Avatar', photo, e);
            setFailed(prev => new Set(prev).add(photo));
          }}
          style={[StyleSheet.absoluteFill, { borderRadius: r }]}
        />
      ) : (
        <AppText variant="bodyStrong" color={ink} style={{ fontSize: FONT_SIZE[size] }}>
          {initialOf(name)}
        </AppText>
      )}
      {photo !== undefined ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: r, borderWidth: PHOTO_RING, borderColor: t.color.line },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
