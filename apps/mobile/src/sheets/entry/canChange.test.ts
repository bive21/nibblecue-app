/**
 * WHO IS OFFERED A CHANGE OR A DELETE (`canChangeEntry`): the entry sheet's Save and Delete, and
 * since 2026-09-29 the Delete behind a swiped row of Today's log and of the Activity log. One rule,
 * so a row offers Delete exactly where the sheet does. Walked through every role here.
 */
import { Role } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { canChangeEntry } from './canChange';

const ME = 'user-me';
const THEM = 'user-them';

describe('who may change or delete an entry, as the phone offers it', () => {
  it('lets an owner or a parent change anybody’s entry', () => {
    for (const role of ['OWNER', 'PARENT'] as const) {
      expect(canChangeEntry(role, ME, ME), role).toBe(true);
      expect(canChangeEntry(role, THEM, ME), role).toBe(true);
    }
  });

  it('lets a caregiver change their own entry and nobody else’s', () => {
    expect(canChangeEntry('CAREGIVER', ME, ME)).toBe(true);
    expect(canChangeEntry('CAREGIVER', THEM, ME)).toBe(false);
  });

  it('never offers a change to a view-only member for an entry that is not their own', () => {
    expect(canChangeEntry('VIEW_ONLY', THEM, ME)).toBe(false);
  });

  it('offers a view-only member an entry they logged themselves, exactly as the sheet always has', () => {
    // somebody moved from caregiver to view only still sees their old entries as theirs here; the
    // write itself refuses them before anything is written (`mayChangeEntry` in data/entries.ts),
    // with the refusal's sentence. Kept as the sheet had it: this rule was shared, not changed.
    expect(canChangeEntry('VIEW_ONLY', ME, ME)).toBe(true);
  });

  it('is no refusal while the role has not loaded: the write asks the server’s question then', () => {
    expect(canChangeEntry(undefined, THEM, ME)).toBe(true);
    expect(canChangeEntry(undefined, null, null)).toBe(true);
  });

  it('never matches an entry to nobody: no signed-in viewer, or no entry read yet', () => {
    expect(canChangeEntry('CAREGIVER', ME, null)).toBe(false);
    expect(canChangeEntry('CAREGIVER', null, ME)).toBe(false);
    expect(canChangeEntry('CAREGIVER', null, null)).toBe(false);
  });

  it('knows every role the household has', () => {
    // a role added to the schema must be decided here, not fall through by accident
    expect([...Role.options].sort()).toEqual(['CAREGIVER', 'OWNER', 'PARENT', 'VIEW_ONLY']);
  });
});
