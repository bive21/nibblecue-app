/**
 * THE PICTURE A DRAWN BABY BECOMES (2026-09-29), held pixel by pixel.
 *
 * The owner, 2026-09-28, on an iPhone: a drawn baby picked in setup, and "the bling showed but the
 * background is just empty white ish, with no avatar". The picture used to come from
 * react-native-svg's `toDataURL` on the chooser's 64 pt face, asked for at 512: Android fits the
 * drawing to the 512 canvas, iOS draws it at the view's own 64 pt in the canvas's corner
 * (`raster.ts` quotes both native sources). A round avatar shows the square's inscribed circle,
 * and that corner lies wholly outside it. The first block below measures exactly that, with the
 * drawing the phone makes; the rest holds the app's own drawing of the babies, which replaced it,
 * to the shapes, the circle and the file format.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 as zlibCrc32, inflateSync } from 'node:zlib';
import { CHILD_PHOTO_SIDE } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../testing/png';
import { BABY_AVATARS, babyShapes, type ArtShape, type BabyAvatarDef } from './art';
import { avatarPicture, avatarPng } from './picture';
import { crc32, encodePng } from './png';
import { pathPieces, rasterize, rgbOfHex, type Raster } from './raster';

const here = dirname(fileURLToPath(import.meta.url));
const flat = (s: string) => s.replace(/\s+/g, ' ');

type Rgb = readonly [number, number, number];

const at = (r: Raster, x: number, y: number): Rgb => {
  const i = (y * r.width + x) * 3;
  return [r.rgb[i] ?? 0, r.rgb[i + 1] ?? 0, r.rgb[i + 2] ?? 0];
};
const apart = (a: Rgb, b: Rgb) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** Every pixel whose middle is inside the square's inscribed circle: what a round avatar shows. */
function* circle(size: number): Generator<[number, number]> {
  const c = size / 2;
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      if (dx * dx + dy * dy <= c * c) yield [x, y];
    }
}

/** The share of the round avatar that is not the flat `ground`: the baby, and nothing else. */
function babyShare(r: Raster, ground: Rgb): number {
  let inside = 0;
  let baby = 0;
  for (const [x, y] of circle(r.width)) {
    inside += 1;
    if (apart(at(r, x, y), ground) > 24) baby += 1;
  }
  return baby / inside;
}

/** A canvas of one color, as the JPEG encoder leaves a canvas's empty part. */
function plain(size: number, color: Rgb): Raster {
  const rgb = new Uint8Array(size * size * 3);
  for (let p = 0; p < rgb.length; p += 3) rgb.set(color, p);
  return { width: size, height: size, rgb };
}

/** `src` laid into `dst` at its top-left corner. */
function pasted(dst: Raster, src: Raster): Raster {
  const out = new Uint8Array(dst.rgb);
  for (let y = 0; y < src.height; y += 1)
    out.set(src.rgb.subarray(y * src.width * 3, (y + 1) * src.width * 3), y * dst.width * 3);
  return { ...dst, rgb: out };
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

describe('the empty circle on an iPhone, measured (2026-09-28)', () => {
  // the chooser's faces are 64 pt (`AvatarGrid` `AVATAR_CHOICE_SIZE`); at 3x that is 192 px, which
  // the photo pipeline scales down to 64 of the 512 it keeps
  const CHOOSER = 64;

  it('drawn in the chooser’s own bounds, in the corner of the canvas asked for, no pixel of the baby reaches the round avatar', () => {
    for (const def of BABY_AVATARS) {
      const inCorner = rasterize(babyShapes(def), CHOOSER);
      // whichever flat color the empty part became, the circle is that color and nothing else
      for (const empty of [WHITE, BLACK]) {
        const picture = pasted(plain(CHILD_PHOTO_SIDE, empty), inCorner);
        expect(babyShare(picture, empty), `${def.id} on ${empty.join(',')}`).toBe(0);
      }
    }
  });

  it('fitted to the canvas, as Android draws it and as the app now draws it everywhere, the baby is half the circle', () => {
    for (const def of BABY_AVATARS) {
      expect(babyShare(avatarPicture(def), rgbOfHex(def.background)), def.id).toBeGreaterThan(0.4);
    }
  });

  it('the grid still draws its faces at the size the old export read them from', () => {
    const grid = readFileSync(join(here, 'AvatarGrid.tsx'), 'utf8');
    expect(grid).toMatch(new RegExp(`AVATAR_CHOICE_SIZE = ${CHOOSER} as const`));
  });
});

describe('the picture a drawn baby becomes', () => {
  it('is the photo pipeline’s own square', () => {
    for (const def of BABY_AVATARS) {
      const p = avatarPicture(def);
      expect([p.width, p.height], def.id).toEqual([CHILD_PHOTO_SIDE, CHILD_PHOTO_SIDE]);
      expect(p.rgb.length).toBe(CHILD_PHOTO_SIDE * CHILD_PHOTO_SIDE * 3);
    }
  });

  it('has the baby’s own ground in its corners and the baby’s own skin at the middle of the face', () => {
    const s = CHILD_PHOTO_SIDE;
    for (const def of BABY_AVATARS) {
      const p = avatarPicture(def);
      const ground = rgbOfHex(def.background);
      for (const [x, y] of [
        [0, 0],
        [s - 1, 0],
      ] as const)
        expect(apart(at(p, x, y), ground), `${def.id} corner ${x},${y}`).toBeLessThanOrEqual(3);
      // (50, 56.6) in the drawing's box: under the eyes, above the mouth, on every baby
      expect(apart(at(p, s / 2, Math.round((s * 56.6) / 100)), rgbOfHex(def.skin)), def.id).toBe(0);
    }
  });

  it('shows the face inside the round avatar, not only the hair and the clothes', () => {
    for (const def of BABY_AVATARS) {
      const p = avatarPicture(def);
      const skin = rgbOfHex(def.skin);
      let inside = 0;
      let face = 0;
      for (const [x, y] of circle(p.width)) {
        inside += 1;
        if (apart(at(p, x, y), skin) <= 6) face += 1;
      }
      expect(face / inside, def.id).toBeGreaterThan(0.1);
    }
  });

  it('is the same picture on every phone: drawing it twice gives the same pixels', () => {
    const def = BABY_AVATARS[0] as BabyAvatarDef;
    expect(avatarPicture(def).rgb).toEqual(avatarPicture(def).rgb);
  });
});

describe('the drawing, shape by shape', () => {
  const ground: ArtShape = { kind: 'rect', x: 0, y: 0, width: 100, height: 100, fill: '#FFFFFF' };
  /** How much of the canvas is covered, in the drawing's own square units, by a black shape. */
  const inked = (r: Raster): number => {
    let dark = 0;
    for (let k = 0; k < r.rgb.length; k += 3) dark += (255 - (r.rgb[k] ?? 0)) / 255;
    return (dark * 100 * 100) / (r.width * r.height);
  };
  const SIZE = 400;

  it('lands a shape where the drawing says, and nowhere else', () => {
    const r = rasterize(
      [ground, { kind: 'rect', x: 10, y: 20, width: 30, height: 40, fill: '#000000' }],
      100,
    );
    expect(at(r, 10, 20)).toEqual(BLACK);
    expect(at(r, 39, 59)).toEqual(BLACK);
    expect(at(r, 9, 20)).toEqual(WHITE);
    expect(at(r, 40, 20)).toEqual(WHITE);
    expect(at(r, 10, 60)).toEqual(WHITE);
    expect(inked(r)).toBeCloseTo(30 * 40, 5);
  });

  it('covers a circle’s area, an ellipse’s and a rounded rectangle’s, edges and all', () => {
    const circleArea = inked(
      rasterize([ground, { kind: 'circle', cx: 50, cy: 50, r: 30, fill: '#000000' }], SIZE),
    );
    expect(circleArea / (Math.PI * 30 * 30)).toBeCloseTo(1, 2);
    const ellipseArea = inked(
      rasterize([ground, { kind: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 12, fill: '#000' }], SIZE),
    );
    expect(ellipseArea / (Math.PI * 30 * 12)).toBeCloseTo(1, 2);
    const rounded = inked(
      rasterize(
        [ground, { kind: 'rect', x: 20, y: 30, width: 40, height: 20, rx: 6, fill: '#000000' }],
        SIZE,
      ),
    );
    expect(rounded / (40 * 20 - (4 - Math.PI) * 6 * 6)).toBeCloseTo(1, 2);
  });

  it('strokes a line with round ends: its length times its width, and a half disc at each end', () => {
    const r = rasterize(
      [ground, { kind: 'path', d: 'M20 50 L80 50', stroke: '#000000', strokeWidth: 10 }],
      SIZE,
    );
    expect(inked(r) / (60 * 10 + Math.PI * 5 * 5)).toBeCloseTo(1, 2);
    // a stroke is not a fill: a path with a stroke alone paints nothing between its ends
    const open = rasterize(
      [ground, { kind: 'path', d: 'M20 20 L80 20 L80 80', stroke: '#000000', strokeWidth: 2 }],
      SIZE,
    );
    expect(at(open, SIZE / 2, SIZE / 2)).toEqual(WHITE);
  });

  it('paints a stroke at an opacity once, even where its own pieces overlap', () => {
    const r = rasterize(
      [
        ground,
        {
          kind: 'path',
          d: 'M20 20 L50 80 L80 20',
          stroke: '#000000',
          strokeWidth: 8,
          opacity: 0.5,
        },
      ],
      SIZE,
    );
    let darkest = 255;
    for (let k = 0; k < r.rgb.length; k += 3) darkest = Math.min(darkest, r.rgb[k] ?? 255);
    // one coat of half black over white is 127.5; two would be 64
    expect(darkest).toBeGreaterThanOrEqual(127);
    expect(darkest).toBeLessThanOrEqual(128);
  });

  it('fills by the nonzero rule: a piece wound the other way is a hole, the same way is not', () => {
    const outer = 'M10 10 L90 10 L90 90 L10 90 Z';
    const hole = rasterize(
      [ground, { kind: 'path', d: `${outer} M30 30 L30 70 L70 70 L70 30 Z`, fill: '#000000' }],
      100,
    );
    expect(at(hole, 50, 50)).toEqual(WHITE);
    expect(at(hole, 20, 50)).toEqual(BLACK);
    const same = rasterize(
      [ground, { kind: 'path', d: `${outer} M30 30 L70 30 L70 70 L30 70 Z`, fill: '#000000' }],
      100,
    );
    expect(at(same, 50, 50)).toEqual(BLACK);
  });

  it('lays a color at an opacity over what is already there', () => {
    const r = rasterize(
      [ground, { kind: 'circle', cx: 50, cy: 50, r: 40, fill: '#000000', opacity: 0.5 }],
      100,
    );
    expect(at(r, 50, 50)).toEqual([128, 128, 128]);
  });

  it('reads colors as the drawing writes them, and refuses one it cannot paint', () => {
    expect(rgbOfHex('#F07C86')).toEqual([0xf0, 0x7c, 0x86]);
    expect(rgbOfHex('#abc')).toEqual([0xaa, 0xbb, 0xcc]);
    expect(() => rgbOfHex('rebeccapurple')).toThrow(/not a color/);
  });

  it('draws every shape of every baby: every command and every color in the set is one it knows', () => {
    for (const def of BABY_AVATARS) expect(() => avatarPicture(def), def.id).not.toThrow();
  });
});

describe('the paths', () => {
  const ends = (d: string) =>
    pathPieces(d, 1).map(p => [p.points.slice(0, 2), p.points.slice(-2), p.closed]);

  it('reads absolute and relative commands, and the pairs after a moveto as lines', () => {
    expect(ends('M10 10 20 20 l5 0 h5 v5 H0 V0 Z')).toEqual([[[10, 10], [0, 0], true]]);
    expect(ends('m10 10 5 5')).toEqual([[[10, 10], [15, 15], false]]);
    expect(ends('M1,2L3-4')).toEqual([[[1, 2], [3, -4], false]]);
  });

  it('ends each curve where it says, relative curves and the reflected ones too', () => {
    expect(ends('M0 0 C10 0 10 10 0 10')).toEqual([[[0, 0], [0, 10], false]]);
    expect(ends('M33 30 q3 -3.5 6 0')).toEqual([[[33, 30], [39, 30], false]]);
    expect(ends('M0 0 Q5 5 10 0 T20 0')).toEqual([[[0, 0], [20, 0], false]]);
    expect(ends('M0 0 C0 5 5 5 5 0 S10 -5 10 0')).toEqual([[[0, 0], [10, 0], false]]);
  });

  it('starts a new piece after Z where the closed one began', () => {
    const pieces = pathPieces('M10 10 L20 10 L20 20 Z L30 30', 1);
    expect(pieces).toHaveLength(2);
    expect(pieces[1]?.points.slice(0, 2)).toEqual([10, 10]);
  });

  it('refuses what it would draw wrong, out loud', () => {
    expect(() => pathPieces('M0 0 A5 5 0 0 1 10 0', 1)).toThrow(/not drawn here/);
    expect(() => pathPieces('M0 0 L10 10 Z 5', 1)).toThrow(/number after Z/);
    expect(() => pathPieces('10 10', 1)).toThrow(/starts with a number/);
    expect(() => pathPieces('M0 0 L10', 1)).toThrow(/short of a number/);
  });
});

describe('the file it leaves in', () => {
  const def = BABY_AVATARS[0] as BabyAvatarDef;

  it('opens as exactly the picture drawn', () => {
    const picture = avatarPicture(def);
    const back = decodePng(avatarPng(def), def.id);
    expect([back.width, back.height]).toEqual([picture.width, picture.height]);
    for (let y = 0; y < picture.height; y += 7)
      for (let x = 0; x < picture.width; x += 5) expect(back.rgb(x, y)).toEqual(at(picture, x, y));
  });

  it('is a PNG any decoder opens: the header, the chunks and their CRCs, stored deflate', () => {
    const png = encodePng({
      width: 3,
      height: 2,
      rgb: Uint8Array.from({ length: 18 }, (_, k) => k * 13),
    });
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = Buffer.from(png);
    const chunks: { type: string; data: Buffer }[] = [];
    for (let o = 8; o < view.length;) {
      const len = view.readUInt32BE(o);
      const type = view.subarray(o + 4, o + 8).toString('latin1');
      const data = view.subarray(o + 8, o + 8 + len);
      // the CRC node's own zlib computes over the type and the data
      expect(view.readUInt32BE(o + 8 + len), type).toBe(
        zlibCrc32(view.subarray(o + 4, o + 8 + len)),
      );
      chunks.push({ type, data });
      o += 12 + len;
    }
    expect(chunks.map(c => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const ihdr = chunks[0]?.data ?? Buffer.alloc(13);
    expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4), ...ihdr.subarray(8)]).toEqual([
      3, 2, 8, 2, 0, 0, 0,
    ]);
    // every row behind its filter byte, and nothing lost on the way through zlib
    const raw = inflateSync(chunks[1]?.data ?? Buffer.alloc(0));
    expect([...raw]).toEqual([
      0,
      ...Array.from({ length: 9 }, (_, k) => k * 13),
      0,
      ...Array.from({ length: 9 }, (_, k) => (k + 9) * 13),
    ]);
  });

  it('splits a picture bigger than one stored block into several, and zlib reads them back whole', () => {
    const picture = avatarPicture(def);
    const png = Buffer.from(encodePng(picture));
    const idat = png.subarray(8 + 25 + 8, png.length - 12 - 4);
    const raw = inflateSync(idat);
    expect(raw.length).toBe((picture.width * 3 + 1) * picture.height);
    expect(raw.length).toBeGreaterThan(0xffff);
  });

  it('checks its sums as zlib does', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, k) => (k * 2654435761) >>> 24);
    expect(crc32(bytes)).toBe(zlibCrc32(bytes));
  });
});

describe('nothing reads a picture back off the screen', () => {
  // `toDataURL` answers differently on each platform (the header): the app draws its pictures itself
  it('no source in the app calls toDataURL', () => {
    const src = join(here, '..', '..');
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) {
          // comments may name it; code may not
          const code = readFileSync(path, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
          if (/\.toDataURL\s*\(/.test(code)) callers.push(path);
        }
      }
    };
    walk(src);
    expect(callers).toEqual([]);
  });

  it('the export draws the chosen baby from its shapes and sends it the way a photo goes', () => {
    const render = flat(readFileSync(join(here, 'render.ts'), 'utf8'));
    expect(render).toContain('const png = avatarPng(def);');
    expect(render).toContain('const jpeg = await prepareChildPhoto(file.uri);');
    expect(render).toContain("new Directory(Paths.cache, 'cuddlecue', 'avatar-render')");
    expect(render).toContain('file.delete();');
    const grid = flat(readFileSync(join(here, 'AvatarGrid.tsx'), 'utf8'));
    expect(grid).toContain('bytes = await avatarJpeg(def);');
  });
});
