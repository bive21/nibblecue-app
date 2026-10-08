/**
 * A PICTURE THAT SHOWS NOTHING (2026-09-29). The owner, the day after the drawn babies were fixed:
 * *"the avatar still showing as white empty with party hat. on both android and iphone (same
 * household)"*. The fix of 2026-09-29 (`avatars/render.ts`) made every NEW pick right, but a baby
 * picked on an iPhone before it had already been stored as the child's photo, and a stored photo
 * is what every phone in the household draws.
 *
 * WHAT THAT STORED PICTURE IS. The old export asked react-native-svg for the chooser's 64 pt face at
 * 512, and iOS drew it at the face's own 64 pt in the top-left corner of a transparent 512 pt canvas
 * (`raster.ts` quotes the native source). The photo pipeline scaled that to 512 px and saved it as a
 * JPEG, which has no transparency, so the empty part became one flat color (white, on the owner's
 * phones). The baby is still in the file, 64 px square in its corner; the round avatar shows the
 * square's inscribed circle, which that corner lies wholly outside. So the circle is one color, and
 * the picture "loads" perfectly well: no `onError`, and the initial the design system falls back to
 * for a picture that fails (`packages/ui` `photoTrouble.ts`) never had a reason to appear.
 *
 * WHAT THIS DECIDES, from the file's bytes alone:
 *
 *   picture  the circle shows something: draw it. A real photo is known by the first blocks of the
 *            file that reach the circle, so it costs almost nothing.
 *   blank    every pixel in the circle is one flat color. `baby` is the drawn baby in the old
 *            iPhone picture's corner, when the corner is one of the app's own drawings beyond doubt
 *            (`whichBaby`); null when it is not, and the avatar draws the initial.
 *   unread   not a file this reader judges (`jpeg.ts`): drawn as it is. A reader's limit is never a
 *            reason to hide a photo.
 *
 * THE TEST IS EXACT, NOT A THRESHOLD. JPEG codes a picture in 8 × 8 blocks of frequencies, and a
 * block whose frequencies above the first are all zero is one flat color, and the same first
 * frequency is the same color. So "every block the circle touches is flat and all of them are the
 * same" is "every pixel in the circle is one color", read without rebuilding a pixel, and nothing
 * with a face, a blanket or a gradient in it passes — a camera's own noise alone fails it.
 *
 * IT READS THE BABY, NEVER THE CHILD. The corner is compared with the app's twenty drawings and
 * nothing else, only once the circle has been found empty, and only to redraw the drawing the
 * parent chose (docs/MEDIA.md §1: nothing derived from a photo — no face detection, no inference).
 * A real photo is never looked at past the blocks that prove it is one.
 *
 * THE DRAWINGS IT KNOWS ARE TODAY'S. Since 2026-09-30 every baby has a face of its own (`art.ts`),
 * and the old picture's corner holds the baby as it was drawn before, so it is none of today's
 * drawings beyond doubt: such a picture draws the initial, never an empty circle, until the baby is
 * picked again, as a pick always mended it. Keeping the old faces to match against was weighed and
 * left out: the old export ended on 2026-09-29, and the one household known to have had such a
 * picture (the owner's) picked again that day.
 *
 * Pure, so node holds it against the very files a phone stores (`blankPicture.test.ts`).
 */
import { BABY_AVATARS, babyShapes, type BabyAvatarDef } from './avatars/art';
import { rasterize, type Raster } from './avatars/raster';
import { blockPixels, componentsToRgb, readJpeg, type JpegFrame } from './jpeg';

export type Rgb = readonly [number, number, number];

export type PictureVerdict =
  | { kind: 'picture' }
  | { kind: 'blank'; ground: Rgb; baby: BabyAvatarDef | null }
  | { kind: 'unread'; why: string };

/**
 * WHERE THE OLD IPHONE PICTURE KEPT THE BABY: the chooser's face (`AvatarGrid`
 * `AVATAR_CHOICE_SIZE`, 64 pt, and it has never been anything else) in the corner of the 512 pt
 * canvas the old export asked for, so the top-left eighth of the picture, whatever its size in
 * pixels. `blankPicture.test.ts` pins both numbers to where they came from.
 */
export const OLD_FACE_PT = 64;
export const OLD_CANVAS_PT = 512;

/**
 * HOW SURE THE CORNER MUST BE: the mean difference, per channel of every pixel (0–255), between the
 * corner and the drawing it is taken for, and how much nearer that drawing must be than any other.
 * The old picture went through the phone's own drawing at 2x or 3x, a resize, perhaps a wide-gamut
 * color profile, and a JPEG, so its corner is near the app's drawing and never equal to it. Measured
 * over all twenty babies through the harshest of those roads (point-sampled or bilinear resizes,
 * Display P3, quality 60): the true baby within 8.7 levels, every other at least 11 away and at
 * least 5 further; the two nearest drawings are 9.7 apart. Either bound failing is a blank picture
 * with no baby, and the initial: the side to err on, since a wrong baby would reach every phone.
 */
export const MATCH_WITHIN = 10;
export const MATCH_MARGIN = 4;

/**
 * THE CIRCLE JUDGED: the one an avatar shows (the centered square's inscribed circle — an `Image`
 * covers its box), less a rim of a sixteenth of its radius. The rim is where the avatar's own edge
 * is soft, a point wide at the top bar's size, and leaving it out keeps the verdict off the blocks
 * nearest the old picture's corner: a resize that smeared the drawing a pixel or two past its edge
 * reaches a 16 px chroma block whose nearest pixel is 249.6 px from the middle of a 512 picture,
 * inside the full circle and outside this one (`blankPicture.test.ts`).
 */
const RIM = 1 / 16;

/** Whether any pixel of the block `[x0, x1) × [y0, y1)` has its middle inside the circle judged. */
function touchesCircle(f: JpegFrame, x0: number, y0: number, x1: number, y1: number): boolean {
  const cx = f.width / 2;
  const cy = f.height / 2;
  const r = (Math.min(f.width, f.height) / 2) * (1 - RIM);
  const nx = Math.min(Math.max(cx, x0 + 0.5), x1 - 0.5);
  const ny = Math.min(Math.max(cy, y0 + 0.5), y1 - 0.5);
  return (nx - cx) ** 2 + (ny - cy) ** 2 < r * r;
}

/** The side of the old picture's corner, in this file's pixels. */
const cornerSide = (f: JpegFrame): number =>
  Math.round((Math.min(f.width, f.height) * OLD_FACE_PT) / OLD_CANVAS_PT);

/** Judge a stored picture's bytes (see the header). Never throws. */
export function judgePicture(bytes: Uint8Array): PictureVerdict {
  // per component, the one color (its DC, dequantized) every block in the circle must share
  const ground: (number | undefined)[] = [];
  // the corner's blocks, kept whole: rebuilt into pixels only if the circle turns out empty
  const corner = new Map<string, { coef: Int16Array; quant: Uint16Array }>();
  let inCircle = 0;
  let read: ReturnType<typeof readJpeg>;
  try {
    read = readJpeg(bytes, (f, c, bx, by, coef, quant) => {
      const comp = f.components[c];
      if (comp === undefined) return true;
      const w = (8 * f.hMax) / comp.h;
      const h = (8 * f.vMax) / comp.v;
      const x0 = bx * w;
      const y0 = by * h;
      // a block of padding past the picture's edge shows nothing
      if (x0 >= f.width || y0 >= f.height) return true;
      if (touchesCircle(f, x0, y0, Math.min(f.width, x0 + w), Math.min(f.height, y0 + h))) {
        // a single frequency above the first is a block that is not one color: a picture
        for (let i = 1; i < 64; i += 1) if (coef[i] !== 0) return false;
        const dc = (coef[0] ?? 0) * (quant[0] ?? 0);
        const was = ground[c];
        if (was === undefined) ground[c] = dc;
        else if (was !== dc) return false;
        inCircle += 1;
        return true;
      }
      const side = cornerSide(f);
      if (x0 < side && y0 < side)
        corner.set(`${c}:${bx}:${by}`, {
          coef: Int16Array.from(coef),
          quant: Uint16Array.from(quant),
        });
      return true;
    });
  } catch (err: unknown) {
    return { kind: 'unread', why: err instanceof Error ? err.message : 'unreadable' };
  }
  if (!read.finished || inCircle === 0) return { kind: 'picture' };
  const { frame } = read;
  // a flat block's every sample is its DC over eight, shifted back to 0–255 (T.81 A.3.3)
  const color = componentsToRgb(
    frame,
    frame.components.map((_, c) => Math.round((ground[c] ?? 0) / 8 + 128)),
  );
  return { kind: 'blank', ground: color, baby: whichBaby(cornerPixels(frame, corner)) };
}

/** The old picture's corner as pixels, each chroma sample repeated over the pixels it covers. */
function cornerPixels(
  frame: JpegFrame,
  blocks: ReadonlyMap<string, { coef: Int16Array; quant: Uint16Array }>,
): Raster {
  const side = cornerSide(frame);
  const rebuilt = new Map<string, Uint8ClampedArray>();
  const sample = (c: number, x: number, y: number): number => {
    const comp = frame.components[c];
    if (comp === undefined) return 128;
    const sx = Math.floor((x * comp.h) / frame.hMax);
    const sy = Math.floor((y * comp.v) / frame.vMax);
    const key = `${c}:${sx >> 3}:${sy >> 3}`;
    let px = rebuilt.get(key);
    if (px === undefined) {
      const b = blocks.get(key);
      if (b === undefined) return 128;
      px = blockPixels(b.coef, b.quant);
      rebuilt.set(key, px);
    }
    return px[(sy & 7) * 8 + (sx & 7)] ?? 128;
  };
  const rgb = new Uint8Array(side * side * 3);
  for (let y = 0; y < side; y += 1)
    for (let x = 0; x < side; x += 1)
      rgb.set(
        componentsToRgb(
          frame,
          frame.components.map((_, c) => sample(c, x, y)),
        ),
        (y * side + x) * 3,
      );
  return { width: side, height: side, rgb };
}

/** Each drawing at one size, drawn once a session: a blank picture is rare, and so is this. */
const drawings = new Map<number, readonly { def: BabyAvatarDef; raster: Raster }[]>();

function drawingsAt(side: number): readonly { def: BabyAvatarDef; raster: Raster }[] {
  let set = drawings.get(side);
  if (set === undefined) {
    set = BABY_AVATARS.map(def => ({ def, raster: rasterize(babyShapes(def), side) }));
    drawings.set(side, set);
  }
  return set;
}

/** The mean difference, per channel of every pixel, between two pictures of one size. */
function meanDifference(a: Raster, b: Raster): number {
  let sum = 0;
  for (let i = 0; i < a.rgb.length; i += 1) sum += Math.abs((a.rgb[i] ?? 0) - (b.rgb[i] ?? 0));
  return sum / a.rgb.length;
}

/**
 * WHICH OF THE APP'S DRAWINGS a corner is, or null when it is none of them beyond doubt: nearer than
 * `MATCH_WITHIN`, and nearer than every other drawing by `MATCH_MARGIN` (see there).
 */
export function whichBaby(corner: Raster): BabyAvatarDef | null {
  if (corner.width < 8 || corner.width !== corner.height) return null;
  let best: { def: BabyAvatarDef; d: number } | null = null;
  let next = Infinity;
  for (const { def, raster } of drawingsAt(corner.width)) {
    const d = meanDifference(corner, raster);
    if (best === null || d < best.d) {
      if (best !== null) next = best.d;
      best = { def, d };
    } else if (d < next) next = d;
  }
  if (best === null || best.d > MATCH_WITHIN || next - best.d < MATCH_MARGIN) return null;
  return best.def;
}
