/**
 * A MODULE'S WORD COMES FROM THE HOUSEHOLD, on every surface that can show the one module a
 * household can rename (`useModuleLabels`; `packages/core/src/modules/variants.ts`). A screen
 * that reads `MODULE_BY_ID[…].label` for a tile, a sheet title or a row would say "Tummy time"
 * to a household that graduated to playtime — on the one screen beside five that say the other
 * word. So the surfaces that can name it are listed here, and each has to read through the hook.
 *
 * Onboarding is not on the list: it runs before there is a baby old enough to have graduated,
 * and the registry's word is the right one to set up with. Nor are the surfaces a tummy-time row
 * can never reach (the interval offers, the reminders — tummy time reminds nobody).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');

/*
  NibbleCue's surfaces that can name a module. CuddleCue's Tummy sheet, running panel, rhythm
  sheet, Log, Today, Schedule, Routine, What you track, coins, import, catch-up, tour and guides
  are not in NibbleCue; its Help sheet (`sheets/HelpSheet.tsx`, NibbleCue's own) names no module.
*/
const NAMES_THE_MODULE: readonly string[] = [
  'app/QuickEntrySheet.tsx',
  'sheets/quick/CareEditSheet.tsx',
  'sheets/quick/QuickEditSheet.tsx',
  'sheets/quick/useTimerActions.ts',
  'sheets/quick/edit/EditEntrySheet.tsx',
];

describe('the household’s word for a module', () => {
  for (const file of NAMES_THE_MODULE) {
    it(`${file} reads it through useModuleLabels, never the registry`, () => {
      const src = readFileSync(join(app, file), 'utf8');
      expect(src).toContain('useModuleLabels');
      expect(src).not.toMatch(/MODULE_BY_ID\[[^\]]+\]\??\.label/);
      expect(src).not.toContain("'Tummy time'");
      expect(src).not.toContain("'tummy time'");
    });
  }

  it('the pure helpers take the word from their caller rather than the registry', () => {
    // (CuddleCue's `screens/today/nextCard.ts` is not in NibbleCue; its rows helper still is)
    const rows = readFileSync(join(app, 'screens/today/rows.ts'), 'utf8');
    expect(rows).toContain("c.moduleLabel?.('tummy')");
  });

  it('NibbleCue’s own pages never type a module’s word or read it from the registry', () => {
    for (const dir of ['screens/nibble', 'nibble']) {
      for (const name of readdirSync(join(app, dir)).filter(n => /\.tsx?$/.test(n))) {
        const src = readFileSync(join(app, dir, name), 'utf8');
        expect(src, `${dir}/${name}`).not.toMatch(/MODULE_BY_ID\[[^\]]+\]\??\.label/);
        expect(src, `${dir}/${name}`).not.toMatch(/'[Tt]ummy time'/);
      }
    }
  });
});
