/**
 * A FOOD'S PICTURE: its photo where one has been imported (`nibble/foodImages.generated.ts`,
 * docs/FOOD_IMAGES.md), and until then its category's glyph on the solids tint, so a list never
 * shows a hole where a picture will be. Decorative: the food's name is always said beside it.
 */
import type { Food, FoodCategory } from '@nibblecue/core/nibble';
import { Icon, useCategory, type IconName } from '@nibblecue/ui';
import { Image, View } from 'react-native';
import { FOOD_IMAGES } from '../../nibble/foodImages.generated';

const GLYPH: Readonly<Record<FoodCategory, IconName>> = {
  fruit: 'apple',
  vegetable: 'carrot',
  herb_spice: 'broccoli',
  grain: 'solids',
  meat: 'spoon',
  fish: 'spoon',
  egg: 'spoon',
  dairy: 'spoon',
  plant_protein: 'spoon',
  nut_seed: 'spoon',
  fat: 'spoon',
  pouch_jar: 'solids',
  drink: 'water',
};

export function FoodThumb({ food, size = 40 }: { food: Food | undefined; size?: number }) {
  const cat = useCategory('solids');
  const photo = food ? FOOD_IMAGES[food.id] : undefined;
  const radius = size >= 96 ? 20 : size / 4;
  if (photo !== undefined)
    return (
      <Image
        source={photo}
        style={{ width: size, height: size, borderRadius: radius }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    );
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: cat.soft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon
        name={food ? GLYPH[food.category] : 'solids'}
        size={Math.round(size * 0.55)}
        color={cat.fg}
      />
    </View>
  );
}
