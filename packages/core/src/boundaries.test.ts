/**
 * The one rule that keeps the domain logic reusable: packages/core imports nothing from
 * React, React Native, Expo, Next, the Supabase client or apps/ (CLAUDE.md §5,
 * docs/BUILD_PLAN.md §2). ESLint enforces it at edit time; this test enforces it in CI so
 * switching the lint rule off is not enough to get one through.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

const here = fileURLToPath(new URL('.', import.meta.url));

const FORBIDDEN: RegExp[] = [
  /^react($|\/|-)/,
  /^react-native/,
  /^expo($|-|\/)/,
  /^@expo\//,
  /^@react-native/,
  /^@react-navigation\//,
  /^next($|\/)/,
  /^@supabase\//,
  /^@nibblecue\/(ui|db|brand|mobile)/,
  /(^|\/)apps\//,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Every static import, dynamic import and require() specifier in a source file. */
function specifiers(src: string): string[] {
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
  const out: string[] = [];
  for (let m = re.exec(src); m; m = re.exec(src)) out.push(m[1] as string);
  return out;
}

describe('packages/core stays pure', () => {
  it('imports nothing from React, React Native, Expo, Next, Supabase or apps/', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(here)) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        if (FORBIDDEN.some(re => re.test(spec)))
          offenders.push(`${relative(here, file)} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('declares no such dependency in package.json either', () => {
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(declared.filter(d => FORBIDDEN.some(re => re.test(d)))).toEqual([]);
  });
});
