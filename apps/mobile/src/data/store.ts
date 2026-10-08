/**
 * The reactive read seam: what changed, so a screen knows to read again.
 *
 * WP4 ships no query library (D10). TanStack Query is not a dependency, there are no hooks
 * holding keys yet, and fixing a cache shape before its screens exist is the expensive order.
 * What the repository does owe the UI is a notification: a write commits, and whatever is
 * rendering the timeline has to read the mirror again. That is this file — a `Map` of key to
 * subscribers, and one `invalidate` the repository calls after every commit.
 *
 * The keys are the strings of `docs/ARCHITECTURE.md` §4's factory, flattened with `/` so a
 * `Map` can hold them. Keeping the factory means WP5 can put the library on this seam without
 * renaming anything: `keys.timeline(child, 'all')` is the same cache entry either way.
 *
 * A version counter rides alongside the subscriber set so a caller that was not mounted when
 * the write happened can still tell "the value I hold is stale" — `useSyncExternalStore`'s
 * `getSnapshot` needs a value, not an event.
 */
import type { ActivityType } from '@nibblecue/core';

/** The ARCHITECTURE §4 cache keys, as strings. */
export const keys = {
  household: (h: string) => `household/${h}`,
  modules: (h: string) => `modules/${h}`,
  children: (h: string) => `children/${h}`,
  timers: (h: string) => `timers/${h}`,
  lastOf: (c: string | null, t: ActivityType) => `last/${c ?? 'household'}/${t}`,
  todayTotals: (c: string | null) => `today/totals/${c ?? 'household'}`,
  timeline: (c: string | null, filter: ActivityType | 'all') =>
    `timeline/${c ?? 'household'}/${filter}`,
  nextEvent: (c: string | null) => `schedule/next/${c ?? 'household'}`,
  scheduleDay: (h: string, localDate: string) => `schedule/day/${h}/${localDate}`,
  /** WP7: the current phases' rules, the phase list, a viewer's preferences. */
  rules: (h: string) => `schedule/rules/${h}`,
  phases: (h: string) => `schedule/phases/${h}`,
  prefs: (h: string, u: string) => `notifications/prefs/${h}/${u}`,
  /** The household's waking window — the wake and bed pair a nap is decided against. */
  dayWindow: (h: string) => `schedule/day-window/${h}`,
  /** The household's milk unit (migration 0128): every amount on every screen is read in it. */
  volumeUnit: (h: string) => `settings/volume-unit/${h}`,
  /** Who's on (migration 0113): the household's shifts, which decide which phone rings. */
  duty: (h: string) => `schedule/duty/${h}`,
  stash: (h: string) => `stash/${h}`,
  /** WP6: the household's storage locations (docs/SCHEDULE_AND_LOCATIONS.md §3). */
  locations: (h: string) => `stash/locations/${h}`,
  /** WP5.5: the household's medicines, vitamins and creams (docs/CARE_ITEMS.md). */
  careItems: (h: string) => `care/${h}`,
  /** WP8: the household's immunisation records, tracking toggles and pinned profile. */
  vaccines: (h: string) => `vaccines/${h}`,
  /** WP6b, WP6c: the two lists the household shares — never per child, never in a report. */
  shopping: (h: string) => `shopping/${h}`,
  tasks: (h: string) => `tasks/${h}`,
  supplies: (h: string) => `supplies/${h}`,
  container: (id: string) => `stash/container/${id}`,
  reports: (c: string | null, range: number) => `reports/${c ?? 'household'}/${range}`,
  entitlement: (u: string) => `entitlement/${u}`,
  community: (topic: string) => `community/${topic}`,
  /** Not in §4: the outbox's own depth, which the sync chip and the inspector read. */
  outbox: () => 'outbox',
  /**
   * Not in §4 either: the first-run tour armed from outside it — a setup whose welcome never
   * showed (`onboarding/keepAnswers.ts` `payOwedTour`) — so `TourProvider` reads its flags again.
   */
  tour: (u: string) => `tour/${u}`,
} as const;

export interface Store {
  subscribe(key: string, listener: () => void): () => void;
  /**
   * Bump every key given, then call every listener under any of them EXACTLY ONCE — once per
   * listener, not once per key it is subscribed under (see the body).
   */
  invalidate(...invalidated: readonly string[]): void;
  /** The key's version; changes on every `invalidate` naming it. */
  version(key: string): number;
}

export function createStore(): Store {
  const listeners = new Map<string, Set<() => void>>();
  const versions = new Map<string, number>();

  return {
    subscribe(key, listener) {
      const set = listeners.get(key) ?? new Set<() => void>();
      listeners.set(key, set);
      set.add(listener);
      return () => {
        const live = listeners.get(key);
        if (!live) return;
        live.delete(listener);
        if (live.size === 0) listeners.delete(key);
      };
    },
    invalidate(...invalidated) {
      // de-duplicated first: the invalidation matrix names `todayTotals` from three different
      // rows of one write, and a listener that fires three times re-reads three times.
      const unique = new Set(invalidated);
      for (const key of unique) versions.set(key, (versions.get(key) ?? 0) + 1);
      /*
        AND ONE CALL PER LISTENER, NOT ONE PER KEY (2026-09-27). A read that depends on several
        keys is ONE listener under each of them (`subscribeKeys`), and one write names several at
        once — a bottle bumps its child's day totals, its child's timeline and the household. The
        keys alone were de-duplicated, so each of Today's three activity reads ran three times for
        one bottle and the schedule's day twice, each landing as a render of its own
        (`store.test.ts` counts them). A listener cannot tell which key woke it, so a second call
        in the same invalidation is never news.
      */
      const called = new Set<() => void>();
      for (const key of unique) {
        const set = listeners.get(key);
        if (!set) continue;
        // a copy, taken key by key: a listener that unsubscribes itself — or one under a later
        // key — while being notified is ordinary, and one taken off is not called
        for (const listener of [...set]) {
          if (called.has(listener)) continue;
          called.add(listener);
          listener();
        }
      }
    },
    version(key) {
      return versions.get(key) ?? 0;
    },
  };
}

/** The app's single store. Tests build their own with `createStore()`. */
export const store: Store = createStore();

/**
 * ONE LISTENER UNDER EVERY KEY OF A READ — how a read that depends on several keys subscribes
 * (`useLocalQuery`, the Log's first page). It is the same function under each key, and that is
 * what lets `invalidate` call it once for a write that names three of them; a fresh arrow per key
 * would be three listeners and three reads again. Returns the one unsubscribe.
 */
export function subscribeKeys(s: Store, watched: readonly string[], listener: () => void) {
  const offs = watched.map(k => s.subscribe(k, listener));
  return (): void => {
    for (const off of offs) off();
  };
}

/**
 * `docs/ARCHITECTURE.md` §4's invalidation matrix for one activity write, as data. `stash` and
 * the container are added by the stash draw; the timer keys by the timer write.
 */
export function activityKeys(
  householdId: string,
  childId: string | null,
  type: ActivityType,
): string[] {
  return [
    keys.lastOf(childId, type),
    keys.todayTotals(childId),
    keys.timeline(childId, 'all'),
    keys.timeline(childId, type),
    keys.nextEvent(childId),
    keys.reports(childId, 7),
    keys.household(householdId),
    keys.outbox(),
  ];
}
