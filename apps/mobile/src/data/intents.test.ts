/**
 * `@AT-16` — the app half of a widget tap (`docs/OFFLINE_SYNC.md` §7; WP4 D3, D24).
 *
 * The plan's row: one `WidgetIntent` drains to 1 outbox row, 1 `activities` `type='diaper'`,
 * 1 `diaper_details` `kind='WET'`, `start_at` = the tap time, and a re-drain writes nothing.
 * The native stores are WP9; what is proved here is everything that does not need a device,
 * which is the whole drain.
 */
import { WIDGET_DEDUPE_WINDOW_MS, dedupeKey } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import {
  CHILD_A,
  CHILD_B,
  HOUSEHOLD,
  USER,
  liveActivities,
  seedHousehold,
} from '../testing/fixtures';
import { LocalWidgetIntentSource, drainWidgetIntents, type WidgetIntent } from './intents';

const TAP = '2026-09-14T03:12:00.000Z';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

let n = 0;
function wetDiaperIntent(childId: string, at = TAP): WidgetIntent {
  n += 1;
  return {
    client_op_id: `11111111-0000-4000-8000-${String(n).padStart(12, '0')}`,
    entity_id: `22222222-0000-4000-8000-${String(n).padStart(12, '0')}`,
    module: 'diaper',
    op: 'CREATE',
    payload: { created_by: USER, detail: { kind: 'WET' } },
    child_id: childId,
    household_id: HOUSEHOLD,
    at,
    dedupe_key: dedupeKey('diaper', childId, 'WET'),
    dedupe_window_ms: WIDGET_DEDUPE_WINDOW_MS,
    widget: 'quick_log',
  };
}

const ops = (db: Db) =>
  db.all<{ client_op_id: string; entity: string; op: string; entity_id: string }>(
    'select client_op_id, entity, op, entity_id from outbox order by seq',
    [],
  );

describe('@AT-16 the widget intent drain', () => {
  it('one intent becomes one outbox row, one activity and one detail row', async () => {
    const { db, clock } = await fixture();
    const source = new LocalWidgetIntentSource(db, clock);
    const intent = wetDiaperIntent(CHILD_A);
    await source.record(intent);

    // the app comes back four and a half hours later
    clock.advance(4.5 * 60 * 60 * 1000);
    expect(await drainWidgetIntents(db, source, clock)).toBe(1);

    expect(await ops(db)).toEqual([
      {
        client_op_id: intent.client_op_id,
        entity: 'activity',
        op: 'CREATE',
        entity_id: intent.entity_id,
      },
    ]);
    const activity = await db.get<{ id: string; type: string; start_at: string }>(
      'select id, type, start_at from activities',
      [],
    );
    // §7 rule 3: `start_at` is the tap time, not the drain time
    expect(activity).toEqual({ id: intent.entity_id, type: 'diaper', start_at: TAP });
    expect(
      await db.all('select kind from diaper_details where activity_id = ?', [intent.entity_id]),
    ).toEqual([{ kind: 'WET' }]);
  });

  it('a re-drain writes nothing: consumed_at and the primary key both say no', async () => {
    const { db, clock } = await fixture();
    const source = new LocalWidgetIntentSource(db, clock);
    await source.record(wetDiaperIntent(CHILD_A));
    expect(await drainWidgetIntents(db, source, clock)).toBe(1);

    expect(await source.pending()).toEqual([]);
    expect(await drainWidgetIntents(db, source, clock)).toBe(0);
    expect(await liveActivities(db)).toBe(1);
    expect((await ops(db)).length).toBe(1);
  });

  it('marks consumed in the same transaction as the write', async () => {
    const { db, clock } = await fixture();
    const source = new LocalWidgetIntentSource(db, clock);
    const intent = wetDiaperIntent(CHILD_A);
    await source.record(intent);
    await drainWidgetIntents(db, source, clock);

    const row = await db.get<{ consumed_at: string | null }>(
      'select consumed_at from widget_intents where client_op_id = ?',
      [intent.client_op_id],
    );
    expect(row?.consumed_at).toBe(clock.iso());
  });

  it('applies the window the extension recorded, per child', async () => {
    const { db, clock } = await fixture();
    const source = new LocalWidgetIntentSource(db, clock);
    // two taps on Emma's tile 220 ms apart that the extension did NOT collapse, plus Liam's
    const emma1 = wetDiaperIntent(CHILD_A, TAP);
    const emma2 = wetDiaperIntent(CHILD_A, '2026-09-14T03:12:00.220Z');
    const liam = wetDiaperIntent(CHILD_B, '2026-09-14T03:12:03.000Z');
    for (const intent of [emma1, emma2, liam]) await source.record(intent);

    expect(await drainWidgetIntents(db, source, clock)).toBe(2);
    const children = await db.all<{ child_id: string }>(
      'select child_id from activities order by child_id',
      [],
    );
    expect(children.map(c => c.child_id)).toEqual([CHILD_A, CHILD_B]);
    // every intent is dealt with, suppressed or not
    expect(await source.pending()).toEqual([]);
  });

  it('refuses an intent with no author rather than inventing one', async () => {
    const { db, clock } = await fixture();
    const source = new LocalWidgetIntentSource(db, clock);
    const intent = wetDiaperIntent(CHILD_A);
    await source.record({ ...intent, payload: { detail: { kind: 'WET' } } });
    await expect(drainWidgetIntents(db, source, clock)).rejects.toThrow("must carry 'created_by'");
    expect(await liveActivities(db)).toBe(0);
  });
});
