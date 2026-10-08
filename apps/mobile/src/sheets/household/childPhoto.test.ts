/**
 * THE BABY'S PICTURE (the owner, 2026-09-20: *"Also add the feature to add baby's picture saved
 * to everyone in household"*).
 *
 * Two halves. The first runs the whole write against the FAKE SERVER — set it, read it back as
 * the other parent, refuse it as a caregiver — because the sentence the owner asked for is
 * "saved to everyone in household", and only a second caller proves the "everyone". The second
 * is tripwires over the source, the way this suite tests screens (`interaction.test.ts` records
 * why that is the honest instrument here).
 */
import { childPhotoPath } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MockAccountsApi, MockAuthProvider, MockBackend } from '../../auth/providers/mock';
import type { Session } from '../../auth/session';
import type { SessionStore } from '../../auth/providers/types';
import { CHILD_PHOTO_COPY, childPhotoFailure, childPhotoTitle } from './childPhotoCopy';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');
const sheet = read('./ChildPhotoSheet.tsx');
const pipeline = read('../../media/childPhoto.ts');
const context = read('../../household/ChildContext.tsx');
const family = read('../../screens/more/FamilyScreen.tsx');
const switcher = read('../../app/ChildSwitcherSheet.tsx');
const shell = read('../../app/ShellProvider.tsx');
const screen = read('../../app/Screen.tsx');
const supabase = read('../../auth/providers/supabase.ts');

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

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

/** A birth date the fake server will accept: three months before whatever its clock says. */
const bornIso = (nowMs: number): string =>
  new Date(nowMs - 90 * 86_400_000).toISOString().slice(0, 10);

let opCounter = 0;
const opId = (): string => `00000000-0000-4000-8000-${String(++opCounter).padStart(12, '0')}`;

/** An owner with a household and one baby, plus a second signed-in caller in the same house. */
async function household(now?: () => number) {
  const backend = new MockBackend(now ? { now } : {});
  const ownerUser = backend.createUser('owner@example.test', 'a-long-password', 'email', true);
  const owner = new MockAuthProvider(backend, memorySession());
  await owner.signInWithPassword(ownerUser.email, 'a-long-password');
  const ownerApi = new MockAccountsApi(backend, owner);
  const created = await ownerApi.createHousehold({
    client_op_id: opId(),
    profile: { display_name: 'Sam' },
    household: { name: 'The house' },
    child: { name: 'Chiara', birth_date: bornIso(backend.now()) },
  });
  if (!created.ok) throw new Error('setup: household not created');

  const join = async (role: 'PARENT' | 'CAREGIVER', email: string) => {
    const u = backend.createUser(email, 'a-long-password', 'email', true);
    backend.state.members.push({
      household_id: created.household_id,
      user_id: u.id,
      role,
      joined_at: new Date(backend.now()).toISOString(),
      removed_at: null,
    });
    const auth = new MockAuthProvider(backend, memorySession());
    await auth.signInWithPassword(u.email, 'a-long-password');
    return new MockAccountsApi(backend, auth);
  };

  return { backend, ownerApi, join, householdId: created.household_id, childId: created.child_id };
}

describe('the picture reaches everyone in the household', () => {
  it('is written by the owner and read back by the other parent', async () => {
    const h = await household();
    const saved = await h.ownerApi.setChildPhoto(h.householdId, h.childId, JPEG);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    // the PATH is what the row carries, and it is the one the bucket's policy can read
    expect(saved.photo.photo_path).toBe(childPhotoPath(h.householdId, h.childId));
    expect(saved.photo.photo_path.split('/')[0]).toBe(h.householdId);

    const other = await h.join('PARENT', 'other@example.test');
    const state = await other.bootstrapState();
    const child = state.children.find(c => c.id === h.childId);
    expect(child?.photo_path).toBe(saved.photo.photo_path);
    expect(child?.photo_updated_at).toBe(saved.photo.photo_updated_at);
    // ...and the picture itself is fetched, never carried on the row
    expect(child).not.toHaveProperty('photo_data');
    expect(await other.childPhotoUrl(saved.photo.photo_path)).toContain('base64,');
  });

  it('is refused for a caregiver, whatever the phone believed about the role', async () => {
    const h = await household();
    const caregiver = await h.join('CAREGIVER', 'sitter@example.test');
    const r = await caregiver.setChildPhoto(h.householdId, h.childId, JPEG);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    // ...but they SEE it, which is the other half of the boundary
    await h.ownerApi.setChildPhoto(h.householdId, h.childId, JPEG);
    const state = await caregiver.bootstrapState();
    expect(state.children.find(c => c.id === h.childId)?.photo_path).not.toBeNull();
  });

  /**
   * A household is not allowed to read another one's object, and the fake enforces the same
   * predicate the bucket does (`app.is_member` over the path's first segment). This is the
   * acceptance test MEDIA.md §2 is asking for, one level down from Postgres.
   */
  it('hands back nothing for a path belonging to another household', async () => {
    const a = await household();
    const b = await household();
    const saved = await b.ownerApi.setChildPhoto(b.householdId, b.childId, JPEG);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(await a.ownerApi.childPhotoUrl(saved.photo.photo_path)).toBeNull();
  });

  it('removes the row and the object together', async () => {
    const h = await household();
    const saved = await h.ownerApi.setChildPhoto(h.householdId, h.childId, JPEG);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(await h.ownerApi.clearChildPhoto(h.householdId, h.childId)).toEqual({ ok: true });
    const state = await h.ownerApi.bootstrapState();
    const child = state.children.find(c => c.id === h.childId);
    expect(child?.photo_path).toBeNull();
    expect(child?.photo_updated_at).toBeNull();
    expect(await h.ownerApi.childPhotoUrl(saved.photo.photo_path)).toBeNull();
  });

  /** A replacement has to be SEEN, which is what the stamp is for — see `childPhotoCacheName`. */
  it('stamps every write so a replacement is not read out of a stale cache', async () => {
    let clock = Date.now();
    const h = await household(() => clock);
    const first = await h.ownerApi.setChildPhoto(h.householdId, h.childId, JPEG);
    clock += 60_000;
    const second = await h.ownerApi.setChildPhoto(h.householdId, h.childId, JPEG);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.photo.photo_path).toBe(first.photo.photo_path);
    expect(second.photo.photo_updated_at).not.toBe(first.photo.photo_updated_at);
  });
});

describe('the name and the date of birth can be corrected', () => {
  it('is written by a parent and read back by the other one', async () => {
    const h = await household();
    const saved = await h.ownerApi.updateChild(h.householdId, h.childId, {
      name: 'Clara',
      birth_date: '2026-03-02',
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.child.name).toBe('Clara');
    expect(saved.child.birth_date).toBe('2026-03-02');
    const other = await h.join('PARENT', 'other@example.test');
    const state = await other.bootstrapState();
    expect(state.children.find(c => c.id === h.childId)).toMatchObject({
      name: 'Clara',
      birth_date: '2026-03-02',
    });
  });

  it('refuses a future date and a caregiver', async () => {
    const h = await household();
    const future = await h.ownerApi.updateChild(h.householdId, h.childId, {
      name: 'Chiara',
      birth_date: '2099-01-01',
    });
    expect(future).toMatchObject({ ok: false, status: 422 });
    const sitter = await h.join('CAREGIVER', 'sitter@example.test');
    const refused = await sitter.updateChild(h.householdId, h.childId, {
      name: 'Nope',
      birth_date: '2026-03-02',
    });
    expect(refused).toMatchObject({ ok: false, status: 403 });
  });

  it('renames a baby on the way and will not set the birth here', async () => {
    const h = await household();
    const added = await h.ownerApi.addChild(h.householdId, {
      name: 'Baby',
      birth_date: null,
      due_date: '2026-12-01',
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const named = await h.ownerApi.updateChild(h.householdId, added.child.id, {
      name: 'Ren',
      birth_date: null,
    });
    expect(named).toMatchObject({ ok: true, child: { name: 'Ren', birth_date: null } });
    const birth = await h.ownerApi.updateChild(h.householdId, added.child.id, {
      name: 'Ren',
      birth_date: '2026-06-01',
    });
    expect(birth).toMatchObject({ ok: false, status: 422 });
  });
});

describe('the pipeline', () => {
  /**
   * THE RE-ENCODE IS THE PRIVACY STEP. A photo off a phone carries EXIF — GPS, device, time —
   * and it is the JPEG re-encode that drops it. Anything that let an original file reach the
   * upload would publish a baby's home address to the household, so the bytes come from
   * `saveAsync` and nowhere else, and the picker is asked not to hand EXIF over either.
   */
  it('always re-encodes, and never uploads a file it was handed', () => {
    expect(pipeline).toContain('saveAsync({');
    expect(pipeline).toContain('format: SaveFormat.JPEG');
    expect(pipeline).toContain('exif: false');
    expect(sheet).toContain('await prepareChildPhoto(picked.uri)');
    // the uri is prepared before the API sees anything; nothing sends `picked.uri` onward
    expect(sheet.indexOf('prepareChildPhoto')).toBeLessThan(sheet.indexOf('api.setChildPhoto'));
    expect(sheet).not.toMatch(/setChildPhoto\([^)]*picked\.uri/);
  });

  it('crops square and resizes to the one size the constants name', () => {
    expect(pipeline).toContain('.crop({');
    expect(pipeline).toContain('resize({ width: CHILD_PHOTO_SIDE, height: CHILD_PHOTO_SIDE })');
    expect(pipeline).toContain('Math.min(loaded.width, loaded.height)');
  });

  it('never asks for a public url, and always for a signed one', () => {
    expect(supabase).toContain('createSignedUrl(path, CHILD_PHOTO_URL_TTL_SECONDS)');
    expect(supabase).not.toContain('getPublicUrl');
  });

  /** A cold start with no network still shows the photo already on the phone. */
  it('prefers the cached file and only then spends a signed url', () => {
    expect(context).toContain('cachedChildPhoto(c.id, c.photo_updated_at)');
    expect(context.indexOf('cachedChildPhoto')).toBeLessThan(context.indexOf('api.childPhotoUrl'));
    // and a path that is not this household's and this child's is never even requested
    expect(context).toContain('childPhotoBelongsTo(c.photo_path, c.household_id, c.id)');
  });

  it('caches the bytes before re-reading the account, so the avatar does not blink', () => {
    expect(sheet).toContain('cacheChildPhoto(child.id, r.photo.photo_updated_at, bytes)');
    expect(sheet.indexOf('cacheChildPhoto')).toBeLessThan(sheet.indexOf('actions.refreshAccount'));
    expect(sheet).toContain('forgetChildPhoto(child.id)');
  });
});

describe('the surfaces', () => {
  it('opens from Family, from the switcher, and through the one shell route', () => {
    expect(family).toContain('shell.openChildPhoto(c.id)');
    expect(switcher).toContain('shell.openChildPhoto(id)');
    expect(shell).toContain("ov?.kind === 'childPhoto'");
    expect(shell).toContain('<ChildPhotoSheet');
    // the switcher closes before it opens the sheet: two modal layers arguing is the defect
    expect(switcher.indexOf('onClose();')).toBeLessThan(switcher.indexOf('shell.openChildPhoto'));
  });

  it('offers the name and the date of birth beside the photo, from Family and from the chip', () => {
    expect(sheet).toContain('label={CHILD_DETAILS.name}');
    expect(sheet).toContain('label={CHILD_DETAILS.birth}');
    expect(sheet).toContain('api.updateChild');
    expect(sheet).toContain('testID="childphoto.save"');
    // a baby on the way is renamed here; the birth itself stays on Today's card
    expect(sheet).toContain('birth_date: null');
    // the chip's bar opens the same sheet Family's children row does, not a row per field
    expect(switcher).toContain('children.length === 1 || on');
    expect(switcher).toContain('Name, date of birth and photo');
    expect(switcher).not.toContain('Change the name');
    expect(switcher).not.toContain('Change the date of birth');
    expect(family).toContain('Name, date of birth and photo');
  });

  it('shows the face in the top bar, the switcher and the Family list', () => {
    expect(screen).toContain('photoUri: child.photoUri');
    expect(switcher).toContain('avatar={{ name: c.name,');
    expect(family).toContain('avatar={{ name: c.name,');
  });

  /**
   * A CAREGIVER SEES THE PICTURE AND NO BUTTONS. `child_photo_write` is `app.can_admin`, so
   * their tap is a 403 whatever this screen believed — and a control that always fails is worse
   * than one that is not there.
   */
  it('hides the controls from anyone the server would refuse, and says why', () => {
    expect(sheet).toContain('canSetChildPhoto(household?.role ?? null)');
    expect(sheet).toContain('{canEdit ? (');
    expect(sheet).toContain('testID="childphoto.read_only"');
    expect(CHILD_PHOTO_COPY.readOnly).toMatch(/parent|owner/i);
  });
});

/**
 * THE PROMISES ARE TESTED BECAUSE THEY ARE PROMISES. docs/MEDIA.md §1 commits the product to
 * four things about this one picture, and a commitment that lives only in JSX is one nothing
 * can hold the app to.
 */
describe('what the sheet promises', () => {
  const privacy = CHILD_PHOTO_COPY.privacy.toLowerCase();

  it('says household only, used for nothing else, and removing deletes it', () => {
    expect(privacy).toContain('household only');
    expect(privacy).toContain('never used for anything else');
    expect(privacy).toContain('deletes the file');
    // NibbleCue has no community and no widgets, so the promise names neither
    expect(privacy).not.toContain('community');
    expect(privacy).not.toContain('widget');
    expect(sheet).toContain('testID="childphoto.privacy"');
  });

  it('names the child, because the sheet holds the name and the date as well as the photo', () => {
    expect(childPhotoTitle('Chiara')).toBe('Chiara');
    expect(childPhotoTitle('  ')).toBe('Child');
  });

  it('tells a parent whether to try again, which "something went wrong" never does', () => {
    expect(childPhotoFailure(403)).toBe(CHILD_PHOTO_COPY.forbidden);
    expect(childPhotoFailure(0)).toBe(CHILD_PHOTO_COPY.offline);
    expect(childPhotoFailure(503)).toBe(CHILD_PHOTO_COPY.offline);
    expect(childPhotoFailure(422)).toBe(CHILD_PHOTO_COPY.failed);
    expect(CHILD_PHOTO_COPY.offline).toContain('not saved');
  });

  /** The default is the generated circle, and the copy never calls it a missing thing. */
  it('offers a photo rather than reporting the absence of one', () => {
    expect(CHILD_PHOTO_COPY.none).toBe('Add a profile photo');
    for (const line of [CHILD_PHOTO_COPY.none, CHILD_PHOTO_COPY.lede, CHILD_PHOTO_COPY.set]) {
      expect(line.toLowerCase(), line).not.toContain('no photo');
      expect(line.toLowerCase(), line).not.toContain('missing');
    }
  });
});
