/**
 * THE ROW THAT JUST CHANGED WASHES ONCE — as numbers (the owner, 2026-09-26: *"Think about on
 * boarding process too, surely there are things we can do to make it better with certain
 * animation"*). Setup's "How often?" answers each rhythm in a sheet that covers the row it is
 * about; when Save closes it, the row's sentence has already changed underneath — so the row
 * brightens with a soft wash of the accent and lets it go, once, and the eye is taken to the line
 * that changed. Pure TypeScript, tested in node (`savedWash.test.ts`); `SavedWash.tsx` only hands
 * the frame to `interpolate`.
 *
 * ONCE PER SAVE (`washes`): the caller counts saves into a `token`, and each new count washes
 * once. A row that shows the page's first answers — the published starting points, written as the
 * page opens — washes nothing, because nobody saved anything on it.
 *
 * THE WASH IS THE ACCENT'S OWN `tint` (14% over the card), the tint a chip wears; at its fullest
 * every word on the row is measured against it at 4.5:1 in every scheme and theme
 * (`savedWash.test.ts`), so the moment it is brightest is never the moment it is hardest to read.
 *
 * WHEN NOTHING MAY MOVE, NOTHING WASHES: under reduce motion and in the amber Night (where nothing
 * glows) the row simply says its new sentence. The sentence is the answer; the wash only points.
 */
import type { Frame } from './dayNightSwitch';
import { keyFrame, type Key } from './keyframes';

/**
 * A beat after the sheet is gone, so the wash is seen coming up rather than already there. The
 * sheets that ask a rhythm are keyed on their row and vanish on Save; the beat is the eye's.
 */
export const WASH_DELAY_MS = 100;
/** Up, held for a moment, and let go: the whole wash. */
export const WASH_MS = 600;

export const WASH_KEYS: readonly Key[] = [
  [0, 0],
  [0.2, 1],
  [0.36, 1],
  [1, 0],
];

/** Whether a new token washes: a save the row has not answered yet, when something may move. */
export const washes = (was: number, token: number, still: boolean): boolean =>
  !still && token > 0 && token !== was;

export const washFrames = (): { opacity: Frame } => ({ opacity: keyFrame(WASH_KEYS) });
