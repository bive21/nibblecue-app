/**
 * FOODS (docs/PRODUCT.md §Foods): the library and the household's own foods, searched and
 * filtered, each with this baby's history in a word. A row opens the food's page.
 */
import { type Food } from '@nibblecue/core/nibble';
import { BodySm, Button, Chip, Input, Row, Rows, SectionHeader, useTheme } from '@nibblecue/ui';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams, TabParams } from '../../app/types';
import { useCanLog } from '../../household/useCanLog';
import { useNibble } from '../../nibble/useNibble';
import { CATEGORY_LABEL, FOODS } from './copy';
import { matchesQuery } from './FoodPickerSheet';
import { styles } from './parts';

type Nav = NativeStackNavigationProp<RootParams>;
export type FoodFilter = 'all' | 'first' | 'allergens' | 'iron' | 'untried' | 'tried';
const FILTERS: readonly FoodFilter[] = ['all', 'first', 'allergens', 'iron', 'untried', 'tried'];

export function filterFoods(
  foods: readonly Food[],
  filter: FoodFilter,
  query: string,
  timesOf: (f: Food) => number,
): Food[] {
  return foods
    .filter(f => matchesQuery(f, query))
    .filter(f => {
      switch (filter) {
        case 'all':
          return true;
        case 'first':
          return f.firstFood;
        case 'allergens':
          return f.allergens.length > 0;
        case 'iron':
          return f.ironRich;
        case 'untried':
          return timesOf(f) === 0;
        case 'tried':
          return timesOf(f) > 0;
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function FoodsScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<TabParams, 'Foods'>>();
  const canLog = useCanLog();
  const v = useNibble();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<FoodFilter | null>(null);
  const filter: FoodFilter = chosen ?? route.params?.filter ?? 'all';
  const timesOf = (f: Food) => v.statuses.get(`id:${f.id}`)?.times ?? 0;
  const list = useMemo(
    () => filterFoods(v.foods, filter, query, timesOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v.foods, v.statuses, filter, query],
  );
  const tried = v.foods.filter(f => timesOf(f) > 0).length;

  return (
    <Screen testID="foods">
      <SectionHeader title={FOODS.title} variant="tab" />
      <View style={{ gap: t.space.md }}>
        <Input
          label={FOODS.search}
          labelHidden
          value={query}
          onChangeText={setQuery}
          placeholder={FOODS.search}
          leading="search"
          onClear={() => setQuery('')}
          testID="foods.search"
        />
        <View style={[styles.wrap, { gap: t.space.xs }]}>
          {FILTERS.map(f => (
            <Chip
              key={f}
              small
              label={FOODS.filters[f]}
              selected={filter === f}
              onPress={() => setChosen(f)}
              testID={`foods.filter.${f}`}
            />
          ))}
        </View>
        <BodySm testID="foods.counts">{FOODS.counts(tried, v.foods.length)}</BodySm>
        {list.length === 0 ? (
          <BodySm>{FOODS.empty}</BodySm>
        ) : (
          <Rows testID="foods.list">
            {list.map(f => {
              const n = timesOf(f);
              const young = v.months < f.notBeforeMonths;
              return (
                <Row
                  key={f.id}
                  title={f.name}
                  detail={`${CATEGORY_LABEL[f.category]} · ${
                    n > 0
                      ? FOODS.tried(n)
                      : young
                        ? FOODS.notYet(f.notBeforeMonths)
                        : FOODS.notTried
                  }`}
                  {...(f.allergens.length > 0
                    ? { badge: { label: 'Allergen', tone: 'neutral' as const } }
                    : {})}
                  tone={young ? 'muted' : 'default'}
                  onPress={() => nav.navigate('Food', { foodId: f.id })}
                  testID={`foods.row.${f.id}`}
                />
              );
            })}
          </Rows>
        )}
        {canLog ? (
          <Button
            label={FOODS.addOwn}
            variant="secondary"
            icon="plus"
            onPress={() =>
              nav.navigate('AddFood', query.trim() ? { name: query.trim() } : undefined)
            }
            testID="foods.add"
          />
        ) : null}
      </View>
    </Screen>
  );
}
