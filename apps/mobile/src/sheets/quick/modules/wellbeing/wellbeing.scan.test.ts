/**
 * THE HEALTH NOTE'S WORDING GUARD (the owner's brief, 2026-10-08; CLAUDE.md §2 rules 1 to 3 and 6).
 *
 * Every string a parent or a clinician can read about a Health note — its sheet, its chips, its
 * look back, and its section of the pediatrician sheet — is read here out of the source and held to
 * `WELLBEING_BANNED` (`packages/core/src/wellbeing/wellbeing.banned.ts`): no diagnosis, condition,
 * symptom, allergy, reaction, cause, likelihood or alarm, and nothing called normal or abnormal. The
 * shape is `foresight.banned.ts`'s and `schedule/labels.test.ts`'s scan: comments out, then every
 * string and template literal, and the list itself is data in a file the scan does not read.
 *
 * A file the feature adds is read here by the folder it is in, so a new one cannot slip past; and
 * the scan proves it is not vacuous by finding the words it knows are there and by catching the
 * sentence it exists to stop.
 */
import { WELLBEING_BANNED } from '@nibblecue/core';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../../../../../../..');

/** The source of a feature file, with its comments taken out: a comment may explain a rule. */
const code = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Every string and template literal in it — what can reach a screen, a page or a share. */
const strings = (source: string): string[] =>
  [...source.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map(m => m[2] ?? '');

const sourcesIn = (dir: string): string[] =>
  readdirSync(dir)
    .filter(f => /\.tsx?$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.banned.ts'))
    .map(f => join(dir, f));

/** The Health note's copy, wherever it is drawn from. */
const FILES: readonly string[] = [
  // the words, the look back and the sheet's section, in core
  ...sourcesIn(join(ROOT, 'packages/core/src/wellbeing')),
  // the pediatrician sheet that draws the section, and every other one beside it
  join(ROOT, 'packages/core/src/reports/visitSheet.ts'),
  // the sheet and its look back, in the app
  join(here, '../WellbeingSheet.tsx'),
  ...sourcesIn(here),
];

const hits = (text: string): string[] =>
  WELLBEING_BANNED.filter(re => re.test(text)).map(re => re.source);

describe('the Health note says what was seen and what was logged, and nothing about why', () => {
  const all = FILES.map(path => ({ path, said: strings(code(path)) }));

  it('reads the files it claims to read (the scan is not vacuous)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(7);
    const every = all.flatMap(f => f.said);
    for (const known of ['Logged before this', 'first time logged', 'Rash', 'in your own words'])
      expect(
        every.some(s => s.includes(known)),
        known,
      ).toBe(true);
  });

  it('catches the sentence it exists to stop', () => {
    expect(hits('This food may be the cause of the reaction')).not.toEqual([]);
    expect(hits('Likely an allergy')).not.toEqual([]);
    expect(hits('Not a normal rash')).not.toEqual([]);
    // and lets the plain word through
    expect(hits('Logged because you tapped it')).toEqual([]);
  });

  it('no string in the sheet, the look back or the pediatrician section uses a banned word', () => {
    for (const { path, said } of all) {
      for (const s of said) expect(hits(s), `${path.slice(ROOT.length)}: ${s}`).toEqual([]);
    }
  });
});
