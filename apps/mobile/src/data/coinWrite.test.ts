/**
 * DOES A CUECOIN LOG LIKE THE APP DOES? (the owner, 2026-09-22: *"Make sure it logs activities
 * like it would normally be if it was done from the app"*; docs/NFC_TAGS.md §3.5.)
 *
 * The spec's own instruction was "Do not create parallel data paths for NFC logs. An NFC log is
 * an ordinary log with source = nfc", and the only honest way to show that is to write the SAME
 * entry twice — once as a tile would, once as a coin would — and diff the two rows. Anything
 * that differs beyond `source` is a parallel path, whatever the code looks like.
 *
 * THIS TEST IS WHAT FOUND THAT `source` WENT NOWHERE. Every surface had passed it to
 * `commitWrite` since WP4 and the outbox has no column for it, so `sheet`, `widget`, `timer` and
 * the rest were discarded alike, and adding `nfc` to the union had changed nothing observable.
 * It rides the entry's `metadata` now, where the timer stop already put its own.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { logActivity, type ActivityFields } from './activities';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

/** One diaper change, exactly as a sheet hands it over. */
const FIELDS: ActivityFields = {
  type: 'diaper',
  startAt: '2026-09-22T09:15:00.000Z',
  detail: { kind: 'WET', color: null, consistency: null, rash: false },
};

type Row = Record<string, unknown>;

/** Every column of the entry the write produced, and every op it queued. */
async function writeOnce(source: 'sheet' | 'nfc') {
  const f = await seedHousehold({ idPrefix: source });
  restores.push(f.restoreIds);
  const out = await logActivity(f.db, f.clock, {
    householdId: HOUSEHOLD,
    createdBy: USER,
    deviceId: null,
    source,
    childId: CHILD_A,
    ...FIELDS,
  });
  const row = await f.db.get<Row>('select * from activities where id = ?', [
    out.entityIds[0] ?? '',
  ]);
  const detail = await f.db.get<Row>('select * from diaper_details where activity_id = ?', [
    out.entityIds[0] ?? '',
  ]);
  const ops = await f.db.all<{ entity: string; op: string; payload: string }>(
    'select entity, op, payload from outbox order by seq',
    [],
  );
  return { row, detail, ops, committed: out.committed };
}

/** The ids and timestamps differ per run; the shape is what is being compared. */
const shapeless = (r: Row | undefined): Row => {
  const { id, activity_id, client_op_id, child_id, created_at, updated_at, metadata, ...rest } =
    r ?? {};
  void id;
  void activity_id;
  void client_op_id;
  void child_id;
  void created_at;
  void updated_at;
  void metadata;
  return rest;
};

describe('a coin-opened save logs the way the app does', () => {
  it('writes the same entry, in the same columns, with the same detail row', async () => {
    const app = await writeOnce('sheet');
    const coin = await writeOnce('nfc');

    expect(app.committed).toBe(true);
    expect(coin.committed).toBe(true);
    // the entry itself: same type, same times, same everything but the ids and the stamp
    expect(shapeless(coin.row)).toEqual(shapeless(app.row));
    // …and the module's own detail row, which is where a diaper's wet/dirty actually lives
    expect(shapeless(coin.detail)).toEqual(shapeless(app.detail));
  });

  it('queues the same operations, in the same order, for the same tables', async () => {
    const app = await writeOnce('sheet');
    const coin = await writeOnce('nfc');
    expect(coin.ops.map(o => `${o.entity}.${o.op}`)).toEqual(
      app.ops.map(o => `${o.entity}.${o.op}`),
    );
    expect(coin.ops).toHaveLength(app.ops.length);
  });

  /**
   * THE ONE DIFFERENCE, and it is the one the spec asked for. It is on `metadata`, which both
   * halves of the database already have, so it reaches the server with the entry, appears in
   * the export, and needed no migration.
   */
  it('differs in exactly one place: the entry says where it came from', async () => {
    const app = await writeOnce('sheet');
    const coin = await writeOnce('nfc');
    expect(JSON.parse(String(app.row?.metadata ?? '{}'))).toEqual({ source: 'sheet' });
    expect(JSON.parse(String(coin.row?.metadata ?? '{}'))).toEqual({ source: 'nfc' });
    // and it rides the op to the server rather than stopping on the phone
    const payload = JSON.parse(coin.ops.find(o => o.entity === 'activity')?.payload ?? '{}');
    expect(payload.metadata).toEqual({ source: 'nfc' });
  });

  it('is undoable and deduped like any other entry — the guard is the module, not the source', async () => {
    const f = await seedHousehold();
    restores.push(f.restoreIds);
    const write = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, childId: CHILD_A };
    const first = await logActivity(f.db, f.clock, { ...write, source: 'nfc', ...FIELDS });
    // the same change, tapped again within the window — from the APP this time
    const second = await logActivity(f.db, f.clock, { ...write, source: 'sheet', ...FIELDS });
    expect(first.committed).toBe(true);
    expect(
      second.committed,
      'a second tap inside the window is suppressed, whatever opened it',
    ).toBe(false);
  });
});
