/**
 * The chrome (docs/DESIGN_SYSTEM.md §13, §14, §23.1; docs/BRANDING.md §2b): the floating tab bar
 * with its raised log button, the top bar with its four persistent controls, and the pieces the
 * top bar is made of — the child chip, the sync chip and the mark. The layout arithmetic behind
 * both bars is pure and exported too, so the app pads its screens by the same numbers the bar is
 * drawn with and the acceptance tests (no tab label overflows its cell; the chip clears the mark)
 * run without React Native.
 */
export * from './tabLayout';
export * from './TabBar';
export * from './topBarLayout';
export * from './markDoor';
export * from './TopBar';
export * from './ChildChip';
// how many babies Both draws as discs — the app's month-day hats go on exactly those (`childPair.ts`)
export { PAIR_MAX } from './childPair';
// the month-day party hat on the chip's avatar: its drawing, its pop and its words (2026-09-26)
export * from './partyHat';
export * from './PartyHat';
export * from './SyncChip';
export * from './Mark';
// the mark's stretch on a pull of Today, the hook a page drives it with, and the colors of the
// platform's own refresh spinner beside it (2026-09-26)
export * from './markPull';
export * from './useMarkPull';
export * from '../theme/pullSpinner';
