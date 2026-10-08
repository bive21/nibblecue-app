import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../prefs';
import {
  clearPendingChildPhoto,
  loadPendingChildPhoto,
  pendingChildPhotoKey,
  photoWorthRetrying,
  savePendingChildPhoto,
  setupPhotoFileName,
} from './pending-photo';

function memory(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: async k => map.get(k) ?? null,
    set: async (k, v) => {
      map.set(k, v);
    },
    remove: async k => {
      map.delete(k);
    },
    keys: async () => [...map.keys()],
  };
}

describe('the picture from step 1 waits on disk for its child', () => {
  it('round-trips, is keyed by user, and clears', async () => {
    const store = memory();
    await savePendingChildPhoto(store, 'u1', 'file:///cache/cuddlecue/setup-photo/u1.jpg');
    expect([...store.map.keys()]).toEqual([pendingChildPhotoKey('u1')]);
    expect(await loadPendingChildPhoto(store, 'u1')).toEqual({
      uri: 'file:///cache/cuddlecue/setup-photo/u1.jpg',
    });
    expect(await loadPendingChildPhoto(store, 'u2')).toBeNull();
    await clearPendingChildPhoto(store, 'u1');
    expect(await loadPendingChildPhoto(store, 'u1')).toBeNull();
  });

  it('treats a corrupt record as nothing pending rather than a crash', async () => {
    const store = memory();
    store.map.set(pendingChildPhotoKey('u1'), '{not json');
    expect(await loadPendingChildPhoto(store, 'u1')).toBeNull();
    store.map.set(pendingChildPhotoKey('u1'), JSON.stringify({ uri: '' }));
    expect(await loadPendingChildPhoto(store, 'u1')).toBeNull();
  });

  it('retries only what a retry can change: no network or a server fault', () => {
    expect(photoWorthRetrying(0)).toBe(true);
    expect(photoWorthRetrying(503)).toBe(true);
    expect(photoWorthRetrying(403)).toBe(false);
    expect(photoWorthRetrying(413)).toBe(false);
    expect(photoWorthRetrying(422)).toBe(false);
  });

  /**
   * A SECOND PICK IS A NEW PICTURE TO WHATEVER DRAWS IT (2026-09-26). One name for every pick meant
   * one uri: step 1 kept drawing the first picture it had decoded, and `PicturePop` saw nothing new
   * to pop, while Finish sent the last one chosen.
   */
  it('parks every pick under a name of its own', () => {
    const first = setupPhotoFileName('u1', 1_790_000_000_000);
    const second = setupPhotoFileName('u1', 1_790_000_004_200);
    expect(first).not.toBe(second);
    for (const name of [first, second]) {
      expect(name.startsWith('u1-')).toBe(true);
      expect(name).toMatch(/^[0-9a-z-]+\.jpg$/);
    }
    const here = dirname(fileURLToPath(import.meta.url));
    const media = readFileSync(join(here, '../media/childPhoto.ts'), 'utf8');
    expect(media).toContain('const file = new File(dir, setupPhotoFileName(userId, Date.now()));');
    // (CuddleCue's step 1 forgets the picture a new pick replaces; NibbleCue's one-page setup asks
    // for no picture, so nothing is parked from it)
  });
});
