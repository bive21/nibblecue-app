/**
 * ONE WRITER FOR EVERY MILK AMOUNT (2026-09-26). The owner's 7 oz + 7.25 oz read "14.25 oz" in
 * one place and "14.3 oz" on Today, because Today wrote its own number: `Math.round(v * 10) / 10`
 * beside a hand-typed ` oz`. Then the household could choose milliliters, which a hand-typed " ml"
 * would have said as "ml" and never as liters. So every amount a person reads is written by core's
 * `volumeText` — through the app's `volume` and `volumeLabel`, which are that and nothing else — and
 * this scan fails the build for code that writes one by hand:
 *
 *   * a number interpolated straight before a volume unit — `${n} oz`, `${n} ml`, `${n} mL`;
 *   * a volume unit concatenated onto a number — `+ ' oz'`;
 *   * an ounce rounded to a tenth — `mlToVolume(…) * 10` — the rounding the owner saw.
 *
 * A stepper's number is not an amount written for reading: it is held in the display unit
 * (`mlToVolume`) with its unit beside it as a label (`UNIT_LABEL`), and is not what this scans for.
 * The exceptions are named, with the reason each is not a milk amount.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../../../..');

/**
 * Where display code lives: the app, core and the design system. (CuddleCue scans its server's push
 * text too, `supabase/functions`; that is CuddleCue's repository, and NibbleCue sends no push.)
 */
const ROOTS = ['apps/mobile/src', 'packages/core/src', 'packages/ui/src'];

/** Not a milk amount, or the writer itself — each with why. */
const ALLOWED: Readonly<Record<string, string>> = {
  // the writer: `volumeText` is here, and `weightLabel` writes a weight's ounces ("7 lb 4.3 oz")
  'packages/core/src/entry/units.ts': 'the one writer, and weight ounces',
  // a solid food's own unit, typed with the amount by the parent ("30 g", "2 tbsp", "4 oz")
  'packages/core/src/solids/items.ts': 'food units, not milk',
  // a split refuses an amount it cannot take, in a developer's error, never on a screen
  'packages/core/src/stash/split.ts': 'a thrown error, not copy',
  'apps/mobile/src/data/stash.ts': 'a thrown error, not copy',
  'packages/core/src/sync/overdraw.ts': 'a thrown error, not copy',
};

const HAND_WRITTEN: readonly { name: string; re: RegExp }[] = [
  // "L" only after a space: an SVG path's line-to (`${x}L${y}`) is not a liter
  {
    name: 'a number typed before a volume unit',
    re: /\$\{[^}]+\}(?:\s(?:oz|ml|mL|L)|(?:oz|ml|mL))\b/,
  },
  { name: 'a volume unit concatenated onto a number', re: /\+\s*['"`]\s(?:oz|ml|mL|L)['"`]/ },
  { name: 'an ounce rounded to a tenth', re: /mlToVolume\([^)]*\)\s*\*\s*10\b/ },
];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|bench|sim)\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** The code without its comments: a comment may quote "4 oz" to explain itself. */
const code = (p: string): string =>
  readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

describe('every milk amount is written by the one writer', () => {
  it('finds no amount written by hand anywhere a person reads one', () => {
    const found: string[] = [];
    for (const root of ROOTS)
      for (const p of files(resolve(REPO, root))) {
        const rel = relative(REPO, p);
        if (ALLOWED[rel] !== undefined) continue;
        code(p)
          .split('\n')
          .forEach((line, i) => {
            for (const h of HAND_WRITTEN)
              if (h.re.test(line)) found.push(`${rel}:${i + 1} — ${h.name}: ${line.trim()}`);
          });
      }
    expect(found).toEqual([]);
  });

  it('would catch what it is for', () => {
    const caught = (line: string) => HAND_WRITTEN.some(h => h.re.test(line));
    // what Today and the push text did before 2026-09-26
    expect(caught('return `${String(Math.round(v * 10) / 10)} ${unit}`;')).toBe(false);
    expect(caught('`${Math.round(mlToVolume(ml, unit) * 10) / 10} ${UNIT_LABEL[unit]}`')).toBe(
      true,
    );
    expect(caught('`${amount} oz stored`')).toBe(true);
    expect(caught('`${n} ml`')).toBe(true);
    expect(caught("total + ' oz'")).toBe(true);
    // and leaves alone what is not an amount written by hand
    expect(caught('volumeText(ml, unit)')).toBe(false);
    expect(caught('`M${x} ${y}L${x2} ${y2}`')).toBe(false);
    expect(caught('`${n} L`')).toBe(true);
    expect(caught('unitLabel={UNIT_LABEL[unit] ?? unit}')).toBe(false);
  });

  it('keeps its exceptions to files that exist, each with its reason', () => {
    for (const [rel, why] of Object.entries(ALLOWED)) {
      expect(statSync(resolve(REPO, rel)).isFile(), rel).toBe(true);
      expect(why.length, rel).toBeGreaterThan(5);
    }
  });
});
