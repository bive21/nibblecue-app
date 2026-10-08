/**
 * THE PATH IS THE AUTHORISATION INPUT, which is the reason this file is longer than the one it
 * tests. `child_photo_read` is `app.is_member(((storage.foldername(name))[1])::uuid)`: the
 * FIRST SEGMENT of the object name decides who may read it. A path built wrong is either
 * somebody else's baby or a 500 from a failed uuid cast, and neither is something a parent can
 * do anything about.
 */
import { describe, expect, it } from 'vitest';
import {
  CHILD_PHOTO_BUCKET,
  CHILD_PHOTO_CONTENT_TYPE,
  CHILD_PHOTO_MAX_BYTES,
  CHILD_PHOTO_QUALITY,
  CHILD_PHOTO_SIDE,
  CHILD_PHOTO_TYPES,
  CHILD_PHOTO_URL_TTL_SECONDS,
  canSeeChildPhoto,
  canSetChildPhoto,
  childPhotoBelongsTo,
  childPhotoCacheName,
  childPhotoPath,
  parseChildPhotoPath,
} from './childPhoto';

const H = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

describe('childPhotoPath — the household first, always', () => {
  it('puts the household in the segment the policy reads', () => {
    expect(childPhotoPath(H, C)).toBe(`${H}/${C}.jpg`);
    expect(childPhotoPath(H, C).split('/')[0]).toBe(H);
  });

  it('lower-cases both ids so one household cannot have two paths', () => {
    expect(childPhotoPath(H.toUpperCase(), C.toUpperCase())).toBe(`${H}/${C}.jpg`);
  });

  /**
   * A NON-UUID IS A THROW, NOT A PATH. The policy casts the first segment to `uuid`; a value
   * that will not cast makes Postgres raise rather than refuse, so the parent gets a 500 on
   * their own baby's photo. Finding out in the one function that builds the path is cheaper.
   */
  it('refuses anything that is not a uuid, on either side', () => {
    expect(() => childPhotoPath('not-a-uuid', C)).toThrow(TypeError);
    expect(() => childPhotoPath(H, 'child-1')).toThrow(TypeError);
    expect(() => childPhotoPath('', C)).toThrow(TypeError);
    expect(() => childPhotoPath(`${H}/../${OTHER}`, C)).toThrow(TypeError);
  });
});

describe('parseChildPhotoPath / childPhotoBelongsTo — a path off a row is not trusted', () => {
  it('round-trips a path this app wrote', () => {
    expect(parseChildPhotoPath(childPhotoPath(H, C))).toEqual({ householdId: H, childId: C });
  });

  it('is null for anything else, rather than a half-parsed pair', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'photo.jpg',
      `${H}/${C}.png`,
      `${H}/${C}`,
      `child-photos/${H}/${C}.jpg`,
      `${H}/sub/${C}.jpg`,
      'not-a-uuid/also-not.jpg',
    ]) {
      expect(parseChildPhotoPath(bad as string | null), String(bad)).toBeNull();
    }
  });

  /**
   * THE CASE THIS EXISTS FOR: a row carrying a path from a household the viewer is not in — a
   * restored backup, a botched merge, a fixture that outlived its household. The app does not
   * ask for it, so the parent sees the initial instead of a 403 they cannot act on.
   */
  it('refuses a path belonging to another household or another child', () => {
    expect(childPhotoBelongsTo(childPhotoPath(H, C), H, C)).toBe(true);
    expect(childPhotoBelongsTo(childPhotoPath(OTHER, C), H, C)).toBe(false);
    expect(childPhotoBelongsTo(childPhotoPath(H, OTHER), H, C)).toBe(false);
    expect(childPhotoBelongsTo(null, H, C)).toBe(false);
    // case is not a difference: the same photo, however the row spells the ids
    expect(childPhotoBelongsTo(childPhotoPath(H, C), H.toUpperCase(), C.toUpperCase())).toBe(true);
  });
});

/**
 * THE CACHE IS KEYED ON THE STAMP AND NOT THE PATH, and that is the whole reason
 * `photo_updated_at` is a column. One photo per child means the object path never changes, so a
 * cache keyed on the path would show the old picture forever after the other parent replaced it
 * — which is the exact failure "saved to everyone in the household" is supposed to prevent.
 */
describe('childPhotoCacheName', () => {
  it('changes when the photo changes, and only then', () => {
    const a = childPhotoCacheName(C, '2026-09-20T10:00:00.000Z');
    const b = childPhotoCacheName(C, '2026-09-20T11:30:00.000Z');
    expect(a).not.toBe(b);
    expect(childPhotoCacheName(C, '2026-09-20T10:00:00.000Z')).toBe(a);
  });

  it('names one instant once, however the stamp was printed (the owner’s avatar, 2026-09-26)', () => {
    // what the uploading phone wrote, and what Postgres prints back for the same timestamptz: the
    // phone that set the picture must find it in its own cache on the next read of the row
    const written = childPhotoCacheName(C, '2026-09-26T10:58:43.123Z');
    expect(childPhotoCacheName(C, '2026-09-26T10:58:43.123+00:00')).toBe(written);
    expect(childPhotoCacheName(C, '2026-09-26T05:58:43.123-05:00')).toBe(written);
    // a whole second prints with no fraction on the server side
    expect(childPhotoCacheName(C, '2026-09-26T10:58:43+00:00')).toBe(
      childPhotoCacheName(C, '2026-09-26T10:58:43.000Z'),
    );
    // and a different instant is still a different file
    expect(childPhotoCacheName(C, '2026-09-26T10:58:43.124Z')).not.toBe(written);
  });

  it('is a safe filename, whatever the stamp looked like', () => {
    for (const stamp of ['2026-09-20T10:00:00.000Z', null, '../../etc/passwd', '']) {
      const name = childPhotoCacheName(C, stamp);
      expect(name, name).toMatch(/^[0-9a-z-]+\.jpg$/);
      expect(name).not.toContain('/');
      expect(name).not.toContain('..');
    }
  });
});

describe('who may do what', () => {
  it('lets a parent or owner set it and everyone else only see it', () => {
    expect(canSetChildPhoto('OWNER')).toBe(true);
    expect(canSetChildPhoto('PARENT')).toBe(true);
    expect(canSetChildPhoto('CAREGIVER')).toBe(false);
    expect(canSetChildPhoto('VIEW_ONLY')).toBe(false);
    expect(canSetChildPhoto(null)).toBe(false);
    for (const role of ['OWNER', 'PARENT', 'CAREGIVER', 'VIEW_ONLY'] as const) {
      expect(canSeeChildPhoto(role), role).toBe(true);
    }
    expect(canSeeChildPhoto(null)).toBe(false);
  });
});

/** The constants are the bucket's own, and a drift between them is an upload the server refuses. */
describe('the bucket agrees with the constants', () => {
  it('matches assets/rls-policies.sql', () => {
    expect(CHILD_PHOTO_BUCKET).toBe('child-photos');
    expect(CHILD_PHOTO_MAX_BYTES).toBe(5242880);
    expect([...CHILD_PHOTO_TYPES]).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(CHILD_PHOTO_TYPES).toContain(CHILD_PHOTO_CONTENT_TYPE);
    expect(CHILD_PHOTO_SIDE).toBe(512);
    expect(CHILD_PHOTO_QUALITY).toBeGreaterThan(0);
    expect(CHILD_PHOTO_QUALITY).toBeLessThanOrEqual(1);
    // a signed URL, never a public one, and short-lived
    expect(CHILD_PHOTO_URL_TTL_SECONDS).toBeLessThanOrEqual(900);
  });
});
