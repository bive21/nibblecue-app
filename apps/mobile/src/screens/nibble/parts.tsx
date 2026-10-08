/**
 * THE PIECES NIBBLECUE'S SCREENS SHARE, every one made of CuddleCue's design system (the owner,
 * 2026-10-08: "use as much modules as you can from cuddlecue so the app still feel familiar"):
 * a plan item is CuddleCue's `Row`, a meal is a `Card` of rows, "How did it go?" is the solids
 * sheet's own four tiles, and a locked part of the plan is CuddleCue's Plus lock.
 */
import { FOOD_RESPONSES, RESPONSE_LABEL, type FoodResponse } from '@nibblecue/core';
import {
  ALLERGENS,
  FORM_LABEL,
  MEAL_LABEL,
  NOT_MEDICAL_ADVICE,
  reasonText,
  type Food,
  type PlanItem,
  type PlanMeal,
} from '@nibblecue/core/nibble';
import {
  AppText,
  Body,
  BodySm,
  BodyStrong,
  Button,
  Caption,
  Card,
  Icon,
  Meta,
  Row,
  Rows,
  useCategory,
  useTheme,
} from '@nibblecue/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { RESPONSE_TILE } from '../../sheets/quick/modules/solids/copy';
import { PLUS_SEE } from './copy';

/** The line under every page that gives advice (spec §14). */
export function NotMedical({ testID }: { testID?: string }) {
  const t = useTheme();
  return (
    <Caption style={{ marginTop: t.space.lg, textAlign: 'center' }} {...(testID ? { testID } : {})}>
      {NOT_MEDICAL_ADVICE}
    </Caption>
  );
}

/** The first reason an item is on the plan, in the plan's own words. */
export function itemReason(item: PlanItem): string {
  const first = item.reasons[0];
  if (first === undefined) return '';
  return reasonText({
    reason: first,
    firstAllergen: item.firstAllergen,
    keepGoing: item.keepGoing,
    note: item.note,
  });
}

/** One planned food as a row: its name, the form and why it is there; New and a first allergen badged. */
export function PlanItemRow({
  item,
  food,
  onPress,
  right,
  testID,
}: {
  item: PlanItem;
  food: Food | undefined;
  onPress?: () => void;
  right?: ReactNode;
  testID?: string;
}) {
  const name = food?.name ?? item.foodId;
  const badge = item.firstAllergen
    ? { label: `First ${ALLERGENS[item.firstAllergen].name.toLowerCase()}`, tone: 'warn' as const }
    : item.isNew
      ? { label: 'New', tone: 'accent' as const }
      : undefined;
  return (
    <Row
      title={name}
      detail={`${FORM_LABEL[item.form]} · ${itemReason(item)}`}
      icon="solids"
      {...(badge ? { badge } : {})}
      {...(onPress ? { onPress } : {})}
      {...(right !== undefined ? { right } : {})}
      accessibilityLabel={`${name}, ${FORM_LABEL[item.form]}. ${itemReason(item)}`}
      {...(testID ? { testID } : {})}
    />
  );
}

/** A meal: its name, its foods, and the meal's own action at its foot. */
export function MealCard({
  meal,
  foodById,
  onItem,
  footer,
  served,
  testID,
}: {
  meal: PlanMeal;
  foodById: (id: string) => Food | undefined;
  onItem?: (item: PlanItem) => void;
  footer?: ReactNode;
  served?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Card {...(testID ? { testID } : {})}>
      <View style={[styles.head, { gap: t.space.sm, marginBottom: t.space.xs }]}>
        <BodyStrong>{MEAL_LABEL[meal.meal]}</BodyStrong>
        {served ? (
          <View style={[styles.head, { gap: t.space.xs }]}>
            <Icon name="check" size={16} color={t.color.good} />
            <Meta ink="good">Served</Meta>
          </View>
        ) : null}
      </View>
      <Rows>
        {meal.items.map(item => (
          <PlanItemRow
            key={`${meal.meal}:${item.foodId}`}
            item={item}
            food={foodById(item.foodId)}
            {...(onItem ? { onPress: () => onItem(item) } : {})}
            {...(testID ? { testID: `${testID}.${item.foodId}` } : {})}
          />
        ))}
      </Rows>
      {footer ? <View style={{ marginTop: t.space.sm }}>{footer}</View> : null}
    </Card>
  );
}

/** "How did it go?": the solids sheet's own four tiles. Tapping the chosen one clears it. */
export function ResponseTiles({
  value,
  onChange,
  small = false,
  testID,
}: {
  value: FoodResponse | null;
  onChange: (r: FoodResponse | null) => void;
  small?: boolean;
  testID: string;
}) {
  const t = useTheme();
  const cat = useCategory('solids');
  return (
    <View
      style={[styles.row, { gap: small ? t.space.xs : t.space.sm }]}
      accessibilityRole="radiogroup"
    >
      {FOOD_RESPONSES.map(r => {
        const on = value === r;
        return (
          <Pressable
            key={r}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={RESPONSE_LABEL[r]}
            onPress={() => onChange(on ? null : r)}
            style={({ pressed }) => [
              styles.tile,
              {
                minHeight: small ? t.hit.min : t.hit.min + t.space.md,
                paddingVertical: small ? t.space.xs : t.space.sm,
                paddingHorizontal: t.space.xs,
                borderRadius: t.radius.m,
                borderWidth: on ? 2 : 1,
                borderColor: on ? cat.fg : t.color.line,
                backgroundColor: on ? cat.soft : 'transparent',
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            testID={`${testID}.${r.toLowerCase()}`}
          >
            <AppText variant={small ? 'body' : 'h2'} align="center" accessible={false}>
              {RESPONSE_TILE[r].face}
            </AppText>
            <Meta ink={on ? 'text' : 'text2'} align="center" accessible={false}>
              {r === 'DISLIKED' ? "Didn't like it" : RESPONSE_TILE[r].word}
            </Meta>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A part of the app NibbleCue Plus opens: what it is, and the way to the plan page. */
export function PlusLock({
  title,
  body,
  onOpen,
  testID,
}: {
  title: string;
  body: string;
  onOpen: () => void;
  testID: string;
}) {
  const t = useTheme();
  return (
    <Card testID={testID}>
      <View style={{ gap: t.space.sm }}>
        <View style={[styles.head, { gap: t.space.sm }]}>
          <Icon name="lock" size={18} color={t.color.accent2} />
          <BodyStrong>{title}</BodyStrong>
        </View>
        <BodySm>{body}</BodySm>
        <Button
          label={PLUS_SEE}
          size="sm"
          onPress={onOpen}
          style={styles.start}
          testID={`${testID}.open`}
        />
      </View>
    </Card>
  );
}

/** A short paragraph in a card, for the pages that are mostly words. */
export function WordsCard({
  title,
  lines,
  testID,
}: {
  title?: string;
  lines: readonly string[];
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Card {...(testID ? { testID } : {})}>
      <View style={{ gap: t.space.xs }}>
        {title ? <BodyStrong>{title}</BodyStrong> : null}
        {lines.map(l => (
          <Body key={l}>{l}</Body>
        ))}
      </View>
    </Card>
  );
}

export const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  start: { alignSelf: 'flex-start' },
  grow: { flexGrow: 1, flexShrink: 1 },
});
