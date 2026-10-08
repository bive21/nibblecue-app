/**
 * SOMETHING YOU NOTICED (spec §6.4): what was seen, in the parent's own words for it, when, and
 * after which foods. Saved ONCE for both apps: a CuddleCue Health note with the foods beside it
 * (`writes.ts` `saveNoticed`). A sign that needs help now opens the emergency card before anything
 * else, and the note waits behind it with what was already ticked.
 *
 * Never a diagnosis: the words are "possible reaction" and "what you noticed", and the only thing
 * the app does with it is put the foods' new allergens on hold and keep it for the pediatrician.
 */
import {
  ALLERGENS,
  EMERGENCY_SIGNS,
  NOTICED_TEXT,
  SIGN_LABEL,
  SIGNS,
  type AllergenId,
  type Sign,
} from '@nibblecue/core/nibble';
import {
  Body,
  BodySm,
  Button,
  Chip,
  Input,
  Label,
  Row,
  Rows,
  SegmentedControl,
  useTheme,
} from '@nibblecue/ui';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useNibble } from '../../nibble/useNibble';
import { useNibbleWrites } from '../../nibble/useNibbleWrites';
import { NOTICED } from './copy';
import { NotMedical, styles } from './parts';

type Nav = NativeStackNavigationProp<RootParams>;

/** How long before the sign a meal still counts as "before" it (the foods offered to tick). */
export const LOOKBACK_HOURS = 8;
const AGO = [0, 1, 2, 4] as const;
const ONSET_MINUTES = [60, 180, 360] as const;

export const agoLabel = NOTICED.ago;

export function NoticedScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const params = useRoute<RouteProp<RootParams, 'Noticed'>>().params;
  const v = useNibble();
  const writes = useNibbleWrites();
  const [signs, setSigns] = useState<Sign[]>([]);
  const [ago, setAgo] = useState<(typeof AGO)[number]>(0);
  const [ongoing, setOngoing] = useState(false);
  const [foods, setFoods] = useState<string[]>(params?.foodIds ?? []);
  const [onset, setOnset] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  // a save lands on the phone at once (local-first), so the button never waits; this only keeps a
  // double tap from saving twice
  const busy = useRef(false);
  const [now] = useState(() => Date.now());
  const at = now - ago * 3_600_000;

  /** The meals logged in the hours before, newest first, each with its foods. */
  const meals = useMemo(() => {
    const from = at - LOOKBACK_HOURS * 3_600_000;
    const byMeal = new Map<
      string,
      { id: string; at: string; foods: { id: string; name: string }[] }
    >();
    for (const e of v.exposures) {
      const ms = Date.parse(e.at);
      if (ms < from || ms > at || e.foodId === null) continue;
      const m = byMeal.get(e.activityId) ?? { id: e.activityId, at: e.at, foods: [] };
      if (!m.foods.some(f => f.id === e.foodId)) m.foods.push({ id: e.foodId, name: e.name });
      byMeal.set(e.activityId, m);
    }
    return [...byMeal.values()].sort((a, b) => b.at.localeCompare(a.at));
  }, [v.exposures, at]);

  const toggleSign = (s: Sign) => {
    const on = !signs.includes(s);
    setSigns(list => (on ? [...list, s] : list.filter(x => x !== s)));
    // help first: the card opens on the tap, and this note is here when they come back
    if (on && EMERGENCY_SIGNS.includes(s)) nav.navigate('Emergency', { then: 'noticed' });
  };

  const mealId =
    params?.activityId ?? meals.find(m => m.foods.some(f => foods.includes(f.id)))?.id ?? null;

  const save = async () => {
    if (v.childId === null || signs.length === 0) return;
    if (busy.current) return;
    busy.current = true;
    try {
      const ok = await writes.noticed(
        {
          childId: v.childId,
          atIso: new Date(at).toISOString(),
          ongoing,
          signs,
          notes: notes.trim() === '' ? null : notes.trim(),
          foodIds: foods,
          mealId,
          onsetMinutes: onset,
        },
        NOTICED.saved,
      );
      if (!ok) return;
      const held = new Set<AllergenId>();
      for (const id of foods) for (const a of v.foodById(id)?.allergens ?? []) held.add(a);
      if (held.size > 0)
        writes.say(NOTICED.held([...held].map(a => ALLERGENS[a].name).join(', ')), { queue: true });
      nav.goBack();
    } finally {
      busy.current = false;
    }
  };

  return (
    <Screen title={NOTICED.title} testID="noticed">
      <View style={{ gap: t.space.lg }}>
        <Body>{NOTICED.lede}</Body>
        <BodySm ink="crit" testID="noticed.emergency">
          {NOTICED.emergencyHint}
        </BodySm>
        <Button
          label={NOTICED.emergencyCard}
          variant="danger"
          size="sm"
          icon="alarm"
          onPress={() => nav.navigate('Emergency', { then: 'noticed' })}
          style={styles.start}
          testID="noticed.emergency.open"
        />
        <View style={{ gap: t.space.xs }}>
          <Label>{NOTICED.signs}</Label>
          <View style={[styles.wrap, { gap: t.space.xs }]}>
            {SIGNS.map(s => (
              <Chip
                key={s}
                small
                label={SIGN_LABEL[s]}
                selected={signs.includes(s)}
                onPress={() => toggleSign(s)}
                testID={`noticed.sign.${s}`}
              />
            ))}
          </View>
        </View>
        <View style={{ gap: t.space.xs }}>
          <Label>{NOTICED.when}</Label>
          <SegmentedControl
            label={NOTICED.when}
            value={String(ago)}
            onChange={x => setAgo(Number(x) as (typeof AGO)[number])}
            options={AGO.map(h => ({ value: String(h), label: agoLabel(h) }))}
            testID="noticed.when"
          />
          <Rows>
            <Row
              title={NOTICED.ongoing}
              switchValue={ongoing}
              onSwitch={setOngoing}
              testID="noticed.ongoing"
            />
          </Rows>
        </View>
        <View style={{ gap: t.space.xs }}>
          <Label>{NOTICED.foods}</Label>
          <BodySm>{NOTICED.foodsHint}</BodySm>
          {meals.length === 0 ? (
            <BodySm testID="noticed.nomeals">{NOTICED.noMeals}</BodySm>
          ) : (
            meals.map(m => (
              <View key={m.id} style={[styles.wrap, { gap: t.space.xs }]}>
                {m.foods.map(f => (
                  <Chip
                    key={f.id}
                    small
                    label={f.name}
                    selected={foods.includes(f.id)}
                    onPress={() =>
                      setFoods(list =>
                        list.includes(f.id) ? list.filter(x => x !== f.id) : [...list, f.id],
                      )
                    }
                    testID={`noticed.food.${f.id}`}
                  />
                ))}
              </View>
            ))
          )}
        </View>
        {foods.length > 0 ? (
          <View style={{ gap: t.space.xs }}>
            <Label>{NOTICED.onset}</Label>
            <View style={[styles.wrap, { gap: t.space.xs }]}>
              {ONSET_MINUTES.map((m, i) => (
                <Chip
                  key={m}
                  small
                  label={NOTICED.onsetChoices[i] ?? ''}
                  selected={onset === m}
                  onPress={() => setOnset(onset === m ? null : m)}
                  testID={`noticed.onset.${m}`}
                />
              ))}
            </View>
          </View>
        ) : null}
        <Input
          label={NOTICED.notes}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={2000}
          testID="noticed.notes"
        />
        <BodySm>{NOTICED_TEXT}</BodySm>
        <Button
          label={NOTICED.save}
          onPress={() => void save()}
          disabled={signs.length === 0 || v.childId === null}
          testID="noticed.save"
        />
        <Button
          label={NOTICED.history}
          variant="ghost"
          onPress={() => nav.navigate('NoticedHistory')}
          testID="noticed.history"
        />
        <NotMedical />
      </View>
    </Screen>
  );
}
