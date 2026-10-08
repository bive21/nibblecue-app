/**
 * `isRemindable` (2026-09-28): the registry's `remindable`, asked by every road a reminder takes to
 * a phone. The rows themselves are the registry's; what is held here is that the question reads
 * them and nothing else, and that it fails closed for a kind the registry does not know.
 */
import { describe, expect, it } from 'vitest';
import { isRemindable, MODULE_BY_ID, MODULES, RETIRED_MODULES } from './module-registry';

describe('isRemindable', () => {
  it('is the registry’s own word for every live module', () => {
    for (const m of MODULES) expect(isRemindable(m.id), m.id).toBe(m.remindable);
  });

  it('says no for diaper, growth, temperature and tummy time — the four the Reminders page has no row for', () => {
    expect(['diaper', 'growth', 'temp', 'tummy'].filter(isRemindable)).toEqual([]);
    // and yes for the kinds a parent can turn down there
    expect(
      ['bottle', 'breastfeed', 'pump', 'sleep', 'solids', 'med', 'bath', 'vaccine', 'stash'].every(
        isRemindable,
      ),
    ).toBe(true);
  });

  it('says no for a retired module and for a kind the registry does not know', () => {
    for (const m of RETIRED_MODULES) expect(isRemindable(m.id), m.id).toBe(false);
    expect(isRemindable('feeding')).toBe(false);
    expect(isRemindable('')).toBe(false);
    // the premise: the lookup the rest of the app uses knows every live and retired id
    expect(Object.keys(MODULE_BY_ID)).toHaveLength(MODULES.length + RETIRED_MODULES.length);
  });
});
