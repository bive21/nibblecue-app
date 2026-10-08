/**
 * THE PLAN (docs/PRODUCT.md §Plan): the next two weeks, meal by meal, every item with its reason.
 * Today and tomorrow are free; NibbleCue Plus lays out the rest and lets a parent shape any day:
 * add a food to a meal, take one off, skip a day. Every change is a mark the planner keeps
 * through each re-plan, and a food the rules refuse is said to be refused, never shown as planned.
 */
import {
  ALLERGENS,
  HARD_RULES,
  MEAL_LABEL,
  type Food,
  type MealName,
  type PlanDay,
} from '@nibblecue/core/nibble';
import {
  Body,
  BodySm,
  BodyStrong,
  Button,
  Caption,
  Card,
  Label,
  Rows,
  SectionHeader,
  useTheme,
} from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ideasFrom, ideasRequest, keepIdeas } from '../../nibble/planIdeas';
import { prefsStore } from '../../prefs/async-storage';
import { View } from 'react-native';
import { Screen } from '../../app/Screen';
import { useShell } from '../../app/shell';
import type { RootParams } from '../../app/types';
import { useCanLog } from '../../household/useCanLog';
import { useNibble } from '../../nibble/useNibble';
import { useNibbleWrites } from '../../nibble/useNibbleWrites';
import { usePlan } from '../../plan/PlanProvider';
import { PLAN, TODAY } from './copy';
import { FoodPickerSheet } from './FoodPickerSheet';
import { ItemSheet, type OpenItem } from './ItemSheet';
import { MakeItYours } from './MakeItYours';
import { NotStartedCard } from './NotStarted';
import { NotMedical, PlanItemRow, PlusLock, styles } from './parts';
import { dayLabel } from './dates';

type Nav = NativeStackNavigationProp<RootParams>;

/** How many days the free plan lays out: today and tomorrow (docs/PRODUCT.md, Free vs Plus). */
export const FREE_PLAN_DAYS = 2;

export const ruleText = (id: string): string => HARD_RULES.find(r => r.id === id)?.text ?? '';

export function PlanTabScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const shell = useShell();
  const canLog = useCanLog();
  const plan = usePlan();
  const v = useNibble();
  const writes = useNibbleWrites();
  const [item, setItem] = useState<OpenItem | null>(null);
  const [pinFor, setPinFor] = useState<{ day: string; meal: MealName } | null>(null);
  const { api } = useAuth();
  const [asking, setAsking] = useState(false);
  const full = plan.can('fullPlan');
  const ideasOn = plan.can('planIdeas');
  const hasIdeas = v.plan.some(d => d.meals.some(m => m.items.some(i => i.by === 'ai')));

  const askIdeas = async () => {
    if (asking || v.householdId === null || v.childId === null || v.profile === null) return;
    const request = ideasRequest({
      householdId: v.householdId,
      childId: v.childId,
      months: v.months,
      stage: v.stage,
      profile: v.profile,
      foods: v.foods,
      statuses: v.statuses,
      allergens: v.allergens,
      plan: v.plan,
    });
    if (request === null) return;
    setAsking(true);
    try {
      const r = await api.planIdeas(request);
      if (!r.ok) {
        writes.say(
          r.status === 503 ? PLAN.ideasOff : r.status === 429 ? PLAN.ideasLimit : PLAN.ideasLater,
        );
        return;
      }
      await keepIdeas(prefsStore, v.childId, ideasFrom(r.draft, request));
      writes.say(PLAN.ideasAdded);
    } catch {
      writes.say(PLAN.ideasLater);
    } finally {
      setAsking(false);
    }
  };
  // a start planned for a later day: the plan is shown from that day, so the first days are there
  // to look at and shop for before they come
  const startOn = v.profile?.startOn ?? null;
  const planned = v.stage === 'getting_ready' && startOn !== null && startOn > v.today;
  const fromDay = planned ? v.plan.filter(d => d.day >= startOn) : v.plan;
  const shown = full ? fromDay : fromDay.slice(0, FREE_PLAN_DAYS);

  const nextAllergen = v.plan
    .flatMap(d => d.meals.flatMap(m => m.items))
    .find(i => i.firstAllergen !== null)?.firstAllergen;
  const textureNudge = v.months >= 9 && v.months < 12 && v.profile?.holdTexture === false;

  const skipId = (day: string) =>
    [...v.markIds.entries()].find(
      ([k]) => k.startsWith(`${day}:`) && k.includes(':skip_day:'),
    )?.[1];

  const toggleSkip = (d: PlanDay) => {
    if (v.childId === null) return;
    const id = skipId(d.day);
    if (id !== undefined) {
      void writes.remove({ recordId: id, kind: 'plan_mark', childId: v.childId }, null);
      return;
    }
    void writes.mark(
      v.childId,
      { day: d.day, meal: 'breakfast', kind: 'skip_day', foodId: null },
      PLAN.skipped,
    );
  };

  const pin = (food: Food) => {
    if (pinFor === null || v.childId === null) return;
    void writes.mark(
      v.childId,
      { day: pinFor.day, meal: pinFor.meal, kind: 'pin', foodId: food.id },
      PLAN.pinned(food.name),
    );
    setPinFor(null);
  };

  const dayCard = (d: PlanDay, index: number) => {
    const title = index === 0 ? PLAN.today : index === 1 ? PLAN.tomorrow : dayLabel(d.day);
    const editable = canLog && (full || index < FREE_PLAN_DAYS);
    return (
      <Card key={d.day} testID={`plan.day.${d.day}`}>
        <View style={[styles.head, { marginBottom: t.space.xs }]}>
          <BodyStrong>{index < 2 ? `${title} · ${dayLabel(d.day)}` : title}</BodyStrong>
          {editable && full ? (
            <Button
              label={d.skip ? PLAN.unskipDay : PLAN.skipDay}
              size="xs"
              variant="ghost"
              onPress={() => toggleSkip(d)}
              testID={`plan.day.${d.day}.skip`}
            />
          ) : null}
        </View>
        {d.skip ? (
          <BodySm>{PLAN.skipped}</BodySm>
        ) : (
          <View style={{ gap: t.space.sm }}>
            {d.meals.map(m => (
              <View key={m.meal} style={{ gap: t.space.xs }}>
                <Label>{MEAL_LABEL[m.meal]}</Label>
                <Rows>
                  {m.items.map(i => (
                    <PlanItemRow
                      key={i.foodId}
                      item={i}
                      food={v.foodById(i.foodId)}
                      onPress={() => setItem({ day: d.day, meal: m.meal, item: i })}
                      testID={`plan.${d.day}.${m.meal}.${i.foodId}`}
                    />
                  ))}
                </Rows>
                {editable && full ? (
                  <Button
                    label={PLAN.pin}
                    size="xs"
                    variant="ghost"
                    icon="plus"
                    onPress={() => setPinFor({ day: d.day, meal: m.meal })}
                    style={styles.start}
                    testID={`plan.${d.day}.${m.meal}.pin`}
                  />
                ) : null}
              </View>
            ))}
            {d.refused.length > 0 ? (
              <View style={{ gap: t.space.xs }} testID={`plan.day.${d.day}.refused`}>
                <Label>{PLAN.refused}</Label>
                {d.refused.map(r => (
                  <BodySm key={`${r.foodId}:${r.rule}`} ink="warn">
                    {`${v.foodById(r.foodId)?.name ?? r.foodId}: ${ruleText(r.rule)}`}
                  </BodySm>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </Card>
    );
  };

  return (
    <Screen testID="plantab">
      <SectionHeader title={PLAN.title} variant="tab" />
      <View style={{ gap: t.space.md }}>
        <Body>{PLAN.lede}</Body>
        {v.profile === null ? (
          <Card testID="plantab.setup">
            <View style={{ gap: t.space.sm }}>
              <BodyStrong>{TODAY.setupTitle}</BodyStrong>
              <Button
                label={TODAY.setupCta}
                onPress={() => nav.navigate('FoodSetup')}
                style={styles.start}
                testID="plantab.setup.start"
              />
            </View>
          </Card>
        ) : (
          <>
            {nextAllergen || textureNudge ? (
              <Card testID="plantab.changing">
                <View style={{ gap: t.space.xs }}>
                  <BodyStrong>{PLAN.changing}</BodyStrong>
                  {nextAllergen ? (
                    <BodySm>{PLAN.newAllergenNext(ALLERGENS[nextAllergen].name)}</BodySm>
                  ) : null}
                  {textureNudge ? <BodySm>{PLAN.textureNudge}</BodySm> : null}
                </View>
              </Card>
            ) : null}
            {ideasOn && canLog ? (
              <View style={{ gap: t.space.xs }}>
                <Button
                  label={PLAN.ideasAsk}
                  variant="secondary"
                  size="sm"
                  icon="star"
                  loading={asking}
                  onPress={() => void askIdeas()}
                  style={styles.start}
                  testID="plantab.ideas"
                />
                {hasIdeas ? <Caption>{PLAN.ideasOn}</Caption> : null}
              </View>
            ) : null}
            {v.stage === 'too_young' || (v.stage === 'getting_ready' && !planned) ? (
              <NotStartedCard v={v} testID="plantab" />
            ) : shown.length === 0 ? (
              <Card>
                <Body>{TODAY.emptyTitle}</Body>
              </Card>
            ) : (
              <>
                {v.childId !== null && canLog && v.exposures.length > 0 ? (
                  <MakeItYours childId={v.childId} name={v.childName.trim() || 'your baby'} />
                ) : null}
                {shown.map(dayCard)}
              </>
            )}
            {!full && v.plan.length > FREE_PLAN_DAYS ? (
              <PlusLock
                title={PLAN.lockedTitle}
                body={PLAN.lockedBody}
                onOpen={() => shell.openGate('fullPlan')}
                testID="plantab.locked"
              />
            ) : null}
          </>
        )}
        <NotMedical />
      </View>
      <ItemSheet
        open={item}
        childId={v.childId}
        band={v.band}
        planInput={v.planInput}
        foodById={v.foodById}
        canEdit={canLog && item !== null && (full || item.day <= (v.plan[1]?.day ?? v.today))}
        onClose={() => setItem(null)}
        onOpenFood={foodId => nav.navigate('Food', { foodId })}
      />
      <FoodPickerSheet
        visible={pinFor !== null}
        title={PLAN.pin}
        foods={v.foods}
        statuses={v.statuses}
        onPick={pin}
        onClose={() => setPinFor(null)}
      />
    </Screen>
  );
}
