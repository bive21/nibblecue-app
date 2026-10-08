/**
 * Where an anchored popover goes (docs/DESIGN_SYSTEM.md §14): below its anchor, right-aligned
 * to the anchor's right edge — the top-right origin of the prototype's `.pop` — 272 wide, at
 * most 78% of the window tall, and always inside the window by a margin. When there is no room
 * below (an anchor near the bottom of the screen) it flips above. Pure TypeScript so the
 * arithmetic is tested without a renderer; the component only applies the frame.
 */
export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export type PopoverFrame = { left: number; width: number; maxHeight: number } & (
  { placement: 'below'; top: number } | { placement: 'above'; bottom: number }
);

export const POPOVER_WIDTH = 272;
export const POPOVER_MAX_HEIGHT_RATIO = 0.78;
/** The breathing room between the anchor's edge and the panel. */
export const POPOVER_GAP = 6;
/** Below this much room under the anchor the panel flips above it. */
export const POPOVER_MIN_ROOM = 160;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * @param anchor  the opener's frame in window coordinates (`measureInWindow`); null = the
 *                top-right corner of the window, which is where the prototype's popovers live
 * @param margin  the least distance from any window edge
 */
export function popoverPosition(
  anchor: Anchor | null,
  window: WindowSize,
  width: number = POPOVER_WIDTH,
  margin: number = 11,
  gap: number = POPOVER_GAP,
): PopoverFrame {
  const w = Math.max(0, Math.min(width, window.width - 2 * margin));
  const cap = Math.floor(window.height * POPOVER_MAX_HEIGHT_RATIO);
  const rightEdge = anchor ? anchor.x + anchor.width : window.width - margin;
  const left = clamp(rightEdge - w, margin, window.width - margin - w);
  if (!anchor) {
    return {
      placement: 'below',
      left,
      top: margin,
      width: w,
      maxHeight: Math.max(0, Math.min(cap, window.height - 2 * margin)),
    };
  }
  const top = anchor.y + anchor.height + gap;
  const roomBelow = window.height - margin - top;
  const roomAbove = anchor.y - gap - margin;
  if (roomBelow >= POPOVER_MIN_ROOM || roomBelow >= roomAbove) {
    return {
      placement: 'below',
      left,
      top,
      width: w,
      maxHeight: Math.max(0, Math.min(cap, roomBelow)),
    };
  }
  return {
    placement: 'above',
    left,
    bottom: window.height - (anchor.y - gap),
    width: w,
    maxHeight: Math.max(0, Math.min(cap, roomAbove)),
  };
}
