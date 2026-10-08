/**
 * CONTRAST_FINDINGS.md §4: at the grounds this app draws, the theme has room for two text
 * inks, not three — `text3` is a non-text ink (dividers, disabled glyphs, the inactive tab
 * glyph, at the 3:1 graphic threshold) and never a word. The design review's glass-dark flags
 * (the timeline's time column at 2.25:1, the count eyebrow at 3.25:1) were every one of them
 * `text3` drawn as text. This holds the app and the components to it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..');
const ROOTS = ['apps/mobile/src', 'packages/ui/src/components'];
const TEXT_INK = /ink=["']text3["']|ink:\s*['"]text3['"]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('text3 is never a text ink', () => {
  it('the scan is not vacuous', () => {
    expect(TEXT_INK.test('<BodySm ink="text3">')).toBe(true);
    expect(TEXT_INK.test("ink: 'text3'")).toBe(true);
    expect(TEXT_INK.test('<Icon color={t.color.text3} />')).toBe(false);
  });
  it('no component or screen draws words in it', () => {
    const files = ROOTS.flatMap(d => walk(join(root, d)));
    expect(files.length).toBeGreaterThan(150);
    const hits = files
      .filter(f => TEXT_INK.test(readFileSync(f, 'utf8')))
      .map(f => relative(root, f));
    expect(hits).toEqual([]);
  });
});
