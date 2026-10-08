/**
 * The preferences store on the device, over AsyncStorage under a `prefs:` prefix so
 * `clearForSignOut` only ever sees preference keys. Anything else in AsyncStorage (the
 * encrypted Supabase session, the quarantine, the mock's server state) has its own owner.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueStore } from './index';

const PREFIX = 'prefs:';

export const prefsStore: KeyValueStore = {
  keys: async () =>
    (await AsyncStorage.getAllKeys())
      .filter(k => k.startsWith(PREFIX))
      .map(k => k.slice(PREFIX.length)),
  get: k => AsyncStorage.getItem(PREFIX + k),
  set: (k, v) => AsyncStorage.setItem(PREFIX + k, v),
  remove: k => AsyncStorage.removeItem(PREFIX + k),
};

/** The mock provider's "server": it must outlive a sign-out, so it is not a preference. */
export const mockStateStore: KeyValueStore = {
  keys: async () =>
    (await AsyncStorage.getAllKeys()).filter(k => k.startsWith('mock:')).map(k => k.slice(5)),
  get: k => AsyncStorage.getItem('mock:' + k),
  set: (k, v) => AsyncStorage.setItem('mock:' + k, v),
  remove: k => AsyncStorage.removeItem('mock:' + k),
};
