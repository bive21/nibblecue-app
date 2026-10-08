/**
 * THE PICTURES A DRAWN BABY BECAME, AS A PHONE STORED THEM (2026-09-29), for the tests of the
 * blank-picture verdict and the mend (`media/blankPicture.test.ts`, `media/photoMend.test.ts`).
 *
 * `oldIphonePicture` is what a baby picked on an iPhone before 2026-09-29 was stored as. The old
 * export asked react-native-svg for the chooser's 64 pt face at 512, and iOS drew it at 64 pt in
 * the top-left corner of a 512 pt canvas (at the screen's 2x or 3x, so 128 or 192 px of a 1024 or
 * 1536 px canvas), the rest transparent; `prepareChildPhoto` scaled that to 512 px and saved a JPEG
 * at 0.8, which has no transparency, so the empty part became one flat color — white on the
 * owner's phones ("white empty"), black on an encoder that drops the alpha instead. Each step can be
 * varied: the screen's scale, how the resize samples (a box average, or the crudest point sampling),
 * a Display P3 color profile on a wide-gamut iPhone, and the JPEG's quality.
 *
 * `drawnPictureJpeg` is what a pick makes now, on either phone: the app's own drawing at 512
 * (`avatarPicture`) saved the same way.
 */
import { CHILD_PHOTO_SIDE } from '@nibblecue/core';
import { babyShapes, type BabyAvatarDef } from '../media/avatars/art';
import { avatarPicture } from '../media/avatars/picture';
import { rasterize, type Raster } from '../media/avatars/raster';
import { encodeJpeg } from './jpeg';

export type Rgb = readonly [number, number, number];
export const WHITE: Rgb = [255, 255, 255];
export const BLACK: Rgb = [0, 0, 0];

/** The chooser's face, in points: `AvatarGrid` `AVATAR_CHOICE_SIZE`. */
const FACE_PT = 64;

/** `src` brought down to `side`, each pixel the mean of the pixels under it. */
function boxDown(src: Raster, side: number): Raster {
  const k = src.width / side;
  const rgb = new Uint8Array(side * side * 3);
  for (let y = 0; y < side; y += 1)
    for (let x = 0; x < side; x += 1)
      for (let ch = 0; ch < 3; ch += 1) {
        let s = 0;
        for (let j = 0; j < k; j += 1)
          for (let i = 0; i < k; i += 1)
            s += src.rgb[((y * k + j) * src.width + x * k + i) * 3 + ch] ?? 0;
        rgb[(y * side + x) * 3 + ch] = Math.round(s / (k * k));
      }
  return { width: side, height: side, rgb };
}

/** `src` brought down to `side` by taking one pixel of each square: the crudest resize there is. */
function pointDown(src: Raster, side: number): Raster {
  const k = src.width / side;
  const rgb = new Uint8Array(side * side * 3);
  for (let y = 0; y < side; y += 1)
    for (let x = 0; x < side; x += 1) {
      const from = (Math.floor(y * k + k / 2) * src.width + Math.floor(x * k + k / 2)) * 3;
      rgb.set(src.rgb.subarray(from, from + 3), (y * side + x) * 3);
    }
  return { width: side, height: side, rgb };
}

/** sRGB colors written in Display P3's numbers, as a wide-gamut iPhone may write them. */
function inDisplayP3(r: Raster): Raster {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const enc = (v: number) => {
    const c = Math.max(0, Math.min(1, v));
    return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
  };
  // linear sRGB to linear Display P3 (both D65)
  const m = [
    [0.8225, 0.1774, 0.0],
    [0.0332, 0.9669, 0.0],
    [0.0171, 0.0724, 0.9108],
  ] as const;
  const rgb = new Uint8Array(r.rgb.length);
  for (let p = 0; p < r.rgb.length; p += 3) {
    const l = [lin(r.rgb[p] ?? 0), lin(r.rgb[p + 1] ?? 0), lin(r.rgb[p + 2] ?? 0)] as const;
    for (let ch = 0; ch < 3; ch += 1) {
      const row = m[ch] ?? m[0];
      rgb[p + ch] = enc(row[0] * l[0] + row[1] * l[1] + row[2] * l[2]);
    }
  }
  return { ...r, rgb };
}

/** A `side` square of one color. */
export function flatPicture(color: Rgb, side = CHILD_PHOTO_SIDE): Raster {
  const rgb = new Uint8Array(side * side * 3);
  for (let p = 0; p < rgb.length; p += 3) rgb.set(color, p);
  return { width: side, height: side, rgb };
}

/** `small` laid over `big` at its top-left corner. */
export function pastedInCorner(big: Raster, small: Raster): Raster {
  const rgb = Uint8Array.from(big.rgb);
  for (let y = 0; y < small.height; y += 1)
    rgb.set(small.rgb.subarray(y * small.width * 3, (y + 1) * small.width * 3), y * big.width * 3);
  return { ...big, rgb };
}

export interface OldIphoneRoad {
  /** The iPhone's screen scale: 3 on most, 2 on the smaller ones. */
  scale?: 2 | 3;
  /** What the JPEG made of the transparent part. */
  ground?: Rgb;
  /** How the pipeline's resize brought the canvas down to 512. */
  resize?: 'box' | 'point';
  /** A wide-gamut iPhone writing its colors in Display P3. */
  p3?: boolean;
  quality?: number;
}

/** The corner of the old iPhone picture: the chooser's face as it reached the 512 px picture. */
export function oldIphoneCorner(def: BabyAvatarDef, road: OldIphoneRoad = {}): Raster {
  const { scale = 3, resize = 'box', p3 = false } = road;
  // the 512 pt canvas became the 512 px picture, so the face's 64 pt are 64 px of it
  const side = FACE_PT;
  const drawn = rasterize(babyShapes(def), side * scale);
  const down = resize === 'box' ? boxDown(drawn, side) : pointDown(drawn, side);
  return p3 ? inDisplayP3(down) : down;
}

/** The old iPhone picture's bytes, as stored (see the header). */
export function oldIphonePicture(def: BabyAvatarDef, road: OldIphoneRoad = {}): Uint8Array {
  const picture = pastedInCorner(flatPicture(road.ground ?? WHITE), oldIphoneCorner(def, road));
  return encodeJpeg(picture, { quality: road.quality ?? 80 });
}

/** What a pick of `def` stores now, on either phone. */
export const drawnPictureJpeg = (def: BabyAvatarDef): Uint8Array =>
  encodeJpeg(avatarPicture(def), { quality: 80 });
