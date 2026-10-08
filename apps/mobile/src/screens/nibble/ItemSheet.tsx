/**
 * ONE PLANNED FOOD, OPENED: how to serve it at this age, why it is there, and the parent's hand on
 * it: swap it for something the plan's rules allow (`swapOptions`), take it off the meal, or open
 * the food's own page. A swap is two marks, so one Undo takes both back.
 */
import {
  ALLERGENS,
  FORM_LABEL,
  FIRST_ALLERGEN_TIP,
  reasonText,
  servingFor,
  swapOptions,
  type Food,
  type MealName,
  type PlanInput,
  type PlanItem,
} from '@nibblecue/core/nibble';
import {
  Body,
  BodySm,
  BodyStrong,
  BottomSheet,
  Button,
  Card,
  Row,
  Rows,
  SectionHeader,
  useTheme,
} from '@nibblecue/ui';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WriteOutcome } from '../../data/repository';
import { useNibbleWrites } from '../../nibble/useNibbleWrites';
import { FOOD, PLAN, SWAP, TODAY } from './copy';
import { itemReason } from './parts';

export interface OpenItem {
  day: string;
  meal: MealName;
  item: PlanItem;
}

export function ItemSheet({
  open,
  childId,
  band,
  planInput,
  foodById,
  canEdit,
  onClose,
  onOpenFood,
}: {
  open: OpenItem | null;
  childId: string | null;
  band: Parameters<typeof servingFor>[1];
  planInput: PlanInput | null;
  foodById: (id: string) => Food | undefined;
  canEdit: boolean;
  onClose: () => void;
  onOpenFood: (foodId: string) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const writes = useNibbleWrites();
  const [swapping, setSwapping] = useState(false);
  const food = open ? foodById(open.item.foodId) : undefined;
  const options = useMemo(
    () =>
      swapping && open && planInput
        ? swapOptions(planInput, open.day, open.meal, open.item.foodId)
        : [],
    [swapping, open, planInput],
  );

  const close = () => {
    setSwapping(false);
    onClose();
  };

  const swapTo = async (to: Food) => {
    if (!open || childId === null) return;
    const a = await writes.mark(
      childId,
      { day: open.day, meal: open.meal, kind: 'remove', foodId: open.item.foodId },
      null,
    );
    const b = await writes.mark(
      childId,
      { day: open.day, meal: open.meal, kind: 'pin', foodId: to.id },
      null,
    );
    const done = [a, b].filter((o): o is WriteOutcome => o !== null && o.committed);
    if (done.length > 0) writes.say(SWAP.done(to.name), { undo: () => void writes.undoAll(done) });
    close();
  };

  const takeOff = async () => {
    if (!open || childId === null) return;
    await writes.mark(
      childId,
      { day: open.day, meal: open.meal, kind: 'remove', foodId: open.item.foodId },
      PLAN.removed,
    );
    close();
  };

  const serving = food ? servingFor(food, band) : null;
  const name = food?.name ?? open?.item.foodId ?? '';
  return (
    <BottomSheet
      visible={open !== null}
      title={swapping ? SWAP.title : name}
      onClose={close}
      {...(swapping ? { onBack: () => setSwapping(false) } : {})}
      bottomInset={insets.bottom}
      testID="item"
    >
      {open === null ? null : swapping ? (
        options.length === 0 ? (
          <Body testID="item.swap.none">{SWAP.none}</Body>
        ) : (
          <Rows testID="item.swap">
            {options.map(o => (
              <Row
                key={o.food.id}
                title={o.food.name}
                detail={`${FORM_LABEL[o.item.form]} · ${itemReason(o.item)}`}
                icon="solids"
                onPress={() => void swapTo(o.food)}
                testID={`item.swap.${o.food.id}`}
              />
            ))}
          </Rows>
        )
      ) : (
        <View style={{ gap: t.space.md }}>
          <Card>
            <View style={{ gap: t.space.xs }}>
              <BodyStrong>{TODAY.howToServe}</BodyStrong>
              <Body>{FORM_LABEL[open.item.form]}</Body>
              {serving ? <BodySm>{serving.how}</BodySm> : null}
              {food?.chokingNote ? (
                <BodySm ink="warn" testID="item.choking">
                  {food.chokingNote}
                </BodySm>
              ) : null}
            </View>
          </Card>
          {open.item.firstAllergen ? (
            <Card testID="item.first">
              <BodySm>{FIRST_ALLERGEN_TIP}</BodySm>
            </Card>
          ) : null}
          <View style={{ gap: t.space.xs }}>
            <SectionHeader title={PLAN.why} tight />
            {open.item.reasons.map(r => (
              <BodySm key={r}>
                {reasonText({
                  reason: r,
                  firstAllergen: open.item.firstAllergen,
                  keepGoing: open.item.keepGoing,
                  note: open.item.note,
                })}
              </BodySm>
            ))}
            {food && food.allergens.length > 0 ? (
              <BodySm>
                {`${FOOD.allergens}: ${food.allergens.map(a => ALLERGENS[a].name).join(', ')}`}
              </BodySm>
            ) : null}
          </View>
          {canEdit ? (
            <View style={{ gap: t.space.sm }}>
              <Button
                label={TODAY.swap}
                variant="secondary"
                icon="move"
                onPress={() => setSwapping(true)}
                testID="item.swap.open"
              />
              <Button
                label={PLAN.remove}
                variant="ghost"
                onPress={() => void takeOff()}
                testID="item.remove"
              />
            </View>
          ) : null}
          <Button
            label={FOOD.open}
            variant="ghost"
            onPress={() => {
              const id = open.item.foodId;
              close();
              onOpenFood(id);
            }}
            testID="item.food"
          />
        </View>
      )}
    </BottomSheet>
  );
}
