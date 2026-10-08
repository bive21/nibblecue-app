/**
 * THE CLOCK THIS PHONE READS, wired to the phone (the rules are `zoneStore.ts`; the owner's
 * decision, 2026-09-23, is in `packages/core/src/today/travel.ts`).
 *
 *   * THE PHONE'S ZONE COMES FROM ITS SETTINGS, fresh each time (`expo-localization`). The
 *     JavaScript engine's own default zone is read once at launch on some platforms and can stay
 *     on the zone the app was opened in, which is exactly the zone a traveling parent has left.
 *   * IT IS RE-READ WHENEVER THE APP COMES BACK TO THE FOREGROUND — the moment after landing when a
 *     parent opens it — and every screen reading `useTimeZone` re-renders only if the answer moved.
 *   * THE HOME ZONE IS READ FROM THE LOCAL MIRROR, and again whenever the household's row changes
 *     (`keys.household`, which a pulled `households` row bumps).
 */
import { parseZoneRecord } from '@nibblecue/core';
import { getCalendars } from 'expo-localization';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { Outcome } from '../auth/providers/types';
import { keys, store as dataStore } from '../data/store';
import { openLocalDb } from '../db';
import { homeTimeZone } from '../db/queries/activities';
import { createZoneStore, effectiveZone, viewOf, ZONE_KEYS, type ZoneView } from './zoneStore';

/** The zone the phone's own settings are in right now. */
function phoneZoneNow(): string {
  try {
    const zone = getCalendars()[0]?.timeZone;
    if (typeof zone === 'string' && zone.length > 0) return zone;
  } catch {
    // no calendar from the platform: the engine's default is the next best thing
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const zones = createZoneStore({
  readDevice: phoneZoneNow,
  now: () => Date.now(),
  load: async householdId => {
    const db = await openLocalDb();
    const pref = async (key: string): Promise<string | null> =>
      (await db.get<{ value: string }>('select value from ui_prefs where key = ?', [key]))?.value ??
      null;
    return {
      home: await homeTimeZone(db, householdId),
      keepHomeIn: await pref(ZONE_KEYS.keepHomeIn),
      seenIn: await pref(ZONE_KEYS.seenIn),
      record: parseZoneRecord(await pref(ZONE_KEYS.record)),
    };
  },
  persist: async (key, value) => {
    const db = await openLocalDb();
    if (value === null) {
      await db.run('delete from ui_prefs where key = ?', [key]);
      return;
    }
    await db.run(
      'insert into ui_prefs (key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
      [key, value],
    );
  },
});

let foreground: { remove(): void } | null = null;
let watched: string | null = null;
let unwatch: (() => void) | null = null;

function subscribe(listener: () => void): () => void {
  // one listener for the app's life, added by the first screen that reads a time
  foreground ??= AppState.addEventListener('change', s => {
    if (s !== 'active') return;
    zones.refreshDevice();
    const household = zones.getState().householdId;
    if (household !== null) void zones.loadFor(household);
  });
  return zones.subscribe(listener);
}

/** Reads the household's home zone once, and again whenever its row changes. */
function follow(householdId: string | null): void {
  if (householdId === null || householdId === watched) return;
  unwatch?.();
  watched = householdId;
  unwatch = dataStore.subscribe(keys.household(householdId), () => {
    void zones.loadFor(householdId);
  });
  void zones.loadFor(householdId);
}

function useFollowHousehold(): void {
  const { account } = useAuth();
  const householdId = account?.memberships[0]?.household_id ?? null;
  const accountHome = account?.memberships[0]?.home_time_zone ?? null;
  useEffect(() => follow(householdId), [householdId]);
  // the account's copy of home, fresh at every refresh — and the only copy in mock mode
  useEffect(() => zones.setAccountHome(accountHome), [accountHome]);
}

/** The zone every time on this phone is read in: the phone's own, unless it is keeping home time. */
export function useTimeZone(): string {
  useFollowHousehold();
  return useSyncExternalStore(subscribe, () => effectiveZone(zones.getState()));
}

export interface ZonesView extends ZoneView {
  /** Keep home time on this phone for this trip, or follow the phone's clock again. */
  setKeepHome(keep: boolean): void;
  /** The "times follow this phone" card, dismissed for this trip. */
  dismissNotice(): void;
}

/** Everything the travel card and the time-zone sheet show. */
export function useZones(): ZonesView {
  useFollowHousehold();
  const state = useSyncExternalStore(subscribe, zones.getState);
  return useMemo(
    () => ({
      ...viewOf(state, Date.now()),
      setKeepHome: zones.setKeepHome,
      dismissNotice: zones.dismissNotice,
    }),
    [state],
  );
}

/**
 * THE OWNER MOVES HOME (migration 0107): the server first — it is the household's setting, checked
 * there, and every other phone learns it from there — then this phone's copies, so the card and the
 * row go the moment the answer comes back rather than at the next pull. Online only, like the other
 * account writes (`transferOwnership`); nothing is logged or lost by it failing.
 */
export function useMakeHome(): (zone: string) => Promise<Outcome> {
  const { account, api, actions } = useAuth();
  const householdId = account?.memberships[0]?.household_id ?? null;
  return useCallback(
    async (zone: string): Promise<Outcome> => {
      if (householdId === null) return { ok: false, status: 0, error: 'no_household' };
      const r = await api.setHomeTimeZone(householdId, zone);
      if (!r.ok) return r;
      zones.setAccountHome(zone);
      try {
        const db = await openLocalDb();
        await db.run('update households set home_time_zone = ? where id = ?', [zone, householdId]);
        dataStore.invalidate(keys.household(householdId));
      } catch {
        // the mirror catches up at the next pull; the account copy above already moved
      }
      await actions.refreshAccount();
      return r;
    },
    [householdId, api, actions],
  );
}

/** The same answer outside React — a link handler, a notification tap. */
export function currentTimeZone(): string {
  return effectiveZone(zones.getState());
}
