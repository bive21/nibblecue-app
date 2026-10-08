/**
 * Storage locations (docs/SCHEDULE_AND_LOCATIONS.md §3; docs/MILK_STASH.md §4): the rules a
 * parent meets on the sheet, each with its exact sentence, and the one write that changes a
 * condition — dates never stored, `first_frozen_at` set only where it was null, one zero
 * ADJUST per container as the audit.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { locations, locationById, ledgerBalanceMl } from '../db/queries/stash';
import { HOUSEHOLD, LOCATION, USER, seedContainer, seedHousehold } from '../testing/fixtures';
import {
  LastLocationError,
  LocationHeldError,
  LocationNameError,
  ThawedExistsError,
  ThawedHeldError,
  deleteLocation,
  ensureLocationOfKind,
  restoreLocation,
  saveLocation,
  shortNameOf,
} from './locations';

const ctx = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, source: 'sheet' as const };
const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

const outboxOps = (db: Db) =>
  db.all<{ entity: string; op: string; payload: string }>(
    'select entity, op, payload from outbox order by seq',
  );

describe('saveLocation — create (§3.1)', () => {
  it('appends with the first word as the short name; the first plain location is the default', async () => {
    const { db, clock } = await fixture();
    // the seed's fridge is already the default, so a new one is not
    const r = await saveLocation(db, clock, {
      ...ctx,
      name: 'Garage chest freezer',
      kind: 'DEEP_FREEZER',
    });
    expect(r.committed).toBe(true);
    const row = await locationById(db, r.locationId);
    expect(row).toMatchObject({
      name: 'Garage chest freezer',
      short_name: 'Garage',
      kind: 'DEEP_FREEZER',
      sort_order: 1,
      is_default: false,
      deleted_at: null,
    });
    const ops = await outboxOps(db);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entity: 'location', op: 'CREATE' });
  });

  it('the name is 2–40 characters and unique per household, case-insensitive', async () => {
    const { db, clock } = await fixture();
    await expect(saveLocation(db, clock, { ...ctx, name: ' ', kind: 'FRIDGE' })).rejects.toThrow(
      LocationNameError,
    );
    await expect(saveLocation(db, clock, { ...ctx, name: 'x', kind: 'FRIDGE' })).rejects.toThrow(
      'A name is 2 to 40 characters.',
    );
    await expect(
      saveLocation(db, clock, { ...ctx, name: '  FRIDGE ', kind: 'FREEZER' }),
    ).rejects.toThrow('A location with this name already exists.');
    expect(shortNameOf('Garage chest freezer')).toBe('Garage');
    expect(shortNameOf('Grandmothersgiantchest freezer')).toBe('Grandmothers');
    expect(shortNameOf('Grandmothersgiantchest freezer').length).toBeLessThanOrEqual(12);
  });

  it('exactly one thawing location per household', async () => {
    const { db, clock } = await fixture();
    const first = await saveLocation(db, clock, { ...ctx, name: 'Thawing', kind: 'THAWED' });
    expect(first.committed).toBe(true);
    await expect(
      saveLocation(db, clock, { ...ctx, name: 'Another thaw shelf', kind: 'THAWED' }),
    ).rejects.toThrow(ThawedExistsError);
    // and a thawing location is never the default the pickers pre-select
    expect((await locationById(db, first.locationId))?.is_default).toBe(false);
  });

  it('making a new location the default takes it from the old one in the same write', async () => {
    const { db, clock } = await fixture();
    const r = await saveLocation(db, clock, {
      ...ctx,
      name: 'Big freezer',
      kind: 'FREEZER',
      isDefault: true,
    });
    expect((await locationById(db, r.locationId))?.is_default).toBe(true);
    expect((await locationById(db, LOCATION))?.is_default).toBe(false);
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual(['location:CREATE', 'location:UPDATE']);
  });
});

describe('saveLocation — edit (§3.3, §3.4)', () => {
  it('a rename is cosmetic: no ledger row, no container touched', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: 'ffffffff-0000-4000-8000-00000000000a', amountMl: 118 });
    const r = await saveLocation(db, clock, {
      ...ctx,
      locationId: LOCATION,
      name: 'Kitchen fridge',
      kind: 'FRIDGE',
    });
    expect(r).toMatchObject({ committed: true, kindChanged: false, recalculated: 0 });
    expect((await locationById(db, LOCATION))?.name).toBe('Kitchen fridge');
    expect(
      await db.all("select id from milk_inventory_transactions where kind = 'ADJUST'"),
    ).toEqual([]);
  });

  it('FRIDGE → FREEZER gives never-frozen containers today as their freeze date, keeps an existing one, and audits each', async () => {
    const { db, clock } = await fixture();
    const T0 = '2026-09-01T00:00:00.000Z';
    await seedContainer(db, { id: 'ffffffff-0000-4000-8000-00000000000a', amountMl: 118 });
    await seedContainer(db, { id: 'ffffffff-0000-4000-8000-00000000000b', amountMl: 59 });
    await db.run('update milk_containers set first_frozen_at = ? where id = ?', [
      T0,
      'ffffffff-0000-4000-8000-00000000000b',
    ]);
    const r = await saveLocation(db, clock, {
      ...ctx,
      locationId: LOCATION,
      name: 'Fridge',
      kind: 'FREEZER',
    });
    expect(r).toMatchObject({ committed: true, kindChanged: true, recalculated: 2, frozeNow: 1 });
    const rows = await db.all<{ id: string; first_frozen_at: string | null; amount_ml: number }>(
      'select id, first_frozen_at, amount_ml from milk_containers order by id',
    );
    expect(rows).toEqual([
      { id: 'ffffffff-0000-4000-8000-00000000000a', first_frozen_at: clock.iso(), amount_ml: 118 },
      { id: 'ffffffff-0000-4000-8000-00000000000b', first_frozen_at: T0, amount_ml: 59 },
    ]);
    const audits = await db.all<{
      container_id: string;
      delta_ml: number;
      from_location_id: string;
      to_location_id: string;
    }>(
      "select container_id, delta_ml, from_location_id, to_location_id from milk_inventory_transactions where kind = 'ADJUST' order by container_id",
    );
    expect(audits).toEqual([
      {
        container_id: 'ffffffff-0000-4000-8000-00000000000a',
        delta_ml: 0,
        from_location_id: LOCATION,
        to_location_id: LOCATION,
      },
      {
        container_id: 'ffffffff-0000-4000-8000-00000000000b',
        delta_ml: 0,
        from_location_id: LOCATION,
        to_location_id: LOCATION,
      },
    ]);
    // the balances did not move
    expect(await db.tx(t => ledgerBalanceMl(t, 'ffffffff-0000-4000-8000-00000000000a'))).toBe(118);
    // the wire: the location, one container patch for the newly frozen one, two audit rows
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual([
      'location:UPDATE',
      'container:UPDATE',
      'milk_txn:CREATE',
      'milk_txn:CREATE',
    ]);
    expect(JSON.parse(ops[1]!.payload)).toMatchObject({ first_frozen_at: clock.iso() });
  });

  it('FREEZER → DEEP_FREEZER moves no date and still audits', async () => {
    const { db, clock } = await fixture();
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Freezer', kind: 'FREEZER' });
    await seedContainer(db, { id: 'ffffffff-0000-4000-8000-00000000000a', amountMl: 118 });
    await db.run('update milk_containers set location_id = ?, first_frozen_at = ? where id = ?', [
      frz.locationId,
      '2026-09-01T00:00:00.000Z',
      'ffffffff-0000-4000-8000-00000000000a',
    ]);
    const r = await saveLocation(db, clock, {
      ...ctx,
      locationId: frz.locationId,
      name: 'Freezer',
      kind: 'DEEP_FREEZER',
    });
    expect(r).toMatchObject({ kindChanged: true, recalculated: 1, frozeNow: 0 });
    expect(
      (
        await db.get<{ first_frozen_at: string }>(
          'select first_frozen_at from milk_containers where id = ?',
          ['ffffffff-0000-4000-8000-00000000000a'],
        )
      )?.first_frozen_at,
    ).toBe('2026-09-01T00:00:00.000Z');
    expect(
      await db.all("select id from milk_inventory_transactions where kind = 'ADJUST'"),
    ).toHaveLength(1);
  });

  it('a thawing location with milk in it keeps its condition; a plain one cannot become a second thawing one', async () => {
    const { db, clock } = await fixture();
    const thaw = await saveLocation(db, clock, { ...ctx, name: 'Thawing', kind: 'THAWED' });
    await seedContainer(db, {
      id: 'ffffffff-0000-4000-8000-00000000000a',
      amountMl: 118,
      status: 'THAWING',
    });
    await db.run('update milk_containers set location_id = ? where id = ?', [
      thaw.locationId,
      'ffffffff-0000-4000-8000-00000000000a',
    ]);
    await expect(
      saveLocation(db, clock, {
        ...ctx,
        locationId: thaw.locationId,
        name: 'Thawing',
        kind: 'FRIDGE',
      }),
    ).rejects.toThrow(ThawedHeldError);
    await expect(
      saveLocation(db, clock, { ...ctx, locationId: LOCATION, name: 'Fridge', kind: 'THAWED' }),
    ).rejects.toThrow('You already have a thawing location.');
  });
});

describe('deleteLocation and its Undo (§3.5)', () => {
  it('is refused while the location holds milk, with the exact sentence for one and for many', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: 'ffffffff-0000-4000-8000-00000000000a', amountMl: 118 });
    await saveLocation(db, clock, { ...ctx, name: 'Freezer', kind: 'FREEZER' });
    await expect(deleteLocation(db, clock, { ...ctx, locationId: LOCATION })).rejects.toThrow(
      'This location still holds 1 container. Move it somewhere else first.',
    );
    await seedContainer(db, { id: 'ffffffff-0000-4000-8000-00000000000b', amountMl: 59 });
    const err = await deleteLocation(db, clock, { ...ctx, locationId: LOCATION }).catch(
      e => e as unknown,
    );
    expect(err).toBeInstanceOf(LocationHeldError);
    expect((err as Error).message).toBe(
      'This location still holds 2 containers. Move them somewhere else first.',
    );
    // a used container does not block it
    await db.run("update milk_containers set status = 'USED', amount_ml = 0");
    expect((await deleteLocation(db, clock, { ...ctx, locationId: LOCATION })).committed).toBe(
      true,
    );
  });

  it('the last plain location stays; a thawing one is not a plain location', async () => {
    const { db, clock } = await fixture();
    await saveLocation(db, clock, { ...ctx, name: 'Thawing', kind: 'THAWED' });
    await expect(deleteLocation(db, clock, { ...ctx, locationId: LOCATION })).rejects.toThrow(
      LastLocationError,
    );
  });

  it('retires softly, moves the default to the next plain location, and Undo puts both back', async () => {
    const { db, clock } = await fixture();
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Freezer', kind: 'FREEZER' });
    const gone = await deleteLocation(db, clock, { ...ctx, locationId: LOCATION });
    expect(gone).toMatchObject({ committed: true, defaultMovedTo: frz.locationId });
    expect(await locationById(db, LOCATION)).toMatchObject({
      deleted_at: clock.iso(),
      is_default: false,
    });
    expect((await locationById(db, frz.locationId))?.is_default).toBe(true);
    expect((await locations(db, HOUSEHOLD)).map(l => l.id)).toEqual([frz.locationId]);
    // the row is retired, not gone: a MOVE row can still name it
    expect(await db.get('select id from storage_locations where id = ?', [LOCATION])).toBeDefined();

    const back = await restoreLocation(db, clock, {
      ...ctx,
      locationId: LOCATION,
      defaultMovedTo: gone.defaultMovedTo,
    });
    expect(back.committed).toBe(true);
    expect(await locationById(db, LOCATION)).toMatchObject({ deleted_at: null, is_default: true });
    expect((await locationById(db, frz.locationId))?.is_default).toBe(false);
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual([
      'location:CREATE',
      'location:UPDATE',
      'location:UPDATE',
      'location:UPDATE',
      'location:UPDATE',
    ]);
    expect(ops.every(o => o.entity === 'location')).toBe(true);
  });
});

describe('ensureLocationOfKind (§6a: the counter exists when a session is poured)', () => {
  it('returns the live one, creates one for a parent, and none for a caregiver', async () => {
    const { db, clock } = await fixture();
    expect(await ensureLocationOfKind(db, clock, { ...ctx, kind: 'ROOM', canAdmin: false })).toBe(
      null,
    );
    const id = await ensureLocationOfKind(db, clock, { ...ctx, kind: 'ROOM', canAdmin: true });
    expect(id).not.toBe(null);
    expect(await locationById(db, id!)).toMatchObject({
      name: 'Counter',
      kind: 'ROOM',
      is_default: false,
    });
    expect(await ensureLocationOfKind(db, clock, { ...ctx, kind: 'ROOM', canAdmin: false })).toBe(
      id,
    );
    expect(await ensureLocationOfKind(db, clock, { ...ctx, kind: 'ROOM', canAdmin: true })).toBe(
      id,
    );
    expect((await locations(db, HOUSEHOLD)).filter(l => l.kind === 'ROOM')).toHaveLength(1);
  });
});
