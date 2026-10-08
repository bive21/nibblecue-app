/**
 * A BASELINE JPEG WRITER FOR TESTS (2026-09-29): the file a phone's own encoder makes of a picture,
 * so a test can hand the app's JPEG reader (`media/jpeg.ts`) and its blank-picture verdict
 * (`media/blankPicture.ts`) the kind of bytes a parent's phone stores, without a native encoder or a
 * dependency. Every picture the app keeps leaves `prepareChildPhoto` as a baseline JPEG at quality
 * 0.8 from the platform's encoder (libjpeg-turbo on Android, ImageIO on iOS); this writes what those
 * write by default: JFIF YCbCr, the standard tables of T.81 Annex K scaled for the quality the IJG
 * way, 4:2:0 chroma (or 4:4:4, or gray), and restart markers when asked.
 *
 * It is checked against a real decoder where it was written (Pillow read its files back pixel for
 * pixel), and `jpeg.test.ts` holds a file Pillow wrote in turn, so the reader is never tested only
 * against its own writer.
 */
import type { Raster } from '../media/avatars/raster';
import { blockPixels, componentsToRgb, readJpeg } from '../media/jpeg';

/** T.81 figure A.6: the natural index of the k-th coefficient in zigzag order. */
const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
  13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
] as const;

/** T.81 K.1, natural order. */
const LUMA_Q = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
  92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
] as const;
const CHROMA_Q = [
  17,
  18,
  24,
  47,
  99,
  99,
  99,
  99,
  18,
  21,
  26,
  66,
  99,
  99,
  99,
  99,
  24,
  26,
  56,
  99,
  99,
  99,
  99,
  99,
  47,
  66,
  99,
  99,
  99,
  99,
  99,
  99,
  ...Array<number>(32).fill(99),
] as const;

/** T.81 K.3: the typical Huffman tables, as their counts per length and their values. */
const DC_LUMA = {
  counts: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
  values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
const DC_CHROMA = {
  counts: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
const AC_LUMA = {
  counts: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d],
  values: [
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
    0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
    0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
    0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
    0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
    0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
    0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
    0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
    0xf9, 0xfa,
  ],
};
const AC_CHROMA = {
  counts: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77],
  values: [
    0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
    0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
    0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
    0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
    0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
    0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
    0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
    0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
    0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
    0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
    0xf9, 0xfa,
  ],
};

type Table = { counts: readonly number[]; values: readonly number[] };

/** Each value's code and length, from the counts (T.81 C.2). */
function codesOf(t: Table): Map<number, { code: number; length: number }> {
  const out = new Map<number, { code: number; length: number }>();
  let code = 0;
  let k = 0;
  for (let l = 1; l <= 16; l += 1) {
    for (let i = 0; i < (t.counts[l - 1] ?? 0); i += 1) {
      out.set(t.values[k] ?? 0, { code, length: l });
      code += 1;
      k += 1;
    }
    code <<= 1;
  }
  return out;
}

/** The IJG quality scaling: 50 is the table as printed, 100 all ones. */
function scaled(base: readonly number[], quality: number): number[] {
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  const s = q < 50 ? Math.floor(5000 / q) : 200 - 2 * q;
  return base.map(b => Math.max(1, Math.min(255, Math.floor((b * s + 50) / 100))));
}

const COS = (() => {
  const t = new Float64Array(64);
  for (let x = 0; x < 8; x += 1)
    for (let u = 0; u < 8; u += 1)
      t[u * 8 + x] =
        ((u === 0 ? Math.SQRT1_2 : 1) / 2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  return t;
})();

/** The forward DCT of one 8 × 8 block of level-shifted samples, natural order out. */
function fdct(samples: Float64Array): Float64Array {
  const tmp = new Float64Array(64);
  for (let y = 0; y < 8; y += 1)
    for (let u = 0; u < 8; u += 1) {
      let s = 0;
      for (let x = 0; x < 8; x += 1) s += (COS[u * 8 + x] ?? 0) * (samples[y * 8 + x] ?? 0);
      tmp[y * 8 + u] = s;
    }
  const out = new Float64Array(64);
  for (let v = 0; v < 8; v += 1)
    for (let u = 0; u < 8; u += 1) {
      let s = 0;
      for (let y = 0; y < 8; y += 1) s += (COS[v * 8 + y] ?? 0) * (tmp[y * 8 + u] ?? 0);
      out[v * 8 + u] = s;
    }
  return out;
}

class Bits {
  readonly bytes: number[] = [];
  private buf = 0;
  private count = 0;
  put(code: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) {
      this.buf = (this.buf << 1) | ((code >> i) & 1);
      this.count += 1;
      if (this.count === 8) this.flushByte();
    }
  }
  private flushByte(): void {
    this.bytes.push(this.buf);
    // a 0xFF in the data is followed by a stuffed zero (T.81 F.1.2.3)
    if (this.buf === 0xff) this.bytes.push(0);
    this.buf = 0;
    this.count = 0;
  }
  /** Pad the last byte with ones (T.81 F.1.2.3). */
  align(): void {
    while (this.count !== 0) this.put(1, 1);
  }
}

export interface JpegOptions {
  /** 1–100, the IJG scale: `prepareChildPhoto` asks the platform for 0.8, which is 80 here. */
  quality?: number;
  /** '420' as both platforms write by default; '444' for none; 'gray' for one component. */
  sampling?: '420' | '444' | 'gray';
  /** MCUs between restart markers; 0 for none. */
  restart?: number;
}

/** `raster` as a baseline JPEG file's bytes. */
export function encodeJpeg(raster: Raster, options: JpegOptions = {}): Uint8Array {
  const { quality = 80, sampling = '420', restart = 0 } = options;
  const { width, height, rgb } = raster;
  const gray = sampling === 'gray';
  const sub = sampling === '420' ? 2 : 1;
  const lq = scaled(LUMA_Q, quality);
  const cq = scaled(CHROMA_Q, quality);

  // the three planes, edge pixels repeated out to whole MCUs
  const mcu = 8 * sub;
  const pw = Math.ceil(width / mcu) * mcu;
  const ph = Math.ceil(height / mcu) * mcu;
  const Y = new Float64Array(pw * ph);
  const Cb = new Float64Array(pw * ph);
  const Cr = new Float64Array(pw * ph);
  for (let y = 0; y < ph; y += 1)
    for (let x = 0; x < pw; x += 1) {
      const i = (Math.min(y, height - 1) * width + Math.min(x, width - 1)) * 3;
      const r = rgb[i] ?? 0;
      const g = rgb[i + 1] ?? 0;
      const b = rgb[i + 2] ?? 0;
      Y[y * pw + x] = 0.299 * r + 0.587 * g + 0.114 * b;
      Cb[y * pw + x] = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
      Cr[y * pw + x] = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
    }
  // chroma averaged over each sub × sub square
  const cw = pw / sub;
  const ch = ph / sub;
  const down = (plane: Float64Array): Float64Array => {
    if (sub === 1) return plane;
    const out = new Float64Array(cw * ch);
    for (let y = 0; y < ch; y += 1)
      for (let x = 0; x < cw; x += 1) {
        let s = 0;
        for (let j = 0; j < sub; j += 1)
          for (let i = 0; i < sub; i += 1) s += plane[(y * sub + j) * pw + x * sub + i] ?? 0;
        out[y * cw + x] = s / (sub * sub);
      }
    return out;
  };
  const cb = down(Cb);
  const cr = down(Cr);

  const huff = {
    dcL: codesOf(DC_LUMA),
    acL: codesOf(AC_LUMA),
    dcC: codesOf(DC_CHROMA),
    acC: codesOf(AC_CHROMA),
  };
  const bits = new Bits();
  const out: number[] = [];
  const pred = [0, 0, 0];
  const size = (v: number) => (v === 0 ? 0 : Math.floor(Math.log2(Math.abs(v))) + 1);
  const amplitude = (v: number, s: number) => (v >= 0 ? v : v + (1 << s) - 1);
  const put = (codes: Map<number, { code: number; length: number }>, sym: number) => {
    const c = codes.get(sym);
    if (c === undefined) throw new Error(`jpeg writer: no code for ${sym}`);
    bits.put(c.code, c.length);
  };

  const encodeBlock = (plane: Float64Array, stride: number, bx: number, by: number, c: number) => {
    const samples = new Float64Array(64);
    for (let y = 0; y < 8; y += 1)
      for (let x = 0; x < 8; x += 1)
        samples[y * 8 + x] = (plane[(by * 8 + y) * stride + bx * 8 + x] ?? 0) - 128;
    const f = fdct(samples);
    const q = c === 0 ? lq : cq;
    const zz = ZIGZAG.map(n => Math.round((f[n] ?? 0) / (q[n] ?? 1)));
    const dcCodes = c === 0 ? huff.dcL : huff.dcC;
    const acCodes = c === 0 ? huff.acL : huff.acC;
    const diff = (zz[0] ?? 0) - (pred[c] ?? 0);
    pred[c] = zz[0] ?? 0;
    const s = size(diff);
    put(dcCodes, s);
    if (s > 0) bits.put(amplitude(diff, s), s);
    let run = 0;
    for (let k = 1; k < 64; k += 1) {
      const v = zz[k] ?? 0;
      if (v === 0) {
        run += 1;
        continue;
      }
      while (run > 15) {
        put(acCodes, 0xf0);
        run -= 16;
      }
      const sz = size(v);
      put(acCodes, (run << 4) | sz);
      bits.put(amplitude(v, sz), sz);
      run = 0;
    }
    if (run > 0) put(acCodes, 0x00);
  };

  const across = pw / mcu;
  const downN = ph / mcu;
  let rst = 0;
  for (let n = 0; n < across * downN; n += 1) {
    if (restart > 0 && n > 0 && n % restart === 0) {
      bits.align();
      bits.bytes.push(0xff, 0xd0 + (rst % 8));
      rst += 1;
      pred.fill(0);
    }
    const mx = n % across;
    const my = Math.floor(n / across);
    for (let j = 0; j < sub; j += 1)
      for (let i = 0; i < sub; i += 1) encodeBlock(Y, pw, mx * sub + i, my * sub + j, 0);
    if (!gray) {
      encodeBlock(cb, cw, mx, my, 1);
      encodeBlock(cr, cw, mx, my, 2);
    }
  }
  bits.align();

  const seg = (marker: number, body: readonly number[]) =>
    out.push(0xff, marker, ((body.length + 2) >> 8) & 0xff, (body.length + 2) & 0xff, ...body);
  out.push(0xff, 0xd8);
  seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 0, 0, 1, 0, 1, 0, 0]);
  seg(0xdb, [0, ...ZIGZAG.map(n => lq[n] ?? 1)]);
  if (!gray) seg(0xdb, [1, ...ZIGZAG.map(n => cq[n] ?? 1)]);
  const comps = gray
    ? [[1, 0x11, 0]]
    : [
        [1, (sub << 4) | sub, 0],
        [2, 0x11, 1],
        [3, 0x11, 1],
      ];
  seg(0xc0, [
    8,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    comps.length,
    ...comps.flat(),
  ]);
  const dht = (tc: number, th: number, t: Table) =>
    seg(0xc4, [(tc << 4) | th, ...t.counts, ...t.values]);
  dht(0, 0, DC_LUMA);
  dht(1, 0, AC_LUMA);
  if (!gray) {
    dht(0, 1, DC_CHROMA);
    dht(1, 1, AC_CHROMA);
  }
  if (restart > 0) seg(0xdd, [(restart >> 8) & 0xff, restart & 0xff]);
  const scanComps = gray
    ? [[1, 0x00]]
    : [
        [1, 0x00],
        [2, 0x11],
        [3, 0x11],
      ];
  seg(0xda, [scanComps.length, ...scanComps.flat(), 0, 63, 0]);
  // the scan's data is too long to spread into a push
  const file = new Uint8Array(out.length + bits.bytes.length + 2);
  file.set(out, 0);
  file.set(bits.bytes, out.length);
  file.set([0xff, 0xd9], out.length + bits.bytes.length);
  return file;
}

/**
 * Every pixel of a JPEG, rebuilt through the app's own reader (`readJpeg`, `blockPixels`,
 * `componentsToRgb`): what a test holds the reader's pixels to, against a picture it knows.
 *
 * Each chroma sample is repeated over the pixels it covers, as the app does where it rebuilds
 * pixels (`blankPicture.ts`), unless `smooth` asks for libjpeg's own "fancy" 4:2:0 upsampling
 * (`h2v2_fancy_upsample` in jdsample.c: 9/16, 3/16, 3/16 and 1/16 of the four nearest samples,
 * the edge rows and columns repeated), so a file libjpeg wrote can be held to libjpeg's decode of
 * it pixel for pixel.
 */
export function decodeJpeg(bytes: Uint8Array, options: { smooth?: boolean } = {}): Raster {
  const planes: { samples: Uint8Array; wide: number }[] = [];
  const { frame } = readJpeg(bytes, (f, c, bx, by, coef, quant) => {
    const comp = f.components[c];
    if (comp === undefined) return true;
    const plane = (planes[c] ??= {
      samples: new Uint8Array(comp.blocksWide * 8 * comp.blocksHigh * 8),
      wide: comp.blocksWide * 8,
    });
    // a padding block past the component's own blocks is read and dropped
    if (bx >= comp.blocksWide || by >= comp.blocksHigh) return true;
    const px = blockPixels(coef, quant);
    for (let y = 0; y < 8; y += 1)
      plane.samples.set(px.subarray(y * 8, y * 8 + 8), (by * 8 + y) * plane.wide + bx * 8);
    return true;
  });
  const { width, height } = frame;
  const full = frame.components.map((comp, c) => {
    const plane = planes[c] ?? { samples: new Uint8Array(0), wide: 0 };
    const at = (x: number, y: number) => plane.samples[y * plane.wide + x] ?? 0;
    const out = new Uint8Array(width * height);
    const fx = frame.hMax / comp.h;
    const fy = frame.vMax / comp.v;
    if (options.smooth === true && fx === 2 && fy === 2) {
      // the component's own size, as libjpeg counts it: its edge samples repeat past it
      const cw = Math.ceil(width / 2);
      const ch = Math.ceil(height / 2);
      for (let y = 0; y < height; y += 1) {
        const near = y >> 1;
        const far = Math.min(ch - 1, Math.max(0, y & 1 ? near + 1 : near - 1));
        const colsum = (x: number) => at(x, near) * 3 + at(x, far);
        for (let x = 0; x < width; x += 1) {
          const col = x >> 1;
          const self = colsum(col);
          out[y * width + x] =
            x & 1
              ? col + 1 < cw
                ? (self * 3 + colsum(col + 1) + 7) >> 4
                : (self * 4 + 7) >> 4
              : col > 0
                ? (self * 3 + colsum(col - 1) + 8) >> 4
                : (self * 4 + 8) >> 4;
        }
      }
      return out;
    }
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1)
        out[y * width + x] = at(Math.floor(x / fx), Math.floor(y / fy));
    return out;
  });
  const rgb = new Uint8Array(width * height * 3);
  for (let p = 0; p < width * height; p += 1)
    rgb.set(
      componentsToRgb(
        frame,
        full.map(plane => plane[p] ?? 0),
      ),
      p * 3,
    );
  return { width, height, rgb };
}
