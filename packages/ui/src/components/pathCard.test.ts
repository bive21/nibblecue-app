/**
 * THE TWO WAYS IN, MEASURED — version two (`pathCard.ts`; the owner, 2026-09-26: *"the icon still
 * stays where it is, and the start feeding becomes 2 rows on the right side of the icon … inverted
 * color for … already finish"*). Two halves, the way this package tests anything a thumb touches:
 * the geometry, the layout rule, the colors and the motion are pure and walked here — every phone,
 * every text size, every theme, every scheme, every skin, the four modules that draw the pair — and
 * what only a device can show (the native driver, the still paths, the radio a screen reader hears)
 * is held by tripwires over `PathCard.tsx`, because this suite has no renderer.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { drawIllustrated } from '../icons/illustrated';
import { ICON_PATHS } from '../icons/paths';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from '../theme/contrast';
import { materialBase, SKINS, skinForTheme, type SkinName } from '../theme/skins';
import {
  hit,
  resolvePalette,
  schemes,
  space,
  themeNames,
  type Palette,
  type SchemeName,
  type ThemeName,
} from '../theme/theme';
import {
  PATH_GLYPH,
  PATH_MOTION,
  PATH_TILE,
  PATH_TITLE_CAP,
  PATH_TITLE_LINE,
  PATH_TITLE_SIZE,
  PATH_WORD_EM,
  PATH_WORD_FALLBACK_EM,
  pathPulseFrames,
  pathStill,
  pathTileColors,
  pathTileLayout,
  pathTileMinSize,
  pathTitleFits,
  pathTitleLines,
  pathTitleRoom,
  pathTitleRows,
  pathWordWidth,
  type PathKind,
  type PathModule,
} from './pathCard';

const here = dirname(fileURLToPath(import.meta.url));
/** Comments out, whitespace flattened: the component explains its rules, and a scan must not read them. */
const component = readFileSync(join(here, 'PathCard.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ');
const textSource = readFileSync(join(here, 'Text.tsx'), 'utf8');
const count = (src: string, needle: string): number => src.split(needle).length - 1;

/** The four sheets that draw the pair (Breastfeed, Sleep, Pump, Tummy time). */
const MODULES: readonly PathModule[] = ['breastfeed', 'sleep', 'pump', 'tummy'];
const KINDS: readonly PathKind[] = ['start', 'finished'];
const SCHEMES = Object.keys(schemes) as SchemeName[];
const SKIN_LIST = Object.keys(SKINS) as SkinName[];

/**
 * Every pair a sheet can show, as the copy writes them (`apps/mobile` `TIMER_PATH`, and the tummy
 * sheet's `startTimerTitle` with the household's other word). The app's own suite holds the copy
 * to this list and the widths to the TTF (`sheets.test.ts`).
 */
const PAIRS: readonly (readonly [string, string])[] = [
  ['Start feeding', 'Already finished'],
  ['Start pumping', 'Already finished'],
  ['Start sleeping', 'Already finished'],
  ['Start tummy time', 'Already finished'],
  ['Start playtime', 'Already finished'],
];

/**
 * The sheet's body on every phone the app runs on, the window less 2 × 18: the 320 pt phone, a
 * 360 dp Android, a 375 pt iPhone, a 393 pt one, and the largest.
 */
const BODIES = [284, 324, 339, 357, 394] as const;
/** The text sizes a phone offers, from Android's smallest to past the cap. */
const SCALES = [0.85, 1, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 2, 3] as const;
const GAP = space.lg;

/**
 * What the sheet around a tile is painted, every way a skin paints it: its own alpha over the page
 * where the platform blurs (iOS), opaque where it cannot (Android, `Surface.tsx`). The page under a
 * translucent sheet is taken as each ground a screen is painted on.
 */
const sheetGrounds = (p: Palette, theme: ThemeName): { skin: SkinName; ground: string }[] =>
  SKIN_LIST.flatMap(skin => {
    const sheet = skinForTheme(SKINS[skin], theme).sheet;
    const base = materialBase(p, sheet);
    return [p.paper, p.page, p.app].flatMap(under => [
      { skin, ground: composite(under, base, sheet.alpha) },
      { skin, ground: composite(under, base, 1) },
    ]);
  });

const every = themeNames.flatMap(theme =>
  SCHEMES.flatMap(scheme =>
    MODULES.flatMap(module =>
      KINDS.map(kind => {
        const palette = resolvePalette(theme, scheme);
        return {
          at: `${theme}/${scheme}/${module}/${kind}`,
          theme,
          kind,
          palette,
          c: pathTileColors(palette, module, theme, kind),
        };
      }),
    ),
  ),
);

describe('the title, on two rows beside the disc', () => {
  it('splits at the first space: the verb over what it is about, one title either way', () => {
    expect(pathTitleRows('Start feeding')).toEqual(['Start', 'feeding']);
    expect(pathTitleRows('Already finished')).toEqual(['Already', 'finished']);
    expect(pathTitleRows('Start tummy time')).toEqual(['Start', 'tummy time']);
    expect(pathTitleRows('Start playtime')).toEqual(['Start', 'playtime']);
    expect(pathTitleRows('Finished')).toEqual(['Finished']);
    for (const [a, b] of PAIRS)
      for (const title of [a, b]) expect(pathTitleRows(title).join(' ')).toBe(title);
  });

  it('knows every word the copy can put on a tile, and charges any other more than any of them', () => {
    for (const [a, b] of PAIRS)
      for (const word of `${a} ${b}`.split(' ')) expect(PATH_WORD_EM[word], word).toBeDefined();
    // the fallback is wider, a letter, than every measured word — an unmeasured word stacks sooner
    for (const [word, em] of Object.entries(PATH_WORD_EM)) {
      expect(word.length * PATH_WORD_FALLBACK_EM, word).toBeGreaterThan(em);
      expect(pathWordWidth(word, 10), word).toBeCloseTo(em * 10, 9);
    }
    expect(pathWordWidth('naps', 10)).toBeCloseTo(4 * PATH_WORD_FALLBACK_EM * 10, 9);
  });

  it('is as tall as the disc beside it: two lines of the bold body face', () => {
    const line = PATH_TITLE_SIZE * PATH_TITLE_LINE;
    expect(2 * line).toBeLessThanOrEqual(PATH_TILE.disc + 1);
    expect(2 * line).toBeGreaterThanOrEqual(PATH_TILE.disc - 3);
    // the tile a band, not a stack: under 70 pt tall where the first tile was about 90
    expect(pathTileMinSize(339, GAP, Math.ceil(line)).height).toBeLessThan(70);
  });

  it('grows with the phone’s text size only as far as chrome does', () => {
    expect(textSource).toContain(`export const CHROME_FONT_CAP = ${PATH_TITLE_CAP};`);
    expect(component).toContain('maxFontSizeMultiplier={PATH_TITLE_CAP}');
  });
});

describe('the layout, on every phone at every text size', () => {
  it('sets the title beside the disc on every phone at the phone’s own text size', () => {
    for (const body of BODIES)
      for (const pair of PAIRS)
        expect(pathTileLayout(body, GAP, 1, pair), `${body}`).toBe('beside');
  });

  it('never breaks or cuts a word: every word fits the room of the layout the pair chose', () => {
    for (const body of BODIES)
      for (const scale of SCALES)
        for (const pair of PAIRS) {
          const layout = pathTileLayout(body, GAP, scale, pair);
          const room = pathTitleRoom(body, GAP, layout);
          for (const title of pair)
            expect(pathTitleFits(title, room, scale), `${body}@${scale} ${title} ${layout}`).toBe(
              true,
            );
        }
  });

  it('decides for both tiles at once, and stacks only where a word would not fit beside', () => {
    for (const body of BODIES)
      for (const scale of SCALES)
        for (const pair of PAIRS) {
          const beside = pathTitleRoom(body, GAP, 'beside');
          const fits = pair.every(title => pathTitleFits(title, beside, scale));
          expect(pathTileLayout(body, GAP, scale, pair), `${body}@${scale}`).toBe(
            fits ? 'beside' : 'stacked',
          );
        }
    // a large text size on the narrowest phone is where it happens
    expect(pathTileLayout(284, GAP, 1.3, PAIRS[4] ?? ['', ''])).toBe('stacked');
    // and a row not yet measured is drawn the way the phone will almost always draw it
    expect(pathTileLayout(0, GAP, 3, PAIRS[0] ?? ['', ''])).toBe('beside');
  });

  it('is a whole-tile target of 44 pt or more either way, in either layout', () => {
    const line = Math.ceil(PATH_TITLE_SIZE * PATH_TITLE_LINE);
    for (const body of BODIES)
      for (const layout of ['beside', 'stacked'] as const) {
        const min = pathTileMinSize(body, GAP, line, layout, 1);
        expect(min.width, `${body}`).toBeGreaterThanOrEqual(hit.min);
        expect(min.height, `${body}`).toBeGreaterThanOrEqual(hit.min);
      }
  });

  it('wraps a two-word row between its words where the room is short, and counts it', () => {
    // "Start" / "tummy" / "time" on a 360 dp phone at 1.2×: three lines, the tile a little taller
    const room = pathTitleRoom(324, GAP, 'beside');
    expect(pathTitleLines('Start tummy time', room, 1.2)).toBe(3);
    expect(pathTitleLines('Already finished', room, 1.2)).toBe(2);
    expect(pathTitleLines('Start feeding', room, 1)).toBe(2);
  });

  it('keeps the chosen ring inside the padding, so choosing moves nothing it holds', () => {
    expect(PATH_TILE.ring).toBeGreaterThanOrEqual(2 * PATH_TILE.edge.finished);
    expect(PATH_TILE.ring).toBeGreaterThan(2 * PATH_TILE.edge.start);
    expect(PATH_TILE.ring).toBeLessThan(PATH_TILE.pad);
    // what the component draws: padding = pad − border, for whichever border is on
    expect(component).toContain('padding: PATH_TILE.pad - border');
    expect(component).toContain('const border = selected ? PATH_TILE.ring : PATH_TILE.edge[kind];');
  });

  it('hangs the check on the disc’s corner, clear of the title’s room and inside the tile', () => {
    // the badge reaches past the disc by less than the gap, so it never covers the title
    expect(PATH_TILE.badgeOut + PATH_TILE.badgeCut).toBeLessThan(PATH_TILE.gap);
    // and less than the padding under it, so it stays on the tile in the stacked layout too
    expect(PATH_TILE.badgeOut + PATH_TILE.badgeCut).toBeLessThan(PATH_TILE.pad - PATH_TILE.ring);
    expect(PATH_TILE.badge).toBeGreaterThan(PATH_TILE.check);
    expect(PATH_TILE.badge).toBeLessThan(PATH_TILE.disc);
  });

  it('draws the route as a glyph the disc can paint: play to start, a clock for finished', () => {
    expect(PATH_GLYPH).toEqual({ start: 'play', finished: 'clock' });
    for (const name of [...Object.values(PATH_GLYPH), 'check' as const]) {
      expect(ICON_PATHS[name], name).toBeDefined();
      // never the owner's four-color picture, which would ignore the disc's pair
      expect(drawIllustrated(name, PATH_TILE.glyph), name).toBe(false);
      expect(drawIllustrated(name, PATH_TILE.check), name).toBe(false);
    }
    // the check marks the CHOSEN tile, so no route wears one at rest
    expect(Object.values(PATH_GLYPH)).not.toContain('check');
    expect(PATH_TILE.disc).toBeGreaterThan(PATH_TILE.glyph);
  });
});

describe('the colors, in 3 themes × 6 schemes × 3 skins, for all four modules, both routes', () => {
  it('writes the title as text, 4.5:1 on the tile', () => {
    for (const { at, c } of every) {
      expect(parseColor(c.title).a, at).toBe(1);
      expect(contrastRatio(c.title, c.ground), at).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('draws the route’s glyph 3:1 on its disc, and the disc apart from a Start tile', () => {
    for (const { at, kind, c } of every) {
      expect(contrastRatio(c.glyph, c.disc), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
      // Start's ink disc is a shape of its own on the fill; Finished's fill disc is the glyph's
      // ground, and the glyph clears the tile around it too
      if (kind === 'start')
        expect(contrastRatio(c.disc, c.ground), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
      else expect(contrastRatio(c.glyph, c.ground), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('draws the check 3:1 on its disc, the disc 3:1 on the ring that cuts it out', () => {
    for (const { at, c } of every) {
      expect(contrastRatio(c.check, c.badge), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
      expect(contrastRatio(c.badge, c.cut), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
      // the ring is the tile itself, so the badge reads as cut out of the disc, not stuck on it
      expect(c.cut, at).toBe(c.ground);
    }
  });

  it('rings the chosen tile 3:1 against the tile inside it and the sheet outside it, in every skin', () => {
    for (const { at, theme, palette, c } of every) {
      expect(contrastRatio(c.ring, c.ground), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
      for (const { skin, ground } of sheetGrounds(palette, theme))
        expect(contrastRatio(c.ring, ground), `${at}/${skin} on ${ground}`).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
    }
  });

  it('edges Already finished in the ink at rest — its tile may be the sheet’s own color', () => {
    for (const { at, kind, theme, palette, c } of every) {
      if (kind !== 'finished') continue;
      expect(c.edge, at).toBe(c.ring);
      expect(c.ground, at).toBe(palette.surfaceSolid);
      for (const { skin, ground } of sheetGrounds(palette, theme))
        expect(contrastRatio(c.edge, ground), `${at}/${skin}`).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('is the owner’s inversion: the one route’s fill and ink are the other’s ink and fill', () => {
    for (const theme of themeNames)
      for (const module of MODULES) {
        const p = resolvePalette(theme);
        const s = pathTileColors(p, module, theme, 'start');
        const f = pathTileColors(p, module, theme, 'finished');
        expect(f.disc, `${theme}/${module}`).toBe(s.ground);
        expect(f.glyph, `${theme}/${module}`).toBe(s.disc);
        expect(f.ground, `${theme}/${module}`).not.toBe(s.ground);
      }
  });

  it('paints only opaque colors, and the Start tile is the module’s own — the four are four', () => {
    for (const { at, c } of every)
      for (const v of [c.ground, c.edge, c.ring, c.disc, c.glyph, c.badge, c.check, c.cut])
        expect(parseColor(v).a, `${at}: ${v}`).toBe(1);
    for (const theme of ['light', 'dark'] as const) {
      const grounds = new Set(
        MODULES.map(m => pathTileColors(resolvePalette(theme), m, theme, 'start').ground),
      );
      expect(grounds.size, theme).toBe(MODULES.length);
    }
  });

  it('breathes in the module’s ink on Start only, and never in the amber Night', () => {
    for (const { at, theme, kind, c } of every) {
      if (theme === 'night' || kind === 'finished') expect(c.pulse, at).toBeNull();
      else expect(c.pulse, at).toBe(c.disc);
    }
  });

  it('keeps the amber Night amber: no blue in anything the tile draws', () => {
    for (const { at, theme, c } of every) {
      if (theme !== 'night') continue;
      for (const v of [c.ground, c.edge, c.ring, c.disc, c.glyph, c.badge, c.check, c.title]) {
        const { r, b } = parseColor(v);
        expect(b, `${at}: ${v}`).toBeLessThanOrEqual(r);
      }
    }
  });
});

describe('the motion', () => {
  it('is still under reduce motion and in the Night, and only there', () => {
    for (const theme of themeNames) {
      expect(pathStill(true, theme)).toBe(true);
      expect(pathStill(false, theme)).toBe(theme === 'night');
    }
  });

  it('is a small spring: a dip of a few percent that overshoots home', () => {
    expect(PATH_MOTION.pressScale).toBeGreaterThanOrEqual(0.9);
    expect(PATH_MOTION.pressScale).toBeLessThan(1);
    expect(PATH_MOTION.pressMs).toBeLessThanOrEqual(120);
    // a friction under ~7 is an underdamped spring: it passes 1 once and settles
    expect(PATH_MOTION.spring.friction).toBeLessThan(7);
    expect(PATH_MOTION.badgeFrom).toBeGreaterThan(0);
    expect(PATH_MOTION.badgeFrom).toBeLessThan(1);
  });

  it('breathes softly: a ring that grows as it fades to nothing, then rests', () => {
    const f = pathPulseFrames();
    expect(f.scale.outputRange[0]).toBe(1);
    expect(f.scale.outputRange[1]).toBe(PATH_MOTION.pulse.toScale);
    expect(f.opacity.outputRange[1]).toBe(0);
    expect(PATH_MOTION.pulse.peakOpacity).toBeLessThanOrEqual(0.5);
    // not a flash: under one breath a second, and a rest between
    expect(PATH_MOTION.pulse.ms + PATH_MOTION.pulse.restMs).toBeGreaterThanOrEqual(2000);
    expect(PATH_MOTION.pulse.restMs).toBeGreaterThan(0);
  });
});

describe('PathCard.tsx, where a device is the only witness', () => {
  it('runs every animation on the native driver', () => {
    const drivers = count(component, 'useNativeDriver: true');
    // the badge pop, the pulse, the press dip and the press spring
    expect(drivers).toBeGreaterThanOrEqual(4);
    expect(component).not.toContain('useNativeDriver: false');
  });

  it('moves nothing when still: the press, the check and the breath all ask first', () => {
    expect(component).toContain('const still = pathStill(t.reduceMotion, t.theme);');
    expect(component).toContain('if (still || disabled) return;');
    expect(component).toContain('if (!became || still) {');
    expect(component).toMatch(
      /const breathing = kind === 'start' && row\.open && !disabled && !still/,
    );
  });

  it('breathes only while neither tile is chosen, read off the tiles’ own props', () => {
    expect(component).toContain('child.props.selected');
    expect(component).toContain('{ module: moduleId, open, layout }');
    // and the ring exists only while it breathes: still or chosen, there is nothing to glow
    expect(component).toContain('{breathing && c.pulse !== null ? (');
  });

  it('lays the pair out once, from the row’s own width and the phone’s text size', () => {
    expect(component).toContain('const { fontScale } = useWindowDimensions();');
    expect(component).toContain('onLayout={onLayout}');
    expect(component).toMatch(/const layout = pathTileLayout\( width, t\.space\.lg, fontScale,/);
    expect(component).toContain('cards.map(child => child.props.title)');
    expect(component).toContain("const beside = row.layout === 'beside';");
  });

  it('paints each tile for its route', () => {
    expect(component).toContain('pathTileColors(t.color, row.module, t.theme, kind)');
  });

  it('is a radio named by its whole title, with its state — its rows unread, and felt by nothing', () => {
    expect(component).toContain('accessibilityRole="radio"');
    expect(component).toContain('accessibilityLabel={title}');
    expect(component).toContain('accessibilityState={{ checked: selected, selected, disabled }}');
    expect(component).toContain('accessibilityRole="radiogroup"');
    expect(component).toContain('importantForAccessibility="no-hide-descendants"');
    expect(component).not.toContain('haptic');
    expect(component).not.toContain('consequence');
    // the rows wrap between words and are never cut short
    expect(component).not.toMatch(/<BodyStrong[^>]*numberOfLines/);
  });

  it('keeps the pair a pair', () => {
    expect(component).toContain('PathRow takes exactly two PathCards');
  });
});
