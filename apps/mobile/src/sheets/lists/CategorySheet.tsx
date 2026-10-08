/**
 * Which shelf a supply goes on (the shopping brief §3, field 1).
 *
 * THIS SHEET REPLACED A GRID OF THIRTEEN CHIPS at the top of the Edit-supply form. The grid was
 * the first thing a parent met when they opened a product they only wanted to change the size
 * of, it wrapped to four rows on a 375 phone, and it made a one-in-fifteen choice the loudest
 * thing on a form whose other four fields are the ones actually being edited. A row that says
 * which category it already is, and opens this when it is wrong, costs 56 points instead of 180
 * and reads as an answer rather than a question.
 *
 * SINGLE SELECT, AND IT CLOSES ON THE TAP. There is no Save here: picking a category IS the
 * decision, and a sheet that made you confirm a radio button would be asking twice.
 */
import { SUPPLY_CATEGORIES } from '@nibblecue/core';
import { AppText, BottomSheet, Divider, Icon, useAccent, useTheme } from '@nibblecue/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SUPPLIES } from '../../lists/copy';
import { CategorySquare, SQUARE_SM } from '../../screens/lists/parts';

export interface CategorySheetProps {
  visible: boolean;
  value: string;
  onPick: (category: string) => void;
  onClose: () => void;
}

export function CategorySheet({ visible, value, onPick, onClose }: CategorySheetProps) {
  const t = useTheme();
  const a = useAccent();
  const insets = useSafeAreaInsets();
  return (
    <BottomSheet
      visible={visible}
      title={SUPPLIES.categoryPickTitle}
      onClose={onClose}
      detent="large"
      bottomInset={insets.bottom}
      testID="supply.category"
    >
      <View accessibilityRole="radiogroup">
        {SUPPLY_CATEGORIES.map((c, i) => {
          const picked = c.id === value;
          return (
            <View key={c.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: picked }}
                accessibilityLabel={c.label}
                onPress={() => {
                  onPick(c.id);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    minHeight: t.hit.min,
                    paddingVertical: t.space.md,
                    gap: t.space.lg,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                testID={`supply.category.${c.id}`}
              >
                <CategorySquare category={c.id} size={SQUARE_SM} />
                <AppText variant="body" style={styles.grow}>
                  {c.label}
                </AppText>
                {/* the tick, not a filled row: the state is a glyph beside the name, so it is
                    never carried by a background color alone (CLAUDE.md §6) */}
                {picked ? <Icon name="check" size={18} color={a.accent} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
});
