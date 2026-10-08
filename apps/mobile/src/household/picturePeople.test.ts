/**
 * WHOSE PICTURES A PHONE DRAWS, AND WHICH READING OF EACH IT BELIEVES (migration 0148). The live
 * seats, the rows a screen read itself and the viewer's own account read, merged by the later
 * stamp; a member who left, or whose seat ended, is nobody's picture.
 */
import { describe, expect, it } from 'vitest';
import type { MemberPictureSeat } from '../db/queries/memberPictures';
import { seatLive } from '../db/queries/memberPictures';
import { myPicture, pictureKey, picturePeople } from './picturePeople';
import { waitingOf } from './pictureWaiting';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const DANA = '11111111-1111-4111-8111-111111111111';
const SAM = '22222222-2222-4222-8222-222222222222';
const MIA = '33333333-3333-4333-8333-333333333333';
const GONE = '44444444-4444-4444-8444-444444444444';

const seat = (id: string, over: Partial<MemberPictureSeat> = {}): MemberPictureSeat => ({
  id,
  removed_at: null,
  expires_at: null,
  avatar_path: null,
  avatar_preset: null,
  avatar_updated_at: null,
  ...over,
});

describe('who is somebody now', () => {
  it('is a seat not left and not past its end', () => {
    expect(seatLive(seat(DANA), NOW)).toBe(true);
    expect(seatLive(seat(DANA, { removed_at: '2026-09-29T00:00:00Z' }), NOW)).toBe(false);
    expect(seatLive(seat(DANA, { expires_at: '2026-09-30T11:59:59Z' }), NOW)).toBe(false);
    expect(seatLive(seat(DANA, { expires_at: '2026-09-30T12:00:01Z' }), NOW)).toBe(true);
  });
});

describe('picturePeople', () => {
  it('draws the live seats and the viewer, and nobody who left or whose seat ended', () => {
    const people = picturePeople({
      viewer: DANA,
      account: { avatar_preset: 'bun', avatar_updated_at: '2026-09-30T10:00:00Z' },
      seats: [
        seat(SAM, { avatar_preset: 'side-part', avatar_updated_at: '2026-09-29T10:00:00Z' }),
        seat(GONE, { removed_at: '2026-09-29T00:00:00Z', avatar_preset: 'crop' }),
        seat(MIA, { expires_at: '2026-09-30T09:00:00Z', avatar_preset: 'shoulder' }),
      ],
      learned: [],
      nowMs: NOW,
    });
    expect([...people.keys()].sort()).toEqual([DANA, SAM].sort());
    expect(people.get(DANA)?.avatar_preset).toBe('bun');
    expect(people.get(SAM)?.avatar_preset).toBe('side-part');
  });

  it('believes the later reading of a person, wherever it came from', () => {
    // the mirror has an old drawing for Sam; the Family page's roster has his removal, later
    const people = picturePeople({
      viewer: DANA,
      account: null,
      seats: [seat(SAM, { avatar_preset: 'side-part', avatar_updated_at: '2026-09-29T10:00:00Z' })],
      learned: [
        {
          user_id: SAM,
          avatar_path: null,
          avatar_preset: null,
          avatar_updated_at: '2026-09-30T08:00:00+00:00',
        },
      ],
      nowMs: NOW,
    });
    expect(people.get(SAM)).toEqual({
      avatar_path: null,
      avatar_preset: null,
      avatar_updated_at: '2026-09-30T08:00:00+00:00',
    });
    // the viewer is always somebody, with no picture until one is read
    expect(people.get(DANA)).toEqual({
      avatar_path: null,
      avatar_preset: null,
      avatar_updated_at: null,
    });
  });

  it('takes the viewer’s own account read over an older mirror row, and a newer mirror row over it', () => {
    const older = picturePeople({
      viewer: DANA,
      account: { avatar_preset: 'bun', avatar_updated_at: '2026-09-30T10:00:00Z' },
      seats: [seat(DANA, { avatar_preset: 'shoulder', avatar_updated_at: '2026-09-30T09:00:00Z' })],
      learned: [],
      nowMs: NOW,
    });
    expect(older.get(DANA)?.avatar_preset).toBe('bun');
    const newer = picturePeople({
      viewer: DANA,
      account: { avatar_preset: 'bun', avatar_updated_at: '2026-09-30T10:00:00Z' },
      seats: [seat(DANA, { avatar_preset: 'shoulder', avatar_updated_at: '2026-09-30T11:00:00Z' })],
      learned: [],
      nowMs: NOW,
    });
    expect(newer.get(DANA)?.avatar_preset).toBe('shoulder');
  });

  it('puts a person a screen read in the answer even before the mirror has them', () => {
    const people = picturePeople({
      viewer: DANA,
      account: null,
      seats: [],
      learned: [{ user_id: SAM.toUpperCase(), avatar_preset: 'side-part' }],
      nowMs: NOW,
    });
    expect(people.get(SAM)?.avatar_preset).toBe('side-part');
  });
});

describe('the viewer’s own picture, the waiting choice first', () => {
  it('is what waits, then what the server has', () => {
    expect(myPicture(DANA, {}, waitingOf({ kind: 'drawing', id: 'bun' }, 't'))).toEqual({
      kind: 'drawing',
      id: 'bun',
    });
    expect(myPicture(DANA, {}, waitingOf({ kind: 'photo', jpeg: Uint8Array.of(1) }, 't'))).toEqual({
      kind: 'photo',
    });
    expect(myPicture(DANA, { avatar_preset: 'bun' }, waitingOf({ kind: 'initial' }, 't'))).toEqual({
      kind: 'initial',
    });
    expect(myPicture(DANA, { avatar_path: `${DANA}/picture.jpg` }, null)).toEqual({
      kind: 'photo',
    });
    expect(myPicture(DANA, undefined, null)).toEqual({ kind: 'initial' });
  });

  it('changes the resolution key whenever any picture, or the waiting choice, does', () => {
    const people = picturePeople({
      viewer: DANA,
      account: null,
      seats: [seat(SAM)],
      learned: [],
      nowMs: NOW,
    });
    const a = pictureKey(people, DANA, null);
    const b = pictureKey(people, DANA, waitingOf({ kind: 'initial' }, 't1'));
    const c = pictureKey(people, DANA, waitingOf({ kind: 'initial' }, 't2'));
    expect(new Set([a, b, c]).size).toBe(3);
    const moved = picturePeople({
      viewer: DANA,
      account: null,
      seats: [seat(SAM, { avatar_updated_at: '2026-09-30T11:00:00Z' })],
      learned: [],
      nowMs: NOW,
    });
    expect(pictureKey(moved, DANA, null)).not.toBe(a);
  });
});
