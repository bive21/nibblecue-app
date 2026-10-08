import { lineLabel, lineTitle, type ShoppingLine } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { shoppingRowTitle } from './rowTitle';

const line = (over: Partial<ShoppingLine> = {}): ShoppingLine => ({
  id: 'l',
  title: 'Pampers Swaddlers',
  qty: 2,
  note: null,
  store: null,
  checkedAt: null,
  ...over,
});

describe('a shopping row names the item once', () => {
  it('leaves the quantity off the row and on the share line', () => {
    const l = line({ categoryLabel: 'Diapers', qty: 2 });
    expect(shoppingRowTitle(l)).toBe('Pampers Swaddlers');
    expect(lineTitle(l)).toBe('Diapers: Pampers Swaddlers ×2');
    expect(lineLabel({ title: 'Diapers', qty: 2 })).toBe('Diapers ×2');
  });

  it('keeps a name the parent typed that already says ×2', () => {
    expect(shoppingRowTitle(line({ title: 'Cards ×2', qty: 2 }))).toBe('Cards ×2');
  });
});
