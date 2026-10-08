/**
 * A RASTER AS A PNG FILE'S BYTES (2026-09-29), for the drawn baby's one trip through the photo
 * pipeline: `render.ts` writes these to a scratch file and hands it to `prepareChildPhoto`, which
 * loads it with the platform's own decoder and re-encodes it as the same 512 px JPEG every photo
 * becomes. So this needs to be a PNG every decoder opens, and nothing more.
 *
 * WHY NOT COMPRESSED. Deflate needs a compressor, and Hermes has none built in; the file lives for a
 * few milliseconds on the phone's own disk, between this and the JPEG that replaces it. So the image
 * data is zlib's STORED form — the bytes as they are, in blocks of up to 65,535 with a five-byte
 * header each (RFC 1951 §3.2.4), inside the two-byte zlib header and its Adler-32 (RFC 1950) — which
 * every inflater reads. Truecolor, 8 bits a sample, no alpha, no interlace, every row unfiltered.
 */
import type { Raster } from './raster';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
/** The most a stored block holds (its LEN is sixteen bits). */
const STORED_MAX = 0xffff;

let crcTable: Uint32Array | null = null;

/** CRC-32 as PNG uses it (ISO 3309, polynomial 0xEDB88320), over `bytes[from, to)`. */
export function crc32(bytes: Uint8Array, from = 0, to = bytes.length): number {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = from; i < to; i += 1) c = (crcTable[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Adler-32 (RFC 1950 §8), summed in runs short enough that nothing overflows before the modulo. */
function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length;) {
    const end = Math.min(bytes.length, i + 3800);
    for (; i < end; i += 1) {
      a += bytes[i] ?? 0;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function put32(out: Uint8Array, at: number, v: number): void {
  out[at] = (v >>> 24) & 0xff;
  out[at + 1] = (v >>> 16) & 0xff;
  out[at + 2] = (v >>> 8) & 0xff;
  out[at + 3] = v & 0xff;
}

/** One chunk: length, type, data, and the CRC of type and data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  put32(out, 0, data.length);
  for (let k = 0; k < 4; k += 1) out[4 + k] = type.charCodeAt(k);
  out.set(data, 8);
  put32(out, 8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/** The raster as a PNG: signature, IHDR, one IDAT of stored deflate blocks, IEND. */
export function encodePng(raster: Raster): Uint8Array {
  const { width, height, rgb } = raster;
  if (rgb.length !== width * height * 3)
    throw new Error('png: the pixels are not width × height × 3');

  // every row behind its filter byte, 0: None
  const stride = width * 3;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1)
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);

  const blocks = Math.max(1, Math.ceil(raw.length / STORED_MAX));
  const z = new Uint8Array(2 + raw.length + 5 * blocks + 4);
  // CMF 0x78 (deflate, 32 KB window) and FLG 0x01 (no dictionary, fastest; 0x7801 % 31 === 0)
  z[0] = 0x78;
  z[1] = 0x01;
  let at = 2;
  for (let b = 0; b < blocks; b += 1) {
    const from = b * STORED_MAX;
    const len = Math.min(STORED_MAX, raw.length - from);
    z[at] = b === blocks - 1 ? 1 : 0; // BFINAL on the last, BTYPE 00: stored
    z[at + 1] = len & 0xff;
    z[at + 2] = (len >>> 8) & 0xff;
    z[at + 3] = ~len & 0xff;
    z[at + 4] = (~len >>> 8) & 0xff;
    z.set(raw.subarray(from, from + len), at + 5);
    at += 5 + len;
  }
  put32(z, at, adler32(raw));

  const ihdr = new Uint8Array(13);
  put32(ihdr, 0, width);
  put32(ihdr, 4, height);
  ihdr[8] = 8; // bits a sample
  ihdr[9] = 2; // truecolor
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // the only filter method
  ihdr[12] = 0; // not interlaced

  const parts = [
    Uint8Array.from(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', z),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
