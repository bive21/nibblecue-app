/**
 * The door exists, in both places, and only for those the server would let through. Tripwires
 * over the source, because this suite has no renderer (`packages/ui/components/interaction.test.ts`
 * records why that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');
const family = read('../../screens/more/FamilyScreen.tsx');
const switcher = read('../../app/ChildSwitcherSheet.tsx');
const shell = read('../../app/ShellProvider.tsx');
const sheet = read('./AddChildSheet.tsx');
/** Whitespace flattened, so Prettier's line breaks are never read as behavior changes. */
const flatSheet = sheet.replace(/\s+/g, ' ');

describe('adding a child after setup (docs/MULTIPLES.md §8)', () => {
  it('has a door on Family and one on the switcher, and both open the one sheet', () => {
    expect(family).toContain('testID="family.children"');
    expect(family).toContain('testID="family.add_child"');
    expect(family).toContain('onPress={shell.openAddChild}');
    expect(switcher).toContain('testID="childswitcher.add"');
    expect(switcher).not.toContain('Not in this build yet');
    expect(switcher).toContain('shell.openAddChild();');
    expect(shell).toContain(
      "<AddChildSheet visible={ov?.kind === 'addChild'} onClose={closeOverlay} />",
    );
  });

  it('shows the button to a parent or owner only — the server would refuse anyone else', () => {
    const idx = family.indexOf('testID="family.add_child"');
    const before = family.slice(idx - 400, idx);
    expect(before).toContain('canAdmin ? (');
    // the switcher's row too, now that it is the door (the owner, 2026-09-26): the rule came with
    // it from the profile menu, and it is the same one Family uses
    const row = switcher.indexOf('testID="childswitcher.add"');
    expect(switcher.slice(row - 500, row)).toContain('{ask !== null || !canAddChild ? null : (');
    expect(switcher).toContain("const canAddChild = role === 'OWNER' || role === 'PARENT';");
  });

  it('closes the switcher before opening the sheet, never a sheet on a sheet', () => {
    const idx = switcher.indexOf('shell.openAddChild();');
    expect(switcher.slice(idx - 120, idx)).toContain('onClose();');
  });

  it('adds the child on the server first and copies rhythms only once it exists', () => {
    const add = sheet.indexOf('await api.addChild(');
    const copy = sheet.indexOf('await copyRulesToChild(');
    expect(add).toBeGreaterThan(0);
    expect(copy).toBeGreaterThan(add);
    // and a failed add returns before any copy, with a sentence for the offline case
    expect(sheet.slice(add, copy)).toContain('if (!r.ok) {');
    expect(sheet).toContain('Try again when you are online.');
  });

  it('offers the copy as a toggle whose default follows the dates, and says whose rhythms', () => {
    expect(sheet).toContain('suggestCopyRhythms(');
    expect(sheet).toContain('copySourceFor(');
    expect(sheet).toContain('testID="addchild.copy"');
    expect(sheet).toContain('`Start with ${source.name}’s rhythms`');
    // the parent's own choice is never overwritten by the default
    expect(flatSheet).toContain('copy ?? (');
  });

  // (CuddleCue's docs/MULTIPLES.md is not in NibbleCue's repository; the sheet's half stays)
  it('is not gated', () => {
    expect(sheet).not.toMatch(/openGate|can\(|limitFor\(/);
  });
});
