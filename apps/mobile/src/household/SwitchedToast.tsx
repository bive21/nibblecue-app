/**
 * THE ONE SENTENCE A SWITCH IS OWED: "Now showing the Lee family." Said once, by the tree the
 * switch mounted (`HouseholdKey`), since the screen that asked for it is gone by then.
 *
 * AND THE ONE A JOIN IS OWED WHEN ITS SWITCH DID NOT LAND (2026-10-08; `switchOutcome.ts`): "You
 * joined Lee's family", with what kept it off screen, said over the family still showing.
 */
import { clockText } from '@nibblecue/core';
import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { deviceClock24 } from '../sheets/quick/prefs';
import { useTimeZone } from '../time/useZone';
import { useToast } from '../ui/toast';
import { SWITCH } from './switchCopy';
import { joinedOffScreenSentence } from './switchOutcome';

export function SwitchedToast() {
  const { switchedTo, joinedOffScreen, actions } = useAuth();
  const toast = useToast();
  const timeZone = useTimeZone();
  const said = actions.switchedSaid;
  const joinedSaid = actions.joinedOffScreenSaid;
  useEffect(() => {
    if (switchedTo === null) return;
    toast.show(SWITCH.now(switchedTo));
    said();
  }, [switchedTo, toast, said]);
  useEffect(() => {
    if (joinedOffScreen === null) return;
    toast.show(
      joinedOffScreenSentence(joinedOffScreen, ms => clockText(ms, timeZone, deviceClock24())),
    );
    joinedSaid();
  }, [joinedOffScreen, toast, joinedSaid, timeZone]);
  return null;
}
