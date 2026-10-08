/**
 * A DRAWN BABY, AS PIXELS, DRAWN BY THE APP ITSELF (2026-09-29). The chosen baby leaves the phone as
 * a photo does (`render.ts`), and a photo is pixels; this turns `art.ts`'s shapes into them with no
 * native renderer in the way, so the picture that is saved is the same on every phone and a node
 * test can hold every pixel of it.
 *
 * WHY NOT THE SVG THAT IS ON THE SCREEN. Until 2026-09-29 the picture came from react-native-svg's
 * `toDataURL` on the chooser's own 64 pt drawing, asked for at 512. The two platforms answer that
 * differently, and one of them wrong for us: Android makes a 512 px canvas and fits the drawing to
 * it (`SvgView.toDataURL(w, h)` → `drawChildren` on the new canvas), while iOS makes a 512 pt canvas
 * and lays the drawing out in the view's OWN bounds (`getDataURLWithBounds:` → `drawRect:` →
 * `drawToContext:withRect:[self bounds]`, react-native-svg 15.15.4). On an iPhone the baby filled
 * the top-left eighth of the picture, and the rest was empty: a round avatar shows the square's
 * inscribed circle, which that corner lies wholly outside, so the parent saw an empty circle where
 * the baby should be (the owner, 2026-09-28, on an iPhone: "the bling showed but the background is
 * just empty white ish, with no avatar"). `raster.test.ts` measures both.
 *
 * WHAT IT DRAWS: exactly the four shapes `art.ts` uses — rectangles (with a corner radius), circles,
 * ellipses and paths (M, L, H, V, C, S, Q, T and Z, absolute or relative; an arc is refused loudly,
 * because the set has none and a wrong one would be drawn silently) — filled with the nonzero rule
 * SVG uses, or stroked with round caps and joins as `BabyAvatarArt` strokes them, at the shape's
 * opacity. Colors are `#RRGGBB` or `#RGB`. Anything else throws: a new kind of shape in `art.ts`
 * fails the tests rather than leaving a hole in a baby.
 *
 * HOW: each shape becomes polygons in pixels (curves cut into chords no longer than a few pixels),
 * and each pixel row is crossed by five scanlines, whose covered spans are added up exactly across
 * the row — anti-aliased edges, accurate to a fifth of a pixel down and exactly across. The canvas
 * is kept in floating point and rounded once at the end. Pure TypeScript and nothing else: no React
 * Native, no native module, so it runs in Expo Go and in node alike.
 */
import type { ArtShape } from './art';

/** A picture as its pixels: `width × height`, three bytes a pixel (red, green, blue), top row first. */
export interface Raster {
  width: number;
  height: number;
  rgb: Uint8Array;
}

/** The drawing's own box: `art.ts` draws in 100 × 100 (`BabyAvatarArt`'s `viewBox`). */
export const ART_BOX = 100;

/** Scanlines through each pixel row (see the header). */
const SUBROWS = 5;

/** A closed ring of points in pixels: x0, y0, x1, y1, … (the last joins the first). */
type Ring = number[];

/* ------------------------------------------------------------------------------ colors */

type Rgb = readonly [number, number, number];

export function rgbOfHex(color: string): Rgb {
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (long)
    return [
      parseInt(long[1] ?? '0', 16),
      parseInt(long[2] ?? '0', 16),
      parseInt(long[3] ?? '0', 16),
    ];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short)
    return [
      0x11 * parseInt(short[1] ?? '0', 16),
      0x11 * parseInt(short[2] ?? '0', 16),
      0x11 * parseInt(short[3] ?? '0', 16),
    ];
  throw new Error(`raster: not a color it can paint: ${color}`);
}

/* -------------------------------------------------------------------------- the paths */

/** One piece of a path: its points in the drawing's units, and whether it was closed with Z. */
export interface SubPath {
  points: number[];
  closed: boolean;
}

/** A curve's last control point, which a smooth curve after it (S, T) reflects. */
interface Ctrl {
  x: number;
  y: number;
  kind: 'C' | 'Q';
}

const TOKEN = /([A-Za-z])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

/** How many parameters each command takes, and so how an implicit repeat is read. */
const ARITY: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  Z: 0,
};

/**
 * A path's `d`, as its pieces, every curve already cut into chords: at most `step` units long
 * (measured along the control polygon), and never fewer than two to a curve.
 */
export function pathPieces(d: string, step: number): SubPath[] {
  const tokens: (string | number)[] = [];
  for (const m of d.matchAll(TOKEN)) {
    if (m[1] !== undefined) tokens.push(m[1]);
    else if (m[2] !== undefined) tokens.push(Number(m[2]));
  }
  const out: SubPath[] = [];
  let current: SubPath | null = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // the last control point, for S and T, and which kind of curve left it — taken (and cleared) once
  // a command through a closure, because the curves set it from closures of their own, which a
  // narrowing at the top of the loop cannot see
  let lastCtrl: Ctrl | null = null;
  const takeCtrl = (): Ctrl | null => {
    const was = lastCtrl;
    lastCtrl = null;
    return was;
  };
  let i = 0;
  let command = '';
  const num = (): number => {
    const v = tokens[i];
    if (typeof v !== 'number') throw new Error(`raster: path "${d}" is short of a number`);
    i += 1;
    return v;
  };
  const lineTo = (nx: number, ny: number) => {
    if (current === null) {
      current = { points: [x, y], closed: false };
      out.push(current);
    }
    current.points.push(nx, ny);
    x = nx;
    y = ny;
  };
  const chords = (length: number) => Math.max(2, Math.min(128, Math.ceil(length / step)));
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const [x0, y0] = [x, y];
    const n = chords(
      Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2),
    );
    for (let k = 1; k <= n; k += 1) {
      const t = k / n;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const e = t * t * t;
      lineTo(a * x0 + b * x1 + c * x2 + e * x3, a * y0 + b * y1 + c * y2 + e * y3);
    }
    lastCtrl = { x: x2, y: y2, kind: 'C' };
  };
  const quad = (x1: number, y1: number, x2: number, y2: number) => {
    const [x0, y0] = [x, y];
    const n = chords(Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1));
    for (let k = 1; k <= n; k += 1) {
      const t = k / n;
      const u = 1 - t;
      lineTo(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
    }
    lastCtrl = { x: x1, y: y1, kind: 'Q' };
  };

  while (i < tokens.length) {
    const tok = tokens[i];
    if (typeof tok === 'string') {
      command = tok;
      i += 1;
    } else if (command === '') {
      throw new Error(`raster: path "${d}" starts with a number`);
    }
    const upper = command.toUpperCase();
    const arity = ARITY[upper];
    if (arity === undefined) throw new Error(`raster: path command "${command}" is not drawn here`);
    const rel = command !== upper;
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    const wasCtrl = takeCtrl();
    switch (upper) {
      case 'M': {
        const nx = ox + num();
        const ny = oy + num();
        current = { points: [nx, ny], closed: false };
        out.push(current);
        x = nx;
        y = ny;
        startX = nx;
        startY = ny;
        // pairs after a moveto are lines (SVG 1.1 §8.3.2)
        command = rel ? 'l' : 'L';
        break;
      }
      case 'L': {
        const nx = ox + num();
        lineTo(nx, oy + num());
        break;
      }
      case 'H':
        lineTo(ox + num(), y);
        break;
      case 'V':
        lineTo(x, oy + num());
        break;
      case 'C': {
        const x1 = ox + num();
        const y1 = oy + num();
        const x2 = ox + num();
        const y2 = oy + num();
        const x3 = ox + num();
        cubic(x1, y1, x2, y2, x3, oy + num());
        break;
      }
      case 'S': {
        const x1 = wasCtrl?.kind === 'C' ? 2 * x - wasCtrl.x : x;
        const y1 = wasCtrl?.kind === 'C' ? 2 * y - wasCtrl.y : y;
        const x2 = ox + num();
        const y2 = oy + num();
        const x3 = ox + num();
        cubic(x1, y1, x2, y2, x3, oy + num());
        break;
      }
      case 'Q': {
        const x1 = ox + num();
        const y1 = oy + num();
        const x2 = ox + num();
        quad(x1, y1, x2, oy + num());
        break;
      }
      case 'T': {
        const x1 = wasCtrl?.kind === 'Q' ? 2 * x - wasCtrl.x : x;
        const y1 = wasCtrl?.kind === 'Q' ? 2 * y - wasCtrl.y : y;
        const x2 = ox + num();
        quad(x1, y1, x2, oy + num());
        break;
      }
      case 'Z': {
        if (current !== null) current.closed = true;
        x = startX;
        y = startY;
        // a drawing command after Z starts a new piece where the last one began
        current = null;
        if (typeof tokens[i] === 'number')
          throw new Error(`raster: path "${d}" has a number after Z`);
        break;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- the rings */

function ellipseRing(cx: number, cy: number, rx: number, ry: number): Ring {
  // chords of about three pixels, and never a polygon a circle's eye could see
  const n = Math.max(16, Math.min(256, Math.ceil((2 * Math.PI * Math.max(rx, ry)) / 3)));
  const ring: Ring = [];
  for (let k = 0; k < n; k += 1) {
    const a = (2 * Math.PI * k) / n;
    ring.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  }
  return ring;
}

function rectRing(x: number, y: number, w: number, h: number, r: number): Ring {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr === 0) return [x, y, x + w, y, x + w, y + h, x, y + h];
  const ring: Ring = [];
  const n = Math.max(4, Math.ceil((Math.PI * rr) / 2 / 2));
  // the four corners, clockwise from the top right, each a quarter of a circle
  const corners: [number, number, number][] = [
    [x + w - rr, y + rr, -Math.PI / 2],
    [x + w - rr, y + h - rr, 0],
    [x + rr, y + h - rr, Math.PI / 2],
    [x + rr, y + rr, Math.PI],
  ];
  for (const [cx, cy, from] of corners) {
    for (let k = 0; k <= n; k += 1) {
      const a = from + ((Math.PI / 2) * k) / n;
      ring.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    }
  }
  return ring;
}

/** Twice the ring's signed area: its winding, which a stroke's pieces must all share. */
function signedArea2(ring: Ring): number {
  let s = 0;
  const n = ring.length / 2;
  for (let k = 0; k < n; k += 1) {
    const j = (k + 1) % n;
    s += (ring[2 * k] ?? 0) * (ring[2 * j + 1] ?? 0) - (ring[2 * j] ?? 0) * (ring[2 * k + 1] ?? 0);
  }
  return s;
}

function wound(ring: Ring): Ring {
  if (signedArea2(ring) >= 0) return ring;
  const out: Ring = [];
  for (let k = ring.length / 2 - 1; k >= 0; k -= 1)
    out.push(ring[2 * k] ?? 0, ring[2 * k + 1] ?? 0);
  return out;
}

/**
 * A STROKE WITH ROUND CAPS AND JOINS, as filled rings: one rectangle along every chord and one disc
 * at every point. All wound the same way, so the nonzero rule fills their union once — overlaps are
 * not painted twice, which a stroke at an opacity would show.
 */
function strokeRings(pieces: readonly SubPath[], half: number): Ring[] {
  const rings: Ring[] = [];
  for (const piece of pieces) {
    const p = piece.points.slice();
    if (piece.closed) p.push(p[0] ?? 0, p[1] ?? 0);
    const n = p.length / 2;
    // a moveto on its own draws nothing
    if (n < 2) continue;
    for (let k = 0; k < n; k += 1) {
      const px = p[2 * k] ?? 0;
      const py = p[2 * k + 1] ?? 0;
      rings.push(wound(ellipseRing(px, py, half, half)));
      if (k + 1 >= n) continue;
      const qx = p[2 * k + 2] ?? 0;
      const qy = p[2 * k + 3] ?? 0;
      const len = Math.hypot(qx - px, qy - py);
      if (len === 0) continue;
      const nx = (-(qy - py) / len) * half;
      const ny = ((qx - px) / len) * half;
      rings.push(wound([px + nx, py + ny, qx + nx, qy + ny, qx - nx, qy - ny, px - nx, py - ny]));
    }
  }
  return rings;
}

/** The rings a shape fills, in pixels, and what it paints them with. */
interface Paint {
  rings: Ring[];
  color: Rgb;
  alpha: number;
}

function paintsOf(shape: ArtShape, scale: number): Paint[] {
  const alpha = 'opacity' in shape && shape.opacity !== undefined ? shape.opacity : 1;
  const px = (pieces: SubPath[]): Ring[] =>
    pieces.map(p => p.points.map(v => v * scale)).filter(r => r.length >= 6);
  switch (shape.kind) {
    case 'rect':
      return [
        {
          rings: [
            rectRing(
              shape.x * scale,
              shape.y * scale,
              shape.width * scale,
              shape.height * scale,
              (shape.rx ?? 0) * scale,
            ),
          ],
          color: rgbOfHex(shape.fill),
          alpha,
        },
      ];
    case 'circle':
      return [
        {
          rings: [
            ellipseRing(shape.cx * scale, shape.cy * scale, shape.r * scale, shape.r * scale),
          ],
          color: rgbOfHex(shape.fill),
          alpha,
        },
      ];
    case 'ellipse':
      return [
        {
          rings: [
            ellipseRing(shape.cx * scale, shape.cy * scale, shape.rx * scale, shape.ry * scale),
          ],
          color: rgbOfHex(shape.fill),
          alpha,
        },
      ];
    case 'path': {
      // chords of about two pixels, in the drawing's own units
      const pieces = pathPieces(shape.d, 2 / scale);
      const paints: Paint[] = [];
      if (shape.fill !== undefined && shape.fill !== 'none')
        paints.push({ rings: px(pieces), color: rgbOfHex(shape.fill), alpha });
      if (shape.stroke !== undefined) {
        const scaled = pieces.map(p => ({
          points: p.points.map(v => v * scale),
          closed: p.closed,
        }));
        paints.push({
          rings: strokeRings(scaled, ((shape.strokeWidth ?? 1) * scale) / 2),
          color: rgbOfHex(shape.stroke),
          alpha,
        });
      }
      return paints;
    }
  }
}

/* ---------------------------------------------------------------------- the scanlines */

/** The edges of some rings, top to bottom, horizontal ones left out: they cross no scanline. */
interface Edges {
  count: number;
  y0: Float64Array;
  y1: Float64Array;
  x0: Float64Array;
  dxdy: Float64Array;
  dir: Int8Array;
}

function edgesOf(rings: readonly Ring[]): Edges {
  const list: [number, number, number, number, number][] = [];
  for (const ring of rings) {
    const n = ring.length / 2;
    for (let k = 0; k < n; k += 1) {
      const j = (k + 1) % n;
      const ax = ring[2 * k] ?? 0;
      const ay = ring[2 * k + 1] ?? 0;
      const bx = ring[2 * j] ?? 0;
      const by = ring[2 * j + 1] ?? 0;
      if (ay === by) continue;
      if (ay < by) list.push([ay, by, ax, (bx - ax) / (by - ay), 1]);
      else list.push([by, ay, bx, (ax - bx) / (ay - by), -1]);
    }
  }
  list.sort((a, b) => a[0] - b[0]);
  const count = list.length;
  const e: Edges = {
    count,
    y0: new Float64Array(count),
    y1: new Float64Array(count),
    x0: new Float64Array(count),
    dxdy: new Float64Array(count),
    dir: new Int8Array(count),
  };
  list.forEach(([a, b, x, s, d], k) => {
    e.y0[k] = a;
    e.y1[k] = b;
    e.x0[k] = x;
    e.dxdy[k] = s;
    e.dir[k] = d;
  });
  return e;
}

/**
 * One pixel row's coverage while a paint is laid down: `part` holds what the ends of spans leave in
 * the pixels they cut, `run` the steps of their whole-pixel middles (a difference array, summed as
 * the row is painted), so a span costs the same however wide it is — Hermes interprets, and the
 * head and the body are hundreds of pixels across.
 */
interface Row {
  part: Float32Array;
  run: Float32Array;
}

/**
 * Paint one set of rings onto the canvas: every pixel row it touches, five scanlines each, the
 * nonzero rule deciding what is inside, the covered length of each pixel added exactly.
 */
function fill(canvas: Float32Array, size: number, paint: Paint, row: Row): void {
  const e = edgesOf(paint.rings);
  if (e.count === 0) return;
  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (const ring of paint.rings) {
    for (let k = 0; k < ring.length; k += 2) {
      const x = ring[k] ?? 0;
      const y = ring[k + 1] ?? 0;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  const yStart = Math.max(0, Math.floor(top));
  const yEnd = Math.min(size, Math.ceil(bottom));
  const xStart = Math.max(0, Math.floor(left));
  const xEnd = Math.min(size, Math.ceil(right));
  if (yStart >= yEnd || xStart >= xEnd) return;

  const active: number[] = [];
  const xs = new Float64Array(e.count);
  const ds = new Int8Array(e.count);
  let next = 0;
  const weight = 1 / SUBROWS;
  const [cr, cg, cb] = paint.color;

  for (let y = yStart; y < yEnd; y += 1) {
    while (next < e.count && (e.y0[next] ?? Infinity) < y + 1) active.push(next++);
    // edges that end at or above this row are done with
    let keep = 0;
    for (let a = 0; a < active.length; a += 1) {
      const k = active[a] ?? 0;
      if ((e.y1[k] ?? 0) > y) active[keep++] = k;
    }
    active.length = keep;

    for (let s = 0; s < SUBROWS; s += 1) {
      const sy = y + (s + 0.5) * weight;
      let n = 0;
      for (let a = 0; a < active.length; a += 1) {
        const k = active[a] ?? 0;
        const y0 = e.y0[k] ?? 0;
        if (y0 <= sy && sy < (e.y1[k] ?? 0)) {
          // in order as they come: insertion into the sorted crossings (a handful a scanline)
          const x = (e.x0[k] ?? 0) + (sy - y0) * (e.dxdy[k] ?? 0);
          let at = n;
          while (at > 0 && (xs[at - 1] ?? 0) > x) {
            xs[at] = xs[at - 1] ?? 0;
            ds[at] = ds[at - 1] ?? 0;
            at -= 1;
          }
          xs[at] = x;
          ds[at] = e.dir[k] ?? 0;
          n += 1;
        }
      }
      let winding = 0;
      let from = 0;
      for (let c = 0; c < n; c += 1) {
        const before = winding;
        winding += ds[c] ?? 0;
        const x = xs[c] ?? 0;
        if (before === 0 && winding !== 0) from = x;
        else if (before !== 0 && winding === 0) span(row, from, x, xStart, xEnd, weight);
      }
    }

    // this row, onto the canvas: covered share × opacity of the paint over what is there
    const base = y * size * 3;
    let whole = 0;
    for (let x = xStart; x < xEnd; x += 1) {
      whole += row.run[x] ?? 0;
      const cover = whole + (row.part[x] ?? 0);
      row.run[x] = 0;
      row.part[x] = 0;
      if (cover <= 1e-6) continue;
      const a = Math.min(1, cover) * paint.alpha;
      const p = base + x * 3;
      canvas[p] = (canvas[p] ?? 0) + (cr - (canvas[p] ?? 0)) * a;
      canvas[p + 1] = (canvas[p + 1] ?? 0) + (cg - (canvas[p + 1] ?? 0)) * a;
      canvas[p + 2] = (canvas[p + 2] ?? 0) + (cb - (canvas[p + 2] ?? 0)) * a;
    }
  }
}

/** Add the covered stretch [a, b) of one scanline to the row, each pixel by the length it got. */
function span(row: Row, a: number, b: number, lo: number, hi: number, weight: number): void {
  const from = Math.max(a, lo);
  const to = Math.min(b, hi);
  if (to <= from) return;
  const i = Math.floor(from);
  const j = Math.floor(to);
  const { part, run } = row;
  if (i === j) {
    part[i] = (part[i] ?? 0) + (to - from) * weight;
    return;
  }
  part[i] = (part[i] ?? 0) + (i + 1 - from) * weight;
  // the whole pixels between: one step up where they start, one down where they stop — and none at
  // the paint's right edge, which the row is never read past (so a step there would outlive it)
  if (i + 1 < j) {
    run[i + 1] = (run[i + 1] ?? 0) + weight;
    if (j < hi) run[j] = (run[j] ?? 0) - weight;
  }
  if (j < hi) part[j] = (part[j] ?? 0) + (to - j) * weight;
}

/**
 * THE SHAPES, AS A `size × size` PICTURE: the drawing's 100 × 100 box fitted to the whole canvas,
 * as `BabyAvatarArt`'s `viewBox` fits it to the chooser's circle, on a white ground (the first shape
 * of every baby covers it: `art.ts` draws its own opaque ground, which is what makes JPEG safe).
 */
export function rasterize(shapes: readonly ArtShape[], size: number): Raster {
  const canvas = new Float32Array(size * size * 3).fill(255);
  const row: Row = { part: new Float32Array(size + 1), run: new Float32Array(size + 1) };
  const scale = size / ART_BOX;
  for (const shape of shapes) {
    // THE GROUND: a square rectangle over the whole box is the whole canvas in its color, which
    // needs no scanline (every baby starts with one — a quarter of a million pixels saved)
    if (
      shape.kind === 'rect' &&
      (shape.rx ?? 0) === 0 &&
      shape.x <= 0 &&
      shape.y <= 0 &&
      shape.x + shape.width >= ART_BOX &&
      shape.y + shape.height >= ART_BOX
    ) {
      const [r, g, b] = rgbOfHex(shape.fill);
      for (let p = 0; p < size * 3; p += 3) {
        canvas[p] = r;
        canvas[p + 1] = g;
        canvas[p + 2] = b;
      }
      // one row by hand, then doubled down the canvas by the engine's own copy
      for (let done = size * 3; done < canvas.length; done *= 2)
        canvas.copyWithin(done, 0, Math.min(done, canvas.length - done));
      continue;
    }
    for (const paint of paintsOf(shape, scale)) fill(canvas, size, paint, row);
  }
  // rounded and clamped to 0–255 by the typed array itself (ToUint8Clamp), not a loop in JavaScript
  const rgb = new Uint8Array(new Uint8ClampedArray(canvas).buffer);
  return { width: size, height: size, rgb };
}
