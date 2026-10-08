/**
 * A PRESS IS FELT UNDER REDUCE MOTION TOO (docs/DESIGN_SYSTEM.md §7; 2026-09-28).
 *
 * About sixty controls dimmed under a finger only while the theme moved: `opacity: pressed &&
 * !t.reduceMotion ? 0.8 : 1`. An opacity is not motion (nothing travels, nothing scales), and with
 * it gone a parent who asked the phone for less motion, and since Calm motion every parent at 3 a.m.,
 * pressed a button and saw nothing happen at all. So a press dims in every theme, and only what
 * MOVES is held still: a scale or a translate on a press stays gated on `reduceMotion`.
 *
 * Read off the source of the app and the design system, line by line: a line that decides a press's
 * look from `reduceMotion` must be a scale.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..');
const DIRS = [join(root, 'apps', 'mobile', 'src'), join(root, 'packages', 'ui', 'src')];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = DIRS.flatMap(sources);
/** Every line that decides something from a press AND from reduce motion, with a ternary. */
const gatedPresses = files.flatMap(file =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((line, i) => ({ file: relative(root, file), line: i + 1, text: line.trim() }))
    .filter(l => /\bpressed\b/.test(l.text) && /reduceMotion/.test(l.text) && /\?/.test(l.text)),
);

/**
 * THE FILES THIS PASS LEFT TO THEIR OWNERS (2026-09-28). Billing, the vaccines screens and the
 * reminders screen were being changed by other hands the same day; their lines changed the same way
 * once those changes had landed, and the list is empty. It stays so a later pass that has to leave a
 * file can name it, and it can only shrink: a file in it that no longer dims on reduce motion fails
 * the test until it is taken out.
 */
const LEFT_TO_OWNERS: string[] = [];

describe('a press is felt in every theme', () => {
  it('reads every source file in the app and the design system', () => {
    expect(files.length).toBeGreaterThan(400);
  });

  it('never takes a press’s dim away under reduce motion: only a scale is gated', () => {
    const offenders = gatedPresses.filter(
      l => !/\bscale\b/.test(l.text) && !LEFT_TO_OWNERS.includes(l.file),
    );
    expect(offenders.map(l => `${l.file}:${l.line} ${l.text}`)).toEqual([]);
  });

  it('names only files that still have the old line, so the list of leftovers can only shrink', () => {
    const still = new Set(gatedPresses.filter(l => !/\bscale\b/.test(l.text)).map(l => l.file));
    for (const file of LEFT_TO_OWNERS) expect(still.has(file), file).toBe(true);
  });

  it('keeps the steppers’ spring still under reduce motion, because a scale is motion', () => {
    const scales = gatedPresses.filter(l => /\bscale\b/.test(l.text)).map(l => l.file);
    expect(scales).toEqual(
      expect.arrayContaining([
        'packages/ui/src/components/NumberStepper.tsx',
        'packages/ui/src/components/RoundStepper.tsx',
      ]),
    );
  });

  it('dims the controls every screen is made of, whatever the theme', () => {
    const ui = (f: string) =>
      readFileSync(join(root, 'packages', 'ui', 'src', 'components', f), 'utf8');
    expect(ui('IconButton.tsx')).toContain('opacity: disabled ? 0.5 : pressed ? 0.8 : 1');
    expect(ui('Chip.tsx')).toContain('opacity: disabled ? 0.5 : pressed ? 0.85 : 1');
    expect(ui('SegmentedControl.tsx')).toContain('opacity: pressed && !on ? 0.7 : 1');
  });
});
