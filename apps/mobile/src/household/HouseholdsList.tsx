/**
 * YOUR FAMILIES (0153): every family this account is in, the one on screen marked, a tap to show
 * another. Drawn only for an account in more than one (`hasSeveralHouseholds`), so a phone in one
 * family sees nothing new. The account menu and Family both draw it; the switch itself is the
 * account's (`AuthContext` `switchHousehold`), and says how it went in a toast.
 *
 * ON DUTY IN THE FAMILY ON SCREEN (2026-10-08; `switchDuty.ts`): the tap asks first, IN THE LIST,
 * under it, before the account menu closes: "You're on for Lee's family until 2:00 AM. Switch
 * anyway? Reminders for Lee's family will go back to the parents' phones." Switch anyway hands the
 * shift back and switches; Cancel changes nothing. This phone rings only for the family on screen,
 * so a switch that said nothing would leave that family's night ringing nowhere.
 */
import { clockText, hasSeveralHouseholds } from '@nibblecue/core';
import { Body, BodyStrong, Button, Card, Label, Row, Rows, useTheme } from '@nibblecue/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth, type OnDutyHere } from '../auth/AuthContext';
import { deviceClock24 } from '../sheets/quick/prefs';
import { useTimeZone } from '../time/useZone';
import { useToast } from '../ui/toast';
import { SWITCH } from './switchCopy';
import { dutyAskLines, type SwitchOutcome } from './switchOutcome';

/** The question, while it is asked: the family tapped, and the stretch this person is on for. */
interface DutyAsk {
  householdId: string;
  duty: OnDutyHere;
}

export function HouseholdsList({
  /** Called before the switch starts: a popover closes first (iOS presents one modal at a time). */
  beforeSwitch,
  testID = 'households',
}: {
  beforeSwitch?: () => Promise<void> | void;
  testID?: string;
}) {
  const t = useTheme();
  const { account, switching, actions } = useAuth();
  const toast = useToast();
  const timeZone = useTimeZone();
  const [ask, setAsk] = useState<DutyAsk | null>(null);
  const [asking, setAsking] = useState(false);
  if (!hasSeveralHouseholds(account) || account === null) return null;
  const onScreen = account.memberships[0]?.household_id ?? null;
  const clock = (ms: number) => clockText(ms, timeZone, deviceClock24());

  const said = (out: SwitchOutcome, householdId: string) => {
    if (out.kind === 'owed') toast.show(SWITCH.owed(out.count, out.name));
    else if (out.kind === 'on_duty_offline') toast.show(SWITCH.onDuty.offline(out.name));
    // on since the question was answered (a shift written by another phone meanwhile): asked again
    else if (out.kind === 'on_duty') setAsk({ householdId, duty: out });
    else if (out.kind === 'failed') toast.show(SWITCH.failed);
    // switched: the tree remounts on the family now shown, and `SwitchedToast` says so
  };
  const go = async (householdId: string, handBackDuty: boolean) => {
    await beforeSwitch?.();
    const out = await actions.switchHousehold(householdId, handBackDuty ? { handBackDuty } : {});
    said(out, householdId);
  };
  const show = async (householdId: string) => {
    if (householdId === onScreen || switching || asking) return;
    setAsking(true);
    try {
      // the question first, while the account menu is still open to ask it in
      const duty = await actions.dutyHere();
      if (duty !== null) {
        setAsk({ householdId, duty });
        return;
      }
    } finally {
      setAsking(false);
    }
    setAsk(null);
    await go(householdId, false);
  };
  const lines = ask === null ? null : dutyAskLines(ask.duty, clock);

  return (
    <>
      <Label>{SWITCH.heading}</Label>
      <Rows>
        {account.memberships.map(m => {
          const here = m.household_id === onScreen;
          return (
            <Row
              key={m.household_id}
              title={m.household_name || 'Family'}
              detail={here ? `${SWITCH.role(m.role)} · ${SWITCH.onScreen}` : SWITCH.role(m.role)}
              icon="home"
              selected={here}
              disabled={switching && !here}
              accessibilityLabel={SWITCH.rowLabel(m.household_name || 'Family', here)}
              {...(here
                ? { right: 'none' as const }
                : { onPress: () => void show(m.household_id) })}
              testID={`${testID}.${m.household_id}`}
            />
          );
        })}
      </Rows>
      {ask !== null && lines !== null ? (
        <Card testID={`${testID}.on_duty`}>
          <View style={{ gap: t.space.sm }}>
            <BodyStrong accessibilityRole="header" testID={`${testID}.on_duty.title`}>
              {lines.title}
            </BodyStrong>
            <Body>{SWITCH.onDuty.ask}</Body>
            <Body>{lines.body}</Body>
            <Button
              label={SWITCH.onDuty.confirm}
              variant="danger"
              loading={switching}
              onPress={() => {
                const target = ask.householdId;
                setAsk(null);
                void go(target, true);
              }}
              testID={`${testID}.on_duty.go`}
            />
            <Button
              label={SWITCH.onDuty.cancel}
              variant="ghost"
              onPress={() => setAsk(null)}
              testID={`${testID}.on_duty.cancel`}
            />
          </View>
        </Card>
      ) : null}
    </>
  );
}
