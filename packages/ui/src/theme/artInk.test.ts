/**
 * WHICH PICTURE A THEME DRAWS, AND WHAT IS UNDER IT (2026-09-29).
 *
 * The owner's evening, from two phones in dark theme: the stash page's summary card was *"bright
 * yellow as if it was in day theme"* on one, and on the other *"the text is still dark gold color,
 * making it very hard to see"*. Both were one fault: the card drew a pale daytime picture in dark,
 * and wrote its words for that picture whatever was actually under them — the dark tint through
 * the picture's translucent paper, or the dark tint alone while the picture had not loaded.
 *
 * So there is one question, `artForTheme`, which the card asks before drawing and the screen asks
 * before choosing its inks; and a card lays its picture on the picture's own solid ground. The
 * inks themselves are measured in every skin, scheme and theme by the app's `cardArt.test.ts`,
 * over the grounds this file holds the components to drawing.
 *
 * THE SAME EVENING THE PICTURES GOT VERSIONS (the owner: *"And yes, do dark version for milk stash
 * too / And night theme as well"*): a dark one of each pale picture and a Night one of every
 * picture, which the same question hands to the theme they were drawn for.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ART_DIM_IN_DARK,
  artDimFor,
  artForTheme,
  artInkColor,
  type ArtInk,
  type CardArt,
} from './artInk';
import { paletteFor, themeNames } from './theme';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const picture = (ink: ArtInk, version?: CardArt['version']): CardArt => ({
  source: 1,
  width: 1280,
  height: 320,
  ink,
  veil: ink === 'light' && version === undefined ? 0.2 : 0,
  veilColor: '#493e26',
  veilEnd: 0.92,
  contentFraction: 0.72,
  ground: '#fde29b',
  ...(version ? { version } : {}),
});

describe('which picture a theme draws', () => {
  const pale = picture('dark');
  const saturated = picture('light');
  // the pictures as the app builds them since 2026-09-29, each with the versions drawn from it
  const darkPale = picture('light', 'dark');
  const nightPale = picture('amber', 'night');
  const nightSaturated = picture('amber', 'night');
  const paleWithVersions: CardArt = { ...pale, dark: darkPale, night: nightPale };
  const saturatedWithNight: CardArt = { ...saturated, night: nightSaturated };

  it('draws the owner’s own picture in the light theme', () => {
    expect(artForTheme(pale, 'light')).toBe(pale);
    expect(artForTheme(saturated, 'light')).toBe(saturated);
    expect(artForTheme(paleWithVersions, 'light')).toBe(paleWithVersions);
    expect(artForTheme(saturatedWithNight, 'light')).toBe(saturatedWithNight);
  });

  /**
   * A PICTURE DRAWN FOR DARK INK IS A PALE, DAYTIME ONE (the stash's gold, the shopping list's
   * green, the stash summary), and in dark it was a bright box on a dark page: dark draws its dark
   * version, and a pale picture without one draws nothing. A picture drawn for white ink (the four
   * timers') is saturated, and the owner's own in light and dark.
   */
  it('draws a pale picture’s dark version in dark, nothing without one, and a saturated one itself', () => {
    expect(artForTheme(paleWithVersions, 'dark')).toBe(darkPale);
    expect(artForTheme(pale, 'dark')).toBeNull();
    expect(artForTheme(saturated, 'dark')).toBe(saturated);
    expect(artForTheme(saturatedWithNight, 'dark')).toBe(saturatedWithNight);
  });

  /** AND NIGHT DRAWS ONLY A NIGHT VERSION, dim and amber: a picture with none draws nothing there. */
  it('draws a picture’s Night version in Night, and nothing without one', () => {
    expect(artForTheme(paleWithVersions, 'night')).toBe(nightPale);
    expect(artForTheme(saturatedWithNight, 'night')).toBe(nightSaturated);
    expect(artForTheme(pale, 'night')).toBeNull();
    expect(artForTheme(saturated, 'night')).toBeNull();
  });

  /**
   * AND IT GIVES THE SAME ANSWER WHEN ASKED AGAIN: Today's pair chooses its inks with this and hands
   * the picture it got to `Card`, which asks before drawing. A version asked about in its own theme
   * is itself, and in another theme nothing.
   */
  it('answers the same when asked about its own answer', () => {
    for (const art of [pale, saturated, paleWithVersions, saturatedWithNight])
      for (const theme of themeNames) {
        const once = artForTheme(art, theme);
        expect(artForTheme(once, theme), theme).toBe(once);
      }
    expect(artForTheme(darkPale, 'night')).toBeNull();
    expect(artForTheme(nightPale, 'dark')).toBeNull();
    expect(artForTheme(nightPale, 'light')).toBeNull();
  });

  it('draws nothing where there is nothing to draw', () => {
    for (const theme of themeNames) {
      expect(artForTheme(null, theme)).toBeNull();
      expect(artForTheme(undefined, theme)).toBeNull();
    }
  });

  /** A Night version's words are Night's own amber, the ink every other word in Night is. */
  it('writes on a Night version in the Night palette’s own text color', () => {
    expect(artInkColor('amber')).toBe(paletteFor('night').text);
  });
});

/**
 * A SLIGHTLY DEEPER PICTURE IN DARK (the owner, 2026-09-29: *"should we make a (slightly) darker
 * overlay when for the timer background on night time"*). The strength and why are `artInk.ts`'s;
 * the "z"s it is bounded by are measured over the dimmed sky in the app's `cardArtParts.test.ts`.
 */
describe('how much a picture is deepened', () => {
  it('only the owner’s own picture, only in dark, and only slightly', () => {
    const own = picture('light');
    expect(artDimFor('dark', own)).toBe(ART_DIM_IN_DARK);
    expect(ART_DIM_IN_DARK).toBeGreaterThan(0);
    expect(ART_DIM_IN_DARK).toBeLessThanOrEqual(0.25);
    // light draws the owner's picture as made
    expect(artDimFor('light', own)).toBe(0);
    // and a version is drawn at its theme's depth already: deepened again, its words would sit on
    // a ground nobody measured
    expect(artDimFor('dark', picture('light', 'dark'))).toBe(0);
    expect(artDimFor('night', picture('amber', 'night'))).toBe(0);
    for (const theme of themeNames) expect(artDimFor(theme, own)).toBeGreaterThanOrEqual(0);
  });

  it('is a layer of the picture’s own hue between the picture and the veil, never a gray film', () => {
    const layer = withoutComments(read('../components/CardArtLayer.tsx'));
    expect(layer).toContain('const dim = artDimFor(useTheme().theme, art);');
    const shade = layer.indexOf('{ backgroundColor: withAlpha(art.veilColor, dim) }');
    expect(shade).toBeGreaterThan(-1);
    expect(shade).toBeGreaterThan(layer.indexOf('{placed ? ('));
    expect(shade).toBeLessThan(layer.indexOf('{art.veil > 0 ? ('));
    // no neutral wash anywhere in the layer
    expect(layer).not.toMatch(/withAlpha\('#0{3,6}'|rgba\(0, ?0, ?0|backgroundColor: '#000/);
  });
});

describe('what is under a picture, and who asks', () => {
  const surface = withoutComments(read('../components/Surface.tsx'));
  const layer = withoutComments(read('../components/CardArtLayer.tsx'));

  /**
   * THE PICTURE'S OWN GROUND, SOLID, FIRST (`CardArt.ground`). The stash summary's picture is
   * translucent everywhere, and any picture is missing until it loads, so what is under it is
   * what its words are read on. A card lays the measured ground there, before the picture and
   * without waiting for layout — never the theme's tint, a glass wash or a blurred page.
   */
  it('lays a card’s picture on the picture’s own solid ground, from the first frame', () => {
    expect(surface).toContain('art={art}');
    expect(surface).toContain('ground={art.ground}');
    expect(surface).toContain('cover={coverBorderBox(bw, r)}');
    expect(surface).toContain('pictureOpacity={pictureOpacity ?? 1}');
    const ground = layer.indexOf(
      '{ground ? <View style={[StyleSheet.absoluteFill, { backgroundColor: ground }]} /> : null}',
    );
    expect(ground).toBeGreaterThan(-1);
    // under the picture, and not behind the layout the picture waits for
    expect(ground).toBeLessThan(layer.indexOf("{placed && place?.fit === 'stamp' ? ("));
  });

  it('asks one question in every card that draws a picture', () => {
    for (const file of ['../components/Card.tsx', '../components/TimerCard.tsx']) {
      const src = withoutComments(read(file));
      expect(src, file).toContain('const picture = artForTheme(art, t.theme);');
      // never the Night-only rule it replaced, which let a pale picture into dark
      expect(src, file).not.toContain('t.isNight ? null : (art ?? null)');
    }
  });

  /**
   * AND A CARD WITH NO PICTURE CAN BE ASKED TO BE SOLID, so the tint its inks were chosen against
   * is the tint that is drawn — not a glass skin's translucent wash over a page nobody measured.
   */
  it('passes `solid` from a Card to its Surface', () => {
    const card = withoutComments(read('../components/Card.tsx'));
    expect(card).toContain('solid = false,');
    expect(card).toContain('{...(solid ? { solid } : {})}');
  });
});
