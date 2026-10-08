/**
 * EVERY NATIVE MODAL IN THE APP GOES THROUGH THE GATE (packages/ui `modalGate.ts`; the owner,
 * 2026-10-06: "the screen froze again … make sure this problem doesn't exist anymore in any other
 * scenarios"). An iPhone left frozen twice in one day, each time by a sheet presented while another
 * was still being dismissed. The rule is one hook, `useModalGate`, and this scan holds it: a file that
 * draws a React Native `Modal` and does not ask the gate fails the build, so the next sheet, popover
 * or picker cannot bring the freeze back by being written without it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const roots = [join(here, '..'), join(here, '../../../../packages/ui/src')];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : walk(p);
    return p.endsWith('.tsx') && !p.includes('.test.') ? [p] : [];
  });
}

describe('every native modal is gated', () => {
  const files = roots.flatMap(walk).filter(p => /<Modal\b/.test(readFileSync(p, 'utf8')));

  it('finds the modals it is meant to hold', () => {
    const names = files.map(p => p.split('/').pop());
    for (const f of ['BottomSheet.tsx', 'Popover.tsx', 'timePicker.tsx', 'datePicker.tsx'])
      expect(names, f).toContain(f);
  });

  it('asks useModalGate wherever a Modal is drawn', () => {
    for (const p of files)
      expect(readFileSync(p, 'utf8'), relative(here, p)).toMatch(/useModalGate\(/);
  });

  it('gates the bottom sheet itself, which every sheet in the app is', () => {
    const sheet = readFileSync(
      join(here, '../../../../packages/ui/src/components/BottomSheet.tsx'),
      'utf8',
    );
    expect(sheet).toContain('const visible = useModalGate(asked, SHEET_DURATION_MS);');
  });
});
