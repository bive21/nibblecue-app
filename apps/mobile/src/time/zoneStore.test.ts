/**
 * The phone's own clock while traveling (the owner, 2026-09-23), as the app keeps it: one store,
 * re-read on every foreground, the choice to keep home time lasting one trip, the card once a trip.
 */
import { parseZoneRecord } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { createZoneStore, viewOf, ZONE_KEYS, type ZoneStored } from './zoneStore';

const NY = 'America/New_York';
const PARIS = 'Europe/Paris';
const TOKYO = 'Asia/Tokyo';
const SEPT = Date.UTC(2026, 8, 23, 12);

function harness(opts: { device?: string; stored?: Partial<ZoneStored>; failLoad?: boolean } = {}) {
  let device = opts.device ?? NY;
  let now = SEPT;
  const saved = new Map<string, string | null>();
  const loads: string[] = [];
  const store = createZoneStore({
    readDevice: () => device,
    now: () => now,
    load: async householdId => {
      loads.push(householdId);
      if (opts.failLoad === true) throw new Error('no database');
      return { home: NY, keepHomeIn: null, record: [], seenIn: null, ...opts.stored };
    },
    persist: async (key, value) => {
      saved.set(key, value);
    },
  });
  return {
    store,
    saved,
    loads,
    view: () => viewOf(store.getState(), now),
    fly: (zone: string, laterMs = 3_600_000) => {
      device = zone;
      now += laterMs;
      store.refreshDevice();
    },
  };
}

describe('the phone reads its own clock', () => {
  it('at home, home is the phone’s zone and there is nothing to say', async () => {
    const h = harness();
    await h.store.loadFor('hh');
    expect(h.view()).toMatchObject({
      zone: NY,
      away: false,
      keepingHome: false,
      showNotice: false,
    });
  });

  it('after landing, the next foreground moves every time on the phone to the new clock', async () => {
    const h = harness();
    await h.store.loadFor('hh');
    h.fly(PARIS);
    expect(h.view()).toMatchObject({ zone: PARIS, home: NY, away: true, showNotice: true });
  });

  it('before the household’s row is read, the phone’s own zone is the answer', () => {
    const h = harness({ device: PARIS });
    expect(h.view()).toMatchObject({ zone: PARIS, home: null, away: false });
  });
});

describe('keeping home time is for one trip', () => {
  it('reads home’s clock while away, and says so instead of the card', async () => {
    const h = harness();
    await h.store.loadFor('hh');
    h.fly(PARIS);
    h.store.setKeepHome(true);
    expect(h.view()).toMatchObject({ zone: NY, away: true, keepingHome: true, showNotice: false });
    expect(h.saved.get(ZONE_KEYS.keepHomeIn)).toBe(PARIS);
  });

  it('lapses by itself on the next trip, and at home', async () => {
    const h = harness();
    await h.store.loadFor('hh');
    h.fly(PARIS);
    h.store.setKeepHome(true);
    h.fly(TOKYO);
    expect(h.view()).toMatchObject({ zone: TOKYO, keepingHome: false });
    h.fly(NY);
    h.fly(PARIS);
    // Paris again on a later trip: the work trip's choice ended with the work trip
    expect(h.view()).toMatchObject({ zone: PARIS, keepingHome: false, showNotice: true });
    expect(h.saved.get(ZONE_KEYS.keepHomeIn)).toBeNull();
  });

  it('lapses on a phone that moved while the app was closed', async () => {
    const h = harness({ device: TOKYO, stored: { keepHomeIn: PARIS, seenIn: PARIS } });
    await h.store.loadFor('hh');
    expect(h.view()).toMatchObject({ zone: TOKYO, keepingHome: false, showNotice: true });
  });

  it('can be undone', async () => {
    const h = harness();
    await h.store.loadFor('hh');
    h.fly(PARIS);
    h.store.setKeepHome(true);
    h.store.setKeepHome(false);
    expect(h.view()).toMatchObject({ zone: PARIS, keepingHome: false });
    expect(h.saved.get(ZONE_KEYS.keepHomeIn)).toBeNull();
  });
});

describe('the card shows once a trip', () => {
  it('is gone once dismissed, and back for the next trip', async () => {
    const h = harness();
    await h.store.loadFor('hh');
    h.fly(PARIS);
    h.store.dismissNotice();
    expect(h.view().showNotice).toBe(false);
    expect(h.saved.get(ZONE_KEYS.seenIn)).toBe(PARIS);
    h.fly(TOKYO);
    expect(h.view().showNotice).toBe(true);
  });

  it('is not shown in a city on the same clock as home', async () => {
    const h = harness({ stored: { home: 'Europe/Berlin' }, device: 'Europe/Berlin' });
    await h.store.loadFor('hh');
    h.fly(PARIS);
    expect(h.view()).toMatchObject({ zone: PARIS, away: false, showNotice: false });
  });
});

describe('where the phone has been', () => {
  it('is noted each time the clock it reads in moves, and saved', async () => {
    const h = harness();
    await h.store.loadFor('hh');
    h.fly(PARIS);
    h.fly(NY);
    const record = h.store.getState().record;
    expect(record.map(s => s.zone)).toEqual([NY, PARIS, NY]);
    expect(parseZoneRecord(h.saved.get(ZONE_KEYS.record) ?? null)).toEqual(record);
  });

  it('notes home, not the phone’s zone, while home time is kept', async () => {
    const h = harness();
    await h.store.loadFor('hh');
    h.fly(PARIS);
    h.store.setKeepHome(true);
    expect(h.store.getState().record.map(s => s.zone)).toEqual([NY, PARIS, NY]);
  });

  it('is never written over before it has been read', async () => {
    const earlier = [{ fromMs: SEPT - 86_400_000, zone: PARIS }];
    const h = harness({ stored: { record: earlier } });
    // a foreground arrives while the read is still on its way
    h.fly(TOKYO);
    expect(h.saved.has(ZONE_KEYS.record)).toBe(false);
    await h.store.loadFor('hh');
    expect(h.store.getState().record.map(s => s.zone)).toEqual([PARIS, TOKYO]);
  });

  it('is not noted at all when the read fails', async () => {
    const h = harness({ failLoad: true });
    await h.store.loadFor('hh');
    h.fly(PARIS);
    expect(h.saved.size).toBe(0);
    expect(h.view().zone).toBe(PARIS);
  });

  it('a second read for the same household moves only the home zone', async () => {
    let home = NY;
    const saved = new Map<string, string | null>();
    let device = NY;
    const store = createZoneStore({
      readDevice: () => device,
      now: () => SEPT,
      load: async () => ({ home, keepHomeIn: null, record: [], seenIn: null }),
      persist: async (k, v) => {
        saved.set(k, v);
      },
    });
    await store.loadFor('hh');
    device = PARIS;
    store.refreshDevice();
    store.setKeepHome(true);
    home = 'America/Chicago';
    await store.loadFor('hh');
    // the choice made in between is not undone by a read that raced it
    expect(store.getState()).toMatchObject({ home: 'America/Chicago', keepHomeIn: PARIS });
  });
});

describe('the home the account carries', () => {
  it('is enough on its own: a phone with no households row still knows it is away', async () => {
    // mock mode never writes the local households row, so the mirror has no home to give
    const h = harness({ stored: { home: null } });
    await h.store.loadFor('hh');
    h.store.setAccountHome(NY);
    h.fly(PARIS);
    expect(h.view()).toMatchObject({ zone: PARIS, home: NY, away: true, showNotice: true });
  });

  it('wins over the mirror’s copy, which lags until the next pull', async () => {
    const h = harness({ device: PARIS });
    await h.store.loadFor('hh');
    expect(h.view()).toMatchObject({ home: NY, away: true });
    h.store.setAccountHome(PARIS);
    expect(h.view()).toMatchObject({ zone: PARIS, home: PARIS, away: false, showNotice: false });
  });

  it('once home has moved here, the trip is over: no card, and home time is simply the time', async () => {
    const h = harness();
    await h.store.loadFor('hh');
    h.fly(PARIS);
    h.store.setKeepHome(true);
    expect(h.view()).toMatchObject({ zone: NY, keepingHome: true });
    // the owner makes Paris home
    h.store.setAccountHome(PARIS);
    expect(h.view()).toMatchObject({
      zone: PARIS,
      home: PARIS,
      away: false,
      keepingHome: false,
      showNotice: false,
    });
    // and the record notes the clock the phone reads in from that moment
    expect(h.store.getState().record.at(-1)?.zone).toBe(PARIS);
  });
});
