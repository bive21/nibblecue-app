/**
 * THE MEAL PLAN ON THE GROCERY LIST (the owner, 2026-10-08: "shopping/grocery need to already have
 * pregenerated item according to the meal plan so users can easily add what's already in the meal
 * plan"). Every food the plan offers over the days this family can see, each once, by aisle, with
 * the day it is first needed; one tap puts it on the list, and "Add all" puts every one on. Every
 * family gets the next seven days; NibbleCue Plus chooses the days, up to the plan's two weeks (the
 * owner, 2026-10-08: "give free users 7 days but plus selectable range/days").
 * No amounts, ever: a shopper buys a food, and what the baby eats is the baby's to decide.
 */
import { AISLES, daysBetween, planGroceries, type IsoDay } from '@nibblecue/core/nibble';
import { BodySm, Button, Card, Chip, Label, Row, Rows, useTheme } from '@nibblecue/ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useShell } from '../../app/shell';
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

/** The days the grocery list covers unless a NibbleCue Plus family chooses others. */
export const GROCERY_DAYS = 7;

/** Quick choices for the range, in days from its first day. */
const PRESETS = [3, 7, 14] as const;

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
  const shell = useShell();
  const add = useAddToGrocery();
  const choose = plan.can('groceryRange');
  const [range, setRange] = useState<{ from: IsoDay; to: IsoDay } | null>(null);
  const [picking, setPicking] = useState(false);
  // from the planned first day when it is still to come, so the first week can be bought ahead
  const days = useMemo(
    () => v.plan.filter(d => d.day >= (v.profile?.startOn ?? v.today)),
    [v.plan, v.profile, v.today],
  );
  const first = days[0]?.day ?? v.today;
  const last = days[days.length - 1]?.day ?? v.today;
  const fallback = days[Math.min(GROCERY_DAYS, days.length) - 1]?.day ?? first;
  // a chosen range only while Plus is on, and only inside the days the plan has
  const from = choose && range ? (range.from < first ? first : range.from) : first;
  const to = choose && range ? (range.to > last ? last : range.to) : fallback;
  const items = useMemo(
    () =>
      planGroceries(
        days.filter(d => d.day >= from && d.day <= to),
        v.foodById,
        shopping.lines.filter(l => l.checkedAt === null).map(l => l.title),
      ),
    [days, from, to, v.foodById, shopping.lines],
  );
  // a range a Plus family chose stays on screen even when it holds no food, so it can be changed
  if (v.profile === null || (items.length === 0 && !(choose && range))) return null;
  const toAdd = items.filter(i => !i.onList);

  return (
    <Card testID="grocery.plan">
      <View style={{ gap: t.space.sm }}>
        <View style={styles.head}>
          <Label>{GROCERY.title}</Label>
        </View>
        <BodySm>{GROCERY.lede(daysBetween(from, to) + 1)}</BodySm>
        <Rows>
          <Row
            title={GROCERY.rangeTitle}
            detail={GROCERY.range(dayLabel(from), dayLabel(to))}
            {...(choose
              ? { onPress: () => setPicking(x => !x), expanded: picking }
              : {
                  locked: true,
                  lockedHint: GROCERY.rangeLocked,
                  onPress: () => shell.openGate('groceryRange'),
                })}
            testID="grocery.range"
          />
        </Rows>
        {choose && picking ? (
          <View style={{ gap: t.space.sm }} testID="grocery.range.pick">
            <View style={[styles.wrap, { gap: t.space.xs }]}>
              {PRESETS.map(n => {
                const end = days[Math.min(n, days.length) - 1]?.day ?? first;
                return (
                  <Chip
                    key={n}
                    small
                    label={GROCERY.preset(n)}
                    selected={from === first && to === end}
                    onPress={() => setRange({ from: first, to: end })}
                    testID={`grocery.range.next${n}`}
                  />
                );
              })}
            </View>
            <Label>{GROCERY.from}</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={[styles.head, { gap: t.space.xs }]}>
                {days.map(d => (
                  <Chip
                    key={d.day}
                    small
                    label={dayLabel(d.day)}
                    selected={d.day === from}
                    onPress={() => setRange({ from: d.day, to: to < d.day ? d.day : to })}
                    testID={`grocery.range.from.${d.day}`}
                  />
                ))}
              </View>
            </ScrollView>
            <Label>{GROCERY.to}</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={[styles.head, { gap: t.space.xs }]}>
                {days
                  .filter(d => d.day >= from)
                  .map(d => (
                    <Chip
                      key={d.day}
                      small
                      label={dayLabel(d.day)}
                      selected={d.day === to}
                      onPress={() => setRange({ from, to: d.day })}
                      testID={`grocery.range.to.${d.day}`}
                    />
                  ))}
              </View>
            </ScrollView>
          </View>
        ) : null}
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
        {items.length === 0 ? <BodySm>{GROCERY.none}</BodySm> : null}
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
        ) : toAdd.length === 0 && items.length > 0 ? (
          <BodySm>{GROCERY.allOn}</BodySm>
        ) : null}
      </View>
    </Card>
  );
}
