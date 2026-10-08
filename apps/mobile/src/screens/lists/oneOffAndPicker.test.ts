/**
 * TWO SHOPPING LIST ASKS FROM THE OWNER, 2026-09-29, held here where they cannot be run in node.
 *
 *  - "no need to show the quantity next to the checklist icon, just show that it's been added to
 *    the shop cart, and qty can be adjusted directly from shopping cart": the supply picker's pill
 *    says it is on the list, the way the Supplies page's does, and never how many.
 *  - "if user finished typing then click elsewhere on the screen it stays in the box, not added to
 *    cart": a one-off goes on when the typing is done, by Enter or by leaving the field, and Enter
 *    then leaving is one line, not two.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SUPPLIES } from '../../lists/copy';

const here = dirname(fileURLToPath(import.meta.url));
const flat = (path: string): string =>
  readFileSync(join(here, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

describe('the supply picker says a supply is on the list, not how many', () => {
  const picker = flat('../../sheets/lists/SupplyPickerSheet.tsx');

  it('draws the same pill as the Supplies page', () => {
    expect(picker).toContain('label={SUPPLIES.onListPill}');
    expect(SUPPLIES.onListPill).toBe('On list');
  });

  it('never puts the quantity on the pill', () => {
    expect(picker).not.toMatch(/label=\{qty === null \? '' : String\(qty\)\}/);
    expect(picker).not.toContain('String(qty)');
  });
});

describe('a one-off is an action in the add sheet', () => {
  const screen = flat('ShoppingScreen.tsx');
  const picker = flat('../../sheets/lists/SupplyPickerSheet.tsx');

  it('an empty name adds nothing, and a second tap waits for the write', () => {
    expect(screen).toContain('const addingOneOff = useRef(false);');
    expect(screen).toContain('addingOneOff.current) return;');
    expect(screen).toMatch(/const clean = title\.trim\(\); if \(clean\.length === 0 \|\|/);
    expect(screen).toMatch(
      /addingOneOff\.current = true; try \{ await putOneOff\(clean\); \} finally \{ addingOneOff\.current = false; \}/,
    );
  });

  it('the empty search focuses the field, and a typed name uses the one-off write', () => {
    expect(picker).toContain('searchRef.current?.focus()');
    expect(picker).toContain('onOneOff(typed)');
    expect(picker).toContain('SUPPLIES.oneOffEmpty');
    expect(picker).toContain('SUPPLIES.oneOffAdd(typed)');
  });

  it('the helper says what a one-off is without a dash', () => {
    // Add item no longer carries "Supplies or one-offs"; the picker's own hints still do the job
    // says where to type (the owner, 2026-10-06)
    expect(SUPPLIES.oneOffEmptyHint).toBe('Type it in the search box above, then tap here');
    expect(SUPPLIES.oneOffTypedHint).toBe('Just for this grocery list');
    expect(SUPPLIES.pickerNone).toBe('No matching supplies');
    expect(SUPPLIES.pickerNoneHint).toBe('Try a different search term or add it as a one-off.');
    expect(picker).toContain('SUPPLIES.pickerNoneHint');
    expect(SUPPLIES.oneOffEmptyHint).not.toMatch(/[‒–—―]| - /);
    expect(SUPPLIES.pickerNoneHint).not.toMatch(/[‒–—―]| - /);
  });
});
