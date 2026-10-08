/**
 * The catalog's own arithmetic and words. Every claim here is about the household's own rows:
 * what a thing is called, which category it files under, what a search finds, and how long it
 * has been since they recorded buying it. Nothing consults the baby's log.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  daysApart,
  runningLow,
  searchSupplies,
  supplyCategory,
  supplyLabel,
  normalizeShop,
  sameShop,
  shopsUsed,
  supplyIcon,
  ANY_SHOP,
  catalogSections,
  SUPPLY_CATEGORIES,
  SUPPLY_ICON,
  type SupplyItem,
} from './index';

const item = (over: Partial<SupplyItem> = {}): SupplyItem => ({
  id: 's1',
  category: 'DIAPERS',
  brand: 'Pampers',
  product: 'Swaddlers',
  variant: 'Size 3 (16–28 lb)',
  pack: '84-count box',
  store: 'Target',
  notes: 'The green pack, not the blue one.',
  url: null,
  lastBoughtOn: null,
  ...over,
});

const TODAY = '2026-09-15';

describe('what an item is called', () => {
  it('joins the brand and the line, and never renders an em dash as a name', () => {
    expect(supplyLabel(item())).toBe('Pampers Swaddlers');
    expect(supplyLabel(item({ brand: null }))).toBe('Swaddlers');
    expect(supplyLabel(item({ product: null }))).toBe('Pampers');
    // the prototype writes "—" for "no brand"; it is not a word a person reads
    expect(supplyLabel(item({ brand: '—', product: 'Bodysuits' }))).toBe('Bodysuits');
    expect(supplyLabel(item({ brand: null, product: null }))).toBe('Item');
  });
});

describe('the categories', () => {
  it('every category has its own words for size and a known glyph', () => {
    for (const c of SUPPLY_CATEGORIES) {
      expect(c.sizeLabel.length, c.id).toBeGreaterThan(0);
      expect(c.icon.length, c.id).toBeGreaterThan(0);
    }
    expect(supplyCategory('NIPPLES').sizeLabel).toBe('Flow level');
    // a category from a later release files under Other rather than crashing a screen
    expect(supplyCategory('SOMETHING_NEW').id).toBe('OTHER');
  });
});

describe('the picker’s search', () => {
  const items = [
    item({ id: 'a' }),
    item({
      id: 'b',
      category: 'WIPES',
      brand: 'WaterWipes',
      product: 'Original',
      variant: '60 per pack',
      store: 'Costco',
    }),
    item({
      id: 'c',
      category: 'FORMULA',
      brand: 'Enfamil',
      product: 'NeuroPro',
      variant: 'Stage 1',
      store: 'Walmart',
    }),
  ];

  it('matches the brand, the size, the shop and the category’s own name', () => {
    expect(searchSupplies(items, 'water', null).map(x => x.id)).toEqual(['b']);
    expect(searchSupplies(items, 'costco', null).map(x => x.id)).toEqual(['b']);
    expect(searchSupplies(items, 'size 3', null).map(x => x.id)).toEqual(['a']);
    expect(searchSupplies(items, 'formula', null).map(x => x.id)).toEqual(['c']);
    expect(searchSupplies(items, '', null)).toHaveLength(3);
  });

  it('narrows to one category, and an empty search inside it still lists it', () => {
    expect(searchSupplies(items, '', 'WIPES').map(x => x.id)).toEqual(['b']);
    expect(searchSupplies(items, 'enfamil', 'WIPES')).toEqual([]);
  });
});

describe('the last-bought date', () => {
  it('counts calendar days', () => {
    expect(daysApart('2026-09-06', TODAY)).toBe(9);
    expect(daysApart('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('what has not been bought for a while', () => {
  it('is elapsed days against the category’s window, longest first', () => {
    const low = runningLow(
      [
        item({ id: 'diapers', lastBoughtOn: '2026-08-30' }), // 16 days, window 14
        item({ id: 'wipes', category: 'WIPES', lastBoughtOn: '2026-09-10' }), // 5, window 21
        item({ id: 'formula', category: 'FORMULA', lastBoughtOn: '2026-08-01' }), // 45, window 14
      ],
      new Set(),
      TODAY,
    );
    expect(low.map(l => [l.item.id, l.days])).toEqual([
      ['formula', 45],
      ['diapers', 16],
    ]);
  });

  it('never suggests what is already on the list, what was never bought, or a one-off', () => {
    const items = [
      item({ id: 'diapers', lastBoughtOn: '2026-08-01' }),
      item({ id: 'never', category: 'FORMULA', lastBoughtOn: null }),
      // clothing has no restock window: a size is not a thing you run out of
      item({ id: 'clothes', category: 'CLOTHING', lastBoughtOn: '2020-01-01' }),
    ];
    expect(runningLow(items, new Set(['diapers']), TODAY)).toEqual([]);
    expect(runningLow(items, new Set(), TODAY).map(l => l.item.id)).toEqual(['diapers']);
  });

  it('stops at the limit, so the section stays a hint rather than a second list', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      item({ id: `i${i}`, lastBoughtOn: '2026-01-01' }),
    );
    expect(runningLow(many, new Set(), TODAY)).toHaveLength(4);
    expect(runningLow(many, new Set(), TODAY, 2)).toHaveLength(2);
  });
});

/**
 * A GLYPH PER SHELF, and the tripwire that keeps it that way. A catalog is read by its pictures
 * before it is read by its words, so a category that arrived without one — drawn as `Other`
 * beside fourteen that are themselves — is a defect the eye finds and no type error does.
 */
describe('the category glyph', () => {
  it('draws every category, and nothing it does not have', () => {
    for (const c of SUPPLY_CATEGORIES) {
      expect(SUPPLY_ICON[c.id], c.id).toBeDefined();
      expect(supplyIcon(c.id), c.id).toBe(SUPPLY_ICON[c.id]);
    }
    expect(Object.keys(SUPPLY_ICON).sort()).toEqual(SUPPLY_CATEGORIES.map(c => c.id).sort());
  });

  it('gives an id it does not know Other rather than nothing', () => {
    expect(supplyIcon('A_CATEGORY_FROM_A_LATER_RELEASE')).toBe('supply-other');
  });

  /**
   * SIX BORROW THE LOG'S GLYPHS (the owner, 2026-09-19 and 2026-09-22): a parent already knows
   * what a diaper, a bottle, a medicine, a bath, a pump and a breast look like from the tiles
   * they tap all day, and a second drawing of each was a thing to learn twice. They are still
   * one glyph each — the module's glyph IS that category's glyph now.
   */
  it('borrows the log’s own glyph where the log has one', () => {
    expect(supplyIcon('DIAPERS')).toBe('diaper');
    expect(supplyIcon('BOTTLES')).toBe('bottle');
    expect(supplyIcon('VITAMINS')).toBe('med');
    expect(supplyIcon('BATH')).toBe('bath');
    expect(supplyIcon('PUMP_PARTS')).toBe('pump');
    expect(supplyIcon('NURSING')).toBe('breast');
    // and only there: the kit's drawings stay for the shelves the log has no tile for
    expect(supplyIcon('WIPES')).toBe('supply-wipes');
    expect(supplyIcon('FORMULA')).toBe('supply-formula');
  });

  /**
   * AND EVERY BORROWED ONE IS AN ILLUSTRATION, not a line glyph. That is the reason the borrow is
   * worth making twice: `ILLUSTRATED_NAMES` is the set the owner has drawn as full-color pictures,
   * so a borrowed name arrives on the shelf as the picture the module tile shows, while a
   * `supply-*` name can only ever be the kit's flat drawing. A future borrow that pointed at a
   * name with no picture would be a downgrade dressed as a tidy-up, and this catches it.
   */
  it('borrows only names the owner has drawn as pictures', () => {
    const borrowed = Object.values(SUPPLY_ICON).filter(n => !n.startsWith('supply-'));
    expect(borrowed.sort()).toEqual(['bath', 'bottle', 'breast', 'diaper', 'med', 'pump']);
    // read off disk rather than imported: `packages/core` may not depend on `packages/ui`. One
    // folder per drawn size (`ILLUSTRATED_TIERS`), and every one of them must hold the picture —
    // as `<name>@2x.png` and `<name>@3x.png`, since the tiers ship no 1× file (2026-09-26). They
    // were lossless WebP from 2026-09-28 to 2026-10-01, and an iPhone drew those as nothing.
    const rendered = resolve(__dirname, '../../../ui/src/icons/illustrated');
    const tiers = readdirSync(rendered);
    expect(tiers.length).toBeGreaterThan(0);
    for (const tier of tiers) {
      const drawn = new Set(
        readdirSync(resolve(rendered, tier))
          .filter(f => f.endsWith('.png'))
          .map(f => f.replace(/(@\d+x)?\.png$/, '')),
      );
      for (const name of borrowed) expect(drawn.has(name), `${name} at ${tier}`).toBe(true);
    }
  });

  it('is one glyph each, which is the whole reason it is not `icon`', () => {
    const drawn = SUPPLY_CATEGORIES.map(c => supplyIcon(c.id));
    expect(new Set(drawn).size).toBe(SUPPLY_CATEGORIES.length);
    // the module key it sits beside is deliberately coarser — three categories share `bottle`
    expect(new Set(SUPPLY_CATEGORIES.map(c => c.icon)).size).toBeLessThan(SUPPLY_CATEGORIES.length);
  });
});

/**
 * THE SHOP IS A NAME A PERSON TYPED, on whichever phone was nearest. The list groups by it, so
 * `target` and `Target` have to be one heading — and the heading has to be spelled the way a
 * person would, not lowercased into agreement.
 */
describe('where you buy it', () => {
  it('trims and collapses space, and treats blank as no shop at all', () => {
    expect(normalizeShop('  Whole   Foods ')).toBe('Whole Foods');
    expect(normalizeShop('')).toBeNull();
    expect(normalizeShop('   ')).toBeNull();
    expect(normalizeShop('—')).toBeNull();
    expect(normalizeShop(null)).toBeNull();
    expect(normalizeShop(undefined)).toBeNull();
  });

  it('keeps the case the parent typed — these are proper nouns', () => {
    expect(normalizeShop('CVS')).toBe('CVS');
    expect(normalizeShop('target')).toBe('target');
  });

  it('matches two spellings of one shop, and never matches no-shop', () => {
    expect(sameShop('Target', 'target')).toBe(true);
    expect(sameShop('Target', 'TARGET')).toBe(true);
    expect(sameShop('Target', 'Aldi')).toBe(false);
    expect(sameShop(null, null)).toBe(false);
    expect(sameShop('Target', null)).toBe(false);
  });

  it('offers the household its own shops back, once each, first spelling, alphabetical', () => {
    const items = [
      item({ store: 'Target' }),
      item({ store: 'aldi' }),
      item({ store: 'target' }),
      item({ store: null }),
      item({ store: '  ' }),
    ];
    expect(shopsUsed(items)).toEqual(['aldi', 'Target']);
  });
});

/**
 * THE THREE ORDERS, and the one rule they share: a section that has nothing in it is not drawn.
 * The chip row offers those categories instead, which is §2's reversal of "draw every shelf" —
 * the same invitation at a tenth of the height.
 */
describe('catalogSections', () => {
  const pampers = item({ id: 'a', brand: 'Pampers', category: 'DIAPERS', store: 'Target' });
  const huggies = item({ id: 'b', brand: 'Huggies', category: 'DIAPERS', store: 'target' });
  const aveeno = item({ id: 'c', brand: 'Aveeno', category: 'BATH', store: null });
  const all = [pampers, huggies, aveeno];

  it('by category: registry order, non-empty only, by name inside', () => {
    const s = catalogSections(all, 'category');
    expect(s.map(x => x.key)).toEqual(['DIAPERS', 'BATH']);
    expect(s[0]?.items.map(x => x.id)).toEqual(['b', 'a']);
    expect(s.every(x => x.items.length > 0)).toBe(true);
  });

  it('by category is the default, and an empty catalog has no sections at all', () => {
    expect(catalogSections(all)).toEqual(catalogSections(all, 'category'));
    expect(catalogSections([], 'category')).toEqual([]);
    expect(catalogSections([], 'az')).toEqual([]);
    expect(catalogSections([], 'shop')).toEqual([]);
  });

  it('A–Z: one heading per first letter, and anything that is not a letter last', () => {
    const numbered = item({ id: 'd', brand: '3M', category: 'OTHER' });
    const s = catalogSections([...all, numbered], 'az');
    expect(s.map(x => x.label)).toEqual(['A', 'H', 'P', '#']);
    expect(s.at(-1)?.items.map(x => x.id)).toEqual(['d']);
  });

  it('by shop: one group per shop however it was spelled, Any shop last', () => {
    const s = catalogSections(all, 'shop');
    // ONE group, spelled the way `shopsUsed` spells it — which is the way the Edit-supply
    // sheet's chips spell it, so the two screens never disagree about a shop's name
    expect(s.map(x => x.label)).toEqual(['Target', ANY_SHOP]);
    expect(s[0]?.label).toBe(shopsUsed(all)[0]);
    expect(s[0]?.items.map(x => x.id)).toEqual(['b', 'a']);
    expect(s[1]?.items.map(x => x.id)).toEqual(['c']);
  });

  it('never loses an item, whichever way it is read', () => {
    for (const order of ['category', 'az', 'shop'] as const) {
      const ids = catalogSections(all, order).flatMap(x => x.items.map(i => i.id));
      expect(ids.sort(), order).toEqual(['a', 'b', 'c']);
    }
  });
});
