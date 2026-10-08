/**
 * THE APP'S SLICE OF THE PRICING CONFIG IS THE CONFIG (`tools/gen-app-slices.mjs` says why it
 * exists: an imported JSON file is bundled whole, and the app reads two keys of this one).
 *
 * The copy is generated and `pnpm check:slices` holds it to its source; this holds it here too,
 * under `pnpm test:entitlements`, because every other test of the config reads the JSON — and
 * what they check is only what the app sells if the two are the same.
 *
 * Run: pnpm test:entitlements
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from './pricing.config.json';
import { PRICING_PACKAGES, WELCOME_PREVIEW_DAYS } from './pricing.generated';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('the pricing slice the app reads', () => {
  it('is the config’s packages and welcome preview length, exactly', () => {
    expect(PRICING_PACKAGES).toEqual(config.packages);
    expect(WELCOME_PREVIEW_DAYS).toBe(config.welcome_preview.days);
  });

  it('is the only way the package’s code reads the config', () => {
    // a test may read the whole file; code that ships may not, or the whole file ships with it
    const src = join(__dirname, '..');
    const readers = sourceFiles(src)
      .filter(f => /pricing\.config\.json['"]/.test(readFileSync(f, 'utf8')))
      .map(f => relative(src, f));
    expect(readers).toEqual([]);
  });
});
