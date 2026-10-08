/**
 * One item in the supply catalog (0017; redesigned to the shopping brief §3, 2026-09-19).
 *
 * FIVE FIELDS, IN THE ORDER A PERSON WOULD SAY THEM: what it is, whose it is, which one, where
 * you buy it, and the page that shows it. Then one row for whether it is on the shopping list,
 * and one way to take it out of the catalog altogether.
 *
 * A NEW ONE STARTS WITH WHAT IT IS (the owner, 2026-09-26). The sheet opens on "What are you
 * adding?" — the categories as pictures (`CategoryGrid`) — and the tap is the form with that shelf
 * chosen. Opening a product to edit it goes straight to the form: its category is already known.
 *
 * WHAT THE REDESIGN CHANGED:
 *
 * - THE CATEGORY IS A ROW, NOT A GRID. Thirteen chips wrapped to four lines and made a
 *   one-in-fifteen choice the loudest thing on a form usually opened to change a size.
 *   `CategorySheet` carries the reasoning.
 *
 * - THE SHOP IS A CHIP SET OF THE HOUSEHOLD'S OWN SHOPS. It used to be free text, and free text
 *   is how a list ends up with a `Target` heading and a `target` heading a row apart. The chips
 *   are `shopsUsed` — their vocabulary, spelled the way they first spelled it — and "New shop"
 *   opens a field for the one that is not there yet. `normalizeShop` and `sameShop` in core keep
 *   the grouping honest whichever phone typed it.
 *
 * - "ADD TO THE SHOPPING LIST" BECAME A SWITCH that says what it is doing: on, with the quantity
 *   and the heading the line will appear under. A button that fires and closes cannot show a
 *   state, so the sheet could not say whether the thing in front of you was already on the list.
 *
 * NOTHING HERE IS A DOSE. The Vitamins category carries the same plain text as Laundry — the
 * strength AS WRITTEN on the label, in a field the parent types. No amount is computed from it
 * and none is suggested (CLAUDE.md §2 rule 4).
 *
 * `product` and `pack` still EXIST on the row and still come back from an import or an older
 * entry — nothing rewrites a household's data (CLAUDE.md §7) — they are simply not asked for.
 * `parts.tsx` `productCaption` reads whichever field a row actually has, so a size typed two
 * revisions ago is still on the row.
 */
import {
  normalizeShop,
  onListQty,
  sameShop,
  shopsUsed,
  supplyCategory,
  supplyLabel,
  type ShoppingLine,
  type SupplyItem,
} from '@nibblecue/core';
import {
  AppText,
  BodySm,
  BottomSheet,
  Button,
  Divider,
  Icon,
  Input,
  Switch,
  useAccent,
  useTheme,
} from '@nibblecue/ui';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { systemClock } from '../../data/repository';
import { saveSupply, setSupplyDeleted } from '../../data/supplies';
import type { SupplyItemRow } from '../../db/queries/supplies';
import { SUPPLIES } from '../../lists/copy';
import { CategorySquare, SectionCaption, SQUARE_SM } from '../../screens/lists/parts';
import { useWriteContext } from '../quick/useWriteContext';
import { useToast } from '../../ui/toast';
import { CategoryGrid } from './CategoryGrid';
import { CategorySheet } from './CategorySheet';

export interface SupplySheetProps {
  /** A row to edit, `'new'` for a fresh item, or null while the sheet is closed. */
  target: SupplyItemRow | 'new' | null;
  onClose: () => void;
  /** The catalog, for the shops this household already names. */
  items: readonly SupplyItem[];
  /** The list, so the switch can say whether this one is on it and how many. */
  lines: readonly ShoppingLine[];
  /** Put it on the list, or take it off. The caller owns the write, as everywhere else. */
  onToggleList?: ((row: SupplyItemRow) => void) | undefined;
}

export function SupplySheet({ target, onClose, items, lines, onToggleList }: SupplySheetProps) {
  const t = useTheme();
  const a = useAccent();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { context } = useWriteContext();
  const [shown, setShown] = useState<SupplyItemRow | 'new' | null>(target);
  /**
   * WHETHER A NEW SUPPLY HAS BEEN TOLD WHAT IT IS. Until it has, the sheet shows the categories; a
   * product being edited already knows. Derived from the target on every render and reset on every
   * close, so the next Add supply opens on the categories from its first frame, never on the last
   * one's form for a frame before an effect catches up.
   */
  const [picked, setPicked] = useState(false);
  const step: 'kind' | 'form' = target === 'new' && !picked ? 'kind' : 'form';
  const close = () => {
    setPicked(false);
    onClose();
  };
  const [cat, setCat] = useState('DIAPERS');
  const [brand, setBrand] = useState('');
  const [detail, setDetail] = useState('');
  const [store, setStore] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [picking, setPicking] = useState(false);
  /** The inline field the dashed chip turns into; null while it is still a chip. */
  const [newShop, setNewShop] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target === null) return;
    const row = target === 'new' ? null : target;
    setShown(target);
    setPicked(false);
    setCat(row?.category ?? 'DIAPERS');
    setBrand(row?.brand ?? '');
    /*
      THE FIELD READS WHICHEVER FIELD THE ROW HAS. `variant` is where this form writes now;
      `notes` is where the 2026-09-18 revision wrote. Seeding from `notes` when there is no
      `variant` is what stops a parent opening their own product and finding the size they typed
      last week missing — and it is a READ, not a migration: a row keeps `notes` until the parent
      saves, at which point what is in the field is what they meant.
    */
    setDetail(row?.variant ?? row?.notes ?? '');
    setStore(normalizeShop(row?.store ?? null));
    setUrl(row?.url ?? '');
    setNewShop(null);
    setPicking(false);
    setConfirm(false);
    setBusy(false);
  }, [target]);

  const editing = shown !== null && shown !== 'new' ? shown : null;
  const named = brand.trim().length > 0;
  const name = supplyLabel({ brand, product: null });
  const shops = useMemo(() => shopsUsed(items), [items]);
  // the lines still to buy, as the picker and the Supplies page read it: a line in the basket is
  // bought and leaves with its trip, so the switch is off for it and turning it on adds a new one
  const onListNow = editing === null ? null : onListQty(editing.id, lines);

  /** The chip a parent picked, the one they just typed, or nothing — resolved the same way. */
  const chosenShop = (): string | null => normalizeShop(newShop ?? store);

  const save = async () => {
    if (!named || busy) return;
    const ctx = await context();
    if (ctx === null) return;
    setBusy(true);
    const { db, ...w } = ctx;
    await saveSupply(db, systemClock, {
      ...w,
      category: cat,
      brand: brand.trim(),
      product: editing?.product ?? null,
      // the size lands in `variant`, which is the field the row's caption reads (§1a)
      variant: detail.trim() === '' ? null : detail.trim(),
      pack: editing?.pack ?? null,
      store: chosenShop(),
      notes: editing?.notes ?? null,
      url: url.trim() === '' ? null : url.trim(),
      ...(editing === null ? {} : { supplyId: editing.id }),
    });
    setBusy(false);
    close();
    toast.show(editing === null ? SUPPLIES.added(name) : SUPPLIES.saved(name));
  };

  /**
   * Out of the catalog, and off the list with it (§3: "Removing a supply that is on the list also
   * removes it from the list"). The soft delete is what makes the undo honest — a row is flagged,
   * never dropped — and the list line goes because a line pointing at a product nobody can open
   * any more is a line a parent cannot correct.
   */
  const remove = async () => {
    if (editing === null || busy) return;
    const ctx = await context();
    if (ctx === null) return;
    setBusy(true);
    const { db, ...w } = ctx;
    if (onListNow !== null && onToggleList !== undefined) onToggleList(editing);
    const r = await setSupplyDeleted(db, systemClock, {
      ...w,
      supplyId: editing.id,
      deleted: true,
    });
    setBusy(false);
    close();
    if (!r.committed) return;
    toast.show(SUPPLIES.removed(name), {
      undo: () => {
        void setSupplyDeleted(db, systemClock, {
          ...w,
          supplyId: editing.id,
          deleted: false,
        }).then(() => toast.show(SUPPLIES.undone));
      },
    });
  };

  /** One shop chip. `selected` compares case-insensitively, so two spellings are one chip. */
  const shopChip = (label: string, selected: boolean, onPress: () => void, testID: string) => (
    <Pressable
      key={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          minHeight: 40,
          paddingHorizontal: t.space.lg,
          borderRadius: t.radius.pill,
          borderWidth: 1,
          borderColor: selected ? a.accent : t.color.line,
          backgroundColor: selected ? a.tint : t.color.surfaceSolid,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      testID={testID}
    >
      <AppText variant="bodySm" style={selected ? styles.semibold : undefined}>
        {label}
      </AppText>
    </Pressable>
  );

  return (
    <BottomSheet
      visible={target !== null}
      title={
        step === 'kind'
          ? SUPPLIES.kindTitle
          : editing === null
            ? SUPPLIES.newItem
            : SUPPLIES.editItem
      }
      onClose={close}
      detent="large"
      bottomInset={insets.bottom}
      footer={
        // nothing to save until it is something: the grid's tap is the only way on
        step === 'kind' ? null : (
          <View style={{ gap: t.space.sm }}>
            <Button
              label={SUPPLIES.save}
              onPress={() => void save()}
              disabled={!named || busy}
              testID="supply.save"
            />
            <BodySm align="center">{SUPPLIES.sheetNote}</BodySm>
          </View>
        )
      }
      testID="supply"
    >
      {step === 'kind' ? (
        <CategoryGrid
          onPick={c => {
            setCat(c);
            setPicked(true);
          }}
        />
      ) : (
        <View style={{ gap: t.space.xxl }}>
          {/* 1 — the category, as an answer with a way to change it (§3) */}
          <View style={{ gap: t.space.sm }}>
            <SectionCaption label={SUPPLIES.categoryPick} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${SUPPLIES.categoryPick}: ${supplyCategory(cat).label}`}
              onPress={() => setPicking(true)}
              style={({ pressed }) => [
                styles.field,
                {
                  minHeight: 56,
                  paddingHorizontal: t.space.lg,
                  gap: t.space.lg,
                  borderRadius: t.radius.s,
                  borderWidth: 1,
                  borderColor: t.color.line2,
                  backgroundColor: t.color.surfaceSolid,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              testID="supply.cat"
            >
              <CategorySquare category={cat} size={SQUARE_SM} />
              <AppText variant="body" style={styles.grow}>
                {supplyCategory(cat).label}
              </AppText>
              <Icon name="chev" size={16} color={t.color.text2} />
            </Pressable>
          </View>

          {/* 2 — the brand, which is the one field Save waits on */}
          <Input
            label={SUPPLIES.brandRequired}
            value={brand}
            onChangeText={setBrand}
            placeholder={SUPPLIES.brandPlaceholder}
            testID="supply.brand"
          />

          {/* 3 — the size, and the sentence that says what it is for */}
          <Input
            label={SUPPLIES.detail}
            value={detail}
            onChangeText={setDetail}
            placeholder={SUPPLIES.detailPlaceholder}
            hint={SUPPLIES.detailHelp}
            testID="supply.detail"
          />

          {/* 4 — where you buy it: their own shops, and a way to name a new one */}
          <View style={{ gap: t.space.sm }}>
            <SectionCaption label={SUPPLIES.shopOptional} />
            <View style={[styles.wrap, { gap: t.space.sm }]}>
              {shops.map(s =>
                shopChip(
                  s,
                  newShop === null && sameShop(store, s),
                  () => {
                    setNewShop(null);
                    // tapping the chip that is already on takes it off: optional means removable
                    setStore(sameShop(store, s) ? null : s);
                  },
                  `supply.shop.${s.toLowerCase()}`,
                ),
              )}
              {newShop === null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={SUPPLIES.newShop}
                  onPress={() => {
                    setStore(null);
                    setNewShop('');
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      minHeight: 40,
                      paddingHorizontal: t.space.lg,
                      gap: t.space.sm,
                      borderRadius: t.radius.pill,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: t.color.line2,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                  testID="supply.shop.new"
                >
                  <Icon name="plus" size={13} color={a.accent} />
                  <AppText variant="bodySm">{SUPPLIES.newShop}</AppText>
                </Pressable>
              ) : null}
            </View>
            {newShop === null ? null : (
              <Input
                label={SUPPLIES.newShop}
                labelHidden
                value={newShop}
                onChangeText={setNewShop}
                placeholder={SUPPLIES.newShopPlaceholder}
                autoFocus
                returnKeyType="done"
                testID="supply.shop.field"
              />
            )}
          </View>

          {/* 5 — the page that shows the pack */}
          <View style={{ gap: t.space.sm }}>
            <Input
              label={SUPPLIES.linkOptional}
              value={url}
              onChangeText={setUrl}
              placeholder={SUPPLIES.urlPlaceholder}
              leading="link"
              autoCapitalize="none"
              keyboardType="url"
              testID="supply.url"
            />
            {url.trim().length > 0 ? (
              <Button
                label={SUPPLIES.openLink}
                variant="secondary"
                size="sm"
                icon="link"
                onPress={() => void Linking.openURL(url.trim()).catch(() => undefined)}
                testID="supply.open"
              />
            ) : null}
          </View>

          {/* the list, as a state rather than an action (§3) */}
          {editing !== null && onToggleList !== undefined ? (
            <View
              style={[
                styles.field,
                {
                  padding: t.space.lg,
                  gap: t.space.lg,
                  borderRadius: t.radius.m,
                  backgroundColor: t.color.paper,
                },
              ]}
            >
              <View style={styles.grow}>
                <AppText variant="bodyStrong">{SUPPLIES.onListSwitch}</AppText>
                <BodySm>
                  {onListNow === null
                    ? SUPPLIES.onListSwitchOff
                    : SUPPLIES.onListSwitchHint(onListNow, chosenShop() ?? SUPPLIES.sortBy.shop)}
                </BodySm>
              </View>
              <Switch
                value={onListNow !== null}
                onValueChange={() => onToggleList(editing)}
                accessibilityLabel={SUPPLIES.onListSwitch}
                testID="supply.onList"
              />
            </View>
          ) : null}

          {/* out of the catalog. A confirm INSIDE the sheet and not a system alert: the sentence
            that matters is what happens to the shopping list, and an alert cannot show it
            beside the thing being removed (LocationSheet does the same for the same reason). */}
          {editing !== null ? (
            <View style={{ gap: t.space.md }}>
              <Divider />
              {confirm ? (
                <View style={{ gap: t.space.md }}>
                  <AppText variant="bodyStrong" align="center">
                    {SUPPLIES.removeConfirm}
                  </AppText>
                  <BodySm ink="text2" align="center">
                    {SUPPLIES.removeConfirmBody}
                  </BodySm>
                  <Button
                    label={SUPPLIES.removeConfirmYes}
                    variant="danger"
                    onPress={() => void remove()}
                    disabled={busy}
                    testID="supply.remove.yes"
                  />
                  <Button
                    label={SUPPLIES.cancel}
                    variant="ghost"
                    onPress={() => setConfirm(false)}
                    testID="supply.remove.no"
                  />
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={SUPPLIES.remove}
                  onPress={() => setConfirm(true)}
                  hitSlop={t.space.md}
                  style={({ pressed }) => [
                    styles.center,
                    {
                      minHeight: t.hit.min,
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}
                  testID="supply.remove"
                >
                  <AppText variant="bodySm" ink="crit" style={styles.semibold}>
                    {SUPPLIES.remove}
                  </AppText>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>
      )}

      <CategorySheet
        visible={picking}
        value={cat}
        onPick={setCat}
        onClose={() => setPicking(false)}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  field: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  semibold: { fontWeight: '600' },
});
