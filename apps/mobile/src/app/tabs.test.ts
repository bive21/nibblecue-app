import { describe, expect, it } from 'vitest';
import { tabItems, tabKeyOf, TAB_ORDER, TAB_ROUTE } from './tabs';

describe('the tab bar (docs/PRODUCT.md)', () => {
  it('is Today, Plan, Foods, Shopping and More, with CuddleCue’s glyphs', () => {
    const items = tabItems();
    expect(items.map(i => i.key)).toEqual(['today', 'plan', 'foods', 'shopping', 'more']);
    expect(items.map(i => i.label)).toEqual(['Today', 'Plan', 'Foods', 'Shopping', 'More']);
    expect(items.map(i => i.icon)).toEqual([
      'tab-home-regular',
      'tab-schedule-regular',
      'solids',
      'tab-shopping-regular',
      'tab-more-regular',
    ]);
  });

  it('maps every tab to a route and back', () => {
    for (const key of TAB_ORDER) expect(tabKeyOf(TAB_ROUTE[key])).toBe(key);
    expect(tabKeyOf('Food')).toBeNull();
  });
});
