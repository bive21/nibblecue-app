/**
 * WHICH CLOCK THIS PHONE READS — the state behind `useTimeZone` (the owner, 2026-09-23: "use the
 * phone's time zone while traveling"). The rule is `phoneZone` in core (`today/travel.ts`): the
 * phone's own zone, unless it is away and was told to keep home time for this trip.
 *
 * ONE STORE FOR THE WHOLE APP, not a hook per screen. Twenty-odd screens read the zone; each used to
 * query the household's row on mount, and each would have had to notice a flight on its own. Here
 * the phone's zone is read once per foreground, the household's once per change to its row, and
 * every screen re-renders only when the answer actually changes.
 *
 * WHAT IS KEPT ON THE PHONE, in `ui_prefs` (local, never synced):
 *   * `zone_record` — where this phone has been, so the nap outlook can read each sleep on the
 *     clock it happened on. A family's zones over two weeks are a travel history; nothing about
 *     reading a clock needs a server to know it.
 *   * `zone_keep_home_in` — the zone in which this phone was told to keep home time. The choice is
 *     for that trip: it lapses by itself at home or anywhere else.
 *   * `zone_notice_seen_in` — the zone whose "times follow this phone" card was dismissed, so the
 *     card shows once per trip and not every morning of it.
 *
 * Pure: no React Native here, so the rules are tested in node (`zoneStore.test.ts`). `useZone.ts`
 * is the thin wire to AppState, the phone's settings and the local database.
 */
import { isAway, noteZone, phoneZone, type ZoneSpan } from '@nibblecue/core';

export const ZONE_KEYS = {
  record: 'zone_record',
  keepHomeIn: 'zone_keep_home_in',
  seenIn: 'zone_notice_seen_in',
} as const;

export interface ZoneState {
  /** The zone the phone's own settings are in, as last read. */
  device: string;
  /** `households.home_time_zone` as the local mirror holds it; null until read, or with no row. */
  home: string | null;
  /**
   * The same column as the signed-in account carries it (`Membership.home_time_zone`) — read from
   * the server at every account refresh, so it is there in mock mode, where nothing pulls the
   * households row, and fresh the moment the owner moves home. It wins over the mirror's copy.
   */
  accountHome: string | null;
  keepHomeIn: string | null;
  record: readonly ZoneSpan[];
  seenIn: string | null;
  /** The household the home zone was read for. */
  householdId: string | null;
  /**
   * What the phone kept has been read. Until then nothing is noted or saved: a foreground that
   * arrives before the read must not write a one-entry record over the real one.
   */
  loaded: boolean;
}

/** What a screen needs to know, worked out once. */
export interface ZoneView {
  /** The zone every time on this phone is read in. */
  zone: string;
  home: string | null;
  device: string;
  /** The phone's clock reads differently from home's. */
  away: boolean;
  /** Away, and keeping home time on purpose. */
  keepingHome: boolean;
  record: readonly ZoneSpan[];
  /** Away, following the phone, and the card for this trip not yet dismissed. */
  showNotice: boolean;
}

/** The household's home zone: the account's copy, else the mirror's. */
const homeOf = (s: ZoneState): string | null => s.accountHome ?? s.home;

export const effectiveZone = (s: ZoneState): string =>
  phoneZone({ device: s.device, home: homeOf(s), keepHomeIn: s.keepHomeIn });

export function viewOf(s: ZoneState, nowMs: number): ZoneView {
  const zone = effectiveZone(s);
  const home = homeOf(s);
  const away = isAway(s.device, home, nowMs);
  const keepingHome = away && zone !== s.device;
  return {
    zone,
    home,
    device: s.device,
    away,
    keepingHome,
    record: s.record,
    showNotice: away && !keepingHome && s.seenIn !== s.device,
  };
}

/** What `loadFor` reads from the phone for a household. */
export interface ZoneStored {
  home: string | null;
  keepHomeIn: string | null;
  record: readonly ZoneSpan[];
  seenIn: string | null;
}

export interface ZoneDeps {
  /** The phone's zone right now. */
  readDevice(): string;
  now(): number;
  load(householdId: string): Promise<ZoneStored>;
  /** Writes one `ui_prefs` key; null removes it. */
  persist(key: string, value: string | null): Promise<void>;
}

export interface ZoneStore {
  getState(): ZoneState;
  subscribe(listener: () => void): () => void;
  /** Reads the household's home zone and what the phone kept. Again for the same household is a refresh. */
  loadFor(householdId: string | null): Promise<void>;
  /** Re-reads the phone's zone: after the app comes back to the foreground. */
  refreshDevice(): void;
  /** Keep home time on this phone for this trip, or follow the phone again. */
  setKeepHome(keep: boolean): void;
  /** The card is dismissed for the zone the phone is in. */
  dismissNotice(): void;
  /** The home zone the signed-in account carries (`Membership.home_time_zone`), on every refresh. */
  setAccountHome(zone: string | null): void;
}

export function createZoneStore(deps: ZoneDeps): ZoneStore {
  let state: ZoneState = {
    device: deps.readDevice(),
    home: null,
    accountHome: null,
    keepHomeIn: null,
    record: [],
    seenIn: null,
    householdId: null,
    loaded: false,
  };
  const listeners = new Set<() => void>();
  const persist = (key: string, value: string | null): void => {
    // a preference that did not save is a card that shows again, never a lost entry
    void deps.persist(key, value).catch(() => undefined);
  };

  /**
   * Every change goes through here, so the record is noted in one place: whenever the zone the
   * phone reads in moves, from that moment on.
   */
  const set = (next: ZoneState): void => {
    let settled = next;
    if (next.loaded) {
      const noted = noteZone(next.record, effectiveZone(next), deps.now());
      if (noted !== next.record) {
        settled = { ...next, record: noted };
        persist(ZONE_KEYS.record, JSON.stringify(noted));
      }
    }
    const changed =
      settled.device !== state.device ||
      settled.home !== state.home ||
      settled.accountHome !== state.accountHome ||
      settled.keepHomeIn !== state.keepHomeIn ||
      settled.record !== state.record ||
      settled.seenIn !== state.seenIn ||
      settled.householdId !== state.householdId ||
      settled.loaded !== state.loaded;
    state = settled;
    if (changed) for (const l of listeners) l();
  };

  /**
   * A TRIP'S CHOICES END WITH THE TRIP. Keeping home time, and the card having been seen, belong to
   * the zone they were made in; once the phone is anywhere else — home, or the next trip — both are
   * forgotten, so a work trip to Paris does not keep home time on next summer's family trip there.
   * Checked on every move and on the first read, which covers a phone that moved while closed.
   */
  const lapse = (next: ZoneState): ZoneState => {
    const keep = next.keepHomeIn !== null && next.keepHomeIn !== next.device;
    const seen = next.seenIn !== null && next.seenIn !== next.device;
    if (keep) persist(ZONE_KEYS.keepHomeIn, null);
    if (seen) persist(ZONE_KEYS.seenIn, null);
    return keep || seen
      ? { ...next, keepHomeIn: keep ? null : next.keepHomeIn, seenIn: seen ? null : next.seenIn }
      : next;
  };

  return {
    getState: () => state,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    loadFor: async householdId => {
      if (householdId === null) return;
      let stored: ZoneStored;
      try {
        stored = await deps.load(householdId);
      } catch {
        // unread is not empty: nothing is noted or saved until a read succeeds
        return;
      }
      if (state.loaded && state.householdId === householdId) {
        // a refresh: only the household's row can have moved; what the phone keeps is already here,
        // and a read that raced a choice being saved must not undo the choice
        if (stored.home !== state.home) set({ ...state, home: stored.home });
        return;
      }
      set(
        lapse({
          ...state,
          householdId,
          loaded: true,
          home: stored.home,
          keepHomeIn: stored.keepHomeIn,
          seenIn: stored.seenIn,
          record: stored.record,
        }),
      );
    },
    refreshDevice: () => {
      const device = deps.readDevice();
      if (device === state.device) return;
      set(lapse({ ...state, device }));
    },
    setKeepHome: keep => {
      const keepHomeIn = keep ? state.device : null;
      if (keepHomeIn === state.keepHomeIn) return;
      persist(ZONE_KEYS.keepHomeIn, keepHomeIn);
      set({ ...state, keepHomeIn });
    },
    dismissNotice: () => {
      if (state.seenIn === state.device) return;
      persist(ZONE_KEYS.seenIn, state.device);
      set({ ...state, seenIn: state.device });
    },
    setAccountHome: zone => {
      if (zone !== state.accountHome) set({ ...state, accountHome: zone });
    },
  };
}
