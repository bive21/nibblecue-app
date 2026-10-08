/**
 * Types for `import-icons.lib.mjs`, so `packages/ui/src/icons/import-icons.test.ts` can import
 * the converter under `strict` without the converter becoming TypeScript: the owner runs it with
 * plain `node`, and so does `pnpm check:icons`. The seam is `tools/fixtures/gen-household.d.mts`'s.
 */
import type { IconDef } from '../../packages/ui/src/icons/paths';

export declare class IconImportError extends Error {
  readonly file: string | null;
  constructor(message: string, file?: string);
}

/** The module glyphs, in the order the owner's README lists them. */
export declare const MODULE_ICON_NAMES: readonly string[];
/** What each glyph is used for, best effort; a name with no line is listed without one. */
export declare const ICON_NOTES: Readonly<Record<string, string>>;
export declare const DEFAULT_STROKE: number;
export declare const DEFAULT_GRID: number;
export declare const README_START: string;
export declare const README_END: string;

export interface PathSegment {
  cmd: string;
  args: number[];
}

export interface ImportSummary {
  mode: 'stroke' | 'filled';
  strokeWidth: number | undefined;
  shapes: number;
  viewBox: string;
  /** 2 when the file draws in two tones of one ink; the hexes say which was taken as which. */
  tones: 1 | 2;
  primary?: string;
  secondary?: string;
}

export interface ImportResult {
  /** Exactly the shape of an `ICON_PATHS` entry. */
  def: IconDef;
  /** What was tolerated and how, for the person running the import. */
  notes: string[];
  summary: ImportSummary;
}

export interface ImportEntry {
  name: string;
  file: string;
  def: IconDef;
}

export declare function iconNamesFrom(pathsSource: string): string[];
export declare function iconNameForFile(fileName: string, names: readonly string[]): string;
export declare function orderedNames(names: readonly string[]): string[];
export declare function fmt(n: number): string;
export declare function parsePath(d: string, file?: string): PathSegment[];
export declare function serializePath(segments: readonly PathSegment[]): string;
export declare function translatePath(d: string, dx: number, dy: number, file?: string): string;
export declare function polyToPath(points: string, close: boolean, file?: string): string;
export declare function ellipseToPath(cx: number, cy: number, rx: number, ry: number): string;
export declare function rectToPath(
  x: number,
  y: number,
  w: number,
  h: number,
  rx?: number,
  ry?: number,
): string;
export declare function normalizePaint(
  value: string | null | undefined,
): string | { ref: string } | undefined;
export declare function parseTranslate(
  transform: string,
  file?: string,
): { dx: number; dy: number };
export declare function parseSvg(svgText: string, file?: string): ImportResult;
export declare function renderCustomPaths(entries: readonly ImportEntry[]): string;
export declare function renderReadmeBlock(
  names: readonly string[],
  present?: readonly string[],
): string;
export declare function spliceReadme(readme: string, block: string): string;
