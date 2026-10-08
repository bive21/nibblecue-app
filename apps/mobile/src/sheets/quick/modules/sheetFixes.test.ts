/**
 * Source tripwires for the non-timed quick sheets, from the module audits of 2026-09-24 (care,
 * feeding, timers, solids, handoff). There is no React Native renderer in this workspace, so what
 * is asserted is that each sheet's source still says what the fix decided — comments stripped, so
 * no explanation can stand in for the code it explains. The arithmetic behind them is tested in
 * node beside it (growthForm, foodLines, measuredOn, unitPrefs, care amount and query tests).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string): string =>
  readFileSync(join(here, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the solids sheet (solids Low)', () => {
  const src = read('SolidsSheet.tsx');
  it('reads the meal and "First time" at the time the row says, not the moment it opened', () => {
    expect(src).toContain('{(atMs: number) => (');
    expect(src).toContain('value={mealAt(atMs)}');
    expect(src).toContain('isNew={isNewAt(atMs)}');
    expect(src).toContain('const meal = mealAt(atMs);');
    expect(src).not.toMatch(/isFirstTime\(name, theirMeals, openedAtMs\)/);
    expect(src).not.toMatch(/useState<Meal>\(\(\) => mealForTime\(openedAtMs/);
  });
  it('no longer calls it a reaction', () => {
    // the paragraph under the sheet went with option 3 (2026-10-06); nothing took its place
    expect(src).not.toContain('{FOOD_LINES.hint}');
    expect(src).not.toContain('HINTS.solids');
    const copy = readFileSync(join(here, 'solids/copy.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(copy).not.toMatch(/reaction/i);
  });
});

describe('the food lines (solids M1, M2, M3)', () => {
  const src = read('solids/FoodLines.tsx');
  it('settles the unit when an amount is typed, and shows the food’s own until then', () => {
    expect(src).toContain('onChangeText={v => update(line.id, l => withAmount(l, v, foods))}');
    expect(src).toContain('const unit = unitShown(line, foods);');
    expect(src).toContain('{unitLabel(unit, 2)}');
  });
  it('gives a food added after the answer that answer, and asks again when going back to one', () => {
    expect(src).toContain('const inherited = each ? null : shared;');
    expect(src).toContain('emptyLine(fallbackUnit, inherited)');
    expect(src).toContain('addFood(lines, f, fallbackUnit, foods, inherited)');
    expect(src).toContain('if (each) onChange(sameForAll(lines));');
  });
});

// (no timer sheets in NibbleCue: its quick sheets are solids and the Health note)
