/**
 * A JPEG, READ AS FAR AS ONE QUESTION NEEDS (2026-09-29): does the baby's stored picture show
 * anything inside the circle an avatar draws (`blankPicture.ts`)? Hermes has no image decoder a
 * script can reach, and the question is cheap to answer from the file itself, so the app reads it.
 *
 * WHAT IT READS: sequential Huffman JPEG (baseline and extended), 8 bits a sample, one or three
 * components, any sampling factors, interleaved or not, with or without restart markers. That is
 * every picture this app stores: its one pipeline re-encodes whatever was picked as a baseline JPEG
 * through the platform's own encoder (`prepareChildPhoto`). Anything else (progressive, arithmetic
 * coded, 12-bit, lossless, four components, a file cut short) is refused with its reason
 * (`JpegRefused`), and the caller shows that picture as it is: this reader's limits are never a
 * reason to hide a photo.
 *
 * WHAT IT HANDS BACK: each block's 64 coefficients, still quantized, as the scan reaches it, to a
 * visitor that may stop the read at any block. That is what makes the question cheap: a block whose
 * AC coefficients are all zero is one flat color, known without an inverse DCT, and a real photo is
 * answered by the first few blocks that reach the circle. Pixels are rebuilt only where a caller asks
 * (`blockPixels`, `componentsToRgb`).
 *
 * ITU-T T.81 is the reference throughout: B.2 for the markers, F.2.2 for the Huffman decoding, A.3.3
 * for the inverse DCT, and JFIF 1.02 for the color transform.
 */

/** A file this reader will not judge, and why: the caller shows the picture as it is. */
export class JpegRefused extends Error {}

/** The natural (row-major) index of each coefficient in the scan's zigzag order (T.81 A.6). */
const ZIGZAG = Uint8Array.from([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
  13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]);

export interface JpegComponent {
  /** Its identifier in the frame header. */
  id: number;
  /** Its sampling factors, across and down. */
  h: number;
  v: number;
  /** Which quantization table it uses (0–3). */
  tq: number;
  /** Its own size in blocks: the blocks that carry the picture, before any MCU padding. */
  blocksWide: number;
  blocksHigh: number;
}

export interface JpegFrame {
  width: number;
  height: number;
  hMax: number;
  vMax: number;
  components: JpegComponent[];
  /** Adobe's APP14 marker said the three components are red, green and blue rather than YCbCr. */
  rgb: boolean;
}

/**
 * One block as the scan reaches it: the frame it is in, which component (its index in
 * `frame.components`), where (in that component's blocks), its coefficients in natural order and
 * still quantized, and the table that dequantizes them (natural order). Both arrays are the
 * reader's own and are reused for the next block: copy what is kept. Return false to stop reading.
 */
export type BlockVisitor = (
  frame: JpegFrame,
  c: number,
  bx: number,
  by: number,
  coef: Int16Array,
  quant: Uint16Array,
) => boolean;

/** Canonical Huffman decoding (T.81 F.2.2.3): each length's largest code, where its values start. */
interface Huffman {
  maxcode: Int32Array;
  valptr: Int32Array;
  mincode: Int32Array;
  values: Uint8Array;
}

function huffman(counts: Uint8Array, values: Uint8Array): Huffman {
  const maxcode = new Int32Array(18).fill(-1);
  const valptr = new Int32Array(17);
  const mincode = new Int32Array(17);
  let code = 0;
  let k = 0;
  for (let l = 1; l <= 16; l += 1) {
    const n = counts[l - 1] ?? 0;
    valptr[l] = k;
    mincode[l] = code;
    code += n;
    k += n;
    // a length with no codes keeps -1, so no code of that length ever matches
    maxcode[l] = n > 0 ? code - 1 : -1;
    code <<= 1;
  }
  // T.81 F.2.2.3: the sentinel past the longest code
  maxcode[17] = 0x7fffffff;
  if (k > values.length) throw new JpegRefused('a Huffman table is shorter than its counts');
  return { maxcode, valptr, mincode, values };
}

const u16 = (d: Uint8Array, at: number): number => ((d[at] ?? 0) << 8) | (d[at + 1] ?? 0);

/**
 * Read `bytes` as a JPEG, handing every block to `visit` until it says stop. Returns the frame and
 * whether the whole picture was read (false when the visitor stopped it). Throws `JpegRefused` for a
 * file it does not read.
 */
export function readJpeg(
  bytes: Uint8Array,
  visit: BlockVisitor,
): { frame: JpegFrame; finished: boolean } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new JpegRefused('not a JPEG');
  const quant: (Uint16Array | undefined)[] = [];
  const dc: (Huffman | undefined)[] = [];
  const ac: (Huffman | undefined)[] = [];
  let frame: JpegFrame | null = null;
  let adobeRgb = false;
  let restart = 0;
  let scans = 0;
  let at = 2;

  for (;;) {
    // markers may be preceded by any number of fill bytes (T.81 B.1.1.2)
    if (bytes[at] !== 0xff) throw new JpegRefused('lost between markers');
    while (bytes[at] === 0xff) at += 1;
    const marker = bytes[at];
    at += 1;
    if (marker === undefined) throw new JpegRefused('ends before its last marker');
    if (marker === 0xd9) break; // EOI
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // TEM, a stray RSTn
    const length = u16(bytes, at);
    if (length < 2 || at + length > bytes.length)
      throw new JpegRefused('a segment runs past the end');
    const seg = bytes.subarray(at + 2, at + length);
    at += length;

    if (marker === 0xdb) {
      // DQT: one or more tables, 8- or 16-bit, in zigzag order
      for (let p = 0; p < seg.length;) {
        const pq = (seg[p] ?? 0) >> 4;
        const tq = (seg[p] ?? 0) & 15;
        p += 1;
        if (tq > 3 || pq > 1) throw new JpegRefused('a quantization table it cannot place');
        const table = new Uint16Array(64);
        for (let k = 0; k < 64; k += 1) {
          table[ZIGZAG[k] ?? 0] = pq === 0 ? (seg[p + k] ?? 0) : u16(seg, p + 2 * k);
        }
        p += pq === 0 ? 64 : 128;
        if (p > seg.length) throw new JpegRefused('a quantization table cut short');
        quant[tq] = table;
      }
    } else if (marker === 0xc4) {
      // DHT: one or more tables
      for (let p = 0; p < seg.length;) {
        const tc = (seg[p] ?? 0) >> 4;
        const th = (seg[p] ?? 0) & 15;
        const counts = seg.subarray(p + 1, p + 17);
        let n = 0;
        for (const c of counts) n += c;
        const values = seg.subarray(p + 17, p + 17 + n);
        p += 17 + n;
        if (tc > 1 || th > 3 || p > seg.length)
          throw new JpegRefused('a Huffman table it cannot place');
        (tc === 0 ? dc : ac)[th] = huffman(counts, values);
      }
    } else if (marker === 0xdd) {
      restart = u16(seg, 0);
    } else if (marker === 0xee) {
      // APP14 "Adobe": its last byte is the color transform, 0 for none (RGB with three components)
      const adobe = seg[0] === 0x41 && seg[1] === 0x64 && seg[2] === 0x6f && seg[3] === 0x62;
      if (adobe && seg.length >= 12) adobeRgb = seg[11] === 0;
    } else if (marker === 0xc0 || marker === 0xc1) {
      if (frame !== null) throw new JpegRefused('two frames');
      frame = frameOf(seg, adobeRgb);
    } else if (
      marker >= 0xc2 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      // SOF2 progressive, SOF3 lossless, SOF5–7 hierarchical, SOF9–15 arithmetic coded
      throw new JpegRefused(`frame type ${marker.toString(16)} is not sequential Huffman`);
    } else if (marker === 0xdc) {
      throw new JpegRefused('its height comes after the scan (DNL)');
    } else if (marker === 0xda) {
      if (frame === null) throw new JpegRefused('a scan before its frame');
      scans += 1;
      const r = scan(bytes, at, seg, frame, quant, dc, ac, restart, visit);
      if (!r.finished) return { frame, finished: false };
      at = r.end;
    }
    // APPn, COM and anything else carrying a length: nothing the question needs
  }
  if (frame === null || scans === 0) throw new JpegRefused('no picture in it');
  return { frame, finished: true };
}

function frameOf(seg: Uint8Array, adobeRgb: boolean): JpegFrame {
  if (seg[0] !== 8) throw new JpegRefused(`${seg[0] ?? 0}-bit samples`);
  const height = u16(seg, 1);
  const width = u16(seg, 3);
  const count = seg[5] ?? 0;
  if (width === 0 || height === 0) throw new JpegRefused('no size');
  if (count !== 1 && count !== 3) throw new JpegRefused(`${count} components`);
  if (seg.length < 6 + 3 * count) throw new JpegRefused('a frame header cut short');
  const raw = Array.from({ length: count }, (_, i) => {
    const hv = seg[7 + 3 * i] ?? 0;
    return { id: seg[6 + 3 * i] ?? 0, h: hv >> 4, v: hv & 15, tq: seg[8 + 3 * i] ?? 0 };
  });
  const hMax = Math.max(...raw.map(c => c.h));
  const vMax = Math.max(...raw.map(c => c.v));
  for (const c of raw)
    if (c.h < 1 || c.h > 4 || c.v < 1 || c.v > 4 || c.tq > 3)
      throw new JpegRefused('a sampling factor out of range');
  const components = raw.map(c => ({
    ...c,
    blocksWide: Math.ceil(Math.ceil((width * c.h) / hMax) / 8),
    blocksHigh: Math.ceil(Math.ceil((height * c.v) / vMax) / 8),
  }));
  return { width, height, hMax, vMax, components, rgb: adobeRgb && count === 3 };
}

/**
 * One scan (T.81 B.2.3, F.2): from the byte after its header to the marker that ends it. Returns
 * where that marker is, or that the visitor stopped the read.
 */
function scan(
  d: Uint8Array,
  start: number,
  header: Uint8Array,
  frame: JpegFrame,
  quant: readonly (Uint16Array | undefined)[],
  dcTables: readonly (Huffman | undefined)[],
  acTables: readonly (Huffman | undefined)[],
  restart: number,
  visit: BlockVisitor,
): { finished: boolean; end: number } {
  const ns = header[0] ?? 0;
  const members = Array.from({ length: ns }, (_, i) => {
    const id = header[1 + 2 * i];
    const index = frame.components.findIndex(c => c.id === id);
    const comp = frame.components[index];
    const t = header[2 + 2 * i] ?? 0;
    const dcT = dcTables[t >> 4];
    const acT = acTables[t & 15];
    const q = comp === undefined ? undefined : quant[comp.tq];
    if (comp === undefined || dcT === undefined || acT === undefined || q === undefined)
      throw new JpegRefused('a scan names a table or a component it never defined');
    return { index, comp, dcT, acT, q: Uint16Array.from(q), pred: 0 };
  });
  const ss = header[1 + 2 * ns];
  const se = header[2 + 2 * ns];
  const a = header[3 + 2 * ns];
  if (ns < 1 || ss !== 0 || se !== 63 || a !== 0) throw new JpegRefused('not a sequential scan');

  let pos = start;
  let bitBuf = 0;
  let bitCount = 0;
  const bit = (): number => {
    if (bitCount === 0) {
      const b = d[pos];
      if (b === undefined) throw new JpegRefused('cut short inside its picture');
      if (b === 0xff) {
        const next = d[pos + 1];
        // 0xFF 0x00 is a stuffed 0xFF; 0xFF then anything else is a marker where a bit was due
        if (next !== 0x00) throw new JpegRefused('a marker inside its picture');
        pos += 2;
      } else pos += 1;
      bitBuf = b;
      bitCount = 8;
    }
    bitCount -= 1;
    return (bitBuf >> bitCount) & 1;
  };
  const receive = (s: number): number => {
    let v = 0;
    for (let i = 0; i < s; i += 1) v = (v << 1) | bit();
    return v;
  };
  // T.81 F.2.2.1 EXTEND: the top half of the range is positive, the bottom half negative
  const extend = (v: number, s: number): number => (v < 1 << (s - 1) ? v - (1 << s) + 1 : v);
  const decode = (t: Huffman): number => {
    let code = bit();
    let l = 1;
    while (code > (t.maxcode[l] ?? -1)) {
      code = (code << 1) | bit();
      l += 1;
      if (l > 16) throw new JpegRefused('a code no table holds');
    }
    const v = t.values[(t.valptr[l] ?? 0) + code - (t.mincode[l] ?? 0)];
    if (v === undefined) throw new JpegRefused('a code no table holds');
    return v;
  };

  const coef = new Int16Array(64);
  const block = (m: (typeof members)[number]): void => {
    coef.fill(0);
    const t = decode(m.dcT);
    if (t > 11) throw new JpegRefused('a DC difference out of range');
    m.pred += t === 0 ? 0 : extend(receive(t), t);
    coef[0] = m.pred;
    for (let k = 1; k < 64;) {
      const rs = decode(m.acT);
      const r = rs >> 4;
      const s = rs & 15;
      if (s === 0) {
        if (r !== 15) break; // EOB
        k += 16; // ZRL
        continue;
      }
      k += r;
      if (k > 63) throw new JpegRefused('a coefficient past the end of its block');
      coef[ZIGZAG[k] ?? 0] = extend(receive(s), s);
      k += 1;
    }
  };

  /** Past a restart interval: to the next byte, over the RSTn, and every prediction starts again. */
  const restartHere = (): void => {
    bitCount = 0;
    while (d[pos] === 0xff && d[pos + 1] === 0xff) pos += 1;
    const m = d[pos + 1];
    if (d[pos] !== 0xff || m === undefined || m < 0xd0 || m > 0xd7)
      throw new JpegRefused('a restart marker missing');
    pos += 2;
    for (const mm of members) mm.pred = 0;
  };

  const only = ns === 1 ? members[0] : undefined;
  if (only !== undefined) {
    // NOT INTERLEAVED: the component's own blocks, row by row, one block to an MCU (T.81 A.2.2)
    const total = only.comp.blocksWide * only.comp.blocksHigh;
    for (let n = 0; n < total; n += 1) {
      if (restart > 0 && n > 0 && n % restart === 0) restartHere();
      block(only);
      const bx = n % only.comp.blocksWide;
      const by = Math.floor(n / only.comp.blocksWide);
      if (!visit(frame, only.index, bx, by, coef, only.q)) return { finished: false, end: pos };
    }
  } else {
    // INTERLEAVED: MCU by MCU, each component's h × v blocks in turn (T.81 A.2.3)
    const across = Math.ceil(frame.width / (8 * frame.hMax));
    const down = Math.ceil(frame.height / (8 * frame.vMax));
    for (let n = 0; n < across * down; n += 1) {
      if (restart > 0 && n > 0 && n % restart === 0) restartHere();
      const mx = n % across;
      const my = Math.floor(n / across);
      for (const m of members)
        for (let v = 0; v < m.comp.v; v += 1)
          for (let h = 0; h < m.comp.h; h += 1) {
            block(m);
            if (!visit(frame, m.index, mx * m.comp.h + h, my * m.comp.v + v, coef, m.q))
              return { finished: false, end: pos };
          }
    }
  }
  // the scan's data ends at the next marker that is not a restart
  for (;;) {
    const b = d[pos];
    if (b === undefined) throw new JpegRefused('ends without its last marker');
    const next = d[pos + 1];
    if (
      b === 0xff &&
      next !== undefined &&
      next !== 0x00 &&
      next !== 0xff &&
      (next < 0xd0 || next > 0xd7)
    )
      return { finished: true, end: pos };
    pos += 1;
  }
}

/* ------------------------------------------------------------------ pixels, where asked */

/** cos((2x + 1)uπ/16) · C(u)/2, for the inverse DCT (T.81 A.3.3), [x * 8 + u]. */
const IDCT = (() => {
  const t = new Float64Array(64);
  for (let x = 0; x < 8; x += 1)
    for (let u = 0; u < 8; u += 1)
      t[x * 8 + u] =
        ((u === 0 ? Math.SQRT1_2 : 1) / 2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  return t;
})();

/**
 * One block's 64 samples (0–255, row by row), from its quantized coefficients and its table: the
 * inverse DCT of T.81 A.3.3, separable, in floating point, and the level shift back.
 */
export function blockPixels(coef: Int16Array, quant: Uint16Array): Uint8ClampedArray {
  const f = new Float64Array(64);
  for (let i = 0; i < 64; i += 1) f[i] = (coef[i] ?? 0) * (quant[i] ?? 0);
  // rows: for each vertical frequency v, the eight x
  const tmp = new Float64Array(64);
  for (let v = 0; v < 8; v += 1)
    for (let x = 0; x < 8; x += 1) {
      let s = 0;
      for (let u = 0; u < 8; u += 1) s += (IDCT[x * 8 + u] ?? 0) * (f[v * 8 + u] ?? 0);
      tmp[v * 8 + x] = s;
    }
  const out = new Uint8ClampedArray(64);
  for (let y = 0; y < 8; y += 1)
    for (let x = 0; x < 8; x += 1) {
      let s = 0;
      for (let v = 0; v < 8; v += 1) s += (IDCT[y * 8 + v] ?? 0) * (tmp[v * 8 + x] ?? 0);
      out[y * 8 + x] = Math.round(s + 128);
    }
  return out;
}

/**
 * Red, green and blue from one pixel's samples: JFIF's YCbCr transform for three components, gray
 * for one, and the samples as they are where Adobe's marker said RGB.
 */
export function componentsToRgb(
  frame: JpegFrame,
  samples: readonly number[],
): [number, number, number] {
  const [y = 0, cb = 128, cr = 128] = samples;
  if (frame.components.length === 1) return [y, y, y];
  if (frame.rgb) return [y, cb, cr];
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return [
    clamp(y + 1.402 * (cr - 128)),
    clamp(y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128)),
    clamp(y + 1.772 * (cb - 128)),
  ];
}
