/**
 * Which of a caller's style keys belong on a Surface's BOX and which on its CONTENT.
 *
 * Surface draws its blur, tint and specular layers in an absolutely positioned child, and the
 * padding a caller hands Surface goes to the CONTENT view, never to the box. The split was made
 * on the belief that Yoga insets an absolutely positioned child by its parent's padding, after a
 * phone showed every decoration drawn 14pt short on all four sides — a lighter rectangle floating
 * inside a card that `Card` had handed `padding: t.space.xl`.
 *
 * THAT BELIEF WAS WRONG, and it is recorded here because acting on it a second time cost the
 * owner an evening. Yoga offsets an absolute child that has insets by the parent's BORDER only
 * (yoga/algorithm/AbsoluteLayout.cpp, `positionAbsoluteChild`: the inset plus
 * `computeInlineStartBorder`, and React Native's default errata do not touch it). So
 * `absoluteFill` in a padded view reaches the padding's outer edge, and a layer pulled out by the
 * padding "to compensate" is drawn OUTSIDE its card by that much — which is how two running timer
 * cards came to overlap and each looked 22pt taller than its layout (TimerCard, 2026-09-18). The
 * 14pt inset seen then had some other cause; Yoga's rules do not produce it. The split stays: it
 * is harmless, the padding lands on the view whose children it lays out, and `interaction.test.ts`
 * holds the shape.
 *
 * (The OCTAGON inside the Quick bubbles, reported alongside it, was never this. It was Android's
 * elevation shadow showing through a translucent fill — shadows.ts has the account. Two fixes
 * here were reasoned from that wrong attribution; the geometry they corrected was genuinely
 * off, by a hairline, and stays corrected, but it was not the shape the owner was looking at.)
 *
 * Pure, and free of react-native, so it can be tested in this package's node vitest project — the
 * component around it cannot be rendered anywhere in this workspace.
 */

/** Every padding key React Native accepts, longhand and shorthand. */
export const PADDING_KEYS = [
  'padding',
  'paddingHorizontal',
  'paddingVertical',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingStart',
  'paddingEnd',
] as const;

export type StyleLike = Record<string, unknown> | null | undefined | false | StyleLike[];

/**
 * `StyleSheet.flatten` without importing react-native. A style may be an object, an array, a
 * nested array, or hold null / undefined / false entries; later entries win, which is the rule
 * react-native applies and the reason a naive merge is not enough.
 */
export function flattenStyle(style: StyleLike): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    const out: Record<string, unknown> = {};
    for (const part of style) Object.assign(out, flattenStyle(part));
    return out;
  }
  return { ...style };
}

export interface SplitStyle {
  box: Record<string, unknown>;
  content: Record<string, unknown>;
}

export function splitPadding(style: StyleLike): SplitStyle {
  const flat = flattenStyle(style);
  const box: Record<string, unknown> = {};
  const content: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    if ((PADDING_KEYS as readonly string[]).includes(k)) content[k] = v;
    else box[k] = v;
  }
  return { box, content };
}

/**
 * The offsets an absolutely-filled child needs to cover its parent's BORDER box.
 *
 * `StyleSheet.absoluteFill` is `top/left/right/bottom: 0`, and in Yoga those resolve against the
 * parent's padding box in the CSS sense — the area just inside the border, and the parent's
 * padding does NOT inset it (the header above). So a tint or blur layer under a 1pt border is
 * drawn 1pt short on every side: a hairline of untinted ground at the edge of a card, a ring's
 * width of it inside a bubble. Pulling the layer out by the border width, and only the border
 * width, makes it cover the whole box; hand this a padding and the layer leaves the box.
 */
export interface CoverBox {
  position: 'absolute';
  top: number;
  left: number;
  right: number;
  bottom: number;
  borderRadius?: number;
}

/**
 * Cover the parent's BORDER box, radius included.
 *
 * The offsets are the easy half. The radius was got wrong twice, in opposite directions:
 *
 *   * `StyleSheet.absoluteFill` under a 1pt ring lays a 56pt circle's fill out 54 wide while it
 *     keeps `borderRadius: 28` — a radius larger than half its box, which React Native clamps,
 *     so the fill is a circle a ring short of the edge.
 *   * Pulling the layer out to `-1` fixes the size and breaks the radius the other way: the box
 *     is now 58 wide and the radius is still 28, so each side keeps a 2pt FLAT edge.
 *
 * So the rule, stated once, here: **a box expanded outward by `b` has its radius expanded by
 * `b` as well.** Pass the parent's radius and this returns the child's. Omit it and you get
 * the offsets only — correct for a layer that has no radius of its own, wrong for one that
 * does, which is the trap this parameter exists to close.
 */
export function coverBorderBox(borderWidth: number, radius?: number): CoverBox {
  const b = Number.isFinite(borderWidth) && borderWidth > 0 ? borderWidth : 0;
  // `|| 0` normalizes -0, which is a real value in JS and compares unequal under deep equality
  const o = -b || 0;
  const box: CoverBox = { position: 'absolute', top: o, left: o, right: o, bottom: o };
  if (radius === undefined) return box;
  const r = Number.isFinite(radius) && radius > 0 ? radius : 0;
  // grows with the box; a pill radius stays effectively a pill
  return { ...box, borderRadius: r + b };
}

/**
 * A corner radius that can never exceed half the box it is drawn on. React Native clamps an
 * oversize radius itself, as CSS does; this makes the clamp explicit where a caller computes a
 * radius from a size, so the value it reads back is the value that will be drawn.
 */
export function safeRadius(radius: number, width: number, height: number): number {
  const half = Math.min(width, height) / 2;
  if (!Number.isFinite(half) || half <= 0) return Math.max(0, radius);
  return Math.max(0, Math.min(radius, half));
}
