/**
 * ONE FOOD (docs/PRODUCT.md §Foods): how to serve it at this baby's age and at the others, the
 * choking note, what it contains and is good for, this baby's history with it, its sources, and
 * the parent's two controls: never plan it, or put it on tomorrow's plan.
 */
import { RESPONSE_LABEL } from '@nibblecue/core';
import {
  AGE_BANDS,
  ALLERGENS,
  CUSTOM_PREFIX,
  FORM_LABEL,
  SOURCE_BY_ID,
  servingFor,
  type AgeBand,
} from '@nibblecue/core/nibble';
import {
  Body,
  BodySm,
  BodyStrong,
  Button,
  Caption,
  Card,
  Disclosure,
  EmptyState,
  Row,
  Rows,
  SectionHeader,
  useTheme,
} from '@nibblecue/ui';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useCanLog } from '../../household/useCanLog';
import { useNibble } from '../../nibble/useNibble';
import { useNibbleWrites } from '../../nibble/useNibbleWrites';
import { CATEGORY_LABEL, FOOD, FOODS, NUTRIENT_LABEL } from './copy';
import { NotMedical } from './parts';
import { dayLabel } from './TodayScreen';

type Nav = NativeStackNavigationProp<RootParams>;

/** "6 to 8 months", "18 to 24 months". */
export const bandLabel = (band: AgeBand): string => `${band.replace('-', ' to ')} months`;

export function FoodScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const { foodId } = useRoute<RouteProp<RootParams, 'Food'>>().params;
  const canLog = useCanLog();
  const v = useNibble();
  const writes = useNibbleWrites();
  const food = v.foodById(foodId);

  if (!food)
    return (
      <Screen title={FOOD.pageTitle} testID="food">
        {v.loaded ? (
          <EmptyState
            icon="search"
            title={FOOD.missing}
            body={FOOD.missingBody}
            testID="food.missing"
          />
        ) : null}
      </Screen>
    );

  const serving = servingFor(food, v.band);
  const mine = v.exposures.filter(e => e.foodId === food.id).reverse();
  const last = mine[0];
  const never = v.profile?.neverServe.includes(food.id) ?? false;
  const tomorrow = v.plan[1];
  const tomorrowMeal = tomorrow?.meals[0]?.meal ?? 'breakfast';
  const onTomorrow = tomorrow?.meals.some(m => m.items.some(i => i.foodId === food.id)) ?? false;
  const custom = food.id.startsWith(CUSTOM_PREFIX);
  const goodFor = (Object.keys(NUTRIENT_LABEL) as (keyof typeof NUTRIENT_LABEL)[])
    .filter(k => food.nutrients[k] >= 2)
    .map(k => NUTRIENT_LABEL[k]);

  const setNever = (on: boolean) => {
    if (v.childId === null || v.profile === null || v.profileRecord === null) return;
    const list = new Set(v.profile.neverServe);
    if (on) list.add(food.id);
    else list.delete(food.id);
    void writes.saveProfile(
      v.childId,
      v.profileRecord.id,
      { ...v.profile, neverServe: [...list] },
      on ? FOOD.neverServeOn : null,
    );
  };

  return (
    <Screen title={food.name} testID="food">
      <View style={{ gap: t.space.md }}>
        <BodySm>{CATEGORY_LABEL[food.category]}</BodySm>
        {custom ? <BodySm testID="food.custom">{FOOD.custom}</BodySm> : null}

        <Card testID="food.serving">
          <View style={{ gap: t.space.xs }}>
            <BodyStrong>{FOOD.serving(bandLabel(v.band))}</BodyStrong>
            {v.months < food.notBeforeMonths ? (
              <Body>{FOODS.notYet(food.notBeforeMonths)}</Body>
            ) : (
              <>
                <Body>{serving.how}</Body>
                {serving.forms.length > 0 ? (
                  <BodySm>{serving.forms.map(f => FORM_LABEL[f]).join(' · ')}</BodySm>
                ) : null}
              </>
            )}
            {food.chokingNote ? (
              <BodySm ink="warn" testID="food.choking">
                {`${FOOD.choking}: ${food.chokingNote}`}
              </BodySm>
            ) : null}
          </View>
        </Card>

        <Disclosure summary={FOOD.allServing} testID="food.bands">
          <View style={{ gap: t.space.sm }}>
            {AGE_BANDS.filter(b => b !== v.band).map(b => (
              <View key={b} style={{ gap: t.space.xs }}>
                <BodyStrong>{bandLabel(b)}</BodyStrong>
                <BodySm>{servingFor(food, b).how}</BodySm>
              </View>
            ))}
          </View>
        </Disclosure>

        {food.allergens.length > 0 || goodFor.length > 0 ? (
          <Card>
            <View style={{ gap: t.space.xs }}>
              {food.allergens.length > 0 ? (
                <BodySm testID="food.allergens">
                  {`${FOOD.allergens}: ${food.allergens.map(a => ALLERGENS[a].name).join(', ')}`}
                </BodySm>
              ) : null}
              {goodFor.length > 0 ? (
                <BodySm>{`${FOOD.nutrients}: ${goodFor.join(', ')}`}</BodySm>
              ) : null}
            </View>
          </Card>
        ) : null}

        {food.ideas.length > 0 ? (
          <>
            <SectionHeader title={FOOD.ideas} tight />
            <Card>
              <View style={{ gap: t.space.xs }}>
                {food.ideas.map(i => (
                  <BodySm key={i}>{i}</BodySm>
                ))}
              </View>
            </Card>
          </>
        ) : null}

        <SectionHeader title={FOOD.history} tight />
        <Card testID="food.history">
          {last ? (
            <View style={{ gap: t.space.xs }}>
              <BodyStrong>{FOODS.tried(mine.length)}</BodyStrong>
              <BodySm>
                {FOOD.lastTime(
                  dayLabel(last.day),
                  last.response === null ? null : RESPONSE_LABEL[last.response].toLowerCase(),
                )}
              </BodySm>
            </View>
          ) : (
            <BodySm>{FOOD.noHistory}</BodySm>
          )}
        </Card>

        {canLog && v.profile !== null ? (
          <Rows>
            <Row
              title={FOOD.neverServe}
              switchValue={never}
              onSwitch={setNever}
              testID="food.never"
            />
          </Rows>
        ) : null}

        {canLog && v.childId !== null && tomorrow && !never ? (
          <Button
            label={onTomorrow ? FOOD.added : FOOD.addToPlan}
            variant="secondary"
            icon={onTomorrow ? 'check' : 'plus'}
            disabled={onTomorrow}
            onPress={() => {
              if (v.childId === null) return;
              void writes.mark(
                v.childId,
                { day: tomorrow.day, meal: tomorrowMeal, kind: 'pin', foodId: food.id },
                FOOD.added,
              );
            }}
            testID="food.tomorrow"
          />
        ) : null}

        {canLog && custom ? (
          <Button
            label={FOOD.removeOwn}
            variant="ghost"
            onPress={() => {
              const id = food.id.slice(CUSTOM_PREFIX.length);
              void writes
                .remove(
                  { recordId: id, kind: 'custom_food', childId: null },
                  FOOD.removed(food.name),
                )
                .then(() => nav.goBack());
            }}
            testID="food.remove"
          />
        ) : null}

        <SectionHeader title={FOOD.sources} tight />
        <View style={{ gap: t.space.xs }}>
          {food.sources.map(s => {
            const src = SOURCE_BY_ID.get(s);
            return (
              <Caption key={s}>
                {src ? `${src.publisher}: ${src.title}. Checked ${src.checked}.` : s}
              </Caption>
            );
          })}
        </View>
        <NotMedical />
      </View>
    </Screen>
  );
}
