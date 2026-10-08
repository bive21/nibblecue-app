/**
 * THE OWNER'S STORAGE-PLACE DRAWINGS ARE IN THE BUNDLE, held as a test rather than as a memory
 * of having looked. Metro resolves a missing asset import to `undefined` and `<Image>` then
 * draws nothing at all, with no error anywhere — so the only cheap place to catch it is here,
 * against the same relative path `stashArt.ts` imports.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STASH_ICON_PX, STASH_ICON_SIZE } from './stashArt.generated';

const FILE: Record<string, string> = {
  ROOM: 'room',
  FRIDGE: 'fridge',
  FREEZER: 'freezer',
  DEEP_FREEZER: 'deepfreezer',
  THAWED: 'thawed',
};

describe('the storage-place icons', () => {
  const kinds = Object.keys(STASH_ICON_SIZE);

  it('has one for every storage kind the database knows', () => {
    // thawing was the one left on a line glyph, on the reading that it is a state rather than a
    // place; the owner drew it too (2026-09-19), and a set with one odd member was what that cost
    expect(kinds.sort()).toEqual(['DEEP_FREEZER', 'FREEZER', 'FRIDGE', 'ROOM', 'THAWED']);
  });

  it('ships a file for every one, at the path the module imports', () => {
    for (const kind of kinds) {
      const file = join(__dirname, '..', '..', 'assets', 'stash-kinds', `${FILE[kind]}.png`);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size, kind).toBeGreaterThan(512);
    }
  });

  /**
   * FITTED TO ONE BOX, which is what makes them a set. Untrimmed, the snowflake reads twice the
   * weight of the fridge; trimmed and fitted, the four sit at the same size on the screen.
   */
  it('fits every drawing into the same box', () => {
    for (const [kind, size] of Object.entries(STASH_ICON_SIZE)) {
      expect(size.width, kind).toBe(STASH_ICON_PX);
      expect(size.height, kind).toBe(STASH_ICON_PX);
    }
  });
});
