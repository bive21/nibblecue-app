import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { atOnceLabel, bornOn, childDetail } from './childSwitcher';

const NOW = new Date(2026, 8, 14, 12).getTime(); // Sept 14, 2026, local noon

describe('the child switcher (DESIGN_SYSTEM.md §14, the prototype SHEETS.children)', () => {
  it('names the all-children row after the household size', () => {
    expect(atOnceLabel(2)).toBe('Both at once');
    expect(atOnceLabel(3)).toBe('All 3 at once');
  });

  it('writes the birth date as a local date, never the UTC day before', () => {
    expect(bornOn('2026-05-01', 'en-US')).toBe('May 1, 2026');
    expect(bornOn('2026-01-01', 'en-US')).toBe('Jan 1, 2026');
  });

  it('leaves a string that is not a date alone rather than printing Invalid Date', () => {
    expect(bornOn('unknown', 'en-US')).toBe('unknown');
  });

  it('composes the age and the birth date with a middle dot', () => {
    expect(childDetail('2026-05-14', NOW, 'en-US')).toBe('4 months · born May 14, 2026');
    expect(childDetail('2026-09-13', NOW, 'en-US')).toBe('1 day · born Sep 13, 2026');
  });
});

/**
 * TWINS "BOTH" (the owner, 2026-09-25, of the "that's cool" list; idea #8): the chip draws Both
 * as the babies' own discs, splitting from the one avatar and merging back (packages/ui
 * `childPair.test.ts` has the picture). STRUCTURE, NOT LOGIC — tripwires over the two files that
 * feed it, for the reason `screens/today/todayCards.test.ts` records: there is no renderer here.
 */
describe('Both, as the babies themselves', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const flat = (f: string) =>
    readFileSync(join(here, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
      .replace(/\s+/g, ' ');

  it('hands the chip every baby’s initial and face, only for Both, beside the chip’s own', () => {
    const screen = flat('Screen.tsx');
    expect(screen).toContain(
      // (no month-day hat on each disc: NibbleCue has no celebrations)
      '...(child.isAll ? { faces: child.children.map(c => { const face = child.photoOf(c.id); return { initial: initialOf(c.name), ...(face !== null ? { photoUri: face } : {}), }; }), } : {}),',
    );
    // the chip keeps what it was handed before, and the bar keeps its id
    expect(screen).toContain('isBoth: child.isAll,');
    expect(screen).toContain('...(child.photoUri !== null ? { photoUri: child.photoUri } : {}),');
    expect(screen).toContain('testID="topbar"');
  });

  it('is felt when a choice changes something — a tap, as a chip chosen is — and not otherwise', () => {
    const sheet = flat('ChildSwitcherSheet.tsx');
    expect(sheet).toContain(
      "const choose = (id: ChildSelectionId) => { if (id !== selectedId) haptic('tap'); select(id);",
    );
    expect(sheet.match(/haptic\(/g)).toHaveLength(1);
  });

  it('keeps every id the switcher had', () => {
    const sheet = flat('ChildSwitcherSheet.tsx');
    for (const id of [
      'testID="childswitcher"',
      'testID="childswitcher.ask"',
      'testID="childswitcher.both"',
      'testID={`childswitcher.${c.id}`}',
      'testID="childswitcher.add"',
    ])
      expect(sheet).toContain(id);
  });
});
