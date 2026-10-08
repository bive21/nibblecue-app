/**
 * "What are you adding?" — the first thing Add supply asks (the owner, 2026-09-26: *"after user
 * clicks add supply, the pop up to select which category to add will need to be selected
 * first"*).
 *
 * THE FIFTEEN SHELVES AS PICTURES, three across. A parent adding something new knows what it is
 * before they know how the pack spells its brand, and the category is the answer the rest of the
 * form hangs on — the picture, the color, the shelf it lands on — so it is asked first, as one tap.
 * A grid rather than the list `CategorySheet` draws, because here the choice is the whole sheet:
 * a picture is found faster than a word, and fifteen rows would be a scroll.
 *
 * A WRONG TAP COSTS ONE TAP. The form keeps its Category row, which opens `CategorySheet`, so
 * Wipes tapped for Diapers is changed there rather than started again.
 *
 * THE LABELS WRAP, THEY ARE NEVER CUT. "Nipples and teats" is two lines in a third of a phone,
 * and more at a large text size; a tile that grows is fine, and the tiles on its row grow with it
 * (the row's items stretch), where an ellipsis would hide the one word that tells two apart.
 */
import { SUPPLY_CATEGORIES } from '@nibblecue/core';
import { AppText, haptic, useTheme } from '@nibblecue/ui';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CategorySquare, SQUARE_LG } from '../../screens/lists/parts';

const COLUMNS = 3;

export function CategoryGrid({ onPick }: { onPick: (category: string) => void }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const gap = t.space.md;
  // measured rather than a percentage, so three tiles fill the row exactly on any phone
  const tile = width > 0 ? Math.floor((width - gap * (COLUMNS - 1)) / COLUMNS) : 0;
  return (
    <View
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      style={[styles.grid, { gap }]}
      testID="supply.kind"
    >
      {tile === 0
        ? null
        : SUPPLY_CATEGORIES.map(c => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={c.label}
              onPress={() => {
                haptic('tap');
                onPick(c.id);
              }}
              style={({ pressed }) => [
                styles.tile,
                {
                  width: tile,
                  minHeight: 104,
                  paddingVertical: t.space.lg,
                  paddingHorizontal: t.space.sm,
                  gap: t.space.md,
                  borderRadius: t.radius.m,
                  borderWidth: 1,
                  borderColor: t.color.line,
                  backgroundColor: t.color.surfaceSolid,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              testID={`supply.kind.${c.id}`}
            >
              <CategorySquare category={c.id} size={SQUARE_LG} />
              <AppText variant="bodySm" align="center" style={styles.label}>
                {c.label}
              </AppText>
            </Pressable>
          ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '600' },
});
