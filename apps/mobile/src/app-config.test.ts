/**
 * WHAT `app.config.ts` MAY IMPORT — the guard for a break nothing else in this repository can
 * see.
 *
 * On 2026-09-22 the owner ran `pnpm mobile:clear` and got this, with no app and no clue:
 *
 *     Error reading Expo config at apps/mobile/app.config.ts:
 *     Cannot find module '…/packages/core/src/domain/domain-types'
 *     imported from …/packages/core/src/index.ts
 *
 * The CueCoins work had added `import { TAG_SEGMENT } from '@nibblecue/core'` so the Android
 * intent filter could claim `/t/`. Every gate in the repository passed: vitest, tsc, eslint and
 * Metro all resolve an extensionless relative import, and `packages/core/src/index.ts` is built
 * from them. **Expo does not.** It reads this one file with Node's own ESM loader and type
 * stripping, which requires an explicit extension — so the config died on a package the app
 * itself imports a hundred times without trouble.
 *
 * That is the shape of the bug: a file only ONE tool loads, and that tool is not in `verify`.
 * So the rule is asserted statically here rather than by loading it, because loading it needs
 * Expo's loader (its JSON import attributes differ from plain Node's) and a test that needs the
 * thing it is testing is not a test.
 *
 * THE RULE: this file may import types from anywhere (they are erased), and at RUNTIME only
 *   · a `.json` file — Expo's loader handles those,
 *   · a `.cjs` sibling — CommonJS, always resolvable,
 *   · a `.ts` file BY PATH WITH ITS EXTENSION, which must itself be free of runtime imports.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The app's root, one up from `src` — where Expo looks for the config. */
const here = resolve(__dirname, '..');
const config = readFileSync(join(here, 'app.config.ts'), 'utf8');

/** Every `import … from '<specifier>'` that is NOT `import type`. */
function runtimeImports(source: string): string[] {
  const out: string[] = [];
  const re = /^import\s+(?!type\s)([\s\S]*?)from\s+'([^']+)'/gm;
  for (const m of source.matchAll(re)) {
    const clause = m[1] ?? '';
    const spec = m[2] ?? '';
    // `import { type A, type B } from` erases entirely; anything else is real
    const names = clause
      .replace(/[{}]/g, '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (names.length > 0 && names.every(n => n.startsWith('type '))) continue;
    out.push(spec);
  }
  return out;
}

describe('the Expo config’s imports', () => {
  const specs = runtimeImports(config);

  it('imports something at runtime, so this test is looking at a real list', () => {
    expect(specs.length).toBeGreaterThan(2);
  });

  it('never imports a workspace package by name — Expo’s loader cannot resolve one', () => {
    const bare = specs.filter(s => s.startsWith('@nibblecue/') && !s.endsWith('.json'));
    expect(
      bare,
      'Expo reads app.config.ts with Node’s ESM loader; @nibblecue/* resolves to a .ts index ' +
        'full of extensionless imports and `expo start` dies. Import the leaf file by path ' +
        'with its extension instead.',
    ).toEqual([]);
  });

  it('imports .ts files only by path and only with the extension', () => {
    for (const spec of specs) {
      if (!spec.includes('/') || spec.endsWith('.json') || spec.endsWith('.cjs')) continue;
      if (spec.startsWith('expo')) continue;
      expect(spec, `${spec} must end in .ts so Node can resolve it`).toMatch(/\.ts$/);
    }
  });

  /**
   * The transitive half, and the one that actually bit. A leaf file with its extension is only
   * safe if IT has no runtime imports either — otherwise the same resolver failure moves one
   * file further away and comes back the next time somebody runs the app.
   */
  it('imports only .ts files that are themselves free of runtime imports', () => {
    // NibbleCue has no CueCoins, so its config imports no `.ts` leaf today (CuddleCue's imported
    // the coins grammar for the /t/ intent filter). The rule still holds for the next one added.
    const leaves = specs.filter(s => s.endsWith('.ts'));
    for (const spec of leaves) {
      const file = resolve(here, spec);
      const source = readFileSync(file, 'utf8');
      expect(
        runtimeImports(source),
        `${spec} has a runtime import, so Node cannot load it from app.config.ts either`,
      ).toEqual([]);
      // and it really is the file we think it is, not a barrel that re-exports one
      expect(source, `${spec} must not re-export a module`).not.toMatch(/^export \* from/m);
    }
  });

  it('still reads the brand’s decided values from brand.json rather than typing them', () => {
    expect(config).toContain('@nibblecue/brand/brand.json');
  });

  it('pins the directory the leaf lives in, so a move is a failing test and not a dead app', () => {
    for (const spec of specs.filter(s => s.endsWith('.ts'))) {
      expect(dirname(resolve(here, spec))).toContain(join('packages', 'core', 'src'));
    }
  });
});

/**
 * THE ARTWORK THE CONFIG NAMES EXISTS. Expo reads each `art('…')` file only at prebuild, on EAS,
 * so a name with no file behind it passes every gate here and fails the store build. The themed
 * icon layer (2026-10-08) is held by name, because a launcher that themes icons and finds no
 * monochrome layer quietly draws the full-color icon instead, and nothing would say it went.
 */
describe('the artwork the Expo config names', () => {
  // NibbleCue's config names its artwork through brand.json (`art(assets.appIcon)`), so each
  // name is resolved through the same `assets` map Expo's config reads.
  const assets = (
    JSON.parse(readFileSync(join(here, '..', '..', 'packages', 'brand', 'brand.json'), 'utf8')) as {
      assets: Record<string, unknown>;
    }
  ).assets;
  const keys = [...config.matchAll(/\bart\(assets\.([A-Za-z0-9]+)\)/g)].map(m => m[1] ?? '');
  const names = keys.map(key => {
    const file = assets[key];
    if (typeof file !== 'string') throw new Error(`brand.json assets.${key} is not a file name`);
    return file.replace(/^brand\//, '');
  });

  it('names files that exist in packages/brand/brand', () => {
    expect(names.length).toBeGreaterThan(4);
    for (const name of names) {
      expect(existsSync(join(here, '..', '..', 'packages', 'brand', 'brand', name)), name).toBe(
        true,
      );
    }
  });

  it('gives the Android adaptive icon its monochrome layer for themed icons', () => {
    expect(config).toMatch(/monochromeImage:\s*art\(assets\.adaptiveMonochrome\)/);
    expect(names).toContain(String(assets.adaptiveMonochrome).replace(/^brand\//, ''));
  });
});
