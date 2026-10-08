/**
 * theme.ts says it is generated from design-tokens.json. Until `pnpm tokens:build` exists
 * (WP3) the two are maintained by hand, so this test is what stops them drifting apart —
 * and a token change that does not reach the palette is exactly the class of bug the
 * contrast harness cannot see.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODULES } from '@nibblecue/core';
import tokens from './design-tokens.json';
import * as theme from './theme';
import type { SchemeName } from './theme';

/** The value entries of a token group, minus the `$note`-style annotations. */
const values = (group: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(group).filter(([key]) => !key.startsWith('$')));

describe('theme.ts mirrors design-tokens.json', () => {
  it.each(['light', 'dark', 'night'] as const)(
    '%s: every token color is in the palette with the same value',
    name => {
      const palette: Record<string, unknown> = theme.themes[name];
      for (const [role, value] of Object.entries(values(tokens.color[name]))) {
        expect(palette[role], `${name}.${role}`).toBe(value);
      }
    },
  );

  it('gives light and dark the same roles', () => {
    expect(Object.keys(theme.themes.dark).sort()).toEqual(Object.keys(theme.themes.light).sort());
    expect(Object.keys(theme.themes.night).sort()).toEqual(Object.keys(theme.themes.light).sort());
  });

  it('carries the six schemes, each with the same overlay roles, and the same default', () => {
    const schemeTokens = values(tokens.colorScheme) as Record<
      SchemeName,
      { light: Record<string, string>; dark: Record<string, string> }
    >;
    expect(Object.keys(theme.schemes).sort()).toEqual(Object.keys(schemeTokens).sort());
    expect(theme.DEFAULT_SCHEME).toBe(tokens.colorScheme.$default);
    for (const name of Object.keys(schemeTokens) as SchemeName[]) {
      expect(theme.schemes[name].light, `${name}.light`).toEqual(schemeTokens[name].light);
      expect(theme.schemes[name].dark, `${name}.dark`).toEqual(schemeTokens[name].dark);
    }
  });

  it('agrees on gradients, radii, spacing, hit targets and the type scale sizes', () => {
    expect(theme.gradients.light).toEqual(values(tokens.gradient));
    expect(theme.radius).toEqual(tokens.radius);
    expect(Object.values(theme.space)).toEqual(Object.values(tokens.space));
    expect(theme.hit).toEqual({
      min: tokens.hitTarget.min,
      primary: tokens.hitTarget.primaryAction,
    });
    const scale = tokens.typography.scale as Record<string, { size: number }>;
    const typeScale = theme.type as unknown as Record<string, { fontSize?: number }>;
    for (const [step, spec] of Object.entries(scale)) {
      expect(typeScale[step]?.fontSize, `type.${step}`).toBe(spec.size);
    }
  });

  it('colors every module the way the tokens and the registry do', () => {
    expect(theme.moduleColor).toEqual(tokens.categoryColorByModule);
    const colorOf = theme.moduleColor as Record<string, string | undefined>;
    const mismatched = MODULES.filter(
      m => colorOf[m.id] !== undefined && colorOf[m.id] !== m.color,
    );
    expect(mismatched.map(m => m.id)).toEqual([]);
    /* Tripwire, not a target: every registry module has a color in both the tokens and
       theme.ts (WP3 added `vaccine`, which arrived after the tokens were cut); anything
       appearing here is a new gap to look at. */
    const uncolored = MODULES.filter(m => colorOf[m.id] === undefined).map(m => m.id);
    expect(uncolored).toEqual([]);
  });
});

describe('resolvePalette', () => {
  it('falls back to the default scheme for a name it does not know, instead of rendering unstyled', () => {
    expect(theme.resolvePalette('light', 'nonsense' as SchemeName)).toEqual(
      theme.resolvePalette('light', theme.DEFAULT_SCHEME),
    );
    // the retired keys a device or a profile row may still hold (twilight 2026-09-21, sage and
    // clay 2026-09-27), and a key that is only a name on Object's prototype — none of them is a
    // scheme, and every one paints the default in every theme rather than throwing
    for (const retired of ['twilight', 'sage', 'clay', 'constructor', 'toString', '__proto__']) {
      expect(theme.isSchemeName(retired), retired).toBe(false);
      for (const name of theme.themeNames)
        expect(theme.resolvePalette(name, retired as SchemeName), `${retired}/${name}`).toEqual(
          theme.resolvePalette(name, theme.DEFAULT_SCHEME),
        );
      expect(theme.brandGradientFor('dark', retired as SchemeName)).toEqual(
        theme.brandGradientFor('dark', theme.DEFAULT_SCHEME),
      );
    }
  });

  it('starts every NibbleCue household on Sunny, and ships Ocean, Reef and Lilac beside it', () => {
    // the owner, 2026-10-08: "we can change the main color to diferentiate the two app"
    expect(theme.DEFAULT_SCHEME).toBe('sunny');
    expect(Object.keys(theme.schemes)).toEqual([
      'ocean',
      'lilac',
      'rose',
      'sunny',
      'reef',
      'slate',
    ]);
    for (const name of Object.keys(theme.schemes)) expect(theme.isSchemeName(name)).toBe(true);
  });

  it('lets a scheme change only the accents in night mode — the grounds stay night', () => {
    const night = theme.resolvePalette('night', 'rose');
    expect(night.page).toBe(theme.themes.night.page);
    expect(night.app).toBe(theme.themes.night.app);
    expect(night.text).toBe(theme.themes.night.text);
    expect(night.accent).toBe(theme.schemes.rose.dark.accent);
    expect(night.accent2).toBe(theme.schemes.rose.dark.accent2);
  });

  it('overlays exactly the roles a scheme owns, never a category or a status color', () => {
    for (const name of Object.keys(theme.schemes) as SchemeName[]) {
      const palette = theme.resolvePalette('light', name);
      for (const role of [
        'milk',
        'sleep',
        'rose',
        'diaper',
        'olive',
        'cyan',
        'good',
        'warn',
        'crit',
        'med',
        'placeRoom',
        'placeDeep',
      ] as const) {
        expect(palette[role], `${name}.${role}`).toBe(theme.themes.light[role]);
      }
      expect(palette.accent).toBe(theme.schemes[name].light.accent);
      expect(palette.page).toBe(theme.schemes[name].light.page);
      expect(theme.brandGradientFor('dark', name)).toEqual([
        theme.schemes[name].dark.g1,
        theme.schemes[name].dark.g2,
      ]);
    }
  });
});

/**
 * THE PACKAGE INDEX CARRIES NO JSON INTO THE BUNDLE (2026-09-26, the owner: "remove any unused
 * assets from the app"). Every screen imports `@nibblecue/ui`, and Metro bundles every file the
 * index requires whether or not a caller reads the export — this build does not tree-shake. The
 * token JSON rode in that way for a `designTokens` nothing read; `theme.ts` is the runtime copy.
 */
describe('what the package index carries into the app', () => {
  it('re-exports no JSON file', () => {
    const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
    const code = index.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\.json['"]/);
  });
});
