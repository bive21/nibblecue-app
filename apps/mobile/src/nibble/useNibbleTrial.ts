/**
 * NIBBLECUE PLUS'S TRIAL, ASKED FOR ONCE (the owner, 2026-10-08: "also give 14 day trial"). The
 * first time a family is on screen in NibbleCue with no NibbleCue plan row at all, the app asks the
 * server for the trial (`startNibbleTrial`); the server grants it once per household ever and the
 * account is read again so the plan shows it. The phone decides nothing: it only asks, once per
 * household per phone (a flag on the device keeps it from asking on every launch), and the
 * server's ledger is what makes it once ever, on every phone.
 */
import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { prefsStore } from '../prefs/async-storage';

const ASKED = (householdId: string): string => `nibble_trial_asked:${householdId}`;

export function useNibbleTrial(): void {
  const { account, api, actions } = useAuth();
  const householdId = account?.memberships[0]?.household_id ?? null;
  const hasRow = householdId !== null && (account?.nibblePlans?.[householdId] ?? null) !== null;
  useEffect(() => {
    if (householdId === null || hasRow) return;
    let live = true;
    void (async () => {
      if ((await prefsStore.get(ASKED(householdId))) === '1') return;
      const r = await api.startNibbleTrial(householdId).catch(() => null);
      if (!live || r === null) return;
      // a refusal other than "not on this server yet" is asked again next launch
      if (r.ok || r.status === 404) await prefsStore.set(ASKED(householdId), '1');
      if (r.ok && r.granted) await actions.refreshAccount();
    })();
    return () => {
      live = false;
    };
  }, [householdId, hasRow, api, actions]);
}
