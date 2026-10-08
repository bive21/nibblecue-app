/**
 * The material every panel is made of (docs/DESIGN_SYSTEM.md §13, §22): one component, two
 * skins. Glass = a translucent panel over the lit ground, frosted, with a hairline light edge, a
 * soft top light and a hue-tinted lift; Paper = flat, hairline-ruled, no shadow. `kind="chrome"`
 * frosts harder than content (the tab bar carries labels over whatever scrolls beneath it) and
 * `kind="sheet"` hardest of all (the sheet and the popover). A FILLED control is never a
 * Surface: buttons stay solid (§13 rule 1).
 *
 * Night flattens everything through the resolver (skinForTheme), and dark swaps glass to the
 * scheme's tint the same way, so nothing here checks the theme; it only reads the material it
 * was handed. Android has no blur (below says why, and what was weighed), so a glass panel there
 * is the same material with the blur left out: 76% where the table says 52% (`surfaceAlphaFor`),
 * a category tint opaque (`tintAlphaFor`), the chrome at 97% and the sheet opaque — an alpha is a
 * promise about what reads through it, and each of those is the number that keeps the promise
 * over no blur. Everything else is drawn the same on both phones: the light edge and the top light
 * ABOVE the glass, and a translucent panel's lift as a box-shadow, never a native shadow —
 * shadows.ts says why, and it is the one rule here that is not a preference.
 *
 * ONE EXCEPTION, AND IT IS A LOG TILE'S (`glass`, 2026-10-01): on Android a Log tile under Glass is
 * a pane of liquid glass inside its own edge — a rim, a sheen, a shade at its foot, and on a pebble
 * a body that lets the ground through at the top and is whole below (theme/tileGlass.ts,
 * `TileGlass`). The caller hands it in; every other surface, and every surface on the iPhone and on
 * Paper, gets `null`.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { composite, withAlpha } from '../theme/contrast';
import {
  chromeAlphaFor,
  GLASS_EDGE_ALPHA,
  materialBase,
  SPECULAR_ALPHA,
  SPECULAR_DEPTH,
  surfaceAlphaFor,
  TINT_EDGE,
  tintAlphaFor,
} from '../theme/skins';
import { boxShadowFor, shadowFor } from './shadows';
import { coverBorderBox, splitPadding } from './surfacePadding';
import { useTheme } from '../theme/ThemeProvider';
import type { CardArt } from '../theme/artInk';
import type { TileGlassSpec } from '../theme/tileGlass';
import { CardArtLayer } from './CardArtLayer';
import type { ArtPlace } from './cardArtFit';
import { TileGlass } from './TileGlass';

export { shadowFor } from './shadows';

export type SurfaceKind = 'content' | 'chrome' | 'sheet';
export type SurfaceRadius = 's' | 'm' | 'l' | 'xl' | 'pill';

export interface SurfaceProps {
  kind?: SurfaceKind;
  radius?: SurfaceRadius;
  /** A category tint as the fill (`*Soft`); the skin decides how translucent it is. */
  tint?: string;
  /** The hue that colors the lift shadow under glass (a bottle card throws violet, a pump card gold). */
  hue?: string;
  /** Solid, whatever the skin: for a surface that must not let the ground through (a toast). */
  solid?: boolean;
  /**
   * A PICTURE AS THE WHOLE GROUND (`theme/artInk.ts`). It belongs to the surface rather than to
   * the caller's children for the reason `splitPadding` records: children are laid out inside
   * the CONTENT view, which carries the padding, so a background passed as a child is inset by
   * it on all four sides and bounded by the text block rather than the card. Here it joins the
   * decoration layer, which already covers the border box and clips to the radius.
   */
  art?: CardArt | null;
  /**
   * Strength of the picture's drawing. 1, the default, is the file as shipped.
   * Today's stash and shopping pass a lower number in dark and Night.
   */
  pictureOpacity?: number;
  /**
   * How the picture sits in the box (`anchoredCover`). Omit for cover-fill.
   * Today's stash and shopping pass a width-fit scale so the stamp clears the words.
   */
  artPlace?: ArtPlace;
  /**
   * THE LIQUID GLASS OF A LOG TILE ON ANDROID (`theme/tileGlass.ts`; the owner, 2026-10-01): for a
   * tinted surface, its `body` is the tint's alpha in place of `tintAlphaFor`'s, and its layers are
   * drawn inside the edge and under the content (`TileGlass`), with the tile's own sheen in place of
   * the skin's top light. `null` — Paper, the iPhone, every surface that is not a Log tile — changes
   * nothing here: the material is exactly what it was.
   */
  glass?: TileGlassSpec | null;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
  /** The border box. Decoration that depends on the card's width measures here, not on a child. */
  onLayout?: (event: LayoutChangeEvent) => void;
}

/** A padding value as a number of points, or null when the caller set none (or a percentage). */
const points = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export function Surface({
  kind = 'content',
  radius = 'm',
  tint,
  hue,
  solid,
  art,
  pictureOpacity,
  artPlace,
  glass,
  style,
  children,
  testID,
  onLayout,
}: SurfaceProps) {
  const t = useTheme();
  const material =
    kind === 'chrome'
      ? t.skinTokens.chrome
      : kind === 'sheet'
        ? t.skinTokens.sheet
        : t.skinTokens.surface;
  const android = Platform.OS === 'android';
  // A sheet's alpha is a promise about what can be read through it, and the promise holds only
  // over a blur. Android gets none (below), so a 90% sheet there would show the page's text
  // through it at 10% — faint, sharp, and exactly what the owner read through the glass sheet
  // on the phone. Where the material cannot blur, the sheet is opaque.
  const opaqueSheet = kind === 'sheet' && android && material.blur > 0;
  // The chrome without a blur is nearly opaque (skins.ts chromeAlphaFor): the words scrolling
  // under the bar must never read through its labels (DESIGN_SYSTEM.md §13 rule 3).
  const chromeAlpha = kind === 'chrome' ? chromeAlphaFor(material, !android) : material.alpha;
  // And a CONTENT panel without a blur takes the no-blur alpha, for the same reason one kind up:
  // 52% of white over an unblurred ground is a fill halfway between the card and the page, so the
  // card cannot separate from the page; 76% still lets the lit ground and its orbs through (skins.ts
  // surfaceAlphaFor / tintAlphaFor, and the numbers). This is the only branch that changes what a
  // card is made of on Android, so it is written once here and every Card, Rows, Quick tile and
  // tinted panel in the app inherits it.
  const contentAlpha = kind === 'content' ? surfaceAlphaFor(material, !android) : chromeAlpha;
  // A LOG TILE'S GLASS (`glass`, Android's Glass only) is a tinted surface's: it says how thin the
  // tint is at the top (below 1 on a pebble alone), and its density layer makes the rest whole
  // (theme/tileGlass.ts).
  const glazed = tint && glass && !solid ? glass : null;
  const tintAlpha = glazed ? glazed.body : tintAlphaFor(t.skinTokens, !android);
  const alpha = solid || opaqueSheet ? 1 : tint ? tintAlpha : contentAlpha;
  // What the fill is made of is the material's own fact (skins.ts `fill`): white for a card,
  // the solid surface for chrome and a sheet, and in dark glass the scheme's soft tint — the
  // one number that made dark glass look like nothing. `solid` still means the solid surface.
  const base = tint ?? (solid ? t.color.surfaceSolid : materialBase(t.color, material));
  const hueColor = hue ?? t.color.accent;
  // THE FILL, AND WHERE IT LIVES. Opaque: one composited color on the box, both platforms.
  // Translucent: on iOS a layer inside the decoration wrapper, ABOVE the blur, because the
  // tint has to sit on the blurred ground and not under it; on Android there is no blur, so the
  // fill is the box's own backgroundColor — one plain view that IS the card and can be no other
  // size, with nothing absolute under the content for a layout pass to get wrong.
  const fill =
    alpha >= 1 ? composite(t.color.app, base, 1) : android ? withAlpha(base, alpha) : undefined;
  const translucent = alpha < 1 && !android;
  // THE SHADOW. A translucent box NEVER carries a native shadow, on either platform, and a
  // box-shadow is painted by React Native outside the border box only, so nothing shows through.
  //   * Android draws an `elevation` under the view as a coarsely tessellated ring straddling the
  //     outline, and a fill that is not opaque shows the inner half of it through — the "white
  //     box" in every glass card on the owner's phone and the octagon in the bubbles.
  //   * iOS gets no `shadowPath` for a box without an opaque background, so Core Animation drew
  //     the lift from the panel's own pixels, UNDER the panel: the glass showed its own shadow,
  //     the blur saturated it, and every card carried a colored cast darkest at its foot — the
  //     bevel the owner read as "shiny metallic" (2026-09-29).
  // shadows.ts holds both forms and the account. Its neutral layers take a DARK ink: the text ink
  // in light, and in dark the darkest ground — the text ink there is light, and a light "shadow"
  // under a dark panel is a glow (the prototype's dark panels throw black).
  const shadowInk = t.theme === 'light' ? t.color.text : t.color.page;
  const shadow =
    alpha < 1
      ? boxShadowFor(material, hueColor, t.isNight, shadowInk)
      : shadowFor(material, hueColor, t.isNight);
  // A TINTED PANEL IS EDGED BY ITS OWN CATEGORY, never by the neutral line: a `line` at 15% over
  // a soft tint is the soft tint, and a glass edge is white on a pale fill. The hue is a
  // different color from the ground by construction (theme.ts usage rule 4), which the fill is
  // not always — a scheme's `accentSoft` and a theme's `pageCool` are neighbours in Ocean and
  // Slate. skins.ts TINT_EDGE has the account; the Quick bubble's ring has always done this and
  // the pebble and the capsule did not.
  const lightEdge = !tint && material.border === 'glassEdge';
  const borderColor = tint
    ? composite(tint, hueColor, TINT_EDGE)
    : lightEdge
      ? withAlpha(t.color.surfaceSolid, GLASS_EDGE_ALPHA)
      : material.border === 'line2'
        ? t.color.line2
        : t.color.line;
  const r = t.radius[radius];
  // ANDROID GETS NO BlurView, weighed again on 2026-09-29 rather than assumed. expo-blur 57 can
  // blur there, Expo Go included: `blurMethod="dimezisBlurViewSdk31Plus"` and a `blurTarget` ref
  // to a `BlurTargetView`. But a target may not contain a BlurView that blurs it (Dimezis BlurView
  // 3), and every card is inside the page, so a card could only ever blur the ground — which is
  // soft gradients a blur leaves as they are — for one more render pass per card per frame of a
  // scroll, and none at all below Android 12. The chrome (97%) and the sheet (opaque) would have to
  // give up the alphas the owner's eyes asked for before a blur under them could show. And without
  // a target a BlurView does not blur and still paints its `light` tint, a flat pale rectangle over
  // the panel. So the panel is the same material with the blur left out: `surfaceAlphaFor`'s 76%,
  // the top light, the light edge and the lift.
  const blur = material.blur > 0 && !solid && !android;
  // THE TOP LIGHT (skins.ts SPECULAR_ALPHA): never on a pill, where a gloss across 36 points is
  // a button from 2010 — a chip, the child chip, a round stepper, a capsule tile. A Log tile's glass
  // brings a sheen of its own, which lights it in its place (theme/tileGlass.ts).
  const specular = material.specular && radius !== 'pill' && !glazed;
  // Padding goes to the CONTENT, never to the box: the padding a caller hands in lays out the
  // children, and the box keeps its border, its fill and the absolutely positioned decoration
  // wrapper below. (The split was once justified by "Yoga insets an absolute child by its
  // parent's padding"; it does not, and that belief later put a timer card's artwork outside
  // the card — surfacePadding.ts has the source and the account. The split stays because it is
  // harmless and the structure is clear.)
  const split = splitPadding(style as never);
  // The border WIDTH is layout: the caller's own where it asked for one (an alert ring, a bar
  // with none) or the skin's, and the decoration wrapper covers exactly that border box.
  const { borderColor: askedEdge, borderWidth: askedWidth } = split.box;
  const bw =
    typeof askedWidth === 'number'
      ? askedWidth
      : t.skinTokens.hairlines
        ? StyleSheet.hairlineWidth * 2
        : 1;
  // THE EDGE IS DRAWN ABOVE THE GLASS whenever there is glass to draw it above. React Native paints
  // a non-clipping view's border BEHIND its children (CSS order), and the decoration wrapper covers
  // the border box: on the iPhone the blur sampled the border and smeared it into a glow along the
  // inside of the panel, taking a tile's category edge, a Quick tile's alert ring and the error
  // state's red with it. So the box keeps its border width and paints nothing there, and the edge
  // — the caller's color and width where it asked for one — is the wrapper's last layer. The light
  // edge is a hairline (skins.ts GLASS_EDGE_ALPHA), which only a layer of its own can draw inside
  // the 1pt the layout keeps.
  const decorated = blur || translucent || specular || lightEdge || glazed !== null;
  const edgeColor = typeof askedEdge === 'string' ? askedEdge : borderColor;
  // a hairline only while the edge IS the light edge: a caller's own color (the error state's red)
  // keeps the layout's full width, as it always had
  const lightLine = lightEdge && typeof askedEdge !== 'string';
  const edgeWidth =
    typeof askedWidth === 'number' ? askedWidth : lightLine ? StyleSheet.hairlineWidth : bw;
  // where a tile's words are not: its own bottom padding, which is where its glass may deepen
  const foot =
    points(split.content.paddingBottom) ??
    points(split.content.paddingVertical) ??
    points(split.content.padding) ??
    0;
  return (
    <View
      style={[
        styles.box,
        {
          borderRadius: r,
          borderColor,
          borderWidth: bw,
        },
        fill ? { backgroundColor: fill } : null,
        shadow,
        split.box,
        // last, over the caller's color too: the edge layer paints it, above the glass
        decorated ? styles.edgeDrawnAbove : null,
      ]}
      testID={testID}
      {...(onLayout ? { onLayout } : {})}
    >
      {/*
        Every decoration lives in one clipping layer, never as a loose absolute-fill sibling.
        The box itself keeps `overflow: 'visible'` because an iOS shadow is drawn outside the
        view that owns it and a clipped box has no shadow; but a child with only `borderRadius`
        is NOT clipped by its parent, so the old specular wash painted a hard-edged light SQUARE
        across a rounded tile in the glass skin. `overflow: 'hidden'` here clips every layer to
        the radius. `pointerEvents="none"` keeps any of them from ever taking a touch meant for
        the content: a decoration that swallows a tap is a control that does nothing.
      */}
      {decorated ? (
        <View pointerEvents="none" style={[coverBorderBox(bw, r), { overflow: 'hidden' }]}>
          {blur ? (
            <BlurView
              intensity={Math.min(100, material.blur * 3)}
              tint={t.theme === 'light' ? 'light' : 'dark'}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {/*
            The alpha is IN the colors, never an `opacity` prop: one fill composited in place,
            no layer over the subtree, and a color that a test can read as a value.
          */}
          {translucent ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(base, alpha) }]} />
          ) : null}
          {/*
            The top light: a fixed depth in points rather than a fraction of the panel, so a
            tall card is lit along its top edge and not down half its face. The far stop is the
            same white at zero, never `transparent`, which fades through black on some backends.
          */}
          {specular ? (
            <LinearGradient
              colors={[
                withAlpha(t.color.surfaceSolid, SPECULAR_ALPHA),
                withAlpha(t.color.surfaceSolid, 0),
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.topLight, { height: SPECULAR_DEPTH }]}
            />
          ) : null}
          {/* A Log tile's glass (Android): the body's density, the shade, the sheen and the rim, on the
              wrapper's own curve, inside the edge's width, the shade in the caller's bottom padding. */}
          {glazed ? (
            <TileGlass
              glass={glazed}
              radius={coverBorderBox(bw, r).borderRadius ?? r}
              edge={edgeWidth}
              foot={foot}
            />
          ) : null}
          {/* The edge, last: over the blur, the fill and the top light, on the wrapper's own curve. */}
          {edgeWidth > 0 ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: coverBorderBox(bw, r).borderRadius,
                  borderWidth: edgeWidth,
                  borderColor: edgeColor,
                },
              ]}
            />
          ) : null}
        </View>
      ) : null}
      {/* THE PICTURE, AFTER every skin layer and BEFORE every word — siblings paint in order,
          so this is the one place it can sit over the tint and the specular and under the
          content. It is the ground, so the layers beneath it are simply not seen, which is what
          "these are complete card backgrounds" means (docs/BRANDING.md §4d). They stay drawn
          because a theme with no version of a picture draws none (`artForTheme`) and falls
          back to them.

          ON ITS OWN SOLID GROUND (`ground`, 2026-09-29), never on those layers: the words are
          written for the picture, and the picture is not always all there — the stash summary
          is translucent everywhere, and any picture is missing until it loads. Under it, the
          dark tint of a dark theme or a blurred glass page is not a ground they can be read on;
          the picture's own color is, and it is measured (`CardArt.ground`). */}
      {art ? (
        <CardArtLayer
          art={art}
          ground={art.ground}
          cover={coverBorderBox(bw, r)}
          pictureOpacity={pictureOpacity ?? 1}
          {...(artPlace ? { place: artPlace } : {})}
        />
      ) : null}
      <View style={[styles.content, split.content]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'visible', position: 'relative' },
  content: { position: 'relative' },
  edgeDrawnAbove: { borderColor: 'transparent' },
  topLight: { position: 'absolute', top: 0, left: 0, right: 0 },
});
