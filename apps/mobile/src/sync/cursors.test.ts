/**
 * The cursor: household-scoped, exact when stored, rewound when read (D15, D16).
 *
 * The two assertions that matter most are the pair in the middle. What goes INTO `sync_state` is
 * the precise `(updated_at, id)` of the last row the device saw; what goes out onto the wire is
 * that instant minus `PULL_LAG_MS` with no id at all. Keeping the id across a rewind would
 * exclude every row at the rewound instant with a smaller id, which is exactly the set the
 * rewind exists to re-read.
 */
import { PULL_LAG_MS } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { seedHousehold, HOUSEHOLD } from '../testing/fixtures';
import {
  clearCursors,
  cursorPhases,
  isDrained,
  phaseMark,
  readCursor,
  readCursors,
  rewound,
  sinceFor,
  writeCursor,
} from './cursors';

const OTHER_HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-000000000002';
const AT = '2026-09-14T08:00:00.000Z';
const ROW = 'ffffffff-0000-4000-8000-000000000001';

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
});

async function open(): Promise<Db> {
  const fixture = await seedHousehold();
  restore = fixture.restoreIds;
  return fixture.db;
}

describe('sync_state cursors', () => {
  it('keeps one cursor per household per table', async () => {
    const db = await open();
    await db.tx(t =>
      writeCursor(t, HOUSEHOLD, 'activities', { cursor: { updated_at: AT, id: ROW } }),
    );
    await db.tx(t =>
      writeCursor(t, OTHER_HOUSEHOLD, 'activities', {
        cursor: { updated_at: '2026-01-01T00:00:00.000Z', id: ROW },
      }),
    );

    expect((await readCursor(db, HOUSEHOLD, 'activities')).cursor).toEqual({
      updated_at: AT,
      id: ROW,
    });
    expect((await readCursor(db, OTHER_HOUSEHOLD, 'activities')).cursor?.updated_at).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    // A table this household has never pulled has no cursor, not somebody else's.
    expect(await readCursor(db, HOUSEHOLD, 'milk_containers')).toEqual({
      cursor: null,
      lastFullSyncAt: null,
      phase: null,
    });
  });

  it('reads every table in one go exactly as one at a time', async () => {
    const db = await open();
    await db.tx(t =>
      writeCursor(t, HOUSEHOLD, 'activities', {
        cursor: { updated_at: AT, id: ROW },
        phase: 'recent_complete',
      }),
    );
    await db.tx(t =>
      writeCursor(t, OTHER_HOUSEHOLD, 'children', { cursor: { updated_at: AT, id: ROW } }),
    );
    const names = ['activities', 'children', 'milk_containers'];
    const all = await readCursors(db, HOUSEHOLD, names);
    expect([...all.keys()]).toEqual(names);
    for (const name of names) expect(all.get(name)).toEqual(await readCursor(db, HOUSEHOLD, name));
    expect((await readCursors(db, HOUSEHOLD, [])).size).toBe(0);
  });

  it('round-trips cursor_id, the phase mark and the completed-pull stamp', async () => {
    const db = await open();
    await db.tx(t =>
      writeCursor(t, HOUSEHOLD, 'activities', {
        cursor: { updated_at: AT, id: ROW },
        phase: phaseMark('recent', false),
        lastFullSyncAt: AT,
      }),
    );
    const state = await readCursor(db, HOUSEHOLD, 'activities');
    expect(state.cursor).toEqual({ updated_at: AT, id: ROW });
    expect(state.phase).toBe('recent');
    expect(state.lastFullSyncAt).toBe(AT);

    // A later write that names only the phase leaves the cursor alone.
    await db.tx(t => writeCursor(t, HOUSEHOLD, 'activities', { phase: phaseMark('recent', true) }));
    const after = await readCursor(db, HOUSEHOLD, 'activities');
    expect(after.cursor).toEqual({ updated_at: AT, id: ROW });
    expect(after.phase).toBe('recent_complete');
  });

  it('stores the exact last row seen and asks from PULL_LAG_MS before it', async () => {
    const db = await open();
    await db.tx(t =>
      writeCursor(t, HOUSEHOLD, 'activities', { cursor: { updated_at: AT, id: ROW } }),
    );
    const state = await readCursor(db, HOUSEHOLD, 'activities');

    // stored: exact
    expect(state.cursor).toEqual({ updated_at: AT, id: ROW });
    // read: rewound, and WITHOUT the id, because the id tiebreak only applies at the instant
    // the cursor actually stopped at.
    expect(sinceFor(state)).toEqual({
      since: new Date(Date.parse(AT) - PULL_LAG_MS).toISOString(),
      since_id: null,
    });
  });

  it('asks from the beginning of time for a cursor that has never moved, or cannot be parsed', () => {
    expect(rewound(null)).toEqual({ since: null, since_id: null });
    expect(rewound({ updated_at: 'not a date', id: ROW })).toEqual({
      since: null,
      since_id: null,
    });
    // A cursor near the epoch never asks for a negative instant.
    expect(rewound({ updated_at: '1970-01-01T00:00:01.000Z', id: ROW }).since).toBe(
      '1970-01-01T00:00:00.000Z',
    );
  });

  it('marks a drained table, and only a drained table', () => {
    expect(phaseMark('backfill', true)).toBe('backfill_complete');
    expect(phaseMark('backfill', false)).toBe('backfill');
    expect(isDrained('backfill_complete')).toBe(true);
    expect(isDrained('backfill')).toBe(false);
    expect(isDrained(null)).toBe(false);
  });

  it('lists a household phases and forgets them on demand', async () => {
    const db = await open();
    await db.tx(t => writeCursor(t, HOUSEHOLD, 'activities', { phase: 'recent_complete' }));
    await db.tx(t => writeCursor(t, HOUSEHOLD, 'favorites', { phase: 'backfill' }));
    await db.tx(t => writeCursor(t, OTHER_HOUSEHOLD, 'activities', { phase: 'recent' }));

    expect(await cursorPhases(db, HOUSEHOLD)).toEqual({
      activities: 'recent_complete',
      favorites: 'backfill',
    });

    await db.tx(t => clearCursors(t, HOUSEHOLD));
    expect(await cursorPhases(db, HOUSEHOLD)).toEqual({});
    // Another household's progress is not this household's to forget.
    expect(await cursorPhases(db, OTHER_HOUSEHOLD)).toEqual({ activities: 'recent' });
  });
});
