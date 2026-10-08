/**
 * SUPPLIES — what this household actually buys (0017; redesigned to the shopping brief §2,
 * 2026-09-19).
 *
 * The problem it solves is worth restating because every decision here follows from it: a
 * partner standing in a supermarket aisle in front of eleven kinds of diaper. So the screen is a
 * catalog — brand, the size as written on the pack, the shop — and a toggle on each row puts one
 * on the shopping list, which is the other half of the feature and its own tab.
 *
 * THE CATALOG IS NOT THE LIST. Buying something does not remove it from here: the trip records
 * the date against the item, so next month the list is rebuilt in six taps and "we moved to size
 * 3 in August" is not a guess.
 *
 * WHAT THE REDESIGN CHANGED, and why each one was right:
 *
 * - ONE CARD, NOT ONE PER CATEGORY. A page of small cards separated by ground is read as several
 *   lists. The categories are sub-headings inside one surface now (§2), which is the same thing
 *   the stash learned a day earlier.
 *
 * - NO EMPTY SHELVES AT ALL, AND ONE ADD SUPPLY AT THE BOTTOM (the owner, 2026-09-26: *"i dont
 *   like how you show every category that user can select and add, this is too much. instead just
 *   move the add supply + button to the bottom replacing those long list"*). The empty shelves were
 *   full-width rows once (2026-09-16), then a chip per unused category (2026-09-19) — fifteen
 *   invitations to things the household does not buy. The one button after the catalog replaces
 *   them, and the categories are where adding starts instead: the sheet asks "What are you
 *   adding?" before anything else (`SupplySheet`), so a parent holding a tub of cream still has
 *   somewhere obvious to put it. With nothing in the catalog the button is right under the lede.
 *
 * - THE ROW SAYS WHAT IS IN THE AISLE. `Diapers · Size 3 · Target`, not "never recorded bought":
 *   a caption about the app's own records is no help to somebody holding a box.
 *
 * - NO CHILD'S NAME ANYWHERE. The catalog belongs to the HOUSEHOLD. The empty shelves used to
 *   name the selected baby to make themselves worth tapping; the chips do not need to, and a
 *   screen that says "Chiara's" about a thing shared between twins was wrong about who it is
 *   for. The footnote says so in a sentence.
 *
 * - A + THROWS THE THING INTO THE CART (the owner, 2026-09-26: *"Shopping: adding from Supplies
 *   flies the item into the list, and the cart bounces."*). This page is pushed over the tabs, so
 *   the shopping tab is not on the screen: the way to the list from here is the "3 on the shopping
 *   list" card at the top, and its cart is where the throw lands. The thing's own category square
 *   pops out of the + and is tossed into the cart, which bounces as its count rolls to the new
 *   number and the add is felt — one tap, on the landing. Scrolled far enough down a long catalog
 *   that the card has gone off the top, the square flies up and out toward it, and the count is
 *   already right when the parent scrolls back. The + still turns into "On list" at once, and
 *   nothing flies, bounces or rolls under reduce motion or in the amber Night — the add is felt on
 *   the tap (`runAddToList`, `cartFlight.ts` in packages/ui).
 *
 * - THE CART CARRIES ITS COUNT (the owner, 2026-09-26: *"the cart has no count badge ... add this
 *   feature"*). A badge on the cart's corner says how many lines are still to buy — the same held
 *   number the words beside it roll to (`cartShows`), so the two never disagree — and bumps as each
 *   thrown thing lands, its digit rolling with the words (`CartBadge`). Nothing to buy, no badge.
 *   A screen reader does not hear it: the card's own name already says the count.
 */
import {
  catalogSections,
  onListQty,
  supplyLabel,
  toggleOnList,
  type SupplyItem,
} from '@nibblecue/core';
import {
  BodySm,
  Button,
  CartBadge,
  CartBounce,
  CartFlight,
  CountRoll,
  H1,
  Icon,
  haptic,
  useAccent,
  useTheme,
  type CartThrow,
} from '@nibblecue/ui';
import { cartLanding } from '@nibblecue/ui/layout';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { putBackTrip, putOnList, removeShoppingItem } from '../../data/lists';
import { systemClock } from '../../data/repository';
import type { SupplyItemRow } from '../../db/queries/supplies';
import { arrivals } from '../../lists/arrivals';
import { SHOPPING, SUPPLIES } from '../../lists/copy';
import { sayPutOn, tripDays } from '../../lists/trip';
import { useShopping, useSupplies } from '../../lists/useLists';
import { useTimeZone } from '../../sheets/quick/prefs';
import { useWriteContext } from '../../sheets/quick/useWriteContext';
import { SupplySheet } from '../../sheets/lists/SupplySheet';
import { useTour } from '../../tour/TourProvider';
import { useToast } from '../../ui/toast';
import {
  CART_IDLE,
  cartLanded,
  cartShows,
  cartThrown,
  runAddToList,
  type CartCount,
} from './listMotion';
import {
  CardSection,
  CaptionAction,
  ListCard,
  OnListToggle,
  ProductRow,
  SectionCaption,
  SectionRows,
  ThrownChip,
} from './parts';
import { useSupplySort, type SupplySort } from './suppliesPrefs';
import { BACK_TO_TABS } from '../../app/backToTabs';

type Nav = NativeStackNavigationProp<RootParams>;

const NEXT_SORT: Record<SupplySort, SupplySort> = { category: 'az', az: 'shop', shop: 'category' };

export function SuppliesScreen() {
  const t = useTheme();
  const a = useAccent();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  /*
    A VIEW ONLY MEMBER READS THE CATALOG (the 2026-10-08 scenario finding): every supply, what is on
    the list, with no On list toggle, no supply to open and change, and no Add supply. The server
    refuses every write of theirs (`app.can_write`).
  */
  const { canLog, context } = useWriteContext();
  const tour = useTour();
  // the household's own day: a trip finished from here records the day each thing was bought
  const timeZone = useTimeZone();
  const { items, rows } = useSupplies();
  const { lines } = useShopping();
  const { sort, set: setSort } = useSupplySort();
  const [target, setTarget] = useState<SupplyItemRow | 'new' | null>(null);

  const sections = useMemo(() => catalogSections(items, sort), [items, sort]);
  const open = useMemo(() => lines.filter(l => l.checkedAt === null), [lines]);
  const toBuy = open.length;
  const rowOf = (id: string) => rows.find(r => r.id === id);

  /*
    THE THROW INTO THE CART (`runAddToList`). The chips in the air, the cart's count while they are
    — held where it was until each one lands (`cartShows`) — and a bump per landing for the bounce.
    Each + hands its own box to the throw, and the cart its own, measured as the chip leaves.
  */
  const [throws, setThrows] = useState<readonly CartThrow[]>([]);
  const [cart, setCart] = useState<CartCount>(CART_IDLE);
  const [bump, setBump] = useState(0);
  const thrown = useRef(0);
  const plusAt = useRef(new Map<string, View>());
  const cartAt = useRef<View>(null);
  const shows = cartShows(cart, toBuy);

  const throwToCart = (x: SupplyItem, before: number) => {
    thrown.current += 1;
    const id = thrown.current;
    runAddToList(cartLanding(t.reduceMotion, t.theme), {
      // one tap, felt on the landing — or on the tap, when nothing flies
      feel: haptic,
      fly: () => {
        setCart(c => cartThrown(c, before));
        setThrows(list => [
          ...list,
          {
            id,
            at: Date.now(),
            from: plusAt.current.get(x.id) ?? null,
            to: cartAt.current,
            chip: <ThrownChip category={x.category} />,
          },
        ]);
      },
      land: () => {
        setThrows(list => list.filter(y => y.id !== id));
        setCart(cartLanded);
        setBump(n => n + 1);
      },
      later: (fn, ms) => void setTimeout(fn, ms),
    });
  };

  /**
   * On the list, or off it again. The INTENT is core's (`toggleOnList`), so "turning it on starts
   * at one" is a rule with a test rather than a number typed into two sheets; the write is here.
   *
   * IT IS OPTIMISTIC BY CONSTRUCTION, not by an extra layer: the write goes to the local database
   * and the row redraws from the query that reads it. There is no confirmation step because there
   * is nothing to confirm — the same tap takes it off again (§1b).
   *
   * `from` is which control asked: a row's + throws the thing into the cart; the supply sheet's
   * switch does not — the sheet is over the page, and the switch is already felt as it flips, so a
   * throw would be one nobody sees and a second haptic for one add.
   */
  const toggle = async (item: SupplyItem, from: 'plus' | 'sheet') => {
    const ctx = await context();
    if (ctx === null) return;
    const { db, ...w } = ctx;
    const intent = toggleOnList(item.id, lines);
    const label = supplyLabel(item);
    if (intent.action === 'remove') {
      await removeShoppingItem(db, systemClock, { ...w, itemId: intent.lineId });
      toast.show(SUPPLIES.removed(label));
      return;
    }
    // thrown on the tap, before the write, with the count as it stands: the drawing never waits on
    // the write, and the write never waits on the drawing
    if (from === 'plus') throwToCart(item, toBuy);
    /*
      ON AN "ALL DONE" LIST THIS STARTS A NEW ONE, and the trip that ended is finished first, the way
      Clear finishes it — its one-offs with it (`putOnList`; the owner's report of 2026-09-26). The
      + only ever adds: a line in the basket is bought, not on the list (`toggleOnList`).
    */
    const r = await putOnList(db, systemClock, {
      ...w,
      ...tripDays(timeZone),
      title: label,
      // the size, the pack, the shop and the note are READ from the item, never copied onto the
      // line: correcting the item is how a household fixes every line on the list at once
      supplyId: item.id,
    });
    // a line on the list is what the tour's shopping card asks for before Share — and this page is
    // where its Add supplies goes with an empty catalog (`tour/steps.ts`, 2026-09-25)
    if (r.committed) tour?.did('shop:add');
    // and it pops into its place when the parent is back on the list (`lists/arrivals.ts`)
    if (r.committed) arrivals.note(r.itemId);
    /*
      THE TOAST SAYS WHERE IT WENT (2026-09-26). The throw shows it going into the cart; a parent
      who cannot see the throw hears this sentence instead — the toast is read out as it shows — so
      it names the list, where "Added Pampers" alone said what but not where. And when it started
      a new list, the trip that ended beside it, with the Undo that puts that trip back.
    */
    sayPutOn(toast, SUPPLIES.addedToList(label), r.finished, trip =>
      putBackTrip(db, systemClock, { ...w, trip }),
    );
  };

  const row = (x: SupplyItem) => {
    const qty = onListQty(x.id, open);
    const label = supplyLabel(x);
    return (
      <ProductRow
        key={x.id}
        item={x}
        highlight={qty !== null}
        {...(canLog ? { onPress: () => setTarget(rowOf(x.id) ?? null) } : {})}
        trailing={
          canLog ? (
            <OnListToggle
              on={qty !== null}
              label={SUPPLIES.onListPill}
              accessibilityLabel={
                qty !== null ? SUPPLIES.pickerDrop(label) : SUPPLIES.pickerAdd(label)
              }
              onPress={() => void toggle(x, 'plus')}
              // where the throw leaves from
              pressRef={node => {
                if (node === null) plusAt.current.delete(x.id);
                else plusAt.current.set(x.id, node);
              }}
              testID={`supplies.toggle.${x.id}`}
            />
          ) : undefined
        }
        testID={`supplies.item.${x.id}`}
      />
    );
  };

  return (
    <Screen
      testID="supplies"
      title={SUPPLIES.screenTitle}
      titleInBar={false}
      /* the chips' sky: over the whole page and every card on it, clipped to it, taking no touches */
      overlay={<CartFlight throws={throws} />}
    >
      <View style={{ gap: t.space.sm }}>
        {/* H1, 23, the pushed bar's own size: a page opened from another page is named at 23
            wherever it is drawn (docs/DESIGN_SYSTEM.md §4.1 rule 1, 2026-09-30) */}
        <H1>{SUPPLIES.screenTitle}</H1>
        <BodySm ink="text2">{SUPPLIES.lede}</BodySm>
      </View>

      {/* §2: the way to the other half of the feature, and what is waiting on it. Hidden with an
          empty catalog — a card counting a list that cannot have anything on it yet is a row of
          chrome in front of the one thing the screen wants a parent to do. */}
      {items.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${SHOPPING.screenTitle}, ${
            toBuy > 0 ? SUPPLIES.listCount(toBuy) : SUPPLIES.listCountNone
          }`}
          onPress={() => nav.navigate('Tabs', { screen: 'Shopping' }, BACK_TO_TABS)}
          style={({ pressed }) => [
            styles.link,
            {
              backgroundColor: a.tint,
              borderRadius: t.radius.m,
              padding: t.space.lg,
              gap: t.space.lg,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          testID="supplies.list"
        >
          {/* THE CART A + THROWS INTO: it bounces as each thing lands, and is what the throw
              measures — the square itself, which the bounce scales about its own middle */}
          <CartBounce bump={bump}>
            <View
              ref={cartAt}
              collapsable={false}
              style={[
                styles.square,
                {
                  borderRadius: t.radius.m,
                  backgroundColor: t.color.surfaceSolid,
                },
              ]}
              testID="supplies.list.cart"
            >
              <Icon name="cart" size={20} color={a.accent} />
              {/* THE COUNT ON THE CART'S CORNER, inside the cart's own box so it rides the bounce;
                  the held number the words beside it show, bumping on the same landing */}
              <CartBadge
                count={shows}
                bump={bump}
                ground={a.tint}
                testID="supplies.list.cart.badge"
              />
            </View>
          </CartBounce>
          <View style={styles.grow}>
            {/* the count rolls to its new number as each thing lands (`cartShows`); the button's
                own label above reads the list as it is */}
            <CountRoll variant="bodyStrong" value={shows} bump={bump}>
              {shows > 0 ? SUPPLIES.listCount(shows) : SUPPLIES.listCountNone}
            </CountRoll>
            <BodySm>{SUPPLIES.listCountHint}</BodySm>
          </View>
          <Icon name="chev" size={16} color={t.color.text2} />
        </Pressable>
      ) : null}

      {items.length > 0 ? (
        <View style={{ gap: t.space.lg }}>
          <SectionCaption
            label={SUPPLIES.yours(items.length)}
            right={
              /* THREE ORDERS BEHIND ONE CONTROL. A segmented control of three would take a row
                 to itself on a screen whose whole point is density, and a menu would be a sheet
                 for a choice between three words; cycling names the NEXT order in its own label,
                 so what a tap does is readable before it is tapped. The choice is remembered
                 (`suppliesPrefs`), per phone — which order you read in is not a fact about the
                 catalog, and syncing it would re-sort the other parent's screen mid-scroll. */
              <CaptionAction
                label={`${SUPPLIES.sortBy[sort]} ▾`}
                accessibilityLabel={`${SUPPLIES.sortPick}: ${SUPPLIES.sortBy[sort]}. ${SUPPLIES.sortBy[NEXT_SORT[sort]]}`}
                onPress={() => setSort(NEXT_SORT[sort])}
                testID="supplies.sort"
              />
            }
          />
          <ListCard testID="supplies.card">
            {sections.map((s, i) => (
              <CardSection key={s.key} label={s.label} first={i === 0}>
                <SectionRows>{s.items.map(row)}</SectionRows>
              </CardSection>
            ))}
          </ListCard>
        </View>
      ) : null}

      {/* THE ONE WAY TO ADD, AFTER THE CATALOG (the owner, 2026-09-26; the header says why). It
          opens the sheet on "What are you adding?", the categories as pictures. */}
      {canLog ? (
        <Button
          label={SUPPLIES.addSupply}
          icon="plus"
          onPress={() => setTarget('new')}
          testID="supplies.add"
        />
      ) : null}

      <BodySm testID="supplies.note">{SUPPLIES.note}</BodySm>

      <SupplySheet
        target={target}
        items={items}
        lines={lines}
        onClose={() => setTarget(null)}
        onToggleList={row =>
          void toggle(
            {
              id: row.id,
              category: row.category,
              brand: row.brand,
              product: row.product,
              variant: row.variant,
              pack: row.pack,
              store: row.store,
              notes: row.notes,
              url: row.url,
              lastBoughtOn: row.last_bought_on,
            },
            'sheet',
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  link: { flexDirection: 'row', alignItems: 'center' },
  square: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
