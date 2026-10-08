/**
 * THE DUE AND LATE WORDS ON A LOG TILE, at 4.5:1 wherever they land (the Glass review,
 * 2026-10-01). They were set in the alert tokens themselves, `warn` and `crit`, which are tuned to
 * be seen as a RING (3:1) on any tint. As words they fell short in three places: a pebble keeps
 * them in a pill tinted with their own alert color, which pulls the ground toward the ink (a late
 * word read 3.55:1 there in the light theme, on every tint); a capsule sets them on its tint, which
 * on an iPhone is 55% over the blurred page (4.12:1 over the sleep band); and a bubble sets them on
 * the page itself (3.79:1 over the same band). Dark and Night pills were short too.
 *
 * THE HUE STAYS. The word is the alert color taken toward black (toward white on a dark ground) in
 * small steps, only as far as its worst ground needs: scaling a color toward either end keeps its
 * hue, so a late word is still red and a due word still amber, just deeper where it has to be.
 * Where the token already clears every ground it lands on, it is the token, untouched.
 *
 * Pure: no React, no React Native, so `tileAlertInk.test.ts` holds it over every skin, scheme,
 * theme, tint, shape and platform.
 */
import { AA_TEXT, composite, contrastRatio } from './contrast';
import { groundComposites, patternComposites } from './ground';
import { tintAlphaFor, type SkinTokens } from './skins';
import type { Palette, ThemeName } from './theme';

/** How much of the alert color a pebble's pill carries under a due or late word. */
export const ALERT_PILL_ALPHA = 0.16;

/** 2% a step: fine enough that the word is never deeper than its ground needs by much. */
const STEPS = 50;

/**
 * `ink` when it clears `floor` on every one of `grounds`; otherwise the same hue taken toward
 * black or white (whichever end reads better on these grounds) by the fewest steps that clear it.
 * Every ground must be opaque: composite a translucent one over what it sits on first.
 */
export function deepenedInk(ink: string, grounds: readonly string[], floor = AA_TEXT): string {
  const worst = (c: string) => Math.min(...grounds.map(g => contrastRatio(c, g)));
  if (grounds.length === 0 || worst(ink) >= floor) return ink;
  const end = worst('#000000') >= worst('#FFFFFF') ? '#000000' : '#FFFFFF';
  for (let step = 1; step < STEPS; step++) {
    const c = composite(ink, end, step / STEPS);
    if (worst(c) >= floor) return c;
  }
  return end;
}

/**
 * EVERY GROUND A TILE FLOATS ON, as `tileGlass.test.ts` lists them: the plain grounds, the paper,
 * the lit ground's washes, orbs and motif bands, and the doodle pattern over both. Not the
 * `surfaceOn…` layers, which are a panel over a ground already. Kept per palette and skin, since a
 * screen of tiles asks for the same list once per tile.
 */
const pageCache = new WeakMap<Palette, WeakMap<SkinTokens, readonly string[]>>();
export function pageGroundsOf(
  palette: Palette,
  skin: SkinTokens,
  theme: ThemeName,
): readonly string[] {
  const bySkin = pageCache.get(palette) ?? new WeakMap<SkinTokens, readonly string[]>();
  pageCache.set(palette, bySkin);
  const hit = bySkin.get(skin);
  if (hit) return hit;
  const grounds = new Set<string>([
    palette.app,
    palette.app2,
    palette.page,
    palette.pageWarm,
    palette.pageCool,
    palette.paper,
  ]);
  for (const [k, v] of Object.entries(groundComposites(palette, skin) ?? {}))
    if (!k.startsWith('surfaceOn') && !k.startsWith('accentSoftOn')) grounds.add(v);
  for (const v of Object.values(patternComposites(palette, skin, theme) ?? {})) grounds.add(v);
  const list = [...grounds];
  bySkin.set(skin, list);
  return list;
}

export interface TileAlertInkInput {
  /** The alert token the tile's ring wears: `warn` for due, `crit` for late. */
  ink: string;
  /** The tile's category tint. */
  soft: string;
  shape: 'bubble' | 'pebble' | 'capsule';
  palette: Palette;
  skin: SkinTokens;
  theme: ThemeName;
}

/**
 * The grounds a tile's due or late words land on, shape by shape: a pebble's pill (opaque, the
 * tint with a step of the alert color); a capsule's own body; a bubble's page, under its disc.
 *
 * A CAPSULE'S BODY IS TWO THINGS, by platform: its whole tint on Android (`Surface` keeps a tint
 * opaque where nothing blurs), and on an iPhone the tint at the skin's alpha over the blurred page.
 * Its words are held to both at once, so the tile never forks on the platform for them (it reads
 * the platform once, for its glass, and `interaction.test.ts` holds it to that).
 */
export function tileAlertGrounds(i: TileAlertInkInput): readonly string[] {
  if (i.shape === 'pebble') return [composite(i.soft, i.ink, ALERT_PILL_ALPHA)];
  if (i.shape === 'bubble') return pageGroundsOf(i.palette, i.skin, i.theme);
  const overBlur = tintAlphaFor(i.skin, true);
  if (overBlur >= 1) return [i.soft];
  return [
    i.soft,
    ...pageGroundsOf(i.palette, i.skin, i.theme).map(g => composite(g, i.soft, overBlur)),
  ];
}

/** The ink a tile's due or late words are set in: the alert hue, deep enough for its grounds. */
export const tileAlertInk = (i: TileAlertInkInput): string =>
  deepenedInk(i.ink, tileAlertGrounds(i));
