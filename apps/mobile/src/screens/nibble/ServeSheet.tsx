/**
 * SERVED, IN TWO TAPS (spec §6.1): "Served" on a meal opens this, one "How did it go?" for the whole
 * meal is the second tap, Save the third. The answer per food is one switch away, and a food that
 * was not offered after all is taken off before saving.
 *
 * What it writes is CuddleCue's own solids entry (`writes.ts` `logServed`), so the meal is in the
 * CuddleCue log too, with every food and how it went.
 */
import { type FoodResponse } from '@nibblecue/core';
import {
  MEAL_LABEL,
  REFUSAL_TEXT,
  type Food,
  type PlanInput,
  type PlanMeal,
} from '@nibblecue/core/nibble';
import {
  Body,
  BodyStrong,
  BottomSheet,
  Button,
  Chip,
  Row,
  SegmentedControl,
  SheetFooter,
  useTheme,
} from '@nibblecue/ui';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNibbleWrites } from '../../nibble/useNibbleWrites';
import { SERVE } from './copy';
import { comesBack } from './comesBack';
import { ResponseTiles } from './parts';

/** When a meal is usually eaten: "Earlier today" logs it here, unless that is still to come. */
const MEAL_CLOCK: Readonly<Record<PlanMeal['meal'], [number, number]>> = {
  breakfast: [8, 0],
  lunch: [12, 0],
  snack: [15, 30],
  dinner: [17, 30],
};

export function earlierToday(meal: PlanMeal['meal'], now: Date): Date {
  const [h, m] = MEAL_CLOCK[meal];
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  return at.getTime() < now.getTime() ? at : now;
}

export function ServeSheet({
  visible,
  childId,
  day,
  meal,
  foodById,
  planInput = null,
  onClose,
}: {
  visible: boolean;
  childId: string | null;
  day: string;
  meal: PlanMeal | null;
  foodById: (id: string) => Food | undefined;
  /** The plan the meal came from: after a save, it says when the first food comes back. */
  planInput?: PlanInput | null;
  onClose: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const writes = useNibbleWrites();
  const [shared, setShared] = useState<FoodResponse | null>(null);
  const [each, setEach] = useState(false);
  const [per, setPer] = useState<Record<string, FoodResponse | null>>({});
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const [when, setWhen] = useState<'now' | 'earlier'>('now');
  // a save lands on the phone at once (local-first), so the button never waits; this only keeps a
  // double tap from saving twice
  const busy = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setShared(null);
    setEach(false);
    setPer({});
    setLeft(new Set());
    setWhen('now');
  }, [visible, meal]);

  if (meal === null) return null;
  const label = MEAL_LABEL[meal.meal];
  const offered = meal.items.filter(i => !left.has(i.foodId));

  const save = async () => {
    if (childId === null || offered.length === 0) return;
    if (busy.current) return;
    busy.current = true;
    try {
      const foods = offered.flatMap(i => {
        const food = foodById(i.foodId);
        if (food === undefined) return [];
        const response = each ? (per[i.foodId] ?? null) : shared;
        return [{ food, form: i.form, response, planItem: `${day}:${meal.meal}:${i.foodId}` }];
      });
      const at = when === 'now' ? new Date() : earlierToday(meal.meal, new Date());
      const out = await writes.serve(
        { childId, meal: meal.meal, atIso: at.toISOString(), foods },
        SERVE.saved(label),
      );
      if (out?.committed) {
        if (foods.some(f => f.response === 'DISLIKED')) writes.say(REFUSAL_TEXT, { queue: true });
        const next = planInput ? comesBack(planInput, foods, day, at.toISOString(), meal) : null;
        if (next !== null) writes.say(next, { queue: true });
        onClose();
      }
    } finally {
      busy.current = false;
    }
  };

  return (
    <BottomSheet
      visible={visible}
      title={SERVE.title(label)}
      onClose={onClose}
      bottomInset={insets.bottom}
      footer={
        <SheetFooter>
          <Button
            label={SERVE.save}
            onPress={() => void save()}
            disabled={offered.length === 0 || childId === null}
            testID="serve.save"
          />
        </SheetFooter>
      }
      testID="serve"
    >
      <View style={{ gap: t.space.md }}>
        {each ? null : <ResponseTiles value={shared} onChange={setShared} testID="serve.meal" />}
        <Row title={SERVE.eachFood} switchValue={each} onSwitch={setEach} testID="serve.each" />
        {meal.items.map(i => {
          const food = foodById(i.foodId);
          const name = food?.name ?? i.foodId;
          const out = left.has(i.foodId);
          return (
            <View key={i.foodId} style={{ gap: t.space.xs }}>
              <BodyStrong ink={out ? 'text3' : 'text'}>{name}</BodyStrong>
              {each && !out ? (
                <ResponseTiles
                  small
                  value={per[i.foodId] ?? null}
                  onChange={r => setPer(p => ({ ...p, [i.foodId]: r }))}
                  testID={`serve.food.${i.foodId}`}
                />
              ) : null}
              <Chip
                small
                label={SERVE.didntOffer}
                selected={out}
                onPress={() =>
                  setLeft(s => {
                    const next = new Set(s);
                    if (next.has(i.foodId)) next.delete(i.foodId);
                    else next.add(i.foodId);
                    return next;
                  })
                }
                style={{ alignSelf: 'flex-start' }}
                testID={`serve.skip.${i.foodId}`}
              />
            </View>
          );
        })}
        <View style={{ gap: t.space.xs }}>
          <Body>{SERVE.when}</Body>
          <SegmentedControl
            label={SERVE.when}
            value={when}
            onChange={setWhen}
            options={[
              { value: 'now', label: SERVE.now },
              { value: 'earlier', label: SERVE.earlier },
            ]}
            testID="serve.when"
          />
        </View>
      </View>
    </BottomSheet>
  );
}
