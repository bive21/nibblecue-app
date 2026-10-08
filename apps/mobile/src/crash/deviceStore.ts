/**
 * The crash queue's store on the device: AsyncStorage, under the key `store.ts` names. Its own
 * owner, outside `prefs:`, so neither a sign-out nor a family switch sweeps it (`store.ts` says why).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueStore } from '../prefs';

export const crashStore: KeyValueStore = {
  keys: async () => (await AsyncStorage.getAllKeys()).filter(k => k.startsWith('crash:')),
  get: k => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
  remove: k => AsyncStorage.removeItem(k),
};
