/**
 * PICK A FOOD: a search field over the library and the household's own foods, the baby's tried
 * foods first. Used to add a food to a meal on the plan; whatever is picked still goes through the
 * plan's rules, and a pin the rules refuse is shown on the plan as refused, never as planned.
 */
import { keysOf, type Food, type FoodStatus } from '@nibblecue/core/nibble';
import { BottomSheet, Input, Row, Rows, useTheme } from '@nibblecue/ui';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FOODS } from './copy';

const MAX = 40;

export function matchesQuery(food: Food, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return keysOf(food).some(k => k.includes(q)) || food.name.toLowerCase().includes(q);
}

export function FoodPickerSheet({
  visible,
  title,
  foods,
  statuses,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  foods: readonly Food[];
  statuses: ReadonlyMap<string, FoodStatus>;
  onPick: (food: Food) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const tried = (f: Food) => statuses.get(`id:${f.id}`)?.times ?? 0;
    return foods
      .filter(f => matchesQuery(f, query))
      .sort((a, b) => tried(b) - tried(a) || a.name.localeCompare(b.name))
      .slice(0, MAX);
  }, [foods, statuses, query]);
  return (
    <BottomSheet
      visible={visible}
      title={title}
      onClose={() => {
        setQuery('');
        onClose();
      }}
      detent="large"
      bottomInset={insets.bottom}
      testID="picker"
    >
      <View style={{ gap: t.space.md }}>
        <Input
          label={FOODS.search}
          labelHidden
          value={query}
          onChangeText={setQuery}
          placeholder={FOODS.search}
          leading="search"
          onClear={() => setQuery('')}
          testID="picker.search"
        />
        <Rows>
          {list.map(f => {
            const n = statuses.get(`id:${f.id}`)?.times ?? 0;
            return (
              <Row
                key={f.id}
                title={f.name}
                detail={n > 0 ? FOODS.tried(n) : FOODS.notTried}
                onPress={() => {
                  setQuery('');
                  onPick(f);
                }}
                testID={`picker.${f.id}`}
              />
            );
          })}
        </Rows>
      </View>
    </BottomSheet>
  );
}
