/**
 * A PICTURE THAT SHOWS NOTHING, KNOWN FROM ITS BYTES (2026-09-29). The owner: *"the avatar still
 * showing as white empty with party hat. on both android and iphone (same household)"*. The picture
 * both phones drew was the one a drawn baby picked on an iPhone had been stored as before that day's
 * fix: the baby in the top-left corner, the rest the flat color a JPEG makes of transparency
 * (`testing/avatarPictures.ts` makes it the way the phones did). It loads without a fault, so the
 * initial's fallback never ran; `blankPicture.ts` looks at what is in the circle instead.
 *
 * Held here: that picture is known for what it is, with the baby in its corner named, through every
 * road a phone could have taken to it; a picture with nothing in it at all is empty with no baby;
 * everything that shows something — every drawing the app makes now, a photo, a white blanket, a sky
 * — is a picture, known from its first blocks; and a file the reader does not read is drawn as it is.
 */
import { CHILD_PHOTO_SIDE } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BLACK,
  drawnPictureJpeg,
  flatPicture,
  oldIphoneCorner,
  oldIphonePicture,
  pastedInCorner,
  WHITE,
  type Rgb,
} from '../testing/avatarPictures';
import { encodeJpeg } from '../testing/jpeg';
import { BABY_AVATARS, babyShapes, type BabyAvatarDef } from './avatars/art';
import { avatarPicture, avatarPng } from './avatars/picture';
import { rasterize, type Raster } from './avatars/raster';
import {
  judgePicture,
  MATCH_MARGIN,
  MATCH_WITHIN,
  OLD_CANVAS_PT,
  OLD_FACE_PT,
  whichBaby,
  type PictureVerdict,
} from './blankPicture';

const here = dirname(fileURLToPath(import.meta.url));
const first = BABY_AVATARS[0] as BabyAvatarDef;

/** A verdict as a line a failure can print: the kind, the ground and the baby's id. */
const said = (v: PictureVerdict): string =>
  v.kind === 'blank' ? `blank ${v.ground.join(',')} ${v.baby?.id ?? 'no baby'}` : v.kind;

const close = (a: Rgb, b: Rgb) => a.every((v, i) => Math.abs(v - (b[i] ?? 0)) <= 1);

/** Seeded noise, so a failure is the same failure every run. */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000 - 0.5;
  };
}

/** A picture by a function of each pixel. */
function picture(side: number, paint: (x: number, y: number) => Rgb): Raster {
  const rgb = new Uint8Array(side * side * 3);
  for (let y = 0; y < side; y += 1)
    for (let x = 0; x < side; x += 1)
      rgb.set(
        paint(x, y).map(v => Math.max(0, Math.min(255, Math.round(v)))),
        (y * side + x) * 3,
      );
  return { width: side, height: side, rgb };
}

describe('the old iPhone picture: nothing in the circle, the baby in the corner', () => {
  it('is known on every phone for every baby, as the owner’s were stored: white, from a 3x iPhone', () => {
    for (const def of BABY_AVATARS) {
      const v = judgePicture(oldIphonePicture(def));
      expect(said(v), def.id).toBe(`blank 255,255,255 ${def.id}`);
    }
  });

  it('whatever the transparent part became, and from a 2x iPhone too', () => {
    for (const def of BABY_AVATARS.slice(0, 6)) {
      for (const road of [{ ground: BLACK }, { scale: 2 as const }, { quality: 95 }]) {
        const v = judgePicture(oldIphonePicture(def, road));
        expect(v.kind, `${def.id} ${JSON.stringify(road)}`).toBe('blank');
        if (v.kind === 'blank') {
          expect(close(v.ground, road.ground ?? WHITE), def.id).toBe(true);
          expect(v.baby?.id, `${def.id} ${JSON.stringify(road)}`).toBe(def.id);
        }
      }
    }
  });

  /**
   * THE HARSHEST ROAD, where the bounds were measured: the crudest resize, a wide-gamut iPhone's
   * Display P3, and a JPEG at 60. Every baby is still itself, by the margin the bounds ask for.
   */
  it('through the harshest road a phone could have taken: every baby still named, by its margin', () => {
    const harsh = { resize: 'point', p3: true, quality: 60 } as const;
    for (const def of BABY_AVATARS) {
      const v = judgePicture(oldIphonePicture(def, harsh));
      expect(said(v), def.id).toBe(`blank 255,255,255 ${def.id}`);
    }
  });
});

describe('which baby a corner is', () => {
  it('each drawing is itself', () => {
    for (const def of BABY_AVATARS)
      expect(whichBaby(rasterize(babyShapes(def), 64))?.id).toBe(def.id);
  });

  it('is none of them when the corner is not one of the app’s drawings beyond doubt', () => {
    // nothing drawn at all
    expect(whichBaby(flatPicture(WHITE, 64))).toBeNull();
    expect(whichBaby(flatPicture([236, 231, 250], 64))).toBeNull();
    // a drawing the set does not have: a baby of its own colors, every one of them turned about
    const def = BABY_AVATARS[5] as BabyAvatarDef;
    const drawn = rasterize(babyShapes(def), 64);
    const turned: Raster = {
      ...drawn,
      rgb: drawn.rgb.map((v, i) =>
        i % 3 === 0 ? (drawn.rgb[i + 2] ?? v) : i % 3 === 2 ? (drawn.rgb[i - 2] ?? v) : v,
      ),
    };
    expect(whichBaby(turned)).toBeNull();
    // the corner of a photo
    const rnd = noise(3);
    expect(
      whichBaby(picture(64, () => [120 + 60 * rnd(), 90 + 60 * rnd(), 70 + 60 * rnd()])),
    ).toBeNull();
    // and a corner that is half one baby and half another is neither
    const other = rasterize(babyShapes(BABY_AVATARS[6] as BabyAvatarDef), 64);
    const half: Raster = {
      ...drawn,
      rgb: drawn.rgb.map((v, i) => (Math.floor(i / 3) % 64 < 32 ? v : (other.rgb[i] ?? v))),
    };
    expect(whichBaby(half)).toBeNull();
  });

  it('sits inside bounds that leave room: the nearest two drawings are further apart than the margin', () => {
    const drawings = BABY_AVATARS.map(d => rasterize(babyShapes(d), 64));
    let nearest = Infinity;
    for (let a = 0; a < drawings.length; a += 1)
      for (let b = a + 1; b < drawings.length; b += 1) {
        const da = drawings[a] as Raster;
        const db = drawings[b] as Raster;
        let s = 0;
        for (let i = 0; i < da.rgb.length; i += 1)
          s += Math.abs((da.rgb[i] ?? 0) - (db.rgb[i] ?? 0));
        nearest = Math.min(nearest, s / da.rgb.length);
      }
    expect(nearest).toBeGreaterThan(2 * MATCH_MARGIN);
    expect(MATCH_WITHIN).toBeGreaterThan(MATCH_MARGIN);
  });
});

describe('a picture with nothing in it at all', () => {
  it('is empty with no baby: a transparent canvas, flat white, flat black, a flat pastel', () => {
    for (const color of [WHITE, BLACK, [237, 231, 250] as const]) {
      const v = judgePicture(encodeJpeg(flatPicture(color)));
      expect(v.kind).toBe('blank');
      if (v.kind === 'blank') {
        expect(close(v.ground, color), color.join(',')).toBe(true);
        expect(v.baby).toBeNull();
      }
    }
  });

  it('is empty whatever is outside the circle: only what the avatar shows is judged', () => {
    // dark corners, as a vignette leaves them — and not a drawing of the app's
    const vignette = picture(CHILD_PHOTO_SIDE, (x, y) => {
      const r = Math.hypot(x + 0.5 - 256, y + 0.5 - 256);
      return r < 300 ? WHITE : [40, 30, 20];
    });
    const v = judgePicture(encodeJpeg(vignette));
    expect(said(v)).toBe('blank 255,255,255 no baby');
  });
});

describe('a picture that shows something', () => {
  it('every baby as the app draws it now, on either phone: what the mend sends is never mended again', () => {
    for (const def of BABY_AVATARS) {
      expect(judgePicture(drawnPictureJpeg(def)).kind, def.id).toBe('picture');
      expect(
        judgePicture(encodeJpeg(avatarPicture(def), { sampling: '444', quality: 95 })).kind,
      ).toBe('picture');
    }
  });

  it('a photo, a white blanket with a camera’s grain, a sky with no texture, a gray one', () => {
    const rnd = noise(11);
    const photo = picture(CHILD_PHOTO_SIDE, (x, y) => [
      128 + 90 * Math.sin(x / 17) * Math.cos(y / 23) + 20 * rnd(),
      (x * 255) / 512 + 20 * rnd(),
      (y * 255) / 512 + 20 * rnd(),
    ]);
    const blanket = picture(CHILD_PHOTO_SIDE, () => {
      const g = 250 + 6 * rnd();
      return [g, g, g - 2];
    });
    const sky = picture(CHILD_PHOTO_SIDE, (_x, y) => [120 + y / 8, 170 + y / 10, 235]);
    for (const [name, raster] of [
      ['photo', photo],
      ['blanket', blanket],
      ['sky', sky],
    ] as const) {
      expect(judgePicture(encodeJpeg(raster)).kind, name).toBe('picture');
    }
    expect(judgePicture(encodeJpeg(photo, { sampling: 'gray' })).kind).toBe('picture');
  });

  it('is known from its first blocks: the rest of the file need not even be there', () => {
    // cut the file off halfway: a picture is answered long before the cut, an empty one is not
    const cut = (bytes: Uint8Array) => bytes.subarray(0, Math.floor(bytes.length * 0.5));
    expect(judgePicture(cut(drawnPictureJpeg(first))).kind).toBe('picture');
    expect(judgePicture(cut(oldIphonePicture(first))).kind).toBe('unread');
  });
});

describe('a file it does not read is drawn as it is', () => {
  it('a progressive file, a PNG, and bytes that only begin like a JPEG', () => {
    const progressive = Uint8Array.from(drawnPictureJpeg(first));
    for (let i = 2; i < progressive.length - 1; i += 1)
      if (progressive[i] === 0xff && progressive[i + 1] === 0xc0) {
        progressive[i + 1] = 0xc2;
        break;
      }
    expect(judgePicture(progressive)).toEqual({
      kind: 'unread',
      why: 'frame type c2 is not sequential Huffman',
    });
    expect(judgePicture(avatarPng(first))).toEqual({ kind: 'unread', why: 'not a JPEG' });
    // the stand-in the setup photo's tests send: a JPEG's first bytes and nothing after
    expect(judgePicture(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6, 5])).kind).toBe(
      'unread',
    );
    expect(judgePicture(new Uint8Array(0)).kind).toBe('unread');
  });
});

describe('what it rests on', () => {
  it('the corner is the chooser’s face in the canvas the old export asked for', () => {
    const grid = readFileSync(join(here, 'avatars', 'AvatarGrid.tsx'), 'utf8');
    expect(grid).toContain(`export const AVATAR_CHOICE_SIZE = ${OLD_FACE_PT} as const;`);
    // the old export asked toDataURL for the photo pipeline's own side (git show bfcc863)
    expect(OLD_CANVAS_PT).toBe(CHILD_PHOTO_SIDE);
    // and the corner of the simulated picture is exactly that eighth of it
    expect(oldIphoneCorner(first).width).toBe((CHILD_PHOTO_SIDE * OLD_FACE_PT) / OLD_CANVAS_PT);
  });

  it('the corner lies wholly outside the circle, so the corner never makes the circle a picture', () => {
    const side = CHILD_PHOTO_SIDE;
    const corner = (side * OLD_FACE_PT) / OLD_CANVAS_PT;
    // the corner's point nearest the middle is outside even the full circle the avatar shows
    expect(Math.hypot(side / 2 - corner, side / 2 - corner)).toBeGreaterThan(side / 2);
    // and a corner of anything at all leaves an otherwise empty picture empty
    const rnd = noise(5);
    const scribble = picture(corner, () => [255 * (rnd() + 0.5), 255 * (rnd() + 0.5), 0]);
    const v = judgePicture(encodeJpeg(pastedInCorner(flatPicture(WHITE), scribble)));
    expect(said(v)).toBe('blank 255,255,255 no baby');
  });

  it('what a resize leaves a pixel or two past the corner’s edge never makes the circle a picture', () => {
    // the 16 px chroma block at (64, 64), beside the corner, reaches inside the full circle...
    const side = CHILD_PHOTO_SIDE;
    expect(Math.hypot(side / 2 - 79.5, side / 2 - 79.5)).toBeLessThan(side / 2);
    // ...so a vivid speck there, where a soft resize filter could leave the drawing's edge, would
    // count as something in the circle; the rim the verdict leaves out is what keeps it out
    for (const def of BABY_AVATARS.slice(0, 4)) {
      const speck = picture(OLD_FACE_PT + 2, (x, y) =>
        x >= OLD_FACE_PT && y >= OLD_FACE_PT ? [230, 20, 60] : [255, 255, 255],
      );
      const withSpeck = pastedInCorner(
        pastedInCorner(flatPicture(WHITE), speck),
        oldIphoneCorner(def),
      );
      expect(said(judgePicture(encodeJpeg(withSpeck))), def.id).toBe(`blank 255,255,255 ${def.id}`);
    }
  });
});
