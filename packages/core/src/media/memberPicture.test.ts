/**
 * A PERSON'S OWN PICTURE (migration 0148). The path is the authorisation input, as the child
 * photo's is: `member_photo_read` lets in whoever shares a household with the person the FIRST
 * segment names, and the writes accept only the caller's own `<id>/picture.jpg`. A path built
 * wrong is somebody else's face or a 500 from a failed cast; a row read wrong is a stale picture.
 */
import { describe, expect, it } from 'vitest';
import { childPhotoCacheName } from './childPhoto';
import {
  isMemberAvatarId,
  laterPicture,
  MEMBER_AVATAR_ID_MAX,
  MEMBER_PHOTO_BUCKET,
  MEMBER_PHOTO_CONTENT_TYPE,
  MEMBER_PHOTO_MAX_BYTES,
  MEMBER_PHOTO_URL_TTL_SECONDS,
  memberPhotoBelongsTo,
  memberPhotoCacheName,
  memberPhotoPath,
  memberPictureOf,
  parseMemberPhotoPath,
  type MemberPictureColumns,
} from './memberPicture';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';

describe('memberPhotoPath: the person first, and one file', () => {
  it('puts the person in the segment the policy reads, and names the one file', () => {
    expect(memberPhotoPath(ME)).toBe(`${ME}/picture.jpg`);
    expect(memberPhotoPath(ME.toUpperCase())).toBe(`${ME}/picture.jpg`);
  });

  it('refuses anything that is not a uuid', () => {
    expect(() => memberPhotoPath('me')).toThrow(TypeError);
    expect(() => memberPhotoPath('')).toThrow(TypeError);
    expect(() => memberPhotoPath(`${ME}/../${OTHER}`)).toThrow(TypeError);
  });

  it('reads a path back, and nothing else', () => {
    expect(parseMemberPhotoPath(`${ME}/picture.jpg`)).toEqual({ userId: ME });
    expect(parseMemberPhotoPath(`${ME.toUpperCase()}/picture.jpg`)).toEqual({ userId: ME });
    for (const bad of [
      null,
      undefined,
      '',
      `${ME}/other.jpg`,
      `${ME}/picture.png`,
      `x/${ME}/picture.jpg`,
      `not-a-uuid/picture.jpg`,
      `${ME}`,
    ])
      expect(parseMemberPhotoPath(bad), String(bad)).toBeNull();
  });

  it('holds a path to its own person before anything is fetched', () => {
    expect(memberPhotoBelongsTo(memberPhotoPath(ME), ME)).toBe(true);
    expect(memberPhotoBelongsTo(memberPhotoPath(ME), ME.toUpperCase())).toBe(true);
    expect(memberPhotoBelongsTo(memberPhotoPath(OTHER), ME)).toBe(false);
    expect(memberPhotoBelongsTo(null, ME)).toBe(false);
  });

  it('keeps to the child photo’s limits and its private bucket', () => {
    expect(MEMBER_PHOTO_BUCKET).toBe('member-photos');
    expect(MEMBER_PHOTO_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(MEMBER_PHOTO_CONTENT_TYPE).toBe('image/jpeg');
    expect(MEMBER_PHOTO_URL_TTL_SECONDS).toBe(600);
  });

  it('caches a version by its stamp as an instant, the way the child photo does', () => {
    const a = memberPhotoCacheName(ME, '2026-09-30T10:00:00.000Z');
    expect(a).toBe(memberPhotoCacheName(ME, '2026-09-30T10:00:00+00:00'));
    expect(a).not.toBe(memberPhotoCacheName(ME, '2026-09-30T10:00:01.000Z'));
    expect(a).toBe(childPhotoCacheName(ME, '2026-09-30T10:00:00.000Z'));
  });
});

describe('a drawing is an id of one shape', () => {
  it('takes lower-case words joined by single hyphens, and nothing else', () => {
    for (const ok of ['bun', 'long-waves', 'a1', 'short-crop-2'])
      expect(isMemberAvatarId(ok)).toBe(true);
    for (const bad of [
      '',
      'Coils',
      'two  words',
      '-lead',
      'trail-',
      'a--b',
      'a_b',
      'x'.repeat(MEMBER_AVATAR_ID_MAX + 1),
      7,
      null,
    ])
      expect(isMemberAvatarId(bad), String(bad)).toBe(false);
  });
});

describe('memberPictureOf: which of the three a row names', () => {
  it('is the initial when nothing is set, or on a row from before 0148', () => {
    expect(memberPictureOf(ME, {})).toEqual({ kind: 'initial' });
    expect(
      memberPictureOf(ME, { avatar_path: null, avatar_preset: null, avatar_updated_at: null }),
    ).toEqual({ kind: 'initial' });
  });

  it('is a drawing by its id, and a photo by its own path with its stamp', () => {
    expect(memberPictureOf(ME, { avatar_preset: 'long-waves' })).toEqual({
      kind: 'drawing',
      id: 'long-waves',
    });
    expect(
      memberPictureOf(ME, { avatar_path: memberPhotoPath(ME), avatar_updated_at: 'T' }),
    ).toEqual({ kind: 'photo', path: memberPhotoPath(ME), updatedAt: 'T' });
  });

  it('never fetches somebody else’s path and never draws a malformed id', () => {
    expect(memberPictureOf(ME, { avatar_path: memberPhotoPath(OTHER) })).toEqual({
      kind: 'initial',
    });
    expect(memberPictureOf(ME, { avatar_preset: 'Not An Id' })).toEqual({ kind: 'initial' });
  });
});

describe('laterPicture: two readings of one person, and the one to believe', () => {
  const at = (s: string | null): MemberPictureColumns => ({ avatar_updated_at: s });
  it('believes the later stamp, a removal included', () => {
    const set: MemberPictureColumns = { ...at('2026-09-30T10:00:00Z'), avatar_preset: 'bun' };
    const removed: MemberPictureColumns = {
      ...at('2026-09-30T11:00:00+00:00'),
      avatar_preset: null,
    };
    expect(laterPicture(set, removed)).toBe(removed);
    expect(laterPicture(removed, set)).toBe(removed);
  });

  it('keeps the first on a tie or with no stamp at all: the caller’s fresher source', () => {
    const a = at('2026-09-30T10:00:00Z');
    const b = at('2026-09-30T10:00:00.000Z');
    expect(laterPicture(a, b)).toBe(a);
    const none = at(null);
    expect(laterPicture(none, {})).toBe(none);
    expect(laterPicture(none, a)).toBe(a);
  });
});
