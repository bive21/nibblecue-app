import { afterEach, describe, expect, it } from 'vitest';
import { seedHousehold } from '../testing/fixtures';
import { deviceId, setInstallIdStore } from './ids';

afterEach(() => setInstallIdStore(null));

describe('one install id across every family’s file (0153)', () => {
  it('gives a second family’s new file the id the first file minted', async () => {
    const first = await seedHousehold();
    const second = await seedHousehold();
    try {
      const a = await deviceId(first.db);
      const b = await deviceId(second.db);
      expect(b).toBe(a);
      // and it is written into the second file, so it holds without the shared copy
      setInstallIdStore(null);
      expect(await deviceId(second.db)).toBe(a);
    } finally {
      first.restoreIds();
      second.restoreIds();
    }
  });
});
