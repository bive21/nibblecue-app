/**
 * NO WEBP ANYWHERE THE APP DRAWS FROM (2026-10-01).
 *
 * The owner's iPhone drew the stash card's see-through WebP as nothing: the card's own ground and
 * no picture, while Android drew every one. So the card pictures ship as JPEG and every icon as
 * PNG (`tools/brand/render-card-art.mjs`, `tools/brand/render-stash-icons.mjs`,
 * `tools/ui/import-png-icons.mjs`), and `types/images.d.ts` declares no `*.webp`, so an `import`
 * of one is a type error. A `require` is not typed, though, and a file can sit in a folder unused
 * until someone reaches for it, so the folders and the source are read here.
 *
 * Photos a parent adds are a different road: they are prepared as JPEG on the phone before they
 * are stored (`packages/core/src/media/childPhoto.ts`), whatever the storage bucket would accept.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, '..', '..');
const repo = join(mobile, '..', '..');
const ui = join(repo, 'packages', 'ui', 'src');

/** Every file under `dir`, skipping what was installed or built rather than written. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    if (name === 'node_modules' || name.startsWith('.')) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const where = (path: string): string => relative(repo, path);
/** The code without its comments, which may name the format to say why it is gone. */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/gm, '$1 ');

describe('the app ships no WebP picture', () => {
  it('has no WebP file in its assets, its source or the design system', () => {
    const found = [join(mobile, 'assets'), join(mobile, 'src'), ui]
      .flatMap(walk)
      .filter(path => /\.webp$/i.test(path))
      .map(where);
    expect(found).toEqual([]);
  });

  it('names no WebP file in an import, a require or the app config', () => {
    // built from two halves so this file does not match itself
    const named = new RegExp(['\\.we', 'bp[\'"`]'].join(''), 'i');
    const sources = [join(mobile, 'src'), ui]
      .flatMap(walk)
      .filter(path => /\.(ts|tsx|js|mjs)$/.test(path) && basename(path) !== 'noWebp.scan.test.ts')
      .concat(join(mobile, 'app.config.ts'), join(mobile, 'App.tsx'));
    const found = sources.filter(path => named.test(code(readFileSync(path, 'utf8')))).map(where);
    expect(found).toEqual([]);
  });

  it('ships the card pictures as JPEG and the drawn icons as PNG', () => {
    const files = (dir: string): string[] => walk(dir).map(path => basename(path));
    const cardArt = files(join(mobile, 'assets', 'card-art'));
    expect(cardArt.length).toBeGreaterThan(0);
    for (const file of cardArt) expect(file).toMatch(/\.jpg$/);
    const stashKinds = files(join(mobile, 'assets', 'stash-kinds'));
    expect(stashKinds.length).toBeGreaterThan(0);
    for (const file of stashKinds) expect(file).toMatch(/\.png$/);
    const illustrated = files(join(ui, 'icons', 'illustrated'));
    expect(illustrated.length).toBeGreaterThan(0);
    for (const file of illustrated) expect(file).toMatch(/\.png$/);
  });
});
