/**
 * A TTF'S ADVANCE WIDTHS, FOR TESTS: how wide the face the app ships sets a word, so a table of
 * widths or a bound in the design system can be held to the font itself rather than to a guess —
 * the path tiles' words (`sheets/quick/modules/sheets.test.ts`), a capsule's name
 * (`screens/today/capsuleWords.test.ts`), Today's report (`screens/today/reportFit.test.ts`) and
 * What you track's card names (`screens/more/whatYouTrack.test.ts`). The design system cannot read
 * a font in node from inside the package; the app can, from the `@expo-google-fonts` packages it
 * bundles. **Test-only**, like everything in this folder (`no-bundle.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * The width of `text` in em, as the font's own advances add up: the `cmap` (format 4) to find a
 * character's glyph and the `hmtx` to read its advance — no kerning, which is the safe side for a
 * fit. Enough of the format to measure a word, and nothing more.
 */
export function advances(b: Buffer): (text: string) => number {
  const u16 = (o: number) => b.readUInt16BE(o);
  const i16 = (o: number) => b.readInt16BE(o);
  const u32 = (o: number) => b.readUInt32BE(o);
  const tables = new Map<string, number>();
  for (let i = 0; i < u16(4); i += 1)
    tables.set(b.toString('ascii', 12 + i * 16, 16 + i * 16), u32(20 + i * 16));
  const at = (tag: string): number => {
    const o = tables.get(tag);
    if (o === undefined) throw new Error(`no ${tag} table`);
    return o;
  };
  const upm = u16(at('head') + 18);
  const metrics = u16(at('hhea') + 34);
  const cmap = at('cmap');
  let sub = -1;
  for (let i = 0; i < u16(cmap + 2); i += 1)
    if (u16(cmap + 4 + i * 8) === 3 && u16(cmap + 6 + i * 8) === 1)
      sub = cmap + u32(cmap + 8 + i * 8);
  if (sub < 0) throw new Error('no Unicode cmap');
  const segs = u16(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + 2 * segs + 2;
  const deltas = starts + 2 * segs;
  const ranges = deltas + 2 * segs;
  const glyph = (c: number): number => {
    for (let s = 0; s < segs; s += 1) {
      if (c > u16(ends + 2 * s)) continue;
      const start = u16(starts + 2 * s);
      if (c < start) return 0;
      const range = u16(ranges + 2 * s);
      if (range === 0) return (c + i16(deltas + 2 * s)) & 0xffff;
      const g = u16(ranges + 2 * s + range + 2 * (c - start));
      return g === 0 ? 0 : (g + i16(deltas + 2 * s)) & 0xffff;
    }
    return 0;
  };
  const advance = (g: number) => u16(at('hmtx') + 4 * Math.min(g, metrics - 1));
  return text =>
    Array.from(text).reduce((sum, ch) => sum + advance(glyph(ch.codePointAt(0) ?? 0)), 0) / upm;
}

/**
 * The weights the app loads (`appearance/fonts.ts`), by the package each ships in — named by its
 * `package.json`, never by its bare name: a bare font package is its index, which requires every
 * weight it publishes, and `appearance/fonts.test.ts` fails the build for any file that names one
 * — and the weight folder and file each is.
 */
const FACES = {
  hankenRegular: [
    '@expo-google-fonts/hanken-grotesk/package.json',
    '400Regular',
    'HankenGrotesk_400Regular.ttf',
  ],
  hankenBold: [
    '@expo-google-fonts/hanken-grotesk/package.json',
    '700Bold',
    'HankenGrotesk_700Bold.ttf',
  ],
  // the H1 and H2 face (`type.h1`), for setup's check that a heading and its words keep the
  // step's first control above the fold (`screens/onboarding/stepWords.test.ts`)
  hankenExtraBold: [
    '@expo-google-fonts/hanken-grotesk/package.json',
    '800ExtraBold',
    'HankenGrotesk_800ExtraBold.ttf',
  ],
  // the mono faces ship from the app's own folder, cut to the Latin set (2026-10-08,
  // `tools/ui/subset-mono-fonts.py`): no package, the app's `assets/fonts`
  monoRegular: [null, 'fonts', 'IBMPlexMono_400Regular.ttf'],
  monoSemiBold: [null, 'fonts', 'IBMPlexMono_600SemiBold.ttf'],
} as const;

/** Where the file the app registers for `face` is. */
function facePath(face: ShippedFace): string {
  const [pkgJson, folder, file] = FACES[face];
  if (pkgJson === null) return join(__dirname, '..', '..', 'assets', folder, file);
  return join(dirname(createRequire(import.meta.url).resolve(pkgJson)), folder, file);
}

export type ShippedFace = keyof typeof FACES;

/** A face the app ships, from the weight folder the app registers it from, as text → em width. */
export function shippedFace(face: ShippedFace): (text: string) => number {
  return advances(readFileSync(facePath(face)));
}

/** Hanken Grotesk Bold, from the weight folder the app registers it from (`appearance/fonts.ts`). */
export const hankenBold = (): ((text: string) => number) => shippedFace('hankenBold');

/**
 * A FACE'S HEIGHTS, in em: how far its ascent reaches above the baseline and its descent below
 * (`hhea`, the pair both platforms lay a line out by), the line they make with the line gap, and
 * how tall its capitals and figures stand (`OS/2` sCapHeight). What a line box has to hold.
 */
export function shippedFaceHeights(face: ShippedFace): {
  ascent: number;
  descent: number;
  line: number;
  capHeight: number;
} {
  const b = readFileSync(facePath(face));
  const tables = new Map<string, number>();
  for (let i = 0; i < b.readUInt16BE(4); i += 1)
    tables.set(b.toString('ascii', 12 + i * 16, 16 + i * 16), b.readUInt32BE(20 + i * 16));
  const at = (tag: string): number => {
    const o = tables.get(tag);
    if (o === undefined) throw new Error(`no ${tag} table`);
    return o;
  };
  const upm = b.readUInt16BE(at('head') + 18);
  const hhea = at('hhea');
  const ascent = b.readInt16BE(hhea + 4) / upm;
  const descent = -b.readInt16BE(hhea + 6) / upm;
  const gap = b.readInt16BE(hhea + 8) / upm;
  const os2 = at('OS/2');
  if (b.readUInt16BE(os2) < 2) throw new Error(`${face}: no sCapHeight before OS/2 version 2`);
  return {
    ascent,
    descent,
    line: ascent + descent + gap,
    capHeight: b.readInt16BE(os2 + 88) / upm,
  };
}
