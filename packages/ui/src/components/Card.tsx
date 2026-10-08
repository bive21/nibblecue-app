/**
 * Card (docs/DESIGN_SYSTEM.md §5, §16.4): a SURFACE holding content, radius `m`. `tone` tints it
 * with a module's soft companion (the skin decides how translucent); `hue` colors the lift
 * under glass. Pressable when `onPress` is given, with a label from the caller.
 */
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { artForTheme, type CardArt } from '../theme/artInk';
import type { ArtPlace } from './cardArtFit';
import { Surface, type SurfaceRadius } from './Surface';

export interface CardProps {
  children?: ReactNode;
  /** A category's soft tint as the fill. */
  tint?: string;
  /** The category hue for the lift shadow; defaults to the accent. */
  hue?: string;
  radius?: SurfaceRadius;
  onPress?: () => void;
  accessibilityLabel?: string;
  padded?: boolean;
  /**
   * TAKE THE HEIGHT OF THE ROW THIS CARD IS IN, rather than the height of its own contents.
   *
   * For a row of cards side by side (Today's stash and shopping list), where two cards of
   * different heights read as one of them having gone wrong. The row stretches its children and
   * this passes that stretch through the Pressable, which is otherwise the one box in the
   * sandwich sized by its contents — `style` alone reaches the Surface and stops there.
   *
   * Off everywhere else: a card in a column has no row to fill, and `flex: 1` there would let
   * it take the whole page if it ever found free space.
   */
  fill?: boolean;
  /**
   * THE CARD'S WHOLE BACKGROUND (the owner, 2026-09-18, with four finished files: "use these
   * exact images as the backgroudn for each module"). It is not a wash over the tint — it is a
   * complete picture, gradient and illustration together, that fills the card and replaces
   * everything the tint would have drawn.
   *
   * `null` and absent both mean the tint alone, which is every other card in the app. The
   * content column is capped at `art.contentFraction` so the words stay on the plain side of the
   * picture and off the drawing; `CardArtLayer` and `cardArtFit` carry the rest of the story.
   */
  art?: CardArt | null;
  /**
   * How strongly the drawing shows over its own ground. Omit it, or pass 1, for the
   * file as shipped. Today's stash and shopping pass less in dark and Night.
   */
  artOpacity?: number;
  /**
   * How the picture sits in the box (`anchoredCover`). Omit for cover-fill.
   * Today's stash and shopping pass a width-fit scale so the stamp clears the words.
   */
  artPlace?: ArtPlace;
  /**
   * AN OPAQUE TINT, whatever the skin: for a card whose words were chosen against the tint itself
   * (`readableInk` over it), which a glass skin's translucency would otherwise make a promise about
   * a page nobody measured. The picture, where one is drawn, brings its own solid ground anyway.
   */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** The box, including its padding: a corner decoration sizes itself from the card, not the words. */
  onLayout?: (event: LayoutChangeEvent) => void;
}

export function Card({
  children,
  tint,
  hue,
  radius = 'm',
  onPress,
  accessibilityLabel,
  padded = true,
  fill = false,
  art,
  artOpacity,
  artPlace,
  solid = false,
  style,
  testID,
  onLayout,
}: CardProps) {
  const t = useTheme();
  /**
   * EACH THEME'S OWN VERSION OF THE PICTURE (`artForTheme` has the rule). Night exists so that
   * nothing on the screen is bright at 3 a.m. (DESIGN_SYSTEM §2), and a pale yellow on a dark page
   * is a daytime box (the owner, 2026-09-29), so dark draws a pale picture's dark version and Night
   * every picture's dim amber one; where a build has no version for the theme, the card falls back
   * to its own tint, which both themes already handle. The screen that fills this card asks the
   * same function for its inks, so they cannot disagree.
   */
  const picture = artForTheme(art, t.theme);
  const body = (
    <Surface
      radius={radius}
      {...(tint ? { tint } : {})}
      {...(hue ? { hue } : {})}
      {...(solid ? { solid } : {})}
      /* THE PICTURE GOES TO THE SURFACE, never into `children`: Surface owns the box, its
         border and its radius, and draws the picture between its fill and its content with
         `coverBorderBox(bw, r)`, so the drawing reaches under the hairline edge and is clipped
         by the same corners. A picture among the children lives in the content view's own
         z-order and knows nothing of the border. (An earlier note here said Yoga insets an
         absolute child by its parent's padding; it does not — `surfacePadding.ts`.) */
      {...(picture
        ? {
            art: picture,
            pictureOpacity: artOpacity ?? 1,
            ...(artPlace ? { artPlace } : {}),
          }
        : {})}
      style={[padded ? { padding: t.space.xl } : null, fill ? styles.fill : null, style]}
      {...(testID ? { testID } : {})}
      {...(onLayout ? { onLayout } : {})}
    >
      {/* AND THE WORDS STAY ON THE PLAIN SIDE OF IT. Every one of these artworks is a gradient on
          the left and a drawing on the right; `contentFraction` is where its own drawing starts,
          measured per card (`cardArt.generated.ts`). */}
      {/* A STAMP IS NOT A BACKDROP (2026-10-06): a small picture in the corner leaves the words
          the whole card, so a long total stays on its line and the pair keeps one height; the
          words are drawn over the stamp, which is allowed to sit under their ends */}
      {picture && artPlace?.fit !== 'stamp' ? (
        <View style={{ maxWidth: `${Math.round(picture.contentFraction * 100)}%` }}>
          {children}
        </View>
      ) : (
        children
      )}
    </Surface>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      onPress={onPress}
      style={({ pressed }) => [
        styles.press,
        fill ? styles.fill : null,
        { opacity: pressed ? 0.92 : 1 },
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: { alignSelf: 'stretch' },
  fill: { flex: 1 },
});
