/**
 * A NEW PARENT'S FIRST FAMILY, IN ONE PAGE (docs/PRODUCT.md §Setup). NibbleCue asks only what a
 * family needs to exist: your name, your baby's name and birth date. The household is made by
 * CuddleCue's own bootstrap on the shared server (`onboarding/sendFinish.ts`, the same answers
 * kept and the same retry), with CuddleCue's default modules, so the family opens in CuddleCue
 * too if they ever install it. The food questions come next, on Today, for the baby.
 *
 * A parent who already uses CuddleCue signs in with that account instead, and their family is
 * already here; an invite code joins someone else's family (the code sheet, CuddleCue's own).
 */
import { ChildNameSchema, DisplayNameSchema, type OnboardingDraft } from '@nibblecue/core';
import { Body, Button, Card, H1, Input, Label, useTheme } from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useAuth } from '../../auth/AuthContext';
import { newId } from '../../lib/ids';
import { deviceLocale, deviceTimeZone } from '../../lib/locale';
import { draftFor, saveOnboarding, type DraftScope } from '../../onboarding/draft-store';
import { nibbleDraft } from '../../onboarding/nibbleDraft';
import { sendFinish } from '../../onboarding/sendFinish';
import { prefsStore } from '../../prefs/async-storage';
import { DateField } from '../../ui/DateField';
import { FormError } from '../first-run/Sections';
import { failureSentence } from '../auth/copy';
import { ONBOARD_YOU } from './copy';

type Nav = NativeStackNavigationProp<RootParams>;

const toIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function OnboardingScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const { session, api, actions, phase, account } = useAuth();
  const uid = session?.user.id ?? '';
  const own = phase === 'ready';
  const scope: DraftScope = own ? 'own' : 'first';
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [name, setName] = useState(account?.profile?.display_name ?? '');
  const [child, setChild] = useState('');
  const [birth, setBirth] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void draftFor(prefsStore, uid, newId, scope).then(saved => {
      if (cancelled) return;
      setDraft(saved.draft);
      if (saved.draft.display_name) setName(saved.draft.display_name);
      if (saved.draft.child_name) setChild(saved.draft.child_name);
      if (saved.draft.birth_date) setBirth(new Date(`${saved.draft.birth_date}T12:00:00`));
    });
    return () => {
      cancelled = true;
    };
  }, [uid, scope]);

  const nameOk = DisplayNameSchema.safeParse(name).success;
  const childOk = ChildNameSchema.safeParse(child).success;
  const ready = draft !== null && nameOk && childOk && birth !== null;

  const finish = async () => {
    if (!ready || draft === null || birth === null) return;
    setBusy(true);
    setError(null);
    try {
      const filled = nibbleDraft(draft, { name, child, birth: toIso(birth) });
      await saveOnboarding(prefsStore, uid, filled, Date.now, scope);
      const sent = await sendFinish(
        {
          store: prefsStore,
          userId: uid,
          context: { locale: deviceLocale(), time_zone: deviceTimeZone() },
          createHousehold: body => api.createHousehold(body),
          scope,
        },
        filled,
      );
      if (sent.kind === 'refused') {
        setError(sent.result.detail ?? sent.result.error);
        return;
      }
      if (own) {
        await actions.startedOwnFamily(sent.kind === 'created' ? sent.result.household_id : null);
        if (nav.canGoBack()) nav.goBack();
      } else {
        await actions.refreshAccount();
      }
    } catch (err) {
      setError(failureSentence(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen chrome={own} {...(own ? { title: ONBOARD_YOU.title } : {})} testID="onboard">
      <View style={{ gap: t.space.lg, paddingTop: own ? 0 : t.space.xl }}>
        {own ? null : (
          <>
            <Label>{ONBOARD_YOU.eyebrow}</Label>
            <H1>{ONBOARD_YOU.title}</H1>
          </>
        )}
        <Body>{ONBOARD_YOU.blurb}</Body>
        <Input
          label={ONBOARD_YOU.name}
          value={name}
          onChangeText={setName}
          placeholder={ONBOARD_YOU.namePlaceholder}
          maxLength={40}
          testID="onboard.name"
        />
        <Input
          label={ONBOARD_YOU.babyName}
          value={child}
          onChangeText={setChild}
          placeholder={ONBOARD_YOU.babyNamePlaceholder}
          maxLength={40}
          testID="onboard.child"
        />
        <DateField
          label={ONBOARD_YOU.birthDate}
          value={birth}
          onChange={setBirth}
          maximumDate={new Date()}
          minimumDate={new Date(Date.now() - 4 * 365 * 86_400_000)}
          testID="onboard.birth"
        />
        {error ? (
          <Card testID="onboard.error">
            <FormError testID="onboard.error.text">{error}</FormError>
          </Card>
        ) : null}
        <Button
          label={busy ? ONBOARD_YOU.creating : ONBOARD_YOU.create}
          onPress={() => void finish()}
          loading={busy}
          disabled={!ready}
          testID="onboard.finish"
        />
        {own ? null : (
          <Button
            label={ONBOARD_YOU.haveCode}
            variant="ghost"
            onPress={() => nav.navigate('JoinCode')}
            testID="onboard.code"
          />
        )}
      </View>
    </Screen>
  );
}
