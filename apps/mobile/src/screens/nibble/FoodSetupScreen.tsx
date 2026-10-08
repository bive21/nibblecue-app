/**
 * THE FOOD SETUP (docs/research/MARKET_AND_SETUP.md §2): five short questions that change the plan,
 * asked in the baby's name, each one only on the branch where it means something. Nothing is asked
 * that a parent cannot know before the first spoon: before solids the setup asks what the parent
 * has SEEN, and the swallow sign is something the first tries show, said on Today's first day.
 *
 * What makes it feel smart is all arithmetic over what the household already has, never a model:
 * the solids CuddleCue logged pre-answer the first questions and tick the foods tried, the phone's
 * region is read rather than asked, and under every question the plan the answers make so far is
 * drawn by the same planner Today uses, recomputed on each tap. It ends on what the plan will do
 * and why, with the first days' foods one tap from the grocery list.
 */
import { ageLabel } from '@nibblecue/core';
import {
  ALLERGEN_IDS,
  ALLERGENS,
  allergenOrder,
  buildPlan,
  CULTURAL_RULES,
  CUISINES,
  dayAtMonths,
  addDays,
  daysBetween,
  FORM_LABEL,
  higherPeanutRisk,
  planGroceries,
  preAnswerFromLog,
  READINESS_SIGNS,
  regionFromLocale,
  setupSummary,
  type AllergenId,
  type Food,
  type IsoDay,
  type NibbleProfile,
  type PlanDay,
  type PlanInput,
} from '@nibblecue/core/nibble';
import {
  Body,
  BodySm,
  BodyStrong,
  Button,
  Caption,
  Card,
  Chip,
  Disclosure,
  Label,
  Row,
  Rows,
  StepTrack,
  H2,
  useTheme,
} from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BACK_TO_TABS } from '../../app/backToTabs';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { deviceLocale } from '../../lib/locale';
import {
  commonFoodsFor,
  fruitAndVegFor,
  initialAnswers,
  previewProfile,
  profileFromAnswers,
  stepsFor,
  withTriedAllergens,
  type SetupAnswers,
  type Step,
} from '../../nibble/setupAnswers';
import { useNibble } from '../../nibble/useNibble';
import { useNibbleWrites } from '../../nibble/useNibbleWrites';
import { usePlan } from '../../plan/PlanProvider';
import { DateField } from '../../ui/DateField';
import { PROFILE, SETUP } from './copy';
import { dayLabel } from './dates';
import { FoodPickerSheet } from './FoodPickerSheet';
import { FoodThumb } from './FoodThumb';
import { groceryDays, useAddToGrocery } from './FromPlanCard';
import { NotMedical, styles as shared } from './parts';
import { PlanPreview } from './PlanPreview';

type Nav = NativeStackNavigationProp<RootParams>;

const toIso = (d: Date): IsoDay =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` as IsoDay;
const fromIso = (s: string | null): Date | null => (s ? new Date(`${s}T12:00:00`) : null);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const toggle = <T,>(list: readonly T[], x: T): T[] =>
  list.includes(x) ? list.filter(y => y !== x) : [...list, x];

const ALLERGEN_LABEL = Object.fromEntries(ALLERGEN_IDS.map(a => [a, ALLERGENS[a].name])) as Record<
  AllergenId,
  string
>;
const REGION_NAME = { US: 'US', UK: 'UK', CA: 'Canadian', AU: 'Australian' } as const;

function Question({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.sm }}>
      <H2>{title}</H2>
      {hint ? <BodySm>{hint}</BodySm> : null}
      {children}
    </View>
  );
}

/** One of a few, as a list of rows with the chosen one checked. */
function OneOf<T extends string>({
  values,
  label,
  chosen,
  onPick,
  id,
}: {
  values: readonly T[];
  label: (v: T) => string;
  chosen: T | null;
  onPick: (v: T) => void;
  id: string;
}) {
  return (
    <Rows>
      {values.map(v => (
        <Row
          key={v}
          title={label(v)}
          selected={chosen === v}
          onPress={() => onPick(v)}
          right="none"
          testID={`${id}.${v}`}
        />
      ))}
    </Rows>
  );
}

function Chips<T extends string>({
  values,
  label,
  chosen,
  onPress,
  id,
}: {
  values: readonly T[];
  label: (v: T) => string;
  chosen: (v: T) => boolean;
  onPress: (v: T) => void;
  id: string;
}) {
  const t = useTheme();
  return (
    <View style={[shared.wrap, { gap: t.space.xs }]}>
      {values.map(v => (
        <Chip
          key={v}
          small
          label={label(v)}
          selected={chosen(v)}
          onPress={() => onPress(v)}
          testID={`${id}.${v}`}
        />
      ))}
    </View>
  );
}

/** A food the parent can tick: its photo, its name, and whether CuddleCue's log already holds it. */
function FoodTile({
  food,
  on,
  fromLog,
  onPress,
}: {
  food: Food;
  on: boolean;
  fromLog: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={food.name}
      style={[
        local.tile,
        {
          borderRadius: t.radius.m,
          borderColor: on ? t.color.accent : t.color.line,
          backgroundColor: on ? t.color.accentSoft : t.color.surfaceSolid,
          padding: t.space.xs,
          gap: 4,
        },
      ]}
      testID={`setup.tried.${food.id}`}
    >
      <FoodThumb food={food} size={52} />
      <Caption style={local.center} numberOfLines={2}>
        {food.name}
      </Caption>
      {fromLog ? (
        <Caption style={[local.center, { color: t.color.accent }]}>{SETUP.triedFromLog}</Caption>
      ) : null}
    </Pressable>
  );
}

export function FoodSetupScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const v = useNibble();
  const writes = useNibbleWrites();
  const fullPlan = usePlan().can('fullPlan');
  const addToGrocery = useAddToGrocery();
  const log = useMemo(() => preAnswerFromLog(v.exposures, v.today), [v.exposures, v.today]);
  const [a, setA] = useState<SetupAnswers | null>(null);
  const [step, setStep] = useState(0);
  const [startTouched, setStartTouched] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<NibbleProfile | null>(null);
  const [bought, setBought] = useState(false);

  useEffect(() => {
    if (a !== null || !v.loaded) return;
    setA(
      initialAnswers({
        profile: v.profile,
        log,
        months: v.months,
        today: v.today,
        region: regionFromLocale(deviceLocale()),
      }),
    );
  }, [a, v.loaded, v.profile, v.months, v.today, log]);

  const name = v.childName.trim() || 'your baby';
  const Name = cap(name);
  const age = v.birthDate ? ageLabel(v.birthDate, Date.now()) : '';
  const six = v.birthDate ? dayAtMonths(v.birthDate, 6) : null;
  const four = v.birthDate ? dayAtMonths(v.birthDate, 4) : null;

  const base: Omit<PlanInput, 'profile' | 'days'> | null = useMemo(
    () =>
      v.birthDate === null || v.childId === null
        ? null
        : {
            childId: v.childId,
            birthDate: v.birthDate,
            today: v.today,
            foods: v.foods,
            exposures: v.exposures,
            noticed: v.noticed,
            marks: [],
            ai: null,
          },
    [v.birthDate, v.childId, v.today, v.foods, v.exposures, v.noticed],
  );

  const preview = useMemo(
    () =>
      base === null || a === null || a.where === null
        ? []
        : buildPlan({ ...base, days: 21, profile: previewProfile(a, v.profile, v.today) }),
    [base, a, v.profile, v.today],
  );
  const finalPlan = useMemo(
    () => (base === null || done === null ? [] : buildPlan({ ...base, days: 21, profile: done })),
    [base, done],
  );

  if (!v.loaded || a === null)
    return (
      <Screen title={SETUP.title} testID="setup">
        {null}
      </Screen>
    );

  const set = (change: Partial<SetupAnswers>) => setA(x => (x === null ? x : { ...x, ...change }));
  const steps = stepsFor(a.where, v.months);
  const current: Step = steps[Math.min(step, steps.length - 1)] ?? 'intro';
  const last = step >= steps.length - 1;
  const hypothetical =
    a.where === 'not_yet' && a.start !== 'today' && !(a.start === 'day' && a.startOn);
  const startDayChosen: IsoDay | null =
    a.where !== 'not_yet'
      ? null
      : a.start === 'today'
        ? v.today
        : a.start === 'day'
          ? a.startOn
          : null;

  /* ── the steps ─────────────────────────────────────────────────────────────────────────── */

  const tooYoung = () => (
    <Question title={SETUP.tooYoungTitle}>
      <Body>
        {SETUP.tooYoungBody(Name, age, four ? dayLabel(four) : '', six ? dayLabel(six) : '')}
      </Body>
    </Question>
  );

  const intro = () => (
    <Question title={SETUP.introTitle(Name)}>
      <Body>{SETUP.introBody(Name, age, steps.length - 1)}</Body>
      <Disclosure summary={SETUP.introLearn} testID="setup.learn">
        <View style={{ gap: t.space.xs }}>
          {SETUP.introLearnItems.map(s => (
            <BodySm key={s}>{s}</BodySm>
          ))}
        </View>
      </Disclosure>
    </Question>
  );

  const where = () => (
    <Question title={SETUP.whereTitle(Name)}>
      {log.meals > 0 && log.firstDay ? (
        <Card testID="setup.fromlog">
          <BodySm>{SETUP.fromLog(log.meals, dayLabel(log.firstDay))}</BodySm>
        </Card>
      ) : null}
      <OneOf
        values={['not_yet', 'started', 'lots'] as const}
        label={x => (x === 'lots' ? SETUP.whereOptions.lots(Name) : SETUP.whereOptions[x])}
        chosen={a.where}
        onPick={x =>
          set({
            where: x,
            firstTaste: x === 'not_yet' ? a.firstTaste : (a.firstTaste ?? log.firstDay ?? v.today),
          })
        }
        id="setup.where"
      />
      {a.where !== null && a.where !== 'not_yet' ? (
        <View style={{ gap: t.space.xs }}>
          <DateField
            label={SETUP.firstTaste(Name)}
            value={fromIso(a.firstTaste)}
            onChange={d => set({ firstTaste: toIso(d) })}
            maximumDate={new Date()}
            {...(four ? { minimumDate: fromIso(four) as Date } : {})}
            testID="setup.firsttaste"
          />
          <Caption>{SETUP.firstTasteHint}</Caption>
        </View>
      ) : null}
    </Question>
  );

  const start = () => {
    const earliest = four !== null && four > v.today ? four : v.today;
    const underSix = six !== null && (startDayChosen ?? v.today) < six;
    return (
      <View style={{ gap: t.space.xl }}>
        <Question title={SETUP.signsTitle(Name)} hint={SETUP.signsHint}>
          <Rows>
            {READINESS_SIGNS.map(s => (
              <Row
                key={s}
                title={SETUP.signs[s]}
                checked={a.signs.includes(s)}
                onCheck={() => {
                  const signs = toggle(a.signs, s);
                  // the start answer follows the signs until the parent picks one themselves
                  const startDefault =
                    signs.length === 4 && v.months >= 6
                      ? 'today'
                      : signs.length > 0 && v.months < 6
                        ? 'day'
                        : 'signs';
                  set(
                    startTouched
                      ? { signs }
                      : {
                          signs,
                          start: startDefault,
                          startOn: startDefault === 'day' ? (six ?? null) : a.startOn,
                        },
                  );
                }}
                checkLabel={SETUP.signs[s]}
                testID={`setup.sign.${s}`}
              />
            ))}
          </Rows>
          {a.signs.length === READINESS_SIGNS.length ? <BodySm>{SETUP.allSigns}</BodySm> : null}
        </Question>
        <Question title={SETUP.whenTitle}>
          <OneOf
            values={['today', 'day', 'signs'] as const}
            label={x => SETUP.whenOptions[x]}
            chosen={a.start}
            onPick={x => {
              setStartTouched(true);
              set({
                start: x,
                startOn:
                  x === 'day'
                    ? (a.startOn ?? (six !== null && six > v.today ? six : earliest))
                    : a.startOn,
              });
            }}
            id="setup.when"
          />
          {a.start === 'day' ? (
            <DateField
              label={SETUP.whenDay}
              value={fromIso(a.startOn)}
              onChange={d => set({ startOn: toIso(d) })}
              minimumDate={fromIso(earliest) as Date}
              maximumDate={fromIso(addDays(v.today, 90)) as Date}
              testID="setup.starton"
            />
          ) : null}
          {a.start === 'signs' ? <BodySm>{SETUP.whenSignsHint}</BodySm> : null}
          {underSix && a.start !== 'signs' && six ? (
            <Card testID="setup.beforesix">
              <BodySm>
                {a.region === 'UK'
                  ? SETUP.beforeSixUK(Name, dayLabel(six))
                  : SETUP.beforeSix(Name, dayLabel(six))}
              </BodySm>
            </Card>
          ) : null}
        </Question>
      </View>
    );
  };

  const approach = () => (
    <Question title={SETUP.approachTitle(Name)} hint={SETUP.approachHints[a.approach]}>
      <OneOf
        values={['puree', 'blw', 'mix'] as const}
        label={x => (x === 'blw' ? SETUP.approachOptions.blw(Name) : SETUP.approachOptions[x])}
        chosen={a.approach}
        onPick={x => set({ approach: x })}
        id="setup.approach"
      />
    </Question>
  );

  const texture = () => (
    <Question title={SETUP.textureTitle(Name)}>
      <OneOf
        values={['smooth', 'lumps', 'pieces', 'family'] as const}
        label={x => SETUP.textureOptions[x]}
        chosen={a.texture}
        onPick={x => set({ texture: x })}
        id="setup.texture"
      />
    </Question>
  );

  const family = () => (
    <View style={{ gap: t.space.lg }}>
      <Question title={SETUP.familyTitle}>
        <OneOf
          values={['omnivore', 'vegetarian', 'vegan', 'pescatarian'] as const}
          label={x => PROFILE.dietOptions[x]}
          chosen={a.diet}
          onPick={x => set({ diet: x })}
          id="setup.diet"
        />
        {a.diet === 'vegan' ? <BodySm>{SETUP.veganLine(Name)}</BodySm> : null}
        {a.diet === 'vegetarian' ? <BodySm>{SETUP.vegetarianLine(Name)}</BodySm> : null}
      </Question>
      <View style={{ gap: t.space.xs }}>
        <BodyStrong>{SETUP.rulesTitle}</BodyStrong>
        <Chips
          values={CULTURAL_RULES}
          label={x => PROFILE.ruleOptions[x]}
          chosen={x => a.rules.includes(x)}
          onPress={x => set({ rules: toggle(a.rules, x) })}
          id="setup.rules"
        />
      </View>
      <Disclosure summary={SETUP.cuisines} testID="setup.cuisines">
        <View style={{ gap: t.space.xs }}>
          <BodySm>{SETUP.cuisinesHint}</BodySm>
          <Chips
            values={
              CUISINES.filter(
                c => c in PROFILE.cuisineOptions,
              ) as (keyof typeof PROFILE.cuisineOptions)[]
            }
            label={x => PROFILE.cuisineOptions[x]}
            chosen={x => a.cuisines.includes(x)}
            onPress={x => set({ cuisines: toggle(a.cuisines, x) })}
            id="setup.cuisine"
          />
        </View>
      </Disclosure>
    </View>
  );

  const tried = () => {
    const grid = commonFoodsFor(a, v.profile, v.today);
    const inGrid = new Set(grid.map(f => f.id));
    const extra = a.tried.filter(id => !inGrid.has(id));
    const fromLog = new Set(log.foodIds);
    return (
      <Question title={SETUP.triedTitle(Name)} hint={SETUP.triedHint(Name)}>
        <View style={[shared.wrap, { gap: t.space.xs }]}>
          {grid.map(f => (
            <FoodTile
              key={f.id}
              food={f}
              on={a.tried.includes(f.id)}
              fromLog={fromLog.has(f.id)}
              onPress={() => set({ tried: toggle(a.tried, f.id) })}
            />
          ))}
        </View>
        {extra.length > 0 ? (
          <Chips
            values={extra}
            label={id => v.foodById(id)?.name ?? id}
            chosen={() => true}
            onPress={id => set({ tried: a.tried.filter(x => x !== id) })}
            id="setup.tried.extra"
          />
        ) : null}
        <Caption>{SETUP.triedCount(a.tried.length)}</Caption>
        <View style={{ gap: t.space.xs }}>
          {a.where === 'lots' ? (
            <Button
              label={SETUP.triedFruitVeg}
              variant="secondary"
              size="sm"
              onPress={() =>
                set({ tried: [...new Set([...a.tried, ...fruitAndVegFor(a, v.profile, v.today)])] })
              }
              style={shared.start}
              testID="setup.tried.fruitveg"
            />
          ) : null}
          <Button
            label={SETUP.triedMore}
            variant="ghost"
            size="sm"
            icon="search"
            onPress={() => setPicking(true)}
            style={shared.start}
            testID="setup.tried.more"
          />
        </View>
      </Question>
    );
  };

  const allergens = () => {
    const p = previewProfile(a, v.profile, v.today);
    return (
      <View style={{ gap: t.space.xl }}>
        <Question title={SETUP.doctorTitle(Name)}>
          <OneOf
            values={['no', 'yes'] as const}
            label={x => SETUP.doctorOptions[x]}
            chosen={a.doctor ? 'yes' : 'no'}
            onPick={x => set({ doctor: x === 'yes' })}
            id="setup.doctor"
          />
          {a.doctor ? (
            <View style={{ gap: t.space.xs }}>
              <BodyStrong>{SETUP.doctorWhich}</BodyStrong>
              <BodySm>{SETUP.doctorHint}</BodySm>
              <Chips
                values={ALLERGEN_IDS}
                label={x => ALLERGEN_LABEL[x]}
                chosen={x => a.diagnosed.includes(x)}
                onPress={x => set({ diagnosed: toggle(a.diagnosed, x) })}
                id="setup.diagnosed"
              />
            </View>
          ) : null}
        </Question>
        <Question title={SETUP.eczemaTitle(Name)}>
          <OneOf
            values={['none', 'mild', 'severe', 'unsure'] as const}
            label={x => SETUP.eczemaOptions[x]}
            chosen={a.eczema}
            onPick={x => set({ eczema: x })}
            id="setup.eczema"
          />
          {a.eczema === 'unsure' ? <BodySm>{SETUP.eczemaUnsure}</BodySm> : null}
          {p.allergenMode !== 'none' && higherPeanutRisk(p) ? (
            <Card testID="setup.peanut">
              <BodySm>{SETUP.peanutWaits(Name)}</BodySm>
            </Card>
          ) : null}
        </Question>
        {a.where !== 'not_yet' ? (
          <Question title={SETUP.introducedTitle(Name)} hint={SETUP.introducedHint}>
            <Chips
              values={ALLERGEN_IDS.filter(x => !(a.doctor && a.diagnosed.includes(x)))}
              label={x => ALLERGEN_LABEL[x]}
              chosen={x => a.introduced.includes(x)}
              onPress={x => set({ introduced: toggle(a.introduced, x) })}
              id="setup.introduced"
            />
          </Question>
        ) : null}
        <Question title={SETUP.modeTitle} hint={SETUP.modeHints[a.mode]}>
          <OneOf
            values={['early', 'pediatrician', 'none'] as const}
            label={x => SETUP.modeOptions[x]}
            chosen={a.mode}
            onPick={x => set({ mode: x })}
            id="setup.mode"
          />
        </Question>
      </View>
    );
  };

  const NODE: Record<Step, () => ReactNode> = {
    too_young: tooYoung,
    intro,
    where,
    start,
    approach,
    texture,
    family,
    tried,
    allergens,
  };

  const finish = async () => {
    if (v.childId === null) return;
    const profile = profileFromAnswers(a, v.profile, v.today);
    setBusy(true);
    try {
      const out = await writes.saveProfile(
        v.childId,
        v.profileRecord?.id,
        profile,
        profile.stage === 'getting_ready' && profile.startOn === null
          ? SETUP.savedWaits
          : SETUP.saved,
      );
      if (out?.committed) setDone(profile);
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    if (nav.canGoBack()) nav.goBack();
    else nav.navigate('Tabs', { screen: 'Today' }, BACK_TO_TABS);
  };

  const next = () => {
    if (current === 'too_young') return leave();
    if (last) return void finish();
    // the allergens step opens with every allergen inside the foods ticked as tried
    if (steps[step + 1] === 'allergens') setA(x => (x === null ? x : withTriedAllergens(x)));
    setStep(s => s + 1);
  };

  const blocked =
    v.childId === null ||
    (current === 'where' && a.where === null) ||
    (current === 'start' && a.start === 'day' && a.startOn === null);

  if (done !== null)
    return (
      <Summary
        profile={done}
        plan={finalPlan}
        name={Name}
        age={age}
        six={six}
        today={v.today}
        foodById={v.foodById}
        groceryDays={groceryDays(fullPlan)}
        bought={bought}
        onBuy={async items => {
          const n = await addToGrocery(items);
          if (n > 0) setBought(true);
        }}
        onDone={leave}
      />
    );

  const shown = steps.filter(s => s !== 'intro' && s !== 'too_young').length;
  const at = steps.slice(0, step + 1).filter(s => s !== 'intro' && s !== 'too_young').length;

  return (
    <Screen title={SETUP.title} testID="setup">
      <View style={{ gap: t.space.lg }}>
        {current !== 'intro' && current !== 'too_young' ? (
          <View style={{ gap: t.space.xs }}>
            <StepTrack current={at} total={shown} />
            <Label>{SETUP.step(at, shown)}</Label>
          </View>
        ) : null}
        {NODE[current]()}
        {current !== 'intro' && current !== 'too_young' && current !== 'where' ? (
          <PlanPreview
            plan={preview}
            foodById={v.foodById}
            title={hypothetical ? SETUP.previewIf(dayLabel(v.today)) : SETUP.previewTitle(Name)}
          />
        ) : null}
        <View style={{ gap: t.space.sm }}>
          <Button
            label={
              current === 'intro'
                ? SETUP.start
                : current === 'too_young'
                  ? SETUP.tooYoungDone
                  : last
                    ? SETUP.finish
                    : SETUP.next
            }
            onPress={next}
            loading={busy}
            disabled={blocked}
            testID="setup.next"
          />
          {step > 0 ? (
            <Button
              label={SETUP.back}
              variant="ghost"
              onPress={() => setStep(s => s - 1)}
              testID="setup.back"
            />
          ) : null}
        </View>
      </View>
      <FoodPickerSheet
        visible={picking}
        title={SETUP.triedPick}
        foods={v.foods}
        statuses={v.statuses}
        onPick={f => {
          set({ tried: a.tried.includes(f.id) ? a.tried : [...a.tried, f.id] });
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}

/* ── what the app says back (§2.6) ─────────────────────────────────────────────────────────── */

function Summary({
  profile,
  plan,
  name,
  age,
  six,
  today,
  foodById,
  groceryDays: days,
  bought,
  onBuy,
  onDone,
}: {
  profile: NibbleProfile;
  plan: readonly PlanDay[];
  name: string;
  age: string;
  six: IsoDay | null;
  today: IsoDay;
  foodById: (id: string) => Food | undefined;
  groceryDays: number;
  bought: boolean;
  onBuy: (titles: string[]) => Promise<void>;
  onDone: () => void;
}) {
  const t = useTheme();
  const s = setupSummary(plan, profile, profile.triedBefore.length);
  const waits = s.startDay === null;
  const fromStart = waits ? [] : plan.filter(d => d.day >= (s.startDay as IsoDay)).slice(0, days);
  const groceries = planGroceries(fromStart, foodById, []);
  const firstAllergen = s.allergenStarts[0];
  const started = profile.startedOn !== null && profile.startedOn <= today;

  const because: string[] = [];
  if (profile.holdTexture) because.push(SETUP.because.smooth);
  else because.push(SETUP.because[profile.approach]);
  if (profile.diet !== 'omnivore') because.push(SETUP.because[profile.diet]);
  if (s.triedCount > 0) because.push(SETUP.because.tried(s.triedCount, name));

  return (
    <Screen title={SETUP.title} testID="setup.summary">
      <View style={{ gap: t.space.lg }}>
        <H2>{waits ? SETUP.summaryWaitsTitle(name) : SETUP.summaryTitle(name)}</H2>
        <Body>
          {waits
            ? SETUP.waits(name, six ? dayLabel(six) : '')
            : started
              ? SETUP.startedOn(daysBetween(profile.startedOn as IsoDay, today) + 1, name, age)
              : s.startDay === today
                ? SETUP.startsToday(dayLabel(today), name, age)
                : SETUP.startsOn(dayLabel(s.startDay as IsoDay), name, age)}
        </Body>

        {s.firstWeek.length > 0 ? (
          <View style={{ gap: t.space.xs }}>
            <Label>{SETUP.firstWeek}</Label>
            <Rows testID="setup.summary.week">
              {s.firstWeek.map(d =>
                d.items.map((i, k) => {
                  const food = foodById(i.foodId);
                  return (
                    <Row
                      key={`${d.day}:${i.meal}:${i.foodId}`}
                      {...(k === 0 ? { eyebrow: dayLabel(d.day) } : {})}
                      title={food?.name ?? i.foodId}
                      detail={FORM_LABEL[i.form]}
                      iconNode={<FoodThumb food={food} size={36} />}
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
                }),
              )}
            </Rows>
          </View>
        ) : null}

        <View style={{ gap: t.space.xs }}>
          <Label>{SETUP.allergensTitle}</Label>
          <Card>
            <View style={{ gap: t.space.xs }}>
              {profile.allergenMode === 'none' ? (
                <BodySm>{SETUP.allergensNone}</BodySm>
              ) : profile.allergenMode === 'pediatrician' ? (
                <BodySm>{SETUP.allergensAsk}</BodySm>
              ) : (
                <>
                  {firstAllergen ? (
                    <BodySm>
                      {SETUP.allergenStarts(
                        ALLERGENS[firstAllergen.allergen].name,
                        dayLabel(firstAllergen.day),
                      )}
                    </BodySm>
                  ) : null}
                  {s.order.length > 0 || s.allergenStarts.length > 1 ? (
                    <BodySm>
                      {SETUP.allergenOrder(
                        [
                          ...s.allergenStarts.slice(1).map(x => x.allergen),
                          ...allergenOrder(profile.allergenOrder).filter(x => s.order.includes(x)),
                        ]
                          .filter(x => !(x === 'peanut' && s.peanutWaits))
                          .map(x => ALLERGENS[x].name.toLowerCase())
                          .join(', '),
                      )}
                    </BodySm>
                  ) : null}
                  {s.peanutWaits ? <BodySm>{SETUP.peanutLine}</BodySm> : null}
                </>
              )}
            </View>
          </Card>
        </View>

        <View style={{ gap: t.space.xs }}>
          <Label>{SETUP.becauseTitle}</Label>
          <Card>
            <View style={{ gap: t.space.xs }}>
              {because.slice(0, 3).map(line => (
                <BodySm key={line}>{line}</BodySm>
              ))}
            </View>
          </Card>
        </View>

        {groceries.length > 0 ? (
          <View style={{ gap: t.space.xs }}>
            <Label>{SETUP.buyTitle(groceries.length)}</Label>
            <Card testID="setup.summary.buy">
              <View style={{ gap: t.space.sm }}>
                <BodySm>{groceries.map(g => g.food.name).join(', ')}</BodySm>
                <Button
                  label={bought ? SETUP.buyDone : SETUP.buyAdd}
                  variant="secondary"
                  size="sm"
                  icon={bought ? 'check' : 'cart'}
                  disabled={bought}
                  onPress={() => void onBuy(groceries.map(g => g.food.name))}
                  style={shared.start}
                  testID="setup.summary.buy.add"
                />
              </View>
            </Card>
          </View>
        ) : null}

        <Caption>{SETUP.region(REGION_NAME[profile.region])}</Caption>
        <Button label={SETUP.seeToday} onPress={onDone} testID="setup.today" />
        <NotMedical />
      </View>
    </Screen>
  );
}

const local = StyleSheet.create({
  tile: { width: '31%', alignItems: 'center', borderWidth: 1.5 },
  center: { textAlign: 'center' },
});
