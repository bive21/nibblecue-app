import { describe, expect, it } from 'vitest';
import {
  isModuleVariant,
  moduleLabelFor,
  moduleWordFor,
  variantsFromRows,
  variantsOf,
} from './variants';

describe('a module’s second life (tummy time → playtime)', () => {
  it('only tummy time has one, and only playtime', () => {
    expect(variantsOf('tummy')).toEqual(['playtime']);
    expect(variantsOf('sleep')).toEqual([]);
    expect(isModuleVariant('playtime')).toBe(true);
    expect(isModuleVariant('floor time')).toBe(false);
    expect(isModuleVariant(null)).toBe(false);
  });

  it('changes the word and only the word', () => {
    expect(moduleLabelFor({}, 'tummy')).toBe('Tummy time');
    expect(moduleLabelFor({ tummy: 'playtime' }, 'tummy')).toBe('Playtime');
    expect(moduleWordFor({ tummy: 'playtime' }, 'tummy')).toBe('playtime');
    expect(moduleWordFor({}, 'tummy')).toBe('tummy time');
    // every other module reads the registry, variants or not
    expect(moduleLabelFor({ tummy: 'playtime' }, 'sleep')).toBe('Sleep');
    expect(moduleLabelFor({}, 'nothing-like-this')).toBe('nothing-like-this');
  });

  it('reads the settings rows, and an unknown or misplaced value is the plain module', () => {
    expect(
      variantsFromRows([
        { module_id: 'tummy', variant: 'playtime' },
        { module_id: 'sleep', variant: 'playtime' }, // not a sleep variant
        { module_id: 'bath', variant: 'splash' }, // not a variant at all
        { module_id: 'bottle', variant: null },
      ]),
    ).toEqual({ tummy: 'playtime' });
    expect(variantsFromRows([])).toEqual({});
  });
});
