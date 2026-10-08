/**
 * THE PICTURE FROM STEP 1, FROM THE TAP TO THE TOP BAR (the owner, 2026-09-26: *"i feel like i
 * selected an avatar on onboarding, but it does not show up now. just check if it's fine or not, coz
 * im not 100% sure"*).
 *
 * Run rather than read. Everything below goes through the real pieces against the in-app test
 * backend Expo Go runs on (`MockBackend`): the draft that carries the parked picture, the record
 * Finish writes, one attempt of the seeder (`sendSetupPhoto`, exactly as `SetupSeeder` calls it),
 * the account the household reads back, the other parent's phone, and the lookup the top bar's
 * picture comes from (`ChildContext`'s pass, repeated here in its own order). Only the two things
 * node cannot do are stood in for: the file the picture is parked in, and the photo cache — each a
 * map keyed exactly as the real one is.
 */
import {
  childPhotoBelongsTo,
  childPhotoCacheName,
  childPhotoPath,
  initialDraft,
  onboardingReducer,
} from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MockAccountsApi, MockAuthProvider, MockBackend } from '../auth/providers/mock';
import type { AccountsApi, ChildRow, SessionStore } from '../auth/providers/types';
import type { Session } from '../auth/session';
import { bytesOfBase64 } from '../lib/base64';
import { memoryStore, type KeyValueStore } from '../prefs';
import { loadOnboarding, saveOnboarding } from './draft-store';
import { loadPendingChildPhoto, savePendingChildPhoto } from './pending-photo';
import { sendSetupPhoto, type SetupPhotoDeps } from './sendSetupPhoto';

const here = dirname(fileURLToPath(import.meta.url));
const code = (rel: string): string =>
  readFileSync(join(here, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

const memorySession = (): SessionStore => {
  let held: Session | null = null;
  return {
    load: () => Promise.resolve(held),
    save: s => {
      held = s;
      return Promise.resolve();
    },
    clear: () => {
      held = null;
      return Promise.resolve();
    },
  };
};

/** The drawn baby, as `avatarJpeg` hands it over: a JPEG's first bytes and a body. */
const DRAWN = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
const PARKED = 'file:///data/cache/cuddlecue/setup-photo/u.jpg';

let op = 0;
const opId = (): string => `00000000-0000-4000-8000-${String(++op).padStart(12, '0')}`;

/** A phone that has just finished setup with a picture chosen on step 1, on the in-app backend. */
async function finishedSetup(options: { withPicture?: boolean } = {}) {
  const backend = new MockBackend();
  const user = backend.createUser('dana@example.test', 'a-long-password', 'email', true);
  const auth = new MockAuthProvider(backend, memorySession());
  await auth.signInWithPassword(user.email, 'a-long-password');
  const api = new MockAccountsApi(backend, auth);
  const prefs = memoryStore();
  const uid = user.id;

  // STEP 1: the drawn baby is parked (`stashSetupPhoto`) and the draft carries where
  let draft = onboardingReducer(initialDraft(opId()), { type: 'set_child_name', value: 'Ada' });
  if (options.withPicture !== false)
    draft = onboardingReducer(draft, { type: 'set_child_photo', uri: PARKED });
  await saveOnboarding(prefs, uid, draft);
  const files = new Map<string, Uint8Array>([[PARKED, DRAWN]]);

  // FINISH: the household and its child, then the record the seeder drains
  const born = new Date(backend.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const created = await api.createHousehold({
    client_op_id: draft.client_op_id,
    profile: { display_name: 'Dana' },
    household: { name: 'Home' },
    child: { name: 'Ada', birth_date: born },
  });
  if (!created.ok) throw new Error('setup: no household');
  const resumed = await loadOnboarding(prefs, uid);
  if (resumed?.draft.child_photo_uri)
    await savePendingChildPhoto(prefs, uid, resumed.draft.child_photo_uri);

  return {
    backend,
    api,
    prefs,
    uid,
    files,
    householdId: created.household_id,
    childId: created.child_id,
  };
}

/** The seeder's dependencies, as `SetupSeeder` builds them, over the stand-in file and cache. */
function seederDeps(
  api: AccountsApi,
  prefs: KeyValueStore,
  uid: string,
  files: Map<string, Uint8Array>,
  cache: Map<string, Uint8Array>,
  refreshed: ChildRow[][],
): SetupPhotoDeps {
  return {
    loadPending: () => loadPendingChildPhoto(prefs, uid),
    clearPending: () => prefs.remove(`pending_child_photo:${uid}`),
    readParked: uri => Promise.resolve(files.get(uri) ?? null),
    forgetParked: uri => {
      files.delete(uri);
    },
    cache: (childId, updatedAt, bytes) => {
      cache.set(childPhotoCacheName(childId, updatedAt), bytes);
    },
    upload: (h, c, jpeg) => api.setChildPhoto(h, c, jpeg),
    refresh: async () => {
      refreshed.push((await api.bootstrapState()).children);
    },
  };
}

/** `ChildContext`'s pass over the rows: the cached file first, then a signed URL. */
async function picturesFor(
  api: AccountsApi,
  rows: readonly ChildRow[],
  cache: Map<string, Uint8Array>,
): Promise<Record<string, { from: 'cache' | 'url'; bytes: Uint8Array }>> {
  const out: Record<string, { from: 'cache' | 'url'; bytes: Uint8Array }> = {};
  for (const c of rows) {
    if (!childPhotoBelongsTo(c.photo_path, c.household_id, c.id)) continue;
    const hit = cache.get(childPhotoCacheName(c.id, c.photo_updated_at));
    if (hit !== undefined) {
      out[c.id] = { from: 'cache', bytes: hit };
      continue;
    }
    const signed = await api.childPhotoUrl(c.photo_path as string);
    if (signed !== null) out[c.id] = { from: 'url', bytes: bytesOfBase64(signed) };
  }
  return out;
}

describe('the picture chosen on step 1 is saved, sent and drawn (in-app test backend)', () => {
  it('is carried by the draft across a relaunch, and parked for the child at Finish', async () => {
    const p = await finishedSetup();
    expect((await loadOnboarding(p.prefs, p.uid))?.draft.child_photo_uri).toBe(PARKED);
    expect(await loadPendingChildPhoto(p.prefs, p.uid)).toEqual({ uri: PARKED });
  });

  it('reaches the child on the first attempt once the account lists it', async () => {
    const p = await finishedSetup();
    const cache = new Map<string, Uint8Array>();
    const refreshed: ChildRow[][] = [];
    const account = await p.api.bootstrapState();
    const outcome = await sendSetupPhoto(
      seederDeps(p.api, p.prefs, p.uid, p.files, cache, refreshed),
      p.householdId,
      account.children,
    );
    expect(outcome).toBe('sent');
    // the record and the parked file are gone: nothing is sent twice
    expect(await loadPendingChildPhoto(p.prefs, p.uid)).toBeNull();
    expect(p.files.has(PARKED)).toBe(false);

    // THE ROW: the account read again carries the path and the stamp
    expect(refreshed).toHaveLength(1);
    const row = refreshed[0]?.find(c => c.id === p.childId);
    expect(row?.photo_path).toBe(childPhotoPath(p.householdId, p.childId));
    expect(row?.photo_updated_at).not.toBeNull();

    // THIS PHONE DRAWS IT FROM ITS CACHE, without asking for it back
    const mine = await picturesFor(p.api, refreshed[0] ?? [], cache);
    expect(mine[p.childId]?.from).toBe('cache');
    expect(mine[p.childId]?.bytes).toEqual(DRAWN);
  });

  it('never replaces a picture the child already has: the parked one is let go', async () => {
    const p = await finishedSetup();
    // another phone of the same account set a picture first (a Finish that came back 409 here, or
    // an upload that landed while its answer was lost): the child has one when this phone looks
    const other = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 1, 1, 1]);
    const set = await p.api.setChildPhoto(p.householdId, p.childId, other);
    expect(set.ok).toBe(true);
    const account = await p.api.bootstrapState();
    let uploads = 0;
    const deps = seederDeps(p.api, p.prefs, p.uid, p.files, new Map(), []);
    const outcome = await sendSetupPhoto(
      {
        ...deps,
        upload: (h, c, jpeg) => {
          uploads += 1;
          return deps.upload(h, c, jpeg);
        },
      },
      p.householdId,
      account.children,
    );
    expect(outcome).toBe('kept');
    expect(uploads).toBe(0);
    // the record and the parked file go, so no later wake sends it either
    expect(await loadPendingChildPhoto(p.prefs, p.uid)).toBeNull();
    expect(p.files.has(PARKED)).toBe(false);
  });

  it('is the other parent’s picture too: their phone fetches the same bytes', async () => {
    const p = await finishedSetup();
    await sendSetupPhoto(
      seederDeps(p.api, p.prefs, p.uid, p.files, new Map(), []),
      p.householdId,
      (await p.api.bootstrapState()).children,
    );
    const partner = p.backend.createUser('sam@example.test', 'a-long-password', 'email', true);
    p.backend.state.members.push({
      household_id: p.householdId,
      user_id: partner.id,
      role: 'PARENT',
      joined_at: new Date(p.backend.now()).toISOString(),
      removed_at: null,
    });
    const auth = new MockAuthProvider(p.backend, memorySession());
    await auth.signInWithPassword(partner.email, 'a-long-password');
    const theirs = new MockAccountsApi(p.backend, auth);
    const drawn = await picturesFor(theirs, (await theirs.bootstrapState()).children, new Map());
    expect(drawn[p.childId]?.from).toBe('url');
    expect(drawn[p.childId]?.bytes).toEqual(DRAWN);
  });

  it('waits for a child that has not landed, and for a network that is not there', async () => {
    const p = await finishedSetup();
    const deps = seederDeps(p.api, p.prefs, p.uid, p.files, new Map(), []);
    expect(await sendSetupPhoto(deps, p.householdId, [])).toBe('no_child');
    expect(await loadPendingChildPhoto(p.prefs, p.uid)).toEqual({ uri: PARKED });
    // no connection: the in-app backend throws, the seeder catches it, the record stays
    const children = (await p.api.bootstrapState()).children;
    p.backend.online = false;
    await expect(sendSetupPhoto(deps, p.householdId, children)).rejects.toThrow();
    expect(await loadPendingChildPhoto(p.prefs, p.uid)).toEqual({ uri: PARKED });
    // and the next wake, online, sends it
    p.backend.online = true;
    expect(await sendSetupPhoto(deps, p.householdId, children)).toBe('sent');
  });

  it('lets go of a file the phone reclaimed, and of a refusal the server would repeat', async () => {
    const gone = await finishedSetup();
    gone.files.clear();
    const deps = seederDeps(gone.api, gone.prefs, gone.uid, gone.files, new Map(), []);
    const children = (await gone.api.bootstrapState()).children;
    expect(await sendSetupPhoto(deps, gone.householdId, children)).toBe('gone');
    expect(await loadPendingChildPhoto(gone.prefs, gone.uid)).toBeNull();

    const refused = await finishedSetup();
    const denied: SetupPhotoDeps = {
      ...seederDeps(refused.api, refused.prefs, refused.uid, refused.files, new Map(), []),
      upload: () => Promise.resolve({ ok: false, status: 403, error: 'forbidden' }),
    };
    const rows = (await refused.api.bootstrapState()).children;
    expect(await sendSetupPhoto(denied, refused.householdId, rows)).toBe('refused');
    expect(await loadPendingChildPhoto(refused.prefs, refused.uid)).toBeNull();
    expect(refused.files.has(PARKED)).toBe(false);

    const busy = await finishedSetup();
    const later: SetupPhotoDeps = {
      ...seederDeps(busy.api, busy.prefs, busy.uid, busy.files, new Map(), []),
      upload: () => Promise.resolve({ ok: false, status: 503, error: 'unavailable' }),
    };
    const kids = (await busy.api.bootstrapState()).children;
    expect(await sendSetupPhoto(later, busy.householdId, kids)).toBe('retry');
    expect(await loadPendingChildPhoto(busy.prefs, busy.uid)).toEqual({ uri: PARKED });
  });

  it('parks nothing when no picture was chosen', async () => {
    const p = await finishedSetup({ withPicture: false });
    expect(await loadPendingChildPhoto(p.prefs, p.uid)).toBeNull();
    const deps = seederDeps(p.api, p.prefs, p.uid, p.files, new Map(), []);
    expect(await sendSetupPhoto(deps, p.householdId, [])).toBe('nothing');
  });
});

/**
 * AND WHERE IT IS DRAWN, pinned so a change to the bar cannot quietly drop it. The picture is the
 * top-bar chip's face (Today's party hat and the heart's pull are layers beside it, not over it),
 * each child's row in the switcher, the Family page's list and the photo sheet's preview. Two
 * places draw the initial instead, by design: the amber Night hides pictures (nothing on the screen
 * at 3 a.m. that is not information), and the chip's single face on Both is not one baby.
 */
describe('the picture is what the bar, the switcher and Family draw', () => {
  // (no SetupSeeder in NibbleCue to send it: its setup parks no picture)
  it('is looked up the way the test above looks it up: the cache by the stamp, then a URL', () => {
    const context = code('../household/ChildContext.tsx');
    expect(context).toContain(
      'if (!childPhotoBelongsTo(c.photo_path, c.household_id, c.id)) continue;',
    );
    expect(context).toContain('const cached = cachedChildPhoto(c.id, c.photo_updated_at);');
    expect(context).toContain('const signed = await api.childPhotoUrl(c.photo_path as string);');
    expect(context).toContain('photoUri: child === null ? null : (photos[child.id] ?? null),');
  });

  it('is the chip’s face, with the hat drawn over it and never in its place', () => {
    const screen = code('../app/Screen.tsx');
    expect(screen).toContain('...(child.photoUri !== null ? { photoUri: child.photoUri } : {}),');
    expect(screen).toContain('...(face !== null ? { photoUri: face } : {}),');
    const chip = code('../../../../packages/ui/src/components/ChildChip.tsx');
    // the picture, unless it is night or this very picture would not load (then the initial:
    // `packages/ui` `photoTrouble.ts`, 2026-09-29)
    expect(chip).toContain(
      'const photo = isBoth ? undefined : shownPhoto(photoUri, t.isNight, failed);',
    );
    expect(chip).toContain('<Image source={{ uri: singlePhoto }}');
    // the hat is a layer after the avatar's own, not a replacement for it
    expect(chip.indexOf('<Image source={{ uri: singlePhoto }}')).toBeLessThan(
      chip.indexOf('<PartyHat'),
    );
  });

  it('is on each baby’s row in the switcher and on the Family page', () => {
    expect(code('../app/ChildSwitcherSheet.tsx')).toContain('const photoUri = photoOf(c.id);');
    expect(code('../screens/more/FamilyScreen.tsx')).toContain('const photoUri = photoOf(c.id);');
  });
});
