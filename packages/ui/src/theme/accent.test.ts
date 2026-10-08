/**
 * The derived accent family, and the one rule in it that is a measurement rather than a taste:
 * white text on a filled button, and what happens when the household's accent cannot carry it.
 */
import { describe, expect, it } from 'vitest';
import { ACCENT_SHADOW, ACCENT_TINT, ACCENT_TINT_SOFT, deriveAccent } from './accent';
import { AA_TEXT, contrastRatio } from './contrast';
import { resolvePalette, schemes, themes, type SchemeName } from './theme';

const light = themes.light;

describe('the accent family', () => {
  it('tints toward the surface, and the soft one is quieter than the chip', () => {
    const a = deriveAccent(light);
    // both are opaque values, never an alpha: a tint is a color mixed ON a ground (§12 rule 1)
    expect(a.tint).toMatch(/^#[0-9a-f]{6}$/i);
    expect(a.tintSoft).toMatch(/^#[0-9a-f]{6}$/i);
    // the soft wash is closer to the card than the chip is
    expect(contrastRatio(a.tintSoft, light.surfaceSolid)).toBeLessThan(
      contrastRatio(a.tint, light.surfaceSolid),
    );
    expect(ACCENT_TINT_SOFT).toBeLessThan(ACCENT_TINT);
  });

  it('presses toward the ink, not toward black, so dark mode lightens', () => {
    const inLight = deriveAccent(themes.light);
    const inDark = deriveAccent(themes.dark);
    // light: the text ink is dark, so a press darkens
    expect(contrastRatio(inLight.dark, themes.light.surfaceSolid)).toBeGreaterThan(
      contrastRatio(inLight.accent, themes.light.surfaceSolid),
    );
    // dark: the text ink is nearly white, so the same rule lightens instead of vanishing
    expect(contrastRatio(inDark.dark, themes.dark.surfaceSolid)).toBeGreaterThan(
      contrastRatio(inDark.accent, themes.dark.surfaceSolid),
    );
  });

  it('gives the shadow an alpha, and nothing else one', () => {
    const a = deriveAccent(light);
    expect(a.shadow).toContain(`${ACCENT_SHADOW}`.replace('0.', '0.'));
    expect(a.shadow.startsWith('rgba') || a.shadow.length === 9).toBe(true);
    for (const v of [a.tint, a.tintSoft, a.dark]) expect(v).not.toMatch(/rgba/);
  });
});

/**
 * THE FALLBACK IS THE POINT. A pale accent is a real setting, not a hypothetical — the brief
 * names "a very light yellow" — and a filled button that keeps white on it is unreadable rather
 * than merely pale. The rule lives here so no component can decide it differently.
 */
describe('what reads on a filled accent', () => {
  it('keeps white where the accent can carry it', () => {
    const a = deriveAccent(light);
    expect(contrastRatio(a.onAccent, a.accent)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(a.onAccentIsInk).toBe(false);
  });

  it('falls back to the text ink where it cannot — a very light yellow', () => {
    const pale = deriveAccent(light, '#FFE680');
    expect(a11y(pale.onAccent, '#FFE680')).toBe(true);
    expect(pale.onAccentIsInk).toBe(true);
    expect(pale.onAccent).toBe(light.text);
  });

  /**
   * AND IT HOLDS FOR EVERY SCHEME THE HOUSEHOLD CAN ACTUALLY PICK, in both themes. This is the
   * assertion that makes the rule worth having: whatever the six offer, a filled button's label
   * clears AA, by white or by ink.
   */
  it('clears AA on every scheme, in light and in dark', () => {
    for (const scheme of Object.keys(schemes) as SchemeName[]) {
      for (const theme of ['light', 'dark'] as const) {
        const palette = resolvePalette(theme, scheme);
        const a = deriveAccent(palette);
        expect(a11y(a.onAccent, a.accent), `${scheme}/${theme}`).toBe(true);
      }
    }
  });

  it('is a floor and not a target: a black accent takes white, not ink', () => {
    const dark = deriveAccent(light, '#101010');
    expect(dark.onAccent).toBe(light.onAccent);
    expect(dark.onAccentIsInk).toBe(false);
  });
});

const a11y = (fg: string, bg: string): boolean => contrastRatio(fg, bg) >= AA_TEXT;
