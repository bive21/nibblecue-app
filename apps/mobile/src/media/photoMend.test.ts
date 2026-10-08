/**
 * AN OLD EMPTY PICTURE MENDS ITSELF, run rather than read (2026-09-29). The owner: *"the avatar
 * still showing as white empty with party hat. on both android and iphone (same household). but now
 * i changed the avatar from my android, andit changes on the iphone too, maybe it already works after
 * last update."* It did: a pick made after the fix is right. The picture picked on the iPhone before
 * it was stored empty, and a household that never picks again would keep it.
 *
 * Everything below goes through the real pieces against the in-app test backend Expo Go runs on
 * (`MockBackend`): the picture the iPhone stored (`testing/avatarPictures.ts` makes it the way the
 * phone did), the rows each phone reads, the photo cache keyed as the real one is, the remembered
 * verdicts in each phone's own store, and `ChildContext`'s pass in its own order (`pass`, below —
 * the tripwires at the end hold the provider to it). Only the files are stood in for: a cached
 * picture is a map entry, and the drawn baby's kept file is a name.
 */
import {
  childPhotoBelongsTo,
  childPhotoCacheName,
  type BootstrapPayload,
  type Role,
} from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MockAccountsApi, MockAuthProvider, MockBackend } from '../auth/providers/mock';
import type { AccountsApi, ApiFailure, ChildRow, SessionStore } from '../auth/providers/types';
import type { Session } from '../auth/session';
import { bytesOfBase64 } from '../lib/base64';
import { memoryStore, type KeyValueStore } from '../prefs';
import { drawnPictureJpeg, flatPicture, oldIphonePicture, WHITE } from '../testing/avatarPictures';
import { encodeJpeg } from '../testing/jpeg';
import { BABY_AVATARS, type BabyAvatarDef } from './avatars/art';
import { drawingKey } from './avatars/picture';
import { judgePicture } from './blankPicture';
import {
  loadPhotoNote,
  lookAtChildPhoto,
  MEND_SENDS,
  mendChildPhoto,
  photoNoteKey,
  type LookDeps,
  type MendDeps,
  type MendOutcome,
} from './photoMend';

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

/** The baby the owner picked on the iPhone before the fix. */
const PICKED = BABY_AVATARS.find(b => b.id === 'curl-black') as BabyAvatarDef;

/** A photo a parent took: a gradient, a disc and a camera's grain. */
function aPhoto(): Uint8Array {
  let s = 17;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000 - 0.5) * 30;
  const side = 512;
  const rgb = new Uint8Array(side * side * 3);
  for (let y = 0; y < side; y += 1)
    for (let x = 0; x < side; x += 1) {
      const inDisc = (x - 256) ** 2 + (y - 230) ** 2 < 120 ** 2;
      const c = inDisc ? [224, 172, 140] : [90 + y / 6, 120 + x / 8, 160];
      rgb.set(
        c.map(v => Math.max(0, Math.min(255, Math.round(v + rnd())))),
        (y * side + x) * 3,
      );
    }
  return encodeJpeg({ width: side, height: side, rgb });
}

/** One phone of the household: its person's session, its own store, cache and log. */
interface Phone {
  api: AccountsApi;
  store: KeyValueStore;
  /** The photo cache: bytes by the cache's own file name. */
  cache: Map<string, Uint8Array>;
  reads: number;
  draws: string[];
  uploads: number;
  lines: string[];
  role: Role;
  /** Stand-ins a test may swap: the send, and whether the drawing can be made. */
  upload?: MendDeps['upload'];
  drawable: boolean;
}

const cacheUri = (name: string) => `file:///cache/cuddlecue/child-photos/${name}`;
const drawnUri = (def: BabyAvatarDef) =>
  `file:///cache/cuddlecue/avatar-drawn/${drawingKey(def)}.jpg`;

function lookDeps(phone: Phone): LookDeps {
  return {
    store: phone.store,
    read: uri => {
      phone.reads += 1;
      return Promise.resolve(phone.cache.get(uri.split('/').pop() ?? '') ?? null);
    },
    drawn: def => {
      if (!phone.drawable) return Promise.resolve(null);
      phone.draws.push(def.id);
      return Promise.resolve(drawnUri(def));
    },
    crumb: line => phone.lines.push(line),
  };
}

function mendDeps(phone: Phone): MendDeps {
  return {
    store: phone.store,
    mayChange: phone.role === 'OWNER' || phone.role === 'PARENT',
    stampNow: async id => {
      const row = (await phone.api.bootstrapState()).children.find(c => c.id === id);
      return row === undefined ? undefined : row.photo_updated_at;
    },
    // the very JPEG a pick of that baby makes now
    bytes: def => Promise.resolve(drawnPictureJpeg(def)),
    upload: (h, c, jpeg) => {
      phone.uploads += 1;
      return phone.upload ? phone.upload(h, c, jpeg) : phone.api.setChildPhoto(h, c, jpeg);
    },
    cache: (id, at, bytes) => {
      phone.cache.set(childPhotoCacheName(id, at), bytes);
    },
    refresh: () => Promise.resolve(),
    crumb: line => phone.lines.push(line),
  };
}

/**
 * `ChildContext`'s pass, in its order: the cached file by the stamp, then a signed URL; what the
 * picture shows, looked at once per version; the faces up; then any mend.
 */
async function pass(
  phone: Phone,
): Promise<{ shown: Record<string, string>; mends: MendOutcome[] }> {
  const rows: ChildRow[] = (await phone.api.bootstrapState()).children;
  const shown: Record<string, string> = {};
  const redrawn: { child: ChildRow; baby: BabyAvatarDef }[] = [];
  for (const c of rows) {
    if (!childPhotoBelongsTo(c.photo_path, c.household_id, c.id)) continue;
    const name = childPhotoCacheName(c.id, c.photo_updated_at);
    if (!phone.cache.has(name)) {
      const signed = await phone.api.childPhotoUrl(c.photo_path as string);
      if (signed === null) continue;
      phone.cache.set(name, bytesOfBase64(signed));
    }
    const seen = await lookAtChildPhoto(lookDeps(phone), c, cacheUri(name));
    if (seen.show !== null) shown[c.id] = seen.show;
    if (seen.redrawn !== null) redrawn.push({ child: c, baby: seen.redrawn });
  }
  const mends: MendOutcome[] = [];
  for (const r of redrawn) mends.push(await mendChildPhoto(mendDeps(phone), r.child, r.baby));
  return { shown, mends };
}

/** The owner's household: an owner (the iPhone), a parent (the Android phone) and a caregiver. */
async function household(stored: Uint8Array | null) {
  let t = Date.parse('2026-09-29T08:00:00.000Z');
  // one millisecond a call, so every write has a stamp of its own
  const backend = new MockBackend({ now: () => (t += 1) });
  const phoneOf = async (email: string, role: Role, householdId?: string): Promise<Phone> => {
    const user = backend.createUser(email, 'a-long-password', 'email', true);
    if (householdId !== undefined)
      backend.state.members.push({
        household_id: householdId,
        user_id: user.id,
        role,
        joined_at: new Date(backend.now()).toISOString(),
        removed_at: null,
      });
    const auth = new MockAuthProvider(backend, memorySession());
    await auth.signInWithPassword(email, 'a-long-password');
    return {
      api: new MockAccountsApi(backend, auth),
      store: memoryStore(),
      cache: new Map(),
      reads: 0,
      draws: [],
      uploads: 0,
      lines: [],
      role,
      drawable: true,
    };
  };
  const iphone = await phoneOf('owner@example.test', 'OWNER');
  const born = new Date(backend.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const payload: BootstrapPayload = {
    client_op_id: '00000000-0000-4000-8000-000000000001',
    profile: { display_name: 'Owner' },
    household: { name: 'Home' },
    child: { name: 'Ada', birth_date: born },
  };
  const created = await iphone.api.createHousehold(payload);
  if (!created.ok) throw new Error('no household');
  const { household_id: householdId, child_id: childId } = created;
  // the picture the iPhone stored, before the fix, on the old road
  if (stored !== null) {
    const r = await iphone.api.setChildPhoto(householdId, childId, stored);
    if (!r.ok) throw new Error('no picture');
  }
  const android = await phoneOf('parent@example.test', 'PARENT', householdId);
  const sitter = await phoneOf('sitter@example.test', 'CAREGIVER', householdId);
  const storedNow = async () => {
    const path = (await iphone.api.bootstrapState()).children[0]?.photo_path ?? null;
    const signed = path === null ? null : await iphone.api.childPhotoUrl(path);
    return signed === null ? null : bytesOfBase64(signed);
  };
  return { backend, iphone, android, sitter, householdId, childId, storedNow };
}

describe('the owner’s household, as reported: an empty picture from the iPhone, on both phones', () => {
  it('draws the picked baby on every phone, and mends the stored picture once, from one phone', async () => {
    const h = await household(oldIphonePicture(PICKED));
    const stamp0 = (await h.iphone.api.bootstrapState()).children[0]?.photo_updated_at;

    // THE ANDROID PHONE LOOKS FIRST: the drawn baby in the corner is drawn, never the empty circle
    const first = await pass(h.android);
    expect(first.shown[h.childId]).toBe(drawnUri(PICKED));
    expect(h.android.draws).toEqual([PICKED.id]);
    // and, a parent's phone, it sends the redrawn baby as the child's picture
    expect(first.mends).toEqual(['sent']);
    expect(h.android.uploads).toBe(1);
    const stored = await h.storedNow();
    expect(stored).toEqual(drawnPictureJpeg(PICKED));
    expect(judgePicture(stored ?? new Uint8Array(0)).kind).toBe('picture');
    const stamp1 = (await h.android.api.bootstrapState()).children[0]?.photo_updated_at;
    expect(stamp1).not.toBe(stamp0);

    // THE IPHONE, next time it looks, draws the mended picture itself, and sends nothing
    const later = await pass(h.iphone);
    expect(later.shown[h.childId]).toBe(cacheUri(childPhotoCacheName(h.childId, stamp1 ?? null)));
    expect(later.mends).toEqual([]);
    expect(h.iphone.uploads).toBe(0);

    // NO LOOP: pass after pass, on both phones, nothing is read again and nothing is sent again
    const reads = h.android.reads + h.iphone.reads;
    for (let i = 0; i < 5; i += 1) {
      expect((await pass(h.android)).mends).toEqual([]);
      expect((await pass(h.iphone)).mends).toEqual([]);
    }
    expect(h.android.reads + h.iphone.reads).toBe(reads);
    expect(h.android.uploads + h.iphone.uploads).toBe(1);
    expect(await h.storedNow()).toEqual(drawnPictureJpeg(PICKED));
  });

  it('draws the picked baby on the caregiver’s phone too, which never sends', async () => {
    const h = await household(oldIphonePicture(PICKED));
    const r = await pass(h.sitter);
    expect(r.shown[h.childId]).toBe(drawnUri(PICKED));
    expect(r.mends).toEqual(['not_theirs']);
    expect(h.sitter.uploads).toBe(0);
    expect(await h.storedNow()).toEqual(oldIphonePicture(PICKED));
  });

  it('works with no network: the cached picture is looked at and the baby drawn; the send waits', async () => {
    const h = await household(oldIphonePicture(PICKED));
    // the picture was cached while online, before the update that brought this
    const row = (await h.android.api.bootstrapState()).children[0] as ChildRow;
    const name = childPhotoCacheName(h.childId, row.photo_updated_at);
    h.android.cache.set(name, oldIphonePicture(PICKED));

    h.backend.online = false;
    const seen = await lookAtChildPhoto(lookDeps(h.android), row, cacheUri(name));
    expect(seen).toEqual({ show: drawnUri(PICKED), redrawn: PICKED });
    expect(await mendChildPhoto(mendDeps(h.android), row, PICKED)).toBe('unsure');
    // not counted: nothing was sent
    expect((await loadPhotoNote(h.android.store, h.childId))?.sends ?? 0).toBe(0);

    h.backend.online = true;
    expect(await mendChildPhoto(mendDeps(h.android), row, PICKED)).toBe('sent');
  });
});

describe('never over a picture somebody chose', () => {
  it('leaves a photo the other parent picked meanwhile exactly as it is', async () => {
    const h = await household(oldIphonePicture(PICKED));
    const row = (await h.android.api.bootstrapState()).children[0] as ChildRow;
    const name = childPhotoCacheName(h.childId, row.photo_updated_at);
    const read = await h.android.api.childPhotoUrl(row.photo_path as string);
    h.android.cache.set(name, bytesOfBase64(read ?? ''));
    const seen = await lookAtChildPhoto(lookDeps(h.android), row, cacheUri(name));
    expect(seen.redrawn?.id).toBe(PICKED.id);

    // between the look and the send, the owner picks a photo on the iPhone
    const photo = aPhoto();
    expect((await h.iphone.api.setChildPhoto(h.householdId, h.childId, photo)).ok).toBe(true);

    expect(await mendChildPhoto(mendDeps(h.android), row, PICKED)).toBe('moved');
    expect(h.android.uploads).toBe(0);
    expect(await h.storedNow()).toEqual(photo);
    // and the photo, looked at in turn, is a picture: drawn as it is, nothing to mend
    const next = await pass(h.android);
    expect(next.mends).toEqual([]);
    expect(Object.values(next.shown)[0]).toMatch(/child-photos/);
  });

  it('shows a real photo as it is and never sends anything for it', async () => {
    const h = await household(aPhoto());
    for (const phone of [h.iphone, h.android, h.sitter]) {
      const r = await pass(phone);
      expect(r.shown[h.childId]).toMatch(/child-photos/);
      expect(r.mends).toEqual([]);
      expect(phone.draws).toEqual([]);
    }
    expect(h.iphone.uploads + h.android.uploads + h.sitter.uploads).toBe(0);
  });

  it('draws the initial for a picture with nothing in it at all, and sends nothing', async () => {
    const h = await household(encodeJpeg(flatPicture(WHITE)));
    const r = await pass(h.android);
    expect(r.shown[h.childId]).toBeUndefined();
    expect(r.mends).toEqual([]);
    expect(h.android.uploads).toBe(0);
    expect(h.android.lines.join('\n')).toContain('the initial stands in');
  });
});

describe('a send that fails is tried a few times, never forever', () => {
  const failing = (status: number) => (): Promise<ApiFailure> =>
    Promise.resolve({ ok: false, status, error: status >= 500 ? 'unavailable' : 'forbidden' });

  it('no network or a server fault: counted, tried again on later passes, and then no more', async () => {
    const h = await household(oldIphonePicture(PICKED));
    h.android.upload = failing(503);
    const outcomes: MendOutcome[] = [];
    for (let i = 0; i < MEND_SENDS + 3; i += 1) outcomes.push(...(await pass(h.android)).mends);
    expect(outcomes).toEqual([
      ...Array<MendOutcome>(MEND_SENDS).fill('retry'),
      'spent',
      'spent',
      'spent',
    ]);
    expect(h.android.uploads).toBe(MEND_SENDS);
    // and all the while this phone drew the baby, not the empty circle
    expect((await pass(h.android)).shown[h.childId]).toBe(drawnUri(PICKED));
  });

  it('a refusal the server would repeat: once, and never again', async () => {
    const h = await household(oldIphonePicture(PICKED));
    h.android.upload = failing(403);
    expect((await pass(h.android)).mends).toEqual(['refused']);
    expect((await pass(h.android)).mends).toEqual(['spent']);
    expect(h.android.uploads).toBe(1);
  });

  it('one send at a time for a version, whatever the passes do meanwhile', async () => {
    const h = await household(oldIphonePicture(PICKED));
    const row = (await h.android.api.bootstrapState()).children[0] as ChildRow;
    const name = childPhotoCacheName(h.childId, row.photo_updated_at);
    h.android.cache.set(name, oldIphonePicture(PICKED));
    await lookAtChildPhoto(lookDeps(h.android), row, cacheUri(name));
    const both = await Promise.all([
      mendChildPhoto(mendDeps(h.android), row, PICKED),
      mendChildPhoto(mendDeps(h.android), row, PICKED),
    ]);
    expect(both.sort()).toEqual(['busy', 'sent']);
    expect(h.android.uploads).toBe(1);
  });
});

describe('a picture is looked at once per version', () => {
  it('read once, remembered across a relaunch, and read again only for a new version', async () => {
    const h = await household(aPhoto());
    await pass(h.android);
    expect(h.android.reads).toBe(1);
    await pass(h.android);
    // a relaunch: the same store and cache on the phone, everything else new
    const relaunched: Phone = { ...h.android, reads: 0, lines: [] };
    await pass(relaunched);
    expect(relaunched.reads).toBe(0);
    // the other parent picks a new picture: a new version, looked at once
    expect((await h.iphone.api.setChildPhoto(h.householdId, h.childId, aPhoto())).ok).toBe(true);
    await pass(relaunched);
    await pass(relaunched);
    expect(relaunched.reads).toBe(1);
  });

  it('the stamp as an instant: the same version however the server prints it', async () => {
    const h = await household(aPhoto());
    const row = (await h.android.api.bootstrapState()).children[0] as ChildRow;
    const z = row.photo_updated_at as string;
    const offset = z.replace('Z', '+00:00');
    h.android.cache.set(childPhotoCacheName(h.childId, z), aPhoto());
    await lookAtChildPhoto(lookDeps(h.android), row, cacheUri(childPhotoCacheName(h.childId, z)));
    await lookAtChildPhoto(
      lookDeps(h.android),
      { ...row, photo_updated_at: offset },
      cacheUri(childPhotoCacheName(h.childId, offset)),
    );
    expect(h.android.reads).toBe(1);
  });

  it('a note it cannot read is a picture looked at again, never a wrong answer', async () => {
    const h = await household(oldIphonePicture(PICKED));
    await h.sitter.store.set(photoNoteKey(h.childId), '{not json');
    expect((await pass(h.sitter)).shown[h.childId]).toBe(drawnUri(PICKED));
    await h.sitter.store.set(
      photoNoteKey(h.childId),
      JSON.stringify({ version: 1, seen: 'maybe' }),
    );
    expect((await pass(h.sitter)).shown[h.childId]).toBe(drawnUri(PICKED));
    expect(h.sitter.reads).toBe(2);
  });

  it('a drawing that cannot be made is the initial, never the empty circle, and nothing is sent', async () => {
    const h = await household(oldIphonePicture(PICKED));
    h.android.drawable = false;
    const r = await pass(h.android);
    expect(r.shown[h.childId]).toBeUndefined();
    expect(r.mends).toEqual([]);
  });

  it('a file it cannot read this time is drawn as it is, and read again next time', async () => {
    const h = await household(aPhoto());
    const row = (await h.android.api.bootstrapState()).children[0] as ChildRow;
    const look = { ...lookDeps(h.android), read: () => Promise.resolve(null) };
    expect(await lookAtChildPhoto(look, row, 'file:///gone.jpg')).toEqual({
      show: 'file:///gone.jpg',
      redrawn: null,
    });
    expect(await loadPhotoNote(h.android.store, h.childId)).toBeNull();
  });
});

describe('ChildContext runs it in its one pass (tripwires, as `sendSetupPhoto.test.ts` keeps them)', () => {
  const context = code('../household/ChildContext.tsx');

  it('looks at each picture after the cache and the signed URL, and shows what the look says', () => {
    expect(context).toContain('const cached = cachedChildPhoto(c.id, c.photo_updated_at);');
    expect(context).toContain('const signed = await api.childPhotoUrl(c.photo_path as string);');
    expect(context).toContain('const seen = await lookAtChildPhoto(look, c, file);');
    expect(context).toContain('if (seen.show !== null) next[c.id] = seen.show;');
    expect(context.indexOf('api.childPhotoUrl')).toBeLessThan(context.indexOf('lookAtChildPhoto('));
    expect(context).toContain(
      'const look: LookDeps = { store, read: cachedPhotoBytes, drawn: drawnBabyFile, crumb };',
    );
  });

  it('mends after the faces are up, as the people who may change the picture, over a fresh stamp', () => {
    expect(context).toContain('mayChange: canSetChildPhoto(role),');
    expect(context).toContain('(await api.bootstrapState()).children.find(c => c.id === id)');
    expect(context).toContain('upload: (h, c, jpeg) => api.setChildPhoto(h, c, jpeg),');
    expect(context).toContain('cacheChildPhoto(id, at, bytes);');
    expect(context).toContain('refresh: () => actions.refreshAccount(),');
    expect(context.indexOf('setPhotos(next);')).toBeLessThan(
      context.indexOf('await mendChildPhoto(mend, r.child, r.baby)'),
    );
  });

  it('keeps the drawn baby where sign-out sweeps, as the very JPEG a pick of it makes', () => {
    const render = code('avatars/render.ts');
    expect(render).toContain("new Directory(Paths.cache, 'cuddlecue', 'avatar-drawn')");
    expect(render).toContain('const jpeg = await avatarJpeg(def);');
    expect(render).toContain('new File(dir, `${key}.jpg`)');
  });
});
