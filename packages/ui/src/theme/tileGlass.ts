/**
 * THE LIQUID GLASS OF A LOG TILE, ON ANDROID (the owner, 2026-10-01, from a Samsung in Expo Go:
 * *"android liquid glass still dont look too glassy on the modules, except for the modified radius.
 * make the liquid glass effect inside each the border of the quick log modules"*).
 *
 * WHAT WAS THERE. Android draws no blur (Surface.tsx says why, and what was weighed), so a Log tile
 * under Glass was its soft tint, opaque (`tintAlphaFor`), inside its category edge — and on a pebble
 * in light a 14% top light that a pale tint cannot show. A capsule (a pill takes no top light), every
 * tile in dark and a bubble's flat disc were the tint and the edge and nothing else: Paper's tile with
 * Glass's corners, which is the report.
 *
 * WHAT GLASS DOES TO LIGHT, WITHOUT A BLUR — four things, each one layer, every one of them INSIDE
 * the tile's own edge and under its content (`TileGlass.tsx`):
 *
 *   1. THE BODY, on a pebble, lets the ground through at the top and is whole below it: the tint at
 *      `body` along the top (the no-blur panel's own 76% in light), thickening to the whole tint by
 *      the middle — glass pooling at its foot, lighter toward the top and deeper toward the bottom.
 *   2. THE SHADE: the tile's own hue gathering along the bottom (the page itself in dark, where a
 *      light hue would lift the foot instead of deepening it).
 *   3. THE SHEEN, light caught along the top just inside the rim: bright at the top and falling
 *      away, an ease and never a plateau — the brushed steel the iPhone was rid of on 2026-09-29 was
 *      a flat stretch of white with a shoulder. A fine line of body stands between it and the rim, so
 *      the rim still reads as a line where the light is strongest.
 *   4. THE RIM, one point of light just inside the edge — bright along the top, quiet down the
 *      sides, catching again at the foot — against the edge's own darker category line: a lit inner
 *      edge on a darker outer one is what the edge of a piece of glass looks like.
 *
 * NEVER UNDER A WORD BUT THE NAME. A tile's words are its name, its line ("37m · 4 oz"), its due
 * and late words, and its count. The count is an opaque chip, a pebble's line and its alert are in
 * an opaque pill, and a bubble's words are under it on the page — so on a pebble the NAME is the only
 * word on the glass, and the body may be thin around its picture. A capsule sets its line and its
 * due and late words on its own body, where a count wrapped under a line at a large text size can
 * lift them high; so a capsule's body stays whole, its sheen is held to its top padding and its
 * name's first line (`crown`), and its shade to its bottom padding — under nothing but the name. A
 * bubble's disc is the owner's swatch, opaque (below): its sheen is in the band above its picture
 * and its shade in the band below. `PlaceRim`'s rule, for the same reason: the glass is where the
 * words are not, and the inks are still measured as if one did reach it (`tileGlass.test.ts`).
 *
 * WHERE, AND WHERE NOT. Android's Glass only: `null` on Paper (flat by design) and `null` on the
 * iPhone, whose tiles keep the platform's blur and the calm top light of 2026-09-29, unchanged. A
 * fixed handful of layers per tile, all still: no animation, nothing redrawn per frame.
 *
 * WHICH LIGHT A BODY CAN CARRY is the body's to decide, not the theme's: a dark tint takes the dim
 * recipe (white at a pale tint's strength is a scratch on a dark one, and the words on it are light,
 * so every point of white under them is contrast taken away), but a bubble's disc is the owner's
 * pastel swatch in light AND dark (theme.ts `moduleDiscSwatch`) and takes the lit recipe in both.
 * Night, the amber theme, has its own: whole bodies (its ground is flat, so there is nothing to show
 * through), no shade, and a dim rim and sheen in the night `line`'s amber — the prototype's night
 * tile, for a dark room.
 */
import type { QuickShape } from './appearance';
import { composite, luminance, parseColor, toHex } from './contrast';
import type { SkinName } from './skins';
import type { Palette, ThemeName } from './theme';

export type GlassLayerKind = 'density' | 'shade' | 'sheen' | 'rim';

/** One stop of a layer's ramp: how far along its run, and how strong its color is there. */
export interface GlassStop {
  offset: number;
  alpha: number;
}

export interface GlassLayer {
  kind: GlassLayerKind;
  /** Opaque. The strength is in the stops — never an opacity prop (Surface.tsx's rule). */
  color: string;
  /** Top to bottom along the layer's own run (`tileGlassShapes` says where each one runs). */
  stops: readonly GlassStop[];
}

export interface TileGlassSpec {
  /**
   * The body's alpha where it is thinnest, along the top: below 1 on a pebble only, whose `density`
   * layer makes it whole by the middle. A tinted Surface takes it in place of `tintAlphaFor`.
   */
  body: number;
  /**
   * The band along the top, in points inside the edge, that the sheen may fill — a capsule's top
   * padding and its name's first line — or null where the sheen reaches as far as it would.
   */
  crown: number | null;
  /** In paint order: density, shade, sheen, rim — and the tile's own edge over all of them. */
  layers: readonly GlassLayer[];
  /** Changes exactly when the drawing does: what `TileGlass.tsx` is memoized on. */
  key: string;
}

export interface TileGlassInput {
  /** The material actually painted (`skinTokens.name`). */
  skin: SkinName;
  theme: ThemeName;
  /** `Platform.OS`. Only `'android'` draws it. */
  platform: string;
  shape: QuickShape;
  palette: Pick<Palette, 'surfaceSolid' | 'line' | 'page'>;
  /** The body before any alpha: a pebble's or a capsule's soft tint, a bubble's disc. */
  fill: string;
  /** The tile's category ink (`cat.fg`; `text2` on More): what deepens a light body's foot. */
  hue: string;
  /** The band along the top that holds no word but the name (`TileGlassSpec.crown`). */
  crown?: number;
}

/**
 * A recipe: the body's alpha at the top (a pebble's); the sheen's alpha at its top and at
 * `SHEEN_MID` of its run; the shade's at the foot; the rim's along the top, the sides and the foot.
 */
interface Recipe {
  body: number;
  sheen: { top: number; mid: number };
  shade: number | null;
  rim: { top: number; side: number; foot: number };
}

/**
 * A LIGHT BODY — every tint in light, and a bubble's pastel disc in light and in dark.
 *
 * `body` is the no-blur panel's own 76% (skins.ts SURFACE_ALPHA_WITHOUT_BLUR), the number at which
 * the lit ground and its orbs show through a panel on this platform, so a pebble's top shows the
 * ground the cards around it do. The sheen at 0.5 is light on a pale tint, not a gloss. The shade
 * is 0.12 of the tile's own hue: as deep as the foot can go with the second ink still clearing
 * 4.5:1 there if a word ever sat on it (none does). The rim is nearly white along the top.
 */
const LIT: Recipe = {
  body: 0.76,
  sheen: { top: 0.5, mid: 0.16 },
  shade: 0.12,
  rim: { top: 0.9, side: 0.38, foot: 0.55 },
};

/**
 * A DARK BODY — every tint in dark. The same layers with a fraction of the light: the ground under a
 * dark tile is darker than the tile, so the thin top is a little denser than light's, and the sheen
 * over it is quiet for the light words a tile carries.
 */
const DIM: Recipe = {
  body: 0.8,
  sheen: { top: 0.14, mid: 0.05 },
  shade: 0.4,
  rim: { top: 0.32, side: 0.1, foot: 0.16 },
};

/**
 * NIGHT, the amber theme: whole, no shade, and the rim and sheen in the night `line`'s amber at the
 * prototype's night tile (`rgba(214,167,96,.10)` falling away, an inset line at .12): enough to say
 * glass in a dark room, and nothing that shines.
 */
const NIGHT: Recipe = {
  body: 1,
  sheen: { top: 0.1, mid: 0.03 },
  shade: null,
  rim: { top: 0.12, side: 0.05, foot: 0.05 },
};

/** Above this relative luminance a body is light enough to carry the lit recipe. */
export const GLASS_LIT_LUMINANCE = 0.2;

/**
 * WHERE A PEBBLE'S BODY IS WHOLE, as a fraction of its height from the top: the middle. Its name sits
 * under its 44 pt picture, at 52% of the tile and lower, so the name is on the whole tint too; the
 * thin top is the picture's band.
 */
export const DENSE_AT = 0.5;

/** Where the sheen's middle stop sits along its run: an ease-out, never a shoulder. */
export const SHEEN_MID = 0.45;

/** Where the rim leaves the top's light, and where it starts to catch the foot's, along the height. */
const RIM_SIDE_FROM = 0.3;
const RIM_SIDE_TO = 0.72;

/**
 * The light a theme's glass is lit with: white in light and dark (light's `surfaceSolid`, and the
 * `line` dark draws in white), the night `line`'s amber in Night. From the palette by role, as
 * every color is (theme.ts usage rule 1).
 */
export const glassLight = (
  palette: Pick<Palette, 'surfaceSolid' | 'line'>,
  theme: ThemeName,
): string => (theme === 'light' ? palette.surfaceSolid : toHex(parseColor(palette.line)));

/** The recipe a body takes: Night's, or the lit or the dim one by how light the body is. */
const recipeFor = (theme: ThemeName, fill: string): Recipe =>
  theme === 'night' ? NIGHT : luminance(fill) > GLASS_LIT_LUMINANCE ? LIT : DIM;

/**
 * The liquid glass of one Log tile, or `null` where nothing is drawn: Paper, the iPhone, and any
 * platform that is not Android.
 */
export function tileGlass(i: TileGlassInput): TileGlassSpec | null {
  if (i.platform !== 'android' || i.skin !== 'glass') return null;
  const r = recipeFor(i.theme, i.fill);
  const light = glassLight(i.palette, i.theme);
  /*
    ONLY A PEBBLE'S BODY IS THIN (the header: the name is the only word on it). A capsule carries its
    line and its due and late words on its body, which stays whole under them. A bubble's disc is the
    owner's swatch at full strength (2026-09-22; a disc diluted toward the page was the "too similar
    to the background" of 2026-09-18), on a native shadow only an opaque disc hides (the octagon,
    shadows.ts): the sphere is glass by its light, not by what is behind it.
  */
  const body = i.shape === 'pebble' ? r.body : 1;
  const crown = i.crown !== undefined && i.crown > 0 ? i.crown : null;
  const layers: GlassLayer[] = [];
  if (body < 1)
    layers.push({
      kind: 'density',
      color: toHex(parseColor(i.fill)),
      stops: [
        { offset: 0, alpha: 0 },
        { offset: DENSE_AT, alpha: 1 },
      ],
    });
  if (r.shade !== null)
    layers.push({
      kind: 'shade',
      // a light body deepens in its own hue; a dark one toward the page — a light hue would LIFT it
      color: toHex(parseColor(r === LIT ? i.hue : i.palette.page)),
      stops: [
        { offset: 0, alpha: 0 },
        { offset: 1, alpha: r.shade },
      ],
    });
  layers.push({
    kind: 'sheen',
    color: light,
    stops: [
      { offset: 0, alpha: r.sheen.top },
      { offset: SHEEN_MID, alpha: r.sheen.mid },
      { offset: 1, alpha: 0 },
    ],
  });
  layers.push({
    kind: 'rim',
    color: light,
    stops: [
      { offset: 0, alpha: r.rim.top },
      { offset: RIM_SIDE_FROM, alpha: r.rim.side },
      { offset: RIM_SIDE_TO, alpha: r.rim.side },
      { offset: 1, alpha: r.rim.foot },
    ],
  });
  const key = [
    body,
    crown ?? '-',
    ...layers.map(
      l => `${l.kind}:${l.color}:${l.stops.map(s => `${s.offset}/${s.alpha}`).join(',')}`,
    ),
  ].join('|');
  return { body, crown, layers, key };
}

/* ------------------------------------------------------------------------- the geometry */

/** The rim's width, in points: one, as the edge outside it is. */
export const GLASS_RIM = 1;
/** The line of clear body between the rim and the sheen, so the rim reads as a line. */
export const GLASS_SHEEN_GAP = 1.5;
/**
 * How far the sheen reaches down: to the middle of the tile at most, never past its `crown`, and
 * never more than `GLASS_REACH_MAX` points — light caught by an edge falls off within a finger's
 * width whatever the tile's height (skins.ts SPECULAR_DEPTH, the same 40).
 */
export const GLASS_REACH_MAX = 40;

/** The tile's outline, its edge, and the band along its bottom that holds no word. */
export interface GlassRoom {
  /** The outline's corner radius (a pill's 999 is fine: it is clamped to the box). */
  radius: number;
  /** The width of the tile's own edge, which the drawing covers and the layers start inside. */
  edge: number;
  /** The band along the bottom, inside the edge, that holds no word: where the shade lives. */
  foot: number;
}

/** One shape of the drawing, in the drawing's own points: a rounded rect, filled or stroked. */
export interface GlassShape {
  kind: Exclude<GlassLayerKind, 'density'>;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Its corner radius, concentric with the tile's. */
  r: number;
  /** A stroke this wide, or 0 for a fill. */
  stroke: number;
  color: string;
  /** Where its vertical ramp runs, top to bottom; before and after it, the end stops hold. */
  y1: number;
  y2: number;
  stops: readonly GlassStop[];
}

/**
 * The drawing for a tile `width` × `height`. The density is not in it: it is a fraction of the
 * height and needs no size (`TileGlass.tsx`). Every shape is the tile's whole outline inset and
 * concentric with it, so nothing reaches past the edge and no shape needs a clip of its own; a
 * shape's ramp holds its end stops beyond its run, which is how the shade colors the foot band and
 * nothing above it, and the sheen the crown and nothing below it. Empty when the tile is too small
 * to hold the rim and a sheen.
 */
export function tileGlassShapes(
  glass: TileGlassSpec,
  width: number,
  height: number,
  room: GlassRoom,
): GlassShape[] {
  const { edge } = room;
  const inner = edge + GLASS_RIM + GLASS_SHEEN_GAP;
  if (!(width > 2 * inner + 1) || !(height > 2 * inner + 1)) return [];
  // the outline's radius, as a box this size can draw it: a pill's 999 is half its height
  const R = Math.max(0, Math.min(room.radius, width / 2, height / 2));
  const box = (inset: number) => ({
    x: inset,
    y: inset,
    width: width - 2 * inset,
    height: height - 2 * inset,
    r: Math.max(0, R - inset),
  });
  const sheenTo = Math.min(
    inner + GLASS_REACH_MAX,
    height / 2,
    glass.crown === null ? Infinity : edge + glass.crown,
  );
  const footTop = height - edge - Math.max(0, room.foot);
  const out: GlassShape[] = [];
  for (const layer of glass.layers) {
    if (layer.kind === 'shade') {
      if (!(room.foot > 0)) continue;
      // the whole outline inside the edge, colored only in the foot band: above the band's top the
      // ramp's first stop (nothing) holds, so the band follows the tile's own bottom corners
      out.push({
        kind: 'shade',
        ...box(edge),
        stroke: 0,
        color: layer.color,
        y1: footTop,
        y2: height - edge,
        stops: layer.stops,
      });
    } else if (layer.kind === 'sheen') {
      if (!(sheenTo > inner + 1)) continue;
      out.push({
        kind: 'sheen',
        ...box(inner),
        stroke: 0,
        color: layer.color,
        y1: inner,
        y2: sheenTo,
        stops: layer.stops,
      });
    } else if (layer.kind === 'rim') {
      // a stroke centred half its width inside the edge, so all of it falls inside
      out.push({
        kind: 'rim',
        ...box(edge + GLASS_RIM / 2),
        stroke: GLASS_RIM,
        color: layer.color,
        y1: edge,
        y2: height - edge,
        stops: layer.stops,
      });
    }
  }
  return out;
}

/* --------------------------------------------------------------- what a word sits on */

/** A layer's strongest stop. */
const peakOf = (
  glass: TileGlassSpec,
  kind: GlassLayerKind,
): { color: string; alpha: number } | null => {
  const l = glass.layers.find(x => x.kind === kind);
  return l ? { color: l.color, alpha: Math.max(...l.stops.map(s => s.alpha)) } : null;
};

/**
 * What a tile is over `ground`, at the four places that matter to a word, each at its worst:
 *
 *   - `thin`  — the body where it is thinnest (a pebble's top; the whole tint everywhere else);
 *   - `top`   — the same under the sheen at its brightest: where a name can sit, and nothing else;
 *   - `whole` — the whole tint, nothing of the glass over it: where every other word sits;
 *   - `foot`  — the whole tint under the shade at its deepest, where no word sits.
 *
 * The rim is left out: it is a line inside the edge, and every word is a tile's padding in from it.
 */
export function tileGlassGrounds(
  glass: TileGlassSpec,
  fill: string,
  ground: string,
): { thin: string; top: string; whole: string; foot: string } {
  const thin = composite(ground, fill, glass.body);
  const whole = composite(ground, fill, 1);
  const sheen = peakOf(glass, 'sheen');
  const shade = peakOf(glass, 'shade');
  return {
    thin,
    top: sheen ? composite(thin, sheen.color, sheen.alpha) : thin,
    whole,
    foot: shade ? composite(whole, shade.color, shade.alpha) : whole,
  };
}
