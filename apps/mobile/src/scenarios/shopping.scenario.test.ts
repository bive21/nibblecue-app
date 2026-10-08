/**
 * THE SHOPPING LIST ACROSS TRIPS — the owner's report of 2026-09-26, and the afternoons around it.
 *
 * The owner, verbatim: *"i added a one off in the basket, checklisted all and started a new shopping
 * list, but the one off was not removed from it."*
 *
 * WHAT HAPPENED. Since the 2026-09-19 redesign the Add supplies picker and the Supplies page drew a
 * supply as ON the list only while it had a line still to buy — but the toggle behind their + still
 * counted a line in the basket. So with everything ticked ("All done"), each + on the way to a new
 * list took that supply's BOUGHT line back out of the basket instead of adding one (recording nothing
 * against the item: the trip was never finished), and a second tap added it. The supplies seemed to
 * go back to Supplies; the one-off, which has no + anywhere, stayed in the basket of the new list —
 * "1 of 3 in the basket" before anything of the new trip was bought.
 *
 * WHAT IT DOES NOW. A + only ever adds (`toggleOnList` reads the lines still to buy), and the first
 * thing put on an "All done" list starts a new one: the trip that ended is finished first, exactly
 * as Clear finishes it (`putOnList` → `finishTrip`) — every bought line leaves, the one-off with the
 * rest, each bought supply records the day it went into the basket, and one Undo puts it all back.
 * A list with anything still to buy is a trip still going, and nothing is finished.
 *
 * Everything runs the phone's real writes (`data/lists.ts`) against the real local database and the
 * in-app server, with the same pull engine and outbox worker the phone runs, on a fake clock. The
 * screens are React and are not rendered here; what they show is read through the same core
 * functions the screens call (`toggleOnList`, `onListQty`, `basketLine`, `tripFinished`).
 */
import {
  basketLine,
  inTheBasket,
  localDayKey,
  onListQty,
  stillToBuy,
  supplyLabel,
  toggleOnList,
  tripFinished,
  type ShoppingLine,
  type SyncApi,
} from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  finishTrip,
  putBackTrip,
  putOnList,
  removeShoppingItem,
  tickShoppingItem,
  type FinishedTrip,
} from '../data/lists';
import { saveSupply } from '../data/supplies';
import type { Db } from '../db/driver';
import { shoppingItems } from '../db/queries/lists';
import { supplyItems } from '../db/queries/supplies';
import { SHOPPING } from '../lists/copy';
import { sayPutOn, tripDays } from '../lists/trip';
import { addDevice, createSyncHarness, PARTNER, type SyncHarness } from '../sync/harness';
import { runAllPhases } from '../sync/phases';
import { PullEngine } from '../sync/pull';
import type { OutboxWorker } from '../sync/worker';
import { HOUSEHOLD, USER } from '../testing/fixtures';

/** The id sources and harnesses a case opened, put back after it whatever it did. */
const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** The fixture household's own zone (`testing/fixtures.ts`), which every "today" is read in. */
const TZ = 'America/Los_Angeles';
/** 8:00 a.m. in that zone on Monday the 14th. */
const MORNING = '2026-09-14T15:00:00.000Z';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

interface Phone {
  db: Db;
  userId: string;
  /** Push what is queued, then pull what the household has — what opening the app does. */
  sync(): Promise<void>;
}

/** Dana (the owner, the harness's own device) and Sam (a parent, a second phone) over one server. */
async function household(scenario: string): Promise<{ h: SyncHarness; dana: Phone; sam: Phone }> {
  const h = await createSyncHarness({ scenario, stash: false, at: MORNING });
  cleanups.push(() => h.dispose());
  const phone = (db: Db, api: SyncApi, userId: string, worker: () => OutboxWorker): Phone => {
    const puller = new PullEngine({ db, api, clock: h.clock, householdId: HOUSEHOLD, userId });
    return {
      db,
      userId,
      sync: async () => {
        const w = worker();
        w.start();
        await w.flush('write');
        w.stop();
        await runAllPhases(puller);
      },
    };
  };
  const partner = await addDevice(h, PARTNER, { stash: false });
  return {
    h,
    dana: phone(h.db, h.api, USER, () => h.worker()),
    sam: phone(partner.db, partner.api, PARTNER, () => partner.worker()),
  };
}

const writer = (userId: string) => ({
  householdId: HOUSEHOLD,
  createdBy: userId,
  deviceId: `${userId.slice(0, 8)}-phone`,
  source: 'sheet' as const,
});

/** The list the shopping screen draws, mapped as `useShopping` maps it. */
async function listOn(db: Db): Promise<ShoppingLine[]> {
  return (await shoppingItems(db, HOUSEHOLD)).map(r => ({
    id: r.id,
    title: r.title,
    qty: r.qty,
    note: r.note ?? r.supply_notes,
    store: r.supply_store ?? r.store,
    checkedAt: r.checked_at,
    supplyId: r.supply_id,
  }));
}

/** What the parent reads: `2 of 3 in the basket`, and the lines to buy and in the basket by name. */
async function seen(db: Db) {
  const lines = await listOn(db);
  return {
    progress: basketLine(lines),
    toBuy: stillToBuy(lines)
      .map(l => l.title)
      .sort(),
    basket: inTheBasket(lines)
      .map(l => l.title)
      .sort(),
  };
}

/** Each catalog item's last-bought date on a phone, by brand. */
async function boughtDates(db: Db): Promise<Record<string, string | null>> {
  return Object.fromEntries(
    (await supplyItems(db, HOUSEHOLD)).map(r => [r.brand ?? '', r.last_bought_on]),
  );
}

/** A catalog item, the way the supply sheet saves one. */
async function supply(h: SyncHarness, db: Db, category: string, brand: string) {
  const r = await saveSupply(db, h.clock, {
    ...writer(USER),
    category,
    brand,
    product: null,
    variant: null,
    pack: null,
    store: null,
    notes: null,
    url: null,
  });
  return { id: r.supplyId, label: supplyLabel({ brand, product: null }) };
}

/**
 * THE +, on the picker or the Supplies page, as the screens run it: what the row draws
 * (`onListQty`), what the tap means (`toggleOnList`), and the write that follows — `putOnList` for
 * an add, which finishes an "All done" trip first. Returns what the tap did and what it finished.
 */
async function plus(
  h: SyncHarness,
  phone: Phone,
  item: { id: string; label: string },
): Promise<{ drawnOn: boolean; did: 'add' | 'remove'; finished: FinishedTrip | null }> {
  const lines = await listOn(phone.db);
  const drawnOn = onListQty(item.id, lines) !== null;
  const intent = toggleOnList(item.id, lines);
  if (intent.action === 'remove') {
    await removeShoppingItem(phone.db, h.clock, { ...writer(phone.userId), itemId: intent.lineId });
    return { drawnOn, did: 'remove', finished: null };
  }
  const r = await putOnList(phone.db, h.clock, {
    ...writer(phone.userId),
    ...tripDays(TZ, h.clock.now()),
    title: item.label,
    supplyId: item.id,
  });
  return { drawnOn, did: 'add', finished: r.finished };
}

/** The dashed row under the list: a one-off, through the same write. */
async function oneOff(h: SyncHarness, phone: Phone, title: string) {
  return putOnList(phone.db, h.clock, {
    ...writer(phone.userId),
    ...tripDays(TZ, h.clock.now()),
    title,
  });
}

/** Tick every line still to buy, one tap each, a minute apart. */
async function tickAll(h: SyncHarness, phone: Phone) {
  for (const l of stillToBuy(await listOn(phone.db))) {
    h.clock.advance(MIN);
    await tickShoppingItem(phone.db, h.clock, {
      ...writer(phone.userId),
      itemId: l.id,
      checked: true,
    });
  }
}

/** The server's rows for the list, by title: whether each is still on it, and whether it is ticked. */
function served(h: SyncHarness) {
  return h.server.shopping_items
    .map(r => ({
      title: String(r['title']),
      live: r['deleted_at'] == null,
      ticked: r['checked_at'] != null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title) || Number(a.live) - Number(b.live));
}

describe("the owner's afternoon: a one-off in the basket, everything ticked, a new list started", () => {
  it('the new list starts empty of the last trip — the one-off included — and the catalog knows what was bought, when', async () => {
    const { h, dana, sam } = await household('shopping-new-list');
    const diapers = await supply(h, dana.db, 'DIAPERS', 'Pampers');
    const wipes = await supply(h, dana.db, 'WIPES', 'WaterWipes');

    // the list, the way the Add supplies picker builds it — and a one-off on the dashed row
    for (const item of [diapers, wipes]) expect((await plus(h, dana, item)).did).toBe('add');
    expect((await oneOff(h, dana, 'Bananas')).finished).toBeNull();
    await dana.sync();

    // Monday at the shop: everything goes in the basket, the one-off with it — "All done"
    h.clock.advance(2 * HOUR);
    await tickAll(h, dana);
    expect(await seen(dana.db)).toEqual({
      progress: '3 of 3 in the basket',
      toBuy: [],
      basket: ['Bananas', 'Pampers', 'WaterWipes'],
    });
    expect(tripFinished(await listOn(dana.db))).toBe(true);
    await dana.sync();
    const shopDay = localDayKey(TZ, h.clock.now());

    // WEDNESDAY: the next list, from the picker. Pampers is in last trip's basket — and it is drawn
    // with a +, and the + now ADDS: it used to take the bought line back out of the basket
    h.clock.advance(2 * DAY);
    const tap = await plus(h, dana, diapers);
    expect(tap.drawnOn).toBe(false);
    expect(tap.did).toBe('add');
    // …and the trip that ended was finished first, the one-off with it
    expect(tap.finished?.lineIds).toHaveLength(3);
    expect(tap.finished?.left).toBe(0);
    expect(await seen(dana.db)).toEqual({
      progress: '0 of 1 in the basket',
      toBuy: ['Pampers'],
      basket: [],
    });
    // the supplies record the day they went into the basket — Monday, not the Wednesday of the new list
    expect(await boughtDates(dana.db)).toEqual({ Pampers: shopDay, WaterWipes: shopDay });

    // the toast says both halves, with an Undo — exactly what the picker shows
    const toasts: { message: string; undo: boolean }[] = [];
    sayPutOn(
      { show: (message, opts) => toasts.push({ message, undo: opts?.undo !== undefined }) },
      SHOPPING.addedToList(diapers.label),
      tap.finished,
      () => Promise.resolve(),
    );
    expect(toasts).toEqual([{ message: 'Added Pampers · last trip saved, 3 bought', undo: true }]);

    // a second + on the same supply takes the NEW line off again, as the toggle always did
    expect((await plus(h, dana, diapers)).did).toBe('remove');
    expect((await plus(h, dana, diapers)).did).toBe('add');

    // and the other phone, and the server, agree: nothing of last trip is on anybody's list
    await dana.sync();
    await sam.sync();
    for (const phone of [dana, sam]) {
      expect(await seen(phone.db)).toEqual({
        progress: '0 of 1 in the basket',
        toBuy: ['Pampers'],
        basket: [],
      });
      expect(await boughtDates(phone.db)).toEqual({ Pampers: shopDay, WaterWipes: shopDay });
    }
    expect(served(h).filter(r => r.live)).toEqual([
      { title: 'Pampers', live: true, ticked: false },
    ]);
    // the one-off left as a line leaves: retired, never deleted, so an Undo can bring it back
    expect(served(h).filter(r => r.title === 'Bananas')).toEqual([
      { title: 'Bananas', live: false, ticked: true },
    ]);
  });

  it('one Undo puts the whole trip back in the basket, and the dates back as they were — on both phones', async () => {
    const { h, dana, sam } = await household('shopping-new-list-undo');
    const diapers = await supply(h, dana.db, 'DIAPERS', 'Pampers');
    const wipes = await supply(h, dana.db, 'WIPES', 'WaterWipes');
    await plus(h, dana, diapers);
    await oneOff(h, dana, 'Bananas');
    await tickAll(h, dana);
    await dana.sync();
    await sam.sync();

    // Sam starts the next list on his phone, from the Supplies page's +
    h.clock.advance(DAY);
    const tap = await plus(h, sam, wipes);
    expect(tap.finished?.lineIds).toHaveLength(2);
    expect(await seen(sam.db)).toEqual({
      progress: '0 of 1 in the basket',
      toBuy: ['WaterWipes'],
      basket: [],
    });

    // …and takes the trip back with the toast's Undo: the new line stays, it was asked for
    await putBackTrip(sam.db, h.clock, { ...writer(PARTNER), trip: tap.finished as FinishedTrip });
    await sam.sync();
    await dana.sync();
    for (const phone of [dana, sam]) {
      expect(await seen(phone.db)).toEqual({
        progress: '2 of 3 in the basket',
        toBuy: ['WaterWipes'],
        basket: ['Bananas', 'Pampers'],
      });
      // Pampers had never been bought before this trip: its date goes back to none, not to a day
      expect(await boughtDates(phone.db)).toEqual({ Pampers: null, WaterWipes: null });
    }
  });
});

describe('Clear, and what is not bought', () => {
  it('a bought one-off leaves with the trip, an unticked one stays for the next list, and the next list finishes nothing', async () => {
    const { h, dana, sam } = await household('shopping-clear');
    const diapers = await supply(h, dana.db, 'DIAPERS', 'Pampers');
    const wipes = await supply(h, dana.db, 'WIPES', 'WaterWipes');
    await plus(h, dana, diapers);
    await oneOff(h, dana, 'Bananas');
    await oneOff(h, dana, 'Birthday card');
    await dana.sync();
    await sam.sync();

    // Sam at the shop: the diapers and the bananas in the basket; no birthday card to be had
    for (const title of ['Pampers', 'Bananas']) {
      const line = (await listOn(sam.db)).find(l => l.title === title);
      await tickShoppingItem(sam.db, h.clock, {
        ...writer(PARTNER),
        itemId: line?.id ?? '',
        checked: true,
      });
    }
    expect(tripFinished(await listOn(sam.db))).toBe(false);

    // Clear, on the basket's heading — one write, one Undo
    const cleared = await finishTrip(sam.db, h.clock, {
      ...writer(PARTNER),
      ...tripDays(TZ, h.clock.now()),
    });
    expect(cleared.committed).toBe(true);
    expect(SHOPPING.tripSaved(cleared.trip.lineIds.length, cleared.trip.left)).toBe(
      'Trip saved: 2 bought, 1 still on the list',
    );
    expect(await seen(sam.db)).toEqual({
      progress: '0 of 1 in the basket',
      toBuy: ['Birthday card'],
      basket: [],
    });

    // the next list: something still to buy is a trip still going, so nothing is finished
    h.clock.advance(DAY);
    const tap = await plus(h, dana, wipes);
    expect(tap.finished).toBeNull();
    await sam.sync();
    await dana.sync();
    await sam.sync();
    for (const phone of [dana, sam]) {
      expect(await seen(phone.db)).toEqual({
        progress: '0 of 2 in the basket',
        toBuy: ['Birthday card', 'WaterWipes'],
        basket: [],
      });
    }
  });
});

describe('two phones, one of them with no signal', () => {
  it('a new list started on one phone never takes a line the other phone added unseen', async () => {
    const { h, dana, sam } = await household('shopping-offline-add');
    const diapers = await supply(h, dana.db, 'DIAPERS', 'Pampers');
    const wipes = await supply(h, dana.db, 'WIPES', 'WaterWipes');
    await plus(h, dana, diapers);
    await oneOff(h, dana, 'Bananas');
    await dana.sync();
    await sam.sync();

    // Dana ticks the whole list at the shop; Sam's phone, with no signal, never hears of it
    h.clock.advance(HOUR);
    await tickAll(h, dana);
    await dana.sync();
    // …and on his phone the list is still to buy, so his one-off goes on it and finishes nothing
    const gel = await oneOff(h, sam, 'Teething gel');
    expect(gel.finished).toBeNull();

    // Dana starts the next list: her trip is over on her phone, and she finishes exactly it
    h.clock.advance(HOUR);
    const tap = await plus(h, dana, wipes);
    expect(tap.finished?.lineIds).toHaveLength(2);
    await dana.sync();

    // Sam's signal comes back: his line is on the new list, and last trip is on nobody's
    await sam.sync();
    await dana.sync();
    for (const phone of [dana, sam]) {
      expect(await seen(phone.db)).toEqual({
        progress: '0 of 2 in the basket',
        toBuy: ['Teething gel', 'WaterWipes'],
        basket: [],
      });
    }
    expect(served(h).filter(r => r.live)).toEqual([
      { title: 'Teething gel', live: true, ticked: false },
      { title: 'WaterWipes', live: true, ticked: false },
    ]);
  });

  it('both phones starting the next list offline finish the same trip once, and keep both new lines', async () => {
    const { h, dana, sam } = await household('shopping-offline-both');
    const diapers = await supply(h, dana.db, 'DIAPERS', 'Pampers');
    const wipes = await supply(h, dana.db, 'WIPES', 'WaterWipes');
    const formula = await supply(h, dana.db, 'FORMULA', 'Enfamil');
    await plus(h, dana, diapers);
    await oneOff(h, dana, 'Bananas');
    await tickAll(h, dana);
    await dana.sync();
    await sam.sync();
    const shopDay = localDayKey(TZ, h.clock.now());

    // both phones lose the signal, and both start the next list the following day
    h.clock.advance(DAY);
    h.net.connected = false;
    expect((await plus(h, dana, wipes)).finished?.lineIds).toHaveLength(2);
    expect((await plus(h, sam, formula)).finished?.lineIds).toHaveLength(2);
    // offline, each phone already shows its own new list
    expect((await seen(dana.db)).toBuy).toEqual(['WaterWipes']);
    expect((await seen(sam.db)).toBuy).toEqual(['Enfamil']);

    // the signal comes back, in either order
    h.clock.advance(HOUR);
    h.net.connected = true;
    await sam.sync();
    await dana.sync();
    await sam.sync();
    for (const phone of [dana, sam]) {
      expect(await seen(phone.db)).toEqual({
        progress: '0 of 2 in the basket',
        toBuy: ['Enfamil', 'WaterWipes'],
        basket: [],
      });
      expect((await boughtDates(phone.db))['Pampers']).toBe(shopDay);
    }
    expect(served(h).filter(r => !r.live)).toEqual([
      { title: 'Bananas', live: false, ticked: true },
      { title: 'Pampers', live: false, ticked: true },
    ]);
  });
});
