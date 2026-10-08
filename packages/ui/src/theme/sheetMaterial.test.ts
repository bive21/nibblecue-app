/**
 * The sheet material (skins.ts; docs/DESIGN_SYSTEM.md §13): the owner read the page's text
 * through the Liquid Glass sheet and it hurt the eyes. A sheet is the surface a parent types
 * on, so it frosts hardest of all, and where a platform cannot blur it is opaque.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHROME_ALPHA_WITHOUT_BLUR,
  chromeAlphaFor,
  SKINS,
  skinForTheme,
  SURFACE_ALPHA_WITHOUT_BLUR,
  surfaceAlphaFor,
  tintAlphaFor,
} from './skins';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string): string => readFileSync(join(here, '..', 'components', f), 'utf8');

describe('the sheet frosts hardest', () => {
  it('every skin has a sheet at least as opaque as its chrome, and glass at 90% over a 34px blur', () => {
    for (const skin of Object.values(SKINS)) {
      expect(skin.sheet.alpha).toBeGreaterThanOrEqual(skin.chrome.alpha);
      expect(skin.sheet.alpha).toBeGreaterThanOrEqual(0.9);
    }
    expect(SKINS.glass.sheet).toMatchObject({ alpha: 0.9, blur: 34 });
    expect(SKINS.paper.sheet.alpha).toBe(1);
  });
  it('night flattens the sheet like everything else, and dark drops its specular', () => {
    expect(skinForTheme(SKINS.glass, 'night').sheet).toMatchObject({
      alpha: 1,
      blur: 0,
      specular: false,
    });
    expect(skinForTheme(SKINS.glass, 'dark').sheet.specular).toBe(false);
  });
  it("dark glass is made of the scheme's soft tint, edged by the light line, and only in dark", () => {
    // The owner: dark Liquid Glass "doesn't feel anything special". A 5.5% white at 52% over a
    // near-black ground is a 2.9% lift; the scheme's own tint at 70% is a panel you can see.
    const dark = skinForTheme(SKINS.glass, 'dark');
    expect(dark.surface).toMatchObject({
      fill: 'tint',
      alpha: 0.7,
      border: 'line',
      specular: false,
    });
    expect(dark.chrome).toMatchObject({ fill: 'tint', alpha: 0.85, border: 'line' });
    expect(dark.sheet).toMatchObject({ fill: 'tint', alpha: 0.95, border: 'line' });
    expect(dark.sheet.alpha).toBeGreaterThanOrEqual(dark.chrome.alpha);
    // `solid`, so the 0.52 in the table is the 0.52 on the screen. `surface` is the SOFT skin's
    // card material and carries its own 0.86, so reading it here multiplied the two and painted
    // 44.7% — a material that does not paint its own number cannot be measured (skins.ts).
    expect(skinForTheme(SKINS.glass, 'light').surface).toMatchObject({
      fill: 'solid',
      alpha: 0.52,
    });
    for (const skin of ['paper'] as const)
      expect(skinForTheme(SKINS[skin], 'dark').surface.fill).toBe(SKINS[skin].surface.fill);
  });
});

describe('the chrome where the platform cannot blur', () => {
  it('takes the soft floor in glass, and keeps its own number where it never blurred', () => {
    expect(chromeAlphaFor(SKINS.glass.chrome, true)).toBe(0.8);
    expect(chromeAlphaFor(SKINS.glass.chrome, false)).toBe(CHROME_ALPHA_WITHOUT_BLUR);
    expect(chromeAlphaFor(skinForTheme(SKINS.glass, 'dark').chrome, false)).toBe(
      CHROME_ALPHA_WITHOUT_BLUR,
    );
    expect(chromeAlphaFor(SKINS.paper.chrome, false)).toBe(1);
    expect(chromeAlphaFor(skinForTheme(SKINS.glass, 'night').chrome, false)).toBe(1);
  });
  it('Surface draws the chrome through it', () => {
    expect(read('Surface.tsx')).toMatch(/chromeAlphaFor\(material, !android\)/);
  });
});

describe('the sheet and the popover are drawn on it', () => {
  it('BottomSheet and Popover use kind="sheet", not the chrome', () => {
    expect(read('BottomSheet.tsx')).toMatch(/<Surface\s+kind="sheet"/);
    expect(read('Popover.tsx')).toMatch(/<Surface kind="sheet"/);
  });
  it('Surface makes a sheet opaque where the platform cannot blur', () => {
    const src = read('Surface.tsx');
    expect(src).toMatch(/const opaqueSheet = kind === 'sheet' && android && material\.blur > 0;/);
    expect(src).toMatch(/solid \|\| opaqueSheet \? 1 :/);
  });
});

/**
 * THE CONTENT PANEL WHERE THE PLATFORM CANNOT BLUR — the same rule, and the one surface that
 * went without it. An alpha is a promise about the blur beneath it; a translucent panel over no
 * blur is the average of the card and the page, and at the blurred 52% it cannot separate from
 * the page. The owner read that on an Android phone three times in a day: the milk stash, the
 * shopping list and the Quick tiles all "too similar to the background". Then opaque was too
 * far the other way — "on android it does not show too much" (2026-09-29): an opaque white card
 * is Paper's card, and nothing of the glass shows. So it is a number between, measured
 * (skins.ts SURFACE_ALPHA_WITHOUT_BLUR; ground.test.ts holds the separation it leaves).
 */
describe('the content panel where the platform cannot blur', () => {
  it('is between the blurred alpha and opaque in glass, and a skin that never blurred keeps its own', () => {
    expect(surfaceAlphaFor(SKINS.glass.surface, true)).toBe(0.52);
    expect(surfaceAlphaFor(SKINS.glass.surface, false)).toBe(SURFACE_ALPHA_WITHOUT_BLUR);
    // more than the blurred number (the page may not show through at half), less than opaque
    // (the ground and its orbs must show through at all — that is the material)
    expect(SURFACE_ALPHA_WITHOUT_BLUR).toBeGreaterThan(SKINS.glass.surface.alpha);
    expect(SURFACE_ALPHA_WITHOUT_BLUR).toBeLessThan(1);
    expect(surfaceAlphaFor(skinForTheme(SKINS.glass, 'dark').surface, false)).toBe(
      SURFACE_ALPHA_WITHOUT_BLUR,
    );
    // Paper draws no blur behind a card, so nothing about it changes on either platform
    expect(surfaceAlphaFor(SKINS.paper.surface, false)).toBe(1);
    expect(surfaceAlphaFor(skinForTheme(SKINS.glass, 'night').surface, false)).toBe(1);
  });

  it('carries a category tint at full strength wherever there is no blur under it', () => {
    expect(tintAlphaFor(SKINS.glass, true)).toBe(0.55);
    expect(tintAlphaFor(SKINS.glass, false)).toBe(1);
    // a skin whose panels never blur keeps its own tint alpha even when asked for the no-blur one
    expect(tintAlphaFor(SKINS.paper, false)).toBe(SKINS.paper.tintAlpha);
    expect(tintAlphaFor(skinForTheme(SKINS.glass, 'night'), false)).toBe(1);
  });

  it('Surface draws both through it, and the never-blurred tints ask for the full one', () => {
    expect(read('Surface.tsx')).toMatch(/surfaceAlphaFor\(material, !android\)/);
    expect(read('Surface.tsx')).toMatch(/tintAlphaFor\(t\.skinTokens, !android\)/);
    // a 32pt row chip and a Quick bubble's disc carry no BlurView on ANY platform
    for (const f of ['Row.tsx', 'QuickAction.tsx'])
      expect(read(f), f).toMatch(/tintAlphaFor\(t\.skinTokens, false\)/);
  });
});
