/**
 * The shadow a material throws (docs/DESIGN_SYSTEM.md §22: "a long, low shadow in the surface's
 * own hue"), stated once, in the two forms a phone can draw it:
 *
 *   * `shadowFor`    — iOS `shadow*` plus an Android `elevation`: the native shadow, cheap and
 *                      exact, and correct for any OPAQUE box.
 *   * `boxShadowFor` — a CSS box-shadow (React Native ≥ 0.76, New Architecture) in the
 *                      prototype's own numbers: for a TRANSLUCENT box on either platform, and
 *                      the only correct form there.
 *
 * WHY TWO. Android draws an `elevation` shadow with the hardware renderer, under the view, as a
 * coarsely tessellated ring straddling the view's outline. An opaque box hides the inner half of
 * that ring; a translucent box shows it THROUGH the fill, as a darker band along the inside of
 * every edge — and the un-shadowed interior reads as a paler shape: a sharp-cornered rectangle
 * inside a rounded card, an octagon inside a circle. That was every "white box" and every
 * "hexagon" the owner photographed in the Glass skin, and no arithmetic on radius, inset or
 * opacity could reach it, because none of this code draws it. A box-shadow is painted by React
 * Native itself and only OUTSIDE the border box (`OutsetBoxShadowDrawable` clips the box out
 * before it paints), so nothing shows through a fill however translucent it is. Android below
 * API 28 draws no box-shadow at all: a flat glass card there, never a banded one.
 *
 * AND iOS TOO (2026-09-29). React Native gives a view a `shadowPath` only when its background is
 * opaque (RCTViewComponentView.mm: "Can't accurately calculate box shadow, so fall back to
 * pixel-based shadow"), and a glass panel's box has no background at all — its fill is a layer
 * inside it, over the blur. So Core Animation drew the lift from the pixels of everything in the
 * panel and put it UNDER the panel, where the part of the ground that shows through the glass
 * showed the shadow instead, and the blur sampled it and saturated it: every card carried its own
 * colored cast, darkest at the foot (ΔE 6.7–10.6 on a white panel). That bevel was most of what
 * the owner called "shiny metallic" on the iPhone. React Native's iOS box-shadow is drawn from a
 * path and masks the box itself out (RCTBoxShadow.mm, an even-odd mask), as Android's does, so
 * the glass can only ever show the ground through it.
 *
 * Pure — react-native contributes a type only — so the table is tested in node.
 */
import type { ViewStyle } from 'react-native';
import { withAlpha } from '../theme/contrast';
import type { Material } from '../theme/skins';

export type ShadowKind = Exclude<Material['shadow'], 'none'>;

/** One CSS layer, `0 offsetY blur spread color@alpha` — the prototype's notation. */
export interface ShadowLayer {
  offsetY: number;
  blur: number;
  spread: number;
  /** Which color carries the layer: the surface's hue, or the text ink for a contact shadow. */
  of: 'hue' | 'ink';
  alpha: number;
}

export interface ShadowSpec {
  /** iOS `shadowOpacity`, `shadowRadius`, `shadowOffset.height`; Android `elevation`. */
  native: { opacity: number; radius: number; height: number; elevation: number };
  /** The CSS form, `prototype/ui-prototype.html` §22 verbatim. */
  css: readonly ShadowLayer[];
}

export const SHADOWS: Readonly<Record<ShadowKind, ShadowSpec>> = {
  card: {
    native: { opacity: 0.16, radius: 12, height: 6, elevation: 2 },
    css: [
      { offsetY: 1, blur: 2, spread: 0, of: 'hue', alpha: 0.07 },
      { offsetY: 10, blur: 26, spread: -16, of: 'hue', alpha: 0.35 },
    ],
  },
  lift: {
    native: { opacity: 0.28, radius: 22, height: 14, elevation: 8 },
    css: [{ offsetY: 20, blur: 38, spread: -22, of: 'ink', alpha: 0.34 }],
  },
  hue: {
    native: { opacity: 0.34, radius: 18, height: 12, elevation: 4 },
    // The same long, low shadow at seven tenths of its old strength (was 0.62 and 0.16): with the
    // glass no longer showing its own lift through itself, what remains is the lift below the
    // card, and at the old numbers a row of Quick tiles threw a colored band under every one.
    css: [
      { offsetY: 18, blur: 34, spread: -24, of: 'hue', alpha: 0.44 },
      { offsetY: 4, blur: 12, spread: -8, of: 'ink', alpha: 0.12 },
    ],
  },
};

/** The native shadow: iOS `shadow*` and an Android `elevation`. For an OPAQUE box. */
export function shadowFor(material: Material, hue: string, isNight: boolean): ViewStyle {
  if (isNight || material.shadow === 'none') return {};
  const { opacity, radius, height, elevation } = SHADOWS[material.shadow].native;
  return {
    shadowColor: hue,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height },
    elevation,
  };
}

type BoxShadowLayer = Extract<NonNullable<ViewStyle['boxShadow']>, readonly unknown[]>[number];

/**
 * The same shadow as a CSS box-shadow, painted outside the box only. For a TRANSLUCENT box on
 * either platform; `ink` is a dark neutral — the text ink in light, the darkest ground in dark
 * (Surface.tsx) — which carries the contact layer under a hue layer, and the chrome's lift.
 */
export function boxShadowFor(
  material: Material,
  hue: string,
  isNight: boolean,
  ink: string,
): ViewStyle {
  if (isNight || material.shadow === 'none') return {};
  const boxShadow: BoxShadowLayer[] = SHADOWS[material.shadow].css.map(layer => ({
    offsetX: 0,
    offsetY: layer.offsetY,
    blurRadius: layer.blur,
    spreadDistance: layer.spread,
    color: withAlpha(layer.of === 'hue' ? hue : ink, layer.alpha),
  }));
  return { boxShadow };
}
