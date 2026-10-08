/**
 * MILK AND DRINKS (NibbleCue Plus): CuddleCue's bottle and breastfeed log for the last seven days,
 * added up for the baby on screen, beside the published guidance for this age. Arithmetic over the
 * household's own entries, never a judgement about the amount (spec §16.1).
 */
import { cardsFor, GUIDANCE_BY_ID, type GuidanceCard } from '@nibblecue/core/nibble';
import { Body, BodySm, BodyStrong, Card, StatCard, useTheme } from '@nibblecue/ui';
import { View } from 'react-native';
import { Screen } from '../../app/Screen';
import { useShell } from '../../app/shell';
import { keys } from '../../data/store';
import { useLocalQuery } from '../../data/useLocalQuery';
import { milkFeedsSince, type MilkFeedRow } from '../../db/queries/nibble';
import { useNibble } from '../../nibble/useNibble';
import { usePlan } from '../../plan/PlanProvider';
import { useVolumeUnitSetting } from '../../sheets/quick/prefs';
import { volumeLabel } from '../../sheets/quick/volume';
import { MILK } from './copy';
import { NotMedical, PlusLock } from './parts';

const WEEK_DAYS = 7;

export interface MilkWeek {
  bottles: number;
  breastfeeds: number;
  ml: number;
}

export function milkWeek(rows: readonly MilkFeedRow[], childId: string | null): MilkWeek {
  const mine = rows.filter(r => r.child_id === childId);
  return {
    bottles: mine.filter(r => r.type === 'bottle').length,
    breastfeeds: mine.filter(r => r.type === 'breastfeed').length,
    ml: mine.reduce((sum, r) => sum + (r.type === 'bottle' ? (r.consumed_ml ?? 0) : 0), 0),
  };
}

export function MilkScreen() {
  const t = useTheme();
  const shell = useShell();
  const plan = usePlan();
  const v = useNibble();
  const { unit } = useVolumeUnitSetting();
  const since = new Date(Date.now() - WEEK_DAYS * 86_400_000).toISOString();
  const rows = useLocalQuery<MilkFeedRow[]>(
    v.householdId === null ? [] : [keys.timeline(null, 'all'), keys.household(v.householdId)],
    db => (v.householdId === null ? Promise.resolve([]) : milkFeedsSince(db, v.householdId, since)),
    [],
  );
  const week = milkWeek(rows, v.childId);
  const perDay = week.ml / WEEK_DAYS;
  // the one writer every milk amount goes through (`volume.scan.test.ts`), in the household's unit
  const amount = volumeLabel(perDay, unit);
  const guidance = [
    GUIDANCE_BY_ID.get('milk-is-main'),
    ...cardsFor(v.months, v.profile?.region ?? 'US', 'cup'),
  ].filter((c): c is GuidanceCard => c !== undefined);

  return (
    <Screen title={MILK.title} testID="milk">
      <View style={{ gap: t.space.md }}>
        <Body>{MILK.lede}</Body>
        {!plan.can('milk') ? (
          <PlusLock
            title={MILK.title}
            body={MILK.locked}
            onOpen={() => shell.openGate('milk')}
            testID="milk.locked"
          />
        ) : week.bottles + week.breastfeeds === 0 ? (
          <Card testID="milk.none">
            <BodySm>{MILK.none}</BodySm>
          </Card>
        ) : (
          <>
            <BodyStrong>{MILK.week}</BodyStrong>
            <View style={{ flexDirection: 'row', gap: t.space.sm }}>
              <StatCard
                value={String(week.bottles)}
                label={MILK.bottles(week.bottles).replace(/^\d+ /, '')}
                style={{ flex: 1 }}
                testID="milk.bottles"
              />
              <StatCard
                value={String(week.breastfeeds)}
                label={MILK.breastfeeds(week.breastfeeds).replace(/^\d+ /, '')}
                style={{ flex: 1 }}
                testID="milk.breastfeeds"
              />
            </View>
            {week.ml > 0 ? <BodySm testID="milk.perday">{MILK.perDay(amount)}</BodySm> : null}
            <BodySm>{MILK.from(week.bottles + week.breastfeeds)}</BodySm>
          </>
        )}
        <BodyStrong>{MILK.guidance}</BodyStrong>
        {guidance.map(g => (
          <Card key={g.id}>
            <View style={{ gap: t.space.xs }}>
              <BodyStrong>{g.title}</BodyStrong>
              <BodySm>{g.body}</BodySm>
            </View>
          </Card>
        ))}
        <NotMedical />
      </View>
    </Screen>
  );
}
