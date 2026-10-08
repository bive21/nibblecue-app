import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../prefs';
import {
  DEFAULT_TODAY_SECTIONS,
  loadTodaySections,
  parseTodaySections,
  saveTodaySections,
  TODAY_SECTIONS_KEY,
} from './sectionPrefs';

const store = (value: string | null): KeyValueStore => {
  const map = new Map<string, string>(value === null ? [] : [[TODAY_SECTIONS_KEY, value]]);
  return {
    keys: () => Promise.resolve([...map.keys()]),
    get: (k: string) => Promise.resolve(map.get(k) ?? null),
    set: (k: string, v: string) => {
      map.set(k, v);
      return Promise.resolve();
    },
    remove: (k: string) => {
      map.delete(k);
      return Promise.resolve();
    },
  };
};

describe('hiding a section on Today', () => {
  it('shows everything until somebody says otherwise', () => {
    expect(DEFAULT_TODAY_SECTIONS).toEqual({ care: true });
    expect(parseTodaySections(null)).toEqual({ care: true });
  });

  it('hides only on an explicit false', () => {
    expect(parseTodaySections('{"care":false}').care).toBe(false);
    expect(parseTodaySections('{"care":true}').care).toBe(true);
  });

  /**
   * A READ THAT FAILED IS NOT A CHOICE. Anything a newer build, an older one or a half-written
   * value leaves behind has to read as "show it": a section quietly missing from Today is the
   * kind of bug a parent reports as "the app lost my baby's medicine".
   */
  it.each(['', 'null', '[]', '"care"', '{"care":"no"}', '{"care":0}', '{}', 'not json'])(
    'reads %s as show it',
    raw => {
      expect(parseTodaySections(raw).care).toBe(true);
    },
  );

  it('round-trips through the store', async () => {
    const s = store(null);
    await saveTodaySections({ care: false }, s);
    expect(await loadTodaySections(s)).toEqual({ care: false });
    await saveTodaySections({ care: true }, s);
    expect(await loadTodaySections(s)).toEqual({ care: true });
  });
});
