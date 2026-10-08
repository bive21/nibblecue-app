/**
 * SUPPLIES — what this household actually buys (the prototype's `VIEWS.supplies`, §17; the
 * owner, 2026-09-15: "it categorizes everything that might be needed, and user can add the
 * brand, link, etc., then can be easily added … to shopping list that you can share").
 *
 * THE CATALOG AND THE LIST ARE TWO THINGS. The catalog is the household's standing knowledge —
 * Pampers Swaddlers, size 3, the green pack, 84 in a box, from Target — and it does not change
 * because somebody went shopping. The list is this trip. A line on the list points at a catalog
 * item (or carries its own title, for bananas), and finishing the trip records the buy against
 * the ITEM, which is how "last bought 9 days ago" can be true without a purchase history.
 *
 * THE PROBLEM IT SOLVES is the one the prototype names: a partner standing in an aisle in front
 * of eleven kinds of diaper. So every field here exists to get the right box: the size as
 * written on the pack, the count, the shop, the sentence that says which one is wrong, and a
 * link to the page. Nothing here is about the baby — no arithmetic on the log, no inference
 * about what a baby needs, and `runningLow` states elapsed days against the household's own
 * last-bought date and says so.
 */

/* --------------------------------- the categories --------------------------------- */

export interface SupplyCategory {
  id: string;
  label: string;
  /** What the size field is called here: a diaper has a size, a nipple has a flow level. */
  sizeLabel: string;
  /** What the pack field is called, or null where the category has no pack. */
  packLabel: string | null;
  /** The glyph, as `packages/ui`'s `IconName`. */
  icon: string;
  /**
   * Days after which a household that buys this regularly has usually bought it again. Used
   * ONLY by `runningLow`, which states the elapsed time and never predicts a need. `null` for
   * the categories nobody restocks on a rhythm (clothing sizes, one-off gear).
   */
  restockDays: number | null;
}

/** The order the Supplies screen draws, so the screen never rearranges between visits. */
export const SUPPLY_CATEGORIES: readonly SupplyCategory[] = [
  {
    id: 'DIAPERS',
    label: 'Diapers',
    sizeLabel: 'Size',
    packLabel: 'Count in pack',
    icon: 'diaper',
    restockDays: 14,
  },
  {
    id: 'WIPES',
    label: 'Wipes',
    sizeLabel: 'Pack',
    packLabel: 'Wipes per pack',
    icon: 'water',
    restockDays: 21,
  },
  {
    id: 'FORMULA',
    label: 'Formula',
    sizeLabel: 'Stage or type',
    packLabel: 'Tub size',
    icon: 'bottle',
    restockDays: 14,
  },
  {
    id: 'BOTTLES',
    label: 'Bottles',
    sizeLabel: 'Size',
    packLabel: 'How many',
    icon: 'bottle',
    restockDays: null,
  },
  {
    id: 'NIPPLES',
    label: 'Nipples and teats',
    sizeLabel: 'Flow level',
    packLabel: 'How many',
    icon: 'bottle',
    restockDays: 60,
  },
  {
    id: 'PACIFIER',
    label: 'Pacifiers',
    sizeLabel: 'Age size',
    packLabel: 'How many',
    icon: 'star',
    restockDays: 90,
  },
  {
    id: 'CREAM',
    label: 'Creams and balm',
    sizeLabel: 'Size',
    packLabel: 'Tub or tube',
    icon: 'med',
    restockDays: 45,
  },
  {
    id: 'BATH',
    label: 'Bath and skin',
    sizeLabel: 'Size',
    packLabel: 'Bottle size',
    icon: 'bath',
    restockDays: 45,
  },
  {
    id: 'LAUNDRY',
    label: 'Laundry',
    sizeLabel: 'Type',
    packLabel: 'Size',
    icon: 'bath',
    restockDays: 45,
  },
  {
    id: 'CLOTHING',
    label: 'Clothing sizes',
    sizeLabel: 'Current size',
    packLabel: null,
    icon: 'note',
    restockDays: null,
  },
  {
    id: 'MILK_STORAGE',
    label: 'Milk storage',
    sizeLabel: 'Size',
    packLabel: 'Count in box',
    icon: 'box',
    restockDays: 30,
  },
  {
    id: 'PUMP_PARTS',
    label: 'Pump parts',
    sizeLabel: 'Flange or part',
    packLabel: 'How many',
    icon: 'pump',
    restockDays: 60,
  },
  {
    id: 'NURSING',
    label: 'Nursing',
    sizeLabel: 'Size',
    packLabel: 'Count',
    icon: 'breast',
    restockDays: 60,
  },
  {
    id: 'VITAMINS',
    label: 'Vitamins',
    sizeLabel: 'Strength as written',
    packLabel: 'Bottle size',
    icon: 'med',
    restockDays: 30,
  },
  {
    id: 'OTHER',
    label: 'Other',
    sizeLabel: 'Size',
    packLabel: 'Pack',
    icon: 'cart',
    restockDays: null,
  },
];

export const SUPPLY_CATEGORY_IDS: readonly string[] = SUPPLY_CATEGORIES.map(c => c.id);

const BY_ID = new Map(SUPPLY_CATEGORIES.map(c => [c.id, c]));

/** The category, or `OTHER` for an id this build does not know — never undefined on a screen. */
export function supplyCategory(id: string): SupplyCategory {
  return BY_ID.get(id) ?? (SUPPLY_CATEGORIES[SUPPLY_CATEGORIES.length - 1] as SupplyCategory);
}

/* ----------------------------------- the item ----------------------------------- */

export interface SupplyItem {
  id: string;
  category: string;
  /** As written on the pack. Either this or `product` carries the name; both may be set. */
  brand: string | null;
  product: string | null;
  /** The size, in the category's own words: `Size 3 (16–28 lb)`, `Medium flow`. */
  variant: string | null;
  pack: string | null;
  store: string | null;
  /** The sentence that stops the wrong box coming home. */
  notes: string | null;
  /** The product page, so a tap in a message opens the right one. */
  url: string | null;
  /** `YYYY-MM-DD` in the household's zone, or null while it has never been recorded bought. */
  lastBoughtOn: string | null;
}

/** `Pampers Swaddlers` — the brand and the line, which is how a person says it in a shop. */
export function supplyLabel(x: Pick<SupplyItem, 'brand' | 'product'>): string {
  const parts = [x.brand, x.product]
    .map(s => (s ?? '').trim())
    .filter(s => s.length > 0 && s !== '—');
  return parts.length === 0 ? 'Item' : parts.join(' ');
}

/*
  THE CATALOG'S OLD ROW HELPERS WENT ON 2026-09-27: `supplyDetail` (size · pack · shop),
  `byCategory` (the catalog grouped by shelf) and `lastBoughtLabel` ("bought 9 days ago"). The
  Supplies and shopping redesign of 2026-09-19 (c1e28dd) stopped drawing all three, and nothing
  has read them since but their own tests.
*/

/**
 * The picker's filter: a category (or every one) and a word, matched against everything a
 * person might type — the brand, the line, the size, the shop and the category's own name.
 */
export function searchSupplies(
  items: readonly SupplyItem[],
  query: string,
  category: string | null,
): SupplyItem[] {
  const q = query.trim().toLowerCase();
  return items
    .filter(x => category === null || x.category === category)
    .filter(x => {
      if (q.length === 0) return true;
      const hay = [supplyLabel(x), x.variant, x.store, supplyCategory(x.category).label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    })
    .slice()
    .sort((a, b) => supplyLabel(a).localeCompare(supplyLabel(b)));
}

/* ------------------------------- the last-bought date ------------------------------- */

/** Whole days between two `YYYY-MM-DD` dates, by the calendar rather than by 24-hour steps. */
export function daysApart(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export interface LowSupply {
  item: SupplyItem;
  /** Days since the household last recorded buying it. */
  days: number;
}

/**
 * What has not been bought for longer than this household usually goes between buys.
 *
 * IT IS ARITHMETIC ON THEIR OWN RECORD, and the screen says so. It compares the elapsed days
 * against the category's restock window and lists what is past it — it does not look at the
 * baby's log, does not decide that a baby needs anything, and is never phrased as a prediction.
 * Anything already on the list is left out: suggesting what is in front of them is noise.
 */
export function runningLow(
  items: readonly SupplyItem[],
  onListIds: ReadonlySet<string>,
  today: string,
  limit = 4,
): LowSupply[] {
  return items
    .filter(x => !onListIds.has(x.id) && x.lastBoughtOn !== null)
    .map(x => ({ item: x, days: daysApart(x.lastBoughtOn as string, today) }))
    .filter(l => {
      const window = supplyCategory(l.item.category).restockDays;
      return window !== null && l.days >= window;
    })
    .sort((a, b) => b.days - a.days)
    .slice(0, limit);
}

/* ------------------------------- the drawn category ------------------------------- */

/**
 * THE CATEGORY'S OWN GLYPH, which is not the same thing as `SupplyCategory.icon`.
 *
 * `icon` is a MODULE key — `bottle`, `bath`, `med` — resolved through `MODULE_ICON` by the
 * screens that draw a category beside a module (setup's brand step does exactly that, and its
 * rows sit under the module they belong to). It is deliberately coarse: three categories share
 * `bottle` because three modules do.
 *
 * A CATALOG IS THE ONE PLACE THAT COARSENESS COSTS SOMETHING. Fifteen shelves drawn with eight
 * glyphs is a screen where Formula, Bottles and Nipples are the same picture, and the picture is
 * most of what a parent scanning a long page actually reads. The owner's brand kit ships one
 * glyph per category (the shopping brief §6), so this is the map to them — added BESIDE `icon`
 * rather than replacing it, because setup's rows still want the module's.
 *
 * The keys are `SUPPLY_CATEGORIES`' ids and the values are `packages/ui`'s `supply-*` icon
 * names; `supplies.test.ts` holds them to one another so a new category cannot arrive undrawn.
 */
export const SUPPLY_ICON: Readonly<Record<string, string>> = {
  /*
    SIX OF THESE ARE THE LOG'S OWN GLYPHS (the owner, 2026-09-19: "the diapers icon in supplies,
    can be the same as the diapers icon used in the log module, same with vitamins copying the
    current medicine icon, and bottles copying current bottle module icon"; extended 2026-09-22:
    "bath and skins can use the bath icons, pump parts can use pump icons, and nursing can use
    breastfeeding icons"). A parent has already learned what a diaper, a bottle, a medicine, a
    bath, a pump and a breast look like from the tiles they tap all day; the kit's alternatives
    for those six were a second drawing of a thing the app already had one for, and a catalog is
    read by its pictures before its words.

    AND SIX OF THE SIX ARE NOW ILLUSTRATED (`ILLUSTRATED_NAMES`), which the kit's flat `supply-*`
    glyphs are not — so the borrowed ones arrive on the shelf as the owner's own pictures at the
    catalog's size, which is the other half of why they read faster. The nine that stay have no
    module to borrow from and keep the kit's.
  */
  DIAPERS: 'diaper',
  WIPES: 'supply-wipes',
  FORMULA: 'supply-formula',
  BOTTLES: 'bottle',
  NIPPLES: 'supply-nipples',
  PACIFIER: 'supply-pacifiers',
  CREAM: 'supply-cream',
  BATH: 'bath',
  LAUNDRY: 'supply-laundry',
  CLOTHING: 'supply-clothing',
  MILK_STORAGE: 'supply-milk-storage',
  PUMP_PARTS: 'pump',
  NURSING: 'breast',
  VITAMINS: 'med',
  OTHER: 'supply-other',
};

/** The glyph for a category id, falling back to `Other`'s rather than to nothing. */
export const supplyIcon = (id: string): string => SUPPLY_ICON[id] ?? 'supply-other';

/* ---------------------------------- where you buy it ---------------------------------- */

/**
 * A shop name as it will be STORED and COMPARED. Trimmed, inner runs of space collapsed; the
 * case the parent typed is kept, because "Target" and "CVS" are names and a screen that
 * lowercased them would be correcting someone's spelling of a proper noun.
 *
 * Comparison is case-insensitive and lives in `sameShop`, so `target` typed on one phone and
 * `Target` on another are ONE group on the list rather than two headings a parent reads twice
 * (the shopping brief §3: "normalize shop names case-insensitively so grouping on the list
 * stays consistent").
 */
export const normalizeShop = (s: string | null | undefined): string | null => {
  const clean = (s ?? '').replace(/\s+/g, ' ').trim();
  return clean === '' || clean === '—' ? null : clean;
};

/** Whether two shop names are the same shop. Null is its own group, not a match for anything. */
export const sameShop = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/**
 * Every shop this household has already named, first spelling wins, alphabetical.
 *
 * FIRST SPELLING AND NOT LAST: the chip set in Edit supply is offering a parent their own
 * vocabulary back, and a list that re-cased itself as they typed would look like the app
 * arguing. What matters is that both spellings land in one group, and `sameShop` does that.
 */
export function shopsUsed(items: readonly Pick<SupplyItem, 'store'>[]): string[] {
  const seen = new Map<string, string>();
  for (const x of items) {
    const name = normalizeShop(x.store);
    if (name === null) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/* --------------------------------- how the catalog reads --------------------------------- */

/**
 * The three orders the catalog offers (the shopping brief §2). One function for all of them, so
 * the screen draws sections and never decides what a section IS.
 */
export type SupplyOrder = 'category' | 'az' | 'shop';

export interface CatalogSection {
  /** Stable across a re-sort — a category id, a letter, a shop's lowercased name. */
  key: string;
  label: string;
  items: SupplyItem[];
}

/** A–Z's heading: the first letter of the name, or `#` for anything that does not start with one. */
const initial = (x: SupplyItem): string => {
  const c = supplyLabel(x).trim().charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
};

const byName = (a: SupplyItem, b: SupplyItem): number =>
  supplyLabel(a).localeCompare(supplyLabel(b));

/**
 * The catalog as sections, in the order asked for. EMPTY SECTIONS ARE NEVER RETURNED — the
 * screen's chip row is what offers a category the household does not buy yet, and fifteen
 * full-width cards with a sentence in each is most of a catalog screen spent on things nobody
 * has ever bought (§2: "Do NOT render empty categories as cards"). That reverses the owner's
 * 2026-09-16 "create all the categories … even when there are no items"; the reason behind it
 * stands and the chips are the same answer at a tenth of the height.
 *
 * Within a section, always by name: a re-sort changes which headings there are, never the order
 * under one, so a parent who has learned where their brand sits does not lose it.
 */
export function catalogSections(
  items: readonly SupplyItem[],
  order: SupplyOrder = 'category',
): CatalogSection[] {
  if (order === 'category') {
    return SUPPLY_CATEGORIES.map(c => ({
      key: c.id,
      label: c.label,
      items: items.filter(x => x.category === c.id).sort(byName),
    })).filter(s => s.items.length > 0);
  }
  if (order === 'az') {
    const by = new Map<string, SupplyItem[]>();
    for (const x of [...items].sort(byName)) {
      const k = initial(x);
      by.set(k, [...(by.get(k) ?? []), x]);
    }
    // `#` last: a heading that is not a letter does not belong in the middle of the alphabet
    return [...by.entries()]
      .sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
      .map(([key, group]) => ({ key, label: key, items: group }));
  }
  /*
    THE HEADING IS SPELLED THE WAY THE SHEET SPELLS IT. `shopsUsed` resolves one name per shop
    from the catalog's own order, and the Edit-supply sheet offers that same list as its chips —
    so a household that typed `Target` once and `target` once sees ONE word in both places. Read
    off the unsorted items deliberately: sorting by product name first would make the heading
    depend on which brand happens to come first in the alphabet.
  */
  const label = new Map(shopsUsed(items).map(name => [name.toLowerCase(), name]));
  const by = new Map<string, CatalogSection>();
  for (const x of [...items].sort(byName)) {
    const shop = normalizeShop(x.store);
    // no shop sorts last under its own heading, exactly as the shopping list groups (`NO_STORE`)
    const key = shop === null ? '' : shop.toLowerCase();
    const hit = by.get(key);
    if (hit) hit.items.push(x);
    else
      by.set(key, {
        key: key === '' ? 'none' : key,
        label: shop === null ? ANY_SHOP : (label.get(key) ?? shop),
        items: [x],
      });
  }
  return [...by.values()].sort((a, b) =>
    a.label === ANY_SHOP ? 1 : b.label === ANY_SHOP ? -1 : a.label.localeCompare(b.label),
  );
}

/**
 * What a supply with no shop is filed under, in the catalog and on the list alike.
 *
 * It is spelled here as well as in `../lists` (`NO_STORE`) because core's two halves do not
 * import one another — a catalog knows nothing about a shopping list by design — and
 * `supplies.test.ts` holds the two strings to each other so they cannot drift into two words
 * for one thing on two screens a tap apart.
 */
export const ANY_SHOP = 'Any shop';
