import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../prefs';
import {
  clearPendingTermsAcceptance,
  loadPendingTermsAcceptance,
  pendingTermsKey,
  savePendingTermsAcceptance,
} from './pending-terms';

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

describe('a checkbox ticked at signup waits on disk for a session to record it against', () => {
  it('round-trips, is keyed by the address, and clears', async () => {
    const store = memory();
    await savePendingTermsAcceptance(store, 'Dana@Example.com', 3);
    // case and surrounding space are not part of an address; the SAME key either way
    expect([...store.map.keys()]).toEqual([pendingTermsKey('dana@example.com')]);
    expect(await loadPendingTermsAcceptance(store, 'dana@example.com')).toEqual({ version: 3 });
    expect(await loadPendingTermsAcceptance(store, '  DANA@EXAMPLE.COM  ')).toEqual({
      version: 3,
    });
    expect(await loadPendingTermsAcceptance(store, 'someone-else@example.com')).toBeNull();
    await clearPendingTermsAcceptance(store, 'dana@example.com');
    expect(await loadPendingTermsAcceptance(store, 'dana@example.com')).toBeNull();
  });

  it('treats a corrupt or stale-shape record as nothing pending rather than a crash', async () => {
    const store = memory();
    store.map.set(pendingTermsKey('dana@example.com'), '{not json');
    expect(await loadPendingTermsAcceptance(store, 'dana@example.com')).toBeNull();
    store.map.set(pendingTermsKey('dana@example.com'), JSON.stringify({ version: 0 }));
    expect(await loadPendingTermsAcceptance(store, 'dana@example.com')).toBeNull();
    store.map.set(pendingTermsKey('dana@example.com'), JSON.stringify({}));
    expect(await loadPendingTermsAcceptance(store, 'dana@example.com')).toBeNull();
  });
});
