/**
 * The local database on the device (docs/MOBILE.md §7): expo-sqlite in WAL mode, the schema
 * from ./schema, behind the `Db` interface from ./driver. Opening is lazy and shared; closing
 * and deleting is teardown step 8 — one file delete, never a `delete from` per table
 * (docs/ACCOUNTS.md §4).
 *
 * The latch is the other half of that step and lives in `./latch.ts`, which has no native
 * dependency and is therefore testable in node: `openLocalDb` memoizes a module-global handle,
 * so anything that opens the database *after* the file has been deleted silently recreates it —
 * a flush racing a teardown is exactly that code — and ACCOUNTS §4's "no file matching the
 * database name" quietly becomes false. Once `stopLocalDb()` is called nothing reopens until
 * `allowReopen()` on the next sign-in. Every latch name is re-exported here, so callers that
 * only know `../db` are unchanged.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { crumb } from '../app/boot';
import { setInstallIdStore } from '../data/ids';
import { BUSY_PRAGMA, createExpoDb, type Db, type ExpoDb } from './driver';
import { dbFileFor, isLocalDbName } from './files';
import {
  allowReopen,
  assertCanOpen,
  isClosedHandle,
  isTeardownFallout,
  isTeardownRefusal,
  localDbStopped,
  LocalDbStoppedError,
  rethrowUnlessTeardown,
  stopLocalDb,
} from './latch';
import {
  LOCAL_DB_NAME,
  LocalSchemaTooNewError,
  migrateLocalDb,
  type SqlRunner,
  type TableColumn,
} from './schema';

/** The `Db` the app uses, which a switch and a teardown close (`ExpoDb.close`). */
interface Opened {
  db: ExpoDb;
}

let handle: Promise<Opened> | null = null;

/*
  WHICH FAMILY'S FILE IS OPEN (the switcher, 0153; `./files.ts` has the naming rule). One file is
  open at a time — the family on screen's — and a switch closes it and points here at the next one.
  Nothing is deleted by a switch: the family left keeps its file, and its rows are on screen again
  the moment it is switched back to. The two keys live outside `prefs:` (like the quarantine's), so
  no preference sweep can forget which file is whose.
*/
const LEGACY_OWNER_KEY = 'db:legacy_household';
const KNOWN_FILES_KEY = 'db:files';
let fileName: string = LOCAL_DB_NAME;

// the install's id, shared by every family's file (`data/ids.ts` says why); a device-level key
// outside `prefs:`, so a family leaving never takes it
const INSTALL_ID_KEY = 'db:install_id';
setInstallIdStore({
  get: () => AsyncStorage.getItem(INSTALL_ID_KEY),
  set: id => AsyncStorage.setItem(INSTALL_ID_KEY, id),
});
let fileHousehold: string | null = null;

async function knownFiles(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KNOWN_FILES_KEY);
    const list = raw === null ? [] : (JSON.parse(raw) as unknown);
    return Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

async function rememberFile(name: string, known: boolean): Promise<void> {
  const list = await knownFiles();
  const next = known ? [...new Set([...list, name])] : list.filter(n => n !== name);
  try {
    await AsyncStorage.setItem(KNOWN_FILES_KEY, JSON.stringify(next));
  } catch {
    // a list that could not be written costs a sign-out one file it then finds by name anyway
  }
}

/** Close the open file, if any, and keep it: a switch, never a teardown. */
async function closeHandle(): Promise<void> {
  const opening = handle;
  handle = null;
  if (!opening) return;
  try {
    // the handle's own close: the pass in flight finishes first, and nothing new starts on it
    await (await opening).db.close();
  } catch {
    // a database that failed to open, or is already closed, has nothing to close
  }
}

/** The family whose file the database is pointed at, or null before one is known. */
export const localDbHousehold = (): string | null => fileHousehold;

/*
  ONE CHANGE OF FILE AT A TIME, AND NO OPEN IN THE MIDDLE OF ONE. A selection reads AsyncStorage
  before it decides, and the launch starts two of them that nobody orders (`openFamilyDb`, never
  awaited, and the cached account's): both passed the `fileHousehold` check across those awaits,
  and one could close the handle the other had just opened. So every selection, and both
  teardown closes, run one after another on `changing`; and `openLocalDb` waits for the change
  under way (`pending`), so it opens the file the change ends on, never the one it is leaving.
*/
let changing: Promise<unknown> = Promise.resolve();
let pending: Promise<unknown> | null = null;

function serially<T>(fn: () => Promise<T>): Promise<T> {
  const run = changing.then(fn, fn);
  const settled = run.catch(() => undefined);
  changing = settled;
  pending = settled;
  void settled.then(() => {
    if (pending === settled) pending = null;
  });
  return run;
}

/**
 * POINT THE DATABASE AT A FAMILY'S FILE. Called with the family on screen before anything reads
 * it (the account's adoption, and a switch). The first family ever opened here adopts the original
 * file; a different family closes the open file (its rows stay in it) and opens its own.
 */
export function selectLocalDbHousehold(householdId: string | null): Promise<void> {
  return serially(() => select(householdId));
}

async function select(householdId: string | null): Promise<void> {
  if (householdId === fileHousehold) return;
  const legacy = await AsyncStorage.getItem(LEGACY_OWNER_KEY).catch(() => null);
  const { name, adopts } = dbFileFor(householdId, legacy);
  if (adopts && householdId !== null) {
    await AsyncStorage.setItem(LEGACY_OWNER_KEY, householdId).catch(() => undefined);
  }
  fileHousehold = householdId;
  if (name === fileName) return;
  crumb('db: switching to another family’s file');
  // THE NAME MOVES IN THE SAME STEP AS THE HANDLE IS LET GO (`closeHandle` clears it before its
  // first await). It used to move after the close had finished, and anything that opened the
  // database while the close was under way opened the OLD file again, under a second `Db` with a
  // queue of its own — often on the very connection still being closed, since expo-sqlite's
  // native side shares one connection per path and counts references, so that close only dropped
  // a count. The old file then stayed the open one for the family switched to, and two queues
  // wrote to it: two writers that do not know about each other is "database is locked"
  // (`driver.ts`).
  fileName = name;
  await closeHandle();
  await rememberFile(name, true);
}

/** The latch is `./latch.ts` — pure, so the teardown race is tested against the shipped code. */
export {
  allowReopen,
  isClosedHandle,
  isTeardownFallout,
  isTeardownRefusal,
  localDbStopped,
  LocalDbStoppedError,
  rethrowUnlessTeardown,
  stopLocalDb,
};

const runner = (db: SQLiteDatabase): SqlRunner => ({
  exec: sql => db.execAsync(sql),
  userVersion: async () =>
    (await db.getFirstAsync<{ user_version: number }>('pragma user_version'))?.user_version ?? 0,
  setUserVersion: v => db.execAsync(`pragma user_version = ${v}`),
  tableInfo: t => db.getAllAsync<TableColumn>(`pragma table_info(${t})`),
});

async function open(): Promise<Opened> {
  crumb('db: opening');
  const name = fileName;
  const db = await openDatabaseAsync(name);
  // the wait FIRST: switching to WAL needs a moment's lock of its own, and a connection that
  // meets another's lock with no busy timeout set fails on the spot instead of waiting for it
  await db.execAsync(`${BUSY_PRAGMA}; pragma journal_mode = wal; pragma foreign_keys = on;`);
  crumb('db: open; migrating');
  try {
    await migrateLocalDb(runner(db));
    crumb('db: ready');
  } catch (err) {
    if (!(err instanceof LocalSchemaTooNewError)) throw err;
    // A downgrade, a TestFlight rollback or a shared device: the file was written by a build
    // that knows columns this one does not. There is no backward migration, and running this
    // build's statements over it would half-understand rows a newer schema owns. Start again
    // and pull the household down — the server is the record, not this file.
    console.warn(`${err.message}; recreating the local database`);
    await db.closeAsync();
    await deleteDatabaseAsync(name);
    const fresh = await openDatabaseAsync(name);
    await fresh.execAsync(`${BUSY_PRAGMA}; pragma journal_mode = wal; pragma foreign_keys = on;`);
    await migrateLocalDb(runner(fresh));
    return { db: createExpoDb(fresh) };
  }
  return { db: createExpoDb(db) };
}

export function openLocalDb(): Promise<Db> {
  try {
    assertCanOpen();
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new LocalDbStoppedError());
  }
  // a change of file under way decides which file this is: wait for it, then ask again
  if (pending !== null) return pending.then(() => openLocalDb());
  if (!handle) {
    handle = open().catch(err => {
      handle = null;
      throw err;
    });
  }
  return handle.then(h => h.db);
}

/** Best-effort removal of a sibling file expo-sqlite may leave behind (-wal, -shm). */
async function removeSibling(name: string, suffix: string): Promise<void> {
  try {
    const f = new File(new Directory(Paths.document, 'SQLite'), `${name}${suffix}`);
    if (f.exists) f.delete();
  } catch {
    // the file was never there, or the directory is not where this platform keeps it
  }
}

async function deleteFile(name: string): Promise<void> {
  try {
    await deleteDatabaseAsync(name);
  } catch {
    // already gone: deleting a missing file is a success for teardown
  }
  await removeSibling(name, '-wal');
  await removeSibling(name, '-shm');
}

/**
 * THE FAMILY ON SCREEN LEAVES THE PHONE (teardown step 8, scope `household`): its file, and only
 * its file. Another family's file stays for that family.
 */
export function closeAndDeleteLocalDb(): Promise<void> {
  // Deleting the file and leaving the latch open is the silent failure this exists to stop:
  // whatever deleted it is tearing an account down, and the next opener would recreate it.
  stopLocalDb();
  return serially(deleteOnScreen);
}

async function deleteOnScreen(): Promise<void> {
  await closeHandle();
  const name = fileName;
  await deleteFile(name);
  await rememberFile(name, false);
  if (name === LOCAL_DB_NAME)
    await AsyncStorage.removeItem(LEGACY_OWNER_KEY).catch(() => undefined);
  // nobody's file until the next family is selected (the account's adoption does it)
  fileName = LOCAL_DB_NAME;
  fileHousehold = null;
}

/**
 * EVERY FAMILY LEAVES THE PHONE (teardown step 8 of a sign-out or a deletion): every file this app
 * has made, found by the list and by name. A family not on screen holds nothing unsent — a switch
 * waits for the queue (`household/switch.ts`) — so nothing here can be the last copy of a log.
 */
export function closeAndDeleteEveryLocalDb(): Promise<void> {
  stopLocalDb();
  return serially(deleteEvery);
}

async function deleteEvery(): Promise<void> {
  await closeHandle();
  const names = new Set([LOCAL_DB_NAME, fileName, ...(await knownFiles())]);
  try {
    for (const f of new Directory(Paths.document, 'SQLite').list()) {
      if (f instanceof File && isLocalDbName(f.name)) names.add(f.name);
    }
  } catch {
    // no directory to list: the names above are every file there is
  }
  for (const name of names) await deleteFile(name);
  /*
    AND THE INSTALL'S ID GOES WITH THEM. It is kept outside the files so that a SWITCH between
    families keeps one id (`data/ids.ts`), but a sign-out is not a switch: the server's
    `register_device` and `claim_local_reminders` refuse an id another person's account owns
    (migration 0121), so the next account to sign in here, handed the last one's id, would never
    register this phone for push, and would not be told. Before 0153 the id lived only in the file,
    and went with it here; it still goes here, and only here — a family leaving (above) keeps it.
  */
  await AsyncStorage.multiRemove([KNOWN_FILES_KEY, LEGACY_OWNER_KEY, INSTALL_ID_KEY]).catch(
    () => undefined,
  );
  fileName = LOCAL_DB_NAME;
  fileHousehold = null;
}

/** Whether a database file exists: the acceptance assertion after teardown. */
export function localDbFileExists(): boolean {
  try {
    return new File(new Directory(Paths.document, 'SQLite'), fileName).exists;
  } catch {
    return false;
  }
}
