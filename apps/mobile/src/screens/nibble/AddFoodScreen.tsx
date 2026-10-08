/**
 * ADD YOUR OWN FOOD (spec §6.3): a name, what kind of food it is, the allergens it contains and how
 * hard or round it is. The plan treats it like a library food under the same rules; a name the
 * rules know as unsafe for a baby is said so, and is never planned, though it can still be logged.
 */
import {
  ALLERGEN_IDS,
  ALLERGENS,
  FOOD_CATEGORIES,
  isHighMercuryName,
  isUnsafeName,
  type AllergenId,
  type FoodCategory,
} from '@nibblecue/core/nibble';
import {
  BodySm,
  Button,
  Chip,
  Input,
  Label,
  Row,
  Rows,
  SegmentedControl,
  useTheme,
} from '@nibblecue/ui';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useNibbleWrites } from '../../nibble/useNibbleWrites';
import { ADD_FOOD, CATEGORY_LABEL } from './copy';
import { styles } from './parts';

type Nav = NativeStackNavigationProp<RootParams>;

export function AddFoodScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootParams, 'AddFood'>>();
  const writes = useNibbleWrites();
  const [name, setName] = useState(route.params?.name ?? '');
  const [category, setCategory] = useState<FoodCategory>('vegetable');
  const [allergens, setAllergens] = useState<AllergenId[]>([]);
  const [choking, setChoking] = useState<'low' | 'medium' | 'high'>('medium');
  const [iron, setIron] = useState(false);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const unsafe = trimmed !== '' && (isUnsafeName(trimmed) || isHighMercuryName(trimmed));

  const save = async () => {
    if (trimmed === '') return;
    setBusy(true);
    try {
      const out = await writes.save(
        {
          childId: null,
          kind: 'custom_food',
          body: {
            name: trimmed.slice(0, 40),
            category,
            allergens,
            chokingRisk: choking,
            notBeforeMonths: 6,
            ironRich: iron,
          },
        },
        ADD_FOOD.saved(trimmed),
      );
      if (out?.committed) nav.goBack();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={ADD_FOOD.title} testID="addfood">
      <View style={{ gap: t.space.lg }}>
        <Input
          label={ADD_FOOD.name}
          value={name}
          onChangeText={setName}
          placeholder={ADD_FOOD.namePlaceholder}
          maxLength={40}
          testID="addfood.name"
        />
        {unsafe ? (
          <BodySm ink="warn" testID="addfood.unsafe">
            {ADD_FOOD.unsafe}
          </BodySm>
        ) : null}
        <View style={{ gap: t.space.xs }}>
          <Label>{ADD_FOOD.category}</Label>
          <View style={[styles.wrap, { gap: t.space.xs }]}>
            {FOOD_CATEGORIES.filter(c => c !== 'pouch_jar').map(c => (
              <Chip
                key={c}
                small
                label={CATEGORY_LABEL[c]}
                selected={category === c}
                onPress={() => setCategory(c)}
                testID={`addfood.category.${c}`}
              />
            ))}
          </View>
        </View>
        <View style={{ gap: t.space.xs }}>
          <Label>{ADD_FOOD.allergens}</Label>
          <BodySm>{ADD_FOOD.allergensHint}</BodySm>
          <View style={[styles.wrap, { gap: t.space.xs }]}>
            {ALLERGEN_IDS.map(a => (
              <Chip
                key={a}
                small
                label={ALLERGENS[a].name}
                selected={allergens.includes(a)}
                onPress={() =>
                  setAllergens(list =>
                    list.includes(a) ? list.filter(x => x !== a) : [...list, a],
                  )
                }
                testID={`addfood.allergen.${a}`}
              />
            ))}
          </View>
        </View>
        <View style={{ gap: t.space.xs }}>
          <Label>{ADD_FOOD.choking}</Label>
          <SegmentedControl
            label={ADD_FOOD.choking}
            value={choking}
            onChange={setChoking}
            options={[
              { value: 'low', label: ADD_FOOD.chokingLow },
              { value: 'medium', label: ADD_FOOD.chokingMedium },
              { value: 'high', label: ADD_FOOD.chokingHigh },
            ]}
            testID="addfood.choking"
          />
        </View>
        <Rows>
          <Row title={ADD_FOOD.iron} switchValue={iron} onSwitch={setIron} testID="addfood.iron" />
        </Rows>
        <Button
          label={ADD_FOOD.save}
          onPress={() => void save()}
          loading={busy}
          disabled={trimmed === ''}
          testID="addfood.save"
        />
      </View>
    </Screen>
  );
}
