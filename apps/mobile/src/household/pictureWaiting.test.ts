/**
 * A PERSON'S OWN PICTURE, FROM THE TAP TO THE OTHER PARENT'S PHONE (migration 0148), run rather than
 * read: the waiting record, one attempt of the sender (`sendWaitingPicture`, exactly as
 * `MemberPictures.tsx` calls it), the account the person reads back, the roster the other parent's
 * Family page reads, and the signed URL their phone fetches — all against the in-app test backend
 * Expo Go runs on. Only the photo cache is stood in for, as a map keyed the way the real one is.
 *
 * What it proves: offline, nothing is lost and nothing is half set; online, the photo is on the
 * server and in this phone's cache under the server's stamp; a drawing is only an id; the initial
 * deletes the photo; a newer choice is never lost to an older one's send; and the household, and
 * nobody else, reads the picture.
 */
import { memberPhotoCacheName, memberPhotoPath, type ModuleId } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { MockAccountsApi, MockAuthProvider, MockBackend } from '../auth/providers/mock';
import type { SessionStore } from '../auth/providers/types';
import type { Session } from '../auth/session';
import { bytesOfBase64 } from '../lib/base64';
import { memoryStore, type KeyValueStore } from '../prefs';
import {
  clearWaitingPicture,
  loadWaitingPicture,
  pictureWorthRetrying,
  saveWaitingPicture,
  sendWaitingPicture,
  waitingOf,
  waitingPictureKey,
  type PictureChoice,
  type SendDeps,
} from './pictureWaiting';

const T0 = Date.parse('2026-09-30T12:00:00Z');
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

const sessionStore = (): SessionStore => {
  let held: Session | null = null;
  return {
    load: async () => held,
    save: async s => {
      held = s;
    },
    clear: async () => {
      held = null;
    },
  };
};

/** One backend, the owner of a household, their partner, and somebody from another household. */
async function world() {
  let now = T0;
  const backend = new MockBackend({ now: () => now });
  const person = async (email: string) => {
    const auth = new MockAuthProvider(backend, sessionStore());
    await auth.signUpWithPassword(email, 'correct horse battery');
    await auth.handleAuthLink(backend.lastLink ?? '');
    const api = new MockAccountsApi(backend, auth);
    const id = (await auth.restoreSession())?.user.id ?? '';
    return { auth, api, id };
  };
  const household = async (p: Awaited<ReturnType<typeof person>>, name: string, op: string) => {
    const made = await p.api.createHousehold({
      client_op_id: op,
      profile: { display_name: name },
      household: { name: `${name}'s family` },
      child: { name: 'Ada', birth_date: '2026-06-01' },
      modules: ['bottle', 'diaper'] as ModuleId[],
    });
    if (!made.ok) throw new Error(`no household for ${name}`);
    return made.household_id;
  };
  const dana = await person('dana@example.test');
  const home = await household(dana, 'Dana', '6f5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5e6f');
  const invite = await dana.api.createInvite(home, 'PARENT', 'CODE');
  if (!invite.ok || invite.kind !== 'CODE') throw new Error('no invite');
  const sam = await person('sam@example.test');
  const joined = await sam.api.acceptInvite({ code: invite.code, display_name: 'Sam' });
  if (!joined.ok) throw new Error('sam did not join');
  const vera = await person('vera@example.test');
  await household(vera, 'Vera', '7f5a1e0a-4b1c-4a2f-9d1e-2a1b3c4d5e6f');
  return { backend, dana, sam, vera, home, advance: (ms: number) => (now += ms) };
}

/** The sender's dependencies, as the provider builds them, over a stand-in cache. */
function deps(
  api: MockAccountsApi,
  prefs: KeyValueStore,
  uid: string,
  cache: Map<string, Uint8Array>,
  refreshed: { n: number },
): SendDeps {
  return {
    load: () => loadWaitingPicture(prefs, uid),
    clear: token => clearWaitingPicture(prefs, uid, token),
    api,
    cache: (updatedAt, bytes) => {
      cache.set(memberPhotoCacheName(uid, updatedAt), bytes);
    },
    refresh: async () => {
      refreshed.n += 1;
    },
  };
}

const keep = (prefs: KeyValueStore, uid: string, choice: PictureChoice, token = 't1') =>
  saveWaitingPicture(prefs, uid, waitingOf(choice, token));

describe('a photo, chosen offline and sent when the network is back', () => {
  it('is kept and drawn from this phone while offline: nothing on the server, nothing lost', async () => {
    const w = await world();
    const prefs = memoryStore();
    const cache = new Map<string, Uint8Array>();
    await keep(prefs, w.dana.id, { kind: 'photo', jpeg: JPEG });
    w.backend.online = false;
    const r = await sendWaitingPicture(deps(w.dana.api, prefs, w.dana.id, cache, { n: 0 }));
    expect(r.outcome).toBe('retry');
    // still there, bytes and all
    const kept = await loadWaitingPicture(prefs, w.dana.id);
    expect(kept?.kind).toBe('photo');
    expect(kept?.kind === 'photo' ? bytesOfBase64(kept.jpeg) : null).toEqual(JPEG);
    // and the server has nothing half set
    w.backend.online = true;
    const account = await w.dana.api.bootstrapState();
    expect(account.profile).toMatchObject({ avatar_path: null, avatar_preset: null });
  });

  it('lands whole once online: the file, the row with the server’s stamp, this phone’s cache', async () => {
    const w = await world();
    const prefs = memoryStore();
    const cache = new Map<string, Uint8Array>();
    const refreshed = { n: 0 };
    await keep(prefs, w.dana.id, { kind: 'photo', jpeg: JPEG });
    const r = await sendWaitingPicture(deps(w.dana.api, prefs, w.dana.id, cache, refreshed));
    expect(r.outcome).toBe('sent');
    expect(await loadWaitingPicture(prefs, w.dana.id)).toBeNull();
    expect(refreshed.n).toBe(1);
    const profile = (await w.dana.api.bootstrapState()).profile;
    expect(profile?.avatar_path).toBe(memberPhotoPath(w.dana.id));
    expect(profile?.avatar_preset).toBeNull();
    expect(profile?.avatar_updated_at).toBe(new Date(T0).toISOString());
    // cached under the stamp the server wrote: the first read after the refresh is a hit
    expect(cache.get(memberPhotoCacheName(w.dana.id, profile?.avatar_updated_at ?? null))).toEqual(
      JPEG,
    );
  });

  it('is read by the other parent, from the roster their Family page reads, and by nobody else', async () => {
    const w = await world();
    const prefs = memoryStore();
    await keep(prefs, w.dana.id, { kind: 'photo', jpeg: JPEG });
    await sendWaitingPicture(deps(w.dana.api, prefs, w.dana.id, new Map(), { n: 0 }));
    const roster = await w.sam.api.listMembers(w.home);
    const dana = roster.find(m => m.user_id === w.dana.id);
    expect(dana?.avatar_path).toBe(memberPhotoPath(w.dana.id));
    const signed = await w.sam.api.memberPhotoUrl(memberPhotoPath(w.dana.id));
    expect(signed === null ? null : bytesOfBase64(signed)).toEqual(JPEG);
    // another household's member, and a path that is not a picture's, get nothing
    expect(await w.vera.api.memberPhotoUrl(memberPhotoPath(w.dana.id))).toBeNull();
    expect(await w.sam.api.memberPhotoUrl(`${w.dana.id}/other.jpg`)).toBeNull();
    // and somebody removed from the household stops reading it at once
    expect(await w.dana.api.removeMember(w.home, w.sam.id)).toEqual({ ok: true });
    expect(await w.sam.api.memberPhotoUrl(memberPhotoPath(w.dana.id))).toBeNull();
  });
});

describe('a drawing, and the initial', () => {
  it('keeps a drawing as its id alone, and deletes the photo it replaces', async () => {
    const w = await world();
    const prefs = memoryStore();
    await keep(prefs, w.dana.id, { kind: 'photo', jpeg: JPEG });
    await sendWaitingPicture(deps(w.dana.api, prefs, w.dana.id, new Map(), { n: 0 }));
    w.advance(60_000);
    await keep(prefs, w.dana.id, { kind: 'drawing', id: 'long-waves' }, 't2');
    const r = await sendWaitingPicture(deps(w.dana.api, prefs, w.dana.id, new Map(), { n: 0 }));
    expect(r.outcome).toBe('sent');
    const profile = (await w.dana.api.bootstrapState()).profile;
    expect(profile).toMatchObject({ avatar_path: null, avatar_preset: 'long-waves' });
    expect(profile?.avatar_updated_at).toBe(new Date(T0 + 60_000).toISOString());
    // the photo is gone from the stand-in bucket: nobody can fetch it any more
    expect(await w.sam.api.memberPhotoUrl(memberPhotoPath(w.dana.id))).toBeNull();
  });

  it('goes back to the initial with both columns empty, and says when', async () => {
    const w = await world();
    const prefs = memoryStore();
    await keep(prefs, w.dana.id, { kind: 'drawing', id: 'bun' });
    await sendWaitingPicture(deps(w.dana.api, prefs, w.dana.id, new Map(), { n: 0 }));
    w.advance(1000);
    await keep(prefs, w.dana.id, { kind: 'initial' }, 't2');
    expect(
      (await sendWaitingPicture(deps(w.dana.api, prefs, w.dana.id, new Map(), { n: 0 }))).outcome,
    ).toBe('sent');
    const profile = (await w.dana.api.bootstrapState()).profile;
    expect(profile).toMatchObject({ avatar_path: null, avatar_preset: null });
    // a removal is stamped too, so the later reading of a person is the later truth
    expect(profile?.avatar_updated_at).toBe(new Date(T0 + 1000).toISOString());
  });
});

describe('what is never lost, and what is let go', () => {
  it('keeps a newer choice made while an older one was being sent', async () => {
    const prefs = memoryStore();
    await keep(prefs, 'u1', { kind: 'photo', jpeg: JPEG }, 'old');
    const r = await sendWaitingPicture({
      load: () => loadWaitingPicture(prefs, 'u1'),
      clear: token => clearWaitingPicture(prefs, 'u1', token),
      api: {
        setMemberPhoto: async () => {
          // the person picks a drawing while the upload is in flight
          await keep(prefs, 'u1', { kind: 'drawing', id: 'bun' }, 'new');
          return {
            ok: true,
            picture: { avatar_path: 'p', avatar_preset: null, avatar_updated_at: 'T' },
          };
        },
        setMemberDrawing: async () => ({ ok: false, status: 500, error: 'unused' }),
        clearMemberPicture: async () => ({ ok: false, status: 500, error: 'unused' }),
      },
      cache: () => undefined,
      refresh: async () => undefined,
    });
    expect(r.outcome).toBe('sent');
    expect(await loadWaitingPicture(prefs, 'u1')).toMatchObject({ kind: 'drawing', token: 'new' });
  });

  it('lets go of a choice the server would refuse again, and keeps one worth another try', async () => {
    const w = await world();
    const prefs = memoryStore();
    await keep(prefs, w.dana.id, { kind: 'drawing', id: 'Not An Id' });
    const r = await sendWaitingPicture(deps(w.dana.api, prefs, w.dana.id, new Map(), { n: 0 }));
    expect(r).toEqual({ outcome: 'refused', status: 422 });
    expect(await loadWaitingPicture(prefs, w.dana.id)).toBeNull();
    expect([0, 401, 408, 429, 500, 503].every(pictureWorthRetrying)).toBe(true);
    expect([400, 403, 404, 413, 422].some(pictureWorthRetrying)).toBe(false);
  });

  it('reads nothing it cannot parse, and is kept under the person’s own key', async () => {
    const prefs = memoryStore({ [waitingPictureKey('u1')]: '{"kind":"photo"}' });
    expect(await loadWaitingPicture(prefs, 'u1')).toBeNull();
    expect(waitingPictureKey('u1')).toBe('waiting_member_picture:u1');
    expect(
      (
        await sendWaitingPicture({
          load: () => loadWaitingPicture(prefs, 'u1'),
          clear: async () => undefined,
          api: {} as SendDeps['api'],
          cache: () => undefined,
          refresh: async () => undefined,
        })
      ).outcome,
    ).toBe('nothing');
  });

  it('is cleared with the account: the purge takes the picture and its bytes', async () => {
    const w = await world();
    const prefs = memoryStore();
    await keep(prefs, w.sam.id, { kind: 'photo', jpeg: JPEG });
    await sendWaitingPicture(deps(w.sam.api, prefs, w.sam.id, new Map(), { n: 0 }));
    expect(await w.sam.api.requestAccountDeletion()).toMatchObject({ ok: true });
    w.advance(15 * 86_400_000);
    expect(w.backend.purgeDue()).toBe(1);
    const sam = w.backend.user(w.sam.id);
    expect(sam).toMatchObject({ avatar_path: null, avatar_preset: null });
    expect(sam?.avatar_data).toBeUndefined();
  });
});
