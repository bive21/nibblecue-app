/**
 * THE FIRST DAYS OF A PLAN, READ ONLY: under each setup question (the plan the answers make so far)
 * and on the getting-ready page (the days a start would bring). The same planner Today uses, so what
 * a parent sees here is what Today will show.
 */
import { ALLERGENS, FORM_LABEL, type Food, type PlanDay } from '@nibblecue/core/nibble';
import { BodySm, Card, Label, Row, Rows, useTheme } from '@nibblecue/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SETUP } from './copy';
import { dayLabel } from './dates';
import { FoodThumb } from './FoodThumb';

/** The days with food on them, from the first. */
export const foodDays = (plan: readonly PlanDay[]): PlanDay[] =>
  plan.filter(d => !d.skip && d.meals.some(m => m.items.length > 0));

export function PlanPreview({
  plan,
  foodById,
  title,
  days: count = 3,
  footer,
  testID = 'setup.preview',
}: {
  plan: readonly PlanDay[];
  foodById: (id: string) => Food | undefined;
  title: string;
  days?: number;
  footer?: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  const days = foodDays(plan).slice(0, count);
  return (
    <Card testID={testID}>
      <View style={{ gap: t.space.xs }}>
        <Label>{title}</Label>
        {days.length === 0 ? <BodySm>{SETUP.previewEmpty}</BodySm> : null}
        {days.map((d, k) => (
          <View key={d.day} style={{ gap: 2 }}>
            <BodySm ink="text">{SETUP.previewDay(k + 1, dayLabel(d.day))}</BodySm>
            <Rows>
              {d.meals
                .flatMap(m => m.items)
                .map(i => {
                  const food = foodById(i.foodId);
                  return (
                    <Row
                      key={`${d.day}:${i.foodId}`}
                      title={food?.name ?? i.foodId}
                      detail={FORM_LABEL[i.form]}
                      iconNode={<FoodThumb food={food} size={28} />}
                      right="none"
                      {...(i.firstAllergen
                        ? {
                            badge: {
                              label: SETUP.firstAllergen(
                                ALLERGENS[i.firstAllergen].name.toLowerCase(),
                              ),
                              tone: 'warn' as const,
                            },
                          }
                        : i.isNew
                          ? { badge: { label: SETUP.newFood, tone: 'accent' as const } }
                          : {})}
                    />
                  );
                })}
            </Rows>
          </View>
        ))}
        {footer}
      </View>
    </Card>
  );
}
