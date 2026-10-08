/**
 * A DRAWN BABY'S PICTURE, AS IT LEAVES THE PHONE: its shapes (`art.ts`) drawn at the photo
 * pipeline's own size (`CHILD_PHOTO_SIDE`) by `raster.ts`, and written as a PNG by `png.ts`, which
 * `render.ts` hands to the same re-encode a photo gets. Pure, so node holds the exact bytes a phone
 * makes (`raster.test.ts`); `render.ts` is the half that needs a phone.
 */
import { CHILD_PHOTO_SIDE } from '@nibblecue/core';
import { babyShapes, type BabyAvatarDef } from './art';
import { encodePng } from './png';
import { rasterize, type Raster } from './raster';

/** The chosen baby, as the pixels of its picture. */
export const avatarPicture = (def: BabyAvatarDef): Raster =>
  rasterize(babyShapes(def), CHILD_PHOTO_SIDE);

/** The chosen baby, as the PNG bytes `render.ts` writes for the re-encode. */
export const avatarPng = (def: BabyAvatarDef): Uint8Array => encodePng(avatarPicture(def));

/**
 * WHICH DRAWING, NOT ONLY WHICH BABY: the id and a hash of the shapes it is drawn with (FNV-1a over
 * their JSON), so a kept file of one baby's picture (`drawnBabyFile`) is never a drawing the set
 * has since replaced — a new drawing is a new name, and the old file goes at sign-out.
 */
export function drawingKey(def: BabyAvatarDef): string {
  const text = JSON.stringify(babyShapes(def));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${def.id}-${h.toString(36)}`;
}
