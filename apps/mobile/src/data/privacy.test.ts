/**
 * MOM PRIVACY (docs/SECURITY.md §4; WP11) against real local SQLite.
 *
 * The assertions that matter are the ones a mistake would be invisible in: a NEW pump session
 * written shared after she asked for privacy, an existing session left visible when the switch
 * moved, and — the one that would be a defect rather than a miss — another member's session
 * moved by her switch.
 */
import { describe, expect, it } from 'vitest';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import type { Db } from '../db/driver';
import { logActivity } from './activities';
import { isShared, privateByDefault, setSharing, sharingState, PRIVATE_TYPES } from './privacy';
import { systemClock } from './repository';

const OTHER = 'bbbbbbbb-0000-4000-8000-0000000000ff';
const ctx = {
  householdId: HOUSEHOLD,
  createdBy: USER,
  deviceId: 'dev-1',
  source: 'sheet' as const,
};

async function fixture(): Promise<{ db: Db; restore: () => void }> {
  const f = await seedHousehold();
  return { db: f.db, restore: f.restoreIds };
}

const pumpFields = {
  type: 'pump' as const,
  startAt: '2026-09-14T09:00:00.000Z',
  endAt: '2026-09-14T09:18:00.000Z',
  quantity: 120,
  canonicalUnit: 'ml' as const,
  detail: { sides: 'BOTH', left_ml: 60, right_ml: 60, total_ml: 120 },
};

const privacyOf = (db: Db, id: string) =>
  db.get<{ is_private: number }>('select is_private from activities where id = ?', [id]);

describe('the switch', () => {
  it('is on for a household that has never touched it', async () => {
    const { db, restore } = await fixture();
    try {
      expect(await isShared(db, HOUSEHOLD, USER, 'pump')).toBe(true);
      expect(await privateByDefault(db, HOUSEHOLD, USER, 'pump')).toBe(false);
      expect(await sharingState(db, HOUSEHOLD, USER)).toMatchObject({ pump: true });
    } finally {
      restore();
    }
  });

  it('is on, and never asks the database, for a module that cannot be private', async () => {
    const { db, restore } = await fixture();
    try {
      // a bottle is the household's business by definition — there is nothing to switch
      expect(await isShared(db, HOUSEHOLD, USER, 'bottle')).toBe(true);
      expect(await privateByDefault(db, HOUSEHOLD, USER, 'diaper')).toBe(false);
      expect(PRIVATE_TYPES).toEqual(['pump']);
    } finally {
      restore();
    }
  });

  it('remembers being turned off, per caregiver', async () => {
    const { db, restore } = await fixture();
    try {
      await setSharing(db, systemClock, { ...ctx, moduleId: 'pump', shared: false });
      expect(await isShared(db, HOUSEHOLD, USER, 'pump')).toBe(false);
      expect(await privateByDefault(db, HOUSEHOLD, USER, 'pump')).toBe(true);
      // the other parent is unaffected: no row of his own, so he is still sharing
      expect(await isShared(db, HOUSEHOLD, OTHER, 'pump')).toBe(true);
    } finally {
      restore();
    }
  });
});

describe('new entries', () => {
  it('are private once the switch is off, with nothing said at the call site', async () => {
    const { db, restore } = await fixture();
    try {
      await setSharing(db, systemClock, { ...ctx, moduleId: 'pump', shared: false });
      const out = await logActivity(db, systemClock, { ...ctx, ...pumpFields, childId: null });
      const id = out.entityIds[0] ?? '';
      expect(await privacyOf(db, id)).toEqual({ is_private: 1 });
    } finally {
      restore();
    }
  });

  it('are shared while the switch is on', async () => {
    const { db, restore } = await fixture();
    try {
      const out = await logActivity(db, systemClock, { ...ctx, ...pumpFields, childId: null });
      expect(await privacyOf(db, out.entityIds[0] ?? '')).toEqual({ is_private: 0 });
    } finally {
      restore();
    }
  });

  it('honor an explicit choice over the setting', async () => {
    const { db, restore } = await fixture();
    try {
      await setSharing(db, systemClock, { ...ctx, moduleId: 'pump', shared: false });
      const out = await logActivity(db, systemClock, {
        ...ctx,
        ...pumpFields,
        childId: null,
        isPrivate: false,
      });
      expect(await privacyOf(db, out.entityIds[0] ?? '')).toEqual({ is_private: 0 });
    } finally {
      restore();
    }
  });

  it('are untouched for a module the switch does not cover', async () => {
    const { db, restore } = await fixture();
    try {
      await setSharing(db, systemClock, { ...ctx, moduleId: 'pump', shared: false });
      const out = await logActivity(db, systemClock, {
        ...ctx,
        type: 'diaper',
        startAt: '2026-09-14T09:00:00.000Z',
        detail: { kind: 'WET' },
        childId: CHILD_A,
      });
      expect(await privacyOf(db, out.entityIds[0] ?? '')).toEqual({ is_private: 0 });
    } finally {
      restore();
    }
  });
});

describe('the entries already logged', () => {
  it('go private with the switch, and come back when it moves back', async () => {
    const { db, restore } = await fixture();
    try {
      const a = await logActivity(db, systemClock, { ...ctx, ...pumpFields, childId: null });
      const b = await logActivity(db, systemClock, {
        ...ctx,
        ...pumpFields,
        startAt: '2026-09-14T13:00:00.000Z',
        // a different amount, so the second write is not suppressed as a double tap: the
        // dedupe key is (type, child, salient) and two 120 ml pumps in a row are one tap twice
        quantity: 140,
        detail: { sides: 'BOTH', left_ml: 70, right_ml: 70, total_ml: 140 },
        childId: null,
      });
      const ids = [a.entityIds[0] ?? '', b.entityIds[0] ?? ''];

      const off = await setSharing(db, systemClock, { ...ctx, moduleId: 'pump', shared: false });
      expect(off.moved).toBe(2);
      for (const id of ids) expect(await privacyOf(db, id)).toEqual({ is_private: 1 });

      const on = await setSharing(db, systemClock, { ...ctx, moduleId: 'pump', shared: true });
      expect(on.moved).toBe(2);
      for (const id of ids) expect(await privacyOf(db, id)).toEqual({ is_private: 0 });
    } finally {
      restore();
    }
  });

  it('never include another member’s session', async () => {
    const { db, restore } = await fixture();
    try {
      const mine = await logActivity(db, systemClock, { ...ctx, ...pumpFields, childId: null });
      const theirs = await logActivity(db, systemClock, {
        ...ctx,
        createdBy: OTHER,
        ...pumpFields,
        startAt: '2026-09-14T15:00:00.000Z',
        quantity: 90,
        detail: { sides: 'BOTH', left_ml: 45, right_ml: 45, total_ml: 90 },
        childId: null,
      });
      const outcome = await setSharing(db, systemClock, {
        ...ctx,
        moduleId: 'pump',
        shared: false,
      });
      expect(outcome.moved).toBe(1);
      expect(await privacyOf(db, mine.entityIds[0] ?? '')).toEqual({ is_private: 1 });
      expect(await privacyOf(db, theirs.entityIds[0] ?? '')).toEqual({ is_private: 0 });
    } finally {
      restore();
    }
  });

  it('queues one op per moved entry plus the setting, all under one intent', async () => {
    const { db, restore } = await fixture();
    try {
      await logActivity(db, systemClock, { ...ctx, ...pumpFields, childId: null });
      const before = await db.all<{ n: number }>('select count(*) as n from outbox');
      const outcome = await setSharing(db, systemClock, {
        ...ctx,
        moduleId: 'pump',
        shared: false,
      });
      const after = await db.all<{ n: number }>('select count(*) as n from outbox');
      // the settings upsert + one activity UPDATE
      expect((after[0]?.n ?? 0) - (before[0]?.n ?? 0)).toBe(2);
      const ops = await db.all<{ entity: string }>(
        'select entity from outbox order by seq desc limit 2',
      );
      expect(ops.map(o => o.entity).sort()).toEqual(['activity', 'settings']);
      expect(outcome.committed).toBe(true);
    } finally {
      restore();
    }
  });

  it('leaves a deleted entry alone', async () => {
    const { db, restore } = await fixture();
    try {
      const out = await logActivity(db, systemClock, { ...ctx, ...pumpFields, childId: null });
      const id = out.entityIds[0] ?? '';
      await db.run('update activities set deleted_at = ? where id = ?', [
        '2026-09-14T10:00:00.000Z',
        id,
      ]);
      const outcome = await setSharing(db, systemClock, {
        ...ctx,
        moduleId: 'pump',
        shared: false,
      });
      expect(outcome.moved).toBe(0);
      expect(await privacyOf(db, id)).toEqual({ is_private: 0 });
    } finally {
      restore();
    }
  });
});
