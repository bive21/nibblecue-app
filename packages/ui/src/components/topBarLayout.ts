/**
 * The top bar's layout arithmetic (docs/DESIGN_SYSTEM.md §14, docs/BRANDING.md §2b), pure so the
 * two things the brand doc asserts — the child chip clears the mark, and the mark is within 1px
 * of center at 375 and 430 — are tested in node.
 *
 * The mark sits dead center, absolutely positioned: the middle of the bar is the one position
 * that does not move as the sides change width, so it is a fixed landmark rather than something
 * that shunts the baby's name sideways when the sync chip appears. The child chip is FIRST in the
 * bar and capped — 150 at 380 and above, 126 below — and its name ellipsises, so nothing on the
 * left can ever reach the mark. Both caps are the prototype's (block 46a); 380 is the width at
 * which its ≤379px media query fires, i.e. the 375pt phones.
 *
 * `markLeft` is where the mark's left edge lands, and it is what `chipClearsMark` measures the
 * chip against. It is NOT how the bar positions the mark: TopBar pins the mark's slot to both
 * side edges and centers inside it, because a single-edge percentage offset is measured from
 * whichever containing block Yoga picks and drew the mark off center on a device. Arithmetic
 * here cannot catch that — `markLeft(w) + markSize(w) / 2 === w / 2` is true for any `markSize`,
 * so a test of this function alone proves nothing about the component. The source tripwire in
 * interaction.test.ts is what holds the bar to symmetric anchoring.
 *
 * The bar reports its two popover anchors (§14: the appearance and account controls open
 * anchored popovers, not sheets) as the Popover's own `Anchor` — the rectangle `measureInWindow`
 * gives — re-exported from popoverPosition.ts rather than declared twice, so the chrome and the
 * overlays barrels export one type, not two that happen to agree.
 */
import { space } from '../theme/theme';

export type { Anchor } from './popoverPosition';

/** Below this width the chip cap and the mark step down (the prototype's ≤379px rule). */
export const NARROW_BREAK = 380;
/** The bar's minimum height, before the status-bar inset. */
export const TOP_BAR_MIN_HEIGHT = 52;
/** The side gutter of the bar: the screen gutter (docs/DESIGN_SYSTEM.md §6). */
export const TOP_BAR_GUTTER: number = space.xxl;
/** The gap between the bar's controls. */
export const TOP_BAR_GAP: number = space.md;
/** The chip's avatar and the account avatar are the same 31 circle as everywhere else. */
export const TOP_BAR_AVATAR = 31;

/** The child chip's cap: 150, or 126 below 380 (BRANDING.md §2b). */
export const chipMaxWidth = (width: number): number => (width < NARROW_BREAK ? 126 : 150);

/** The mark: a 30px circle, 28 below 380 (BRANDING.md §2b). */
export const markSize = (width: number): number => (width < NARROW_BREAK ? 28 : 30);

/** Where the mark's left edge lands when it is centered absolutely. */
export const markLeft = (width: number): number => width / 2 - markSize(width) / 2;

/** The furthest right the child chip can reach: the gutter plus its cap. */
export const chipRightEdge = (width: number): number => TOP_BAR_GUTTER + chipMaxWidth(width);

/** True when the chip at its cap, plus one gap of air, stays left of the mark. */
export const chipClearsMark = (width: number): boolean =>
  chipRightEdge(width) + TOP_BAR_GAP <= markLeft(width);

/*
  THE MARK GIVES WAY (the owner's screenshots, 2026-09-28: an Android phone 1080 px wide, where the
  heart was drawn over the first letters of the sync chip's "5 queued" and "Not synced").

  The chip's cap keeps the LEFT side clear at every phone width from 360 to 430 (markDoor.test.ts),
  but nothing ever capped the right: the sync chip grows with its words and with the phone's font
  size, and with the bell and the avatar beside it the right group reached past the middle of the
  bar, under the heart. The heart is the one thing in the bar that can give way: it is decoration
  with two hidden doors (the night light's three taps, and the stretch on a pull), where everything
  beside it is the baby, the state of the log, or a control the household reaches for. So TopBar
  measures the bar with onLayout (its width, where the left group ends and where the right group
  starts) and asks this function whether the heart still fits in between. When it does not, the
  heart steps aside, and it comes back when there is room. Both sides are checked, so a narrower
  bar, a longer cap or a bigger font on the left is covered by the same rule.

  Measured, never estimated from the text: a width worked out from a string is wrong by the font,
  the font scale and the platform, and the bar has already assumed once that the right side would
  stay short.
*/

/**
 * The air the mark keeps from a chip on either side before it steps aside: the `sm` step, not a
 * full control gap. At 380 the child chip at its cap already comes within 7 of the mark by design
 * (markDoor.ts cuts the door's slop for it), so asking for a whole `TOP_BAR_GAP` would hide the
 * heart, and its night light door with it, for a long name on a 380 phone with nothing else in the
 * bar. Six keeps the mark in every quiet bar (the chip at its cap, nothing to report; the test
 * sweeps 360 to 430) with a point of slack for Android's rounding of layout to whole pixels.
 */
export const MARK_CLEARANCE: number = space.sm;

/**
 * True when the mark, centered in a bar `barWidth` wide, keeps `gap` of air from the left group
 * (which ends at `leftEnd`) and from the right group (which starts at `rightStart`). All three are
 * in the bar's own layout coordinates, as its onLayout reports them: the mark's slot is pinned to
 * both side edges of a bar with equal side padding, so its center is `barWidth / 2` whichever box
 * Yoga measures an absolute child against (TopBar.tsx says why that matters).
 */
export function markFits(
  barWidth: number,
  leftEnd: number,
  rightStart: number,
  markWidth: number,
  gap: number = MARK_CLEARANCE,
): boolean {
  const center = barWidth / 2;
  const half = markWidth / 2;
  return leftEnd + gap <= center - half && center + half + gap <= rightStart;
}
