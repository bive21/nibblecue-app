/**
 * Key-value preferences, and the one rule sign-out imposes on them (docs/ACCOUNTS.md §4 step
 * 10): device-level, non-PII keys survive — theme, locale, clock format, "seen" flags — and
 * everything that belongs to a person or a household is cleared: the last child, the last
 * household, remembered amounts, favorites, report caches, an onboarding draft. A household
 * leaving the phone while its person stays signed in clears less (`clearForHouseholdEnd`).
 */

export interface KeyValueStore {
  keys(): Promise<string[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Exactly the keys that outlive a sign-out. Add to this list only for device-level, non-PII state. */
export const DEVICE_LEVEL_KEYS: ReadonlySet<string> = new Set([
  'appearance', // theme, scheme, skin, tab labels, quick shape — one key (appearance/prefs.ts)
  'theme',
  'scheme',
  'skin',
  'locale',
  'clock_24h',
  // `volume_unit` was here from the first accounts layer, and no build ever wrote it: the milk
  // unit came from the profile row and is the household's now (`household_settings.volume_unit`,
  // migration 0128), mirrored in the local database rather than kept on the phone (2026-09-27)
  'onboarding_seen',
  'whats_new_seen',
  // a sign-out that could not delete this phone's push token: the next launch deletes it before
  // anything asks for a new one (notifications/pushSeat.ts). A flag, nobody's data
  'push_token_stale',
  // vibration on or off (feedback/setting.ts `HAPTICS_KEY`; the owner, 2026-09-25): how this
  // phone feels in the hand, like the theme — so the next person to sign in here keeps it
  'haptics',
]);

export const survivesSignOut = (key: string): boolean => DEVICE_LEVEL_KEYS.has(key);

/**
 * `keep` is for the one sign-out that must not forget where the person was: the forced sign-out a
 * refused pull falls back to when the account could not be read (`auth/mirror.ts`), which keeps
 * `last_household:<uid>` so signing in again opens on Ended rather than on setup. Every other exit
 * passes nothing, and a key kept this way is swept by the next sign-out that does not keep it.
 */
export async function clearForSignOut(
  store: KeyValueStore,
  keep: readonly string[] = [],
): Promise<string[]> {
  const removed: string[] = [];
  for (const key of await store.keys()) {
    if (survivesSignOut(key) || keep.includes(key)) continue;
    await store.remove(key);
    removed.push(key);
  }
  return removed;
}

/**
 * THE ACCOUNT'S OWN KEYS: what a household leaving this phone does not take with it (docs/ACCOUNTS.md
 * §4, the `household` teardown; §7.3). The person is still signed in, so what belongs to them
 * rather than to the household they were in stays — and everything else goes, exactly as a
 * sign-out would sweep it, because a key nobody has classified is a key that might name the
 * household: a hidden care item, a stash place, a child, a tour entry to take back.
 *
 * Each is owned elsewhere, and `index.test.ts` holds every one to its owner's own spelling:
 *
 *   account_state          auth/AuthContext.tsx `ACCOUNT_CACHE` — rewritten with the fresh read the
 *                          moment the teardown is done; kept so a teardown that is interrupted
 *                          before then relaunches on the household, finds it gone and runs again
 *   last_household:<uid>   auth/AuthContext.tsx `LAST_HOUSEHOLD` — what `ended` is decided from
 *                          and what names the household on it (`core/accounts/standing.ts`)
 *   left_household:<uid>   auth/leave.ts `leftHouseholdKey` — a household this person closed as its
 *                          last member (0143): Ended's "Bring back" until its purge date. Written just
 *                          before that household leaves the phone, so it must outlive the teardown
 *   held_invite            auth/held-invite.ts — the way into the next household
 *   pending_terms:<email>  auth/pending-terms.ts — an acceptance still owed to the server
 *   community.v1           community/local.ts — their own posts; ACCOUNTS.md §7: somebody removed
 *                          keeps their community content
 *   community.seen         community/seen.ts — which discussions and requests this phone has
 *                          looked at, for the unread and Updated dots (2026-09-29); the account's
 *                          reading, not the household's
 *   active_household:<uid> auth/AuthContext.tsx `ACTIVE_HOUSEHOLD` — the family on screen, for an
 *                          account in several (0153). A family leaving takes the others' choice
 *                          with it otherwise; one that names the family gone reads as the first
 *   waiting_member_picture:<uid>
 *                          household/pictureWaiting.ts — the person's own new picture, kept until
 *                          the server has it (0148, 2026-09-30); their face, not the household's
 */
export const ACCOUNT_LEVEL_KEYS: ReadonlySet<string> = new Set([
  'account_state',
  'held_invite',
  'community.v1',
  'community.seen',
]);

const LAST_HOUSEHOLD_PREFIX = 'last_household:';
const LEFT_HOUSEHOLD_PREFIX = 'left_household:';
const PENDING_TERMS_PREFIX = 'pending_terms:';
const WAITING_PICTURE_PREFIX = 'waiting_member_picture:';
const ACTIVE_HOUSEHOLD_PREFIX = 'active_household:';

export const survivesHouseholdEnd = (key: string, userId: string): boolean =>
  survivesSignOut(key) ||
  ACCOUNT_LEVEL_KEYS.has(key) ||
  key === `${LAST_HOUSEHOLD_PREFIX}${userId}` ||
  key === `${LEFT_HOUSEHOLD_PREFIX}${userId}` ||
  key === `${WAITING_PICTURE_PREFIX}${userId}` ||
  key === `${ACTIVE_HOUSEHOLD_PREFIX}${userId}` ||
  key.startsWith(PENDING_TERMS_PREFIX);

export async function clearForHouseholdEnd(
  store: KeyValueStore,
  userId: string,
): Promise<string[]> {
  const removed: string[] = [];
  for (const key of await store.keys()) {
    if (survivesHouseholdEnd(key, userId)) continue;
    await store.remove(key);
    removed.push(key);
  }
  return removed;
}

/** An in-memory store: the mock provider, tests, and the first render before storage opens. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const m = new Map(Object.entries(initial));
  return {
    keys: async () => [...m.keys()],
    get: async k => m.get(k) ?? null,
    set: async (k, v) => {
      m.set(k, v);
    },
    remove: async k => {
      m.delete(k);
    },
  };
}
