/**
 * WHAT COVER DOES TO THE OWNER'S ARTWORK AS THE CARD CHANGES SHAPE — the arithmetic behind
 * "consider the different aspect ratio in different devices, think about this" (the owner,
 * 2026-09-18). `anchoredCover` below is what the cards draw with; `artFit` is the centered
 * variant it replaced, kept because the tests compare the two and the comparison is the
 * argument.
 *
 * `resizeMode="cover"` scales the image so it fills the card and crops whatever overflows, about
 * the middle. That is one line of React Native and there is nothing to implement; what there IS
 * to do is know what it throws away, because these four pictures are RIGHT-WEIGHTED — the
 * illustration lives in the right third and the left is a plain gradient the text sits on. A
 * crop that trims the top and bottom of a gradient costs nothing. A crop that trims the SIDES
 * eats the illustration, and that is the one to watch.
 *
 * Which way it goes is decided by one comparison:
 *
 *   * CARD WIDER THAN THE ART (card ratio > art ratio) — the image is scaled by width, so it
 *     overflows vertically and the crop is top and bottom. The illustration is untouched.
 *   * CARD TALLER THAN THE ART — scaled by height, overflowing sideways, and the crop is left
 *     and right in equal parts. Half of it comes out of the illustration.
 *
 * The second case is what large type produces: a card whose words double in height keeps its
 * width, so its ratio falls and the sides go. `cardArtFit.test.ts` runs this over every phone
 * width the app supports at 100% and 200% type and states, as an assertion rather than a hope,
 * how much of the illustration is still there.
 *
 * Pure arithmetic and no React, so the answer is checked in node rather than looked at on one
 * phone — which is the lesson `docs/PREFLIGHT.md` records about this codebase's eyes.
 */
export interface Rect {
  width: number;
  height: number;
}

/**
 * WHERE THE PICTURE IS DRAWN: scaled and PINNED TO ITS RIGHT EDGE, centered only vertically.
 *
 * The owner's mockup of Today (2026-09-18) settles the question the README left open: the
 * mother and baby, the sleeping baby, the milk bags and the basket all sit WHOLE against the
 * card's right edge, with the artwork's own margin around them, and a card taller than its
 * picture loses gradient on the left rather than drawing on the right. A centered cover — what
 * `resizeMode="cover"` does on its own — crops both sides equally, which on a phone whose cards
 * run taller than the art cut the mother's hair and the second milk bag off the right edge and
 * made the whole drawing read as zoomed in ("the size is too big… the milk pouch is only
 * partially seen"). Anchoring right costs nothing that was worth keeping.
 *
 * `fit: 'cover'` (default) fills the box — every timer card, the Stash hero. `fit: 'width'`
 * scales to the box's width and letterboxes vertically: Today's milk-stash and shopping
 * stamps are 4:1 on a half-card that is nearly square, and cover-by-height zoomed the bags and
 * the basket into the words (the owner, 2026-10-05: *"made smaller and more to the right"*).
 * `scale` multiplies either, below 1 for a smaller stamp still flushed right; the card's own
 * ground fills whatever the picture no longer covers.
 *
 * The box is returned in numbers, not percentages, so the <Image> is given an explicit size and
 * position and React Native's intrinsic-size default (see `CardArtLayer`) never gets a say.
 */
export interface ArtBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** How `anchoredCover` sizes the picture inside the card. */
export interface ArtPlace {
  /**
   * `cover` fills the box; `width` fits the box's width (letterboxed); `stamp` draws the picture
   * small in the bottom-right corner, its DRAWING `stampWidth` points wide (the owner's UI fixes,
   * 2026-10-05: Today's stash and shopping pictures as accents, not centerpieces).
   */
  fit?: 'cover' | 'width' | 'stamp';
  /** Multiplier on that fit, ≤ 1 — a smaller stamp still pinned to the right. */
  scale?: number;
  /** `stamp`: how wide the drawing itself is drawn, in points. */
  stampWidth?: number;
  /** `stamp`: where the drawing starts across the picture, 0–1 (its `contentFraction`). */
  drawingFrom?: number;
}

export function anchoredCover(box: Rect, art: Rect, place: ArtPlace = {}): ArtBox {
  if (box.width <= 0 || box.height <= 0 || art.width <= 0 || art.height <= 0)
    return { width: 0, height: 0, left: 0, top: 0 };
  const fit = place.fit ?? 'cover';
  if (fit === 'stamp') {
    // the drawing is the right part of the picture: the whole picture is drawn as wide as the
    // drawing must be over its share, pinned to the bottom-right corner. It may run past the card's
    // left edge, where the card clips it (2026-10-06: held to the card's width, a half-width tile
    // drew its bags ~35 wide whatever was asked) — never past twice the card's width
    const share = Math.min(0.95, Math.max(0.05, 1 - (place.drawingFrom ?? 0.7)));
    const width = Math.min(2 * box.width, Math.max(0, place.stampWidth ?? 44) / share);
    const height = (width * art.height) / art.width;
    return { width, height, left: box.width - width, top: box.height - height };
  }
  const factor = Math.min(1, Math.max(0.01, place.scale ?? 1));
  const base =
    fit === 'width'
      ? box.width / art.width
      : Math.max(box.width / art.width, box.height / art.height);
  const scale = base * factor;
  const width = art.width * scale;
  const height = art.height * scale;
  return { width, height, left: box.width - width, top: (box.height - height) / 2 };
}

/** The share of the art's width on screen under `anchoredCover`, and where the window starts. */
export function anchoredWindow(
  box: Rect,
  art: Rect,
  place: ArtPlace = {},
): { from: number; to: number } {
  const drawn = anchoredCover(box, art, place);
  if (drawn.width <= 0) return { from: 0, to: 1 };
  const visible = Math.min(1, box.width / drawn.width);
  return { from: 1 - visible, to: 1 };
}

export interface ArtFit {
  /** The share of the art's own WIDTH that is visible, 0–1. */
  visibleWidth: number;
  /** The share of the art's own HEIGHT that is visible, 0–1. */
  visibleHeight: number;
  /** Where the visible window starts and ends across the art, 0–1 — centered, so symmetrical. */
  from: number;
  to: number;
}

export function artFit(card: Rect, art: Rect): ArtFit {
  if (card.width <= 0 || card.height <= 0 || art.width <= 0 || art.height <= 0)
    return { visibleWidth: 1, visibleHeight: 1, from: 0, to: 1 };
  const scale = Math.max(card.width / art.width, card.height / art.height);
  const visibleWidth = Math.min(1, card.width / (art.width * scale));
  const visibleHeight = Math.min(1, card.height / (art.height * scale));
  const from = (1 - visibleWidth) / 2;
  return { visibleWidth, visibleHeight, from, to: from + visibleWidth };
}

/**
 * How much of a right-weighted illustration survives.
 *
 * `illustrationFrom` is where it starts across the art — 0.62 for all four of these, which is
 * where the gradient stops and the drawing begins. The answer is the share of the DRAWING still
 * on screen, which is the number a person actually cares about: 1 is "all of it", 0.8 is "the
 * far edge of the basket is gone", 0.5 is "half the mother".
 */
export function illustrationVisible(fit: ArtFit, illustrationFrom: number): number {
  const width = 1 - illustrationFrom;
  if (width <= 0) return 1;
  const shown = Math.max(0, Math.min(fit.to, 1) - Math.max(fit.from, illustrationFrom));
  return Math.min(1, shown / width);
}
