/**
 * THE TAB BAR WHEN THE TAB CHANGES, as numbers. ONE thing moves, and only at the tab you chose:
 * its icon gives one small hop as it becomes the tab you are on — up three points, down a hair
 * past its place, home (`TAB_HOP`). Nothing else about the bar moves — not its cells, its labels,
 * its targets, its ids or what it says to a screen reader, and not its colors, which never
 * transition (§13).
 *
 * THE DOT NO LONGER SLIDES (the owner, 2026-09-26: *"the vibration should be only to where the new
 * menu page is clicked on, not both where you were from to the new page youre on. otherwise it is
 * too distracting"*). From the morning of 2026-09-26 the 5 pt dot that marks the tab you are on
 * slid from the tab you left and stretched along the way; the eye followed it out of the tab it
 * was leaving, so a change of tab moved at both ends of the bar. Now it is simply under the tab you
 * are on — with the pill and the ink, never the only mark — and the hop is the one movement, where
 * the finger is.
 *
 * WHEN THE TAB BECOMES CURRENT, BY ANY ROAD — a tap, a row on More, a link, the tour: the icon hops
 * because the answer changed, not because of a tap (`tabMove`). Never as the bar first appears, and
 * never for a width or a label policy that moved the cells.
 *
 * WHEN NOTHING MOVES — reduce motion, and the amber Night (`motionStill`) — nothing hops. Nothing
 * here is felt: the bar has no haptic and gains none (`feedback/callSites.test.ts` holds that).
 *
 * THE DOT IS ONE DOT, drawn over the row rather than one per cell, placed by the same arithmetic the
 * cells are laid out by (`tabDotLeft`): in the bar's inner box, which has no padding, so where `left`
 * and `bottom` are measured from is not a question Yoga answers two ways.
 */
import type { Frame } from './dayNightSwitch';
import { keyFrame, type Key } from './keyframes';
import { TAB_BAR_PAD, TAB_BAR_PADDING, TAB_DOT, TAB_DOT_FOOT } from './tabLayout';

/* ------------------------------------------------------------------------------- the dot */

/** Where the dot's left edge is under cell `index`: the row's padding, then the cell's middle. */
export const tabDotLeft = (index: number, cellWidth: number): number =>
  TAB_BAR_PADDING + (index + 0.5) * cellWidth - TAB_DOT / 2;

/** How far above the bar's inner bottom edge the dot sits: the row's padding, then its foot. */
export const TAB_DOT_BOTTOM = TAB_BAR_PAD + TAB_DOT_FOOT;

/* ------------------------------------------------------------------------------ the hop */

/**
 * THE ICON'S HOP: up three points in the first third, down a little past its place, and home, in
 * 260 ms — turning points eased in and out between (`keyframes.ts`), so it rises and falls like a
 * thing thrown up, not a thing on a rail. Up is negative.
 */
export const TAB_HOP = {
  ms: 260,
  keys: [
    [0, 0],
    [0.36, -3],
    [0.72, 0.6],
    [1, 0],
  ] as readonly Key[],
};

export const TAB_HOP_FRAME: Frame = keyFrame(TAB_HOP.keys);

/* ----------------------------------------------------------------------------- the rule */

/** What a render of the bar does: whether the tab you are on hops. */
export interface TabMove {
  hop: boolean;
}

/**
 * The tab the bar last showed as current was `from` (null before its first render, or when none
 * was), and now it is `to`. Only a CHANGE moves anything, and only when motion is allowed.
 */
export function tabMove(from: number | null, to: number, still: boolean): TabMove {
  return { hop: !(from === null || from < 0 || to < 0 || from === to || still) };
}
