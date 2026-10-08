/**
 * Where a write's ids come from.
 *
 * Every row and every operation is identified on the device (CLAUDE.md rule 7): the id is
 * minted before the transaction opens, so the row has a stable identity with no network, the
 * timeline can link to it, a detail row can reference it, and a retry cannot create a second
 * identity. `deriveOpId` in `packages/core` then derives every other op of the same intent
 * from that one id, which is why exactly one random value is drawn per intent.
 *
 * This file deliberately imports nothing from expo. `expo-crypto` cannot load in a node test,
 * and the repository, the chain builders and the drain are all tested in node — so the source
 * is the platform's own Web Crypto, which is `globalThis.crypto` in node 24 and, on the
 * device, the `react-native-get-random-values` polyfill that `index.ts` loads before anything
 * else. `setIdSource` is the seam a test uses to make ids deterministic; nothing in the app
 * calls it.
 *
 * `deviceId()` is a stable per-install id kept in `ui_prefs`, not a per-launch one: it travels
 * on every activity as `device_id`, so "which phone wrote this" survives a relaunch. It is not
 * an advertising id, it is never sent to a third party, and it goes with the database file
 * when the account is torn down (docs/ACCOUNTS.md §4 step 8).
 */
import type { Db, Tx } from '../db/driver';

export type Mint = () => string;

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** RFC 4122 v4 from the platform CSPRNG, for a runtime whose crypto has no `randomUUID`. */
function uuidFromRandomBytes(getRandomValues: (a: Uint8Array) => Uint8Array): string {
  const b = getRandomValues(new Uint8Array(16));
  // version 4 and the RFC 4122 variant, exactly as randomUUID would set them
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = (i: number) => HEX[b[i] ?? 0] ?? '00';
  return (
    `${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-${h(8)}${h(9)}-` +
    `${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}`
  );
}

interface WebCrypto {
  randomUUID?: () => string;
  getRandomValues?: (a: Uint8Array) => Uint8Array;
}

function platformMint(): string {
  const c = (globalThis as { crypto?: WebCrypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) return uuidFromRandomBytes(c.getRandomValues.bind(c));
  throw new Error('no uuid source on this platform; call setIdSource() at startup');
}

let mint: Mint = platformMint;

/**
 * A random v4 id straight from the platform, never from `setIdSource`: for the in-app test
 * backend (`auth/providers/mock.ts`), whose accounts outlive a launch and must not take ids
 * from the sequence a test pins for the rows it writes.
 */
export function randomUuid(): string {
  return platformMint();
}

/** Replace the id source. The tests' one use; the app never calls it. */
export function setIdSource(fn: Mint | null): void {
  mint = fn ?? platformMint;
}

/** One per user intent. Every other op of the same write derives from it (D7). */
export function newIntentId(): string {
  return mint();
}

/** A row's own primary key, minted on the device for the same reason. */
export function newEntityId(): string {
  return mint();
}

const DEVICE_ID_KEY = 'device_id';

/**
 * ONE INSTALL, ONE ID, WHATEVER FAMILY IS ON SCREEN (the switcher, 0153). Each family has its own
 * database file, and the id lives in a file's `ui_prefs`; a second family's new file would mint a
 * second id, and the server would count this phone twice (its `devices` row, its push token, its
 * claims). So the id is also kept OUTSIDE the files — the app's `db/index.ts` wires AsyncStorage
 * here — and a file with no id takes that one before minting. A file that already has an id keeps
 * it, and the first one seen becomes the shared one.
 */
export interface InstallIdStore {
  get(): Promise<string | null>;
  set(id: string): Promise<void>;
}
let memoryInstallId: string | null = null;
let installStore: InstallIdStore = {
  get: () => Promise.resolve(memoryInstallId),
  set: id => {
    memoryInstallId = id;
    return Promise.resolve();
  },
};
/** Where the shared id is kept: the app's AsyncStorage, or memory in a test. */
export function setInstallIdStore(store: InstallIdStore | null): void {
  memoryInstallId = null;
  installStore = store ?? {
    get: () => Promise.resolve(memoryInstallId),
    set: id => {
      memoryInstallId = id;
      return Promise.resolve();
    },
  };
}

const sharedInstallId = (): Promise<string | null> => installStore.get().catch(() => null);
async function shareInstallId(id: string): Promise<void> {
  if ((await sharedInstallId()) === null) await installStore.set(id).catch(() => undefined);
}

/** Read the install's device id, minting and storing it the first time. */
export async function deviceId(db: Db): Promise<string> {
  const existing = await readDeviceId(db);
  if (existing !== null) {
    await shareInstallId(existing);
    return existing;
  }
  const shared = await sharedInstallId();
  if (shared !== null) {
    await db.run('insert or ignore into ui_prefs (key, value) values (?, ?)', [
      DEVICE_ID_KEY,
      shared,
    ]);
    return (await readDeviceId(db)) ?? shared;
  }
  // The insert is `or ignore`, so two callers racing on a cold start keep one id rather than
  // the second overwriting the first — an activity written between them would then name a
  // device that no longer exists.
  const minted = mint();
  await db.run('insert or ignore into ui_prefs (key, value) values (?, ?)', [
    DEVICE_ID_KEY,
    minted,
  ]);
  const id = (await readDeviceId(db)) ?? minted;
  await shareInstallId(id);
  return id;
}

async function readDeviceId(t: Pick<Tx, 'get'>): Promise<string | null> {
  const row = await t.get<{ value: string }>('select value from ui_prefs where key = ?', [
    DEVICE_ID_KEY,
  ]);
  return row?.value ?? null;
}
