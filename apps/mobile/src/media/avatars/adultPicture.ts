/**
 * A DRAWN GROWN-UP AS A PICTURE ON THIS PHONE (2026-09-30): its shapes (`adults.ts`) drawn by the
 * app's own rasterizer (`raster.ts`) and written as a PNG (`png.ts`). Pure, so node holds the exact
 * bytes a phone keeps; `adultFile.ts` is the half that writes the file.
 *
 * WHY A FILE AT ALL, when a drawing is only an id on the server: every circle the design system
 * draws a person in (the top bar's button, a row, the who's-on square) takes a picture by its
 * address and falls back to the initial on its own (`Avatar`, `photoTrouble.ts`). A drawing kept as
 * a file goes through exactly that road, offline, on every phone, with nothing uploaded.
 *
 * 256 PX, NOT THE PHOTO'S 512: the largest circle that draws it from the file is 44 pt (132 px on a
 * 3× screen), and the picture sheet's big preview draws the vector itself (`AdultAvatarArt`). Half
 * the side is a quarter of the drawing's work and of its file.
 */
import { adultShapes, type AdultAvatarDef } from './adults';
import { encodePng } from './png';
import { rasterize, type Raster } from './raster';

export const ADULT_PICTURE_SIDE = 256;

export const adultPicture = (def: AdultAvatarDef): Raster =>
  rasterize(adultShapes(def), ADULT_PICTURE_SIDE);

export const adultPng = (def: AdultAvatarDef): Uint8Array => encodePng(adultPicture(def));

/**
 * WHICH DRAWING, NOT ONLY WHICH ID: the id and a hash of its shapes (FNV-1a over their JSON), as the
 * babies' `drawingKey` is, so a file kept of one drawing is never a drawing the set has since
 * redrawn under the same id: a new drawing is a new name, and the old file goes at sign-out.
 */
export function adultDrawingKey(def: AdultAvatarDef): string {
  const text = JSON.stringify(adultShapes(def));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `adult-${def.id}-${h.toString(36)}`;
}
