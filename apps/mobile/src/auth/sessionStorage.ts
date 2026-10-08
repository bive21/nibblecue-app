/**
 * WHERE SUPABASE-JS KEEPS ITS SIGN-IN STATE ON THE PHONE, ONE SLOT PER KEY (2026-09-24).
 *
 * supabase-js keeps more than the session. Between asking Auth to email a link — the sign-up
 * confirmation, a password reset, a magic link — and that link being opened, it keeps the PKCE
 * code verifier the link's `?code=` can only be exchanged with, under keys of its own: auth-js
 * 2.116 writes `<storageKey>-flow-<id>-code-verifier`, an index of those flows under
 * `<storageKey>-flows-code-verifier`, and the latest verifier again under
 * `<storageKey>-code-verifier`.
 *
 * The adapter before this one had ONE slot and ignored the key, so the verifier landed where the
 * session lives. The next thing that looked for a session — the client starting (a link opened
 * from a cold start does exactly that), `getSession()`, the refresh tick — found something that
 * was not a session, called it invalid and removed it: the verifier was gone before the link was
 * ever opened. A confirmation link then confirmed the address and signed nobody in; a
 * password-reset link could not open the new-password screen at all, which leaves a parent who
 * forgot their password with no way back in. Nothing in Expo Go showed it: the mock has no PKCE.
 *
 * So the session keeps the slot it always had (a session stored by the old adapter is read as
 * before), and every key auth-js ends in `code-verifier` gets an encrypted slot of its own.
 * `removeItem(name)` — auth-js's sign-out and its "invalid session" path — removes that one slot;
 * `removeItem()` with no name is the sign-out teardown (docs/ACCOUNTS.md §4 step 9) and removes
 * every slot and the key that encrypts them.
 *
 * Pure, with the keystore, the file store and the cipher handed in, so the node suite can drive
 * it under a real supabase-js client (`sessionStorage.test.ts`); `keychain.ts` wires the device.
 */

/** The device keystore: the iOS Keychain / Android EncryptedSharedPreferences. Small values. */
export interface SecureKv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** AsyncStorage's shape, as much of it as this uses. */
export interface LocalKv {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

export interface Cipher {
  newKey(): string;
  encrypt(keyHex: string, plain: string): string;
  decrypt(keyHex: string, cipherText: string): string;
}

/** The session's slot — the one the one-slot adapter used, so a stored session survives. */
export const SESSION_SLOT = 'cc.supabase.session';
/** Every other key supabase-js keeps: `cc.supabase.flow:<its own key>`. */
export const FLOW_SLOT_PREFIX = 'cc.supabase.flow:';

/** Where one of supabase-js's keys is kept. No name is the session: `restoreSession()` asks so. */
export function slotFor(name?: string): string {
  return name !== undefined && name.endsWith('code-verifier')
    ? FLOW_SLOT_PREFIX + name
    : SESSION_SLOT;
}

/** The storage adapter supabase-js persists through (its `auth.storage`). */
export interface SessionStorage {
  getItem(name?: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  removeItem(name?: string): Promise<void>;
}

export function keyedSessionStorage(deps: {
  secure: SecureKv;
  local: LocalKv;
  cipher: Cipher;
  /** The keystore entry holding the AES key every slot is encrypted with. */
  keyName: string;
}): SessionStorage {
  const { secure, local, cipher, keyName } = deps;
  return {
    async getItem(name) {
      const [key, body] = await Promise.all([secure.get(keyName), local.getItem(slotFor(name))]);
      if (!key || !body) return null;
      try {
        return cipher.decrypt(key, body);
      } catch {
        return null;
      }
    },
    async setItem(name, value) {
      let key = await secure.get(keyName);
      if (!key) {
        key = cipher.newKey();
        await secure.set(keyName, key);
      }
      await local.setItem(slotFor(name), cipher.encrypt(key, value));
    },
    async removeItem(name) {
      if (name !== undefined) {
        // one of supabase-js's own removals: that slot only. The key stays, because a pending
        // link's verifier may still need it after the session is gone.
        await local.removeItem(slotFor(name));
        return;
      }
      const flows = (await local.getAllKeys()).filter(k => k.startsWith(FLOW_SLOT_PREFIX));
      await local.multiRemove([SESSION_SLOT, ...flows]);
      await secure.delete(keyName);
    },
  };
}
