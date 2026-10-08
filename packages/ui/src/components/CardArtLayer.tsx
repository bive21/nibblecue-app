/**
 * THE PICTURE BEHIND A CARD, drawn the way the owner's mockup of Today places it (2026-09-18):
 * the drawing whole against the card's RIGHT edge with the artwork's own margin around it, the
 * plain gradient on the left taking whatever crop the card's shape demands. Their README said
 * "cover, centered"; their mockup — and their words when the centered crop cut the mother's hair
 * and the second milk bag off the right edge — say right-anchored, and `cardArtFit.ts` has the
 * arithmetic and the comparison.
 *
 * THE BOX IS MEASURED AND THE IMAGE IS PLACED IN NUMBERS. React Native's <Image> composes its
 * style as `[{width, height} from the asset, base, yours]` (Libraries/Image/Image.android.js),
 * so a style that only sets edges — `StyleSheet.absoluteFill` — leaves the picture at its own
 * pixel size: a 1280 px PNG laid out 1280 dp wide inside a 360 dp card, showing its top-left
 * corner at three times life. That was the owner's afternoon of four cards wearing their old
 * flat tints. An explicit width and height end the argument, and having to compute them anyway
 * is what lets the picture be pinned to the right rather than centered by `cover`.
 *
 * AND THE VEIL, which is the only thing added to the owner's file. Their grounds are saturated
 * enough that white over them measures 2.1:1 to 2.9:1 — legible on a desk and thin at 3 a.m. —
 * so each one carries the smallest wash that lifts it, flat across the content column and faded
 * to nothing by `veilEnd`: what it deepens is the plain gradient under the words, and what it
 * never touches is the illustration. `render-card-art.mjs` computes it and fails the build if no
 * acceptable one exists.
 *
 * IT IS DRAWN IN THE ARTWORK'S OWN HUE, not in a neutral, and that is not a nicety. A near-black
 * wash over a saturated ground desaturates it, so the owner's orange arrived as brown and their
 * green as olive — a film on the picture rather than a shadow in it, and they said so twice
 * (2026-09-19: *"it looks ugly if it's with the darker left layer you made"*). `veilColor` is
 * that card's darkest pixel taken down to a deep value, so the same arithmetic now reads as the
 * gradient continuing into its own shade.
 *
 * AND IN DARK, A SHADE OVER THE OWNER'S OWN PICTURE (the owner, 2026-09-29): the same `veilColor`,
 * flat at `artDimFor(theme, art)`, between the picture and the veil. A running timer's picture was
 * the brightest thing on a dark page at night; this deepens it in its own colors, and the words and
 * the veil sit on top as they always did. A dark or Night version takes none: it was drawn at its
 * theme's depth. `artInk.ts` has the strength and why.
 *
 * It carries nothing a reader needs, so it is hidden from assistive technology entirely and
 * takes no touches — the card's own label is the card.
 */
import { memo, useId, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  Ellipse,
  Image as SvgImage,
  Mask,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { withAlpha } from '../theme/contrast';
import { artDimFor, type CardArt } from '../theme/artInk';
import { useTheme } from '../theme/ThemeProvider';
import { anchoredCover, type ArtPlace, type Rect } from './cardArtFit';

/**
 * `cover` is the wrapper's own box, and the caller always supplies it, radius included — there is
 * no "just fill the parent" default, because the two surfaces that draw artwork sit in different
 * boxes: Surface's is bordered, TimerCard's is not.
 *
 * Yoga offsets an absolutely positioned child by its parent's BORDER and nothing else — never by
 * its padding (`surfacePadding.ts` has the source, and the evening the opposite belief cost). So a
 * layer that fills a bordered box stops a hairline short of its edge, and `coverBorderBox(bw, r)`
 * pulls it out by exactly the border and grows the radius to match — a box expanded by `b` has
 * its radius expanded by `b`, the trap that file records being fallen into twice, in opposite
 * directions. A borderless card passes 0 and gets its own box back. So the radius comes in WITH
 * the box, and this component never sets one of its own.
 *
 * MEMOIZED: the running card that holds it re-renders every second to tick its digits, and the
 * picture has nothing to redraw for that (`TimerCard` keeps the `cover` it hands in between ticks).
 *
 * AND `ground`, WHERE THE HOST ASKS FOR ONE: a solid layer in the picture's own color, first in
 * the stack, so the words have their ground before the picture arrives, if it never does, and
 * through whatever of it is translucent — whatever the theme, the skin or the platform put under
 * the card (`CardArt.ground` has the owner's evening that needed it). It needs no layout, so it
 * is there from the first frame. `Surface` asks for it; `TimerCard` does not, because its
 * gradient is the ground its white words were designed on.
 */
export const CardArtLayer = memo(function CardArtLayer({
  art,
  cover,
  ground,
  pictureOpacity = 1,
  place,
}: {
  art: CardArt;
  cover: StyleProp<ViewStyle>;
  ground?: string;
  /**
   * How strongly the drawing shows. 1 is the file as shipped. Below 1 lets `ground`
   * show through it. Today's stash and shopping use that in dark and Night only.
   */
  pictureOpacity?: number;
  /**
   * How the picture sits in the box (`anchoredCover`). Omit for cover-fill — every timer.
   * Today's stash and shopping pass `{ fit: 'width', scale }` so the stamp stays small and
   * right, clear of the words.
   */
  place?: ArtPlace;
}) {
  // the wrapper's size, from layout — nothing is drawn until it is known, so the card shows its
  // own gradient for that one frame rather than a picture in the wrong place
  const [box, setBox] = useState<Rect | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox(prev =>
      prev && prev.width === width && prev.height === height ? prev : { width, height },
    );
  };
  const placed = box
    ? anchoredCover(box, { width: art.width, height: art.height }, place ?? {})
    : null;
  const dim = artDimFor(useTheme().theme, art);
  // one mask id per layer: two stamps on one screen must not share an SVG definition
  const maskId = `stamp-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      style={[cover, styles.clip]}
    >
      {ground ? <View style={[StyleSheet.absoluteFill, { backgroundColor: ground }]} /> : null}
      {placed && place?.fit === 'stamp' ? (
        <FeatheredStamp art={art} placed={placed} opacity={pictureOpacity} id={maskId} />
      ) : placed ? (
        <Image
          source={art.source as ImageSourcePropType}
          resizeMode="cover"
          style={[styles.picture, placed, pictureOpacity < 1 ? { opacity: pictureOpacity } : null]}
        />
      ) : null}
      {dim > 0 ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(art.veilColor, dim) }]}
        />
      ) : null}
      {art.veil > 0 ? (
        <LinearGradient
          colors={[
            withAlpha(art.veilColor, art.veil),
            withAlpha(art.veilColor, art.veil),
            withAlpha(art.veilColor, 0),
          ]}
          // flat until the content column ends, then out — the numbers come from the measurement
          locations={[0, art.contentFraction, art.veilEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
});

// the clip lives on this layer rather than on the card: a view that hides its overflow hides
// its own shadow with it (`shadows.ts`), and these cards are lifted
const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  // `position` here; the width, height, left and top come from `anchoredCover`, in numbers
  picture: { position: 'absolute' },
});

/**
 * WHERE A STAMP'S DRAWING IS INSIDE ITS PICTURE: the stash's bags and bottle and the shopping basket,
 * measured on stash.jpg and shopping.jpg (and their dark and Night versions, drawn on the same
 * layout) as shares of the picture's width and height.
 */
export const STAMP_DRAWING = { left: 0.745, right: 0.975, top: 0.28, bottom: 0.87 } as const;
/** How far past the drawing the mask stays whole, then how far it takes to fade to nothing. */
const STAMP_SOLID = 0.62;

/**
 * A STAMP DRAWN THROUGH A SOFT OVAL (2026-10-06, the owner: "the illustration treatment currently
 * looks like a darker rectangular patch rather than a gradient … no visible square boundary"). The
 * pictures are JPEG strips with their own ground baked in, a little darker than the tile's, and
 * the fades laid over their left and top edges still left that ground showing as a box round the
 * drawing. Now the picture is drawn through an alpha mask: an oval round the drawing, whole over
 * it and fading to nothing well before the picture's edges, so the strip's own ground melts into
 * the tile with no edge anywhere and the drawing itself is untouched, at its own opacity. Nothing
 * is laid over the picture, so nothing can darken it.
 */
function FeatheredStamp({
  art,
  placed,
  opacity,
  id,
}: {
  art: CardArt;
  placed: { width: number; height: number; left: number; top: number };
  opacity: number;
  id: string;
}) {
  const { width: w, height: h } = placed;
  const d = STAMP_DRAWING;
  const cx = ((d.left + d.right) / 2) * w;
  const cy = ((d.top + d.bottom) / 2) * h;
  // the oval's radius reaches the drawing's corners at STAMP_SOLID of the way out
  const rx = (((d.right - d.left) / 2) * w) / STAMP_SOLID;
  const ry = (((d.bottom - d.top) / 2) * h) / STAMP_SOLID;
  return (
    <Svg
      width={w}
      height={h}
      style={[styles.picture, { left: placed.left, top: placed.top }]}
      opacity={opacity}
    >
      <Defs>
        <RadialGradient id={`${id}-g`} cx="50%" cy="50%" r="50%">
          {/* whole at the drawing's heart, then a long, eased fall to nothing, so no rim reads */}
          <Stop offset={0} stopColor="white" stopOpacity={1} />
          <Stop offset={STAMP_SOLID * 0.75} stopColor="white" stopOpacity={1} />
          <Stop offset={0.78} stopColor="white" stopOpacity={0.5} />
          <Stop offset={0.92} stopColor="white" stopOpacity={0.12} />
          <Stop offset={1} stopColor="white" stopOpacity={0} />
        </RadialGradient>
        <Mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
          <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id}-g)`} />
        </Mask>
      </Defs>
      <SvgImage
        href={svgHref(art.source)}
        x={0}
        y={0}
        width={w}
        height={h}
        preserveAspectRatio="xMidYMid slice"
        mask={`url(#${id})`}
      />
    </Svg>
  );
}

/** A bundled picture as the SVG image takes it: a module id as it is, a `{ uri }` as its string. */
function svgHref(source: CardArt['source']): ImageSourcePropType | string {
  const s = source as ImageSourcePropType;
  return typeof s === 'object' && s !== null && !Array.isArray(s) && 'uri' in s && s.uri
    ? s.uri
    : s;
}
