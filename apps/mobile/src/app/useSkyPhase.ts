/**
 * THE HOUR TODAY'S SKY IS DRAWN FOR (packages/ui `LiveSky`; the owner, 2026-09-25, of the "that's
 * cool" list). Read on the clock Today's own times are read on — `useTimeZone`, the phone's zone,
 * or home's while a trip keeps home time — so the sky and the times under it never disagree about
 * what hour it is.
 *
 * ONCE A MINUTE, AND ONLY WHILE TODAY IS IN FRONT. The tabs stay mounted behind the bar, and a
 * clock ticking behind a screen nobody is looking at is a timer for nothing; so the check starts
 * when Today comes into focus (looking at once, because the hour may have turned while the parent
 * was elsewhere), stops when it leaves, and looks again the moment the app comes back to the
 * foreground. A check that finds the same phase changes no state and draws nothing — the sky moves
 * four times a day (`SKY_PHASE_STARTS`).
 */
import { SKY_CHECK_MS, skyPhaseIn, type SkyPhase } from '@nibblecue/ui';
import { useIsFocused } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useSkyPhase(timeZone: string): SkyPhase {
  const focused = useIsFocused();
  const [phase, setPhase] = useState<SkyPhase>(() => skyPhaseIn(timeZone, Date.now()));
  useEffect(() => {
    if (!focused) return undefined;
    const look = () => setPhase(skyPhaseIn(timeZone, Date.now()));
    look();
    const every = setInterval(look, SKY_CHECK_MS);
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') look();
    });
    return () => {
      clearInterval(every);
      foreground.remove();
    };
  }, [focused, timeZone]);
  return phase;
}
