/**
 * THE FIRST PAGE IN A HOUSEHOLD JUST JOINED (the owner's report of 2026-09-29: *"there was no text
 * saying if i joined or not … after joining the household, add confirmation text"*).
 *
 * The join used to end on a toast — "You joined the Iversen family" — shown over the very moment
 * the whole screen changed to Today, with the notifications question on top of it. Now the joiner
 * lands HERE first, and stays until they have read it:
 *
 *   joined    "You joined Dana's family", the seat in their own terms ("You’re in as a caregiver.
 *             You can log, and correct your own entries…"), how long it lasts if it ends, and their
 *             name — the joiner's short setup. A join made the moment the account existed was named
 *             from the address (0124), so the field shows what everyone sees now, to keep or change.
 *             Continue saves a changed name, asks for notifications (the handoff audit's H3: the
 *             other parent may put them on for the night), and opens Today.
 *   not_used  an invite that could not be used because this account is in a household already —
 *             held on the first screen before signing in to it, or a link opened inside it. It used
 *             to vanish without a word. One account holds one household for now (0139). When nobody
 *             else is in that household (0143) the page says so and offers "Leave <name> first",
 *             which opens Family's leave confirmation, in place of the second-account workaround.
 *
 * It reads the account's join note (`auth/join.ts`), never a param, and it goes the moment the note
 * is let go: the route is registered only while there is one (`app/navigation.tsx`). Signed-out
 * chrome, on the lit ground, as setup's own welcome is: the household is theirs from the next page.
 */
import { aloneIn, DisplayNameSchema } from '@nibblecue/core';
import { Body, BodySm, Button, Card, Input, StepHeader, useTheme } from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useAuth } from '../../auth/AuthContext';
import { FormError, Group, Sheet } from '../first-run/Sections';
import { ONBOARD_YOU } from '../onboarding/copy';
import { JOIN } from './joinCopy';

/** The name rule's one sentence, as setup's first step says it (`OnboardingScreen` `STEP_REASON`). */
export const NAME_RULE = 'Your name, so entries are attributed. 2 to 40 characters, no links.';

export function JoinedScreen() {
  const t = useTheme();
  const { joinNote, account, api, actions } = useAuth();
  const current = account?.profile?.display_name?.trim() ?? '';
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** A name that could not be saved: the page then offers to go on with the one the account has. */
  const [unsaved, setUnsaved] = useState(false);
  /**
   * THE FIELD FOLLOWS THE ACCOUNT UNTIL IT IS TOUCHED: the account read that shows the household
   * can land a moment after this page does, with the name the join gave.
   */
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setName(current);
  }, [current]);
  /*
    ANDROID'S BACK IS READING IT TOO. The page cannot be swiped away (`app/navigation.tsx`), but the
    system's back pops it; the note goes with it, so the tabs do not bring it straight back.
  */
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const seen = actions.joinNoteSeen;
  useEffect(() => nav.addListener('beforeRemove', () => void seen()), [nav, seen]);

  /*
    AN UNUSED INVITE, AND NOBODY ELSE IN THE HOUSEHOLD THIS ACCOUNT IS IN (0143): the roster, read
    once, says whether leaving it is the way through. Until it answers, or if it cannot, the page
    says what it always said; the server counts again when they leave.
  */
  const [aloneHere, setAloneHere] = useState(false);
  const householdHere = account?.memberships[0]?.household_id;
  const unused = joinNote?.kind === 'not_used';
  useEffect(() => {
    if (!unused || householdHere === undefined) return;
    let live = true;
    void api
      .listMembers(householdHere)
      .then(members => {
        if (live) setAloneHere(aloneIn(members));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [unused, householdHere, api]);
  /*
    "LEAVE <NAME> FIRST": the note is read, and Family opens over Today with its leave confirmation
    up. A reset rather than a push, because this page is the only route under it and goes the moment
    the note does: pushed over it, Family would be left with nothing to go back to.
  */
  const leaveFirst = () => {
    void actions.joinNoteSeen();
    nav.reset({
      index: 1,
      routes: [{ name: 'Tabs' }, { name: 'Family', params: { confirmLeave: Date.now() } }],
    });
  };

  // the phone asks as the joiner arrives, never before they have read that they are in
  const finish = async () => {
    // NibbleCue asks for notifications when its reminders are switched on, not on joining
    await actions.joinNoteSeen();
  };

  const onContinue = async () => {
    if (busy) return;
    const wanted = name.trim();
    if (wanted === current) return finish();
    if (!DisplayNameSchema.safeParse(wanted).success) return setError(NAME_RULE);
    setBusy(true);
    setError(null);
    try {
      const r = await api.setDisplayName(wanted);
      if (!r.ok) {
        setError(JOIN.joined.nameFailed);
        setUnsaved(true);
        return;
      }
      await actions.refreshAccount().catch(() => null);
    } catch {
      setError(JOIN.joined.nameFailed);
      setUnsaved(true);
      return;
    } finally {
      setBusy(false);
    }
    await finish();
  };

  if (joinNote === null) return null;

  if (joinNote.kind === 'not_used') {
    // an invite to the very household they are in needs no way out of it
    const sameHousehold =
      joinNote.current.trim() !== '' && joinNote.current.trim() === joinNote.invited.trim();
    /*
      THE WAY THROUGH IS THE REASON'S (2026-10-07). A dead invite needs a new one, and a parent's
      invite to somebody who is a parent elsewhere needs a caregiver's: leaving their own family is
      not offered for either, since several families are the point (0153).
    */
    const next = JOIN.notUsed.next(joinNote.why);
    // …except for a parent ALONE in their own family (set up by mistake): their partner's parent
    // invite is the right key, and leaving is the way to use it (the regression review, 2026-10-08)
    const leaving =
      aloneHere && !sameHousehold && (next === null || joinNote.why === 'parent_elsewhere');
    return (
      <Screen chrome={false} testID="joined">
        <Sheet>
          <StepHeader icon="users" eyebrow={JOIN.notUsed.eyebrow} title={JOIN.notUsed.title} />
          <Card tint={t.color.accentSoft} testID="joined.not_used">
            <View style={{ gap: t.space.sm }}>
              <Body>{JOIN.notUsed.body(joinNote.current, joinNote.invited, joinNote.why)}</Body>
              {next !== null && !leaving ? (
                <BodySm testID="joined.next">{next}</BodySm>
              ) : leaving ? (
                <BodySm testID="joined.alone">{JOIN.notUsed.alone(joinNote.current)}</BodySm>
              ) : (
                <BodySm>{JOIN.inHousehold.workaround}</BodySm>
              )}
            </View>
          </Card>
          {leaving ? (
            <Button
              label={JOIN.inHousehold.leaveFirst(joinNote.current)}
              variant="secondary"
              onPress={leaveFirst}
              testID="joined.leave_first"
            />
          ) : null}
          <Button
            label={JOIN.notUsed.ok}
            onPress={() => void actions.joinNoteSeen()}
            testID="joined.ok"
          />
        </Sheet>
      </Screen>
    );
  }

  return (
    <Screen chrome={false} testID="joined">
      <Sheet>
        {/* no eyebrow here: "You’re in" over a line that opens "You’re in as a caregiver" said
            it twice (2026-09-29). Setup's join step, with no such line, keeps it (`JoinStep`). */}
        <StepHeader
          icon="users"
          title={JOIN.joined.title(joinNote.household_name)}
          blurb={JOIN.joined.role(joinNote.role)}
          titleTestID="joined.title"
        />
        {joinNote.seat_hours !== null ? (
          <Card tint={t.color.accentSoft} testID="joined.seat">
            <Body>{JOIN.joined.seat(joinNote.seat_hours)}</Body>
          </Card>
        ) : null}
        {/* THE NAME, ON THE FORM'S CARD (2026-09-30): the field, its line, the error and Continue,
            as the sign-in page's form is. The error is the app's one line (`FormError`) and needs
            a card under it on this ground; the way past it stays under the card. */}
        <Card>
          <View style={{ gap: t.space.lg }}>
            <Group gap="sm">
              <Input
                label={JOIN.joined.nameLabel}
                value={name}
                onChangeText={v => {
                  touched.current = true;
                  setName(v);
                  setError(null);
                }}
                // the same welcoming ask as setup's own name field
                placeholder={ONBOARD_YOU.namePlaceholder}
                autoComplete="given-name"
                textContentType="givenName"
                returnKeyType="done"
                onSubmitEditing={() => void onContinue()}
                testID="joined.name"
              />
              <BodySm>{JOIN.joined.nameHelp}</BodySm>
            </Group>
            {error ? <FormError testID="joined.error">{error}</FormError> : null}
            <Button
              label={JOIN.joined.continue}
              onPress={() => void onContinue()}
              loading={busy}
              testID="joined.continue"
            />
          </View>
        </Card>
        {unsaved ? (
          <Button
            label={JOIN.joined.skip}
            variant="ghost"
            onPress={() => void finish()}
            testID="joined.skip"
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
