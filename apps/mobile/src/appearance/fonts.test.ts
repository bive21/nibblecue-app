/**
 * THE APP SHIPS THE FONT FILES IT REGISTERS, AND NO OTHERS (the owner, 2026-09-26: "remove any
 * unused assets from the app, so it runs as efficiently as possible").
 *
 * Until that day it shipped thirty-two TTFs to register six. `fonts.ts` imported its six faces by
 * name from each `@expo-google-fonts/*` package's index, and that index `require`s every weight
 * the package publishes — Metro bundles every file a module requires whether or not anything
 * reads the export, because this build does not tree-shake (`EXPO_UNSTABLE_TREE_SHAKING` is
 * off). `expo export` listed all eighteen Hanken Grotesk and all fourteen Plex Mono files.
 *
 * Source scans, because `fonts.ts` imports `expo-font` and its imports `require` a `.ttf`, and the
 * node runner can load neither. What they hold: every face comes from its own weight folder,
 * nothing in the app reaches a package index, and the faces registered are exactly the faces the
 * app names — so a weight the design stops using fails here instead of shipping unread.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const FONTS_FILE = 'apps/mobile/src/appearance/fonts.ts';
const FONTS = read(FONTS_FILE);

/** The app's own source, from git and including what is not committed yet (`plan/enforced.test.ts`). */
const sources = execFileSync(
  'git',
  [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    'apps/mobile',
    'packages/ui/src',
  ],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(f => /\.(ts|tsx|js|cjs|mjs)$/.test(f) && !/\.test\.tsx?$/.test(f));

describe('the font files in the bundle', () => {
  it('imports each face from its own weight folder, never from a package index', () => {
    const specifiers = [...FONTS.matchAll(/from '(@expo-google-fonts\/[^']+)'/g)].map(m => m[1]);
    expect(specifiers.length, 'fonts.ts still loads the faces').toBeGreaterThan(0);
    for (const s of specifiers) {
      expect(s, 'a package index requires every weight it publishes').toMatch(
        /^@expo-google-fonts\/[a-z-]+\/\d{3}[A-Za-z]+$/,
      );
    }
  });

  it('nothing else in the app reaches a font package index either', () => {
    const bare = sources.filter(f => /['"]@expo-google-fonts\/[a-z-]+['"]/.test(read(f)));
    expect(bare, 'an import from a font package index ships every weight it publishes').toEqual([]);
  });

  it('registers exactly the faces the app names', () => {
    const FACE = /'((?:HankenGrotesk|IBMPlexMono)-[A-Za-z]+)'/g;
    const registered = new Set([...FONTS.matchAll(FACE)].map(m => m[1]));
    const named = new Set(
      sources
        .filter(f => f !== FONTS_FILE)
        .flatMap(f => [...read(f).matchAll(FACE)].map(m => m[1])),
    );
    expect(registered.size, 'fonts.ts still registers the faces').toBeGreaterThan(0);
    expect([...registered].sort(), 'a face registered and never named ships unread').toEqual(
      [...named].sort(),
    );
  });
});
