import { describe, expect, it } from 'vitest';
import { CAPSULE_LABEL } from '../components/quickCapsule';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  QUICK_SHAPES,
  resolveAppearance,
  SCHEME_NAMES,
  type QuickShape,
} from './appearance';
import {
  AA_GRAPHIC,
  AA_TEXT,
  composite,
  contrastRatio,
  luminance,
  parseColor,
  toHex,
} from './contrast';
import { groundComposites, patternComposites } from './ground';
import {
  materialBase,
  SKIN_NAMES,
  SKINS,
  SURFACE_ALPHA_WITHOUT_BLUR,
  surfaceAlphaFor,
  TINT_EDGE,
  type SkinName,
} from './skins';
import {
  discFor,
  moduleColor,
  moduleDisc,
  space,
  themeNames,
  type Palette,
  type ThemeName,
} from './theme';
import {
  DENSE_AT,
  GLASS_REACH_MAX,
  GLASS_RIM,
  GLASS_SHEEN_GAP,
  glassLight,
  tileGlass,
  tileGlassGrounds,
  tileGlassShapes,
  type GlassRoom,
  type TileGlassSpec,
} from './tileGlass';

/**
 * THE LIQUID GLASS OF A LOG TILE ON ANDROID (the owner, 2026-10-01: *"make the liquid glass effect
 * inside each the border of the quick log modules"*), held in node: where it is drawn and where it
 * is not, how many layers and in what order, that every shape stays inside the tile's edge and clear
 * of its words, that every word on a tile keeps its contrast over it in every scheme and theme, and
 * that it can be SEEN — the report was that it could not. There is no renderer here; the device pass
 * (a Samsung in Expo Go) is still owed, and the report says what only it can confirm.
 */

/** sRGB → CIE Lab → ΔE76, as ground.test.ts has it: twelve lines rather than a dependency. */
const toLab = (hex: string): [number, number, number] => {
  const c = parseColor(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = [lin(c.r), lin(c.g), lin(c.b)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f((0.2126 * r + 0.7152 * g + 0.0722 * b) / 1.0);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE76 = (a: string, b: string): number => {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
};
/** The just-noticeable difference ground.test.ts holds every tile to. */
const JND = 2.3;

const resolved = (skin: SkinName, scheme: string, theme: ThemeName) =>
  resolveAppearance(
    { ...DEFAULT_APPEARANCE, skin, scheme: scheme as never, theme },
    'light',
    PLUS_APPEARANCE,
  );

interface Tile {
  name: string;
  fg: string;
  soft: string;
}
/** Every category a tile can wear (each role once), and More, which is neutral. */
const tilesOf = (c: Palette): Tile[] => [
  ...[...new Set(Object.values(moduleColor))].map(role => ({
    name: role,
    fg: c[role],
    soft: c[`${role}Soft` as keyof Palette],
  })),
  { name: 'more', fg: c.text2, soft: c.surface2 },
];

/** A bubble's disc, exactly as QuickAction paints it: the owner's swatch, or the whole tint. */
const discsOf = (c: Palette, theme: ThemeName) =>
  (Object.keys(moduleDisc) as (keyof typeof moduleDisc)[]).map(m => {
    const role = moduleColor[m as keyof typeof moduleColor];
    const soft = c[`${role}Soft` as keyof Palette];
    return { name: m, fg: c[role], disc: discFor(m, theme) ?? composite(c.app, soft, 1) };
  });

/**
 * Every ground a tile floats on: the plain grounds, the lit ground's washes, orbs and motif bands,
 * and the doodle pattern over both — and, for the name alone, the no-blur card over each of them,
 * which is where the Appearance sheet's Glass picture (`DesignSample`) draws its tiles.
 */
const groundsOf = (c: Palette, a: ReturnType<typeof resolved>, theme: ThemeName) => {
  const page: Record<string, string> = {
    app: c.app,
    app2: c.app2,
    page: c.page,
    pageWarm: c.pageWarm,
    pageCool: c.pageCool,
  };
  for (const [k, v] of Object.entries(groundComposites(c, a.skinTokens) ?? {}))
    if (!k.startsWith('surfaceOn') && !k.startsWith('accentSoftOn')) page[k] = v;
  Object.assign(page, patternComposites(c, a.skinTokens, theme) ?? {});
  const card: Record<string, string> = {};
  for (const [k, v] of Object.entries(page))
    card[`card over ${k}`] = composite(
      v,
      materialBase(c, a.skinTokens.surface),
      surfaceAlphaFor(a.skinTokens.surface, false),
    );
  return { page, card };
};

const glassFor = (
  theme: ThemeName,
  c: Palette,
  shape: QuickShape,
  fill: string,
  hue: string,
  crown?: number,
): TileGlassSpec =>
  tileGlass({
    skin: 'glass',
    theme,
    platform: 'android',
    shape,
    palette: c,
    fill,
    hue,
    ...(crown === undefined ? {} : { crown }),
  })!;

/** A capsule's crown as QuickAction hands it in: its top padding and its name's first line. */
const capsuleCrown = (nameLine: number) => space.sm + nameLine;
/** The smallest line a capsule's name is ever set on: its floor size at its own ratio. */
const NAME_FLOOR_LINE = CAPSULE_LABEL.floor * (CAPSULE_LABEL.lineHeight / CAPSULE_LABEL.size);

describe('where the glass is drawn: Android’s Glass, and nowhere else', () => {
  it('draws nothing on the iPhone or on Paper — every skin, theme, scheme, shape and tile', () => {
    let checks = 0;
    const drawn: string[] = [];
    for (const skin of SKIN_NAMES)
      for (const scheme of SCHEME_NAMES)
        for (const theme of themeNames) {
          const c = resolved(skin, scheme, theme).palette;
          for (const tile of tilesOf(c))
            for (const shape of QUICK_SHAPES)
              for (const platform of ['ios', 'web', 'android']) {
                checks++;
                const g = tileGlass({
                  skin,
                  theme,
                  platform,
                  shape,
                  palette: c,
                  fill: tile.soft,
                  hue: tile.fg,
                });
                const should = platform === 'android' && skin === 'glass';
                if ((g !== null) !== should)
                  drawn.push(`${platform}/${skin}/${scheme}/${theme}/${shape}/${tile.name}`);
              }
        }
    const tiles = tilesOf(resolved('glass', 'ocean', 'light').palette).length;
    expect(checks).toBe(SKIN_NAMES.length * SCHEME_NAMES.length * themeNames.length * tiles * 9);
    expect(drawn).toEqual([]);
  });

  it('reads the material actually painted, so the iPhone’s blur and Paper’s flat tile keep their numbers', () => {
    // the spec is null there, and Surface then takes `tintAlphaFor` exactly as before (interaction.test.ts)
    expect(SKINS.paper.surface.blur).toBe(0);
    expect(SKINS.glass.surface.blur).toBeGreaterThan(0);
    const c = resolved('glass', 'ocean', 'light').palette;
    for (const shape of QUICK_SHAPES)
      expect(
        tileGlass({
          skin: 'glass',
          theme: 'light',
          platform: 'ios',
          shape,
          palette: c,
          fill: c.feedSoft,
          hue: c.feed,
        }),
      ).toBeNull();
  });
});

describe('a fixed, small number of layers, in paint order', () => {
  it('pebble: density, shade, sheen, rim; capsule and bubble: shade, sheen, rim; Night: sheen and rim', () => {
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames) {
        const c = resolved('glass', scheme, theme).palette;
        for (const tile of tilesOf(c))
          for (const shape of QUICK_SHAPES) {
            const g = glassFor(theme, c, shape, tile.soft, tile.fg);
            const kinds = g.layers.map(l => l.kind);
            const want =
              theme === 'night'
                ? ['sheen', 'rim']
                : shape === 'pebble'
                  ? ['density', 'shade', 'sheen', 'rim']
                  : ['shade', 'sheen', 'rim'];
            expect(kinds, `${scheme}/${theme}/${shape}/${tile.name}`).toEqual(want);
            // and the drawing that is not the density is three shapes at most, one SVG
            const shapes = tileGlassShapes(g, 112, 117, { radius: 27, edge: 1, foot: 11 });
            expect(shapes.length).toBeLessThanOrEqual(3);
            expect(shapes.map(s => s.kind)).toEqual(kinds.filter(k => k !== 'density'));
          }
      }
  });

  it('lets the ground through a pebble’s top at the no-blur panel’s own alpha, and keeps every other body whole', () => {
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames) {
        const c = resolved('glass', scheme, theme).palette;
        for (const tile of tilesOf(c)) {
          const pebble = glassFor(theme, c, 'pebble', tile.soft, tile.fg);
          const want = theme === 'night' ? 1 : theme === 'light' ? SURFACE_ALPHA_WITHOUT_BLUR : 0.8;
          expect(pebble.body, `${scheme}/${theme}/${tile.name}`).toBe(want);
          expect(glassFor(theme, c, 'capsule', tile.soft, tile.fg, 22).body).toBe(1);
        }
        for (const d of discsOf(c, theme))
          expect(glassFor(theme, c, 'bubble', d.disc, d.fg, 13).body).toBe(1);
      }
  });
});

describe('the alpha is in the colors, and every ramp is a fall-off', () => {
  const all = (): [string, TileGlassSpec][] =>
    SCHEME_NAMES.flatMap(scheme =>
      themeNames.flatMap(theme => {
        const c = resolved('glass', scheme, theme).palette;
        return QUICK_SHAPES.flatMap(shape =>
          tilesOf(c).map(
            t =>
              [
                `${scheme}/${theme}/${shape}/${t.name}`,
                glassFor(theme, c, shape, t.soft, t.fg),
              ] as [string, TileGlassSpec],
          ),
        );
      }),
    );

  it('paints every layer in one opaque color with its strength in the stops', () => {
    for (const [where, g] of all())
      for (const l of g.layers) {
        expect(l.color, where).toMatch(/^#[0-9A-F]{6}$/);
        const offsets = l.stops.map(s => s.offset);
        expect(
          [...offsets].sort((a, b) => a - b),
          where,
        ).toEqual(offsets);
        for (const s of l.stops) {
          expect(s.offset).toBeGreaterThanOrEqual(0);
          expect(s.offset).toBeLessThanOrEqual(1);
          expect(s.alpha).toBeGreaterThanOrEqual(0);
          expect(s.alpha).toBeLessThanOrEqual(1);
        }
      }
  });

  it('falls away from the top in a sheen with no plateau and no shoulder, to nothing', () => {
    for (const [where, g] of all()) {
      const sheen = g.layers.find(l => l.kind === 'sheen')!;
      const a = sheen.stops.map(s => s.alpha);
      for (let i = 1; i < a.length; i++) expect(a[i]!, where).toBeLessThan(a[i - 1]!);
      expect(a[a.length - 1]).toBe(0);
      // each step falls less than the one before it: an ease-out, never a ramp with a corner in it
      const slope = (i: number) =>
        (a[i - 1]! - a[i]!) / (sheen.stops[i]!.offset - sheen.stops[i - 1]!.offset);
      expect(slope(1)).toBeGreaterThan(slope(2));
    }
  });

  it('makes a pebble’s body whole by the middle, and lights its rim brightest along the top', () => {
    for (const [where, g] of all()) {
      const density = g.layers.find(l => l.kind === 'density');
      if (density) {
        expect(density.stops.at(-1), where).toEqual({ offset: DENSE_AT, alpha: 1 });
        expect(density.stops[0]!.alpha).toBe(0);
        expect(DENSE_AT).toBeLessThanOrEqual(0.5);
      }
      const rim = g.layers.find(l => l.kind === 'rim')!.stops.map(s => s.alpha);
      expect(rim[0], where).toBe(Math.max(...rim));
      expect(Math.min(...rim)).toBe(rim[1]);
      expect(rim.at(-1)!).toBeGreaterThanOrEqual(rim[1]!);
    }
  });
});

describe('which light a body carries is the body’s, and Night keeps it dim', () => {
  it('lights a pastel body white — a bubble’s swatch in dark too — and a dark one with a fraction of it', () => {
    const light = resolved('glass', 'ocean', 'light').palette;
    const dark = resolved('glass', 'ocean', 'dark').palette;
    const sheenTop = (g: TileGlassSpec) => g.layers.find(l => l.kind === 'sheen')!.stops[0]!;
    // a dark tint in dark: the dim recipe, white at a fraction
    const dim = glassFor('dark', dark, 'pebble', dark.feedSoft, dark.feed);
    expect(sheenTop(dim).alpha).toBeLessThanOrEqual(0.14);
    expect(dim.layers.find(l => l.kind === 'sheen')!.color).toBe('#FFFFFF');
    // the swatch is the same pastel in dark: it carries the light a pastel does
    const disc = discFor('bottle', 'dark')!;
    expect(luminance(disc)).toBeGreaterThan(0.5);
    expect(sheenTop(glassFor('dark', dark, 'bubble', disc, dark.feed, 13)).alpha).toBe(
      sheenTop(glassFor('light', light, 'pebble', light.feedSoft, light.feed)).alpha,
    );
    // a light body deepens in its own hue, a dark one toward the page
    expect(
      glassFor('light', light, 'pebble', light.sleepSoft, light.sleep).layers[1],
    ).toMatchObject({
      kind: 'shade',
      color: toHex(parseColor(light.sleep)),
    });
    expect(dim.layers[1]).toMatchObject({ kind: 'shade', color: toHex(parseColor(dark.page)) });
  });

  it('in Night: the night line’s amber, no shade, no translucency, and no more light than the prototype’s night tile', () => {
    for (const scheme of SCHEME_NAMES) {
      const c = resolved('glass', scheme, 'night').palette;
      expect(glassLight(c, 'night')).toBe(toHex(parseColor(c.line)));
      for (const tile of tilesOf(c))
        for (const shape of QUICK_SHAPES) {
          const g = glassFor('night', c, shape, tile.soft, tile.fg);
          expect(g.body).toBe(1);
          expect(g.layers.some(l => l.kind === 'shade' || l.kind === 'density')).toBe(false);
          const sheen = g.layers.find(l => l.kind === 'sheen')!;
          const rim = g.layers.find(l => l.kind === 'rim')!;
          // prototype/ui-prototype.html, the night `.qa`: rgba(214,167,96,.10) falling away, inset .12
          expect(Math.max(...sheen.stops.map(s => s.alpha))).toBeLessThanOrEqual(0.1);
          expect(Math.max(...rim.stops.map(s => s.alpha))).toBeLessThanOrEqual(0.12);
          expect(sheen.color).toBe(toHex(parseColor(c.line)));
        }
    }
  });
});

describe('the geometry: inside the tile’s own edge, and clear of its words', () => {
  const c = resolved('glass', 'ocean', 'light').palette;
  const pebble = glassFor('light', c, 'pebble', c.feedSoft, c.feed);

  const inside = (g: TileGlassSpec, w: number, h: number, room: GlassRoom, where: string) => {
    const R = Math.min(room.radius, w / 2, h / 2);
    for (const s of tileGlassShapes(g, w, h, room)) {
      const half = s.stroke / 2;
      expect(s.x - half, `${where} ${s.kind}`).toBeGreaterThanOrEqual(room.edge - 1e-9);
      expect(s.y - half).toBeGreaterThanOrEqual(room.edge - 1e-9);
      expect(s.x + s.width + half).toBeLessThanOrEqual(w - room.edge + 1e-9);
      expect(s.y + s.height + half).toBeLessThanOrEqual(h - room.edge + 1e-9);
      // concentric with the tile's own corner, and a radius the box can draw
      expect(s.r).toBeCloseTo(Math.max(0, R - s.x), 9);
      expect(s.r).toBeLessThanOrEqual(Math.min(s.width, s.height) / 2 + 1e-9);
    }
  };

  it('keeps every shape inside the edge, concentric with it, at every shape and edge width', () => {
    // a pebble (Glass's `l` radius and its 1 pt edge, the wrapper's radius as Surface hands it in),
    // the same with its 2 pt alert ring, a capsule (a pill), and a bubble inside its ring
    inside(pebble, 112.67, 117, { radius: 27, edge: 1, foot: 11 }, 'pebble');
    inside(pebble, 112.67, 117, { radius: 28, edge: 2, foot: 11 }, 'pebble, alert');
    const capsule = glassFor('light', c, 'capsule', c.feedSoft, c.feed, capsuleCrown(19));
    inside(capsule, 170, 50, { radius: 999, edge: 1, foot: space.sm }, 'capsule');
    inside(capsule, 170, 82, { radius: 999, edge: 1, foot: space.sm }, 'capsule, two rows');
    const bubble = glassFor('light', c, 'bubble', discFor('bottle', 'light')!, c.feed, 13);
    inside(bubble, 70, 70, { radius: 36, edge: 0, foot: 13 }, 'bubble');
  });

  it('draws the rim as one point of light just inside the edge', () => {
    const rim = tileGlassShapes(pebble, 112, 117, { radius: 27, edge: 1, foot: 11 }).find(
      s => s.kind === 'rim',
    )!;
    expect(rim.stroke).toBe(GLASS_RIM);
    expect(rim.x - rim.stroke / 2).toBe(1);
    expect(rim.r).toBe(27 - 1 - GLASS_RIM / 2);
  });

  it('puts the shade in the foot band and nothing above it, and the sheen on the top and nothing past it', () => {
    for (const [w, h, room] of [
      [112, 117, { radius: 27, edge: 1, foot: 11 }],
      [112, 91, { radius: 28, edge: 2, foot: 11 }],
      [170, 50, { radius: 999, edge: 1, foot: 6 }],
    ] as [number, number, GlassRoom][]) {
      const shapes = tileGlassShapes(pebble, w, h, room);
      const shade = shapes.find(s => s.kind === 'shade')!;
      expect(shade.y1).toBe(h - room.edge - room.foot);
      expect(shade.y2).toBe(h - room.edge);
      // the first stop is nothing, and it holds above the band
      expect(shade.stops[0]).toEqual({ offset: 0, alpha: 0 });
      const sheen = shapes.find(s => s.kind === 'sheen')!;
      expect(sheen.y1).toBe(room.edge + GLASS_RIM + GLASS_SHEEN_GAP);
      expect(sheen.y2).toBeLessThanOrEqual(h / 2);
      expect(sheen.y2 - sheen.y1).toBeLessThanOrEqual(GLASS_REACH_MAX);
      expect(sheen.stops.at(-1)!.alpha).toBe(0);
    }
  });

  it('a pebble: the sheen and the thin body end above its name, which sits under its 44 pt picture', () => {
    // QuickAction: `paddingVertical: space.lg`, the 44 pt holder, then `gap: space.sm` to the name
    const nameTop = (edge: number) => edge + space.lg + 44 + space.sm;
    for (const h of [91, 117, 149]) {
      for (const edge of [1, 2]) {
        const sheen = tileGlassShapes(pebble, 112, h, { radius: 27, edge, foot: space.lg }).find(
          s => s.kind === 'sheen',
        )!;
        expect(sheen.y2, `${h}/${edge}`).toBeLessThanOrEqual(nameTop(edge));
      }
    }
    // the density is whole by the middle; the name is at the middle or below at every height a
    // pebble is drawn at (the shortest, More with no line, is 91 pt: 61 / 91)
    expect(DENSE_AT * 117).toBeLessThanOrEqual(nameTop(1));
  });

  it('a capsule: the sheen ends where its second line can begin, at its largest and its smallest name', () => {
    for (const nameLine of [NAME_FLOOR_LINE, 19, 19 * 1.6])
      for (const h of [50, 60, 82, 106]) {
        const g = glassFor('light', c, 'capsule', c.feedSoft, c.feed, capsuleCrown(nameLine));
        const sheen = tileGlassShapes(g, 170, h, { radius: 999, edge: 1, foot: space.sm }).find(
          s => s.kind === 'sheen',
        );
        // the second line begins under the name's first line, which begins under the top padding —
        // a count wrapped under the line lifts the line no higher than that
        if (sheen)
          expect(sheen.y2, `${nameLine}/${h}`).toBeLessThanOrEqual(1 + space.sm + nameLine + 1e-9);
      }
    // and the crown is never below the floor's line: QuickAction hands in the name's own line
    expect(NAME_FLOOR_LINE).toBeCloseTo(16.08, 2);
  });

  it('a bubble: the sheen above its picture and the shade below it, so nothing under the picture changes', () => {
    const disc = discFor('bottle', 'light')!;
    for (const ring of [1, 2.5]) {
      const d = 72 - 2 * ring;
      const band = (72 - 2 * ring - 44) / 2;
      const g = glassFor('light', c, 'bubble', disc, c.feed, band);
      const shapes = tileGlassShapes(g, d, d, { radius: 36, edge: 0, foot: band });
      const pictureTop = (d - 44) / 2;
      const pictureBottom = (d + 44) / 2;
      expect(shapes.find(s => s.kind === 'sheen')!.y2, `ring ${ring}`).toBeLessThanOrEqual(
        pictureTop,
      );
      expect(shapes.find(s => s.kind === 'shade')!.y1).toBeGreaterThanOrEqual(pictureBottom - 1e-9);
      // the disc itself is never thinned
      expect(g.body).toBe(1);
    }
  });

  it('clamps a pill’s 999 to half its height, and draws nothing in a box too small to hold it', () => {
    const capsule = glassFor('light', c, 'capsule', c.feedSoft, c.feed, 22);
    const rim = tileGlassShapes(capsule, 170, 50, { radius: 999, edge: 1, foot: 6 }).find(
      s => s.kind === 'rim',
    )!;
    expect(rim.r).toBe(25 - 1.5);
    expect(tileGlassShapes(capsule, 6, 6, { radius: 999, edge: 1, foot: 2 })).toEqual([]);
  });
});

describe('every word on a tile, over the glass, in every scheme and theme', () => {
  /*
    THE NAME is the one word that may sit on the glass itself: measured where the body is thinnest,
    under the sheen at its brightest, on the whole tint and over the deepest shade, on every ground —
    the cards of the Appearance sheet's picture included. THE LINE's ink (text2) is measured there too,
    as if it reached the glass (it never does: a pebble keeps it in its pill, a capsule under its
    crown), as PlaceRim measures its inks. THE DUE AND LATE WORDS sit on the whole tint with nothing
    of the glass over it, so their ground is the tint the tile always had — the same composite, which
    is asserted rather than assumed — and a pebble's alert RING, drawn over the glass, still clears 3:1
    against the body inside it.
  */
  const failures: string[] = [];
  let checks = 0;
  const check = (what: string, fg: string, bg: string, min: number) => {
    checks++;
    const v = contrastRatio(fg, bg);
    if (v < min) failures.push(`${what} = ${v.toFixed(2)}:1 (min ${min})`);
  };
  for (const scheme of SCHEME_NAMES)
    for (const theme of themeNames) {
      const a = resolved('glass', scheme, theme);
      const c = a.palette;
      const { page, card } = groundsOf(c, a, theme);
      for (const tile of tilesOf(c))
        for (const shape of ['pebble', 'capsule'] as const) {
          const g = glassFor(
            theme,
            c,
            shape,
            tile.soft,
            tile.fg,
            shape === 'capsule' ? 22 : undefined,
          );
          for (const [gn, ground] of Object.entries({ ...page, ...card })) {
            const at = tileGlassGrounds(g, tile.soft, ground);
            const where = `${scheme}/${theme} ${shape} ${tile.name} on ${gn}`;
            for (const p of ['thin', 'top', 'whole', 'foot'] as const)
              check(`the name (text) at ${p}, ${where}`, c.text, at[p], AA_TEXT);
            if (gn in card) continue;
            for (const p of ['thin', 'top', 'whole', 'foot'] as const)
              check(`the line (text2) at ${p}, ${where}`, c.text2, at[p], AA_TEXT);
            // the due and late words' ground is the tint itself, exactly
            expect(at.whole, where).toBe(composite(ground, tile.soft, 1));
            if (shape === 'pebble')
              for (const ring of ['warn', 'crit'] as const)
                for (const p of ['thin', 'top', 'whole'] as const)
                  check(`the ${ring} ring against ${p}, ${where}`, c[ring], at[p], AA_GRAPHIC);
          }
        }
    }

  it(`clears every floor (${checks} checks)`, () => {
    // a floor near the real count, so the matrix cannot quietly stop running
    expect(checks).toBeGreaterThan(40_000);
    expect(failures).toEqual([]);
  });
});

describe('a tile is still an object on its ground, and its glass can be seen', () => {
  it('holds a pebble’s thin top a just-noticeable difference off every ground, by its fill or its edge', () => {
    const failures: string[] = [];
    let worst = Infinity;
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames) {
        const a = resolved('glass', scheme, theme);
        const c = a.palette;
        for (const tile of tilesOf(c)) {
          const g = glassFor(theme, c, 'pebble', tile.soft, tile.fg);
          const edge = composite(tile.soft, tile.fg, TINT_EDGE);
          for (const [gn, ground] of Object.entries(groundsOf(c, a, theme).page)) {
            const { thin } = tileGlassGrounds(g, tile.soft, ground);
            const d = Math.max(deltaE76(thin, ground), deltaE76(edge, ground));
            worst = Math.min(worst, d);
            if (d < JND)
              failures.push(`${scheme}/${theme} ${tile.name} on ${gn}: ΔE ${d.toFixed(2)}`);
          }
        }
      }
    expect(failures, `weakest ΔE ${worst.toFixed(2)}`).toEqual([]);
  });

  it('lights the top and deepens the foot by more than the eye can miss, in light and in dark', () => {
    // the owner's report, as a number: "don't look too glassy" was a tile with nothing on it to see
    const faint: string[] = [];
    for (const scheme of SCHEME_NAMES)
      for (const theme of ['light', 'dark'] as const) {
        const c = resolved('glass', scheme, theme).palette;
        for (const tile of tilesOf(c))
          for (const shape of ['pebble', 'capsule'] as const) {
            const g = glassFor(
              theme,
              c,
              shape,
              tile.soft,
              tile.fg,
              shape === 'capsule' ? 22 : undefined,
            );
            const at = tileGlassGrounds(g, tile.soft, c.app);
            const rim = g.layers.find(l => l.kind === 'rim')!;
            const rimTop = composite(at.whole, rim.color, rim.stops[0]!.alpha);
            const where = `${scheme}/${theme} ${shape} ${tile.name}`;
            if (deltaE76(at.top, at.whole) < JND) faint.push(`${where}: the sheen`);
            if (deltaE76(at.foot, at.whole) < JND) faint.push(`${where}: the shade`);
            if (deltaE76(rimTop, at.whole) < JND) faint.push(`${where}: the rim`);
          }
        for (const d of discsOf(c, theme)) {
          const g = glassFor(theme, c, 'bubble', d.disc, d.fg, 13);
          const at = tileGlassGrounds(g, d.disc, c.app);
          if (deltaE76(at.top, d.disc) < JND)
            faint.push(`${scheme}/${theme} bubble ${d.name}: the sheen`);
        }
      }
    expect(faint).toEqual([]);
  });

  it('in light, sets a lit inner rim against a darker outer edge: the edge of a piece of glass', () => {
    for (const scheme of SCHEME_NAMES) {
      const c = resolved('glass', scheme, 'light').palette;
      for (const tile of tilesOf(c)) {
        const g = glassFor('light', c, 'pebble', tile.soft, tile.fg);
        const rim = g.layers.find(l => l.kind === 'rim')!;
        const lit = composite(tile.soft, rim.color, rim.stops[0]!.alpha);
        const edge = composite(tile.soft, tile.fg, TINT_EDGE);
        expect(luminance(lit), `${scheme} ${tile.name}`).toBeGreaterThan(luminance(edge));
      }
    }
  });
});
