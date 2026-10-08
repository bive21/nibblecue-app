/**
 * A PNG READER FOR TESTS: the pixels of the card pictures, so a test can hold a number about a
 * picture to the picture (`ui/cardArtParts.test.ts`). Node's own zlib and nothing else — the app
 * has no image library, and a test that needed one would be a dependency for one check.
 *
 * It reads the owner's masters: truecolor, 8 or 16 bits a sample, with or without alpha, not
 * interlaced (and what `tools/brand/render-card-art.mjs` wrote while the pictures shipped as PNG).
 * Anything else throws, loudly, rather than handing back wrong pixels.
 *
 * AND A PICTURE THAT SHIPS AS JPEG IS READ FROM ITS MASTER (`resample`, below). Every card
 * background ships as JPEG since 2026-10-01 (a lossy WebP from 2026-09-27), which zlib cannot
 * open; their masters are PNGs, and the shipped file is an encoding of the master at the shipped
 * size that `pnpm check:card-art` holds byte for byte, so the master brought down to that size is
 * the same drawing, to within the level or two the encoding moves a pixel.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export interface Pixels {
  width: number;
  height: number;
  /** The pixel at (x, y), as 0–255 red, green and blue; clamped to the picture's edge. */
  rgb: (x: number, y: number) => readonly [number, number, number];
}

const SIGNATURE = '89504e470d0a1a0a';

export function readPng(path: string): Pixels {
  return decodePng(readFileSync(path), path);
}

/**
 * The same reader over bytes already in hand: the drawn baby's PNG, made in memory by the app
 * (`media/avatars/png.ts`), is read back through here rather than trusted (`raster.test.ts`).
 */
export function decodePng(data: Uint8Array, path = 'png'): Pixels {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (buf.subarray(0, 8).toString('hex') !== SIGNATURE) throw new Error(`${path}: not a PNG`);
  let at = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  // bytes a sample takes: 1, or 2 in a 16-bit master (the breastfeeding, stash and shopping ones)
  let bytes = 1;
  const idat: Buffer[] = [];
  while (at < buf.length) {
    const length = buf.readUInt32BE(at);
    const type = buf.subarray(at + 4, at + 8).toString('latin1');
    const data = buf.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [depth, color, , , interlace] = [data[8], data[9], data[10], data[11], data[12]];
      if ((depth !== 8 && depth !== 16) || interlace !== 0 || (color !== 2 && color !== 6))
        throw new Error(
          `${path}: only 8- or 16-bit truecolor, not interlaced (got ${depth}/${color})`,
        );
      channels = color === 6 ? 4 : 3;
      bytes = depth / 8;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  // the filters work on BYTES, a whole pixel's worth back (PNG spec §9.2), whatever the depth
  const pixel = channels * bytes;
  const stride = width * pixel;
  const out = Buffer.alloc(height * stride);
  // undo each scanline's filter (PNG spec §9): None, Sub, Up, Average, Paeth
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[line + i] ?? 0;
      const a = i >= pixel ? (out[y * stride + i - pixel] ?? 0) : 0;
      const b = y > 0 ? (out[(y - 1) * stride + i] ?? 0) : 0;
      const c = y > 0 && i >= pixel ? (out[(y - 1) * stride + i - pixel] ?? 0) : 0;
      let v: number;
      switch (filter) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + Math.floor((a + b) / 2);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`${path}: unknown filter ${String(filter)} on line ${y}`);
      }
      out[y * stride + i] = v & 0xff;
    }
  }
  const clampX = (x: number) => Math.min(width - 1, Math.max(0, Math.round(x)));
  const clampY = (y: number) => Math.min(height - 1, Math.max(0, Math.round(y)));
  return {
    width,
    height,
    // a 16-bit sample is big-endian, so its first byte is its value in eight bits — the same
    // truncation the renderer's own 16-to-8 conversion makes
    rgb: (x, y) => {
      const i = clampY(y) * stride + clampX(x) * pixel;
      return [out[i] ?? 0, out[i + bytes] ?? 0, out[i + 2 * bytes] ?? 0];
    },
  };
}

/**
 * A PICTURE AT A SMALLER SIZE, each pixel the mean of the source pixels under it: the owner's
 * master brought down to the size the app ships, for a picture that ships in a format this reader
 * cannot open (see the header). The renderer's own filter is Lanczos rather than a box, so an edge
 * can differ by a few levels between the two; the flat ground a test measures is the same.
 */
export function resample(src: Pixels, width: number, height: number): Pixels {
  const sx = src.width / width;
  const sy = src.height / height;
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let [r, g, b, n] = [0, 0, 0, 0];
      for (let v = y0; v < y1; v += 1)
        for (let u = x0; u < x1; u += 1) {
          const [pr, pg, pb] = src.rgb(u, v);
          r += pr;
          g += pg;
          b += pb;
          n += 1;
        }
      const i = (y * width + x) * 3;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
    }
  }
  const clampX = (x: number) => Math.min(width - 1, Math.max(0, Math.round(x)));
  const clampY = (y: number) => Math.min(height - 1, Math.max(0, Math.round(y)));
  return {
    width,
    height,
    rgb: (x, y) => {
      const i = (clampY(y) * width + clampX(x)) * 3;
      return [out[i] ?? 0, out[i + 1] ?? 0, out[i + 2] ?? 0];
    },
  };
}
