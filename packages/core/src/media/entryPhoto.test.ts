/**
 * The entry-photo grammar. The path is cast to `uuid` by a storage policy, so a bad id is a
 * Postgres RAISE rather than a refusal — which is why the builder throws here instead.
 */
import { describe, expect, it } from 'vitest';
import {
  ENTRY_PHOTO_BUCKET,
  ENTRY_PHOTO_LONG_EDGE,
  ENTRY_PHOTO_MAX_BYTES,
  entryPhotoBelongsTo,
  entryPhotoCacheName,
  entryPhotoPath,
  parseEntryPhotoPath,
} from './entryPhoto';

const HH = '11111111-1111-4111-8111-111111111111';
const ACT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

describe('the entry photo path', () => {
  it('is household over activity, lower-cased, inside the private bucket', () => {
    expect(entryPhotoPath(HH.toUpperCase(), ACT)).toBe(`${HH}/${ACT}.jpg`);
    expect(ENTRY_PHOTO_BUCKET).toBe('entry-photos');
  });

  it('throws on anything that is not a uuid, rather than handing the policy a cast it cannot do', () => {
    expect(() => entryPhotoPath('nope', ACT)).toThrow(TypeError);
    expect(() => entryPhotoPath(HH, '../../etc/passwd')).toThrow(TypeError);
    expect(() => entryPhotoPath(HH, '')).toThrow(TypeError);
  });

  it('round-trips, and refuses a path this app did not write', () => {
    expect(parseEntryPhotoPath(entryPhotoPath(HH, ACT))).toEqual({
      householdId: HH,
      activityId: ACT,
    });
    for (const bad of [null, undefined, '', 'a/b.jpg', `${HH}/${ACT}.png`, `${HH}/${ACT}`]) {
      expect(parseEntryPhotoPath(bad), String(bad)).toBeNull();
    }
  });

  it('will not fetch another household’s object, even when the row carries one', () => {
    expect(entryPhotoBelongsTo(`${HH}/${ACT}.jpg`, HH, ACT)).toBe(true);
    expect(entryPhotoBelongsTo(`${OTHER}/${ACT}.jpg`, HH, ACT)).toBe(false);
    expect(entryPhotoBelongsTo(`${HH}/${OTHER}.jpg`, HH, ACT)).toBe(false);
    expect(entryPhotoBelongsTo(null, HH, ACT)).toBe(false);
  });
});

describe('the cache key', () => {
  it('changes with the stamp, so a replaced photo is a miss rather than the old picture', () => {
    const a = entryPhotoCacheName(ACT, '2026-09-22T10:00:00.000Z');
    const b = entryPhotoCacheName(ACT, '2026-09-22T11:00:00.000Z');
    expect(a).not.toBe(b);
    expect(entryPhotoCacheName(ACT, '2026-09-22T10:00:00.000Z')).toBe(a);
  });

  it('is a filename whatever the column printed — no colon, slash or plus survives', () => {
    for (const stamp of ['2026-09-22 10:00:00+00', '2026-09-22T10:00:00.000Z', null]) {
      expect(entryPhotoCacheName(ACT, stamp)).toMatch(/^[0-9a-f-]+-[0-9a-z]+\.jpg$/);
    }
  });
});

describe('the sizes', () => {
  it('is four times the profile photo’s pixels, because this one gets opened and pinched', () => {
    expect(ENTRY_PHOTO_LONG_EDGE).toBe(1024);
    // and still inside the bucket's own file_size_limit with room to spare
    expect(ENTRY_PHOTO_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});
