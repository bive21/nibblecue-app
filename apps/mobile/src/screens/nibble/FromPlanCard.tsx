/**
 * THE MEAL PLAN ON THE GROCERY LIST (the owner, 2026-10-08: "shopping/grocery need to already have
 * pregenerated item according to the meal plan so users can easily add what's already in the meal
 * plan"). Every food the plan offers over the days this family can see, each once, by aisle, with
 * the day it is first needed; one tap puts it on the list, and "Add all" puts every one on. Free
 * families see today and tomorrow, the same two days their plan shows; NibbleCue Plus sees a week.
 * No amounts, ever: a shopper buys a food, and what the baby eats is the baby's to decide.
 */
import { AISLES, planGroceries } from '@nibblecue/core/nibble';
import { BodySm, Button, Card, Label, Row, Rows, useTheme } from '@nibblecue/ui';
import { useCallback, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { systemClock } from '../../data/repository';
import { putOnList } from '../../data/lists';
import { useCanLog } from '../../household/useCanLog';
import { tripDays } from '../../lists/trip';
import { useShopping } from '../../lists/useLists';
import { useNibble } from '../../nibble/useNibble';
import { usePlan } from '../../plan/PlanProvider';
import { useTimeZone } from '../../sheets/quick/prefs';
import { useWriteContext } from '../../sheets/quick/useWriteContext';
import { GROCERY } from './copy';
import { dayLabel } from './dates';
import { styles } from './parts';

/** The days the plan shows this family: two on the free plan, a week with Plus. */
export const groceryDays = (fullPlan: boolean): number => (fullPlan ? 7 : 2);

/**
 * Put foods on the grocery list, each once, in this trip's days, and say how many went on. A
 * second tap while the first is still writing does nothing, so a food is never added twice.
 */
export function useAddToGrocery(): (titles: readonly string[]) => Promise<number> {
  const timeZone = useTimeZone();
  const { context, say } = useWriteContext();
  const busy = useRef(false);
  return useCallback(
    async titles => {
      if (busy.current || titles.length === 0) return 0;
      busy.current = true;
      try {
        const ctx = await context();
        if (ctx === null) return 0;
        const { db, ...w } = ctx;
        let n = 0;
        for (const title of titles) {
          const r = await putOnList(db, systemClock, { ...w, ...tripDays(timeZone), title });
          if (r.committed) n += 1;
        }
        if (n > 0) say(GROCERY.added(n));
        return n;
      } finally {
        busy.current = false;
      }
    },
    [context, say, timeZone],
  );
}

export function FromPlanCard() {
  const t = useTheme();
  const v = useNibble();
  const plan = usePlan();
  const canLog = useCanLog();
  const shopping = useShopping();
  const add = useAddToGrocery();
  const days = groceryDays(plan.can('fullPlan'));
  const items = useMemo(
    () =>
      planGroceries(
        // from the planned first day when it is still to come, so the first week can be bought ahead
        v.plan.filter(d => d.day >= (v.profile?.startOn ?? v.today)).slice(0, days),
        v.foodById,
        shopping.lines.filter(l => l.checkedAt === null).map(l => l.title),
      ),
    [v.plan, v.profile, v.today, v.foodById, days, shopping.lines],
  );
  if (v.profile === null || items.length === 0) return null;
  const toAdd = items.filter(i => !i.onList);

  return (
    <Card testID="grocery.plan">
      <View style={{ gap: t.space.sm }}>
        <View style={styles.head}>
          <Label>{GROCERY.title}</Label>
        </View>
        <BodySm>{GROCERY.lede(days)}</BodySm>
        {AISLES.map(aisle => {
          const inAisle = items.filter(i => i.aisle === aisle);
          if (inAisle.length === 0) return null;
          return (
            <View key={aisle} style={{ gap: t.space.xs }}>
              <BodySm ink="text">{GROCERY.aisle[aisle]}</BodySm>
              <Rows>
                {inAisle.map(i => (
                  <Row
                    key={i.food.id}
                    title={i.food.name}
                    detail={`${GROCERY.forDay(dayLabel(i.firstDay))} · ${GROCERY.meals(i.meals)}`}
                    {...(i.onList || !canLog
                      ? {
                          right: 'none' as const,
                          ...(i.onList
                            ? { badge: { label: GROCERY.onList, tone: 'good' as const } }
                            : {}),
                        }
                      : {
                          added: false,
                          onAdd: () => void add([i.food.name]),
                          addLabel: GROCERY.addOne(i.food.name),
                        })}
                    testID={`grocery.plan.${i.food.id}`}
                  />
                ))}
              </Rows>
            </View>
          );
        })}
        {canLog && toAdd.length > 1 ? (
          <Button
            label={GROCERY.addAll}
            variant="secondary"
            size="sm"
            icon="cart"
            onPress={() => void add(toAdd.map(i => i.food.name))}
            style={styles.start}
            testID="grocery.plan.all"
          />
        ) : toAdd.length === 0 ? (
          <BodySm>{GROCERY.allOn}</BodySm>
        ) : null}
      </View>
    </Card>
  );
}
