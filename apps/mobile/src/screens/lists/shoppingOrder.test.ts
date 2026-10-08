import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NO_STORE } from '@nibblecue/core';
import { SHOPPING, SUPPLIES } from '../../lists/copy';

/**
 * Tripwires over the source of the two shopping screens and their sheets, because what they
 * guard is an ORDER and an AFFORDANCE — where a block sits on a page, and which control a row
 * carries — and this app's tests run in node with no renderer. Every one of them is an owner
 * decision made with the phone in hand, and every one is the kind of thing a later edit undoes
 * without anything going red.
 *
 * `interaction.test.ts` in packages/ui records why a tripwire is the honest instrument when the
 * real check is impossible, and the same reasoning applies here.
 *
 * REWRITTEN FOR THE 2026-09-19 REDESIGN. The claims that survived are the ones that were about
 * the product rather than the drawing — the list is built from supplies, the catalog carries a
 * plus and the checklist carries the tick, the shops share one surface. The ones that went with
 * the old layout are named in the cases below, so a reader can see what was traded and for what.
 */
const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const sheet = (f: string) => readFileSync(join(here, '..', '..', 'sheets', 'lists', f), 'utf8');

describe('the shopping list starts from supplies', () => {
  const src = read('ShoppingScreen.tsx');

  /**
   * THE ORDER CLAIM SURVIVED A CHANGE OF FURNITURE. "Add from supplies" used to be a full-width
   * button above the list, with the free-text card below it, and the point of that order was
   * that a list is BUILT from the catalog (the owner, 2026-09-16: "what to buy made it seem like
   * that's where the list should be added from"). It is a floating pill now, which is above
   * everything by construction; the one-off is still below the list it is an exception to.
   */
  it('keeps Add item on the page, under the list, and off the overlay', () => {
    const list = src.indexOf('testID="shopping.list"');
    const add = src.indexOf('testID="shopping.add"');
    expect(list).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(list);
    expect(src).not.toContain("borderStyle: 'dashed'");
    expect(src).not.toContain('testID="shopping.add.chooser"');
  });

  it('opens the combined add sheet from the one Add item button', () => {
    expect(src).toContain('testID="shopping.add.picker"');
    expect(src).toContain('label={SHOPPING.addItem}');
    expect(src).toContain('onPress={() => setPickerOpen(true)}');
    // "Supplies or one-offs" under Add item is gone (2026-10-05): the button is enough
    expect(src).not.toContain('SHOPPING.addHint');
    expect(src).not.toMatch(/overlay=\{[\s\S]{0,800}testID="shopping\.add\.picker"/);
    expect(src).not.toContain('testID="shopping.add.field"');
    expect(src).not.toContain('testID="shopping.add.save"');
  });

  it('keeps the household note as a quiet line, the info mark before the words', () => {
    const note = src.indexOf('testID="shopping.note.info"');
    const add = src.indexOf('testID="shopping.add"');
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(add);
    expect(src).toMatch(/name="info"[\s\S]{0,240}\{SHOPPING\.sharedWith\}/);
    expect(src).toContain('{SHOPPING.sharedWith}');
    // list → note ~Screen gap (lg), note → Add item ~xl; no oversized margins or flex stretch
    expect(src).toContain('<View style={{ gap: t.space.xl }}>');
    expect(src).not.toContain('marginTop: t.space.md');
    expect(src).not.toContain('minHeight: t.hit.min');
  });

  it('says how far through the trip it is in words, never as a percentage', () => {
    expect(src).toContain('<ProgressLine');
    expect(src).toContain('SHOPPING.progress(basket.length, lines.length)');
    expect(SHOPPING.progress(2, 6)).toBe('2 of 6 in the basket');
    // "0%" at the start of a trip is the screen reporting on the parent (§5)
    expect(src).not.toContain('SHOPPING.percent(');
  });

  it('gives every line the aisle controls rather than hiding them in a sheet', () => {
    const row = read('ListRow.tsx');
    for (const control of ['.tick', '.qty.', '.remove']) expect(row).toContain(control);
    // the quantity's two ends agree with the bound the write clamps to
    expect(row).toContain('SHOPPING_QTY_MAX');
    /*
      AND THE DOWN BUTTON SAYS WHICH OF TWO THINGS IT WILL DO (the owner, 2026-09-19: "the button
      to reduce the qty is marked with 'x', but it should be '-'. only when current qty is one,
      the button becomes 'x' and it removes it from the list").

      It was an `x` at every quantity, because the icon set had no minus — so "one fewer" wore
      the glyph that means "remove". This replaced an earlier muted-at-one rule: a control whose
      GLYPH changes at the last step is not the same tap twice, and a dead button with no way out
      of it was the worse answer.
    */
    // ✕ at quantity 1 removes the line; − above one decreases. No disabled minus, no overflow menu.
    expect(row).toContain('const last = line.qty <= 1;');
    expect(row).toContain('const removes = dir < 0 && last;');
    expect(row).toContain("name={dir > 0 ? 'plus' : removes ? 'x' : 'minus'}");
    expect(row).toContain('onPress={() => (removes ? onRemove() : onQty(line.qty + dir))}');
    expect(row).toContain('{step(-1, SHOPPING.qtyDown, false)}');
    expect(row).toContain(
      "testID={`${testID}.qty.${dir > 0 ? 'up' : removes ? 'remove' : 'down'}`}",
    );
    expect(row).not.toContain('SHOPPING.removeItem');
    expect(row).not.toContain('SHOPPING.itemMenu');
    expect(row).not.toContain('name="more"');
    expect(row).not.toContain('<BottomSheet');
  });

  it('gives every line the quantity stepper, one-offs included', () => {
    const row = read('ListRow.tsx');
    // a one-off still names itself in the caption; the control on the right is the stepper
    expect(row).toContain('const oneOff = item === null;');
    expect(row).toContain('productCaption(item, line.categoryLabel ?? undefined, false)');
    expect(row).toContain('? SHOPPING.oneOff');
    expect(SHOPPING.oneOff).toBe('One-off');
    // no separate ✕ for a one-off: the stepper's last − removes it, same as a supply
    expect(row).not.toContain('testID={`${testID}.x`}');
    // the stepper is the only right-hand control while the line is to buy (no three-dot menu);
    // a view only member's line reads its quantity as a ticked one does (2026-10-08, `readOnly`)
    expect(row).toMatch(
      /\{checked \|\| readOnly \? \([\s\S]*?\) : \(\s*<View\s+style=\{\[\s*styles\.qty/,
    );
    expect(SHOPPING.removeLine('Banana')).toBe('Remove Banana from grocery list');
  });

  it('enlarges the diaper picture inside the same colored disc', () => {
    const parts = read('parts.tsx');
    expect(parts).toContain('const DIAPER_GLYPH_SCALE = 1.2;');
    expect(parts).toContain("icon === 'diaper' ? DIAPER_GLYPH_SCALE : 1");
    expect(parts).toContain("overflow: 'hidden'");
  });
});

describe('the plus belongs to the catalog, the tick to the checklist', () => {
  const catalog = read('SuppliesScreen.tsx');
  const picker = sheet('SupplyPickerSheet.tsx');
  const parts = read('parts.tsx');

  it('gives a catalog row an add control and no tick', () => {
    for (const src of [catalog, picker]) {
      expect(src).toContain('<OnListToggle');
      expect(src).not.toMatch(/onCheck=\{/);
      expect(src).not.toMatch(/accessibilityRole="checkbox"/);
    }
  });

  /**
   * THE BADGE WENT, THE WORD DID NOT. `to buy` used to sit beside the title in the mono badge
   * role AND beside a filled control, which said the same thing twice per row (§4: "Remove the
   * TO BUY badge entirely"). The rule it was there to serve is older than the badge and is not
   * negotiable: a state is never told by a fill alone (CLAUDE.md §6). So the filled pill carries
   * a check glyph AND a word, and the shape changes as well as the color.
   */
  it('never tells "on the list" by a fill alone', () => {
    expect(parts).toContain('<Icon name="check"');
    expect(parts).toMatch(/on \? \(\s*<>/);
    // off is a RING, on is a PILL: the outline changes shape, not just color
    expect(parts).toContain('borderRadius: t.radius.pill');
    expect(parts).toContain('borderWidth: 1.5');
    expect(catalog).toContain('SUPPLIES.onListPill');
    expect(SUPPLIES.onListPill).toBe('On list');
  });

  it('names the plus by what it does, in both directions', () => {
    expect(SUPPLIES.pickerAdd('Pampers')).toBe('Pampers, add to the grocery list');
    expect(SUPPLIES.pickerDrop('Pampers')).toBe('Pampers, take off the grocery list');
  });

  it('gives the picker two ways out, not just a dead end on a full catalog', () => {
    // Until 2026-09-16 the only way to add a brand the picker did not have was the EMPTY
    // state's CTA, so a household with a full catalog and one missing item had nowhere to go.
    // The ways out now: the catalog itself ("Manage all supplies", where a new one is added) and
    // a one-off, which is on the list without becoming a thing this household buys again (§4).
    expect(picker).toContain("'supply.picker.all'");
    expect(SUPPLIES.pickerCatalog).toBe('Manage all supplies');
    expect(picker).toContain('testID="supply.picker.oneoff.add"');
    expect(SUPPLIES.oneOffAdd('bananas')).toBe('Add “bananas” as a one-off');
    expect(SUPPLIES.oneOffEmpty).toBe('Add a one-off');
    // the one-off stays available with the search, including when a supply already matches
    expect(picker).toContain('testID="supply.picker.oneoff.add"');
    expect(picker).not.toContain('const offerOneOff = typed.length > 0 && shown.length === 0;');
  });

  it('keeps the sheet open, which is the whole reason it is a sheet', () => {
    expect(picker).toContain('SUPPLIES.pickerDone(open.length)');
    expect(SUPPLIES.pickerSubtitle).toBe('Tap to add or remove. This stays open.');
    expect(picker).toContain('SUPPLIES.pickerSubtitle');
  });
});

// (CuddleCue's chores checklist, the other half of the tick decision, is not in NibbleCue.)

/**
 * The owner, 2026-09-19, looking at the first-run tour's ring round a list of two shops: "the
 * white background go over everything on the shopping list, regardless of where it's located …
 * separation should be inside the white background, otherwise it feels too disjointed". A card
 * per store was the prototype's drawing, and inside one outline it read as two lists. The brief
 * says the same thing in §5 ("Do NOT render separate cards per shop") and §2 says it again about
 * the catalog's categories — so it is one claim over both screens now.
 */
describe('a list is one surface, however many headings it carries', () => {
  it('draws the shops inside one card, with a hairline between them', () => {
    const src = read('ShoppingScreen.tsx');
    // the list is no longer a tour anchor (2026-09-21): find it by its own id
    const from = src.indexOf('<ListCard testID="shopping.list">');
    const list = src.slice(from, src.indexOf('</ListCard>', from));
    expect(from).toBeGreaterThan(-1);
    expect(list.match(/<ListCard/g) ?? []).toHaveLength(1);
    expect(list).toContain('<CardSection');
    // an eyebrow INSIDE the loop would be a heading per card again
    expect(list).not.toContain('<SectionHeader');
  });

  it('draws the categories inside one card too', () => {
    const catalog = read('SuppliesScreen.tsx');
    expect(catalog.match(/<ListCard/g) ?? []).toHaveLength(1);
    expect(catalog).toContain('<CardSection key={s.key}');
  });

  it('rules between sections and between rows, and never above the first of either', () => {
    const parts = read('parts.tsx');
    expect(parts).toContain('{first || band ? null : <Divider />}');
    expect(parts).toContain('{i > 0 ? <Divider inset={ROW_INSET} /> : null}');
  });
});

/**
 * WHAT THE CATALOG IS FOR, in the two sentences a screen can carry. Both were owner decisions and
 * both are easy to lose to a copy edit.
 */
describe('the catalog belongs to the household', () => {
  const catalog = read('SuppliesScreen.tsx');

  it('never names a child on a screen shared between twins', () => {
    // the empty shelves used to say "Set up Chiara's diapers" to make themselves worth tapping;
    // the chip row does not need to, and the catalog was never one baby's (§2)
    expect(catalog).not.toContain('useChild');
    expect(catalog).not.toContain('childName');
    expect(SUPPLIES.note).toContain('not tied to one baby');
  });

  /**
   * ONE ADD SUPPLY, AT THE BOTTOM, AND IT ASKS WHAT IT IS FIRST (the owner, 2026-09-26: *"i dont
   * like how you show every cateogry that user can select and add, this is too much. instead just
   * move the add supply + button to the bottom replacing those long list"*). The empty shelves
   * were cards, then chips; now they are not on the page at all, and the categories are where
   * adding starts — the sheet opens on "What are you adding?" — so a parent holding a tub of
   * cream still has somewhere obvious to put it.
   */
  it('adds from one button after the catalog, never from a row of every category', () => {
    expect(catalog).not.toContain('emptyCategories');
    expect(catalog).not.toContain('barTrailing');
    expect(catalog).not.toMatch(/supplies\.empty\./);
    const card = catalog.indexOf('testID="supplies.card"');
    const add = catalog.indexOf('testID="supplies.add"');
    const note = catalog.indexOf('testID="supplies.note"');
    expect(card).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(card);
    expect(note).toBeGreaterThan(add);
    expect(catalog).toContain("onPress={() => setTarget('new')}");
  });

  it('opens a new supply on the categories, and an edit straight on the form', () => {
    const form = sheet('SupplySheet.tsx');
    expect(form).toContain(
      "const step: 'kind' | 'form' = target === 'new' && !picked ? 'kind' : 'form';",
    );
    // reset on every close, so the next Add supply opens on the categories from its first frame
    expect(form).toContain('onClose={close}');
    expect(form.match(/\bonClose\(\);/g)).toHaveLength(1);
    expect(form).toContain('<CategoryGrid');
    expect(SUPPLIES.kindTitle).toBe('What are you adding?');
    // nothing to save until it is something
    expect(form).toContain("step === 'kind' ? null : (");
    // the grid names every category, so none is only a picture
    const grid = sheet('CategoryGrid.tsx');
    expect(grid).toContain('SUPPLY_CATEGORIES.map(');
    expect(grid).toContain('accessibilityLabel={c.label}');
    expect(grid).toContain('testID={`supply.kind.${c.id}`}');
    expect(grid).not.toContain('numberOfLines');
  });

  it('remembers how this phone reads the catalog, and offers all three orders', () => {
    expect(catalog).toContain('useSupplySort()');
    expect(Object.keys(SUPPLIES.sortBy).sort()).toEqual(['az', 'category', 'shop']);
  });
});

/**
 * ONE WORD FOR ONE SHOP. The sheet offers the household's own spellings back as chips, the list
 * groups case-insensitively, and the heading a thing with no shop files under is the same string
 * in the catalog and on the list (core holds the last of those to itself).
 */
describe('a shop is spelled one way', () => {
  const edit = sheet('SupplySheet.tsx');

  it('offers the household its own shops rather than a free-text field', () => {
    expect(edit).toContain('shopsUsed(items)');
    expect(edit).toContain('sameShop(store, s)');
    expect(edit).toContain('testID="supply.shop.new"');
    expect(SUPPLIES.newShop).toBe('New shop');
  });

  it('normalizes what was typed before it is stored', () => {
    expect(edit).toContain('normalizeShop(newShop ?? store)');
  });

  it('files a line with no shop under a heading, not under an adverb', () => {
    expect(NO_STORE).toBe('Any shop');
  });
});

/**
 * THE CATEGORY GRID IS GONE FROM THE EDIT SHEET (§3). Thirteen chips wrapped to four lines at
 * the top of a form usually opened to change a size, which made a one-in-fifteen choice the
 * loudest thing on it.
 */
describe('the edit sheet asks five questions', () => {
  const edit = sheet('SupplySheet.tsx');

  it('picks a category in a row that opens a sheet, not in a grid of chips', () => {
    expect(edit).toContain('testID="supply.cat"');
    expect(edit).toContain('<CategorySheet');
    expect(edit).not.toContain('SUPPLY_CATEGORIES.map');
  });

  it('waits on the brand and nothing else', () => {
    expect(edit).toContain('const named = brand.trim().length > 0;');
    expect(edit).toContain('disabled={!named || busy}');
  });

  it('shows the list as a state with a switch, not as a button that fires and closes', () => {
    expect(edit).toContain('testID="supply.onList"');
    expect(edit).toContain('<Switch');
    expect(SUPPLIES.onListSwitchHint(2, 'Target')).toBe('Quantity 2 · shows under Target');
  });

  it('confirms a removal in the sheet, where the consequence can be said beside it', () => {
    expect(edit).toContain('testID="supply.remove.yes"');
    expect(SUPPLIES.removeConfirmBody).toContain('comes off the grocery list too');
    // and the line actually goes: a line pointing at a product nobody can open is a line a
    // parent cannot correct
    expect(edit).toContain('if (onListNow !== null && onToggleList !== undefined)');
  });
});

/**
 * PAPER IS THE WHOLE APP'S GROUND NOW (the owner, 2026-09-19: "make the background color on
 * shopping list the same the whole app. i like this universal color better, and theme color
 * selection for the buttons"). It started here, which is why the claim lives in this file, and
 * the second half of that sentence is the rule it stands for: the household's scheme is for the
 * things you tap, not for a tint over the page behind them.
 */
describe('the paper ground', () => {
  it('is the default for every screen, so no screen has to ask for it', () => {
    const screen = readFileSync(join(here, '..', '..', 'app', 'Screen.tsx'), 'utf8');
    expect(screen).toContain("page = 'paper'");
    expect(screen).toContain("page === 'paper' ? t.color.paper : t.color.app");
  });

  it('leaves the skin to decide whether there is a lit layer over it', () => {
    // suppressing it with the page colour would have taken Glass's orbs from a household that
    // pays for them; Paper's own wash and orbs are zero, so the default is flat either way
    const screen = readFileSync(join(here, '..', '..', 'app', 'Screen.tsx'), 'utf8');
    /*
      THE QUESTION MOVED INTO `Ground` on 2026-09-22, when the doodle pattern became the app's
      background: `Screen` used to ask whether the skin was lit, because that was the only
      reason to mount the layer at all, and now it always mounts it and `Ground` decides what is
      in it. The property is unchanged and still worth holding — the PAGE COLOUR must not be
      what suppresses a skin's washes — so this reads the file the arithmetic lives in.
    */
    expect(screen).toContain("const decorated = !env.off.has('ground');");
    expect(screen).not.toMatch(/page === 'paper'[^\n]*(groundWash|orbAlpha|decorated)/);
    const ground = readFileSync(
      join(here, '..', '..', '..', '..', '..', 'packages', 'ui', 'src', 'components', 'Ground.tsx'),
      'utf8',
    );
    expect(ground).toContain('const lit = w > 0 || a > 0;');
  });

  it('is a theme role no colour scheme overlays', () => {
    const theme = readFileSync(
      join(here, '..', '..', '..', '..', '..', 'packages', 'ui', 'src', 'theme', 'theme.ts'),
      'utf8',
    );
    const overlay = theme.slice(theme.indexOf('export function resolvePalette'));
    expect(overlay.slice(0, overlay.indexOf('}'))).not.toContain('paper');
  });
});
