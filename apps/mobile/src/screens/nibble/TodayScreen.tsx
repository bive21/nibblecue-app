/**
 * TODAY (docs/PRODUCT.md §Today): what to serve at each meal and why, two taps to say it was
 * served, the one guidance card the day calls for, the allergens this week, the way to write down
 * something noticed, and a look at tomorrow. CuddleCue's Today shape: the tab's title, cards one
 * under the other, the + under the thumb for a meal that was not on the plan.
 */
import {
  addDays,
  ALLERGENS,
  cardOfTheDay,
  daysBetween,
  latestNoticedDay,
  MEAL_LABEL,
  SOURCE_BY_ID,
  type AllergenState,
  type PlanMeal,
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { BACK_TO_TABS } from '../../app/backToTabs';
import { Screen } from '../../app/Screen';
import { useShell } from '../../app/shell';
import type { RootParams } from '../../app/types';
import { useCanLog } from '../../household/useCanLog';
import { useNibble } from '../../nibble/useNibble';
import { useNibbleWrites } from '../../nibble/useNibbleWrites';
import { ALLERGENS_PAGE, PLAN, PROFILE, TODAY } from './copy';
import { ItemSheet, type OpenItem } from './ItemSheet';
import { MealCard, NotMedical, styles } from './parts';
import { ServeSheet } from './ServeSheet';

type Nav = NativeStackNavigationProp<RootParams>;

const IN_WEEK = new Set(['introduced', 'keeping_going', 'established']);

/** "Mon, Oct 12": a day the parent reads. */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function TodayScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const shell = useShell();
  const canLog = useCanLog();
  const v = useNibble();
  const writes = useNibbleWrites();
  const [serving, setServing] = useState<PlanMeal | null>(null);
  const [item, setItem] = useState<OpenItem | null>(null);

  const today = v.plan[0] ?? null;
  const tomorrow = v.plan[1] ?? null;
  const served = (meal: PlanMeal['meal']): boolean =>
    v.exposures.some(e => e.day === v.today && e.meal === meal.toUpperCase());

  const card = useMemo(() => {
    if (v.childId === null || v.profile === null) return null;
    const items = today?.meals.flatMap(m => m.items) ?? [];
    const fingerBefore = v.exposures.some(e => e.form === 'soft_stick' || e.form === 'finger');
    return cardOfTheDay({
      months: v.months,
      region: v.profile.region,
      stage: v.stage,
      day: v.today,
      childId: v.childId,
      firstAllergen: items.some(i => i.firstAllergen !== null),
      firstFingerFood:
        !fingerBefore && items.some(i => i.form === 'soft_stick' || i.form === 'finger'),
      daysSinceStart: v.exposures[0] ? daysBetween(v.exposures[0].day, v.today) : null,
    });
  }, [v, today]);

  const noticedDay = latestNoticedDay(v.noticed);
  const pausedUntil =
    noticedDay !== null && daysBetween(noticedDay, v.today) < 14 ? addDays(noticedDay, 14) : null;

  const week = (Object.values(v.allergens) as AllergenState[]).filter(
    a => IN_WEEK.has(a.kind) || a.kind === 'held',
  );

  const skipMarkId = [...v.markIds.entries()].find(
    ([k]) => k.startsWith(`${v.today}:`) && k.includes(':skip_day:'),
  )?.[1];

  const body = () => {
    if (!v.loaded) return null;
    if (v.childId === null)
      return (
        <EmptyState
          icon="babyface"
          title={TODAY.noChildTitle}
          body={TODAY.noChildBody}
          cta={{ label: 'Family', onPress: () => nav.navigate('Family') }}
          testID="today.nochild"
        />
      );
    if (v.profile === null)
      return (
        <Card testID="today.setup">
          <View style={{ gap: t.space.sm }}>
            <BodyStrong>{TODAY.setupTitle}</BodyStrong>
            <Body>{TODAY.setupBody}</Body>
            <Button
              label={TODAY.setupCta}
              onPress={() => nav.navigate('FoodProfile', { setup: true })}
              style={styles.start}
              testID="today.setup.start"
            />
          </View>
        </Card>
      );
    if (v.stage === 'too_young')
      return (
        <Card testID="today.too_young">
          <Body>{TODAY.tooYoung}</Body>
        </Card>
      );
    if (v.stage === 'getting_ready')
      return (
        <Card testID="today.getting_ready">
          <View style={{ gap: t.space.sm }}>
            <BodyStrong>{TODAY.gettingReady}</BodyStrong>
            <Body>{TODAY.gettingReadyBody}</Body>
            {canLog && v.profileRecord ? (
              <Button
                label={TODAY.started}
                onPress={() => {
                  if (v.childId === null || v.profile === null || v.profileRecord === null) return;
                  void writes.saveProfile(
                    v.childId,
                    v.profileRecord.id,
                    { ...v.profile, stage: 'started', startedOn: v.today, ready: true },
                    PROFILE.saved,
                  );
                }}
                style={styles.start}
                testID="today.started"
              />
            ) : null}
          </View>
        </Card>
      );
    return (
      <>
        {pausedUntil !== null ? (
          <Card testID="today.paused">
            <BodySm>{TODAY.pausedAllergens(dayLabel(pausedUntil))}</BodySm>
          </Card>
        ) : null}
        {today?.skip ? (
          <Card testID="today.skipped">
            <View style={{ gap: t.space.sm }}>
              <Body>{TODAY.skipped}</Body>
              {canLog && skipMarkId ? (
                <Button
                  label={TODAY.unskip}
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    void writes.remove(
                      { recordId: skipMarkId, kind: 'plan_mark', childId: v.childId },
                      null,
                    )
                  }
                  style={styles.start}
                  testID="today.unskip"
                />
              ) : null}
            </View>
          </Card>
        ) : today && today.meals.length > 0 ? (
          today.meals.map(m => (
            <MealCard
              key={m.meal}
              meal={m}
              foodById={v.foodById}
              served={served(m.meal)}
              onItem={i => setItem({ day: v.today, meal: m.meal, item: i })}
              footer={
                canLog && m.items.length > 0 ? (
                  <Button
                    label={served(m.meal) ? TODAY.servedAgain : TODAY.served}
                    variant={served(m.meal) ? 'secondary' : 'primary'}
                    size="sm"
                    icon="check"
                    onPress={() => setServing(m)}
                    style={styles.start}
                    testID={`today.serve.${m.meal}`}
                  />
                ) : null
              }
              testID={`today.meal.${m.meal}`}
            />
          ))
        ) : (
          <Card testID="today.empty">
            <Body>{TODAY.emptyTitle}</Body>
          </Card>
        )}

        {!canLog ? <Caption>{TODAY.viewOnly}</Caption> : null}

        {card ? (
          <Card testID="today.guide">
            <View style={{ gap: t.space.xs }}>
              <BodyStrong>{card.title}</BodyStrong>
              <BodySm>{card.body}</BodySm>
              {card.points.length > 0 ? (
                <Disclosure summary={TODAY.readMore} flush compact testID="today.guide.more">
                  <View style={{ gap: t.space.xs }}>
                    {card.points.map(p => (
                      <BodySm key={p}>{p}</BodySm>
                    ))}
                  </View>
                </Disclosure>
              ) : null}
              <Caption>
                {card.sources.map(s => SOURCE_BY_ID.get(s)?.publisher ?? s).join(' · ')}
              </Caption>
            </View>
          </Card>
        ) : null}

        <SectionHeader
          title={TODAY.allergensTitle}
          action={{ label: TODAY.allergensAll, onPress: () => nav.navigate('Allergens') }}
          tight
        />
        {week.length === 0 ? (
          <Card>
            <BodySm>{TODAY.allergensEmpty}</BodySm>
          </Card>
        ) : (
          <Rows testID="today.allergens">
            {week.map(a => (
              <Row
                key={a.allergen}
                title={ALLERGENS[a.allergen].name}
                detail={
                  a.kind === 'held' ? 'On hold' : ALLERGENS_PAGE.week(a.lastSevenDays, a.target)
                }
                {...(a.kind === 'held'
                  ? { badge: { label: 'On hold', tone: 'warn' as const } }
                  : a.due
                    ? { badge: { label: 'Due', tone: 'accent' as const } }
                    : {})}
                onPress={() => nav.navigate('Allergens')}
                testID={`today.allergen.${a.allergen}`}
              />
            ))}
          </Rows>
        )}

        <Rows testID="today.noticed">
          <Row
            title={TODAY.noticed}
            detail={TODAY.noticedDetail}
            icon="note"
            onPress={() => nav.navigate('Noticed')}
            testID="today.noticed.open"
          />
        </Rows>

        {tomorrow && !tomorrow.skip && tomorrow.meals.length > 0 ? (
          <>
            <SectionHeader
              title={TODAY.tomorrow}
              action={{
                label: PLAN.title,
                onPress: () => nav.navigate('Tabs', { screen: 'PlanTab' }, BACK_TO_TABS),
              }}
              tight
            />
            <Card testID="today.tomorrow">
              <View style={{ gap: t.space.xs }}>
                {(() => {
                  const fresh = tomorrow.meals
                    .flatMap(m => m.items)
                    .find(i => i.isNew || i.firstAllergen);
                  return fresh ? (
                    <BodyStrong>
                      {TODAY.tomorrowNew(v.foodById(fresh.foodId)?.name ?? fresh.foodId)}
                    </BodyStrong>
                  ) : null;
                })()}
                {tomorrow.meals.map(m => (
                  <BodySm key={m.meal}>
                    {`${MEAL_LABEL[m.meal]}: ${m.items
                      .map(i => v.foodById(i.foodId)?.name ?? i.foodId)
                      .join(', ')}`}
                  </BodySm>
                ))}
              </View>
            </Card>
          </>
        ) : null}

        {canLog ? (
          <Button
            label={TODAY.logOther}
            variant="ghost"
            icon="plus"
            onPress={() => shell.openQuickEntry('solids')}
            testID="today.log_other"
          />
        ) : null}
        <NotMedical />
      </>
    );
  };

  return (
    <Screen testID="today" logButton={canLog}>
      {/* Today names itself nowhere: its chrome is the baby's (DESIGN_SYSTEM §4.1 rule 1) */}
      <View style={{ gap: t.space.md }}>{body()}</View>
      <ServeSheet
        visible={serving !== null}
        childId={v.childId}
        day={v.today}
        meal={serving}
        foodById={v.foodById}
        onClose={() => setServing(null)}
      />
      <ItemSheet
        open={item}
        childId={v.childId}
        band={v.band}
        planInput={v.planInput}
        foodById={v.foodById}
        canEdit={canLog && v.childId !== null}
        onClose={() => setItem(null)}
        onOpenFood={foodId => nav.navigate('Food', { foodId })}
      />
    </Screen>
  );
}
