/**
 * expo-secure-store for the boot smoke test: the keystore as an in-memory map (its web build has no
 * store at all). Only what `src/auth/keychain.ts` calls. `resetSecureStore` empties it between
 * tests.
 */
const items = new Map<string, string>();

export type SecureStoreOptions = { keychainAccessible?: number };
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const WHEN_UNLOCKED = 2;

export const getItemAsync = (key: string): Promise<string | null> =>
  Promise.resolve(items.get(key) ?? null);
export const setItemAsync = (key: string, value: string): Promise<void> => {
  items.set(key, value);
  return Promise.resolve();
};
export const deleteItemAsync = (key: string): Promise<void> => {
  items.delete(key);
  return Promise.resolve();
};
export const isAvailableAsync = (): Promise<boolean> => Promise.resolve(true);
export const resetSecureStore = (): void => items.clear();
