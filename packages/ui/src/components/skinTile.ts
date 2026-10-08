/**
 * THE DESIGN TILES AS NUMBERS (the owner, 2026-09-25, of the Appearance sheet: *"maybe on the
 * design selection theme, instead of showing just like liquid glass and paper, separate it into
 * 2 sections options, left and right; and then has a 'preview' of what it is"*). Pure, so the room
 * each tile has, the size of the picture in it and the way the chosen mark arrives are tested in
 * node — this package cannot render React Native — and `SkinTile.tsx` only hands them to views.
 *
 * TWO EQUAL TILES SIDE BY SIDE, a gap between, across the sheet's body: 324 pt on a 360 dp phone,
 * 339 on a 375 pt one, 394 on a 430 pt one. Each tile is a picture of the app in its design with the
 * name under it, and the whole tile — picture and name — is one target, far past 44 pt either way.
 * Past `maxRoom` the pair stops growing and centers, because a preview half a tablet wide is a
 * poster and not a choice.
 *
 * THE PICTURE IS THE APP, SMALL. The sample is laid out in a phone-width box (`sample`, 320 × 180,
 * sixteen by nine) with the design system's real components at their real sizes, and the box is
 * scaled into the tile's window with a transform — the pinned preview's method (AppearancePreview
 * `PREVIEW_SCALE`), so every radius, border and shadow inside it keeps its true proportion to the
 * rest and a design's rounder corners read as rounder, not as a number someone chose for a
 * thumbnail.
 *
 * THE CHOSEN TILE IS RINGED AND CHECKED (never color alone: a ring, a check glyph, and `selected`
 * to a screen reader). The ring sits `clear` outside the window, the check badge `badgeInset` in
 * from the window's top right corner — where a phone's photo picker puts it — and a locked tile
 * carries the swatch's lock disc in the same place before it is tapped.
 */
import { space } from '../theme/theme';
import type { Frame } from './dayNightSwitch';

export const SKIN_TILE = {
  /** Between the two tiles: `space.lg`, the room the sheet leaves between neighbors in a row. */
  gap: space.lg,
  /** The ring round the chosen picture, and the clear air between that ring and the picture. */
  ring: 2,
  clear: 2,
  /** The box the sample lays out in before it is scaled into the window: a phone's width, 16:9. */
  sample: { width: 320, height: 180 },
  /** The check or lock badge, its glyph, and how far in from the window's corner it sits. */
  badge: 22,
  badgeGlyph: 13,
  badgeInset: 6,
  /** The widest the pair gets: a 430 pt phone's whole window. */
  maxRoom: 430,
} as const;

export interface SkinTilePair {
  /** Each tile's width. */
  tile: number;
  gap: number;
  /** The pair's width: the room, or `maxRoom` past it. */
  total: number;
}

/** Two tiles and a gap across `room`, up to `maxRoom`. */
export function skinTilePair(room: number): SkinTilePair {
  const total = Math.max(0, Math.min(room, SKIN_TILE.maxRoom));
  return { tile: Math.max(0, (total - SKIN_TILE.gap) / 2), gap: SKIN_TILE.gap, total };
}

export interface SkinTileGeometry {
  tile: number;
  /** How far the window sits inside the tile's edge: the ring, then the clear air. */
  frame: number;
  /** The picture, in the tile's own points. */
  window: { width: number; height: number };
  /** Sample → window: the transform the sample is drawn through. */
  scale: number;
  /** The framed picture's height: the window and the frame above and below it. */
  framed: number;
  /** The check or lock badge's box, from the tile's top right corner. */
  badge: { size: number; glyph: number; top: number; right: number };
}

export function skinTileGeometry(tile: number): SkinTileGeometry {
  const { ring, clear, sample, badge, badgeGlyph, badgeInset } = SKIN_TILE;
  const frame = ring + clear;
  const width = Math.max(0, tile - 2 * frame);
  // to the half point, so the sample's scale and the window's height agree to a pixel
  const height = Math.round(((width * sample.height) / sample.width) * 2) / 2;
  return {
    tile,
    frame,
    window: { width, height },
    scale: width / sample.width,
    framed: height + 2 * frame,
    badge: {
      size: badge,
      glyph: badgeGlyph,
      top: frame + badgeInset,
      right: frame + badgeInset,
    },
  };
}

/* ------------------------------------------------------------------ the mark arriving */

/**
 * HOW THE CHOSEN MARK ARRIVES, on one value from 0 (not chosen) to 1 (chosen), on the native driver.
 * The ring fades in over the first half of the move; the check badge fades in over its first third
 * while it grows from 40% past full size and settles back — a pop, the way a phone's own pickers
 * mark a choice. Leaving, the same frames run backwards in a shorter time: a mark that is being
 * taken away should not take as long to go as the new one takes to arrive.
 *
 * REDUCE MOTION AND THE AMBER THEME SET THE END STATE and start nothing: the mark is simply there,
 * or simply gone (docs/DESIGN_SYSTEM.md §7; night moves nothing it does not have to).
 */
export const SKIN_TILE_MOTION = {
  inMs: 260,
  outMs: 160,
  /** A plain ease-out: the pop is in the frames, so the curve itself never overshoots. */
  ease: [0.25, 0.1, 0.25, 1],
} as const;

const frame = (inputRange: readonly number[], outputRange: readonly number[]): Frame => ({
  inputRange,
  outputRange,
  extrapolate: 'clamp',
});

export interface SkinTileFrames {
  /** Of the value: the ring's opacity. */
  ring: Frame;
  /** Of the value: the check badge's opacity and its scale. */
  badge: Frame;
  badgeScale: Frame;
}

export const SKIN_TILE_FRAMES: SkinTileFrames = {
  ring: frame([0, 0.5], [0, 1]),
  badge: frame([0, 0.3], [0, 1]),
  badgeScale: frame([0, 0.6, 1], [0.4, 1.12, 1]),
};
