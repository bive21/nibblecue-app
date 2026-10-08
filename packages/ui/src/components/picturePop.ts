/**
 * A PICTURE, CHOSEN, POPS INTO ITS FRAME — as numbers (the owner, 2026-09-26: *"Think about on
 * boarding process too, surely there are things we can do to make it better with certain
 * animation"*). Setup's first page asks for the baby's picture beside the name; when a photo or one
 * of the drawn babies lands in the 44 pt plate, the plate gives a small pop — a dip, a swell, a
 * settle — and a few short rays sparkle round it once. Pure TypeScript, tested in node
 * (`picturePop.test.ts`); `PicturePop.tsx` only hands these frames to `interpolate`.
 *
 * ONCE PER PICTURE CHOSEN (`pops`): a new picture, different from the one there was. Never when
 * the page opens with a picture already there (a setup resumed after the app was closed), never
 * when the picture is taken away — clearing is not a thing to celebrate — and never when nothing
 * may move.
 *
 * IT WAITS FOR THE SHEET. The chooser is a bottom sheet, and a drawn baby is chosen inside it: the
 * sheet slides away over `SHEET_MS` (BottomSheet's `SHEET_DURATION_MS`, held equal by the test), so
 * the pop starts once the plate is uncovered rather than under a fading scrim.
 *
 * THE RAYS ARE THE CHECKLIST'S SPARKLE (`tickDraw.ts`'s `burstFrames`): the same eight rays, drawn
 * out from just past the ring and in to their tips, so a picture landing and a list finished are
 * one language. The ring sits a point INSIDE the plate's edge, so the rays reach exactly the
 * plate row's own gap beside the name and never onto a letter of it (`popReach`).
 *
 * NOTHING HERE IS ABOUT THE BABY: it answers a parent's pick of a picture, not anything about the
 * child in it (CLAUDE.md §2 rules 3 and 6).
 */
import type { Frame } from './dayNightSwitch';
import { keyFrame, type Key } from './keyframes';
import { BURST_MS, rayReach } from './tickDraw';

/** BottomSheet's slide (`SHEET_DURATION_MS`): the pop waits for the chooser to be gone. */
export const SHEET_MS = 220;
/** The pop itself: a dip, a swell past its size, a settle. */
export const POP_MS = 460;
/** When, in the pop, the rays start: as the picture passes its own size on the way up. */
export const POP_BURST_AT = 0.3;

/**
 * THE POP, as the picture's scale over the pop's clock. It starts and ends at exactly its size, so
 * the picture is never drawn small before the pop begins or left large after it — a little dip
 * first (the anticipation that makes a pop read as a pop), a swell to 1.06, a settle a hair under,
 * and still.
 */
export const POP_KEYS: readonly Key[] = [
  [0, 1],
  [0.16, 0.9],
  [0.5, 1.06],
  [0.78, 0.985],
  [1, 1],
];

/** Whether a change of picture pops: a new one, not a clearing, not the one it opened with. */
export const pops = (was: string | null, now: string | null, still: boolean): boolean =>
  !still && now !== null && now !== was;

/** The ring the rays start from: a point inside the plate's edge (see the header). */
export const popRing = (size: number): number => size / 2 - 1;

/** How far past the plate's edge the farthest ray reaches. */
export const popReach = (size: number): number => rayReach(popRing(size)) - size / 2;

/** When the rays start, from the pop's start, and when the whole thing is over. */
export const POP_BURST_DELAY_MS = Math.round(POP_MS * POP_BURST_AT);
export const POP_TOTAL_MS = Math.max(POP_MS, POP_BURST_DELAY_MS + BURST_MS);

/** The pop's scale frame, for `interpolate` over the value that runs 0 → 1 while it plays. */
export const popFrames = (): { scale: Frame } => ({ scale: keyFrame(POP_KEYS) });
