/**
 * Adding to the list from the catalog (0017; redesigned to the shopping brief §4, 2026-09-19).
 *
 * THE SHEET STAYS OPEN. A shop is a list of six things, not one, and a picker that closed after
 * each tap would be six round trips through the same search. Tapping a row that is already on
 * the list takes it off again, so the toggle is the state and the sheet never needs a separate
 * "what have I added" list — which is why the footer counts rather than confirms.
 *
 * WHAT THE REDESIGN CHANGED:
 *
 * - THE `TO BUY` BADGE IS GONE. It said the same thing as the filled pill beside it, in the mono
 *   face, twice per row. The pill carries a check AND a word, so the state is still never told
 *   by a fill alone.
 *
 * - THE CATEGORY CHIPS SCROLL SIDEWAYS instead of wrapping. Six categories wrapped to three
 *   lines above the results and pushed the first product off the screen on a 375 phone; the
 *   count on "All" is what a parent is actually looking for before they filter.
 *
 * - A HOUSEHOLD CAN LEAVE FROM HERE, TWO WAYS. "Manage all supplies" is the catalog itself, where
 *   a new product is added and a wrong size corrected; "Add as a one-off" puts the bananas on the
 *   list without making them a thing this household buys again and again. The old sheet offered
 *   the first only as an empty state, so a full catalog with the wrong brand in it was a dead end
 *   (the owner, 2026-09-16: "so users can easily add or edit the items list").
 *
 * - THERE IS NO "NEW SUPPLY" ROW (the owner, 2026-09-26). It opened the form from here, beside the
 *   door to the page where the same form is one button away — two ways into one catalog, on a
 *   sheet a parent opens to put things on a list. Adding is on the Supplies page now, and it asks
 *   what the thing is before anything else (`SupplySheet`).
 */
import {
  onListQty,
  searchSupplies,
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
  Icon,
  Input,
  useAccent,
  useTheme,
} from '@nibblecue/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SUPPLIES } from '../../lists/copy';
import { ListCard, OnListToggle, ProductRow, SectionRows } from '../../screens/lists/parts';

export interface SupplyPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  items: readonly SupplyItem[];
  /** The list itself, so a row can show the quantity and not only that it is on. */
  lines: readonly ShoppingLine[];
  /** Add it, or take it off again — `toggleOnList` in core decides which, the caller writes. */
  onToggle: (item: SupplyItem) => void;
  /** Put what they typed on the list without making it a supply. */
  onOneOff: (title: string) => void;
  /** Open the Supplies catalog. Optional: a caller with nowhere to send them draws no row. */
  onSeeAll?: () => void;
}

export function SupplyPickerSheet({
  visible,
  onClose,
  items,
  lines,
  onToggle,
  onOneOff,
  onSeeAll,
}: SupplyPickerSheetProps) {
  const t = useTheme();
  const a = useAccent();
  const insets = useSafeAreaInsets();
  const searchRef = useRef<TextInput>(null);
  /** The one-off row was tapped with nothing typed: it says where to type. */
  const [nudged, setNudged] = useState(false);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null);

  // a sheet that reopened holding last week's search would be showing one product and hiding
  // the rest of the catalog behind a word the parent has forgotten typing
  useEffect(() => {
    if (visible) {
      setQuery('');
      setCat(null);
    }
  }, [visible]);

  // only the categories this household actually has, so the row is theirs and not a taxonomy
  const cats = useMemo(() => [...new Set(items.map(x => x.category))].map(supplyCategory), [items]);
  const shown = useMemo(() => searchSupplies(items, query, cat), [items, query, cat]);
  const open = useMemo(() => lines.filter(l => l.checkedAt === null), [lines]);
  const typed = query.trim();

  const chip = (label: string, selected: boolean, onPress: () => void, testID: string) => (
    <Pressable
      key={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          minHeight: 36,
          paddingHorizontal: t.space.lg,
          borderRadius: t.radius.pill,
          borderWidth: 1,
          // the ALL chip fills with ink and not with the accent: it is the state a parent
          // returns to, and filling it with the household's color would make "no filter" read
          // as the loudest choice on the row
          borderColor: selected ? t.color.text : t.color.line,
          backgroundColor: selected ? t.color.text : t.color.surfaceSolid,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      testID={testID}
    >
      <AppText
        variant="bodySm"
        style={[styles.semibold, selected ? { color: t.color.surfaceSolid } : undefined]}
      >
        {label}
      </AppText>
    </Pressable>
  );

  /** The catalog, under the results: a solid row, the same weight as the list it opens. */
  const manage = (label: string, hint: string, onPress: () => void, testID: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: 56,
          paddingHorizontal: t.space.lg,
          paddingVertical: t.space.md,
          gap: t.space.md,
          borderRadius: t.radius.m,
          backgroundColor: t.color.surfaceSolid,
          borderWidth: 1,
          borderColor: t.color.line,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      testID={testID}
    >
      <View style={styles.grow}>
        <AppText variant="bodyStrong">{label}</AppText>
        <BodySm>{hint}</BodySm>
      </View>
      <Icon name="chev" size={15} color={t.color.text2} />
    </Pressable>
  );

  return (
    <BottomSheet
      visible={visible}
      title={SUPPLIES.picker}
      onClose={onClose}
      detent="large"
      bottomInset={insets.bottom}
      footer={
        <Button
          label={SUPPLIES.pickerDone(open.length)}
          onPress={onClose}
          testID="supply.picker.done"
        />
      }
      testID="supply.picker"
    >
      <View style={{ gap: t.space.lg }}>
        {/* the subtitle says the one thing about this sheet a parent cannot see: it stays open */}
        <BodySm>{SUPPLIES.pickerSubtitle}</BodySm>

        <Input
          label={SUPPLIES.pickerSearch}
          labelHidden
          value={query}
          onChangeText={setQuery}
          placeholder={SUPPLIES.pickerSearch}
          leading="search"
          inputRef={searchRef}
          onClear={() => setQuery('')}
          autoCapitalize="none"
          returnKeyType="search"
          testID="supply.picker.search"
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={typed.length > 0 ? SUPPLIES.oneOffAdd(typed) : SUPPLIES.oneOffEmpty}
          onPress={() => {
            if (typed.length === 0) {
              // the box above takes the typing; the row says so in words, not only by a focus
              // the parent may not notice (2026-10-06)
              setNudged(true);
              searchRef.current?.focus();
              return;
            }
            onOneOff(typed);
            setQuery('');
          }}
          style={({ pressed }) => [
            styles.row,
            {
              minHeight: 56,
              paddingHorizontal: t.space.lg,
              paddingVertical: t.space.md,
              gap: t.space.md,
              borderRadius: t.radius.m,
              backgroundColor: t.color.accentSoft,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          testID="supply.picker.oneoff.add"
        >
          {/* empty, the row points at the box (a magnifier); typed, it adds (a plus) */}
          <Icon name={typed.length > 0 ? 'plus' : 'search'} size={18} color={a.accent} />
          <View style={styles.grow}>
            <AppText variant="bodyStrong">
              {typed.length > 0 ? SUPPLIES.oneOffAdd(typed) : SUPPLIES.oneOffEmpty}
            </AppText>
            {typed.length === 0 && nudged ? (
              <BodySm ink="accent" testID="supply.picker.oneoff.nudge">
                {SUPPLIES.oneOffNudge}
              </BodySm>
            ) : (
              <BodySm>
                {typed.length > 0 ? SUPPLIES.oneOffTypedHint : SUPPLIES.oneOffEmptyHint}
              </BodySm>
            )}
          </View>
          {typed.length > 0 ? <Icon name="chev" size={15} color={t.color.text2} /> : null}
        </Pressable>

        {cats.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.chips, { gap: t.space.sm }]}
            testID="supply.picker.cats"
          >
            {chip(
              SUPPLIES.pickerAllCount(items.length),
              cat === null,
              () => setCat(null),
              'supply.picker.cat.all',
            )}
            {cats.map(c =>
              chip(c.label, cat === c.id, () => setCat(c.id), `supply.picker.cat.${c.id}`),
            )}
          </ScrollView>
        ) : null}

        {typed.length > 0 && shown.length === 0 ? (
          <View
            style={[styles.empty, { gap: t.space.sm, paddingVertical: t.space.xxxl }]}
            testID="supply.picker.none"
          >
            <Icon name="search" size={40} color={t.color.text3} />
            <AppText variant="bodyStrong" align="center">
              {SUPPLIES.pickerNone}
            </AppText>
            <BodySm align="center">{SUPPLIES.pickerNoneHint}</BodySm>
          </View>
        ) : null}

        {shown.length > 0 ? (
          <ListCard testID="supply.picker.card">
            <SectionRows>
              {shown.map(x => {
                const qty = onListQty(x.id, open);
                const label = supplyLabel(x);
                return (
                  <ProductRow
                    key={x.id}
                    item={x}
                    highlight={qty !== null}
                    trailing={
                      <OnListToggle
                        on={qty !== null}
                        // ON THE LIST, NOT HOW MANY (the owner, 2026-09-29: "no need to show the
                        // quantity next to the checklist icon, just show that it's been added to
                        // the shop cart, and qty can be adjusted directly from shopping cart"):
                        // the same pill the Supplies page draws, and a second tap takes it off
                        // again (`toggleOnList`); how many is the list row's own stepper
                        label={SUPPLIES.onListPill}
                        accessibilityLabel={
                          qty !== null ? SUPPLIES.pickerDrop(label) : SUPPLIES.pickerAdd(label)
                        }
                        onPress={() => onToggle(x)}
                        testID={`supply.picker.toggle.${x.id}`}
                      />
                    }
                    testID={`supply.picker.${x.id}`}
                  />
                );
              })}
            </SectionRows>
          </ListCard>
        ) : null}

        {/* and the whole catalog, under it — see `SUPPLIES.pickerCatalog` for why it lives here */}
        {onSeeAll === undefined
          ? null
          : manage(
              SUPPLIES.pickerCatalog,
              SUPPLIES.pickerCatalogHint,
              onSeeAll,
              'supply.picker.all',
            )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', alignItems: 'center' },
  empty: { alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
  semibold: { fontWeight: '600' },
});
