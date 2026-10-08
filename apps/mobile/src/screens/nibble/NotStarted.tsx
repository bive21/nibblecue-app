/**
 * BEFORE THE FIRST BITE (docs/research/MARKET_AND_SETUP.md §3.1, §3.2): what Today and the Plan
 * tab show while there is no plan yet, so neither is ever an empty page and the app is useful
 * before the first spoon.
 *
 * Too young (under four months, hard rule 1): when solids can start, and when most babies do, as
 * dates for this baby. Getting ready: the readiness signs a parent can see WITHOUT offering food
 * (AAP, CDC, NHS), kept on the profile so the other parent's phone shows the same ticks; the six
 * month day; the first days a start would bring, drawn by the real planner; what to have ready,
 * one tap from the grocery list; and the guidance worth reading before day one. The tongue-thrust
 * sign is never asked: nobody can know it before the first spoon, so it is said as something the
 * first tries show. The app reports what the parent ticked and never says a baby is ready.
 */
import {
  buildPlan,
  dayAtMonths,
  daysBetween,
  GUIDANCE_BY_ID,
  planGroceries,
  READINESS_SIGNS,
  SOURCE_BY_ID,
  type IsoDay,
  type NibbleProfile,
  type ReadinessSign,
} from '@nibblecue/core/nibble';
import {
  Body,
  BodySm,
  BodyStrong,
  Button,
  Caption,
  Card,
  Disclosure,
  Label,
  Row,
  Rows,
  useTheme,
} from '@nibblecue/ui';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useCanLog } from '../../household/useCanLog';
import type { NibbleView } from '../../nibble/useNibble';
import { useNibbleWrites } from '../../nibble/useNibbleWrites';
import { DateField } from '../../ui/DateField';
import { NOT_STARTED, PROFILE, SETUP } from './copy';
import { dayLabel } from './dates';
import { useAddToGrocery } from './FromPlanCard';
import { styles } from './parts';
import { PlanPreview } from './PlanPreview';

const LEARN = ['gagging-vs-choking', 'possible-reaction', 'how-much-to-start'] as const;

const toIso = (d: Date): IsoDay =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` as IsoDay;
const fromIso = (s: string | null): Date | null => (s ? new Date(`${s}T12:00:00`) : null);

export function NotStartedCard({ v, testID }: { v: NibbleView; testID: string }) {
  const t = useTheme();
  const canLog = useCanLog();
  const writes = useNibbleWrites();
  const addToGrocery = useAddToGrocery();
  const [picking, setPicking] = useState<'start' | 'started' | null>(null);
  const [day, setDay] = useState<IsoDay | null>(null);
  const [shopped, setShopped] = useState(false);
  const [readyAdded, setReadyAdded] = useState(false);
  const name = v.childName.trim() || 'Your baby';

  // the first days a start would bring: the planned day's own plan, else a start today
  const preview = useMemo(() => {
    if (v.planInput === null || v.profile === null) return [];
    if (v.profile.startOn !== null) return v.plan;
    return buildPlan({
      ...v.planInput,
      profile: { ...v.profile, startOn: v.today, ready: true },
    });
  }, [v.planInput, v.profile, v.plan, v.today]);

  if (v.stage === 'too_young' && v.birthDate !== null) {
    const from4 = dayAtMonths(v.birthDate, 4);
    const around6 = dayAtMonths(v.birthDate, 6);
    return (
      <Card testID={`${testID}.too_young`}>
        <View style={{ gap: t.space.xs }}>
          <BodyStrong>{NOT_STARTED.tooYoungTitle}</BodyStrong>
          <Body>{NOT_STARTED.tooYoung(name, dayLabel(from4), dayLabel(around6))}</Body>
          <BodySm>{NOT_STARTED.tooYoungSetup}</BodySm>
        </View>
      </Card>
    );
  }

  const profile = v.profile;
  const save = (change: Partial<NibbleProfile>, sentence: string | null) => {
    if (v.childId === null || profile === null) return;
    void writes.saveProfile(v.childId, v.profileRecord?.id, { ...profile, ...change }, sentence);
  };
  const signs: readonly ReadinessSign[] = profile?.signsSeen ?? [];
  const toggleSign = (s: ReadinessSign) =>
    save({ signsSeen: signs.includes(s) ? signs.filter(x => x !== s) : [...signs, s] }, null);

  const six = v.birthDate ? dayAtMonths(v.birthDate, 6) : null;
  const startOn = profile?.startOn ?? null;
  const planned = startOn !== null && startOn > v.today;
  const firstDays = preview.filter(d => d.day >= (startOn ?? v.today)).slice(0, 3);
  const groceries = planGroceries(firstDays, v.foodById, []);

  return (
    <>
      <Card testID={`${testID}.getting_ready`}>
        <View style={{ gap: t.space.xs }}>
          <BodyStrong>{NOT_STARTED.readyTitle}</BodyStrong>
          {planned ? (
            <Body>
              {NOT_STARTED.startsOn(name, dayLabel(startOn), daysBetween(v.today, startOn))}
            </Body>
          ) : null}
          {six !== null && six > v.today ? (
            <BodySm>
              {NOT_STARTED.countdown(
                name,
                dayLabel(six),
                Math.round(daysBetween(v.today, six) / 7),
              )}
            </BodySm>
          ) : null}
        </View>
      </Card>

      <Card testID={`${testID}.signs`}>
        <View style={{ gap: t.space.sm }}>
          <Label>{NOT_STARTED.signsTitle}</Label>
          <BodySm>{NOT_STARTED.readyLede}</BodySm>
          <Rows>
            {READINESS_SIGNS.map(s => (
              <Row
                key={s}
                title={SETUP.signs[s]}
                checked={signs.includes(s)}
                {...(canLog ? { onCheck: () => toggleSign(s) } : {})}
                checkLabel={SETUP.signs[s]}
                testID={`${testID}.sign.${s}`}
              />
            ))}
          </Rows>
          {signs.length === READINESS_SIGNS.length && !planned ? (
            <BodySm ink="text">{NOT_STARTED.allSigns}</BodySm>
          ) : signs.length < READINESS_SIGNS.length ? (
            <BodySm>{NOT_STARTED.notAll}</BodySm>
          ) : null}
          {canLog ? (
            <View style={{ gap: t.space.xs }}>
              {picking === 'start' || picking === 'started' ? (
                <View style={{ gap: t.space.xs }}>
                  <DateField
                    label={picking === 'start' ? SETUP.whenDay : NOT_STARTED.startedWhen}
                    value={fromIso(day ?? v.today)}
                    onChange={d => setDay(toIso(d))}
                    {...(picking === 'start'
                      ? { minimumDate: new Date() }
                      : { maximumDate: new Date() })}
                    testID={`${testID}.day`}
                  />
                  <Button
                    label={picking === 'start' ? PROFILE.save : NOT_STARTED.startedSave}
                    onPress={() => {
                      const chosen = day ?? v.today;
                      save(
                        picking === 'start'
                          ? { startOn: chosen, ready: true }
                          : { stage: 'started', startedOn: chosen, startOn: null, ready: true },
                        PROFILE.saved,
                      );
                      setPicking(null);
                    }}
                    style={styles.start}
                    testID={`${testID}.day.save`}
                  />
                </View>
              ) : (
                <>
                  <Button
                    label={NOT_STARTED.readyCta}
                    variant={signs.length === READINESS_SIGNS.length ? 'primary' : 'secondary'}
                    onPress={() => save({ startOn: v.today, ready: true }, SETUP.saved)}
                    style={styles.start}
                    testID={`${testID}.ready`}
                  />
                  <Button
                    label={NOT_STARTED.chooseDay}
                    variant="ghost"
                    onPress={() => {
                      setDay(startOn ?? null);
                      setPicking('start');
                    }}
                    style={styles.start}
                    testID={`${testID}.choose`}
                  />
                  <Button
                    label={NOT_STARTED.startedCta}
                    variant="ghost"
                    onPress={() => {
                      setDay(null);
                      setPicking('started');
                    }}
                    style={styles.start}
                    testID={`${testID}.started`}
                  />
                </>
              )}
            </View>
          ) : null}
        </View>
      </Card>

      {firstDays.length > 0 ? (
        <PlanPreview
          plan={firstDays}
          foodById={v.foodById}
          title={startOn === null ? NOT_STARTED.previewIf : NOT_STARTED.previewOn}
          testID={`${testID}.preview`}
          footer={
            canLog && groceries.length > 0 ? (
              <Button
                label={shopped ? NOT_STARTED.shopDone : NOT_STARTED.shopFirst}
                variant="secondary"
                size="sm"
                icon={shopped ? 'check' : 'cart'}
                disabled={shopped}
                onPress={() =>
                  void addToGrocery(groceries.map(g => g.food.name)).then(
                    n => n > 0 && setShopped(true),
                  )
                }
                style={styles.start}
                testID={`${testID}.shop`}
              />
            ) : null
          }
        />
      ) : null}

      <Card testID={`${testID}.getready`}>
        <View style={{ gap: t.space.xs }}>
          <Label>{NOT_STARTED.getReadyTitle}</Label>
          {NOT_STARTED.getReady.map(x => (
            <BodySm key={x}>{`· ${x}`}</BodySm>
          ))}
          {canLog ? (
            <Button
              label={readyAdded ? NOT_STARTED.shopDone : NOT_STARTED.getReadyAdd}
              variant="secondary"
              size="sm"
              icon={readyAdded ? 'check' : 'cart'}
              disabled={readyAdded}
              onPress={() =>
                void addToGrocery([...NOT_STARTED.getReady]).then(n => n > 0 && setReadyAdded(true))
              }
              style={styles.start}
              testID={`${testID}.getready.add`}
            />
          ) : null}
        </View>
      </Card>

      <Card testID={`${testID}.learn`}>
        <View style={{ gap: t.space.xs }}>
          <Label>{NOT_STARTED.learnTitle}</Label>
          {LEARN.map(id => {
            const c = GUIDANCE_BY_ID.get(id);
            if (!c) return null;
            return (
              <Disclosure key={id} summary={c.title} flush compact testID={`${testID}.learn.${id}`}>
                <View style={{ gap: t.space.xs }}>
                  <BodySm>{c.body}</BodySm>
                  {c.points.map(p => (
                    <BodySm key={p}>{`· ${p}`}</BodySm>
                  ))}
                  <Caption>
                    {c.sources.map(s => SOURCE_BY_ID.get(s)?.publisher ?? s).join(' · ')}
                  </Caption>
                </View>
              </Disclosure>
            );
          })}
          <BodySm>{NOT_STARTED.tongueNote}</BodySm>
        </View>
      </Card>
    </>
  );
}

/** Day one (§3.3): the calm checklist and the swallow sign, said as something to watch for. */
export function FirstDayCard({ name, testID }: { name: string; testID: string }) {
  const t = useTheme();
  return (
    <Card testID={testID}>
      <View style={{ gap: t.space.xs }}>
        <BodyStrong>{NOT_STARTED.firstDayTitle(name)}</BodyStrong>
        {NOT_STARTED.firstDayChecks.map(x => (
          <BodySm key={x}>{`· ${x}`}</BodySm>
        ))}
        <BodySm>{NOT_STARTED.firstTries}</BodySm>
      </View>
    </Card>
  );
}
