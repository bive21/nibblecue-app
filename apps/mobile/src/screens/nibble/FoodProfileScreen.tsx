/**
 * THE BABY'S FOOD PROFILE (docs/PRODUCT.md §Setup): the few answers the plan needs, asked one step
 * at a time the first time (`setup`), and all on one page afterwards from More. Every answer has a
 * default, so only the first question is required; the profile is a NibbleCue record for this
 * baby, shared with the other parent's phone through the shared server.
 */
import {
  ALLERGEN_IDS,
  ALLERGENS,
  CULTURAL_RULES,
  CUISINES,
  higherPeanutRisk,
  NibbleProfile,
  type AllergenId,
  type NibbleProfileInput,
} from '@nibblecue/core/nibble';
import {
  Body,
  BodySm,
  BodyStrong,
  Button,
  Card,
  Chip,
  Label,
  Row,
  Rows,
  SegmentedControl,
  StepTrack,
  useTheme,
} from '@nibblecue/ui';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { BACK_TO_TABS } from '../../app/backToTabs';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useNibble } from '../../nibble/useNibble';
import { useNibbleWrites } from '../../nibble/useNibbleWrites';
import { DateField } from '../../ui/DateField';
import { PROFILE } from './copy';
import { styles } from './parts';

type Nav = NativeStackNavigationProp<RootParams>;

const toIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s: string | null): Date | null => (s ? new Date(`${s}T12:00:00`) : null);

function toggle<T>(list: readonly T[], x: T): T[] {
  return list.includes(x) ? list.filter(y => y !== x) : [...list, x];
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.xs }}>
      <BodyStrong>{label}</BodyStrong>
      {hint ? <BodySm>{hint}</BodySm> : null}
      {children}
    </View>
  );
}

function Chips<T extends string>({
  values,
  labels,
  chosen,
  onPress,
  id,
}: {
  values: readonly T[];
  labels: Readonly<Record<T, string>>;
  chosen: (v: T) => boolean;
  onPress: (v: T) => void;
  id: string;
}) {
  const t = useTheme();
  return (
    <View style={[styles.wrap, { gap: t.space.xs }]}>
      {values.map(v => (
        <Chip
          key={v}
          small
          label={labels[v]}
          selected={chosen(v)}
          onPress={() => onPress(v)}
          testID={`${id}.${v}`}
        />
      ))}
    </View>
  );
}

const ALLERGEN_LABEL = Object.fromEntries(ALLERGEN_IDS.map(a => [a, ALLERGENS[a].name])) as Record<
  AllergenId,
  string
>;

export function FoodProfileScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const setup = useRoute<RouteProp<RootParams, 'FoodProfile'>>().params?.setup === true;
  const v = useNibble();
  const writes = useNibbleWrites();
  const [p, setP] = useState<NibbleProfile>(() =>
    NibbleProfile.parse(
      v.profile ?? {
        stage: v.months < 6 ? 'getting_ready' : 'started',
        ready: v.months >= 6,
      },
    ),
  );
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const set = (change: Partial<NibbleProfileInput>) =>
    setP(x => NibbleProfile.parse({ ...x, ...change }));

  const sections: { key: string; node: ReactNode }[] = [
    {
      key: 'where',
      node: (
        <View style={{ gap: t.space.lg }}>
          <Field label={PROFILE.where}>
            <Chips
              values={['getting_ready', 'started', 'eating_many'] as const}
              labels={PROFILE.whereOptions}
              chosen={x => p.stage === x}
              onPress={x =>
                set({
                  stage: x,
                  startedOn: x === 'getting_ready' ? null : (p.startedOn ?? v.today),
                })
              }
              id="profile.where"
            />
          </Field>
          {p.stage !== 'getting_ready' ? (
            <DateField
              label={PROFILE.startedOn}
              value={fromIso(p.startedOn)}
              onChange={d => set({ startedOn: toIso(d) })}
              maximumDate={new Date()}
              testID="profile.started"
            />
          ) : (
            <Field label={PROFILE.readiness}>
              {PROFILE.readinessItems.map(i => (
                <BodySm key={i}>{`· ${i}`}</BodySm>
              ))}
              <SegmentedControl
                label={PROFILE.readiness}
                value={p.ready ? 'yes' : 'no'}
                onChange={x => set({ ready: x === 'yes' })}
                options={[
                  { value: 'yes', label: PROFILE.readinessYes },
                  { value: 'no', label: PROFILE.readinessNotYet },
                ]}
                testID="profile.ready"
              />
            </Field>
          )}
        </View>
      ),
    },
    {
      key: 'approach',
      node: (
        <Field label={PROFILE.approach}>
          <Chips
            values={['puree', 'blw', 'mix'] as const}
            labels={PROFILE.approachOptions}
            chosen={x => p.approach === x}
            onPress={x => set({ approach: x })}
            id="profile.approach"
          />
        </Field>
      ),
    },
    {
      key: 'diet',
      node: (
        <View style={{ gap: t.space.lg }}>
          <Field label={PROFILE.diet}>
            <Chips
              values={['omnivore', 'vegetarian', 'vegan', 'pescatarian'] as const}
              labels={PROFILE.dietOptions}
              chosen={x => p.diet === x}
              onPress={x => set({ diet: x })}
              id="profile.diet"
            />
          </Field>
          <Field label={PROFILE.rules}>
            <Chips
              values={CULTURAL_RULES}
              labels={PROFILE.ruleOptions}
              chosen={x => p.rules.includes(x)}
              onPress={x => set({ rules: toggle(p.rules, x) })}
              id="profile.rules"
            />
          </Field>
          <Field label={PROFILE.cuisines} hint={PROFILE.cuisinesHint}>
            <Chips
              values={
                CUISINES.filter(
                  c => c in PROFILE.cuisineOptions,
                ) as (keyof typeof PROFILE.cuisineOptions)[]
              }
              labels={PROFILE.cuisineOptions}
              chosen={x => p.cuisines.includes(x)}
              onPress={x => set({ cuisines: toggle(p.cuisines, x) })}
              id="profile.cuisines"
            />
          </Field>
        </View>
      ),
    },
    {
      key: 'allergy',
      node: (
        <View style={{ gap: t.space.lg }}>
          <Field label={PROFILE.eczema}>
            <Chips
              values={['none', 'mild_moderate', 'severe'] as const}
              labels={PROFILE.eczemaOptions}
              chosen={x => p.eczema === x}
              onPress={x => set({ eczema: x })}
              id="profile.eczema"
            />
          </Field>
          <Rows>
            <Row
              title={PROFILE.family}
              switchValue={p.familyAllergy}
              onSwitch={x => set({ familyAllergy: x })}
              testID="profile.family"
            />
          </Rows>
          <Field label={PROFILE.diagnosed} hint={PROFILE.diagnosedHint}>
            <Chips
              values={ALLERGEN_IDS}
              labels={ALLERGEN_LABEL}
              chosen={x => p.diagnosed.includes(x)}
              onPress={x => set({ diagnosed: toggle(p.diagnosed, x) })}
              id="profile.diagnosed"
            />
          </Field>
          {higherPeanutRisk(p) ? (
            <Card testID="profile.peanut">
              <BodySm>{PROFILE.peanutTalk}</BodySm>
            </Card>
          ) : null}
        </View>
      ),
    },
    {
      key: 'allergens',
      node: (
        <View style={{ gap: t.space.lg }}>
          <Field label={PROFILE.mode} hint={PROFILE.modeHints[p.allergenMode]}>
            <Chips
              values={['early', 'pediatrician', 'none'] as const}
              labels={PROFILE.modeOptions}
              chosen={x => p.allergenMode === x}
              onPress={x => set({ allergenMode: x })}
              id="profile.mode"
            />
          </Field>
          <Field label={PROFILE.introduced} hint={PROFILE.introducedHint}>
            <Chips
              values={ALLERGEN_IDS}
              labels={ALLERGEN_LABEL}
              chosen={x => p.introducedBefore.some(i => i.allergen === x)}
              onPress={x =>
                set({
                  introducedBefore: p.introducedBefore.some(i => i.allergen === x)
                    ? p.introducedBefore.filter(i => i.allergen !== x)
                    : [...p.introducedBefore, { allergen: x, on: null }],
                })
              }
              id="profile.introduced"
            />
          </Field>
        </View>
      ),
    },
    {
      key: 'region',
      node: (
        <View style={{ gap: t.space.lg }}>
          <Field label={PROFILE.region} hint={PROFILE.regionHint}>
            <Chips
              values={['US', 'UK', 'CA', 'AU'] as const}
              labels={PROFILE.regionOptions}
              chosen={x => p.region === x}
              onPress={x => set({ region: x })}
              id="profile.region"
            />
          </Field>
          <Field label={PROFILE.meals}>
            <SegmentedControl
              label={PROFILE.meals}
              value={p.mealsPerDay === null ? 'auto' : String(p.mealsPerDay)}
              onChange={x => set({ mealsPerDay: x === 'auto' ? null : Number(x) })}
              options={[
                { value: 'auto', label: PROFILE.mealsAuto },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4' },
              ]}
              testID="profile.meals"
            />
          </Field>
          {v.months >= 9 ? (
            <Rows>
              <Row
                title={PROFILE.holdTexture}
                switchValue={p.holdTexture}
                onSwitch={x => set({ holdTexture: x })}
                testID="profile.texture"
              />
            </Rows>
          ) : null}
        </View>
      ),
    },
  ];

  const save = async () => {
    if (v.childId === null) return;
    setBusy(true);
    try {
      const out = await writes.saveProfile(
        v.childId,
        v.profileRecord?.id,
        p,
        setup ? PROFILE.done : PROFILE.saved,
      );
      if (out?.committed) {
        if (nav.canGoBack()) nav.goBack();
        else nav.navigate('Tabs', { screen: 'Today' }, BACK_TO_TABS);
      }
    } finally {
      setBusy(false);
    }
  };

  if (setup) {
    const last = step === sections.length - 1;
    return (
      <Screen title={PROFILE.setupTitle} testID="profile">
        <View style={{ gap: t.space.lg }}>
          <StepTrack current={step + 1} total={sections.length} />
          <Label>{PROFILE.step(step + 1, sections.length)}</Label>
          {sections[step]?.node}
          <View style={{ gap: t.space.sm }}>
            <Button
              label={last ? PROFILE.finish : PROFILE.next}
              onPress={() => (last ? void save() : setStep(s => s + 1))}
              loading={busy}
              disabled={v.childId === null}
              testID="profile.next"
            />
            {step > 0 ? (
              <Button
                label={PROFILE.back}
                variant="ghost"
                onPress={() => setStep(s => s - 1)}
                testID="profile.back"
              />
            ) : null}
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={PROFILE.title} testID="profile">
      <View style={{ gap: t.space.xl }}>
        {v.childName ? <Body>{v.childName}</Body> : null}
        {sections.map(s => (
          <View key={s.key}>{s.node}</View>
        ))}
        <Button
          label={PROFILE.save}
          onPress={() => void save()}
          loading={busy}
          disabled={v.childId === null}
          testID="profile.save"
        />
      </View>
    </Screen>
  );
}
