/**
 * The device keystore (docs/ACCOUNTS.md §4 step 9, §6.1): the iOS Keychain with
 * `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, EncryptedSharedPreferences on Android —
 * expo-secure-store is the one adapter. Three things live here and nothing else: the session,
 * the `teardown_in_progress` flag, and the key that encrypts anything too large for the
 * keystore itself (a Supabase session, the quarantine body). Values above 2 KB are not
 * stored in the keystore: the AES key is, the ciphertext goes to AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aes from 'aes-js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { Session } from './session';
import type { SessionStore } from './providers/types';
import { keyedSessionStorage } from './sessionStorage';
import { parseTeardownMark, serializeTeardownMark, type TeardownMark } from './teardown';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const KEYS = {
  mockSession: 'cc.session.mock',
  teardownFlag: 'cc.teardown_in_progress',
  supabaseKey: 'cc.supabase.session.key',
  quarantineKey: 'cc.quarantine.key',
} as const;

const secure = {
  get: (key: string) => SecureStore.getItemAsync(key, OPTIONS),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value, OPTIONS),
  delete: (key: string) => SecureStore.deleteItemAsync(key, OPTIONS),
};

/* ---- AES-256-CTR with a random key per value; the key never leaves the keystore ---- */
const toHex = (bytes: Uint8Array) => aes.utils.hex.fromBytes(bytes);
export const cipher = {
  newKey: (): string => toHex(getRandomBytes(32)),
  encrypt(keyHex: string, plain: string): string {
    const key = aes.utils.hex.toBytes(keyHex);
    const iv = getRandomBytes(16);
    const ctr = new aes.ModeOfOperation.ctr(key, new aes.Counter(iv));
    return `${toHex(iv)}:${toHex(ctr.encrypt(aes.utils.utf8.toBytes(plain)))}`;
  },
  decrypt(keyHex: string, cipherText: string): string {
    const [ivHex, bodyHex] = cipherText.split(':');
    if (!ivHex || !bodyHex) throw new Error('malformed ciphertext');
    const key = aes.utils.hex.toBytes(keyHex);
    const ctr = new aes.ModeOfOperation.ctr(key, new aes.Counter(aes.utils.hex.toBytes(ivHex)));
    return aes.utils.utf8.fromBytes(ctr.decrypt(aes.utils.hex.toBytes(bodyHex)));
  },
};

/**
 * The storage adapter supabase-js persists through: the session, and the PKCE verifier an emailed
 * link is exchanged with, each in a slot of its own (`sessionStorage.ts` says why it must be so).
 */
export const supabaseSessionStorage = keyedSessionStorage({
  secure,
  local: AsyncStorage,
  cipher,
  keyName: KEYS.supabaseKey,
});

/** The mock provider's session: small enough for the keystore itself. */
export const mockSessionStore: SessionStore = {
  async load(): Promise<Session | null> {
    const raw = await secure.get(KEYS.mockSession);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  },
  save: s => secure.set(KEYS.mockSession, JSON.stringify(s)),
  clear: () => secure.delete(KEYS.mockSession),
};

/** Teardown step 9: every session-shaped thing in the keystore, whichever provider wrote it. */
export async function clearSessionsFromKeychain(): Promise<void> {
  await Promise.all([mockSessionStore.clear(), supabaseSessionStorage.removeItem()]);
}

/**
 * `teardown_in_progress`, holding the mark of the sign-out under way — who it is signing out and
 * what step 10 keeps (`teardown.ts` `TeardownMark`) — so a run a killed app left is finished at
 * the next launch as that person. A few hundred bytes: well inside what the keystore holds.
 */
export const teardownFlag = {
  get: async (): Promise<TeardownMark | null> =>
    parseTeardownMark(await secure.get(KEYS.teardownFlag)),
  set: (mark: TeardownMark | null): Promise<void> =>
    mark === null
      ? secure.delete(KEYS.teardownFlag)
      : secure.set(KEYS.teardownFlag, serializeTeardownMark(mark)),
};

/**
 * Every key this app has ever put in the device keystore, for the dev-only "start fresh"
 * (`dev/reset.ts`). A list rather than a loop because SecureStore cannot enumerate its own
 * keys — so it has to be kept beside `KEYS`, which is why it lives here and not there.
 */
export async function clearKeystoreForReset(): Promise<void> {
  // the Supabase slots first: removing them needs nothing, but they are useless without the key
  await supabaseSessionStorage.removeItem();
  await Promise.all(Object.values(KEYS).map(k => secure.delete(k)));
}

export const quarantineKeychain = {
  get: () => secure.get(KEYS.quarantineKey),
  set: (k: string) => secure.set(KEYS.quarantineKey, k),
  clear: () => secure.delete(KEYS.quarantineKey),
};
